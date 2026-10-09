"""Contract tests: rating census must fail closed without read-only proof."""
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
    "rating_census", ROOT / "scripts" / "leaderboard_steam_coverage.py"
)
census = importlib.util.module_from_spec(spec)
spec.loader.exec_module(census)


def payload(*, readonly="on", both=3, rm=1, dm=2, missing=4):
    return {
        "kind": "aoe2war-steam-rating-coverage-census",
        "databaseReadOnly": {
            "transaction_mode": readonly, "default_mode": readonly,
        },
        "mutations": {
            "production": 0, "parserRows": 0, "identityRows": 0,
            "currentRatingRows": 0, "wolo": 0,
        },
        "counts": {
            "publicIdentityRows": both + rm + dm + missing,
            "bothRated": both, "rmOnly": rm,
            "dmOnly": dm, "neitherRated": missing,
        },
        "missingCases": [{"identityKey": "steam:76561198000000001"}],
    }


class CensusCliTests(unittest.TestCase):
    def invoke(self, result):
        captured = []
        fake = SimpleNamespace()

        def remote(command):
            self.assertEqual(command, "census")
            self.assertEqual(
                fake.REMOTE_PROGRAM.name,
                "leaderboard_steam_coverage_remote.mjs",
            )
            return result

        def write_receipt(command, data):
            self.assertEqual(command, "leaderboard-steam-coverage")
            self.assertEqual(data, result)
            captured.append("write")
            return self.path

        fake.run_remote = remote
        fake.write_receipt = write_receipt
        fake_spec = SimpleNamespace(
            loader=SimpleNamespace(exec_module=lambda _target: None)
        )
        with patch.object(
            census.importlib.util,
            "spec_from_file_location",
            return_value=fake_spec,
        ), patch.object(
            census.importlib.util, "module_from_spec", return_value=fake
        ), redirect_stdout(io.StringIO()) as output:
            census.main()
        return captured, output.getvalue()

    def test_accepts_only_guarded_census_and_seals_private_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            self.path = Path(directory) / "receipt.json"
            self.path.write_text("{}")
            captured, output = self.invoke(payload())
            self.assertEqual(captured, ["write"])
            self.assertIn('"publicIdentityRows": 10', output)
            self.assertIn('"missingCases": 1', output)
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_refuses_without_readonly_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            self.path = Path(directory) / "should-not-exist.json"
            with self.assertRaisesRegex(RuntimeError, "read-only proof"):
                self.invoke(payload(readonly="off"))
            self.assertFalse(self.path.exists())

    def test_refuses_inconsistent_identity_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            self.path = Path(directory) / "should-not-exist.json"
            broken = payload()
            broken["counts"]["publicIdentityRows"] += 1
            with self.assertRaisesRegex(RuntimeError, "conservation"):
                self.invoke(broken)
            self.assertFalse(self.path.exists())

    def test_refuses_unexpected_mutation_declaration(self):
        with tempfile.TemporaryDirectory() as directory:
            self.path = Path(directory) / "should-not-exist.json"
            broken = payload()
            broken["mutations"]["wolo"] = 1
            with self.assertRaisesRegex(RuntimeError, "mutation"):
                self.invoke(broken)
            self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
