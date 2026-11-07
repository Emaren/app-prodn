"""C02 post-DDL financial ACL MUST be rechecked after 29 new tables exist."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest

from scripts import c02_satchel_postmigration_owner_hold as gate

ROOT=Path(__file__).resolve().parents[1]
NEUTRAL="aoe2war_finance_owner"


def fixture():
    objects=[]
    for name in gate.source_inventory(ROOT):
        objects.append({
            "name":name,"namespace":"public","kind":"table",
            "attached_to":None,"owner":NEUTRAL,
            "owner_can_login":False,"owner_superuser":False,
            "roles":[{
                "name":role,"exists":True,"role_superuser":False,
                "role_createrole":False,"role_bypassrls":False,
                "effective_write":False,"schema_create":False,
                "owner_member":False,
            } for role in gate.ROLES],
        })
    return {"schema":gate.CATALOG_SCHEMA,"database":"aoe2hd_c07_restore",
            "server_version_num":160015,"objects":objects}


class PostMigrationOwnerProof(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names=gate.source_inventory(ROOT)

    def before(self):
        return fixture()

    def reject(self,data,code):
        with self.assertRaisesRegex(gate.Hold,code):
            gate.evaluate(data,self.names,NEUTRAL)

    def test_exact_source_twelve_migrations_29_tables(self):
        self.assertEqual(len(gate.MIGRATIONS),12)
        self.assertEqual(len(self.names),29)
        self.assertEqual(len(self.names),len(set(self.names)))
        self.assertTrue(all(n.startswith("war_satchel_") for n in self.names))

    def test_safe_catalog_is_only_observation_not_release(self):
        x=gate.evaluate(self.before(),self.names,NEUTRAL)
        self.assertEqual(x["status"],"HOLD_C02_POSTMIGRATION_NEGATIVE_ACL_OBSERVED")
        self.assertEqual(x["table_count"],29)
        self.assertFalse(x["independent_c07_restore_proven"])
        self.assertFalse(x["c02_physical_gate_closed"])
        self.assertFalse(x["c09_funded_release_authorized"])

    def test_catalog_missing_table_fails(self):
        d=self.before();d["objects"].pop()
        self.reject(d,"C02_POSTMIGRATION_TABLE_COVERAGE_DRIFT")

    def test_unexpected_new_financial_table_fails(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],name="war_satchel_unreviewed_new_liability"))
        self.reject(d,"C02_POSTMIGRATION_TABLE_COVERAGE_DRIFT")

    def test_duplicate_table_fails(self):
        d=self.before();d["objects"].append(copy.deepcopy(d["objects"][0]))
        self.reject(d,"C02_CATALOG_DUPLICATED_OBJECT")

    def test_wrong_type_view_or_trigger_fails(self):
        d=self.before();d["objects"][0]["kind"]="view"
        self.reject(d,"C02_UNREVIEWED_RELKIND")

    def test_owner_must_equal_post_fence_owner(self):
        d=self.before();d["objects"][0]["owner"]="aoe2hd_user"
        self.reject(d,"C02_NEW_DDL_OWNER_PRIVILEGE_REGRESSION")

    def test_owner_cannot_login_or_be_superuser(self):
        for k in ("owner_can_login","owner_superuser"):
            d=self.before();d["objects"][0][k]=True
            self.reject(d,"C02_NEW_DDL_OWNER_PRIVILEGE_REGRESSION")

    def test_no_implicit_boolean_or_string_coercions(self):
        for k in ("owner_can_login","owner_superuser"):
            d=self.before();d["objects"][0][k]="false"
            self.reject(d,"C02_NEW_DDL_OWNER_PRIVILEGE_REGRESSION")

    def test_all_three_roles_must_exist(self):
        d=self.before();d["objects"][0]["roles"][0]["exists"]=False
        self.reject(d,"C02_EFFECTIVE_FINANCIAL_WRITER_REGRESSION")
        d=self.before();d["objects"][0]["roles"].pop()
        self.reject(d,"C02_LEGACY_ROLE_COVERAGE_INCOMPLETE")

    def test_no_legacy_or_web_effective_writes_or_schema_create(self):
        for role in gate.ROLES:
            for key in ("effective_write","schema_create","owner_member"):
                d=self.before()
                target=next(x for x in d["objects"][3]["roles"] if x["name"]==role)
                target[key]=True
                self.reject(d,"C02_EFFECTIVE_FINANCIAL_WRITER_REGRESSION")

    def test_no_role_elevation_holes(self):
        for key in ("role_superuser","role_createrole","role_bypassrls"):
            d=self.before();d["objects"][1]["roles"][0][key]=True
            self.reject(d,"C02_EFFECTIVE_FINANCIAL_WRITER_REGRESSION")

    def test_unavailable_pg16_or_unknown_role_is_hold(self):
        for version in (150012,170000,0,None,"160015",True):
            d=self.before();d["server_version_num"]=version
            self.reject(d,"C02_PG16_CATALOG_VERSION_REQUIRED")

    def test_unreviewed_finance_owner_not_accepted(self):
        for owner in (None,"aoe2hd_user","aoe2war_web_prod","root","a","a!bad"):
            with self.assertRaises(gate.Hold):
                gate.evaluate(self.before(),self.names,owner)

    def test_no_trust_of_arbitrary_attached_sequences(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],name="war_satchel_funded_balances_id_seq",
                                 kind="sequence",attached_to="war_satchel_funded_balances"))
        x=gate.evaluate(d,self.names,NEUTRAL)
        self.assertEqual(x["sequence_count"],1)
        d["objects"][-1]["name"]="unreviewed_external_auto_sequence"
        self.reject(d,"C02_ATTACHED_SEQUENCE_REQUIRES_MANUAL_SCOPE_REVIEW")

    def test_financial_sequence_outside_public_schema_fails(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],
                                 name="war_satchel_refund_seq",
                                 kind="sequence",namespace="private"))
        self.reject(d,"C02_FINANCIAL_SEQUENCE_SCHEMA_OUTSIDE_REVIEW")

    def test_attached_primary_key_index_is_audited(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],
                                 name="war_satchel_funded_balances_pkey",
                                 kind="index",attached_to="war_satchel_funded_balances"))
        x=gate.evaluate(d,self.names,NEUTRAL)
        self.assertEqual(x["index_count"],1)
        self.assertFalse(x["c02_physical_gate_closed"])

    def test_unattached_index_rejected(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],
                                 name="war_satchel_funded_balances_pkey",
                                 kind="index",attached_to=None))
        self.reject(d,"C02_UNREVIEWED_FINANCE_RELATION_ATTACHMENT")

    def test_index_attached_to_unreviewed_table_rejected(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],
                                 name="war_satchel_funded_balances_pkey",
                                 kind="index",attached_to="rogue_unreviewed_table"))
        self.reject(d,"C02_UNREVIEWED_FINANCE_RELATION_ATTACHMENT")

    def test_extra_owner_role_membership_cannot_be_hidden(self):
        d=self.before();d["objects"][1]["roles"][2]["owner_member"]=True
        self.reject(d,"C02_EFFECTIVE_FINANCIAL_WRITER_REGRESSION")

    def test_sql_is_read_only_catalog_and_detects_sequences(self):
        sql=gate.SELECT_CATALOG
        self.assertIn("BEGIN READ ONLY",sql)
        self.assertIn("pg_catalog.pg_class",sql)
        self.assertIn("pg_catalog.pg_depend",sql)
        self.assertIn("pg_catalog.pg_index",sql)
        self.assertIn("'attached_to'",sql)
        self.assertIn("has_table_privilege",sql)
        self.assertIn("has_sequence_privilege",sql)
        self.assertIn("pg_has_role",sql)
        self.assertIn("has_schema_privilege",sql)
        self.assertIn("COMMIT",sql)
        self.assertNotIn("ALTER ROLE",sql)
        self.assertNotIn("CREATE ROLE",sql)
        self.assertNotIn("pg_terminate_backend",sql)
        self.assertNotIn("pg_cancel_backend",sql)

    def test_changed_file_fails_even_if_table_set_similar(self):
        with tempfile.TemporaryDirectory(prefix="c02-source-drift-") as td:
            root=Path(td)
            dst=root/"prisma/migrations"
            for rel,raw in gate.canonical_migration_catalog(ROOT):
                target=root/rel
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(raw)
            target=dst/next(iter(gate.MIGRATIONS))/"migration.sql"
            target.write_bytes(target.read_bytes()+b"\n-- harmless-looking drift\n")
            with self.assertRaisesRegex(gate.Hold,"C02_FINANCE_MIGRATION_SQL_SHA_DRIFT"):
                gate.source_inventory(root)

    def test_unexpected_new_migration_not_silently_ignored(self):
        with tempfile.TemporaryDirectory(prefix="c02-source-set-") as td:
            root=Path(td)
            dst=root/"prisma/migrations"
            for rel,raw in gate.canonical_migration_catalog(ROOT):
                target=root/rel
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(raw)
            unexpected=dst/"99999999_war_satchel_shadow_fee"/"migration.sql"
            unexpected.parent.mkdir()
            unexpected.write_text('CREATE TABLE "war_satchel_shadow_fee" (id INT);\n')
            with self.assertRaisesRegex(gate.Hold,"C02_FINANCE_MIGRATION_SET_DRIFT"):
                gate.source_inventory(root)

    def test_catalog_is_private_owner0600_nosymlink(self):
        with tempfile.TemporaryDirectory(prefix="c02-catalog-") as td:
            p=Path(td)/"catalog.json"
            p.write_text(json.dumps(self.before())+"\n")
            p.chmod(0o600)
            self.assertEqual(gate.private_catalog(p)["schema"],gate.CATALOG_SCHEMA)
            p.chmod(0o644)
            with self.assertRaisesRegex(gate.Hold,"C02_CATALOG_OWNER_MODE_OR_SIZE_DRIFT"):
                gate.private_catalog(p)
            p.chmod(0o600)
            link=Path(td)/"link.json"
            link.symlink_to(p)
            with self.assertRaisesRegex(gate.Hold,"C02_CATALOG_PATH_UNSAFE"):
                gate.private_catalog(link)

    def test_main_without_physical_c07_receipt_is_hold(self):
        # Pure source inventory cannot certify an actual installed finance DB.
        import contextlib
        import io
        output=io.StringIO()
        with contextlib.redirect_stdout(output):
            rc=gate.main(["--root",str(ROOT)])
        self.assertEqual(rc,3)
        d=json.loads(output.getvalue())
        self.assertEqual(d["status"],"HOLD_NO_C07_POSTMIGRATION_CATALOG")
        self.assertFalse(d["catalog_verified"])
        self.assertFalse(d["c02_physical_gate_closed"])
        self.assertFalse(d["c09_funded_release_authorized"])


if __name__=="__main__":
    unittest.main()
