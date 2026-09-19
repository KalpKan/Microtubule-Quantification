/**
 * The analysis worker. Everything heavy happens here so the page never freezes:
 * downloading and starting OpenCV.js (11 MB of JS + wasm), decoding the image,
 * running the pipeline, scaling the pictures for display and encoding the
 * downloadable PNGs. The page (main.ts) only paints two small bitmaps.
 *
 * Messages in:  { type: "analyze", id, bytes, name, maxDisplayPixels, bandRows? }
 *               { type: "analyze-decoded", id, rgba, width, height }   (fallback: page decoded)
 *               { type: "export", id, kind: "overlay" | "mask" }
 * Messages out: { type: "status", text } | { type: "ready" } | { type: "load-error", message }
 *               { type: "stage", id, text } | { type: "result", id, ... } | { type: "error", id, code, message }
 *               { type: "export-result", id, blob? , rgba?, width, height }
 *
 * Built as a classic (iife) worker by Vite so importScripts is available in
 * production; in `vite dev` it is a module worker and OpenCV is evaluated from
 * text instead. Both paths end with `self.cv`.
 */
import { analyze } from "./pipeline";
import type { OpenCV } from "./pipeline";
import { readDimensions, sniffFormat, stripColorMetadata, SUPPORTED_FORMATS, SUPPORTED_FORMATS_TEXT } from "./decode";
import { maskToRGBA, overlayFromMask } from "./export";
import type { ImageFormat } from "./decode";

export const MAX_MEGAPIXELS = 30;
/** Pixels read from the decoded bitmap per canvas pass; keeps every canvas well under iOS Safari's ~16.7 MP limit. */
const BAND_PIXELS = 4_000_000;
const OPENCV_BYTES_APPROX = 10_964_323; // content-length of /opencv.js, for the progress text only

type WorkerScope = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  importScripts?: (...urls: string[]) => void;
  cv?: OpenCV & { onRuntimeInitialized?: () => void; then?: unknown };
};
const scope = self as unknown as WorkerScope;

export interface ResultMessage {
  type: "result";
  id: number;
  percent: number;
  threshold: number;
  greenPixels: number;
  totalPixels: number;
  nucleusPixels: number;
  channelsIdentical: boolean;
  width: number;
  height: number;
  elapsedMs: number;
  /** Display-sized pictures (<= maxDisplayPixels each); absent on the decoded-by-page path. */
  input?: ImageBitmap;
  overlay?: ImageBitmap;
  /** Full-size overlay, returned only on the decoded-by-page path (the page paints it itself). */
  overlayRGBA?: Uint8ClampedArray<ArrayBuffer>;
}
export type ErrorCode = "unsupported-format" | "decode" | "too-large" | "no-offscreen" | "internal";

const post = (m: unknown, transfer?: Transferable[]) => scope.postMessage(m, transfer);
const status = (text: string) => post({ type: "status", text });
const hasOffscreen = typeof OffscreenCanvas === "function";

// ---------------------------------------------------------------- OpenCV
let cvReady: Promise<OpenCV> | undefined;

