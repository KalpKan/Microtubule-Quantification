/**
 * Corpus accuracy test: the browser pipeline must reproduce the Python pipeline
 * on every PNG in tests/fixtures (36 original cropped cells, whole-well images,
 * and the generated edge cases) within 1 percentage point.
 *
 * Ground truth: ../../tests/fixtures/ground_truth.json, written by
 * `.venv/bin/python tests/fixtures/make_fixtures.py` from microtubule_quantification.py.
 *
 * Node has no JPEG/WebP/BMP decoder, so this file covers the PNG entries only;
 * the JPEG, WebP, BMP and EXIF entries are checked in a real browser with
 * scripts/browser-corpus.js (see docs/reports/microtubules-spec.md in the portfolio repo).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { analyze } from "../src/pipeline";
import type { OpenCV } from "../src/pipeline";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const FIXTURES = join(here, "..", "..", "tests", "fixtures");

interface Entry {
  percent: number;
  threshold: number;
  green_pixels: number;
  total_pixels: number;
  width: number;
  height: number;
  committed: boolean;
}
const groundTruth = JSON.parse(readFileSync(join(FIXTURES, "ground_truth.json"), "utf8")) as {
  images: Record<string, Entry>;
};

function loadOpenCVInNode(): Promise<OpenCV> {
  const file = join(here, "..", "public", "opencv.js");
  const wrapper = runInThisContext(
    `(function (module, exports, require, __dirname, __filename) {${readFileSync(file, "utf8")}\n})`,
    { filename: file },
  );
  const mod = { exports: {} as OpenCV & { onRuntimeInitialized?: () => void } };
  wrapper(mod, mod.exports, require, dirname(file), file);
  const cv = mod.exports;
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

const pngEntries = Object.entries(groundTruth.images).filter(
  ([rel]) => rel.toLowerCase().endsWith(".png") && existsSync(join(FIXTURES, rel)),
);

describe(`pipeline matches Python on the fixture corpus (${pngEntries.length} PNGs)`, () => {
  const rows: string[] = [];
  for (const [rel, ref] of pngEntries) {
    it(`${rel}: within 1 point of ${ref.percent.toFixed(2)}%`, () => {
      const png = PNG.sync.read(readFileSync(join(FIXTURES, rel)));
      expect(png.width).toBe(ref.width);
      expect(png.height).toBe(ref.height);
      const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
      const result = analyze(cv, rgba, png.width, png.height);
      rows.push(
        `${rel}\tpython ${ref.percent.toFixed(4)}%\tjs ${result.percent.toFixed(4)}%\tdiff ${(result.percent - ref.percent).toFixed(4)}`,
      );
      expect(Math.abs(result.percent - ref.percent)).toBeLessThanOrEqual(1);
      expect(result.totalPixels).toBe(ref.total_pixels);
    });
  }
  it("prints the comparison table", () => {
    process.stderr.write("\nPython vs JS on the fixture corpus:\n" + rows.join("\n") + "\n\n");
    expect(rows.length).toBe(pngEntries.length);
  });
});
