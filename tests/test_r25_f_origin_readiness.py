"""A05 regressions: loaded selectors alone never certify a public cutover."""
import base64,contextlib,importlib.util,json,pathlib,tempfile,time,unittest
from datetime import datetime,timezone
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("r25_f_origin",ROOT/"scripts/aoe2_r24_f_parallel_nginx_cutover.py")
s=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(s)

class Clock:
    def __init__(self):self.now=100.0
    def monotonic(self):return self.now
    def sleep(self,seconds):self.now+=seconds

class OriginReadiness(unittest.TestCase):
    asset={"path":"/_next/static/candidate-build/_buildManifest.js","bytes":8,"sha256":s.sha(b"manifest")}
    def wait(self,probe,guard=lambda:None):
        clock=Clock()
        with mock.patch.object(s.time,"monotonic",clock.monotonic),mock.patch.object(s.time,"sleep",clock.sleep),\
             mock.patch.object(s,"surface_get",side_effect=probe),\
             mock.patch.object(s,"bounded_guard",side_effect=lambda fn,deadline:fn()):
            return s.wait_runtime("candidate-version","previous-version",self.asset,guard)
    def probe(self,versions,static=b"manifest"):
        replies=iter(versions)
        def get(surface,path,maximum,deadline):
            data=s.canonical({"buildVersion":next(replies)}) if path=="/api/deployment-version" else static
            return data,{"surface":surface,"url":s.PUBLIC+path,"fresh_connection":True}
        return get
    def test_exact_failed_public_stale_first_then_two_converged_samples(self):
        # Historical selectors were candidate-loaded while first edge read old.
        result=self.wait(self.probe(["candidate-version","previous-version"]+["candidate-version"]*4))
        self.assertEqual(len(result["samples"]),3)
        first=result["samples"][0]
        self.assertEqual((first["origin_version"],first["public_version"]),("candidate-version","previous-version"))
        self.assertEqual(first["status"],"PENDING")
        self.assertEqual(result["samples"][-1]["consecutive_matches"],2)
        self.assertIn("observed_at",first);self.assertIn("elapsed_seconds",first)
    def test_origin_old_edge_new_is_not_a_match(self):
        result=self.wait(self.probe(["previous-version","candidate-version"]+["candidate-version"]*4))
        self.assertEqual(result["samples"][0]["status"],"PENDING")
    def test_persistent_origin_new_edge_old_times_out(self):
        def get(surface,path,maximum,deadline):
            return s.canonical({"buildVersion":"candidate-version" if surface=="origin" else "previous-version"}),{}
        with self.assertRaisesRegex(s.Hold,"ORIGIN_PUBLIC_READINESS_TIMEOUT") as caught:self.wait(get)
        self.assertTrue(caught.exception.readiness_observations)
    def test_permanently_stale_origin_times_out(self):
        def get(surface,path,maximum,deadline):return s.canonical({"buildVersion":"previous-version"}),{}
        with self.assertRaisesRegex(s.Hold,"READINESS_TIMEOUT"):self.wait(get)
    def test_unknown_version_fails_immediately(self):
        with self.assertRaisesRegex(s.Hold,"UNKNOWN_BUILD_VERSION"):
            self.wait(self.probe(["unapproved-build"]))
    def test_incorrect_static_bytes_fail_even_with_two_new_versions(self):
        with self.assertRaisesRegex(s.Hold,"BUILD_STATIC_BYTES_DRIFT"):
            self.wait(self.probe(["candidate-version"]*2,b"otherbytes"))
    def test_mixed_selectors_guard_fails_before_any_network_read(self):
        network=mock.Mock()
        with self.assertRaisesRegex(s.Hold,"MIXED_SELECTORS"):
            self.wait(network,lambda:(_ for _ in ()).throw(s.Hold("MIXED_SELECTORS")))
        network.assert_not_called()
    def test_match_followed_by_stale_resets_convergence(self):
        result=self.wait(self.probe(["candidate-version"]*2+["previous-version"]*2+["candidate-version"]*4))
        self.assertEqual([row.get("consecutive_matches",0) for row in result["samples"]],[1,0,1,2])
    def test_probe_deadline_bounds_a_hung_read_only_worker(self):
        started=time.monotonic()
        with self.assertRaisesRegex(s.ReadinessPending,"READINESS_DEADLINE"):
            s.bounded_readiness_call(lambda:(time.sleep(.8) or b"late"),128,time.monotonic()+.08)
        self.assertLess(time.monotonic()-started,.5)
    def test_origin_uses_verified_public_sni_on_loopback_tcp(self):
        connection=s.OriginTLSConnection(2)
        raw=mock.Mock()
        with mock.patch.object(s.socket,"create_connection",return_value=raw) as tcp,\
             mock.patch.object(connection._context,"wrap_socket",return_value=mock.Mock()) as tls:
            connection.connect()
        tcp.assert_called_once_with(("127.0.0.1",443),2)
        tls.assert_called_once_with(raw,server_hostname="aoe2war.com")
        self.assertTrue(connection._context.check_hostname)
        self.assertEqual(connection._context.verify_mode,s.ssl.CERT_REQUIRED)
    def test_public_requires_real_edge_provenance_and_records_fresh_tls_peer(self):
        for cf in (True,False):
            with self.subTest(cloudflare=cf):
                conn=mock.Mock();conn.sock.getpeername.return_value=("104.21.1.2",443)
                response=conn.getresponse.return_value;response.status=200;response.read.return_value=b"version"
                headers={"server":"cloudflare" if cf else "nginx","cf-ray":"abc123-AMS","cf-cache-status":"DYNAMIC"}
                response.getheader.side_effect=lambda key:headers.get(key)
                with mock.patch.object(s.http.client,"HTTPSConnection",return_value=conn):
                    if not cf:
                        with self.assertRaisesRegex(s.Hold,"CLOUDFLARE_RESPONSE_PROVENANCE_REQUIRED"):
                            s.direct_surface_get("public","/api/deployment-version",8192,time.monotonic()+3)
                    else:
                        result=s.parse(s.direct_surface_get("public","/api/deployment-version",8192,time.monotonic()+3))
                        proof=result["provenance"]
                        self.assertEqual(proof["peer"],["104.21.1.2",443])
                        self.assertEqual(proof["headers"]["cf-cache-status"],"DYNAMIC")
                        self.assertTrue(proof["fresh_connection"])
                        self.assertLessEqual(proof["requested_at"],proof["completed_at"])
                conn.close.assert_called_once()
    def test_success_and_failed_rollback_are_both_durably_recorded(self):
        for succeeds in (True,False):
            with self.subTest(succeeds=succeeds),tempfile.TemporaryDirectory() as directory,\
                 mock.patch.object(s,"protected_dir"):
                record=pathlib.Path(directory)
                def restore():
                    if not succeeds:raise s.Hold("ORIGIN_STILL_NEW")
                    return {"status":"OLD_ORIGIN_AND_EDGE_PROVEN"}
                result=s.record_failed_cutover(record,s.Hold("PUBLIC_STALE"),restore)
                self.assertEqual(json.loads((record/"failure.json").read_bytes())["reason"],"PUBLIC_STALE")
                self.assertTrue((record/"automatic-rollback-attempt.json").is_file())
                durable=json.loads((record/"automatic-rollback.json").read_bytes())
                self.assertEqual(durable,result)
                self.assertEqual(result["status"],"ORIGINAL_PROXY_RUNTIME_RESTORED" if succeeds else "ROLLBACK_NOT_PROVEN")
                self.assertFalse((record/"commit.json").exists())
    def test_receipt_failure_never_prevents_protective_rollback(self):
        restore=mock.Mock(return_value={"ok":True})
        with mock.patch.object(s,"durable_write",side_effect=OSError("full")):
            result=s.record_failed_cutover(pathlib.Path("unused"),s.Hold("stale"),restore)
        restore.assert_called_once();self.assertEqual(result["status"],"ORIGINAL_PROXY_RUNTIME_RESTORED")
    def test_consumed_failed_nonce_is_rejected_without_touching_its_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            audit=pathlib.Path(directory);record=audit/("r24-"+s.CONSUMED_NONCE);record.mkdir()
            original=b"historical immutable intent";(record/"intent.json").write_bytes(original)
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),\
                 mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s,"lock_check"),\
                 mock.patch.object(s,"protected_dir"),mock.patch.object(s,"root_file",return_value=b"base"),\
                 mock.patch.object(s,"approval",return_value={"nonce":s.CONSUMED_NONCE}),mock.patch.object(s,"AUDIT_BASE",audit),\
                 mock.patch.object(s,"replace_existing") as write:
                with self.assertRaisesRegex(s.Hold,"REPLAY_OR_PARTIAL_TRANSACTION"):s.apply()
            write.assert_not_called();self.assertEqual((record/"intent.json").read_bytes(),original)
    def test_expired_grant_and_attempt_receipt_disk_failure_do_not_strand_rollback(self):
        # Root-sealed successful transaction already admitted the reversible
        # operation; expiry must block forward writes, never protective restore.
        for receipt_full in (False,True):
            with self.subTest(receipt_full=receipt_full),tempfile.TemporaryDirectory() as directory:
                folder=pathlib.Path(directory);lock=folder/"lock";lock.write_bytes(b"locked")
                nonce="1"*32;base={"nonce":s.CONSUMED_NONCE,"nginx_config":str(s.VHOST),"finance_units":[],
                    "candidate_build_version":s.C_PHYSICAL_APP_VERSION,"previous_build_id":"old-build"}
                new={**base,"nonce":nonce};base_raw=b"immutable-admitted-base";new_raw=s.canonical(new)+b"\n"
                owner={"schema":"aoe2war.r25.f.owner-transaction-authorization.v1",
                    "manifest":{"nonce":nonce,"rollback_authorized":True,"financial_authorized":False,
                                "expires_at":"2000-01-01T00:00:00Z"},"envelope":{"body":"actual admitted owner authorization"}}
                commit={"status":"R24_PARALLEL_WEBSITE_LIVE","candidate_sha":s.TARGET,"nonce":nonce,
                    "old_nginx_sha256":s.sha(b"old-config"),"new_nginx_sha256":s.sha(b"candidate-config"),
                    "base_approved_sha256":s.sha(base_raw),"new_approval_sha256":s.sha(new_raw),
                    "owner_authorization_body_sha256":s.sha(owner["envelope"]["body"].encode())}
                record=folder/("r24-"+nonce)
                files={s.ROOT_APPROVAL:base_raw,s.VHOST:b"candidate-config",record/"approval.json":new_raw,
                       record/"owner-authorization.json":s.canonical(owner),record/"commit.json":s.canonical(commit),
                       record/"before-nginx.conf":b"old-config"}
                writes={}
                def write(path,raw):
                    if receipt_full and path.name=="rollback-attempt.json":raise OSError("full")
                    writes[path.name]=s.parse(raw)
                with contextlib.ExitStack() as stack:
                    for name,value in (("AUDIT_BASE",folder),("LOCK",lock),("BASE_APPROVED_SHA",s.sha(base_raw))):
                        stack.enter_context(mock.patch.object(s,name,value))
                    stack.enter_context(mock.patch.object(s.sys,"platform","linux"))
                    stack.enter_context(mock.patch.object(s.socket,"gethostname",return_value=s.HOST))
                    stack.enter_context(mock.patch.object(s.os,"geteuid",return_value=0))
                    for name in ("lock_check","protected_dir","nginx_loaded_vhost","nginx_reload","fsyncdir","prove_rollback_preimage"):
                        stack.enter_context(mock.patch.object(s,name))
                    stack.enter_context(mock.patch.object(s,"root_file",side_effect=lambda path,limit:files[path]))
                    stack.enter_context(mock.patch.object(s,"approval",return_value=base))
                    stack.enter_context(mock.patch.object(s,"snapshots",return_value={}))
                    stack.enter_context(mock.patch.object(s,"protected_continuity",return_value="same protected state"))
                    stack.enter_context(mock.patch.object(s,"previous_build_asset",return_value=self.asset))
                    stack.enter_context(mock.patch.object(s,"wait_runtime",return_value={"status":"old proven"}))
                    stack.enter_context(mock.patch.object(s,"durable_write",side_effect=write))
                    live_auth=stack.enter_context(mock.patch.object(s,"validate_owner_grant",side_effect=AssertionError("expired auth must not gate rollback")))
                    restore=stack.enter_context(mock.patch.object(s,"replace_existing"))
                    s.manual_rollback(nonce,transaction=True)
                restore.assert_called_once_with(s.VHOST,b"old-config");live_auth.assert_not_called()
                self.assertEqual(writes["rollback.json"]["status"],"OLD_PUBLIC_PROXY_RESTORED")
    def test_expiry_after_durable_intent_prevents_first_nginx_write(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=pathlib.Path(directory);lock=folder/"lock";lock.write_bytes(b"lock");lock.chmod(0o644)
            st=lock.stat();vhost=folder/"nginx.conf";old=b"original nginx";nonce="2"*32
            j={"nonce":nonce,"nginx_config":str(vhost),"nginx_before_sha256":s.sha(old),
               "finance_units":[],"candidate_build_id":s.C_PHYSICAL_BUILD_ID,
               "candidate_build_version":s.C_PHYSICAL_APP_VERSION}
            authorized={"approval":j,"bindings":{},"owner_record":{"manifest":{"expires_at":"2000-01-01T00:00:00Z"}},
                        "refresh":mock.Mock()}
            writes={}
            with contextlib.ExitStack() as stack:
                for name,value in (("AUDIT_BASE",folder),("LOCK",lock),("VHOST",vhost),
                                   ("LOCK_ID",(st.st_dev,st.st_ino,st.st_uid,0o644))):
                    stack.enter_context(mock.patch.object(s,name,value))
                stack.enter_context(mock.patch.object(s.sys,"platform","linux"))
                stack.enter_context(mock.patch.object(s.socket,"gethostname",return_value=s.HOST))
                stack.enter_context(mock.patch.object(s.os,"geteuid",return_value=0))
                for name in ("lock_check","protected_dir","nginx_loaded_vhost","prove_preimage",\
                             "verified_b_poststart","verified_durable_e_rollback","runtime_sample","fsyncdir"):
                    stack.enter_context(mock.patch.object(s,name))
                stack.enter_context(mock.patch.object(s,"root_file",return_value=old))
                stack.enter_context(mock.patch.object(s,"safe_replace_site",return_value=b"candidate nginx"))
                stack.enter_context(mock.patch.object(s,"snapshots",return_value={}))
                stack.enter_context(mock.patch.object(s,"stage_identity",return_value=self.asset))
                stack.enter_context(mock.patch.object(s,"previous_build_asset",return_value=self.asset))
                stack.enter_context(mock.patch.object(s,"http_version",side_effect=[s.PRESERVED_PREVIOUS_VERSION,s.C_PHYSICAL_APP_VERSION]))
                stack.enter_context(mock.patch.object(s,"durable_write",side_effect=lambda p,b:writes.update({p.name:s.parse(b) if p.suffix==".json" else b})))
                stack.enter_context(mock.patch.object(s,"wait_runtime",return_value={"status":"original untouched"}))
                replace=stack.enter_context(mock.patch.object(s,"replace_existing"))
                reload=stack.enter_context(mock.patch.object(s,"nginx_reload"))
                with self.assertRaisesRegex(s.Hold,"OWNER_GRANT_EXPIRED_AT_FORWARD_WRITE"):s.apply(authorized)
            self.assertIn("intent.json",writes);self.assertNotIn("commit.json",writes)
            self.assertEqual(writes["automatic-rollback.json"]["status"],"ORIGINAL_PROXY_RUNTIME_RESTORED")
            replace.assert_not_called();reload.assert_not_called()

class OwnerGrant(unittest.TestCase):
    def fixture(self):
        sources={name:name.encode() for name in ("engine","owner","g")}
        plan={"nonce":"1"*32,"source_sha":"a"*40,"base_approved_sha256":s.BASE_APPROVED_SHA,
              "before_witness_sha256":s.PRESERVED_BEFORE_SHA,"candidate_sha":s.TARGET,
              "candidate_build_id":s.C_PHYSICAL_BUILD_ID,"candidate_build_version":s.C_PHYSICAL_APP_VERSION,
              "nginx_before_sha256":s.CONSUMED_BEFORE_SHA,"nginx_after_sha256":"b"*64,
              **{name+"_source_sha256":s.sha(raw) for name,raw in sources.items()}}
        envelope={"plan":plan,"plan_sha256":s.sha(s.canonical(plan))}
        grant={**plan,"schema":"aoe2war.r25.f.owner-transaction-grant.v1","scope":"A05_NGINX_ONLY_PUBLIC_CUTOVER",
               "decision":"AUTHORIZE","owner_login":"Emaren","release_authority":"OWNER_ONLY_NONFINANCIAL",
               "owner_delegated_decisions":True,"delegated_ai_authorship_disclosed":True,"independent_review":False,
               "financial_authorized":False,"public_cutover_authorized":True,"rollback_authorized":True,"max_uses":1,
               "issued_at":"2026-11-02T15:00:00Z","expires_at":"2026-11-02T15:10:00Z",
               "plan_sha256":envelope["plan_sha256"],"exact_head_ci":{"run_id":100,"head_sha":plan["source_sha"],
               "conclusion":"success","all_three_jobs_success":True}}
        obj={"id":123,"html_url":"https://github.com/Emaren/app-prodn/issues/1108#issuecomment-123",
             "issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1108","user":{"login":"Emaren","id":15059910},
             "created_at":"2026-11-02T15:00:01Z","updated_at":"2026-11-02T15:00:01Z"}
        def rebuild():obj["body"]="R25_F_OWNER_TRANSACTION_GRANT\n```json\n"+json.dumps(grant)+"\n```"
        rebuild()
        def api(endpoint):
            if endpoint=="issues/comments/123":return obj
            if endpoint=="actions/runs/100":return {"head_sha":plan["source_sha"],"name":"AoE2WAR CI","status":"completed","conclusion":"success"}
            if endpoint.startswith("actions/runs/100/jobs"):
                return {"total_count":3,"jobs":[{"name":name,"status":"completed","conclusion":"success"} for name in
                    ("Release and documentation control plane","Type, contract, and production build","Isolated Steam-rating PostgreSQL chronology")]}
            for name,raw in sources.items():
                file={"engine":"aoe2_r24_f_parallel_nginx_cutover.py","owner":"aoe2_r24_f_parallel_nginx_mac.py","g":"aoe2_r25_f_g_parallel_observer.py"}[name]
                if endpoint.startswith("contents/scripts/"+file+"?"):
                    return {"type":"file","encoding":"base64","content":base64.b64encode(raw).decode()}
            raise AssertionError(endpoint)
        return obj,grant,envelope,rebuild,api
    def validate(self,obj,envelope,api,instant="2026-11-02T15:01:00+00:00"):
        with mock.patch.object(s,"github_read",side_effect=api):
            return s.validate_owner_grant("123",s.sha(obj["body"].encode()),envelope,datetime.fromisoformat(instant))
    def test_actual_owner_comment_ci_and_all_three_sources_bound(self):
        obj,grant,envelope,rebuild,api=self.fixture()
        result=self.validate(obj,envelope,api)
        self.assertEqual(result["manifest"],grant);self.assertEqual(result["envelope"]["author_id"],15059910)
    def test_expired_or_edited_or_wrong_owner_cannot_authorize(self):
        for defect in ("expired","edited","owner","financial","source","overlong","independent"):
            with self.subTest(defect=defect):
                obj,grant,envelope,rebuild,api=self.fixture()
                if defect=="expired":grant["expires_at"]="2026-11-02T15:00:30Z"
                elif defect=="edited":obj["updated_at"]="2026-11-02T15:00:02Z"
                elif defect=="owner":obj["user"]["id"]=2
                elif defect=="financial":grant["financial_authorized"]=True
                elif defect=="source":grant["engine_source_sha256"]="0"*64
                elif defect=="overlong":grant["expires_at"]="2026-11-02T15:11:00Z"
                elif defect=="independent":grant["independent_review"]=True
                rebuild()
                with self.assertRaises(s.Hold):self.validate(obj,envelope,api)
    def test_failed_actual_ci_or_wrong_remote_source_cannot_authorize(self):
        for bad in ("ci","source"):
            with self.subTest(bad=bad):
                obj,grant,envelope,rebuild,api=self.fixture()
                def altered(endpoint):
                    result=api(endpoint)
                    if bad=="ci" and endpoint=="actions/runs/100":result["conclusion"]="failure"
                    if bad=="source" and endpoint.startswith("contents/"):result["content"]=base64.b64encode(b"changed").decode()
                    return result
                with self.assertRaises(s.Hold):self.validate(obj,envelope,altered)

if __name__=="__main__":unittest.main()
