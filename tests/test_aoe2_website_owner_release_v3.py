"""Offline solo-owner policy tests: disposable keys/state, never production authority.

Runtime collection and the protected release engine are mocked only in dispatch
ordering tests. Cryptographic verification and the durable one-use journal remain
real, including concurrent callers and a process dying after consumption.
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
import threading
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_website_owner_release_v3 as AUTH


class SoloOwnerWebsiteReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keys = tempfile.TemporaryDirectory(prefix="aoe2-owner-v3-test-keys-")
        cls.addClassCleanup(cls.keys.cleanup)
        cls.keyroot = Path(cls.keys.name)
        cls.private = {}
        cls.public = {}
        for name in ("owner", "different-owner"):
            private = cls.keyroot / (name + ".key")
            public = cls.keyroot / (name + ".pem")
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                            "rsa_keygen_bits:2048", "-out", str(private)],
                           check=True, capture_output=True, timeout=20)
            subprocess.run(["openssl", "pkey", "-in", str(private), "-pubout", "-out", str(public)],
                           check=True, capture_output=True, timeout=10)
            private.chmod(0o600)
            public.chmod(0o600)
            cls.private[name] = private
            cls.public[name] = public

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="aoe2-owner-v3-test-state-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        self.trust = self.root / "trust"
        self.trust.mkdir(mode=0o700)
        self.owner = self.trust / "owner.pem"
        self.owner.write_bytes(self.public["owner"].read_bytes())
        self.owner.chmod(0o600)
        self.now = datetime(2026, 10, 24, 23, 0, tzinfo=timezone.utc)
        self.observation = {
            "observed_at": AUTH.stamp(self.now),
            "immutable": {"test_only_runtime_digest": "9" * 64},
            "website": {"source_sha": AUTH.PRODUCTION_SHA, "build_id": "rollback_BUILD_123"},
        }
        self.context = {
            "candidate_sha": AUTH.MAIN_SOURCE_SHA,
            "previous_production_sha": AUTH.PRODUCTION_SHA,
            "scope_sha256": "1" * 64,
            "controller_commit_sha": "2" * 40,
            "operator_inventory_sha256": "3" * 64,
            "policy_source_sha256": "4" * 64,
            "manifest_sha256": AUTH.MANIFEST_SHA256,
            "gate_sha256": "5" * 64,
            "runtime_observation": self.observation,
            "rollback": {"source_sha": AUTH.PRODUCTION_SHA, "build_id": "rollback_BUILD_123"},
            "artifact_sha256": None,
            "stage_receipt_sha256": None,
            "build_id": None,
        }
        self.stage_result = {
            "status": "STAGED", "artifact_sha256": "a" * 64,
            "staged_build_id": "candidate_BUILD_123", "local_receipt_sha256": "b" * 64,
        }

    def issue(self, phase="PRE_STAGE", context=None, **kwargs):
        return AUTH.issue_request(copy.deepcopy(self.context if context is None else context), phase,
                                  state_root=self.state, public_key=self.owner,
                                  now=kwargs.pop("now", self.now), allow_test_root=True, **kwargs)

    def packet(self, payload, signer="owner"):
        msg = self.root / "message"
        msg.write_bytes(AUTH.canonical(payload))
        signed = subprocess.run(["openssl", "dgst", "-sha256", "-sign",
                                 str(self.private[signer]), str(msg)],
                                check=True, capture_output=True, timeout=10)
        return {"schema": 3, "policy": AUTH.POLICY_ID, "payload": copy.deepcopy(payload),
                "signature": base64.b64encode(signed.stdout).decode("ascii")}

    def verify(self, packet, payload, **kwargs):
        return AUTH.verify_packet(packet, public_key=self.owner, issued_payload=payload,
                                  now=kwargs.pop("now", self.now), allow_test_root=True, **kwargs)

    def consume(self, packet, **kwargs):
        return AUTH.consume_request(packet, state_root=self.state, public_key=self.owner,
                                    now=kwargs.pop("now", self.now), allow_test_root=True, **kwargs)

    def finish(self, payload, result=None):
        return AUTH.finish_request(payload["attempt_id"], payload["phase"],
                                   self.stage_result if result is None else result,
                                   state_root=self.state, allow_test_root=True)

    def activation_context(self):
        return dict(copy.deepcopy(self.context), artifact_sha256=self.stage_result["artifact_sha256"],
                    stage_receipt_sha256=self.stage_result["local_receipt_sha256"],
                    build_id=self.stage_result["staged_build_id"])

    def completed_stage(self):
        payload = self.issue()
        self.consume(self.packet(payload))
        self.finish(payload)
        return payload

    def test_owner_trust_directory_symlink_refused(self):
        redirected = self.root / "redirected-trust"
        redirected.symlink_to(self.trust, target_is_directory=True)
        with self.assertRaises(AUTH.Hold):
            AUTH.load_owner_key(redirected / "owner.pem", allow_test_root=True)

    def test_owner_rsa_key_identity_uses_der_not_pem_wrapping(self):
        der = subprocess.run(["openssl", "pkey", "-pubin", "-in", str(self.owner),
                              "-pubout", "-outform", "DER"],
                             check=True, capture_output=True, timeout=10).stdout
        expected = hashlib.sha256(der).hexdigest()
        self.assertEqual(expected, AUTH.load_owner_key(self.owner, allow_test_root=True))
        lines = self.owner.read_text().strip().splitlines()
        body = "".join(lines[1:-1])
        self.owner.write_text(lines[0] + "\n" + "\n".join(body[i:i+32] for i in range(0, len(body), 32)) + "\n" + lines[-1] + "\n")
        self.assertEqual(expected, AUTH.load_owner_key(self.owner, allow_test_root=True))

    def test_policy_and_observer_paths_are_infrastructure_not_presentation(self):
        import aoe2_release_gate as gate
        for name in ("scripts/aoe2_website_owner_release_v3.py",
                     "scripts/aoe2_website_owner_observer_v3.py",
                     "tests/test_aoe2_website_owner_release_v3.py",
                     "tests/test_aoe2_website_owner_observer_v3.py"):
            with self.subTest(path=name):
                self.assertEqual("INFRASTRUCTURE", gate.path_risk(name))

    def test_owner_key_must_be_public_protected_regular_unlinked_material(self):
        original = self.owner.read_bytes()
        for mode in (0o620, 0o602, 0o666):
            with self.subTest(mode=oct(mode)):
                self.owner.chmod(mode)
                with self.assertRaises(AUTH.Hold):
                    AUTH.load_owner_key(self.owner, allow_test_root=True)
        self.owner.chmod(0o600)
        for raw in (b"garbage", self.private["owner"].read_bytes(), b""):
            with self.subTest(material=raw[:15]):
                self.owner.write_bytes(raw)
                with self.assertRaises(AUTH.Hold):
                    AUTH.load_owner_key(self.owner, allow_test_root=True)
        self.owner.write_bytes(original)
        self.owner.unlink()
        self.owner.symlink_to(self.public["owner"])
        with self.assertRaises(AUTH.Hold):
            AUTH.load_owner_key(self.owner, allow_test_root=True)

    def test_non_rsa_owner_key_cannot_change_signature_algorithm(self):
        private = self.root / "ec.key"
        subprocess.run(["openssl", "genpkey", "-algorithm", "EC", "-pkeyopt",
                        "ec_paramgen_curve:P-256", "-out", str(private)],
                       check=True, capture_output=True, timeout=10)
        subprocess.run(["openssl", "pkey", "-in", str(private), "-pubout", "-out", str(self.owner)],
                       check=True, capture_output=True, timeout=10)
        with self.assertRaises(AUTH.Hold):
            AUTH.load_owner_key(self.owner, allow_test_root=True)

    def test_rsa_owner_key_below_2048_bits_is_rejected(self):
        private = self.root / "weak-rsa.key"
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                        "rsa_keygen_bits:1024", "-out", str(private)],
                       check=True, capture_output=True, timeout=10)
        subprocess.run(["openssl", "pkey", "-in", str(private), "-pubout", "-out", str(self.owner)],
                       check=True, capture_output=True, timeout=10)
        with self.assertRaises(AUTH.Hold):
            AUTH.load_owner_key(self.owner, allow_test_root=True)

    def test_valid_stage_is_owner_only_website_authority_without_financial_attestation(self):
        payload = self.issue()
        packet = self.packet(payload)
        self.assertEqual(payload, self.verify(packet, payload))
        self.assertEqual(AUTH.digest(packet), self.consume(packet))
        self.assertTrue(payload["same_owner_observation_not_independent"])
        self.assertTrue(payload["wolo_source_p1_open"])
        for key in ("financial_release_authorized", "custody_authorized", "claim_889_resolved"):
            self.assertIs(payload[key], False)
        self.assertEqual(timedelta(minutes=20), AUTH.utc_time(payload["expires_at"]) - AUTH.utc_time(payload["issued_at"]))

    def test_legacy_council_other_domain_and_extra_envelope_fields_rejected(self):
        payload = self.issue()
        valid = self.packet(payload)
        variants = [dict(valid, policy="aoe2war.website.v2"), dict(valid, schema=2),
                    dict(valid, schema=True), dict(valid, kind="owner"),
                    {"schema": 3, "policy": AUTH.POLICY_ID, "payload": payload,
                     "signatures": {"owner": valid["signature"]}}]
        for packet in variants:
            with self.subTest(keys=sorted(packet), schema=packet.get("schema")):
                with self.assertRaises(AUTH.Hold):
                    self.verify(packet, payload)

    def test_wrong_key_forged_truncated_and_malformed_signatures_rejected(self):
        payload = self.issue()
        for signature in (self.packet(payload, "different-owner")["signature"],
                          "not base64!", "", None, base64.b64encode(b"x" * 256).decode("ascii")):
            with self.subTest(signature=repr(signature)[:30]):
                packet = self.packet(payload)
                packet["signature"] = signature
                with self.assertRaises(AUTH.Hold):
                    self.verify(packet, payload)
        self.owner.write_bytes(self.public["different-owner"].read_bytes())
        with self.assertRaises(AUTH.Hold):
            self.verify(self.packet(payload), payload)

    def test_even_owner_resigned_context_cannot_replace_issued_candidate_rollback_or_evidence(self):
        issued = self.issue()
        for field, value in (("candidate_sha", "f" * 40), ("scope_sha256", "f" * 64),
                             ("controller_commit_sha", "f" * 40), ("operator_inventory_sha256", "f" * 64),
                             ("policy_source_sha256", "f" * 64), ("manifest_sha256", "f" * 64),
                             ("gate_sha256", "f" * 64), ("runtime_observation", {}),
                             ("rollback", {"source_sha": "f" * 40, "build_id": "other_build"})):
            with self.subTest(field=field):
                changed = copy.deepcopy(issued)
                changed["context"][field] = value
                with self.assertRaises(AUTH.Hold):
                    self.consume(self.packet(changed))
        self.consume(self.packet(issued))  # failed substitutions never consume the genuine request

    def test_financial_escalation_or_false_independence_is_rejected_even_when_owner_signed(self):
        payload = self.issue()
        for key, value in (("financial_release_authorized", True), ("custody_authorized", True),
                           ("claim_889_resolved", True), ("wolo_source_p1_open", False),
                           ("same_owner_observation_not_independent", False)):
            with self.subTest(key=key):
                changed = dict(payload, **{key: value})
                with self.assertRaises(AUTH.Hold):
                    self.verify(self.packet(changed), changed)

    def test_expired_future_and_overlong_owner_authority_cannot_be_consumed(self):
        issued = self.issue()
        packet = self.packet(issued)
        for now in (self.now - timedelta(seconds=1), self.now + timedelta(minutes=20),
                    self.now + timedelta(days=1)):
            with self.subTest(now=now):
                with self.assertRaises(AUTH.Hold):
                    self.consume(packet, now=now)
        changed = dict(issued, expires_at=AUTH.stamp(self.now + timedelta(minutes=20, seconds=1)))
        with self.assertRaises(AUTH.Hold):
            self.verify(self.packet(changed), changed)
        self.consume(packet, now=self.now + timedelta(minutes=19, seconds=59))

    def test_real_crypto_io_expiry_refuses_verification_and_preserves_unconsumed_nonce(self):
        real_run = subprocess.run
        for target in ("verify", "consume"):
            with self.subTest(target=target):
                payload = self.issue()
                packet = self.packet(payload)
                clock = [self.now]
                verified_crypto = []
                def delayed_crypto(args, **kwargs):
                    result = real_run(args, **kwargs)
                    if args[:2] == ["openssl", "dgst"] and "-verify" in args:
                        self.assertEqual(0, result.returncode)
                        verified_crypto.append("genuine RSA verification completed")
                        clock[0] += timedelta(minutes=20)
                    return result
                with patch.object(AUTH, "moment", side_effect=lambda now=None: now if now is not None else clock[0]), \
                     patch.object(AUTH.subprocess, "run", side_effect=delayed_crypto):
                    with self.assertRaisesRegex(AUTH.Hold, "expired during signature verification"):
                        if target == "verify":
                            AUTH.verify_packet(packet, public_key=self.owner, issued_payload=payload,
                                               allow_test_root=True)
                        else:
                            AUTH.consume_request(packet, state_root=self.state, public_key=self.owner,
                                                 allow_test_root=True)
                self.assertEqual(["genuine RSA verification completed"], verified_crypto)
                with closing(sqlite3.connect(self.state / "owner-v3.sqlite3")) as cx:
                    row = cx.execute("SELECT state,packet_sha,result FROM requests_v3 WHERE attempt_id=? AND phase=?",
                                     (payload["attempt_id"], payload["phase"])).fetchone()
                self.assertEqual(("ISSUED", None, None), row)

    def test_unknown_context_phase_source_digest_and_prestage_artifact_fail_closed(self):
        variants = [dict(self.context, extra="unreviewed"),
                    {key: value for key, value in self.context.items() if key != "gate_sha256"},
                    dict(self.context, candidate_sha="f" * 40),
                    dict(self.context, previous_production_sha="f" * 40),
                    dict(self.context, gate_sha256="wrong"),
                    dict(self.context, manifest_sha256="f" * 64),
                    dict(self.context, rollback={}),
                    dict(self.context, runtime_observation=None)]
        for key in ("artifact_sha256", "stage_receipt_sha256", "build_id"):
            variants.append(dict(self.context, **{key: "a" * 64}))
        for context in variants:
            with self.subTest(context=context):
                with self.assertRaises(AUTH.Hold):
                    self.issue(context=context)
        with self.assertRaises(AUTH.Hold):
            self.issue(phase="FINANCIAL_ACTIVATE")

    def test_nonce_requests_are_unique_and_unknown_attempt_cannot_borrow_valid_signature(self):
        first, second = self.issue(), self.issue()
        self.assertNotEqual(first["nonce"], second["nonce"])
        self.assertNotEqual(first["attempt_id"], second["attempt_id"])
        changed = dict(first, attempt_id="unknown_" + "a" * 32)
        with self.assertRaises(AUTH.Hold):
            self.consume(self.packet(changed))
        changed = dict(first, attempt_id=second["attempt_id"])
        with self.assertRaises(AUTH.Hold):
            self.consume(self.packet(changed))

    def test_stage_cannot_reuse_attempt_or_complete_before_consumption(self):
        payload = self.issue()
        with self.assertRaises(AUTH.Hold):
            self.issue(attempt_id=payload["attempt_id"])
        with self.assertRaises(AUTH.Hold):
            self.finish(payload)
        self.consume(self.packet(payload))
        self.finish(payload)
        with self.assertRaises(AUTH.Hold):
            self.finish(payload)
        with self.assertRaises(AUTH.Hold):
            self.consume(self.packet(payload))

    def test_activation_requires_completed_same_attempt_and_exact_staged_artifact(self):
        payload = self.issue()
        context = self.activation_context()
        for step in ("issued", "consumed"):
            with self.subTest(step=step):
                with self.assertRaises(AUTH.Hold):
                    self.issue("PRE_ACTIVATE", context, attempt_id=payload["attempt_id"])
            if step == "issued":
                self.consume(self.packet(payload))
        self.finish(payload)
        for field, value in (("artifact_sha256", "c" * 64), ("build_id", "wrong_BUILD_123")):
            with self.subTest(field=field):
                with self.assertRaises(AUTH.Hold):
                    self.issue("PRE_ACTIVATE", dict(context, **{field: value}), attempt_id=payload["attempt_id"])
        with self.assertRaises(AUTH.Hold):
            self.issue("PRE_ACTIVATE", context, attempt_id="unknown_" + "a" * 32)
        activation = self.issue("PRE_ACTIVATE", context, attempt_id=payload["attempt_id"])
        self.assertEqual(payload["attempt_id"], activation["attempt_id"])
        self.assertNotEqual(payload["nonce"], activation["nonce"])
        self.consume(self.packet(activation))

    def test_activation_cannot_borrow_different_receipt_for_same_artifact_and_build(self):
        stage = self.completed_stage()
        changed = dict(self.activation_context(), stage_receipt_sha256="f" * 64)
        with self.assertRaises(AUTH.Hold):
            self.issue("PRE_ACTIVATE", changed, attempt_id=stage["attempt_id"])

    def test_failed_or_uncertain_stage_completion_does_not_authorize_activation(self):
        payload = self.issue()
        self.consume(self.packet(payload))
        self.finish(payload, dict(self.stage_result, status="UNVERIFIABLE"))
        with self.assertRaises(AUTH.Hold):
            self.issue("PRE_ACTIVATE", self.activation_context(), attempt_id=payload["attempt_id"])

    def test_duplicate_concurrent_consume_has_exactly_one_success(self):
        payload = self.issue()
        packet = self.packet(payload)
        barrier = threading.Barrier(2)
        def consume_once():
            barrier.wait(timeout=5)
            try:
                return ("consumed", self.consume(packet))
            except AUTH.Hold:
                return ("held", None)
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda _: consume_once(), range(2)))
        self.assertEqual(["consumed", "held"], sorted(result[0] for result in results))
        with self.assertRaises(AUTH.Hold):
            self.consume(packet)

    def test_consumed_authority_survives_process_crash_without_automatic_retry(self):
        payload = self.issue()
        packet_file = self.root / "packet.json"
        packet_file.write_text(json.dumps(self.packet(payload)))
        code = """
