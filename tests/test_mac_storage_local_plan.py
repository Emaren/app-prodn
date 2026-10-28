#!/usr/bin/env python3
"""Read-only local-plan OS integration and fail-closed policy contracts."""
from __future__ import annotations
import importlib.util
import io
import json
from pathlib import Path
from contextlib import redirect_stdout
from unittest import TestCase, mock
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("mac_local_plan", ROOT / "scripts/aoe2_storage_local_plan.py")
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def base():
    return {
        "status": "PREVIEW", "apply": False,
        "before": {"regenerable": [
            {"name": "yarn_cache", "allocated_bytes": 1000, "exists": True, "symlink": False},
            {"name": "go_build_cache", "allocated_bytes": 0, "exists": False, "symlink": False},
        ]},
    }


def ext():
    return {"status": "PREVIEW", "apply": False, "extended": True,
            "extra_candidates": [
                {"name": "npm_content_cache", "allocated_bytes": 2000, "exists": True,
                 "blocked_reason": None},
            ]}


def electron():
    return {"status": "PREVIEW", "apply": False, "electron_only": True,
            "electron_candidates": [
                {"name": "electron_binary_download_cache", "allocated_bytes": 3000, "exists": True},
                {"name": "electron_builder_download_cache", "allocated_bytes": 4000, "exists": True},
            ]}


def pressure(complete=True):
    return {"status": "READ_ONLY", "mutation_allowed": False,
            "coverage": "NAMED_PATHS_ONLY_NOT_WHOLE_DISK",
            "observed_path_count": 3, "displayed_path_count": 3,
            "named_census_complete": complete,
            "incomplete_reasons": [] if complete else ["NAMED_PATH_MEASUREMENT_INCOMPLETE"],
            "measured": [
                {"name": "project:source", "classification": "REVIEW_DEV",
                 "allocated_bytes": 1000000, "complete": True},
                {"name": "codex_worktrees", "classification": "PROTECTED_DIRTY_WORKTREES",
                 "allocated_bytes": 9000000, "complete": True},
            ]}


def watchdog():
    return {"overall": "HOLD", "heartbeat": {"status": "FRESH"},
            "capacity": {"status": "CRITICAL"}}


