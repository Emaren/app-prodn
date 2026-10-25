"""Adversarial read-only Renaissance census fixtures."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("tabd",HERE/"scripts/renaissance_tabd_forge.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ForgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        for name in ("app/page.tsx","app/admin/page.tsx","app/profile/page.tsx",
                     "app/api/health/route.ts"):
            p=self.root/name
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_text("export default function Page(){return null}\n")
        c=self.root/"config"
        c.mkdir()
        (c/"renaissance-campaign.json").write_text(json.dumps({"phases":[
            {"id":"I","code":"CONTROL","routes":["/","/admin","/profile"]}]}))
        (c/"kingdom-index-inventory.json").write_text(json.dumps({
            "pages":[{"href":"/","scope":"public-index"},
                     {"href":"/admin","scope":"admin-path"},
                     {"href":"/profile","scope":"excluded-static"}],
            "counts":{"pageTemplates":3,"routeHandlerTemplates":1,"publicIndexTemplates":1}}))
    def emitted(self,extra=None):
        directory=self.root/".next/server"
        directory.mkdir(parents=True,exist_ok=True)
        routes={"/page":"app/page.js","/admin/page":"app/admin/page.js",
                "/profile/page":"app/profile/page.js",
                "/api/health/route":"app/api/health/route.js"}
        routes.update(extra or {})
        (directory/"app-paths-manifest.json").write_text(json.dumps(routes))
        (directory.parent/"BUILD_ID").write_text("testBuild123")
        return directory.parent
    def test_census_and_nonmutation(self):
        before={p.relative_to(self.root):p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        r=module.run_census(self.root,fast=True)
        after={p.relative_to(self.root):p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before,after)
        self.assertEqual(r["source_counts"]["pages"],3)
        self.assertEqual(r["source_counts"]["handlers"],1)
        self.assertEqual([d["kind"] for d in r["dossiers"]],
                         ["public_static","admin","private_utility"])
        self.assertEqual(r["matrix"]["get_nonmutation_proven"],0)
        self.assertIsNone(r["quality_score"])
        self.assertFalse(r["certified"])
    def test_identical_emitted_manifest(self):
        r=module.run_census(self.root,self.emitted(),expected_build_id="testBuild123",fast=True)
        self.assertEqual(r["mismatch_queue"]["emitted"]["emitted_pages_not_source"],{})
        self.assertEqual(r["build"]["page_count"],3)
    def test_extra_page_and_five_handlers_are_private_mismatches(self):
        extra={"/_not-found/page":"app/_not-found/page.js"}
        extra.update({f"/metadata-{i}/route":f"app/metadata-{i}/route.js" for i in range(5)})
        r=module.run_census(self.root,self.emitted(extra),fast=True)
        self.assertIn("/_not-found",r["mismatch_queue"]["emitted"]["emitted_pages_not_source"])
        self.assertEqual(len(r["mismatch_queue"]["emitted"]["emitted_handlers_not_source"]),5)
    def test_build_id_mismatch_fails_closed(self):
        with self.assertRaisesRegex(ValueError,"BUILD_ID"):
            module.run_census(self.root,self.emitted(),expected_build_id="wrongID",fast=True)
    def test_missing_source_is_not_hidden(self):
        (self.root/"app/profile/page.tsx").unlink()
        r=module.run_census(self.root,fast=True)
        self.assertEqual(r["mismatch_queue"]["planned_missing_in_source"],["/profile"])
    def test_group_and_parallel_routes_normalized(self):
        self.assertEqual(module.normalize(["(public)","@sidebar","about"]),"/about")
    def test_duplicate_plan_rejected(self):
        p=self.root/"config/renaissance-campaign.json"
        d=json.loads(p.read_text())
        d["phases"][0]["routes"].append("/")
        p.write_text(json.dumps(d))
        with self.assertRaisesRegex(ValueError,"duplicate"):
            module.run_census(self.root,fast=True)

if __name__=="__main__":
    unittest.main()
