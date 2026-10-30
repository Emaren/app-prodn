"""Fail-closed financial-writer census and website-only source/rollback proof.
The SHA-pinned native auditor must DISCOVER and sign facts; this is a verifier,
not a generator of release authorization or substitute for HEL1 evidence.
"""
from __future__ import annotations
import hashlib,json,re
HOST="ubuntu-4gb-hel1-11"
HEX64=re.compile(r"[a-f0-9]{64}\Z")
HEX40=re.compile(r"[a-f0-9]{40}\Z")
# Unit names are distinct production units observed in HEL1 2026-10-28.
# The minimum is not a discovery substitute: any new writer MUST be reviewed.
REQUIRED_SERVICES=frozenset("""
aoe2hdbets-web.service
aoe2hdbets-api.service
aoe2dewarwagers-web.service
aoe2dewarwagers-api.service
aoe2hdbets-bet-stake-reconcile.service
aoe2hdbets-bet-stake-reconcile-plan.service
aoe2hdbets-challenge-reconcile.service
aoe2hdbets-replay-auto-recovery.service
aoe2hdbets-staking-rewards.service
aoe2hdbets-trophy-tributes.service
aoe2-wolo-transfer-heartbeat.service
aoe2war-prewarm.service
wolochaind-mainnet.service
wolochaind-testnet.service
wolochain-mainnet-settlement.service
wolochain-founder-rewards-settlement.service
wolochain-settlement.service
wolochain-mainnet-osmosis-relayer.service
""".split())
REQUIRED_TIMERS=frozenset("""
aoe2hdbets-bet-stake-reconcile.timer
aoe2hdbets-challenge-reconcile.timer
aoe2hdbets-replay-auto-recovery.timer
aoe2hdbets-staking-rewards.timer
aoe2hdbets-trophy-tributes.timer
aoe2-wolo-transfer-heartbeat.timer
aoe2war-prewarm.timer
""".split())
REQUIRED_UNITS=REQUIRED_SERVICES|REQUIRED_TIMERS
REQUIRED_SURFACES=frozenset(("systemd_units","systemd_timers","proc_cgroups",
 "cron_at","external_ingress","http_get_head","prewarm_jobs","database_writers"))
REQUIRED_ROUTES=frozenset(("GET","HEAD","PREWARM"))

class FinancialProofHold(ValueError):pass

def require(ok,reason):
 if not ok:raise FinancialProofHold("FINANCIAL_PROOF_HOLD: "+reason)

def sha(value):
 return type(value)is str and bool(HEX64.fullmatch(value))

def canonical(value):
 return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True,
                   allow_nan=False).encode("ascii")

def identity(name,record):
 require(type(record)is dict and record.get("unit")==name,
         "missing named native unit identity: "+name)
 require(record.get("kind")==("timer" if name.endswith(".timer") else "service"),
         "unit type mismatch: "+name)
 require(record.get("state") in ("active","inactive","failed","activating","deactivating"),
         "unit state unknown: "+name)
 for key in ("unit_file_sha256","dropins_sha256","exec_sha256",
             "environment_sha256","cgroup_sha256","systemd_show_sha256",
             "last_invocation_sha256"):
  require(sha(record.get(key)),"unit "+key+" absent: "+name)
 pid=record.get("main_pid")
 require(type(pid)is int and pid>=0,"missing PID: "+name)
 if pid:
  require(type(record.get("start_time_ticks"))is int and
          record["start_time_ticks"]>0 and sha(record.get("executable_sha256")),
          "running process not authenticated: "+name)
 else:
  require(record.get("start_time_ticks")==0 and
          record.get("executable_sha256")is None,
          "idle oneshot invents running process: "+name)
 if name.endswith(".timer"):
  require(record.get("trigger_unit")==name[:-6]+".service" and
          sha(record.get("schedule_sha256")) and
          sha(record.get("last_trigger_sha256")),
          "timer schedule/last activation missing: "+name)