async function fetchOpenCVSource(): Promise<string> {
  const res = await fetch("/opencv.js");
  if (!res.ok || !res.body) throw new Error(`/opencv.js returned ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastShown = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const mb = Math.floor(received / 1_048_576);
    if (mb !== lastShown) {
      lastShown = mb;
      status(`Downloading OpenCV (about 11 MB, one time)... ${Math.min(99, Math.round((received / OPENCV_BYTES_APPROX) * 100))} %`);
    }
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(all);
}

function loadOpenCV(): Promise<OpenCV> {
  if (cvReady) return cvReady;
  cvReady = (async () => {
    status("Downloading OpenCV (about 11 MB, one time)...");
    const source = await fetchOpenCVSource();
    status("Starting OpenCV runtime...");
    let imported = false;
    if (typeof scope.importScripts === "function") {
      // Classic worker (the production build): importScripts keeps V8's code cache for the 11 MB file.
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try {
        scope.importScripts(url);
        imported = true;
      } catch (err) {
        // A module worker (vite dev) defines importScripts but throws "Module scripts don't support importScripts()".
        if (!(err instanceof TypeError)) throw err;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    // Module worker: indirect eval runs the UMD file in the global scope, which defines self.cv.
    if (!imported) (0, eval)(source);
    const cv = scope.cv;
    if (!cv) throw new Error("opencv.js loaded but did not define cv");
    await new Promise<void>((resolve) => {
      if (cv.Mat) return resolve();
      cv.onRuntimeInitialized = () => resolve();
    });
    // The Emscripten module is a thenable that resolves to itself; drop `then` so it can be awaited safely.
    delete cv.then;
    return cv;
  })();
  return cvReady;
}

// ---------------------------------------------------------------- decoding
class AnalysisError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function describeFormat(format: ImageFormat, name: string, bytes: number, mime: string): string {
  const what =
    format === "empty"
      ? "is empty (0 bytes)"
      : format === "tiff"
        ? "is a TIFF, which browsers cannot read"
        : format === "heic"
          ? "is a HEIC photo, which this browser cannot read"
          : format === "pdf"
            ? "is a PDF, not an image"
            : format === "unknown"
              ? `is not an image file (${mime || "unknown type"}, ${bytes.toLocaleString()} bytes)`
              : "looks damaged or truncated";
  return `${name} ${what} and could not be read as an image. This tool reads ${SUPPORTED_FORMATS_TEXT}; convert TIFF or HEIC to PNG first.`;
}

const megapixels = (w: number, h: number) => (w * h) / 1_000_000;
function tooLarge(w: number, h: number, name: string): AnalysisError {
  return new AnalysisError(
    "too-large",
    `${name} is ${megapixels(w, h).toFixed(1)} megapixels (${w} × ${h} px); the limit is ${MAX_MEGAPIXELS} megapixels. Resize it (about 6000 × 4000 px or smaller) and try again.`,
  );
}

/** Read every pixel of a bitmap into one RGBA buffer, a band at a time, so no canvas exceeds BAND_PIXELS. */
function readPixels(bitmap: ImageBitmap, bandRows?: number): Uint8ClampedArray {
  const { width, height } = bitmap;
  const rows = Math.max(1, Math.min(height, bandRows ?? Math.floor(BAND_PIXELS / width)));
  const out = new Uint8ClampedArray(width * height * 4);
  const canvas = new OffscreenCanvas(width, rows);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new AnalysisError("internal", "2D canvas is not available in the worker");
  for (let y = 0; y < height; y += rows) {
    const h = Math.min(rows, height - y);
    ctx.clearRect(0, 0, width, rows);
    ctx.drawImage(bitmap, 0, -y);
    const band = ctx.getImageData(0, 0, width, h);
    out.set(band.data, y * width * 4);
  }
  return out;
}

async function decodeBitmap(bytes: Uint8Array, name: string): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(new Blob([bytes as BlobPart]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  } catch {
    throw new AnalysisError("decode", describeFormat("png", name, bytes.length, ""));
  }
}

/** Scale a picture to at most maxPixels and hand back a transferable bitmap (native size when it already fits). */
async function displayBitmap(source: ImageBitmap | ImageData, maxPixels: number): Promise<ImageBitmap> {
  const { width, height } = source;
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  const w = Math.max(1, Math.floor(width * scale));
  const h = Math.max(1, Math.floor(height * scale));
  const bitmap = source instanceof ImageData ? await createImageBitmap(source, { premultiplyAlpha: "none" }) : source;
  // A bitmap made from ImageData that already fits is handed over as is (the caller owns it).
  if (scale === 1 && source instanceof ImageData) return bitmap;
  try {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AnalysisError("internal", "2D canvas is not available in the worker");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.transferToImageBitmap();
  } finally {
    if (source instanceof ImageData) bitmap.close(); // our temporary; the caller closes its own source bitmap
  }
}

// ---------------------------------------------------------------- state for exports
let last: { bytes?: Uint8Array; rgba?: Uint8ClampedArray; mask: Uint8Array; width: number; height: number; bandRows?: number } | undefined;

async function handleAnalyze(msg: { id: number; bytes: ArrayBuffer; name: string; mime: string; maxDisplayPixels: number; bandRows?: number }) {
  const { id, name } = msg;
  const stage = (text: string) => post({ type: "stage", id, text });
  const bytes = new Uint8Array(msg.bytes);
  const format = sniffFormat(bytes);
  if (!SUPPORTED_FORMATS.has(format)) throw new AnalysisError("unsupported-format", describeFormat(format, name, bytes.length, msg.mime));
  const dims = readDimensions(bytes);
  if (dims && megapixels(dims.width, dims.height) > MAX_MEGAPIXELS) throw tooLarge(dims.width, dims.height, name);
  if (!hasOffscreen) throw new AnalysisError("no-offscreen", "This browser has no OffscreenCanvas; the page decodes instead.");

  stage(dims ? `Reading ${name} (${megapixels(dims.width, dims.height).toFixed(1)} MP)...` : `Reading ${name}...`);
  const stripped = stripColorMetadata(bytes);
  const bitmap = await decodeBitmap(stripped, name);
  let rgba: Uint8ClampedArray;
  let input: ImageBitmap;
  const { width, height } = bitmap;
  try {
    if (megapixels(width, height) > MAX_MEGAPIXELS) throw tooLarge(width, height, name);
    rgba = readPixels(bitmap, msg.bandRows);
    input = await displayBitmap(bitmap, msg.maxDisplayPixels);
  } finally {
    bitmap.close();
  }

  const cv = await loadOpenCV();
  stage(`Finding the nucleus and microtubules in ${width} × ${height} px...`);
  const started = performance.now();
  // "in-place": the overlay is painted into rgba itself, so a 24 MP photo needs one RGBA copy, not two.
  const result = analyze(cv, rgba, width, height, { overlay: "in-place" });
  const elapsedMs = Math.round(performance.now() - started);
  stage("Painting the overlay...");
  const overlay = await displayBitmap(new ImageData(result.overlay as Uint8ClampedArray<ArrayBuffer>, width, height), msg.maxDisplayPixels);
  // Keep only what the Download buttons need: the file bytes (re-decoded on demand) and the mask.
  last = { bytes: stripped, mask: result.mask, width, height, bandRows: msg.bandRows };
  const out: ResultMessage = {
    type: "result",
    id,
    percent: result.percent,
    threshold: result.threshold,
    greenPixels: result.greenPixels,
    totalPixels: result.totalPixels,
    nucleusPixels: result.nucleusPixels,
    channelsIdentical: result.channelsIdentical,
    width,
    height,
    elapsedMs,
    input,
    overlay,
  };
  post(out, [input, overlay]);
}

/** Fallback for browsers without OffscreenCanvas in workers (Safari before 16.4): the page decoded the pixels. */
async function handleAnalyzeDecoded(msg: { id: number; rgba: ArrayBuffer; width: number; height: number }) {
  const { id, width, height } = msg;
  if (megapixels(width, height) > MAX_MEGAPIXELS) throw tooLarge(width, height, "This image");
  const rgba = new Uint8ClampedArray(msg.rgba);
  const cv = await loadOpenCV();
  post({ type: "stage", id, text: `Finding the nucleus and microtubules in ${width} × ${height} px...` });
  const started = performance.now();
  const result = analyze(cv, rgba, width, height);
  const elapsedMs = Math.round(performance.now() - started);
  last = { rgba, mask: result.mask, width, height };
  const out: ResultMessage = {
    type: "result",
    id,
    percent: result.percent,
    threshold: result.threshold,
    greenPixels: result.greenPixels,
    totalPixels: result.totalPixels,
    nucleusPixels: result.nucleusPixels,
    channelsIdentical: result.channelsIdentical,
    width,
    height,
    elapsedMs,
    overlayRGBA: result.overlay as Uint8ClampedArray<ArrayBuffer>,
  };
  post(out, [result.overlay.buffer as ArrayBuffer]);
}

async function handleExport(msg: { id: number; kind: "overlay" | "mask" }) {
  if (!last) throw new AnalysisError("internal", "Nothing to download yet: analyse an image first.");
  const { width, height } = last;
  let pixels: Uint8ClampedArray;
  if (msg.kind === "mask") {
    pixels = maskToRGBA(last.mask);
  } else {
    let rgba = last.rgba;
    if (!rgba) {
      const bitmap = await decodeBitmap(last.bytes!, "the image");
      try {
        rgba = readPixels(bitmap, last.bandRows);
      } finally {
        bitmap.close();
      }
    }
    pixels = overlayFromMask(rgba, last.mask);
  }
  if (hasOffscreen) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AnalysisError("internal", "2D canvas is not available in the worker");
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    post({ type: "export-result", id: msg.id, blob, width, height });
  } else {
    post({ type: "export-result", id: msg.id, rgba: pixels, width, height }, [pixels.buffer as ArrayBuffer]);
  }
}

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; id: number };
  const run =
    msg.type === "analyze"
      ? handleAnalyze(ev.data)
      : msg.type === "analyze-decoded"
        ? handleAnalyzeDecoded(ev.data)
        : msg.type === "export"
          ? handleExport(ev.data)
          : Promise.resolve();
  run.catch((err: unknown) => {
    const code: ErrorCode = err instanceof AnalysisError ? err.code : "internal";
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "error", id: msg.id, code, message });
  });
};

loadOpenCV()
  .then(() => post({ type: "ready" }))
  .catch((err: unknown) => post({ type: "load-error", message: err instanceof Error ? err.message : String(err) }));
