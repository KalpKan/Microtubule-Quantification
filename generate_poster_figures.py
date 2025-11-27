#!/usr/bin/env python3
"""
Generate Publication-Quality Poster Figures
Creates high-resolution, professionally styled dose-response plots
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import sys


def set_poster_style():
    """Set matplotlib style for poster figures"""
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['font.sans-serif'] = ['Arial', 'DejaVu Sans', 'Helvetica']
    plt.rcParams['font.size'] = 12
    plt.rcParams['axes.labelsize'] = 14
    plt.rcParams['axes.titlesize'] = 16
    plt.rcParams['xtick.labelsize'] = 12
    plt.rcParams['ytick.labelsize'] = 12
    plt.rcParams['legend.fontsize'] = 12
    plt.rcParams['figure.dpi'] = 300
    plt.rcParams['savefig.dpi'] = 300
    plt.rcParams['savefig.bbox'] = 'tight'


def generate_dose_response_curve(df, output_dir, dose_column='dose'):
    """
    Generate publication-quality dose-response curve for poster
    
    Args:
        df: DataFrame with quantification results
        output_dir: Directory to save figures
        dose_column: Name of dose column
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Filter to dose-response samples
    if 'include_in_curve' in df.columns:
        df_curve = df[df['include_in_curve'] == 'yes'].copy()
    else:
        df_curve = df.copy()
    
    # Calculate statistics
    dose_stats = df_curve.groupby(dose_column)['green_percentage'].agg([
        ('mean', 'mean'),
        ('std', 'std'),
        ('count', 'count')
    ]).reset_index()
    dose_stats['sem'] = dose_stats['std'] / np.sqrt(dose_stats['count'])
    
    # Set poster style
    set_poster_style()
    
    # Create figure
    fig, ax = plt.subplots(figsize=(8, 4.5))
    
    # Define colors - muted purple theme
    scatter_color = '#B19CD9'  # Light purple
    line_color = '#5B2C6F'      # Dark purple
    
    # Plot individual cells (scatter)
    ax.scatter(df_curve[dose_column], df_curve['green_percentage'],
              color=scatter_color, alpha=0.5, s=50, marker='o',
              edgecolors='none', label='Individual cells', zorder=2)
    
    # Plot mean with error bars
    ax.errorbar(dose_stats[dose_column], dose_stats['mean'],
               yerr=dose_stats['sem'],
               color=line_color, linewidth=2.5, marker='o', markersize=7,
               capsize=5, capthick=1.5, elinewidth=1.5,
               label='Mean ± SEM', zorder=3)
    
    # Axis labels (bold, readable size)
    ax.set_xlabel('Nocodazole concentration (µM)', fontsize=14, fontweight='bold')
    ax.set_ylabel('Microtubule content (% green pixels)', fontsize=14, fontweight='bold')
    
    # Optional small title (can be removed if not needed)
    ax.set_title('Nocodazole dose–response', fontsize=16, pad=15)
    
    # Tick parameters
    ax.tick_params(axis='both', which='major', labelsize=14,
                  length=6, width=1.5, direction='out')
    
    # Spine styling
    for spine in ['left', 'bottom']:
        ax.spines[spine].set_linewidth(1.5)
    for spine in ['top', 'right']:
        ax.spines[spine].set_visible(False)
    
    # Legend
    ax.legend(loc='upper right', frameon=False, fontsize=12)
    
    # No grid (clean look)
    ax.grid(False)
    
    # Set axis limits with some padding
    x_min, x_max = df_curve[dose_column].min(), df_curve[dose_column].max()
    x_padding = (x_max - x_min) * 0.05
    ax.set_xlim(x_min - x_padding, x_max + x_padding)
    
    y_min = min(df_curve['green_percentage'].min(), dose_stats['mean'].min() - dose_stats['sem'].max())
    y_max = max(df_curve['green_percentage'].max(), dose_stats['mean'].max() + dose_stats['sem'].max())
    y_padding = (y_max - y_min) * 0.1
    ax.set_ylim(max(0, y_min - y_padding), y_max + y_padding)
    
    # Tight layout
    plt.tight_layout()
    
    # Save as PNG and PDF
    png_path = output_dir / 'nocodazole_dose_response_poster.png'
    pdf_path = output_dir / 'nocodazole_dose_response_poster.pdf'
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight', facecolor='white')
    plt.savefig(pdf_path, dpi=300, bbox_inches='tight', facecolor='white')
    
    print(f"✓ Dose-response curve saved:")
    print(f"  PNG: {png_path}")
    print(f"  PDF: {pdf_path}")
    
    plt.close()


