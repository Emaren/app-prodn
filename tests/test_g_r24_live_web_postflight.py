"""R25 G synthetic parallel web postflight regression (not real host evidence)."""
import copy, importlib.util, pathlib, tempfile, unittest
from unittest.mock import patch
FILE=pathlib.Path(__file__).resolve().parents[1]/"scripts/aoe2_g_r24_live_web_postflight.py"
spec=importlib.util.spec_from_file_location("g_r25",FILE)
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
def fixture():
    proc=lambda pid:{"pid":pid,"start_ticks":pid*10,"uid":1000,"exe_sha256":"a"*64,
                     "cgroup_sha256":"b"*64}
    def unit(name,pid):
        properties={"Id":name,"ActiveState":"active","MainPID":str(pid),
                    "ExecMainStartTimestampMonotonic":str(pid*10),"User":"pinned",
                    "WorkingDirectory":"/var/www","ExecStart":"pinned",
                    "FragmentPath":"/etc/systemd/"+name,"DropInPaths":""}
        return {"properties":properties,"properties_sha256":g.digest(g.canon(properties)),
                "unit_config_sha256":g.digest(name.encode()),"main_process":proc(pid)}
    units={g.OLD_UNIT:unit(g.OLD_UNIT,111),g.NEW_UNIT:unit(g.NEW_UNIT,222),
           "wolo-chain.service":unit("wolo-chain.service",333)}
    ports={str(p):{**proc(1000+p),"port":p,
                   "socket_inode_sha256":g.digest(str(p).encode())}
           for p in (3030,3031,8092,8093)}
    candidate={"git":{"head":g.TARGET,"tree_sha":"2"*40,"tracked_clean":True},
       "source_marker":g.TARGET,"next_build_id":"TrueNextBuild_ABC",
       "dependencies":{"sha256":"3"*64,"bytes":100,"files":3},
       "next_build":{"sha256":"4"*64,"bytes":200,"files":4},
       "complete_tracked_source_verified":True,
       "full_dependency_and_build_bytes_measured":True,
       "root_owner_stage_receipt_binding_requires_F":True}
    def http(build,version):
        return {"app_build_version":version,"next_build_id_from_host_not_http":build,
                "manifest":"/_next/static/"+build+"/_buildManifest.js",
                "manifest_sha256":g.digest(build.encode()),"route_get_head_count":10,
                "http_methods_sent":"GET_HEAD_ONLY"}
    before={"schema":"aoe2war.g.r25.parallel-host.v1","phase":"before","host":g.HOST,
            "old_source":{"head":"33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a",
                          "tree_sha":"1"*40,"tracked_clean":True},
            "old_next_build_id":"DQ2jMprNQ_Njq6QM8GHju",
            "candidate":candidate,"units":units,"ports":ports,
            "old_http":http("DQ2jMprNQ_Njq6QM8GHju","old-version"),
            "candidate_http":http("TrueNextBuild_ABC","new-version"),
            "nginx":{"upstream_port":3030,"selected_file":"/etc/nginx/site",
                     "file_sha256":"a"*64,"nginx_compiled_sha256":"b"*64,"nginx_t_ok":True},
            "release_lock":{"device":2064,"inode":6185747,"uid":1000,"mode":420},
            "release_journal":{"phase":"before","journal":None},
            "approved_scope_sha256":"c"*64,"proof":"ROOT_SSH_MEASURED_NOT_FINANCE_SIGNED"}
    after=copy.deepcopy(before);after["phase"]="after"
    after["nginx"].update(upstream_port=3031,file_sha256="d"*64)
    after["release_journal"]={"root_rollback_material_verified":True,
                             "rollback_exercised":False,"commit_sha256":"f"*64}
    rollback=copy.deepcopy(before);rollback["phase"]="rollback"
    rollback["release_journal"]={"root_rollback_material_verified":True,
                  "rollback_exercised":True,"rollback_receipt_sha256":"e"*64}
    return before,after,rollback

