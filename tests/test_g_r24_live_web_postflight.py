"""R24 G negative tests: no real HEL1 connection, finance read or deployment."""
import importlib.util, json, pathlib, subprocess, sys, unittest
from unittest.mock import patch

FILE=pathlib.Path(__file__).resolve().parents[1]/"scripts/aoe2_g_r24_live_web_postflight.py"
spec=importlib.util.spec_from_file_location("aoe2_g_r24_live",FILE)
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

def example():
    before={
      "schema":"aoe2war.g.r24.host-snapshot.v1","host":g.HOST,
      "original_release_lock":{"device":2064,"inode":6185747,"uid":1000,"mode":"0o644"},
      "source_sha":"33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a",
      "next_build_id":"DQ2jMprNQ_Njq6QM8GHju",
      "web":{"pid":2625090,"start_ticks":1234,"uid":1000},
      "units":{"aoe2hdbets-web.service":{"active":"active","main_pid":2625090},
               "wolochaind-mainnet.service":{"active":"active","main_pid":412}},
      "protected_listeners":{
         "8092":{"pid":512,"start_ticks":456,"uid":1000,"socket_inode_sha256":"a"*64},
         "8093":{"pid":513,"start_ticks":457,"uid":1000,"socket_inode_sha256":"b"*64}},
      "internal":{"build_version":"old-app-version","routes":{},"asset":"/_next/static/chunks/old.js",
                  "asset_sha256":"0"*64},
      "rollback":None
    }
    after=json.loads(json.dumps(before))
    after["source_sha"]=g.TARGET
    after["next_build_id"]="NEWNextBuildABCD123"
    after["web"]={"pid":2626000,"start_ticks":2234,"uid":1000}
    after["units"]["aoe2hdbets-web.service"]["main_pid"]=2626000
    after["internal"]["build_version"]="new-app-version"
    after["internal"]["asset"]="/_next/static/chunks/new.js"
    after["internal"]["asset_sha256"]="f"*64
    after["rollback"]={"path":str(g.DURABLE/"activate-RELEASEID"),
      "previous_source_sha":before["source_sha"],
      "previous_build_id":before["next_build_id"],
      "previous_build_version":before["internal"]["build_version"],
      "dependencies_present":True,"fully_restore_tested":False}
    return before,after

