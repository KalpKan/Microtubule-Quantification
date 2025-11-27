# Getting Started Guide

This guide will walk you through your first analysis in 5 simple steps.

## Step 1: Install the Tool

```bash
# Clone the repository
git clone https://github.com/KalpKan/Microtubule-Quantification.git
cd Microtubule-Quantification

# Install required packages
pip install -r requirements.txt
```

**Requirements:**
- Python 3.7 or higher
- pip (Python package installer)

## Step 2: Prepare Your Images

### Image Requirements
- **Format**: PNG, JPG, or TIFF
- **Content**: Fluorescent microscopy images
  - Green channel: Microtubules (anti-tubulin antibodies)
  - Blue channel: Nuclei (DAPI or Hoechst)
- **Cropping**: One cell per image, cropped along cell border

### How to Crop
1. Open your microscopy image in ImageJ/Fiji
2. Use the freehand selection tool to trace the cell border
3. Go to Image → Crop
4. Save as PNG

### File Naming
Use a consistent naming scheme:
```
P1_W1_C1.png  (Plate 1, Well 1, Cell 1)
P1_W1_C2.png  (Plate 1, Well 1, Cell 2)
P2_W3_C1.png  (Plate 2, Well 3, Cell 1)
```

### Organize Files
```
Your_Project/
├── cell_images/
│   ├── P1_W1_C1.png
│   ├── P1_W1_C2.png
│   └── ...
└── Microtubule-Quantification/
    └── (this repository)
```

## Step 3: Test on One Cell

Before processing all images, test on a single cell:

```bash
python test_single_cell.py /path/to/your_cell_images/P1_W1_C1.png
```

**What to check:**
1. Does the mask (white pixels) match the visible microtubules?
2. Is the nucleus (blue) properly excluded?
3. Is the percentage reasonable?

If something looks wrong, see [Troubleshooting](#troubleshooting) below.

## Step 4: Create Metadata File

Create a file called `metadata.csv` in the repository folder:

```csv
image_name,condition,dose,drug,include_in_curve
P1_W1_C1,untreated,0,None,yes
P1_W1_C2,untreated,0,None,yes
P1_W1_C3,untreated,0,None,yes
P3_W4_C1,nocodazole_15uM,15,Nocodazole,yes
P3_W4_C2,nocodazole_15uM,15,Nocodazole,yes
P3_W4_C3,nocodazole_15uM,15,Nocodazole,yes
P1_W2_C1,DMSO_control,0,DMSO,no
P1_W2_C2,DMSO_control,0,DMSO,no
P1_W2_C3,DMSO_control,0,DMSO,no
```

**Important:**
- `image_name` must match your filenames exactly (without .png extension)
- `dose` must be numeric (use 0 for controls)
- `include_in_curve`: "yes" for dose-response samples, "no" for controls

## Step 5: Run the Analysis

### Option A: Using the Wrapper Script (Easiest)

1. Open `run_analysis.py` in a text editor
2. Update these lines with your paths:
```python
INPUT_DIR = "/path/to/your_cell_images"
OUTPUT_DIR = "/path/to/output_folder"
METADATA_FILE = "metadata.csv"
```

3. Run:
```bash
python run_analysis.py
```

### Option B: Command Line

```bash
python microtubule_quantification.py \
  --input /path/to/your_cell_images \
  --output /path/to/output_folder \
  --metadata metadata.csv
```

## What Happens Next?

The script will:
1. Process each cell image (takes a few minutes)
2. Generate masks and overlays for verification
3. Create a CSV file with all measurements
4. Generate dose-response plots

## Step 6: Review Results

### Check the Output Folder

You should see:
```
output_folder/
├── quantification_results.csv
├── dose_response_curve.png
├── dose_response_barplot.png
├── P1_W1_C1_mask.png
├── P1_W1_C1_overlay.png
├── P1_W1_C1_analysis.png
└── ... (files for each cell)
```

### Verify Masks

Open the `*_mask.png` files:
- **White pixels** = counted as microtubules
- **Black pixels** = not counted

If masks look wrong, see [Troubleshooting](#troubleshooting).

### Check the CSV

Open `quantification_results.csv`:
- Each row is one cell
- `green_percentage` is your measurement
- Metadata columns are included

## Step 7: Generate Statistics (Optional)

For publication-quality statistics:

```bash
python generate_statistics.py --results output_folder/quantification_results.csv
```

This outputs:
- Detailed statistics for each dose
- ANOVA results
- Correlation analysis
- Publication-ready figure captions

## Step 8: Create Poster Figures (Optional)

For high-resolution figures:

```bash
python generate_poster_figures.py --results output_folder/quantification_results.csv
```

This creates:
- 300 DPI PNG files (for posters)
- Vector PDF files (for printing)
- Professional styling

## Troubleshooting

### Problem: "No images found"
**Solution:** Check that:
- Image files are in the correct folder
- File extensions match (PNG vs png)
- Path is correct

### Problem: "Empty dose-response plots"
**Solution:** 
- Verify `image_name` in metadata.csv matches filenames exactly
- Check that `include_in_curve` column has "yes" for samples you want plotted

### Problem: "Masks include too much background"
**Solution:**
- Images may have high background fluorescence
- Try adjusting threshold in `microtubule_quantification.py`
- Ensure consistent imaging settings

### Problem: "Masks miss obvious microtubules"
**Solution:**
- Images may be too dim
- Check exposure settings
- Verify green channel is present

### Problem: "High variability between replicates"
**Solution:**
- Increase sample size (n≥5 per condition)
- Check imaging consistency
- Verify staining quality

## Next Steps

Once you're comfortable with the basics:

1. **Read the full documentation:**
   - [USAGE_GUIDE.md](USAGE_GUIDE.md) - Detailed instructions
   - [STATISTICS_GUIDE.md](STATISTICS_GUIDE.md) - Statistical analysis
   - [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Command reference

2. **Optimize your workflow:**
   - Standardize imaging settings
   - Increase replicates (n≥5)
   - Include proper controls

3. **Analyze your data:**
   - Compare conditions
   - Calculate IC50 values
   - Prepare figures for publication

## Getting Help

- **Documentation**: Check the guides in this repository
- **Issues**: [Open an issue on GitHub](https://github.com/KalpKan/Microtubule-Quantification/issues)
- **Examples**: See the `Results/` folder for example outputs

## Quick Reference

```bash
# Test single cell
python test_single_cell.py image.png

# Run batch analysis
python run_analysis.py

# Generate statistics
python generate_statistics.py --results Results/quantification_results.csv

# Create poster figures
python generate_poster_figures.py --results Results/quantification_results.csv
```

---

**You're ready to start analyzing!** 🎉

If you run into any issues, check the [Troubleshooting](#troubleshooting) section or open an issue on GitHub.
