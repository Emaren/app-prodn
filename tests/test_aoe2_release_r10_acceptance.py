"""R10 adversarial source-contract tests. No host calls and NO production proof."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import types
from unittest import TestCase, main, mock
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import aoe2_release_r10_acceptance as a


class R10PostflightTests(TestCase):
    def test_exact_release_train_is_not_user_supplied(self):
        self.assertEqual(a.TRAIN["W1"],(a.W1,a.W1_PREVIOUS))
        self.assertEqual(a.TRAIN["POST_W1"],(a.POST_W1,a.W1))
        self.assertNotEqual(a.W1,a.POST_W1)

    def test_duplicate_evidence_is_rejected(self):
        with self.assertRaisesRegex(a.Hold,"DUPLICATE_EVIDENCE_KEY"):
            a.doc(b'{"status":"CERTIFIED","status":"NOT_CERTIFIED"}')
        with self.assertRaisesRegex(a.Hold,"F_CERT_DUPLICATE_OR_INVALID"):
            a.cert(b"status=CERTIFIED\nstatus=UNKNOWN\n")

    def test_no_unsigned_final_certification_or_rollback_proof(self):
        # The actual F source has NO root-sealed final cert or signed
        # independent durable-rollback drill. Both must remain hard HOLD.
        with mock.patch.object(a,"ordinary",side_effect=[b'{"schema":1}',b'status=CERTIFIED\n']):
            with self.assertRaises(a.Hold):
                a.original_and_cert({}, "1"*64,a.W1,a.W1_PREVIOUS,"build_X123","compiled",a.RECEIPTS/"receipt-123")
        src=Path(a.__file__).read_text()
        self.assertIn('F_ROOT_SEALED_FINAL_CERTIFICATE_MISSING',src)
        self.assertIn('F_NATIVE_SIGNED_DURABLE_ROLLBACK_DRILL_VERIFIER_REQUIRED',src)
        self.assertIn('DURABLE_ROLLBACK_DRILL_NOT_PROVEN',src)

    def test_root_evidence_symlinks_or_user_owners_not_accepted(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"fake.json"
            p.write_text('{"looks":"trusted"}')
            with self.assertRaisesRegex(a.Hold,"UNTRUSTED_EVIDENCE_ANCESTOR"):
                a.protected(p)
            alias=Path(td)/"link"
            alias.symlink_to(p)
            with self.assertRaisesRegex(a.Hold,"UNTRUSTED_EVIDENCE_ANCESTOR"):
                a.protected(alias)

    def test_fake_production_input_does_not_create_pass(self):
        with tempfile.TemporaryDirectory() as td:
            dest=Path(td)/"report.json"
            args=types.SimpleNamespace(train="W1",attempt="1"*64,
                build_id="build_12345678",compiled_version="compiled",
                activation_dir=str(a.RECEIPTS/"not-a-real-dir"),out=str(dest))
            with mock.patch.object(a,"host_identity",return_value={"fake":True}),\
                 mock.patch.object(a,"root_journal",return_value={"not":"verified"}),\
                 mock.patch.object(a,"native_identity",side_effect=a.Hold("NO_REAL_PRODUCER_SIGNATURES")):
                with contextlib.redirect_stdout(io.StringIO()):
                    rc=a.run(args)
            self.assertEqual(rc,2)
            rec=json.loads(dest.read_text())
            self.assertFalse(rec["production_certified"])
            self.assertEqual(rec["status"],"HOLD")
            self.assertEqual(rec["checks"]["B_C_E_D_signed_native_25_writers_and_8092_8093"]["verdict"],"HOLD")

    def test_wrong_host_does_not_probe_http(self):
        with mock.patch.object(a.socket,"gethostname",return_value="not-hel1"),\
             mock.patch.object(a.os,"geteuid",return_value=1000),\
             mock.patch.object(a,"web_version") as network:
            with self.assertRaisesRegex(a.Hold,"ROOT_HEL1_ONLY"):
                a.host_identity(a.W1,"build12345678","compiled")
            network.assert_not_called()

    def test_output_is_exclusive_not_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            out=Path(td)/"exists.json";out.write_text("original")
            args=types.SimpleNamespace(train="W1",attempt="1"*64,
                build_id="build12345678",compiled_version="compiled",
                activation_dir=str(a.RECEIPTS/"receipt"),out=str(out))
            with mock.patch.object(a,"host_identity",side_effect=a.Hold("NO_PRODUCTION")):
                with self.assertRaises(FileExistsError):
                    a.run(args)
            self.assertEqual(out.read_text(),"original")

    def test_real_signed_phase_required_not_fake_summary(self):
        j={"before":{"phase":"PRE_ACTIVATE","attempt_id":"1"*64,
                     "candidate_sha":a.W1,"observed_at":"2026-10-30T00:00:00Z"},
           "after":{"phase":"PRE_ACTIVATE","attempt_id":"1"*64,
                    "candidate_sha":a.W1,"observed_at":"2026-10-30T00:01:00Z"}}
        with mock.patch.dict("sys.modules",{
             "aoe2_solo_website_native_audit_adapter":mock.MagicMock(),
             "aoe2_solo_website_producer_receipts":mock.MagicMock()}):
            with self.assertRaisesRegex(a.Hold,"NATIVE_WRONG_PHASE"):
                a.native_identity(j,a.W1,"1"*64)


if __name__=="__main__":main()
