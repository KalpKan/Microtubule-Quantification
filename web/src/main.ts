import "./style.css";
import { analyze } from "./pipeline";
import type { OpenCV } from "./pipeline";
import { loadOpenCV } from "./opencv-loader";
import { capture, initAnalytics } from "./analytics";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const status = $<HTMLParagraphElement>("status");
const results = $<HTMLElement>("results");
const fileInput = $<HTMLInputElement>("file-input");
const cameraInput = $<HTMLInputElement>("camera-input");
const inputCanvas = $<HTMLCanvasElement>("input-canvas");
const overlayCanvas = $<HTMLCanvasElement>("overlay-canvas");

const SAMPLE_LABELS: Record<string, string> = {
  P1_W1_C1: "Untreated",
  P3_W2_C3: "Nocodazole 25 µM",
  P1_W3_C1: "Taxol control",
};

let cv: OpenCV | undefined;
let busy = false;

function setStatus(text: string, kind: "info" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.kind = kind;
}

function setBusy(on: boolean): void {
  busy = on;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button.sample, #file-input, #camera-input").forEach((el) => {
    el.disabled = on;
  });
}

/** Decode any browser-supported image into raw RGBA without colour management. */
async function decode(blob: Blob): Promise<ImageData> {
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

function paint(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  // Tiny cells (the samples are under 100 px wide) are shown pixel-for-pixel; large photos scale down.
  canvas.style.imageRendering = width < 400 ? "pixelated" : "auto";
}

async function run(blob: Blob, source: "sample" | "upload" | "camera", label: string): Promise<void> {
  if (busy) return;
  setBusy(true);
  try {
    if (!cv) {
      setStatus("Loading OpenCV...");
      cv = await loadOpenCV(setStatus);
    }
    setStatus(`Analysing ${label}...`);
    const image = await decode(blob);
    const started = performance.now();
    const result = analyze(cv, image.data, image.width, image.height);
    const elapsed = Math.round(performance.now() - started);

    paint(inputCanvas, image.data, image.width, image.height);
    paint(overlayCanvas, result.overlay, image.width, image.height);
    $("percent").textContent = result.percent.toFixed(2);
    $("dims").textContent = `${image.width} × ${image.height} px`;
    $("threshold").textContent = String(result.threshold);
    $("pixels").textContent = `${result.greenPixels.toLocaleString()} / ${result.totalPixels.toLocaleString()}`;
    $("elapsed").textContent = `${elapsed} ms`;
    results.hidden = false;
    setStatus(`Done: ${label}. Pick another image or sample to run again.`);
    capture("image_analyzed", {
      percent: Number(result.percent.toFixed(2)),
      width: image.width,
      height: image.height,
      source,
    });
  } catch (err) {
    console.error(err);
    setStatus(`Could not analyse that image: ${err instanceof Error ? err.message : String(err)}`, "error");
  } finally {
    setBusy(false);
  }
}

async function runSample(name: string): Promise<void> {
  const label = SAMPLE_LABELS[name] ?? name;
  setBusy(true);
  try {
    setStatus(`Loading sample ${label}...`);
    const res = await fetch(`/samples/${name}.png`);
    if (!res.ok) throw new Error(`sample ${name} returned ${res.status}`);
    const blob = await res.blob();
    capture("sample_loaded", { sample: name });
    setBusy(false);
    await run(blob, "sample", `sample ${label} (${name})`);
  } catch (err) {
    setBusy(false);
    setStatus(`Could not load the sample: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}

function onFile(input: HTMLInputElement, source: "upload" | "camera"): void {
  const file = input.files?.[0];
  if (!file) return;
  void run(file, source, file.name || "your photo");
  input.value = "";
}

document.querySelectorAll<HTMLButtonElement>("button.sample").forEach((button) => {
  button.addEventListener("click", () => void runSample(button.dataset.sample ?? ""));
});
fileInput.addEventListener("change", () => onFile(fileInput, "upload"));
cameraInput.addEventListener("change", () => onFile(cameraInput, "camera"));

initAnalytics();

// Warm up OpenCV right away so the first analysis is instant.
loadOpenCV(setStatus)
  .then((module) => {
    cv = module;
    setStatus("Ready. Choose an image or try a sample.");
  })
  .catch((err: unknown) => {
    setStatus(`OpenCV failed to load: ${err instanceof Error ? err.message : String(err)}`, "error");
  });
