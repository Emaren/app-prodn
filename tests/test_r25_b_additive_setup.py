#!/usr/bin/env python3
"""Pure fixture tests for NEW-only R25 B setup; no HEL1 privileges or writes."""
import base64
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def load(p,name):
    spec=importlib.util.spec_from_file_location(name,p)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

b=load(ROOT/"scripts/r25_b_additive_3031_setup.py","r25_setup")
mac=load(ROOT/"scripts/r25_b_owner_mac_setup.py","r25_mac")

def bundle():
    paths={
       "guard":"scripts/r25_b_guard.cjs",
       "witness":"scripts/r25_b_host_witness.py",
       "dropin":"deploy/r25-b-3031.service.dropin.in",
       "nft":"deploy/r25-b-3031-egress.nft.in",
    }
    blob={k:base64.b64encode((ROOT/p).read_bytes()).decode() for k,p in paths.items()}
    return base64.b64encode(json.dumps(blob).encode()).decode()

class TestOwnerInstall(unittest.TestCase):
    def test_c_build_staged_gate_denies_before_new_only_install(self):
        self.assertEqual(str(b.C_STAGE),"/var/lib/aoe2war-r25-web-0cee3c836c4b")
        with self.assertRaisesRegex(RuntimeError,"C_PHYSICAL_BUILD_STAGED_REQUIRED"):
            b.c_build_ready()

    def test_exact_physical_build_identity_pins(self):
        self.assertEqual(b.C_BUILD_ID, "-dJl5VyecHu5BKNvfErJe")
        self.assertEqual(b.C_BUILD_VERSION, "20261031171526-148d3df911")
        self.assertEqual(b.C_TREE_SHA, "5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d")
        self.assertEqual(b.C_VERIFIED_FILES, 87038)

    def test_build_gate_requires_full_receipt_identity(self):
        import inspect
        source=inspect.getsource(b.c_build_ready)
        for clause in ("data.get(\"build_id\")!=C_BUILD_ID",
                       "data.get(\"tree_sha256\")!=C_TREE_SHA",
                       "data.get(\"files\")!=C_VERIFIED_FILES"):
            self.assertIn(clause,source)

    def test_plan_is_build_gated_prior_to_install(self):
        import inspect
        source=inspect.getsource(b.main)
        self.assertIn("actual_build=c_build_ready()",source)
        self.assertIn('"c_build_id":actual_build',source)

    def test_public_acl_preflight_flags_inherited_unsafe_functions_before_install(self):
        import types
        risks={"database_create":0,"schema_create":0,"table_write":0,
               "sequence_write":0,"unsafe_callable":3}
        with patch.object(b,"cmd",return_value=types.SimpleNamespace(stdout=json.dumps(risks).encode())):
            with self.assertRaisesRegex(RuntimeError,"INHERITED_PUBLIC_WRITE_OR_CALLABLE"):
                b.inherited_public_write_risks("aoe2hd_db")

    def test_public_acl_preflight_accepts_zero_inherited_risks(self):
        import types
        risks={"database_create":0,"schema_create":0,"table_write":0,
               "sequence_write":0,"unsafe_callable":0}
        with patch.object(b,"cmd",return_value=types.SimpleNamespace(stdout=json.dumps(risks).encode())) as cmd:
            self.assertEqual(b.inherited_public_write_risks("aoe2hd_db"),risks)
            self.assertEqual(cmd.call_args.args[0][-3],"aoe2hd_db")
            self.assertIn("aclexplode",cmd.call_args.args[0][-1])

    def test_public_acl_check_precedes_install_mutations(self):
        import inspect
        self.assertIn("inherited_public_write_risks(args.database)",
                      inspect.getsource(b.check_inputs))

    def test_real_b_immutable_bundle_is_accepted(self):
        d=b.decode_bundle(bundle())
        self.assertEqual(b.sha(d["guard"]),b.GUARD_SHA)
        self.assertEqual(b.sha(d["witness"]),b.WITNESS_SHA)
        self.assertIn(b.GUARD_SHA,d["dropin"].decode())
        self.assertNotIn("__B_GUARD_SHA256__",d["dropin"].decode())

    def test_nft_exact_template_has_only_two_executable_uid_substitutions(self):
        d=b.decode_bundle(bundle())
        self.assertEqual(d["nft"].decode().count("__DEDICATED_UID__"),2)
        self.assertNotIn("flush",d["nft"].decode().lower())
        self.assertIn("ct state new drop",d["nft"].decode())

    def test_guard_mutation_rejected(self):
        package=json.loads(base64.b64decode(bundle()))
        package["guard"]=base64.b64encode(b"malicious").decode()
        raw=base64.b64encode(json.dumps(package).encode()).decode()
        with self.assertRaisesRegex(RuntimeError,"B_GUARD_OR_WITNESS_SHA_DRIFT"):
            b.decode_bundle(raw)

    def test_dropin_mutation_rejected_even_with_guard_pin(self):
        package=json.loads(base64.b64decode(bundle()))
        src=base64.b64decode(package["dropin"])+b"\nExecStartPost=/bin/true\n"
        package["dropin"]=base64.b64encode(src).decode()
        with self.assertRaisesRegex(RuntimeError,"B_NEW_ONLY_NFT_OR_SYSTEMD_SOURCE_BLOB_DRIFT"):
            b.decode_bundle(base64.b64encode(json.dumps(package).encode()).decode())

    def test_nft_mutation_rejected(self):
        package=json.loads(base64.b64decode(bundle()))
        package["nft"]=base64.b64encode(b"flush ruleset\n").decode()
        with self.assertRaisesRegex(RuntimeError,"B_NEW_ONLY_NFT_OR_SYSTEMD_SOURCE_BLOB_DRIFT"):
            b.decode_bundle(base64.b64encode(json.dumps(package).encode()).decode())

    def test_unexpected_bundle_key_rejected(self):
        package=json.loads(base64.b64decode(bundle()))
        package["old_web_secret"]="none"
        with self.assertRaisesRegex(RuntimeError,"EXACT_B_FOUR_ASSETS_REQUIRED"):
            b.decode_bundle(base64.b64encode(json.dumps(package).encode()).decode())

    def test_plan_requires_original_root_physical_host(self):
        from types import SimpleNamespace
        args=SimpleNamespace(commit=b.SOURCE_COMMIT,phase="plan",database="app",consent="")
        with patch.object(b.os,"geteuid",return_value=1000):
            with self.assertRaisesRegex(RuntimeError,"ORIGINAL_HEL1_ROOT_REQUIRED"):
                b.check_inputs(args)

    def test_no_existing_financial_web_pid_change(self):
        with patch.object(b,"cmd",return_value=type("C",(),{"stdout":b"MainPID=2625091\nActiveState=active\n"})()):
            with self.assertRaisesRegex(RuntimeError,"ORIGINAL_FINANCIAL_WEB_PID_DRIFT"):
                b.old_web()

    def test_install_without_owner_phrase_rejected_before_writes(self):
        from types import SimpleNamespace
        args=SimpleNamespace(commit=b.SOURCE_COMMIT,phase="install",database="app",consent="not-owner")
        with patch.object(b.os,"geteuid",return_value=0), \
             patch.object(b.socket,"gethostname",return_value=b.HOST):
            with self.assertRaisesRegex(RuntimeError,"EXPLICIT_OWNER_INSTALL_CONSENT_MISSING"):
                b.check_inputs(args)

    def test_sql_contains_new_role_only_no_existing_revoke(self):
        sql=b.new_role_sql("a"*48).decode()
        self.assertIn("BEGIN;",sql)
        self.assertIn("CREATE ROLE aoe2war_r25_web_ro",sql)
        self.assertIn("NOBYPASSRLS",sql)
        self.assertIn("GRANT SELECT ON ALL TABLES",sql)
        self.assertIn("RAISE EXCEPTION",sql)
        self.assertIn("COMMIT;",sql)
        self.assertNotIn("REVOKE",sql)
        self.assertNotIn("DROP ROLE",sql)
        self.assertNotIn("DELETE FROM",sql)

    def test_new_pg_role_sql_contains_scram_verifier_not_plaintext(self):
        password="A"*56
        sql=b.new_role_sql(password).decode()
        self.assertIn("SCRAM-SHA-256$",sql)
        self.assertNotIn(password,sql)
        self.assertIn("CREATE ROLE aoe2war_r25_web_ro",sql)

    def test_sql_password_not_accepted_if_malicious(self):
        with self.assertRaisesRegex(RuntimeError,"GENERATED_PASSWORD_FORMAT"):
            b.new_role_sql("x';DROP TABLE funds; --")

    def test_owner_mac_default_cannot_offer_install_without_explicit_phase(self):
        import inspect
        s=inspect.getsource(mac.main)
        self.assertIn('["--plan-only"]',s)
        self.assertIn('["--install"]',s)
        self.assertIn("EXPLICIT_PLAN_ONLY_OR_INSTALL_PHASE_REQUIRED",s)
        self.assertIn("PASS:R25_B_PLAN_ONLY_NO_INSTALL_SSH",s)

    def test_owner_mac_root_and_templates_pinned(self):
        self.assertEqual(mac.B_SOURCE,b.SOURCE_COMMIT)
        self.assertEqual(mac.GUARD_SHA,b.GUARD_SHA)
        self.assertEqual(mac.WITNESS_SHA,b.WITNESS_SHA)
        self.assertEqual(mac.DROPIN_GIT_BLOB,b.DROPIN_GIT_BLOB)
        self.assertEqual(mac.NFT_GIT_BLOB,b.NFT_GIT_BLOB)

    def test_owner_mac_does_not_execute_unpinned_source(self):
        import inspect
        s=inspect.getsource(mac)
        self.assertIn("gitblob(root)!=ROOT_BLOB",s)
        self.assertIn("StrictHostKeyChecking=yes",s)
        self.assertIn("BatchMode=yes",s)
        self.assertIn("typed!=CONSENT",s)
        self.assertNotIn("set -euo pipefail",s)
        self.assertNotIn('open("/dev/tty"',s)

    def test_install_is_explicitly_nonreplayable(self):
        import inspect
        s=inspect.getsource(b)
        self.assertIn('RECEIPT.parent/"started.json"',s)
        self.assertIn("O_EXCL",s)
        self.assertIn("INSTALL_STARTED_NOT_CERTIFIED",s)
        self.assertNotIn("git reset --hard",s)
        self.assertNotIn("git clean",s)
        self.assertNotIn("systemctl restart",s)

    def test_receipt_explicitly_is_not_public_approval(self):
        import inspect
        s=inspect.getsource(b.install)
        self.assertIn('"public_cutover_authorized":False',s)
        self.assertIn('"candidate_started":False',s)
        self.assertIn("NOINHERIT",inspect.getsource(b.new_role_sql))

    def test_native_probes_use_postgres_only_metadata(self):
        import inspect
        sql=inspect.getsource(b.role_absent)
        self.assertIn("pg_roles",sql)
        self.assertNotIn("betMarket",sql)
        self.assertNotIn("UPDATE",sql)
        self.assertNotIn("DELETE",sql)

if __name__=="__main__":
    unittest.main()
