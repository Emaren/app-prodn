import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HD_REPLAY_PARSER_CONTRACT,
  HD_REPLAY_PARSER_PASS8_CONTRACT,
} from "../lib/replayEngineRoom.ts";

import {
  applyTargetedReplayRosterRecovery,
  evaluateTargetedReplayRosterRecovery,
  planTargetedReplayRosterRecovery,
  type TargetedReplayRosterGameSnapshot,
  type TargetedReplayRosterRunSnapshot,
} from "../lib/targetedReplayRosterRecovery.ts";

import {
  PUBLIC_REPLAY_ROSTER_V2_POLICY,
  stableReplayRosterV2Hash,
} from "../lib/publicReplayRosterV2.ts";


const REPLAY_HASH =
  "f".repeat(64);


function directObservation(
  id: number,
  fieldPath: string,
  value: unknown,
  steamId: string,
  playerNumber: number,
  name: string,
) {
  return {
    id,
    observationKey:
      `${fieldPath}:${steamId}`,

    observationKind:
      "scalar",

    fieldPath,
    value,
    valueHash:
      String(id)
        .padStart(
          64,
          "0",
        )
        .slice(
          -64,
        ),

    confidenceBps:
      10_000,

    provenance: {
      class:
        "direct_header",

      exact:
        true,

      conflict_state:
        "none",

      subject: {
        type:
          "player",

        player_key:
          `steam:${steamId}`,

        player_name:
          name,

        player_number:
          playerNumber,
      },
    },

    candidateOnly:
      true,

    affectsPublicAggregates:
      false,
  };
}


function runFixture(): TargetedReplayRosterRunSnapshot {
  const players = [
    {
      name:
        "Jim",

      steamId:
        "76561198000000001",

      number:
        1,

      team:
        0,
    },
    {
      name:
        "Emaren",

      steamId:
        "76561198000000002",

      number:
        2,

      team:
        0,
    },
    {
      name:
        "Zodiac",

      steamId:
        "76561198000000003",

      number:
        3,

      team:
        1,
    },
    {
      name:
        "Fourth",

      steamId:
        "76561198000000004",

      number:
        4,

      team:
        1,
    },
  ];

  const observations:
    TargetedReplayRosterRunSnapshot[
      "observations"
    ] =
    [];

  for (
    const [
      index,
      player,
    ] of
    players.entries()
  ) {
    const base =
      (index + 1) *
      10;

    observations.push(
      directObservation(
        base + 1,
        "player.name",
        player.name,
        player.steamId,
        player.number,
        player.name,
      ),
      directObservation(
        base + 2,
        "player.number",
        player.number,
        player.steamId,
        player.number,
        player.name,
      ),
      directObservation(
        base + 3,
        "player.steam_id",
        player.steamId,
        player.steamId,
        player.number,
        player.name,
      ),
      directObservation(
        base + 4,
        "player.team_id",
        player.team,
        player.steamId,
        player.number,
        player.name,
      ),
    );
  }

  observations.push({
    id:
      999,

    observationKey:
      "teams.resolution",

    observationKind:
      "team_resolution",

    fieldPath:
      "teams.resolution",

    valueHash:
      "9".repeat(64),

    value: {
      format:
        "2v2",

      status:
        "resolved",

      confidence:
        "high",

      provenance:
        "explicit_replay_team_ids",

      team_count:
        2,

      player_count:
        4,

      teams: [
        {
          team_id:
            0,

          players: [
            "Jim",
            "Emaren",
          ],

          player_keys: [
            "steam:76561198000000001",
            "steam:76561198000000002",
          ],
        },
        {
          team_id:
            1,

          players: [
            "Zodiac",
            "Fourth",
          ],

          player_keys: [
            "steam:76561198000000003",
            "steam:76561198000000004",
          ],
        },
      ],
    },

    confidenceBps:
      9_500,

    provenance: {
      class:
        "derived_coherent",

      exact:
        true,

      conflict_state:
        "none",

      subject: {
        type:
          "game",
      },
    },

    candidateOnly:
      true,

    affectsPublicAggregates:
      false,
  });

  return {
    id:
      7001,

    gameStatsId:
      44862,

    inputHash:
      REPLAY_HASH,

    runIdentityHash:
      "a".repeat(64),

    parserConfigHash:
      "b".repeat(64),

    candidateOutputHash:
      "c".repeat(64),

    parserName:
      HD_REPLAY_PARSER_CONTRACT
        .parserName,

    parserVersion:
      HD_REPLAY_PARSER_CONTRACT
        .parserVersion,

    schemaVersion:
      HD_REPLAY_PARSER_CONTRACT
        .schemaVersion,

    passName:
      HD_REPLAY_PARSER_CONTRACT
        .passName,

    passVersion:
      HD_REPLAY_PARSER_CONTRACT
        .passVersion,

    status:
      "completed",

    candidateOnly:
      true,

    affectsPublicAggregates:
      false,

    artifact: {
      id:
        701,

      sha256:
        REPLAY_HASH,
    },

    observations,
  };
}


