"""DATA-only publisher protocol negative tests; no HEL1 or WEBSITE calls."""
import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
spec=importlib.util.spec_from_file_location("factory_data_publisher",ROOT/"scripts/aoe2_product_release.py")
R=importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)

class FactoryDataPublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.stage=Path(self.tmp.name)
        self.source="f5fcd0116c7b00092809abb047dfb01bdd5a1182"
        self.approval={"sourceSha":self.source,"runId":45065871693,
                       "buildId":"t_fBXEv9ztKR24XPbbKFb","proofSha256":"3"*64}
        data=b"run-specific-nonfinancial-data"
        with tarfile.open(self.stage/"runtime.tar.gz","w:gz") as t:
            item=tarfile.TarInfo("public/runtime.bin");item.size=len(data)
            t.addfile(item,io.BytesIO(data))
        self.proof={"runtime_archive_bytes":(self.stage/"runtime.tar.gz").stat().st_size,
                    "runtime_archive_sha256":hashlib.sha256(
                        (self.stage/"runtime.tar.gz").read_bytes()).hexdigest()}
        self.proofsha="3"*64
    def test_naturlow_hold_before_mkdir_or_rsync(self):
        def fake_ssh(cmd,**kw):
            if cmd.startswith("df -B1 "):
                return str(8_857_219_072 if " / |" in cmd else 32*1024**3)
            self.fail("No remote stage side effect allowed: "+cmd[:60])
        with patch.object(R,"ssh",side_effect=fake_ssh), \
             patch.object(R.subprocess,"run",side_effect=AssertionError("No rsync")):
            with self.assertRaisesRegex(RuntimeError,"ROOT_DATA_EXTRACT_AND_TRANSIENT_CAPACITY"):
                R.deliver(self.approval,self.stage,self.proof,self.stage/"log")
    def test_insufficient_data_hold_before_stage(self):
        def fake_ssh(cmd,**kw):
            if cmd.startswith("df -B1 "):
                return str(1024 if "HC_Volume" in cmd else 16*1024**3)
            self.fail("No remote mkdir or rsync allowed")
        with patch.object(R,"ssh",side_effect=fake_ssh), \
             patch.object(R.subprocess,"run",side_effect=AssertionError("No rsync")):
            with self.assertRaisesRegex(RuntimeError,"DATA_ARCHIVE_TRANSFER_CAPACITY"):
                R.deliver(self.approval,self.stage,self.proof,self.stage/"log")
    def test_uninstalled_data_namespace_fails_closed(self):
        def fake_ssh(cmd,**kw):
            if cmd.startswith("df -B1 "):
                return str(32*1024**3)
            if cmd.startswith("python3 -B -c "):
                return "HOLD_DATA_NAMESPACE_NOT_INSTALLED"
            self.fail("Unapproved remote operation: "+cmd[:60])
        with patch.object(R,"ssh",side_effect=fake_ssh), \
             patch.object(R.subprocess,"run",side_effect=AssertionError("No rsync")):
            with self.assertRaisesRegex(RuntimeError,"DATA_STAGE_TRUSTED_SOURCE_NOT_INSTALLED"):
                R.deliver(self.approval,self.stage,self.proof,self.stage/"log")
    def test_root_owned_frozen_stage_cannot_be_overwritten(self):
        def fake_ssh(cmd,**kw):
            if cmd.startswith("df -B1 "):
                return str(32*1024**3)
            if cmd.startswith("python3 -B -c ") and "PASS_BOUND_DATA_SOURCE" in cmd:
                return "PASS_BOUND_DATA_SOURCE_MOUNT_OWNER_STICKY_DIR"
            if cmd.startswith("umask 077; mkdir "):
                return "2064:0:0:700" # already promoted by root PREPARE
            self.fail("Unexpected operation before frozen-stage hold")
        with patch.object(R,"ssh",side_effect=fake_ssh), \
             patch.object(R.subprocess,"run",side_effect=AssertionError("No rsync")):
            with self.assertRaisesRegex(RuntimeError,"DATA_STAGE_UNTRUSTED_OR_ALREADY_FROZEN"):
                R.deliver(self.approval,self.stage,self.proof,self.stage/"log")
    def test_partial_rsync_failure_stops_before_root_prepare(self):
        def fake_ssh(cmd,**kw):
            if cmd.startswith("df -B1 "):return str(32*1024**3)
            if cmd.startswith("python3 -B -c ") and "PASS_BOUND_DATA_SOURCE" in cmd:
                return "PASS_BOUND_DATA_SOURCE_MOUNT_OWNER_STICKY_DIR"
            if cmd.startswith("umask 077; mkdir "):
                return "2064:1000:1000:700"
            if cmd.startswith("if test -e "):return ""
            self.fail("Unexpected follow-up command after failed rsync")
        with patch.object(R,"ssh",side_effect=fake_ssh), \
             patch.object(R.subprocess,"run",return_value=types.SimpleNamespace(returncode=23)), \
             patch.object(R,"event",return_value=None):
            with self.assertRaisesRegex(RuntimeError,"RSYNC_INTERRUPTED_RESUME_AVAILABLE"):
                R.deliver(self.approval,self.stage,self.proof,self.stage/"log")
    def test_protected_root_source_pin_checks_four_inputs(self):
        observed=[]
        def fake_ssh(cmd,root=False,**kw):
            observed.append((cmd,root))
            return "\n".join([R.CONTROLLER_SHA,R.PREPARE_SHA,
                              R.INSPECTOR_SHA,"0"*64])
        with patch.object(R,"ssh",side_effect=fake_ssh):
            with self.assertRaisesRegex(RuntimeError,"INSTALLED_ROOT_SOURCE_DRIFT"):
                R.root_pins()
        self.assertIn(R.DATA_HELPER,observed[0][0])
        self.assertTrue(observed[0][1])
    def test_manifest_output_cannot_suggest_root_controller_bypass(self):
        source=(ROOT/"docs/release/artifacts/aoe2war_prepare_product_manifest_v2.py").read_text()
        self.assertNotIn('print("DEPLOY_COMMAND"',source)
        self.assertNotIn("aoe2war_product_release_controller_v2.py release",source)
        self.assertIn("MANIFEST_RELEASE_HOLD",source)
        self.assertIn("USE_REVIEWED_M1_FACTORY_PUBLISHER_NO_DIRECT_CONTROLLER_COMMAND",source)
        self.assertEqual(R.CONTROLLER,"/root/aoe2war_product_release_controller_v3.py")
        self.assertIn('root_pins',R.controller.__code__.co_names)
        self.assertNotIn("v2.py",R.CONTROLLER)

    def test_frozen_atlas_identity_is_not_rewritten_by_transport(self):
        self.assertEqual(R.DATA_STAGE_ROOT,
           "/mnt/HC_Volume_105319120/aoe2war/we2-factory-artifact-stage-v1")
        self.assertEqual(R.DATA_STAGING_DEV,2064)
        self.assertIn("HC_Volume",R.DATA_STAGE_ROOT)
        self.assertEqual(R.ROOT_PREFERRED_FLOOR,7_598_334_817)
        self.assertEqual(R.ROOT_OBSERVED_TRANSIENT,1_497_374_720)
        self.assertNotIn("sql",R.HOST_DATA_PRECHECK.lower())
        self.assertNotIn("systemctl",R.HOST_DATA_PRECHECK.lower())
        self.assertNotIn("sudo",R.HOST_DATA_PRECHECK.lower())
        self.assertNotIn("mount -",R.HOST_DATA_PRECHECK.lower())

if __name__=="__main__":
    unittest.main(verbosity=2)
