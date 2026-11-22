#!/usr/bin/env python3
"""WE1/C exact source admission for Scorecard+Historical, stacked on #1466.

No arbitrary executable files, original owner signer, Factory controller
installation, Intel receiver, finance permissions or new runtime.
"""
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "score_history_guard",ROOT/"scripts/product_boundary_guard.py")
guard=importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ScoreHistoryAdmission(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory(prefix="score-history-boundary-")
        self.addCleanup(self.t.cleanup)
        self.root=Path(self.t.name)
        for p in guard.EXACT_WE1_SCORE_HISTORY_PINS:
            target=self.root/p
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(ROOT/p,target)
        self.enroll=mock.patch.dict(os.environ,{
            "BOUNDARY_BRANCH":guard.EXACT_WE1_SCORE_HISTORY_BRANCH})
        self.enroll.start()
        self.addCleanup(self.enroll.stop)

    def admit(self,files=None,base=None,branch=None,repo="Emaren/app-prodn"):
        return guard.check_exact_we1_score_history_source(
            self.root,repo,
            branch or guard.EXACT_WE1_SCORE_HISTORY_BRANCH,
            base or guard.EXACT_WE1_SCORE_HISTORY_BASE,
            sorted(files if files is not None else
                   guard.EXACT_WE1_SCORE_HISTORY_REQUIRED))

    def test_base_and_branch_are_literal_stacked_source(self):
        self.assertEqual(guard.EXACT_WE1_SCORE_HISTORY_BASE,
                         "845beeba6746dfdfce89f078bc70897a159fc856")
        self.assertEqual(guard.EXACT_WE1_SCORE_HISTORY_BRANCH,
                         "we1/scorecard-historical-source-20261122")
        self.assertIsNone(self.admit())

    def test_only_two_exact_source_scripts_get_branch_exemption(self):
        for p in ("scripts/kingdom_scorecard_os.py","scripts/historical_os.py"):
            with self.subTest(p=p):
                self.assertEqual(
                    guard.authorize_changed_source(
                        self.root,guard.EXACT_WE1_SCORE_HISTORY_BASE,p),p)

    def test_original_guard_and_v2_source_pins_remain_unchanged(self):
        self.assertEqual(guard.EXACT_C_SCAN_V2_BASE,
                         "f833d7e633cee4b36f1427fa45d76081fa0796ef")
        self.assertIn("scripts/scan_os.py",guard.EXACT_C_SCAN_V2_PINS)
        self.assertNotIn("scripts/aoe2_product_retention.py",
                         guard.EXACT_WE1_SCORE_HISTORY_PINS)
        self.assertNotIn("scripts/scan_os.py",
                         guard.EXACT_WE1_SCORE_HISTORY_PINS)

    def test_wrong_branch_base_repo_denied(self):
        with self.assertRaisesRegex(guard.BoundaryHold,"SCORE_HISTORY_SOURCE_BRANCH"):
            self.admit(branch="we1/some-other-branch")
        with self.assertRaisesRegex(guard.BoundaryHold,"SCORE_HISTORY_SOURCE_BASE"):
            self.admit(base="0"*40)
        with self.assertRaisesRegex(guard.BoundaryHold,"SCORE_HISTORY_SOURCE_REPO"):
            self.admit(repo="Emaren/VPSSentry")

    def test_missing_extra_or_unreviewed_source_denied(self):
        files=set(guard.EXACT_WE1_SCORE_HISTORY_REQUIRED)
        for variant in (files-{"scripts/historical_os.py"},
                        files|{"scripts/unknown-admin-service.py"},
                        files|{"config/owner-keys.json"}):
            with self.subTest(variant=sorted(variant)):
                with self.assertRaisesRegex(guard.BoundaryHold,
                                            "SCORE_HISTORY_CHANGED_FILE_SET"):
                    self.admit(files=variant)

    def test_each_pinned_source_sha_resists_appended_bytes(self):
        for raw in guard.EXACT_WE1_SCORE_HISTORY_PINS:
            with self.subTest(path=raw):
                p=self.root/raw
                old=p.read_bytes()
                p.write_bytes(old+b"\npermission_override = True\n")
                with self.assertRaisesRegex(guard.BoundaryHold,
                                            "SCORE_HISTORY_SOURCE_SHA256"):
                    self.admit()
                p.write_bytes(old)

    def test_symlink_parent_or_hardlink_rejected(self):
        p=self.root/"scripts/historical_os.py"
        p.unlink()
        p.symlink_to(ROOT/"scripts/historical_os.py")
        with self.assertRaises(guard.BoundaryHold):
            self.admit()
        p.unlink()
        shutil.copyfile(ROOT/"scripts/historical_os.py",p)
        os.link(p,self.root/"hardlink-copy")
        with self.assertRaisesRegex(guard.BoundaryHold,
                                    "SCORE_HISTORY_SOURCE_CUSTODY"):
            self.admit()

    def test_unapproved_new_executable_still_denied(self):
        for p in ("scripts/unknown_hot_root_unlink.py",
                  "scripts/aoe2_product_retention.py"):
            with self.subTest(p=p):
                with self.assertRaises(guard.BoundaryHold):
                    guard.authorize_changed_source(
                        self.root,guard.EXACT_WE1_SCORE_HISTORY_BASE,p)

    def test_source_model_never_expands_authorized_task_argv(self):
        self.assertEqual(guard.ALLOWED_TASK_ARGV,
                         (("python3","-I","-B","scripts/product_boundary_guard.py","--check"),
                          ("python3","-I","-B","-m","unittest","discover","-s",
                           "tests","-p","test_product_boundary_guard.py","-v")))


if __name__=="__main__":
    unittest.main()
