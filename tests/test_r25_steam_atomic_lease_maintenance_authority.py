"""Synthetic tests only: never mutate nft, systemd or HEL1."""
import datetime as dt
import importlib.util
import inspect
import json
from pathlib import Path
import subprocess
import sys
import unittest
SOURCE=Path(__file__).resolve().parents[1]/"scripts/release/owner-review/r25_steam_live_atomic_renewal_REVIEW_ONLY.py"
def loaded():
    spec=importlib.util.spec_from_file_location("steam_review_only",SOURCE)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m
NOW=dt.datetime(2026,11,11,9,15,tzinfo=dt.timezone.utc)
def fixture(m):
    req={"nonce":"a"*40,"expires_utc":(NOW+dt.timedelta(minutes=30)).isoformat(),
         "protected_host":{"boot_id":"6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"}}
    packet_sha="1"*64; exe_sha="2"*64
    approval=m.approval_expectation(req,packet_sha,exe_sha)
    approval["expires_utc"]=(NOW+dt.timedelta(minutes=20)).isoformat()
    ts=(NOW-dt.timedelta(seconds=40)).isoformat()
    tick=chr(96)*3
    comment={"id":6790000001,"html_url":"https://github.com/Emaren/app-prodn/pull/1316#issuecomment-6790000001",
       "user":{"login":"Emaren"},"created_at":ts,"updated_at":ts,
       "body":"Independent synthetic test only\n"+tick+"json\n"+json.dumps(approval)+"\n"+tick}
    return req,packet_sha,exe_sha,comment
def replace_field(comment,key,value):
    tick=chr(96)*3
    data=json.loads(comment["body"].split(tick)[1][4:])
    data[key]=value
    comment["body"]=tick+"json\n"+json.dumps(data)+"\n"+tick
class SteamMaintenanceAuthorityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.m=loaded()
    def held(self,req,packet,exe,comment,reason):
        with self.assertRaisesRegex(RuntimeError,reason):
            self.m.validate_approval(req,packet,exe,comment,NOW)
    def test_import_inert(self):
        self.assertEqual(self.m.OPERATION,"ONE_USE_V20_TIMER_QUIESCED_SAME_VERIFIED_IPS_NFT_ATOMIC_LEASE_RENEWAL_ONLY")
    def test_no_args_inert(self):
        p=subprocess.run([sys.executable,"-B",str(SOURCE)],capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,3)
        self.assertIn("HOLD:SOURCE_REVIEW_NO_OPERATION",p.stdout)
    def test_unprivileged_prepare_refused(self):
        p=subprocess.run([sys.executable,"-B",str(SOURCE),"--prepare"],capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,3)
        self.assertIn("HOLD",p.stdout)
    def test_execute_missing_fields_refused(self):
        p=subprocess.run([sys.executable,"-B",str(SOURCE),"--execute"],capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,3)
        self.assertIn("EXECUTION_ARGS_MISSING",p.stdout)
    def test_synthetic_pure_approval_fixture(self):
        r,p,s,c=fixture(self.m)
        self.assertEqual(self.m.validate_approval(r,p,s,c,NOW)["decision"],self.m.DECISION)
    def test_wrong_request_sha_denied(self):
        r,p,s,c=fixture(self.m);self.held(r,"3"*64,s,c,"OPERATION_OR_PACKET")
    def test_wrong_executor_sha_denied(self):
        r,p,s,c=fixture(self.m);self.held(r,p,"4"*64,c,"OPERATION_OR_PACKET")
    def test_wrong_nonce_denied(self):
        r,p,s,c=fixture(self.m);r["nonce"]="b"*40
        self.held(r,p,s,c,"OPERATION_OR_PACKET")
    def test_fake_author_denied(self):
        r,p,s,c=fixture(self.m);c["user"]["login"]="somebody-else"
        self.held(r,p,s,c,"INDEPENDENT_GITHUB_AUTHOR")
    def test_edited_approval_denied(self):
        r,p,s,c=fixture(self.m);c["updated_at"]=(NOW-dt.timedelta(seconds=1)).isoformat()
        self.held(r,p,s,c,"APPROVAL_EDITED")
    def test_expired_approval_denied(self):
        r,p,s,c=fixture(self.m)
        c["created_at"]=(NOW-dt.timedelta(minutes=40)).isoformat()
        c["updated_at"]=c["created_at"]
        self.held(r,p,s,c,"APPROVAL_STALE")
    def test_extra_field_denied(self):
        r,p,s,c=fixture(self.m);replace_field(c,"allow_web_restart",True)
        self.held(r,p,s,c,"EXTRA_OR_MISSING_KEY")
    def test_financial_or_website_permission_denied(self):
        for forbidden in ("financial_authorized","web_activation_authorized","v22_install_authorized","manager_reload_authorized"):
            r,p,s,c=fixture(self.m);replace_field(c,forbidden,True)
            self.held(r,p,s,c,"OPERATION_OR_PACKET")
    def test_more_than_one_nft_batch_denied(self):
        r,p,s,c=fixture(self.m);replace_field(c,"nft_batch_limit",2)
        self.held(r,p,s,c,"OPERATION_OR_PACKET")
    def test_wrong_boot_denied(self):
        r,p,s,c=fixture(self.m);r["protected_host"]["boot_id"]="fake-boot"
        self.held(r,p,s,c,"OPERATION_OR_PACKET")
    def test_same_membership_exact_300(self):
        lines=self.m.atomic_commands({"steam4":{"2.23.88.217":60,"23.12.156.233":170},"steam6":{}})
        self.assertEqual(len(lines),4)
        self.assertEqual(lines[0],"delete element inet aoe2war_web_prod steam4 { 2.23.88.217 }")
        self.assertEqual(lines[1],"add element inet aoe2war_web_prod steam4 { 2.23.88.217 timeout 300s }")
    def test_nonpublic_ip_denied(self):
        with self.assertRaisesRegex(RuntimeError,"UNSAFE_NFT_IP_SCOPE"):
            self.m.atomic_commands({"steam4":{"192.0.2.11":99},"steam6":{}})
    def test_empty_batch_denied(self):
        with self.assertRaisesRegex(RuntimeError,"NFT_ATOMIC_COMMAND_BUDGET"):
            self.m.atomic_commands({"steam4":{},"steam6":{}})
    def test_provider_stale_or_missing_denied(self):
        s=inspect.getsource(self.m.provider)
        self.assertIn('set(sets["steam4"])==set(v4)',s)
        self.assertIn('set(sets["steam6"])==set(v6)',s)
        self.assertIn("STALE_OR_MISSING_PROVIDER_NFT_MEMBER",s)
    def test_timer_stop_and_restore_on_error(self):
        s=inspect.getsource(self.m.perform)
        self.assertIn('timer_stop_attempted=True',s)
        self.assertIn('if timer_stop_attempted:',s)
        self.assertIn('if m.unit(TIMER)["ActiveState"]!="active":',s)
        self.assertIn('bound_process(["systemctl","start",TIMER]',s)
        self.assertIn('NATIVE_V20_REFRESH_DID_NOT_QUIESCE',s)
    def test_forbidden_nft_ops_absent(self):
        lines=self.m.atomic_commands({"steam4":{"2.23.88.217":10},"steam6":{}})
        self.assertEqual(sum(x.startswith("delete element") for x in lines),1)
        self.assertEqual(sum(x.startswith("add element") for x in lines),1)
        self.assertTrue(all("steam4" in x for x in lines))
        self.assertTrue(all("timeout 300s" in x for x in lines if x.startswith("add")))
        self.assertFalse(any("8092" in x or "flush" in x or "rule" in x for x in lines))
if __name__=="__main__":unittest.main()
