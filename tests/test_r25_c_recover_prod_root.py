"""Refusal-first tests for the one-use, existing-source-only 3032 recovery."""
import datetime
import base64
import fcntl
import importlib.util
import ipaddress
import json
from pathlib import Path
import re
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "recovery",ROOT/"scripts/r25_c_recover_prod_root.py")
assert spec and spec.loader
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class RecoveryRefusal(unittest.TestCase):
    def test_exact_one_use_packet_fail_closed_before_host_access(self):
        for value in ({},{"nonce":r.OLD_NONCE},
                      {"nonce":"a"*32,"recovery_source_sha":"f"*40}):
            with self.subTest(value=value):
                with self.assertRaisesRegex(r.Hold,"RECOVERY_PACKET"):
                    r.verify(value)

    def test_plan_makes_no_physical_admission_claim(self):
        old={"artifact":{"sha256":"a"*64},
             "protected_snapshot_sha256":"b"*64}
        payload={"nonce":"1"*32,"recovery_source_sha":"2"*40,
                 "source_file_sha256":"3"*64,
                 "prior_entered_sha256":"4"*64,
                 "prior_hold_sha256":"5"*64}
        current={"old_pid":2625090,"preview_pid":1483304,"financial":"unmodified"}
        safe={"sha":r.digest,"canonical":r.canonical,
              "production_protected":lambda:current}
        with mock.patch.object(r,"verify",return_value=(old,Path("/tmp/held"))),\
             mock.patch.object(r,"qualified_source",return_value={"ci_run_id":1}),\
             mock.patch.object(r,"m",return_value=safe):
            p=r.make_plan(payload)
        self.assertEqual(p["current_protected_sha256"],r.digest(r.canonical(current)))
        self.assertEqual(p["original_protected_sha256"],old["protected_snapshot_sha256"])
        self.assertEqual(p["prior_source_sha"],r.OLD)
        self.assertEqual(p["public_cutover_authorized"],False)
        self.assertEqual(p["financial_authorized"],False)
        self.assertTrue(p["previous_attempt_immutable"])

    def test_plan_and_recover_packets_allow_only_one_authenticated_comment_field(self):
        packet={"nonce":"a"*32,"recovery_source_sha":"b"*40,
                "source_file_sha256":"c"*64,"prior_entered_sha256":"d"*64,
                "prior_hold_sha256":"e"*64}
        # Exercise the packet-level shape while holding file inspection prior to
        # authenticated source validation. All other keys are refused.
        with mock.patch.object(r,"root_bytes",side_effect=r.Hold("PREIMAGE_REQUIRED")):
            for candidate in (packet,{**packet,"owner_comment_id":123}):
                with self.assertRaisesRegex(r.Hold,"PREIMAGE_REQUIRED"):
                    r.verify(candidate)
            for candidate in ({**packet,"owner_comment_id":0},
                              {**packet,"owner_comment_id":True},
                              {**packet,"owner_comment_id":123,"arbitrary_field":0}):
                with self.assertRaisesRegex(r.Hold,"PACKET_FIELDS|COMMENT_ID_INVALID"):
                    r.verify(candidate)

    def test_recovery_grant_is_owner_authenticated_and_nonfinancial(self):
        payload={"nonce":"a"*32,"recovery_source_sha":"b"*40,
                 "source_file_sha256":"c"*64,"owner_comment_id":33}
        plan={"source":"fixture"}
        today=datetime.datetime.now(datetime.timezone.utc)
        grant={"scope":"RECOVER_EXISTING_NONFINANCIAL_3032_ONLY",
               "nonce":payload["nonce"],"prior_source_sha":r.OLD,
               "recovery_source_sha":payload["recovery_source_sha"],
               "source_file_sha256":payload["source_file_sha256"],
               "plan_sha256":r.digest(r.canonical(plan)),"max_uses":1,
               "public_cutover_authorized":False,"financial_authorized":False,
               "issued_at":(today-datetime.timedelta(seconds=20)).isoformat(),
               "expires_at":(today+datetime.timedelta(seconds=200)).isoformat(),
               "delegated_ai_authorship_disclosed":True}
        def response(fields,login="Emaren"):
            return mock.Mock(returncode=0,stdout=json.dumps({
               "user":{"login":login,"id":15059910},
               "id":33,"issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1108",
               "html_url":"https://github.com/Emaren/app-prodn/issues/1108#issuecomment-33",
               "created_at":"t","updated_at":"t",
               "body":"APP_PRODUCTION_3032_RECOVERY_GRANT\n"+json.dumps(fields)}))
        with mock.patch.object(r.subprocess,"run",return_value=response(grant)):
            accepted=r.grant(payload,plan)
        self.assertEqual(accepted["comment_id"],33)
        for patch in (
            {"financial_authorized":True},
            {"public_cutover_authorized":True},
            {"max_uses":2},
            {"nonce":"f"*32},
            {"plan_sha256":"0"*64},
            {"expires_at":(today-datetime.timedelta(seconds=2)).isoformat()}):
            with self.subTest(patch=patch):
                with mock.patch.object(r.subprocess,"run",return_value=response({**grant,**patch})):
                    with self.assertRaises(r.Hold):
                        r.grant(payload,plan)
        with mock.patch.object(r.subprocess,"run",return_value=response(grant,"other-user")):
            with self.assertRaisesRegex(r.Hold,"OWNER_RECOVERY_IDENTITY"):
                r.grant(payload,plan)

    def test_exact_steam_refresh_never_broadens_nft_or_changes_legacy(self):
        calls=[]
        state={"unchanged":True}
        root={"production_nft_shape":lambda:"scope",
              "sha":r.digest,"canonical":r.canonical,
              "production_protected":lambda:state,
              "production_steam_addresses":lambda:["95.100.176.225"],
              "ipaddress":ipaddress,
              "run":lambda args,**kw:calls.append((args,kw))}
        self.assertEqual(r.refresh(root),["95.100.176.225"])
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][0],["/usr/sbin/nft","-f","-"])
        body=calls[0][1]["data"].decode()
        self.assertIn("95.100.176.225 timeout 300s",body)
        self.assertNotIn("flush table",body)
        self.assertNotIn("8092",body)
        self.assertNotIn("0.0.0.0",body)
        self.assertNotIn("meta skuid",body)

    def test_node_steam_uses_real_guard_and_sealed_stage(self):
        recorded={}
        def run(args,**kw):
            recorded.update({"args":args,**kw})
            return mock.Mock(returncode=0,
                stdout=b'{"ok":true,"authenticated":false}')
        module={"PROD_USER":"aoe2war-web-prod","PROD_PROFILE":"nonfinancial-production-v1",
                "PROD_GUARD":Path("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs")}
        with mock.patch.object(r.subprocess,"run",side_effect=run):
            result=r.steam(module,{"SESSION_SECRET":"synthetic-test-only"},Path("/var/lib/aoe2war-web-prod-886dac221e73"))
        self.assertTrue(result["steam_tls_verified"])
        self.assertEqual(recorded["cwd"],"/var/lib/aoe2war-web-prod-886dac221e73")
        self.assertEqual(recorded["env"]["PORT"],"3032")
        self.assertIn("--require=",recorded["env"]["NODE_OPTIONS"])
        self.assertIn("openid.mode=check_authentication",recorded["args"][-1])
        self.assertNotIn("http://127.0.0.1:8092",recorded["args"][-1])

    def test_recovery_only_changes_isolated_service_with_failure_hold(self):
        source=(ROOT/"scripts/r25_c_recover_prod_root.py").read_text()
        self.assertIn('root["run"](["/usr/bin/systemctl","stop",root["PROD_UNIT"]]',source)
        self.assertIn('root["seal"](journal/"hold.json"',source)
        self.assertIn('"CONSUMED_NO_REPLAY"',source)
        self.assertIn('root["production_witness"]',source)
        self.assertIn('"PRODUCTION_3032_ADMITTED_NOT_PUBLIC"',source)
        self.assertNotIn("systemctl restart",source)
        self.assertNotIn("DROP ROLE",source)
        self.assertNotIn("DELETE FROM",source)
        self.assertNotIn("public_cutover_authorized\":True",source)
        self.assertNotIn("financial_authorized\":True",source)

    def test_real_release_lock_blocks_competing_process_and_releases_on_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"release.lock";path.touch(mode=0o644)
            st=path.stat()
            fixture={"LOCK":path,"LOCK_ID":(st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))}
            probe="import fcntl,sys; f=open(sys.argv[1]); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)"
            with mock.patch.object(r,"m",return_value=fixture):
                with self.assertRaisesRegex(RuntimeError,"deliberate failure"):
                    with r.release_lock():
                        other=subprocess.run([sys.executable,"-c",probe,str(path)],capture_output=True)
                        self.assertNotEqual(other.returncode,0)
                        self.assertIn(b"BlockingIOError",other.stderr)
                        raise RuntimeError("deliberate failure")
                self.assertEqual(subprocess.run([sys.executable,"-c",probe,str(path)],capture_output=True).returncode,0)
                path.chmod(0o666)
                with self.assertRaisesRegex(r.Hold,"ORIGINAL_RELEASE_LOCK_CHANGED"):
                    with r.release_lock():self.fail("changed lock admitted")

    def test_owner_assertion_cannot_substitute_for_exact_source_ci_or_scanner(self):
        raw=b"reviewed recovery fixture only\n"
        packet={"recovery_source_sha":"a"*40,"source_file_sha256":r.digest(raw)}
        names=["Release and documentation control plane","Type, contract, and production build",
               "Isolated Steam-rating PostgreSQL chronology"]
        records={"source":{"type":"file","encoding":"base64","content":base64.b64encode(raw).decode()+"\n"},
          "runs":{"workflow_runs":[{"id":123,"head_sha":packet["recovery_source_sha"],"name":"AoE2WAR CI","status":"completed","conclusion":"success"}]},
          "jobs":{"total_count":3,"jobs":[{"name":n,"status":"completed","conclusion":"success"} for n in names]},
          "checks":{"check_runs":[{"id":456,"name":"GitGuardian Security Checks","app":{"slug":"gitguardian"},"status":"completed","conclusion":"success"}]}}
        def github(endpoint):
            if endpoint.startswith("contents/"):return records["source"]
            if "/jobs?" in endpoint:return records["jobs"]
            if endpoint.startswith("actions/workflows/"):return records["runs"]
            if endpoint.startswith("commits/"):return records["checks"]
            self.fail("Unexpected source qualification endpoint")
        with mock.patch.object(r,"m",return_value={"production_github":github}):
            self.assertEqual(r.qualified_source(packet)["ci_run_id"],123)
            for section,field,value in (("source","content",base64.b64encode(b"unreviewed").decode()),
                                         ("jobs","total_count",2),("checks","check_runs",[])):
                original=records[section][field];records[section][field]=value
                try:
                    with self.assertRaises(r.Hold):r.qualified_source(packet)
                finally:records[section][field]=original
            for row,field,value in ((records["runs"]["workflow_runs"][0],"head_sha","f"*40),
                                    (records["jobs"]["jobs"][0],"conclusion","failure"),
                                    (records["checks"]["check_runs"][0],"conclusion","failure")):
                original=row[field];row[field]=value
                try:
                    with self.assertRaises(r.Hold):r.qualified_source(packet)
                finally:row[field]=original

if __name__=="__main__":
    unittest.main()
