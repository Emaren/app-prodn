"""G must distinguish historical migration from repeated current-state equality."""
import copy,importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("g_repeat",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(g)
FIELDS=("old_source","old_next_build_id","candidate","units","ports",
        "old_http","candidate_http","approved_scope_sha256",
        "transaction_scope","candidate_runtime_lineage")
class GRepeat(unittest.TestCase):
    def current(self):
        d={x:{"identity":"current"} for x in FIELDS}
        d["phase"]="after"
        d["units"]={"aoe2hdbets-web-r24.service":{"main_process":{"pid":1483304,
                            "start_ticks":148446193,"uid":993}}}
        d["ports"]={"3031":{"pid":1483304,"start_ticks":148446193}}
        d["candidate_runtime_lineage"]={"candidate_after":{"candidate_pid":1483304}}
        return d
    def test_equal_current_after_snapshots_pass_without_require_old_pid_1118556(self):
        a=self.current()
        g.compare_repeated_postflight(a,copy.deepcopy(a))
    def test_later_process_identity_drift_rejected(self):
        a=self.current();b=copy.deepcopy(a)
        b["units"]["aoe2hdbets-web-r24.service"]["main_process"]["pid"]=1483305
        with self.assertRaisesRegex(g.Hold,"G_REPEATED_POSTFLIGHT_DRIFT:UNITS"):
            g.compare_repeated_postflight(a,b)
    def test_any_original_financial_or_port_drift_rejected(self):
        for key in ("old_source","ports","candidate","approved_scope_sha256",
                    "transaction_scope","candidate_runtime_lineage","old_http"):
            with self.subTest(key=key):
                a=self.current();b=copy.deepcopy(a);b[key]={"identity":"drift"}
                with self.assertRaisesRegex(g.Hold,"G_REPEATED_POSTFLIGHT_DRIFT:"+key.upper()):
                    g.compare_repeated_postflight(a,b)
    def test_rollback_same_state_allowed_but_after_to_rollback_mismatch_rejected(self):
        a=self.current();b=copy.deepcopy(a);a["phase"]="rollback";b["phase"]="rollback"
        g.compare_repeated_postflight(a,b)
        b["phase"]="after"
        with self.assertRaisesRegex(g.Hold,"G_REPEATED_POSTFLIGHT_PHASE_MISMATCH"):
            g.compare_repeated_postflight(a,b)
    def test_original_historical_migration_check_preserved_once(self):
        s=(ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py").read_text()
        self.assertIn('compare_process_and_finance(before,after)',s)
        self.assertIn('compare_repeated_postflight(snapshot,repeat)',s)
        self.assertNotIn('compare_process_and_finance(snapshot,repeat)',s)
        self.assertIn('a["pid"]==1118556',s)
        self.assertIn('b["pid"]==lineage["candidate_after"]["candidate_pid"]',s)
if __name__=="__main__":unittest.main()
