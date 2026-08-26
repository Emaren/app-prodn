from __future__ import annotations
import importlib.util, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(n,p):
    s=importlib.util.spec_from_file_location(n,ROOT/p); assert s and s.loader
    m=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m); return m
parallel=load("p12","scripts/aoe2_parallel.py"); shadow=load("s12","scripts/aoe2_shadow.py")
class T(unittest.TestCase):
    def test_preserve_dependency(self):
        p={"depends_on":["feature/dev-control-plane-v1"]}; parallel.assign_manifest_list(p,"depends_on",None)
        self.assertEqual(p["depends_on"],["feature/dev-control-plane-v1"])
    def test_full_profile(self):
        a={"users","chat_rooms","chat_messages","bet_wagers","pending_wolo_claims","hero_playlists","managed_media_assets","game_stats","user_presence_preferences","user_activity_events"}
        r=shadow.profile_root_tables("full-lightweight",a)
        for x in ("users","chat_rooms","chat_messages","bet_wagers","pending_wolo_claims","hero_playlists","managed_media_assets","game_stats","user_presence_preferences"): self.assertIn(x,r)
        self.assertNotIn("user_activity_events",r)
    def test_atomic_restore(self):
        s=(ROOT/"scripts/aoe2_shadow.py").read_text(); self.assertIn('"--single-transaction"',s); self.assertIn("TRUNCATE TABLE ",s)
    def test_sequence_alignment_skips_tables_without_id(self):
        source=(ROOT/"scripts/aoe2_shadow.py").read_text()
        self.assertIn("information_schema.columns",source)
        self.assertIn("column_name='id'",source)
        self.assertIn("not id_column_rows",source)
        self.assertIn("information_schema.columns",source)

    def test_dev_instrumentation_stubs_production_wargraph_runtime(self):
        source=(ROOT/"next.config.js").read_text()
        self.assertIn("webpack(config, { dev })",source)
        self.assertIn('"./lib/wargraph/runtime$"',source)
        self.assertIn("lib/wargraph/runtime.dev.ts",source)
        self.assertNotIn("serverExternalPackages",source)

        stub=(ROOT/"lib/wargraph/runtime.dev.ts").read_text()
        self.assertIn("startWarGraphRuntime",stub)
        self.assertNotIn("prisma",stub.lower())
        self.assertNotIn('from "pg"',stub)

    def test_serve_does_not_move_tracked_instrumentation(self):
        source=(ROOT/"scripts/dev-shadow.py").read_text()
        serve=source[source.index("def serve_shadow"):source.index("def main()")]
        self.assertNotIn("suspend_production_instrumentation()",serve)
        self.assertNotIn("restore_production_instrumentation(",serve)

    def test_explicit_stack_is_not_forecast_as_conflict(self):
        source=(ROOT/"scripts/aoe2_parallel.py").read_text()
        self.assertIn("explicitly_stacked",source)
        self.assertIn('left["branch"] in right.get("depends_on", [])',source)

    def test_runtime_hygiene(self):
        s=(ROOT/"scripts/dev-shadow.py").read_text()
        for x in ("ensure_truth_ready()","assert_refresh_ports_free()","prepare_next_runtime()","suspend_production_instrumentation()"): self.assertIn(x,s)
if __name__=="__main__": unittest.main()
