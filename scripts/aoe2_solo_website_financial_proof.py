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
W1_SHA="b46a51f1592c9f296839924ae55e722618b10d35"
# Independently read from the immutable W1 Git tree (not an operator JSON).
# This is a necessary lower bound, NOT a complete transitive edge graph.
W1_PUBLIC_FINANCIAL_EDGES=(
 ("scripts/prewarm-production.mjs","app/page.tsx"),
 ("scripts/prewarm-production.mjs","app/api/lobby/route.ts"),
 ("scripts/prewarm-production.mjs","app/api/live-games/route.ts"),
 ("app/page.tsx","lib/lobbySnapshot.ts"),
 ("app/api/lobby/route.ts","lib/lobbySnapshot.ts"),
 ("lib/lobbySnapshot.ts","lib/bets.ts"),
 ("app/api/live-games/route.ts","lib/betMarketEnsureQueue.ts"),
 ("app/api/bets/route.ts","lib/betMarketEnsureQueue.ts"),
 ("lib/betMarketEnsureQueue.ts","lib/bets.ts"),
)

ONESHOT_SERVICES=frozenset("""
aoe2hdbets-bet-stake-reconcile.service
aoe2hdbets-bet-stake-reconcile-plan.service
aoe2hdbets-challenge-reconcile.service
aoe2hdbets-replay-auto-recovery.service
aoe2hdbets-staking-rewards.service
aoe2hdbets-trophy-tributes.service
aoe2-wolo-transfer-heartbeat.service
aoe2war-prewarm.service
""".split())
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
 if record["state"]=="active" and name.endswith(".service") and name not in ONESHOT_SERVICES:
  require(pid>1,"active persistent settlement/HD/DE process has no real PID: "+name)
 if pid:
  require(type(record.get("start_time_ticks"))is int and
          record["start_time_ticks"]>0 and sha(record.get("executable_sha256")) and
          type(record.get("uid"))is int and record["uid"]>=0 and
          sha(record.get("process_cgroup_sha256")) and
          type(record.get("declared_user"))is str,
          "running process UID/cgroup/start/executable not authenticated: "+name)
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
 require(census.get("additional_units_review_sha256")==
         hashlib.sha256(canonical(approved)).hexdigest(),
         "additional-writer review is not bound to exact approved unit names")
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
  if name=="HEAD":
   # HEAD may dispatch GET handlers in the Next runtime; an empty
   # unresolved list is insufficient without native handler review.
   require(record.get("routing_mode")=="NATIVE_HEAD_HANDLER_SEMANTICS_REVIEWED" and
           sha(record.get("handler_semantics_sha256")) and
           sha(record.get("get_fallback_trace_sha256")),
           "HEAD handler/GET fallback runtime semantics unverified")
 require(sha(census.get("native_snapshot_sha256")) and
         census.get("unit_inventory_sha256")==hashlib.sha256(canonical(units)).hexdigest(),
         "writer inventory changed after native observation")
 return census

