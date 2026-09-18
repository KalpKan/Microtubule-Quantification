#!/usr/bin/env python3
"""
Run the repository's Python pipeline (MicrotubuleQuantifier, exactly the steps that
process_image executes) on the sample cells in web/public/samples and write the
reference numbers the browser port must reproduce to web/tests/expected.json.

Also checks each percentage against Results/quantification_results.csv, which proves
the recovered samples are the original crops.

Usage (from the repo root):
    .venv/bin/python web/scripts/reference.py
"""
import csv
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from microtubule_quantification import MicrotubuleQuantifier  # noqa: E402

SAMPLES = ROOT / "web" / "public" / "samples"
EXPECTED = ROOT / "web" / "tests" / "expected.json"
CSV = ROOT / "Results" / "quantification_results.csv"


def run(q: MicrotubuleQuantifier, path: Path) -> dict:
    """The executed path of MicrotubuleQuantifier.process_image, without the figures."""
    image = cv2.imread(str(path))
    green = q.extract_green_channel(image)
    nucleus = q.create_nucleus_mask(image)
    mask, thresh = q.threshold_microtubules(green)
    mask[nucleus > 0] = 0
    final = q.clean_mask(mask)
    return {
        "percent": q.quantify_green_percentage(final),
        "threshold": int(thresh),
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
        "green_pixels": int(np.count_nonzero(final)),
        "total_pixels": int(final.size),
    }


def main():
    published = {}
    with open(CSV) as f:
        for row in csv.DictReader(f):
            published[row["image_name"]] = float(row["green_percentage"])
    q = MicrotubuleQuantifier()
    out = {}
    for path in sorted(SAMPLES.glob("*.png")):
        r = run(q, path)
        name = path.stem
        out[name] = r
        pub = published.get(name)
        status = "matches Results CSV" if pub is not None and abs(pub - r["percent"]) < 1e-6 else f"CSV says {pub}"
        print(f"{name}: {r['percent']:.4f}% (threshold {r['threshold']}, "
              f"{r['green_pixels']}/{r['total_pixels']} px, {r['width']}x{r['height']}) - {status}")
        if pub is not None and abs(pub - r["percent"]) >= 1e-6:
            raise SystemExit(f"{name}: does not reproduce the published number")
    EXPECTED.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {EXPECTED.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
