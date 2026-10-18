"""Fail-closed Satchel readiness report: offline tests; no env, DB or chain."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "satchel_readiness", ROOT / "scripts/aoe2_satchel_readiness.py"
)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class SatchelReadinessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, key, value):
        target = self.root / module.SOURCES[key]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)

    def test_no_marker_or_empty_source_never_creates_false_green(self):
        report = module.inspect(self.root, {"head": "a" * 40, "clean": True})
        self.assertEqual("FINANCIAL_ACTIVATION_UNPROVEN", report["state"])
        self.assertTrue(all(x["state"].endswith("UNVERIFIED") for x in report["gates"]))
        for key in ("live_satchel_authorized", "live_auto_bet_authorized",
                    "website_release_authorized", "wolo_cutover_authorized"):
            self.assertIs(report[key], False)

    def test_source_markers_report_actual_legacy_blockers(self):
        self.write("mecha_runtime", "const LIVE_EXECUTOR_IMPLEMENTED = false;")
        self.write("mecha_ui", "const satchelVerifiedBalanceWolo: string | null = null;")
        self.write("satchel_evidence", "creditAuthorized: false")
        report = module.inspect(self.root, {"head": "b" * 40, "clean": True})
        states = {item["id"]: item["state"] for item in report["gates"]}
        self.assertEqual("IMPLEMENTATION_BLOCKED", states["funded_executor"])
        self.assertEqual("IMPLEMENTATION_BLOCKED", states["custody_spendable_projection"])
        self.assertEqual("UNCREDITED_PROOF_ONLY", states["deposit_credit_authority"])
        self.assertFalse(report["live_auto_bet_authorized"])
        self.assertIsNotNone(report["source_files_sha256"]["mecha_runtime"])

    def test_falsifying_source_markers_cannot_authorize_money(self):
        self.write("mecha_runtime", "const LIVE_EXECUTOR_IMPLEMENTED = true;")
        self.write("satchel_receipt", 'status: "credited"')
        report = module.inspect(self.root, {"head": "c" * 40, "clean": True})
        states = {item["id"]: item["state"] for item in report["gates"]}
        self.assertEqual("IMPLEMENTATION_UNVERIFIED", states["funded_executor"])
        self.assertEqual("IMPLEMENTATION_UNVERIFIED", states["deposit_receipt_persistence"])
        self.assertFalse(report["live_satchel_authorized"])
        self.assertFalse(report["wolo_cutover_authorized"])

    def test_source_digest_changes_with_implementation(self):
        self.write("mecha_runtime", "version one")
        before = module.inspect(self.root, {"head": "d" * 40, "clean": True})
        self.write("mecha_runtime", "version two")
        after = module.inspect(self.root, {"head": "d" * 40, "clean": True})
        self.assertNotEqual(before["source_files_sha256"]["mecha_runtime"],
                            after["source_files_sha256"]["mecha_runtime"])


if __name__ == "__main__":
    unittest.main()
