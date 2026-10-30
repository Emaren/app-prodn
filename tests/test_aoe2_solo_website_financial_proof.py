"""P0 financial-proof negative tests; no HEL1, funded money or network."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from aoe2_solo_website_financial_proof import (
 FinancialProofHold,REQUIRED_SERVICES,REQUIRED_TIMERS,REQUIRED_UNITS,
 REQUIRED_SURFACES,canonical,verify_writer_census,verify_source_closure,
 rollback_finance_status)
D="a"*64

def unit(name):
 x={"unit":name,"kind":"timer" if name.endswith(".timer") else "service",
 "state":"inactive","unit_file_sha256":D,"dropins_sha256":D,
 "exec_sha256":D,"environment_sha256":D,"cgroup_sha256":D,
 "systemd_show_sha256":D,"last_invocation_sha256":D,
 "main_pid":0,"start_time_ticks":0,"executable_sha256":None}
 if name.endswith(".timer"):
  x.update(trigger_unit=name[:-6]+".service",schedule_sha256=D,
           last_trigger_sha256=D)
 return x

def finance():
 units={name:unit(name) for name in sorted(REQUIRED_UNITS)}
 census={"schema":"aoe2war.financial-writer-census.v1",
  "host":"ubuntu-4gb-hel1-11","units":units,
  "discovered_unit_names":sorted(REQUIRED_UNITS),
  "reviewed_additional_units":[],"additional_units_review_sha256":D,
  "unit_inventory_sha256":hashlib.sha256(canonical(units)).hexdigest(),
  "native_snapshot_sha256":D,
  "discovery":{"origin":"ROOT_NATIVE_SYSTEMD_PROC_CRON_INGRESS",
   "coverage":"CLOSED_WORLD_VERIFIED",
   **{k+"_sha256":D for k in REQUIRED_SURFACES},
   **{k:[] for k in ("unresolved_writers","unclassified_financial_jobs",
    "unknown_http_effects","unmapped_external_ingress","unaccounted_pids",
    "incomplete_units")}},
  "side_effects":{k:{"route_graph_sha256":D,"native_trace_sha256":D,
    "writer_edge_sha256":D,"unresolved_edges":[]} for k in ("GET","HEAD","PREWARM")}}
 return {"protected":{"writers":{"native_census":census}}}

def source():
 f=finance()
 scope={"status":"INDEPENDENTLY_REVIEWED","candidate_sha":"b"*40,
  "discovery":"NATIVE_EXACT_SOURCE_AND_RUNTIME_RECOMPUTED",
  "root_review_binding":"OWNER_ENROLLED_SIGNED_REVIEW",
  **{k+"_sha256":D for k in ("source_tree","dependency_graph",
   "import_edges","finance_surface","get_head_effects","prewarm_effects",
   "manifest","source_review","native_recomputation","census_policy")},
  **{k:[] for k in ("unresolved_import_edges","changed_financial_writers",
   "financial_migration_paths","unchecked_producer_edges",
   "unreviewed_get_side_effects","unreviewed_prewarm_side_effects",
   "unresolved_dynamic_imports","unreviewed_external_calls")},
  "writer_census_sha256":hashlib.sha256(canonical(
   f["protected"]["writers"]["native_census"])).hexdigest()}
 return {"candidate_sha":"b"*40,"source_scope":scope,"finance":f,
         "stage":{"status":"NOT_STAGED"}}

class BFinancialProofAdversarial(unittest.TestCase):
 def test_named_staking_and_separate_settlements_mandatory(self):
  self.assertIn("aoe2hdbets-staking-rewards.service",REQUIRED_SERVICES)
  self.assertIn("wolochain-mainnet-settlement.service",REQUIRED_SERVICES)
  self.assertIn("wolochain-founder-rewards-settlement.service",REQUIRED_SERVICES)
  self.assertIn("aoe2hdbets-staking-rewards.timer",REQUIRED_TIMERS)
  self.assertIn("aoe2war-prewarm.timer",REQUIRED_TIMERS)

 def test_complete_fixture_and_empty_roles(self):
  self.assertTrue(verify_writer_census(finance()))
  for writers in ({},{"processes":{str(i):{} for i in range(10)}}):
   with self.subTest(writers=writers),self.assertRaises(FinancialProofHold):
    verify_writer_census({"protected":{"writers":writers}})

 def test_every_distinct_hel1_unit_absence_fails(self):
  for name in sorted(REQUIRED_UNITS):
   f=finance();c=f["protected"]["writers"]["native_census"]
   c["units"].pop(name);c["discovered_unit_names"].remove(name)
   c["unit_inventory_sha256"]=hashlib.sha256(canonical(c["units"])).hexdigest()
   with self.subTest(name=name),self.assertRaisesRegex(
        FinancialProofHold,"missing real HEL1"):
    verify_writer_census(f)

 def test_extra_unit_not_silently_authorized(self):
  f=finance();c=f["protected"]["writers"]["native_census"]
  c["units"]["new-financial.service"]=unit("new-financial.service")
  c["discovered_unit_names"].append("new-financial.service")
  c["unit_inventory_sha256"]=hashlib.sha256(canonical(c["units"])).hexdigest()
  with self.assertRaisesRegex(FinancialProofHold,"unreviewed"):
   verify_writer_census(f)
  c["reviewed_additional_units"]=["new-financial.service"]
  self.assertTrue(verify_writer_census(f))
  c["discovered_unit_names"].remove("new-financial.service")
  with self.assertRaisesRegex(FinancialProofHold,"native discovery"):
   verify_writer_census(f)

 def test_oneshot_idle_does_not_invent_pid(self):
  f=finance();r=f["protected"]["writers"]["native_census"]["units"][
   "aoe2hdbets-staking-rewards.service"]
  r["main_pid"]=123
  with self.assertRaises(FinancialProofHold):verify_writer_census(f)

 def test_get_head_prewarm_unresolved_edges_block(self):
  for route in ("GET","HEAD","PREWARM"):
   f=finance();f["protected"]["writers"]["native_census"][
    "side_effects"][route]["unresolved_edges"]=["finance-write"]
   with self.subTest(route=route),self.assertRaises(FinancialProofHold):
    verify_writer_census(f)

 def test_discovery_unknown_cron_or_ingress_blocks(self):
  for key in ("unresolved_writers","unclassified_financial_jobs",
              "unknown_http_effects","unmapped_external_ingress"):
   f=finance();f["protected"]["writers"]["native_census"]["discovery"][
    key]=["unmapped"]
   with self.subTest(key=key),self.assertRaises(FinancialProofHold):
    verify_writer_census(f)

 def test_signed_status_only_transitive_closure_fails(self):
  r=source();r["source_scope"]={"status":"INDEPENDENTLY_REVIEWED"}
  with self.assertRaises(FinancialProofHold):verify_source_closure(r)

 def test_source_census_and_unresolved_import(self):
  r=source();self.assertTrue(verify_source_closure(r))
  r["source_scope"]["unresolved_dynamic_imports"]=["unknown-dynamic-writer"]
  with self.assertRaises(FinancialProofHold):verify_source_closure(r)
  r=source();r["source_scope"]["writer_census_sha256"]=D
  with self.assertRaises(FinancialProofHold):verify_source_closure(r)

 def test_staged_artifact_and_deps_binding(self):
  r=source();r["stage"]={"status":"STAGED","artifact_sha256":"c"*64,
                            "node_modules_sha256":"d"*64}
  r["source_scope"].update(artifact_sha256=D,node_modules_sha256="d"*64)
  with self.assertRaises(FinancialProofHold):verify_source_closure(r)
  r["source_scope"]["artifact_sha256"]="c"*64
  self.assertTrue(verify_source_closure(r))

 def test_web_rollback_never_means_financial_rollback(self):
  from unittest.mock import patch
  result={"status":"ROLLED_BACK"}
  with self.assertRaisesRegex(FinancialProofHold,"UNKNOWN"):
   rollback_finance_status(result,None,None)
  before={"status":"INDEPENDENT_NATIVE_VERIFIED",
          "candidate_sha":"b"*40,"attempt_id":"c"*64,
          "finance":finance()}
  before["finance"]["exposure"]={"balances_sha256":D}
  after=copy.deepcopy(before)
  after["finance"]["exposure"]["balances_sha256"]="e"*64
  with patch("aoe2_solo_website_producer_receipts.verify_all",
             return_value=True) as signatures,patch(
             "aoe2_solo_website_native_audit_adapter.verify_financial_identity",
             return_value=True) as full_finance:
   with self.assertRaisesRegex(FinancialProofHold,"changed during rollback"):
    rollback_finance_status(result,before,after)
   self.assertEqual(signatures.call_count,2)
   self.assertEqual(full_finance.call_count,2)
   after=copy.deepcopy(before)
   self.assertEqual(rollback_finance_status(result,before,after),
                    "ROLLED_BACK_WEB_AND_FINANCE_NATIVE_VERIFIED")
   after["attempt_id"]="d"*64
   with self.assertRaisesRegex(FinancialProofHold,"different release attempts"):
    rollback_finance_status(result,before,after)
  with self.assertRaises(FinancialProofHold):
   rollback_finance_status({"status":"UNKNOWN"},before,before)
  # Without native key enrollment a fabricated signed-looking report is NOT PASS.
  with self.assertRaises((FinancialProofHold,ValueError,OSError)):
   rollback_finance_status(result,before,before)
if __name__=="__main__":unittest.main()
