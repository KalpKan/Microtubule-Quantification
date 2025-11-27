# Detailed Usage Guide

## Table of Contents
1. [Experimental Design](#experimental-design)
2. [Image Preparation](#image-preparation)
3. [Metadata Setup](#metadata-setup)
4. [Running the Analysis](#running-the-analysis)
5. [Interpreting Results](#interpreting-results)
6. [Quality Control](#quality-control)
7. [Common Issues](#common-issues)

## Experimental Design

### Recommended Setup

**Replicates:**
- Minimum 3 cells per condition (biological replicates)
- More replicates improve statistical power

**Controls:**
- **Untreated**: Baseline microtubule content
- **Vehicle control** (e.g., DMSO): Verify solvent has no effect
- **Positive control** (e.g., Taxol): Validate assay sensitivity

**Experimental conditions:**
- Dose-response: 6-8 concentrations spanning expected IC50
- Include concentrations showing minimal and maximal effects

### Image Acquisition

**Microscopy settings:**
- Use consistent exposure times across all images
- Avoid saturation (no pixels at maximum intensity)
- Ensure adequate signal-to-noise ratio
- Use same magnification for all images

**Staining:**
- Green channel: Anti-tubulin antibodies (microtubules)
- Blue channel: DAPI or Hoechst (nuclei)
- Ensure specific staining with minimal background

## Image Preparation

### 1. Cell Cropping

**Why crop?**
- Removes background and neighboring cells
- Normalizes for cell size differences
- Focuses analysis on single cells

**How to crop:**
1. Open image in ImageJ/Fiji or similar software
2. Use freehand selection tool to trace cell border
3. Crop to selection (Image → Crop)
4. Save as PNG or TIFF

**Tips:**
- Include entire cell but minimize background
- Be consistent with border definition
- Avoid including neighboring cells
- Keep original aspect ratio

### 2. File Naming

**Convention:**
```
PlateNumber_WellNumber_CellNumber.png
Example: P1_W1_C1.png, P2_W3_C2.png
```

**Best practices:**
- Use consistent naming scheme
- No spaces in filenames
- Include plate/well information for traceability
- Number cells sequentially (C1, C2, C3)

### 3. File Organization

```
Project/
├── cell_images/
│   ├── P1_W1_C1.png
│   ├── P1_W1_C2.png
│   ├── P1_W1_C3.png
│   └── ...
├── metadata.csv
└── Microtubule-Quantification/
    ├── microtubule_quantification.py
    └── ...
```

## Metadata Setup

### Creating metadata.csv

The metadata file links your images to experimental conditions.

**Required columns:**
- `image_name`: Filename without extension
- `condition`: Descriptive label
- `dose`: Numeric dose value
- `drug`: Drug name
- `include_in_curve`: "yes" or "no"

### Example: Dose-Response Experiment

```csv
image_name,condition,dose,drug,include_in_curve
P1_W1_C1,untreated,0,None,yes
P1_W1_C2,untreated,0,None,yes
P1_W1_C3,untreated,0,None,yes
P3_W4_C1,nocodazole_15uM,15,Nocodazole,yes
P3_W4_C2,nocodazole_15uM,15,Nocodazole,yes
P3_W4_C3,nocodazole_15uM,15,Nocodazole,yes
P3_W3_C1,nocodazole_20uM,20,Nocodazole,yes
P3_W3_C2,nocodazole_20uM,20,Nocodazole,yes
P3_W3_C3,nocodazole_20uM,20,Nocodazole,yes
P1_W2_C1,DMSO_control,0,DMSO,no
P1_W2_C2,DMSO_control,0,DMSO,no
P1_W2_C3,DMSO_control,0,DMSO,no
P1_W3_C1,taxol_control,0,Taxol,no
P1_W3_C2,taxol_control,0,Taxol,no
P1_W3_C3,taxol_control,0,Taxol,no
```

**Key points:**
- `dose` must be numeric (use 0 for controls)
- `include_in_curve="yes"` for dose-response samples
- `include_in_curve="no"` for controls you want measured but not plotted
- `image_name` must match filenames exactly (case-sensitive)

### Verifying Filenames

Use the helper script to see detected filenames:

```bash
python show_filenames.py
```

Copy the output to your metadata.csv `image_name` column.

## Running the Analysis

### Method 1: Wrapper Script (Recommended)

1. **Edit run_analysis.py:**
```python
INPUT_DIR = "/path/to/your/cell_images"
OUTPUT_DIR = "/path/to/output"
METADATA_FILE = "metadata.csv"
```

2. **Run:**
```bash
python run_analysis.py
```

### Method 2: Command Line

```bash
python microtubule_quantification.py \
  --input /path/to/cell_images \
  --output /path/to/results \
  --metadata metadata.csv
```

### Method 3: Test Single Cell First

```bash
python test_single_cell.py /path/to/cell_image.png
```

Review the output to verify detection is working correctly before batch processing.

## Interpreting Results

### quantification_results.csv

Contains all measurements:

| Column | Description |
|--------|-------------|
| image_name | Cell identifier |
| green_percentage | % of cell that is microtubules |
| threshold_value | Threshold used for detection |
| total_pixels | Total pixels in cell |
| green_pixels | Pixels counted as microtubules |
| condition | Experimental condition |
| dose | Drug concentration |
| drug | Drug name |
| include_in_curve | Whether included in dose-response |

### Dose-Response Curve

**X-axis**: Drug concentration (µM)
**Y-axis**: Microtubule content (% green pixels)

**Interpretation:**
- **Downward trend**: Drug destabilizes microtubules (e.g., nocodazole)
- **Upward trend**: Drug stabilizes microtubules (e.g., taxol)
- **No trend**: Drug has no effect on microtubules

**Statistical elements:**
- **Individual points** (light blue): Each cell measurement
- **Line with error bars** (dark blue): Mean ± SEM for each dose
- **Error bars**: Standard Error of Mean (SEM = SD / √n)

### Quality Metrics

**Good results:**
- Low variability within replicates (small error bars)
- Clear dose-dependent trend
- Controls behave as expected
- Masks accurately capture microtubules

**Red flags:**
- High variability (large error bars)
- Unexpected control values
- Masks missing obvious microtubules
- Masks including non-microtubule regions

## Quality Control

### 1. Visual Inspection of Masks

**Check each cell's mask:**
- White pixels = counted as microtubules
- Black pixels = not counted

**Look for:**
- ✅ Microtubule networks clearly outlined
- ✅ Nucleus properly excluded
- ✅ Background not included
- ❌ Missing obvious microtubules
- ❌ Including non-specific signal

### 2. Overlay Verification

Green overlay shows detected microtubules on original image.

**Verify:**
- Overlay matches visible microtubules
- No false positives (green where there are no microtubules)
- No false negatives (missing visible microtubules)

### 3. Statistical Checks

**Within-condition variability:**
- Calculate coefficient of variation: CV = (SD / Mean) × 100%
- CV < 30% is generally acceptable
- High CV suggests inconsistent staining or imaging

**Control validation:**
- Vehicle control ≈ untreated
- Positive control shows expected effect
- Negative control shows opposite effect

### 4. Biological Validation

**Expected results:**
- **Nocodazole**: Decreases microtubules (dose-dependent)
- **Taxol**: Increases/stabilizes microtubules
- **Colchicine**: Decreases microtubules
- **Vinblastine**: Decreases microtubules

## Common Issues

### Issue: Empty dose-response plots

**Cause**: Metadata not merged with results

**Solution:**
1. Check `image_name` in metadata.csv matches filenames exactly
2. Delete old `quantification_results.csv`
3. Re-run analysis

### Issue: Masks include too much background

**Cause**: Threshold too low

**Solution:**
Adjust thresholding in `microtubule_quantification.py`:
```python
# Try triangle method instead of Otsu
final_mask = triangle_mask
final_thresh = triangle_thresh
```

### Issue: Masks miss dim microtubules

**Cause**: Threshold too high

**Solution:**
1. Check image quality (adequate signal-to-noise?)
2. Use consistent exposure times
3. Consider manual threshold adjustment

### Issue: Nucleus not excluded

**Cause**: Blue channel too dim or absent

**Solution:**
1. Verify blue channel exists in image
2. Check nuclear staining quality
3. Adjust nucleus detection threshold

### Issue: High variability between replicates

**Possible causes:**
- Inconsistent staining
- Different cell cycle stages
- Imaging artifacts
- Cell-to-cell biological variation

**Solutions:**
- Increase replicate number (n=5-10)
- Standardize staining protocol
- Use consistent imaging settings
- Consider cell synchronization

### Issue: No dose-response trend

**Possible causes:**
- Dose range too narrow
- Drug not effective
- Insufficient incubation time
- Drug degradation

**Solutions:**
- Expand dose range (10-fold dilutions)
- Verify drug activity (positive control)
- Optimize incubation time
- Prepare fresh drug solutions

## Advanced Usage

### Batch Processing Multiple Experiments

```bash
# Process experiment 1
python microtubule_quantification.py \
  --input ./exp1/images \
  --output ./exp1/results \
  --metadata ./exp1/metadata.csv

# Process experiment 2
python microtubule_quantification.py \
  --input ./exp2/images \
  --output ./exp2/results \
  --metadata ./exp2/metadata.csv
```

### Regenerating Plots Only

If you want to regenerate plots without reprocessing images:

```bash
python microtubule_quantification.py \
  --plot-only \
  --results ./results/quantification_results.csv \
  --output ./results
```

### Custom Dose Column Name

If your metadata uses a different column name:

```bash
python microtubule_quantification.py \
  --input ./images \
  --output ./results \
  --metadata metadata.csv \
  --dose-column concentration
```

## Tips for Publication-Quality Results

1. **Consistent imaging**: Use identical settings for all images
2. **Adequate replicates**: n≥3 per condition, n≥5 preferred
3. **Include controls**: Untreated, vehicle, and positive control
4. **Document everything**: Save imaging parameters, staining protocols
5. **Statistical analysis**: Report mean ± SEM, perform appropriate tests
6. **Show raw data**: Include individual data points on plots
7. **Verify visually**: Include example masks in supplementary materials

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Documentation**: Check README.md for overview
- **Test script**: Use `test_single_cell.py` to troubleshoot
- **Helper scripts**: Use `show_filenames.py` to verify file detection
