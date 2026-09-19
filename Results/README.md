# Results

Outputs of `run_analysis.py` on the 36 cropped cells (`quantification_results.csv`, one `<name>_mask.png`, `<name>_overlay.png` and `<name>_analysis.png` per cell, plus the dose-response figures).

Note on three rows: `P3_W1_C2`, `P3_W1_C3` and `P3_W3_C3` were re-cropped (27 Nov 2025) after this CSV was produced (26 Nov 2025), so the committed crops in `tests/fixtures/cells/` give 18.5544 / 5.3544 / 24.7249 % rather than the CSV values. The other 33 rows are reproduced exactly by both the Python pipeline and the browser version (`tests/fixtures/ground_truth.json`).