class R25Tests(unittest.TestCase):
    def test_actual_phase_contract_positive(self):
        b,a,r=fixture()
        self.assertEqual(g.verify(b,a,"after")["nginx_active_upstream"],3031)
        self.assertTrue(g.verify(b,a,"after")["old_web_service_pid_unchanged"])
        self.assertEqual(g.verify(b,r,"rollback")["nginx_active_upstream"],3030)
        self.assertEqual(g.verify(b,a,"after")["status"],
                         "LIVE_PARALLEL_HOST_AND_PUBLIC_MEASURED_REQUIRES_F_STAGE_REVIEW")
        self.assertEqual(g.verify(b,r,"rollback")["status"],
                         "PUBLIC_3030_NGINX_ONLY_ROLLBACK_MEASURED")
        self.assertFalse(g.verify(b,a,"after")["public_next_build_id_directly_exposed"])
    def test_23_mutations_and_wrong_phases_hold(self):
        mutations=[
          lambda a:a["units"][g.OLD_UNIT]["main_process"].__setitem__("pid",999),
          lambda a:a["units"][g.NEW_UNIT]["main_process"].__setitem__("start_ticks",999),
          lambda a:a["units"]["wolo-chain.service"]["properties"].__setitem__("MainPID","0"),
          lambda a:a["units"]["wolo-chain.service"].__setitem__("unit_config_sha256","0"*64),
          lambda a:a["ports"]["3030"].__setitem__("pid",999),
          lambda a:a["ports"]["3031"].__setitem__("socket_inode_sha256","x"*64),
          lambda a:a["ports"]["8092"].__setitem__("exe_sha256","x"*64),
          lambda a:a["ports"]["8093"].__setitem__("cgroup_sha256","x"*64),
          lambda a:a.__setitem__("old_next_build_id","fake"),
          lambda a:a["old_source"].__setitem__("head","0"*40),
          lambda a:a["candidate"]["git"].__setitem__("head","0"*40),
          lambda a:a["candidate"]["dependencies"].__setitem__("sha256","0"*64),
          lambda a:a["candidate"]["next_build"].__setitem__("sha256","0"*64),
          lambda a:a["candidate"]["next_build"].__setitem__("bytes",1234),
          lambda a:a["release_lock"].__setitem__("inode",0),
          lambda a:a.__setitem__("approved_scope_sha256","0"*64),
          lambda a:a["nginx"].__setitem__("upstream_port",3030),
          lambda a:a["nginx"].__setitem__("selected_file","/tmp/site"),
          lambda a:a["release_journal"].__setitem__("root_rollback_material_verified",False),
          lambda a:a.__setitem__("phase","rollback"),
          lambda a:a["old_http"].__setitem__("app_build_version","changed"),
          lambda a:a["candidate_http"].__setitem__("manifest_sha256","0"*64),
          lambda a:a["units"].pop(g.NEW_UNIT),
          lambda a:a["ports"].pop("8093"),
        ]
        for i,edit in enumerate(mutations):
            with self.subTest(i=i):
                b,a,_=fixture();edit(a)
                with self.assertRaises(g.Hold):g.verify(b,a,"after")
    def test_rollback_only_public_upstream_may_change(self):
        mutations=[
          lambda r:r["nginx"].__setitem__("upstream_port",3031),
          lambda r:r["nginx"].__setitem__("file_sha256","0"*64),
          lambda r:r["release_journal"].__setitem__("rollback_exercised",False),
          lambda r:r["units"][g.OLD_UNIT]["main_process"].__setitem__("pid",99),
          lambda r:r["ports"]["3031"].__setitem__("pid",99),
        ]
        for edit in mutations:
            b,_,r=fixture();edit(r)
            with self.assertRaises(g.Hold):g.verify(b,r,"rollback")
    def test_public_manifest_bytes_version_and_method_gate(self):
        b,a,_=fixture();build=a["candidate"]["next_build_id"]
        def fake(url,path,method="GET",limit=524288):
            if path=="/api/deployment-version":return b'{"buildVersion":"new-version"}'
            if path=="/_next/static/"+build+"/_buildManifest.js":return b"real-manifest"
            return b"page" if method=="GET" else b""
        with patch.object(g,"http",side_effect=fake):
            a["candidate_http"]["manifest_sha256"]=g.digest(b"real-manifest")
            self.assertEqual(g.public_check(a)["route_get_head_count"],10)
            a["candidate_http"]["manifest_sha256"]="f"*64
            with self.assertRaises(g.Hold):g.public_check(a)
    def test_strict_ssh_no_remote_file_install(self):
        with patch.object(g,"run",return_value=b'{"ok":true}') as caller:
            with patch.object(g.pathlib.Path,"read_bytes",return_value=b"reviewed-source"):
                self.assertEqual(g.ssh_snapshot("root@hel1","after"),{"ok":True})
                args=caller.call_args.args[0]
                self.assertIn("StrictHostKeyChecking=yes",args)
                self.assertIn("BatchMode=yes",args)
                self.assertEqual(args[-2:],["--remote","after"])
        for target in ("tony@hel1","root@bad;whoami","root@foo bar",""):
            with self.assertRaises(g.Hold):g.ssh_snapshot(target,"after")
    def test_full_tree_bytes_internal_links_and_escape_holds(self):
        with tempfile.TemporaryDirectory() as home:
            root=pathlib.Path(home)/"source"
            root.mkdir()
            (root/"code.js").write_bytes(b"safe")
            (root/"linked.js").symlink_to("code.js")
            digest=g.bounded_tree(root)
            self.assertEqual(digest["files"],2)
            self.assertEqual(digest["bytes"],4)
            first=digest["sha256"]
            (root/"code.js").write_bytes(b"changed")
            self.assertNotEqual(g.bounded_tree(root)["sha256"],first)
            (root/"linked.js").unlink()
            (root/"linked.js").symlink_to("../outside")
            (pathlib.Path(home)/"outside").write_bytes(b"outside")
            with self.assertRaises(g.Hold):g.bounded_tree(root)

    def test_actual_six_location_nginx_topology_rejects_partial_switch(self):
        labels=["^~ /players/by-name/","= /api/kingdom-presence/events",
                "^~ /api/","= /","^~ /download/watcher/","/"]
        def config(port=3030,missing_guard=False):
            locations="\n".join(
                "location "+label+" { "+
                ("" if missing_guard else "if ($request_method !~ ^(GET|HEAD)$) { return 405; } ")+
                "\nproxy_pass http://127.0.0.1:"+str(port)+";\n }"
                for label in labels)
            return ("""server {
 listen 443 ssl;
 server_name aoe2war.com www.aoe2war.com;
 """+locations+"""
 location /rpc { proxy_pass http://127.0.0.1:27657; }
 location /rest { proxy_pass http://127.0.0.1:1318; }
}
server {
 listen 80;
 server_name aoe2war.com www.aoe2war.com;
}
""").encode()
        self.assertEqual(g.six_web_upstreams(config()),3030)
        self.assertEqual(g.six_web_upstreams(config(3031)),3031)
        for bad in [config(3031,True),
                    config().replace(b"127.0.0.1:3030;",b"127.0.0.1:3031;",1),
                    config().replace(b"location = / {",b"location = /other {"),
                    config().replace(b"127.0.0.1:1318;",b"127.0.0.1:9999;")]:
            with self.assertRaises(g.Hold):g.six_web_upstreams(bad)
    def test_c_true_git_archive_manifests_without_git_checkout(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/".next").mkdir()
            (root/"node_modules").mkdir()
            (root/"code.js").write_bytes(b"git-archived-source")
            (root/".next/BUILD_ID").write_text("TrueNextBuild_ABC\n")
            (root/"node_modules/a.js").write_bytes(b"node")
            source_rows=[{"name":"code.js","kind":"file","size":19,
                          "sha256":g.digest(b"git-archived-source")}]
            build_rows=[{"path":"code.js","type":"file","size":19,
                         "sha256":g.digest(b"git-archived-source")}]
            source={"status":"SOURCE_STAGED","candidate_sha":g.TARGET,
                    "git_archive_sha256":g.ARCHIVE_SHA,
                    "source_manifest_sha256":g.digest(g.canon(source_rows))}
            built={"status":"BUILD_STAGED","candidate_sha":g.TARGET,
                   "source_git_archive_sha256":g.ARCHIVE_SHA,
                   "tree_sha256":g.digest(g.canon(build_rows)),
                   "build_id":"TrueNextBuild_ABC","root_sealed":True,
                   "financial_writes_authorized":False,
                   "old_web_pid_untouched":g.EXPECTED_OLD_PID}
            files={"schema":"r25-c-source-files.v1","rows":source_rows}
            artifact={"schema":"aoe2war.r25.c.full-artifact-files.v1","rows":build_rows}
            mapping={"SOURCE_STAGED.json":source,"BUILD_STAGED.json":built,
                     "SOURCE_FILES.json":files,"BUILD_FILES.json":artifact}
            def readfile(p,maxsize=65536):
                return json.dumps(mapping[pathlib.Path(p).name]).encode()
            with patch.object(g,"STAGE",root),patch.object(g,"root_file",side_effect=readfile),patch.object(g,"root_sealed_file",return_value=True):
                self.assertEqual(g.verified_c_archive_source()["receipt_build_id"],
                                 "TrueNextBuild_ABC")
                built["build_id"]="INVENTED_ID"
                # A fabricated BUILD_ID cannot pass actual staged Next output.
                with self.assertRaises(g.Hold):
                    g.stage()
                built["build_id"]="TrueNextBuild_ABC"
                (root/"code.js").write_bytes(b"tampered")
                with self.assertRaises(g.Hold):g.verified_c_archive_source()
    def test_no_false_public_build_and_duplicate_json(self):
        code=FILE.read_text()
        self.assertIn("public_next_build_id_directly_exposed",code)
        self.assertIn("OWNER_AFTER_RECEIPT_SHA256_DRIFT",code)
        self.assertIn("OWNER_BEFORE_RECEIPT_SHA256_DRIFT",code)
        self.assertNotIn("git reset --hard",code)
        self.assertNotIn("git clean",code)
        self.assertNotIn('method="POST"',code)
        with self.assertRaises(g.Hold):g.parse(b'{"a":1,"a":2}')
        with self.assertRaises(g.Hold):g.parse(b'{"x":NaN}')

if __name__=="__main__":unittest.main()
