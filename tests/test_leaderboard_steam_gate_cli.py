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
        "databaseReadOnly": [{"transaction_mode": "on", "default_mode": "on"}],
        "counts": {"publicIdentityRows": 5, "rmRated": 1, "dmRated": 1,
                   "rmMissing": 4, "dmMissing": 4, "noExactSteamIdentity": 2},
        "histogram": {lane: {f"stage_{i}": 1 if i in (0, 1) else 0
                            for i in range(9)} for lane in ("rm", "dm")},
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
        self.assertNotIn("SET statement_timeout", remote)
        self.assertNotIn("UPDATE game_stats", remote)
        self.assertNotIn("INSERT INTO", remote)

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
                    data["histogram"]["rm"]["stage_4"] = 1
                    message = "conservation"
                else:
                    data["mutations"]["wolo"] = 1
                    message = "mutation"
                with self.assertRaisesRegex(RuntimeError, message):
                    self.run_with(data)
                self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
