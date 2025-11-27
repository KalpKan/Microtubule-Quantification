#!/bin/bash

# Script to push Microtubule Quantification Tool to GitHub
# Repository: https://github.com/KalpKan/Microtubule-Quantification

echo "================================================"
echo "Pushing to GitHub: Microtubule-Quantification"
echo "================================================"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
    git branch -M main
    git remote add origin https://github.com/KalpKan/Microtubule-Quantification.git
else
    echo "Git repository already initialized."
fi

echo ""
echo "Adding files to git..."
git add .

echo ""
echo "Creating commit..."
git commit -m "Add microtubule quantification tool with comprehensive documentation

- Automated microtubule quantification from fluorescent images
- Nucleus exclusion using blue channel detection
- Batch processing with metadata support
- Dose-response curve generation
- Comprehensive documentation and usage guide
- Example results from nocodazole dose-response experiment"

echo ""
echo "Pushing to GitHub..."
git push -u origin main

echo ""
echo "================================================"
echo "✓ Successfully pushed to GitHub!"
echo "================================================"
echo ""
echo "View your repository at:"
echo "https://github.com/KalpKan/Microtubule-Quantification"
echo ""
