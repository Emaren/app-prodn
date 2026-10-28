#!/usr/bin/env python3
"""Exact three Next build reclaim: adversarial, fixture-based safety contracts."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
from unittest import TestCase, mock
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/aoe2_storage_reclaim_three_next.py"
SPEC = importlib.util.spec_from_file_location("mac_three_next", SOURCE)
assert SPEC and SPEC.loader
reclaim = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reclaim)


class ThreeNextTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="test-next-reclaim-")
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.project = self.home / "projects/AoE2HDBets"
        self.project.mkdir(parents=True)
        self.old_project = reclaim.PROJECT
        reclaim.PROJECT = self.project
        self.addCleanup(setattr, reclaim, "PROJECT", self.old_project)
        self.repo = self.project / ".worktrees/codex-authenticated-satchel-deposit"
        self.repo.mkdir(parents=True)
        subprocess.run(["git", "-C", str(self.repo), "init", "-q"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "-c", "user.email=test@example.test",
                        "-c", "user.name=Fixture", "commit", "-q", "--allow-empty",
                        "-m", "fixture"], check=True)
        self.build = self.repo / ".next"
        self.build.mkdir()
        (self.build / "BUILD_ID").write_text("blonE7yFq5o1cHzYKgxU7")

    def test_hardcoded_only_three_known_rebuildable_worktrees(self):
        self.assertEqual(len(reclaim.TARGETS), 3)
        self.assertNotIn("app-prodn-e5-seal", str(reclaim.TARGETS))
        self.assertNotIn("aoe2war-recovery", str(reclaim.TARGETS))
        self.assertNotIn("codex-runtimes", str(reclaim.TARGETS))
        self.assertNotIn("Downloads", str(reclaim.TARGETS))

    def test_clean_worktree_and_exact_build_id_can_preview(self):
        with mock.patch.object(reclaim, "dir_stats", return_value=(1_200_000_000, 101)):
            evidence = reclaim.candidate(self.repo, "blonE7yFq5o1cHzYKgxU7")
        self.assertEqual(evidence["path"], str(self.build))
        self.assertTrue(self.build.exists())

    def test_mismatched_build_id_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "BUILD_ID_DRIFT"):
            reclaim.candidate(self.repo, "another-id")

    def test_tracked_build_file_fails_closed(self):
        subprocess.run(["git", "-C", str(self.repo), "add", "-f", ".next/BUILD_ID"],
                       check=True, capture_output=True)
        with mock.patch.object(reclaim, "dir_stats", return_value=(1_200_000_000, 101)):
            with self.assertRaisesRegex(RuntimeError, "TRACKED_BUILD_FILES"):
                reclaim.candidate(self.repo, "blonE7yFq5o1cHzYKgxU7")

    def test_dirty_tracked_source_fails_closed(self):
        src = self.repo / "package.json"
        src.write_text('{"name":"original"}')
        subprocess.run(["git", "-C", str(self.repo), "add", "package.json"],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.repo), "-c", "user.email=test@example.test",
                        "-c", "user.name=Fixture", "commit", "-q", "-m", "tracked"],
                       check=True, capture_output=True)
        src.write_text('{"name":"changed"}')
        with mock.patch.object(reclaim, "dir_stats", return_value=(1_200_000_000, 101)):
            with self.assertRaisesRegex(RuntimeError, "WORKTREE_DIRTY"):
                reclaim.candidate(self.repo, "blonE7yFq5o1cHzYKgxU7")

    def test_symlink_build_directory_fails_closed(self):
        (self.build / "BUILD_ID").unlink()
        self.build.rmdir()
        elsewhere = self.home / "protected"
        elsewhere.mkdir()
        (elsewhere / "BUILD_ID").write_text("blonE7yFq5o1cHzYKgxU7")
        self.build.symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, "SYMLINK_OR_NONDIRECTORY"):
            reclaim.candidate(self.repo, "blonE7yFq5o1cHzYKgxU7")
        self.assertTrue((elsewhere / "BUILD_ID").exists())

    def test_nested_symlink_and_hardlink_refused(self):
        (self.build / "real.dat").write_bytes(b"keep")
        (self.build / "link.dat").symlink_to(self.home / "protected")
        with self.assertRaisesRegex(RuntimeError, "NONREGULAR_OR_SYMLINK"):
            reclaim.dir_stats(self.build)
        (self.build / "link.dat").unlink()
        os.link(self.build / "real.dat", self.build / "hard.dat")
        with self.assertRaisesRegex(RuntimeError, "SHARED_HARDLINK"):
            reclaim.dir_stats(self.build)

    def test_live_worktree_process_refused(self):
        def fake(cmd, timeout=30):
            if cmd[0] == "ps":
                return ("node " + str(self.repo) + "/node_modules/next/server.js").encode()
            return b""
        with mock.patch.object(reclaim, "command", side_effect=fake):
            with self.assertRaisesRegex(RuntimeError, "PROCESS_REFERENCES_BUILD_OUTPUT"):
                reclaim.current_process_references([self.build])

    def test_open_build_file_refused(self):
        def fake(cmd, timeout=30):
            if cmd[0] == "lsof":
                return ("p123\nn" + str(self.build / "BUILD_ID") + "\n").encode()
            return b""
        with mock.patch.object(reclaim, "command", side_effect=fake):
            with self.assertRaisesRegex(RuntimeError, "OPEN_FILE_IN_BUILD_OUTPUT"):
                reclaim.current_process_references([self.build])


if __name__ == "__main__":
    unittest.main()
