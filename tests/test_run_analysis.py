"""Tests for run_analysis.py (run: python -m unittest tests/test_run_analysis.py -v)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run_analysis  # noqa: E402


class RunAnalysisArgsTest(unittest.TestCase):
    def test_defaults_are_the_old_hardcoded_paths(self):
        args = run_analysis.parse_args([])
        self.assertEqual(args.input, "/Users/kalp/Desktop/Organized Cropped Cells")
        self.assertEqual(args.output, "/Users/kalp/Desktop/Results_New")
        self.assertEqual(args.metadata, "metadata.csv")

    def test_flags_override_defaults(self):
        args = run_analysis.parse_args(["--input", "cells", "--output", "out", "--metadata", "m.csv"])
        self.assertEqual((args.input, args.output, args.metadata), ("cells", "out", "m.csv"))

    def test_build_command(self):
        cmd = run_analysis.build_command("/in", "/out", "m.csv")
        self.assertEqual(cmd, [sys.executable, "microtubule_quantification.py",
                               "--input", "/in", "--output", "/out", "--metadata", "m.csv"])


if __name__ == "__main__":
    unittest.main()
