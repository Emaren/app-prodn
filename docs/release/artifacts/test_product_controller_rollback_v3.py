#!/usr/bin/env python3
"""Isolated rollback contract tests; no root, systemd, HTTP or production writes."""
import ast
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

FILE=Path(__file__).with_name("aoe2war_product_release_controller_v3.py")
NAMES=("expected_old_factory_http","target_health")
TREE=ast.parse(FILE.read_text())
SOURCES=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in NAMES]
assert {x.name for x in SOURCES}==set(NAMES)
BLOCK=ast.fix_missing_locations(ast.Module(body=SOURCES,type_ignores=[]))

class RollbackContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.old=self.root/"old"
        self.new=self.root/"new"
        for p in (self.old,self.new):
            (p/".next").mkdir(parents=True)
        (self.old/".aoe2war-source-sha").write_text("a"*40)
        (self.old/".next/BUILD_ID").write_text("OLDBUILD12345")
        (self.new/".aoe2war-source-sha").write_text("b"*40)
        (self.new/".next/BUILD_ID").write_text("NEWBUILD12345")
        self.unit=self.root/"active.unit"
        self.original=self.root/"old.unit"
        self.candidate=self.root/"new.unit"
        self.original.write_bytes(b"old-unit")
        self.candidate.write_bytes(b"new-unit")
        self.unit.write_bytes(b"old-unit")
        self.services={"ActiveState":"active","WorkingDirectory":str(self.old)}
        self.responses={"/":200,"/factory":200,"/api/bets":503,"/api/auth/session":401}
        self.g=dict(Path=Path,PREVIOUS_ROOT=str(self.old),TARGET=self.new,
            SOURCE="b"*40,PREVIOUS_SOURCE="a"*40,
            BUILD="NEWBUILD12345",PREVIOUS_BUILD="OLDBUILD12345",
            SERVICE="web",APP_UNIT=self.unit,
            ORIGINAL=self.original,CANDIDATE=self.candidate,
            property=lambda unit,field:self.services[field],
            url_status=lambda port,path:self.responses[path])
        self.g["hold"]=lambda test,label:None if test else (_ for _ in ()).throw(RuntimeError(label))
        exec(compile(BLOCK,str(FILE),"exec"),self.g)
        self.base={"old_factory_http":200}

    def test_old_factory_http_200_accepted(self):
        self.assertEqual(self.g["expected_old_factory_http"](self.base),200)
        self.assertTrue(self.g["target_health"]("old",self.base))
    def test_old_factory_http_404_accepted(self):
        self.responses["/factory"]=404
        self.assertTrue(self.g["target_health"]("old",{"old_factory_http":404}))
    def test_old_factory_404_is_not_accepted_when_preimage_was_200(self):
        self.responses["/factory"]=404
        self.assertFalse(self.g["target_health"]("old",self.base))
    def test_original_source_mutation_rejected(self):
        (self.old/".aoe2war-source-sha").write_text("c"*40)
        self.assertFalse(self.g["target_health"]("old",self.base))
    def test_original_build_mutation_rejected(self):
        (self.old/".next/BUILD_ID").write_text("OTHERBUILD123")
        self.assertFalse(self.g["target_health"]("old",self.base))
    def test_wrong_systemd_unit_rejected(self):
        self.unit.write_bytes(b"new-unit")
        self.assertFalse(self.g["target_health"]("old",self.base))
    def test_financial_api_unexpected_rejected(self):
        self.responses["/api/bets"]=200
        self.assertFalse(self.g["target_health"]("old",self.base))
    def test_string_or_boolean_http_preimage_rejected(self):
        for val in ("200",True,None,500):
            with self.subTest(val=val),self.assertRaises(RuntimeError):
                self.g["expected_old_factory_http"]({"old_factory_http":val})
    def test_candidate_source_and_build_checked(self):
        self.unit.write_bytes(b"new-unit")
        self.services["WorkingDirectory"]=str(self.new)
        self.assertTrue(self.g["target_health"]("new",self.base))
        (self.new/".next/BUILD_ID").write_text("wrong")
        self.assertFalse(self.g["target_health"]("new",self.base))
    def test_session_denial_required(self):
        self.responses["/api/auth/session"]=200
        self.assertFalse(self.g["target_health"]("old",self.base))

if __name__=="__main__":unittest.main(verbosity=2)
