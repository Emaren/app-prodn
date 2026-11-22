"""WE1 V2 exact source-only Scan OS + Organization OS admission tests.

This preserves the original merged V1 exact source contract. No generalized
scripts permission, host scan, root signer, scheduling or delete rights.
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "v2_product_guard",ROOT/"scripts/product_boundary_guard.py")
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class CScanLearningV2ExactAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.context=tempfile.TemporaryDirectory()
        self.addCleanup(self.context.cleanup)
        self.root=Path(self.context.name)
        for root in ("scripts","tests","config","docs"):
            (self.root/root).mkdir()
        for path in p.EXACT_C_SCAN_V2_PINS:
            shutil.copyfile(ROOT/path,self.root/path)
        self.env=mock.patch.dict(
            os.environ,{"BOUNDARY_BRANCH":p.EXACT_C_SCAN_V2_BRANCH})
        self.env.start()
        self.addCleanup(self.env.stop)

    def exact(self,changes=None,branch=None,base=None,repo="Emaren/app-prodn"):
        return p.check_exact_c_scan_v2_source(
            self.root,repo,branch or p.EXACT_C_SCAN_V2_BRANCH,
            base or p.EXACT_C_SCAN_V2_BASE,
            sorted(changes if changes is not None else
                   p.EXACT_C_SCAN_V2_REQUIRED))

    def test_pin_base_branch_and_unchanged_original_catalog(self):
        self.assertEqual(
            p.EXACT_C_SCAN_V2_BASE,
            "f833d7e633cee4b36f1427fa45d76081fa0796ef")
        self.assertEqual(p.EXACT_C_SCAN_V2_BRANCH,
                         "we1/scan-org-learning-source-20261122")
        self.assertEqual(
            p.EXACT_C_SCAN_V2_PINS["config/scan-os-catalog.v1.json"],
            p.EXACT_C_SCAN_OS_HASHES["config/scan-os-catalog.v1.json"])
        self.assertIsNone(self.exact())

    def test_each_new_script_is_exact_source_only(self):
        for path in ("scripts/scan_os.py",
                     "scripts/scan_os_learning.py",
                     "scripts/organization_os.py",
                     "scripts/scan_os_maturity.py"):
            with self.subTest(path=path):
                self.assertEqual(
                    p.authorize_changed_source(
                        self.root,p.EXACT_C_SCAN_V2_BASE,path),path)

    def test_arbitrary_other_script_still_denied(self):
        with self.assertRaises(p.BoundaryHold):
            p.authorize_changed_source(
                self.root,p.EXACT_C_SCAN_V2_BASE,
                "scripts/unknown_runtime_executor.py")
        with self.assertRaises(p.BoundaryHold):
            p.authorize_source("scripts/scan_os_learning.py")

    def test_base_and_branch_are_exact_not_wildcards(self):
        with self.assertRaisesRegex(p.BoundaryHold,"SCAN_V2_SOURCE_BASE"):
            self.exact(base="0"*40)
        with self.assertRaisesRegex(p.BoundaryHold,"SCAN_V2_SOURCE_BRANCH"):
            self.exact(branch="other/we1-scan")
        with self.assertRaisesRegex(p.BoundaryHold,"SCAN_V2_SOURCE_REPO"):
            self.exact(repo="Emaren/other")

    def test_no_missing_or_extra_changed_file_is_accepted(self):
        expected=set(p.EXACT_C_SCAN_V2_REQUIRED)
        for changed in (expected-{"scripts/scan_os_learning.py"},
                        expected|{"scripts/unreviewed.py"},
                        expected|{"prisma/schema.prisma"}):
            with self.subTest(changed=sorted(changed)):
                with self.assertRaisesRegex(
                    p.BoundaryHold,"SCAN_V2_CHANGED_FILE_SET"):
                    self.exact(changes=changed)

    def test_tampering_each_source_or_contract_fails(self):
        for path in p.EXACT_C_SCAN_V2_PINS:
            with self.subTest(path=path):
                f=self.root/path
                old=f.read_bytes()
                f.write_bytes(old+b"\nsource drift\n")
                with self.assertRaisesRegex(
                    p.BoundaryHold,"SCAN_V2_SHA256"):
                    self.exact()
                f.write_bytes(old)

    def test_symlink_swap_or_hardlink_denied(self):
        path="scripts/scan_os_learning.py"
        file=self.root/path
        file.unlink()
        file.symlink_to(ROOT/path)
        with self.assertRaises(p.BoundaryHold):
            self.exact()
        file.unlink()
        shutil.copyfile(ROOT/path,file)
        os.link(file,self.root/"other-hardlink")
        with self.assertRaisesRegex(p.BoundaryHold,"SCAN_V2_SINGLE_FILE"):
            self.exact()

    def test_scan_v1_guards_still_pin_earlier_source(self):
        self.assertNotEqual(
            p.EXACT_C_SCAN_OS_HASHES["scripts/scan_os.py"],
            p.EXACT_C_SCAN_V2_PINS["scripts/scan_os.py"])
        with self.assertRaisesRegex(p.BoundaryHold,"C_SCAN_WRONG_BRANCH"):
            p.authorize_changed_source(self.root,p.EXACT_C_SCAN_OS_BASE,
                                       "scripts/scan_os.py")

    def test_no_host_authority_or_generic_credential_reuse(self):
        self.assertFalse(any("financial" in x.lower() or
                             "wallet" in x.lower()
                             for x in p.EXACT_C_SCAN_V2_PINS))
        self.assertNotIn("scripts/aoe2_product_retention.py",
                         p.EXACT_C_SCAN_V2_PINS)
        self.assertNotIn("config/storage-owner-session-retirement.v1.json",
                         p.EXACT_C_SCAN_V2_PINS)


if __name__=="__main__":
    unittest.main()
