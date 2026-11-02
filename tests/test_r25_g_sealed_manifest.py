"""Consume accepted C proof without repeating its87,038-file readback."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("g_sealed",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class AcceptedManifest(unittest.TestCase):
    def fixture(self):
        static=".next/static/"+g.C_PHYSICAL_BUILD_ID+"/_buildManifest.js"
        files={"r24-source-sha":(g.TARGET+"\n").encode(),
               ".next/BUILD_ID":(g.C_PHYSICAL_BUILD_ID+"\n").encode(),
               ".aoe2war-build-version":(g.C_PHYSICAL_APP_VERSION+"\n").encode(),
               static:b"self.__BUILD_MANIFEST={};"}
        rows=[{"path":path,"type":"file","size":len(raw),"sha256":g.digest(raw)}
              for path,raw in files.items()]
        tree=g.digest(g.canon(rows))
        srcrows=[]
        source={"status":"SOURCE_STAGED","candidate_sha":g.TARGET,
                "git_archive_sha256":g.ARCHIVE_SHA,"source_manifest_sha256":g.digest(g.canon(srcrows))}
        built={"status":"BUILD_STAGED","candidate_sha":g.TARGET,
               "source_git_archive_sha256":g.ARCHIVE_SHA,"tree_sha256":tree,
               "files":len(rows),"build_id":g.C_PHYSICAL_BUILD_ID,
               "build_version":g.C_PHYSICAL_APP_VERSION,"root_sealed":True,
               "financial_writes_authorized":False,"old_web_pid_untouched":g.EXPECTED_OLD_PID}
        raw_source=g.canon(source);raw_built=g.canon(built)
        contents={g.C_AUDIT/"SOURCE_STAGED.json":raw_source,
                  g.C_AUDIT/"BUILD_STAGED.json":raw_built,
                  g.C_AUDIT/"SOURCE_FILES.json":g.canon({"schema":"r25-c-source-files.v1","rows":srcrows}),
                  g.C_AUDIT/"BUILD_FILES.json":g.canon({"schema":"aoe2war.r25.c.full-artifact-files.v1","rows":rows}),
                  **{g.STAGE/path:raw for path,raw in files.items()}}
        return contents,static,tree,g.digest(raw_source),g.digest(raw_built)

    def verify(self,contents,tree,source_sha,build_sha):
        with mock.patch.multiple(g,C_PHYSICAL_TREE_SHA256=tree,C_PHYSICAL_FILES=4,
                                 C_SOURCE_RECEIPT_SHA256=source_sha,C_BUILD_RECEIPT_SHA256=build_sha):
            with mock.patch.object(g,"protected_c_stage_boundary"),mock.patch.object(g,"root_sealed_file",return_value=True):
                with mock.patch.object(g,"bounded_tree",side_effect=AssertionError("duplicate tree scan")):
                    with mock.patch.object(g,"root_file",side_effect=lambda path,limit:contents[path]) as reader:
                        return g.verified_c_archive_source(),reader.call_args_list

    def test_only_war_chest_get_has_2mib_limit_while_all_others_stay_512kib(self):
        import json
        calls=[]
        def fake_http(origin,path,method="GET",limit=524288):
            calls.append((path,method,limit))
            if path=="/api/deployment-version":
                return json.dumps({"buildVersion":g.C_PHYSICAL_APP_VERSION}).encode()
            if method=="HEAD":return b""
            return b"valid-current-html"
        with mock.patch.object(g,"http",side_effect=fake_http):
            report=g.http_site("http://127.0.0.1:3031",g.C_PHYSICAL_BUILD_ID)
        self.assertEqual(report["route_get_head_count"],10)
        for route in g.PAGES:
            expected=2097152 if route=="/war-chest" else 524288
            self.assertIn((route,"GET",expected),calls)
            self.assertIn((route,"HEAD",524288),calls)
        self.assertIn(("/api/deployment-version","GET",524288),calls)
        self.assertEqual(calls[-1][2],524288)

    def test_even_war_chest_response_over_2mib_refuses(self):
        import types
        class TooLarge:
            status=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,n):return b"x"*n
        opener=types.SimpleNamespace(open=lambda *_args,**_kwargs:TooLarge())
        with mock.patch.object(g,"build_opener",return_value=opener):
            with self.assertRaisesRegex(g.Hold,"HTTP_RESPONSE_TOO_LARGE"):
                g.http("http://127.0.0.1:3031","/war-chest",limit=2097152)
            with self.assertRaisesRegex(g.Hold,"HTTP_RESPONSE_TOO_LARGE"):
                g.http("http://127.0.0.1:3031","/lobby",limit=524288)

    def test_reads_only_receipts_and_four_manifest_bound_witnesses(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        result,calls=self.verify(contents,tree,source_sha,build_sha)
        self.assertEqual(len(calls),8)
        self.assertEqual(result["static_manifest_file_sha256"],g.digest(contents[g.STAGE/static]))
        self.assertIs(result["accepted_full_tree_rehash_repeated"],False)

    def test_live_static_tampering_fails_even_with_accepted_manifest(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        contents[g.STAGE/static]=b"changed live bytes"
        with self.assertRaisesRegex(g.Hold,"C_BUILT_FILE_BYTES_CHANGED"):
            self.verify(contents,tree,source_sha,build_sha)

    def test_changed_receipt_fails_before_identity_reads(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        contents[g.C_AUDIT/"BUILD_STAGED.json"]+=b" "
        with self.assertRaisesRegex(g.Hold,"C_ACCEPTED_ROOT_RECEIPT_BYTES_CHANGED"):
            self.verify(contents,tree,source_sha,build_sha)

    def test_changed_manifest_cannot_reuse_the_accepted_tree_hash(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        raw=g.parse(contents[g.C_AUDIT/"BUILD_FILES.json"])
        raw["rows"][0]["sha256"]="0"*64
        contents[g.C_AUDIT/"BUILD_FILES.json"]=g.canon(raw)
        with self.assertRaisesRegex(g.Hold,"C_ROOT_SOURCE_OR_BUILD_MANIFEST_DIGEST_DRIFT"):
            self.verify(contents,tree,source_sha,build_sha)

class NativeUnits(unittest.TestCase):
    def monitor(self,stamp,command="/usr/bin/monitor",state="inactive",reload="no",result="success"):
        unit="wolo-mainnet-health.service"
        raw=("Id="+unit+"\nType=oneshot\nTriggeredBy=wolo-mainnet-health.timer\n"
             "MainPID=0\nActiveState="+state+"\nNeedDaemonReload="+reload+"\n"
             "Result="+result+"\n"
             "User=\nWorkingDirectory=\n"
             "FragmentPath=/etc/systemd/system/"+unit+"\nDropInPaths=\n"
             "ExecMainStartTimestampMonotonic="+str(stamp)+"\n"
             "ExecStart={ path="+command+" ; argv[]="+command+" ; ignore_errors=no ; "
             "start_time=["+str(stamp)+"] ; stop_time=[] ; pid=0 ; code=exited ; status=0 }\n").encode()
        with mock.patch.object(g,"run",side_effect=[b"unchanged config",raw]):
            return g.show(unit)

    def test_monitor_run_metadata_changes_without_losing_effective_command(self):
        self.assertEqual(self.monitor(100),self.monitor(200))
        self.assertNotEqual(self.monitor(100),self.monitor(100,command="/usr/bin/changed"))
        self.assertNotEqual(self.monitor(100),self.monitor(100,result="exit-code"))

    def test_active_or_unloaded_monitor_fails_closed(self):
        for kw in ({"state":"activating"},{"reload":"yes"}):
            with self.subTest(kw=kw),self.assertRaisesRegex(g.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                self.monitor(100,**kw)

    def test_timer_does_not_need_a_fictional_mainpid(self):
        raw=b"Id=wolo-mainnet-health.timer\nActiveState=active\nFragmentPath=/etc/systemd/system/wolo-mainnet-health.timer\nDropInPaths=\n"
        with mock.patch.object(g,"run",side_effect=[b"timer config",raw]):
            obj=g.show("wolo-mainnet-health.timer")
        self.assertIsNone(obj["main_process"])
        self.assertNotIn("MainPID",obj["properties"])

    def test_template_is_a_configuration_identity_not_a_process(self):
        with mock.patch.object(g,"run",return_value=b"template config") as runner:
            obj=g.show("postgresql@.service")
        self.assertIs(obj["template"],True)
        self.assertEqual(runner.call_count,1)

    def test_persistent_service_cannot_omit_loaded_command_or_user(self):
        fields={"Id":"wolochain-mainnet-settlement.service","ActiveState":"active","MainPID":"1012",
                "ExecMainStartTimestampMonotonic":"123","User":"root","WorkingDirectory":"/var/www/WoloChain-wolo-1",
                "ExecStart":"native-command","FragmentPath":"/etc/systemd/system/wolochain-mainnet-settlement.service",
                "DropInPaths":"","Type":"simple","TriggeredBy":"","NeedDaemonReload":"no","Result":"success"}
        for omitted in ("ExecStart","User","ExecMainStartTimestampMonotonic"):
            raw="\n".join(k+"="+v for k,v in fields.items() if k!=omitted).encode()
            with self.subTest(omitted=omitted),mock.patch.object(g,"run",side_effect=[b"same config",raw]):
                with self.assertRaisesRegex(g.Hold,"SYSTEMD_SERVICE_PROPERTIES_MISSING"):
                    g.show(fields["Id"])

    def test_census_includes_loaded_postgres_instance(self):
        installed=("\n".join([g.OLD_UNIT,g.NEW_UNIT,"postgresql@.service"]+
                   ["aoe2-example%02d.timer"%i for i in range(23)])+"\n").encode()
        with mock.patch.object(g,"run",side_effect=[installed,b"postgresql@16-main.service loaded active running PostgreSQL\n"]):
            names=g.finance_units()
        self.assertIn("postgresql@16-main.service",names)

class ContinuedTransaction(unittest.TestCase):
    def fixture(self):
        old=b"original six-selector config";new=b"candidate six-selector config"
        base={"schema":"aoe2war.r24.rootssh.parallel-web-nginx.v1","nonce":"1"*32,
              "candidate_sha":g.TARGET,"candidate_build_id":g.C_PHYSICAL_BUILD_ID,
              "candidate_build_version":g.C_PHYSICAL_APP_VERSION,
              "nginx_config":"/etc/nginx/sites-available/aoe2war.com","nginx_before_sha256":g.digest(old)}
        raw=g.canon(base)+b"\n";nonce="2"*32
        plan={"nonce":nonce,"base_approved_sha256":g.digest(raw),"before_witness_sha256":g.A04_BEFORE_SHA256,
              "source_sha":"3"*40,"engine_source_sha256":"4"*64,"g_source_sha256":"5"*64,"owner_source_sha256":"6"*64,
              "candidate_sha":g.TARGET,"candidate_build_id":g.C_PHYSICAL_BUILD_ID,
              "candidate_build_version":g.C_PHYSICAL_APP_VERSION,
              "nginx_before_sha256":g.digest(old),"nginx_after_sha256":g.digest(new)}
        old_intent=b"immutable consumed intent"
        plan["consumed_previous_transaction"]={"nonce":base["nonce"],"intent_sha256":g.digest(old_intent),
            "before_nginx_sha256":g.digest(old),"no_commit":True,"current_exact_original_config":True}
        manifest={**plan,"schema":"aoe2war.r25.f.owner-transaction-grant.v1","scope":"A05_NGINX_ONLY_PUBLIC_CUTOVER",
                  "decision":"AUTHORIZE","owner_login":"Emaren","release_authority":"OWNER_ONLY_NONFINANCIAL",
                  "owner_delegated_decisions":True,"delegated_ai_authorship_disclosed":True,
                  "public_cutover_authorized":True,"independent_review":False,"financial_authorized":False,
                  "rollback_authorized":True,"max_uses":1,"plan_sha256":g.digest(g.canon(plan))}
        body="R25_F_OWNER_TRANSACTION_GRANT\n```json\n"+g.canon(manifest).decode()+"\n```"
        record={"schema":"aoe2war.r25.f.owner-transaction-authorization.v1","manifest":manifest,
                "plan":plan,"plan_sha256":g.digest(g.canon(plan)),"envelope":{"id":123,"author":"Emaren",
                "author_id":15059910,"created_at":"2026-11-02T04:00:00Z","updated_at":"2026-11-02T04:00:00Z",
                "issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1108",
                "url":"https://github.com/Emaren/app-prodn/issues/1108#issuecomment-123",
                "body":body,"body_sha256":g.digest(body.encode())}}
        approved={**base,"nonce":nonce}
        folder=g.AUDIT/("r24-"+nonce)
        contents={g.APPROVAL:raw,folder/"approval.json":g.canon(approved)+b"\n",
                  folder/"owner-authorization.json":g.canon(record),
                  g.AUDIT/("r24-"+base["nonce"])/"intent.json":old_intent,
                  g.AUDIT/("r24-"+base["nonce"])/"before-nginx.conf":old}
        return base,raw,nonce,folder,contents,record

    def read_scope(self,raw,nonce,contents):
        with mock.patch.multiple(g,TRANSACTION_NONCE=nonce,A04_APPROVAL_SHA256=g.digest(raw)):
            with mock.patch.object(g,"root_file",side_effect=lambda path,limit:contents[path]):
                return g.scope()

    def test_new_scope_changes_only_nonce_and_preserves_original_receipt(self):
        base,raw,nonce,folder,contents,record=self.fixture()
        selected=self.read_scope(raw,nonce,contents)
        self.assertEqual(selected,{**base,"nonce":nonce})
        self.assertEqual(contents[g.APPROVAL],raw)
        self.assertEqual(record["manifest"]["before_witness_sha256"],g.A04_BEFORE_SHA256)

    def test_old_consumed_nonce_and_unreviewed_approval_changes_fail(self):
        base,raw,nonce,folder,contents,record=self.fixture()
        with self.assertRaisesRegex(g.Hold,"NEW_TRANSACTION_NONCE_REQUIRED"):
            self.read_scope(raw,base["nonce"],contents)
        changed={**base,"nonce":nonce,"candidate_sha":"0"*40}
        contents[folder/"approval.json"]=g.canon(changed)
        with self.assertRaisesRegex(g.Hold,"NEW_APPROVAL_MUST_CHANGE_ONLY_NONCE"):
            self.read_scope(raw,nonce,contents)

    def test_changed_owner_body_or_plan_cannot_reuse_original_hash(self):
        for kind in ("body","plan"):
            base,raw,nonce,folder,contents,record=self.fixture()
            if kind=="body":record["envelope"]["body"]+=" "
            else:record["plan"]["candidate_sha"]="0"*40
            contents[folder/"owner-authorization.json"]=g.canon(record)
            with self.subTest(kind=kind),self.assertRaises(g.Hold):
                self.read_scope(raw,nonce,contents)

    def test_journal_requires_actual_owner_and_disclosed_single_use_authority(self):
        for field,value in (("author_id",123),("updated_at","2026-11-02T04:00:01Z"),
                            ("public_cutover_authorized",False),("max_uses",True),
                            ("delegated_ai_authorship_disclosed",False)):
            base,raw,nonce,folder,contents,record=self.fixture()
            if field in ("author_id","updated_at"):
                record["envelope"][field]=value
            else:
                record["manifest"][field]=value
                body="R25_F_OWNER_TRANSACTION_GRANT\n```json\n"+g.canon(record["manifest"]).decode()+"\n```"
                record["envelope"].update(body=body,body_sha256=g.digest(body.encode()))
            contents[folder/"owner-authorization.json"]=g.canon(record)
            with self.subTest(field=field),self.assertRaises(g.Hold):
                self.read_scope(raw,nonce,contents)

    def test_commit_must_bind_actual_new_authorization_and_original_before(self):
        base,raw,nonce,folder,contents,record=self.fixture()
        commit={"status":"R24_PARALLEL_WEBSITE_LIVE","candidate_sha":g.TARGET,"nonce":nonce,
                "base_approved_sha256":g.digest(raw),"before_witness_sha256":g.A04_BEFORE_SHA256,
                "new_approval_sha256":g.digest(contents[folder/"approval.json"]),
                "owner_authorization_body_sha256":"0"*64,
                "source_sha":"3"*40,"engine_source_sha256":"4"*64,"g_source_sha256":"5"*64,"owner_source_sha256":"6"*64}
        contents[folder/"commit.json"]=g.canon(commit)
        with mock.patch.multiple(g,TRANSACTION_NONCE=nonce,A04_APPROVAL_SHA256=g.digest(raw)):
            with mock.patch.object(g.pathlib.Path,"is_dir",return_value=True),mock.patch.object(g.pathlib.Path,"is_symlink",return_value=False):
                with mock.patch.object(g,"root_file",side_effect=lambda path,limit:contents[path]):
                    with self.assertRaisesRegex(g.Hold,"COMMIT_AUTHORIZED_TRANSACTION_DRIFT:owner_authorization_body_sha256"):
                        g.audit({**base,"nonce":nonce},"after")

if __name__=="__main__":
    unittest.main()
