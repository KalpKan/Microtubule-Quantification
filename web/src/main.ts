import "./style.css";
import AnalysisWorker from "./worker?worker";
import type { ErrorCode, ResultMessage } from "./worker";
import { buildWarnings, formatResultLine } from "./interpret";
import { exportFileName } from "./export";
import { capture, initAnalytics } from "./analytics";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const status = $<HTMLParagraphElement>("status");
const results = $<HTMLElement>("results");
const warnings = $<HTMLDivElement>("warnings");
const fileInput = $<HTMLInputElement>("file-input");
const cameraInput = $<HTMLInputElement>("camera-input");
const inputCanvas = $<HTMLCanvasElement>("input-canvas");
const overlayCanvas = $<HTMLCanvasElement>("overlay-canvas");
const copyButton = $<HTMLButtonElement>("copy-result");

const SAMPLE_LABELS: Record<string, string> = {
  P1_W1_C1: "Untreated",
  P3_W2_C3: "Nocodazole 25 µM",
  P1_W3_C1: "Taxol control",
};
/** Display canvases are capped at 2 MP each; analysis always runs at full resolution in the worker. */
const MAX_DISPLAY_PIXELS = 2_000_000;
/** Test hook: ?bandRows=N makes the worker read the decoded picture in N-row bands (exercises the banded path on small files). */
const bandRows = Number(new URLSearchParams(location.search).get("bandRows")) || undefined;

type Source = "sample" | "upload" | "camera";
interface Pending {
  resolve: (m: ResultMessage) => void;
  reject: (e: Error & { code?: ErrorCode }) => void;
}

const worker = new AnalysisWorker();
let nextId = 1;
const pending = new Map<number, Pending>();
type ExportMessage = { blob?: Blob; rgba?: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
const pendingExports = new Map<number, { resolve: (m: ExportMessage) => void; reject: (e: Error) => void }>();
let workerReady = false;
let busy = false;
/** The last successful analysis: what the Copy and Download buttons act on. */
let current: { name: string; line: string; width: number; height: number } | undefined;
/** Fallback path (no OffscreenCanvas in the worker): the page decodes and paints full-size pictures itself. */
let pageDecodes = false;
const sampleCache = new Map<string, ArrayBuffer>();

function setStatus(text: string, kind: "info" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.kind = kind;
}

function setBusy(on: boolean): void {
  busy = on;
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button.sample, #file-input, #camera-input, .actions button")
    .forEach((el) => {
      el.disabled = on;
    });
  results.classList.toggle("stale", on);
  results.setAttribute("aria-busy", on ? "true" : "false");
}

worker.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; id?: number; text?: string; message?: string; code?: ErrorCode };
  switch (msg.type) {
    case "status":
      if (!busy) setStatus(msg.text ?? "");
      break;
    case "ready":
      workerReady = true;
      if (!busy) setStatus("Ready. Choose an image or try a sample.");
      void prefetchSamples();
      break;
    case "load-error":
      setStatus(`OpenCV failed to load: ${msg.message}`, "error");
      break;
    case "stage":
      setStatus(msg.text ?? "");
      break;
    case "result":
      pending.get(msg.id!)?.resolve(ev.data as ResultMessage);
      pending.delete(msg.id!);
      break;
    case "error": {
      const err = Object.assign(new Error(msg.message), { code: msg.code });
      if (pending.has(msg.id!)) {
        pending.get(msg.id!)!.reject(err);
        pending.delete(msg.id!);
      } else if (pendingExports.has(msg.id!)) {
        pendingExports.get(msg.id!)!.reject(err);
        pendingExports.delete(msg.id!);
      }
      break;
    }
    case "export-result":
      pendingExports.get(msg.id!)?.resolve(ev.data);
      pendingExports.delete(msg.id!);
      break;
  }
};
worker.onerror = (ev) => setStatus(`The analysis worker crashed: ${ev.message}`, "error");

function analyzeInWorker(message: Record<string, unknown>, transfer: Transferable[]): Promise<ResultMessage> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
}

