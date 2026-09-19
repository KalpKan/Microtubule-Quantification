import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    // opencv.js is served as a static file from public/, never bundled.
    target: "es2020",
  },
  worker: {
    // A classic worker so the analysis worker can importScripts() the OpenCV build
    // (module workers have no importScripts). In `vite dev` the worker is still a
    // module and src/worker.ts evaluates the OpenCV source instead.
    format: "iife",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
