/**
 * Browser port of MicrotubuleQuantifier.process_image
 * (../../microtubule_quantification.py), step for step, so the number matches
 * the Python script. The steps that actually run in the Python pipeline are:
 *
 *   1. green channel of the image
 *   2. nucleus mask: Otsu threshold on the blue channel, then an elliptical 5x5
 *      closing applied twice
 *   3. microtubule mask: Otsu threshold on the raw green channel
 *   4. remove the nucleus from the microtubule mask
 *   5. clean up: elliptical 3x3 opening, then closing
 *   6. percentage = non-zero mask pixels / all pixels
 *
 * (The Python class also defines blur, bilateral and background-subtraction
 * helpers, but process_image never calls them, so neither does this port.)
 *
 * Pure function over an RGBA pixel buffer; every OpenCV Mat is freed before
 * returning, so it is safe to call repeatedly.
 */

// The subset of the OpenCV.js module this file uses. Kept minimal on purpose:
// opencv.js ships no type definitions.
export interface Mat {
  rows: number;
  cols: number;
  data: Uint8Array;
  delete(): void;
  setTo(value: unknown, mask?: Mat): Mat;
}
export interface OpenCV {
  CV_8UC1: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  MORPH_ELLIPSE: number;
  MORPH_OPEN: number;
  MORPH_CLOSE: number;
  BORDER_CONSTANT: number;
  Mat: new (rows?: number, cols?: number, type?: number) => Mat;
  Size: new (w: number, h: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Scalar: new (...v: number[]) => unknown;
  matFromArray(rows: number, cols: number, type: number, data: ArrayLike<number>): Mat;
  threshold(src: Mat, dst: Mat, thresh: number, maxval: number, type: number): number;
  getStructuringElement(shape: number, ksize: unknown): Mat;
  morphologyEx(
    src: Mat,
    dst: Mat,
    op: number,
    kernel: Mat,
    anchor?: unknown,
    iterations?: number,
    borderType?: number,
    borderValue?: unknown,
  ): void;
  morphologyDefaultBorderValue(): unknown;
  countNonZero(src: Mat): number;
  absdiff(a: Mat, b: Mat, dst: Mat): void;
}

export interface AnalysisResult {
  /** Percentage of all pixels flagged as microtubule (0-100). */
  percent: number;
  /** Otsu threshold chosen on the green channel. */
  threshold: number;
  greenPixels: number;
  totalPixels: number;
  /** Pixels the nucleus mask (step 2) removed before counting. */
  nucleusPixels: number;
  /** True when the green and blue channels are the same plane (grayscale or single-channel input). */
  channelsIdentical: boolean;
  /** Binary mask, one byte per pixel (0 or 255), row-major. */
  mask: Uint8Array;
  /** The input with detected microtubules painted pure green, RGBA. */
  overlay: Uint8ClampedArray;
}

export interface AnalyzeOptions {
  /**
   * "copy" (default) leaves `rgba` untouched and returns a new overlay buffer;
   * "in-place" paints the overlay into `rgba` itself and returns it, which saves
   * one full-size RGBA copy (96 MB on a 24 MP photo) when the caller no longer
   * needs the input pixels.
   */
  overlay?: "copy" | "in-place";
}

const GREEN_INDEX = 1; // RGBA order in the browser (Python uses BGR; green is index 1 there too)
const BLUE_INDEX = 2; // blue is index 0 in Python's BGR, index 2 in RGBA

export function analyze(
  cv: OpenCV,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: AnalyzeOptions = {},
): AnalysisResult {
  if (rgba.length !== width * height * 4) {
    throw new Error(`expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }
  const totalPixels = width * height;
  // Steps 1 (green channel) and the blue plane, extracted in JS so wasm only ever
  // holds single-channel Mats: on a 24 MP photo that is 24 MB per plane instead
  // of a 96 MB RGBA copy plus four split planes. Every Mat is freed as soon as
  // the next step no longer needs it, which keeps the wasm heap small (it never
  // shrinks once grown).
  const greenPlane = new Uint8Array(totalPixels);
  const bluePlane = new Uint8Array(totalPixels);
  for (let i = 0, o = 0; i < totalPixels; i++, o += 4) {
    greenPlane[i] = rgba[o + GREEN_INDEX];
    bluePlane[i] = rgba[o + BLUE_INDEX];
  }
  const live: Mat[] = [];
  const track = <T extends Mat>(m: T): T => {
    live.push(m);
    return m;
  };
  const free = (m: Mat): void => {
    const i = live.indexOf(m);
    if (i >= 0) live.splice(i, 1);
    m.delete();
  };
  try {
    const green = track(cv.matFromArray(height, width, cv.CV_8UC1, greenPlane));
    const blue = track(cv.matFromArray(height, width, cv.CV_8UC1, bluePlane));
    const kernel5 = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
    const kernel3 = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));

    // Sanity signal for the page (not part of the Python pipeline): a grayscale
    // or single-channel image has identical planes and cannot be measured.
    const diff = track(new cv.Mat());
    cv.absdiff(green, blue, diff);
    const channelsIdentical = cv.countNonZero(diff) === 0;
    free(diff);

    // Step 2: nucleus mask (Otsu on blue, close x2 with a 5x5 ellipse)
    const nucleus = track(new cv.Mat());
    cv.threshold(blue, nucleus, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    free(blue);
    cv.morphologyEx(
      nucleus,
      nucleus,
      cv.MORPH_CLOSE,
      kernel5,
      new cv.Point(-1, -1),
      2,
      cv.BORDER_CONSTANT,
      cv.morphologyDefaultBorderValue(),
    );
    const nucleusPixels = cv.countNonZero(nucleus);

    // Step 3: microtubule mask (Otsu on the raw green channel)
    const mask = track(new cv.Mat());
    const threshold = cv.threshold(green, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    free(green);

    // Step 4: mask[nucleus > 0] = 0
    mask.setTo(new cv.Scalar(0), nucleus);
    free(nucleus);

    // Step 5: open then close with a 3x3 ellipse
    const opened = track(new cv.Mat());
    cv.morphologyEx(
      mask,
      opened,
      cv.MORPH_OPEN,
      kernel3,
      new cv.Point(-1, -1),
      1,
      cv.BORDER_CONSTANT,
      cv.morphologyDefaultBorderValue(),
    );
    free(mask);
    const cleaned = track(new cv.Mat());
    cv.morphologyEx(
      opened,
      cleaned,
      cv.MORPH_CLOSE,
      kernel3,
      new cv.Point(-1, -1),
      1,
      cv.BORDER_CONSTANT,
      cv.morphologyDefaultBorderValue(),
    );
    free(opened);

    // Step 6: quantify
    const greenPixels = cv.countNonZero(cleaned);
    const percent = (greenPixels / totalPixels) * 100;

    const maskOut = new Uint8Array(cleaned.data); // copy out of wasm memory
    free(cleaned);
    const overlay = options.overlay === "in-place" ? rgba : new Uint8ClampedArray(rgba);
    for (let i = 0; i < totalPixels; i++) {
      if (maskOut[i] !== 0) {
        overlay[i * 4] = 0;
        overlay[i * 4 + 1] = 255;
        overlay[i * 4 + 2] = 0;
        overlay[i * 4 + 3] = 255;
      }
    }
    return { percent, threshold, greenPixels, totalPixels, nucleusPixels, channelsIdentical, mask: maskOut, overlay };
  } finally {
    for (const m of live) m.delete();
  }
}
