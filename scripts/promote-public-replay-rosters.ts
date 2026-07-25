import {
  createHash,
} from "node:crypto";

import {
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  getPrisma,
} from "../lib/prisma";

import {
  cleanPublicGameRows,
  publicReplayWinnerTruth,
} from "../lib/publicReplayTruth";

import {
  resolveReliableReplayWinner,
} from "../lib/unresolvedWatcherResult";

const POLICY_VERSION =
  "public_replay_roster_v1";

const MANIFEST =
  process.env.ROSTER_MANIFEST ??
  "/tmp/aoe2war-public-roster-projection-manifest.json";

const REPORT =
  process.env.ROSTER_PROMOTION_REPORT ??
  "/tmp/aoe2war-public-roster-promotion-report.json";

const APPLY =
  process.argv.includes(
    "--apply"
  );

type Obj =
  Record<string, unknown>;

type ProjectedPlayer =
  Record<string, unknown>;

type ManifestEntry = {
  gameStatsId: number;

  source: {
    parseRunId: number;
    replayHash: string;
    failureSignature:
      string | null;
    policyVersion: string;
  };

  before: {
    playersHash: string;
    players: unknown;
    winner: unknown;
    parseReason: string;
    parseSource: string;
  };

  projectedPlayers:
    ProjectedPlayer[];

  authorityBoundary: {
    rosterOnly: boolean;
    winnerRemains: unknown;
    allProjectedWinnerFlags:
      null;
    resultAdjudication:
      boolean;
    affectsBets:
      boolean;
    settlementAuthority:
      boolean;
  };
};

function objectValue(
  value: unknown
): Obj {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Obj
    : {};
}

function arrayValue(
  value: unknown
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function textValue(
  value: unknown
) {
  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  if (
    typeof value === "bigint"
  ) {
    return value.toString();
  }

  return "";
}

function numberValue(
  value: unknown
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "bigint"
  ) {
    return Number(value);
  }

  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(
      Number(value)
    )
  ) {
    return Number(value);
  }

  return null;
}

function booleanValue(
  value: unknown
) {
  if (
    value === true ||
    value === false
  ) {
    return value;
  }

  const normalized =
    textValue(value)
      .toLowerCase();

  if (
    [
      "true",
      "yes",
      "1",
      "trusted",
      "resolved",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "no",
      "0",
      "untrusted",
      "review_required",
    ].includes(normalized)
  ) {
    return false;
  }

  return null;
}

function stableValue(
  value: unknown
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Obj
      )
        .sort(
          (
            left,
            right
          ) =>
            left[0].localeCompare(
              right[0]
            )
        )
        .map(
          (
            [
              key,
              child,
            ]
          ) => [
            key,
            stableValue(child),
          ]
        )
    );
  }

  if (
    typeof value === "bigint"
  ) {
    return value.toString();
  }

  return value;
}

function stableHash(
  value: unknown
) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function unknownWinner(
  value: unknown
) {
  const normalized =
    textValue(value)
      .toLowerCase();

  return (
    !normalized ||
    [
      "unknown",
      "unresolved",
      "none",
      "null",
      "n/a",
    ].includes(
      normalized
    )
  );
}

function winnerSummary(
  value: unknown
) {
  const truth =
    objectValue(value);

  return {
    winner:
      textValue(
        truth.winner
      ) ||
      null,

    winningTeamId:
      textValue(
        truth.winningTeamId ??
        truth.winning_team_id
      ) ||
      null,

    statsEligible:
      booleanValue(
        truth.statsEligible ??
        truth.stats_eligible
      ),

    reviewNeeded:
      booleanValue(
        truth.reviewNeeded ??
        truth.review_needed
      ),
  };
}

function strongestResolution<
  T extends {
    id: number;
    fieldPath: string;
    confidenceBps:
      number | null;
  },
>(
  observations: T[]
) {
  return observations
    .filter(
      (observation) =>
        observation.fieldPath ===
          "teams.resolution"
    )
    .slice()
    .sort(
      (
        left,
        right
      ) =>
        (
          right.confidenceBps ??
          -1
        ) -
          (
            left.confidenceBps ??
            -1
          ) ||
        right.id -
          left.id
    )[0] ??
    null;
}

function formatFor(
  count: number
) {
  if (count === 4) {
    return "2v2";
  }

  if (count === 6) {
    return "3v3";
  }

  if (count === 8) {
    return "4v4";
  }

  return "other";
}

