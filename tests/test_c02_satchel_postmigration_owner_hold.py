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
    names=gate.source_inventory(ROOT)
    manifest=gate.source_relation_inventory(ROOT,names)
    objects=[]
    for name,(kind,parent) in sorted(manifest.items()):
        objects.append({
            "name":name,"namespace":"public","kind":kind,
            "attached_to":parent,"owner":NEUTRAL,
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
        manifest=gate.source_relation_inventory(ROOT,self.names)
        self.assertEqual(len(manifest),113)
        self.assertEqual({k:sum(x[0]==k for x in manifest.values()) for k in
                          ("table","sequence","index")},
                         {"table":29,"sequence":8,"index":76})
        self.assertTrue(any(n.startswith("ix_satchel_") for n in manifest))

    def test_safe_catalog_is_only_observation_not_release(self):
        x=gate.evaluate(self.before(),self.names,NEUTRAL)
        self.assertEqual(x["status"],"HOLD_C02_POSTMIGRATION_NEGATIVE_ACL_OBSERVED")
        self.assertEqual(x["table_count"],29)
        self.assertEqual(x["sequence_count"],8)
        self.assertEqual(x["index_count"],76)
        self.assertFalse(x["independent_c07_restore_proven"])
        self.assertFalse(x["c02_physical_gate_closed"])
        self.assertFalse(x["c09_funded_release_authorized"])

    def test_catalog_missing_table_fails(self):
        d=self.before();d["objects"].pop()
        self.reject(d,"C02_REAL_SOURCE_RELATION_COUNT_DRIFT")

    def test_unexpected_new_financial_table_fails(self):
        d=self.before()
        d["objects"].append(dict(d["objects"][0],name="war_satchel_unreviewed_new_liability"))
        self.reject(d,"C02_REAL_SOURCE_RELATION_COUNT_DRIFT")

    def test_duplicate_table_fails(self):
        d=self.before();d["objects"].append(copy.deepcopy(d["objects"][0]))
        self.reject(d,"C02_REAL_SOURCE_RELATION_COUNT_DRIFT")

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

    def test_missing_real_migration_index_is_hard_stop(self):
        d=self.before()
        d["objects"]=[x for x in d["objects"]
                      if x["name"]!="ix_satchel_funded_journal_owner"]
        self.reject(d,"C02_REAL_SOURCE_RELATION_COUNT_DRIFT")

    def test_missing_real_migration_attached_sequence_is_hard_stop(self):
        d=self.before()
        d["objects"].remove(next(x for x in d["objects"] if x["kind"]=="sequence"))
        self.reject(d,"C02_REAL_SOURCE_RELATION_COUNT_DRIFT")

    def test_changed_index_identity_even_at_same_count_fails(self):
        d=self.before()
        idx=next(x for x in d["objects"] if x["kind"]=="index")
        idx["name"]="ix_satchel_fabricated_fee_authority"
        self.reject(d,"C02_REAL_MIGRATION_RELATION_IDENTITY_DRIFT")

    def test_changed_sequence_identity_even_at_same_count_fails(self):
        d=self.before()
        seq=next(x for x in d["objects"] if x["kind"]=="sequence")
        seq["name"]="war_satchel_fabricated_payment_seq"
        self.reject(d,"C02_REAL_MIGRATION_RELATION_IDENTITY_DRIFT")

    def test_wrong_real_migration_index_attachment_rejected(self):
        d=self.before()
        idx=next(x for x in d["objects"] if x["kind"]=="index")
        idx["attached_to"]=next(t for t in self.names if t!=idx["attached_to"])
        self.reject(d,"C02_REAL_MIGRATION_RELATION_IDENTITY_DRIFT")

    def test_no_trust_of_arbitrary_attached_sequences(self):
        d=self.before()
        seq=next(x for x in d["objects"] if x["kind"]=="sequence")
        seq["attached_to"]=next(n for n in self.names if n!=seq["attached_to"])
        self.reject(d,"C02_REAL_MIGRATION_RELATION_IDENTITY_DRIFT")

    def test_financial_sequence_outside_public_schema_fails(self):
        d=self.before()
        seq=next(x for x in d["objects"] if x["kind"]=="sequence")
        seq["namespace"]="private"
        self.reject(d,"C02_FINANCIAL_SEQUENCE_SCHEMA_OUTSIDE_REVIEW")

    def test_attached_primary_key_index_is_audited(self):
        d=self.before()
        index=next(x for x in d["objects"] if x["kind"]=="index")
        self.assertIn(index["attached_to"],self.names)
        x=gate.evaluate(d,self.names,NEUTRAL)
        self.assertEqual(x["index_count"],76)
        self.assertFalse(x["c02_physical_gate_closed"])

    def test_unattached_index_rejected(self):
        d=self.before()
        index=next(x for x in d["objects"] if x["kind"]=="index")
        index["attached_to"]=None
        self.reject(d,"C02_UNREVIEWED_FINANCE_RELATION_ATTACHMENT")

    def test_index_attached_to_unreviewed_table_rejected(self):
        d=self.before()
        index=next(x for x in d["objects"] if x["kind"]=="index")
        index["attached_to"]="rogue_unreviewed_table"
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

    def test_manifest_is_derived_from_real_pg16_not_synthetic_serial(self):
        manifest=gate.source_relation_inventory(ROOT,self.names)
        self.assertEqual(len(manifest),113)
        self.assertEqual(sum(k=="index" for k,_ in manifest.values()),76)
        self.assertEqual(sum(k=="sequence" for k,_ in manifest.values()),8)
        self.assertEqual(sum(k=="table" for k,_ in manifest.values()),29)
        self.assertFalse(all(name.startswith("war_satchel_") for name in manifest))
        self.assertTrue(all(parent in self.names for kind,parent in manifest.values()
                            if kind!="table"))

    def test_manifest_missing_relation_is_detected(self):
        with tempfile.TemporaryDirectory(prefix="c02-native-manifest-") as td:
            root=Path(td)
            target=root/gate.RELATIONS_FILE
            target.parent.mkdir(parents=True)
            packet=json.loads((ROOT/gate.RELATIONS_FILE).read_text())
            packet["relations"].pop()
            target.write_text(json.dumps(packet))
            with self.assertRaisesRegex(gate.Hold,"C02_NATIVE_PG16_MANIFEST_OBJECT_COUNT_DRIFT"):
                gate.source_relation_inventory(root,self.names)

    def test_manifest_bad_attached_table_is_detected(self):
        with tempfile.TemporaryDirectory(prefix="c02-native-manifest-") as td:
            root=Path(td)
            target=root/gate.RELATIONS_FILE
            target.parent.mkdir(parents=True)
            packet=json.loads((ROOT/gate.RELATIONS_FILE).read_text())
            next(x for x in packet["relations"] if x["kind"]=="index")["attached_to"]="rogue_table"
            target.write_text(json.dumps(packet))
            with self.assertRaisesRegex(gate.Hold,"C02_NATIVE_PG16_MANIFEST_ATTACHMENT_INVALID"):
                gate.source_relation_inventory(root,self.names)

    def test_manifest_duplicate_key_is_detected(self):
        with tempfile.TemporaryDirectory(prefix="c02-native-manifest-") as td:
            root=Path(td)
            target=root/gate.RELATIONS_FILE
            target.parent.mkdir(parents=True)
            raw=(ROOT/gate.RELATIONS_FILE).read_text()
            target.write_text(raw.replace('"pg_major": 16,',
                                          '"pg_major": 16, "pg_major": 16,',1))
            with self.assertRaisesRegex(gate.Hold,"C02_RELATION_MANIFEST_DUPLICATE_KEY"):
                gate.source_relation_inventory(root,self.names)

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

    def test_catalog_unknown_row_or_role_fields_are_not_trusted(self):
        d=self.before()
        d["objects"][0]["authorization_hint"]=True
        self.reject(d,"C02_CATALOG_ROW_NOT_VALID")
        d=self.before()
        d["objects"][0]["roles"][0]["allow_payment"]=True
        self.reject(d,"C02_EFFECTIVE_FINANCIAL_WRITER_REGRESSION")
        d=self.before()
        d["extra_source"]="external"
        self.reject(d,"C02_CATALOG_SCHEMA_UNRECOGNIZED")

    def test_private_catalog_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory(prefix="c02-private-catalog-") as td:
            path=Path(td)/"catalog.json"
            raw=json.dumps(self.before())
            path.write_text(raw.replace('"server_version_num": 160015,',
                                        '"server_version_num": 160015, "server_version_num": 160015,',1))
            path.chmod(0o600)
            with self.assertRaisesRegex(gate.Hold,"C02_RELATION_MANIFEST_DUPLICATE_KEY"):
                gate.private_catalog(path)

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
