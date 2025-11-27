#!/usr/bin/env python3
"""
Test script for processing a single cell image
Useful for verifying the algorithm works correctly before batch processing
"""

import cv2
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import argparse
import sys

# Import from main script
from microtubule_quantification import MicrotubuleQuantifier


def test_single_cell(image_path: str, show_plot: bool = True):
    """
    Process a single cell image and display results interactively
    
    Args:
        image_path: Path to the cell image
        show_plot: Whether to display interactive plot (set False for headless)
    """
    image_path = Path(image_path)
    
    if not image_path.exists():
        print(f"Error: Image not found at {image_path}")
        sys.exit(1)
    
    print(f"Testing single cell: {image_path.name}")
    print("Processing with high-quality settings...\n")
    
    # Load image
    image = cv2.imread(str(image_path))
    if image is None:
        print(f"Error: Could not load image")
        sys.exit(1)
    
    # Initialize quantifier
    quantifier = MicrotubuleQuantifier()
    
    # Process step by step
    print("Step 1: Extracting green channel...")
    green_channel = quantifier.extract_green_channel(image)
    
    print("Step 2: Creating nucleus mask (blue regions to exclude)...")
    nucleus_mask = quantifier.create_nucleus_mask(image)
    
    print("Step 3: Thresholding to identify microtubules...")
    mask, threshold_value = quantifier.threshold_microtubules(green_channel)
    
    print("Step 4: Excluding nucleus from microtubule mask...")
    mask[nucleus_mask > 0] = 0
    
    print("Step 5: Cleaning mask...")
    final_mask = quantifier.clean_mask(mask)
    
    print("Step 6: Quantifying green percentage...")
    green_percentage = quantifier.quantify_green_percentage(final_mask)
    
    # Calculate statistics
    total_pixels = final_mask.size
    green_pixels = np.count_nonzero(final_mask)
    
    # Print results
    print("\n" + "="*60)
    print("RESULTS")
    print("="*60)
    print(f"Image: {image_path.name}")
    print(f"Threshold value used: {threshold_value:.1f}")
    print(f"Total pixels: {total_pixels:,}")
    print(f"Green pixels (microtubules): {green_pixels:,}")
    print(f"Microtubule content: {green_percentage:.2f}%")
    print("="*60 + "\n")
    
    # Create comprehensive visualization
    fig = plt.figure(figsize=(16, 10))
    
    # Create grid
    gs = fig.add_gridspec(3, 3, hspace=0.3, wspace=0.3)
    
    # Row 1: Processing steps
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.imshow(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    ax1.set_title('1. Original Image', fontweight='bold')
    ax1.axis('off')
    
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.imshow(green_channel, cmap='gray')
    ax2.set_title('2. Green Channel', fontweight='bold')
    ax2.axis('off')
    
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.imshow(nucleus_mask, cmap='gray')
    ax3.set_title('3. Nucleus Mask\n(Blue - Excluded)', fontweight='bold')
    ax3.axis('off')
    
    # Row 2: Mask and overlay
    ax4 = fig.add_subplot(gs[1, 0])
    ax4.imshow(final_mask, cmap='gray')
    ax4.set_title(f'4. Microtubule Mask\n(Threshold: {threshold_value:.1f})', fontweight='bold')
    ax4.axis('off')
    
    # Overlay
    ax5 = fig.add_subplot(gs[1, 1])
    overlay = image.copy()
    overlay[final_mask > 0] = [0, 255, 0]
    ax5.imshow(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))
    ax5.set_title('5. Detected Microtubules\n(Green Overlay)', fontweight='bold')
    ax5.axis('off')
    
    # Empty
    ax6 = fig.add_subplot(gs[1, 2])
    ax6.axis('off')
    
    # Row 3: Large comparison view
    ax7 = fig.add_subplot(gs[2, :])
    # Side by side: original and mask
    comparison = np.hstack([
        cv2.cvtColor(image, cv2.COLOR_BGR2RGB),
        cv2.cvtColor(cv2.merge([final_mask, final_mask, final_mask]), cv2.COLOR_BGR2RGB)
    ])
    ax7.imshow(comparison)
    results_text = f'Original vs Mask (What Gets Counted) | Green: {green_percentage:.2f}% | Threshold: {threshold_value:.1f}'
    ax7.set_title(results_text, fontweight='bold', fontsize=12)
    ax7.axis('off')
    
    fig.suptitle(f'Single Cell Test: {image_path.name}', fontsize=16, fontweight='bold')
    
    # Save figure
    output_path = image_path.parent / f'{image_path.stem}_test_result.png'
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"Visualization saved to: {output_path}")
    
    # Save mask separately
    mask_path = image_path.parent / f'{image_path.stem}_test_mask.png'
    cv2.imwrite(str(mask_path), final_mask)
    print(f"Mask saved to: {mask_path}")
    
    # Save overlay separately
    overlay_path = image_path.parent / f'{image_path.stem}_test_overlay.png'
    cv2.imwrite(str(overlay_path), overlay)
    print(f"Overlay saved to: {overlay_path}")
    
    if show_plot:
        print("\nDisplaying interactive plot (close window to exit)...")
        plt.show()
    else:
        plt.close()
    
    print("\n✓ Test complete! Review the mask to verify correct detection.")
    print("  - White pixels in mask = counted as microtubules")
    print("  - Black pixels in mask = not counted")
    
    return green_percentage


def main():
    parser = argparse.ArgumentParser(
        description='Test microtubule quantification on a single cell image',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
  python test_single_cell.py cell1.png
  python test_single_cell.py path/to/cell_image.tif --no-display
        """
    )
    
    parser.add_argument('image', type=str, nargs='?',
                       default='/Users/kalp/Desktop/Single Cell/Plate1_W1_Cell2.PNG',
                       help='Path to cell image (default: Plate1_W1_Cell2.PNG')
    parser.add_argument('--no-display', action='store_true', 
                       help='Do not display interactive plot (just save files)')
    
    args = parser.parse_args()
    
    test_single_cell(args.image, show_plot=not args.no_display)


if __name__ == '__main__':
    main()
