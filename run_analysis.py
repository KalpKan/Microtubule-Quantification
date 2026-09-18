#!/usr/bin/env python3
"""
Simple wrapper script to run microtubule quantification.

Run it with no arguments to use the default folders, or point it at your own:

    python run_analysis.py --input "path/to/cropped cells" --output path/to/results

Defaults (kept from the original script) can also be changed by editing DEFAULTS.
"""

import argparse
import subprocess
import sys

# Default configuration - override with --input / --output / --metadata
DEFAULTS = {
    "input": "/Users/kalp/Desktop/Organized Cropped Cells",
    "output": "/Users/kalp/Desktop/Results_New",
    "metadata": "metadata.csv",
}


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Run the microtubule quantification on a folder of cropped cells.")
    parser.add_argument("--input", "-i", default=DEFAULTS["input"], help="Folder of cropped cell images")
    parser.add_argument("--output", "-o", default=DEFAULTS["output"], help="Folder to write results into")
    parser.add_argument("--metadata", "-m", default=DEFAULTS["metadata"], help="CSV with image_name, condition, dose")
    return parser.parse_args(argv)


def build_command(input_dir, output_dir, metadata_file):
    """The exact command run_analysis hands to the main script."""
    return [
        sys.executable,  # Use the same Python interpreter
        "microtubule_quantification.py",
        "--input", input_dir,
        "--output", output_dir,
        "--metadata", metadata_file,
    ]


def main(argv=None):
    args = parse_args(argv)
    print("=" * 60)
    print("MICROTUBULE QUANTIFICATION ANALYSIS")
    print("=" * 60)
    print(f"\nInput directory: {args.input}")
    print(f"Output directory: {args.output}")
    print(f"Metadata file: {args.metadata}")
    print("\nStarting analysis...\n")

    try:
        subprocess.run(build_command(args.input, args.output, args.metadata), check=True)
        print("\n" + "=" * 60)
        print("✓ ANALYSIS COMPLETE!")
        print("=" * 60)
        print(f"\nCheck your results in: {args.output}")
        print("\nGenerated files:")
        print("  - quantification_results.csv (all measurements)")
        print("  - dose_response_curve.png (dose-response plot)")
        print("  - dose_response_barplot.png (bar chart)")
        print("  - *_mask.png files (verification masks for each cell)")
        print("  - *_overlay.png files (overlays for each cell)")
        print("  - *_analysis.png files (full processing steps)")
    except subprocess.CalledProcessError as e:
        print("\n" + "=" * 60)
        print("✗ ERROR OCCURRED")
        print("=" * 60)
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
