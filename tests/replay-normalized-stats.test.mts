import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildReplayNormalizedStatProjection,
  buildReplayPlayerMetricAggregateRows,
  replayPlayerMetricDefinition,
  ReplayNormalizedStatsError,
  selectLatestMaterialReplayObservations,
} from "../lib/replayNormalizedStats.ts";

const replayHash = "a".repeat(64);

function basePlayers(foodCollected: number) {
  return [
    {
      name: "Jim",
      steam_id: "76561198000000001",
      number: 1,
      team_id: 0,
      civilization_name: "Britons",
      score: 0,
      achievements: {
        military: {
          units_killed: 0,
          units_lost: 7,
        },
        economy: {
          food_collected: foodCollected,
          wood_collected: 400,
          stone_collected: 0,
          gold_collected: 125,
        },
      },
    },
    {
      name: "Emaren",
      steam_id: "76561198000000002",
      number: 2,
      team_id: 1,
      civilization_name: "Franks",
      score: 900,
      achievements: {
        military: {
          units_killed: 7,
          units_lost: 0,
        },
        economy: {
          food_collected: 800,
          wood_collected: 350,
          stone_collected: 0,
          gold_collected: 275,
        },
      },
    },
  ];
}

function projection(input: {
  gameStatsId?: number;
  foodCollected?: number;
  resultEligibility?: "resolved" | "unresolved";
  winningPlayerKeys?: string[];
  observations?: Parameters<
    typeof buildReplayNormalizedStatProjection
  >[0]["observations"];
}) {
  const gameStatsId = input.gameStatsId ?? 42;
  const hasObservationSource = input.observations !== undefined;
  return buildReplayNormalizedStatProjection({
    gameStatsId,
    replayHash,
    parseRunId: hasObservationSource ? gameStatsId + 100 : undefined,
    sourceKind: hasObservationSource ? "parse_run" : "game_stats",
    sourceIdentity: hasObservationSource
      ? `parse-run:${gameStatsId + 100}`
      : `game-stats:${gameStatsId}:0`,
    parserName: "aoe2war.mgz_hd",
    parserVersion: "1.8.51",
    passName: "hd_deterministic_evidence",
    passVersion: "8",
    projectionStatus: "accepted",
    affectsPublicAggregates: true,
    projectedByUidSnapshot: "test:normalized-stats",
    statEligibility: "eligible",
    resultEligibility: input.resultEligibility ?? "unresolved",
    winningPlayerKeys: input.winningPlayerKeys,
    players: basePlayers(input.foodCollected ?? 0),
    keyEvents: {
      postgame_available: true,
      has_scores: true,
    },
    durationSeconds: 1_800,
    observations: input.observations,
    provenance: {
      source: "test",
    },
  });
}

test("unknown results retain exact statistics and numeric zero is not treated as missing", () => {
  const normalized = projection({});
  const jim = normalized.players.find((player) => player.displayName === "Jim");
  assert.ok(jim);
  assert.equal(jim.statEligible, true);
  assert.equal(jim.resultEligible, false);
  assert.equal(jim.resultStatus, "unresolved");

  const food = jim.metrics.find(
    (entry) => entry.metricKey === "economy.food_collected"
  );
  const kills = jim.metrics.find(
    (entry) => entry.metricKey === "military.units_killed"
  );
  const stone = jim.metrics.find(
    (entry) => entry.metricKey === "economy.stone_collected"
  );
  assert.equal(food?.numericValue, "0");
  assert.equal(kills?.numericValue, "0");
  assert.equal(stone?.numericValue, "0");
  assert.equal(normalized.receipt.affectsResults, false);
  assert.equal(normalized.receipt.affectsBets, false);
  assert.equal(normalized.receipt.settlementAuthority, false);
});

