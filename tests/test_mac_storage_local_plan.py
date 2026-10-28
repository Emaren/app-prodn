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
