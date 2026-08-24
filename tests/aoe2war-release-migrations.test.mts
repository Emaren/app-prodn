import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auto = fs.readFileSync("scripts/aoe2_release_auto.py", "utf8");
const ship = fs.readFileSync("scripts/aoe2_release_ship.py", "utf8");
const deployGuide = fs.readFileSync("DEPLOY.md", "utf8");
const releaseGuide = fs.readFileSync("docs/RELEASE_ENGINEERING.md", "utf8");

test("one-command ship supports bounded additive DATABASE/FINANCIAL Prisma migrations", () => {
  assert.match(auto, /def _sql_statements/);
  assert.match(auto, /def migration_contract/);
  assert.match(auto, /Prisma migrations require a DATABASE or FINANCIAL release gate/);
  assert.match(auto, /migration contract rejects destructive SQL/);
  assert.match(auto, /additive backfills may only populate/);
  assert.match(auto, /must remain/);
  assert.match(auto, /nullable in the automatic additive lane/);
  assert.match(auto, /only permits nullable ADD COLUMN/);
  assert.match(auto, /forbids deleting/);
  assert.match(auto, /forbids inserting new production truth/);
  assert.match(auto, /procedural or dynamic SQL mutation/);
});

test("production-proven index canonicalization is exact-proof-bound", () => {
  assert.match(auto, /AOE2WAR-PRODUCTION-INDEX/);
  assert.match(auto, /production index proof mismatch/);
  assert.match(auto, /production-proven-index-canonicalization/);
  assert.match(auto, /migrate resolve/);
  assert.match(auto, /indisvalid/);
  assert.match(auto, /indisready/);
});

test("production migrations are exact-frontier, backup-first, and receipt-bound", () => {
  assert.match(auto, /pending migration frontier differs from release manifest/);
  assert.match(auto, /pg_dump -Fc --no-owner --no-acl/);
  assert.match(auto, /pre-migration\.dump/);
  assert.match(auto, /prisma migrate deploy/);
  assert.match(auto, /_prisma_migrations/);
  assert.match(auto, /migration-status\.txt/);
  assert.match(auto, /durable migration receipt is missing/);
});

test("migration phase runs after staging and before activation", () => {
  assert.match(auto, /apply_production_migrations_if_needed\(release_head\)/);
  const applyAt = auto.indexOf("apply_production_migrations_if_needed(release_head)");
  const activationAt = auto.indexOf('print("== ACTIVATION PREFLIGHT ==")', applyAt);
  assert.ok(applyAt >= 0);
  assert.ok(activationAt > applyAt);
});

test("manual receipt-driven activation refuses migration releases without DB proof", () => {
  assert.match(ship, /def verify_production_migration_receipt/);
  assert.match(ship, /Production migration verification failed/);
  assert.match(ship, /durable production migration receipt is missing/);
  assert.match(ship, /verify_production_migration_receipt\(manifest\)/);
});

test("release plan tells the operator what the migration phase does", () => {
  assert.match(ship, /durable pre-migration pg_dump/);
  assert.match(ship, /exact production migration frontier/);
  assert.doesNotMatch(
    auto,
    /raise AutoShipError\("durable staged release contains Prisma migrations"\)/
  );
  assert.doesNotMatch(
    ship,
    /automated ship does not support migrations yet/
  );
});

test("operator docs describe the sealed additive lane without stale refusal text", () => {
  for (const guide of [deployGuide, releaseGuide]) {
    assert.match(guide, /protected/i);
    assert.match(guide, /additive migration (?:contract|lane)/i);
    assert.match(guide, /pre-migration/);
    assert.match(guide, /exact(?:ly)?(?:-| )once|exact frontier/i);
    assert.doesNotMatch(guide, /never performs a database migration/i);
    assert.doesNotMatch(guide, /refuses any release manifest containing\s+Prisma migration paths/i);
  }
});
