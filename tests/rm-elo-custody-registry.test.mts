import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { seededTrophyDefinition } from "../lib/trophies/service.ts";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261002013000_canonicalize_rm_elo_trophies/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const expected = [
  ["elo-rising", "Rising", null, 1199],
  ["elo-challenger", "Challenger", 1200, 1499],
  ["elo-veteran", "Veteran", 1500, 1799],
  ["elo-elite", "Elite", 1800, 2099],
  ["elo-legend", "Legend", 2100, null],
] as const;

test("all five RM ELO divisions are canonical trophy seeds", () => {
  for (const [id, tier, min, max] of expected) {
    const seed = seededTrophyDefinition(id);
    assert.ok(seed, `missing seed ${id}`);
    assert.equal(seed.trophyId, id);
    assert.equal(seed.family, "elo");
    assert.equal(seed.tier, tier);
    assert.equal(seed.status, "vacant");
    assert.equal(seed.displayName, `RM ${tier} Championship`);
    assert.equal(seed.definition.eloMin ?? null, min);
    assert.equal(seed.definition.eloMax ?? null, max);
  }
});

test("legacy RM custody ids are not seed identities", () => {
  assert.equal(seededTrophyDefinition("elite_champion_belt"), null);
  assert.equal(seededTrophyDefinition("veteran_champion_rm"), null);
});

test("migration preserves legacy numeric rows by renaming rather than deleting", () => {
  assert.match(
    migration,
    /UPDATE "trophies"[\s\S]*"trophy_id" = 'elo-elite'[\s\S]*WHERE "trophy_id" = 'elite_champion_belt'/,
  );
  assert.match(
    migration,
    /UPDATE "trophies"[\s\S]*"trophy_id" = 'elo-veteran'[\s\S]*WHERE "trophy_id" = 'veteran_champion_rm'/,
  );
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+"?trophies"?/i);
});

test("migration materializes the complete five-row RM matrix", () => {
  for (const [id] of expected) {
    assert.match(migration, new RegExp(`'${id}'`));
  }
  assert.match(migration, /ON CONFLICT \("trophy_id"\) DO UPDATE/);
});
