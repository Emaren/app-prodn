import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/aoe2_app_wolo_custody_crosswalk.py"
SPEC = importlib.util.spec_from_file_location("aoe2_app_wolo_custody_crosswalk", SCRIPT)
crosswalk = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = crosswalk
SPEC.loader.exec_module(crosswalk)


def fixture(root, version_checks=False):
    app = root / "app"
    wolo = root / "wolo"
    file = app / crosswalk.APP_PATH
    file.parent.mkdir(parents=True)
    # Source tokens below represent a synthetic parser fixture only, not an
    # operator health response, signer, security review or money-moving code.
    file.write_text("""
function request(path) { return path }
request("/satchel/v1/health")
request("/satchel/v2/one-shot")
health.execution_protocol !== 2
health.owner_bound_wager_reservation_required !== true
health.chain_id !== "wolo-1"
health.signer_role !== "exclusive-war-satchel-v1"
health.durable_one_shot !== true
health.replay_after_restart_forbidden !== true
health.refunds_require_chain_proof !== true
health.custody_mnemonic_shared_with_other_roles !== false
health.custody_capability !== "AVAILABLE"
SATCHEL_DEDICATED_SIGNER_UNAVAILABLE
""" + ('health.custody_capability_version !== expected\nhealth.custody_capability_expires_at !== exp\n'
       if version_checks else ''))
    hold = app / crosswalk.APP_HOLD_PATH
    hold.write_text("export const SATCHEL_FINANCIAL_BRIDGE_READY = false as const;")
    server = wolo / crosswalk.WOLO_PATH
    server.parent.mkdir(parents=True)
    server.write_text('''
"/satchel/v1/health"
"/satchel/v2/one-shot"
"execution_protocol": 2
"owner_bound_wager_reservation_required": true
"chain_id": "wolo-1"
"signer_role": httpCustodyRole
"durable_one_shot": true
"replay_after_restart_forbidden": true
"refunds_require_chain_proof": true
response["custody_mnemonic_shared_with_other_roles"] = false
response["custody_capability"] = "AVAILABLE"
"custody_capability": "UNAVAILABLE"
response["custody_capability_version"] = "war-satchel-runtime-custody-v1"
response["custody_capability_expires_at"] = value
''')
    return app, wolo


class AppWoloCrosswalkTests(unittest.TestCase):
    def test_matching_core_but_missing_explicit_version_and_expiry_review(self):
        with tempfile.TemporaryDirectory() as td:
            app, wolo = fixture(Path(td))
            report = crosswalk.inspect(app, wolo)
            self.assertEqual(report["status"], "HANDSHAKE_REVIEW_GAPS")
            self.assertEqual(report["missing_core_contracts"], [])
            self.assertEqual(len(report["missing_explicit_capability_checks"]), 2)
            self.assertTrue(report["financial_bridge_held"])
            self.assertFalse(report["safe_to_enable_custody"])

    def test_versioned_metadata_both_observed_still_no_release_authority(self):
        with tempfile.TemporaryDirectory() as td:
            app, wolo = fixture(Path(td), version_checks=True)
            report = crosswalk.inspect(app, wolo)
            self.assertEqual(report["status"], "OBSERVED_DECLARATIONS_NOT_RUNTIME_PROOF")
            self.assertEqual(report["missing_explicit_capability_checks"], [])
            self.assertFalse(report["operator_signed_permit_attested"])
            self.assertFalse(report["safe_to_enable_custody"])

    def test_app_source_drift_is_visible_not_reinterpreted_as_safe(self):
        with tempfile.TemporaryDirectory() as td:
            app, wolo = fixture(Path(td), version_checks=True)
            file = app / crosswalk.APP_PATH
            file.write_text(file.read_text().replace('health.execution_protocol !== 2', 'health.execution_protocol !== 1'))
            report = crosswalk.inspect(app, wolo)
            self.assertEqual(report["status"], "SOURCE_DECLARATION_MISMATCH")
            self.assertIn("protocol_v2", report["missing_core_contracts"])

    def test_missing_financial_bridge_hold_requires_review(self):
        with tempfile.TemporaryDirectory() as td:
            app, wolo = fixture(Path(td), version_checks=True)
            (app / crosswalk.APP_HOLD_PATH).write_text('export const SATCHEL_FINANCIAL_BRIDGE_READY = true;')
            report = crosswalk.inspect(app, wolo)
            self.assertEqual(report["status"], "SOURCE_DECLARATION_MISMATCH")
            self.assertFalse(report["financial_bridge_held"])

    def test_missing_symlinked_wolo_source_refuses_incomplete(self):
        with tempfile.TemporaryDirectory() as td:
            app, wolo = fixture(Path(td))
            target = wolo / crosswalk.WOLO_PATH
            target.unlink()
            real = Path(td) / 'real.go'
            real.write_text('"custody_capability": "UNAVAILABLE"')
            target.symlink_to(real)
            result = crosswalk.inspect(app, wolo)
            self.assertEqual(result["status"], "INCOMPLETE_SOURCE")
            self.assertIsNone(result["financial_bridge_held"])


if __name__ == "__main__":
    unittest.main()
