"""Session D exact-target authority review is structurally read-only and fail closed."""
import importlib.util
import io
import json
import pathlib
import subprocess
import unittest
from contextlib import redirect_stdout
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/review/fixtures/session_d_phase12_exact_next_authority_probe.py"
SPEC = importlib.util.spec_from_file_location("session_d_next", SOURCE)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExactNextAuthorityProbeTests(unittest.TestCase):
    def test_remote_hot_rollback_matching_build_id_blocks(self):
        matched = json.dumps({
            "status": "PASS", "entries_checked": 4,
            "exact_build_file_sha_matches": 1, "unclassified_entries": 0,
        })
        with mock.patch.object(MODULE, "run", return_value=subprocess.CompletedProcess(
                [], 0, stdout=matched, stderr="")) as runner:
            gates = {"pinned_next_build_id_file": True}
            payload = {}
            MODULE.remote_hot_rollback_refs(gates, payload)
            self.assertTrue(gates["remote_hot_rollback_scan_complete"])
            self.assertFalse(gates["remote_hot_rollback_no_exact_build_id_match"])
            self.assertEqual(payload["remote_hot_rollback_matches"], 1)
            self.assertTrue(runner.called)

    def test_remote_hot_unknown_symlink_or_unreadable_blocks(self):
        unknown = json.dumps({
            "status": "HOLD_UNKNOWN_READERS", "entries_checked": 2,
            "exact_build_file_sha_matches": 0, "unclassified_entries": 1,
        })
        with mock.patch.object(MODULE, "run", return_value=subprocess.CompletedProcess(
                [], 0, stdout=unknown, stderr="")):
            gates = {"pinned_next_build_id_file": True}
            payload = {}
            MODULE.remote_hot_rollback_refs(gates, payload)
            self.assertFalse(gates["remote_hot_rollback_scan_complete"])
            self.assertFalse(gates["remote_hot_rollback_no_exact_build_id_match"])

    def test_remote_hot_unreachable_blocks(self):
        with mock.patch.object(MODULE, "run", return_value=None):
            gates = {"pinned_next_build_id_file": True}
            MODULE.remote_hot_rollback_refs(gates, {})
            self.assertFalse(gates["remote_hot_rollback_scan_complete"])

    def test_any_local_success_still_cannot_authorize_deletion(self):
        # Simulate optimistic reported data. The irreversible decision cannot
        # arise from this fixture; it always leaves independent domains HOLD.
        mocked_checks = (
            "source_checks", "readers_and_size", "release_evidence",
            "release_status", "remote_hot_rollback_refs",
        )
        patches = [
            mock.patch.object(MODULE, name, side_effect=lambda *args, **kwargs: args[0].update(
                {"local_evidence_readonly": True}
            )) for name in mocked_checks
        ]
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = io.StringIO()
            with redirect_stdout(output):
                code = MODULE.main()
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertIs(report["deletion_authorized"], False)
        self.assertIs(report["gates"]["remote_cold_archive_and_noncertified_authority"], False)
        self.assertIs(report["gates"]["independent_off_data_restore_or_native_rebuild"], False)
        self.assertIs(report["gates"]["future_build_controller_user_refs"], False)

    def test_exact_worktree_protection_rejects_unavailable_ancestor(self):
        with mock.patch.object(MODULE, "plain_directory", return_value=False):
            self.assertFalse(MODULE.valid_ancestry(MODULE.NEXT))


if __name__ == "__main__":
    unittest.main()
