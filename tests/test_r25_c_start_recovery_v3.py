"""V3 one-use A01 recovery contracts. No live host mutations."""
import base64
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
s=load("r25_v3_root","scripts/r25_c_start_recovery_v3_root.py")
mac=load("r25_v3_mac","scripts/r25_c_start_recovery_v3_mac.py")
V3=ROOT/"deploy/r25-b-3031.prestart-host-mount-v3.dropin.conf"

class RecoveryV3Tests(unittest.TestCase):
    def test_new_one_use_journal_and_exact_previous_receipts(self):
        self.assertEqual(s.JOURNAL.name,"start-3031-v3")
        self.assertEqual(s.PREV_JOURNAL.name,"start-3031-v2")
        self.assertEqual(s.V1_JOURNAL.name,"start-3031-v1")
        self.assertEqual(len({s.JOURNAL,s.PREV_JOURNAL,s.V1_JOURNAL}),3)
        self.assertEqual(s.V1_STARTED_SHA,"cbb0e36523991cf39a8b7562268141ed8fbde5109d60d59abdcf16923e783a53")
        self.assertEqual(s.V2_HOLD_SHA,"1ad48d5a0419ed9c09e37b04653192386dbd044049b1553774668b23b6709863")
        self.assertNotEqual(s.JOURNAL,s.PREV_JOURNAL)

    def test_exact_source_binding_and_tampering(self):
        raw=V3.read_bytes()
        self.assertEqual(s.sha(raw),s.V3_DROPIN_SHA)
        self.assertEqual(len(raw),s.V3_DROPIN_SIZE)
        self.assertEqual(mac.V3_DROPIN_SHA,s.V3_DROPIN_SHA)
        self.assertEqual(mac.V3_DROPIN_SIZE,s.V3_DROPIN_SIZE)
        self.assertEqual(mac.blob(raw),mac.V3_DROPIN_BLOB)
        self.assertEqual(s.approved_v3_dropin({"v3_dropin_b64":base64.b64encode(raw).decode()}),raw)
        for candidate in (raw+b"\\n",raw.replace(b"ExecStartPre=+",b"ExecStartPre=-",1),raw.replace(b"--mount",b"--net",1)):
            with self.subTest(candidate=candidate[:30]):
                with self.assertRaises(s.Hold):
                    s.approved_v3_dropin({"v3_dropin_b64":base64.b64encode(candidate).decode()})
        with self.assertRaisesRegex(s.Hold,"V3_PINNED_SOURCE_REQUIRED"):
            s.approved_v3_dropin({})

    def test_private_run_and_exact_root_scope_survive(self):
        private=(ROOT/"deploy/r25-b-3031.namespace-recovery.dropin.conf").read_text()
        self.assertIn("TemporaryFileSystem=/run:ro",private)
        new=V3.read_text()
        self.assertIn("ExecStartPre=+/usr/bin/nsenter --target 1 --mount --",new)
        self.assertNotIn("TemporaryFileSystem=",new)
        self.assertNotIn("ExecStart=",new)
        self.assertNotIn("ReadWritePaths=",new)
        root=(ROOT/"scripts/r25_c_start_recovery_v3_root.py").read_text()
        self.assertIn("effective_unit_v3(witness)",root)
        self.assertIn("witness.runtime_private_run(pid)",root)
        self.assertNotIn("exclusive_root_source(V2_DROPIN_PATH,",root)
        self.assertNotIn("exclusive_root_source(V2_WITNESS_PATH,",root)
        self.assertIn("exclusive_root_source(V3_DROPIN_PATH,",root)

    def test_no_journal_for_missing_fresh_consent(self):
        plan={"protected_before":{"old":2625090},"schema":"aoe2war.r25.c.start-plan.v3"}
        digest=s.sha(s.canonical(plan))
        nonce="e"*32
        phrase="RECOVER-START-R25-3031-V3 "+nonce+" "+digest
        for diff in ({"owner_consent":"v2 consent"}, {"nonce":"bad"}, {"plan_sha256":"b"*64}):
            payload={"plan_sha256":digest,"nonce":nonce,"owner_consent":phrase,**diff}
            with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as created:
                with self.assertRaises(s.Hold):
                    s.start(payload)
                created.assert_not_called()

    def test_existing_or_corrupt_journal_refused_pre_start(self):
        with tempfile.TemporaryDirectory() as td:
            old=Path(td)/"already-started"
            old.mkdir()
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",old):
                with self.assertRaisesRegex(s.Hold,"V3_RECOVERY_ALREADY_ATTEMPTED_NO_REPLAY"):
                    s.admit({})
            old.rmdir()
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",old),mock.patch.object(s,"root_file",return_value=b"tampered"):
                with self.assertRaisesRegex(s.Hold,"CONSUMED_JOURNAL_EXACT_BYTES_CHANGED"):
                    s.admit({})

    def test_owner_v3_source_scope_and_no_funded_permissions(self):
        root=(ROOT/"scripts/r25_c_start_recovery_v3_root.py").read_text()
        launcher=(ROOT/"scripts/r25_c_start_recovery_v3_mac.py").read_text()
        for content in (root,launcher):
            self.assertIn("R25_START_V3_OWNER_NONFINANCIAL_ACCEPT",content)
            self.assertIn("RECOVERY_START_3031_V3_ONLY",content)
            self.assertIn("1115",content)
            self.assertNotIn("RECOVER-START-R25-3031-V2",content)
        self.assertIn('\"financial_authorized\": False',root)
        self.assertIn('\"public_cutover_authorized\": False',root)

if __name__=="__main__":
    unittest.main()
