"""C/WE1 exact reviewed Scan OS source admission; no broad scripts exception."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("scan_product_boundary",ROOT/"scripts/product_boundary_guard.py")
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

class CScanOSSourceAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.context=tempfile.TemporaryDirectory()
        self.addCleanup(self.context.cleanup)
        self.root=Path(self.context.name)
        for name in ("scripts","tests","config"):
            (self.root/name).mkdir()
        for path in p.EXACT_C_SCAN_OS_HASHES:
            shutil.copyfile(ROOT/path,self.root/path)
        self.env=mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":p.EXACT_C_SCAN_OS_BRANCH})
        self.env.start();self.addCleanup(self.env.stop)
    def source(self,path):
        return p.authorize_changed_source(self.root,p.EXACT_C_SCAN_OS_BASE,path)
    def exact(self,changes=None,repo="Emaren/app-prodn",base=None,branch=None):
        return p.check_exact_c_scan_os_source(
            self.root,repo,branch or p.EXACT_C_SCAN_OS_BRANCH,
            base or p.EXACT_C_SCAN_OS_BASE,
            sorted(changes if changes is not None else p.EXACT_C_SCAN_OS_REQUIRED))
    def test_expected_branch_and_base(self):
        self.assertEqual(p.EXACT_C_SCAN_OS_BASE,"204bf5c37560dfd705ee0b46803eec3ad396b082")
        self.assertTrue(p.BRANCH.fullmatch(p.EXACT_C_SCAN_OS_BRANCH))
        self.assertEqual(self.source("scripts/scan_os.py"),"scripts/scan_os.py")
        self.assertIsNone(self.exact())
    def test_generic_scripts_remain_denied(self):
        with self.assertRaisesRegex(p.BoundaryHold,"UNREVIEWED_EXECUTABLE_SURFACE"):
            p.authorize_source("scripts/scan_os.py")
        for name in ("scripts/another_scanner.py","scripts/scanner.sh",
                     "scripts/storage_visual_private.py"):
            with self.assertRaises(p.BoundaryHold):
                self.source(name)
    def test_incorrect_branch_rejected(self):
        with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":"session-c/wrong-source"}):
            with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_WRONG_BRANCH"):
                self.source("scripts/scan_os.py")
    def test_incorrect_base_rejected(self):
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_WRONG_BASE"):
            p.authorize_changed_source(self.root,"f"*40,"scripts/scan_os.py")
    def test_changed_scope_rejects_extras_missing_files_and_wrong_repo(self):
        r=set(p.EXACT_C_SCAN_OS_REQUIRED)
        for changes in (r-{"scripts/scan_os.py"},r|{"scripts/arbitrary.py"},
                        r|{"prisma/README.md"}):
            with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_CHANGED_FILE_SET"):
                self.exact(changes)
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_SOURCE_REPO"):
            self.exact(repo="Emaren/other")
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_SOURCE_BASE"):
            self.exact(base="f"*40)
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_SOURCE_BRANCH"):
            self.exact(branch="session-c/unreviewed")
    def test_changed_content_rejected(self):
        for path in p.EXACT_C_SCAN_OS_HASHES:
            with self.subTest(path=path):
                f=self.root/path;b=f.read_bytes()
                f.write_bytes(b+b"\n#modified-source\n")
                with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_SHA256_DRIFT"):
                    self.exact()
                f.write_bytes(b)
    def test_script_symlink_and_hardlink_rejected(self):
        f=self.root/"scripts/scan_os.py"
        f.unlink();f.symlink_to(ROOT/"scripts/scan_os.py")
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_SYMLINK"):
            self.source("scripts/scan_os.py")
        f.unlink();shutil.copyfile(ROOT/"scripts/scan_os.py",f)
        os.link(f,self.root/"shared-link")
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_SINGLE_FILE"):
            self.source("scripts/scan_os.py")
    def test_no_automatic_execution_permissions(self):
        text=(ROOT/"scripts/scan_os.py").read_text()
        for denied in ("subprocess","os.system","paramiko","shutil.rmtree",
                       "socket.","delete(","unlink(","Popen("):
            self.assertNotIn(denied,text)
        self.assertIn("NOT_PROVEN_NO_SIGNED_RECEIPT_VERIFICATION",text)
        self.assertIn("PLAN_ONLY_NO_EXECUTION",text)

if __name__=="__main__":unittest.main()
