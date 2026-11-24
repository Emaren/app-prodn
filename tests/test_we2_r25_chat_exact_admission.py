"""New exact R25 source-admission candidate tests; no native host authority."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("r25_source_policy",ROOT/"scripts/product_boundary_guard.py")
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class ExactR25Candidate(unittest.TestCase):
    def test_frozen_payloads(self):
        for raw in g.EXACT_WE2_R25_CHAT_PINS:
            self.assertEqual(g.exact_we2_r25_chat_blob(ROOT,raw),raw)
    def test_wrong_branch_and_scope(self):
        self.assertIsNotNone(g.BRANCH.fullmatch(g.EXACT_WE2_R25_CHAT_BRANCH))
        self.assertIsNone(g.BRANCH.fullmatch(g.EXACT_WE2_R25_CHAT_BRANCH+"-other"))
        rows=[("M",p) for p in g.EXACT_WE2_R25_CHAT_CHANGED]
        g.check_we2_r25_chat_rows(rows)
        for invalid in (rows[:-1],rows+[("A","other.txt")],
                        rows+[("D","other.txt")], [("D",rows[0][1])]+rows[1:],
                        [("T",rows[0][1])]+rows[1:]):
            with self.assertRaises(g.BoundaryHold):
                g.check_we2_r25_chat_rows(invalid)
    def test_wrong_repo_base_branch(self):
        for repo,branch,base in (("Other/app-prodn",g.EXACT_WE2_R25_CHAT_BRANCH,g.EXACT_WE2_R25_CHAT_BASE),
            ("Emaren/app-prodn",g.EXACT_WE2_R25_CHAT_BRANCH,"0"*40),
            ("Emaren/app-prodn","session-c/other",g.EXACT_WE2_R25_CHAT_BASE)):
            with self.assertRaises(g.BoundaryHold):
                g.check_exact_we2_r25_chat_context(ROOT,repo,branch,base,"0"*40,ci=False)
    def test_tamper_links_modes(self):
        raw="scripts/r25_b_guard_production_v1.cjs"
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/"scripts").mkdir()
            f=root/raw; f.write_bytes((ROOT/raw).read_bytes()); f.chmod(0o644)
            self.assertEqual(g.exact_we2_r25_chat_blob(root,raw),raw)
            f.write_bytes(b"tamper")
            with self.assertRaises(g.BoundaryHold): g.exact_we2_r25_chat_blob(root,raw)
            f.write_bytes((ROOT/raw).read_bytes()); f.chmod(0o666)
            with self.assertRaises(g.BoundaryHold): g.exact_we2_r25_chat_blob(root,raw)
            f.chmod(0o644); os.link(f,root/"duplicate")
            with self.assertRaises(g.BoundaryHold): g.exact_we2_r25_chat_blob(root,raw)
            f.unlink(); f.symlink_to(root/"duplicate")
            with self.assertRaises(g.BoundaryHold): g.exact_we2_r25_chat_blob(root,raw)
