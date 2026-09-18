#!/usr/bin/env python3
"""
Recover the original cropped cell images from the Results/*_analysis.png figures.

The raw crops are not in the repository, but the "1. Original Image" panel of each
analysis figure is a nearest-neighbour upscale of the original (matplotlib uses
'nearest' when upsampling by more than 3x), so sampling the centre of every block
gives the original pixels back exactly. Each recovered image is checked against
Results/<name>_overlay.png outside the microtubule mask, where the overlay is the
untouched original.

Usage (from the repo root):
    .venv/bin/python web/scripts/extract_samples.py [name ...]
Writes web/public/samples/<name>.png
"""
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "Results"
OUT = ROOT / "web" / "public" / "samples"
DEFAULT_SAMPLES = ["P1_W1_C1", "P3_W2_C3", "P1_W3_C1"]


def find_panel(fig: np.ndarray, orig_w: int, orig_h: int):
    """Return (y0, y1, x0, x1) of the top-left image panel in the figure."""
    h, w = fig.shape[:2]
    # Walk a row through the middle of the top panel row: the first run of
    # non-white columns is panel 1 (panels are separated by white gutters).
    row = np.any(fig[int(h * 0.3)] < 250, axis=1)
    cols = np.where(row)[0]
    x0 = int(cols[0])
    x1 = x0
    while x1 + 1 < w and row[x1 + 1]:
        x1 += 1
    # Bottom edge: last non-white row within the panel's columns, above the second row of panels.
    col_block = np.any(fig[int(h * 0.09):int(h * 0.5), x0:x1 + 1] < 250, axis=(1, 2))
    y1 = int(np.where(col_block)[0].max()) + int(h * 0.09)
    panel_w = x1 - x0 + 1
    panel_h = int(round(orig_h * panel_w / orig_w))
    y0 = y1 - panel_h + 1
    return y0, y1, x0, x1


def recover(name: str) -> np.ndarray:
    fig = cv2.imread(str(RESULTS / f"{name}_analysis.png"))
    overlay = cv2.imread(str(RESULTS / f"{name}_overlay.png"))
    mask = cv2.imread(str(RESULTS / f"{name}_mask.png"), cv2.IMREAD_GRAYSCALE)
    if fig is None or overlay is None or mask is None:
        raise SystemExit(f"missing Results files for {name}")
    orig_h, orig_w = overlay.shape[:2]
    y0, y1, x0, x1 = find_panel(fig, orig_w, orig_h)
    panel = fig[y0:y1 + 1, x0:x1 + 1]
    sx = panel.shape[1] / orig_w
    sy = panel.shape[0] / orig_h
    rec = np.zeros((orig_h, orig_w, 3), np.uint8)
    max_var = 0
    for j in range(orig_h):
        for i in range(orig_w):
            blk = panel[int(j * sy) + 4:int((j + 1) * sy) - 4, int(i * sx) + 4:int((i + 1) * sx) - 4]
            max_var = max(max_var, int((blk.max(axis=(0, 1)) - blk.min(axis=(0, 1))).max()))
            rec[j, i] = panel[int((j + 0.5) * sy), int((i + 0.5) * sx)]
    diff = np.abs(rec.astype(int) - overlay.astype(int))[mask == 0]
    print(f"{name}: panel {panel.shape[1]}x{panel.shape[0]} -> {orig_w}x{orig_h}, "
          f"scale {sx:.2f}, intra-block variation {max_var}, "
          f"max diff vs overlay outside mask {int(diff.max())} over {diff.size} px")
    if max_var != 0:
        raise SystemExit(f"{name}: panel is not a clean nearest-neighbour upscale")
    if diff.max() != 0:
        raise SystemExit(f"{name}: recovered pixels differ from the overlay outside the mask")
    print(f"{name}: OK")
    return rec


def main(argv):
    names = argv or DEFAULT_SAMPLES
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        img = recover(name)
        out = OUT / f"{name}.png"
        cv2.imwrite(str(out), img)
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
