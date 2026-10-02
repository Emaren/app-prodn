import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CHALLENGE_PROTOCOL_VERSION } from "../lib/challengeProtocol.ts";
import { CHAMPIONSHIP_PROTOCOL_VERSION } from "../lib/challengeChampionshipProtocol.ts";

const migrationUrl = new URL(
  "../prisma/migrations/20261001181500_championship_protocol_version_constraint/migration.sql",
  import.meta.url,
);
const sql = fs.readFileSync(migrationUrl, "utf8");

test("scheduled_matches protocol constraint admits every live versioned challenge protocol", () => {
  assert.equal(CHALLENGE_PROTOCOL_VERSION, "steam_wolo_v1");
  assert.equal(CHAMPIONSHIP_PROTOCOL_VERSION, "championship_v2");

  assert.match(sql, /AOE2WAR-MIGRATION-MODE: PRODUCTION_PROVEN_CHECK_REPLACEMENT/);
  assert.match(
    sql,
    /AOE2WAR-PRODUCTION-CHECK: scheduled_matches ck_scheduled_matches_protocol_version before_sha256=4556ea241adef098ef9cc3a4bed540dd6362ae25f6a024571e4e6dffbccff7d4 after_sha256=5360090c2838853d83c710893bdf25bf607732e6565a6df47da0878b5c0908e8/,
  );
  assert.match(sql, /DROP CONSTRAINT "ck_scheduled_matches_protocol_version"/);
  assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_protocol_version"/);
  assert.match(sql, /ADD CONSTRAINT "ck_scheduled_matches_protocol_version"/);
  assert.match(
    sql,
    /"protocol_version" IN \('steam_wolo_v1', 'championship_v2'\)/,
  );

  for (const version of [CHALLENGE_PROTOCOL_VERSION, CHAMPIONSHIP_PROTOCOL_VERSION]) {
    assert.ok(sql.includes(`'${version}'`), `${version} must be admitted by the database constraint`);
  }
});

test("every non-null scheduled match protocol remains bound to distinct Steam ID64 snapshots", () => {
  assert.match(
    sql,
    /AOE2WAR-PRODUCTION-CHECK: scheduled_matches ck_scheduled_matches_steam_wolo_identity before_sha256=a87421a52c6ceb502aaf3c074a40a4c938a496a697dac446dfb17f74b50e9cf3 after_sha256=fea8defdbfaaaa3e33a66399043f8932249b4e2326ccee23ffae587d560ffa59/,
  );
  assert.match(sql, /DROP CONSTRAINT "ck_scheduled_matches_steam_wolo_identity"/);
  assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_steam_wolo_identity"/);
  assert.match(sql, /ADD CONSTRAINT "ck_scheduled_matches_steam_wolo_identity"/);
  assert.match(sql, /"protocol_version" IS NULL OR \(/);
  assert.match(sql, /challenger_steam_id_snapshot" ~ '\^\[0-9\]\{15,20\}\$'/);
  assert.match(sql, /challenged_steam_id_snapshot" ~ '\^\[0-9\]\{15,20\}\$'/);
  assert.match(sql, /challenger_steam_id_snapshot" <> "challenged_steam_id_snapshot/);
  assert.doesNotMatch(sql, /UPDATE\s+"scheduled_matches"/i);
});