test("candidate and accepted public projections have distinct immutable identities", () => {
  const shared = {
    gameStatsId: 44,
    replayHash,
    sourceIdentity: "game-stats:44:0",
    resultEligibility: "unresolved" as const,
    players: basePlayers(500),
    keyEvents: {
      postgame_available: true,
      has_scores: true,
    },
  };
  const candidate = buildReplayNormalizedStatProjection({
    ...shared,
    projectionStatus: "candidate",
    affectsPublicAggregates: false,
  });
  const acceptedPrivate = buildReplayNormalizedStatProjection({
    ...shared,
    projectionStatus: "accepted",
    affectsPublicAggregates: false,
  });
  const accepted = buildReplayNormalizedStatProjection({
    ...shared,
    projectionStatus: "accepted",
    affectsPublicAggregates: true,
    projectedByUidSnapshot: "test:normalized-stats",
  });

  assert.notEqual(
    candidate.receipt.projectionIdentityHash,
    accepted.receipt.projectionIdentityHash
  );
  assert.notEqual(
    candidate.receipt.idempotencyKey,
    accepted.receipt.idempotencyKey
  );
  assert.notEqual(
    acceptedPrivate.receipt.projectionIdentityHash,
    accepted.receipt.projectionIdentityHash
  );
  assert.equal(candidate.receipt.affectsPublicAggregates, false);
  assert.equal(acceptedPrivate.receipt.affectsPublicAggregates, false);
  assert.equal(accepted.receipt.affectsPublicAggregates, true);
});

test("immutable Steam player keys can carry an exact claimed-user link", () => {
  const normalized = buildReplayNormalizedStatProjection({
    gameStatsId: 45,
    replayHash,
    sourceIdentity: "game-stats:45:0",
    projectionStatus: "accepted",
    affectsPublicAggregates: true,
    projectedByUidSnapshot: "test:normalized-stats",
    resultEligibility: "unresolved",
    players: basePlayers(500),
    keyEvents: {
      postgame_available: true,
      has_scores: true,
    },
    userIdByPlayerKey: {
      "steam:76561198000000001": 7001,
    },
  });

  assert.equal(
    normalized.players.find((player) => player.displayName === "Jim")
      ?.userId,
    7001
  );
  assert.equal(
    normalized.players.find((player) => player.displayName === "Emaren")
      ?.userId,
    null
  );
});

test("every output-affecting replay input changes the immutable projection identity", () => {
  const shared = {
    gameStatsId: 46,
    replayHash,
    sourceIdentity: "game-stats:46:0",
    projectionStatus: "accepted" as const,
    affectsPublicAggregates: true,
    projectedByUidSnapshot: "test:normalized-stats",
    statEligibility: "eligible" as const,
    resultEligibility: "unresolved" as const,
    players: basePlayers(500),
    keyEvents: {
      postgame_available: true,
      has_scores: true,
    },
  };
  const baseline = buildReplayNormalizedStatProjection({
    ...shared,
    durationSeconds: 100,
  });
  const changedDuration = buildReplayNormalizedStatProjection({
    ...shared,
    durationSeconds: 200,
  });
  const changedMetric = buildReplayNormalizedStatProjection({
    ...shared,
    players: basePlayers(501),
    durationSeconds: 100,
  });
  const changedWinner = buildReplayNormalizedStatProjection({
    ...shared,
    resultEligibility: "resolved",
    winningPlayerKeys: ["steam:76561198000000001"],
    durationSeconds: 100,
  });
  const changedUserLink = buildReplayNormalizedStatProjection({
    ...shared,
    durationSeconds: 100,
    userIdByPlayerKey: {
      "steam:76561198000000001": 7001,
    },
  });
  const identities = [
    baseline,
    changedDuration,
    changedMetric,
    changedWinner,
    changedUserLink,
  ].map((entry) => entry.receipt.projectionIdentityHash);

  assert.equal(new Set(identities).size, identities.length);
  assert.notEqual(
    baseline.receipt.inputHash,
    changedDuration.receipt.inputHash
  );
  assert.notEqual(
    baseline.receipt.projectionHash,
    changedDuration.receipt.projectionHash
  );
});

test("legacy default score zero is absent unless postgame score evidence exists", () => {
  const normalized = buildReplayNormalizedStatProjection({
    gameStatsId: 43,
    replayHash,
    sourceIdentity: "game-stats:43:0",
    projectionStatus: "accepted",
    affectsPublicAggregates: true,
    projectedByUidSnapshot: "test:normalized-stats",
    resultEligibility: "unresolved",
    players: [
      {
        name: "Jim",
        number: 1,
        team_id: 0,
        score: 0,
        achievements: {
          economy: {
            stone_collected: 0,
          },
        },
      },
      { name: "Emaren", number: 2, team_id: 1, score: 0 },
    ],
    keyEvents: {
      postgame_available: false,
      // Historical rows may carry these polluted flags from the former
      // score-defaulting parser. They are not strong postgame evidence.
      has_scores: true,
      player_score_count: 2,
    },
  });
  assert.equal(
    normalized.players.some((player) =>
      player.metrics.some((entry) => entry.metricKey === "score.total")
    ),
    false
  );
  assert.equal(
    normalized.players.some((player) => player.metrics.length > 0),
    false
  );
});