/** Decode on the page (older Safari only): raw RGBA without colour management, like the worker does. */
async function decodeOnPage(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas is not available");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function paintBitmap(canvas: HTMLCanvasElement, bitmap: ImageBitmap, fullWidth: number): void {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  // Tiny cells (the samples are under 100 px wide) are shown pixel-for-pixel; large photos scale down.
  canvas.style.imageRendering = fullWidth < 400 ? "pixelated" : "auto";
}

function paintPixels(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  canvas.style.imageRendering = width < 400 ? "pixelated" : "auto";
}

function showResult(name: string, r: ResultMessage): void {
  $("percent").textContent = r.percent.toFixed(2);
  $("dims").textContent = `${r.width} × ${r.height} px`;
  $("threshold").textContent = String(r.threshold);
  $("pixels").textContent = `${r.greenPixels.toLocaleString("en-US")} / ${r.totalPixels.toLocaleString("en-US")}`;
  $("nucleus").textContent = `${((r.nucleusPixels / r.totalPixels) * 100).toFixed(1)} %`;
  const notes = buildWarnings(r);
  warnings.replaceChildren(
    ...notes.map((text) => {
      const p = document.createElement("p");
      p.textContent = text;
      return p;
    }),
  );
  warnings.hidden = notes.length === 0;
  current = { name, line: formatResultLine(name.replace(/\.[A-Za-z0-9]+$/, ""), r), width: r.width, height: r.height };
  copyButton.textContent = "Copy result";
  results.hidden = false;
  results.classList.remove("stale");
}

function revealResults(): void {
  // On a phone the result card sits below the controls; bring it into view (D6) and move focus for screen readers.
  const rect = results.getBoundingClientRect();
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  if (rect.top > window.innerHeight * 0.5 || rect.top < 0) {
    results.scrollIntoView({ behavior, block: "start" });
  } else if (rect.bottom > window.innerHeight) {
    results.scrollIntoView({ behavior, block: "nearest" });
  }
  results.focus({ preventScroll: true });
}

function describeError(err: Error & { code?: ErrorCode }, label: string): string {
  if (err.code === "unsupported-format" || err.code === "decode" || err.code === "too-large") return err.message;
  return `Could not analyse ${label}: ${err.message}`;
}

async function run(blob: Blob | ArrayBuffer, source: Source, name: string, label: string): Promise<void> {
  if (busy) return;
  setBusy(true);
  try {
    if (!workerReady) setStatus("Waiting for OpenCV to finish loading...");
    setStatus(`Reading ${label}...`);
    let r: ResultMessage | undefined;
    let inputPixels: ImageData | undefined;
    if (!pageDecodes) {
      // Samples arrive as cached ArrayBuffers (copied, since the transfer detaches them); files are read here.
      const bytes = blob instanceof ArrayBuffer ? blob.slice(0) : await blob.arrayBuffer();
      const mime = blob instanceof Blob ? blob.type : "image/png";
      try {
        r = await analyzeInWorker({ type: "analyze", bytes, name, mime, maxDisplayPixels: MAX_DISPLAY_PIXELS, bandRows }, [bytes]);
      } catch (err) {
        if ((err as { code?: ErrorCode }).code !== "no-offscreen") throw err;
        pageDecodes = true; // older Safari: no OffscreenCanvas in workers, so the page decodes from now on
      }
    }
    if (!r) {
      inputPixels = await decodeOnPage(blob instanceof Blob ? blob : new Blob([blob], { type: "image/png" }));
      const copy = new Uint8ClampedArray(inputPixels.data);
      r = await analyzeInWorker({ type: "analyze-decoded", rgba: copy.buffer, width: inputPixels.width, height: inputPixels.height }, [copy.buffer]);
    }
    if (r.input && r.overlay) {
      paintBitmap(inputCanvas, r.input, r.width);
      paintBitmap(overlayCanvas, r.overlay, r.width);
    } else if (inputPixels && r.overlayRGBA) {
      paintPixels(inputCanvas, inputPixels.data, r.width, r.height);
      paintPixels(overlayCanvas, r.overlayRGBA, r.width, r.height);
    }
    showResult(name, r);
    const seconds = r.elapsedMs >= 100 ? ` in ${(r.elapsedMs / 1000).toFixed(1)} s` : "";
    setStatus(`Done: ${label}${seconds}. Pick another image or sample to run again.`);
    revealResults();
    capture("image_analyzed", { percent: Number(r.percent.toFixed(2)), width: r.width, height: r.height, source });
  } catch (err) {
    results.hidden = true; // never leave the previous image's number on screen under an error (D3)
    current = undefined;
    setStatus(describeError(err as Error, label), "error");
  } finally {
    setBusy(false);
  }
}