def verify_closed_graph(scope):
 """Verify signed graph edges, GET/HEAD/prewarm coverage and changed-to-writer paths.

 Native auditor MUST recompute complete graph from exact source and runtime.
 Signed graph bytes are inspectable; graph hashes alone do not prove closure.
 """
 graph=scope.get("graph")
 require(type(graph)is dict and set(graph)=={"nodes","edges","changed_nodes",
         "writer_nodes","routes"},"transitive source graph bytes absent")
 nodes,edges=graph["nodes"],graph["edges"]
 require(type(nodes)is list and all(type(n)is str and bool(n) for n in nodes)
         and len(nodes)==len(set(nodes)) and 0<len(nodes)<=4000,
         "invalid/repeated dependency nodes")
 node_set=set(nodes)
 require(type(edges)is list and 0<len(edges)<=15000 and
         all(type(e)is list and len(e)==2 and
             all(type(n)is str and n in node_set for n in e) for e in edges)
         and len(edges)==len({tuple(e) for e in edges}),
         "invalid/partial dependency edges")
 changed=graph["changed_nodes"];writers=graph["writer_nodes"];routes=graph["routes"]
 require(type(changed)is list and bool(changed) and
         len(changed)==len(set(changed)) and set(changed)<=node_set and
         changed==scope.get("changed_files"),
         "source graph does not match actual changed files")
 require(type(writers)is list and len(writers)==len(set(writers)) and
         set(writers)<=node_set and
         {"aoe2hdbets-staking-rewards.service",
          "wolochain-mainnet-settlement.service",
          "wolochain-founder-rewards-settlement.service"}<=set(writers),
         "protected finance writer nodes excluded")
 require(type(routes)is dict and set(routes)==REQUIRED_ROUTES and
         all(type(v)is list and bool(v) and len(v)==len(set(v)) and
             set(v)<=node_set for v in routes.values()),
         "GET/HEAD/PREWARM entrypoints not enumerated")
 require(scope.get("dependency_graph_sha256")==hashlib.sha256(
         canonical(graph)).hexdigest() and
         scope.get("import_edges_sha256")==hashlib.sha256(
         canonical(edges)).hexdigest() and
         scope.get("get_head_effects_sha256")==hashlib.sha256(
         canonical({"GET":routes["GET"],"HEAD":routes["HEAD"]})).hexdigest() and
         scope.get("prewarm_effects_sha256")==hashlib.sha256(
         canonical(routes["PREWARM"])).hexdigest(),
         "graph/import/GET/prewarm hashes do not bind actual edges")
 if scope.get("candidate_sha")==W1_SHA:
  # A fabricated safe-looking W1 graph that drops actual financial GET
  # wakeups must never pass. These are original W1 read-side-effect paths.
  missing=set(W1_PUBLIC_FINANCIAL_EDGES)-{tuple(e)for e in edges}
  require(not missing and "lib/bets.ts" in set(writers),
          "frozen W1 GET/prewarm financial wakeup edges omitted: "+str(sorted(missing)))
 adjacency={n:set() for n in nodes}
 for a,b in edges:adjacency[a].add(b)
 # An edge list is not a route proof if its GET/prewarm entrypoints are
 # disconnected from the edges. Require known W1 read-wakeup reachability.
 if scope.get("candidate_sha")==W1_SHA:
  known_get={"app/page.tsx","app/api/lobby/route.ts",
             "app/api/live-games/route.ts","app/api/bets/route.ts"}
  known_prewarm="scripts/prewarm-production.mjs"
  require(known_get<=set(routes["GET"]) and
          known_get<=set(routes["HEAD"]) and
          known_prewarm in routes["PREWARM"],
          "frozen W1 public financial entrypoints hidden from signed route inventory")
  def reaches(origin,target):
   pending=[origin];seen=set()
   while pending:
    node=pending.pop()
    if node==target:return True
    if node in seen:continue
    seen.add(node);pending.extend(adjacency[node]-seen)
   return False
  require(all(reaches(source,"lib/bets.ts") for source in known_get|
              {known_prewarm}),
          "frozen W1 public read/prewarm route omitted transitive settlement edge")
  declared=scope.get("read_side_effect_policy")
  require(type(declared)is dict and
          declared=={"GET":"FINANCIAL_WRITER_REACHABLE_NO_READ_ONLY_CLAIM",
                     "PREWARM":"FINANCIAL_WRITER_REACHABLE_NO_READ_ONLY_CLAIM",
                     "HEAD":"FINANCIAL_WRITER_REACHABLE_NO_READ_ONLY_CLAIM"},
          "frozen W1 financial read route misclassified as inert")
 targets=set(writers)
 for origin in changed:
  stack=[origin];seen=set()
  while stack:
   node=stack.pop()
   if node in seen:continue
   require(node not in targets,
           "changed source transitively reaches finance writer: "+origin)
   seen.add(node);stack.extend(adjacency[node]-seen)
 return graph

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
 verify_closed_graph(scope)
 # Two separately signed native sources must agree on the exact route DAG.
 # Otherwise a finance producer could omit an effect that source did record.
 side=census["side_effects"]
 require(all(side[verb]["route_graph_sha256"]==
             scope["get_head_effects_sha256"] for verb in ("GET","HEAD")) and
         side["PREWARM"]["route_graph_sha256"]==
             scope["prewarm_effects_sha256"],
         "signed financial GET/HEAD/PREWARM graph conflicts with signed source DAG")
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
 from aoe2_solo_website_native_audit_adapter import verify_financial_identity
 for label,report in (("before",before),("after",after)):
  require(type(report)is dict and
          report.get("status")=="INDEPENDENT_NATIVE_VERIFIED" and
          type(report.get("finance"))is dict,
          "rollback "+label+" native finance UNKNOWN")
  # Validate all six machine/producer Ed25519 receipts, NOT just SHA strings.
  verify_all(report)
  require(report["receipt_provenance"]["signed_producers"]["finance"]["payload"]["observed_at"]==
          report.get("observed_at"),
          "finance signature timestamp not bound to native observation")
  verify_financial_identity(report["finance"])
 # A copied PRE_ACTIVATE receipt cannot impersonate a post-failure capture.
 # Each boundary is separately signed by the enrolled finance producer.
 from aoe2_solo_website_root_phase import utc
 require(before.get("phase")=="PRE_ACTIVATE" and
         after.get("phase")=="POST_ROLLBACK" and
         type(before.get("observed_at"))is str and
         type(after.get("observed_at"))is str and
         utc(after["observed_at"])>utc(before["observed_at"]) and
         before["receipt_provenance"]["signed_producers"]["finance"]["signature_base64"]!=
         after["receipt_provenance"]["signed_producers"]["finance"]["signature_base64"],
         "replayed/undifferentiated native finance rollback observations")
 a,b=before["finance"],after["finance"]
 require(a.get("protected")==b.get("protected") and
         a.get("exposure")==b.get("exposure"),
         "financial writers or balances/pending/liabilities changed during rollback")
 require(before.get("candidate_sha")==after.get("candidate_sha") and
         before.get("attempt_id")==after.get("attempt_id"),
         "financial before/after evidence from different release attempts")
 return "ROLLED_BACK_WEB_AND_FINANCE_NATIVE_VERIFIED"

