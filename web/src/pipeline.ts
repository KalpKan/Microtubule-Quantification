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
  CV_8UC4: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  MORPH_ELLIPSE: number;
  MORPH_OPEN: number;
  MORPH_CLOSE: number;
  BORDER_CONSTANT: number;
  Mat: new (rows?: number, cols?: number, type?: number) => Mat;
  MatVector: new () => { get(i: number): Mat; size(): number; delete(): void };
  Size: new (w: number, h: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Scalar: new (...v: number[]) => unknown;
  matFromArray(rows: number, cols: number, type: number, data: ArrayLike<number>): Mat;
  split(src: Mat, dst: { get(i: number): Mat }): void;
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
}

export interface AnalysisResult {
  /** Percentage of all pixels flagged as microtubule (0-100). */
  percent: number;
  /** Otsu threshold chosen on the green channel. */
  threshold: number;
  greenPixels: number;
  totalPixels: number;
  /** Binary mask, one byte per pixel (0 or 255), row-major. */
  mask: Uint8Array;
  /** The input with detected microtubules painted pure green, RGBA. */
  overlay: Uint8ClampedArray;
}

const GREEN_INDEX = 1; // RGBA order in the browser (Python uses BGR; green is index 1 there too)
const BLUE_INDEX = 2; // blue is index 0 in Python's BGR, index 2 in RGBA

export function analyze(cv: OpenCV, rgba: Uint8ClampedArray, width: number, height: number): AnalysisResult {
  if (rgba.length !== width * height * 4) {
    throw new Error(`expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }
  const src = cv.matFromArray(height, width, cv.CV_8UC4, rgba);
  const channels = new cv.MatVector();
  const nucleus = new cv.Mat();
  const mask = new cv.Mat();
  const opened = new cv.Mat();
  const cleaned = new cv.Mat();
  const kernel5 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  const kernel3 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  try {
    cv.split(src, channels);
    const green = channels.get(GREEN_INDEX);
    const blue = channels.get(BLUE_INDEX);

    // Step 2: nucleus mask (Otsu on blue, close x2 with a 5x5 ellipse)
    cv.threshold(blue, nucleus, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
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

    // Step 3: microtubule mask (Otsu on the raw green channel)
    const threshold = cv.threshold(green, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    // Step 4: mask[nucleus > 0] = 0
    mask.setTo(new cv.Scalar(0), nucleus);

    // Step 5: open then close with a 3x3 ellipse
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

    // Step 6: quantify
    const totalPixels = width * height;
    const greenPixels = cv.countNonZero(cleaned);
    const percent = (greenPixels / totalPixels) * 100;

    const maskOut = new Uint8Array(cleaned.data); // copy out of wasm memory
    const overlay = new Uint8ClampedArray(rgba);
    for (let i = 0; i < totalPixels; i++) {
      if (maskOut[i] !== 0) {
        overlay[i * 4] = 0;
        overlay[i * 4 + 1] = 255;
        overlay[i * 4 + 2] = 0;
        overlay[i * 4 + 3] = 255;
      }
    }
    return { percent, threshold, greenPixels, totalPixels, mask: maskOut, overlay };
  } finally {
    kernel3.delete();
    kernel5.delete();
    cleaned.delete();
    opened.delete();
    mask.delete();
    nucleus.delete();
    channels.delete();
    src.delete();
  }
}
