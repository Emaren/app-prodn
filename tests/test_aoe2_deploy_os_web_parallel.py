"""R25 D policy tests: synthetic witness callback is NEVER a production approver."""
import copy, hashlib, importlib.util, os, tempfile, unittest
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/"scripts"/"aoe2_deploy_os_web_parallel.py"
spec=importlib.util.spec_from_file_location("deploy_os_parallel",SRC)
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
PINS={"B":"b"*40,"C":"c"*40,"D":"d"*40,"E":"e"*40,"F":"f"*40,"G":"a"*40}
def plan():
    return dict(schema=1,policy=p.POLICY,attempt_id="a"*32,candidate_sha=p.SITE,
                controller_sha=p.CONTROLLER,old_sha="9"*40,old_build_id="old-build",
                old_pid=2625090,old_start_ticks=991,old_service="aoe2hdbets-web.service",
                old_port=3030,new_service="aoe2hdbets-web-r24.service",new_port=3031,
                original_lock=list(p.LOCK),original_owner_rsa_spki=p.OLD_RSA,
                nginx_preimage_sha256="1"*64,source_reviews=dict(PINS))
def facts(role,pl):
    if role=="F_SOURCE_PIN":return dict(candidate_sha=p.SITE,old_pid=pl["old_pid"])
    if role=="C_SOURCE_BUILD":return dict(candidate_sha=p.SITE,artifact_sha256="a"*64,next_build_id="next-build")
    if role=="E_ROLLBACK_CAPACITY":return dict(root_available_bytes=15*2**30,candidate_peak_bytes=5*2**30,
                                            reserve_bytes=4*2**30,rollback_sha256="b"*64,readback_sha256="b"*64)
    if role=="B_ISOLATED":return dict(candidate_sha=p.SITE,db_role="SELECT_ONLY",wargraph_disabled=True,
                                       finance_secrets=False,finance_write_routes=[],unknown_startup_edges=[])
    if role=="C_3031_RUNNING":return dict(new_port=3031,new_service="aoe2hdbets-web-r24.service",
            new_pid=4321,old_pid=pl["old_pid"],old_start_ticks=pl["old_start_ticks"],
            next_build_id="next-build",artifact_sha256="a"*64)
    if role=="B_RUNTIME":return dict(db_role="SELECT_ONLY",finance_secrets=False)
    if role=="F_NGINX_ROUTE":return dict(route_receipt_sha256="c"*64,
            nginx_preimage_sha256=pl["nginx_preimage_sha256"],public_port=3031,
            old_route_preserved=True,old_pid=pl["old_pid"])
    if role=="OWNER_CONSENT":return dict(typed_phrase_sha256=p.hashstr(p.owner_text(pl,"c"*64)),
                                         root_nonce_verified=True,original_release_lock_held=True)
    if role=="B_CONTINUITY":return dict(finance_processes_unchanged=True,listeners_8092_8093_unchanged=True,
                                         old_pid=pl["old_pid"])
    if role=="G_PUBLIC_INTERNAL":return dict(public_get_ok=True,internal_get_ok=True)
    if role=="G_BUILD_PID":return dict(candidate_sha=p.SITE,new_port=3031,old_pid=pl["old_pid"],
                                        next_build_id="next-build",artifact_sha256="a"*64)
    if role=="F_ROLLBACK":return dict(rollback_exercised=True,route_restorable=True,
                                      rollback_receipt_sha256="d"*64,rollback_sha256="b"*64)
    if role=="F_RESTORE_NGINX":return dict(public_port=3030,old_pid=pl["old_pid"])
    if role=="G_OLD_BUILD":return dict(public_build_id=pl["old_build_id"])
    raise AssertionError(role)
class Fixture:
    def __init__(self):
        self.plan=plan();self.observed={};self.n=0
    def refs(self,stage):
        x={}
        for role in p.ROLES[stage]:
            self.n+=1;ref=hashlib.sha256(f"{stage}/{role}/{self.n}".encode()).hexdigest()
            self.observed[ref]=(role,facts(role,self.plan));x[role]=ref
        return x
    def verify(self,role,ref,hash_):
        r,d=self.observed[ref]
        return dict(role=r,record_sha256=ref,plan_sha256=hash_,
                    review_source_sha=self.plan["source_reviews"]["F" if role=="OWNER_CONSENT" else role[0]],
                    facts=copy.deepcopy(d))
    def walk(self,stages):
        a=[]
        for stage in stages:a.append(p.transition(self.plan,a,stage,self.refs(stage),self.verify))
        return a
