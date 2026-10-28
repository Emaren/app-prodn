"""Fail-closed six-lane Central Command GitHub status contracts."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "central_command_status", ROOT / "scripts" / "central_command_status.py"
)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class CentralCommandContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = module.load_manifest()

    def test_manifest_has_exact_six_named_fixed_issues_and_no_assumed_progress(self):
        self.assertEqual([r["id"] for r in self.manifest["lanes"]],
                         ["D", "G", "C", "E", "F", "B"])
        self.assertEqual(len(self.manifest["evidenceGates"]), 6)
        self.assertEqual(self.manifest["implementationIssue"]["number"], 979)
        self.assertNotIn("deployed", json.dumps(self.manifest).lower().split("confidencepolicy")[0])

    def test_offline_is_six_unknowns_not_fake_zero_or_six_live(self):
        report = module.compile_status(self.manifest, {})
        self.assertEqual(report["schema"], module.SCHEMA)
        self.assertEqual(report["observedIssueCount"], 0)
        self.assertEqual(report["totalLanes"], 6)
        for lane in report["lanes"]:
            self.assertEqual(lane["observationStatus"], "UNKNOWN")
            self.assertIsNone(lane["observation"])
            self.assertEqual(lane["evidenceGates"]["verified"], [])
            self.assertEqual(lane["evidenceGates"]["denominator"], 6)
            self.assertTrue(lane["evidenceGates"]["notOverallWorkPercent"])
            self.assertEqual(lane["productionActivation"], "UNKNOWN")

    def test_issue_observed_proves_only_assigned_gate(self):
        observed = {"source": "GITHUB_ISSUE", "issueState": "open",
                    "issueUrl": "https://github.com/Emaren/app-prodn/issues/975",
                    "lastGitHubActivityAt": "2026-10-28T22:20:00Z",
                    "commentCount": 5}
        report = module.compile_status(self.manifest, {"D": observed})
        self.assertEqual(report["observedIssueCount"], 1)
        d = report["lanes"][0]
        self.assertEqual(d["evidenceGates"]["verified"], ["ASSIGNED"])
        self.assertEqual(len(d["evidenceGates"]["unknown"]), 5)
        self.assertEqual(d["hostAcceptance"], "UNKNOWN")
        self.assertEqual(d["productionActivation"], "UNKNOWN")

    def test_github_issue_verified_by_exact_identity_and_not_interpreted_as_command(self):
        issue = {"repository": "Emaren/app-prodn", "number": 975}
        row = {"number": 975, "title": "safe\\x00 command\\nnot executable",
               "state": "open", "updated_at": "2026-10-28T22:20:00Z",
               "comments": 4, "html_url": "https://github.com/Emaren/app-prodn/issues/975"}
        with patch.object(module.shutil, "which", return_value="/usr/bin/gh"):
            with patch.object(module.subprocess, "run",
                              return_value=types.SimpleNamespace(
                                  returncode=0, stdout=json.dumps(row))) as cmd:
                actual = module._gh_issue(issue)
        self.assertIsNotNone(actual)
        self.assertEqual(actual["source"], "GITHUB_ISSUE")
        self.assertTrue(actual["issueTitle"].startswith("safe"))
        self.assertNotIn("\\n", actual["issueTitle"])
        command = cmd.call_args.args[0]
        self.assertEqual(command[1:3], ["api", "-H"])
        self.assertEqual(command[-1], "repos/Emaren/app-prodn/issues/975")

        for alter in ({"number": 976},
                      {"html_url": "https://evil.example/"},
                      {"updated_at": "today"},
                      {"pull_request": {"url": "http://x"}},
                      {"comments": -1}):
            bad = dict(row, **alter)
            with patch.object(module.shutil, "which", return_value="/usr/bin/gh"), patch.object(
                module.subprocess, "run",
                return_value=types.SimpleNamespace(returncode=0, stdout=json.dumps(bad))
            ):
                self.assertIsNone(module._gh_issue(issue))

    def test_absent_auth_and_gh_fail_closed(self):
        issue = {"repository": "Emaren/VPSSentry", "number": 48}
        with patch.object(module.shutil, "which", return_value=None):
            self.assertIsNone(module._gh_issue(issue))
        with patch.object(module.shutil, "which", return_value="/usr/bin/gh"), patch.object(
            module.subprocess, "run",
            return_value=types.SimpleNamespace(returncode=1, stdout="", stderr="no auth")
        ):
            self.assertIsNone(module._gh_issue(issue))

    def test_offline_cli_never_invokes_network_or_mutates(self):
        buff = io.StringIO()
        with patch.object(sys, "argv", ["status", "--json", "--offline"]), patch.object(
            module.subprocess, "run", side_effect=AssertionError("not offline")
        ), contextlib.redirect_stdout(buff):
            self.assertEqual(module.main(), 0)
        report = json.loads(buff.getvalue())
        self.assertEqual(report["observedIssueCount"], 0)
        self.assertIn("do not message independent ChatGPT windows", report["warning"])


if __name__ == "__main__":
    unittest.main()
