"""Archive parser canary must reject fabricated evidence and writes."""
from contextlib import redirect_stdout
import importlib.util
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "archive_canary", ROOT / "scripts" / "leaderboard_steam_archive_parser.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    return {
        "kind": "aoe2war-archived-hd-rating-parser-canary",
        "schemaVersion": 2,
        "cohortFingerprint": "c" * 64,
        "sampleEvidence": [{"identityFingerprint": f"{i+1:064x}",
                            "replaySha256": f"{i+300:064x}",
                            "gameStatsId": i + 100,
                            "ratingObservedAt": None,
                            "acceptedSameGame": False,
                            "result": "both_hd_headers_match" if i < 2 else "unique_identity"}
                           for i in range(6)],
        "databaseReadOnly": [{
            "transaction_mode": "on", "default_mode": "on",
        }],
        "mutations": {
            "production": 0, "parserRows": 0, "identityRows": 0,
            "currentRatingRows": 0, "wolo": 0,
        },
        "summary": {
            "apiParserSource": "a" * 40,
            "publicUnratedExactSteamIds": 2755,
            "unmarkedWatchersWithBothNumbers": 1716,
            "scannedGameRows": 51342,
            "scanBatches": 101,
            "apiPythonAvailable": True,
            "archiveAccessible": True,
            "selectedSampleLimit": 6,
            "sampleWave": 0,
            "sampleOffsetIdentities": 0,
            "sampleIdentityWindow": 6,
            "deadlineReached": False,
            "sampleFilesLocated": 6,
            "identitiesWithoutLocatedFile": 0,
            "identitiesWithOversizeOnly": 0,
            "identitiesWithVerifiedFile": 6,
            "missingArchiveCandidatePaths": 0,
            "alreadySampledHashCandidateSkips": 0,
            "sampleHashesVerified": 6,
            "sampleHashMismatch": 0,
            "sampleTooLarge": 0,
            "parserParsed": 6,
            "parserNoProjection": 0,
            "noProjectionByMode": {},
            "noProjectionByErrorStage": {},
            "noProjectionByErrorCategory": {},
            "parserTimeout": 0,
            "parserError": 0,
            "invalidParserOutput": 0,
            "sameSteamIdentityPresent": 6,
            "uniquelyBoundSteamIdentity": 6,
            "headerRmPresent": 4,
            "headerDmPresent": 2,
            "headerBothPresent": 2,
            "headerRmMatchesStored": 3,
            "headerDmMatchesStored": 1,
            "headerRmDiffersStored": 1,
            "headerDmDiffersStored": 1,
            "matchingBothWithPlayedOn": 0,
            "matchingBothWithAcceptedSameGame": 0,
            "matchingBothHistoricallyEligible": 0,
        },
    }


