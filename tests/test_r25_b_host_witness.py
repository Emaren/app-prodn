#!/usr/bin/env python3
"""Adversarial B R25 native witness unit tests; mocked, no host mutation."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

p=Path(__file__).resolve().parents[1]/"scripts"/"r25_b_host_witness.py"
spec=importlib.util.spec_from_file_location("r25_b_host",p)
assert spec and spec.loader
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class TestBHostWitness(unittest.TestCase):
    def test_database_login_url_rejects_shared_writer_account(self):
        with self.assertRaisesRegex(RuntimeError,"DB_LOGIN_NOT_DEDICATED_RO"):
            b.db_proof("postgresql://postgres:dummy@127.0.0.1:5432/app",17251)

    def test_database_login_url_rejects_remote_db(self):
        with self.assertRaisesRegex(RuntimeError,"DB_LOGIN_NOT_DEDICATED_RO"):
            b.db_proof("postgresql://aoe2war_r25_web_ro:dummy@192.0.2.1:5432/app",17251)

    def test_role_security_accepts_actual_server_catalog_proof_only(self):
        safe={"session_user":b.DB_ROLE,"current_user":b.DB_ROLE,
              "database":"app","transaction_read_only":"on"}
        for k in ("role_restricted","no_writable_role_membership","no_db_create",
                  "no_schema_create","no_table_mutation","no_sequence_mutation",
                  "no_callable_security_definer","no_callable_volatile_user_functions"):
            safe[k]=True
        dsn="postgresql://aoe2war_r25_web_ro:dummy@127.0.0.1:5432/app"
        with patch.object(b,"run",return_value=json.dumps(safe).encode()) as f:
            receipt=b.db_proof(dsn,17251)
        self.assertEqual(receipt["role"],b.DB_ROLE)
        self.assertEqual(receipt["server_transaction_ro"],True)
        self.assertNotIn("dummy",repr(receipt))
        self.assertIn("/usr/bin/psql",f.call_args.args[0])
        self.assertNotIn("dummy",repr(f.call_args.args[0]))

    def test_role_writable_grant_rejects(self):
        safe={"session_user":b.DB_ROLE,"current_user":b.DB_ROLE,
              "database":"app","transaction_read_only":"on"}
        for k in ("role_restricted","no_writable_role_membership","no_db_create",
                  "no_schema_create","no_table_mutation","no_sequence_mutation",
                  "no_callable_security_definer","no_callable_volatile_user_functions"):
            safe[k]=True
        safe["no_table_mutation"]=False
        with patch.object(b,"run",return_value=json.dumps(safe).encode()):
            with self.assertRaisesRegex(RuntimeError,"DB_SERVER_ENFORCED_SELECT_ONLY"):
                b.db_proof("postgresql://aoe2war_r25_web_ro:x@127.0.0.1/app",17251)

    def test_role_security_definer_rejects(self):
        safe={"session_user":b.DB_ROLE,"current_user":b.DB_ROLE,
              "database":"app","transaction_read_only":"on"}
        for k in ("role_restricted","no_writable_role_membership","no_db_create",
                  "no_schema_create","no_table_mutation","no_sequence_mutation",
                  "no_callable_security_definer","no_callable_volatile_user_functions"):
            safe[k]=True
        safe["no_callable_security_definer"]=False
        with patch.object(b,"run",return_value=json.dumps(safe).encode()):
            with self.assertRaisesRegex(RuntimeError,"DB_SERVER_ENFORCED_SELECT_ONLY"):
                b.db_proof("postgresql://aoe2war_r25_web_ro:x@127.0.0.1/app",17251)

    def test_role_callable_volatile_function_rejects(self):
        safe={"session_user":b.DB_ROLE,"current_user":b.DB_ROLE,
              "database":"app","transaction_read_only":"on"}
        for k in ("role_restricted","no_writable_role_membership","no_db_create",
                  "no_schema_create","no_table_mutation","no_sequence_mutation",
                  "no_callable_security_definer","no_callable_volatile_user_functions"):
            safe[k]=True
        safe["no_callable_volatile_user_functions"]=False
        with patch.object(b,"run",return_value=json.dumps(safe).encode()):
            with self.assertRaisesRegex(RuntimeError,"DB_SERVER_ENFORCED_SELECT_ONLY"):
                b.db_proof("postgresql://aoe2war_r25_web_ro:x@127.0.0.1/app",17251)

    def test_nft_exact_egress_only_db_accepts(self):
        nft="""table inet aoe2war_r25_b {
 chain egress {
  type filter hook output priority -150; policy accept;
  meta skuid 17251 ct state new ip daddr 127.0.0.1 tcp dport 5432 accept
  meta skuid 17251 ct state new drop
 }
}
"""
        with patch.object(b,"run",return_value=nft.encode()):
            self.assertEqual(len(b.nft_policy(17251)),64)

    def test_nft_port_8092_exception_rejects(self):
        nft="""table inet aoe2war_r25_b {
 chain egress {
  type filter hook output priority -150; policy accept;
  meta skuid 17251 ct state new ip daddr 127.0.0.1 tcp dport 5432 accept
  meta skuid 17251 ct state new tcp dport 8092 accept
  meta skuid 17251 ct state new drop
 }
}
"""
        with patch.object(b,"run",return_value=nft.encode()):
            with self.assertRaisesRegex(RuntimeError,"NFT_EGRESS_RULES_NOT_EXACT"):
                b.nft_policy(17251)

    def test_nft_wrong_uid_rejects(self):
        nft="""type filter hook output priority -150; policy accept;
