from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_audit.py"
SPEC = importlib.util.spec_from_file_location("aoe2_audit_brain_proof_tests", SCRIPT)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = audit
SPEC.loader.exec_module(audit)


class ExactSourceCertifiedQualityProofTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.repos = {
            name: self.root / name
            for name in ("app-prodn", "api-prodn", "aoe2-watcher", "vpssentry", "wolochain")
        }
        self.docs = self.root / "AoE2WAR-docs"
        for directory in (*self.repos.values(), self.docs):
            directory.mkdir()
        self.heads = {
            key: format(idx + 1, "x") * 40
            for idx, key in enumerate((*self.repos, "AoE2WAR-docs"))
        }
        self.receipts = self.root / "finish-receipts"
        self.receipts.mkdir()
        self.now = datetime.now(timezone.utc)
        rows = {
            name: {
                "head": sha,
                "branch": "main",
                "dirty_count": 0,
            } for name, sha in self.heads.items()
        }
        self.payload = {
            "status": "CERTIFIED",
            "completed_at": self.now.isoformat(),
            "final_release": {
                "local": {"head": self.heads["app-prodn"]},
            },
            "final_audit": {
                "p0": 0,
                "p1": 0,
                "info": {
                    "source_repositories": {
                        k: rows[k] for k in self.repos
                    },
                    "central_repository": rows["AoE2WAR-docs"],
                    "central_quality_gates": {
                        k: {"rc": 0, "summary": "PASS"}
                        for k in ("docs-check", "audit-taxonomy", "strict-build")
                    },
                },
            },
        }
        self.receipt_file = self.receipts / "20261012T032500000000Z-1.json"
        self.write_receipt()
        self.original_by_path = {v: k for k, v in self.repos.items()}
        self.original_by_path[self.docs] = "AoE2WAR-docs"
        self.git_calls = []

    def write_receipt(self):
        self.receipt_file.write_text(json.dumps(self.payload), encoding="utf-8")

    def fake_git(self, repo, *args, timeout=30):
        name = self.original_by_path[repo]
        self.git_calls.append((name, args))
        if args == ("rev-parse", "HEAD"):
            return 0, self.heads[name]
        if args == ("branch", "--show-current"):
            return 0, "main"
        if args == ("status", "--porcelain=v1", "--untracked-files=all"):
            return 0, ""
        raise AssertionError(f"Unexpected Git call: {name} {args}")

    def proof(self, **kwargs):
        with (
            patch.object(audit, "CORE_SOURCES", self.repos),
            patch.object(audit, "DOCS", self.docs),
            patch.object(audit, "git", side_effect=self.fake_git),
        ):
            return audit.certified_central_quality_proof(
                receipt_dir=self.receipts,
                now=self.now,
                **kwargs,
            )

    def test_exact_certified_receipt_reuses_all_three_successful_gates(self):
        result = self.proof()
        self.assertIsNotNone(result)
        self.assertEqual(result["authority"]["mode"], "source-bound-certified-finish-reuse")
        self.assertEqual(result["results"]["strict-build"]["rc"], 0)
        self.assertEqual(set(result["authority"]["source_heads"]), set(self.heads))
        self.assertEqual(len(self.git_calls), 18)

    def test_any_changed_repo_head_fails_closed(self):
        self.heads["api-prodn"] = "e" * 40
        self.assertIsNone(self.proof())

    def test_dirty_repo_fails_closed(self):
        original = self.fake_git
        def dirty_git(repo, *args, timeout=30):
            if repo == self.docs and args[0] == "status":
                return 0, " M docs/new.md"
            return original(repo, *args, timeout=timeout)
        with patch.object(self, "fake_git", side_effect=dirty_git):
            self.assertIsNone(self.proof())

    def test_noncertified_or_failed_target_fails_closed(self):
        self.payload["status"] = "FAILED"
        self.write_receipt()
        self.assertIsNone(self.proof())
        self.payload["status"] = "CERTIFIED"
        self.payload["final_audit"]["info"]["central_quality_gates"]["strict-build"]["rc"] = 1
        self.write_receipt()
        self.assertIsNone(self.proof())

    def test_stale_proof_fails_closed(self):
        self.payload["completed_at"] = (
            self.now - timedelta(days=8)
        ).isoformat()
        self.write_receipt()
        self.assertIsNone(self.proof())

    def test_uncertified_audit_or_missing_source_fails_closed(self):
        self.payload["final_audit"]["p1"] = 1
        self.write_receipt()
        self.assertIsNone(self.proof())
        self.payload["final_audit"]["p1"] = 0
        self.payload["final_audit"]["info"]["source_repositories"].pop("wolochain")
        self.write_receipt()
        self.assertIsNone(self.proof())


class MonitoringProofIsolationTests(unittest.TestCase):
    def test_opt_in_monitoring_exposes_real_certified_proof(self):
        instance = audit.Audit()
        proof = {
            "results": {"docs-check": {"rc": 0}, "audit-taxonomy": {"rc": 0}, "strict-build": {"rc": 0}},
            "authority": {"mode": "source-bound-certified-finish-reuse"},
        }
        with tempfile.TemporaryDirectory() as root:
            with (
                patch.dict("os.environ", {"AOE2WAR_KI_CENTRAL_PROOF_REUSE": "1"}),
                patch.object(audit, "DOCS", pathlib.Path(root)),
                patch.object(audit, "certified_central_quality_proof", return_value=proof),
            ):
                audit.check_central_quality_gates(instance)
        self.assertEqual(instance.info["central_quality_gates"], proof["results"])
        self.assertEqual(instance.info["central_quality_proof"], proof["authority"])

    def test_no_opt_in_never_reads_monitoring_proof(self):
        instance = audit.Audit()
        with (
            patch.dict("os.environ", {"AOE2WAR_KI_CENTRAL_PROOF_REUSE": ""}),
            patch.object(audit, "certified_central_quality_proof") as cached,
            patch.object(audit, "DOCS", pathlib.Path("/__aoe2_nonexistent_docs__")),
        ):
            audit.check_central_quality_gates(instance)
        cached.assert_not_called()
        self.assertNotIn("central_quality_proof", instance.info)


if __name__ == "__main__":
    unittest.main()
