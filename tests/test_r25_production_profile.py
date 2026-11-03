"""Versioned production profile: real artifact import and fail-closed boundaries."""
import ast
import contextlib
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest
import zipfile
from unittest import mock
from tests.test_c_runtime_artifact_export import RuntimeExport, c as exporter

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("production_profile", ROOT/"scripts/r25_c_start_root.py")
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)

class ProductionProfile(unittest.TestCase):
    def test_same_ci_export_import_accepts_bin_symlink_and_rehashes_all_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, source = RuntimeExport().fixture(temporary)
            for index in range(1000):
                (root/"node_modules/demo"/("proof-%04d.js" % index)).write_text("qualified runtime\n")
            output = pathlib.Path(temporary)/"artifact"
            env={"CI":"true","GITHUB_ACTIONS":"true","AOE2WAR_ARTIFACT_SOURCE_SHA":source,
                 "AOE2_BACKEND_UPSTREAM":"http://127.0.0.1:3331"}
            previous=os.getcwd()
            try:
                os.chdir(root)
                with mock.patch.dict(os.environ,env), contextlib.redirect_stdout(io.StringIO()):
                    exporter.export_ci_runtime(output)
            finally: os.chdir(previous)
            artifact=json.loads((output/"artifact.json").read_bytes())
            stage=pathlib.Path(temporary)/"staged"
            result=c.production_extract(output/"runtime.tar.gz",artifact,stage)
            self.assertEqual(result["files"],artifact["files"])
            self.assertTrue((stage/"node_modules/.bin/demo").is_symlink())
            self.assertEqual((stage/"node_modules/.bin/demo").read_text(),"module.exports=1;\n")
            self.assertEqual((stage/".aoe2war-source-sha").read_text().strip(),source)
            self.assertEqual(list((stage/".next/cache").iterdir()),[])
            self.assertFalse((stage/"node_modules/demo/index.js").stat().st_mode & 0o022)
            with self.assertRaisesRegex(c.Hold,"STAGE_ALREADY_EXISTS"):
                c.production_extract(output/"runtime.tar.gz",artifact,stage)

    def test_explicit_service_has_startup_guard_and_no_old_or_preview_mutation(self):
        unit=c.production_unit_bytes(pathlib.Path("/var/lib/aoe2war-web-prod-"+"a"*12)).decode()
        for expected in ("User=aoe2war-web-prod", "PORT=3032", "AOE2WAR_R25_ISOLATED_WEB=true",
                         "AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1", "WARGRAPH_RUNTIME_DISABLED=true",
                         "AOE2WAR_PROD_DB_PREVIEW=false", "TemporaryFileSystem=/run:ro", "ProtectSystem=strict",
                         "CapabilityBoundingSet=", "NODE_OPTIONS=--require="+str(c.PROD_GUARD)):
            self.assertIn(expected,unit)
        self.assertNotIn("Restart=always",unit)
        self.assertNotIn("3030",unit)
        self.assertNotIn("3031",unit)
        with self.assertRaisesRegex(c.Hold,"STAGE_NAMESPACE"):
            c.production_unit_bytes(pathlib.Path("/var/www/AoE2HDBets/app-prodn"))

    def test_nft_uid_scoping_never_unrestricted_443_or_financial_backend(self):
        value=c.production_nft_bytes(["23.1.2.3"]).decode()
        rules=[row for row in value.splitlines() if "meta skuid" in row]
        self.assertEqual(len(rules),7)
        self.assertTrue(all("meta skuid 990 " in row for row in rules))
        self.assertIn("ip daddr @steam4 tcp dport 443 accept",value)
        self.assertIn("127.0.0.53",value)
        self.assertIn("{ 5432, 3331 }",value)
        self.assertNotIn("3330",value)
        self.assertNotIn("993",value)
        for address in ("127.0.0.1", "192.168.1.1", "::1"):
            with self.assertRaisesRegex(c.Hold,"ADDRESS_POLICY"):
                c.production_nft_bytes([address])

    def test_readonly_catalog_witness_never_invokes_mutating_auth_helpers(self):
        with mock.patch.object(c,"production_psql",return_value=b'{}') as sql:
            with self.assertRaises(c.Hold): c.production_database_witness("fixture","private-test-only")
        statement=sql.call_args.args[1]
        self.assertTrue(statement.startswith("BEGIN READ ONLY;"))
        for forbidden in ("INSERT ", "UPDATE ", "DELETE ", "CREATE ", "SET ROLE", "complete_steam_login(", "touch_session("):
            self.assertNotIn(forbidden,statement)
        self.assertIn("no_users_secret_select",statement)
        self.assertIn("has_column_privilege",statement)

    def test_observer_cannot_repeat_admission_or_steam_post(self):
        module=ast.parse((ROOT/"scripts/r25_c_start_root.py").read_text())
        node=next(item for item in module.body if isinstance(item,ast.FunctionDef) and item.name=="production_witness")
        calls={item.func.id for item in ast.walk(node) if isinstance(item,ast.Call) and isinstance(item.func,ast.Name)}
        self.assertNotIn("production_database_admission",calls)
        self.assertNotIn("production_steam_probe",calls)
        self.assertNotIn("production_start",calls)
        self.assertNotIn("seal",calls)
        self.assertIn("production_database_witness",calls)
        self.assertIn("root_file",calls)
        self.assertNotIn('method="POST"',ast.get_source_segment((ROOT/"scripts/r25_c_start_root.py").read_text(),node))

    def test_installer_no_broad_select_and_only_exact_sql_source(self):
        captured=[]
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.object(c,"run",return_value=b"private-users-backup"),mock.patch.object(c,"production_psql",side_effect=lambda db,sql:captured.append(sql)),mock.patch.object(c,"seal"):
                c.production_install_database("fixture",b"-- exact source SQL", "A"*64,pathlib.Path(directory))
            self.assertEqual((pathlib.Path(directory)/"users-before.pgdump").read_bytes(),b"private-users-backup")
        self.assertIn("-- exact source SQL",captured[0])
        self.assertNotIn("SELECT ON ALL",captured[0])
        self.assertIn("NOBYPASSRLS",captured[0])

    def test_consumed_resource_is_hold_before_any_admission_or_service_action(self):
        with mock.patch.object(c,"production_plan",side_effect=c.Hold("RESOURCE_EXISTS_NO_REPLAY")),mock.patch.object(c,"production_grant") as grant,mock.patch.object(c,"run") as native:
            with self.assertRaisesRegex(c.Hold,"NO_REPLAY"): c.production_start({"nonce":"a"*32})
        grant.assert_not_called();native.assert_not_called()

    def test_failed_profile_retains_consumed_journal_and_stops_no_old_service(self):
        with tempfile.TemporaryDirectory() as directory:
            audit=pathlib.Path(directory)/"audit"
            plan={"protected_snapshot_sha256":c.sha(c.canonical({}))}
            payload={"nonce":"f"*32,"plan_sha256":c.sha(c.canonical(plan))}
            with mock.patch.object(c,"PROD_AUDIT",audit),mock.patch.object(c,"production_plan",return_value=plan),\
                 mock.patch.object(c,"production_grant",return_value={"owner":"fixture"}),\
                 mock.patch.object(c,"production_protected",return_value={}),mock.patch.object(c,"directory"),\
                 mock.patch.object(c,"production_source",side_effect=c.Hold("SOURCE_DRIFT_AFTER_CONSUMPTION")),\
                 mock.patch.object(c,"run") as native:
                with self.assertRaisesRegex(c.Hold,"SOURCE_DRIFT_AFTER_CONSUMPTION"):
                    c.production_start(payload)
                journal=audit/("prod-"+payload["nonce"])
                entered=(journal/"entered.json").read_bytes()
                hold=json.loads((journal/"hold.json").read_bytes())
                self.assertEqual(hold["status"],"HOLD_NO_REPLAY")
                self.assertFalse(hold["new_service_stop_attempted"])
                with self.assertRaises(FileExistsError): c.production_start(payload)
                self.assertEqual((journal/"entered.json").read_bytes(),entered)
                self.assertEqual(len(list(journal.iterdir())),2)
            native.assert_not_called()

    def test_grant_is_real_owner_unedited_exact_plan_and_ci_bound(self):
        now=c.datetime.datetime.now(c.datetime.timezone.utc).replace(microsecond=0)
        stamp=lambda value:value.strftime("%Y-%m-%dT%H:%M:%SZ")
        plan={"source_sha":"a"*40,"native":"exact","ci_artifact":{"run_id":123}}
        grant={"schema":"aoe2war.app.production-profile-grant.v1","decision":"AUTHORIZE","scope":c.PROD_SCOPE,
            "nonce":"b"*32,"source_sha":"a"*40,"plan_sha256":c.sha(c.canonical(plan)),
            "financial_authorized":False,"public_cutover_authorized":False,"rollback_authorized":True,
            "delegated_ai_authorship_disclosed":True,"release_authority":"OWNER_ONLY_NONFINANCIAL",
            "owner_delegated_decisions":True,"independent_review":False,"max_uses":1,
            "issued_at":stamp(now-c.datetime.timedelta(seconds=1)),"expires_at":stamp(now+c.datetime.timedelta(seconds=300)),
            "exact_head_ci":{"run_id":123,"head_sha":"a"*40}}
        def fixture(change=None, edited=False, ci_bad=False):
            record=dict(grant);record.update(change or {})
            body="APP_PRODUCTION_PROFILE_GRANT\n```json\n"+json.dumps(record)+"\n```"
            item={"id":44,"user":{"login":"Emaren","id":15059910},"body":body,
                "html_url":"https://github.com/Emaren/app-prodn/issues/1108#issuecomment-44",
                "issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1108",
                "created_at":stamp(now),"updated_at":stamp(now+c.datetime.timedelta(seconds=1)) if edited else stamp(now)}
            payload={"source_sha":"a"*40,"nonce":"b"*32,"owner_comment_id":44,"owner_comment_sha256":c.sha(body.encode())}
            run={"name":"AoE2WAR CI","head_sha":"a"*40,"status":"completed","conclusion":"failure" if ci_bad else "success"}
            names=["Release and documentation control plane","Type, contract, and production build","Isolated Steam-rating PostgreSQL chronology"]
            jobs={"total_count":3,"jobs":[{"name":name,"status":"completed","conclusion":"success"} for name in names]}
            return payload,[item,run,jobs]
        payload,replies=fixture()
        with mock.patch.object(c,"production_github",side_effect=replies):
            self.assertEqual(c.production_grant(payload,plan)["comment_id"],44)
        for change,edited,ci_bad in (({"financial_authorized":True},False,False),
            ({"nonce":"c"*32},False,False),({"source_sha":"d"*40},False,False),
            ({"expires_at":stamp(now-c.datetime.timedelta(seconds=1))},False,False),({},True,False),({},False,True)):
            payload,replies=fixture(change,edited,ci_bad)
            with self.subTest(change=change,edited=edited,ci_bad=ci_bad),mock.patch.object(c,"production_github",side_effect=replies):
                with self.assertRaises(c.Hold): c.production_grant(payload,plan)

    def test_ci_zip_provenance_rejects_selfconsistent_forgery_or_wrong_run(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/"runtime.zip"
            runtime=b"runtime exact emitted bytes"
            metadata={"bytes":len(runtime),"sha256":c.sha(runtime)}
            with zipfile.ZipFile(path,"w") as archive:
                archive.writestr("artifact.json",json.dumps(metadata));archive.writestr("runtime.tar.gz",runtime)
            payload={"source_sha":"a"*40,"artifact":metadata,"ci_artifact":{"id":42,"run_id":123}}
            item={"id":42,"name":"aoe2war-runtime-"+"a"*40,"expired":False,
                  "workflow_run":{"id":123,"head_sha":"a"*40},"digest":"sha256:"+c.sha(path.read_bytes())}
            run={"id":123,"head_sha":"a"*40,"name":"AoE2WAR CI","status":"completed","conclusion":"success"}
            with mock.patch.object(c,"production_github",side_effect=[item,run]):
                proof=c.production_ci_zip(payload,path)
            self.assertEqual(proof["zip_sha256"],c.sha(path.read_bytes()))
            for field,value in (("expired",True),("name","wrong"),("workflow_run",{"id":124,"head_sha":"a"*40}),
                                ("workflow_run",{"id":123,"head_sha":"b"*40}),("digest","sha256:"+"f"*64)):
                other={**item,field:value}
                with self.subTest(field=field,value=value),mock.patch.object(c,"production_github",side_effect=[other,run]):
                    with self.assertRaises(c.Hold):c.production_ci_zip(payload,path)
            # Replacing both metadata and runtime with a self-consistent forged
            # ZIP still fails the digest authenticated by GitHub itself.
            forged=b"source-shaped but not CI bytes";metadata2={"bytes":len(forged),"sha256":c.sha(forged)}
            with zipfile.ZipFile(path,"w") as archive:
                archive.writestr("artifact.json",json.dumps(metadata2));archive.writestr("runtime.tar.gz",forged)
            with mock.patch.object(c,"production_github",side_effect=[item,run]):
                with self.assertRaisesRegex(c.Hold,"AUTHENTICATED_CI_ZIP_DIGEST"):
                    c.production_ci_zip({**payload,"artifact":metadata2},path)

    def test_current_steam_requires_nonexpired_set_and_current_uid_tls(self):
        base={"nftables":[{"set":{"name":"steam4","elem":[{"elem":{"val":"23.1.2.3","expires":90000,"timeout":300000}}]}},
                           {"set":{"name":"steam6","elem":[]}}]}
        proof={"current_uid_tls_sni_verified":True,"active_dns_set_intersection":1,"http_post_sent":False,"completed_user_sign_in":False}
        captured=[]
        def native(argv,**kwargs):
            if argv[0]=="/usr/sbin/nft":return c.canonical(base)
            captured.append(argv);return c.canonical(proof)
        with mock.patch.object(c,"run",side_effect=native):
            self.assertTrue(c.production_current_steam_tls()["current_uid_tls_sni_verified"])
        compile(captured[0][captured[0].index("-c")+1],"actual-readonly-UID-TLS-probe","exec")
        self.assertNotIn("POST",captured[0][captured[0].index("-c")+1])
        for nft in ({"nftables":[{"set":{"name":"steam4","elem":[]}}]},
                    {"nftables":[{"set":{"name":"steam4","elem":[{"elem":{"val":"23.1.2.3","expires":0}}]}}]}):
            with mock.patch.object(c,"run",return_value=c.canonical(nft)):
                with self.assertRaises(c.Hold):c.production_current_steam_tls()
        proof["current_uid_tls_sni_verified"]=False
        with mock.patch.object(c,"run",side_effect=native):
            with self.assertRaisesRegex(c.Hold,"CURRENT_STEAM_TLS_NOT_REACHABLE"):c.production_current_steam_tls()

    def test_critical_bytes_are_observed_again_without_whole_tree_scan(self):
        source=(ROOT/"scripts/r25_c_start_root.py").read_text()
        module=ast.parse(source)
        fn=next(item for item in module.body if isinstance(item,ast.FunctionDef) and item.name=="production_critical_runtime")
        required=[]
        for node in ast.walk(fn):
            if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="required" for t in node.targets):
                required=ast.literal_eval(node.value)
        rows=[{"path":path,"type":"file","size":len(path),"sha256":c.sha(path.encode())}
              for path in required+[".next/static/style.css",".next/static/code.js"]]
        inventory={"rows":rows};changed=False;reads=[]
        def files(path,*args):
            reads.append(str(path))
            if str(path).endswith(".aoe2war-runtime-manifest.json"):return c.canonical(inventory)
            relative=str(path).removeprefix("/stage/")
            return b"tampered" if changed and relative==required[-1] else relative.encode()
        with mock.patch.object(c,"root_file",side_effect=files):
            self.assertEqual(len(c.production_critical_runtime(pathlib.Path("/stage"))),len(required)+2)
            changed=True
            with self.assertRaisesRegex(c.Hold,"CRITICAL_RUNTIME_BYTES_CHANGED"):
                c.production_critical_runtime(pathlib.Path("/stage"))
        self.assertLess(len(reads),40)

if __name__ == "__main__": unittest.main()
