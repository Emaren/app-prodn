import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL("../prisma/migrations/20260727180000_add_player_identity_foundation/migration.sql", import.meta.url),
  "utf8"
);

const targetModels = [
  "Warrior",
  "PlatformAccount",
  "PlatformNameObservation",
  "ProvisionalIdentity",
  "IdentityDecision",
  "IdentityDecisionSubject",
  "WarriorPlatformLink",
  "WarriorClaim",
  "IdentityResolutionRun",
  "ReplayPlayerIdentityProjection",
  "IdentityProjectionPublication",
] as const;

const targetTables = [
  "warriors",
  "platform_accounts",
  "platform_name_observations",
  "provisional_identities",
  "identity_decisions",
  "identity_decision_subjects",
  "warrior_platform_links",
  "warrior_claims",
  "identity_resolution_runs",
  "replay_player_identity_projections",
  "identity_projection_publications",
] as const;

test("Player Identity schema is additive and keeps replay-name observations versioned", () => {
  for (const model of targetModels) {
    assert.match(schema, new RegExp(`^model ${model} \\{`, "m"));
  }

  assert.match(
    schema,
    /@@unique\(\[replayPlayerSnapshotId, normalizationVersion\], map: "uq_platform_name_observations_snapshot_version"\)/
  );
  assert.doesNotMatch(
    schema,
    /replayPlayerSnapshotId\s+Int\?\s+@unique/
  );
  assert.match(
    schema,
    /platformNameObservations\s+PlatformNameObservation\[\]/
  );
  assert.match(
    schema,
    /identityProjections\s+ReplayPlayerIdentityProjection\[\]/
  );
});

test("foundation migration creates all 11 tables and preserves legacy storage", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);

  for (const table of targetTables) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE "${table}"`)
    );
  }

  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(?:users|game_stats|replay_player_snapshots|player_identity_aliases)"/i
  );
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION/i);
});

test("database hardening enforces typed subjects, intervals, and append-only ledgers", () => {
  assert.match(
    migration,
    /CHECK\s*\(\s*num_nonnulls\([\s\S]*?\)\s*=\s*1\s*\)/
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "uq_identity_decision_subject_exact"[\s\S]*?NULLS NOT DISTINCT/
  );
  assert.match(
    migration,
    /"uq_platform_name_observations_snapshot_version"/
  );
  assert.match(
    migration,
    /"uq_warrior_platform_links_open_active_account"/
  );
  assert.match(
    migration,
    /"uq_warrior_claims_open_active_primary"/
  );

  for (const table of [
    "platform_name_observations",
    "identity_decisions",
    "identity_decision_subjects",
    "replay_player_identity_projections",
    "identity_projection_publications",
  ]) {
    assert.match(
      migration,
      new RegExp(`BEFORE UPDATE OR DELETE ON "${table}"`)
    );
    assert.match(
      migration,
      new RegExp(`BEFORE TRUNCATE ON "${table}"`)
    );
  }
});

test("temporal, resolver, merge, and publication guards are persistent", () => {
  assert.match(migration, /enforce_warrior_platform_link_overlap/);
  assert.match(migration, /pg_advisory_xact_lock\(207701/);
  assert.match(migration, /enforce_warrior_claim_overlap/);
  assert.match(migration, /pg_advisory_xact_lock\(207702/);
  assert.match(migration, /enforce_warrior_merge_acyclic/);
  assert.match(migration, /Warrior merge would create a cycle/);

  assert.match(migration, /enforce_identity_resolution_run_lifecycle/);
  assert.match(
    migration,
    /identity resolution run must be inserted in running state/
  );
  assert.match(
    migration,
    /terminal identity resolution run is immutable/
  );

  assert.match(migration, /validate_replay_player_identity_projection/);
  assert.match(
    migration,
    /projection game_stats_id must match source replay snapshot/
  );
  assert.match(
    migration,
    /Steam-backed replay snapshot cannot project to a different PlatformAccount/
  );
  assert.match(
    migration,
    /Warrior projection requires a covering active Warrior-platform link/
  );

  assert.match(migration, /validate_identity_projection_publication/);
  assert.match(migration, /pg_advisory_xact_lock\(207703/);
  assert.match(
    migration,
    /publication predecessor must be the current latest publication/
  );
  assert.match(
    migration,
    /publication may reference only a succeeded identity resolution run/
  );
});

test("claims and links cannot activate by mutating legacy evidence rows", () => {
  assert.match(
    migration,
    /Warrior-platform link activation requires a new authorized row/
  );
  assert.match(
    migration,
    /Warrior claim activation requires a new authorized row/
  );
  assert.match(
    migration,
    /Warrior claim terminal transition requires a new decision/
  );
  assert.match(
    migration,
    /Warrior-platform link terminal transition requires a new decision/
  );
});

test("activation rejection precedes general immutable-evidence rejection", () => {
  const functionBody = (name: string): string => {
    const pattern = new RegExp(
      `CREATE OR REPLACE FUNCTION "${name}"\\(\\)\\n` +
        `RETURNS TRIGGER AS \\$\\$\\n([\\s\\S]*?)\\nEND;\\n` +
        `\\$\\$ LANGUAGE plpgsql;`
    );
    const match = migration.match(pattern);
    assert.ok(match, `missing trigger function ${name}`);
    return match[1];
  };

  for (const [name, activationMessage, immutableMessage] of [
    [
      "enforce_warrior_platform_link_update",
      "Warrior-platform link activation requires a new authorized row",
      "Warrior-platform link identity and original evidence are immutable",
    ],
    [
      "enforce_warrior_claim_update",
      "Warrior claim activation requires a new authorized row",
      "Warrior claim identity and original evidence are immutable",
    ],
  ] as const) {
    const body = functionBody(name);
    const activationIndex = body.indexOf(activationMessage);
    const immutableIndex = body.indexOf(immutableMessage);

    assert.notEqual(activationIndex, -1, `${name} lacks activation rejection`);
    assert.notEqual(immutableIndex, -1, `${name} lacks immutable rejection`);
    assert.ok(
      activationIndex < immutableIndex,
      `${name} must reject in-place activation before the broader immutable-evidence guard`
    );
  }
});
