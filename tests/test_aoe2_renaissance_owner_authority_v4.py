"""Disposable crypto and durable-nonce adversarial tests of REVIEW-ONLY v4.

All RSA keys and journals are generated inside disposable local directories.
No owner key, production host, signing prompt, release or Wolo IO is possible.
"""
from __future__ import annotations
import base64
import copy
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_renaissance_owner_authority_v4 as auth


def openssl(*args, input=None):
    return subprocess.run(["openssl", *args], input=input, capture_output=True,
                          timeout=20, check=True).stdout


class WebsiteV4OwnerReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempkeys = tempfile.TemporaryDirectory(prefix="v4-disposable-keys-")
        cls.addClassCleanup(cls.tempkeys.cleanup)
        cls.keydir = Path(cls.tempkeys.name)
        cls.keydir.chmod(0o700)
        for name in ("owner", "impostor"):
            private = cls.keydir / (name + ".key")
            public = cls.keydir / (name + ".pem")
            openssl("genpkey", "-algorithm", "RSA", "-pkeyopt",
                    "rsa_keygen_bits:2048", "-out", str(private))
            openssl("pkey", "-in", str(private), "-pubout", "-out", str(public))
            private.chmod(0o600)
            public.chmod(0o600)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="v4-disposable-ledger-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.state = root / "owner-v4"
        self.state.mkdir(mode=0o700)
        self.trust = root / "public"
        self.trust.mkdir(mode=0o700)
        self.pub = self.trust / "owner.pem"
        self.pub.write_bytes((self.keydir / "owner.pem").read_bytes())
        self.pub.chmod(0o600)
        self.now = datetime(2026, 10, 25, 23, 0, tzinfo=timezone.utc)
        self.ctx = dict(
            candidate_sha=auth.FROZEN_TARGET,
            previous_production_sha=auth.FROZEN_BASE,
            inventory_sha256="1" * 64,
            controller_commit_sha="2" * 40,
            controller_code_sha256="3" * 64,
            gate_sha256="4" * 64,
            manifest_sha256="5" * 64,
            observed_financial_runtime_sha256="6" * 64,
            rollback_source_sha=auth.FROZEN_BASE,
            rollback_build_id="prior_BUILD_ID",
            artifact_sha256=None,
            stage_receipt_sha256=None,
            staged_next_build_id=None,
        )

    def issue(self, phase="PRE_STAGE", ctx=None, **extra):
        return auth.issue(copy.deepcopy(ctx or self.ctx), phase,
                          state_root=self.state, public_key=self.pub,
                          allow_test=True, now=self.now, **extra)

    def packet(self, payload, key="owner"):
        signature = openssl("dgst", "-sha256", "-sign", str(self.keydir / (key + ".key")),
                            input=auth.canonical(payload))
        return {"schema": 4, "policy": auth.POLICY,
                "payload": copy.deepcopy(payload),
                "signature": base64.b64encode(signature).decode("ascii")}

    def verify(self, packet, payload=None, now=None):
        return auth.verify_packet(packet, payload or packet["payload"],
                                  public_key=self.pub, allow_test=True,
                                  now=now or self.now)

    def consume(self, packet, now=None):
        return auth.consume_review(packet, state_root=self.state,
                                   public_key=self.pub, allow_test=True,
                                   now=now or self.now)

    def test_distinct_namespace_not_v3_ledger(self):
        self.assertIn(".v4", auth.POLICY)
        self.assertNotIn("-v3", str(auth.STATE_ROOT))
        self.assertEqual("owner-v4.sqlite3",
                         (self.state / "owner-v4.sqlite3").name)
        self.issue()
        self.assertTrue((self.state / "owner-v4.sqlite3").exists())
        self.assertFalse((self.state / "owner-v3.sqlite3").exists())

    def test_valid_review_is_signed_but_never_stages(self):
        payload = self.issue()
        packet = self.packet(payload)
        self.assertEqual("OWNER_SIGNATURE_VALID_FOR_REVIEW_ONLY",
                         self.verify(packet)["status"])
        result = self.consume(packet)
        self.assertEqual("SIGNED_REVIEW_CONSUMED_NOT_DISPATCHED", result["status"])
        self.assertFalse(result["website_stage_performed"])
        self.assertFalse(result["website_activated"])
        self.assertFalse(result["financial_release_authorized"])
        with self.assertRaises(auth.Hold):
            self.consume(packet)
        with self.assertRaises(auth.Hold):
            auth.deploy(packet)

    def test_staged_artifact_cannot_be_invented_on_first_signature(self):
        for key, value in (("artifact_sha256", "a" * 64),
                           ("stage_receipt_sha256", "b" * 64),
                           ("staged_next_build_id", "candidate-build")):
            with self.subTest(key=key):
                with self.assertRaises(auth.Hold):
                    self.issue(ctx=dict(self.ctx, **{key: value}))

    def test_activation_refused_without_real_stage_completion(self):
        first = self.issue()
        ctx = dict(self.ctx, artifact_sha256="a" * 64,
                   stage_receipt_sha256="b" * 64,
                   staged_next_build_id="candidate-build")
        with self.assertRaises(auth.Hold):
            self.issue("PRE_ACTIVATE", ctx, attempt_id=first["attempt_id"])
        self.consume(self.packet(first))
        with self.assertRaises(auth.Hold):
            self.issue("PRE_ACTIVATE", ctx, attempt_id=first["attempt_id"])
        with self.assertRaises(auth.Hold):
            auth.mark_protected_stage_complete(first, ctx)

    def test_expired_future_tamper_wrong_key_all_hold(self):
        first = self.issue()
        packet = self.packet(first)
        with self.assertRaises(auth.Hold):
            self.verify(packet, now=self.now + timedelta(minutes=21))
        with self.assertRaises(auth.Hold):
            self.verify(packet, now=self.now - timedelta(seconds=1))
        with self.assertRaises(auth.Hold):
            self.verify(self.packet(first, key="impostor"))
        forged = copy.deepcopy(packet)
        forged["payload"]["dispatch_enabled"] = True
        with self.assertRaises(auth.Hold):
            self.verify(forged, first)

    def test_legacy_packet_wrong_schema_and_policy_rejected(self):
        first = self.issue()
        packet = self.packet(first)
        for k,v in (("schema", 3),("policy","aoe2war.solo-owner.website.v3")):
            modified=dict(packet, **{k:v})
            with self.assertRaises(auth.Hold):
                self.verify(modified)

    def test_unknown_consume_nonce_and_duplicate_stage_issue(self):
        first = self.issue()
        with self.assertRaises(auth.Hold):
            auth.issue(copy.deepcopy(self.ctx), "PRE_STAGE", state_root=self.state,
                       public_key=self.pub, now=self.now, allow_test=True,
                       attempt_id=first["attempt_id"])
        second = self.issue()
        self.assertNotEqual(first["nonce"], second["nonce"])
        with self.assertRaises(auth.Hold):
            self.consume(self.packet(second) | {"payload":
                         dict(second, attempt_id=first["attempt_id"])})

    def test_source_or_context_authority_escalation_rejected(self):
        for key, value in (
            ("candidate_sha", auth.FROZEN_BASE),
            ("previous_production_sha", "f" * 40),
            ("rollback_source_sha", "e" * 40),
            ("manifest_sha256", "0" * 64),
            ("controller_code_sha256", None),
            ("rollback_build_id", ""),
        ):
            with self.subTest(key=key), self.assertRaises(auth.Hold):
                self.issue(ctx=dict(self.ctx, **{key: value}))

    def test_symlink_root_and_public_key_rejected(self):
        link = Path(self.temp.name) / "ledger-link"
        link.symlink_to(self.state, target_is_directory=True)
        with self.assertRaises(auth.Hold):
            auth.open_ledger(link, allow_test=True)
        keylink = self.trust / "owner-link.pem"
        keylink.symlink_to(self.pub)
        with self.assertRaises(auth.Hold):
            auth.public_fingerprint(keylink, allow_test=True)

    def test_ledger_has_consumed_durable_one_use_state(self):
        first = self.issue()
        proof = self.packet(first)
        result = self.consume(proof)
        with sqlite3.connect(self.state / "owner-v4.sqlite3") as cx:
            row = cx.execute("SELECT state,packet_sha FROM requests_v4 WHERE attempt_id=?",
                             (first["attempt_id"],)).fetchone()
        self.assertEqual("REVIEW_CONSUMED", row[0])
        self.assertEqual(result["owner_packet_sha256"], row[1])
        self.assertEqual(auth.digest(proof), row[1])


if __name__ == "__main__":
    unittest.main()
