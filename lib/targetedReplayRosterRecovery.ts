import {
  Prisma,
  type PrismaClient,
} from "./generated/prisma/index.js";

import {
  cleanPublicGameRows,
  publicReplayIdentity,
  publicReplayWinnerTruth,
} from "./publicReplayTruth.ts";

import {
  HD_REPLAY_PARSER_CONTRACT,
} from "./replayEngineRoom.ts";

import {
  PUBLIC_REPLAY_ROSTER_V2_POLICY,
  buildPublicReplayRosterV2Projection,
  publicReplayRosterV2DisplayState,
  stableReplayRosterV2Hash,
  type PublicReplayRosterV2Observation,
} from "./publicReplayRosterV2.ts";

import {
  resolveReliableReplayWinner,
} from "./unresolvedWatcherResult.ts";


const ROSTER_OBSERVATION_PATHS = [
  "player.name",
  "player.number",
  "player.steam_id",
  "player.team_id",
  "teams.resolution",
] as const;


type JsonRecord =
  Record<string, unknown>;


export type TargetedReplayRosterPromotionSnapshot = {
  observationId:
    number;

  promotionKey:
    string;

  replayHash:
    string;

  projectedPlayersHash:
    string;
};


export type TargetedReplayRosterGameSnapshot = {
  id:
    number;

  replayHash:
    string;

  replay_file:
    string;

  original_filename:
    string | null;

  parse_source:
    string | null;

  parse_reason:
    string | null;

  is_final:
    boolean;

  disconnect_detected:
    boolean;

  winner:
    unknown;

  players:
    unknown;

  key_events:
    unknown;

  event_types:
    unknown;

  linkedMarketCount:
    number;

  linkedClaimCount:
    number;

  acceptedAdjudicationCount:
    number;

  latestDesyncOccurred:
    boolean | null;

  existingPromotions:
    TargetedReplayRosterPromotionSnapshot[];
};


export type TargetedReplayRosterRunSnapshot = {
  id:
    number;

  gameStatsId:
    number;

  inputHash:
    string;

  runIdentityHash:
    string;

  parserConfigHash:
    string;

  candidateOutputHash:
    string;

  parserName:
    string;

  parserVersion:
    string;

  schemaVersion:
    string;

  passName:
    string;

  passVersion:
    string;

  status:
    string;

  candidateOnly:
    boolean;

  affectsPublicAggregates:
    boolean;

  artifact: {
    id:
      number;

    sha256:
      string;
  };

  observations:
    Array<
      PublicReplayRosterV2Observation & {
        observationKey?:
          string;

        observationKind?:
          string;

        valueHash?:
          string;
      }
    >;
};


export type TargetedReplayRosterRecoveryPlan = {
  gameStatsId:
    number;

  status:
    "eligible" |
    "already_applied" |
    "not_required" |
    "blocked";

  eligible:
    boolean;

  alreadyApplied:
    boolean;

  blockers:
    string[];

  logicalIdentity:
    string;

  source:
    null | {
      parseRunId:
        number;

      artifactId:
        number;

      teamObservationId:
        number;

      replayHash:
        string;

      inputHash:
        string;

      artifactSha256:
        string;

      runIdentityHash:
        string;

      parserConfigHash:
        string;

      candidateOutputHash:
        string;

      evidenceHash:
        string;
    };

  before: {
    players:
      unknown;

    playersHash:
      string;

    resultAuthority:
      unknown;
  };

  projection: {
    format:
      string | null;

    playerCount:
      number;

    projectedPlayers:
      JsonRecord[];

    projectedPlayersHash:
      string | null;

    resultAuthority:
      unknown;
  };

  decisionHash:
    string | null;

  idempotencyKey:
    string | null;

  authorityBoundary: {
    rosterOnly:
      true;

    affectsPublicAggregates:
      true;

    affectsResults:
      false;

    affectsBets:
      false;

    settlementAuthority:
      false;

    projectedWinnerFlags:
      "all_null";
  };
};


export type TargetedReplayRosterRecoveryApplyResult = {
  gameStatsId:
    number;

  outcome:
    "applied" |
    "already_applied" |
    "not_required" |
    "blocked";

  promotionId:
    number | null;

  plan:
    TargetedReplayRosterRecoveryPlan;
};


function record(
  value: unknown
): JsonRecord {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as JsonRecord
    : {};
}


function text(
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

  return "";
}


