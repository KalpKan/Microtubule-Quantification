import type { OpenCV } from "./pipeline";

declare global {
  interface Window {
    cv?: OpenCV & { onRuntimeInitialized?: () => void; then?: unknown };
  }
}

let loading: Promise<OpenCV> | undefined;

/**
 * Load /opencv.js (the official build, served from this site's own public/
 * folder so it works offline and never touches a CDN) exactly once and resolve
 * when the wasm runtime is ready.
 *
 * Two traps this avoids: the Emscripten module is a thenable that resolves to
 * itself, so `await window.cv` or `resolve(window.cv)` would loop forever; we
 * wait for onRuntimeInitialized and delete `then` first. And the runtime can
 * finish initialising before this code attaches its callback, so `cv.Mat` is
 * checked as well.
 */
export function loadOpenCV(onProgress?: (msg: string) => void): Promise<OpenCV> {
  if (loading) return loading;
  loading = new Promise<OpenCV>((resolve, reject) => {
    const finish = () => {
      const cv = window.cv;
      if (!cv) return reject(new Error("opencv.js loaded but window.cv is missing"));
      delete cv.then;
      resolve(cv);
    };
    const attach = () => {
      const cv = window.cv;
      if (!cv) return reject(new Error("opencv.js did not define window.cv"));
      if (cv.Mat) return finish();
      onProgress?.("Starting OpenCV runtime...");
      cv.onRuntimeInitialized = finish;
    };
    if (window.cv) return attach();
    onProgress?.("Downloading OpenCV (about 11 MB, one time)...");
    const script = document.createElement("script");
    script.src = "/opencv.js";
    script.async = true;
    script.onload = attach;
    script.onerror = () => reject(new Error("could not load /opencv.js"));
    document.head.appendChild(script);
  });
  return loading;
}
