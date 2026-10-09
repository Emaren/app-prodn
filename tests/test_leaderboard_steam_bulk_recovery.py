"""Bulk recovery planner must resume safely without credential or public writes."""
import copy
import hashlib
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import leaderboard_steam_bulk_recovery as bulk
from test_leaderboard_steam_archive_parser_cli import historical_fixture


def make_payload(wave):
    payload = copy.deepcopy(historical_fixture())
    payload["summary"].update(
        sampleWave=wave,
        sampleOffsetIdentities=6 + (wave - 1) * 24,
        selectedSampleLimit=24,
    )
    if wave != 4:
        sid = str(76561197960265730 + wave)
        first = payload["sampleEvidence"][0]
        first["identityFingerprint"] = hashlib.sha256(
            ("aoe2war-archived-identity-v1:" + sid).encode()
        ).hexdigest()
        payload["privateHistoricalCandidates"][0]["steamId"] = sid
        for i, record in enumerate(payload["sampleEvidence"]):
            record["replaySha256"] = f"{wave * 1000 + i + 300:064x}"
            if i:
                record["identityFingerprint"] = f"{wave * 1000 + i + 1:064x}"
        payload["privateHistoricalCandidates"][0]["replaySha256"] = (
            payload["sampleEvidence"][0]["replaySha256"]
        )
    return payload


def save(directory, wave, payload, suffix="new"):
    path = Path(directory) / (
        f"20261009T100000Z-{suffix}-leaderboard-steam-archive-parser-wave-{wave}.json"
    )
    path.write_text(json.dumps({"payload": payload}))
    path.chmod(0o600)
    return path


class BulkRecoveryTests(unittest.TestCase):
    def test_strict_interval_limit_and_default_readonly(self):
        empty = {
            "waves": {}, "verifiedIdentityCount": 0,
            "verifiedArtifactCount": 0,
            "sharedReplayIdentityChecks": 0,
            "sharedReplayArtifactHashes": 0,
            "historicalCandidateCount": 0,
            "untrackedLegacyReceiptFiles": 0,
        }
        self.assertEqual(
            bulk.selection_plan(empty, 5, 12)["maxNewIdentityWindows"], 192
        )
        for start, stop in ((5, 13), (4, 6), (5, 79), (8, 7)):
            with self.subTest(start=start, stop=stop):
                with self.assertRaisesRegex(ValueError, "1–8"):
                    bulk.selection_plan(empty, start, stop)

    def test_anchor_required_and_public_counts_are_aggregate_only(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(RuntimeError, "anchor"):
                bulk.verified_inventory(Path(root))
            save(root, 4, make_payload(4))
            inventory = bulk.verified_inventory(Path(root))
            self.assertEqual(inventory["verifiedIdentityCount"], 6)
            self.assertEqual(inventory["historicalCandidateCount"], 1)
            plan = bulk.selection_plan(inventory, 4 + 1, 4 + 2)
            self.assertEqual(plan["remainingWaves"], [5, 6])
            self.assertFalse(plan["productionWritesAllowed"])
            self.assertFalse(plan["woloWritesAllowed"])
            self.assertNotIn("76561197960265730", json.dumps(plan))

    def test_same_wave_duplicate_receipt_is_not_counted_twice(self):
        with tempfile.TemporaryDirectory() as root:
            payload = make_payload(4)
            save(root, 4, payload, "original")
            save(root, 4, payload, "repeat")
            self.assertEqual(bulk.verified_inventory(Path(root))["verifiedIdentityCount"], 6)

    def test_same_wave_conflict_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4), "a")
            different = make_payload(4)
            different["privateHistoricalCandidates"][0]["steamRmRating"] = 1601
            # Revalidate any copy independently or cross-file change
            # would otherwise silently choose a variant.
            save(root, 4, different, "b")
            with self.assertRaises(RuntimeError):
                bulk.verified_inventory(Path(root))

    def test_cross_wave_sha_may_belong_to_different_players(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4))
            save(root, 5, make_payload(5))
            another_player = make_payload(6)
            # Two players in one replay have distinct Steam fingerprints
            # but may use the same SHA-256 original multiplayer recording.
            reused_sha = make_payload(5)["sampleEvidence"][1]["replaySha256"]
            another_player["sampleEvidence"][1]["replaySha256"] = reused_sha
            save(root, 6, another_player)
            inventory = bulk.verified_inventory(Path(root))
            self.assertEqual(inventory["verifiedIdentityCount"], 18)
            self.assertEqual(inventory["verifiedArtifactCount"], 17)
            self.assertEqual(inventory["sharedReplayIdentityChecks"], 1)
            self.assertEqual(inventory["sharedReplayArtifactHashes"], 1)
            plan = bulk.selection_plan(inventory, 5, 6)
            self.assertEqual(plan["remainingWaves"], [])
            self.assertEqual(plan["distinctVerifiedReplayArtifactsToDate"], 17)
            self.assertEqual(plan["sharedReplayIdentityChecksToDate"], 1)

    def test_duplicate_steam_identity_across_waves_still_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4))
            save(root, 5, make_payload(5))
            bad = make_payload(6)
            bad["sampleEvidence"][1]["identityFingerprint"] = (
                make_payload(5)["sampleEvidence"][1]["identityFingerprint"]
            )
            save(root, 6, bad)
            with self.assertRaisesRegex(RuntimeError, "overlapping Steam identity"):
                bulk.verified_inventory(Path(root))

    def test_duplicate_sha_within_same_wave_remains_invalid(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4))
            bad = make_payload(5)
            bad["sampleEvidence"][1]["replaySha256"] = (
                bad["sampleEvidence"][2]["replaySha256"]
            )
            save(root, 5, bad)
            with self.assertRaisesRegex(RuntimeError, "manifest duplication"):
                bulk.verified_inventory(Path(root))

    def test_population_drift_stops_without_inflating_counts(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4))
            altered = make_payload(5)
            altered["cohortFingerprint"] = "d" * 64
            save(root, 5, altered)
            with self.assertRaisesRegex(RuntimeError, "cohort fingerprint drift"):
                bulk.verified_inventory(Path(root))

    def test_private_receipt_permissions_must_be_restricted(self):
        with tempfile.TemporaryDirectory() as root:
            p = save(root, 4, make_payload(4))
            p.chmod(0o644)
            with self.assertRaisesRegex(RuntimeError, "permissions"):
                bulk.verified_inventory(Path(root))

    def test_resume_skips_existing_waves_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4))
            save(root, 5, make_payload(5))
            calls = []
            def fake_runner(wave):
                calls.append(wave)
                if wave == 7:
                    raise RuntimeError("protected remote source failure")
                save(root, wave, make_payload(wave))
            with redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "remote source failure"):
                    bulk.execute_batch(Path(root), 5, 7, runner=fake_runner)
            self.assertEqual(calls, [6, 7])
            inventory = bulk.verified_inventory(Path(root))
            self.assertEqual(sorted(inventory["waves"]), [4, 5, 6])
            self.assertEqual(
                bulk.selection_plan(inventory, 5, 7)["remainingWaves"], [7]
            )

    def test_legacy_receipt_not_promoted_into_numeric_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            save(root, 4, make_payload(4))
            legacy = make_payload(5)
            legacy["schemaVersion"] = 2
            legacy.pop("privateHistoricalCandidates")
            save(root, 5, legacy)
            x = bulk.verified_inventory(Path(root))
            self.assertEqual(x["untrackedLegacyReceiptFiles"], 1)
            self.assertEqual(bulk.selection_plan(x, 5, 5)["remainingWaves"], [5])


if __name__ == "__main__":
    unittest.main()
