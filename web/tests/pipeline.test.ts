/**
 * Accuracy test: the browser pipeline (web/src/pipeline.ts) must reproduce the
 * Python pipeline's percentage on every sample cell within 1 percentage point.
 * Reference values come from web/scripts/reference.py (web/tests/expected.json).
 * The same public/opencv.js the page ships is loaded here in Node; PNGs are decoded
 * with pngjs so no browser or native canvas is needed.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { analyze } from "../src/pipeline";
import type { OpenCV } from "../src/pipeline";
import expected from "./expected.json";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadOpenCVInNode(): Promise<OpenCV> {
  // Load the UMD file the way plain `node` would (sloppy-mode script). Vitest's
  // own module transform runs it in strict mode, where the UMD wrapper's
  // `Module = {}` assignment throws "Module is not defined".
  const file = join(here, "..", "public", "opencv.js");
  const wrapper = runInThisContext(`(function (module, exports, require, __dirname, __filename) {${readFileSync(file, "utf8")}\n})`, {
    filename: file,
  });
  const mod = { exports: {} as OpenCV & { onRuntimeInitialized?: () => void } };
  wrapper(mod, mod.exports, require, dirname(file), file);
  const cv = mod.exports;
  // The Emscripten module is a thenable that resolves to itself, so resolving
  // a Promise with it adopts the thenable and loops forever. Wait for
  // onRuntimeInitialized, then drop `then` before handing the module back.
  return new Promise<OpenCV>((resolve) => {
    const done = () => {
      delete (cv as { then?: unknown }).then;
      resolve(cv);
    };
    if (cv.Mat) return done();
    cv.onRuntimeInitialized = done;
  });
}

let cv: OpenCV;
beforeAll(async () => {
  cv = await loadOpenCVInNode();
}, 60_000);

describe("pipeline matches the Python reference on the sample cells", () => {
  const rows: string[] = [];
  for (const [name, ref] of Object.entries(expected)) {
    it(`${name}: within 1 percentage point of ${ref.percent.toFixed(2)}%`, () => {
      const png = PNG.sync.read(readFileSync(join(here, "..", "public", "samples", `${name}.png`)));
      expect(png.width).toBe(ref.width);
      expect(png.height).toBe(ref.height);
      const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
      const result = analyze(cv, rgba, png.width, png.height);
      rows.push(`${name}\tpython ${ref.percent.toFixed(4)}%\tjs ${result.percent.toFixed(4)}%\tdiff ${(result.percent - ref.percent).toFixed(4)}`);
      expect(Math.abs(result.percent - ref.percent)).toBeLessThanOrEqual(1);
      // Stricter than the DoD: the same Otsu threshold and pixel counts.
      expect(result.threshold).toBe(ref.threshold);
      expect(result.greenPixels).toBe(ref.green_pixels);
      expect(result.totalPixels).toBe(ref.total_pixels);
      expect(result.overlay.length).toBe(rgba.length);
      expect(result.mask.length).toBe(png.width * png.height);
    });
  }
  it("prints the comparison table", () => {
    process.stderr.write("\nPython vs JS on the sample cells:\n" + rows.join("\n") + "\n\n");
    expect(rows.length).toBe(Object.keys(expected).length);
  });
});
