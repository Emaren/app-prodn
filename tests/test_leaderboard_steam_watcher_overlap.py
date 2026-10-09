"""Positive-only Watcher display reconciliation, no fabricated absence proof."""
from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.leaderboard_steam_watcher_overlap import (
    latest_v3_receipt, reconcile, validate_overlay, write_private_overlap,
)
from test_leaderboard_steam_archive_parser_cli import historical_fixture

STEAM = "76561197960265730"
FP = hashlib.sha256(("aoe2war-archived-identity-v1:" + STEAM).encode()).hexdigest()


def overlay(rm=1780, dm=1690, *, include=True):
    return {
        "kind": "aoe2war-qualified-watcher-positive-display-snapshot",
        "schemaVersion": 1,
        "observedAt": "2026-10-09T05:00:00.000Z",
        "productionSource": "a" * 40,
        "databaseReadOnly": [{
            "transaction_mode": "on", "default_mode": "on"
        }],
        "sourceCounts": {
            "immutableReceiptIdentityRows": 1 if include else 0,
            "qualifiedDisplayIdentityRows": 0,
            "positiveDisplayIdentities": 1 if include else 0,
        },
        "sourceCompletenessProven": False,
        "labelsAreAllSigned": False,
        "absenceIsNotEvidence": True,
        "rows": [{
            "identityFingerprint": FP,
            "rmRating": rm, "rmObservedAt":
                "2025-05-01T12:00:00.000Z" if rm is not None else None,
            "dmRating": dm, "dmObservedAt":
                "2025-05-01T12:00:00.000Z" if dm is not None else None,
        }] if include else [],
        "mutations": {
            "production": 0, "parserRows": 0, "identityRows": 0,
            "currentRatingRows": 0, "wolo": 0,
        },
    }


class WatcherOverlapTests(unittest.TestCase):
    def test_positive_watcher_wins_both_lanes(self):
        report = reconcile(historical_fixture(), overlay())
        s = report["summary"]
        self.assertEqual(s["positiveWatcherDisplayLanes"], 2)
        self.assertEqual(s["unknownWatcherAbsenceLanes"], 0)
        self.assertEqual(s["historicalValuesDifferingWatcher"], 2)
        self.assertEqual(s["publishedLastKnownSteamRatings"], 0)
        self.assertEqual(report["records"][0]["lanes"]["rm"]["displayDecision"], 1780)
        self.assertFalse(report["sourceCompletenessProven"])

    def test_missing_positive_is_unknown_not_authorized_fallback(self):
        report = reconcile(historical_fixture(), overlay(include=False))
        s = report["summary"]
        self.assertEqual(s["unknownWatcherAbsenceLanes"], 2)
        self.assertEqual(s["positiveWatcherDisplayLanes"], 0)
        self.assertEqual(s["publishedLastKnownSteamRatings"], 0)
        self.assertIsNone(report["records"][0]["lanes"]["rm"]["displayDecision"])
        self.assertEqual(report["records"][0]["lanes"]["rm"]["status"],
                         "watcher_absence_not_proven")

    def test_one_positive_lane_does_not_affect_other(self):
        report = reconcile(historical_fixture(), overlay(dm=None))
        self.assertEqual(report["summary"]["positiveWatcherDisplayLanes"], 1)
        self.assertEqual(report["summary"]["unknownWatcherAbsenceLanes"], 1)
        self.assertEqual(report["records"][0]["lanes"]["rm"]["displayDecision"], 1780)
        self.assertIsNone(report["records"][0]["lanes"]["dm"]["displayDecision"])

    def test_identical_rating_still_uses_watcher_authority(self):
        report = reconcile(historical_fixture(), overlay(rm=1520, dm=1615))
        self.assertEqual(report["summary"]["historicalValuesMatchingWatcher"], 2)
        self.assertEqual(report["records"][0]["lanes"]["rm"]["status"],
                         "qualified_watcher_display_precedence")

    def test_absence_claim_and_fake_signature_flag_rejected(self):
        for changes in (
            {"sourceCompletenessProven": True},
            {"absenceIsNotEvidence": False},
            {"labelsAreAllSigned": True},
        ):
            with self.subTest(changes=changes):
                with self.assertRaisesRegex(RuntimeError, "positive-only"):
                    validate_overlay(dict(overlay(), **changes))

    def test_missing_readonly_or_mutation_contract_rejected(self):
        p = overlay()
        p["databaseReadOnly"][0]["transaction_mode"] = "off"
        with self.assertRaisesRegex(RuntimeError, "read-only"):
            validate_overlay(p)
        p = overlay()
        p["mutations"]["wolo"] = 1
        with self.assertRaisesRegex(RuntimeError, "mutation"):
            validate_overlay(p)

    def test_duplicated_or_invalid_watcher_fingerprint_rejected(self):
        p = overlay()
        p["rows"].append(dict(p["rows"][0]))
        p["sourceCounts"]["positiveDisplayIdentities"] = 2
        with self.assertRaisesRegex(RuntimeError, "duplicated"):
            validate_overlay(p)
        p = overlay()
        p["rows"][0]["identityFingerprint"] = "bad"
        with self.assertRaisesRegex(RuntimeError, "hash invalid"):
            validate_overlay(p)

    def test_reject_missing_clock_and_malformed_rating(self):
        p = overlay()
        p["rows"][0]["rmObservedAt"] = None
        with self.assertRaisesRegex(RuntimeError, "value-clock"):
            validate_overlay(p)
        p = overlay()
        p["rows"][0]["rmRating"] = True
        with self.assertRaisesRegex(RuntimeError, "value invalid"):
            validate_overlay(p)

    def test_source_header_cannot_be_upgraded_from_legacy_v2(self):
        old = historical_fixture()
        old["schemaVersion"] = 2
        old.pop("privateHistoricalCandidates")
        with self.assertRaisesRegex(RuntimeError, "unexpected archive"):
            reconcile(old, overlay())

    def test_only_v3_restricted_file_is_selected(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            p = historical_fixture()
            envelope = {"payload": p}
            filename = directory / (
                "20261009T045000Z-1234-leaderboard-steam-archive-parser-wave-4.json"
            )
            filename.write_text(json.dumps(envelope))
            filename.chmod(0o600)
            path, found = latest_v3_receipt(directory, 4)
            self.assertEqual(path, filename)
            self.assertEqual(found["schemaVersion"], 3)
            filename.chmod(0o644)
            with self.assertRaisesRegex(RuntimeError, "permissions"):
                latest_v3_receipt(directory, 4)

    def test_private_overlap_receipt_is_exclusive_0600(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = reconcile(historical_fixture(), overlay())
            from datetime import datetime, timezone
            now = datetime(2026, 10, 9, 5, tzinfo=timezone.utc)
            import scripts.leaderboard_steam_watcher_overlap as module
            with patch.object(module, "datetime") as clock:
                clock.now.return_value = now
                path = write_private_overlap(Path(tmp), report)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                with self.assertRaises(FileExistsError):
                    write_private_overlap(Path(tmp), report)
            data = json.loads(path.read_text())
            self.assertEqual(data["summary"]["positiveWatcherDisplayLanes"], 2)
            self.assertNotIn("steamId", path.read_text())