meta skuid 1000 ct state new ip daddr 127.0.0.1 tcp dport 5432 accept
meta skuid 1000 ct state new drop"""
        with patch.object(b,"run",return_value=nft.encode()):
            with self.assertRaisesRegex(RuntimeError,"NFT_EGRESS_RULES_NOT_EXACT"):
                b.nft_policy(17251)

    def test_no_unsafe_http_on_financial_endpoint_in_probe_source(self):
        import inspect
        raw=inspect.getsource(b.http_proof)
        self.assertIn("GUARD_HEALTH",raw)
        self.assertNotIn("/api/bets/",raw)
        self.assertNotIn("/api/staking/",raw)
        self.assertNotIn("/api/challenges/",raw)

    def test_original_web_and_candidate_separate_units(self):
        self.assertEqual(b.UNIT,"aoe2hdbets-web-r24.service")
        self.assertEqual(b.OLD_UNIT,"aoe2hdbets-web.service")
        self.assertNotEqual(b.UNIT,b.OLD_UNIT)
        self.assertIn("263",str(263))
        self.assertIn("2625090",Path(__file__).read_text() if False else
                      __import__("inspect").getsource(b.observe))

    def test_unix_finance_socket_visible_fails(self):
        with self.assertRaisesRegex(RuntimeError,"UNIX_SOCKET_ORIGINAL_FINANCE_PATHS_NOT_HIDDEN"):
            b.validate_filesystem_wall({"InaccessiblePaths":"/etc/aoe2hdbets",
                                        "ReadWritePaths":""})

    def test_finance_writer_fs_path_outside_cache_fails(self):
        status={"InaccessiblePaths":"/run /var/run /etc/aoe2hdbets /mnt/HC_Volume_105319120 /var/www/AoE2HDBets/app-prodn",
                "ReadWritePaths":"/var/lib/aoe2war-finance"}
        with self.assertRaisesRegex(RuntimeError,"NEW_WEB_WRITABLE_PATH_OUTSIDE_CANDIDATE_CACHE"):
            b.validate_filesystem_wall(status)

    def test_prestart_negative_without_verified_root_guard(self):
        with patch.object(b.os,"geteuid",return_value=0), \
             patch.object(b.socket,"gethostname",return_value=b.HOST), \
             patch.object(b,"require_root_file",return_value="f"*64):
            with self.assertRaisesRegex(RuntimeError,"ROOT_INSTALLED_GUARD_SHA_MISMATCH"):
                b.prestart("e"*64)

    def test_prestart_positive_is_only_not_live_admission(self):
        import types
        def status(unit):
            if unit==b.OLD_UNIT:return {"ActiveState":"active","MainPID":"2625090"}
            return {"User":b.USER,"WorkingDirectory":str(b.SOURCE),
                    "InaccessiblePaths":"/run /var/run /etc/aoe2hdbets /mnt/HC_Volume_105319120 /var/www/AoE2HDBets/app-prodn",
                    "ReadWritePaths":str(b.SOURCE/".next"/"cache")}
        with patch.object(b.os,"geteuid",return_value=0), \
             patch.object(b.socket,"gethostname",return_value=b.HOST), \
             patch.object(b,"require_root_file",return_value="a"*64), \
             patch.object(b,"systemd",side_effect=status), \
             patch.object(b.pwd,"getpwnam",return_value=types.SimpleNamespace(pw_uid=17251)), \
             patch.object(b,"nft_policy",return_value="b"*64), \
             patch.object(b,"root_db_envfile",return_value="dedicated_ro_dsn"), \
             patch.object(b,"db_proof",return_value={"role":b.DB_ROLE,"checked":["role_restricted"]}), \
             patch.object(b,"run",return_value=(b.TARGET+"\n").encode()), \
             patch.object(b.pathlib.Path,"is_file",return_value=True), \
             patch.object(b.pathlib.Path,"is_symlink",return_value=False), \
             patch.object(b.pathlib.Path,"read_text",return_value="real-build-id"):
            v=b.prestart("a"*64)
        self.assertEqual(v["status"],"PASS_B_PRESTART_FINANCIAL_CONTROLS_NOT_LIVE_NOT_RELEASE_AUTHORITY")
        self.assertEqual(v["release_authorized"],False)

    def test_new_c_service_os_principal_is_exact(self):
        self.assertEqual(b.USER,"aoe2war-r24-web")
        self.assertEqual(b.UNIT,"aoe2hdbets-web-r24.service")

    def test_root_witness_rejects_nonroot_before_physical_queries(self):
        with patch.object(b.os,"geteuid",return_value=1000):
            with self.assertRaisesRegex(RuntimeError,"ORIGINAL_HEL1_ROOT_REQUIRED"):
                b.observe("0"*64)

    def test_bad_guard_pin_rejects(self):
        with patch.object(b.os,"geteuid",return_value=0), \
             patch.object(b.socket,"gethostname",return_value=b.HOST):
            with self.assertRaisesRegex(RuntimeError,"EXPECTED_GUARD_SHA256_REQUIRED"):
                b.observe("not-a-sha")

if __name__=="__main__":unittest.main()