function gameFixture():
  TargetedReplayRosterGameSnapshot {
  return {
    id:
      44862,

    replayHash:
      REPLAY_HASH,

    replay_file:
      "/archive/game.aoe2record",

    original_filename:
      "game.aoe2record",

    parse_source:
      "watcher_final",

    parse_reason:
      "team_resignation_not_complete",

    is_final:
      true,

    disconnect_detected:
      false,

    winner:
      null,

    players: [
      {
        name:
          "Jim",
      },
      {
        name:
          "Emaren",
      },
      {
        name:
          "Zodiac",
      },
      {
        name:
          "Fourth",
      },
    ],

    key_events: {
      platform_match_id:
        "steam-match-44862",
    },

    event_types:
      [],

    linkedMarketCount:
      0,

    linkedClaimCount:
      0,

    acceptedAdjudicationCount:
      0,

    latestDesyncOccurred:
      false,

    existingPromotions:
      [],
  };
}


test(
  "current and frozen parser contracts remain explicitly separated",
  () => {
    assert.equal(
      HD_REPLAY_PARSER_CONTRACT
        .passVersion,
      "10",
    );

    assert.equal(
      HD_REPLAY_PARSER_PASS8_CONTRACT
        .passVersion,
      "8",
    );

    assert.deepEqual(
      {
        ...HD_REPLAY_PARSER_CONTRACT,
        passVersion:
          undefined,
      },
      {
        ...HD_REPLAY_PARSER_PASS8_CONTRACT,
        passVersion:
          undefined,
      },
    );
  },
);


test(
  "missing current parser run fails closed with a contract-neutral blocker",
  () => {
    const plan =
      evaluateTargetedReplayRosterRecovery({
        game:
          gameFixture(),

        run:
          null,
      });

    assert.equal(
      plan.status,
      "blocked",
    );

    assert.deepEqual(
      plan.blockers,
      [
        "exact_current_parser_run_missing",
      ],
    );
  },
);


test(
  "exact current Pass-10 2v2 roster is eligible without granting result authority",
  () => {
    const plan =
      evaluateTargetedReplayRosterRecovery({
        game:
          gameFixture(),

        run:
          runFixture(),
      });

    assert.equal(
      plan.status,
      "eligible",
      plan.blockers.join(
        ",",
      ),
    );

    assert.equal(
      plan.eligible,
      true,
    );

    assert.ok(
      plan.decisionHash,
    );

    assert.ok(
      plan.idempotencyKey
        ?.startsWith(
          "public-roster-v2:44862:",
        ),
    );

    assert.equal(
      plan.projection
        .projectedPlayers
        .length,
      4,
    );

    assert.ok(
      plan.projection
        .projectedPlayers
        .every(
          (
            player,
          ) =>
            player.winner ===
              null,
        ),
    );

    assert.equal(
      plan.authorityBoundary
        .affectsResults,
      false,
    );

    assert.equal(
      plan.authorityBoundary
        .affectsBets,
      false,
    );

    assert.equal(
      plan.authorityBoundary
        .settlementAuthority,
      false,
    );

    assert.deepEqual(
      plan.before
        .resultAuthority,
      plan.projection
        .resultAuthority,
    );
  },
);


test(
  "missing direct Steam evidence blocks targeted roster recovery",
  () => {
    const run =
      runFixture();

    run.observations =
      run.observations
        .filter(
          (
            observation,
          ) =>
            !(
              observation
                .fieldPath ===
                "player.steam_id" &&
              observation
                .value ===
                "76561198000000001"
            ),
        );

    const plan =
      evaluateTargetedReplayRosterRecovery({
        game:
          gameFixture(),

        run,
      });

    assert.equal(
      plan.status,
      "blocked",
    );

    assert.ok(
      plan.blockers
        .some(
          (
            blocker,
          ) =>
            blocker.startsWith(
              "projection:missing_or_conflicting_steam_id:",
            ),
        ),
    );
  },
);


