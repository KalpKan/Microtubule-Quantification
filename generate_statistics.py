#!/usr/bin/env python3
"""
Statistical Analysis for Figure Captions
Generates comprehensive statistics for publication-quality figure captions
"""

import pandas as pd
import numpy as np
from scipy import stats
from pathlib import Path
import sys


def calculate_statistics(results_csv):
    """
    Calculate comprehensive statistics for figure captions
    
    Args:
        results_csv: Path to quantification_results.csv
    """
    # Load data
    df = pd.read_csv(results_csv)
    
    # Filter to dose-response samples only
    if 'include_in_curve' in df.columns:
        df_curve = df[df['include_in_curve'] == 'yes'].copy()
    else:
        df_curve = df.copy()
    
    # Get control data
    if 'include_in_curve' in df.columns:
        controls = df[df['include_in_curve'] == 'no'].copy()
    else:
        controls = pd.DataFrame()
    
    print("=" * 80)
    print("STATISTICAL ANALYSIS FOR FIGURE CAPTIONS")
    print("=" * 80)
    print()
    
    # Overall statistics
    print("=" * 80)
    print("OVERALL DATASET")
    print("=" * 80)
    print(f"Total samples analyzed: n={len(df)}")
    print(f"Samples in dose-response curve: n={len(df_curve)}")
    print(f"Control samples: n={len(controls)}")
    print()
    
    # Dose-response statistics
    print("=" * 80)
    print("DOSE-RESPONSE DATA (for curve and bar graph)")
    print("=" * 80)
    print()
    
    dose_stats = df_curve.groupby('dose')['green_percentage'].agg([
        ('n', 'count'),
        ('mean', 'mean'),
        ('std', 'std'),
        ('sem', lambda x: x.std() / np.sqrt(len(x))),
        ('min', 'min'),
        ('max', 'max'),
        ('median', 'median')
    ]).reset_index()
    
    # Calculate CV (coefficient of variation)
    dose_stats['cv_percent'] = (dose_stats['std'] / dose_stats['mean']) * 100
    
    print("Summary by Dose:")
    print("-" * 80)
    for _, row in dose_stats.iterrows():
        dose_label = f"{int(row['dose'])} µM" if row['dose'] > 0 else "Untreated"
        print(f"\n{dose_label}:")
        print(f"  n = {int(row['n'])}")
        print(f"  Mean ± SEM = {row['mean']:.2f} ± {row['sem']:.2f}%")
        print(f"  Mean ± SD = {row['mean']:.2f} ± {row['std']:.2f}%")
        print(f"  Median = {row['median']:.2f}%")
        print(f"  Range = {row['min']:.2f} - {row['max']:.2f}%")
        print(f"  CV = {row['cv_percent']:.1f}%")
    
    print()
    print("=" * 80)
    print("STATISTICAL TESTS")
    print("=" * 80)
    print()
    
    # One-way ANOVA
    groups = [group['green_percentage'].values for name, group in df_curve.groupby('dose')]
    f_stat, p_value_anova = stats.f_oneway(*groups)
    
    print("One-way ANOVA (comparing all doses):")
    print(f"  F-statistic = {f_stat:.4f}")
    print(f"  p-value = {p_value_anova:.4e}")
    if p_value_anova < 0.001:
        print(f"  Significance: p < 0.001 (highly significant)")
    elif p_value_anova < 0.01:
        print(f"  Significance: p < 0.01 (very significant)")
    elif p_value_anova < 0.05:
        print(f"  Significance: p < 0.05 (significant)")
    else:
        print(f"  Significance: not significant (p ≥ 0.05)")
    print()
    
    # Pearson correlation (dose vs microtubule content)
    r_pearson, p_pearson = stats.pearsonr(df_curve['dose'], df_curve['green_percentage'])
    print("Pearson Correlation (dose vs microtubule content):")
    print(f"  r = {r_pearson:.4f}")
    print(f"  p-value = {p_pearson:.4e}")
    if p_pearson < 0.05:
        if r_pearson < 0:
            print(f"  Interpretation: Significant negative correlation (as dose increases, microtubules decrease)")
        else:
            print(f"  Interpretation: Significant positive correlation (as dose increases, microtubules increase)")
    else:
        print(f"  Interpretation: No significant correlation")
    print()
    
    # Spearman correlation (non-parametric)
    r_spearman, p_spearman = stats.spearmanr(df_curve['dose'], df_curve['green_percentage'])
    print("Spearman Correlation (non-parametric):")
    print(f"  ρ (rho) = {r_spearman:.4f}")
    print(f"  p-value = {p_spearman:.4e}")
    print()
    
    # Linear regression
    from scipy.stats import linregress
    slope, intercept, r_value, p_value_reg, std_err = linregress(df_curve['dose'], df_curve['green_percentage'])
    print("Linear Regression:")
    print(f"  Equation: y = {slope:.4f}x + {intercept:.2f}")
    print(f"  R² = {r_value**2:.4f}")
    print(f"  p-value = {p_value_reg:.4e}")
    print(f"  Standard error = {std_err:.4f}")
    print()
    
    # Compare untreated vs highest dose (t-test)
    untreated = df_curve[df_curve['dose'] == 0]['green_percentage'].values
    highest_dose = df_curve[df_curve['dose'] == df_curve['dose'].max()]['green_percentage'].values
    
    if len(untreated) > 0 and len(highest_dose) > 0:
        t_stat, p_ttest = stats.ttest_ind(untreated, highest_dose)
        print(f"Unpaired t-test (Untreated vs {int(df_curve['dose'].max())} µM):")
        print(f"  t-statistic = {t_stat:.4f}")
        print(f"  p-value = {p_ttest:.4e}")
        print(f"  Untreated: {untreated.mean():.2f} ± {untreated.std()/np.sqrt(len(untreated)):.2f}%")
        print(f"  {int(df_curve['dose'].max())} µM: {highest_dose.mean():.2f} ± {highest_dose.std()/np.sqrt(len(highest_dose)):.2f}%")
        print()
    
    # Control samples
    if len(controls) > 0:
        print("=" * 80)
        print("CONTROL SAMPLES (not in dose-response curve)")
        print("=" * 80)
        print()
        
        control_stats = controls.groupby('condition')['green_percentage'].agg([
            ('n', 'count'),
            ('mean', 'mean'),
            ('std', 'std'),
            ('sem', lambda x: x.std() / np.sqrt(len(x)))
        ])
        
        for condition, row in control_stats.iterrows():
            print(f"{condition}:")
            print(f"  n = {int(row['n'])}")
            print(f"  Mean ± SEM = {row['mean']:.2f} ± {row['sem']:.2f}%")
            print(f"  Mean ± SD = {row['mean']:.2f} ± {row['std']:.2f}%")
            print()
    
    # Generate figure captions
    print("=" * 80)
    print("SUGGESTED FIGURE CAPTIONS")
    print("=" * 80)
    print()
    
    print("DOSE-RESPONSE CURVE:")
    print("-" * 80)
    caption_curve = f"""Figure X. Dose-dependent effect of nocodazole on microtubule content.
Cells were treated with increasing concentrations of nocodazole (15-45 µM) for [TIME] 
hours and stained for microtubules (green) and nuclei (blue). Microtubule content was 
quantified as the percentage of cell area occupied by green fluorescent signal. Data 
points represent individual cells (light blue circles) with mean ± SEM shown (dark blue 
line, n={int(dose_stats['n'].min())}-{int(dose_stats['n'].max())} cells per dose). 
One-way ANOVA revealed {'significant' if p_value_anova < 0.05 else 'no significant'} 
differences between doses (F={f_stat:.2f}, p={'<0.001' if p_value_anova < 0.001 else f'={p_value_anova:.3f}'}). 
Pearson correlation analysis showed {'a significant negative correlation' if r_pearson < 0 and p_pearson < 0.05 else 'no significant correlation'} 
between nocodazole concentration and microtubule content (r={r_pearson:.3f}, p={'<0.001' if p_pearson < 0.001 else f'={p_pearson:.3f}'})."""
    
    print(caption_curve)
    print()
    
    print("BAR GRAPH:")
    print("-" * 80)
    caption_bar = f"""Figure X. Quantification of microtubule content across nocodazole doses.
Bar graph showing mean microtubule content (% green pixels) for each nocodazole 
concentration. Error bars represent SEM (n={int(dose_stats['n'].min())}-{int(dose_stats['n'].max())} cells per condition). 
Nocodazole treatment resulted in a dose-dependent {'decrease' if slope < 0 else 'increase'} 
in microtubule content (linear regression: R²={r_value**2:.3f}, p={'<0.001' if p_value_reg < 0.001 else f'={p_value_reg:.3f}'}). 
Untreated cells showed {untreated.mean():.1f}±{untreated.std()/np.sqrt(len(untreated)):.1f}% microtubule content, 
while {int(df_curve['dose'].max())} µM nocodazole reduced this to {highest_dose.mean():.1f}±{highest_dose.std()/np.sqrt(len(highest_dose)):.1f}% 
(unpaired t-test, p={'<0.001' if p_ttest < 0.001 else f'={p_ttest:.3f}'})."""
    
    print(caption_bar)
    print()
    
    # Key statistics for methods section
    print("=" * 80)
    print("FOR METHODS SECTION")
    print("=" * 80)
    print()
    print(f"Statistical Analysis:")
    print(f"  - Sample size: n={int(dose_stats['n'].min())}-{int(dose_stats['n'].max())} cells per condition")
    print(f"  - Data presented as mean ± SEM")
    print(f"  - One-way ANOVA for comparing multiple groups")
    print(f"  - Pearson correlation for dose-response relationship")
    print(f"  - Unpaired t-test for pairwise comparisons")
    print(f"  - Significance threshold: p < 0.05")
    print()
    
    print("=" * 80)
    print("QUICK REFERENCE FOR FIGURE LEGENDS")
    print("=" * 80)
    print()
    print(f"n = {int(dose_stats['n'].min())}-{int(dose_stats['n'].max())} cells per condition")
    print(f"Error bars = SEM")
    print(f"ANOVA: F={f_stat:.2f}, p={'<0.001' if p_value_anova < 0.001 else f'={p_value_anova:.3f}'}")
    print(f"Correlation: r={r_pearson:.3f}, p={'<0.001' if p_pearson < 0.001 else f'={p_pearson:.3f}'}")
    print(f"Linear fit: R²={r_value**2:.3f}, p={'<0.001' if p_value_reg < 0.001 else f'={p_value_reg:.3f}'}")
    print()
    
    print("=" * 80)
    print("END OF STATISTICAL ANALYSIS")
    print("=" * 80)


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate comprehensive statistics for figure captions',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('--results', '-r', type=str, 
                       default='Results/quantification_results.csv',
                       help='Path to quantification_results.csv')
    
    args = parser.parse_args()
    
    results_path = Path(args.results)
    
    if not results_path.exists():
        print(f"Error: Results file not found at {results_path}")
        print("\nTrying alternative locations...")
        
        # Try common locations
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
    
    calculate_statistics(results_path)


if __name__ == '__main__':
    main()
