# Statistical Analysis Guide

## Overview

The `generate_statistics.py` script provides comprehensive statistical analysis for creating publication-quality figure captions and methods sections.

## Usage

### Basic Usage

```bash
python generate_statistics.py --results Results/quantification_results.csv
```

### If Results are in Different Location

```bash
python generate_statistics.py --results Results_New/quantification_results.csv
```

## What You Get

### 1. Descriptive Statistics by Dose

For each dose, you'll get:
- **n**: Sample size
- **Mean ± SEM**: For error bars on plots
- **Mean ± SD**: For reporting variability
- **Median**: For non-parametric reporting
- **Range**: Min and max values
- **CV%**: Coefficient of variation (measures consistency)

### 2. Statistical Tests

#### One-way ANOVA
- Tests if there are significant differences between any doses
- Reports F-statistic and p-value
- Use this to state: "Doses differed significantly (ANOVA, p<0.001)"

#### Pearson Correlation
- Tests linear relationship between dose and microtubule content
- Reports correlation coefficient (r) and p-value
- Use this to state: "Significant negative correlation (r=-0.85, p<0.001)"

#### Spearman Correlation
- Non-parametric alternative to Pearson
- Better for non-linear relationships
- Reports rho (ρ) and p-value

#### Linear Regression
- Fits a line to dose-response data
- Reports R² (goodness of fit) and p-value
- Use this to state: "Linear fit: R²=0.72, p<0.001"

#### Unpaired t-test
- Compares untreated vs highest dose
- Reports t-statistic and p-value
- Use for pairwise comparisons

### 3. Publication-Ready Figure Captions

The script generates complete figure captions including:
- Experimental description
- Sample sizes
- Statistical test results
- Significance statements
- Key findings

### 4. Quick Reference

One-line statistics for figure legends:
```
n=3-4 cells per condition; Error bars=SEM; ANOVA: F=12.34, p<0.001
```

## Example Output

```
DOSE-RESPONSE DATA
==================

Untreated:
  n = 3
  Mean ± SEM = 27.93 ± 4.61%
  Mean ± SD = 27.93 ± 7.98%
  CV = 28.6%

15 µM:
  n = 4
  Mean ± SEM = 33.30 ± 8.59%
  Mean ± SD = 33.30 ± 17.18%
  CV = 51.6%

STATISTICAL TESTS
=================

One-way ANOVA:
  F-statistic = 5.2341
  p-value = 0.0023
  Significance: p < 0.01 (very significant)

Pearson Correlation:
  r = -0.4521
  p-value = 0.0156
  Interpretation: Significant negative correlation
```

## For Your Paper

### Methods Section

Include:
```
Microtubule content was quantified from n=3-4 cells per condition. 
Data are presented as mean ± SEM. Statistical significance was 
assessed using one-way ANOVA followed by unpaired t-tests for 
pairwise comparisons. Dose-response relationships were evaluated 
using Pearson correlation and linear regression. p<0.05 was 
considered statistically significant.
```

### Figure Legends

Use the generated captions or adapt them:
```
Figure 1. Nocodazole dose-dependently reduces microtubule content.
(A) Dose-response curve showing individual cells (light blue) and 
mean ± SEM (dark blue, n=3-4 per dose). One-way ANOVA: F=5.23, 
p=0.002; Pearson correlation: r=-0.45, p=0.016.
```

## Statistical Interpretation

### p-values
- **p < 0.001**: Highly significant (use "p<0.001")
- **p < 0.01**: Very significant (use "p<0.01")
- **p < 0.05**: Significant (use "p<0.05")
- **p ≥ 0.05**: Not significant (use "p=0.XX" or "n.s.")

### Correlation (r)
- **|r| > 0.7**: Strong correlation
- **|r| = 0.4-0.7**: Moderate correlation
- **|r| < 0.4**: Weak correlation
- **Negative r**: Inverse relationship (dose ↑, microtubules ↓)

### R² (goodness of fit)
- **R² > 0.9**: Excellent fit
- **R² = 0.7-0.9**: Good fit
- **R² = 0.5-0.7**: Moderate fit
- **R² < 0.5**: Poor fit

### Coefficient of Variation (CV)
- **CV < 20%**: Low variability (good!)
- **CV = 20-30%**: Moderate variability (acceptable)
- **CV > 30%**: High variability (consider more replicates)

## Tips for Publication

1. **Always report sample sizes**: "n=3-4 cells per condition"
2. **Specify error bars**: "Error bars represent SEM"
3. **Report exact p-values** when p>0.001: "p=0.023"
4. **Use "p<0.001"** for very small p-values
5. **Include test statistics**: "F=5.23" or "r=-0.45"
6. **State the test used**: "One-way ANOVA" or "Pearson correlation"

## Common Reviewer Questions

**Q: Why use SEM instead of SD?**
A: SEM shows precision of the mean estimate, appropriate for comparing groups. SD shows data spread.

**Q: What statistical test did you use?**
A: One-way ANOVA for comparing multiple groups, followed by unpaired t-tests for pairwise comparisons.

**Q: Is the correlation significant?**
A: Check the p-value from Pearson correlation. If p<0.05, yes.

**Q: How many replicates?**
A: n=3-4 biological replicates (individual cells) per condition.

## Troubleshooting

### "Results file not found"
- Check the path to your CSV file
- Use `--results` flag to specify location
- Make sure you've run the analysis first

### "Not enough data for statistics"
- Need at least 2 samples per group
- Need at least 2 groups for ANOVA

### "High variability (large CV)"
- Consider increasing sample size (n≥5)
- Check for outliers in your data
- Verify consistent staining/imaging

## Additional Resources

- [GraphPad Statistics Guide](https://www.graphpad.com/guides/prism/latest/statistics/)
- [Nature Statistics Checklist](https://www.nature.com/documents/nr-reporting-summary-flat.pdf)
- [ANOVA Explained](https://www.statisticshowto.com/probability-and-statistics/hypothesis-testing/anova/)
