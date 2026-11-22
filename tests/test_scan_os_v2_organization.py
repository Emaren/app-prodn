#!/usr/bin/env python3
"""Scan OS V2 / Organization OS source-only integration and hostile inputs.

Never touches a production host, starts a scanner subprocess, or creates a
permission. Fixtures use only owner-owned disposable local temp directories.
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import scan_os as scan
import scan_os_learning as learn
import organization_os as org
import scan_os_maturity as mature


class ScanLearningV2Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="scan-os-v2-fixture-")
        base = Path(self.temp.name)
        self.root = base / "local-source"
        self.root.mkdir(mode=0o700)
        self.scripts = self.root / "scripts"
        self.scripts.mkdir(mode=0o700)
        self.files = {
            "scripts/docs_v2_check.py": b"original docs source\n" * 160,
            "scripts/scan_tracked_secrets.py": b"original tracked secret checker\n" * 120,
        }
        for path, data in self.files.items():
            (self.root / path).write_bytes(data)
        self.state = base / "private-state"
        self.state.mkdir(mode=0o700)
        self.c = scan.load_catalog()

    def tearDown(self):
        self.temp.cleanup()

    def run_one(self, mode, reason=""):
        return learn.perform(self.c, goal="release", profile=mode,
                             source_root=self.root, state_dir=self.state,
                             reason=reason)

    def test_catalog_is_exact_original_eight(self):
        self.assertEqual(len(self.c["scans"]), 8)
        self.assertEqual(len({v["group"] for v in self.c["scans"]}), 6)
        self.assertEqual(scan.plan(self.c, goal="storage_hel1")
                         ["maximum_planned_seconds_sequential_if_ALL_executed"], 33)

    def test_incremental_first_uses_content_then_reuses_hashes(self):
        first = self.run_one("INCREMENTAL")
        second = self.run_one("INCREMENTAL")
        self.assertEqual(first["files_hashed"], 2)
        self.assertEqual(first["cached_hashes_reused"], 0)
        self.assertEqual(first["content_bytes_read"], sum(map(len, self.files.values())))
        self.assertEqual(second["files_hashed"], 0)
        self.assertEqual(second["files_metadata_visited"], 2)
        self.assertEqual(second["content_bytes_read"], 0)
        self.assertEqual(second["cached_hashes_reused"], 2)
        self.assertEqual(second["source_coverage_fraction"], 1.0)
        self.assertIsNone(second["false_positives_confirmed"])
        self.assertIsNone(second["physical_io_bytes_read"])
        self.assertFalse(second["mutation_authorized"])

    def test_changed_file_rehashes_only_one(self):
        self.run_one("INCREMENTAL")
        path = self.root / "scripts/docs_v2_check.py"
        path.write_bytes(path.read_bytes() + b"changed source bytes")
        x = self.run_one("INCREMENTAL")
        self.assertEqual(x["files_hashed"], 1)
        self.assertEqual(x["cached_hashes_reused"], 1)
        self.assertEqual(x["changed_sources"], ["scripts/docs_v2_check.py"])
        self.assertEqual(x["content_bytes_read"], path.stat().st_size)

    def test_hot_has_no_source_walk_or_digest(self):
        self.run_one("INCREMENTAL")
        with patch.object(learn, "source_identity", side_effect=AssertionError("HOT WALK")):
            x = self.run_one("HOT")
        self.assertEqual(x["files_metadata_visited"], 0)
        self.assertEqual(x["files_hashed"], 0)
        self.assertEqual(x["content_bytes_read"], 0)
        self.assertIsNone(x["source_coverage_fraction"])
        self.assertEqual(x["status"], "CACHED_UNVERIFIED")
        self.assertEqual(x["cached_hashes_reused"], 2)
        self.assertFalse(x["original_source_crypto_verified"])

    def test_deep_explicit_reason_and_no_full_tree_walk(self):
        self.run_one("INCREMENTAL")
        with self.assertRaisesRegex(learn.ObservationHold, "DEEP_REQUIRES"):
            self.run_one("DEEP")
        with self.assertRaisesRegex(learn.ObservationHold, "DEEP_REQUIRES"):
            self.run_one("DEEP", "all-disks cleanup")
        # An unregistered 1MiB file is never read by the bounded source profile.
        (self.scripts / "outside-original-catalog.py").write_bytes(b"X" * 1048576)
        x = self.run_one("DEEP", "Verify changed registered release sources only")
        self.assertEqual(x["files_hashed"], 2)
        self.assertEqual(x["files_metadata_visited"], 2)
        self.assertEqual(x["content_bytes_read"], sum(map(len, self.files.values())))
        self.assertFalse(x["scope_is_whole_drive"])
        self.assertTrue(x["deep_reason"])

    def test_missing_and_symlinked_sources_are_unknown(self):
        self.run_one("INCREMENTAL")
        p = self.root / "scripts/docs_v2_check.py"
        p.unlink()
        p.symlink_to(self.root / "scripts/scan_tracked_secrets.py")
        a = self.run_one("INCREMENTAL")
        self.assertEqual(a["source_coverage_fraction"], 0.5)
        self.assertIn("scripts/docs_v2_check.py", a["missing_sources"])
        self.assertEqual(a["status"], "PARTIAL_SOURCE_UNKNOWN")
        self.assertFalse(a["mutation_authorized"])

    def test_source_root_symlink_rejected(self):
        link = self.root.parent / "root-alias"
        link.symlink_to(self.root)
        with self.assertRaisesRegex(learn.ObservationHold, "SOURCE_ROOT"):
            learn.perform(self.c, goal="release", profile="HOT",
                          source_root=link, state_dir=self.state)

    def test_nonprivate_state_denied(self):
        self.state.chmod(0o755)
        with self.assertRaisesRegex(learn.ObservationHold, "PRIVATE_DIR"):
            self.run_one("HOT")

    def test_symlink_checkpoint_denied(self):
        external = self.root.parent / "external.json"
        external.write_text("{}")
        (self.state / "scan-release.json").symlink_to(external)
        with self.assertRaisesRegex(learn.ObservationHold, "RECEIPT_OWNER_MODE"):
            self.run_one("HOT")
        self.assertEqual(external.read_text(), "{}")

    def test_cross_host_scan_is_not_claimed_locally(self):
        with self.assertRaisesRegex(learn.ObservationHold, "NO_CROSS_HOST"):
            learn.perform(self.c, goal="storage_hel1", profile="DEEP",
                          source_root=self.root, state_dir=self.state,
                          reason="Try to scan HEL1 original host via Mac")

    def test_metrics_are_real_local_nonnegative(self):
        a = self.run_one("INCREMENTAL")
        for key in ("wall_ns", "cpu_ns", "peak_process_rss_bytes",
                    "native_f_bavail_bytes"):
            self.assertIsInstance(a[key], int)
            self.assertGreater(a[key], 0)
        self.assertEqual(a["authority"], "UNSIGNED_LOCAL_READ_ONLY_NOT_PRODUCTION_CERTIFIED")

    def test_learning_baseline_p50_p95_from_actual_runs(self):
        for mode in ("HOT", "INCREMENTAL", "DEEP"):
            for _ in range(5):
                self.run_one(mode, "Bounded source integrity investigation" if mode == "DEEP" else "")
        summary = learn.learning_summary(self.state)
        self.assertEqual(summary["receipts_count"], 15)
        for mode, statrow in summary["profiles"].items():
            self.assertEqual(statrow["runs"], 5)
            self.assertIsInstance(statrow["wall_ms_p95"], float)
            self.assertGreaterEqual(statrow["wall_ms_p95"], statrow["wall_ms_p50"])
            self.assertEqual(statrow["statistical_robustness"], "LOCAL_ONLY")
            self.assertFalse(statrow["physical_io_bytes_known"])
            self.assertIsNone(statrow["false_positive_rate"])

    def test_profile_reuse_and_deep_count(self):
        self.run_one("INCREMENTAL")
        self.run_one("INCREMENTAL")
        self.run_one("HOT")
        self.run_one("DEEP", "Only exact registered source files")
        b = learn.learning_summary(self.state)
        self.assertEqual(b["profiles"]["INCREMENTAL"]["reused_hashes_total"], 2)
        self.assertEqual(b["profiles"]["DEEP"]["bounded_deep_runs"], 1)

    def test_state_scope_drift_denied(self):
        self.run_one("INCREMENTAL")
        another = self.root.parent / "other-source"
        another.mkdir(mode=0o700)
        with self.assertRaisesRegex(learn.ObservationHold, "STATE_SCOPE_DRIFT"):
            learn.perform(self.c, goal="release", profile="INCREMENTAL",
                          source_root=another, state_dir=self.state)

    def test_receipt_tampered_permission_denied(self):
        self.run_one("INCREMENTAL")
        p = next((self.state / "receipts").iterdir())
        r = json.loads(p.read_text())
        r["mutation_authorized"] = True
        p.write_text(json.dumps(r))
        with self.assertRaisesRegex(learn.ObservationHold, "UNTRUSTED_LEARNING_RECEIPT"):
            learn.learning_summary(self.state)

    def test_no_duplicate_registered_source_or_auto_mutation(self):
        self.assertEqual(set(self.files), {
            s["source_path"] for s in self.c["scans"] if s["goal"] == "release"})
        self.assertFalse(self.run_one("HOT")["mutation_authorized"])


class OrganizationV1Tests(unittest.TestCase):
    def setUp(self):
        self.c = scan.load_catalog()
        self.links = org.load_links()

    def validate(self, data=None):
        return org.graph(data or self.links, self.c)

    def test_one_graph_eight_views_six_producer_groups(self):
        g = self.validate()
        self.assertEqual(len(g["scans"]), 8)
        self.assertEqual(len([x for x in g["objects"] if x["kind"] == "SCAN_PRODUCER"]), 6)
        self.assertTrue(g["no_privileged_service"])
        for view in org.VIEWS:
            with self.subTest(view=view):
                v = org.project(g, view)
                self.assertFalse(v["delete_authorized"])
                self.assertEqual(v["source_graph_schema"], g["schema"])

    def test_ledger_and_accounting_never_infer_reclaim(self):
        g = self.validate()
        l = org.project(g, "ledger")
        a = org.project(g, "accounting")
        self.assertTrue(l["empty_is_not_no_operations"])
        self.assertIsNone(a["physical_reclaim_bytes"])
        self.assertIsNone(a["disjoint_coverage_fraction"])
        self.assertTrue(a["no_gross_byte_summation"])

    def test_duplicate_source_conflict_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][1]["path"] = data["objects"][0]["path"]
        with self.assertRaisesRegex(org.OrganizationHold, "DUPLICATE_SOURCE"):
            self.validate(data)

    def test_stale_reference_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][1]["dependencies"].append("FAKE_REFERENCE")
        with self.assertRaisesRegex(org.OrganizationHold, "STALE_DEPENDENCY"):
            self.validate(data)

    def test_dependency_cycle_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][0]["dependencies"].append("SCAN_OS")
        with self.assertRaisesRegex(org.OrganizationHold, "CYCLE"):
            self.validate(data)

    def test_symlink_reference_cycle_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][0]["symlink_to"] = "SCAN_OS"
        with self.assertRaisesRegex(org.OrganizationHold, "CYCLE"):
            self.validate(data)

    def test_symlink_destination_not_made_up(self):
        data = copy.deepcopy(self.links)
        data["objects"][0]["symlink_destinations"] = ["/private/original"]
        with self.assertRaisesRegex(org.OrganizationHold, "SYMLINK_DESTINATIONS"):
            self.validate(data)

    def test_forged_physical_reclaim_or_copy_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][0]["recovery_evidence"] = "YES"
        with self.assertRaisesRegex(org.OrganizationHold, "SOURCE_NOT_ERASABLE"):
            self.validate(data)
        data = copy.deepcopy(self.links)
        data["objects"][0]["unique_reclaim_bytes"] = 1000000000
        with self.assertRaisesRegex(org.OrganizationHold, "NODE_FIELDS"):
            self.validate(data)

    def test_path_traversal_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][0]["path"] = "docs/../../financial/private"
        with self.assertRaisesRegex(org.OrganizationHold, "NODE_SOURCE_ESCAPE"):
            self.validate(data)

    def test_duplicate_id_denied(self):
        data = copy.deepcopy(self.links)
        data["objects"][1]["id"] = data["objects"][0]["id"]
        with self.assertRaisesRegex(org.OrganizationHold, "NODE_DUPLICATE_ID"):
            self.validate(data)

    def test_unresolved_is_not_buried(self):
        g = self.validate()
        ids = {v["id"] for v in org.project(g, "appendix")["unresolved"]}
        self.assertIn("INTEL_RECEIVER_LIVE_RECEIPT", ids)
        self.assertIn("WORKSPACE_OS_RUNTIME_SOURCE", ids)


class MaturityRubricTests(unittest.TestCase):
    def test_exact_35_gates_and_weights(self):
        config = mature.rubric()
        self.assertEqual(sum(len(d["gates"]) for d in config["dimensions"]), 35)
        self.assertEqual(sum(x["weight"] for x in config["dimensions"][0]["gates"]), 100)

    def test_no_local_profile_never_makes_certified_score(self):
        result = mature.score()
        self.assertIsNone(result["overall_certified_0_100"])
        self.assertEqual(len(result["dimensions"]), 7)
        for area in result["dimensions"]:
            self.assertIsNone(area["score_certified"])
            self.assertLessEqual(area["score_lower_bound"], area["score_upper_bound"])
        for area in result["dimensions"]:
            if area["dimension"] in ("pruning", "recovery", "production_usability"):
                self.assertEqual(area["score_lower_bound"], 0)
                self.assertEqual(area["score_upper_bound"], 100)

    def test_observed_local_benchmark_not_owner_authority(self):
        with tempfile.TemporaryDirectory() as t:
            base = Path(t)
            root = base / "source"
            root.mkdir(mode=0o700)
            (root / "scripts").mkdir(mode=0o700)
            for name in ("docs_v2_check.py", "scan_tracked_secrets.py"):
                (root / "scripts" / name).write_text("original source")
            state = base / "state"
            state.mkdir(mode=0o700)
            for profile in ("INCREMENTAL", "INCREMENTAL", "HOT", "DEEP"):
                learn.perform(scan.load_catalog(), goal="release", profile=profile,
                              source_root=root, state_dir=state,
                              reason="Explicit source-bound deep benchmark" if profile == "DEEP" else "")
            a = mature.score(benchmark_dir=state)
            areas = {x["dimension"]: x for x in a["dimensions"]}
            self.assertEqual(areas["scanning"]["score_lower_bound"], 60)
            self.assertEqual(areas["organization"]["score_lower_bound"], 60)
            self.assertEqual(areas["pruning"]["score_lower_bound"], 0)
            self.assertIsNone(a["overall_certified_0_100"])
            self.assertTrue(a["never_grants_execution_authority"])


if __name__ == "__main__":
    unittest.main()
