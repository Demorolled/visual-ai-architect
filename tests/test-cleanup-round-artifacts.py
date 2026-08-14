#!/usr/bin/env python3
"""Unit tests for scripts/cleanup-round-artifacts.py retention logic.

Run:  python3 tests/test-cleanup-round-artifacts.py
"""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "cleanup-round-artifacts.py"
_spec = importlib.util.spec_from_file_location("cleanup_round_artifacts", _SCRIPT)
c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(c)


class ParseRoundTest(unittest.TestCase):
    def test_parses_round_dir_names(self):
        self.assertEqual(c.parse_round_dir("round6-export"), (6, "-export"))
        self.assertEqual(c.parse_round_dir("round12-q4_0-export_gguf"), (12, "-q4_0-export_gguf"))
        self.assertEqual(c.parse_round_dir("round6-adapter"), (6, "-adapter"))

    def test_ignores_non_round_dirs(self):
        self.assertIsNone(c.parse_round_dir("colab"))
        self.assertIsNone(c.parse_round_dir("roundx-export"))
        self.assertIsNone(c.parse_round_dir("adapter"))


class CloudCleanupTest(unittest.TestCase):
    def setUp(self):
        self._orig = c.CLOUD_OUT
        self.tmp = Path(tempfile.mkdtemp())
        c.CLOUD_OUT = self.tmp

    def tearDown(self):
        c.CLOUD_OUT = self._orig
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _make(self, *names):
        for n in names:
            (self.tmp / n).mkdir(parents=True, exist_ok=True)

    def test_deletes_all_older_rounds_and_newest_exports(self):
        self._make(
            "round5-merged", "round5-export", "round5-q4_0-export",
            "round5-export_gguf", "round5-q4_0-export_gguf",
            "round5-adapter", "round5-gguf",
            "round6-merged", "round6-export", "round6-q4_0-export",
            "round6-export_gguf", "round6-q4_0-export_gguf",
            "round6-adapter", "round6-gguf",
        )
        deletions = {p.name for p in c.plan_cloud_cleanup()}
        # All of round5 goes (superseded).
        for n in ("round5-merged", "round5-export", "round5-q4_0-export",
                  "round5-export_gguf", "round5-q4_0-export_gguf",
                  "round5-adapter", "round5-gguf"):
            self.assertIn(n, deletions, f"{n} should be deleted (older round)")
        # Newest round: exports/dups go, adapter + F16 gguf survive.
        for n in ("round6-merged", "round6-export", "round6-q4_0-export",
                  "round6-export_gguf", "round6-q4_0-export_gguf"):
            self.assertIn(n, deletions, f"{n} should be deleted (superseded export)")
        self.assertNotIn("round6-adapter", deletions)
        self.assertNotIn("round6-gguf", deletions)

    def test_older_only_keeps_newest_exports(self):
        self._make(
            "round5-merged", "round5-adapter",
            "round6-merged", "round6-adapter",
        )
        deletions = {p.name for p in c.plan_cloud_cleanup(older_only=True)}
        self.assertIn("round5-merged", deletions)  # older still goes
        self.assertNotIn("round6-merged", deletions)  # newest kept with --older-only
        self.assertNotIn("round6-adapter", deletions)

    def test_no_rounds_means_no_deletions(self):
        self.assertEqual(c.plan_cloud_cleanup(), [])


class GuiCleanupTest(unittest.TestCase):
    def setUp(self):
        self._orig = (c.GUI_MODELS, c.GUI_MODELS_GGUF)
        self.tmp = Path(tempfile.mkdtemp())
        self.models = self.tmp / "models"
        self.models_gguf = self.tmp / "models_gguf"
        self.models.mkdir()
        self.models_gguf.mkdir()
        c.GUI_MODELS = self.models
        c.GUI_MODELS_GGUF = self.models_gguf

    def tearDown(self):
        c.GUI_MODELS, c.GUI_MODELS_GGUF = self._orig
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_older_only_skips_gui_dirs(self):
        # --older-only is "keep the newest round for inspection" — the GUI
        # copies are part of that round, so they must survive too.
        self.assertEqual(c.plan_gui_cleanup(older_only=True), [])

    def test_default_plans_gui_deletion_when_no_training(self):
        # Training not running (tests have no launch-qlora proc) and dirs
        # empty → both GUI dirs are planned for deletion.
        deletions = {p.name for p in c.plan_gui_cleanup(older_only=False)}
        self.assertIn("models", deletions)
        self.assertIn("models_gguf", deletions)


class ParseTargetsTest(unittest.TestCase):
    def test_parses_dspark_target_env(self):
        with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as f:
            f.write("DSPARK_TARGET=/models/tuned.gguf\n")
            path = Path(f.name)
        self._orig = c.TARGET_ENV
        c.TARGET_ENV = path
        try:
            targets = c.live_targets()
            self.assertEqual(len(targets), 1)
            self.assertEqual(next(iter(targets)), Path("/models/tuned.gguf").resolve())
        finally:
            c.TARGET_ENV = self._orig
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
