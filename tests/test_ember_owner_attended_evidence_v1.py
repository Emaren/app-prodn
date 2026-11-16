"""Security regression: owner-attended diagnostic evidence must not become a permit."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[1] / "scripts/release/ember_owner_attended_evidence_v1.py"
spec = importlib.util.spec_from_file_location("ember_evidence", SRC)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fixture():
    return {
        **mod.PINNED,
        **{k: False for k in mod.FORBIDDEN_AUTHORITY},
        **{k: "NOT_STARTED" for k in mod.STATUS_KEYS},
        "observed_utc": "2026-11-16T14:21:00+00:00",
        "evidence_sha256": "c" * 64,
    }

class OwnerEvidenceTests(unittest.TestCase):
    def test_never_issues_authority(self):
        result = mod.inspect(fixture())
        self.assertEqual(result["contract"], "VALID_EVIDENCE_SHAPE_NOT_RELEASE_AUTHORITY")
        self.assertNotIn("approvedBy", result)
        self.assertNotIn("signature", result)

    def test_every_exact_pin_fails_closed(self):
        for key in mod.PINNED:
            with self.subTest(key=key):
                obj = fixture()
                obj[key] = "wrong"
                with self.assertRaises(ValueError):
                    mod.inspect(obj)

    def test_financial_and_fake_permits_rejected(self):
        for key in mod.FORBIDDEN_AUTHORITY:
            for value in (True, 1, None, "false"):
                with self.subTest(key=key, value=value):
                    obj = fixture()
                    obj[key] = value
                    with self.assertRaises(ValueError):
                        mod.inspect(obj)

    def test_unrecognized_status_rejected(self):
        for key in mod.STATUS_KEYS:
            for value in ("SIGNED", "SHIPPED_VERIFIED", None, 1):
                with self.subTest(key=key, value=value):
                    obj = fixture()
                    obj[key] = value
                    with self.assertRaises(ValueError):
                        mod.inspect(obj)

    def test_extra_missing_and_counterfeit_fields(self):
        for unexpected in ("approvedBy", "signature", "private_key", "funding_scope"):
            obj = fixture()
            obj[unexpected] = "fake"
            with self.assertRaises(ValueError):
                mod.inspect(obj)
        obj = fixture()
        del obj["sql_inverse_sha256"]
        with self.assertRaises(ValueError):
            mod.inspect(obj)

    def test_timezone_day_and_sha_required(self):
        for stamp in ("2026-11-16", "2026-11-17T00:00:00Z", "bad", None):
            obj = fixture()
            obj["observed_utc"] = stamp
            with self.assertRaises(ValueError):
                mod.inspect(obj)
        for sha in ("x" * 64, "a" * 40, 42, ""):
            obj = fixture()
            obj["evidence_sha256"] = sha
            with self.assertRaises(ValueError):
                mod.inspect(obj)

    def test_cli_valid_and_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "report.json"
            path.write_text(json.dumps(fixture()))
            self.assertEqual(mod.main(["--evidence", str(path)]), 0)
            path.write_text(json.dumps(fixture())[:-1] + ',"actor":"other"}')
            self.assertEqual(mod.main(["--evidence", str(path)]), 2)

if __name__ == "__main__":
    unittest.main()