async function fetchSample(name: string): Promise<ArrayBuffer> {
  const cached = sampleCache.get(name);
  if (cached) return cached;
  const res = await fetch(`/samples/${name}.png`);
  if (!res.ok) throw new Error(`sample ${name} returned ${res.status}`);
  const bytes = await res.arrayBuffer();
  sampleCache.set(name, bytes);
  return bytes;
}

/** Fetch the three sample cells (14 KB) once OpenCV is up so they work offline later (D8). */
async function prefetchSamples(): Promise<void> {
  for (const name of Object.keys(SAMPLE_LABELS)) {
    try {
      await fetchSample(name);
    } catch {
      /* offline already; the tap will report it */
    }
  }
}

async function runSample(name: string): Promise<void> {
  if (busy) return;
  const label = SAMPLE_LABELS[name] ?? name;
  let bytes: ArrayBuffer;
  try {
    setStatus(`Loading sample ${label}...`);
    bytes = await fetchSample(name);
  } catch (err) {
    setStatus(`Could not load the sample: ${err instanceof Error ? err.message : String(err)}`, "error");
    return;
  }
  capture("sample_loaded", { sample: name });
  await run(bytes, "sample", name, `sample ${label} (${name})`);
}

function onFile(input: HTMLInputElement, source: "upload" | "camera"): void {
  const file = input.files?.[0];
  if (!file) return;
  const name = file.name || "your photo";
  void run(file, source, name, name);
  input.value = "";
}

function exportImage(kind: "overlay" | "mask"): Promise<ExportMessage> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pendingExports.set(id, { resolve, reject });
    worker.postMessage({ type: "export", id, kind });
  });
}

function encodeOnPage(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"));
}

async function download(kind: "overlay" | "mask"): Promise<void> {
  if (!current || busy) return;
  const button = $<HTMLButtonElement>(`download-${kind}`);
  button.disabled = true;
  try {
    const out = await exportImage(kind);
    const blob = out.blob ?? (await encodeOnPage(out.rgba!, out.width, out.height));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(current.name, kind);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setStatus(`Saved ${a.download} (${out.width} × ${out.height} px).`);
  } catch (err) {
    setStatus(`Could not create the ${kind} PNG: ${err instanceof Error ? err.message : String(err)}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function copyResult(): Promise<void> {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.line);
    copyButton.textContent = "Copied";
    setStatus(`Copied: ${current.line}`);
  } catch {
    setStatus(`Copy failed; the result is: ${current.line}`, "error");
  }
}

document.querySelectorAll<HTMLButtonElement>("button.sample").forEach((button) => {
  button.addEventListener("click", () => void runSample(button.dataset.sample ?? ""));
});
fileInput.addEventListener("change", () => onFile(fileInput, "upload"));
cameraInput.addEventListener("change", () => onFile(cameraInput, "camera"));
$("download-overlay").addEventListener("click", () => void download("overlay"));
$("download-mask").addEventListener("click", () => void download("mask"));
copyButton.addEventListener("click", () => void copyResult());

// The explanations are open on wide screens and folded on phones, where they would push the pictures below the fold.
$<HTMLDetailsElement>("explain").open = window.matchMedia("(min-width: 700px)").matches;

initAnalytics();
setStatus("Loading OpenCV...");
