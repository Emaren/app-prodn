#!/usr/bin/env python3
"""C02 HOLD: source-sealed Satchel migrations and read-only post-DDL finance ACL audit.

Source-only on the Mac; no database, network or financial mutation. Emits a
PG16 SELECT catalog query for an already isolated C07 restored database, or
examines its saved root-private catalog JSON. This is NOT a release receipt.

The 29 new war_satchel_* tables can be created by an elevated migration role.
An older C03 finance-writer fence must be revalidated AFTER these migrations,
including automatic attached sequences and effective privileges. A green
catalog observation still requires a real C07 restore, issuer-bound evidence,
runtime authorization and fresh signed funding permit before C02/C09.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

# Reuse the existing thirteen-file, byte-pinned PG16 migration contract.
# No duplicate SHA literal list and no duplicate source-of-truth.
try:
    from scripts.c02_pg16_disposable_migration_hold import (
        catalog as canonical_migration_catalog,
        Hold as CanonicalMigrationHold,
        EXPECTED_COUNT as CANONICAL_MIGRATION_COUNT,
    )
except ModuleNotFoundError:
    from c02_pg16_disposable_migration_hold import (
        catalog as canonical_migration_catalog,
        Hold as CanonicalMigrationHold,
        EXPECTED_COUNT as CANONICAL_MIGRATION_COUNT,
    )

SCHEMA="aoe2war.c02.postmigration-effective-finance-privileges.v1"
CATALOG_SCHEMA="aoe2war.c02.pg16-satchel-effective-acl.v1"
ROLES=("aoe2hd_user","aoe2de_user","aoe2war_web_prod")
MIGRATIONS=(
    "20261014_103500_war_satchel_noncrediting_foundation",
    "20261014_133000_war_satchel_wallet_owner_challenges",
    "20261014_150000_war_satchel_simulated_double_entry",
    "20261014_164500_war_satchel_simulation_concurrency_guard",
    "20261014_191500_war_satchel_simulation_single_owner",
    "20261017_012000_war_satchel_funded_ledger_foundation",
    "20261018_020000_war_satchel_physical_receipt_consumption",
    "20261018_040000_war_satchel_financial_authorizations",
    "20261018_041000_war_satchel_withdrawal_physical_consumption",
    "20261018_042000_war_satchel_auto_spend_mandate",
    "20261019_010000_war_satchel_wager_authority",
    "20261029_160000_war_satchel_claim_return_execution",
)
CREATE=re.compile(r'(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([a-z][a-z0-9_]*)"?\s*\(')
MAX_SQL=2_097_152
MAX_CATALOG=1_048_576


class Hold(ValueError):
    pass


def insist(ok,reason):
    if not ok:raise Hold(reason)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def source_read(path):
    insist(not path.is_symlink() and path.parent.is_dir()
           and not path.parent.is_symlink() and path.is_file(),
           "C02_SOURCE_PATH_OR_TYPE_DRIFT")
    st=path.lstat()
    insist(stat.S_ISREG(st.st_mode) and 0<st.st_size<=MAX_SQL,
           "C02_SQL_SIZE_OR_TYPE_DRIFT")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        before=os.fstat(fd)
        raw=os.read(fd,MAX_SQL+1)
        after=os.fstat(fd)
        insist(len(raw)==before.st_size and before.st_size<=MAX_SQL
               and all(getattr(before,x)==getattr(after,x) for x in
                       ("st_dev","st_ino","st_size","st_mtime_ns",
                        "st_ctime_ns","st_mode")),
               "C02_SQL_CHANGED_DURING_SOURCE_READ")
        return raw
    finally:os.close(fd)


def source_inventory(root):
    base=root/"prisma/migrations"
    insist(base.is_dir() and not base.is_symlink(),"C02_MIGRATION_ROOT_UNAVAILABLE")
    names={p.parent.name for p in base.glob("*war_satchel*/migration.sql")}
    insist(names==set(MIGRATIONS),"C02_FINANCE_MIGRATION_SET_DRIFT")
    try:
        # The existing reviewed inspector covers all 13 SQL files and their
        # full content hashes, including the separate product-limit migration.
        canonical=canonical_migration_catalog(root)
    except CanonicalMigrationHold as exc:
        if str(exc)=="MIGRATION_COUNT_DRIFT":
            raise Hold("C02_FINANCE_MIGRATION_SET_DRIFT") from None
        raise Hold("C02_FINANCE_MIGRATION_SQL_SHA_DRIFT") from None
    insist(len(canonical)==CANONICAL_MIGRATION_COUNT==13,
           "C02_CANONICAL_THIRTEEN_MIGRATIONS_NOT_PINNED")
    expected={f"prisma/migrations/{name}/migration.sql" for name in MIGRATIONS}
    found={name for name,_ in canonical if "war_satchel" in name}
    insist(found==expected,"C02_FINANCE_MIGRATION_SET_DRIFT")
    tables={}
    for relative_path,raw in canonical:
        if relative_path not in expected:
            continue
        insist(source_read(root/relative_path)==raw,
               "C02_FINANCE_MIGRATION_CHANGED_DURING_CATALOG")
        sql=raw.decode("utf-8","strict")
        for table in CREATE.findall(sql):
            insist(table.startswith("war_satchel_") and table not in tables,
                   "C02_FINANCE_TABLE_DDL_NOT_UNIQUE")
            tables[table]=relative_path
    insist(len(tables)==29,"C02_FINANCE_TABLE_COUNT_DRIFT")
    return sorted(tables)


RELATIONS_FILE="scripts/fixtures/c02_satchel_real_migration_relations_pg16_v1.json"
RELATIONS_SCHEMA="aoe2war.c02.real-13-migration-pg16-relation-census.v1"
RELATION_COUNTS={"table":29,"sequence":8,"index":76}


def reject_json_duplicate_keys(pairs):
    data={}
    for k,v in pairs:
        insist(k not in data,"C02_RELATION_MANIFEST_DUPLICATE_KEY")
        data[k]=v
    return data


def source_relation_inventory(root,table_names):
    """Source-bound identity census from ACTUAL 13 SQL migrations on PG16.

    No synthetic SERIAL-per-table assumptions: the reviewed native migration
    rehearsal creates 29 tables, 8 attached sequences and 76 indexes.
    """
    raw=source_read(root/RELATIONS_FILE)
    try:
        data=json.loads(raw.decode("utf-8"),object_pairs_hook=reject_json_duplicate_keys)
    except Hold:
        raise
    except (UnicodeError,ValueError,RecursionError) as exc:
        raise Hold("C02_RELATION_MANIFEST_INVALID") from exc
    insist(type(data) is dict
           and set(data)=={"schema","pg_major","canonical_migration_count","relations"}
           and data.get("schema")==RELATIONS_SCHEMA
           and type(data.get("pg_major")) is int and data["pg_major"]==16
           and type(data.get("canonical_migration_count")) is int
           and data["canonical_migration_count"]==CANONICAL_MIGRATION_COUNT,
           "C02_NATIVE_PG16_MANIFEST_BINDING_MISSING")
    rows=data["relations"]
    insist(type(rows) is list and len(rows)==113,
           "C02_NATIVE_PG16_MANIFEST_OBJECT_COUNT_DRIFT")
    found={}
    counts={"table":0,"sequence":0,"index":0}
    for row in rows:
        insist(type(row) is dict and
               set(row)=={"name","kind","attached_to"},
               "C02_NATIVE_PG16_MANIFEST_ROW_INVALID")
        name,kind,attachment=row["name"],row["kind"],row["attached_to"]
        insist(type(name) is str and
               re.fullmatch(r"[a-z][a-z0-9_]{2,110}",name) is not None and
               kind in counts and name not in found,
               "C02_NATIVE_PG16_MANIFEST_IDENTITY_INVALID")
        insist(attachment is None if kind=="table" else
               type(attachment) is str and attachment in table_names,
               "C02_NATIVE_PG16_MANIFEST_ATTACHMENT_INVALID")
        found[name]=(kind,attachment)
        counts[kind]+=1
    insist(counts==RELATION_COUNTS and
           {k for k,(kind,_) in found.items() if kind=="table"}==set(table_names),
           "C02_NATIVE_PG16_MANIFEST_COVERAGE_DRIFT")
    return found


# Run this SQL ONLY inside the separately verified C07 PG16 restored session,
# with psql -X -A -t and a read-only transaction. It never creates, alters,
# revokes, grants or starts any role/service. No DB access from this controller.
SELECT_CATALOG=r"""
BEGIN READ ONLY;
WITH protected_tables AS (
  SELECT c.oid
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND LEFT(c.relname, 12) = 'war_satchel_'
    AND c.relkind IN ('r','p')
),
attached_indexes AS (
  SELECT DISTINCT idx.indexrelid AS oid
  FROM pg_catalog.pg_index idx
  WHERE idx.indrelid IN (SELECT oid FROM protected_tables)
),
attached_sequences AS (
  SELECT DISTINCT d.objid AS oid
  FROM pg_catalog.pg_depend d
  JOIN pg_catalog.pg_class seq ON seq.oid = d.objid
  WHERE d.refobjid IN (SELECT oid FROM protected_tables)
    AND d.classid = 'pg_catalog.pg_class'::regclass
    AND d.refclassid = 'pg_catalog.pg_class'::regclass
    AND d.deptype IN ('a','i')
    AND seq.relkind = 'S'
),
targets AS (
  SELECT c.oid,c.relname,c.relkind,c.relowner,n.oid AS ns_oid,
         n.nspname AS namespace,
         o.rolname AS owner_name,o.rolcanlogin,o.rolsuper
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_roles o ON o.oid = c.relowner
  WHERE (n.nspname = 'public'
         AND LEFT(c.relname,12) = 'war_satchel_')
     OR c.oid IN (SELECT oid FROM attached_sequences)
     OR c.oid IN (SELECT oid FROM attached_indexes)
)
SELECT pg_catalog.json_build_object(
  'schema','aoe2war.c02.pg16-satchel-effective-acl.v1',
  'database',current_database(),
  'server_version_num',current_setting('server_version_num')::int,
  'objects',
  COALESCE((
    SELECT pg_catalog.json_agg(
      pg_catalog.json_build_object(
        'name',t.relname,'namespace',t.namespace,
        'kind',CASE WHEN t.relkind IN ('r','p') THEN 'table'
                    WHEN t.relkind='S' THEN 'sequence'
                    WHEN t.relkind IN ('i','I') THEN 'index'
                    ELSE 'unexpected' END,
        'attached_to',CASE
          WHEN t.relkind='S' THEN (
            SELECT parent.relname
            FROM pg_catalog.pg_depend dep
            JOIN pg_catalog.pg_class parent ON parent.oid=dep.refobjid
            WHERE dep.objid=t.oid
              AND dep.refobjid IN (SELECT oid FROM protected_tables)
              AND dep.deptype IN ('a','i')
            ORDER BY parent.relname LIMIT 1)
          WHEN t.relkind IN ('i','I') THEN (
            SELECT parent.relname
            FROM pg_catalog.pg_index idx
            JOIN pg_catalog.pg_class parent ON parent.oid=idx.indrelid
            WHERE idx.indexrelid=t.oid
              AND idx.indrelid IN (SELECT oid FROM protected_tables)
            LIMIT 1)
          ELSE NULL END,
        'owner',t.owner_name,'owner_can_login',t.rolcanlogin,
        'owner_superuser',t.rolsuper,
        'roles',(
          SELECT pg_catalog.json_agg(
            pg_catalog.json_build_object(
              'name',v.role_name,'exists',r.oid IS NOT NULL,
              'role_superuser',r.rolsuper,
              'role_createrole',r.rolcreaterole,
              'role_bypassrls',r.rolbypassrls,
              'effective_write',
                CASE WHEN r.oid IS NULL THEN NULL
                     WHEN t.relkind='S' THEN
                       has_sequence_privilege(r.oid,t.oid,'USAGE,UPDATE')
                     ELSE has_table_privilege(r.oid,t.oid,
                        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                END,
              'schema_create',
                CASE WHEN r.oid IS NULL THEN NULL
                     ELSE has_schema_privilege(r.oid,t.ns_oid,'CREATE') END,
              'owner_member',
                CASE WHEN r.oid IS NULL THEN NULL
                     ELSE pg_has_role(r.oid,t.relowner,'MEMBER') END
            ) ORDER BY v.role_name)
          FROM (VALUES ('aoe2hd_user'),('aoe2de_user'),
                       ('aoe2war_web_prod')) AS v(role_name)
          LEFT JOIN pg_catalog.pg_roles r ON r.rolname=v.role_name
        )
      ) ORDER BY t.relname)
    FROM targets t
  ),'[]'::json)
);
COMMIT;
""".strip()


def evaluate(catalog,table_names,expected_owner):
    insist(type(catalog) is dict and
           set(catalog)=={"schema","database","server_version_num","objects"} and
           catalog.get("schema")==CATALOG_SCHEMA,
           "C02_CATALOG_SCHEMA_UNRECOGNIZED")
    insist(type(catalog.get("server_version_num")) is int and
           160000<=catalog["server_version_num"]<170000,
           "C02_PG16_CATALOG_VERSION_REQUIRED")
    insist(type(catalog.get("database")) is str and
           re.fullmatch(r"[a-z0-9_]{2,63}",catalog["database"]) is not None,
           "C02_ISOLATED_DB_IDENTITY_MISSING")
    insist(type(expected_owner) is str and
           re.fullmatch(r"[a-z][a-z0-9_]{2,62}",expected_owner) is not None and
           expected_owner not in ROLES,
           "C02_C03_REVIEWED_NEUTRAL_OWNER_REQUIRED")
    expected=source_relation_inventory(Path(__file__).resolve().parents[1],
                                       table_names)
    objects=catalog.get("objects")
    insist(type(objects) is list and len(objects)==len(expected)==113,
           "C02_REAL_SOURCE_RELATION_COUNT_DRIFT")
    table_set=set()
    sequences=0
    indexes=0
    names=set()
    for row in objects:
        insist(type(row) is dict and
               set(row)=={"name","namespace","kind","attached_to",
                          "owner","owner_can_login","owner_superuser","roles"}
               and type(row.get("name")) is str and
               re.fullmatch(r"[a-z][a-z0-9_]{2,110}",row["name"]) is not None,
               "C02_CATALOG_ROW_NOT_VALID")
        name=row["name"]
        insist(name not in names,"C02_CATALOG_DUPLICATED_OBJECT")
        insist(row.get("namespace")=="public",
               "C02_FINANCIAL_SEQUENCE_SCHEMA_OUTSIDE_REVIEW")
        names.add(name)
        kind=row.get("kind")
        insist(kind in ("table","sequence","index"),
               "C02_UNREVIEWED_RELKIND")
        attached=row.get("attached_to")
        if kind=="table":
            insist(attached is None,"C02_TABLE_INCONSISTENT_DEPENDENCY")
            table_set.add(name)
        else:
            insist(type(attached) is str and attached in table_names,
                   "C02_UNREVIEWED_FINANCE_RELATION_ATTACHMENT")
            if kind=="sequence":sequences+=1
            else:indexes+=1
        insist(expected.get(name)==(kind,attached),
               "C02_REAL_MIGRATION_RELATION_IDENTITY_DRIFT")
        insist(row.get("owner")==expected_owner and
               row.get("owner_can_login") is False and
               row.get("owner_superuser") is False,
               "C02_NEW_DDL_OWNER_PRIVILEGE_REGRESSION")
        roles=row.get("roles")
        insist(type(roles) is list and len(roles)==len(ROLES) and
               {r.get("name") for r in roles if type(r) is dict}==set(ROLES),
               "C02_LEGACY_ROLE_COVERAGE_INCOMPLETE")
        for role in roles:
            insist(type(role) is dict and
                   set(role)=={"name","exists","role_superuser",
                               "role_createrole","role_bypassrls",
                               "effective_write","schema_create","owner_member"}
                   and role.get("exists") is True
                   and role.get("effective_write") is False
                   and role.get("schema_create") is False
                   and role.get("owner_member") is False
                   and role.get("role_superuser") is False
                   and role.get("role_createrole") is False
                   and role.get("role_bypassrls") is False,
                   "C02_EFFECTIVE_FINANCIAL_WRITER_REGRESSION")
    insist(table_set==set(table_names),
           "C02_POSTMIGRATION_TABLE_COVERAGE_DRIFT")
    insist(sequences==RELATION_COUNTS["sequence"] and
           indexes==RELATION_COUNTS["index"] and
           names==set(expected),
           "C02_REAL_MIGRATION_RELATION_IDENTITY_DRIFT")
    return {"status":"HOLD_C02_POSTMIGRATION_NEGATIVE_ACL_OBSERVED",
            "database":catalog["database"],"table_count":len(table_set),
            "sequence_count":sequences,"index_count":indexes,
            "legacy_and_web_mutation_capabilities_denied":True,
            "neutral_financial_owner_nonlogin":True,
            "independent_c07_restore_proven":False,
            "c02_physical_gate_closed":False,
            "c09_funded_release_authorized":False}


def private_catalog(path):
    insist(path.is_absolute() and not path.is_symlink(),"C02_CATALOG_PATH_UNSAFE")
    statinfo=path.lstat()
    insist(stat.S_ISREG(statinfo.st_mode) and
           statinfo.st_uid==os.geteuid() and
           stat.S_IMODE(statinfo.st_mode)==0o600 and
           0<statinfo.st_size<=MAX_CATALOG,
           "C02_CATALOG_OWNER_MODE_OR_SIZE_DRIFT")
    raw=source_read(path)
    insist(len(raw)<=MAX_CATALOG,"C02_CATALOG_SIZE_EXCEEDED")
    return json.loads(raw,object_pairs_hook=reject_json_duplicate_keys)


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1])
    p.add_argument("--emit-sql",action="store_true")
    p.add_argument("--catalog-json",type=Path)
    p.add_argument("--expected-neutral-owner")
    a=p.parse_args(argv)
    try:
        tables=source_inventory(a.root)
        relation_manifest=source_relation_inventory(a.root,tables)
        if a.emit_sql:
            insist(a.catalog_json is None,"C02_QUERY_AND_CATALOG_MIXED")
            print(SELECT_CATALOG)
            return 0   # Query emission is NOT an acceptance decision.
        report={"schema":SCHEMA,"status":"HOLD_NO_C07_POSTMIGRATION_CATALOG",
                "source_migrations_pinned":CANONICAL_MIGRATION_COUNT,
                "expected_new_financial_tables":len(tables),
                "expected_attached_sequences":RELATION_COUNTS["sequence"],
                "expected_attached_indexes":RELATION_COUNTS["index"],
                "source_catalog_relation_count":len(relation_manifest),
                "catalog_verified":False,
                "independent_c07_restore_proven":False,
                "c02_physical_gate_closed":False,
                "c09_funded_release_authorized":False}
        if a.catalog_json is not None:
            result=evaluate(private_catalog(a.catalog_json),tables,
                            a.expected_neutral_owner)
            report.update(result,catalog_verified=True)
    except (Hold,OSError,UnicodeError,ValueError,TypeError,KeyError):
        print(json.dumps({"schema":SCHEMA,"status":"STOP_C02_POSTMIGRATION_SECURITY_DRIFT",
                          "c02_physical_gate_closed":False,
                          "c09_funded_release_authorized":False},sort_keys=True))
        return 2
    print(json.dumps(report,sort_keys=True))
    return 3  # Even a passing catalog cannot independently close C02.


if __name__=="__main__":
    sys.exit(main())
