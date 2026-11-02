"""V4 NameError recovery: focused native witness and no-replay contracts."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
def load(name,relative):
    spec=importlib.util.spec_from_file_location(name,ROOT/relative)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
s=load("v4_root","scripts/r25_c_start_recovery_v4_root.py")
mac=load("v4_mac","scripts/r25_c_start_recovery_v4_mac.py")
w=load("v4_witness","scripts/r25_b_namespace_recovery_witness_v4.py")
WITNESS=ROOT/"scripts/r25_b_namespace_recovery_witness_v4.py"

class V4Recovery(unittest.TestCase):
    def test_fixed_witness_is_pinned_and_no_undefined_need(self):
        raw=WITNESS.read_bytes()
        self.assertEqual(s.V4_WITNESS_SHA,s.sha(raw))
        self.assertEqual(mac.V4_WITNESS_SHA,s.V4_WITNESS_SHA)
        self.assertEqual(len(raw),s.V4_WITNESS_SIZE)
        self.assertEqual(len(raw),mac.V4_WITNESS_SIZE)
        self.assertEqual(mac.V4_WITNESS_BLOB,mac.blob(raw))
        self.assertEqual(s.approved_v4_witness({"v4_witness_b64":base64.b64encode(raw).decode()}),raw)
        with self.assertRaisesRegex(s.Hold,"V4_WITNESS_SOURCE_REQUIRED"):
            s.approved_v4_witness({})
        with self.assertRaisesRegex(s.Hold,"V4_EXACT_REVIEWED_WITNESS_SOURCE_DRIFT"):
            s.approved_v4_witness({"v4_witness_b64":base64.b64encode(raw+b"x").decode()})
        with self.assertRaisesRegex(RuntimeError,"CANDIDATE_PID_REQUIRED"):
            w.runtime_private_run(0)

    def test_fixed_witness_mountinfo_and_pg_unix_socket_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            host=Path(temp)
            proc=host/"1234"
            (proc/"root/run").mkdir(parents=True)
            raw="100 90 0:50 / /run ro,nosuid,nodev - tmpfs tmpfs rw\n"
            (proc/"mountinfo").write_text(raw)
            self.assertTrue(w.verify_private_run_mountinfo(raw))
            original=Path
            with mock.patch.object(w.pathlib,"Path",side_effect=lambda q:host if q=="/proc" else original(q)):
                self.assertTrue(w.runtime_private_run(1234))
                (proc/"root/run/postgresql").mkdir()
                with self.assertRaisesRegex(RuntimeError,"HOST_POSTGRESQL_UNIX_SOCKET_EXPOSED"):
                    w.runtime_private_run(1234)
            with self.assertRaisesRegex(RuntimeError,"RUNTIME_PRIVATE_RUN_TMPFS_RO_NOT_PROVEN"):
                w.verify_private_run_mountinfo(raw.replace("ro,nosuid","rw,nosuid"))

    def test_exact_consumed_v1_v2_v3_failures_and_fresh_v4_journal(self):
        self.assertEqual(s.JOURNAL.name,"start-3031-v4")
        self.assertEqual(s.PREV_JOURNAL.name,"start-3031-v3")
        self.assertEqual(s.V2_JOURNAL.name,"start-3031-v2")
        self.assertEqual(s.V1_JOURNAL.name,"start-3031-v1")
        self.assertEqual(len({s.JOURNAL,s.PREV_JOURNAL,s.V2_JOURNAL,s.V1_JOURNAL}),4)
        self.assertEqual(s.V3_STARTED_SHA,"4a773aada3424f2669c30083ed202136da5d2a922d9cd2102128a975a7a20496")
        self.assertEqual(s.V3_STAGED_SHA,"dd16194827938b688fe27d1a1f4290142dc8f44f3789ba1664ba2d13d8ad200b")
        self.assertEqual(s.V3_HOLD_SHA,"53033a73172667a40344873e4d71e3813f208bfec91f77cc0a409fba65d263ae")
        with tempfile.TemporaryDirectory() as temp:
            exists=Path(temp)/"v4-started"
            exists.mkdir()
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",exists):
                with self.assertRaisesRegex(s.Hold,"V4_ALREADY_ATTEMPTED_NO_REPLAY"):
                    s.admit({})
            exists.rmdir()
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",exists),mock.patch.object(s,"root_file",return_value=b"forged"):
                with self.assertRaisesRegex(s.Hold,"CONSUMED_V1_V2_V3_JOURNAL_EXACT_BYTES_CHANGED"):
                    s.admit({})

    def test_fresh_one_use_owner_start_only_and_no_host_reinstall(self):
        plan={"schema":"aoe2war.r25.c.start-plan.v4","protected_before":{}}
        digest=s.sha(s.canonical(plan))
        nonce="a"*32
        valid="RECOVER-START-R25-3031-V4 "+nonce+" "+digest
        for bad in ({"nonce":"0"},{"owner_consent":"v3 consent"},{"plan_sha256":"b"*64}):
            payload={"plan_sha256":digest,"nonce":nonce,"owner_consent":valid,**bad}
            with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as created:
                with self.assertRaises(s.Hold):
                    s.start(payload)
                created.assert_not_called()
        root=(ROOT/"scripts/r25_c_start_recovery_v4_root.py").read_text()
        self.assertNotIn('exclusive_root_source(V3_DROPIN_PATH, approved_v3_dropin(payload))',root)
        self.assertNotIn('run(["/usr/bin/systemctl","daemon-reload"]',root)
        self.assertIn('witness.runtime_private_run(pid)',root)
        self.assertIn('v3hold.get("reason_type")=="NameError"',root)
        self.assertIn('"financial_authorized": False',root)
        self.assertIn('"public_cutover_authorized": False',root)
        for source in (root,(ROOT/"scripts/r25_c_start_recovery_v4_mac.py").read_text()):
            self.assertIn("R25_START_V4_OWNER_NONFINANCIAL_ACCEPT",source)
            self.assertIn("RECOVER-START-R25-3031-V4",source)
            self.assertIn("1116",source)

if __name__=="__main__":
    unittest.main()
