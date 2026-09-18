import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    // opencv.js is served as a static file from public/, never bundled.
    target: "es2020",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
