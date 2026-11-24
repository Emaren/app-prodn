"""WE2 source-only one-file root public publisher CAS and hostile preimage fixtures."""
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import stat
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"scripts/release/we2_factory_v3_public_publisher_reconcile_20261124.py"
SPEC=importlib.util.spec_from_file_location("we2_public_one_file_cas",SOURCE)
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class PublicV3OneFileTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name)
        original=subprocess.check_output([
            "git","-C",str(ROOT),"show",
            M.MAIN_SOURCE_BASE+":docs/release/artifacts/aoe2war_factory_public_status_v2.py"])
        corrected=(ROOT/"docs/release/artifacts/aoe2war_factory_public_status_v2.py").read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(),M.OLD_SHA)
        self.assertEqual(hashlib.sha256(corrected).hexdigest(),M.NEW_SHA)
        self.stage=self.base/"stage"
        self.stage.mkdir(mode=0o700)
        self.stage_file=self.stage/"aoe2war_factory_public_status_v2.py"
        self.stage_file.write_bytes(corrected)
        self.stage_file.chmod(0o600)
        self.publisher=self.base/"publisher.py"
        self.publisher.write_bytes(original)
        self.publisher.chmod(0o644)
        self.backup_dir=self.base/"backup"
        self.orig=self.backup_dir/"original-publisher-v2.py"
        self.receipt=self.backup_dir/"installed-receipt-v1.json"
        self.patchers=[
            patch.object(M,"STAGED_DIR",self.stage),
            patch.object(M,"STAGED",self.stage_file),
            patch.object(M,"PUBLISHER",self.publisher),
            patch.object(M,"BACKUP_DIR",self.backup_dir),
            patch.object(M,"BACKUP",self.orig),
            patch.object(M,"RECEIPT",self.receipt),
            patch.object(M,"host",return_value=None),
            patch.object(M,"syncdir",return_value=None),
            patch.object(M,"read_stable",side_effect=self.read_stable),
            patch.object(M,"trusted",side_effect=self.trusted_fixture),
            patch.object(M,"write_once",side_effect=self.write_once),
        ]
        for pt in self.patchers:
            pt.start()
            self.addCleanup(pt.stop)

    def trusted_fixture(self,p,owner,mode,regular=True):
        st=p.lstat()
        if p.is_symlink() or stat.S_IMODE(st.st_mode)!=mode or not (
                stat.S_ISREG(st.st_mode) if regular else stat.S_ISDIR(st.st_mode)):
            raise M.Hold("TEST_TRUSTED_INODE")
        return st

    def read_stable(self,p,owner,mode,maxbytes=200000):
        s=p.lstat()
        if p.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=mode:
            raise M.Hold("FIXTURE_INODE_OR_MODE")
        raw=p.read_bytes()
        if len(raw)>maxbytes:raise M.Hold("FIXTURE_SIZE")
        return raw

    def write_once(self,p,data,mode):
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
        try:os.write(fd,data);os.fchmod(fd,mode)
        finally:os.close(fd)

    def test_exact_preflight_and_initial_preimage(self):
        blob,state=M.preflight()
        self.assertEqual(state,M.OLD_SHA)
        self.assertEqual(hashlib.sha256(blob).hexdigest(),M.NEW_SHA)
        self.assertFalse(self.backup_dir.exists())

    def test_missing_owner_permission_denies_all_writes(self):
        with patch.dict(os.environ,{"WE2_OWNER_NATIVE_GUI_PUBLISHER_APPROVED":""}):
            with self.assertRaisesRegex(M.Hold,"OWNER_SOURCE_APPROVAL_REQUIRED"):
                M.install()
        self.assertEqual(hashlib.sha256(self.publisher.read_bytes()).hexdigest(),M.OLD_SHA)
        self.assertFalse(self.backup_dir.exists())

    def test_one_file_install_preserves_original_and_idempotent_receipt(self):
        with patch.dict(os.environ,{"WE2_OWNER_NATIVE_GUI_PUBLISHER_APPROVED":
                   "WE2_1498_ONE_FILE_PUBLICATION_ONLY"}):
            first=M.install()
            self.assertEqual(first["status"],"PASS_ONE_FILE_V3_PUBLIC_PUBLISHER_INSTALLED")
            self.assertEqual(hashlib.sha256(self.publisher.read_bytes()).hexdigest(),M.NEW_SHA)
            self.assertEqual(stat.S_IMODE(self.publisher.stat().st_mode),0o644)
            self.assertEqual(hashlib.sha256(self.orig.read_bytes()).hexdigest(),M.OLD_SHA)
            self.assertEqual(stat.S_IMODE(self.orig.stat().st_mode),0o400)
            receipt=self.receipt.read_bytes()
            second=M.install()
            self.assertEqual(second,first)
            self.assertEqual(self.receipt.read_bytes(),receipt)

    def test_bad_source_and_bad_original_cas_hold(self):
        self.stage_file.write_bytes(b"bad-candidate")
        with self.assertRaisesRegex(M.Hold,"EXACT_REVIEWED_PUBLIC_SOURCE"):
            M.preflight()
        self.stage_file.write_bytes((ROOT/"docs/release/artifacts/aoe2war_factory_public_status_v2.py").read_bytes())
        self.publisher.write_bytes(b"drift")
        with self.assertRaisesRegex(M.Hold,"ROOT_PUBLISHER_CAS_PREIMAGE"):
            M.preflight()

    def test_stage_symlink_and_mode_tampering_fail_closed(self):
        self.stage_file.chmod(0o644)
        with self.assertRaises(M.Hold):
            M.preflight()
        self.stage_file.chmod(0o600)
        old=self.stage_file.with_suffix(".old")
        self.stage_file.rename(old)
        self.stage_file.symlink_to(old)
        with self.assertRaises(M.Hold):
            M.preflight()

    def test_existing_wrong_backup_never_overwritten(self):
        self.backup_dir.mkdir(mode=0o700)
        self.orig.write_bytes(b"forged-original")
        self.orig.chmod(0o400)
        with self.assertRaisesRegex(M.Hold,"ORIGINAL_BACKUP_SHA"):
            M.preflight()
        self.assertEqual(hashlib.sha256(self.publisher.read_bytes()).hexdigest(),M.OLD_SHA)

    def test_source_constants_no_runtime_or_controller_paths(self):
        code=SOURCE.read_text()
        self.assertNotIn("systemctl stop",code)
        self.assertNotIn("systemctl restart",code)
        self.assertNotIn("release_controller",code)
        self.assertNotIn("unlink(JOURNAL",code)
        self.assertNotIn("shutil.rmtree",code)
        self.assertEqual(M.NINTH_SHA,"dfcf6e473e948c490d22c30e98814f3a8ec451359d3c9241dc754376e9592363")
        self.assertFalse(M.RECEIPT==M.PUBLISHER)

if __name__=="__main__":
    unittest.main()
