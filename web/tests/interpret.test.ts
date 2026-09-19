/**
 * D4: the number must come with the facts needed to judge it. The pipeline
 * exposes how much of the image the nucleus mask removed and whether the green
 * and blue channels are identical (a grayscale or single-channel picture), and
 * src/interpret.ts turns a result into plain-English warnings. Degenerate
 * fixtures (edge/*.png) must warn; the 36 real cells must not.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { analyze } from "../src/pipeline";
import type { OpenCV } from "../src/pipeline";
import { buildWarnings, formatResultLine, REFERENCE_VALUES } from "../src/interpret";
import { loadOpenCVInNode } from "./opencv-node";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "..", "tests", "fixtures");

let cv: OpenCV;
beforeAll(async () => {
  cv = await loadOpenCVInNode();
}, 60_000);

function run(rel: string) {
  const png = PNG.sync.read(readFileSync(join(FIXTURES, rel)));
  const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
  return analyze(cv, rgba, png.width, png.height);
}

describe("analyze exposes nucleusPixels and channelsIdentical", () => {
  it("counts the nucleus mask on a real cell (some, not most, of the image)", () => {
    const r = run("cells/P1_W1_C1.PNG");
    expect(r.nucleusPixels).toBeGreaterThan(0);
    expect(r.nucleusPixels / r.totalPixels).toBeLessThan(0.9);
    expect(r.channelsIdentical).toBe(false);
  });
  it("flags identical green and blue channels on the grayscale cell", () => {
    const r = run("edge/cell-grayscale.png");
    expect(r.channelsIdentical).toBe(true);
    expect(r.percent).toBe(0);
  });
  it("reports the nucleus covering the whole image on the blue-only picture", () => {
    const r = run("edge/all-blue-nucleus-only.png");
    expect(r.nucleusPixels).toBe(r.totalPixels);
  });
});

describe("buildWarnings", () => {
  const expectWarning = (rel: string, pattern: RegExp) => {
    const r = run(rel);
    const warnings = buildWarnings(r);
    expect(warnings.length, `${rel} should warn`).toBeGreaterThan(0);
    expect(warnings.join("\n")).toMatch(pattern);
  };
  it("grayscale image -> identical channels", () => expectWarning("edge/cell-grayscale.png", /identical|grayscale/i));
  it("all black -> flat image, threshold 0", () => expectWarning("edge/all-black.png", /flat|threshold/i));
  it("all green -> 100 %", () => expectWarning("edge/all-green.png", /100|every pixel/i));
  it("one pixel -> 100 % / flat", () => expectWarning("edge/one-pixel.png", /100|every pixel|flat/i));
  it("blue only -> nucleus covers the image", () => expectWarning("edge/all-blue-nucleus-only.png", /nucleus/i));
  it("says nothing on the 33 real cells with a non-zero result, and only '0 %' on the three DMSO cells Python also scores 0.0", () => {
    // Results/quantification_results.csv: P1_W2_C1, P1_W2_C2, P1_W2_C3 (DMSO_control) are 0.0 % in Python too.
    for (const p of [1, 2, 3]) {
      for (const w of [1, 2, 3, 4]) {
        for (const c of [1, 2, 3]) {
          const rel = `cells/P${p}_W${w}_C${c}.PNG`;
          const r = run(rel);
          const warnings = buildWarnings(r);
          if (r.percent === 0) {
            expect(rel).toMatch(/P1_W2_C[123]/);
            expect(warnings, rel).toHaveLength(1);
            expect(warnings[0]).toMatch(/0 %/);
          } else {
            expect(warnings, rel).toEqual([]);
          }
        }
      }
    }
  });
  it("says nothing on the whole-well PNGs", () => {
    for (const rel of ["fullfield/Plate1_W1_untreated.png", "fullfield/Plate2_45_nocodazole45uM.png", "fullfield/Plate3_W2_New_nocodazole25uM.png"]) {
      expect(buildWarnings(run(rel)), rel).toEqual([]);
    }
  });
});

describe("reference values and the copy line", () => {
  it("carries the paper's three conditions", () => {
    expect(REFERENCE_VALUES.map((r) => r.mean)).toEqual([27.9, 17.2, 30.7]);
    expect(REFERENCE_VALUES.map((r) => r.sd)).toEqual([4.6, 2.6, 9.5]);
  });
  it("formats <name>: <percent>% (threshold N, X/Y px)", () => {
    const r = run("cells/P1_W1_C1.PNG");
    expect(formatResultLine("P1_W1_C1", r)).toBe("P1_W1_C1: 24.83% (threshold 36, 1109/4466 px)");
  });
});
