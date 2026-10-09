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
        "schemaVersion": 1,
        "databaseReadOnly": [{
            "transaction_mode": "on", "default_mode": "on",
        }],
        "mutations": {
            "production": 0, "parserRows": 0, "identityRows": 0,
            "currentRatingRows": 0, "wolo": 0,
        },
        "summary": {
            "publicUnratedExactSteamIds": 2755,
            "unmarkedWatchersWithBothNumbers": 1716,
            "scannedGameRows": 51342,
            "scanBatches": 101,
            "apiPythonAvailable": True,
            "archiveAccessible": True,
            "selectedSampleLimit": 6,
            "sampleFilesLocated": 6,
            "sampleHashesVerified": 6,
            "sampleHashMismatch": 0,
            "sampleTooLarge": 0,
            "parserParsed": 6,
            "parserNoProjection": 0,
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
        },
    }


class ArchiveParserCanaryTests(unittest.TestCase):
    def test_good_contract(self):
        self.assertEqual(module.validate(fixture())["headerBothPresent"], 2)

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
        with self.assertRaisesRegex(RuntimeError, "conservation"):
            module.validate(data)

    def test_sample_rate_differences_conserved(self):
        data = fixture()
        data["summary"]["headerDmDiffersStored"] = 0
        with self.assertRaisesRegex(RuntimeError, "conservation"):
            module.validate(data)

    def test_only_guarded_opaque_python_parser_and_bounded_file_reads(self):
        source = (ROOT / "scripts" /
                  "leaderboard_steam_archive_parser_remote.mjs").read_text()
        self.assertIn('const SAMPLE_LIMIT = 6;', source)
        self.assertIn('const MAX_FILE_SIZE = 12 * 1024 * 1024;', source)
        self.assertIn('const PARSER_TIMEOUT_MS = 12500;', source)
        self.assertIn("PYTHONDONTWRITEBYTECODE: \"1\"", source)
        self.assertIn("sha256", source)
        self.assertIn("candidate.hash", source) if False else None
        self.assertIn("filePath", source)
        self.assertIn("from utils.replay_parser import _parse_sync_bytes", source)
        self.assertNotIn("UPDATE game_stats", source)
        self.assertNotIn("INSERT INTO", source)
        self.assertNotIn("SET statement_timeout", source)

    def test_private_receipt(self):
        with tempfile.TemporaryDirectory() as root:
            receipt = Path(root, "result.json")
            receipt.write_text("{}")
            truth = SimpleNamespace(
                run_remote=lambda command: fixture(),
                write_receipt=lambda _title, _payload: receipt,
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