test(
  "linked markets and accepted result history fail closed",
  () => {
    const game =
      gameFixture();

    game.linkedMarketCount =
      1;

    game.linkedClaimCount =
      2;

    game.acceptedAdjudicationCount =
      1;

    const plan =
      evaluateTargetedReplayRosterRecovery({
        game,
        run:
          runFixture(),
      });

    assert.equal(
      plan.status,
      "blocked",
    );

    assert.ok(
      plan.blockers.includes(
        "linked_markets:1",
      ),
    );

    assert.ok(
      plan.blockers.includes(
        "linked_claims:2",
      ),
    );

    assert.ok(
      plan.blockers.includes(
        "accepted_result_adjudication",
      ),
    );
  },
);


test(
  "planner discovers session-key markets and claims before allowing roster mutation",
  async () => {
    const game =
      gameFixture();

    let marketWhere:
      unknown =
      null;

    let claimWhere:
      unknown =
      null;

    const db = {
      gameStats: {
        findUnique:
          async () => ({
            id:
              game.id,

            replayHash:
              game.replayHash,

            replay_file:
              game.replay_file,

            original_filename:
              game.original_filename,

            parse_source:
              game.parse_source,

            parse_reason:
              game.parse_reason,

            is_final:
              game.is_final,

            disconnect_detected:
              game.disconnect_detected,

            winner:
              game.winner,

            players:
              game.players,

            key_events:
              game.key_events,

            event_types:
              game.event_types,

            replayResultAdjudications:
              [],

            replayDesyncIncidents:
              [],

            replayRosterPromotions:
              [],
          }),
      },

      betMarket: {
        findMany:
          async (
            args:
              Record<
                string,
                unknown
              >,
          ) => {
            marketWhere =
              args.where;

            return [
              {
                id:
                  77,
              },
            ];
          },
      },

      pendingWoloClaim: {
        count:
          async (
            args:
              Record<
                string,
                unknown
              >,
          ) => {
            claimWhere =
              args.where;

            return 1;
          },
      },

      replayParseRun: {
        findMany:
          async () => [
            runFixture(),
          ],
      },
    };

    const plan =
      await planTargetedReplayRosterRecovery(
        db as never,
        game.id,
      );

    assert.ok(
      plan,
    );

    assert.equal(
      plan.status,
      "blocked",
    );

    assert.ok(
      plan.blockers.includes(
        "linked_markets:1",
      ),
    );

    assert.ok(
      plan.blockers.includes(
        "linked_claims:1",
      ),
    );

    const marketShape =
      JSON.stringify(
        marketWhere,
      );

    assert.match(
      marketShape,
      /linkedGameStatsId/,
    );

    assert.match(
      marketShape,
      /linkedSessionKey/,
    );

    assert.match(
      marketShape,
      /game\.aoe2record/,
    );

    const claimShape =
      JSON.stringify(
        claimWhere,
      );

    assert.match(
      claimShape,
      /sourceGameStatsId/,
    );

    assert.match(
      claimShape,
      /sourceMarketId/,
    );

    assert.match(
      claimShape,
      /77/,
    );
  },
);


test(
  "candidate observations with public authority contamination are rejected",
  () => {
    const run =
      runFixture();

    run.observations[0]
      .affectsPublicAggregates =
      true;

    const plan =
      evaluateTargetedReplayRosterRecovery({
        game:
          gameFixture(),

        run,
      });

    assert.equal(
      plan.status,
      "blocked",
    );

    assert.ok(
      plan.blockers.includes(
        "relevant_observation_authority_invalid",
      ),
    );
  },
);


test(
  "an exact existing V2 promotion is idempotently recognized",
  () => {
    const game =
      gameFixture();

    game.existingPromotions = [
      {
        observationId:
          999,

        promotionKey:
          PUBLIC_REPLAY_ROSTER_V2_POLICY,

        replayHash:
          REPLAY_HASH,

        projectedPlayersHash:
          stableReplayRosterV2Hash(
            game.players,
          ),
      },
    ];

    const plan =
      evaluateTargetedReplayRosterRecovery({
        game,
        run:
          null,
      });

    assert.equal(
      plan.status,
      "already_applied",
    );

    assert.equal(
      plan.alreadyApplied,
      true,
    );

    assert.equal(
      plan.eligible,
      false,
    );
  },
);