function validateProjectedPlayers(
  players: ProjectedPlayer[]
) {
  const blockers:
    string[] =
    [];

  if (
    ![
      4,
      6,
      8,
    ].includes(
      players.length
    )
  ) {
    blockers.push(
      `unsupported_player_count:${players.length}`
    );
  }

  const steamIds =
    players.map(
      (player) =>
        textValue(
          player.steam_id
        )
    );

  const numbers =
    players.map(
      (player) =>
        numberValue(
          player.number
        )
    );

  const teamCounts =
    new Map<number, number>();

  for (
    const player of players
  ) {
    if (
      player.winner !== null
    ) {
      blockers.push(
        "winner_flag_not_null"
      );
    }

    const name =
      textValue(
        player.name
      );

    const steamId =
      textValue(
        player.steam_id
      );

    const userId =
      textValue(
        player.user_id
      );

    const teamId =
      numberValue(
        player.team_id
      );

    if (!name) {
      blockers.push(
        "missing_player_name"
      );
    }

    if (!steamId) {
      blockers.push(
        "missing_steam_id"
      );
    }

    if (
      steamId !== userId
    ) {
      blockers.push(
        `steam_user_id_mismatch:${steamId}:${userId}`
      );
    }

    if (
      teamId === null
    ) {
      blockers.push(
        `missing_team_id:${steamId}`
      );
    } else {
      teamCounts.set(
        teamId,
        (
          teamCounts.get(
            teamId
          ) ??
          0
        ) +
          1
      );
    }

    if (
      player.roster_recovered !==
        true
    ) {
      blockers.push(
        `missing_roster_recovered_marker:${steamId}`
      );
    }

    if (
      textValue(
        player.roster_source
      ) !==
        POLICY_VERSION
    ) {
      blockers.push(
        `invalid_roster_source:${steamId}`
      );
    }
  }

  if (
    steamIds.some(
      (steamId) =>
        !steamId
    ) ||
    new Set(
      steamIds
    ).size !==
      steamIds.length
  ) {
    blockers.push(
      "missing_or_duplicate_steam_ids"
    );
  }

  const expectedNumbers =
    Array.from(
      {
        length:
          players.length,
      },
      (
        _value,
        index
      ) =>
        index + 1
    );

  if (
    JSON.stringify(
      numbers
    ) !==
    JSON.stringify(
      expectedNumbers
    )
  ) {
    blockers.push(
      `player_number_sequence:${numbers.join(",")}`
    );
  }

  const teamSizes =
    [
      ...teamCounts.values(),
    ]
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );

  if (
    teamCounts.size !== 2 ||
    teamSizes.length !== 2 ||
    teamSizes[0] !==
      teamSizes[1]
  ) {
    blockers.push(
      `invalid_team_sizes:${teamSizes.join(",")}`
    );
  }

  return {
    blockers:
      [
        ...new Set(
          blockers
        ),
      ],

    teamSizes,

    format:
      formatFor(
        players.length
      ),
  };
}

function jsonReplacer(
  _key: string,
  value: unknown
) {
  return typeof value ===
    "bigint"
    ? value.toString()
    : value;
}