class DeployOSPolicyTests(unittest.TestCase):
    def test_01_pins_and_parallel_only(self):
        a=plan();self.assertEqual(len(p.plan_check(a)),64)
        a["new_port"]=3030
        with self.assertRaisesRegex(p.Hold,"ROOT_LOCK_OR_NGINX_DRIFT"):p.plan_check(a)
    def test_02_no_unknown_review_sources(self):
        a=plan();a["source_reviews"]["B"]=None
        with self.assertRaisesRegex(p.Hold,"SIX_LANE_SOURCE_REVIEWS_MISSING"):p.plan_check(a)
    def test_03_no_source_without_external_verifier(self):
        f=Fixture()
        with self.assertRaisesRegex(p.Hold,"TRUSTED_F_EVIDENCE_VERIFIER_REQUIRED"):
            p.transition(f.plan,[],"SOURCE",f.refs("SOURCE"))
    def test_04_full_synthetic_path(self):
        f=Fixture();a=f.walk(p.STATES[:7])
        self.assertEqual([x["to_state"] for x in a],list(p.STATES[:7]))
        self.assertEqual(a[-1]["priority"],"P0")
    def test_05_no_skipped_isolation(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED"))
        with self.assertRaisesRegex(p.Hold,"ILLEGAL_STAGE_TRANSITION"):
            p.transition(f.plan,a,"RUNNING",f.refs("RUNNING"),f.verify)
    def test_06_b_readonly_db_required(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED"));r=f.refs("ISOLATED")
        f.observed[r["B_ISOLATED"]][1]["db_role"]="superuser"
        with self.assertRaisesRegex(p.Hold,"B_NONFINANCIAL_ISOLATION_UNPROVEN"):
            p.transition(f.plan,a,"ISOLATED",r,f.verify)
    def test_07_b_wargraph_disabled(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED"));r=f.refs("ISOLATED")
        f.observed[r["B_ISOLATED"]][1]["wargraph_disabled"]=False
        with self.assertRaisesRegex(p.Hold,"B_NONFINANCIAL_ISOLATION_UNPROVEN"):
            p.transition(f.plan,a,"ISOLATED",r,f.verify)
    def test_08_e_real_bytes_not_boolean(self):
        f=Fixture();a=f.walk(("SOURCE",));r=f.refs("STAGED")
        f.observed[r["E_ROLLBACK_CAPACITY"]][1]["root_available_bytes"]=1
        with self.assertRaisesRegex(p.Hold,"E_ACTUAL_CAPACITY"):
            p.transition(f.plan,a,"STAGED",r,f.verify)
    def test_09_e_rollback_sha_readback(self):
        f=Fixture();a=f.walk(("SOURCE",));r=f.refs("STAGED")
        f.observed[r["E_ROLLBACK_CAPACITY"]][1]["readback_sha256"]="1"*64
        with self.assertRaisesRegex(p.Hold,"E_ACTUAL_CAPACITY"):
            p.transition(f.plan,a,"STAGED",r,f.verify)
    def test_10_old_web_pid_must_survive(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED"));r=f.refs("RUNNING")
        f.observed[r["C_3031_RUNNING"]][1]["old_pid"]=2
        with self.assertRaisesRegex(p.Hold,"C_PARALLEL_PID"):
            p.transition(f.plan,a,"RUNNING",r,f.verify)
    def test_11_staged_build_cannot_change(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED"));r=f.refs("RUNNING")
        f.observed[r["C_3031_RUNNING"]][1]["next_build_id"]="other"
        with self.assertRaisesRegex(p.Hold,"STAGED_ARTIFACT_BUILD_MISMATCH"):
            p.transition(f.plan,a,"RUNNING",r,f.verify)
    def test_12_owner_consent_exact_plan(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING"));r=f.refs("ROUTED")
        f.observed[r["OWNER_CONSENT"]][1]["typed_phrase_sha256"]="e"*64
        with self.assertRaisesRegex(p.Hold,"F_ROUTE_OR_EXPLICIT_OWNER"):
            p.transition(f.plan,a,"ROUTED",r,f.verify)
    def test_13_original_lock_must_be_held(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING"));r=f.refs("ROUTED")
        f.observed[r["OWNER_CONSENT"]][1]["original_release_lock_held"]=False
        with self.assertRaisesRegex(p.Hold,"F_ROUTE_OR_EXPLICIT_OWNER"):
            p.transition(f.plan,a,"ROUTED",r,f.verify)
    def test_14_wolo_finance_invariant(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING"));r=f.refs("ROUTED")
        f.observed[r["B_CONTINUITY"]][1]["listeners_8092_8093_unchanged"]=False
        with self.assertRaisesRegex(p.Hold,"FINANCIAL_OR_WOLO_DRIFT"):
            p.transition(f.plan,a,"ROUTED",r,f.verify)
    def test_15_g_actual_public_check(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING","ROUTED"));r=f.refs("VERIFIED")
        f.observed[r["G_PUBLIC_INTERNAL"]][1]["public_get_ok"]=False
        with self.assertRaisesRegex(p.Hold,"G_ACTUAL_LIVE"):
            p.transition(f.plan,a,"VERIFIED",r,f.verify)
    def test_16_rollback_receipt_required(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING","ROUTED","VERIFIED"));r=f.refs("CERTIFIED")
        f.observed[r["F_ROLLBACK"]][1]["rollback_exercised"]=False
        with self.assertRaisesRegex(p.Hold,"F_ROLLBACK_NOT_CERTIFIED"):
            p.transition(f.plan,a,"CERTIFIED",r,f.verify)
    def test_17_rollback_stage_identity_bound(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING","ROUTED","VERIFIED"));r=f.refs("CERTIFIED")
        f.observed[r["F_ROLLBACK"]][1]["rollback_sha256"]="f"*64
        with self.assertRaisesRegex(p.Hold,"CERT_ROLLBACK_SOURCE_CHANGED"):
            p.transition(f.plan,a,"CERTIFIED",r,f.verify)
    def test_18_real_rollback_only_from_routed(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED","ISOLATED","RUNNING","ROUTED"))
        self.assertEqual(p.transition(f.plan,a,"ROLLED_BACK",f.refs("ROLLED_BACK"),f.verify)["to_state"],"ROLLED_BACK")
    def test_19_scoped_hold_and_no_jump(self):
        f=Fixture();a=f.walk(("SOURCE","STAGED"))
        a.append(p.transition(f.plan,a,"HOLD",blocker={"subsystem":"FINANCE","code":"READONLY_ROLE","evidence_sha256":None}))
        self.assertEqual(a[-1]["priority"],"P1")
        with self.assertRaisesRegex(p.Hold,"P1_REOPEN_ONLY_PREVIOUS_STAGE"):
            p.transition(f.plan,a,"ISOLATED",resolution_ref="a"*64)
    def test_20_ledger_atomic_chain(self):
        f=Fixture()
        with tempfile.TemporaryDirectory() as td:
            d=Path(td)/"journal";d.mkdir(mode=0o700)
            j=p.Journal(d,owner_uid=os.geteuid())
            x=j.append(f.plan,"SOURCE",f.refs("SOURCE"),f.verify)
            y=j.append(f.plan,"STAGED",f.refs("STAGED"),f.verify)
            self.assertEqual(y["previous_sha256"],x["event_sha256"])
            self.assertEqual(len(j.read()),2)
            with self.assertRaisesRegex(p.Hold,"ILLEGAL_STAGE"):
                j.append(f.plan,"CERTIFIED",f.refs("CERTIFIED"),f.verify)
            self.assertEqual(len(j.read()),2)
    def test_21_ledger_tamper_fails(self):
        f=Fixture()
        with tempfile.TemporaryDirectory() as td:
            d=Path(td)/"journal";d.mkdir(mode=0o700);j=p.Journal(d,owner_uid=os.geteuid())
            j.append(f.plan,"SOURCE",f.refs("SOURCE"),f.verify)
            (d/"00000000.json").write_text("{}\n")
            with self.assertRaises(p.Hold):j.read()
    def test_22_p3_not_p0_dependency(self):
        t=dict(schema=p.TASK,task_id="B-1",lane="B",session_id="owner-relayed-B",
               priority="P0",objective="Certify DB SELECT-only",depends_on=[],status="QUEUED",
               source_sha=p.SITE,evidence_refs=[],reviewed_by=[],timestamp=p.utc(),blockers=[])
        self.assertEqual(len(p.task_check(t)),64)
        t["blockers"]=[{"subsystem":"ORCHESTRATION","code":"FLEET_COUNT","evidence_sha256":None}]
        with self.assertRaisesRegex(p.Hold,"P3_MUST_NOT_BLOCK_P0"):p.task_check(t)
    def test_23_source_never_mutates_production(self):
        text=SRC.read_text()
        self.assertNotIn("subprocess.run(",text)
        self.assertNotIn("systemctl restart",text)
        self.assertNotIn("git reset --hard",text)
if __name__=="__main__":unittest.main()
