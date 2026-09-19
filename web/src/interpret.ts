/**
 * Plain-English interpretation of an AnalysisResult: the warnings shown above
 * the number when the input is not the kind of image the method was built for,
 * the paper's reference values, and the one-line summary the Copy button puts on
 * the clipboard. Pure functions, tested in tests/interpret.test.ts.
 */
import type { AnalysisResult } from "./pipeline";

/** Reference values from the group's validation experiment (README "Example Results"). */
export const REFERENCE_VALUES = [
  { condition: "Untreated", mean: 27.9, sd: 4.6 },
  { condition: "Nocodazole 45 µM", mean: 17.2, sd: 2.6 },
  { condition: "Taxol", mean: 30.7, sd: 9.5 },
] as const;

/** Share of the image the nucleus mask may cover before the measurement is called meaningless. */
export const NUCLEUS_COVERAGE_LIMIT = 0.9;

type Facts = Pick<AnalysisResult, "percent" | "threshold" | "totalPixels" | "nucleusPixels" | "channelsIdentical">;

/**
 * Warnings for degenerate inputs, most fundamental first. An empty array means
 * the image looks like a two-colour fluorescence picture and the number can be
 * read as a measurement.
 */
export function buildWarnings(r: Facts): string[] {
  const out: string[] = [];
  const nucleusShare = r.totalPixels > 0 ? r.nucleusPixels / r.totalPixels : 0;
  if (r.channelsIdentical) {
    out.push(
      "The green and blue channels of this image are identical, so it is a grayscale or single-channel picture. " +
        "The method needs a two-colour image (green microtubules, blue nucleus); this result is not a measurement.",
    );
  }
  if (nucleusShare > NUCLEUS_COVERAGE_LIMIT) {
    out.push(
      `The nucleus mask covers ${Math.round(nucleusShare * 100)} % of the image, so almost everything was removed before counting. ` +
        "That usually means the blue channel is missing or nearly flat; this result is not a measurement.",
    );
  }
  if (r.threshold === 0) {
    out.push("Otsu found no threshold (0): the green channel is flat, so nothing separates microtubules from background.");
  }
  if (r.percent >= 100) {
    out.push("Every pixel counted as microtubule (100 %). That only happens on a flat or synthetic image, not on a cell.");
  } else if (r.percent === 0 && !r.channelsIdentical && nucleusShare <= NUCLEUS_COVERAGE_LIMIT && r.threshold !== 0) {
    out.push("No microtubule pixels were found (0 %). Check that the microtubule signal is in the green channel.");
  } else if (r.percent === 0 && out.length === 0) {
    out.push("No microtubule pixels were found (0 %).");
  }
  return out;
}

/** `<name>: <percent>% (threshold N, X/Y px)`, the line the Copy button writes. */
export function formatResultLine(name: string, r: Pick<AnalysisResult, "percent" | "threshold" | "greenPixels" | "totalPixels">): string {
  return `${name}: ${r.percent.toFixed(2)}% (threshold ${r.threshold}, ${r.greenPixels}/${r.totalPixels} px)`;
}
