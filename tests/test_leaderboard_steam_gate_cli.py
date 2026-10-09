"""Guard tests for second-stage Steam rating provenance diagnostic."""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "gate", ROOT / "scripts" / "leaderboard_steam_gate.py"
)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def fixture():
    return {
        "kind": "aoe2war-steam-rating-gate-funnel",
        "schemaVersion": 4,
        "databaseReadOnly": [{"transaction_mode": "on", "default_mode": "on"}],
        "counts": {"publicIdentityRows": 5, "rmRated": 1, "dmRated": 1,
                   "rmMissing": 4, "dmMissing": 4, "noExactSteamIdentity": 2},
        "histogram": {
            lane: {
                **{name: 0 for name in (
                    "no_numeric_rating_in_stored_game_stats",
                    "nonqualifying_parse_source_only",
                    "invalid_clock_uploader_or_hash",
                    "missing_live_monitor_provenance",
                    "signature_or_legacy_cohort_unqualified",
                    "client_server_hash_proof_unqualified",
                    "checkpoint_role_or_finality_unqualified",
                    "rating_field_source_or_duplicate_identity",
                    "passes_all_watcher_game_stats_gates",
                )},
                "invalid_clock_uploader_or_hash": 1,
                "missing_live_monitor_provenance": 1,
            } for lane in ("rm", "dm")
        },
        "blockedDetails": {lane: {
            "clock": {"game_played_on_absent_or_invalid": 1},
            "provenance": {"watcher_upload_object_absent": 1},
            "source": {},
            "stage3Context": {name: 0 for name in (
                "signatureVerifiedTrue", "signatureVerifiedFalse",
                "checksumVerifiedTrue", "hashesMatchReplay",
                "fileRolePresent", "beforeFrozenCutoff",
            )},
        } for lane in ("rm", "dm")},
        "receiptCorrelation": {
            "targetSteamIdentities": 1,
            "candidateReplayHashes": 4,
            "scannedAttemptRows": 10,
            "attemptBatches": 1,
            "matchingAttempt": 1,
            "watcherAttempt": 1,
            "currentObservationPresent": 1,
            "observationBindsIdentity": 1,
            "observationHasLaneNumeric": 1,
            "observationLiveAndSigned": 0,
            "observationHasVerifiedSha": 0,
            "observationArchiveVerified": 0,
        },
        "mutations": {"production": 0, "parserRows": 0, "identityRows": 0,
                      "currentRatingRows": 0, "wolo": 0},
    }


class GateCliTests(unittest.TestCase):
    def run_with(self, payload):
        actual = SimpleNamespace()
        actual.run_remote = lambda command: payload
        actual.write_receipt = lambda _name, _payload: self.path
        fake_spec = SimpleNamespace(
            loader=SimpleNamespace(exec_module=lambda _target: None)
        )
        with patch.object(gate.importlib.util, "spec_from_file_location",
                          return_value=fake_spec), patch.object(
                gate.importlib.util, "module_from_spec", return_value=actual
            ), redirect_stdout(io.StringIO()) as out:
            gate.main()
        return out.getvalue()

    def test_real_sql_proof_shape_and_conservation(self):
        with tempfile.TemporaryDirectory() as d:
            self.path = Path(d) / "receipt.json"
            self.path.write_text("{}")
            output = self.run_with(fixture())
            self.assertIn('"readOnly": true', output)
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_remote_observer_scans_indexed_bounded_chunks_without_timeout_override(self):
        remote = (ROOT / "scripts" / "leaderboard_steam_gate_remote.mjs").read_text()
        self.assertIn("WHERE id > $1 ORDER BY id ASC LIMIT $2", remote)
        self.assertIn("const BATCH_LIMIT = 512;", remote)
        self.assertIn("batches < MAX_BATCHES", remote)
        self.assertIn("game.id <= cursor", remote)
        self.assertIn("evidenceStage(", remote)
        self.assertNotIn("COUNT(*) OVER", remote)
        self.assertIn("FROM replay_parse_attempts WHERE id > $1 ORDER BY id ASC LIMIT $2", remote)
        self.assertIn("obsPlayers.some(p => p?.steam_id === id)", remote)
        self.assertNotIn("SET statement_timeout", remote)
        self.assertNotIn("UPDATE game_stats", remote)
        self.assertNotIn("INSERT INTO", remote)

    def test_missing_provenance_detail_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            self.path = Path(d) / "none.json"
            data = fixture()
            data["blockedDetails"]["rm"]["provenance"] = {}
            with self.assertRaisesRegex(RuntimeError, "blocked-detail"):
                self.run_with(data)
            self.assertFalse(self.path.exists())

    def test_stage_context_cannot_exceed_blocked_cohort(self):
        with tempfile.TemporaryDirectory() as d:
            self.path = Path(d) / "none.json"
            data = fixture()
            data["blockedDetails"]["dm"]["stage3Context"]["hashesMatchReplay"] = 2
            with self.assertRaisesRegex(RuntimeError, "blocked-detail"):
                self.run_with(data)
            self.assertFalse(self.path.exists())

    def test_receipt_correlation_rejects_unearned_authority(self):
        with tempfile.TemporaryDirectory() as d:
            self.path = Path(d) / "none.json"
            data = fixture()
            data["receiptCorrelation"]["observationLiveAndSigned"] = 2
            with self.assertRaisesRegex(RuntimeError, "parse-attempt receipt"):
                self.run_with(data)
            self.assertFalse(self.path.exists())

    def test_receipt_correlation_conserves_target_ids(self):
        with tempfile.TemporaryDirectory() as d:
            self.path = Path(d) / "none.json"
            data = fixture()
            data["receiptCorrelation"]["targetSteamIdentities"] = 0
            with self.assertRaisesRegex(RuntimeError, "target conservation"):
                self.run_with(data)
            self.assertFalse(self.path.exists())

    def test_denies_bad_readonly_proof(self):
        for proof in [{}, [], None, [{"transaction_mode": "off", "default_mode": "on"}]]:
            with self.subTest(proof=proof), tempfile.TemporaryDirectory() as d:
                self.path = Path(d) / "none.json"
                data = fixture()
                data["databaseReadOnly"] = proof
                with self.assertRaisesRegex(RuntimeError, "read-only"):
                    self.run_with(data)
                self.assertFalse(self.path.exists())

    def test_denies_count_mismatch_and_mutations(self):
        for kind in ("mismatch", "mutation"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as d:
                self.path = Path(d) / "none.json"
                data = fixture()
                if kind == "mismatch":
                    data["histogram"]["rm"]["missing_live_monitor_provenance"] = 2
                    message = "conservation"
                else:
                    data["mutations"]["wolo"] = 1
                    message = "mutation"
                with self.assertRaisesRegex(RuntimeError, message):
                    self.run_with(data)
                self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
