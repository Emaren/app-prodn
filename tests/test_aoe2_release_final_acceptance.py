"""Adversarial read-only release acceptance contracts. Fixtures are NEVER production proof."""
from __future__ import annotations
import contextlib
from io import StringIO
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import aoe2_release_final_acceptance as a

SHA = "a" * 40
BUILD = "build_1234567"
HEX = "b" * 64


def args(out):
    return types.SimpleNamespace(expected_sha=SHA, expected_build_id=BUILD,
        expected_version="v123", activation_directory="/not/a/real/receipt",
        native_before="/not/a/real/native-pre",
        native_after="/not/a/real/native-post",
        d_artifact_receipt="/not/a/real/d-approval",
        d_public_key="/not/a/real/key", d_spki_sha256=HEX, out=out)


def report(phase, at, fingerprint):
    return ({
        "phase": phase, "attempt_id": "attempt-abc",
        "observed_at": at,
        "finance": {
            "protected": {
                "8092": {"pid": 1001, "start_time_ticks": 7777},
                "8093": {"pid": 1002, "start_time_ticks": 8888},
                "writers": {"hd_sha256": fingerprint},
            },
            "financial_movement_authorized": False
        }
    }, fingerprint)


class FinalAcceptanceTests(unittest.TestCase):
    def run_case(self, before=None, after=None, d=True, f=True, host=True):
        with tempfile.TemporaryDirectory() as root:
            file = str(Path(root) / "result.json")
            with mock.patch.object(a, "host_check", return_value=(
                {"source_sha": SHA, "next_build_id": BUILD, "build_version": "v123"}
                if host else None)), mock.patch.object(
                a, "receipt_check", side_effect=(
                    None if f else a.Hold("F_DURABLE_RECEIPT_HOLD")
                ), return_value={"stage_sha256": HEX, "artifact_sha256": HEX,
                                 "certificate_sha256": HEX}), mock.patch.object(
                a, "native_signed_report", side_effect=[
                    before or report("PRE_ACTIVATE", "2026-10-30T00:00:00Z", "1" * 64),
                    after or report("POST_ACTIVATE", "2026-10-30T00:02:00Z", "2" * 64)
                ]), mock.patch.object(a, "verify_d_artifact",
                    side_effect=None if d else a.Hold("D_SIGNATURE_HOLD"),
                    return_value=HEX), contextlib.redirect_stdout(StringIO()):
                status = a.run_acceptance(args(file))
            return status, json.loads(Path(file).read_text())

    def test_no_production_claim_when_browser_unexecuted(self):
        rc, evidence = self.run_case()
        self.assertEqual(rc, 2)  # signer test fixtures do not imply continuity
        self.assertEqual(evidence["browser_acceptance"],
                         "NOT_EXECUTED_BY_THIS_HOST_CHECK")
        self.assertEqual(evidence["status"], "HOLD")
        self.assertEqual(evidence["source"], "HEL1_OPERATOR_READ_ONLY_NATIVE")

    def test_replayed_native_snapshot_rejected(self):
        same = report("PRE_ACTIVATE", "2026-10-30T00:00:00Z", "1" * 64)
        _, e = self.run_case(before=same, after=same)
        self.assertEqual(e["checks"]["protected_writers_full_identity_continuity"]["status"], "HOLD")
        self.assertIn("NATIVE_BEFORE_AFTER_PHASE_OR_REPLAY",
                      e["checks"]["protected_writers_full_identity_continuity"]["code"])

    def test_writer_change_rejected(self):
        before = report("PRE_ACTIVATE", "2026-10-30T00:00:00Z", "1" * 64)
        after = report("POST_ACTIVATE", "2026-10-30T00:02:00Z", "2" * 64)
        _, e = self.run_case(before=before, after=after)
        self.assertIn("PROTECTED_WRITER_PROCESS_IDENTITY_DRIFT",
                      e["checks"]["protected_writers_full_identity_continuity"]["code"])

    def test_d_artifact_signature_missing_rejected(self):
        before = report("PRE_ACTIVATE", "2026-10-30T00:00:00Z", "1" * 64)
        after = report("POST_ACTIVATE", "2026-10-30T00:02:00Z", "1" * 64)
        # Distinct native receipt hashes, not repeated same pre/post.
        after = (after[0], "2" * 64)
        rc, e = self.run_case(before=before, after=after, d=False)
        self.assertEqual(rc, 2)
        self.assertEqual(e["checks"]["d_independent_artifact_receipt"]["status"], "HOLD")
        self.assertIn("D_SIGNATURE_HOLD", e["checks"]["d_independent_artifact_receipt"]["code"])

    def test_f_unverified_activation_rejected(self):
        rc, e = self.run_case(f=False)
        self.assertEqual(rc, 2)
        self.assertEqual(e["checks"]["f_durable_activation_artifact_rollback"]["status"], "HOLD")

    def test_pass_is_conditional_on_all_signed_real_proofs(self):
        before = report("PRE_ACTIVATE", "2026-10-30T00:00:00Z", "1" * 64)
        after = report("POST_ACTIVATE", "2026-10-30T00:02:00Z", "1" * 64)
        after = (after[0], "2" * 64)
        rc, e = self.run_case(before=before, after=after)
        self.assertEqual(rc, 0)
        self.assertEqual(e["status"], "PASS")
        self.assertEqual(e["browser_acceptance"], "NOT_EXECUTED_BY_THIS_HOST_CHECK")
        # This is mocked unit contract only; NEVER a live runtime acceptance.

    def test_duplicate_cert_property_rejected(self):
        with self.assertRaisesRegex(a.Hold, "F_CERT_DUPLICATE_FIELD"):
            a.cert_values(b"status=CERTIFIED\nstatus=CERTIFIED\n")

    def test_unsigned_empty_provenance_rejected(self):
        with mock.patch.object(a, "native_file", return_value=b'{"candidate_sha":"' +
                               SHA.encode() + b'","finance":{}}'):
            with self.assertRaisesRegex(a.Hold, "NATIVE_SIGNATURE_HOLD"):
                a.native_signed_report("/some/path", SHA, "AFTER")

    def test_d_artifact_bad_pin_rejected(self):
        with self.assertRaisesRegex(a.Hold, "D_KEY_PIN_ABSENT"):
            a.verify_d_artifact("/bad", "/bad", "NOT_A_REAL_PIN",
                                SHA, BUILD, HEX, HEX)


if __name__ == "__main__":
    unittest.main()
