"""WE1 storage classification source parity and negative-authority tests.

Policy registry only: no cleanup, signing, transport, shell or host mutation.
"""
from __future__ import annotations
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "config/storage-disposition-policy.v1.json"
CONTROLLER = ROOT / "scripts/aoe2_storage.py"

class StorageDispositionPolicyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = json.loads(REGISTRY.read_text(encoding="utf-8"))
        cls.source = runpy.run_path(str(CONTROLLER), run_name="we1_policy_parity_only")

    def test_purpose_is_nonexecuting(self):
        self.assertEqual(self.p["schema"], "aoe2war.storage-disposition-policy.v1")
        self.assertEqual(self.p["mode"], "REVIEW_ONLY_NO_NEW_EXECUTION_AUTHORITY")
        a = self.p["authority"]
        self.assertTrue(a["standing_source_classification_only"])
        for key in ("new_deletion_controller_authorized", "new_auto_apply_or_scheduler_authorized",
                    "l3_l4_l5_delete_authorized", "financial_authorized",
                    "intel_transfer_authorized", "scanner_execution_authorized"):
            self.assertIs(a[key], False, key)

    def test_exact_existing_controller_l1_tuples(self):
        groups = (
            ("standard", "LOCAL_REGENERABLE_PATHS"),
            ("extended", "LOCAL_EXTENDED_REGENERABLE_PATHS"),
            ("electron_only", "LOCAL_ELECTRON_REGENERABLE_PATHS"),
        )
        from_code = {
            (name, relative.as_posix(), mode)
            for mode, attr in groups
            for name, relative in self.source[attr]
        }
        from_registry = {
            (x["id"], x["relative_home_path"], x["controller_mode"])
            for x in self.p["eligible_l1_classes"]
        }
        self.assertEqual(len(from_code), 10)
        self.assertEqual(from_registry, from_code)
        self.assertEqual(len(from_registry), len(self.p["eligible_l1_classes"]))

    def test_no_broad_m1_cache_or_live_path_authority(self):
        paths = [x["relative_home_path"] for x in self.p["eligible_l1_classes"]]
        denied = (".cache", ".npm", ".codex", ".next", "node_modules",
                  ".aoe2war-product-releases", "projects", "Library/Containers")
        for path in paths:
            self.assertFalse(Path(path).is_absolute())
            self.assertNotIn("..", Path(path).parts)
            self.assertNotIn(path, denied)
        for x in self.p["eligible_l1_classes"]:
            self.assertEqual(x["authority"], "EXISTING_AOE2WAR_STORAGE_LOCAL_MAINTAIN_ONLY")
            self.assertIn("SAME_FILESYSTEM_AVAILABLE_PRE_POST", x["requires"])
            self.assertIn("SCHEDULER_APPLY", x["not_allowed"])
            self.assertEqual(x["level"], "L1")

    def test_no_l4_l5_downgrade(self):
        self.assertEqual(self.p["levels"]["L4"], "HUMAN_ONLY_NO_SOFTWARE_DELETE")
        self.assertEqual(self.p["levels"]["L5"], "NEVER_DELETE_NO_DOWNGRADE_OR_WEB_REVOKE")
        self.assertEqual(self.p["protection_precedence"],
                         "MAX_OF_SOURCE_FLOOR_AND_ANY_AUTHENTIC_HISTORICAL_OWNER_PROTECTION")
        self.assertEqual(self.p["default_disposition"], "PROTECTED")

    def test_exact_protected_objects_stay_held(self):
        z = self.p["exact_items"]["M1_ZIP_60011"]
        self.assertEqual(z["original_retirement"], "EXPLICIT_NO")
        self.assertEqual(z["level"], "L4")
        self.assertIs(z["software_deletion_authorized"], False)
        self.assertEqual(z["content_sha256"],
                         "60011e8fda8ba9aefabae3f32723f6f5fb0a306d963a936851477a52e219d3db")
        r = self.p["exact_items"]["HEL1_ROOT_4C14"]
        self.assertEqual(r["level"], "L4")
        self.assertIs(r["copy_authorized"], False)
        self.assertIs(r["retirement_authorized"], False)
        self.assertEqual(r["inode"], 4493824)
        s = self.p["exact_items"]["HEL1_DATA_OLD_SWAP"]
        self.assertEqual(s["level"], "L5")
        self.assertIs(s["deletion_authorized"], False)

    def test_protected_current_and_separate_services(self):
        protected = self.p["protected_exclusions"]
        self.assertEqual(set(protected["always_keep_generations"]), {
            "9cf670724c82", "50b943a44a2e", "dbceb5df20f9",
            "f50ead889c61", "da0bee282e52"})
        self.assertEqual(protected["recovery_services"], ["3030_LEGACY", "3033_EMERGENCY"])
        self.assertEqual(protected["unknown_is"], "PROTECTED_HOLD_NOT_ZERO")

    def test_provenance_requires_unique_separate_from_gross_and_real_outcome(self):
        e = self.p["evidence_contract"]
        self.assertIsNone(e["incomplete_value"])
        self.assertTrue(e["gross_is_not_unique_reclaim"])
        self.assertTrue(e["copy_is_not_retirement"])
        self.assertTrue(e["historical_restore_is_not_fresh_restore"])
        for key in ("logical_bytes", "gross_allocated_bytes", "proven_unique_reclaim_bytes",
                    "ordinary_available_before_bytes", "ordinary_available_after_bytes",
                    "physically_reclaimed_bytes"):
            self.assertIn(key, e["bytes"])
        for key in ("subject", "source", "bytes", "owner", "coverage",
                    "classification", "destination", "recovery", "authority", "outcome"):
            self.assertIn(key, e["required"])
        self.assertIn("UNKNOWN", e["statuses"])

    def test_new_cache_candidates_are_only_review_not_installed_l1(self):
        expected = {
            "node_gyp_header_cache": ("Library/Caches/node-gyp", 55799808),
            "node_toolchain_cache": (".cache/node", 33996800),
            "uv_package_cache": (".cache/uv", 21889024),
            "apple_siri_tts_cache": ("Library/Caches/SiriTTS", 232882176),
        }
        candidates = self.p["research_candidates_l1"]
        self.assertEqual(len(candidates), 4)
        self.assertEqual({x["id"]: (x["relative_home_path"], x["observed_gross_allocated_bytes"])
                          for x in candidates}, expected)
        active = {x["relative_home_path"] for x in self.p["eligible_l1_classes"]}
        for x in candidates:
            self.assertNotIn(x["relative_home_path"], active)
            self.assertEqual(x["disposition"], "PROTECTED")
            self.assertFalse(x["proven_producer"])
            self.assertFalse(x["current_controller_admitted"])
            self.assertFalse(x["prune_authorized"])
        self.assertIn("PROTECTED", candidates[-1]["classification"])

    def test_future_generated_class_is_not_retrospective_l4_delete(self):
        x = self.p["future_generated_retention_contract"]
        self.assertEqual(x["mode"], "DESIGN_ONLY_NO_CURRENT_GENERATION_RETIREMENT")
        self.assertIs(x["standing_class_may_override_l4_l5"], False)
        self.assertIs(x["existing_l4_l5_eligible"], False)
        self.assertIs(x["deletion_allowed_now"], False)
        self.assertEqual(x["controller_transaction_max_objects"], 1)
        self.assertIn("INDEPENDENT_ISOLATED_RESTORE_EXACT_ARTIFACT", x["new_object_evidence"])
        self.assertIn("THREE_INDEPENDENT_COLD_CHECKPOINTS_RETAINED", x["new_object_evidence"])
        y = self.p["future_l1_enrollment_contract"]
        self.assertTrue(y["design_only"])
        self.assertFalse(y["automatic_category_pruning"])
        self.assertTrue(y["eligible_only_after_source_owner_and_signed_controller_install"])

if __name__ == "__main__":
    unittest.main()