class MacLocalPlanTests(TestCase):
    def test_priorities_do_not_select_protected_or_generated_sources(self):
        result = mod.plan(base(), ext(), electron(), pressure(), watchdog())
        self.assertEqual(result["known_cache_allocated_bytes"], 10000)
        self.assertEqual(result["priority_cache_actions"][0]["lane"], "electron")
        self.assertEqual([a["lane"] for a in result["priority_cache_actions"]],
                         ["electron", "extended", "original"])
        self.assertTrue(all("local-maintain --apply" in a["requires_owner_authorization"]
                            for a in result["priority_cache_actions"]))
        self.assertEqual(len(result["review_only_large_buckets"]), 1)
        self.assertEqual(result["review_only_large_buckets"][0]["mutation_authority"], "NONE")
        self.assertNotIn("codex_worktrees", json.dumps(result["priority_cache_actions"]))
        self.assertFalse(result["auto_delete_permitted"])
        self.assertFalse(result["financial_or_release_authority"])
        self.assertTrue(result["coverage"]["overlapping_parent_child_rows"])
        self.assertEqual(result["heartbeat"]["capacity"], "CRITICAL")
        self.assertEqual(result["next_census_command"], "aoe2war storage local-pressure --limit 512")

    def test_generic_cache_review_identifies_protected_child_and_owner_readonly_command(self):
        x = pressure()
        x["measured"].append({
            "name": "generic_cache", "classification": "REVIEW_GENERATED",
            "allocated_bytes": 5 * 1024**3, "complete": True,
            "mutation_allowed": False,
        })
        result = mod.plan(base(), ext(), electron(), x, watchdog())
        review = {r["name"]: r for r in result["review_only_large_buckets"]}
        generic = review["generic_cache"]
        self.assertTrue(generic["contains_known_protected_descendant"])
        self.assertEqual(
            generic["next_readonly_inspection"],
            "aoe2war storage local-pressure --focus generic_cache"
        )
        self.assertEqual(generic["mutation_authority"], "NONE")
        self.assertNotIn("generic_cache", [r["lane"] for r in result["priority_cache_actions"]])

    def test_incomplete_or_invalid_cache_class_never_becomes_zero_or_cleanup(self):
        bad = electron()
        bad["electron_candidates"][0]["allocated_bytes"] = False
        result = mod.plan(base(), ext(), bad, pressure(False), watchdog())
        self.assertEqual(result["cache_lanes"]["electron"]["status"], "UNKNOWN_OR_UNSAFE")
        self.assertIsNone(result["cache_lanes"]["electron"]["allocated_bytes"])
        self.assertNotIn("electron", [r["lane"] for r in result["priority_cache_actions"]])
        self.assertFalse(result["coverage"]["named_census_complete"])
        self.assertEqual(result["status"], "REVIEW_REQUIRED")

    def test_symlinked_cache_and_failed_census_fail_closed(self):
        bad = ext()
        bad["extra_candidates"][0]["blocked_reason"] = "symlink ancestor"
        result = mod.plan(base(), bad, electron(), {"status": "UNKNOWN"}, {"overall": "UNKNOWN"})
        self.assertEqual(result["cache_lanes"]["extended"]["status"], "UNKNOWN_OR_UNSAFE")
        self.assertEqual(result["coverage"]["incomplete_reasons"], ["CENSUS_UNAVAILABLE"])
        self.assertFalse(result["coverage"]["named_census_complete"])
        self.assertEqual(result["heartbeat"]["overall"], "UNKNOWN")

    def test_empty_named_caches_not_claimed_to_be_zero_junk(self):
        b, e, v = base(), ext(), electron()
        for r in b["before"]["regenerable"]:
            r["allocated_bytes"] = 0
        for r in e["extra_candidates"]:
            r["allocated_bytes"] = 0
        for r in v["electron_candidates"]:
            r["allocated_bytes"] = 0
        good_watchdog = {"overall": "PASS", "heartbeat": {"status": "FRESH"},
                         "capacity": {"status": "OBSERVED_NO_NAMED_CAPACITY_HOLD"}}
        result = mod.plan(b, e, v, pressure(), good_watchdog)
        self.assertEqual(result["known_cache_allocated_bytes"], 0)
        self.assertEqual(result["priority_cache_actions"], [])
        self.assertEqual(result["status"], "NAMED_CACHES_EMPTY_OTHER_CLASSES_STILL_UNCLASSIFIED")
        self.assertTrue(result["coverage"]["unclassified_whole_home"])

    def test_probe_failed_or_timeout_is_unknown_not_empty(self):
        with mock.patch.object(mod.subprocess, "run", side_effect=OSError("unknown")):
            self.assertEqual(mod.observe(["python3"], cwd=ROOT)["status"], "UNKNOWN")
        with mock.patch.object(mod.subprocess, "run",
                               return_value=mock.Mock(returncode=2, stdout='{"overall":"HOLD"}')):
            self.assertEqual(mod.observe(["health"], cwd=ROOT, accept_hold=True)["overall"], "HOLD")
            self.assertEqual(mod.observe(["cache"], cwd=ROOT)["status"], "UNKNOWN")

    def test_level1_and_level2_registers_never_claim_unique_apfs_gain(self):
        first = base()
        first["before"]["regenerable"][0]["path"] = "/private/test/Library/Caches/yarn"
        observed = pressure(False)
        observed["measurement_gap_count"] = 1
        observed["measurement_gaps"] = [{
            "name": "generic_cache", "path": "/private/test/.cache",
            "reason": "DU_TIMEOUT", "allocated_bytes": None,
            "metadata_fingerprint_sha256": "a" * 64,
            "next_readonly_action": "RECHECK_NAMED_PATH",
            "mutation_allowed": False,
        }]
        observed["apfs_accounting"] = {
            "ordinary_available_bytes": 10 * 1024 ** 3,
            "unique_clone_bytes": None, "snapshots_bytes": None,
            "verified_reclaimed_bytes": None,
        }
        observed["measured"].append({
            "name": "generic_cache", "path": "/private/test/.cache",
            "classification": "REVIEW_GENERATED", "allocated_bytes": None,
            "complete": False, "measurement_reason": "DU_TIMEOUT",
        })
        result = mod.plan(first, ext(), electron(), observed, watchdog())
        self.assertEqual(result["coverage"]["measurement_gap_count"], 1)
        self.assertEqual(result["coverage"]["measurement_gaps"][0]["reason"], "DU_TIMEOUT")
        self.assertEqual(result["level_1_certified_reclaimable_bytes"], 0)
        self.assertIsNone(result["level_1_unique_apfs_gain_estimate_bytes"])
        candidate = result["level_1_candidate_register"][0]
        self.assertEqual(candidate["allocated_bytes"], 1000)
        self.assertEqual(candidate["consumer_status"], "UNKNOWN")
        self.assertEqual(candidate["mutation_authority"], "NONE")
        self.assertIsNone(candidate["expected_unique_apfs_gain_bytes"])
        review = result["level_2_owner_review_register"][0]
        self.assertEqual(review["name"], "generic_cache")
        self.assertIsNone(review["allocated_bytes"])
        self.assertEqual(review["mutation_authority"], "NONE")
        self.assertEqual(result["level_1_closure"]["status"], "HOLD_NOT_CERTIFIED")
        self.assertEqual(result["level_1_closure"]["native_independent_observation_cycles"], 0)

    def test_level2_includes_generated_and_project_paths_with_symlink_holds(self):
        observed = pressure(False)
        observed["observed_path_count"] = 5
        observed["displayed_path_count"] = 5
        observed["measurement_gap_count"] = 1
        observed["measurement_gaps"] = [{
            "name": "worktree_generated:agent:node_modules",
            "path": "/tmp/worktrees/agent/node_modules",
            "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
            "reason": "SYMLINK_TARGET", "allocated_bytes": None,
            "metadata_fingerprint_sha256": "b" * 64,
            "next_readonly_action": "REVIEW_LINK_OR_MOUNT",
            "mutation_allowed": False,
        }]
        observed["measured"].extend([
            {
                "name": "worktree_generated:agent:node_modules",
                "path": "/tmp/worktrees/agent/node_modules",
                "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
                "allocated_bytes": None, "complete": False,
                "measurement_reason": "SYMLINK_TARGET",
                "metadata_fingerprint_sha256": "b" * 64,
                "next_readonly_action": "REVIEW_LINK_OR_MOUNT",
            },
            {
                "name": "project:api-prodn", "path": "/tmp/projects/api-prodn",
                "classification": "PROJECT_REVIEW_NEVER_AUTO_DELETE",
                "allocated_bytes": 1234, "complete": True,
                "measurement_reason": "MEASURED",
            },
            {
                "name": "codex_runtimes", "path": "/tmp/private/.cache/codex-runtimes",
                "classification": "PROTECTED_ACTIVE_RUNTIME_UNKNOWN",
                "allocated_bytes": 9999, "complete": True,
                "measurement_reason": "MEASURED",
            },
        ])
        result = mod.plan(base(), ext(), electron(), observed, watchdog())
        register = result["level_2_owner_review_register"]
        names = {r["name"] for r in register}
        self.assertIn("worktree_generated:agent:node_modules", names)
        self.assertIn("project:api-prodn", names)
        self.assertNotIn("codex_runtimes", names)
        held = next(r for r in register
                    if r["name"] == "worktree_generated:agent:node_modules")
        self.assertIsNone(held["allocated_bytes"])
        self.assertEqual(held["risk_classification"],
                         "LEVEL_2_HOLD_SYMLINK_REFERENCE_NO_TRAVERSAL")
        self.assertEqual(held["mutation_authority"], "NONE")
        self.assertEqual(held["metadata_fingerprint_sha256"], "b" * 64)
        self.assertTrue(result["level_2_register_coverage"]["complete_named_display"])
        self.assertTrue(result["level_2_register_coverage"]["gross_allocations_must_not_be_summed"])
        self.assertEqual(result["level_1_certified_reclaimable_bytes"], 0)
        self.assertEqual(result["level_1_closure"]["status"], "HOLD_NOT_CERTIFIED")

    def test_truncated_census_never_claims_full_level2_coverage(self):
        observed = pressure()
        observed["observed_path_count"] = 999
        observed["displayed_path_count"] = 2
        result = mod.plan(base(), ext(), electron(), observed, watchdog())
        self.assertFalse(result["level_2_register_coverage"]["complete_named_display"])
        self.assertEqual(result["level_2_register_coverage"]["source_rows_observed"], 999)
        self.assertEqual(result["level_2_register_coverage"]["source_rows_displayed"], 2)

    def test_human_cli_is_read_only_and_has_no_auto_apply(self):
        with mock.patch.object(mod, "observe", side_effect=[
                base(), ext(), electron(), pressure(), watchdog()]):
            output = io.StringIO()
            with redirect_stdout(output), mock.patch.object(
                    mod.sys, "argv", ["local-plan"]):
                self.assertEqual(mod.main(), 0)
            self.assertIn("READ ONLY", output.getvalue())
            self.assertIn("OWNER APPROVAL REQUIRED", output.getvalue())
            self.assertNotIn("rm -rf", output.getvalue())


if __name__ == "__main__":
    unittest.main()