async function main() {
  const rawManifest =
    JSON.parse(
      await readFile(
        MANIFEST,
        "utf8"
      )
    ) as {
      policyVersion?: string;
      entries?: ManifestEntry[];
    };

  const entries =
    rawManifest.entries ??
    [];

  if (
    rawManifest.policyVersion !==
      POLICY_VERSION
  ) {
    throw new Error(
      `Unexpected manifest policy: ${rawManifest.policyVersion}`
    );
  }

  if (
    entries.length !== 111 ||
    new Set(
      entries.map(
        (entry) =>
          entry.gameStatsId
      )
    ).size !== 111
  ) {
    throw new Error(
      `Expected 111 unique manifest entries; found ${entries.length}.`
    );
  }

  const ids =
    entries.map(
      (entry) =>
        entry.gameStatsId
    );

  const parseRunIds =
    entries.map(
      (entry) =>
        entry.source.parseRunId
    );

  const prisma =
    getPrisma();

  try {
    const [
      actor,
      games,
      runs,
      incidents,
      marketRows,
      existingPromotions,
    ] =
      await Promise.all([
        prisma.user.findFirst({
          where: {
            uid:
              "u_626ea6497a984dabbc2338ef54c5d333",

            isAdmin:
              true,
          },

          select: {
            id:
              true,

            uid:
              true,

            inGameName:
              true,

            isAdmin:
              true,
          },
        }),

        prisma.gameStats.findMany({
          where: {
            id: {
              in:
                ids,
            },
          },

          orderBy: {
            id:
              "asc",
          },

          select: {
            id:
              true,

            replayHash:
              true,

            winner:
              true,

            players:
              true,

            key_events:
              true,

            event_types:
              true,

            parse_reason:
              true,

            parse_source:
              true,

            is_final:
              true,

            disconnect_detected:
              true,

            replayResultAdjudications: {
              where: {
                decisionStatus:
                  "accepted",
              },

              select: {
                id:
                  true,

                affectsStats:
                  true,

                affectsBets:
                  true,
              },
            },
          },
        }),

        prisma.replayParseRun.findMany({
          where: {
            id: {
              in:
                parseRunIds,
            },
          },

          select: {
            id:
              true,

            gameStatsId:
              true,

            parserName:
              true,

            parserVersion:
              true,

            passName:
              true,

            passVersion:
              true,

            status:
              true,

            candidateOnly:
              true,

            affectsPublicAggregates:
              true,

            artifact: {
              select: {
                sha256:
                  true,
              },
            },

            observations: {
              where: {
                fieldPath: {
                  in: [
                    "player.name",
                    "player.number",
                    "player.steam_id",
                    "player.team_id",
                    "teams.resolution",
                  ],
                },
              },

              orderBy: {
                id:
                  "asc",
              },

              select: {
                id:
                  true,

                fieldPath:
                  true,

                value:
                  true,

                confidenceBps:
                  true,

                provenance:
                  true,

                candidateOnly:
                  true,

                affectsPublicAggregates:
                  true,
              },
            },
          },
        }),

        prisma.replayDesyncIncident.findMany({
          where: {
            gameStatsId: {
              in:
                ids,
            },
          },

          orderBy: [
            {
              gameStatsId:
                "asc",
            },
            {
              createdAt:
                "asc",
            },
            {
              id:
                "asc",
            },
          ],

          select: {
            id:
              true,

            gameStatsId:
              true,

            desyncOccurred:
              true,

            createdAt:
              true,
          },
        }),

        prisma.$queryRawUnsafe<
          Array<{
            game_stats_id:
              number | string | bigint;

            market_count:
              number | string | bigint;
          }>
        >(
          `
            SELECT
              linked_game_stats_id
                AS game_stats_id,

              COUNT(*)::int
                AS market_count

            FROM public.bet_markets

            WHERE linked_game_stats_id
              IN (${ids.join(",")})

            GROUP BY
              linked_game_stats_id
          `
        ),

        prisma.replayRosterPromotion.findMany({
          where: {
            gameStatsId: {
              in:
                ids,
            },

            promotionKey:
              POLICY_VERSION,
          },

          orderBy: {
            id:
              "asc",
          },

          select: {
            id:
              true,

            gameStatsId:
              true,

            observationId:
              true,

            idempotencyKey:
              true,

            promotionKey:
              true,

            decisionHash:
              true,

            policyVersion:
              true,

            affectsPublicAggregates:
              true,

            createdAt:
              true,
          },
        }),
      ]);

    if (!actor) {
      throw new Error(
        "Emaren site-admin actor unavailable."
      );
    }

    if (
      games.length !==
        111
    ) {
      throw new Error(
        `Expected 111 GameStats rows; found ${games.length}.`
      );
    }

    if (
      runs.length !==
        111
    ) {
      throw new Error(
        `Expected 111 source parse runs; found ${runs.length}.`
      );
    }

    const gameById =
      new Map(
        games.map(
          (game) => [
            game.id,
            game,
          ]
        )
      );

    const runById =
      new Map(
        runs.map(
          (run) => [
            run.id,
            run,
          ]
        )
      );

    const promotionByGame =
      new Map(
        existingPromotions.map(
          (promotion) => [
            promotion.gameStatsId,
            promotion,
          ]
        )
      );

    const latestDesyncByGame =
      new Map<number, boolean>();

    for (
      const incident of
      incidents
    ) {
      latestDesyncByGame.set(
        incident.gameStatsId,
        incident.desyncOccurred
      );
    }

    const marketCountByGame =
      new Map<number, number>();

    for (
      const row of
      marketRows
    ) {
      marketCountByGame.set(
        Number(
          row.game_stats_id
        ),
        Number(
          row.market_count
        )
      );
    }

    const plan:
      Array<{
        gameStatsId: number;
        observationId: number;
        decisionHash: string;
        idempotencyKey: string;
        replayHash: string;
        previousPlayersHash: string;
        previousPlayers: unknown;
        projectedPlayers:
          ProjectedPlayer[];
        projectedPlayersHash:
          string;
        format: string;
        playerCount: number;
        alreadyApplied: boolean;
      }> =
      [];

    const preflightRecords =
      [];

    for (
      const entry of
      entries
    ) {
      const game =
        gameById.get(
          entry.gameStatsId
        );

      const run =
        runById.get(
          entry.source.parseRunId
        );

      if (
        !game ||
        !run
      ) {
        throw new Error(
          `Missing source contract for #${entry.gameStatsId}.`
        );
      }

      const blockers:
        string[] =
        [];

      const currentPlayersHash =
        stableHash(
          game.players
        );

      const projectedPlayersHash =
        stableHash(
          entry.projectedPlayers
        );

      const existingPromotion =
        promotionByGame.get(
          game.id
        ) ??
        null;

      if (
        existingPromotion
      ) {
        if (
          currentPlayersHash !==
            projectedPlayersHash
        ) {
          blockers.push(
            "promotion_exists_but_projection_missing"
          );
        }
      } else if (
        currentPlayersHash !==
          entry.before.playersHash
      ) {
        blockers.push(
          "current_players_drifted"
        );
      }

      if (
        game.is_final !==
          true
      ) {
        blockers.push(
          "game_not_final"
        );
      }

      if (
        game.disconnect_detected ===
          true
      ) {
        blockers.push(
          "disconnect_detected"
        );
      }

      if (
        latestDesyncByGame.get(
          game.id
        ) === true
      ) {
        blockers.push(
          "confirmed_desync"
        );
      }

      const marketCount =
        marketCountByGame.get(
          game.id
        ) ??
        0;

      if (
        marketCount > 0
      ) {
        blockers.push(
          `linked_markets:${marketCount}`
        );
      }

      if (
        game
          .replayResultAdjudications
          .length > 0
      ) {
        blockers.push(
          "accepted_result_adjudication"
        );
      }

      if (
        !unknownWinner(
          game.winner
        )
      ) {
        blockers.push(
          `stored_winner_not_unknown:${textValue(game.winner)}`
        );
      }

      if (
        run.gameStatsId !==
          game.id
      ) {
        blockers.push(
          "parse_run_game_mismatch"
        );
      }

      if (
        run.parserName !==
          "aoe2war.mgz_hd" ||
        run.parserVersion !==
          "1.8.51" ||
        run.passName !==
          "hd_deterministic_evidence" ||
        run.passVersion !==
          "6"
      ) {
        blockers.push(
          "parse_run_identity_mismatch"
        );
      }

      if (
        run.status !==
          "completed" ||
        run.candidateOnly !==
          true ||
        run.affectsPublicAggregates !==
          false
      ) {
        blockers.push(
          "parse_run_contract_invalid"
        );
      }

      if (
        run.artifact.sha256 !==
          game.replayHash ||
        run.artifact.sha256 !==
          entry.source.replayHash
      ) {
        blockers.push(
          "artifact_hash_mismatch"
        );
      }

      if (
        run.observations.some(
          (observation) =>
            observation.candidateOnly !==
              true ||
            observation.affectsPublicAggregates !==
              false
        )
      ) {
        blockers.push(
          "observation_contract_invalid"
        );
      }

      const resolution =
        strongestResolution(
          run.observations
        );

      if (!resolution) {
        blockers.push(
          "teams_resolution_missing"
        );
      } else if (
        (
          resolution.confidenceBps ??
          0
        ) < 9000
      ) {
        blockers.push(
          "teams_resolution_low_confidence"
        );
      }

      const rosterValidation =
        validateProjectedPlayers(
          entry.projectedPlayers
        );

      blockers.push(
        ...rosterValidation.blockers
      );

      if (
        entry.authorityBoundary
          .rosterOnly !== true ||
        entry.authorityBoundary
          .resultAdjudication !==
            false ||
        entry.authorityBoundary
          .affectsBets !== false ||
        entry.authorityBoundary
          .settlementAuthority !==
            false
      ) {
        blockers.push(
          "manifest_authority_boundary_invalid"
        );
      }

      const projectedGame = {
        ...game,
        players:
          entry.projectedPlayers,
      };

      const publicTruth =
        winnerSummary(
          publicReplayWinnerTruth(
            projectedGame
          )
        );

      const reliableWinner =
        resolveReliableReplayWinner({
          winner:
            projectedGame.winner,

          players:
            entry.projectedPlayers,

          parseReason:
            projectedGame.parse_reason,

          parseSource:
            projectedGame.parse_source,

          keyEvents:
            projectedGame.key_events,

          eventTypes:
            projectedGame.event_types,
        });

      if (
        publicTruth.winner ||
        reliableWinner
      ) {
        blockers.push(
          `public_winner_emerged:${
            publicTruth.winner ??
            reliableWinner
          }`
        );
      }

      const resolvedVisible =
        cleanPublicGameRows(
          [projectedGame],
          {
            includeReview:
              false,

            includeLive:
              false,
          }
        ).length === 1;

      const reviewVisible =
        cleanPublicGameRows(
          [projectedGame],
          {
            includeReview:
              true,

            includeLive:
              false,
          }
        ).length === 1;

      if (resolvedVisible) {
        blockers.push(
          "projected_row_became_resolved_visible"
        );
      }

      if (!reviewVisible) {
        blockers.push(
          "projected_row_not_review_visible"
        );
      }

      const observationId =
        resolution?.id ??
        0;

      const decisionHash =
        stableHash({
          policyVersion:
            POLICY_VERSION,

          gameStatsId:
            game.id,

          parseRunId:
            run.id,

          observationId,

          replayHash:
            game.replayHash,

          previousPlayersHash:
            entry.before.playersHash,

          projectedPlayersHash,

          winner:
            game.winner,

          authorityBoundary:
            entry.authorityBoundary,
        });

      const idempotencyKey =
        [
          "public-roster-v1",
          game.id,
          decisionHash,
        ].join(":");

      if (
        existingPromotion &&
        (
          existingPromotion
            .observationId !==
              observationId ||
          existingPromotion
            .decisionHash !==
              decisionHash ||
          existingPromotion
            .policyVersion !==
              POLICY_VERSION ||
          existingPromotion
            .affectsPublicAggregates !==
              true
        )
      ) {
        blockers.push(
          "existing_promotion_contract_mismatch"
        );
      }

      const deduplicatedBlockers =
        [
          ...new Set(
            blockers
          ),
        ];

      preflightRecords.push({
        gameStatsId:
          game.id,

        parseRunId:
          run.id,

        observationId,

        currentPlayersHash,

        expectedBeforePlayersHash:
          entry.before.playersHash,

        projectedPlayersHash,

        format:
          rosterValidation.format,

        teamSizes:
          rosterValidation.teamSizes,

        publicTruth,

        reliableWinner:
          reliableWinner ??
          null,

        marketCount,

        effectiveConfirmedDesync:
          latestDesyncByGame.get(
            game.id
          ) === true,

        existingPromotionId:
          existingPromotion
            ?.id ??
          null,

        blockers:
          deduplicatedBlockers,
      });

      if (
        deduplicatedBlockers
          .length === 0
      ) {
        plan.push({
          gameStatsId:
            game.id,

          observationId,

          decisionHash,

          idempotencyKey,

          replayHash:
            entry.source.replayHash,

          previousPlayersHash:
            entry.before.playersHash,

          previousPlayers:
            game.players,

          projectedPlayers:
            entry.projectedPlayers,

          projectedPlayersHash,

          format:
            rosterValidation.format,

          playerCount:
            entry.projectedPlayers.length,

          alreadyApplied:
            Boolean(
              existingPromotion
            ),
        });
      }
    }

    const blocked =
      preflightRecords.filter(
        (record) =>
          record.blockers.length >
            0
      );

    const pending =
      plan.filter(
        (item) =>
          !item.alreadyApplied
      );

    const alreadyApplied =
      plan.filter(
        (item) =>
          item.alreadyApplied
      );

    const preflightSummary = {
      mode:
        APPLY
          ? "apply"
          : "dry_run",

      requested:
        entries.length,

      authorized:
        plan.length,

      pending:
        pending.length,

      alreadyApplied:
        alreadyApplied.length,

      blocked:
        blocked.length,

      blockedIds:
        blocked.map(
          (record) =>
            record.gameStatsId
        ),
    };

    console.log(
      "============================================================"
    );

    console.log(
      "PUBLIC ROSTER PROMOTION PREFLIGHT"
    );

    console.log(
      "============================================================"
    );

    console.log(
      JSON.stringify(
        preflightSummary,
        null,
        2
      )
    );

    if (
      blocked.length > 0
    ) {
      console.log(
        JSON.stringify(
          blocked,
          null,
          2
        )
      );

      throw new Error(
        `${blocked.length} rows failed promotion preflight.`
      );
    }

    if (
      plan.length !== 111
    ) {
      throw new Error(
        `Expected 111 authorized rows; found ${plan.length}.`
      );
    }

    if (
      APPLY &&
      pending.length > 0
    ) {
      await prisma.$transaction(
        async (
          transaction
        ) => {
          for (
            const item of
            pending
          ) {
            await transaction
              .replayRosterPromotion
              .create({
                data: {
                  observationId:
                    item.observationId,

                  gameStatsId:
                    item.gameStatsId,

                  promotedByUserId:
                    actor.id,

                  idempotencyKey:
                    item.idempotencyKey,

                  promotionKey:
                    POLICY_VERSION,

                  decisionHash:
                    item.decisionHash,

                  policyVersion:
                    POLICY_VERSION,

                  replayHash:
                    item.replayHash,

                  previousPlayersHash:
                    item.previousPlayersHash,

                  projectedPlayersHash:
                    item.projectedPlayersHash,

                  format:
                    item.format,

                  playerCount:
                    item.playerCount,

                  previousPlayers:
                    item.previousPlayers as never,

                  projectedPlayers:
                    item.projectedPlayers as never,

                  reason:
                    "Promote exact balanced replay roster into public GameStats.players. Winner and all player winner flags remain unknown/null. No betting or settlement authority.",

                  affectsPublicAggregates:
                    true,

                  affectsResults:
                    false,

                  affectsBets:
                    false,

                  settlementAuthority:
                    false,
                },
              });

            await transaction
              .gameStats
              .update({
                where: {
                  id:
                    item.gameStatsId,
                },

                data: {
                  players:
                    item.projectedPlayers as never,
                },
              });
          }
        },
        {
          maxWait:
            10_000,

          timeout:
            120_000,
        }
      );
    }

    const [
      afterGames,
      afterPromotions,
    ] =
      await Promise.all([
        prisma.gameStats.findMany({
          where: {
            id: {
              in:
                ids,
            },
          },

          orderBy: {
            id:
              "asc",
          },

          select: {
            id:
              true,

            replay_file:
              true,

            replayHash:
              true,

            createdAt:
              true,

            winner:
              true,

            players:
              true,

            map:
              true,

            game_type:
              true,

            duration:
              true,

            game_duration:
              true,

            event_types:
              true,

            key_events:
              true,

            timestamp:
              true,

            played_on:
              true,

            parse_iteration:
              true,

            is_final:
              true,

            disconnect_detected:
              true,

            parse_source:
              true,

            parse_reason:
              true,

            original_filename:
              true,

            replayResultAdjudications: {
              where: {
                decisionStatus:
                  "accepted",
              },

              select: {
                id:
                  true,

                affectsStats:
                  true,

                affectsBets:
                  true,
              },
            },
          },
        }),

        prisma.replayRosterPromotion.findMany({
          where: {
            gameStatsId: {
              in:
                ids,
            },

            promotionKey:
              POLICY_VERSION,
          },

          orderBy: {
            gameStatsId:
              "asc",
          },

          select: {
            id:
              true,

            gameStatsId:
              true,

            observationId:
              true,

            decisionHash:
              true,

            policyVersion:
              true,

            affectsPublicAggregates:
              true,

            createdAt:
              true,
          },
        }),
      ]);

    const expectedByGame =
      new Map(
        plan.map(
          (item) => [
            item.gameStatsId,
            item,
          ]
        )
      );

    const postErrors:
      Array<{
        gameStatsId: number;
        errors: string[];
      }> =
      [];

    let reviewVisible =
      0;

    let resolvedVisible =
      0;

    for (
      const game of
      afterGames
    ) {
      const expected =
        expectedByGame.get(
          game.id
        );

      const errors:
        string[] =
        [];

      if (!expected) {
        errors.push(
          "missing_expected_projection"
        );
      } else if (
        APPLY &&
        stableHash(
          game.players
        ) !==
          expected
            .projectedPlayersHash
      ) {
        errors.push(
          "projected_players_hash_mismatch"
        );
      }

      if (
        !unknownWinner(
          game.winner
        )
      ) {
        errors.push(
          `winner_changed:${textValue(game.winner)}`
        );
      }

      const players =
        arrayValue(
          game.players
        )
          .map(
            objectValue
          );

      if (
        APPLY &&
        players.some(
          (player) =>
            player.winner !==
              null
        )
      ) {
        errors.push(
          "player_winner_flag_changed"
        );
      }

      const reliableWinner =
        resolveReliableReplayWinner({
          winner:
            game.winner,

          players:
            arrayValue(
              game.players
            )
              .map(
                objectValue
              ),

          parseReason:
            game.parse_reason,

          parseSource:
            game.parse_source,

          keyEvents:
            game.key_events,

          eventTypes:
            game.event_types,
        });

      const publicTruth =
        winnerSummary(
          publicReplayWinnerTruth({
            ...game,

            players:
              arrayValue(
                game.players
              )
                .map(
                  objectValue
                ),
          })
        );

      if (
        publicTruth.winner ||
        reliableWinner
      ) {
        errors.push(
          `winner_emerged:${
            publicTruth.winner ??
            reliableWinner
          }`
        );
      }

      if (
        cleanPublicGameRows(
          [game],
          {
            includeReview:
              true,

            includeLive:
              false,
          }
        ).length === 1
      ) {
        reviewVisible +=
          1;
      }

      if (
        cleanPublicGameRows(
          [game],
          {
            includeReview:
              false,

            includeLive:
              false,
          }
        ).length === 1
      ) {
        resolvedVisible +=
          1;
      }

      if (
        errors.length > 0
      ) {
        postErrors.push({
          gameStatsId:
            game.id,

          errors,
        });
      }
    }

    if (
      APPLY &&
      afterPromotions.length !==
        111
    ) {
      postErrors.push({
        gameStatsId:
          0,

        errors: [
          `promotion_count:${afterPromotions.length}`,
        ],
      });
    }

    const finalSummary = {
      mode:
        APPLY
          ? "apply"
          : "dry_run",

      requested:
        entries.length,

      authorized:
        plan.length,

      newlyApplied:
        APPLY
          ? pending.length
          : 0,

      alreadyApplied:
        alreadyApplied.length,

      promotionsPresent:
        afterPromotions.length,

      postVerificationErrors:
        postErrors.length,

      reviewVisible,

      resolvedVisible,

      winnerEmergence:
        postErrors
          .filter(
            (record) =>
              record.errors.some(
                (error) =>
                  error.startsWith(
                    "winner_emerged:"
                  )
              )
          )
          .map(
            (record) =>
              record.gameStatsId
          ),

      authorityBoundary: {
        gameStatsWinnerChanged:
          false,

        playerWinnerFlags:
          null,

        resultAdjudicationsCreated:
          0,

        marketsChanged:
          0,

        affectsBets:
          false,

        settlementAuthority:
          false,
      },
    };

    await writeFile(
      REPORT,
      JSON.stringify(
        {
          generatedAt:
            new Date()
              .toISOString(),

          actor,

          preflightSummary,

          finalSummary,

          blocked,

          postErrors,

          preflightRecords,

          promotions:
            afterPromotions,
        },
        jsonReplacer,
        2
      )
    );

    console.log();

    console.log(
      "============================================================"
    );

    console.log(
      "PUBLIC ROSTER PROMOTION RESULT"
    );

    console.log(
      "============================================================"
    );

    console.log(
      JSON.stringify(
        finalSummary,
        null,
        2
      )
    );

    console.log();

    console.log(
      `REPORT: ${REPORT}`
    );

    if (
      postErrors.length > 0
    ) {
      throw new Error(
        `Post-verification failed for ${postErrors.length} records.`
      );
    }

    if (
      APPLY &&
      (
        afterPromotions.length !==
          111 ||
        reviewVisible !==
          111 ||
        resolvedVisible !==
          0
      )
    ) {
      throw new Error(
        "Final roster-promotion invariants failed."
      );
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(
  (error) => {
    console.error();

    console.error(
      "PUBLIC ROSTER PROMOTION FAILED"
    );

    console.error(
      error
    );

    process.exitCode =
      1;
  }
);
