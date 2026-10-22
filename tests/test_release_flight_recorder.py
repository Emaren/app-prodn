"""No network, chain, signer or production runtime is required."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / "scripts" / "release_flight_recorder.py"
SPEC = importlib.util.spec_from_file_location("release_flight_recorder", FILE)
recorder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recorder)
APP_SHA, WOLO_SHA, MAIN_SHA = "a" * 40, "b" * 40, "c" * 40


def run(name, sha, i, status="completed", conclusion="success"):
    return {
        "name": name, "id": i, "head_sha": sha, "status": status,
        "conclusion": conclusion, "html_url": "https://github.com/test/check/" + str(i),
    }


def scripted_api(moved=False, missing_wolo=False):
    def get(path, _token=None):
        if path.endswith("/pulls/801"):
            scripted_api.app_reads += 1
            sha = "f" * 40 if moved and scripted_api.app_reads % 2 == 0 else APP_SHA
            return {"head": {"sha": sha}, "base": {"ref": "main"},
                    "html_url": "https://github.com/test/app/pull/801",
                    "draft": True, "merged": False, "state": "open", "mergeable": True}
        if path.endswith("/pulls/82"):
            return {"head": {"sha": WOLO_SHA}, "base": {"ref": "held"},
                    "html_url": "https://github.com/test/wolo/pull/82",
                    "draft": False, "merged": False, "state": "open", "mergeable": True}
        if path.endswith("/git/ref/heads/main"):
            return {"object": {"sha": MAIN_SHA}}
        if path.endswith("/issues/5"):
            return {"body": "Five blocked, solvency unknown", "state": "open",
                    "html_url": "https://github.com/test/wolo/issues/5",
                    "updated_at": "2026-10-22T17:00:00Z", "title": "Financial HOLD"}
        if "/check-runs?" in path:
            sha = APP_SHA if APP_SHA in path else WOLO_SHA
            required = recorder.APP_CHECKS if sha == APP_SHA else recorder.WOLO_CHECKS
            if missing_wolo and sha == WOLO_SHA:
                required = required[:-1]
            if "page=2" in path:
                return {"check_runs": []}
            return {"check_runs": [run(n, sha, i + 1) for i, n in enumerate(required)]}
        raise RuntimeError("Unexpected API request " + path)
    scripted_api.app_reads = 0
    return get


class ReleaseFlightRecorderTests(unittest.TestCase):
    def test_latest_run_wins_and_wrong_sha_never_qualifies(self):
        name = recorder.APP_CHECKS[0]
        grouped = recorder.latest_checks([
            run(name, APP_SHA, 1, "completed", "failure"),
            run(name, WOLO_SHA, 999),
            run(name, APP_SHA, 2),
        ], APP_SHA)
        self.assertEqual(grouped[name]["id"], 2)
        self.assertEqual(recorder.evaluate_checks(grouped, (name,))["source_check_state"], "GREEN")

    def test_missing_pending_failed_skipped_never_green(self):
        name = recorder.APP_CHECKS[0]
        self.assertEqual(recorder.evaluate_checks({}, (name,))["source_check_state"], "UNVERIFIED")
        for status, conclusion, result in [
            ("queued", None, "PENDING"),
            ("completed", "skipped", "RED"),
            ("completed", "failure", "RED"),
        ]:
            checks = recorder.latest_checks([run(name, APP_SHA, 1, status, conclusion)], APP_SHA)
            self.assertEqual(recorder.evaluate_checks(checks, (name,))["source_check_state"], result)

    def test_green_source_still_explicitly_refuses_money_and_deployment(self):
        with patch.object(recorder, "api_get", side_effect=scripted_api()):
            report = recorder.build_report(
                "Emaren/app-prodn", 801, "Emaren/wolochain", 82, 5,
                observed_at="2026-10-22T17:00:00Z",
            )
        self.assertEqual(report["source_evidence"], "GREEN")
        self.assertEqual(report["financial_activation"], "HARD_HOLD_UNCERTIFIED")
        self.assertFalse(report["production_deployment_authorized"])
        self.assertIn("HARD HOLD", recorder.markdown_report(report))

    def test_moving_pr_ref_invalidates_observation(self):
        with patch.object(recorder, "api_get", side_effect=scripted_api(moved=True)):
            report = recorder.build_report("Emaren/app-prodn", 801, "Emaren/wolochain", 82, 5)
        self.assertEqual(report["source_evidence"], "UNVERIFIED")
        self.assertIn("application", report["errors"])

    def test_partial_other_repo_missing_fails_closed(self):
        with patch.object(recorder, "api_get", side_effect=scripted_api(missing_wolo=True)):
            report = recorder.build_report("Emaren/app-prodn", 801, "Emaren/wolochain", 82, 5)
        self.assertEqual(report["source_evidence"], "UNVERIFIED")
        self.assertEqual(report["wolochain"]["source_check_state"], "UNVERIFIED")

    def test_rejects_invalid_pr_and_repo_inputs(self):
        for value in ("0", "-1", "1; curl x", "99999999999999999"):
            with self.assertRaises(ValueError):
                recorder.validate_pr(value)
        for value in ("https://github.com/test/a", "test/../repo", "bad repo", "test/foo/bar"):
            with self.assertRaises(ValueError):
                recorder.validate_repo(value)

    def test_report_artifacts_never_contain_auth_token_or_deploy_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(recorder, "api_get", side_effect=scripted_api()), patch.dict(
                recorder.os.environ, {"GH_TOKEN": "fixture-token-only"}
            ):
                rc = recorder.main(["--app-pr", "801", "--wolo-pr", "82", "--output-dir", directory])
            self.assertEqual(rc, 0)
            data = (Path(directory) / "release-evidence.json").read_text()
            self.assertNotIn("fixture-token-only", data)
            self.assertIn('"production_deployment_authorized": false', data)
            self.assertTrue((Path(directory) / "release-evidence.md").is_file())
            self.assertTrue((Path(directory) / "release-evidence.sha256").is_file())


if __name__ == "__main__":
    unittest.main()