test(
  "apply performs only the roster ledger append and GameStats players update",
  async () => {
    const game =
      gameFixture();

    const run =
      runFixture();

    let promotion:
      Record<
        string,
        unknown
      > |
      null =
      null;

    const writes:
      string[] =
      [];

    const tx = {
      $queryRaw:
        async () => [
          {
            lock_acquired:
              1,
          },
        ],

      gameStats: {
        findUnique:
          async () => ({
            id:
              game.id,

            replayHash:
              game.replayHash,

            replay_file:
              game.replay_file,

            original_filename:
              game.original_filename,

            parse_source:
              game.parse_source,

            parse_reason:
              game.parse_reason,

            is_final:
              game.is_final,

            disconnect_detected:
              game.disconnect_detected,

            winner:
              game.winner,

            players:
              game.players,

            key_events:
              game.key_events,

            event_types:
              game.event_types,

            replayResultAdjudications:
              [],

            replayDesyncIncidents:
              [],

            replayRosterPromotions:
              promotion
                ? [
                    {
                      observationId:
                        promotion
                          .observationId,

                      promotionKey:
                        promotion
                          .promotionKey,

                      replayHash:
                        promotion
                          .replayHash,

                      projectedPlayersHash:
                        promotion
                          .projectedPlayersHash,
                    },
                  ]
                : [],
          }),

        update:
          async (
            args: {
              data: {
                players:
                  unknown;
              };
            },
          ) => {
            writes.push(
              "gameStats.update",
            );

            game.players =
              args.data.players;

            return {
              id:
                game.id,
            };
          },
      },

      betMarket: {
        findMany:
          async () => [],
      },

      pendingWoloClaim: {
        count:
          async () => 0,
      },

      replayParseRun: {
        findMany:
          async () => [
            run,
          ],
      },

      replayRosterPromotion: {
        create:
          async (
            args: {
              data:
                Record<
                  string,
                  unknown
                >;
            },
          ) => {
            writes.push(
              "replayRosterPromotion.create",
            );

            promotion = {
              ...args.data,
            };

            return {
              id:
                91,
            };
          },
      },

      user: {
        findFirst:
          async () => ({
            id:
              7,
          }),
      },
    };

    const prisma = {
      $transaction:
        async (
          callback:
            (
              client:
                typeof tx,
            ) =>
              Promise<
                unknown
              >,
        ) =>
          callback(
            tx,
          ),
    };

    const result =
      await applyTargetedReplayRosterRecovery(
        prisma as never,
        44862,
        "u_admin",
      );

    assert.equal(
      result.outcome,
      "applied",
    );

    assert.equal(
      result.promotionId,
      91,
    );

    assert.deepEqual(
      writes,
      [
        "replayRosterPromotion.create",
        "gameStats.update",
      ],
    );

    assert.equal(
      result.plan.status,
      "already_applied",
    );

    assert.ok(
      (
        game.players as
          Array<
            Record<
              string,
              unknown
            >
          >
      ).every(
        (
          player,
        ) =>
          player.winner ===
            null,
      ),
    );
  },
);


test(
  "admin route remains roster-only and defaults to dry-run",
  () => {
    const route =
      readFileSync(
        "app/api/admin/replay-roster-recovery/route.ts",
        "utf8",
      );

    assert.match(
      route,
      /const apply =[\s\S]*searchParams[\s\S]*\.get\([\s\S]*"apply"[\s\S]*\) ===[\s\S]*"1"/,
    );

    assert.match(
      route,
      /if \(!apply\)[\s\S]*planTargetedReplayRosterRecovery/,
    );

    assert.match(
      route,
      /applyTargetedReplayRosterRecovery/,
    );

    assert.match(
      route,
      /resultChanges:[\s\S]*0/,
    );

    assert.match(
      route,
      /bettingAuthority:[\s\S]*false/,
    );

    assert.match(
      route,
      /settlementAuthority:[\s\S]*false/,
    );

    assert.match(
      route,
      /woloAuthority:[\s\S]*false/,
    );

    assert.doesNotMatch(
      route,
      /reconcileAutomaticWatcherTerminalResults/,
    );

    assert.doesNotMatch(
      route,
      /ensureReplayIdentityProjections/,
    );

    assert.doesNotMatch(
      route,
      /BetMarket|BetWager|PendingWoloClaim/,
    );
  },
);
