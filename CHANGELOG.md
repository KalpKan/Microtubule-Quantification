# Changelog

All notable changes to the Microtubule Quantification Tool will be documented in this file.

## [1.0.0] - 2024-11-27

### Added
- Initial release of Microtubule Quantification Tool
- Automated green channel extraction for microtubule detection
- Blue channel nucleus detection and exclusion
- Otsu's automatic thresholding for optimal microtubule detection
- Morphological operations for noise reduction
- Batch processing with metadata support
- Dose-response curve generation with statistical analysis
- Comprehensive visualization outputs:
  - Binary masks for verification
  - Overlay images showing detected microtubules
  - Complete processing pipeline visualization
- Single cell testing script (`test_single_cell.py`)
- Wrapper script for easy execution (`run_analysis.py`)
- Helper script for filename verification (`show_filenames.py`)
- Comprehensive documentation:
  - README.md with overview and quick start
  - USAGE_GUIDE.md with detailed instructions
  - Example results from validation experiment
- Support for multiple image formats (PNG, JPG, TIFF)
- Case-insensitive file extension handling
- Statistical analysis with mean ± SEM
- Separate control sample reporting
- CSV output with all measurements and metadata

### Features
- **Quantification Method**: Percentage of cell area occupied by microtubules
- **Nucleus Exclusion**: Automatic detection and exclusion of blue-stained nuclei
- **Quality Control**: Visual verification through mask and overlay images
- **Batch Processing**: Process multiple cells with single command
- **Dose-Response Analysis**: Automatic curve generation with error bars
- **Flexible Metadata**: Support for multiple experimental conditions
- **Control Handling**: Separate reporting of control samples

### Validation
- Tested with nocodazole dose-response experiment (15-45 µM)
- Validated with DMSO vehicle control and Taxol positive control
- Confirmed dose-dependent decrease in microtubule content
- n=3 biological replicates per condition

## Future Enhancements

### Planned Features
- [ ] GUI interface for easier use
- [ ] Additional thresholding methods
- [ ] Machine learning-based microtubule detection
- [ ] Support for multi-channel analysis
- [ ] Automated cell segmentation from full-field images
- [ ] IC50 calculation from dose-response data
- [ ] Export to GraphPad Prism format
- [ ] Batch comparison across experiments
- [ ] Time-lapse analysis support
- [ ] 3D image stack analysis

### Under Consideration
- [ ] Integration with ImageJ/Fiji
- [ ] Web-based interface
- [ ] Docker container for easy deployment
- [ ] Automated quality control metrics
- [ ] Support for other cytoskeletal structures (actin, intermediate filaments)
