"""Offline regression tests for the cross-repository read-only Wolo CLI router."""
from __future__ import annotations

import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("wolo_frontier_test", ROOT / "scripts" / "aoe2_wolo_frontier.py")
router = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(router)
PINNED = b"#!/usr/bin/env python3\n# FINANCIAL_HARD_HOLD\ndef render_brief():\n    pass\n"


class WoloFrontierTests(unittest.TestCase):
    def test_pinned_source_is_from_git_object_not_mutable_worktree(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "wolo"
            repo.mkdir()
            calls = []

            def mock_run(argv, **kwargs):
                calls.append((argv, kwargs))
                return subprocess.CompletedProcess(argv, 0, stdout=PINN, stderr=b"")

            data = router.reviewed_cockpit(repo, run=mock_run)
            self.assertEqual(data, PINNED)
            self.assertEqual(calls[0][0][-1], router.REVIEWED_OPS_COMMIT + ":" + router.COCKPIT_PATH)
            self.assertNotIn("shell", calls[0][1])

    def test_source_missing_or_invalid_fails_without_ssh(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(router.reviewed_cockpit(Path(tmp) / "absent"))
            repo = Path(tmp) / "wolo"
            repo.mkdir()

            def wrong_source(argv, **kwargs):
                return subprocess.CompletedProcess(argv, 0, stdout=b"unsafe", stderr=b"")

            self.assertIsNone(router.reviewed_cockpit(repo, run=wrong_source))

    def test_sends_only_reviewed_source_to_pinned_vps_with_isolated_python(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "projects" / "WoloChain-wolo-1").mkdir(parents=True)
            calls = []

            def mock_run(argv, **kwargs):
                calls.append((argv, kwargs))
                if argv[0] == "git":
                    return subprocess.CompletedProcess(argv, 0, stdout=PINNED, stderr=b"")
                self.assertEqual(argv[0], "ssh")
                self.assertEqual(argv[-5:], [router.REMOTE, "python3", "-I", "-", "--brief"])
                self.assertEqual(kwargs["input"], PINNED)
                self.assertTrue(kwargs["capture_output"])
                self.assertFalse(kwargs["check"])
                self.assertNotIn("shell", kwargs)
                self.assertNotIn("systemctl", repr(argv))
                return subprocess.CompletedProcess(
                    argv, 3,
                    stdout=b"WOLO MAINNET\nFINANCIAL_HARD_HOLD | CUSTODY UNAVAILABLE | NO RELEASE AUTHORITY\n",
                    stderr=b"",
                )

            with patch.object(router, "reviewed_cockpit", side_effect=lambda *_args, **_kwargs: PINNED):
                with contextlib.redirect_stdout(io.StringIO()) as out:
                    with contextlib.redirect_stderr(io.StringIO()) as err:
                        status = router.run_frontier(["brief"], home=Path(tmp), run=mock_run)
            self.assertEqual(status, 3)
            self.assertEqual(len(calls), 1)
            self.assertIn("NO RELEASE AUTHORITY", out.getvalue())
            self.assertIn("REPORT_ONLY", err.getvalue())

    def test_remote_exit_zero_can_never_imply_financial_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "projects" / "WoloChain-wolo-1").mkdir(parents=True)
            def mock_run(argv, **kwargs):
                return subprocess.CompletedProcess(argv, 0, stdout=b"release authorized", stderr=b"")
            with patch.object(router, "reviewed_cockpit", return_value=PINNED):
                with contextlib.redirect_stderr(io.StringIO()) as err:
                    with contextlib.redirect_stdout(io.StringIO()) as out:
                        status = router.run_frontier(["brief"], home=Path(tmp), run=mock_run)
            self.assertEqual(status, 4)
            self.assertNotIn("release authorized", out.getvalue())
            self.assertIn("no authenticated cockpit HOLD", err.getvalue())

    def test_failed_ssh_does_not_leak_private_stderr_or_emulate_hold(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "projects" / "WoloChain-wolo-1").mkdir(parents=True)
            def mock_run(argv, **kwargs):
                return subprocess.CompletedProcess(argv, 255, stdout=b"", stderr=b"SECRET-HOST-PATH")
            with patch.object(router, "reviewed_cockpit", return_value=PINNED):
                with contextlib.redirect_stderr(io.StringIO()) as err:
                    status = router.run_frontier(["brief"], home=Path(tmp), run=mock_run)
            self.assertEqual(status, 4)
            self.assertNotIn("SECRET-HOST-PATH", err.getvalue())

    def test_no_ssh_if_pinned_source_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            def mock_run(argv, **kwargs):
                calls.append(argv)
                raise AssertionError("SSH must never run")
            with contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(router.run_frontier(["brief"], home=Path(tmp), run=mock_run), 4)
            self.assertEqual(calls, [])
            self.assertIn("No VPS action occurred", err.getvalue())

    def test_incorrect_mode_cannot_ask_for_mutation(self):
        with self.assertRaises(SystemExit):
            router.run_frontier(["deploy"], home=Path("/missing"))

    def test_reviewed_source_size_and_expected_header_enforced(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "wolo"
            repo.mkdir()
            for contents in (b"#!/usr/bin/env python3\n", PINNED + b"x" * router.MAX_SOURCE_BYTES):
                def mock_run(argv, **kwargs):
                    return subprocess.CompletedProcess(argv, 0, stdout=contents, stderr=b"")
                self.assertIsNone(router.reviewed_cockpit(repo, run=mock_run))


if __name__ == "__main__":
    unittest.main()
