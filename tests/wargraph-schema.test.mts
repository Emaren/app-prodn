import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260824050000_add_wargraph_foundation/migration.sql",
    import.meta.url
  ),
  "utf8"
);

const models = [
  "WarGraph",
  "WarGraphRuleset",
  "WarGraphLayer",
  "WarGraphNode",
  "WarGraphNight",
  "WarGraphMembership",
  "WarGraphOccupancy",
  "WarGraphPresence",
  "WarGraphAdvanceRequest",
  "WarGraphDefenseObligation",
  "WarGraphPairing",
  "WarGraphEngagement",
  "WarGraphWatcherAttestation",
  "WarGraphContest",
  "WarGraphContestAttestation",
  "WarGraphAction",
  "WarGraphMovement",
  "WarGraphEvent",
  "WarGraphReward",
  "WarGraphPayoutEvent",
  "WarGraphSpectatorSession",
  "WarGraphJob",
] as const;

const tables = [
  "war_graphs",
  "war_graph_rulesets",
  "war_graph_layers",
  "war_graph_nodes",
  "war_graph_nights",
  "war_graph_memberships",
  "war_graph_occupancies",
  "war_graph_presences",
  "war_graph_advance_requests",
  "war_graph_defense_obligations",
  "war_graph_pairings",
  "war_graph_engagements",
  "war_graph_watcher_attestations",
  "war_graph_contests",
  "war_graph_contest_attestations",
  "war_graph_actions",
  "war_graph_movements",
  "war_graph_events",
  "war_graph_rewards",
  "war_graph_payout_events",
  "war_graph_spectator_sessions",
  "war_graph_jobs",
] as const;

test("WarGraph V1 schema exposes every persistence boundary", () => {
  for (const model of models) {
    assert.match(schema, new RegExp(`^model ${model} \\{`, "m"));
  }
  for (const table of tables) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }

  assert.match(schema, /timezone\s+String\s+@default\("America\/Edmonton"\)/);
  assert.match(schema, /maxResolvedActions\s+Int\s+@default\(2\)/);
  assert.match(schema, /frontierAdvanceWolo\s+BigInt\s+@default\(1\)/);
  assert.match(schema, /crownVictoryWolo\s+BigInt\s+@default\(50\)/);
});

test("migration stays inside the protected create-only lane", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(
    migration,
    /^(?:ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)\b/im
  );
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"wolo/i);
});

test("occupancy and matchmaking concurrency are database-enforced", () => {
  assert.match(
    migration,
    /"uq_war_graph_occupancies_node_graph"[\s\S]*?DEFERRABLE INITIALLY DEFERRED/
  );
  assert.match(
    migration,
    /"uq_war_graph_advance_requests_one_open_challenger"[\s\S]*?WHERE "status" IN \('open', 'accepted', 'bound'\)/
  );
  assert.match(
    migration,
    /"uq_war_graph_defense_obligations_one_pending_defender"[\s\S]*?WHERE "status" = 'pending'/
  );
  assert.match(
    migration,
    /"uq_war_graph_engagements_one_active_member"[\s\S]*?WHERE "status" = 'active'/
  );
  assert.match(
    migration,
    /"aggressor_membership_id" <> "defender_membership_id"/
  );
  assert.match(
    migration,
    /"defender_start_layer_ordinal" = "aggressor_start_layer_ordinal" - 1/
  );
  assert.match(schema, /aggressorReadyAt\s+DateTime\?/);
  assert.match(schema, /defenderReadyAt\s+DateTime\?/);
});

