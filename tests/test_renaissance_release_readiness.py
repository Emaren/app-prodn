"""Adversarial source-bound release readiness tests; no network or writes."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "release_readiness", HERE.parent / "scripts/renaissance_release_readiness.py"
)
assert SPEC is not None and SPEC.loader is not None
rr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rr)
HEAD = "b" * 40
MAIN = "a" * 40
REPO = "Emaren/app-prodn"


def snapshot():
    runs = []
    jobs = {}
    for i, name in enumerate(rr.REQUIRED_WORKFLOWS, 1):
        rid = 4000 + i
        runs.append({
            "id": rid, "name": name, "head_sha": HEAD,
            "event": "pull_request", "run_number": 10,
            "run_attempt": 1, "status": "completed", "conclusion": "success",
        })
        if name in rr.REQUIRED_JOBS:
            jobs[str(rid)] = [
                {"name": job, "status": "completed", "conclusion": "success"}
                for job in rr.REQUIRED_JOBS[name]
            ]
    return {
        "repo": REPO,
        "pr": {
            "number": 824,
            "head": {"sha": HEAD, "repo": {"full_name": REPO}},
            "base": {"sha": MAIN, "ref": "main", "repo": {"full_name": REPO}},
            "state": "open", "draft": False, "mergeable": True,
        },
        "main": {"object": {"sha": MAIN}},
        "compare": {
            "status": "ahead", "base_commit": {"sha": MAIN},
            "head_commit": {"sha": HEAD},
        },
        "runs": runs, "jobs": jobs,
    }


class ReadinessTests(unittest.TestCase):
    def check(self, item):
        return rr.analyze(item, repo=REPO, pr_number=824, expected_head=HEAD)

    def test_all_candidate_ci_green_never_authorizes_deploy_or_score(self):
        report = self.check(snapshot())
        self.assertTrue(report["candidate_ci_qualified"])
        for name in (
            "protected_release_authorized",
            "artifact_specific_owner_authorization_verified",
            "live_build_parity_verified",
            "financial_release_authorized",
            "index_quality_score_approved",
        ):
            self.assertIs(report[name], False)
        self.assertIsNone(report["production_deployed"])

    def test_main_advanced_even_if_old_ci_green(self):
        item = snapshot()
        item["main"]["object"]["sha"] = "c" * 40
        item["compare"]["base_commit"]["sha"] = "c" * 40
        item["compare"]["status"] = "diverged"
        result = self.check(item)
        self.assertFalse(result["candidate_ci_qualified"])
        self.assertIn("MAIN_NOT_ANCESTOR", {entry["code"] for entry in result["blockers"]})

    def test_missing_run_cannot_resurrect_old_success(self):
        item = snapshot()
        item["runs"] = [row for row in item["runs"] if row["name"] != "AoE2WAR CI"]
        result = self.check(item)
        self.assertIn("MISSING_WORKFLOW", {entry["code"] for entry in result["blockers"]})

    def test_latest_red_overrides_older_green(self):
        item = snapshot()
        name = item["runs"][0]["name"]
        item["runs"].append({
            "id": 5000, "name": name, "head_sha": HEAD,
            "event": "pull_request", "run_number": 11, "run_attempt": 1,
            "status": "completed", "conclusion": "failure",
        })
        self.assertIn("WORKFLOW_NOT_GREEN", {entry["code"] for entry in self.check(item)["blockers"]})

    def test_source_head_mismatch_fails_closed(self):
        item = snapshot()
        item["pr"]["head"]["sha"] = "c" * 40
        with self.assertRaisesRegex(ValueError, "head changed"):
            self.check(item)

    def test_draft_mergeability_and_foreign_head_blocked(self):
        item = snapshot()
        item["pr"]["draft"] = True
        item["pr"]["mergeable"] = None
        item["pr"]["head"]["repo"]["full_name"] = "other/repo"
        codes = {entry["code"] for entry in self.check(item)["blockers"]}
        self.assertTrue({"DRAFT", "NOT_MERGEABLE", "FORKED_REFS"}.issubset(codes))

    def test_missing_required_job_blocks_even_if_workflow_green(self):
        item = snapshot()
        run = next(row for row in item["runs"] if row["name"] == "Renaissance integrated Kingdom Chrome (candidate only)")
        item["jobs"][str(run["id"])].pop()
        self.assertIn("MISSING_OR_AMBIGUOUS_JOB", {
            entry["code"] for entry in self.check(item)["blockers"]
        })

    def test_foreign_sha_runs_are_ignored(self):
        item = snapshot()
        item["runs"][1]["head_sha"] = "c" * 40
        self.assertIn("MISSING_WORKFLOW", {
            entry["code"] for entry in self.check(item)["blockers"]
        })

    def test_offline_snapshot_cli_never_mutates_input(self):
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / "snapshot.json"
            path.write_text(json.dumps(snapshot()))
            original = path.read_bytes()
            output = StringIO()
            with redirect_stdout(output):
                exit_code = rr.main([
                    "--snapshot", str(path), "--expected-sha", HEAD, "--format", "json"
                ])
            self.assertEqual(exit_code, 0)
            self.assertEqual(path.read_bytes(), original)
            self.assertIs(json.loads(output.getvalue())["protected_release_authorized"], False)

    def test_malformed_identifiers_and_unbound_compare(self):
        item = snapshot()
        item["compare"]["base_commit"]["sha"] = "d" * 40
        self.assertIn("UNBOUND_COMPARE", {
            entry["code"] for entry in self.check(item)["blockers"]
        })
        item = snapshot()
        item["runs"][0]["id"] = True
        with self.assertRaises(ValueError):
            self.check(item)


if __name__ == "__main__":
    unittest.main()
