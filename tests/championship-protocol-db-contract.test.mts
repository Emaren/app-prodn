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

  assert.match(sql, /DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_protocol_version"/);
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
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_steam_wolo_identity"/);
  assert.match(sql, /ADD CONSTRAINT "ck_scheduled_matches_steam_wolo_identity"/);
  assert.match(sql, /"protocol_version" IS NULL OR \(/);
  assert.match(sql, /challenger_steam_id_snapshot" ~ '\^\[0-9\]\{15,20\}\$'/);
  assert.match(sql, /challenged_steam_id_snapshot" ~ '\^\[0-9\]\{15,20\}\$'/);
  assert.match(sql, /challenger_steam_id_snapshot" <> "challenged_steam_id_snapshot/);
  assert.doesNotMatch(sql, /UPDATE\s+"scheduled_matches"/i);
});