def generate_bar_plot(df, output_dir, dose_column='dose'):
    """
    Generate publication-quality bar plot for poster
    
    Args:
        df: DataFrame with quantification results
        output_dir: Directory to save figures
        dose_column: Name of dose column
    """
    output_dir = Path(output_dir)
    
    # Filter to dose-response samples
    if 'include_in_curve' in df.columns:
        df_curve = df[df['include_in_curve'] == 'yes'].copy()
    else:
        df_curve = df.copy()
    
    # Calculate statistics
    dose_stats = df_curve.groupby(dose_column)['green_percentage'].agg([
        ('mean', 'mean'),
        ('std', 'std'),
        ('count', 'count')
    ]).reset_index()
    dose_stats['sem'] = dose_stats['std'] / np.sqrt(dose_stats['count'])
    
    # Set poster style
    set_poster_style()
    
    # Create figure
    fig, ax = plt.subplots(figsize=(8, 4.5))
    
    # Define color - muted purple
    bar_color = '#8B6FA8'  # Medium purple
    
    # Create bar positions
    x_pos = np.arange(len(dose_stats))
    
    # Plot bars
    bars = ax.bar(x_pos, dose_stats['mean'],
                  yerr=dose_stats['sem'],
                  color=bar_color, alpha=0.8,
                  edgecolor='black', linewidth=1.5,
                  capsize=5, error_kw={'elinewidth': 1.5, 'capthick': 1.5},
                  zorder=3)
    
    # Axis labels (bold, readable size)
    ax.set_xlabel('Nocodazole concentration (µM)', fontsize=14, fontweight='bold')
    ax.set_ylabel('Microtubule content (% green pixels)', fontsize=14, fontweight='bold')
    
    # Optional small title
    ax.set_title('Microtubule content by dose', fontsize=16, pad=15)
    
    # X-axis tick labels
    x_labels = [f'{int(d)} µM' if d > 0 else 'Untreated' for d in dose_stats[dose_column]]
    ax.set_xticks(x_pos)
    ax.set_xticklabels(x_labels, rotation=45, ha='right')
    
    # Tick parameters
    ax.tick_params(axis='both', which='major', labelsize=12,
                  length=6, width=1.5, direction='out')
    
    # Spine styling
    for spine in ['left', 'bottom']:
        ax.spines[spine].set_linewidth(1.5)
    for spine in ['top', 'right']:
        ax.spines[spine].set_visible(False)
    
    # No grid
    ax.grid(False)
    
    # Y-axis starts at 0
    y_max = (dose_stats['mean'] + dose_stats['sem']).max()
    ax.set_ylim(0, y_max * 1.15)
    
    # Tight layout
    plt.tight_layout()
    
    # Save as PNG and PDF
    png_path = output_dir / 'nocodazole_barplot_poster.png'
    pdf_path = output_dir / 'nocodazole_barplot_poster.pdf'
    
    plt.savefig(png_path, dpi=300, bbox_inches='tight', facecolor='white')
    plt.savefig(pdf_path, dpi=300, bbox_inches='tight', facecolor='white')
    
    print(f"✓ Bar plot saved:")
    print(f"  PNG: {png_path}")
    print(f"  PDF: {pdf_path}")
    
    plt.close()


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate publication-quality poster figures',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_poster_figures.py --results Results/quantification_results.csv
  python generate_poster_figures.py --results Results_New/quantification_results.csv --output Poster_Figures
        """
    )
    
    parser.add_argument('--results', '-r', type=str,
                       default='Results/quantification_results.csv',
                       help='Path to quantification_results.csv')
    parser.add_argument('--output', '-o', type=str,
                       default='Poster_Figures',
                       help='Output directory for poster figures')
    parser.add_argument('--dose-column', type=str, default='dose',
                       help='Name of dose column')
    
    args = parser.parse_args()
    
    # Check if results file exists
    results_path = Path(args.results)
    if not results_path.exists():
        print(f"Error: Results file not found at {results_path}")
        print("\nTrying alternative locations...")
        
        alternatives = [
            'Results_New/quantification_results.csv',
            'quantification_results.csv',
            '../Results/quantification_results.csv'
        ]
        
        for alt in alternatives:
            if Path(alt).exists():
                print(f"Found results at: {alt}")
                results_path = Path(alt)
                break
        else:
            print("\nCould not find results file. Please specify path with --results")
            sys.exit(1)
    
    # Load data
    print("=" * 60)
    print("GENERATING POSTER FIGURES")
    print("=" * 60)
    print(f"\nReading data from: {results_path}")
    
    df = pd.read_csv(results_path)
    
    # Generate figures
    print(f"\nOutput directory: {args.output}")
    print("\nGenerating figures...")
    print()
    
    generate_dose_response_curve(df, args.output, args.dose_column)
    print()
    generate_bar_plot(df, args.output, args.dose_column)
    
    print()
    print("=" * 60)
    print("✓ POSTER FIGURES COMPLETE")
    print("=" * 60)
    print()
    print("Files generated:")
    print("  • nocodazole_dose_response_poster.png (300 DPI)")
    print("  • nocodazole_dose_response_poster.pdf (vector)")
    print("  • nocodazole_barplot_poster.png (300 DPI)")
    print("  • nocodazole_barplot_poster.pdf (vector)")
    print()
    print("These figures are ready for your scientific poster!")
    print()


if __name__ == '__main__':
    main()
