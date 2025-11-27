#!/usr/bin/env python3
"""
Simple wrapper script to run microtubule quantification
Just press Run in VS Code and it will process everything!
"""

import subprocess
import sys

# Configuration - edit these paths if needed
INPUT_DIR = "/Users/kalp/Desktop/Organized Cropped Cells"
OUTPUT_DIR = "/Users/kalp/Desktop/Results_New"
METADATA_FILE = "metadata.csv"

print("="*60)
print("MICROTUBULE QUANTIFICATION ANALYSIS")
print("="*60)
print(f"\nInput directory: {INPUT_DIR}")
print(f"Output directory: {OUTPUT_DIR}")
print(f"Metadata file: {METADATA_FILE}")
print("\nStarting analysis...\n")

# Run the main script
cmd = [
    sys.executable,  # Use the same Python interpreter
    "microtubule_quantification.py",
    "--input", INPUT_DIR,
    "--output", OUTPUT_DIR,
    "--metadata", METADATA_FILE
]

try:
    result = subprocess.run(cmd, check=True)
    print("\n" + "="*60)
    print("✓ ANALYSIS COMPLETE!")
    print("="*60)
    print(f"\nCheck your results in: {OUTPUT_DIR}")
    print("\nGenerated files:")
    print("  - quantification_results.csv (all measurements)")
    print("  - dose_response_curve.png (dose-response plot)")
    print("  - dose_response_barplot.png (bar chart)")
    print("  - *_mask.png files (verification masks for each cell)")
    print("  - *_overlay.png files (overlays for each cell)")
    print("  - *_analysis.png files (full processing steps)")
    
except subprocess.CalledProcessError as e:
    print("\n" + "="*60)
    print("✗ ERROR OCCURRED")
    print("="*60)
    print(f"\nError: {e}")
    sys.exit(1)
