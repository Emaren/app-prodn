"""Offline, cryptographically signed, read-only v3 reconciliation regressions.

Never touches the real Mac owner journal, protected production receipt, live SSH
target or funds. All files and RSA keys are disposable fixtures.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_website_owner_release_v3 as OWNER
import aoe2_website_owner_reconcile_v3 as RECON
from test_aoe2_website_owner_observer_v3 import fixture, NOW


class ReadOnlyConsumedActivationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory(prefix="aoe2-reconcile-owner-rsa-")
        cls.addClassCleanup(tmp.cleanup)
        cls.global_root = Path(tmp.name)
        cls.private = cls.global_root / "signer.key"
        cls.public = cls.global_root / "owner.pem"
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA",
                        "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(cls.private)],
                       capture_output=True, check=True, timeout=30)
        subprocess.run(["openssl", "pkey", "-in", str(cls.private),
                        "-pubout", "-out", str(cls.public)],
                       capture_output=True, check=True, timeout=10)
        cls.private.chmod(0o600)
        cls.public.chmod(0o600)

    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="aoe2-reconcile-fixture-")
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.repo = self.root / "app"
        self.repo.mkdir(mode=0o700)
        self.stage_dir = self.repo / RECON.STAGE_DIRECTORY
        self.active_dir = self.repo / RECON.RECEIPT_DIRECTORY
        self.stage_dir.mkdir(parents=True)
        self.active_dir.mkdir(parents=True)
        self.state = self.root / "owner-state"
        self.state.mkdir(mode=0o700)
        self.db = self.state / "owner-v3.sqlite3"
        self.observed = fixture()
        self.current = copy.deepcopy(self.observed)
        self.current["website"]["source_sha"] = OWNER.MAIN_SOURCE_SHA
        self.current["website"]["build_id"] = "activated_BUILD_ABC"
        self.artifact = "a" * 64
        self.attempt = "this-is-a-valid-long-enough-attempt-id"
        self.name = OWNER.MAIN_SOURCE_SHA + "-" + self.artifact[:12] + ".json"
        self.stage_path = self.stage_dir / self.name
        self.cert_path = self.active_dir / self.name
        self.packet_path = self.root / "owner.packet"
        self.ctx = {
            "candidate_sha": OWNER.MAIN_SOURCE_SHA,
            "previous_production_sha": OWNER.PRODUCTION_SHA,
            "scope_sha256": "1" * 64,
            "controller_commit_sha": "2" * 40,
            "operator_inventory_sha256": "3" * 64,
            "policy_source_sha256": "4" * 64,
            "manifest_sha256": OWNER.MANIFEST_SHA256,
            "gate_sha256": "5" * 64,
            "runtime_observation": self.observed,
            "rollback": {"source_sha": OWNER.PRODUCTION_SHA,
                         "build_id": self.observed["website"]["build_id"]},
            "artifact_sha256": self.artifact,
            "stage_receipt_sha256": None,
            "build_id": self.current["website"]["build_id"],
        }
        self.stage_data = {
            "status": "STAGED", "release_sha": OWNER.MAIN_SOURCE_SHA,
            "artifact_sha256": self.artifact, "staged_build_id": self.ctx["build_id"],
            "previous_production_sha": OWNER.PRODUCTION_SHA,
            "wolo_mutated": False, "live_runtime_mutated": False,
        }
        self.store_stage()
        self.ctx["stage_receipt_sha256"] = hashlib.sha256(self.stage_path.read_bytes()).hexdigest()
        fingerprint = OWNER.load_owner_key(self.public, allow_test_root=True)
        self.payload = {
            "kind": OWNER.POLICY_ID, "phase": "PRE_ACTIVATE",
            "attempt_id": self.attempt, "nonce": "test-unique-nonce",
            "issued_at": "2026-10-25T02:58:00Z",
            "expires_at": "2026-10-25T03:18:00Z",
            "owner_key_sha256": fingerprint,
            "context": self.ctx,
            "same_owner_observation_not_independent": True,
            "financial_release_authorized": False,
            "custody_authorized": False,
            "wolo_source_p1_open": True,
            "claim_889_resolved": False,
        }
        self.cert_data = {
            "schema": 1, "kind": "aoe2war-activation-result",
            "status": "CERTIFIED", "release_sha": OWNER.MAIN_SOURCE_SHA,
            "previous_production_sha": OWNER.PRODUCTION_SHA,
            "active_build_id": self.ctx["build_id"],
            "previous_build_id": self.ctx["rollback"]["build_id"],
            "artifact_sha256": self.artifact,
            "stage_receipt_sha256": self.ctx["stage_receipt_sha256"],
            "manifest_sha256": OWNER.MANIFEST_SHA256,
            "gate_sha256": self.ctx["gate_sha256"],
            "wolo_mutated": False, "soak_samples": 6
        }
        self.store_cert()
        self.sign_packet()
        cx = sqlite3.connect(self.db)
        try:
            cx.execute("""CREATE TABLE requests_v3(
                attempt_id TEXT, phase TEXT, nonce TEXT, payload TEXT,
                state TEXT, packet_sha TEXT, result TEXT)""")
            cx.execute("INSERT INTO requests_v3 VALUES(?,?,?,?,?,?,?)",
                       (self.attempt, "PRE_STAGE", "stage_nonce", "{}",
                        "COMPLETE", "a" * 64, json.dumps({
                            "status": "STAGED", "artifact_sha256": self.artifact,
                            "staged_build_id": self.ctx["build_id"],
                            "local_receipt_sha256": self.ctx["stage_receipt_sha256"]})))
            cx.execute("INSERT INTO requests_v3 VALUES(?,?,?,?,?,?,?)",
                       (self.attempt, "PRE_ACTIVATE", "activate_nonce", json.dumps(self.payload),
                        "CONSUMED", OWNER.digest(self.packet), None))
            cx.commit()
        finally:
            cx.close()
        self.db.chmod(0o600)

    def store_stage(self):
        self.stage_path.write_text(json.dumps(self.stage_data, sort_keys=True) + "\n")

    def store_cert(self):
        self.cert_path.write_text(json.dumps(self.cert_data, sort_keys=True) + "\n")

    def sign_packet(self):
        msg = self.root / "message"
        msg.write_bytes(OWNER.canonical(self.payload))
        sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign",
                              str(self.private), str(msg)],
                             capture_output=True, check=True, timeout=10).stdout
        self.packet = {"schema": 3, "policy": OWNER.POLICY_ID,
                       "payload": self.payload,
                       "signature": base64.b64encode(sig).decode()}
        self.packet_path.write_text(json.dumps(self.packet))

    def check(self):
        return RECON.reconcile(
            candidate_repo=self.repo, packet_path=self.packet_path,
            stage_receipt=self.stage_path, activation_receipt=self.cert_path,
            state_root=self.state, public_key=self.public, allow_test_root=True,
            observer=lambda: self.current, observation_now=NOW)

    def test_archived_expired_signature_is_verified_without_nonce_replay_or_mutation(self):
        before = self.db.read_bytes()
        result = self.check()
        self.assertEqual(result["status"], "LIVE_PROTECTED_CERTIFIED_OUTER_OWNER_HOLD_PRESERVED")
        self.assertEqual(result["owner_journal"]["PRE_ACTIVATE"], "CONSUMED")
        self.assertFalse(result["historical_postactivation_drift_explained"])
        self.assertFalse(result["financial_release_authorized"])
        self.assertTrue(result["runtime_financial_boundary_matches_signed_reference_now"])
        self.assertEqual(self.db.read_bytes(), before)
        self.assertTrue(self.cert_path.is_file())

    def test_missing_or_corrupt_certified_receipt_fails_closed(self):
        self.cert_path.unlink()
        with self.assertRaises(OWNER.Hold): self.check()
        self.store_cert()
        self.cert_data["artifact_sha256"] = "b" * 64
        self.store_cert()
        with self.assertRaises(OWNER.Hold): self.check()

    def test_tampered_packet_or_durable_hash_fails_closed(self):
        self.packet["signature"] = base64.b64encode(b"tampered").decode()
        self.packet_path.write_text(json.dumps(self.packet))
        with self.assertRaises(OWNER.Hold): self.check()

    def test_wrong_journal_or_stage_history_fails_closed(self):
        with sqlite3.connect(self.db) as cx:
            cx.execute("UPDATE requests_v3 SET state='COMPLETE' WHERE phase='PRE_ACTIVATE'")
        with self.assertRaises(OWNER.Hold): self.check()
        with sqlite3.connect(self.db) as cx:
            cx.execute("UPDATE requests_v3 SET state='CONSUMED' WHERE phase='PRE_ACTIVATE'")
            cx.execute("UPDATE requests_v3 SET state='CONSUMED' WHERE phase='PRE_STAGE'")
        with self.assertRaises(OWNER.Hold): self.check()

    def test_runtime_source_or_financial_wolo_identity_difference_fails_closed(self):
        self.current["website"]["source_sha"] = OWNER.PRODUCTION_SHA
        with self.assertRaises(OWNER.Hold): self.check()
        self.current["website"]["source_sha"] = OWNER.MAIN_SOURCE_SHA
        self.current["immutable"]["wolo8092"]["pid"] += 5
        with self.assertRaises(OWNER.Hold): self.check()

    def test_stage_receipt_tampering_and_noncanonical_paths_fail_closed(self):
        self.stage_data["wolo_mutated"] = True
        self.store_stage()
        with self.assertRaises(OWNER.Hold): self.check()
        self.store_stage()
        self.cert_path.rename(self.root / "moved.json")
        self.cert_path.symlink_to(self.root / "moved.json")
        with self.assertRaises(OWNER.Hold): self.check()


if __name__ == "__main__":
    unittest.main()
