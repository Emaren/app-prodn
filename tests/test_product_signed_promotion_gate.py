"""Negative/positive exact-SHA promotion admission. Everything is disposable."""

import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / "scripts/product_signed_promotion_gate.py"
spec = importlib.util.spec_from_file_location("product_signed_promotion_gate", SOURCE)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PromotionCases(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = datetime(2026, 11, 10, 20, 0, tzinfo=timezone.utc)
        self.sha = "a" * 40
        self.workflow = b"name: PRODUCT boundary\non: pull_request\n"
        self.workflow_sha = hashlib.sha256(self.workflow).hexdigest()
        self.manifest = {
            "schema": p.SCHEMA,
            "repo": "Emaren/app-prodn",
            "pr": 1306,
            "branch": "session-c/product-boundary-guard-20261110",
            "source_sha": self.sha,
            "artifact_sha256": "b" * 64,
            "rollback_source_sha": "c" * 40,
            "rollback_sha256": "d" * 64,
            "operation": "STAGE_NONFINANCIAL_APP",
            "expires_at": (self.now + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
            "nonce": "fixture_nonce_" + ("n" * 30),
            "approval_url": "https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6775548234",
            "ci_runs": [{
                "workflow": ".github/workflows/product-boundary.yml",
                "run_id": 123456,
                "attempt": 1,
                "job": "product-boundary",
            }],
        }
        self.policy = {
            "schema": p.SCHEMA,
            "repository": "Emaren/app-prodn",
            "required_ci": [{
                "workflow": ".github/workflows/product-boundary.yml",
                "job": "product-boundary",
                "sha256": self.workflow_sha,
                "required_steps": ["Positive and adversarial negative authorization cases"],
            }],
            "external_checks": [{
                "name": "GitGuardian Security Checks",
                "app_slug": "gitguardian",
            }],
            "allowed_artifact_root": str(self.root / "build"),
            "allowed_rollback_root": str(self.root / "rollback"),
        }
        self.responses = {
            "/repos/Emaren/app-prodn/pulls/1306": {
                "state": "open", "draft": False,
                "head": {"sha": self.sha, "ref": self.manifest["branch"]},
                "base": {"ref": "main"},
            },
            "/repos/Emaren/app-prodn/commits/" + self.sha +
            "/check-runs?per_page=100": {
                "check_runs": [{
                    "name": "GitGuardian Security Checks",
                    "app": {"slug": "gitguardian"},
                    "head_sha": self.sha, "status": "completed", "conclusion": "success",
                }],
            },
            "/repos/Emaren/app-prodn/contents/.github/workflows/product-boundary.yml?ref=" +
            self.sha: {
                "encoding": "base64",
                "content": base64.b64encode(self.workflow).decode(),
            },
            "/repos/Emaren/app-prodn/actions/runs/123456": {
                "head_sha": self.sha, "event": "pull_request",
                "status": "completed", "conclusion": "success", "run_attempt": 1,
                "path": ".github/workflows/product-boundary.yml",
            },
            "/repos/Emaren/app-prodn/actions/runs/123456/jobs?per_page=100": {
                "jobs": [{
                    "name": "product-boundary", "run_id": 123456,
                    "status": "completed", "conclusion": "success",
                    "steps": [{
                        "name": "Positive and adversarial negative authorization cases",
                        "conclusion": "success",
                    }],
                }],
            },
        }

    def api(self, path):
        return self.responses[path]

    def test_good_canonical_owner_admission(self):
        data = p.read_manifest(p.canonical_json(self.manifest), self.now)
        self.assertEqual(data["source_sha"], self.sha)
        result = p.inspect_remote(data, self.policy, self.api)
        self.assertEqual(result["status"], "PASS_VERIFIED_PREPARATION_NOT_DEPLOYMENT")
        self.assertEqual(result["checks"], 2)

    def test_reject_malformed_manifest_and_duplicate_keys(self):
        data = p.canonical_json(self.manifest)
        variants = (
            data[:-1], data + b"\n", data.replace(b'"schema":', b'"schema":"other","schema":'),
            data.replace(b'"repo":"Emaren/app-prodn"', b'"repo":"Emaren/other"'),
        )
        for value in variants:
            with self.subTest(value=value[:100]), self.assertRaises(p.Denied):
                p.read_manifest(value, self.now)

    def test_reject_expired_and_far_future_admission(self):
        for hours in (-1, 0, 25):
            changed = dict(self.manifest)
            changed["expires_at"] = (self.now + timedelta(hours=hours)).isoformat().replace("+00:00", "Z")
            with self.subTest(hours=hours), self.assertRaises(p.Denied):
                p.read_manifest(p.canonical_json(changed), self.now)

    def test_reject_wrong_owner_repository_operation_and_weak_nonce(self):
        overrides = (
            {"operation": "STAGE_PAPER_ONLY"},
            {"nonce": "short"},
            {"source_sha": "0" * 39},
            {"rollback_sha256": "deadbeef"},
            {"approval_url": "https://attacker.invalid/approval"},
            {"branch": "session-c/../escape"},
        )
        for changes in overrides:
            altered = dict(self.manifest, **changes)
            with self.subTest(changes=changes), self.assertRaises(p.Denied):
                p.read_manifest(p.canonical_json(altered), self.now)

    def test_reject_changed_pull_request_head_or_direct_push(self):
        for key, value in (
            ("sha", "9" * 40), ("ref", "main"),
        ):
            r = deepcopy(self.responses)
            r["/repos/Emaren/app-prodn/pulls/1306"]["head"][key] = value
            with self.subTest(key=key), self.assertRaises(p.Denied):
                p.inspect_remote(self.manifest, self.policy, r.__getitem__)
        r = deepcopy(self.responses)
        r["/repos/Emaren/app-prodn/pulls/1306"]["draft"] = True
        with self.assertRaises(p.Denied):
            p.inspect_remote(self.manifest, self.policy, r.__getitem__)

    def test_reject_untrusted_workflow_changes_and_job_failure(self):
        for endpoint, field, replacement in (
            ("/repos/Emaren/app-prodn/contents/.github/workflows/product-boundary.yml?ref=" +
             self.sha, "content", base64.b64encode(b"malicious workflow").decode()),
            ("/repos/Emaren/app-prodn/actions/runs/123456", "head_sha", "f" * 40),
            ("/repos/Emaren/app-prodn/actions/runs/123456", "event", "workflow_dispatch"),
            ("/repos/Emaren/app-prodn/actions/runs/123456", "conclusion", "failure"),
            ("/repos/Emaren/app-prodn/actions/runs/123456", "run_attempt", 2),
        ):
            r = deepcopy(self.responses)
            r[endpoint][field] = replacement
            with self.subTest(field=field), self.assertRaises(p.Denied):
                p.inspect_remote(self.manifest, self.policy, r.__getitem__)
        r = deepcopy(self.responses)
        r["/repos/Emaren/app-prodn/actions/runs/123456/jobs?per_page=100"]["jobs"][0]["conclusion"] = "skipped"
        with self.assertRaises(p.Denied):
            p.inspect_remote(self.manifest, self.policy, r.__getitem__)
        r = deepcopy(self.responses)
        r["/repos/Emaren/app-prodn/actions/runs/123456/jobs?per_page=100"]["jobs"][0]["steps"][0]["conclusion"] = "skipped"
        with self.assertRaises(p.Denied):
            p.inspect_remote(self.manifest, self.policy, r.__getitem__)

    def test_reject_missing_gitguardian_or_wrong_app(self):
        for replacement in ("failure", "neutral"):
            r = deepcopy(self.responses)
            key = "/repos/Emaren/app-prodn/commits/" + self.sha + "/check-runs?per_page=100"
            r[key]["check_runs"][0]["conclusion"] = replacement
            with self.assertRaises(p.Denied):
                p.inspect_remote(self.manifest, self.policy, r.__getitem__)
        r = deepcopy(self.responses)
        key = "/repos/Emaren/app-prodn/commits/" + self.sha + "/check-runs?per_page=100"
        r[key]["check_runs"][0]["app"]["slug"] = "attacker"
        with self.assertRaises(p.Denied):
            p.inspect_remote(self.manifest, self.policy, r.__getitem__)

    def test_reject_missing_required_ci(self):
        incomplete = deepcopy(self.manifest)
        incomplete["ci_runs"] = []
        with self.assertRaises(p.Denied):
            p.read_manifest(p.canonical_json(incomplete), self.now)
        incomplete = deepcopy(self.manifest)
        incomplete["ci_runs"].append(dict(incomplete["ci_runs"][0]))
        with self.assertRaises(p.Denied):
            p.read_manifest(p.canonical_json(incomplete), self.now)
        wrong = deepcopy(self.policy)
        wrong["required_ci"].append({
            "workflow": ".github/workflows/release.yml", "job": "build",
            "sha256": "1" * 64, "required_steps": [],
        })
        with self.assertRaises(p.Denied):
            p.inspect_remote(self.manifest, wrong, self.api)

    def test_artifact_and_rollback_digest_and_symlink_denial(self):
        build = self.root / "build"
        rollback = self.root / "rollback"
        build.mkdir()
        rollback.mkdir()
        artifact = build / "candidate.tgz"
        old = rollback / "old.tgz"
        artifact.write_bytes(b"exact candidate bytes")
        old.write_bytes(b"exact rollback bytes")
        good = hashlib.sha256(artifact.read_bytes()).hexdigest()
        prior = hashlib.sha256(old.read_bytes()).hexdigest()
        p.verify_under_root(artifact, build, good)
        p.verify_under_root(old, rollback, prior)
        for dest, root, digest in (
            (artifact, build, "0" * 64),
            (old, rollback, good),
            (old, build, prior),
        ):
            with self.subTest(path=str(dest), digest=digest), self.assertRaises(p.Denied):
                p.verify_under_root(dest, root, digest)
        sym = build / "link"
        sym.symlink_to(old)
        with self.assertRaises(p.Denied):
            p.verify_under_root(sym, build, prior)

    def test_nonce_is_once_only_and_preserves_first_receipt(self):
        ledger = self.root / "ledger"
        ledger.mkdir()
        result = {"status": "PASS", "sha": self.sha}
        p.consume_nonce(ledger, self.manifest["nonce"], result)
        contents = list(ledger.iterdir())
        self.assertEqual(len(contents), 1)
        self.assertEqual(json.loads(contents[0].read_text()), result)
        with self.assertRaises(p.Denied):
            p.consume_nonce(ledger, self.manifest["nonce"], {"status": "ATTACK"})
        self.assertEqual(json.loads(contents[0].read_text()), result)

    @unittest.skipUnless(shutil.which("ssh-keygen"), "OpenSSH required")
    def test_real_ssh_signature_owner_signer_and_tamper(self):
        key = self.root / "disposable_ed25519"
        generation = subprocess.run(
            ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)],
            capture_output=True,
        )
        self.assertEqual(generation.returncode, 0)
        allowed = self.root / "allowed_signers"
        allowed.write_text(p.SIGNER + " " + key.with_suffix(".pub").read_text())
        target = self.root / "manifest.json"
        raw = p.canonical_json(self.manifest)
        target.write_bytes(raw)
        sign = subprocess.run(
            ["ssh-keygen", "-Y", "sign", "-f", str(key), "-n", p.NAMESPACE, str(target)],
            capture_output=True,
        )
        self.assertEqual(sign.returncode, 0)
        signature = self.root / "manifest.json.sig"
        p.verify_signature(raw, signature, allowed)
        with self.assertRaises(p.Denied):
            p.verify_signature(raw.replace(b'"source_sha":"' + self.sha.encode(),
                                           b'"source_sha":"' + ("f" * 40).encode()), signature, allowed)
        with mock.patch.object(p, "SIGNER", "untrusted-owner"):
            with self.assertRaises(p.Denied):
                p.verify_signature(raw, signature, allowed)


if __name__ == "__main__":
    unittest.main()
