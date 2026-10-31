"""Synthetic shape/replay tests. Never claim test keys or receipts are native."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from datetime import datetime, timedelta, timezone

SPEC = importlib.util.spec_from_file_location(
    "producer_intake", Path(__file__).resolve().parents[1] /
    "scripts" / "aoe2_solo_website_producer_intake.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

TIME = datetime(2026, 10, 30, 23, 30, tzinfo=timezone.utc)
WHEN = TIME.isoformat(timespec="seconds").replace("+00:00", "Z")
ATTEMPT = "a" * 64
SHA = m.W1_SAFE


class IntakeTests(unittest.TestCase):
    def build(self, root, *, when=WHEN):
        folder = root / ATTEMPT / "PRE_STAGE"
        folder.mkdir(parents=True)
        for role in m.CLASSES:
            section = {"x": 1}
            if role == "host":
                rollback = {"previous_source_sha": "1" * 40}
                section = {"mount": {"x": 1,
                           "rollback_sha256": m.digest(m.canonical(rollback))},
                           "rollback": rollback}
            value = section["mount"] if role == "host" else section
            claim = {"producer": role, "candidate_sha": SHA, "attempt_id": ATTEMPT,
                     "phase": "PRE_STAGE", "host": m.HOST, "observed_at": when,
                     "content_sha256": m.digest(m.canonical(value))}
            obj = {"schema": "aoe2war.solo.native-issuer-input.v1",
                   "class": role, "section": section,
                   "receipt": {"payload": claim, "signature_base64": "TEST_NOT_SIGNATURE"}}
            (folder / (role + ".json")).write_bytes(m.canonical(obj))
        return folder

    def call(self, root, *, source=SHA, verifier=None):
        # Fixture verifier only simulates an already verified independently
        # enrolled F crypto authority. No real signature is generated here.
        checker = verifier if verifier is not None else lambda _: True
        with mock.patch.object(m, "root_directory"), \
             mock.patch.object(m, "sealed_file", side_effect=lambda p: p.read_bytes()):
            return m.verify_six(source, "PRE_STAGE", ATTEMPT,
                                source=root, verifier=checker, now=TIME)

    def rewrite(self, folder, role, transform):
        p = folder / (role + ".json")
        obj = json.loads(p.read_bytes())
        transform(obj)
        p.write_bytes(m.canonical(obj))

    def test_six_validly_scoped_inputs_pass_to_canonical_verifier_only(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.build(root)
            observed = []
            out = self.call(root, verifier=lambda report: observed.append(report) or True)
            self.assertEqual(set(out), set(m.CLASSES))
            self.assertEqual(set(observed[0]["receipt_provenance"]["signed_producers"]),
                             set(m.CLASSES))
            self.assertNotIn("status", observed[0])

    def test_frozen_unsafe_w1_denied_even_with_complete_inputs(self):
        with tempfile.TemporaryDirectory() as td:
            self.build(Path(td))
            with self.assertRaisesRegex(m.Hold, "NOT_EXACT_APPROVED_W1_SAFE_SOURCE"):
                self.call(Path(td), source=m.FROZEN_W1)

    def test_missing_role_cannot_publish(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            (folder / "recovery.json").unlink()
            with self.assertRaises(FileNotFoundError):
                self.call(Path(td))

    def test_wrong_attempt_and_phase_denied(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            self.rewrite(folder, "finance", lambda x:
                x["receipt"]["payload"].update({"attempt_id": "f" * 64}))
            with self.assertRaisesRegex(m.Hold, "PRODUCER_SECTION_SCOPE_OR_HASH"):
                self.call(Path(td))

    def test_future_or_expired_producer(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            for delta in (-121, 3):
                when = (TIME + timedelta(seconds=delta)).isoformat().replace("+00:00", "Z")
                self.rewrite(folder, "source", lambda x:
                    x["receipt"]["payload"].update({"observed_at": when}))
                with self.assertRaisesRegex(m.Hold, "STALE_OR_FUTURE_PRODUCER"):
                    self.call(Path(td))

    def test_six_observation_times_must_match(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            changed = (TIME - timedelta(seconds=1)).isoformat().replace("+00:00", "Z")
            self.rewrite(folder, "doctor", lambda x:
                x["receipt"]["payload"].update({"observed_at": changed}))
            with self.assertRaisesRegex(m.Hold, "INDEPENDENT_PRODUCER_TIME_SKEW"):
                self.call(Path(td))

    def test_host_rollback_signed_digest_cannot_be_swapped(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            self.rewrite(folder, "host", lambda x:
                x["section"]["rollback"].update({"previous_source_sha": "2" * 40}))
            with self.assertRaisesRegex(m.Hold, "UNBOUND_ROOT_ROLLBACK"):
                self.call(Path(td))

    def test_section_hash_drift_denied(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            self.rewrite(folder, "stage", lambda x:
                x["section"].update({"x": 2}))
            with self.assertRaisesRegex(m.Hold, "PRODUCER_SECTION_SCOPE_OR_HASH"):
                self.call(Path(td))

    def test_cryptographic_verifier_refusal_stays_hold(self):
        with tempfile.TemporaryDirectory() as td:
            self.build(Path(td))
            with self.assertRaisesRegex(m.Hold, "SIX_REAL_SIGNATURES_NOT_VERIFIED"):
                self.call(Path(td), verifier=lambda _: False)

    def test_broken_canonical_verifier_does_not_escape_hold(self):
        with tempfile.TemporaryDirectory() as td:
            self.build(Path(td))
            def denied(_):
                raise RuntimeError("signature source unavailable")
            with self.assertRaisesRegex(m.Hold, "CANONICAL_F_SIGNATURE_VERIFIER_REFUSED"):
                self.call(Path(td), verifier=denied)

    def test_duplicate_property_not_accepted(self):
        with self.assertRaisesRegex(m.Hold, "DUPLICATE_JSON_PROPERTY"):
            m.parse(b'{"a":1,"a":2}')

    def test_nonfinite_json_not_accepted(self):
        with self.assertRaisesRegex(m.Hold, "NONFINITE_JSON"):
            m.parse(b'{"a":NaN}')

    def test_envelope_unrecognized_fields_denied(self):
        with tempfile.TemporaryDirectory() as td:
            folder = self.build(Path(td))
            self.rewrite(folder, "finance", lambda x: x.update({"override": True}))
            with self.assertRaisesRegex(m.Hold, "INVALID_PRODUCER_ENVELOPE"):
                self.call(Path(td))

    def test_atomic_slot_replay_rejected_no_replacement(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            slots = {role: (role + "-opaque-signed-input").encode() for role in m.CLASSES}
            with mock.patch.object(m, "root_directory"):
                result = m.seal_once(slots, ATTEMPT, "PRE_STAGE", output=target)
                self.assertEqual(result["status"], "SIGNED_PRODUCER_INPUTS_SEALED_NOT_ADMITTED")
                self.assertFalse(result["release_authorized"])
                before = (target / ATTEMPT / "PRE_STAGE" / "host.json").read_bytes()
                with self.assertRaises(FileExistsError):
                    m.seal_once({k: b"tampered" for k in m.CLASSES},
                                ATTEMPT, "PRE_STAGE", output=target)
                self.assertEqual((target / ATTEMPT / "PRE_STAGE" / "host.json").read_bytes(),
                                 before)

    def test_partial_write_never_claims_complete_and_never_retries(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            slots = {role: role.encode() for role in m.CLASSES}
            slots.pop("source")
            with mock.patch.object(m, "root_directory"):
                with self.assertRaises(KeyError):
                    m.seal_once(slots, ATTEMPT, "PRE_STAGE", output=target)
                with self.assertRaises(FileExistsError):
                    m.seal_once({role: role.encode() for role in m.CLASSES},
                                ATTEMPT, "PRE_STAGE", output=target)

    def test_wrong_host_or_uninstalled_binary_blocks_main(self):
        with mock.patch.object(m.sys, "platform", "darwin"):
            self.assertEqual(m.main(["verify", "--candidate", SHA,
                                     "--phase", "PRE_STAGE", "--attempt", ATTEMPT]), 2)

    def test_invalid_attempt_hold(self):
        with self.assertRaisesRegex(m.Hold, "INVALID_ATTEMPT_OR_PHASE"):
            m.verify_six(SHA, "PRE_STAGE", "abcd", verifier=lambda _: True)

if __name__ == "__main__":
    unittest.main()
