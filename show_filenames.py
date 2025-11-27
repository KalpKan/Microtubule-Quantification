#!/usr/bin/env python3
"""
Helper script to show all image filenames found
Use this to update your metadata.csv
"""

from pathlib import Path

INPUT_DIR = "/Users/kalp/Desktop/Organized Cropped Cells"

# Find all image files
image_extensions = ['*.png', '*.PNG', '*.jpg', '*.JPG', '*.jpeg', '*.JPEG', '*.tif', '*.TIF', '*.tiff', '*.TIFF']
image_files = []
for ext in image_extensions:
    image_files.extend(Path(INPUT_DIR).glob(ext))

# Sort and display
image_files = sorted(image_files)

print(f"Found {len(image_files)} images in {INPUT_DIR}\n")
print("Image names (without extension) - copy these to metadata.csv:\n")
print("-" * 60)

for img in image_files:
    print(img.stem)

print("-" * 60)
print(f"\nTotal: {len(image_files)} files")
print("\nUpdate your metadata.csv 'image_name' column with these exact names!")
