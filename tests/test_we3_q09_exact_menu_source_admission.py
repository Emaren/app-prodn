"""Exact-only source policy tests for the Q09 40-link PAPER menu browser tool.

No permit, no network, no public website, no actual deployment.
"""
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/product_boundary_guard.py"
spec=importlib.util.spec_from_file_location("we3_q09_product_policy",PATH)
guard=importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class Q09ExactReview(unittest.TestCase):
    def setUp(self):
        self.work=tempfile.TemporaryDirectory(prefix="we3_q09_exact_guard_")
        self.addCleanup(self.work.cleanup)
        self.checkout=Path(self.work.name)
        (self.checkout/"scripts").mkdir()
        self.source=ROOT/"scripts/r25_public_kingdom_menu_chrome.cjs"
        self.target=self.checkout/"scripts/r25_public_kingdom_menu_chrome.cjs"
        shutil.copyfile(self.source,self.target)
        self.target.chmod(0o600)
        self.env=patch.dict(os.environ,{"BOUNDARY_BRANCH":guard.EXACT_REVIEWED_KINGDOM_MENU_BRANCH})
        self.env.start()
        self.addCleanup(self.env.stop)

    def admit(self,base=None):
        return guard.authorize_changed_source(
            self.checkout,base or guard.EXACT_REVIEWED_KINGDOM_MENU_BASE,
            guard.EXACT_REVIEWED_KINGDOM_MENU_SCRIPT)

    def test_exact_bytes_and_original_base_and_branch_pass(self):
        self.assertEqual(self.admit(),guard.EXACT_REVIEWED_KINGDOM_MENU_SCRIPT)

    def test_wrong_base_denied(self):
        with self.assertRaisesRegex(guard.BoundaryHold,"KINGDOM_MENU_REVIEWED_WRONG_BASE"):
            self.admit("0"*40)

    def test_wrong_branch_denied(self):
        os.environ["BOUNDARY_BRANCH"]="session-c/malicious-branch"
        with self.assertRaisesRegex(guard.BoundaryHold,"KINGDOM_MENU_REVIEWED_WRONG_BRANCH"):
            self.admit()

    def test_changed_source_bytes_denied(self):
        self.target.write_bytes(self.target.read_bytes()+b"\\n// unrelated execution\\n")
        with self.assertRaisesRegex(guard.BoundaryHold,"KINGDOM_MENU_REVIEWED_EXACT_SHA_MISMATCH"):
            self.admit()

    def test_symlink_ancestor_denied(self):
        self.target.unlink()
        (self.checkout/"scripts").rmdir()
        target=Path(self.work.name)/"real_scripts"
        target.mkdir()
        (self.checkout/"scripts").symlink_to(target,target_is_directory=True)
        with self.assertRaisesRegex(guard.BoundaryHold,"KINGDOM_MENU_REVIEWED_SYMLINK_ANCESTOR"):
            self.admit()

    def test_symlink_leaf_denied(self):
        self.target.unlink()
        self.target.symlink_to(self.source)
        with self.assertRaisesRegex(guard.BoundaryHold,
            "KINGDOM_MENU_REVIEWED_SINGLE_FILE|KINGDOM_MENU_REVIEWED"):
            self.admit()

    def test_group_writable_source_denied(self):
        self.target.chmod(0o662)
        with self.assertRaisesRegex(guard.BoundaryHold,"KINGDOM_MENU_REVIEWED_SINGLE_FILE"):
            self.admit()

    def test_script_wildcard_is_never_added(self):
        with self.assertRaisesRegex(guard.BoundaryHold,"UNREVIEWED_EXECUTABLE_SURFACE"):
            guard.authorize_source("scripts/anything-else.cjs")

if __name__=="__main__":
    unittest.main()
