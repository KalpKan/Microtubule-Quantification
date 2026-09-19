/**
 * The images the Download buttons save, built to match what
 * microtubule_quantification.py writes with cv2.imwrite:
 *   <name>_mask.png     the binary mask, 0 or 255
 *   <name>_overlay.png  the input with detected microtubules painted pure green
 * Pure functions over pixel buffers; PNG encoding happens in the worker with an
 * OffscreenCanvas. Tested against Results/*.png in tests/export.test.ts.
 */

/** Grayscale mask as opaque RGBA (R = G = B = mask value). */
export function maskToRGBA(mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The input with every mask pixel set to (0, 255, 0), alpha 255 everywhere (cv2 drops alpha). */
export function overlayFromMask(rgba: Uint8ClampedArray, mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    if (mask[i] !== 0) {
      out[o] = 0;
      out[o + 1] = 255;
      out[o + 2] = 0;
    }
    out[o + 3] = 255;
  }
  return out;
}

/** `<basename without extension>_<kind>.png`, mirroring the Results/ folder. */
export function exportFileName(name: string, kind: "overlay" | "mask"): string {
  const base = name.replace(/\.[A-Za-z0-9]+$/, "").trim() || "image";
  return `${base}_${kind}.png`;
}
