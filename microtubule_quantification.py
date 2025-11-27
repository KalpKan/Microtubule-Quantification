#!/usr/bin/env python3
"""
Microtubule Quantification Script
Analyzes cropped cell images to quantify microtubule presence (green fluorescence)
Prioritizes accuracy over speed with sophisticated image processing
"""

import cv2
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
import argparse
from typing import Tuple, Dict
import json


class MicrotubuleQuantifier:
    """Quantifies microtubule presence in fluorescent cell images"""
    
    def __init__(self, gaussian_blur_size=5, morphology_kernel_size=3):
        """
        Initialize quantifier with processing parameters
        
        Args:
            gaussian_blur_size: Size of Gaussian blur kernel (must be odd)
            morphology_kernel_size: Size of morphological operation kernel
        """
        self.gaussian_blur_size = gaussian_blur_size
        self.morphology_kernel_size = morphology_kernel_size
        
    def extract_green_channel(self, image: np.ndarray) -> np.ndarray:
        """Extract and enhance green channel from RGB image"""
        if len(image.shape) == 2:
            # Already grayscale
            return image
        
        # Extract green channel
        green_channel = image[:, :, 1]
        return green_channel
    
    def create_nucleus_mask(self, image: np.ndarray) -> np.ndarray:
        """
        Create a mask of the nucleus (blue stained regions)
        Returns a binary mask where nucleus pixels are 255 (white)
        """
        if len(image.shape) == 2:
            # Grayscale image, no blue channel
            return np.zeros_like(image)
        
        # Extract blue channel
        blue_channel = image[:, :, 0]
        
        # Threshold to identify nucleus (blue regions)
        # Using Otsu's method for automatic thresholding
        _, nucleus_mask = cv2.threshold(blue_channel, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Clean up the mask with morphological operations
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        nucleus_mask = cv2.morphologyEx(nucleus_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        return nucleus_mask
    
    def apply_background_subtraction(self, green_channel: np.ndarray) -> np.ndarray:
        """
        Apply sophisticated background subtraction using morphological opening
        This removes uneven illumination while preserving microtubule structures
        """
        # Create a large kernel for background estimation
        kernel_size = max(green_channel.shape) // 10
        if kernel_size % 2 == 0:
            kernel_size += 1
        
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        
        # Morphological opening estimates the background
        background = cv2.morphologyEx(green_channel, cv2.MORPH_OPEN, kernel)
        
        # Subtract background
        corrected = cv2.subtract(green_channel, background)
        
        return corrected
    
    def denoise_image(self, image: np.ndarray) -> np.ndarray:
        """
        Apply denoising while preserving edges
        Uses bilateral filter for edge-preserving smoothing
        """
        # Bilateral filter: reduces noise while keeping edges sharp
        denoised = cv2.bilateralFilter(image, d=9, sigmaColor=75, sigmaSpace=75)
        
        # Additional Gaussian blur for further noise reduction
        denoised = cv2.GaussianBlur(denoised, (self.gaussian_blur_size, self.gaussian_blur_size), 0)
        
        return denoised
    
    def threshold_microtubules(self, denoised: np.ndarray) -> Tuple[np.ndarray, int]:
        """
        Apply multiple thresholding methods and use the most conservative
        Returns binary mask and threshold value used
        """
        # Method 1: Otsu's method (automatic optimal threshold)
        otsu_thresh, otsu_mask = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Method 2: Triangle algorithm (good for skewed distributions)
        triangle_thresh, triangle_mask = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_TRIANGLE)
        
        # Method 3: Adaptive threshold for local variations
        adaptive_mask = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                              cv2.THRESH_BINARY, 51, -10)
        
        # Use Otsu as primary method (most reliable for bimodal distributions)
        # But verify it's reasonable
        final_mask = otsu_mask
        final_thresh = otsu_thresh
        
        return final_mask, final_thresh
    
    def clean_mask(self, mask: np.ndarray) -> np.ndarray:
        """
        Clean up the binary mask using morphological operations
        Removes small noise artifacts while preserving microtubule structures
        """
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, 
                                          (self.morphology_kernel_size, self.morphology_kernel_size))
        
        # Morphological opening: removes small noise
        cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        
        # Morphological closing: fills small gaps in microtubules
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=1)
        
        return cleaned
    
    def quantify_green_percentage(self, mask: np.ndarray) -> float:
        """
        Calculate percentage of pixels that are green (microtubules)
        
        Returns:
            Percentage of green pixels (0-100)
        """
        total_pixels = mask.size
        green_pixels = np.count_nonzero(mask)
        percentage = (green_pixels / total_pixels) * 100
        
        return percentage
    
    def process_image(self, image_path: str, output_dir: Path) -> Dict:
        """
        Process a single cell image and return quantification results
        
        Args:
            image_path: Path to the cropped cell image
            output_dir: Directory to save output visualizations
            
        Returns:
            Dictionary with quantification results
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        image_name = Path(image_path).stem
        
        # Step 1: Extract green channel
        green_channel = self.extract_green_channel(image)
        
        # Step 2: Create nucleus mask (blue regions to exclude)
        nucleus_mask = self.create_nucleus_mask(image)
        
        # Step 3: Threshold to identify microtubules (directly from green channel)
        mask, threshold_value = self.threshold_microtubules(green_channel)
        
        # Step 4: Exclude nucleus from microtubule mask
        # Set nucleus regions to 0 (black) in the mask
        mask[nucleus_mask > 0] = 0
        
        # Step 5: Clean up mask
        final_mask = self.clean_mask(mask)
        
        # Step 6: Quantify
        green_percentage = self.quantify_green_percentage(final_mask)
        
        # Save visualizations
        self._save_visualizations(image, green_channel, nucleus_mask,
                                 final_mask, image_name, output_dir, threshold_value)
        
        results = {
            'image_name': image_name,
            'green_percentage': green_percentage,
            'threshold_value': threshold_value,
            'total_pixels': final_mask.size,
            'green_pixels': np.count_nonzero(final_mask)
        }
        
        return results
    
    def _save_visualizations(self, original: np.ndarray, green_channel: np.ndarray,
                            nucleus_mask: np.ndarray, mask: np.ndarray, image_name: str, 
                            output_dir: Path, threshold_value: float):
        """Save detailed visualizations of processing steps"""
        
        # Create figure with processing steps
        fig, axes = plt.subplots(2, 3, figsize=(15, 10))
        fig.suptitle(f'Microtubule Analysis: {image_name}', fontsize=16)
        
        # Original image
        axes[0, 0].imshow(cv2.cvtColor(original, cv2.COLOR_BGR2RGB))
        axes[0, 0].set_title('1. Original Image')
        axes[0, 0].axis('off')
        
        # Green channel
        axes[0, 1].imshow(green_channel, cmap='gray')
        axes[0, 1].set_title('2. Green Channel')
        axes[0, 1].axis('off')
        
        # Nucleus mask
        axes[0, 2].imshow(nucleus_mask, cmap='gray')
        axes[0, 2].set_title('3. Nucleus Mask (Excluded)')
        axes[0, 2].axis('off')
        
        # Binary mask
        axes[1, 0].imshow(mask, cmap='gray')
        axes[1, 0].set_title(f'4. Microtubule Mask (Threshold: {threshold_value:.1f})')
        axes[1, 0].axis('off')
        
        # Mask overlay on original
        overlay = original.copy()
        overlay[mask > 0] = [0, 255, 0]  # Highlight detected microtubules in bright green
        axes[1, 1].imshow(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))
        axes[1, 1].set_title('5. Detected Microtubules (Green Overlay)')
        axes[1, 1].axis('off')
        
        # Empty
        axes[1, 2].axis('off')
        
        plt.tight_layout()
        plt.savefig(output_dir / f'{image_name}_analysis.png', dpi=300, bbox_inches='tight')
        plt.close()
        
        # Save just the mask separately for easy verification
        cv2.imwrite(str(output_dir / f'{image_name}_mask.png'), mask)
        
        # Save overlay separately
        cv2.imwrite(str(output_dir / f'{image_name}_overlay.png'), overlay)


def process_batch(image_dir: str, output_dir: str, metadata_file: str = None):
    """
    Process a batch of cell images
    
    Args:
        image_dir: Directory containing cropped cell images
        output_dir: Directory to save results
        metadata_file: Optional CSV file with image metadata (filename, condition, dose)
    """
    image_dir = Path(image_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize quantifier
    quantifier = MicrotubuleQuantifier()
    
    # Find all image files (case-insensitive)
    image_extensions = ['*.png', '*.PNG', '*.jpg', '*.JPG', '*.jpeg', '*.JPEG', '*.tif', '*.TIF', '*.tiff', '*.TIFF']
    image_files = []
    for ext in image_extensions:
        image_files.extend(image_dir.glob(ext))
    
    if not image_files:
        print(f"No images found in {image_dir}")
        return
    
    print(f"Found {len(image_files)} images to process")
    print("Processing with high-quality settings (this may take a while)...")
    
    # Process each image
    results = []
    for i, image_path in enumerate(image_files, 1):
        print(f"Processing {i}/{len(image_files)}: {image_path.name}")
        try:
            result = quantifier.process_image(str(image_path), output_dir)
            results.append(result)
        except Exception as e:
            print(f"Error processing {image_path.name}: {e}")
    
    # Save results to CSV
    df = pd.DataFrame(results)
    
    # If metadata file provided, merge with results
    if metadata_file and Path(metadata_file).exists():
        metadata = pd.read_csv(metadata_file)
        df = df.merge(metadata, on='image_name', how='left')
    
    results_file = output_dir / 'quantification_results.csv'
    df.to_csv(results_file, index=False)
    print(f"\nResults saved to: {results_file}")
    
    # Generate summary statistics
    print("\n=== Summary Statistics ===")
    print(f"Total images processed: {len(results)}")
    print(f"Mean green percentage: {df['green_percentage'].mean():.2f}%")
    print(f"Std dev: {df['green_percentage'].std():.2f}%")
    print(f"Range: {df['green_percentage'].min():.2f}% - {df['green_percentage'].max():.2f}%")
    
    return df



def plot_dose_response(results_csv: str, output_dir: str, dose_column: str = 'dose', 
                       condition_column: str = 'condition'):
    """
    Generate dose-response curve from quantification results
    Only includes samples marked with include_in_curve='yes'
    
    Args:
        results_csv: Path to CSV file with quantification results
        output_dir: Directory to save plot
        dose_column: Name of column containing dose values
        condition_column: Name of column containing condition labels
    """
    df = pd.read_csv(results_csv)
    output_dir = Path(output_dir)
    
    if dose_column not in df.columns:
        print(f"Warning: '{dose_column}' column not found in results.")
        print(f"Available columns: {', '.join(df.columns)}")
        return
    
    # Filter to only include samples for dose-response curve
    if 'include_in_curve' in df.columns:
        # Handle both string 'yes' and potential whitespace issues
        df_curve = df[df['include_in_curve'].astype(str).str.strip().str.lower() == 'yes'].copy()
        print(f"\nGenerating dose-response curve with {len(df_curve)} samples (controls excluded)")
        
        # Debug: show what we're filtering
        if len(df_curve) == 0:
            print("WARNING: No samples with include_in_curve='yes' found!")
            print(f"Unique values in include_in_curve column: {df['include_in_curve'].unique()}")
            print("Using all samples instead...")
            df_curve = df.copy()
    else:
        df_curve = df.copy()
        print(f"\nGenerating dose-response curve with all {len(df_curve)} samples")
    
    # Check if we have data
    if len(df_curve) == 0:
        print("ERROR: No data to plot!")
        return
    
    # Calculate mean and std for each dose
    dose_stats = df_curve.groupby(dose_column)['green_percentage'].agg(['mean', 'std', 'count']).reset_index()
    
    # Calculate standard error
    dose_stats['sem'] = dose_stats['std'] / np.sqrt(dose_stats['count'])
    
    # Debug output
    print(f"\nDose statistics:")
    print(dose_stats)
    
    # Create dose-response plot
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Plot individual data points
    ax.scatter(df_curve[dose_column], df_curve['green_percentage'], alpha=0.5, s=100, 
               label='Individual cells', color='lightblue', edgecolors='black', linewidth=1)
    
    # Plot mean with error bars
    ax.errorbar(dose_stats[dose_column], dose_stats['mean'], yerr=dose_stats['sem'],
                fmt='o-', linewidth=2, markersize=10, capsize=5, capthick=2,
                color='darkblue', label='Mean ± SEM')
    
    ax.set_xlabel('Nocodazole Concentration (µM)', fontsize=12, fontweight='bold')
    ax.set_ylabel('Microtubule Content (% Green Pixels)', fontsize=12, fontweight='bold')
    ax.set_title('Nocodazole Dose-Response Curve', fontsize=14, fontweight='bold')
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'dose_response_curve.png', dpi=300, bbox_inches='tight')
    print(f"Dose-response curve saved to: {output_dir / 'dose_response_curve.png'}")
    plt.close()
    
    # Also create a bar plot
    fig, ax = plt.subplots(figsize=(12, 6))
    
    x_pos = np.arange(len(dose_stats))
    ax.bar(x_pos, dose_stats['mean'], yerr=dose_stats['sem'], 
           capsize=5, alpha=0.7, color='green', edgecolor='black', linewidth=1.5)
    
    ax.set_xlabel('Nocodazole Concentration (µM)', fontsize=12, fontweight='bold')
    ax.set_ylabel('Microtubule Content (% Green Pixels)', fontsize=12, fontweight='bold')
    ax.set_title('Microtubule Content by Nocodazole Dose', fontsize=14, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels([f'{int(d)} µM' if d > 0 else 'Untreated' for d in dose_stats[dose_column]])
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    plt.savefig(output_dir / 'dose_response_barplot.png', dpi=300, bbox_inches='tight')
    print(f"Bar plot saved to: {output_dir / 'dose_response_barplot.png'}")
    plt.close()
    
    # Print summary of controls (not in curve)
    if 'include_in_curve' in df.columns:
        controls = df[df['include_in_curve'] == 'no']
        if len(controls) > 0:
            print("\n=== Control Samples (not included in dose-response curve) ===")
            control_stats = controls.groupby('condition')['green_percentage'].agg(['mean', 'std', 'count'])
            for condition, row in control_stats.iterrows():
                print(f"{condition}: {row['mean']:.2f}% ± {row['std']:.2f}% (n={int(row['count'])})")


def main():
    parser = argparse.ArgumentParser(
        description='Quantify microtubule presence in fluorescent cell images',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process all images in a directory
  python microtubule_quantification.py --input ./cell_images --output ./results
  
  # Process with metadata file
  python microtubule_quantification.py --input ./cell_images --output ./results --metadata metadata.csv
  
  # Generate dose-response curve from existing results
  python microtubule_quantification.py --plot-only --results ./results/quantification_results.csv --output ./results
        """
    )
    
    parser.add_argument('--input', '-i', type=str, help='Directory containing cropped cell images')
    parser.add_argument('--output', '-o', type=str, required=True, help='Output directory for results')
    parser.add_argument('--metadata', '-m', type=str, help='CSV file with metadata (columns: image_name, condition, dose)')
    parser.add_argument('--plot-only', action='store_true', help='Only generate plots from existing results')
    parser.add_argument('--results', '-r', type=str, help='Path to existing results CSV (for --plot-only)')
    parser.add_argument('--dose-column', type=str, default='dose', help='Name of dose column in metadata')
    parser.add_argument('--condition-column', type=str, default='condition', help='Name of condition column in metadata')
    
    args = parser.parse_args()
    
    if args.plot_only:
        if not args.results:
            print("Error: --results required when using --plot-only")
            return
        plot_dose_response(args.results, args.output, args.dose_column, args.condition_column)
    else:
        if not args.input:
            print("Error: --input required for image processing")
            return
        
        # Process images
        df = process_batch(args.input, args.output, args.metadata)
        
        # Generate plots if dose information is available
        if df is not None and args.dose_column in df.columns:
            results_file = Path(args.output) / 'quantification_results.csv'
            plot_dose_response(str(results_file), args.output, args.dose_column, args.condition_column)


if __name__ == '__main__':
    main()
