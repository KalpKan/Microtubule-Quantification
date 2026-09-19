/**
 * D5: the downloadable overlay and mask must be the Python outputs, pixel for
 * pixel. src/export.ts builds the RGBA images the page encodes as PNG; here they
 * are compared with Results/<name>_overlay.png and Results/<name>_mask.png
 * (written by cv2.imwrite in microtubule_quantification.py) for the three samples.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { analyze } from "../src/pipeline";
import type { OpenCV } from "../src/pipeline";
import { maskToRGBA, overlayFromMask, exportFileName } from "../src/export";
import { loadOpenCVInNode } from "./opencv-node";

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(here, "..", "..", "Results");
const SAMPLES = join(here, "..", "public", "samples");

let cv: OpenCV;
beforeAll(async () => {
  cv = await loadOpenCVInNode();
}, 60_000);

function readPng(file: string) {
  const png = PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, rgba: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length) };
}

function countDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, channels: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (const c of channels) if (a[i + c] !== b[i + c]) { n++; break; }
  }
  return n;
}

describe("export images equal the Python Results/ files", () => {
  for (const name of ["P1_W1_C1", "P3_W2_C3", "P1_W3_C1"]) {
    it(`${name}: overlay diff 0 px, mask diff 0 px`, () => {
      const input = readPng(join(SAMPLES, `${name}.png`));
      const result = analyze(cv, input.rgba, input.width, input.height);
      const overlay = overlayFromMask(input.rgba, result.mask);
      const refOverlay = readPng(join(RESULTS, `${name}_overlay.png`));
      expect(overlay.length).toBe(refOverlay.rgba.length);
      expect(countDiff(overlay, refOverlay.rgba, [0, 1, 2])).toBe(0);
      const mask = maskToRGBA(result.mask);
      const refMask = readPng(join(RESULTS, `${name}_mask.png`)); // grayscale, pngjs expands to RGBA
      expect(mask.length).toBe(refMask.rgba.length);
      expect(countDiff(mask, refMask.rgba, [0, 1, 2])).toBe(0);
      // Every exported pixel is opaque, so an alpha-dropping reader sees the same image.
      for (let i = 3; i < mask.length; i += 4) if (mask[i] !== 255) throw new Error("mask alpha");
      for (let i = 3; i < overlay.length; i += 4) if (overlay[i] !== 255) throw new Error("overlay alpha");
    });
  }
  it("names the files like Results/: <name>_overlay.png and <name>_mask.png", () => {
    expect(exportFileName("P1_W1_C1", "overlay")).toBe("P1_W1_C1_overlay.png");
    expect(exportFileName("my cell.PNG", "mask")).toBe("my cell_mask.png");
    expect(exportFileName("IMG_0042.jpeg", "overlay")).toBe("IMG_0042_overlay.png");
    expect(exportFileName("", "mask")).toBe("image_mask.png");
  });
});