function truthArray(
  value: unknown
) {
  return Array.isArray(value)
    ? value
        .map(text)
        .filter(Boolean)
        .sort()
    : [];
}


function lower(
  value: unknown
) {
  return text(value)
    .toLowerCase();
}


function validSha256(
  value: unknown
) {
  return /^[0-9a-f]{64}$/i.test(
    text(value)
  );
}


function resultAuthoritySnapshot(
  game:
    TargetedReplayRosterGameSnapshot
) {
  const gameRecord =
    game as unknown as
      Record<string, unknown>;

  const truth =
    record(
      publicReplayWinnerTruth(
        gameRecord
      )
    );

  const reliableWinner =
    resolveReliableReplayWinner({
      winner:
        game.winner,

      players:
        Array.isArray(
          game.players
        )
          ? game.players as Array<{
              name?:
                unknown;

              winner?:
                unknown;
            }>
          : [],

      parseReason:
        game.parse_reason,

      parseSource:
        game.parse_source,

      keyEvents:
        game.key_events,

      eventTypes:
        game.event_types,

      isFinal:
        game.is_final,

      disconnectDetected:
        game.disconnect_detected,
    });

  return {
    winner:
      text(
        truth.winner
      ) ||
      null,

    candidateWinner:
      text(
        truth.candidateWinner
      ) ||
      null,

    confidence:
      text(
        truth.confidence
      ) ||
      null,

    statsEligible:
      truth.statsEligible ===
      true,

    bettingEligible:
      truth.bettingEligible ===
      true,

    reliableWinner:
      reliableWinner ??
      null,

    truthReasons:
      truthArray(
        truth.truthReasons
      ),

    resolvedVisible:
      cleanPublicGameRows(
        [gameRecord],
        {
          includeReview:
            false,

          includeLive:
            false,
        }
      ).length ===
      1,

    reviewVisible:
      cleanPublicGameRows(
        [gameRecord],
        {
          includeReview:
            true,

          includeLive:
            false,
        }
      ).length ===
      1,
  };
}


function emptyPlan(
  game:
    TargetedReplayRosterGameSnapshot,

  options: {
    status:
      TargetedReplayRosterRecoveryPlan[
        "status"
      ];

    blockers?:
      string[];

    alreadyApplied?:
      boolean;
  }
): TargetedReplayRosterRecoveryPlan {
  const beforeAuthority =
    resultAuthoritySnapshot(
      game
    );

  return {
    gameStatsId:
      game.id,

    status:
      options.status,

    eligible:
      options.status ===
      "eligible",

    alreadyApplied:
      options.alreadyApplied ===
      true,

    blockers:
      options.blockers ??
      [],

    logicalIdentity:
      publicReplayIdentity(
        game as unknown as
          Record<string, unknown>
      ),

    source:
      null,

    before: {
      players:
        game.players,

      playersHash:
        stableReplayRosterV2Hash(
          game.players
        ),

      resultAuthority:
        beforeAuthority,
    },

    projection: {
      format:
        null,

      playerCount:
        0,

      projectedPlayers:
        [],

      projectedPlayersHash:
        null,

      resultAuthority:
        beforeAuthority,
    },

    decisionHash:
      null,

    idempotencyKey:
      null,

    authorityBoundary: {
      rosterOnly:
        true,

      affectsPublicAggregates:
        true,

      affectsResults:
        false,

      affectsBets:
        false,

      settlementAuthority:
        false,

      projectedWinnerFlags:
        "all_null",
    },
  };
}


