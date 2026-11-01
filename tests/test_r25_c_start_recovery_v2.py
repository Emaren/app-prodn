"""V2 recovery scope, exact source pins and non-replay. Mock-only."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("start_v2",ROOT/"scripts/r25_c_start_recovery_v2_root.py")
s=importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class RecoveryV2Tests(unittest.TestCase):
    def payload(self):
        return {
            "v2_witness_b64":base64.b64encode((ROOT/"scripts/r25_b_namespace_recovery_witness.py").read_bytes()).decode(),
            "v2_dropin_b64":base64.b64encode((ROOT/"deploy/r25-b-3031.namespace-recovery.dropin.conf").read_bytes()).decode(),
        }

    def test_source_pins_are_exact_and_fail_closed(self):
        src=self.payload()
        self.assertEqual(len(s.approved_v2_sources(src)),2)
        for field in src:
            with self.subTest(field=field):
                tampered=dict(src)
                raw=bytearray(base64.b64decode(src[field]))
                raw[3]^=1
                tampered[field]=base64.b64encode(raw).decode()
                with self.assertRaisesRegex(s.Hold,"V2_EXACT_REVIEWED_SOURCE_DRIFT"):
                    s.approved_v2_sources(tampered)
        with self.assertRaisesRegex(s.Hold,"V2_SOURCE_NOT_PRESENT"):
            s.approved_v2_sources({})

    def test_separate_one_use_journal_never_replays_v1(self):
        self.assertNotEqual(s.JOURNAL,s.PREV_JOURNAL)
        self.assertEqual(s.JOURNAL.name,"start-3031-v2")
        self.assertEqual(s.PREV_JOURNAL.name,"start-3031-v1")
        self.assertNotEqual(s.V2_WITNESS_PATH.name,"approved-runtime-prestart.py")
        self.assertEqual(s.NEW_UNIT,"aoe2hdbets-web-r24.service")
        self.assertEqual(s.OLD_PID,2625090)
        self.assertEqual(s.LOCK_ID,(2064,6185747,1000,0o644))

    def test_plan_only_requires_real_consumed_v1_receipts(self):
        prior={
          "started.json":{"status":"START_ENTERED_DO_NOT_RETRY",
                          "public_cutover_authorized":False},
          "hold.json":{"status":"HOLD_NO_REPLAY",
                       "reason_type":"ProcessLookupError",
                       "public_cutover_authorized":False},
        }
        def proof(path,*args):
            return json.dumps(prior[path.name]).encode()
        def native(args,*more,**kwargs):
            if args[:2]==["/usr/bin/systemctl","show"]:
                return b"ActiveState=failed\nMainPID=0\nResult=exit-code\n"
            self.fail("unexpected native call")
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            with mock.patch.object(s.sys,"platform","linux"), mock.patch.object(s.os,"geteuid",return_value=0),                 mock.patch.object(s.socket,"gethostname",return_value=s.HOST),                 mock.patch.object(s,"reviewed"),                 mock.patch.object(s,"JOURNAL",p/"v2"),                 mock.patch.object(s,"V2_WITNESS_PATH",p/"new-witness"),                 mock.patch.object(s,"V2_DROPIN_PATH",p/"new-overlay"),                 mock.patch.object(s,"C_AUDIT",p),                 mock.patch.object(s,"root_file",side_effect=proof),                 mock.patch.object(s,"run",side_effect=native),                 mock.patch.object(s,"candidate_port_present",return_value=False),                 mock.patch.object(s,"b_prestart",return_value=("historical-witness",{"status":"PASS"})),                 mock.patch.object(s,"c_build",return_value={"status":"BUILD_STAGED"}),                 mock.patch.object(s,"e_rollback",return_value={"status":"ACCEPTED"}),                 mock.patch.object(s,"protected_snapshot",return_value={"old":2625090}),                 mock.patch.object(s,"directory"),                 mock.patch.object(s.os,"mkdir") as mkdir:
                payload=self.payload()
                payload.update({"source_sha":"a"*40,"operator_sha256":"b"*64,
                                "review_body_sha256":"c"*64,"e_certificate":{}})
                _, plan=s.admit(payload)
                self.assertEqual(plan["schema"],"aoe2war.r25.c.start-plan.v2")
                self.assertEqual(plan["v2_witness_sha256"],s.V2_WITNESS_SHA)
                self.assertEqual(plan["v2_dropin_sha256"],s.V2_DROPIN_SHA)
                self.assertEqual(plan["protected_before"],{"old":2625090})
                mkdir.assert_not_called()
                # Bad old receipt is a hard block, never authorizing recovery.
                prior["hold.json"]["reason_type"]="OtherError"
                with self.assertRaisesRegex(s.Hold,"V1_CONSUMED_START_AND_HOLD_EVIDENCE_REQUIRED"):
                    s.admit(payload)
                mkdir.assert_not_called()

    def test_exact_scope_does_not_claim_public_or_financial_authority(self):
        text=(ROOT/"scripts/r25_c_start_recovery_v2_root.py").read_text()
        self.assertIn("public_cutover_authorized",text)
        self.assertIn("financial_authorized",text)
        self.assertIn("RECOVER-START-R25-3031-V2",text)
        self.assertIn("V2_GENUINE_B_PRESTART_REQUIRED",text)
        self.assertIn("witness.runtime_private_run(pid)",text)
        self.assertIn("V2_RECOVERY_ALREADY_ATTEMPTED_NO_REPLAY",text)
        self.assertNotIn("systemctl\",\"restart\"",text)
        self.assertNotIn('run(["/usr/bin/systemctl","start",OLD_UNIT]',text)

if __name__=="__main__":
    unittest.main()