def verify_writer_census(finance):
 require(type(finance)is dict,"finance report absent")
 protected=finance.get("protected")
 require(type(protected)is dict,"protected finance absent")
 writers=protected.get("writers")
 require(type(writers)is dict,"financial writers missing")
 census=writers.get("native_census")
 require(type(census)is dict and
         census.get("schema")=="aoe2war.financial-writer-census.v1" and
         census.get("host")==HOST,"native named writer census absent")
 discovery=census.get("discovery")
 require(type(discovery)is dict and
         discovery.get("origin")=="ROOT_NATIVE_SYSTEMD_PROC_CRON_INGRESS" and
         discovery.get("coverage")=="CLOSED_WORLD_VERIFIED",
         "no closed-world native discovery")
 for name in REQUIRED_SURFACES:
  require(sha(discovery.get(name+"_sha256")),"discovery "+name+" absent")
 for name in ("unresolved_writers","unclassified_financial_jobs",
              "unknown_http_effects","unmapped_external_ingress",
              "unaccounted_pids","incomplete_units"):
  require(discovery.get(name)==[],"incomplete discovery: "+name)
 units=census.get("units")
 require(type(units)is dict and bool(units),"empty financial unit inventory")
 discovered=census.get("discovered_unit_names")
 require(type(discovered)is list and len(discovered)==len(set(discovered)) and
         set(units)==set(discovered),"unit inventory != native discovery")
 require(REQUIRED_UNITS<=set(units),
         "missing real HEL1 financial units: "+",".join(sorted(REQUIRED_UNITS-set(units))))
 approved=census.get("reviewed_additional_units")
 require(type(approved)is list and all(type(x)is str for x in approved) and
         len(approved)==len(set(approved)) and
         set(units)==REQUIRED_UNITS|set(approved),
         "unknown/unreviewed financial unit")
 require(sha(census.get("additional_units_review_sha256")),
         "additional-writer review not bound")
 for name,record in units.items():identity(name,record)
 side=census.get("side_effects")
 require(type(side)is dict and set(side)==REQUIRED_ROUTES,
         "financial GET/HEAD/PREWARM effects not enumerated")
 for name,record in side.items():
  require(type(record)is dict and
          all(sha(record.get(k)) for k in
              ("route_graph_sha256","native_trace_sha256","writer_edge_sha256")) and
          record.get("unresolved_edges")==[],
          "financial side effects unreviewed: "+name)
 require(sha(census.get("native_snapshot_sha256")) and
         census.get("unit_inventory_sha256")==hashlib.sha256(canonical(units)).hexdigest(),
         "writer inventory changed after native observation")
 return census

def verify_source_closure(report):
 """Validate the auditor's source DAG obligations, BOUND to signed finance."""
 scope=report.get("source_scope")
 require(type(scope)is dict and scope.get("status")=="INDEPENDENTLY_REVIEWED",
         "no independently reviewed transitive source evidence")
 require(scope.get("candidate_sha")==report.get("candidate_sha") and
         type(scope.get("candidate_sha"))is str and
         bool(HEX40.fullmatch(scope["candidate_sha"])),"foreign source tree")
 for key in ("source_tree","dependency_graph","import_edges","finance_surface",
             "get_head_effects","prewarm_effects","manifest","source_review",
             "native_recomputation","census_policy"):
  require(sha(scope.get(key+"_sha256")),"missing closure: "+key)
 require(scope.get("discovery")=="NATIVE_EXACT_SOURCE_AND_RUNTIME_RECOMPUTED" and
         scope.get("root_review_binding")=="OWNER_ENROLLED_SIGNED_REVIEW",
         "no independent native closure recomputation/review")
 for key in ("unresolved_import_edges","changed_financial_writers",
             "financial_migration_paths","unchecked_producer_edges",
             "unreviewed_get_side_effects","unreviewed_prewarm_side_effects",
             "unresolved_dynamic_imports","unreviewed_external_calls"):
  require(scope.get(key)==[],"transitive closure open: "+key)
 census=verify_writer_census(report.get("finance"))
 require(scope.get("writer_census_sha256")==hashlib.sha256(canonical(census)).hexdigest(),
         "source dependency graph not bound to current writer census")
 stage=report.get("stage")
 if type(stage)is dict and stage.get("status")=="STAGED":
  require(scope.get("artifact_sha256")==stage.get("artifact_sha256") and
          scope.get("node_modules_sha256")==stage.get("node_modules_sha256"),
          "stage/runtime dependencies differ from audited source closure")
 return scope

def rollback_finance_status(phase_result,before,after):
 """A web ROLLED_BACK is not finance proof; verify native signed reports.

 This helper MUST execute root-side after failure/UNKNOWN through a separately
 bounded native auditor. The caller must never construct signed-looking input.
 """
 require(type(phase_result)is dict and phase_result.get("status")=="ROLLED_BACK",
         "no verified website rollback")
 from aoe2_solo_website_producer_receipts import verify_all
 for label,report in (("before",before),("after",after)):
  require(type(report)is dict and
          report.get("status")=="INDEPENDENT_NATIVE_VERIFIED" and
          type(report.get("finance"))is dict,
          "rollback "+label+" native finance UNKNOWN")
  # Validate all six machine/producer Ed25519 receipts, NOT just SHA strings.
  verify_all(report)
  verify_writer_census(report["finance"])
 a,b=before["finance"],after["finance"]
 require(a.get("protected")==b.get("protected") and
         a.get("exposure")==b.get("exposure"),
         "financial writers or balances/pending/liabilities changed during rollback")
 require(before.get("candidate_sha")==after.get("candidate_sha") and
         before.get("attempt_id")==after.get("attempt_id"),
         "financial before/after evidence from different release attempts")
 return "ROLLED_BACK_WEB_AND_FINANCE_NATIVE_VERIFIED"
