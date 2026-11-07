"""Never relabel an installed artifact with a newer controller commit."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("production_browser",ROOT/"scripts/aoe2_r25_g_browser_acceptance.py")
browser=importlib.util.module_from_spec(spec);spec.loader.exec_module(browser)

class ProductionBrowserSource(unittest.TestCase):
    def test_real_git_accepts_controller_descendant_and_refuses_changed_application(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            def git(*args):
                return subprocess.check_output(["git","-C",str(root),*args],stderr=subprocess.DEVNULL,text=True).strip()
            git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid")
            (root/"app").mkdir();(root/"app/page.tsx").write_text("original application\n")
            git("add",".");git("commit","-qm","candidate");candidate=git("rev-parse","HEAD")
            (root/"scripts").mkdir();(root/"scripts/controller.py").write_text("reviewed control repair\n")
            git("add",".");git("commit","-qm","controller");controller=git("rev-parse","HEAD")
            self.assertTrue(browser.application_source_equivalent(root,candidate,controller))
            (root/"app/page.tsx").write_text("different application\n")
            git("add",".");git("commit","-qm","application changed")
            with self.assertRaisesRegex(ValueError,"Installed application differs"):
                browser.application_source_equivalent(root,candidate,git("rev-parse","HEAD"))
            (root/"app/page.tsx").write_text("original application\n")
            git("mv","app/page.tsx","scripts/renamed-application.tsx")
            git("add",".");git("commit","-qm","application renamed into tooling")
            with self.assertRaisesRegex(ValueError,"Installed application differs"):
                browser.application_source_equivalent(root,candidate,git("rev-parse","HEAD"))

    def test_actual_census_preserves_historical_88_and_separate_b4_route(self):
        public,protected=browser.production_routes(ROOT)
        self.assertEqual(len(public),89)
        self.assertEqual(public[-1],"/kingdom-construction")
        self.assertEqual(len(protected),37)
        self.assertEqual(len(set(public)),89)

if __name__=="__main__":unittest.main()
