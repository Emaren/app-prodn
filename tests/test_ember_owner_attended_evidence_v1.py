"""Immutable historical evidence schema tests. Never used as a release permit."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "design/ember-appearance-writer/owner-attended-evidence-v1.schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text())

def sample():
    obj = {}
    for key, spec in SCHEMA["properties"].items():
        if "const" in spec:
            obj[key] = spec["const"]
        elif "enum" in spec:
            obj[key] = "NOT_STARTED"
        elif key == "observed_utc":
            obj[key] = "2026-11-16T14:46:30+00:00"
        else:
            obj[key] = "a" * 64
    return obj

def diagnose_shape(obj):
    """Test-only schema subset; never authenticates an operator or executes."""
    if type(obj) is not dict or set(obj) != set(SCHEMA["required"]):
        return False
    for key, spec in SCHEMA["properties"].items():
        value = obj[key]
        if "const" in spec and (type(value) is not type(spec["const"]) or value != spec["const"]):
            return False
        if "enum" in spec and (type(value) is not str or value not in spec["enum"]):
            return False
        if "pattern" in spec and (type(value) is not str or not re.search(spec["pattern"], value)):
            return False
    return True

class OwnerEvidenceContractTests(unittest.TestCase):
    def test_schema_does_not_mint_authority(self):
        self.assertIn("never a permit", SCHEMA["title"].lower())
        self.assertFalse(SCHEMA["additionalProperties"])
        self.assertEqual(set(SCHEMA["required"]), set(SCHEMA["properties"]))
        self.assertTrue(diagnose_shape(sample()))
        self.assertFalse((ROOT / "scripts/release/ember_owner_attended_evidence_v1.py").exists())

    def test_forbid_financial_and_fake_cryptographic_claims(self):
        for key in ("financial_authorized", "funding_authorized",
                    "factory_permit_claimed", "cryptographic_signature_claimed"):
            self.assertIs(SCHEMA["properties"][key]["const"], False)
            for value in (True, 1, "false", None):
                with self.subTest(key=key, value=value):
                    obj = sample()
                    obj[key] = value
                    self.assertFalse(diagnose_shape(obj))

    def test_immutable_source_sql_artifact_and_os_pins(self):
        for key in ("source_commit", "build_id", "sql_apply_sha256",
                    "sql_inverse_sha256", "writer_unit_sha256",
                    "runtime_archive_sha256", "independent_proof_sha256",
                    "host", "database", "previous_web_root", "authority_state"):
            with self.subTest(key=key):
                obj = sample()
                obj[key] = "changed"
                self.assertFalse(diagnose_shape(obj))
        self.assertEqual(SCHEMA["properties"]["authority_state"]["const"], "UNSIGNED_NOT_A_PERMIT")

    def test_statuses_not_signed_or_shipped(self):
        for key in ("sql_stage_status", "service_status", "factory_status"):
            for value in ("SIGNED", "SHIPPED_VERIFIED", None, 1):
                with self.subTest(key=key, value=value):
                    obj = sample()
                    obj[key] = value
                    self.assertFalse(diagnose_shape(obj))

    def test_extra_missing_and_counterfeit_fields(self):
        for field in ("approvedBy", "signature", "private_key", "wallet_id"):
            obj = sample()
            obj[field] = "fake"
            self.assertFalse(diagnose_shape(obj))
        obj = sample()
        del obj["source_commit"]
        self.assertFalse(diagnose_shape(obj))

    def test_timestamp_and_digest_shapes(self):
        for value in ("2026-11-15T14:46:30+00:00", "2026-11-16", "bad", None):
            obj = sample()
            obj["observed_utc"] = value
            self.assertFalse(diagnose_shape(obj))
        for value in ("0" * 40, "Z" * 64, 42):
            obj = sample()
            obj["evidence_sha256"] = value
            self.assertFalse(diagnose_shape(obj))

if __name__ == "__main__":
    unittest.main()
