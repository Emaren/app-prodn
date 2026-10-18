import importlib.util
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_frontier_ladder.py"
spec = importlib.util.spec_from_file_location("release_frontier_ladder", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
NOW = datetime(2026, 10, 18, 15, 0, tzinfo=timezone.utc)
PLAN = {
    "schema": 2, "kind": "aoe2war-finish-plan", "status": "BLOCKED",
    "blockers": ["documentation/update plan is blocked by non-remediable findings"],
    "release": {"github": {"main_sha": "a" * 40}, "production": {"source_sha": "b" * 40}},
    "documentation_plan": {"unknown_p1": [{"area": "WoloChain",
        "key": "vps-source-drift", "detail": "VPS=78... expected=bdb..."}]},
}
WOLO = {
    "source_authority": {
        "status": "BLOCKED",
        "observed_at_utc": "2026-10-18T14:59:00Z",
        "live_settlement_revision": "78" * 20, "expected_revision": "bd" * 20,
    },
    "producer_inventory": {"financial_producers_fenced": False},
    "claim_889_reconciled": False,
    "financial_drain_certified": False,
    "reserve_liability_parity_proven": False,
    "fresh_quiesced_snapshot_proven": False,
    "live_rollback_rehearsed": False,
}


class LadderTests(unittest.TestCase):
    def test_real_blocker_yields_six_finite_independent_controls(self):
        r = module.analyze(PLAN, WOLO, now=NOW)
        self.assertEqual(r["blocker_class"], "WOLO_SETTLEMENT_RUNTIME_DRIFT")
        self.assertEqual(len(r["controls"]), 9)
        self.assertEqual(r["next_task_id"], "hd_de_producers_isolated")
        self.assertFalse(r["website_release_authorized"])
        self.assertFalse(r["financial_release_authorized"])
        self.assertEqual(r["wolo_observation_age_seconds"], 60)
        self.assertFalse(r["wolo_observation_stale"])

    def test_even_all_boolean_true_does_not_mint_release_authorization(self):
        wolo = json.loads(json.dumps(WOLO))
        for key in ("claim_889_reconciled", "financial_drain_certified",
                    "reserve_liability_parity_proven", "fresh_quiesced_snapshot_proven",
                    "live_rollback_rehearsed"):
            wolo[key] = True
        wolo["producer_inventory"]["financial_producers_fenced"] = True
        r = module.analyze(PLAN, wolo, now=NOW)
        self.assertTrue(all(not c["authorized"] for c in r["controls"]))
        self.assertTrue(all(c["state"] == "REPORTED_ONLY_NOT_AUTHORIZED" for c in r["controls"][:6]))

    def test_no_obs_is_stale_not_falsely_healthy(self):
        r = module.analyze(PLAN, now=NOW)
        self.assertTrue(r["wolo_observation_stale"])
        self.assertIsNone(r["wolo_running_source"])
        self.assertEqual(r["controls"][0]["state"], "UNPROVEN")

    def test_other_blockers_not_misclassified(self):
        plan = json.loads(json.dumps(PLAN))
        plan["documentation_plan"]["unknown_p1"] = [{"area": "Other", "key": "disk", "detail": "full"}]
        r = module.analyze(plan, now=NOW)
        self.assertEqual(r["blocker_class"], "BLOCKED_UNCLASSIFIED")
        self.assertEqual(r["next_task_id"], "inspect_other_blocker")

    def test_reject_invalid_schema(self):
        with self.assertRaisesRegex(ValueError, "authentic-format"):
            module.analyze({"kind": "unsigned-release", "status": "READY"})

    def test_read_json_rejects_duplicate_keys_nonfinite_and_oversize(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "proof.json"
            for value in (b'{"x":1,"x":2}', b'{"x":NaN}', b"x" * (module.MAX_INPUT_BYTES + 1)):
                path.write_bytes(value)
                with self.assertRaises(ValueError):
                    module.read_json(path)

    def test_read_json_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "data.json"
            path.write_text("{}")
            link = Path(root) / "alias.json"
            link.symlink_to(path)
            with self.assertRaisesRegex(ValueError, "non-symlink"):
                module.read_json(link)

    def test_future_or_old_observations_stay_stale(self):
        future = json.loads(json.dumps(WOLO))
        future["source_authority"]["observed_at_utc"] = "2026-10-20T12:00:00Z"
        self.assertTrue(module.analyze(PLAN, future, now=NOW)["wolo_observation_stale"])
        past = json.loads(json.dumps(WOLO))
        past["source_authority"]["observed_at_utc"] = "2026-10-17T12:00:00Z"
        self.assertTrue(module.analyze(PLAN, past, now=NOW)["wolo_observation_stale"])


if __name__ == "__main__":
    unittest.main()
