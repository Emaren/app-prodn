"""C/WE1 protected Prisma README: one exact source authorization, not an open Prisma namespace."""
from __future__ import annotations
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("c_product_boundary",ROOT/"scripts/product_boundary_guard.py")
policy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class CPrismaReviewedDocTests(unittest.TestCase):
    def setUp(self):
        self.work=tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.root=Path(self.work.name)
        (self.root/"prisma").mkdir()
        (self.root/"tests").mkdir()
        (self.root/"scripts").mkdir()
        self.doc=self.root/"prisma/README.md"
        self.doc.write_bytes((ROOT/"prisma/README.md").read_bytes())
        self.testfile=self.root/"tests/test_c_prisma_doc_admission.py"
        self.testfile.write_bytes((ROOT/"tests/test_c_prisma_doc_admission.py").read_bytes())
        self.branch=mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":policy.EXACT_C_PRISMA_DOC_BRANCH})
        self.branch.start()
        self.addCleanup(self.branch.stop)
    def test_exact_source_is_safe_and_document_only(self):
        self.assertEqual(policy.EXACT_C_PRISMA_DOC_BASE,
          "6f900b1e7bf9ed96486bebdb6b17624b14c1a942")
        self.assertEqual(policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,
          "prisma/README.md"),"prisma/README.md")
        self.assertIsNone(policy.check_exact_c_prisma_doc_source(
          self.root,"Emaren/app-prodn",policy.EXACT_C_PRISMA_DOC_BRANCH,
          policy.EXACT_C_PRISMA_DOC_BASE,sorted(policy.EXACT_C_PRISMA_DOC_REQUIRED)))
    def test_other_prisma_paths_still_denied(self):
        for p in ("prisma/schema.prisma","prisma/migrations/2020/migration.sql",
                  "prisma/OTHER.md","prisma/README.md/child"):
            with self.subTest(path=p),self.assertRaises(policy.BoundaryHold):
                policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,p)
    def test_generic_source_still_rejects_entire_prisma_directory(self):
        with self.assertRaisesRegex(policy.BoundaryHold,"PROTECTED_SOURCE_NAMESPACE"):
            policy.authorize_source("prisma/README.md")
    def test_wrong_branch(self):
        with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":"session-c/other"}):
            with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_WRONG_BRANCH"):
                policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,"prisma/README.md")
    def test_wrong_base(self):
        with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_WRONG_BASE"):
            policy.authorize_changed_source(self.root,"f"*40,"prisma/README.md")
    def test_tampered_doc_fails(self):
        self.doc.write_bytes(self.doc.read_bytes()+b"\n# altered after review\n")
        with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_SHA256_DRIFT"):
            policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,"prisma/README.md")
    def test_symlink_doc_fails(self):
        self.doc.unlink()
        self.doc.symlink_to(ROOT/"prisma/README.md")
        with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_(SYMLINK|SINGLE_FILE)"):
            policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,"prisma/README.md")
    def test_symlink_parent_fails(self):
        self.doc.unlink()
        (self.root/"prisma").rmdir()
        (self.root/"prisma").symlink_to(ROOT/"prisma",target_is_directory=True)
        with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_SYMLINK"):
            policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,"prisma/README.md")
    def test_hardlink_fails(self):
        os.link(self.doc,self.root/"shared-link")
        with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_SINGLE_FILE"):
            policy.authorize_changed_source(self.root,policy.EXACT_C_PRISMA_DOC_BASE,"prisma/README.md")
    def test_changed_file_scope_and_repo_exact(self):
        base=policy.EXACT_C_PRISMA_DOC_BASE
        branch=policy.EXACT_C_PRISMA_DOC_BRANCH
        required=sorted(policy.EXACT_C_PRISMA_DOC_REQUIRED)
        for repo,b,who,changes in (
          ("Emaren/other",base,branch,required),
          ("Emaren/app-prodn","f"*40,branch,required),
          ("Emaren/app-prodn",base,"session-c/other",required),
          ("Emaren/app-prodn",base,branch,required+["prisma/schema.prisma"]),
          ("Emaren/app-prodn",base,branch,required+["scripts/unauthorized.py"]),
          ("Emaren/app-prodn",base,branch,required[:-1]),
          ("Emaren/app-prodn",base,branch,required+[required[0]])):
            with self.subTest(repo=repo,base=b,branch=who,changes=changes):
                with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_"):
                    policy.check_exact_c_prisma_doc_source(self.root,repo,who,b,changes)
    def test_tampered_tests_rejected(self):
        self.testfile.write_bytes(self.testfile.read_bytes()+b"\n#future-test\n")
        with self.assertRaisesRegex(policy.BoundaryHold,"C_PRISMA_TEST_SHA256_DRIFT"):
            policy.check_exact_c_prisma_doc_source(self.root,"Emaren/app-prodn",
              policy.EXACT_C_PRISMA_DOC_BRANCH,policy.EXACT_C_PRISMA_DOC_BASE,
              sorted(policy.EXACT_C_PRISMA_DOC_REQUIRED))
    def test_dangerous_database_operations_not_in_document(self):
        source=self.doc.read_text()
        self.assertIn("**`yarn prisma:push` invokes `prisma db push`",source)
        self.assertIn("must NEVER be described or used as a non-mutating validation",source)
        self.assertIn("npx prisma validate",source)
        self.assertIn("This review **did not connect to a database",source)

if __name__=="__main__":
    unittest.main()
