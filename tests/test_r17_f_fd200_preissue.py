#!/usr/bin/env python3
"""R17 F: original-FD200 preissued attempt lifecycle; no native/funding actions."""
from __future__ import annotations
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from aoe2_solo_website_nonce_ledger import Journal,Hold,sha

SOURCE="a9525f46302edff88ed073743a7dfaed08be9e3e"
WHEN=datetime(2026,10,31,1,0,tzinfo=timezone.utc)

class RootPreissueContract(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base=pathlib.Path(self.tmp.name)
        state=base/"protected"
        state.mkdir(mode=0o700)
        lock=base/"release.lock"
        lock.write_bytes(b"FD200 test lock - NO live finance")
        lock.chmod(0o600)
        self.ledger=Journal(state=state,lock=lock,test_mode=True)

    def test_preissue_does_not_issue_owner_nonce_or_authorize_stage(self):
        record=self.ledger.preissue_stage(SOURCE,now=WHEN)
        self.assertEqual(record["status"],"ROOT_PREISSUED_NOT_AUTHORIZED")
        self.assertEqual(record["phase"],"PRE_STAGE")
        self.assertEqual(record["candidate_sha"],SOURCE)
        self.assertIs(record["financial_release_authorized"],False)
        self.assertEqual(len(record["attempt_id"]),64)
        self.assertTrue(self.ledger.name(record["attempt_id"],"PRE_STAGE","preissue").is_file())
        self.assertFalse(self.ledger.name(record["attempt_id"],"PRE_STAGE","issue").exists())
        self.assertEqual(self.ledger.read(record["attempt_id"],"PRE_STAGE","preissue"),record)

    def test_six_signers_can_receive_exact_reserved_attempt_before_issue(self):
        pre=self.ledger.preissue_stage(SOURCE,now=WHEN)
        attempt=pre["attempt_id"]
        challenge=self.ledger.issue("PRE_STAGE",SOURCE,attempt=attempt,
                                    now=WHEN+timedelta(seconds=30))
        self.assertEqual(challenge["attempt_id"],attempt)
        self.assertEqual(challenge["candidate_sha"],SOURCE)
        self.assertNotEqual(challenge["nonce"],attempt)
        self.assertEqual(self.ledger.read(attempt,"PRE_STAGE","preissue"),pre)

    def test_unannounced_or_forged_attempt_denied(self):
        with self.assertRaisesRegex(Hold,"PRE_STAGE_ROOT_RESERVATION_MISSING"):
            self.ledger.issue("PRE_STAGE",SOURCE,attempt="f"*64,now=WHEN)

    def test_wrong_source_binding_denied(self):
        pre=self.ledger.preissue_stage(SOURCE,now=WHEN)
        with self.assertRaisesRegex(Hold,"PRE_STAGE_ROOT_RESERVATION_INVALID_OR_EXPIRED"):
            self.ledger.issue("PRE_STAGE","1"*40,attempt=pre["attempt_id"],
                              now=WHEN+timedelta(seconds=1))

    def test_expired_preissue_never_becomes_owner_challenge(self):
        pre=self.ledger.preissue_stage(SOURCE,now=WHEN)
        with self.assertRaisesRegex(Hold,"PRE_STAGE_ROOT_RESERVATION_INVALID_OR_EXPIRED"):
            self.ledger.issue("PRE_STAGE",SOURCE,attempt=pre["attempt_id"],
                              now=WHEN+timedelta(minutes=10))

    def test_future_preissue_does_not_become_valid_early(self):
        pre=self.ledger.preissue_stage(SOURCE,now=WHEN)
        with self.assertRaisesRegex(Hold,"PRE_STAGE_ROOT_RESERVATION_INVALID_OR_EXPIRED"):
            self.ledger.issue("PRE_STAGE",SOURCE,attempt=pre["attempt_id"],
                              now=WHEN-timedelta(seconds=1))

    def test_parallel_outstanding_preissue_denied(self):
        self.ledger.preissue_stage(SOURCE,now=WHEN)
        with self.assertRaisesRegex(Hold,"another unexpired root-preissued attempt"):
            self.ledger.preissue_stage(SOURCE,now=WHEN+timedelta(seconds=2))

    def test_expired_reservation_is_immutable_not_reused(self):
        pre=self.ledger.preissue_stage(SOURCE,now=WHEN)
        again=self.ledger.preissue_stage(SOURCE,now=WHEN+timedelta(minutes=11))
        self.assertNotEqual(pre["attempt_id"],again["attempt_id"])
        self.assertTrue(self.ledger.name(pre["attempt_id"],"PRE_STAGE","preissue").is_file())
        with self.assertRaisesRegex(Hold,"PRE_STAGE_ROOT_RESERVATION_INVALID_OR_EXPIRED"):
            self.ledger.check_preissue_stage(SOURCE,pre["attempt_id"],
                                             WHEN+timedelta(minutes=11))

    def test_legacy_no_announcement_has_no_native_entrypoint(self):
        root=(pathlib.Path(__file__).resolve().parents[1]/"scripts"/"aoe2_solo_website_root_phase.py").read_text()
        engine=(pathlib.Path(__file__).resolve().parents[1]/"scripts"/"aoe2_solo_website_engine_v1.py").read_text()
        channel=(pathlib.Path(__file__).resolve().parents[1]/"scripts"/"aoe2_solo_website_command_channel.py").read_text()
        self.assertIn('ledger.check_preissue_stage(candidate,attempt,datetime.now(timezone.utc))',root)
        self.assertIn('phase=="PRE_STAGE"',root)
        self.assertIn('stage requires exact prior root-preissued attempt ID',root)
        self.assertIn('ROOT_PREISSUED_NOT_AUTHORIZED',engine)
        self.assertIn('choices=["preissue-stage","issue-stage"',engine)
        self.assertIn("one preissue OR issue per original FD200 lease",channel)
        self.assertIn('stage issue needs original root-preissued attempt',channel)

if __name__=="__main__":
    unittest.main()