export function evaluateTargetedReplayRosterRecovery(
  input: {
    game:
      TargetedReplayRosterGameSnapshot;

    run:
      TargetedReplayRosterRunSnapshot |
      null;
  }
): TargetedReplayRosterRecoveryPlan {
  const {
    game,
    run,
  } =
    input;

  const currentPlayersHash =
    stableReplayRosterV2Hash(
      game.players
    );

  if (
    game.existingPromotions.length >
      0
  ) {
    const exact =
      game.existingPromotions
        .find(
          (
            promotion
          ) =>
            promotion
              .promotionKey ===
              PUBLIC_REPLAY_ROSTER_V2_POLICY &&
            lower(
              promotion.replayHash
            ) ===
              lower(
                game.replayHash
              ) &&
            lower(
              promotion
                .projectedPlayersHash
            ) ===
              lower(
                currentPlayersHash
              )
        );

    if (exact) {
      return emptyPlan(
        game,
        {
          status:
            "already_applied",

          alreadyApplied:
            true,
        }
      );
    }

    return emptyPlan(
      game,
      {
        status:
          "blocked",

        blockers: [
          "existing_roster_promotion",
        ],
      }
    );
  }

  if (
    publicReplayRosterV2DisplayState(
      game.players
    ).complete
  ) {
    return emptyPlan(
      game,
      {
        status:
          "not_required",
      }
    );
  }

  const blockers:
    string[] =
    [];

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
    game.latestDesyncOccurred ===
      true
  ) {
    blockers.push(
      "confirmed_desync"
    );
  }

  if (
    game.linkedMarketCount >
      0
  ) {
    blockers.push(
      `linked_markets:${
        game.linkedMarketCount
      }`
    );
  }

  if (
    game.linkedClaimCount >
      0
  ) {
    blockers.push(
      `linked_claims:${
        game.linkedClaimCount
      }`
    );
  }

  if (
    game.acceptedAdjudicationCount >
      0
  ) {
    blockers.push(
      "accepted_result_adjudication"
    );
  }

  if (!run) {
    blockers.push(
      "exact_current_pass8_missing"
    );

    return emptyPlan(
      game,
      {
        status:
          "blocked",

        blockers,
      }
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
      HD_REPLAY_PARSER_CONTRACT
        .parserName ||
    run.parserVersion !==
      HD_REPLAY_PARSER_CONTRACT
        .parserVersion ||
    run.schemaVersion !==
      HD_REPLAY_PARSER_CONTRACT
        .schemaVersion ||
    run.passName !==
      HD_REPLAY_PARSER_CONTRACT
        .passName ||
    run.passVersion !==
      HD_REPLAY_PARSER_CONTRACT
        .passVersion
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
      "parse_run_authority_invalid"
    );
  }

  if (
    lower(
      run.inputHash
    ) !==
      lower(
        game.replayHash
      ) ||
    lower(
      run.artifact.sha256
    ) !==
      lower(
        game.replayHash
      )
  ) {
    blockers.push(
      "source_replay_hash_mismatch"
    );
  }

  if (
    !validSha256(
      run.runIdentityHash
    )
  ) {
    blockers.push(
      "run_identity_hash_invalid"
    );
  }

  if (
    !validSha256(
      run.parserConfigHash
    )
  ) {
    blockers.push(
      "parser_config_hash_invalid"
    );
  }

  if (
    !validSha256(
      run.candidateOutputHash
    )
  ) {
    blockers.push(
      "candidate_output_hash_invalid"
    );
  }

  if (
    run.observations.some(
      (
        observation
      ) =>
        observation.candidateOnly !==
          true ||
        observation
          .affectsPublicAggregates !==
          false
    )
  ) {
    blockers.push(
      "relevant_observation_authority_invalid"
    );
  }

  const projection =
    buildPublicReplayRosterV2Projection({
      currentPlayers:
        game.players,

      observations:
        run.observations,

      parseRunId:
        run.id,
    });

  if (
    !projection.ok
  ) {
    blockers.push(
      ...projection.blockers.map(
        (
          blocker
        ) =>
          `projection:${blocker}`
      )
    );
  }

  const beforeAuthority =
    resultAuthoritySnapshot(
      game
    );

  const projectedGame:
    TargetedReplayRosterGameSnapshot =
    {
      ...game,

      players:
        projection.ok
          ? projection
              .projectedPlayers
          : game.players,
    };

  const afterAuthority =
    resultAuthoritySnapshot(
      projectedGame
    );

  if (
    stableReplayRosterV2Hash(
      beforeAuthority
    ) !==
      stableReplayRosterV2Hash(
        afterAuthority
      )
  ) {
    blockers.push(
      "result_authority_changed"
    );
  }

  if (
    projection.ok &&
    projection
      .projectedPlayers
      .some(
        (
          player
        ) =>
          player.winner !==
            null
      )
  ) {
    blockers.push(
      "winner_flag_not_null"
    );
  }

  const teamObservation =
    projection.ok
      ? run.observations
          .find(
            (
              observation
            ) =>
              observation.id ===
              projection
                .teamObservationId
          ) ??
        null
      : null;

  if (
    projection.ok &&
    !teamObservation
  ) {
    blockers.push(
      "selected_team_observation_missing"
    );
  }

  const sourceObservationDigest =
    run.observations.map(
      (
        observation
      ) => ({
        id:
          observation.id,

        fieldPath:
          observation.fieldPath,

        observationKey:
          observation
            .observationKey ??
          null,

        observationKind:
          observation
            .observationKind ??
          null,

        valueHash:
          observation
            .valueHash ??
          null,

        confidenceBps:
          observation
            .confidenceBps,

        provenance:
          observation
            .provenance,

        candidateOnly:
          observation
            .candidateOnly,

        affectsPublicAggregates:
          observation
            .affectsPublicAggregates,
      })
    );

  const evidenceHash =
    stableReplayRosterV2Hash(
      sourceObservationDigest
    );

  const logicalIdentity =
    publicReplayIdentity(
      game as unknown as
        Record<string, unknown>
    );

  const authorityBoundary = {
    rosterOnly:
      true as const,

    affectsPublicAggregates:
      true as const,

    affectsResults:
      false as const,

    affectsBets:
      false as const,

    settlementAuthority:
      false as const,

    projectedWinnerFlags:
      "all_null" as const,
  };

  const decisionHash =
    (
      projection.ok &&
      teamObservation
    )
      ? stableReplayRosterV2Hash({
          policyVersion:
            PUBLIC_REPLAY_ROSTER_V2_POLICY,

          gameStatsId:
            game.id,

          logicalIdentity,

          parseRunId:
            run.id,

          observationId:
            teamObservation.id,

          replayHash:
            game.replayHash,

          inputHash:
            run.inputHash,

          artifactSha256:
            run.artifact.sha256,

          runIdentityHash:
            run.runIdentityHash,

          parserConfigHash:
            run.parserConfigHash,

          candidateOutputHash:
            run.candidateOutputHash,

          evidenceHash,

          previousPlayersHash:
            currentPlayersHash,

          projectedPlayersHash:
            projection
              .projectedPlayersHash,

          resultAuthorityBefore:
            beforeAuthority,

          resultAuthorityAfter:
            afterAuthority,

          authorityBoundary,
        })
      : null;

  const idempotencyKey =
    decisionHash
      ? [
          "public-roster-v2",
          game.id,
          decisionHash,
        ].join(
          ":"
        )
      : null;

  const uniqueBlockers =
    [
      ...new Set(
        blockers
      ),
    ];

  return {
    gameStatsId:
      game.id,

    status:
      uniqueBlockers.length ===
        0
        ? "eligible"
        : "blocked",

    eligible:
      uniqueBlockers.length ===
      0,

    alreadyApplied:
      false,

    blockers:
      uniqueBlockers,

    logicalIdentity,

    source: {
      parseRunId:
        run.id,

      artifactId:
        run.artifact.id,

      teamObservationId:
        projection
          .teamObservationId ??
        0,

      replayHash:
        game.replayHash,

      inputHash:
        run.inputHash,

      artifactSha256:
        run.artifact.sha256,

      runIdentityHash:
        run.runIdentityHash,

      parserConfigHash:
        run.parserConfigHash,

      candidateOutputHash:
        run.candidateOutputHash,

      evidenceHash,
    },

    before: {
      players:
        game.players,

      playersHash:
        currentPlayersHash,

      resultAuthority:
        beforeAuthority,
    },

    projection: {
      format:
        projection.format,

      playerCount:
        projection
          .projectedPlayers
          .length,

      projectedPlayers:
        projection
          .projectedPlayers,

      projectedPlayersHash:
        projection
          .projectedPlayersHash,

      resultAuthority:
        afterAuthority,
    },

    decisionHash,

    idempotencyKey,

    authorityBoundary,
  };
}


