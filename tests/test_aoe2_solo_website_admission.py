"""Adversarial Q19 solo-owner website admission tests; no live release."""
from __future__ import annotations

import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import sys
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_solo_website_admission.py"
if str(SCRIPT.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("solo_website_admission", SCRIPT)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class SoloWebsiteAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 30, 8, 0, tzinfo=timezone.utc)
        self.gate = {
            "schema": 2, "kind": "gate-receipt", "status": "PASS",
            "mode": "committed", "target_sha": M.W1, "base_sha": M.OLD,
            "scope_sha256": "d" * 64,
            "changed_files": ["app/admin/storage-os/page.tsx"],
            "required_commands": ["diff-check"],
            "commands": [{"label": "diff-check", "returncode": 0}],
        }
        self.gate_raw = M.canonical(self.gate)
        self.manifest = {
            "schema": 1, "kind": "aoe2war-release-manifest",
            "release_sha": M.W1, "previous_production_sha": M.OLD,
            "scope_sha256": "d" * 64, "migration_paths": [],
            "changed_files": ["app/admin/storage-os/page.tsx"],
            "gate": {"status": "PASS",
                     "receipt_sha256": M.digest(self.gate_raw)},
            "policy": {
                "exact_sealed_commit": True, "build_beside_live": True,
                "preserve_rollback": True,
                "prove_internal_and_public": True,
                "wolo_mutation_allowed": False,
            },
        }
        self.manifest_raw = M.canonical(self.manifest)
        self.host = {
            "origin": "AUTHENTICATED_HEL1_ROOT_SSH",
            "host": "ubuntu-4gb-hel1-11",
            "source_sha": M.OLD, "build_id": "CURRENTBUILD123",
            "rollback_build_id": "ROLLBACKBUILD123",
            "rollback_available": True, "web_service": "active",
            "observed_at": "2026-10-30T08:00:00Z",
            "free_bytes": 34 * 2**30, "effective_used_pct": 86.1,
            "finish_used_pct": 89.0, "doctor_p0": 0, "doctor_p1": 0,
            "doctor_signed": True, "recovery_verified_classes": M.CLASSES,
            "independent_restore_verdict": "PHYSICALLY_ACCEPTED",
            "wolo_finance_p1": "HOLD", "financial_movement_authorized": False,
            "finance_fingerprint_sha256": "e" * 64,
            "protected_8092_pid": 2001, "protected_8093_pid": 2002,
        }
        self.challenge = {
            "policy": M.POLICY, "phase": "PRE_STAGE",
            "attempt_id": "1" * 64, "nonce": "2" * 64,
            "lease_id": "3" * 64, "candidate_sha": M.W1,
        }
        self.payload = {
            "phase": "PRE_STAGE", "train": "W1",
            "candidate_sha": M.W1, "previous_sha": M.OLD,
            "attempt_id": "1" * 64, "nonce": "2" * 64, "lease_id": "3" * 64,
            "issued_at": "2026-10-30T07:59:00Z",
            "expires_at": "2026-10-30T08:03:00Z",
            "manifest_sha256": M.digest(self.manifest_raw),
            "gate_sha256": M.digest(self.gate_raw),
            "scope_sha256": "d" * 64,
            "active_build_id": "CURRENTBUILD123",
            "rollback_build_id": "ROLLBACKBUILD123",
            "host_observation_sha256": M.digest(M.canonical(self.host)),
            "finance_fingerprint_sha256": "e" * 64,
            "financial_movement_authorized": False,
            "custody_authorized": False, "migration_paths": [],
            "stage_receipt_sha256": None, "staged_build_id": None,
            "pre_stage_packet_sha256": None,
        }
        self.signed = {
            "schema": 1, "policy": M.POLICY, "payload": self.payload,
            "signature_base64": "unused-by-policy-fixture",
        }

    def run_check(self, *, signed=None, manifest_raw=None, gate_raw=None,
                  host=None, challenge=None, previous_stage=None, stage_receipt=None):
        # This test isolates policy; separate test exercises actual RSA signature.
        # For a targeted HOST policy failure, bind the mock owner's digest to
        # that exact host input. Otherwise we'd only test digest mismatch.
        if host is not None and signed is None:
            signed = copy.deepcopy(self.signed)
            signed["payload"]["host_observation_sha256"] = M.digest(M.canonical(host))
        # Unit fixtures mock the PINNED host module at its narrow I/O boundary.
        # Production callers cannot inject observations into verify_inputs.
        with patch.object(M, "verify_owner_signature", return_value=None), \
             patch.object(M, "read_authenticated_hel1",
                          return_value=(self.host if host is None else host,
                                        self.challenge if challenge is None else challenge)):
            return M.verify_inputs(
                self.signed if signed is None else signed,
                self.manifest_raw if manifest_raw is None else manifest_raw,
                self.gate_raw if gate_raw is None else gate_raw,
                previous_stage=previous_stage,
                stage_receipt=stage_receipt, now=self.now)

    def expect_hold(self, **changes):
        with self.assertRaises(M.Hold):
            self.run_check(**changes)

    def signed_with(self, **fields):
        signed = copy.deepcopy(self.signed)
        signed["payload"].update(fields)
        return signed

    def host_with(self, **fields):
        host = copy.deepcopy(self.host)
        host.update(fields)
        return host

    def test_passing_inputs_are_not_release_authority(self):
        result = self.run_check()
        self.assertEqual(result["status"], "INPUTS_VERIFIED_ONLY_NOT_AUTHORIZED")
        self.assertIs(result["financial_release_authorized"], False)
        self.assertIs(result["host_lease_and_nonce_consumed"], False)

    def test_gate_status_fail_rejected_even_when_hash_signed(self):
        gate = copy.deepcopy(self.gate)
        gate["status"] = "FAIL"
        raw = M.canonical(gate)
        manifest = copy.deepcopy(self.manifest)
        manifest["gate"]["receipt_sha256"] = M.digest(raw)
        manifest_raw = M.canonical(manifest)
        signed = self.signed_with(
            gate_sha256=M.digest(raw),
            manifest_sha256=M.digest(manifest_raw),
        )
        self.expect_hold(signed=signed, gate_raw=raw, manifest_raw=manifest_raw)

    def test_gate_command_failure_rejected_even_when_status_pass(self):
        gate = copy.deepcopy(self.gate)
        gate["commands"][0]["returncode"] = 1
        raw = M.canonical(gate)
        manifest = copy.deepcopy(self.manifest)
        manifest["gate"]["receipt_sha256"] = M.digest(raw)
        manifest_raw = M.canonical(manifest)
        signed = self.signed_with(
            gate_sha256=M.digest(raw),
            manifest_sha256=M.digest(manifest_raw),
        )
        self.expect_hold(signed=signed, gate_raw=raw, manifest_raw=manifest_raw)

    def test_source_closure_cannot_be_inferred_from_prisma_only(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["changed_files"].append("lib/financialTransfer.ts")
        manifest_raw = M.canonical(manifest)
        signed = self.signed_with(manifest_sha256=M.digest(manifest_raw))
        self.expect_hold(signed=signed, manifest_raw=manifest_raw)

    def test_candidate_substitution(self):
        self.expect_hold(signed=self.signed_with(candidate_sha=M.POST_W1))

    def test_missing_authenticated_host_reader(self):
        with patch.object(M, "read_authenticated_hel1",
                          side_effect=M.ObserverHold("PINNED_ROOT_SSH_UNAVAILABLE")):
            with self.assertRaises(M.Hold):
                M.verify_inputs(self.signed, self.manifest_raw, self.gate_raw,
                                now=self.now)

    def test_caller_cannot_supply_bogus_authenticated_host(self):
        with self.assertRaises(TypeError):
            M.verify_inputs(self.signed, self.manifest_raw, self.gate_raw,
                            lambda: (self.host, self.challenge), now=self.now)

    def test_live_capacity_below_88_hold(self):
        self.expect_hold(host=self.host_with(effective_used_pct=92.563))

    def test_live_free_space_below_30_hold(self):
        self.expect_hold(host=self.host_with(free_bytes=21 * 2**30))

    def test_six_restores_partial_hold(self):
        self.expect_hold(host=self.host_with(recovery_verified_classes=M.CLASSES[:5]))

    def test_doctor_p1_hold(self):
        self.expect_hold(host=self.host_with(doctor_p1=1))

    def test_finance_movement_forbidden(self):
        self.expect_hold(signed=self.signed_with(financial_movement_authorized=True))

    def test_finance_fingerprint_drift_hold(self):
        self.expect_hold(host=self.host_with(finance_fingerprint_sha256="f" * 64))

    def test_replay_nonce_or_lease_mismatch(self):
        challenge = copy.deepcopy(self.challenge)
        challenge["nonce"] = "9" * 64
        self.expect_hold(challenge=challenge)

    def test_host_receipt_expired(self):
        self.expect_hold(host=self.host_with(observed_at="2026-10-30T07:50:00Z"))

    def test_phase_expired(self):
        signed = self.signed_with(expires_at="2026-10-30T07:59:30Z")
        self.expect_hold(signed=signed)

    def test_manifest_raw_tamper(self):
        self.expect_hold(manifest_raw=self.manifest_raw + b" ")

    def test_migration_rejected_even_with_matching_manifest(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["migration_paths"] = ["prisma/migrations/secret.sql"]
        raw = M.canonical(manifest)
        signed = self.signed_with(manifest_sha256=M.digest(raw))
        self.expect_hold(signed=signed, manifest_raw=raw)

    def test_pre_stage_cannot_invent_build(self):
        self.expect_hold(signed=self.signed_with(staged_build_id="STAGEDBUILD123"))

    def test_activate_requires_real_stage_receipt(self):
        signed = self.signed_with(phase="PRE_ACTIVATE")
        challenge = copy.deepcopy(self.challenge)
        challenge["phase"] = "PRE_ACTIVATE"
        self.expect_hold(signed=signed, challenge=challenge)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaises(M.Hold):
            M.parse(b'{"phase":"PRE_STAGE","phase":"PRE_ACTIVATE"}')

    def test_post_w1_wrong_predecessor_refused(self):
        signed = self.signed_with(train="POST_W1", candidate_sha=M.POST_W1)
        self.expect_hold(signed=signed)

    def test_owner_rsa_signature_validates_and_tampering_fails(self):
        if not shutil.which("openssl"):
            self.skipTest("OpenSSL binary unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            private, public = Path(tmp) / "private.pem", Path(tmp) / "public.pem"
            data, signature = Path(tmp) / "payload", Path(tmp) / "signature"
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA",
                            "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(private)],
                           check=True, capture_output=True)
            subprocess.run(["openssl", "pkey", "-in", str(private), "-pubout",
                            "-out", str(public)], check=True, capture_output=True)
            data.write_bytes(M.DOMAIN + M.canonical(self.payload))
            subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(private),
                            "-out", str(signature), str(data)],
                           check=True, capture_output=True)
            envelope = {
                "schema": 1, "policy": M.POLICY, "payload": self.payload,
                "signature_base64": base64.b64encode(signature.read_bytes()).decode(),
            }
            with patch.object(M, "OPENSSL", "openssl"), patch.object(
                    M, "trusted_owner_public", return_value=None):
                M.verify_owner_signature(envelope, key=public)
                changed = copy.deepcopy(envelope)
                changed["payload"]["nonce"] = "a" * 64
                with self.assertRaises(M.Hold):
                    M.verify_owner_signature(changed, key=public)


if __name__ == "__main__":
    unittest.main()
