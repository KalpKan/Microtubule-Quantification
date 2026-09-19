/**
 * Byte-level tests for src/decode.ts: the part of the browser pipeline that runs
 * before the image is decoded. Safari applies a PNG's embedded ICC profile (and
 * a JPEG's APP2 ICC segment) even with colorSpaceConversion: "none", which moves
 * every pixel value and therefore the Otsu threshold (defect D1 in
 * docs/reports/microtubules.md). Python's cv2.imread ignores colour metadata,
 * so the page must drop it before decoding. These tests prove the stripper
 * removes exactly the colour chunks and leaves the pixels untouched.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { pngChunkTypes, readDimensions, sniffFormat, stripColorMetadata } from "../src/decode";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "..", "tests", "fixtures");
const read = (rel: string) => new Uint8Array(readFileSync(join(FIXTURES, rel)));

const ICC_PNGS = [
  "fullfield/Plate1_W1_untreated.png",
  "fullfield/Plate2_45_nocodazole45uM.png",
  "fullfield/Plate3_W2_New_nocodazole25uM.png",
];

function jpegMarkers(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const m = bytes[i + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (m === 0xda) {
      out.push("SOS");
      break;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    let tag = `${m.toString(16).toUpperCase()}`;
    if (m === 0xe2 && String.fromCharCode(...bytes.subarray(i + 4, i + 15)) === "ICC_PROFILE") tag = "APP2/ICC";
    if (m === 0xe1 && String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === "Exif") tag = "APP1/Exif";
    out.push(tag);
    i += 2 + len;
  }
  return out;
}

/** Build a JPEG that carries an APP2 ICC_PROFILE segment right after SOI. */
function withIccSegment(jpeg: Uint8Array): Uint8Array {
  const payload = new TextEncoder().encode("ICC_PROFILE\0\x01\x01" + "x".repeat(100));
  const len = payload.length + 2;
  const seg = new Uint8Array([0xff, 0xe2, len >> 8, len & 0xff, ...payload]);
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(seg, 2);
  out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}

describe("stripColorMetadata (D1: Safari honours ICC/gAMA/cHRM, Python does not)", () => {
  for (const rel of ICC_PNGS) {
    it(`${rel}: drops the iCCP chunk and keeps every pixel`, () => {
      const original = read(rel);
      expect(pngChunkTypes(original)).toContain("iCCP");
      const stripped = stripColorMetadata(original);
      const types = pngChunkTypes(stripped);
      expect(types).not.toContain("iCCP");
      expect(types[0]).toBe("IHDR");
      expect(types[types.length - 1]).toBe("IEND");
      const a = PNG.sync.read(Buffer.from(original));
      const b = PNG.sync.read(Buffer.from(stripped));
      expect(b.width).toBe(a.width);
      expect(b.height).toBe(a.height);
      expect(Buffer.compare(a.data, b.data)).toBe(0);
    });
  }

  it("drops gAMA and cHRM from the ImageJ crops and keeps the pixels", () => {
    const original = read("cells/P1_W1_C1.PNG");
    expect(pngChunkTypes(original)).toEqual(expect.arrayContaining(["gAMA", "cHRM"]));
    const stripped = stripColorMetadata(original);
    const types = pngChunkTypes(stripped);
    expect(types).not.toContain("gAMA");
    expect(types).not.toContain("cHRM");
    expect(types).not.toContain("sRGB");
    expect(Buffer.compare(PNG.sync.read(Buffer.from(original)).data, PNG.sync.read(Buffer.from(stripped)).data)).toBe(0);
  });

  it("returns a PNG without colour chunks unchanged", () => {
    const original = new Uint8Array(readFileSync(join(here, "..", "public", "samples", "P1_W1_C1.png")));
    expect(pngChunkTypes(original)).toEqual(["IHDR", "IDAT", "IEND"]);
    const stripped = stripColorMetadata(original);
    expect(Buffer.compare(Buffer.from(original), Buffer.from(stripped))).toBe(0);
  });

  it("drops a JPEG APP2 ICC_PROFILE segment and keeps the EXIF orientation segment", () => {
    const plain = read("edge/exif-rotated-orientation6.jpg");
    const tagged = withIccSegment(plain);
    expect(jpegMarkers(tagged)).toContain("APP2/ICC");
    const stripped = stripColorMetadata(tagged);
    expect(jpegMarkers(stripped)).not.toContain("APP2/ICC");
    expect(jpegMarkers(stripped)).toContain("APP1/Exif");
    expect(Buffer.compare(Buffer.from(plain), Buffer.from(stripped))).toBe(0);
  });

  it("passes non-PNG/JPEG bytes through untouched", () => {
    for (const rel of ["edge/cell.webp", "edge/cell.bmp", "edge/not-an-image.txt", "edge/empty.png", "edge/truncated.png"]) {
      const original = read(rel);
      const stripped = stripColorMetadata(original);
      if (rel === "edge/truncated.png") {
        // A damaged PNG must not make the stripper throw; whatever it returns still starts with the signature.
        expect(sniffFormat(stripped)).toBe("png");
      } else {
        expect(Buffer.compare(Buffer.from(original), Buffer.from(stripped))).toBe(0);
      }
    }
  });
});

describe("sniffFormat (D3: refuse by magic bytes, not by file extension)", () => {
  const cases: Record<string, string> = {
    "cells/P1_W1_C1.PNG": "png",
    "edge/cell-q95.jpg": "jpeg",
    "edge/cell.webp": "webp",
    "edge/cell.bmp": "bmp",
    "edge/cell.tiff": "tiff",
    "edge/renamed-text.png": "unknown",
    "edge/not-an-image.txt": "unknown",
    "edge/document.pdf": "pdf",
    "edge/empty.png": "empty",
    "edge/truncated.png": "png",
  };
  for (const [rel, want] of Object.entries(cases)) {
    it(`${rel} -> ${want}`, () => {
      expect(sniffFormat(read(rel))).toBe(want);
    });
  }
  it("recognises GIF and HEIC signatures", () => {
    expect(sniffFormat(new TextEncoder().encode("GIF89a...."))).toBe("gif");
    const heic = new Uint8Array(24);
    heic.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]); // ....ftypheic
    expect(sniffFormat(heic)).toBe("heic");
  });
});

describe("readDimensions (D2: megapixel check before decoding)", () => {
  const gt = JSON.parse(readFileSync(join(FIXTURES, "ground_truth.json"), "utf8")) as {
    images: Record<string, { width: number; height: number }>;
  };
  const entries = Object.entries(gt.images).filter(
    ([rel]) => /\.(png|jpe?g)$/i.test(rel) && existsSync(join(FIXTURES, rel)) && !rel.includes("exif-rotated"),
  );
  it(`reads width and height from the header of ${entries.length} PNG/JPEG fixtures`, () => {
    for (const [rel, ref] of entries) {
      expect(readDimensions(read(rel)), rel).toEqual({ width: ref.width, height: ref.height });
    }
  });
  it("reports the stored (pre-rotation) size for an EXIF-rotated JPEG and null for other formats", () => {
    // Python/browsers rotate it to 58 x 231; the JPEG header stores 231 x 58.
    expect(readDimensions(read("edge/exif-rotated-orientation6.jpg"))).toEqual({ width: 231, height: 58 });
    expect(readDimensions(read("edge/cell.webp"))).toBeNull();
    expect(readDimensions(read("edge/not-an-image.txt"))).toBeNull();
    expect(readDimensions(read("edge/empty.png"))).toBeNull();
  });
});
