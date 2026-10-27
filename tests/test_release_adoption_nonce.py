"""Durable single-use Kingdom adoption REVIEW nonce tests; never dispatch."""
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import aoe2_release_adoption_nonce as journal
import aoe2_release_stage_adoption as adoption


class ReviewJournalTests(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory(prefix="adoption-review-nonce-")
        self.addCleanup(self.work.cleanup)
        self.root = Path(self.work.name) / "private-journal"
        self.root.mkdir(mode=0o700)
        self.packet = {
            "schema": 1, "policy": adoption.POLICY,
            "payload": {
                "kind": adoption.POLICY, "phase": "ADOPT_ALREADY_STAGED",
                "nonce": "n" * 32, "test_marker": "synthetic-review",
            },
            "signature": "synthetic-not-cryptographic",
        }

    def issue(self):
        return journal.issue_review_only(
            self.packet["payload"], state_root=self.root, test_root=True
        )

    def consume_with_stub(self, *, packet=None):
        with mock.patch.object(
            adoption, "verify_signed_adoption_review",
            return_value={"signed_packet_sha256": "b" * 64},
        ) as crypto:
            result = journal.consume_signed_review_once(
                packet or self.packet, {},
                state_root=self.root, test_root=True
            )
            self.assertEqual(crypto.call_count, 1)
            return result

    def test_issue_is_review_only_and_private_sqlite_exists(self):
        reply = self.issue()
        self.assertEqual(reply["status"], "OWNER_REVIEW_ISSUED_NOT_AUTHORIZED")
        self.assertFalse(reply["release_authorized"])
        path = self.root / journal.JOURNAL_NAME
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(str(path)) as cx:
            self.assertEqual(cx.execute(
                "SELECT state FROM adoption_reviews WHERE nonce=?",
                ("n" * 32,),
            ).fetchone(), ("ISSUED",))

    def test_signed_review_is_at_most_once_and_never_authorizes(self):
        self.issue()
        result = self.consume_with_stub()
        self.assertTrue(result["review_nonce_consumed"])
        self.assertFalse(result["release_authorized"])
        self.assertFalse(result["dispatch_enabled"])
        self.assertFalse(result["financial_release_authorized"])
        with self.assertRaisesRegex(adoption.Hold, "NO_RETRY"):
            self.consume_with_stub()

    def test_unissued_nonce_never_consumes(self):
        with self.assertRaisesRegex(adoption.Hold, "NONCE_UNKNOWN"):
            self.consume_with_stub()

    def test_changed_issued_payload_is_refused_without_crypto_call(self):
        self.issue()
        altered = {**self.packet, "payload": {
            **self.packet["payload"], "test_marker": "altered",
        }}
        with mock.patch.object(adoption, "verify_signed_adoption_review") as crypto:
            with self.assertRaisesRegex(adoption.Hold, "PAYLOAD_CHANGED"):
                journal.consume_signed_review_once(
                    altered, {}, state_root=self.root, test_root=True
                )
            crypto.assert_not_called()

    def test_duplicate_issue_refused_without_state_reset(self):
        self.issue()
        with self.assertRaises(sqlite3.IntegrityError):
            self.issue()
        self.consume_with_stub()
        with self.assertRaises(sqlite3.IntegrityError):
            self.issue()
        with self.assertRaisesRegex(adoption.Hold, "NO_RETRY"):
            self.consume_with_stub()

    def test_racing_consumers_cannot_double_claim(self):
        self.issue()
        observations = []
        lock = threading.Lock()
        start = threading.Barrier(3)
        def worker():
            start.wait()
            try:
                result = self.consume_with_stub()
                outcome = result["status"]
            except adoption.Hold as exc:
                outcome = str(exc)
            with lock:
                observations.append(outcome)
        a = threading.Thread(target=worker)
        b = threading.Thread(target=worker)
        a.start()
        b.start()
        start.wait()
        a.join(timeout=8)
        b.join(timeout=8)
        self.assertFalse(a.is_alive() or b.is_alive())
        self.assertEqual(
            observations.count("OWNER_REVIEW_CONSUMED_NO_DISPATCH"), 1
        )
        self.assertEqual(
            sum("NO_RETRY" in x for x in observations), 1
        )

    def test_invalid_private_directory_permissions_blocked(self):
        self.root.chmod(0o755)
        with self.assertRaisesRegex(adoption.Hold, "ROOT_PERMISSIONS"):
            self.issue()

    def test_journal_symlink_refused(self):
        target = Path(self.work.name) / "outside"
        target.write_text("do-not-modify")
        (self.root / journal.JOURNAL_NAME).symlink_to(target)
        with self.assertRaisesRegex(adoption.Hold, "JOURNAL_SYMLINK"):
            self.issue()
        self.assertEqual(target.read_text(), "do-not-modify")

    def test_explicit_cryptographic_verifier_failure_rolls_back_issue(self):
        self.issue()
        with mock.patch.object(
            adoption, "verify_signed_adoption_review",
            side_effect=adoption.Hold("OWNER_ADOPTION_SIGNATURE_INVALID")
        ):
            with self.assertRaisesRegex(adoption.Hold, "SIGNATURE_INVALID"):
                journal.consume_signed_review_once(
                    self.packet, {}, state_root=self.root, test_root=True
                )
        self.consume_with_stub()

    def test_there_is_no_release_dispatch_entrypoint(self):
        self.assertFalse(hasattr(journal, "activate"))
        self.assertFalse(hasattr(journal, "dispatch"))
        self.assertFalse(hasattr(journal, "release"))
        self.assertFalse(hasattr(journal, "send_wolo"))


if __name__ == "__main__":
    unittest.main()
