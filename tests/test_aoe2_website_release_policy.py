"""Negative acceptance for source-bound, NONAUTHORIZING review policy."""
from __future__ import annotations

import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_website_release_policy.py"
SPEC = importlib.util.spec_from_file_location("aoe2_website_release_policy", SCRIPT)
POLICY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(POLICY)


def run(*cmd, cwd=None):
    return subprocess.check_output(cmd, cwd=cwd, stderr=subprocess.DEVNULL).decode().strip()


class WebsiteReviewPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.repo = root / "repo"
        self.repo.mkdir()
        run("git", "init", "-q", str(self.repo))
        run("git", "config", "user.name", "Tester", cwd=self.repo)
        run("git", "config", "user.email", "test@example.invalid", cwd=self.repo)
        (self.repo / "lib").mkdir()
        (self.repo / "lib/bets.ts").write_text("export const allowed = false;\n")
        run("git", "add", ".", cwd=self.repo)
        run("git", "commit", "-qm", "initial", cwd=self.repo)
        self.base = run("git", "rev-parse", "HEAD", cwd=self.repo)
        (self.repo / "lib/bets.ts").write_text("export const previewOnly = true;\n")
        run("git", "add", ".", cwd=self.repo)
        run("git", "commit", "-qm", "preview", cwd=self.repo)
        self.candidate = run("git", "rev-parse", "HEAD", cwd=self.repo)
        self.manifest = {
            "release_sha": self.candidate, "previous_production_sha": self.base,
            "risk_class": "FINANCIAL", "migration_paths": [], "changed_files": ["lib/bets.ts"],
            "gate": {"status": "PASS", "receipt_sha256": ""},
            "policy": {"wolo_mutation_allowed": False},
        }
        self.gate = {"status": "PASS", "risk_class": "FINANCIAL"}
        self.gate_raw = POLICY.canonical(self.gate)
        self.manifest["gate"]["receipt_sha256"] = POLICY.digest(self.gate_raw)
        self.manifest_raw = POLICY.canonical(self.manifest)
        self.stage = {
            "status": "STAGED", "release_sha": self.candidate,
            "staged_build_id": "example-build-123",
            "manifest_sha256": POLICY.digest(self.manifest_raw),
            "gate_sha256": POLICY.digest(self.gate_raw), "wolo_mutated": False,
        }
        self.stage_raw = POLICY.canonical(self.stage)
        self.wolo = "7" * 40
        self.docs = "4" * 40
        self.plan = {
            "blocked": True, "unknown_p0": [], "blocked_source_docs": [],
            "unknown_p1": [{"severity": "P1", "area": "WoloChain", "key": "vps-source-drift",
                            "detail": f"VPS={self.wolo} implementation_baseline={self.docs}"}],
        }
        self.now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        self.payload = {
            "kind": "website-only-source-review-v1", "candidate_sha": self.candidate,
            "base_sha": self.base, "wolo_vps_sha": self.wolo, "wolo_docs_sha": self.docs,
            "manifest_sha256": POLICY.digest(self.manifest_raw),
            "gate_sha256": POLICY.digest(self.gate_raw),
            "stage_sha256": POLICY.digest(self.stage_raw),
            "reviewed_paths_sha256": POLICY.digest(POLICY.canonical(["lib/bets.ts"])),
            "issued_at": "2026-10-24T11:55:00Z", "expires_at": "2026-10-24T12:15:00Z",
            "ci_head_sha": self.candidate, "ci_status": "success", "ci_run_id": 40090590803,
            "candidate_build_id": "example-build-123",
            "financial_executors_enabled": False, "custody_enabled": False,
            "preview_funding_enabled": False, "historical_entitlements_mutated": False,
        }
        for k in POLICY.REQUIRED_EVIDENCE:
            self.payload[k] = hashlib.sha256(k.encode()).hexdigest()
        self.trust = root / "trust"
        self.trust.mkdir()
        self.private = {}
        for role in POLICY.REQUIRED_ROLES:
            priv = root / (role + ".key")
            pub = self.trust / (role + ".pem")
            run("openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                "-out", str(priv))
            run("openssl", "pkey", "-in", str(priv), "-pubout", "-out", str(pub))
            self.private[role] = priv

    def signed(self):
        payload_path = self.repo.parent / "approval-payload.json"
        payload_path.write_bytes(POLICY.canonical(self.payload))
        sigs = {}
        for role, private in self.private.items():
            sigfile = self.repo.parent / (role + ".sig")
            run("openssl", "dgst", "-sha256", "-sign", str(private),
                "-out", str(sigfile), str(payload_path))
            sigs[role] = base64.b64encode(sigfile.read_bytes()).decode("ascii")
        return {"schema": 1, "payload": copy.deepcopy(self.payload), "signatures": sigs}

    def check(self, signed=None):
        with mock.patch.object(POLICY, "trust_key", side_effect=lambda p, root: p.read_bytes()):
            return POLICY.assess(repo=self.repo, manifest=self.manifest,
                manifest_raw=self.manifest_raw, gate=self.gate, gate_raw=self.gate_raw,
                stage=self.stage, stage_raw=self.stage_raw, plan=self.plan,
                signed=signed or self.signed(), now=self.now, trust_root=self.trust)

    def test_full_review_is_still_not_production_authority(self):
        r = self.check()
        self.assertEqual(r["status"], "EVIDENCE_REVIEWABLE_HOLD")
        self.assertFalse(r["website_release_authorized"])
        self.assertFalse(r["financial_release_authorized"])
        self.assertTrue(r["existing_finish_blocked"])
        self.assertEqual(r["risk_class"], "FINANCIAL")
        self.assertEqual(r["external_wolo_p1"], self.plan["unknown_p1"][0])

    def test_wrong_candidate_head(self):
        self.payload["candidate_sha"] = "a" * 40
        with self.assertRaisesRegex(POLICY.Hold, "manifest source"):
            self.check()

    def test_stale_or_overlong_signature_authority(self):
        self.payload["expires_at"] = "2026-10-24T11:59:59Z"
        with self.assertRaisesRegex(POLICY.Hold, "expired"):
            self.check()
        self.payload["expires_at"] = "2026-10-24T14:00:00Z"
        with self.assertRaisesRegex(POLICY.Hold, "overly broad"):
            self.check()

    def test_any_migration_is_blocked(self):
        self.manifest["migration_paths"] = ["prisma/migrations/20261019_funded/migration.sql"]
        with self.assertRaisesRegex(POLICY.Hold, "migrations"):
            self.check()

    def test_candidate_with_migration_path_rejected(self):
        (self.repo / "prisma/migrations").mkdir(parents=True)
        (self.repo / "prisma/migrations/x.sql").write_text("SELECT 1;\n")
        run("git", "add", ".", cwd=self.repo)
        run("git", "commit", "-qm", "attempt SQL", cwd=self.repo)
        self.candidate = run("git", "rev-parse", "HEAD", cwd=self.repo)
        self.manifest["release_sha"] = self.candidate
        self.manifest["changed_files"] = ["lib/bets.ts", "prisma/migrations/x.sql"]
        self.manifest_raw = POLICY.canonical(self.manifest)
        self.payload["candidate_sha"] = self.candidate
        self.payload["ci_head_sha"] = self.candidate
        self.payload["manifest_sha256"] = POLICY.digest(self.manifest_raw)
        self.stage["release_sha"] = self.candidate
        self.stage["manifest_sha256"] = POLICY.digest(self.manifest_raw)
        self.stage_raw = POLICY.canonical(self.stage)
        self.payload["stage_sha256"] = POLICY.digest(self.stage_raw)
        self.payload["reviewed_paths_sha256"] = POLICY.digest(POLICY.canonical(self.manifest["changed_files"]))
        with self.assertRaisesRegex(POLICY.Hold, "protected migration"):
            self.check()

    def test_wolo_drift_not_silenced_or_changed(self):
        self.plan["unknown_p1"][0]["detail"] = "VPS=7 implementation_baseline=7"
        with self.assertRaisesRegex(POLICY.Hold, "unreviewed Wolo"):
            self.check()
        self.plan["unknown_p1"].append({"severity": "P1", "area": "Finance", "key": "unknown"})
        with self.assertRaisesRegex(POLICY.Hold, "unreviewed external"):
            self.check()

    def test_missing_independent_role(self):
        signed = self.signed()
        del signed["signatures"]["finance_reviewer"]
        with self.assertRaisesRegex(POLICY.Hold, "independent signatures"):
            self.check(signed)

    def test_reused_reviewer_identity_rejected(self):
        reused = self.trust / "chain_reviewer.pem"
        reused.write_bytes((self.trust / "owner.pem").read_bytes())
        with self.assertRaisesRegex(POLICY.Hold, "identity not independent"):
            self.check()

    def test_unsigned_claim_tamper(self):
        signed = self.signed()
        signed["payload"]["expires_at"] = "2026-10-24T12:14:00Z"
        with self.assertRaisesRegex(POLICY.Hold, "signature failed"):
            self.check(signed)

    def test_attempted_funded_release(self):
        for key in ("financial_executors_enabled", "custody_enabled", "preview_funding_enabled",
                    "historical_entitlements_mutated"):
            with self.subTest(key=key):
                self.payload[key] = True
                with self.assertRaisesRegex(POLICY.Hold, "funded or entitlement"):
                    self.check()
                self.payload[key] = False

    def test_wrong_staged_build_id(self):
        self.payload["candidate_build_id"] = "another-build"
        with self.assertRaisesRegex(POLICY.Hold, "BUILD_ID"):
            self.check()

    def test_wrong_manifest_digest(self):
        self.payload["manifest_sha256"] = "d" * 64
        with self.assertRaisesRegex(POLICY.Hold, "receipt bytes changed"):
            self.check()

    def test_wrong_source_checkout(self):
        run("git", "checkout", "--detach", self.base, cwd=self.repo)
        with self.assertRaisesRegex(POLICY.Hold, "wrong checked-out"):
            self.check()

    def test_blocked_financial_classification_regression(self):
        self.manifest["risk_class"] = "APPLICATION"
        with self.assertRaisesRegex(POLICY.Hold, "misclassified"):
            self.check()

    def test_gate_risk_must_also_remain_financial(self):
        self.gate["risk_class"] = "APPLICATION"
        self.gate_raw = POLICY.canonical(self.gate)
        self.manifest["gate"]["receipt_sha256"] = POLICY.digest(self.gate_raw)
        self.manifest_raw = POLICY.canonical(self.manifest)
        self.stage["gate_sha256"] = POLICY.digest(self.gate_raw)
        self.stage["manifest_sha256"] = POLICY.digest(self.manifest_raw)
        self.stage_raw = POLICY.canonical(self.stage)
        self.payload["gate_sha256"] = POLICY.digest(self.gate_raw)
        self.payload["manifest_sha256"] = POLICY.digest(self.manifest_raw)
        self.payload["stage_sha256"] = POLICY.digest(self.stage_raw)
        with self.assertRaisesRegex(POLICY.Hold, "release gate not independently passing"):
            self.check()

    def test_protected_trust_anchor_cannot_be_branch_supplied(self):
        with self.assertRaisesRegex(POLICY.Hold, "independently provisioned"):
            POLICY.trust_key(self.trust / "owner.pem", self.trust)

    def test_missing_source_test_evidence(self):
        self.payload.pop("legacy_escrow_preview_refusal_sha256")
        with self.assertRaisesRegex(POLICY.Hold, "missing bound evidence"):
            self.check()


if __name__ == "__main__":
    unittest.main()