def verify_installed_source_review(report,review_bytes):
 """Bind signed native graph to a distinct root-enrolled reviewer artifact.

 The owner must separately copy/enroll the exact review file on HEL1 and
 authenticate its reviewer. Merely pasting a GitHub URL is NOT reviewer proof.
 """
 require(type(review_bytes)is bytes and 0<len(review_bytes)<=65536,
         "root-enrolled source review absent")
 scope=verify_source_closure(report)
 require(scope["source_review_sha256"]==hashlib.sha256(review_bytes).hexdigest(),
         "installed source review is not native signed review")
 def unique(pairs):
  out={}
  for key,value in pairs:
   require(key not in out,"duplicate source-review JSON property")
   out[key]=value
  return out
 try:review=json.loads(review_bytes,object_pairs_hook=unique)
 except (ValueError,UnicodeError,TypeError) as exc:
  raise FinancialProofHold("invalid installed source review") from exc
 require(type(review)is dict and
         review.get("kind")=="aoe2war.solo.website.source-review.v1" and
         review.get("status")=="INDEPENDENTLY_REVIEWED" and
         review.get("candidate_sha")==report["candidate_sha"],
         "foreign/unreviewed source review")
 for review_key,scope_key in (
  ("transitive_closure_sha256","dependency_graph_sha256"),
  ("source_tree_sha256","source_tree_sha256"),
  ("manifest_sha256","manifest_sha256"),
  ("import_edges_sha256","import_edges_sha256"),
  ("finance_surface_sha256","finance_surface_sha256"),
  ("get_head_effects_sha256","get_head_effects_sha256"),
  ("prewarm_effects_sha256","prewarm_effects_sha256"),
  ("writer_census_sha256","writer_census_sha256")):
  require(review.get(review_key)==scope.get(scope_key) and
          sha(review.get(review_key)),
          "native closure diverges from independent review: "+review_key)
 for key in ("unresolved_import_edges","changed_financial_writers",
             "financial_migration_paths","unchecked_producer_edges",
             "unreviewed_get_side_effects","unreviewed_prewarm_side_effects"):
  require(review.get(key)==[],"independent source review has unchecked edges: "+key)
 require(review.get("changed_files")==scope.get("changed_files"),
         "native graph changes differ from independent review")
 require(review.get("reviewed_additional_units")==
         report["finance"]["protected"]["writers"]["native_census"]["reviewed_additional_units"],
         "additional financial writers not independently reviewed")
 return review