test("exact pass-eight observations override JSON and diagnostics never become exact stats", () => {
  const subject = {
    type: "player",
    player_key: "steam:76561198000000001",
    player_number: 1,
    player_name: "Jim",
  };
  const exactProvenance = {
    subject,
    class: "derived_coherent",
    evidence_source: "aoe2war.raw_recorded_action_activity",
    exact: true,
  };
  const normalized = projection({
    observations: [
      {
        id: 1,
        parseRunId: 142,
        fieldPath: "player.postgame.economy.food_collected",
        value: 1_234,
        confidenceBps: 10_000,
        provenance: {
          ...exactProvenance,
          class: "direct_postgame",
          evidence_source: "mgz.postgame.achievements",
        },
      },
      {
        id: 2,
        parseRunId: 142,
        fieldPath: "player.actions.recorded_packet_count",
        value: 0,
        confidenceBps: 10_000,
        provenance: exactProvenance,
      },
      {
        id: 3,
        parseRunId: 142,
        fieldPath: "player.actions.recorded_type_counts",
        value: {
          Build: 3,
          "Buy / Sell": 0,
        },
        confidenceBps: 10_000,
        provenance: exactProvenance,
      },
      {
        id: 4,
        parseRunId: 142,
        fieldPath: "player.actions.recorded_packet_rate_per_minute",
        value: 999,
        confidenceBps: 10_000,
        provenance: exactProvenance,
      },
      {
        id: 5,
        parseRunId: 142,
        fieldPath: "actions.identity_normalized_activity_by_player",
        value: [
          {
            player_number: 1,
            action_packet_count: 500,
            eapm: 999,
          },
        ],
        confidenceBps: 10_000,
        provenance: {
          subject: { type: "game" },
          class: "derived_coherent",
          evidence_source:
            "aoe2war.experimental_exact_packet_identity_normalization",
          exact: true,
        },
      },
    ],
  });
  const jim = normalized.players.find((player) => player.displayName === "Jim");
  assert.ok(jim);
  assert.equal(
    jim.metrics.find(
      (entry) => entry.metricKey === "economy.food_collected"
    )?.numericValue,
    "1234"
  );
  assert.equal(
    jim.metrics.some(
      (entry) => entry.metricKey === "economy.wood_collected"
    ),
    false,
    "a parse-run projection must not fall back to legacy GameStats fields"
  );
  assert.equal(
    jim.metrics.find(
      (entry) => entry.metricKey === "actions.recorded_packet_count"
    )?.numericValue,
    "0"
  );
  assert.equal(
    jim.metrics.find(
      (entry) => entry.metricKey === "actions.recorded_type_count.build"
    )?.numericValue,
    "3"
  );
  assert.equal(
    jim.metrics.find(
      (entry) =>
        entry.metricKey === "actions.recorded_type_count.buy_sell"
    )?.numericValue,
    "0"
  );
  assert.equal(
    jim.metrics.some((entry) =>
      entry.metricKey.includes("packet_rate")
    ),
    false
  );
  assert.equal(
    jim.metrics.find(
      (entry) => entry.metricKey === "actions.recorded_packet_count"
    )?.numericValue,
    "0",
    "the experimental identity-normalized aggregate must not override the exact scalar"
  );
  assert.equal(
    replayPlayerMetricDefinition(
      "actions.recorded_type_count.buy_sell"
    )?.aggregationMethod,
    "sum"
  );
});

test("raw action summaries backfill exact count/timing components but never EAPM", () => {
  const normalized = projection({
    observations: [
      {
        id: 10,
        parseRunId: 142,
        fieldPath: "actions.raw_activity_by_player",
        value: [
          {
            player_number: 1,
            player_name: "Jim",
            action_packet_count: 0,
            first_action_ms: 0,
            last_action_ms: 12_000,
            active_minute_count: 1,
            peak_actions_in_one_minute: 0,
            largest_recorded_action_gap_ms: 12_000,
            eapm: 999,
          },
        ],
        provenance: {
          subject: { type: "game" },
          class: "derived_coherent",
          evidence_source: "aoe2war.raw_recorded_action_activity",
          exact: false,
        },
      },
    ],
  });
  const jim = normalized.players.find((player) => player.displayName === "Jim");
  assert.ok(jim);
  assert.equal(
    jim.metrics.find(
      (entry) => entry.metricKey === "actions.recorded_packet_count"
    )?.numericValue,
    "0"
  );
  assert.equal(
    jim.metrics.find(
      (entry) => entry.metricKey === "actions.first_recorded_command_ms"
    )?.numericValue,
    "0"
  );
  assert.equal(
    jim.metrics.some((entry) => entry.metricKey.includes("rate")),
    false
  );
});