test("two-action law and immutable double-Watcher evidence survive retries", () => {
  assert.match(migration, /"slot" IN \(1, 2\)/);
  assert.match(
    migration,
    /"uq_war_graph_actions_night_member_slot" UNIQUE \("night_id", "membership_id", "slot"\)/
  );
  assert.match(
    migration,
    /"uq_war_graph_contest_attestations_phase_member" UNIQUE \("contest_id", "evidence_phase", "membership_id"\)/
  );
  assert.match(
    migration,
    /"uq_war_graph_contest_attestations_phase_role" UNIQUE \("contest_id", "evidence_phase", "participant_role"\)/
  );
  assert.match(
    migration,
    /"uq_war_graph_contest_attestations_phase_uploader" UNIQUE \("contest_id", "evidence_phase", "uploader_user_id"\)/
  );
  assert.match(migration, /"evidence_phase" IN \('start', 'final'\)/);
  assert.match(
    migration,
    /FOREIGN KEY \("attestation_id", "uploader_user_id"\)[\s\S]*?REFERENCES "war_graph_watcher_attestations"\("id", "uploader_user_id"\)/
  );
  assert.match(
    migration,
    /FOREIGN KEY \("membership_id", "uploader_user_id"\)[\s\S]*?REFERENCES "war_graph_memberships"\("id", "user_id"\)/
  );
  assert.match(schema, /ingestionProvenance\s+String\?/);
  assert.match(schema, /liveProvenance\s+Boolean\s+@default\(false\)/);
  assert.match(
    schema,
    /provenanceSignatureVerified\s+Boolean\s+@default\(false\)/
  );

  for (const field of [
    "replayFingerprint",
    "liveGameFingerprint",
    "platformMatchId",
    "rosterHash",
    "uploaderPlayerKeyHash",
    "fileRole",
    "finalityStatus",
    "resultProvenance",
  ]) {
    assert.match(
      schema,
      new RegExp(`^\\s*${field}\\s+String\\?`, "m"),
      `${field} must preserve incomplete audit receipts`
    );
  }
  assert.match(
    migration,
    /"ix_war_graph_watcher_attestations_live_fingerprint"\s+ON "war_graph_watcher_attestations"\("live_game_fingerprint", "received_at"\)/
  );

  for (const table of [
    "war_graph_watcher_attestations",
    "war_graph_contest_attestations",
    "war_graph_actions",
    "war_graph_movements",
    "war_graph_events",
    "war_graph_rewards",
    "war_graph_payout_events",
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

test("administrative movement cannot masquerade as battle merit or WOLO", () => {
  assert.match(
    migration,
    /"kind" = 'VERIFIED_BATTLE' OR \("winner_membership_id" IS NULL AND "loser_membership_id" IS NULL\)/
  );
  assert.match(
    migration,
    /"reward_kind" IN \([\s\S]*?'FRONTIER_TO_RING_II'[\s\S]*?'CROWN_BATTLE_WINNER'[\s\S]*?\)/
  );
  assert.doesNotMatch(
    migration.match(/CONSTRAINT "ck_war_graph_rewards_kind"[\s\S]*?\n  \)/)?.[0] ?? "",
    /default|gravity/
  );
  assert.match(
    migration,
    /"uq_war_graph_rewards_one_first_blood"[\s\S]*?WHERE "reward_kind" = 'FIRST_BLOOD'/
  );
  assert.match(
    migration,
    /"uq_war_graph_payout_events_one_success"[\s\S]*?WHERE "status" = 'succeeded'/
  );
});

test("founding assignments may place members on every constitutional layer", () => {
  assert.match(
    migration,
    /"movement_type" = 'INITIAL_ASSIGNMENT' AND\s+"from_node_id" IS NULL AND "from_layer_ordinal" IS NULL AND\s+"to_layer_ordinal" BETWEEN 0 AND 3 AND\s+"night_id" IS NULL AND "contest_id" IS NULL/
  );
  assert.doesNotMatch(
    migration,
    /"movement_type" = 'INITIAL_ASSIGNMENT'[\s\S]{0,180}?"to_layer_ordinal" = 3/
  );
});

test("a prior Afterburn game may overlap the next Prime night", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "uq_war_graph_nights_one_live"\s+ON "war_graph_nights"\("graph_id"\)\s+WHERE "status" = 'prime';/
  );
  assert.doesNotMatch(
    migration,
    /"uq_war_graph_nights_one_live"[\s\S]{0,160}?afterburn/
  );
});
