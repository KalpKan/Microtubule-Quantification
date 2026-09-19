/**
 * Load public/opencv.js (the exact file the page ships) inside Node for the tests.
 *
 * The UMD file is run the way plain `node` would (sloppy-mode script): vitest's
 * own module transform runs it in strict mode, where the wrapper's `Module = {}`
 * assignment throws "Module is not defined". The Emscripten module is also a
 * thenable that resolves to itself, so resolving a Promise with it would loop
 * forever; wait for onRuntimeInitialized, then drop `then`.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { OpenCV } from "../src/pipeline";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let loading: Promise<OpenCV> | undefined;

export function loadOpenCVInNode(): Promise<OpenCV> {
  if (loading) return loading;
  const file = join(here, "..", "public", "opencv.js");
  const wrapper = runInThisContext(
    `(function (module, exports, require, __dirname, __filename) {${readFileSync(file, "utf8")}\n})`,
    { filename: file },
  );
  const mod = { exports: {} as OpenCV & { onRuntimeInitialized?: () => void } };
  wrapper(mod, mod.exports, require, dirname(file), file);
  const cv = mod.exports;
  loading = new Promise<OpenCV>((resolve) => {
    const done = () => {
      delete (cv as { then?: unknown }).then;
      resolve(cv);
    };
    if (cv.Mat) return done();
    cv.onRuntimeInitialized = done;
  });
  return loading;
}