test("latest material observation selection is stable per field and subject", () => {
  const subject = {
    type: "player",
    player_key: "name:jim",
  };
  const observations = selectLatestMaterialReplayObservations([
    {
      id: 1,
      parseRunId: 5,
      fieldPath: "player.postgame.economy.gold_collected",
      value: 100,
      provenance: { subject, exact: true },
    },
    {
      id: 2,
      parseRunId: 6,
      fieldPath: "player.postgame.economy.gold_collected",
      value: 200,
      provenance: { subject, exact: true },
    },
    {
      id: 3,
      parseRunId: 6,
      fieldPath: "player.postgame.economy.gold_collected",
      value: null,
      provenance: { subject, exact: true },
    },
  ]);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].value, 200);
});

test("candidate projections cannot silently feed public aggregates", () => {
  assert.throws(
    () =>
      buildReplayNormalizedStatProjection({
        gameStatsId: 42,
        replayHash,
        sourceIdentity: "parse-run:142",
        projectionStatus: "candidate",
        affectsPublicAggregates: true,
        resultEligibility: "unresolved",
        players: basePlayers(0),
      }),
    (error) =>
      error instanceof ReplayNormalizedStatsError &&
      error.code === "candidate_cannot_be_public"
  );
});

test("accepted public projections require an attributable actor snapshot", () => {
  assert.throws(
    () =>
      buildReplayNormalizedStatProjection({
        gameStatsId: 42,
        replayHash,
        sourceIdentity: "parse-run:142",
        projectionStatus: "accepted",
        affectsPublicAggregates: true,
        resultEligibility: "unresolved",
        players: basePlayers(0),
      }),
    (error) =>
      error instanceof ReplayNormalizedStatsError &&
      error.code === "public_projection_actor_required"
  );
});

test("supersession lineage does not change immutable projection identity", () => {
  const base = {
    gameStatsId: 42,
    replayHash,
    parseRunId: 142,
    sourceIdentity: "parse-run:immutable-output",
    sourceHash: "b".repeat(64),
    projectionStatus: "accepted" as const,
    affectsPublicAggregates: true,
    projectedByUidSnapshot: "test:normalized-stats",
    resultEligibility: "unresolved" as const,
    players: basePlayers(0),
    keyEvents: {
      postgame_available: true,
      has_scores: true,
    },
  };
  const first = buildReplayNormalizedStatProjection(base);
  const retryAfterAnotherProjection = buildReplayNormalizedStatProjection({
    ...base,
    supersedesId: 999,
  });
  assert.equal(
    retryAfterAnotherProjection.receipt.projectionIdentityHash,
    first.receipt.projectionIdentityHash
  );
  assert.equal(
    retryAfterAnotherProjection.receipt.idempotencyKey,
    first.receipt.idempotencyKey
  );
  assert.equal(
    retryAfterAnotherProjection.receipt.projectionHash,
    first.receipt.projectionHash
  );
  assert.equal(retryAfterAnotherProjection.receipt.supersedesId, 999);
});

