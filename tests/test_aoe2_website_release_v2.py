"""Adversarial NONAUTHORIZING website-only release intake tests (no live keys)."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "aoe2_website_release_v2.py"
spec = importlib.util.spec_from_file_location("aoe2_website_release_v2", SOURCE)
AUTH = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(AUTH)


class WebsiteOnlyAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.trust = self.root / "trust"
        self.trust.mkdir(mode=0o700)
        self.now = datetime(2026, 10, 24, 22, 0, tzinfo=timezone.utc)
        self.candidate = "1" * 40
        self.scope = {"candidate": self.candidate, "scope_sha256": "a" * 64}
        self.payload = {
            "kind": "aoe2war-website-only-v2", "phase": "PRE_STAGE",
            "candidate_sha": self.candidate,
            "previous_production_sha": AUTH.PRODUCTION_SHA,
            "scope_sha256": self.scope["scope_sha256"],
            "attempt_id": "attempt_" + "a" * 32,
            "challenge": "challenge_" + "b" * 32,
            "controller_sha": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "manifest_sha256": "c" * 64, "gate_sha256": "d" * 64,
            "source_review_sha256": "e" * 64,
            "wolo_prestate_sha256": "f" * 64,
            "financial_noninterference_sha256": "0" * 64,
            "rollback_plan_sha256": "1" * 64,
            "independent_operator_observation_sha256": "2" * 64,
            "risk_class": "INFRASTRUCTURE",
            "financial_release_authorized": False,
            "custody_authorized": False,
            "claim_889_resolved": False,
            "wolo_source_p1_open": True, "wolo_mutated": False,
            "artifact_sha256": None, "stage_receipt_sha256": None,
            "build_id": None,
            "issued_at": "2026-10-24T21:50:00Z",
            "expires_at": "2026-10-24T22:10:00Z",
        }

    def inspect(self, packet):
        return AUTH.assess(packet, candidate=self.candidate,
                           actual_scope=self.scope, now=self.now,
                           trust_root=self.trust, allow_test_root=True)

    def test_failclosed_unauthenticated_packet(self):
        with self.assertRaisesRegex(AUTH.Hold, "four independent"):
            self.inspect({"schema": 2, "payload": self.payload, "signatures": {}})

    def test_duplicate_json_keys_refused(self):
        with self.assertRaisesRegex(AUTH.Hold, "duplicate"):
            json.loads('{"phase":"PRE_STAGE","phase":"PRE_ACTIVATE"}',
                       object_pairs_hook=AUTH.no_duplicates)

    def test_challenge_candidate_and_scope_substitution_refused(self):
        for field, change in (
            ("candidate_sha", "f" * 40),
            ("scope_sha256", "f" * 64),
            ("previous_production_sha", "f" * 40),
            ("controller_sha", "f" * 64),
        ):
            with self.subTest(field=field):
                altered = dict(self.payload, **{field: change})
                with self.assertRaises(AUTH.Hold):
                    self.inspect({"schema": 2, "payload": altered, "signatures": {}})

    def test_expired_and_future_refused(self):
        for change in ("2026-10-24T21:00:00Z", "2026-10-24T22:30:00Z"):
            with self.subTest(issued=change):
                altered = dict(self.payload, issued_at=change)
                with self.assertRaises(AUTH.Hold):
                    self.inspect({"schema": 2, "payload": altered, "signatures": {}})

    def test_prestage_artifact_cannot_be_invented(self):
        altered = dict(self.payload, artifact_sha256="f" * 64)
        with self.assertRaisesRegex(AUTH.Hold, "prestage"):
            self.inspect({"schema": 2, "payload": altered, "signatures": {}})

    def test_activation_needs_real_distinct_challenge_stage_receipt(self):
        altered = dict(self.payload, phase="PRE_ACTIVATE", artifact_sha256="f" * 64,
                       stage_receipt_sha256="e" * 64, stage_approval_sha256="d" * 64,
                       wolo_poststage_sha256="c" * 64, build_id="real-build-id",
                       stage_challenge=self.payload["challenge"])
        with self.assertRaisesRegex(AUTH.Hold, "renewed"):
            self.inspect({"schema": 2, "payload": altered, "signatures": {}})

    def test_wolo_finance_custody_booleans_never_escalate(self):
        for field, value in (("financial_release_authorized", True),
                             ("custody_authorized", True),
                             ("claim_889_resolved", True),
                             ("wolo_source_p1_open", False),
                             ("wolo_mutated", True)):
            with self.subTest(field=field):
                with self.assertRaisesRegex(AUTH.Hold, "escalation"):
                    self.inspect({"schema": 2,
                                  "payload": dict(self.payload, **{field: value}),
                                  "signatures": {}})

    def test_exact_closed_world_scope_rejects_server_runtime_writes(self):
        self.assertNotIn("lib/bets.ts", AUTH.ALLOWED_DELTA)
        self.assertNotIn("app/api/bets/route.ts", AUTH.ALLOWED_DELTA)
        self.assertNotIn("scripts/aoe2_release_ship.py", AUTH.ALLOWED_DELTA)
        self.assertNotIn("prisma/migrations/20261021/anything.sql", AUTH.ALLOWED_DELTA)

    def test_real_openssl_signatures_are_still_not_deployment_permission(self):
        signatures = {}
        for role in AUTH.ROLES:
            private = self.root / (role + ".private.pem")
            public = self.trust / (role + ".pem")
            generated = subprocess.run(
                ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                 "-out", str(private)], capture_output=True, timeout=15, check=False)
            self.assertEqual(0, generated.returncode)
            exported = subprocess.run(
                ["openssl", "pkey", "-in", str(private), "-pubout", "-out", str(public)],
                capture_output=True, timeout=10, check=False)
            self.assertEqual(0, exported.returncode)
            message = self.root / "message.json"
            message.write_bytes(AUTH.canonical(self.payload))
            signed = subprocess.run(
                ["openssl", "dgst", "-sha256", "-sign", str(private), str(message)],
                capture_output=True, timeout=10, check=False)
            self.assertEqual(0, signed.returncode)
            signatures[role] = base64.b64encode(signed.stdout).decode("ascii")

        packet = {"schema": 2, "payload": self.payload, "signatures": signatures}
        reviewed = self.inspect(packet)
        self.assertEqual("CRYPTOGRAPHIC_REVIEW_VALID_NONAUTHORIZING", reviewed["state"])
        self.assertIs(reviewed["website_release_authorized"], False)
        self.assertIs(reviewed["financial_release_authorized"], False)
        tampered = json.loads(json.dumps(packet))
        tampered["payload"]["manifest_sha256"] = "f" * 64
        with self.assertRaisesRegex(AUTH.Hold, "cryptographic"):
            self.inspect(tampered)
        # One duplicated key material pretending to occupy two roles is refused.
        (self.trust / "finance_reviewer.pem").write_bytes(
            (self.trust / "owner.pem").read_bytes())
        with self.assertRaisesRegex(AUTH.Hold, "duplicate reviewer"):
            self.inspect(packet)


    def test_durable_challenge_cannot_reissue_or_activate_without_stage(self):
        state = self.root / "state"
        state.mkdir(mode=0o700)
        stage = AUTH.issue_challenge(state_root=state, candidate=self.candidate,
                                     phase="PRE_STAGE", now=self.now,
                                     allow_test_root=True)
        self.assertFalse(stage["website_release_authorized"])
        self.assertGreaterEqual(len(stage["challenge"]), 24)
        with self.assertRaisesRegex(AUTH.Hold, "stage attempt not consumed"):
            AUTH.issue_challenge(state_root=state, candidate=self.candidate,
                                 phase="PRE_ACTIVATE", now=self.now,
                                 attempt_id=stage["attempt_id"],
                                 previous_stage_sha="f" * 64, allow_test_root=True)
        cx = AUTH._state_connection(state, allow_test_root=True)
        try:
            self.assertEqual(1, cx.execute("SELECT count(*) FROM attempts").fetchone()[0])
        finally:
            cx.close()


if __name__ == "__main__":
    unittest.main()
