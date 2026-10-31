"""R20 C isolated tests: no HEL1/root/private key/network required."""
import ast
import importlib.util
import io
import os
from pathlib import Path
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch

FILE=Path(__file__).resolve().parents[1]/"deploy/solo-native-audit/r20_c_hel1_one_readonly_plan.py"
spec=importlib.util.spec_from_file_location("r20c",FILE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class NativePlanSourceTests(unittest.TestCase):
    def test_syntax(self):compile(FILE.read_bytes(),str(FILE),"exec")
    def test_root_loader_compiles(self):compile(m.ROOT,"root","exec")
    def test_exact_controller(self):self.assertEqual(m.CONTROLLER,"18052e01a191b15525664c1a058de80d7a8bc150")
    def test_exact_website(self):self.assertEqual(m.WEBSITE,"0cee3c836c4b0760478280c145e02e81e470ce0e")
    def test_exact_installer(self):self.assertEqual(m.INSTALLER,"9569b449f6905d49ab0cd19e36b5b18dad527d3681b668ee598236c79b794040")
    def test_exact_bundle(self):self.assertEqual(m.BUNDLE,"dc316868e684fb7ea430d80c1fedca0a28d3e42b238eafb22cab67aceefc7c74")
    def test_exact_manifest(self):self.assertEqual(m.MANIFEST,"874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc")
    def test_source_blob(self):self.assertEqual(m.INSTALLER_BLOB,"ae10ed7c42202cf572f0ceb41324b91b4c253f31")
    def test_loader_has_one_hardcoded_plan(self):
        self.assertIn('sys.argv=[sys.argv[1],"plan",',m.ROOT)
        t=ast.parse(m.ROOT)
        calls=[n.func.attr for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)]
        for n in ("unlink","rmdir","mkdir","chmod","chown","write_bytes","write_text","Popen","run","system"):
            self.assertNotIn(n,calls)
    def test_wrong_machine_exits_before_tmp_and_sudo(self):
        with patch.object(m.socket,"gethostname",return_value="not-HEL1"),patch.object(m.tempfile,"TemporaryDirectory") as td,patch.object(m.subprocess,"run") as sub:
            self.assertEqual(m.main(),2);td.assert_not_called();sub.assert_not_called()
    def test_wrong_uid_exits(self):
        with patch.object(m.socket,"gethostname",return_value=m.HOST),patch.object(m.os,"getuid",return_value=0):
            self.assertEqual(m.main(),2)
    def test_unknown_cli_args_denied(self):
        with patch.object(m.socket,"gethostname",return_value=m.HOST),patch.object(m.os,"getuid",return_value=1000),patch.object(m.os,"geteuid",return_value=1000),patch.dict(m.os.environ,{"USER":"tony"}),patch.object(m.sys,"argv",["one","install"]):
            self.assertEqual(m.main(),2)
    def test_root_loader_rejects_foreign_host(self):
        p=subprocess.run([sys.executable,"-I","-B","-c",m.ROOT,"/a","/b","/c"],text=True,capture_output=True)
        self.assertEqual(p.returncode,2)
        self.assertIn("HOLD:R20C_ROOT:WRONG_HOST",p.stderr)
    def test_no_shell_and_no_root_file_install_in_plan_runner(self):
        s=FILE.read_text()
        self.assertNotIn('shell=True',s)
        self.assertNotIn('root_install_authorized") is True',s)
        self.assertNotIn('financial_release_authorized") is True',s)

if __name__=="__main__":unittest.main(verbosity=2)