test("an inferred-result repair creates an unresolved immutable successor without losing metric coverage", () => {
  const shared = {
    gameStatsId: 89,
    replayHash,
    sourceIdentity:
      "game-stats:89:0",
    projectionStatus:
      "accepted" as const,
    affectsPublicAggregates:
      true,
    projectedByUidSnapshot:
      "test:normalized-stats",
    statEligibility:
      "eligible" as const,
    players:
      basePlayers(
        500
      ),
    keyEvents: {
      postgame_available:
        false,
      has_scores:
        false,
    },
    provenance: {
      source:
        "test",
    },
  };

  const incorrectCurrent =
    buildReplayNormalizedStatProjection({
      ...shared,
      resultEligibility:
        "resolved",
      resultEligibilityReason:
        "effective_replay_result",
      winningPlayerKeys: [
        "steam:76561198000000001",
      ],
    });

  const repaired =
    buildReplayNormalizedStatProjection({
      ...shared,
      supersedesId:
        4_321,
      resultEligibility:
        "unresolved",
      resultEligibilityReason:
        "result_not_required_for_statistics",
      winningPlayerKeys: [],
      provenance: {
        source:
          "test",
        result_policy_repair:
          true,
      },
    });

  assert.equal(
    repaired.receipt
      .supersedesId,
    4_321
  );
  assert.notEqual(
    repaired.receipt
      .projectionIdentityHash,
    incorrectCurrent.receipt
      .projectionIdentityHash
  );
  assert.notEqual(
    repaired.receipt
      .idempotencyKey,
    incorrectCurrent.receipt
      .idempotencyKey
  );
  assert.equal(
    repaired.receipt
      .resultEligibility,
    "unresolved"
  );
  assert.equal(
    repaired.receipt
      .playerMetricCount,
    incorrectCurrent.receipt
      .playerMetricCount
  );
  assert.equal(
    repaired.receipt
      .gameMetricCount,
    incorrectCurrent.receipt
      .gameMetricCount
  );
  assert.equal(
    repaired.receipt
      .affectsResults,
    false
  );
  assert.ok(
    repaired.players.every(
      (player) =>
        !player
          .resultEligible &&
        player
          .resultStatus ===
          "unresolved"
    )
  );
});

test("aggregates use stat eligibility independently from resolved-result scope", () => {
  const unresolved = projection({
    gameStatsId: 42,
    foodCollected: 0,
    resultEligibility: "unresolved",
  });
  const resolved = projection({
    gameStatsId: 44,
    foodCollected: 100,
    resultEligibility: "resolved",
    winningPlayerKeys: ["steam:76561198000000001"],
  });
  const all = buildReplayPlayerMetricAggregateRows({
    buildKey: "career:2026-07-25",
    projections: [unresolved, resolved],
  });
  const jimFood = all.find(
    (entry) =>
      entry.playerKey === "steam:76561198000000001" &&
      entry.metricKey === "economy.food_collected"
  );
  assert.equal(jimFood?.numericSum, "100");
  assert.equal(jimFood?.metricGameCount, 2);
  assert.equal(jimFood?.statEligibleGameCount, 2);
  assert.equal(jimFood?.resultEligibleGameCount, 1);
  assert.equal(jimFood?.coverageBps, 10_000);

  const resolvedOnly = buildReplayPlayerMetricAggregateRows({
    buildKey: "career-resolved:2026-07-25",
    projections: [unresolved, resolved],
    resultScope: "resolved_only",
  });
  const resolvedJimFood = resolvedOnly.find(
    (entry) =>
      entry.playerKey === "steam:76561198000000001" &&
      entry.metricKey === "economy.food_collected"
  );
  assert.equal(resolvedJimFood?.numericSum, "100");
  assert.equal(resolvedJimFood?.metricGameCount, 1);
  assert.equal(resolvedJimFood?.coverageBps, 10_000);
});

test("aggregate builder rejects multiple active projections for one game", () => {
  const first = projection({ gameStatsId: 42 });
  const second = projection({
    gameStatsId: 42,
    observations: [
      {
        id: 99,
        parseRunId: 200,
        fieldPath: "game.duration_seconds",
        value: 1_900,
        confidenceBps: 10_000,
        provenance: {
          subject: { type: "game" },
          class: "derived_coherent",
          evidence_source: "mgz.summary.duration_ms_normalized",
          exact: true,
        },
      },
    ],
  });
  assert.throws(
    () =>
      buildReplayPlayerMetricAggregateRows({
        buildKey: "duplicate-current-set",
        projections: [first, second],
      }),
    (error) =>
      error instanceof ReplayNormalizedStatsError &&
      error.code === "non_current_projection_set"
  );
});

test("migration enforces typed values, append-only history, and no financial authority", () => {
  const sql = readFileSync(
    new URL(
      "../prisma/migrations/20260725200000_add_normalized_replay_stats/migration.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "replay_stat_projections"/);
  assert.match(sql, /"value_type" = 'number'/);
  assert.match(sql, /"numeric_value" IS NOT NULL/);
  assert.match(sql, /"affects_results" = FALSE/);
  assert.match(sql, /"affects_bets" = FALSE/);
  assert.match(sql, /"settlement_authority" = FALSE/);
  assert.match(sql, /prevent_replay_engine_room_mutation/);
  assert.match(sql, /replay_player_metric_aggregates/);
});
