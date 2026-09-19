/**
 * Byte-level helpers that run before an image is decoded. Pure functions over
 * Uint8Array so they are testable in Node and usable in the Web Worker.
 *
 * Why they exist: Python's cv2.imread ignores colour management entirely, but
 * Safari converts the pixels of an ICC-tagged PNG/JPEG to sRGB even when
 * createImageBitmap is asked for colorSpaceConversion: "none". Kalp's Mac-exported
 * whole-well PNGs carry an iCCP chunk (kCGColorSpaceGenericRGB), and in Safari they
 * gave a different Otsu threshold and up to +0.97 points. Dropping the colour
 * metadata before decoding makes every browser read the stored pixel values.
 */

export type ImageFormat = "png" | "jpeg" | "webp" | "bmp" | "gif" | "tiff" | "heic" | "pdf" | "empty" | "unknown";

/** Formats every supported browser decodes. TIFF/HEIC are deliberately not here. */
export const SUPPORTED_FORMATS: ReadonlySet<ImageFormat> = new Set(["png", "jpeg", "webp", "bmp", "gif"]);
export const SUPPORTED_FORMATS_TEXT = "PNG, JPEG, WebP, BMP and GIF";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG chunks that describe colour instead of pixels. Every one is optional per the PNG spec. */
const PNG_COLOUR_CHUNKS = new Set(["iCCP", "gAMA", "cHRM", "sRGB", "cICP", "mDCV", "mDCv", "cLLI", "cLLi"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = "";
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Identify a file by its magic bytes (the extension and MIME type are not trusted). */
export function sniffFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length === 0) return "empty";
  if (isPng(bytes)) return "png";
  if (isJpeg(bytes)) return "jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === "BM") return "bmp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return "gif";
  if (bytes.length >= 4 && (ascii(bytes, 0, 4) === "II*\0" || ascii(bytes, 0, 4) === "MM\0*")) return "tiff";
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|heif)/.test(ascii(bytes, 8, 4))) {
    return "heic";
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "pdf";
  return "unknown";
}

/** Walk a PNG's chunks; stops quietly at the first malformed one. */
function* pngChunks(bytes: Uint8Array): Generator<{ type: string; start: number; end: number }> {
  let i = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + length;
    if (end > bytes.length) return;
    yield { type, start: i, end };
    i = end;
    if (type === "IEND") return;
  }
}

/** The chunk types of a PNG in file order (test helper, also used to decide whether to rewrite). */
export function pngChunkTypes(bytes: Uint8Array): string[] {
  if (!isPng(bytes)) return [];
  return [...pngChunks(bytes)].map((c) => c.type);
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const chunks = [...pngChunks(bytes)];
  if (!chunks.some((c) => PNG_COLOUR_CHUNKS.has(c.type))) return bytes;
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let total = 8;
  for (const c of chunks) {
    if (PNG_COLOUR_CHUNKS.has(c.type)) continue;
    parts.push(bytes.subarray(c.start, c.end));
    total += c.end - c.start;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Walk JPEG marker segments up to SOS; stops quietly at the first malformed one. */
function* jpegSegments(bytes: Uint8Array): Generator<{ marker: number; start: number; end: number }> {
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      yield { marker, start: i, end: i + 2 };
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) return;
    yield { marker, start: i, end };
    if (marker === 0xda) return; // start of scan: entropy-coded data follows
    i = end;
  }
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const icc = [...jpegSegments(bytes)].filter((s) => s.marker === 0xe2 && ascii(bytes, s.start + 4, 11) === "ICC_PROFILE");
  if (icc.length === 0) return bytes;
  const out = new Uint8Array(bytes.length - icc.reduce((n, s) => n + (s.end - s.start), 0));
  let offset = 0;
  let cursor = 0;
  for (const s of icc) {
    out.set(bytes.subarray(cursor, s.start), offset);
    offset += s.start - cursor;
    cursor = s.end;
  }
  out.set(bytes.subarray(cursor), offset);
  return out;
}

/**
 * Remove colour-management metadata (PNG iCCP/gAMA/cHRM/sRGB/cICP..., JPEG APP2
 * ICC_PROFILE) so the browser decodes the stored sample values, like cv2.imread.
 * Other formats and malformed files come back unchanged. EXIF is kept: Python
 * applies the orientation tag and so must the browser.
 */
export function stripColorMetadata(bytes: Uint8Array): Uint8Array {
  if (isPng(bytes)) return stripPng(bytes);
  if (isJpeg(bytes)) return stripJpeg(bytes);
  return bytes;
}

/**
 * Width and height from the file header, without decoding, for PNG and JPEG
 * (the formats phones and microscopes produce). Null when unknown; the caller
 * then decodes first and checks the size afterwards. For an EXIF-rotated JPEG
 * this is the stored size; the megapixel count is the same either way.
 */
export function readDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (isPng(bytes)) {
    for (const c of pngChunks(bytes)) {
      if (c.type !== "IHDR") return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(c.start + 8), height: view.getUint32(c.start + 12) };
    }
    return null;
  }
  if (isJpeg(bytes)) {
    for (const s of jpegSegments(bytes)) {
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
      if (s.marker >= 0xc0 && s.marker <= 0xcf && s.marker !== 0xc4 && s.marker !== 0xc8 && s.marker !== 0xcc) {
        if (s.end - s.start < 9) return null;
        const height = (bytes[s.start + 5] << 8) | bytes[s.start + 6];
        const width = (bytes[s.start + 7] << 8) | bytes[s.start + 8];
        return { width, height };
      }
    }
  }
  return null;
}