const TARGET_GAME_SELECT =
  {
    id:
      true,

    replayHash:
      true,

    replay_file:
      true,

    original_filename:
      true,

    parse_source:
      true,

    parse_reason:
      true,

    is_final:
      true,

    disconnect_detected:
      true,

    winner:
      true,

    players:
      true,

    key_events:
      true,

    event_types:
      true,

    replayResultAdjudications: {
      where: {
        decisionStatus:
          "accepted",
      },

      select: {
        id:
          true,
      },
    },

    replayDesyncIncidents: {
      orderBy: [
        {
          createdAt:
            "asc" as const,
        },
        {
          id:
            "asc" as const,
        },
      ],

      select: {
        id:
          true,

        desyncOccurred:
          true,

        createdAt:
          true,
      },
    },

    replayRosterPromotions: {
      orderBy: {
        id:
          "asc" as const,
      },

      select: {
        observationId:
          true,

        promotionKey:
          true,

        replayHash:
          true,

        projectedPlayersHash:
          true,
      },
    },
  } satisfies
    Prisma.GameStatsSelect;


type RecoveryDb =
  PrismaClient |
  Prisma.TransactionClient;


async function loadGameSnapshot(
  db:
    RecoveryDb,

  gameStatsId:
    number
): Promise<
  TargetedReplayRosterGameSnapshot |
  null
