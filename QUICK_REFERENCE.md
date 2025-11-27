# Quick Reference Card

## Installation
```bash
git clone https://github.com/KalpKan/Microtubule-Quantification.git
cd Microtubule-Quantification
pip install -r requirements.txt
```

## Quick Start

### Test Single Cell
```bash
python test_single_cell.py path/to/cell.png
```

### Run Full Analysis
```bash
python run_analysis.py
```

### Command Line
```bash
python microtubule_quantification.py \
  --input /path/to/images \
  --output /path/to/results \
  --metadata metadata.csv
```

## Metadata Format
```csv
image_name,condition,dose,drug,include_in_curve
P1_W1_C1,untreated,0,None,yes
P3_W4_C1,nocodazole_15uM,15,Nocodazole,yes
P1_W2_C1,DMSO_control,0,DMSO,no
```

## Output Files

| File | Description |
|------|-------------|
| `*_mask.png` | Binary mask (white = microtubules) |
| `*_overlay.png` | Original + green overlay |
| `*_analysis.png` | Full processing steps |
| `quantification_results.csv` | All measurements |
| `dose_response_curve.png` | Dose-response plot |
| `dose_response_barplot.png` | Bar chart |

## Common Commands

### Check Filenames
```bash
python show_filenames.py
```

### Regenerate Plots Only
```bash
python microtubule_quantification.py \
  --plot-only \
  --results results/quantification_results.csv \
  --output results/
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Empty plots | Check image_name matches filenames |
| Masks incorrect | Run test_single_cell.py first |
| Images not found | Verify file extensions (PNG vs png) |
| High variability | Increase replicates (n≥5) |

## Key Parameters

### In microtubule_quantification.py:
```python
MicrotubuleQuantifier(
    gaussian_blur_size=5,        # Smoothing
    morphology_kernel_size=3     # Noise removal
)
```

## Interpretation

### Microtubule Content
- **High %**: More microtubules (stabilized)
- **Low %**: Fewer microtubules (destabilized)

### Expected Results
- **Nocodazole**: Decreases microtubules ↓
- **Taxol**: Increases microtubules ↑
- **DMSO**: No effect (≈ untreated)

## Quality Checks

✅ **Good Results:**
- Small error bars (CV < 30%)
- Clear dose-response trend
- Controls behave as expected
- Masks match visual inspection

❌ **Red Flags:**
- Large error bars
- No dose-response trend
- Unexpected control values
- Masks miss obvious structures

## File Structure
```
Project/
├── cell_images/          # Your cropped cells
├── metadata.csv          # Experimental conditions
├── Results/              # Output folder
│   ├── *_mask.png
│   ├── *_overlay.png
│   ├── *_analysis.png
│   ├── quantification_results.csv
│   ├── dose_response_curve.png
│   └── dose_response_barplot.png
└── Microtubule-Quantification/
    ├── microtubule_quantification.py
    ├── test_single_cell.py
    ├── run_analysis.py
    └── ...
```

## Statistical Notes

- **n = 3** minimum per condition
- **Error bars** = SEM (Standard Error of Mean)
- **SEM** = SD / √n
- **CV** = (SD / Mean) × 100%

## Citation
```
Microtubule Quantification Tool
GitHub: https://github.com/KalpKan/Microtubule-Quantification
```

## Help & Documentation

- **Overview**: README.md
- **Detailed Guide**: USAGE_GUIDE.md
- **Changes**: CHANGELOG.md
- **Issues**: GitHub Issues page

## Contact
GitHub: https://github.com/KalpKan/Microtubule-Quantification
