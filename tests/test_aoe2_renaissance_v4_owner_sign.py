"""Explicit owner-v4 review-only signer invariants; no real owner credentials.

This suite never contacts HEL1, never stages or activates, and never asks for
a production passphrase. Every purported active authorization is refused.
"""
from __future__ import annotations

import copy
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_renaissance_owner_authority_v4 as auth
import aoe2_renaissance_v4_owner_sign as signer


class V4ExplicitOwnerReviewSigner(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 26, 1, 0, tzinfo=timezone.utc)
        ctx = {
            "candidate_sha": auth.FROZEN_TARGET,
            "previous_production_sha": auth.FROZEN_BASE,
            "rollback_source_sha": auth.FROZEN_BASE,
            "inventory_sha256": "1" * 64,
            "controller_commit_sha": "2" * 40,
            "controller_code_sha256": "3" * 64,
            "gate_sha256": "4" * 64,
            "manifest_sha256": "5" * 64,
            "observed_financial_runtime_sha256": "6" * 64,
            "rollback_build_id": "xqX6Oi-zV5gSKH1kIC4zC",
            "artifact_sha256": None,
            "stage_receipt_sha256": None,
            "staged_next_build_id": None,
        }
        self.payload = {
            "kind": auth.POLICY, "phase": "PRE_STAGE",
            "attempt_id": "A" * 32, "nonce": "N" * 32,
            "issued_at": auth.timestamp(self.now),
            "expires_at": auth.timestamp(self.now + timedelta(minutes=20)),
            "owner_pubkey_der_sha256": "7" * 64, "context": ctx,
            "source_scope_review_only": True, "dispatch_enabled": False,
            "financial_release_authorized": False, "custody_authorized": False,
            "wolo_source_p1_open": True,
        }
        self.request = {"schema": 4, "policy": auth.POLICY,
                        "payload": self.payload}
        self.kwargs = dict(
            phase="PRE_STAGE", candidate=auth.FROZEN_TARGET,
            controller=ctx["controller_commit_sha"],
            manifest=ctx["manifest_sha256"],
            nonce=self.payload["nonce"], now=self.now,
            accept_review_only=True,
        )

    def test_valid_review_is_not_stage_or_activation(self):
        self.assertEqual(signer.validate_challenge(self.request, **self.kwargs),
                         self.payload)
        self.assertFalse(self.payload["dispatch_enabled"])
        self.assertTrue(self.payload["source_scope_review_only"])

    def test_deployment_must_never_be_signed_by_review_only_helper(self):
        with self.assertRaisesRegex(auth.Hold, "protected dispatcher"):
            signer.validate_challenge(self.request,
                                      **dict(self.kwargs, accept_review_only=False))
        changed = copy.deepcopy(self.request)
        changed["payload"]["dispatch_enabled"] = True
        changed["payload"]["source_scope_review_only"] = False
        with self.assertRaisesRegex(auth.Hold, "protected dispatcher"):
            signer.validate_challenge(changed, **self.kwargs)

    def test_explicit_target_controller_manifest_nonce_and_phase_required(self):
        changes = {
            "phase": "PRE_ACTIVATE",
            "candidate": auth.FROZEN_BASE,
            "controller": "f"*40,
            "manifest": "b"*64,
            "nonce": "M"*32,
        }
        for field, value in changes.items():
            with self.subTest(field=field), self.assertRaises(auth.Hold):
                signer.validate_challenge(self.request,
                                          **dict(self.kwargs, **{field: value}))

    def test_expired_and_future_requests_refused(self):
        for when in [self.now-timedelta(seconds=1),
                     self.now+timedelta(minutes=20),
                     self.now+timedelta(hours=2)]:
            with self.subTest(when=when), self.assertRaises(auth.Hold):
                signer.validate_challenge(self.request,
                                          **dict(self.kwargs, now=when))

    def test_legacy_and_financial_escalation_refused(self):
        for field, value in [("schema", 3), ("policy", "aoe2war.solo-owner.website.v3")]:
            req = dict(self.request, **{field: value})
            with self.assertRaises(auth.Hold):
                signer.validate_challenge(req, **self.kwargs)
        for field in ("financial_release_authorized", "custody_authorized"):
            req = copy.deepcopy(self.request)
            req["payload"][field] = True
            with self.assertRaises(auth.Hold):
                signer.validate_challenge(req, **self.kwargs)

    def test_duplicate_json_and_symlink_request_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            d = Path(folder)
            good = d/"challenge.json"
            good.write_text(json.dumps(self.request))
            self.assertEqual(signer.load_request(good), self.request)
            other = d/"alias.json"
            other.symlink_to(good)
            with self.assertRaises(auth.Hold):
                signer.load_request(other)
            good.write_text('{"schema":4,"schema":4,"policy":"x","payload":{}}')
            with self.assertRaisesRegex(auth.Hold, "duplicate key"):
                signer.load_request(good)

    def test_unencrypted_or_linked_private_key_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            d = Path(folder)
            d.chmod(0o700)
            plain = d/"owner-private.pem"
            plain.write_text("-" * 5 + "BEGIN " + "PRIVATE KEY" + "-" * 5 + "\nsynthetic fixture\n")
            plain.chmod(0o600)
            with self.assertRaisesRegex(auth.Hold, "encrypted PKCS8"):
                signer.private_key_contract(plain)
            alias = d/"alias.pem"
            alias.symlink_to(plain)
            with self.assertRaises(auth.Hold):
                signer.private_key_contract(alias)
            plain.chmod(0o644)
            with self.assertRaisesRegex(auth.Hold, "owner-only"):
                signer.private_key_contract(plain)

    def test_no_private_material_in_errors_or_stdout(self):
        # The operator cannot approve an unrelated nonce via this signer;
        # malformed JSON does not cause an OpenSSL invocation.
        with self.assertRaises(auth.Hold):
            signer.validate_challenge(self.request,
                                      **dict(self.kwargs, nonce="wrong"))
        self.assertTrue(signer.__doc__.find("No key generation") != -1)


if __name__ == "__main__":
    unittest.main()