> {
  const game =
    await db
      .gameStats
      .findUnique({
        where: {
          id:
            gameStatsId,
        },

        select:
          TARGET_GAME_SELECT,
      });

  if (!game) {
    return null;
  }

  const latestDesync =
    game
      .replayDesyncIncidents
      .at(
        -1
      );

  const sessionKeys =
    [
      game.original_filename,
      game.replay_file,
    ]
      .map(
        (
          value
        ) =>
          value
            ?.trim() ??
          "",
      )
      .filter(
        Boolean,
      );

  const linkedMarkets =
    await db
      .betMarket
      .findMany({
        where: {
          OR: [
            {
              linkedGameStatsId:
                game.id,
            },
            ...(sessionKeys.length >
              0
              ? [
                  {
                    linkedSessionKey: {
                      in:
                        sessionKeys,
                    },
                  },
                ]
              : []),
          ],
        },

        select: {
          id:
            true,
        },
      });

  const linkedMarketIds =
    linkedMarkets.map(
      (
        market
      ) =>
        market.id
    );

  const linkedClaimCount =
    await db
      .pendingWoloClaim
      .count({
        where: {
          OR: [
            {
              sourceGameStatsId:
                game.id,
            },
            ...(linkedMarketIds.length >
              0
              ? [
                  {
                    sourceMarketId: {
                      in:
                        linkedMarketIds,
                    },
                  },
                ]
              : []),
          ],
        },
      });

  return {
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

    linkedMarketCount:
      linkedMarkets.length,

    linkedClaimCount,

    acceptedAdjudicationCount:
      game
        .replayResultAdjudications
        .length,

    latestDesyncOccurred:
      latestDesync
        ?.desyncOccurred ??
      null,

    existingPromotions:
      game
        .replayRosterPromotions,
  };
}


async function loadExactCurrentRun(
  db:
    RecoveryDb,

  game:
    TargetedReplayRosterGameSnapshot
): Promise<
  TargetedReplayRosterRunSnapshot |
  null