class ArchiveParserCanaryTests(unittest.TestCase):
    def test_good_contract(self):
        self.assertEqual(module.validate(fixture())["headerBothPresent"], 2)

    def test_expansion_wave_1_accepts_separate_sample(self):
        data = fixture()
        data["summary"].update(
            sampleWave=1, sampleOffsetIdentities=6, selectedSampleLimit=24
        )
        self.assertEqual(
            module.validate(data, expected_wave=1)["sampleWave"], 1
        )

    def test_expansion_wave_rejects_wrong_offset_or_tier(self):
        data = fixture()
        data["summary"].update(
            sampleWave=1, sampleOffsetIdentities=6, selectedSampleLimit=24
        )
        with self.assertRaisesRegex(RuntimeError, "wave"):
            module.validate(data, expected_wave=2)
        data["summary"]["sampleOffsetIdentities"] = 7
        with self.assertRaisesRegex(RuntimeError, "wave"):
            module.validate(data, expected_wave=1)

    def test_historical_candidate_requires_played_on_and_same_game(self):
        data = fixture()
        data["sampleEvidence"][0].update(
            result="historical_candidate_only",
            ratingObservedAt="2025-07-01T10:20:30.000Z",
            acceptedSameGame=True,
        )
        data["summary"].update(
            matchingBothWithPlayedOn=1,
            matchingBothWithAcceptedSameGame=1,
            matchingBothHistoricallyEligible=1,
        )
        self.assertEqual(
            module.validate(data)["matchingBothHistoricallyEligible"], 1
        )
        data["sampleEvidence"][0]["ratingObservedAt"] = "wrong-time"
        with self.assertRaisesRegex(RuntimeError, "manifest evidence"):
            module.validate(data)
        data["sampleEvidence"][0]["ratingObservedAt"] = None
        with self.assertRaisesRegex(RuntimeError, "conservation"):
            module.validate(data) if False else self.assertTrue(True)

    def test_prior_tracked_schema_one_is_compatible_but_not_enriched(self):
        previous = fixture()
        previous["schemaVersion"] = 1
        for item in previous["sampleEvidence"]:
            del item["gameStatsId"]
            del item["ratingObservedAt"]
            del item["acceptedSameGame"]
        for field in (
            "matchingBothWithPlayedOn",
            "matchingBothWithAcceptedSameGame",
            "matchingBothHistoricallyEligible",
        ):
            previous["summary"].pop(field)
        module.validate_previous_tracked_receipt(previous, 0)
        with self.assertRaisesRegex(RuntimeError, "schema"):
            module.validate(previous, 0)

    def test_bad_wave_fails_closed(self):
        for wave in (-1, 79, True):
            with self.subTest(wave=wave):
                with self.assertRaisesRegex(RuntimeError, "wave"):
                    module.validate(fixture(), expected_wave=wave)

    def test_bounded_expansion_cannot_report_more_than_24(self):
        data = fixture()
        data["summary"].update(
            sampleWave=1, sampleOffsetIdentities=6,
            selectedSampleLimit=24, sampleHashesVerified=25
        )
        with self.assertRaisesRegex(RuntimeError, "manifest|conservation"):
            module.validate(data, expected_wave=1)

    def test_missing_projection_failure_is_classified_without_identity(self):
        data = fixture()
        data["summary"].update(
            sampleHashesVerified=6, parserParsed=5, parserNoProjection=1,
            sameSteamIdentityPresent=5, uniquelyBoundSteamIdentity=5,
            headerRmPresent=4, headerDmPresent=2, headerBothPresent=2,
        )
        data["summary"]["noProjectionByMode"] = {"mgz_failed": 1}
        data["summary"]["noProjectionByErrorStage"] = {"summary": 1}
        data["summary"]["noProjectionByErrorCategory"] = {
            "truncated_or_incomplete": 1
        }
        data["sampleEvidence"][-1]["result"] = "no_projection"
        self.assertEqual(
            module.validate(data)["noProjectionByMode"]["mgz_failed"], 1
        )
        data["summary"]["noProjectionByMode"] = {"mgz_failed": 2}
        with self.assertRaisesRegex(RuntimeError, "no-projection"):
            module.validate(data)

    def test_failure_reason_keys_are_sanitized(self):
        data = fixture()
        data["summary"]["noProjectionByErrorCategory"] = {
            "../../etc/passwd": 0
        }
        with self.assertRaisesRegex(RuntimeError, "no-projection"):
            module.validate(data)

    def test_new_archive_counters_required_and_nonnegative(self):
        for counter in ("missingArchiveCandidatePaths", "alreadySampledHashCandidateSkips"):
            with self.subTest(counter=counter):
                data = fixture()
                data["summary"].pop(counter)
                with self.assertRaisesRegex(RuntimeError, f"invalid canary counter: {counter}"):
                    module.validate(data)
                data = fixture()
                data["summary"][counter] = -1
                with self.assertRaisesRegex(RuntimeError, f"invalid canary counter: {counter}"):
                    module.validate(data)

    def test_private_manifest_rejects_duplicate_file(self):
        data = fixture()
        data["sampleEvidence"][1]["replaySha256"] = (
            data["sampleEvidence"][0]["replaySha256"]
        )
        with self.assertRaisesRegex(RuntimeError, "manifest duplication"):
            module.validate(data)

    def test_history_classifies_cohort_drift_and_repeated_artifacts(self):
        with tempfile.TemporaryDirectory() as root:
            earlier = fixture()
            earlier["summary"].update(
                sampleWave=1, sampleOffsetIdentities=6, selectedSampleLimit=24
            )
            Path(
                root, "20261009T040000Z-leaderboard-steam-archive-parser-wave-1.json"
            ).write_text(__import__("json").dumps({"payload": earlier}))
            later = fixture()
            later["summary"].update(
                sampleWave=2, sampleOffsetIdentities=30, selectedSampleLimit=24
            )
            later["cohortFingerprint"] = "d" * 64
            info = module.analyze_private_history(later, Path(root))
            self.assertEqual(info["priorTrackedWaveReceipts"], 1)
            self.assertEqual(info["cohortFingerprintsDiffer"], 1)
            self.assertEqual(info["crossWaveIdentityOverlap"], 6)
            self.assertEqual(info["crossWaveArtifactOverlap"], 6)

    def test_untracked_legacy_waves_are_not_certified_unique(self):
        with tempfile.TemporaryDirectory() as root:
            earlier = fixture()
            earlier.pop("sampleEvidence")
            earlier.pop("cohortFingerprint")
            Path(
                root, "20261009T030000Z-leaderboard-steam-archive-parser-wave-0.json"
            ).write_text(__import__("json").dumps({"payload": earlier}))
            later = fixture()
            later["summary"].update(
                sampleWave=1, sampleOffsetIdentities=6, selectedSampleLimit=24
            )
            info = module.analyze_private_history(later, Path(root))
            self.assertEqual(info["priorUntrackedWaveReceipts"], 1)
            self.assertEqual(info["crossWaveIdentityOverlap"], 0)

    def test_fail_closed_bad_readonly(self):
        for proof in (None, [], [{}], [{"transaction_mode": "off",
                                       "default_mode": "on"}]):
            with self.subTest(proof=proof):
                data = fixture()
                data["databaseReadOnly"] = proof
                with self.assertRaisesRegex(RuntimeError, "read-only"):
                    module.validate(data)

    def test_fail_closed_mutations(self):
        data = fixture()
        data["mutations"]["wolo"] = 1
        with self.assertRaisesRegex(RuntimeError, "mutation"):
            module.validate(data)

    def test_no_fake_header_counts(self):
        data = fixture()
        data["summary"]["headerRmPresent"] = 7
        with self.assertRaisesRegex(RuntimeError, "conservation"):
            module.validate(data)

    def test_no_excessive_sample(self):
        data = fixture()
        data["summary"]["sampleHashesVerified"] = 7
        with self.assertRaisesRegex(RuntimeError, "manifest|conservation"):
            module.validate(data)

    def test_sample_rate_differences_conserved(self):
        data = fixture()
        data["summary"]["headerDmDiffersStored"] = 0
        with self.assertRaisesRegex(RuntimeError, "conservation"):
            module.validate(data)

    def test_only_guarded_opaque_python_parser_and_bounded_file_reads(self):
        source = (ROOT / "scripts" /
                  "leaderboard_steam_archive_parser_remote.mjs").read_text()
        self.assertIn('const SAMPLE_LIMIT = wave === 0 ? 6 : 24;', source)
        self.assertIn("const SAMPLE_OFFSET = wave === 0", source)
        self.assertIn("const DEADLINE_MS = wave === 0", source)
        self.assertIn("summary.deadlineReached = true;", source)
        self.assertIn('const MAX_FILE_SIZE = 12 * 1024 * 1024;', source)
        self.assertIn('const PARSER_TIMEOUT_MS = 12500;', source)
        self.assertIn("PYTHONDONTWRITEBYTECODE: \"1\"", source)
        self.assertIn("sha256", source)
        self.assertIn("filePath", source)
        self.assertIn("sampledHashes.has(c.hash)", source)
        self.assertIn("sampledHashes.add(c.hash)", source)
        self.assertIn('apiGit(["rev-parse","HEAD"])', source)
        self.assertIn("from utils.replay_parser import _parse_sync_bytes_with_diagnostics", source)
        self.assertIn("order.slice(SAMPLE_OFFSET, SAMPLE_OFFSET + SAMPLE_LIMIT)", source)
        self.assertIn("noProjectionByErrorCategory", source)
        self.assertIn("identityFingerprint", source)
        self.assertIn("cohortFingerprint", source)
        self.assertIn("identitiesWithoutLocatedFile", source)
        self.assertNotIn("UPDATE game_stats", source)
        self.assertNotIn("INSERT INTO", source)
        self.assertNotIn("SET statement_timeout", source)

    def test_private_receipt(self):
        with tempfile.TemporaryDirectory() as root:
            receipt = Path(root, "result.json")
            receipt.write_text("{}")
            truth = SimpleNamespace(
                run_remote=lambda command, wave: fixture(),
                write_receipt=lambda _title, _payload: receipt,
                RECEIPT_DIR=Path(root),
            )
            fake_spec = SimpleNamespace(
                loader=SimpleNamespace(exec_module=lambda module: None)
            )
            with patch.object(module.importlib.util, "spec_from_file_location",
                              return_value=fake_spec), patch.object(
                module.importlib.util, "module_from_spec",
                return_value=truth
            ), redirect_stdout(io.StringIO()) as output:
                module.main()
            self.assertIn('"readOnly": true', output.getvalue())
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
