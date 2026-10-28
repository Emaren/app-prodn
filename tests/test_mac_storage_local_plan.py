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
        self.assertEqual(result["next_census_command"], "aoe2war storage local-pressure --limit 1024")

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

    def test_gigabyte_rank_uses_exact_measured_generated_not_project_parents(self):
        x = pressure(False)
        gib = 1024 ** 3
        root = "/tmp/projects/game"
        x["measured"].extend([
            {"name": "project:game", "path": root,
             "classification": "PROJECT_REVIEW_NEVER_AUTO_DELETE",
             "allocated_bytes": 12 * gib, "complete": True},
            {"name": "project_generated:game:.next", "path": root + "/.next",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "allocated_bytes": 2 * gib, "complete": True,
             "measurement_reason": "MEASURED", "symlink": False,
             "mutation_allowed": False, "metadata_fingerprint_sha256": "a" * 64},
            {"name": "project_generated:game:node_modules",
             "path": root + "/node_modules",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "allocated_bytes": 800 * 1024**2, "complete": True,
             "measurement_reason": "MEASURED", "symlink": False,
             "mutation_allowed": False, "metadata_fingerprint_sha256": "b" * 64},
            {"name": "project_generated:game:dist", "path": root + "/dist",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "allocated_bytes": 255 * 1024**2, "complete": True,
             "measurement_reason": "MEASURED", "symlink": False,
             "mutation_allowed": False, "metadata_fingerprint_sha256": "c" * 64},
        ])
        x["observed_path_count"] = len(x["measured"])
        x["displayed_path_count"] = len(x["measured"])
        result = mod.plan(base(), ext(), electron(), x, watchdog())
        rank = result["gigabyte_generated_ranked_plan"]
        self.assertEqual(rank["ranked_count"], 2)
        self.assertEqual([v["artifact_class"] for v in rank["ranked_generated"]],
                         [".next", "node_modules"])
        self.assertEqual(rank["nominal_nonoverlap_unprotected_allocated_bytes"],
                         2 * gib + 800 * 1024**2)
        self.assertEqual(rank["certified_unique_reclaimable_bytes"], 0)
        self.assertIsNone(rank["predicted_unique_reclaimable_bytes"])
        self.assertEqual(rank["verdict"], "EVIDENCE_INSUFFICIENT")
        self.assertTrue(all(v["mutation_authority"] == "NONE"
                            for v in rank["ranked_generated"]))
        self.assertTrue(all("LIVE_CONSUMERS_NOT_PROVEN" in v["hold_reasons"]
                            for v in rank["ranked_generated"]))

    def test_gigabyte_rank_excludes_protected_e5_and_codex_and_never_follows_links(self):
        gib = 1024 ** 3
        x = pressure(False)
        x["measured"].extend([
            {"name": "project_generated:app-prodn-e5-seal:.next",
             "path": "/tmp/projects/app-prodn-e5-seal/.next",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "allocated_bytes": 4 * gib, "complete": True,
             "measurement_reason": "MEASURED", "symlink": False,
             "mutation_allowed": False, "metadata_fingerprint_sha256": "e" * 64},
            {"name": "worktree_generated:agent:node_modules",
             "path": "/tmp/.codex/worktrees/agent/node_modules",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "allocated_bytes": None, "complete": False,
             "measurement_reason": "SYMLINK_TARGET", "symlink": True,
             "mutation_allowed": False, "metadata_fingerprint_sha256": "f" * 64},
            {"name": "project_generated:game:dist",
             "path": "/tmp/projects/game/dist",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "allocated_bytes": 3 * gib, "complete": True,
             "measurement_reason": "MEASURED", "symlink": False,
             "mutation_allowed": True, "metadata_fingerprint_sha256": "b" * 64},
        ])
        rank = mod.generated_rank(x)
        self.assertEqual(rank["ranked_count"], 1)
        self.assertTrue(rank["ranked_generated"][0]["protected_ancestry"])
        self.assertEqual(rank["nominal_nonoverlap_unprotected_allocated_bytes"], 0)
        self.assertEqual(rank["unknown_generated"][0]["reason"], "SYMLINK_TARGET")
        self.assertFalse(rank["apply_permitted"])

    def test_gigabyte_rank_detects_generated_parent_child_and_duplicate_paths(self):
        gib = 1024**3
        x = pressure()
        entries = []
        for name, path, amount in (
            ("dist", "/tmp/project/dist", 2*gib),
            ("build", "/tmp/project/dist/build", gib),
            ("dist-alias", "/tmp/project/dist", 2*gib),
        ):
            entries.append({
                "name": "project_generated:game:" + name, "path": path,
                "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
                "allocated_bytes": amount, "complete": True,
                "measurement_reason": "MEASURED", "symlink": False,
                "mutation_allowed": False, "metadata_fingerprint_sha256": "a" * 64,
            })
        x["measured"].extend(entries)
        rank = mod.generated_rank(x)
        self.assertEqual(rank["ranked_count"], 2)
        self.assertTrue(all("PARENT_CHILD_GENERATED_OVERLAP" in v["hold_reasons"]
                            for v in rank["ranked_generated"]))
        self.assertEqual(rank["nominal_nonoverlap_unprotected_allocated_bytes"], 0)
        self.assertIn("DUPLICATE_PATH_HOLD",
                      [v["reason"] for v in rank["unknown_generated"]])

    def test_gigabyte_rank_has_fail_closed_census_coverage_and_no_apply(self):
        self.assertFalse(mod.generated_rank({"status": "UNKNOWN"})["named_enumeration_complete"])
        x = pressure()
        x["observed_path_count"] = 999
        x["displayed_path_count"] = 2
        self.assertFalse(mod.generated_rank(x)["named_enumeration_complete"])
        r = mod.generated_rank(x)
        self.assertEqual(r["ranked_count"], 0)
        self.assertIsNone(r["shortfall_bytes"])
        self.assertFalse(r["apply_permitted"])

    def test_accepted_five_path_protection_roles_and_zero_qualified_reclaim(self):
        gib = 1024 ** 3
        roots = [
            ("/Users/test/projects/AoE2HDBets/.worktrees/app-prodn-e5-seal/.next",
             1.214, "PROTECTED_E5_SEAL"),
            ("/Users/test/projects/AoE2HDBets/app-prodn/node_modules",
             0.830, "PROTECTED_CANONICAL_ACTIVE_DEPENDENCIES"),
            ("/Users/test/projects/AoE2HDBets/.worktrees/codex-final-satchel-qualification/node_modules",
             0.830, "PROTECTED_CODEX_WORKTREE"),
            ("/Users/test/projects/AoE2HDBets/app-prodn-renaissance-phase1-20261020/node_modules",
             0.830, "HISTORICAL_GENERATED_UNQUALIFIED"),
            ("/Users/test/projects/AoE2HDBets/aoe2-watcher/dist",
             0.688, "PROTECTED_WATCHER_SIGNED_WEBSITE_DISTRIBUTION"),
        ]
        x = pressure()
        for i, (path, gib_size, role) in enumerate(roots):
            x["measured"].append({
                "name": "project_generated:" + str(i) + ":" + Path(path).name,
                "path": path, "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
                "allocated_bytes": round(gib_size * gib), "complete": True,
                "measurement_reason": "MEASURED", "symlink": False,
                "mutation_allowed": False, "metadata_fingerprint_sha256": "a" * 64,
            })
        result = mod.generated_rank(x)
        self.assertEqual(result["ranked_count"], 5)
        self.assertAlmostEqual(sum(v["allocated_bytes"] for v in result["ranked_generated"]) / gib,
                               4.392, places=3)
        by_path = {v["path"]: v for v in result["ranked_generated"]}
        for path, size, role in roots:
            row = by_path[path]
            self.assertEqual(row["protection_role"], role)
            self.assertEqual(row["protected_ancestry"], role != "HISTORICAL_GENERATED_UNQUALIFIED")
            self.assertEqual(row["mutation_authority"], "NONE")
            self.assertIsNone(row["unique_recoverable_bytes"])
            self.assertEqual(row["hardlink_proof"], "UNKNOWN")
            self.assertIn("HARDLINK_TREE_NOT_PROVEN", row["hold_reasons"])
            self.assertIn("LIVE_CONSUMERS_NOT_PROVEN", row["hold_reasons"])
            if row["protected_ancestry"]:
                self.assertIn("PROTECTED_ANCESTRY_HOLD", row["hold_reasons"])
                self.assertIn(role, row["hold_reasons"])
        self.assertAlmostEqual(result["nominal_nonoverlap_unprotected_allocated_bytes"] / gib,
                               0.830, places=3)
        self.assertEqual(result["certified_unique_reclaimable_bytes"], 0)
        self.assertIsNone(result["predicted_unique_reclaimable_bytes"])
        self.assertEqual(result["verdict"], "EVIDENCE_INSUFFICIENT")
        self.assertFalse(result["apply_permitted"])

    def test_codex_prefix_only_under_worktree_scope_and_alias_cannot_look_safe(self):
        for path in (
            "/Users/test/.codex/worktrees/agent/app-prodn/node_modules",
            "/Users/test/projects/AoE2HDBets/.worktrees/codex-escrow-v3/node_modules",
            "/Users/test/projects/AoE2HDBets/.aoe2war-workspaces/codex-a/app-prodn/build",
        ):
            self.assertEqual(mod.generated_protection_role(path),
                             ("PROTECTED_CODEX_WORKTREE", True))
        self.assertEqual(
            mod.generated_protection_role(
                "/Users/test/projects/AoE2HDBets/app-prodn-renaissance-phase1-20261020/node_modules"),
            ("HISTORICAL_GENERATED_UNQUALIFIED", False))
        self.assertEqual(
            mod.generated_protection_role("/tmp/projects/codex-sample/node_modules"),
            ("HISTORICAL_GENERATED_UNQUALIFIED", False))
        self.assertEqual(
            mod.generated_protection_role("/tmp/projects/app-prodn/node_modules"),
            ("HISTORICAL_GENERATED_UNQUALIFIED", False))

    def test_watcher_website_signed_dist_is_held_not_an_unprotected_build(self):
        for path in ("/Users/test/projects/AoE2HDBets/aoe2-watcher/dist",
                     "/Users/test/projects/aoe2-watcher/dist"):
            self.assertEqual(mod.generated_protection_role(path),
                ("PROTECTED_WATCHER_SIGNED_WEBSITE_DISTRIBUTION", True))
        self.assertEqual(mod.generated_protection_role(
            "/Users/test/projects/AoE2HDBets/other-watcher/dist"),
            ("HISTORICAL_GENERATED_UNQUALIFIED", False))

    def test_shared_hardlink_claim_in_input_never_becomes_physical_reclaim_proof(self):
        gib = 1024**3
        path = "/tmp/projects/stale-build/node_modules"
        x = pressure()
        x["measured"].append({
            "name": "project_generated:stale-build:node_modules", "path": path,
            "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
            "allocated_bytes": gib, "complete": True, "measurement_reason": "MEASURED",
            "symlink": False, "mutation_allowed": False,
            "metadata_fingerprint_sha256": "f" * 64,
            "hardlink_proof": "VERIFIED", "st_nlink": 2,
            "unique_recoverable_bytes": gib, "owner_approved": True,
        })
        row = mod.generated_rank(x)["ranked_generated"][0]
        self.assertEqual(row["hardlink_proof"], "UNKNOWN")
        self.assertIsNone(row["unique_recoverable_bytes"])
        self.assertFalse(row["owner_verified"])
        self.assertIn("HARDLINK_TREE_NOT_PROVEN", row["hold_reasons"])
        self.assertEqual(row["mutation_authority"], "NONE")

    def test_duplicate_exact_generated_path_drops_from_nominal_gross(self):
        gib = 1024**3
        x = pressure()
        path = "/tmp/projects/stale-deps/node_modules"
        row = {
            "name": "project_generated:stale-deps:node_modules",
            "path": path, "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
            "allocated_bytes": gib, "complete": True, "measurement_reason": "MEASURED",
            "symlink": False, "mutation_allowed": False,
            "metadata_fingerprint_sha256": "f" * 64,
        }
        x["measured"].extend((row, dict(row)))
        ranked = mod.generated_rank(x)
        self.assertEqual(ranked["ranked_count"], 1)
        self.assertEqual(ranked["nominal_nonoverlap_unprotected_allocated_bytes"], 0)
        self.assertIn("DUPLICATE_PATH_HOLD", ranked["ranked_generated"][0]["hold_reasons"])
        self.assertIn("DUPLICATE_PATH_HOLD", [v["reason"] for v in ranked["unknown_generated"]])
        self.assertEqual(ranked["certified_unique_reclaimable_bytes"], 0)

    def test_parent_child_generated_paths_do_not_count_as_disjoint(self):
        gib = 1024**3
        x = pressure()
        for name, path, size in (
            ("dist", "/tmp/projects/stale/dist", 2*gib),
            ("build", "/tmp/projects/stale/dist/build", gib),
        ):
            x["measured"].append({
                "name": "project_generated:stale:" + name,
                "path": path, "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
                "allocated_bytes": size, "complete": True,
                "measurement_reason": "MEASURED", "symlink": False,
                "mutation_allowed": False, "metadata_fingerprint_sha256": "b" * 64,
            })
        ranked = mod.generated_rank(x)
        self.assertEqual(ranked["nominal_nonoverlap_unprotected_allocated_bytes"], 0)
        self.assertTrue(all("PARENT_CHILD_GENERATED_OVERLAP" in row["hold_reasons"]
                            for row in ranked["ranked_generated"]))
        self.assertTrue(all(row["overlaps_generated"] for row in ranked["ranked_generated"]))
        self.assertFalse(ranked["apply_permitted"])

    def test_l1_campaign_never_seals_zero_eligible_without_independent_proofs(self):
        x = pressure()
        x["observed_path_count"] = 2
        x["displayed_path_count"] = 2
        x["scope_bounds"] = {
            "direct_project_roots_total": 121,
            "direct_project_roots_observed": 120,
            "direct_project_roots_omitted": 1,
            "canonical_git_worktrees_total": 61,
            "canonical_git_worktrees_observed": 60,
            "canonical_git_worktrees_omitted": 1}
        x["incomplete_reasons"] = ["PROJECT_DIRECTORY_LIMIT_120", "WORKTREE_LIMIT_60"]
        result = mod.plan(base(), ext(), electron(), x, watchdog())
        l1 = mod.l1_exhaustion_receipt(result, {"status": "OBSERVED_SHALLOW",
            "full_container_coverage_certified": False})
        self.assertEqual(l1["decision"], "L1_POLICY_EXHAUSTED_NO")
        self.assertEqual(l1["omitted_project_count"], 1)
        self.assertEqual(l1["omitted_worktree_count"], 1)
        self.assertIn("WHOLE_APFS_SHARED_AND_CLONE_EXTENTS_UNPROVEN", l1["blockers"])
        self.assertIn("NAMED_POLICY_SCOPE_INCOMPLETE_OR_UNKNOWN", l1["blockers"])
        self.assertEqual(l1["accepted_independent_gates_prior"], 2)
        self.assertEqual(l1["gate_count"], 8)
        self.assertIsNone(l1["no_eligible_action_signed_receipt"])
        self.assertIsNone(l1["predicted_unique_recoverable_bytes"])
        self.assertEqual(l1["certified_recovered_bytes"], 0)

    def test_l1_campaign_distinguishes_known_absent_symlinks_and_unknown(self):
        x = pressure()
        x["observed_path_count"] = len(x["measured"])
        x["displayed_path_count"] = len(x["measured"])
        x["measured"].extend([
            {"name": "project_generated:one:build", "path": "/tmp/projects/one/build",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "complete": True, "allocated_bytes": 0, "measurement_reason": "ABSENT",
             "symlink": False, "mutation_allowed": False},
            {"name": "project_generated:two:node_modules",
             "path": "/tmp/projects/two/node_modules",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "complete": False, "allocated_bytes": None, "measurement_reason": "SYMLINK_TARGET",
             "symlink": True, "mutation_allowed": False},
            {"name": "project_generated:three:dist", "path": "/tmp/projects/three/dist",
             "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
             "complete": False, "allocated_bytes": None,
             "measurement_reason": "DU_PERMISSION_DENIED",
             "symlink": False, "mutation_allowed": False},
        ])
        x["observed_path_count"] = len(x["measured"])
        x["displayed_path_count"] = len(x["measured"])
        result = mod.plan(base(), ext(), electron(), x, watchdog())
        receipt = mod.l1_exhaustion_receipt(result, {"status": "HOLD"})
        self.assertEqual(receipt["generated_nonmeasurement_reason_counts"],
                         {"ABSENT": 1, "DU_PERMISSION_DENIED": 1, "SYMLINK_TARGET": 1})
        self.assertIn("UNRESOLVED_GENERATED_OBSERVATIONS", receipt["blockers"])
        self.assertIn("PHYSICAL_CAPACITY_ACCOUNTING_HOLD", receipt["blockers"])
        self.assertEqual(receipt["decision"], "L1_POLICY_EXHAUSTED_NO")

    def test_l1_campaign_positive_historical_node_modules_not_promoted(self):
        x = pressure()
        x["measured"].append({
            "name": "project_generated:renaissance:node_modules",
            "path": "/tmp/projects/renaissance/node_modules",
            "classification": "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED",
            "complete": True, "allocated_bytes": 870_000_000,
            "measurement_reason": "MEASURED", "symlink": False,
            "mutation_allowed": False, "metadata_fingerprint_sha256": "f" * 64})
        x["observed_path_count"] = len(x["measured"])
        x["displayed_path_count"] = len(x["measured"])
        result = mod.plan(base(), ext(), electron(), x, watchdog())
        receipt = mod.l1_exhaustion_receipt(result, {"status": "OBSERVED_SHALLOW",
            "full_container_coverage_certified": False})
        paths = [z["path"] for z in receipt["candidate_holds"]]
        self.assertIn("/tmp/projects/renaissance/node_modules", paths)
        self.assertTrue(all(z["unique_apfs_gain_bytes"] is None
                            for z in receipt["candidate_holds"]))
        self.assertTrue(all(z["mutation_authority"] == "NONE"
                            for z in receipt["candidate_holds"]))
        self.assertEqual(receipt["decision"], "L1_POLICY_EXHAUSTED_NO")

    def test_local_plan_campaign_invokes_capacity_probe_only_when_opted_in(self):
        with mock.patch.object(mod, "observe", side_effect=[
                base(), ext(), electron(), pressure(), watchdog(),
                {"status": "HOLD", "reason": "NOT_NATIVE_MAC"}]) as probe:
            with (mock.patch.object(mod.Path, "is_file", return_value=True),
                  mock.patch.object(mod.Path, "is_symlink", return_value=False),
                  redirect_stdout(io.StringIO()),
                  mock.patch.object(
                      mod.sys, "argv", ["local-plan", "--l1-campaign", "--json"])):
                self.assertEqual(mod.main(), 0)
            self.assertEqual(probe.call_count, 6)
            self.assertIn("--capacity-only", probe.call_args.args[0])
        with mock.patch.object(mod, "observe", side_effect=[
                base(), ext(), electron(), pressure()]) as probe:
            with (mock.patch.object(mod.Path, "is_file", return_value=False),
                  redirect_stdout(io.StringIO()),
                  mock.patch.object(mod.sys, "argv", ["local-plan", "--json"])):
                self.assertEqual(mod.main(), 0)
            self.assertEqual(probe.call_count, 4)
            self.assertFalse(any("--capacity-only" in call.args[0]
                                 for call in probe.call_args_list))

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