> {
  const runs =
    await db
      .replayParseRun
      .findMany({
        where: {
          gameStatsId:
            game.id,

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
        },

        orderBy: [
          {
            completedAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],

        select: {
          id:
            true,

          gameStatsId:
            true,

          inputHash:
            true,

          runIdentityHash:
            true,

          parserConfigHash:
            true,

          candidateOutputHash:
            true,

          parserName:
            true,

          parserVersion:
            true,

          schemaVersion:
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
              id:
                true,

              sha256:
                true,
            },
          },

          observations: {
            where: {
              fieldPath: {
                in:
                  [...ROSTER_OBSERVATION_PATHS],
              },
            },

            orderBy: {
              id:
                "asc",
            },

            select: {
              id:
                true,

              observationKey:
                true,

              observationKind:
                true,

              fieldPath:
                true,

              value:
                true,

              valueHash:
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
      });

  const exact =
    runs.find(
      (
        run
      ) =>
        lower(
          run.inputHash
        ) ===
          lower(
            game.replayHash
          ) &&
        lower(
          run.artifact.sha256
        ) ===
          lower(
            game.replayHash
          )
    );

  return exact
    ? exact as
        TargetedReplayRosterRunSnapshot
    : null;
}


export async function planTargetedReplayRosterRecovery(
  prisma:
    RecoveryDb,

  gameStatsId:
    number
): Promise<
  TargetedReplayRosterRecoveryPlan |
  null
> {
  const game =
    await loadGameSnapshot(
      prisma,
      gameStatsId
    );

  if (!game) {
    return null;
  }

  const run =
    await loadExactCurrentRun(
      prisma,
      game
    );

  return evaluateTargetedReplayRosterRecovery({
    game,
    run,
  });
}


export async function applyTargetedReplayRosterRecovery(
  prisma:
    PrismaClient,

  gameStatsId:
    number,

  actorUid:
    string
): Promise<
  TargetedReplayRosterRecoveryApplyResult
> {
  return prisma
    .$transaction(
      async (
        tx
      ) => {
        await tx
          .$queryRaw<
            Array<{
              lock_acquired:
                number;
            }>
          >`
            SELECT
              1::int AS lock_acquired
            FROM pg_advisory_xact_lock(
              ${gameStatsId}
            )
          `;

        const plan =
          await planTargetedReplayRosterRecovery(
            tx,
            gameStatsId
          );

        if (!plan) {
          return {
            gameStatsId,

            outcome:
              "blocked" as const,

            promotionId:
              null,

            plan: {
              gameStatsId,

              status:
                "blocked" as const,

              eligible:
                false,

              alreadyApplied:
                false,

              blockers: [
                "game_not_found",
              ],

              logicalIdentity:
                `row:${gameStatsId}`,

              source:
                null,

              before: {
                players:
                  null,

                playersHash:
                  stableReplayRosterV2Hash(
                    null
                  ),

                resultAuthority:
                  null,
              },

              projection: {
                format:
                  null,

                playerCount:
                  0,

                projectedPlayers:
                  [],

                projectedPlayersHash:
                  null,

                resultAuthority:
                  null,
              },

              decisionHash:
                null,

              idempotencyKey:
                null,

              authorityBoundary: {
                rosterOnly:
                  true,

                affectsPublicAggregates:
                  true,

                affectsResults:
                  false,

                affectsBets:
                  false,

                settlementAuthority:
                  false,

                projectedWinnerFlags:
                  "all_null",
              },
            },
          };
        }

        if (
          plan.status ===
            "already_applied" ||
          plan.status ===
            "not_required"
        ) {
          return {
            gameStatsId,

            outcome:
              plan.status,

            promotionId:
              null,

            plan,
          };
        }

        if (
          !plan.eligible ||
          !plan.source ||
          !plan.decisionHash ||
          !plan.idempotencyKey ||
          !plan.projection
            .projectedPlayersHash ||
          !plan.projection.format
        ) {
          return {
            gameStatsId,

            outcome:
              "blocked" as const,

            promotionId:
              null,

            plan,
          };
        }

        const actor =
          await tx
            .user
            .findFirst({
              where: {
                uid:
                  actorUid,

                isAdmin:
                  true,
              },

              select: {
                id:
                  true,
              },
            });

        if (!actor) {
          throw new Error(
            "TARGETED_ROSTER_RECOVERY_ADMIN_ACTOR_UNAVAILABLE"
          );
        }

        const promotion =
          await tx
            .replayRosterPromotion
            .create({
              data: {
                observationId:
                  plan.source
                    .teamObservationId,

                gameStatsId,

                promotedByUserId:
                  actor.id,

                idempotencyKey:
                  plan.idempotencyKey,

                promotionKey:
                  PUBLIC_REPLAY_ROSTER_V2_POLICY,

                decisionHash:
                  plan.decisionHash,

                policyVersion:
                  PUBLIC_REPLAY_ROSTER_V2_POLICY,

                replayHash:
                  plan.source
                    .replayHash,

                previousPlayersHash:
                  plan.before
                    .playersHash,

                projectedPlayersHash:
                  plan.projection
                    .projectedPlayersHash,

                format:
                  plan.projection
                    .format,

                playerCount:
                  plan.projection
                    .playerCount,

                previousPlayers:
                  plan.before
                    .players as
                    Prisma.InputJsonValue,

                projectedPlayers:
                  plan.projection
                    .projectedPlayers as
                    Prisma.InputJsonValue,

                reason:
                  "Targeted exact-current Pass-8 roster recovery; result authority unchanged.",

                affectsPublicAggregates:
                  true,

                affectsResults:
                  false,

                affectsBets:
                  false,

                settlementAuthority:
                  false,
              },

              select: {
                id:
                  true,
              },
            });

        await tx
          .gameStats
          .update({
            where: {
              id:
                gameStatsId,
            },

            data: {
              players:
                plan.projection
                  .projectedPlayers as
                  Prisma.InputJsonValue,
            },
          });

        const post =
          await planTargetedReplayRosterRecovery(
            tx,
            gameStatsId
          );

        if (
          !post ||
          post.status !==
            "already_applied"
        ) {
          throw new Error(
            "TARGETED_ROSTER_RECOVERY_POST_APPLY_VERIFY_FAILED"
          );
        }

        return {
          gameStatsId,

          outcome:
            "applied" as const,

          promotionId:
            promotion.id,

          plan:
            post,
        };
      },
      {
        maxWait:
          10_000,

        timeout:
          30_000,

        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      }
    );
}