class R24GPostflightTests(unittest.TestCase):
    def test_r24_exact_candidate_and_non_mutating_root_ssh(self):
        code=FILE.read_text()
        self.assertEqual(g.TARGET,"0cee3c836c4b0760478280c145e02e81e470ce0e")
        self.assertIn('"StrictHostKeyChecking=yes"',code)
        self.assertIn('"BatchMode=yes"',code)
        self.assertIn('"--remote"',code)
        self.assertIn('"no_financial_mutation_http_methods_dispatched":True',code)
        self.assertIn('"SSR_GET_HEAD_financial_side_effects_independently_proven":False',code)
        self.assertIn('"public_next_build_id_directly_exposed":False',code)
        self.assertIn('"rollback_execution_tested":False',code)
        self.assertIn('"original_release_lock_preserved":True',code)
        self.assertIn('"OWNER_BEFORE_RECEIPT_DIGEST_DRIFT"',code)
        self.assertNotIn('set -euo pipefail',code)
        self.assertNotIn('git reset --hard',code)
        self.assertNotIn('git clean',code)
        self.assertNotIn('method="POST"',code)
        r=subprocess.run([sys.executable,str(FILE),"--remote"],
                         capture_output=True,text=True,timeout=5)
        self.assertEqual(r.returncode,2)
        self.assertIn("R24_G_POSTFLIGHT_HOLD:",r.stderr)

    def test_good_financial_socket_and_rollback_lineage(self):
        a,b=example()
        with patch.object(g,"public_check",return_value={"asset_sha256":"f"*64}):
            result=g.verify(a,b,"https://aoe2war.com")
        self.assertEqual(result["status"],"LIVE_SOURCE_BUILD_HTTP_FINANCE_SOCKET_ROLLBACK_MATERIAL_VERIFIED")
        self.assertEqual(result["live_next_build_id"],b["next_build_id"])
        self.assertEqual(result["protected_financial_units_checked"],1)
        self.assertFalse(result["rollback_execution_tested"])

    def test_protected_finance_host_source_and_build_negative_vectors(self):
        scenarios=[
           lambda a,b:b.__setitem__("source_sha","0"*40),
           lambda a,b:b.__setitem__("next_build_id",a["next_build_id"]),
           lambda a,b:b["units"]["wolochaind-mainnet.service"].__setitem__("main_pid",12),
           lambda a,b:b["units"].pop("wolochaind-mainnet.service"),
           lambda a,b:b["protected_listeners"]["8092"].__setitem__("start_ticks",999),
           lambda a,b:b["protected_listeners"]["8093"].__setitem__("socket_inode_sha256","0"*64),
           lambda a,b:b["rollback"].__setitem__("previous_build_id","fake"),
           lambda a,b:b["rollback"].__setitem__("previous_source_sha","1"*40),
           lambda a,b:b["rollback"].__setitem__("dependencies_present",False),
           lambda a,b:b["rollback"].__setitem__("previous_build_version","wrong"),
           lambda a,b:b.__setitem__("host","other-host"),
        ]
        scenarios.extend([
           lambda a,b:b["original_release_lock"].__setitem__("inode",999),
           lambda a,b:b["web"].update({"pid":a["web"]["pid"],
                                          "start_ticks":a["web"]["start_ticks"]}),
        ])
        for i,edit in enumerate(scenarios):
            with self.subTest(i=i):
                a,b=example();edit(a,b)
                with patch.object(g,"public_check",return_value={}):
                    with self.assertRaises(g.Hold):g.verify(a,b,"https://aoe2war.com")

    def test_no_blanket_public_identity_and_get_head_consistency(self):
        a,b=example()
        with patch.object(g,"get") as get:
            def reply(url,method="GET",limit=2097152):
                if url.endswith("deployment-version"):
                    return {"status":200,"body":b'{"buildVersion":"new-app-version"}',"cache":"no-store"}
                if url.endswith("chunks/new.js"):
                    return {"status":200,"body":b"REAL_ASSET","cache":""}
                if url=="https://aoe2war.com/":
                    return {"status":200,"body":b'<script src="/_next/static/chunks/new.js"></script>',"cache":""}
                return {"status":200,"body":b"ok","cache":""}
            get.side_effect=reply
            b["internal"]["asset_sha256"]=g.sha(b"REAL_ASSET")
            self.assertTrue(g.public_check(b,"https://aoe2war.com")["public_bytes_bound_to_active_build"])
            with self.assertRaises(g.Hold):
                g.public_check(b,"https://evil.example")
            b["internal"]["asset_sha256"]="f"*64
            with self.assertRaises(g.Hold):
                g.public_check(b,"https://aoe2war.com")

    def test_ssh_target_rejects_unreviewed_hosts_and_keeps_host_key_checks(self):
        with patch.object(g,"run",return_value=b'{"ok":true}') as runner:
            with patch.object(g.pathlib.Path,"read_bytes",return_value=b"source"):
                self.assertEqual(g.ssh_observe("root@reviewed-hel1",None),{"ok":True})
                argv=runner.call_args.args[0]
                self.assertIn("StrictHostKeyChecking=yes",argv)
                self.assertIn("BatchMode=yes",argv)
                self.assertIn("-T",argv)
                self.assertIn("--remote",argv)
        for target in ("tony@hel1","root@host;touch /tmp/x","root@host name",""):
            with self.subTest(target=target):
                with self.assertRaises(g.Hold):g.ssh_observe(target,None)

    def test_json_duplicate_rejected(self):
        with self.assertRaises(g.Hold):g.parsed(b'{"a":1,"a":2}')
        with self.assertRaises(g.Hold):g.parsed(b'{"x":NaN}')

if __name__=="__main__":unittest.main()
