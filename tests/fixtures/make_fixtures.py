#!/usr/bin/env python3
"""
Build the labelled test corpus for the microtubule quantifier and its ground truth.

Ground truth for every image is the repository's own Python pipeline
(MicrotubuleQuantifier, the steps process_image actually executes), run on the
file exactly as it is on disk with cv2.imread (IMREAD_COLOR: alpha dropped,
16-bit reduced to 8-bit, EXIF orientation applied). The browser must reproduce
`percent` within 1 percentage point on every entry (docs/reports/microtubules-spec.md).

Layout (all under tests/fixtures/):
  cells/      the 36 original cropped cells (RGBA .PNG, as cropped in ImageJ);
              copied from the Desktop folder when it is present, otherwise left as is
  fullfield/  whole-well microscope images (merged green+blue), 500-1400 px a side
  edge/       generated edge cases: wrong file types, tiny, grayscale, 16-bit,
              alpha, JPEG re-encode, EXIF-rotated JPEG, solid colours, and a
              12-megapixel image (24 MP is written to edge/generated-large/, git-ignored)
  ground_truth.json   one entry per image: python percent, threshold, pixel counts,
              size, sha256, and the expected outcome for non-images

Usage (from the repo root):
    .venv/bin/python tests/fixtures/make_fixtures.py            # rebuild everything
    .venv/bin/python tests/fixtures/make_fixtures.py --check    # recompute and compare with ground_truth.json
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from microtubule_quantification import MicrotubuleQuantifier  # noqa: E402

FIX = ROOT / "tests" / "fixtures"
CELLS = FIX / "cells"
FULL = FIX / "fullfield"
EDGE = FIX / "edge"
LARGE = EDGE / "generated-large"  # git-ignored (files > 5 MB)
GT = FIX / "ground_truth.json"

DESKTOP = Path.home() / "Desktop" / "Out and About" / "Sidequest" / "Microtubule Quantification"
DESKTOP_CELLS = DESKTOP / "Organized Cropped Cells"
DESKTOP_FULL = DESKTOP / "Overlayed Images"
DESKTOP_JPEG = DESKTOP / "20251118_TuesAM_Group4"

# Whole-well images chosen as the "new images" the browser has never seen:
# three merged PNGs (different plates and doses) and one JPEG straight off the microscope camera.
FULLFIELD_SOURCES = {
    "Plate1_W1_untreated.png": DESKTOP_FULL / "Plate1_W1.png",
    "Plate2_45_nocodazole45uM.png": DESKTOP_FULL / "Plate2_45.png",
    "Plate3_W2_New_nocodazole25uM.png": DESKTOP_FULL / "Plate3_W2_New.png",
    "Plate1_W1_green_channel_camera.jpeg": DESKTOP_JPEG / "Plate 1 1 G.jpeg",
}

Q = MicrotubuleQuantifier()


def measure(img: np.ndarray) -> dict:
    """The executed path of MicrotubuleQuantifier.process_image, without the figures."""
    green = Q.extract_green_channel(img)
    nucleus = Q.create_nucleus_mask(img)
    mask, thresh = Q.threshold_microtubules(green)
    mask[nucleus > 0] = 0
    final = Q.clean_mask(mask)
    return {
        "percent": Q.quantify_green_percentage(final),
        "threshold": int(thresh),
        "green_pixels": int(np.count_nonzero(final)),
        "total_pixels": int(final.size),
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_sources():
    CELLS.mkdir(parents=True, exist_ok=True)
    FULL.mkdir(parents=True, exist_ok=True)
    if DESKTOP_CELLS.is_dir():
        for p in sorted(DESKTOP_CELLS.glob("*.PNG")):
            shutil.copyfile(p, CELLS / p.name)
        print(f"copied {len(list(CELLS.glob('*.PNG')))} cells from {DESKTOP_CELLS}")
    else:
        print(f"(Desktop cells folder not found; keeping {len(list(CELLS.glob('*.PNG')))} committed cells)")
    for name, src in FULLFIELD_SOURCES.items():
        if src.is_file():
            shutil.copyfile(src, FULL / name)
    print(f"fullfield: {sorted(p.name for p in FULL.iterdir())}")


def make_edge_cases():
    EDGE.mkdir(parents=True, exist_ok=True)
    LARGE.mkdir(parents=True, exist_ok=True)
    cell = cv2.imread(str(CELLS / "P1_W1_C1.PNG"), cv2.IMREAD_UNCHANGED)  # RGBA, 77x58
    bgr = cell[:, :, :3]

    # Wrong file types: must be refused with a clear message, never a crash or a number.
    (EDGE / "not-an-image.txt").write_text("This is a text file, not an image.\n")
    (EDGE / "renamed-text.png").write_text("PNG in name only; the bytes are text.\n")
    (EDGE / "truncated.png").write_bytes((CELLS / "P1_W1_C1.PNG").read_bytes()[:600])
    (EDGE / "document.pdf").write_bytes(b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
    (EDGE / "empty.png").write_bytes(b"")
    # TIFF: valid image, but Chrome and Firefox cannot decode it (Safari can). The page
    # must say so instead of failing silently.
    cv2.imwrite(str(EDGE / "cell.tiff"), bgr)

    # Same cell, other encodings the browser CAN decode. Python truth is computed on
    # each file as written, so the JPEG entries already include JPEG loss.
    cv2.imwrite(str(EDGE / "cell-rgb.png"), bgr)
    cv2.imwrite(str(EDGE / "cell-rgba-transparent-border.png"), cell)
    cv2.imwrite(str(EDGE / "cell-q95.jpg"), bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(str(EDGE / "cell-q60.jpg"), bgr, [cv2.IMWRITE_JPEG_QUALITY, 60])
    cv2.imwrite(str(EDGE / "cell.webp"), bgr, [cv2.IMWRITE_WEBP_QUALITY, 101])  # 101 = lossless
    cv2.imwrite(str(EDGE / "cell.bmp"), bgr)
    cv2.imwrite(str(EDGE / "cell-16bit.png"), (bgr.astype(np.uint16) * 257))
    cv2.imwrite(str(EDGE / "cell-grayscale.png"), cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
    # 1-bit-ish palette PNG (indexed colour) via quantisation to 16 colours
    small = (bgr // 16) * 16
    cv2.imwrite(str(EDGE / "cell-posterized.png"), small)

    # Sizes
    cv2.imwrite(str(EDGE / "one-pixel.png"), np.array([[[0, 200, 0]]], np.uint8))
    cv2.imwrite(str(EDGE / "tiny-4x4.png"), cv2.resize(bgr, (4, 4), interpolation=cv2.INTER_NEAREST))
    cv2.imwrite(str(EDGE / "all-black.png"), np.zeros((64, 64, 3), np.uint8))
    cv2.imwrite(str(EDGE / "all-green.png"), np.full((64, 64, 3), (0, 255, 0), np.uint8))
    cv2.imwrite(str(EDGE / "all-blue-nucleus-only.png"), np.full((64, 64, 3), (255, 0, 0), np.uint8))
    # Wide and tall aspect ratios (layout on a phone)
    cv2.imwrite(str(EDGE / "wide-2000x100.png"), np.tile(bgr, (2, 26, 1))[:100, :2000])
    cv2.imwrite(str(EDGE / "tall-100x2000.png"), np.tile(bgr, (35, 2, 1))[:2000, :100])
    # 12 MP (4000 x 3000) tiled cell mosaic: compresses well, stays well under 5 MB
    mosaic = np.tile(bgr, (3000 // 58 + 1, 4000 // 77 + 1, 1))[:3000, :4000]
    cv2.imwrite(str(EDGE / "huge-12mp-4000x3000.png"), mosaic, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    cv2.imwrite(str(EDGE / "huge-12mp-4000x3000.jpg"), mosaic, [cv2.IMWRITE_JPEG_QUALITY, 85])
    # 24 MP (6000 x 4000), what a phone camera produces; git-ignored, regenerated on demand
    big = np.tile(bgr, (4000 // 58 + 1, 6000 // 77 + 1, 1))[:4000, :6000]
    cv2.imwrite(str(LARGE / "huge-24mp-6000x4000.jpg"), big, [cv2.IMWRITE_JPEG_QUALITY, 90])
    del big

    # EXIF-rotated JPEG: a wide cell tagged Orientation=6 (rotate 90 CW). cv2.imread applies
    # EXIF orientation, so Python truth is on the rotated image; the browser must do the same.
    wide = np.tile(bgr, (1, 3, 1))  # 231 x 58
    ok, buf = cv2.imencode(".jpg", wide, [cv2.IMWRITE_JPEG_QUALITY, 95])
    assert ok
    (EDGE / "exif-rotated-orientation6.jpg").write_bytes(_add_exif_orientation(buf.tobytes(), 6))


def _add_exif_orientation(jpeg: bytes, orientation: int) -> bytes:
    """Insert a minimal APP1 Exif segment with only the Orientation tag."""
    assert jpeg[:2] == b"\xff\xd8"
    tiff = b"II*\x00" + (8).to_bytes(4, "little")  # little-endian, IFD0 at offset 8
    ifd = (1).to_bytes(2, "little")
    ifd += (0x0112).to_bytes(2, "little") + (3).to_bytes(2, "little") + (1).to_bytes(4, "little")
    ifd += orientation.to_bytes(2, "little") + b"\x00\x00"
    ifd += (0).to_bytes(4, "little")  # next IFD
    payload = b"Exif\x00\x00" + tiff + ifd
    app1 = b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
    return jpeg[:2] + app1 + jpeg[2:]


NON_IMAGES = {
    "not-an-image.txt": "refused: not an image (plain text)",
    "renamed-text.png": "refused: .png extension but not image bytes",
    "truncated.png": "refused: corrupt/truncated PNG",
    "document.pdf": "refused: PDF is not an image",
    "empty.png": "refused: empty file",
    "cell.tiff": "refused in Chrome/Firefox (no TIFF decoder): message must name the supported types; Safari may decode it and then must match python",
}


def build_ground_truth() -> dict:
    gt = {"_about": (
        "percent/threshold/counts come from microtubule_quantification.MicrotubuleQuantifier "
        "(the steps process_image executes) on the file as cv2.imread loads it. Browser must be within 1 "
        "percentage point of percent for every image entry; JPEG/WebP-lossy entries allow decoder "
        "differences inside that same 1 point. Non-image entries record the expected refusal."
    ), "images": {}, "non_images": {}}
    for folder in (CELLS, FULL, EDGE, LARGE):
        for p in sorted(folder.iterdir()):
            if p.is_dir() or p.name.startswith("."):
                continue
            rel = str(p.relative_to(FIX))
            if p.name in NON_IMAGES:
                gt["non_images"][rel] = {"expect": NON_IMAGES[p.name], "bytes": p.stat().st_size, "sha256": sha256(p)}
                continue
            img = cv2.imread(str(p))  # IMREAD_COLOR, exactly what the pipeline does
            if img is None:
                gt["non_images"][rel] = {"expect": "cv2 cannot decode it either", "bytes": p.stat().st_size, "sha256": sha256(p)}
                continue
            entry = measure(img)
            entry["bytes"] = p.stat().st_size
            entry["sha256"] = sha256(p)
            entry["committed"] = folder is not LARGE
            gt["images"][rel] = entry
    return gt


def main(argv):
    if "--check" in argv:
        current = build_ground_truth()
        saved = json.loads(GT.read_text())
        bad = 0
        for rel, e in current["images"].items():
            s = saved["images"].get(rel)
            if s is None:
                print(f"NEW   {rel}: {e['percent']:.4f}%")
                continue
            d = abs(s["percent"] - e["percent"])
            flag = "ok" if d < 1e-9 and s["sha256"] == e["sha256"] else "DIFF"
            bad += flag == "DIFF"
            print(f"{flag:4} {rel}: saved {s['percent']:.4f}% now {e['percent']:.4f}%")
        print("all match" if not bad else f"{bad} differences")
        return 1 if bad else 0
    copy_sources()
    make_edge_cases()
    gt = build_ground_truth()
    GT.write_text(json.dumps(gt, indent=2) + "\n")
    print(f"wrote {GT.relative_to(ROOT)}: {len(gt['images'])} images, {len(gt['non_images'])} non-images")
    for rel, e in gt["images"].items():
        print(f"  {rel}: {e['percent']:.4f}% (t={e['threshold']}, {e['width']}x{e['height']}, {e['bytes']} B)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
