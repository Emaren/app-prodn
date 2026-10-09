"""Synthetic only: private historical certificate never exposes real identities."""
import hashlib
import json
import unittest

from scripts import leaderboard_steam_archive_certificate as certificate

REVISION = "a" * 40
CLOCK = "2026-09-01T14:22:33.000Z"


def fixture():
    waves = {}
    for wave in range(4, 79):
        steam = str(76561198000000000 + wave)
        fp = hashlib.sha256(
            (certificate.IDENTITY_DOMAIN + steam).encode()
        ).hexdigest()
        replay = format(4 if wave == 5 else wave, "064x")
        sample = {
            "identityFingerprint": fp,
            "replaySha256": replay,
            "result": "historical_candidate_only",
            "gameStatsId": wave + 1000,
            "ratingObservedAt": CLOCK,
            "acceptedSameGame": True,
        }
        candidate = {
            "steamId": steam,
            "replaySha256": replay,
            "gameStatsId": wave + 1000,
            "apiParserSource": REVISION,
            "ratingObservedAt": CLOCK,
            "steamRmRating": 1200 + wave,
            "steamDmRating": 1400 + wave,
            "steamRmSource": "hd_header",
            "steamDmSource": "hd_header",
            "observationAuthority": "historical_candidate_only",
        }
        waves[wave] = {
            "cohortFingerprint": "f" * 64,
            "summary": {
                "sampleWave": wave,
                "apiParserSource": REVISION,
                "deadlineReached": False,
                "sampleHashMismatch": 0,
                "sampleHashesVerified": 1,
            },
            "sampleEvidence": [sample],
            "privateHistoricalCandidates": [candidate],
        }

    inventory = {
        "waves": waves,
        "verifiedIdentityCount": 75,
        "verifiedArtifactCount": 74,
        "sharedReplayIdentityChecks": 1,
        "sharedReplayArtifactHashes": 1,
        "historicalCandidateCount": 75,
        "untrackedLegacyReceiptFiles": 5,
    }
    expected = {
        "verifiedUniqueIdentityProofs": 75,
        "distinctReplayArtifacts": 74,
        "sharedReplayIdentityChecks": 1,
        "sharedReplayArtifactHashes": 1,
        "historicalRmDmPairs": 75,
    }
    return inventory, expected


class PrivateCertificateTests(unittest.TestCase):
    def test_exact_closed_cohort_with_shared_multiplayer_sha(self):
        inventory, expected = fixture()
        result = certificate.certify_inventory(inventory, expected=expected)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["trackedWaves"], 75)
        self.assertEqual(result["historicalRmDmPairs"], 75)
        self.assertEqual(result["distinctReplayArtifacts"], 74)
        self.assertEqual(result["sharedReplayIdentityChecks"], 1)
        self.assertEqual(result["sharedReplayArtifactHashes"], 1)
        self.assertEqual(result["legacyReceiptsExcluded"], 5)
        self.assertEqual(result["publicationsAuthorized"], 0)
        serialized = json.dumps(result)
        self.assertNotIn("steamId", serialized)
        self.assertNotIn("replaySha256", serialized)
        self.assertNotIn("steamRmRating", serialized)
        self.assertNotIn("7656119", serialized)

    def test_missing_wave_stops(self):
        inventory, expected = fixture()
        del inventory["waves"][78]
        with self.assertRaisesRegex(RuntimeError, "tracked waves"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_mismatched_global_count_stops(self):
        inventory, expected = fixture()
        inventory["historicalCandidateCount"] -= 1
        with self.assertRaisesRegex(RuntimeError, "recomputed counts"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_unapproved_benchmark_stops(self):
        inventory, expected = fixture()
        expected["historicalRmDmPairs"] += 1
        with self.assertRaisesRegex(RuntimeError, "closure benchmark"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_cross_wave_identity_duplicate_stops(self):
        inventory, expected = fixture()
        inventory["waves"][5]["sampleEvidence"][0]["identityFingerprint"] = (
            inventory["waves"][4]["sampleEvidence"][0]["identityFingerprint"]
        )
        with self.assertRaisesRegex(RuntimeError, "identity proof collision"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_invalid_parser_revision_stops(self):
        inventory, expected = fixture()
        inventory["waves"][78]["summary"]["apiParserSource"] = "bad"
        with self.assertRaisesRegex(RuntimeError, "invalid API parser revision"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_divergent_parser_revision_stops(self):
        inventory, expected = fixture()
        inventory["waves"][78]["summary"]["apiParserSource"] = "b" * 40
        inventory["waves"][78]["privateHistoricalCandidates"][0]["apiParserSource"] = "b" * 40
        with self.assertRaisesRegex(RuntimeError, "multiple API parser revisions"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_candidate_replay_mismatch_stops(self):
        inventory, expected = fixture()
        inventory["waves"][77]["privateHistoricalCandidates"][0]["replaySha256"] = "0" * 64
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            certificate.certify_inventory(inventory, expected=expected)

    def test_missing_explicit_game_time_stops(self):
        inventory, expected = fixture()
        inventory["waves"][77]["privateHistoricalCandidates"][0]["ratingObservedAt"] = None
        inventory["waves"][77]["sampleEvidence"][0]["ratingObservedAt"] = None
        with self.assertRaisesRegex(RuntimeError, "trusted explicit UTC"):
            certificate.certify_inventory(inventory, expected=expected)


if __name__ == "__main__":
    unittest.main()