import json,os,sys
from datetime import datetime
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import aoe2_website_owner_release_v3 as auth
auth.consume_request(json.loads(Path(sys.argv[2]).read_text()),state_root=Path(sys.argv[3]),
 public_key=Path(sys.argv[4]),now=datetime.fromisoformat(sys.argv[5]),allow_test_root=True)
os._exit(23)  # dispatch result/transport is lost; no COMPLETE receipt is manufactured
"""
        child = subprocess.run([sys.executable, "-c", code, str(ROOT / "scripts"), str(packet_file),
                                str(self.state), str(self.owner), self.now.isoformat()],
                               capture_output=True, timeout=20,
                               env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))
        self.assertEqual(23, child.returncode, child.stderr.decode())
        with self.assertRaises(AUTH.Hold):
            self.consume(json.loads(packet_file.read_text()))
        with self.assertRaises(AUTH.Hold):
            self.issue("PRE_ACTIVATE", self.activation_context(), attempt_id=payload["attempt_id"])

    def test_nonce_storage_rejects_shared_directory_linked_or_world_readable_database(self):
        self.state.chmod(0o755)
        with self.assertRaises(AUTH.Hold):
            self.issue()
        self.state.chmod(0o700)
        self.issue()
        db = self.state / "owner-v3.sqlite3"
        db.chmod(0o644)
        with self.assertRaises(AUTH.Hold):
            self.issue()
        db.unlink()
        db.symlink_to(self.root / "untrusted.sqlite3")
        with self.assertRaises(AUTH.Hold):
            self.issue()

    def test_real_consume_precedes_mock_dispatch_under_lease_and_failure_never_redispatches(self):
        payload = self.issue()
        packet = self.packet(payload)
        locked = False
        calls = []
        @contextmanager
        def lease():
            nonlocal locked
            self.assertFalse(locked)
            locked = True
            try:
                yield
            finally:
                locked = False
        def dispatch(*_args, **_kwargs):
            self.assertTrue(locked)
            with closing(sqlite3.connect(self.state / "owner-v3.sqlite3")) as cx:
                self.assertEqual("CONSUMED", cx.execute("SELECT state FROM requests_v3 WHERE attempt_id=? AND phase=?",
                                                       (payload["attempt_id"], payload["phase"])).fetchone()[0])
            calls.append("one protected dispatch")
            raise RuntimeError("synthetic lost transport/result")
        real_key, real_consume = AUTH.load_owner_key, AUTH.consume_request
        modules = {
            "aoe2_release": types.SimpleNamespace(deployment_lock=lease, collect=lambda: {"test_only": "preflight"}),
            "aoe2_website_protected_release_v2": types.SimpleNamespace(),
            "aoe2_website_owner_observer_v3": types.SimpleNamespace(
                observe=lambda: copy.deepcopy(self.observation), validate_observation=lambda *_args, **_kwargs: None),
        }
        with patch.dict(sys.modules, modules), patch.dict(os.environ), \
             patch.object(AUTH, "PUBLIC_KEY", self.owner), patch.object(AUTH, "STATE_ROOT", self.state), \
             patch.object(AUTH, "moment", side_effect=lambda now=None: self.now if now is None else now), \
             patch.object(AUTH, "release_context", return_value=copy.deepcopy(self.context)), \
             patch.object(AUTH, "protected_dispatch", side_effect=dispatch), \
             patch.object(AUTH, "load_owner_key", side_effect=lambda path, **_kw: real_key(path, allow_test_root=True)), \
             patch.object(AUTH, "consume_request", side_effect=lambda packet, **_kw: real_consume(
                 packet, state_root=self.state, public_key=self.owner, now=self.now, allow_test_root=True)):
            with self.assertRaisesRegex(RuntimeError, "synthetic lost"):
                AUTH.operation("stage", self.root, packet=packet)
            with self.assertRaises(AUTH.Hold):
                AUTH.operation("stage", self.root, packet=packet)
        self.assertEqual(["one protected dispatch"], calls)
        self.assertFalse(locked)

    def test_expiry_inside_durable_consumption_prevents_dispatch_but_retains_consumed_nonce(self):
        for boundary in ("runtime-observation", "owner-authorization"):
            with self.subTest(boundary=boundary):
                payload = self.issue()
                packet = self.packet(payload)
                clock = [self.now if boundary == "runtime-observation" else self.now + timedelta(minutes=19, seconds=59)]
                @contextmanager
                def lease():
                    yield
                def observe():
                    return dict(copy.deepcopy(self.observation), observed_at=AUTH.stamp(clock[0]))
                def validate(value, *, max_age_seconds=90, **_kwargs):
                    AUTH.require(clock[0] - AUTH.utc_time(value["observed_at"]) <= timedelta(seconds=max_age_seconds),
                                 "synthetic runtime observation expired during durable consumption")
                real_key, real_consume = AUTH.load_owner_key, AUTH.consume_request
                def delayed_consume(packet, **_kwargs):
                    # Persist the genuine one-use decision before simulating
                    # the remaining SQLite/fsync/return I/O delay.
                    sha = real_consume(packet, state_root=self.state, public_key=self.owner,
                                       now=clock[0], allow_test_root=True)
                    clock[0] += timedelta(seconds=91 if boundary == "runtime-observation" else 2)
                    return sha
                modules = {
                    "aoe2_release": types.SimpleNamespace(deployment_lock=lease, collect=lambda: {"test_only": "preflight"}),
                    "aoe2_website_owner_observer_v3": types.SimpleNamespace(observe=observe, validate_observation=validate),
                }
                with patch.dict(sys.modules, modules), patch.dict(os.environ), \
                     patch.object(AUTH, "PUBLIC_KEY", self.owner), patch.object(AUTH, "STATE_ROOT", self.state), \
                     patch.object(AUTH, "moment", side_effect=lambda now=None: clock[0] if now is None else now), \
                     patch.object(AUTH, "release_context", return_value=copy.deepcopy(self.context)), \
                     patch.object(AUTH, "load_owner_key", side_effect=lambda path, **_kw: real_key(path, allow_test_root=True)), \
                     patch.object(AUTH, "consume_request", side_effect=delayed_consume), \
                     patch.object(AUTH, "protected_dispatch") as dispatch:
                    with self.assertRaisesRegex(AUTH.Hold, "expired during durable consumption"):
                        AUTH.operation("stage", self.root, packet=packet)
                    dispatch.assert_not_called()
                with closing(sqlite3.connect(self.state / "owner-v3.sqlite3")) as cx:
                    row = cx.execute("SELECT state,packet_sha,result FROM requests_v3 WHERE attempt_id=? AND phase=?",
                                     (payload["attempt_id"], payload["phase"])).fetchone()
                self.assertEqual(("CONSUMED", AUTH.digest(packet), None), row)
                with self.assertRaisesRegex(AUTH.Hold, "consumed"):
                    self.consume(packet)

    def test_stale_final_observation_after_context_io_blocks_dispatch_and_preserves_nonce(self):
        payload = self.issue()
        packet = self.packet(payload)
        clock = [self.now]
        dispatched = []
        consumed = []
        @contextmanager
        def lease():
            yield
        def context_io(*_args, **_kwargs):
            clock[0] += timedelta(seconds=91)
            return copy.deepcopy(self.context)
        def observation():
            # A collector replaying the initial result cannot borrow its earlier
            # successful freshness check after context I/O has used that lease.
            return copy.deepcopy(self.observation)
        def validate(value, *, max_age_seconds=90, **_kwargs):
            if clock[0] - AUTH.utc_time(value["observed_at"]) > timedelta(seconds=max_age_seconds):
                raise AUTH.Hold("synthetic runtime observation expired during bounded context I/O")
        def dispatch(*_args, **_kwargs):
            dispatched.append("must not reach protected dispatch with expired capture")
            return self.stage_result
        real_key, real_consume, real_finish = AUTH.load_owner_key, AUTH.consume_request, AUTH.finish_request
        def consume(packet, **_kwargs):
            consumed.append("must not spend authority on expired capture")
            return real_consume(packet, state_root=self.state, public_key=self.owner,
                                now=clock[0], allow_test_root=True)
        modules = {
            "aoe2_release": types.SimpleNamespace(deployment_lock=lease, collect=lambda: {"test_only": "preflight"}),
            "aoe2_website_protected_release_v2": types.SimpleNamespace(),
            "aoe2_website_owner_observer_v3": types.SimpleNamespace(observe=observation, validate_observation=validate),
        }
        with patch.dict(sys.modules, modules), patch.dict(os.environ), \
             patch.object(AUTH, "PUBLIC_KEY", self.owner), patch.object(AUTH, "STATE_ROOT", self.state), \
             patch.object(AUTH, "moment", side_effect=lambda now=None: clock[0] if now is None else now), \
             patch.object(AUTH, "release_context", side_effect=context_io), \
             patch.object(AUTH, "protected_dispatch", side_effect=dispatch), \
             patch.object(AUTH, "load_owner_key", side_effect=lambda path, **_kw: real_key(path, allow_test_root=True)), \
             patch.object(AUTH, "consume_request", side_effect=consume), \
             patch.object(AUTH, "finish_request", side_effect=lambda attempt, phase, result, **_kw: real_finish(
                 attempt, phase, result, state_root=self.state, allow_test_root=True)):
            with self.assertRaises(AUTH.Hold):
                AUTH.operation("stage", self.root, packet=packet)
        self.assertEqual([], consumed)
        self.assertEqual([], dispatched)
        self.consume(packet, now=clock[0])  # observation expiry itself never spends the still-valid owner nonce

    def test_signing_requires_explicit_exact_candidate_controller_manifest_and_phase(self):
        payload = self.issue()
        request = {"schema": 3, "policy": AUTH.POLICY_ID, "payload": payload}
        approved = {"candidate": AUTH.MAIN_SOURCE_SHA, "controller": self.context["controller_commit_sha"],
                    "manifest": AUTH.MANIFEST_SHA256, "phase": "PRE_STAGE"}
        for key, value in (("candidate", "f" * 40), ("controller", "f" * 40),
                           ("manifest", "f" * 64), ("phase", "PRE_ACTIVATE")):
            with self.subTest(key=key), patch.object(AUTH.subprocess, "run") as signer:
                with self.assertRaises(AUTH.Hold):
                    AUTH.sign_request(request, self.private["owner"], **dict(approved, **{key: value}))
                signer.assert_not_called()

    def test_complete_signed_stage_then_fresh_same_attempt_activation_is_durable_and_one_use(self):
        clock = [self.now]
        website = copy.deepcopy(self.observation["website"])
        immutable = copy.deepcopy(self.observation["immutable"])
        locked = False
        calls = []
        stage_receipt = self.root / "offline-stage-receipt.json"
        receipt = {"status": "STAGED", "artifact_sha256": self.stage_result["artifact_sha256"],
                   "staged_build_id": self.stage_result["staged_build_id"],
                   "release_sha": AUTH.MAIN_SOURCE_SHA, "wolo_mutated": False}
        receipt_bytes = AUTH.canonical(receipt)
        stage_result = dict(receipt, local_receipt_sha256=hashlib.sha256(receipt_bytes).hexdigest())
        @contextmanager
        def lease():
            nonlocal locked
            self.assertFalse(locked)
            locked = True
            try:
                yield
            finally:
                locked = False
        def observe():
            return {"observed_at": AUTH.stamp(clock[0]), "immutable": copy.deepcopy(immutable),
                    "website": copy.deepcopy(website)}
        def validate(value, *, max_age_seconds=90, **_kwargs):
            self.assertLessEqual(clock[0] - AUTH.utc_time(value["observed_at"]),
                                 timedelta(seconds=max_age_seconds))
        def context(_repo, observation, *, stage_receipt=None):
            result = copy.deepcopy(self.context)
            result["runtime_observation"] = observation
            if stage_receipt is not None:
                self.assertEqual(self.root / "offline-stage-receipt.json", stage_receipt)
                self.assertEqual(receipt_bytes, stage_receipt.read_bytes())
                result.update(artifact_sha256=stage_result["artifact_sha256"],
                              stage_receipt_sha256=hashlib.sha256(stage_receipt.read_bytes()).hexdigest(),
                              build_id=stage_result["staged_build_id"])
            return result
        def dispatch(_data, _repo, mode, supplied_receipt):
            self.assertTrue(locked)
            phase = "PRE_STAGE" if mode == "stage" else "PRE_ACTIVATE"
            with closing(sqlite3.connect(self.state / "owner-v3.sqlite3")) as cx:
                rows = cx.execute("SELECT state,packet_sha FROM requests_v3 WHERE phase=?", (phase,)).fetchall()
            self.assertEqual(1, len(rows))
            self.assertEqual("CONSUMED", rows[0][0])
            self.assertEqual(AUTH.digest(signed[phase]), rows[0][1])
            calls.append(mode)
            if mode == "stage":
                self.assertIsNone(supplied_receipt)
                self.assertEqual(AUTH.PRODUCTION_SHA, website["source_sha"])
                stage_receipt.write_bytes(receipt_bytes)
                return copy.deepcopy(stage_result)
            self.assertEqual(stage_receipt, supplied_receipt)
            self.assertEqual(receipt_bytes, supplied_receipt.read_bytes())
            website.update(source_sha=AUTH.MAIN_SOURCE_SHA, build_id=stage_result["staged_build_id"])
            return {"status": "CERTIFIED", "release_sha": AUTH.MAIN_SOURCE_SHA, "wolo_mutated": False}
        real_key, real_issue = AUTH.load_owner_key, AUTH.issue_request
        real_consume, real_finish = AUTH.consume_request, AUTH.finish_request
        signed = {}
        modules = {
            "aoe2_release": types.SimpleNamespace(deployment_lock=lease, collect=lambda: {"test_only": "preflight"}),
            "aoe2_website_owner_observer_v3": types.SimpleNamespace(observe=observe, validate_observation=validate),
        }
        with patch.dict(sys.modules, modules), patch.dict(os.environ), \
             patch.object(AUTH, "PUBLIC_KEY", self.owner), patch.object(AUTH, "STATE_ROOT", self.state), \
             patch.object(AUTH, "moment", side_effect=lambda now=None: clock[0] if now is None else now), \
             patch.object(AUTH, "release_context", side_effect=context), \
             patch.object(AUTH, "protected_dispatch", side_effect=dispatch), \
             patch.object(AUTH, "load_owner_key", side_effect=lambda path, **_kw: real_key(path, allow_test_root=True)), \
             patch.object(AUTH, "issue_request", side_effect=lambda context, phase, **kw: real_issue(
                 context, phase, state_root=self.state, public_key=self.owner, now=clock[0],
                 attempt_id=kw.get("attempt_id"), allow_test_root=True)), \
             patch.object(AUTH, "consume_request", side_effect=lambda packet, **_kw: real_consume(
                 packet, state_root=self.state, public_key=self.owner, now=clock[0], allow_test_root=True)), \
             patch.object(AUTH, "finish_request", side_effect=lambda attempt, phase, result, **_kw: real_finish(
                 attempt, phase, result, state_root=self.state, allow_test_root=True)):
            stage_request = AUTH.operation("issue-stage", self.root)
            stage_payload = stage_request["payload"]
            signed["PRE_STAGE"] = self.packet(stage_payload)
            clock[0] += timedelta(minutes=1)
            staged = AUTH.operation("stage", self.root, packet=signed["PRE_STAGE"])
            self.assertEqual("OWNER_WEBSITE_STAGE_VERIFIED", staged["status"])
            self.assertEqual(self.observation["website"], website)
            with self.assertRaises(AUTH.Hold):
                AUTH.operation("stage", self.root, packet=signed["PRE_STAGE"])
            clock[0] += timedelta(minutes=2)
            activation_request = AUTH.operation("issue-activation", self.root, stage_receipt=stage_receipt,
                                                attempt_id=stage_payload["attempt_id"])
            activation_payload = activation_request["payload"]
            self.assertEqual(stage_payload["attempt_id"], activation_payload["attempt_id"])
            self.assertNotEqual(stage_payload["nonce"], activation_payload["nonce"])
            self.assertGreater(AUTH.utc_time(activation_payload["issued_at"]), AUTH.utc_time(stage_payload["issued_at"]))
            signed["PRE_ACTIVATE"] = self.packet(activation_payload)
            clock[0] += timedelta(minutes=1)
            activated = AUTH.operation("activate", self.root, packet=signed["PRE_ACTIVATE"], stage_receipt=stage_receipt)
            self.assertEqual("OWNER_WEBSITE_ACTIVATION_VERIFIED", activated["status"])
            for result in (staged, activated):
                self.assertIs(result["financial_release_authorized"], False)
                self.assertIs(result["custody_authorized"], False)
                self.assertIs(result["observation_independent"], False)
                self.assertIs(result["wolo_source_p1_open"], True)
            with self.assertRaises(AUTH.Hold):
                AUTH.operation("activate", self.root, packet=signed["PRE_ACTIVATE"], stage_receipt=stage_receipt)
            for packet in signed.values():
                with self.assertRaises(AUTH.Hold):
                    AUTH.consume_request(packet, state_root=self.state, public_key=self.owner)
        with closing(sqlite3.connect(self.state / "owner-v3.sqlite3")) as cx:
            rows = cx.execute("SELECT attempt_id,phase,state,result FROM requests_v3 ORDER BY phase").fetchall()
        self.assertEqual({"PRE_STAGE", "PRE_ACTIVATE"}, {row[1] for row in rows})
        self.assertTrue(all(row[0] == stage_payload["attempt_id"] and row[2] == "COMPLETE" for row in rows))
        self.assertEqual({"STAGED", "CERTIFIED"}, {json.loads(row[3])["status"] for row in rows})
        self.assertEqual(["stage", "activate"], calls)
        self.assertEqual(AUTH.MAIN_SOURCE_SHA, website["source_sha"])
        self.assertEqual(stage_result["staged_build_id"], website["build_id"])
        self.assertEqual(immutable, self.observation["immutable"])
        self.assertFalse(locked)

    def test_signing_refuses_plaintext_or_nonprivate_or_git_stored_credentials(self):
        request = {"schema": 3, "policy": AUTH.POLICY_ID, "payload": self.issue()}
        approved = {"candidate": AUTH.MAIN_SOURCE_SHA, "controller": self.context["controller_commit_sha"],
                    "manifest": AUTH.MANIFEST_SHA256, "phase": "PRE_STAGE"}
        folder = self.root / "private-signing"
        folder.mkdir(mode=0o700)
        secret = folder / "encrypted-fixture.key"
        # An ephemeral fixture password is supplied only while constructing a
        # synthetic encrypted key. No sign/decrypt operation is performed here.
        subprocess.run(["openssl", "pkcs8", "-topk8", "-in", str(self.private["owner"]),
                        "-v2", "aes-256-cbc", "-passout", "pass:OFFLINE_FIXTURE_ONLY",
                        "-out", str(secret)], check=True, capture_output=True, timeout=10)
        secret.chmod(0o600)
        folder.chmod(0o755)
        with self.assertRaises(AUTH.Hold):
            AUTH.sign_request(request, secret, **approved)
        folder.chmod(0o700)
        subprocess.run(["git", "init", "-q", str(folder)], check=True, capture_output=True, timeout=10)
        with self.assertRaises(AUTH.Hold):
            AUTH.sign_request(request, secret, **approved)
        # Unencrypted fixture material stays outside Git, but is still not an
        # admissible owner CLI credential and must never reach a signing call.
        real_run = subprocess.run
        def bounded_run(args, **kwargs):
            self.assertNotEqual(["openssl", "dgst"], args[:2], "plaintext credential reached signer")
            return real_run(args, **kwargs)
        with patch.object(AUTH.subprocess, "run", side_effect=bounded_run):
            with self.assertRaises(AUTH.Hold):
                AUTH.sign_request(request, self.private["owner"], **approved)


if __name__ == "__main__":
    unittest.main()
