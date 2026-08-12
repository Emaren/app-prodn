import {
  createHash,
} from "node:crypto";

import {
  chmod,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  getPrisma,
} from "../lib/prisma.ts";

import {
  cleanPublicGameRows,
  publicReplayIdentity,
  publicReplayWinnerTruth,
} from "../lib/publicReplayTruth.ts";

import {
  HD_REPLAY_PARSER_CONTRACT,
} from "../lib/replayEngineRoom.ts";

import {
  resolveReliableReplayWinner,
} from "../lib/unresolvedWatcherResult.ts";

import {
  PUBLIC_REPLAY_ROSTER_V2_POLICY,
  buildPublicReplayRosterV2Projection,
  canonicalReplayRosterV2ManifestBytes,
  stableReplayRosterV2Hash,
  type PublicReplayRosterV2Observation,
} from "../lib/publicReplayRosterV2.ts";


/*
 * ==========================================================
 * CAMPAIGN SEAL
 *
 * This writer is deliberately bound to one reviewed campaign.
 * A different manifest / plan requires a new source revision.
 * ==========================================================
 */

const MANIFEST_VERSION =
  "public_replay_roster_v2_manifest_v2";

const SEALED_GATE3_SOURCE_SHA =
  "3b5b57771b0e9e41c786f4d4ff0026ee2d4420b4";

const SEALED_MANIFEST_SHA =
  "f1c6ace1c2ec102f64a1cba9930ec1f2ac61cb643f218fe4930d6ecb34bf5c5e";

const SEALED_PLAN_SHA =
  "1adcf3390c638d767af499208eae43247bd48b9fd5683f75d7cdb03e920356bc";

const ADMIN_UID =
  "u_626ea6497a984dabbc2338ef54c5d333";

const APPLY_CONFIRMATION =
  "APPLY_PUBLIC_REPLAY_ROSTER_V2";


type Obj =
  Record<
    string,
    unknown
  >;


type ManifestEntry = {
  gameStatsId:
    number;

  logicalIdentity:
    string;

  source: {
    parseRunId:
      number;

    artifactId:
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

    parserContract:
      typeof HD_REPLAY_PARSER_CONTRACT;

    candidateOutputHash:
      string;

    teamObservationId:
      number;

    teamObservationValueHash:
      string;

    evidenceHash:
      string;
  };

  before: {
    playersHash:
      string;

    players:
      unknown;

    winner:
      unknown;

    parseReason:
      unknown;

    parseSource:
      unknown;

    resultAuthority:
      unknown;
  };

  projection: {
    format:
      string;

    playerCount:
      number;

    teamSizes:
      number[];

    provenance:
      string;

    confidenceBps:
      number;

    projectedPlayersHash:
      string;

    projectedPlayers:
      Obj[];

    resultAuthority:
      unknown;
  };

  authorityBoundary: {
    rosterOnly:
      boolean;

    winnerRemains:
      unknown;

    resultAdjudication:
      boolean;

    affectsPublicAggregates:
      boolean;

    affectsResults:
      boolean;

    affectsBets:
      boolean;

    settlementAuthority:
      boolean;

    allProjectedWinnerFlags:
      null;
  };
};


type Manifest = {
  manifestVersion:
    string;

  policyVersion:
    string;

  parserContract:
    typeof HD_REPLAY_PARSER_CONTRACT;

  authorityBoundary: {
    rosterOnly:
      boolean;

    affectsPublicAggregates:
      boolean;

    affectsResults:
      boolean;

    affectsBets:
      boolean;

    settlementAuthority:
      boolean;
  };

  entryCount:
    number;

  entries:
    ManifestEntry[];
};


type PlanRow = {
  gameStatsId:
    number;

  parseRunId:
    number;

  observationId:
    number;

  decisionHash:
    string;

  idempotencyKey:
    string;

  replayHash:
    string;

  previousPlayersHash:
    string;

  projectedPlayersHash:
    string;

  format:
    string;

  playerCount:
    number;

  resultAuthorityBefore:
    unknown;

  resultAuthorityAfter:
    unknown;
};


type RootPrisma =
  ReturnType<
    typeof getPrisma
  >;


type DbClient =
  Pick<
    RootPrisma,
    | "gameStats"
    | "replayParseRun"
    | "replayRosterPromotion"
    | "user"
    | "$queryRawUnsafe"
  >;


type ValidationResult = {
  gameStatsId:
    number;

  blockers:
    string[];

  alreadyApplied:
    boolean;

  planRow:
    PlanRow;
};


function argValue(
  prefix: string
) {
  const argument =
    process.argv.find(
      (value) =>
        value.startsWith(
          prefix
        )
    );

  return argument
    ?.slice(
      prefix.length
    ) ??
    null;
}


function obj(
  value: unknown
): Obj {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? value as Obj
    : {};
}


function text(
  value: unknown
) {
  if (
    typeof value ===
      "string"
  ) {
    return value.trim();
  }

  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return String(
      value
    );
  }

  if (
    typeof value ===
      "bigint"
  ) {
    return value.toString();
  }

  return "";
}


function lower(
  value: unknown
) {
  return text(
    value
  ).toLowerCase();
}


function sha256Bytes(
  value: string
) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


function validSha256(
  value: unknown
) {
  return /^[0-9a-f]{64}$/i
    .test(
      text(
        value
      )
    );
}


function sameStable(
  left: unknown,
  right: unknown
) {
  return (
    stableReplayRosterV2Hash(
      left
    ) ===
    stableReplayRosterV2Hash(
      right
    )
  );
}


function truthArray(
  value: unknown
) {
  return Array.isArray(
    value
  )
    ? value
        .map(
          text
        )
        .filter(
          Boolean
        )
        .sort()
    : [];
}


function resultAuthoritySnapshot(
  game:
    Record<
      string,
      unknown
    >
) {
  const truth =
    obj(
      publicReplayWinnerTruth(
        game
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
              name?: unknown;
              winner?: unknown;
            }>
          : null,

      parseReason:
        text(
          game.parse_reason
        ) ||
        null,

      parseSource:
        text(
          game.parse_source
        ) ||
        null,

      keyEvents:
        game.key_events,

      eventTypes:
        game.event_types,
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
        [
          game,
        ],
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
        [
          game,
        ],
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


function latestDesync(
  incidents:
    Array<{
      id:
        number;

      desyncOccurred:
        boolean;

      createdAt:
        Date;
    }>
) {
  return incidents.length
    ? incidents[
        incidents.length -
        1
      ]
    : null;
}


function sealedPlanRow(
  entry:
    ManifestEntry
): PlanRow {
  const decisionHash =
    stableReplayRosterV2Hash({
      manifestSha256:
        SEALED_MANIFEST_SHA,

      policyVersion:
        PUBLIC_REPLAY_ROSTER_V2_POLICY,

      gameStatsId:
        entry.gameStatsId,

      logicalIdentity:
        entry.logicalIdentity,

      parseRunId:
        entry.source
          .parseRunId,

      observationId:
        entry.source
          .teamObservationId,

      replayHash:
        entry.source
          .replayHash,

      inputHash:
        entry.source
          .inputHash,

      artifactSha256:
        entry.source
          .artifactSha256,

      runIdentityHash:
        entry.source
          .runIdentityHash,

      parserConfigHash:
        entry.source
          .parserConfigHash,

      candidateOutputHash:
        entry.source
          .candidateOutputHash,

      evidenceHash:
        entry.source
          .evidenceHash,

      previousPlayersHash:
        entry.before
          .playersHash,

      projectedPlayersHash:
        entry.projection
          .projectedPlayersHash,

      resultAuthorityBefore:
        entry.before
          .resultAuthority,

      resultAuthorityAfter:
        entry.projection
          .resultAuthority,

      authorityBoundary:
        entry.authorityBoundary,
    });


  return {
    gameStatsId:
      entry.gameStatsId,

    parseRunId:
      entry.source
        .parseRunId,

    observationId:
      entry.source
        .teamObservationId,

    decisionHash,

    idempotencyKey:
      [
        "public-roster-v2",
        entry.gameStatsId,
        decisionHash,
      ].join(
        ":"
      ),

    replayHash:
      entry.source
        .replayHash,

    previousPlayersHash:
      entry.before
        .playersHash,

    projectedPlayersHash:
      entry.projection
        .projectedPlayersHash,

    format:
      entry.projection
        .format,

    playerCount:
      entry.projection
        .playerCount,

    resultAuthorityBefore:
      entry.before
        .resultAuthority,

    resultAuthorityAfter:
      entry.projection
        .resultAuthority,
  };
}


async function validateEntry(
  client:
    DbClient,

  entry:
    ManifestEntry,

  planRow:
    PlanRow,

  lockGame:
    boolean
): Promise<
  ValidationResult
> {
  const blockers:
    string[] =
    [];


  if (lockGame) {
    const locked =
      await client
        .$queryRawUnsafe<
          Array<{
            id:
              number;
          }>
        >(
          `
            SELECT id
            FROM public.game_stats
            WHERE id = $1
            FOR UPDATE
          `,
          entry.gameStatsId
        );

    if (
      locked.length !==
        1
    ) {
      blockers.push(
        "game_lock_failed"
      );
    }
  }


  const game =
    await client
      .gameStats
      .findUnique({
        where: {
          id:
            entry.gameStatsId,
        },

        select: {
          id:
            true,

          replay_file:
            true,

          replayHash:
            true,

          original_filename:
            true,

          createdAt:
            true,

          timestamp:
            true,

          played_on:
            true,

          parse_iteration:
            true,

          winner:
            true,

          players:
            true,

          map:
            true,

          game_type:
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

          linkedBetMarkets: {
            select: {
              id:
                true,
            },
          },

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

          replayDesyncIncidents: {
            orderBy: [
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

              desyncOccurred:
                true,

              createdAt:
                true,
            },
          },

          replayRosterPromotions: {
            orderBy: {
              id:
                "asc",
            },

            select: {
              id:
                true,

              observationId:
                true,

              gameStatsId:
                true,

              promotedByUserId:
                true,

              idempotencyKey:
                true,

              promotionKey:
                true,

              decisionHash:
                true,

              policyVersion:
                true,

              replayHash:
                true,

              previousPlayersHash:
                true,

              projectedPlayersHash:
                true,

              format:
                true,

              playerCount:
                true,

              previousPlayers:
                true,

              projectedPlayers:
                true,

              affectsPublicAggregates:
                true,

              affectsResults:
                true,

              affectsBets:
                true,

              settlementAuthority:
                true,
            },
          },
        },
      });


  const run =
    await client
      .replayParseRun
      .findUnique({
        where: {
          id:
            entry.source
              .parseRunId,
        },

        select: {
          id:
            true,

          gameStatsId:
            true,

          artifactId:
            true,

          runIdentityHash:
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

          inputHash:
            true,

          parserConfigHash:
            true,

          status:
            true,

          candidateOutputHash:
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


  if (!game) {
    blockers.push(
      "game_missing"
    );
  }

  if (!run) {
    blockers.push(
      "parse_run_missing"
    );
  }


  if (
    !game ||
    !run
  ) {
    return {
      gameStatsId:
        entry.gameStatsId,

      blockers:
        [
          ...new Set(
            blockers
          ),
        ],

      alreadyApplied:
        false,

      planRow,
    };
  }


  /*
   * ========================================================
   * IDEMPOTENT LEDGER RECOGNITION
   * ========================================================
   */

  let alreadyApplied =
    false;


  if (
    game
      .replayRosterPromotions
      .length >
    0
  ) {
    if (
      game
        .replayRosterPromotions
        .length !==
      1
    ) {
      blockers.push(
        "unexpected_roster_promotion_count"
      );
    } else {
      const promotion =
        game
          .replayRosterPromotions[
            0
          ];


      const exactPromotion =
        promotion
          .observationId ===
            planRow
              .observationId &&
        promotion
          .gameStatsId ===
            entry
              .gameStatsId &&
        promotion
          .idempotencyKey ===
            planRow
              .idempotencyKey &&
        promotion
          .promotionKey ===
            PUBLIC_REPLAY_ROSTER_V2_POLICY &&
        promotion
          .decisionHash ===
            planRow
              .decisionHash &&
        promotion
          .policyVersion ===
            PUBLIC_REPLAY_ROSTER_V2_POLICY &&
        lower(
          promotion
            .replayHash
        ) ===
          lower(
            planRow
              .replayHash
          ) &&
        lower(
          promotion
            .previousPlayersHash
        ) ===
          lower(
            planRow
              .previousPlayersHash
          ) &&
        lower(
          promotion
            .projectedPlayersHash
        ) ===
          lower(
            planRow
              .projectedPlayersHash
          ) &&
        promotion
          .format ===
            planRow
              .format &&
        promotion
          .playerCount ===
            planRow
              .playerCount &&
        sameStable(
          promotion
            .previousPlayers,
          entry.before
            .players
        ) &&
        sameStable(
          promotion
            .projectedPlayers,
          entry.projection
            .projectedPlayers
        ) &&
        promotion
          .affectsPublicAggregates ===
            true &&
        promotion
          .affectsResults ===
            false &&
        promotion
          .affectsBets ===
            false &&
        promotion
          .settlementAuthority ===
            false;


      if (
        exactPromotion
      ) {
        alreadyApplied =
          true;
      } else {
        blockers.push(
          "existing_roster_promotion_contract_mismatch"
        );
      }
    }
  }


  const expectedCurrentPlayers =
    alreadyApplied
      ? entry.projection
          .projectedPlayers
      : entry.before
          .players;


  const expectedCurrentPlayersHash =
    alreadyApplied
      ? entry.projection
          .projectedPlayersHash
      : entry.before
          .playersHash;


  if (
    stableReplayRosterV2Hash(
      game.players
    ) !==
      lower(
        expectedCurrentPlayersHash
      )
  ) {
    blockers.push(
      alreadyApplied
        ? "applied_players_hash_mismatch"
        : "current_players_drifted"
    );
  }


  if (
    !sameStable(
      game.players,
      expectedCurrentPlayers
    )
  ) {
    blockers.push(
      alreadyApplied
        ? "applied_players_content_mismatch"
        : "current_players_content_drifted"
    );
  }


  /*
   * Only players are allowed to change in this campaign.
   */

  if (
    !sameStable(
      game.winner,
      entry.before
        .winner
    )
  ) {
    blockers.push(
      "stored_winner_drifted"
    );
  }


  if (
    !sameStable(
      game.parse_reason,
      entry.before
        .parseReason
    )
  ) {
    blockers.push(
      "parse_reason_drifted"
    );
  }


  if (
    !sameStable(
      game.parse_source,
      entry.before
        .parseSource
    )
  ) {
    blockers.push(
      "parse_source_drifted"
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
    publicReplayIdentity(
      game
    ) !==
      entry.logicalIdentity
  ) {
    blockers.push(
      "logical_identity_drifted"
    );
  }


  /*
   * Financial/result side-channel gates are mandatory before
   * a new promotion. An exact already-applied V2 row is merely
   * recognized and never written again.
   */

  if (
    !alreadyApplied
  ) {
    const desync =
      latestDesync(
        game
          .replayDesyncIncidents
      );


    if (
      desync
        ?.desyncOccurred ===
      true
    ) {
      blockers.push(
        "confirmed_desync"
      );
    }


    if (
      game
        .linkedBetMarkets
        .length >
      0
    ) {
      blockers.push(
        `linked_markets:${
          game
            .linkedBetMarkets
            .length
        }`
      );
    }


    if (
      game
        .replayResultAdjudications
        .length >
      0
    ) {
      blockers.push(
        "accepted_result_adjudication"
      );
    }
  }


  /*
   * ========================================================
   * EXACT PASS-8 SOURCE CONTRACT
   * ========================================================
   */

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
    !sameStable(
      entry.source
        .parserContract,
      HD_REPLAY_PARSER_CONTRACT
    )
  ) {
    blockers.push(
      "entry_parser_contract_mismatch"
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
    run.artifactId !==
      entry.source
        .artifactId ||
    run.artifact.id !==
      entry.source
        .artifactId
  ) {
    blockers.push(
      "artifact_id_mismatch"
    );
  }


  if (
    lower(
      game.replayHash
    ) !==
      lower(
        entry.source
          .replayHash
      ) ||
    lower(
      run.inputHash
    ) !==
      lower(
        entry.source
          .inputHash
      ) ||
    lower(
      run.inputHash
    ) !==
      lower(
        game.replayHash
      ) ||
    lower(
      run.artifact
        .sha256
    ) !==
      lower(
        entry.source
          .artifactSha256
      ) ||
    lower(
      run.artifact
        .sha256
    ) !==
      lower(
        game.replayHash
      )
  ) {
    blockers.push(
      "replay_hash_binding_mismatch"
    );
  }


  if (
    lower(
      run.runIdentityHash
    ) !==
      lower(
        entry.source
          .runIdentityHash
      ) ||
    lower(
      run.parserConfigHash
    ) !==
      lower(
        entry.source
          .parserConfigHash
      ) ||
    lower(
      run.candidateOutputHash
    ) !==
      lower(
        entry.source
          .candidateOutputHash
      )
  ) {
    blockers.push(
      "parse_run_hash_binding_mismatch"
    );
  }


  if (
    !validSha256(
      run.runIdentityHash
    ) ||
    !validSha256(
      run.parserConfigHash
    ) ||
    !validSha256(
      run.candidateOutputHash
    )
  ) {
    blockers.push(
      "parse_run_hash_invalid"
    );
  }


  if (
    run.observations.some(
      (
        observation
      ) =>
        observation
          .candidateOnly !==
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


  const observationDigest =
    run.observations
      .map(
        (
          observation
        ) => ({
          id:
            observation.id,

          observationKey:
            observation
              .observationKey,

          observationKind:
            observation
              .observationKind,

          fieldPath:
            observation
              .fieldPath,

          valueHash:
            observation
              .valueHash,

          confidenceBps:
            observation
              .confidenceBps,

          candidateOnly:
            observation
              .candidateOnly,

          affectsPublicAggregates:
            observation
              .affectsPublicAggregates,

          provenance:
            observation
              .provenance,

          value:
            observation
              .value,
        })
      );


  const evidenceHash =
    stableReplayRosterV2Hash(
      observationDigest
    );


  if (
    evidenceHash !==
      lower(
        entry.source
          .evidenceHash
      )
  ) {
    blockers.push(
      "evidence_hash_mismatch"
    );
  }


  /*
   * Reconstruct from the original sealed before-state.
   * This works both for pending rows and exact idempotent rows.
   */

  const projection =
    buildPublicReplayRosterV2Projection({
      currentPlayers:
        entry.before
          .players,

      observations:
        run.observations as
          PublicReplayRosterV2Observation[],

      parseRunId:
        run.id,
    });


  if (
    !projection.ok
  ) {
    blockers.push(
      ...projection
        .blockers
        .map(
          (
            blocker
          ) =>
            `projection:${blocker}`
        )
    );
  }


  if (
    projection.ok
  ) {
    if (
      projection
        .teamObservationId !==
        entry.source
          .teamObservationId
    ) {
      blockers.push(
        "team_observation_id_mismatch"
      );
    }


    const teamObservation =
      run.observations
        .find(
          (
            observation
          ) =>
            observation.id ===
              entry.source
                .teamObservationId
        ) ??
      null;


    if (!teamObservation) {
      blockers.push(
        "team_observation_missing"
      );
    } else if (
      lower(
        teamObservation
          .valueHash
      ) !==
        lower(
          entry.source
            .teamObservationValueHash
        )
    ) {
      blockers.push(
        "team_observation_value_hash_mismatch"
      );
    }


    if (
      projection.format !==
        entry.projection
          .format ||
      projection.provenance !==
        entry.projection
          .provenance ||
      projection.confidenceBps !==
        entry.projection
          .confidenceBps ||
      projection
        .projectedPlayers
        .length !==
        entry.projection
          .playerCount ||
      !sameStable(
        projection.teamSizes,
        entry.projection
          .teamSizes
      )
    ) {
      blockers.push(
        "projection_metadata_mismatch"
      );
    }


    if (
      projection
        .projectedPlayersHash !==
        lower(
          entry.projection
            .projectedPlayersHash
        ) ||
      !sameStable(
        projection
          .projectedPlayers,
        entry.projection
          .projectedPlayers
      )
    ) {
      blockers.push(
        "projected_players_mismatch"
      );
    }


    if (
      projection
        .projectedPlayers
        .some(
          (
            player
          ) =>
            player.winner !==
              null ||
            player.roster_source !==
              PUBLIC_REPLAY_ROSTER_V2_POLICY ||
            player.team_id_source !==
              PUBLIC_REPLAY_ROSTER_V2_POLICY ||
            player.roster_recovered !==
              true ||
            text(
              player.steam_id
            ) !==
              text(
                player.user_id
              )
        )
    ) {
      blockers.push(
        "projected_player_authority_marker_invalid"
      );
    }


    const beforeGame =
      {
        ...game,

        players:
          entry.before
            .players,
      } as unknown as
        Record<
          string,
          unknown
        >;


    const projectedGame =
      {
        ...game,

        players:
          projection
            .projectedPlayers,
      } as unknown as
        Record<
          string,
          unknown
        >;


    const beforeAuthority =
      resultAuthoritySnapshot(
        beforeGame
      );


    const afterAuthority =
      resultAuthoritySnapshot(
        projectedGame
      );


    if (
      !sameStable(
        beforeAuthority,
        entry.before
          .resultAuthority
      )
    ) {
      blockers.push(
        "before_result_authority_drifted"
      );
    }


    if (
      !sameStable(
        afterAuthority,
        entry.projection
          .resultAuthority
      )
    ) {
      blockers.push(
        "projected_result_authority_drifted"
      );
    }


    if (
      !sameStable(
        beforeAuthority,
        afterAuthority
      )
    ) {
      blockers.push(
        "result_authority_changed"
      );
    }


    const expectedBoundary = {
      rosterOnly:
        true,

      winnerRemains:
        game.winner,

      resultAdjudication:
        false,

      affectsPublicAggregates:
        true,

      affectsResults:
        false,

      affectsBets:
        false,

      settlementAuthority:
        false,

      allProjectedWinnerFlags:
        null,
    };


    if (
      !sameStable(
        entry.authorityBoundary,
        expectedBoundary
      )
    ) {
      blockers.push(
        "entry_authority_boundary_invalid"
      );
    }


    const liveDecisionHash =
      stableReplayRosterV2Hash({
        manifestSha256:
          SEALED_MANIFEST_SHA,

        policyVersion:
          PUBLIC_REPLAY_ROSTER_V2_POLICY,

        gameStatsId:
          game.id,

        logicalIdentity:
          publicReplayIdentity(
            game
          ),

        parseRunId:
          run.id,

        observationId:
          entry.source
            .teamObservationId,

        replayHash:
          game.replayHash,

        inputHash:
          run.inputHash,

        artifactSha256:
          run.artifact
            .sha256,

        runIdentityHash:
          run.runIdentityHash,

        parserConfigHash:
          run.parserConfigHash,

        candidateOutputHash:
          run.candidateOutputHash,

        evidenceHash,

        previousPlayersHash:
          entry.before
            .playersHash,

        projectedPlayersHash:
          projection
            .projectedPlayersHash,

        resultAuthorityBefore:
          beforeAuthority,

        resultAuthorityAfter:
          afterAuthority,

        authorityBoundary:
          entry.authorityBoundary,
      });


    if (
      liveDecisionHash !==
        planRow
          .decisionHash
    ) {
      blockers.push(
        "decision_hash_mismatch"
      );
    }
  }


  return {
    gameStatsId:
      entry.gameStatsId,

    blockers:
      [
        ...new Set(
          blockers
        ),
      ],

    alreadyApplied,

    planRow,
  };
}


async function main() {
  const APPLY =
    process.argv.includes(
      "--apply"
    );


  const manifestPath =
    argValue(
      "--manifest="
    ) ??
    process.env
      .ROSTER_V2_MANIFEST ??
    "";


  const expectedManifestSha =
    lower(
      argValue(
        "--manifest-sha256="
      ) ??
      process.env
        .ROSTER_V2_EXPECTED_MANIFEST_SHA256
    );


  const expectedPlanSha =
    lower(
      argValue(
        "--plan-sha256="
      ) ??
      process.env
        .ROSTER_V2_EXPECTED_PLAN_SHA256
    );


  const expectedGate3SourceSha =
    lower(
      argValue(
        "--gate3-source-sha="
      ) ??
      process.env
        .ROSTER_V2_GATE3_SOURCE_SHA
    );


  const confirmation =
    text(
      argValue(
        "--confirm="
      )
    );


  const applyGameRaw =
    argValue(
      "--apply-game="
    );


  const applyGame =
    applyGameRaw
      ? Number(
          applyGameRaw
        )
      : null;


  const reportPath =
    argValue(
      "--report="
    ) ??
    process.env
      .ROSTER_V2_APPLY_REPORT ??
    "/tmp/aoe2war-public-roster-v2-apply-report.json";


  /*
   * These checks occur before Prisma is instantiated.
   */

  if (!manifestPath) {
    throw new Error(
      "MANIFEST_PATH_REQUIRED"
    );
  }


  if (
    expectedManifestSha !==
      SEALED_MANIFEST_SHA
  ) {
    throw new Error(
      "MANIFEST_SHA_BINDING_INVALID"
    );
  }


  if (
    expectedPlanSha !==
      SEALED_PLAN_SHA
  ) {
    throw new Error(
      "PLAN_SHA_BINDING_INVALID"
    );
  }


  if (
    expectedGate3SourceSha !==
      SEALED_GATE3_SOURCE_SHA
  ) {
    throw new Error(
      "GATE3_SOURCE_SHA_BINDING_INVALID"
    );
  }


  if (
    APPLY &&
    confirmation !==
      APPLY_CONFIRMATION
  ) {
    throw new Error(
      "EXPLICIT_APPLY_CONFIRMATION_REQUIRED"
    );
  }


  if (
    !APPLY &&
    applyGame !==
      null
  ) {
    throw new Error(
      "APPLY_GAME_REQUIRES_APPLY_MODE"
    );
  }


  if (
    applyGame !==
      null &&
    (
      !Number.isSafeInteger(
        applyGame
      ) ||
      applyGame <=
        0
    )
  ) {
    throw new Error(
      "APPLY_GAME_INVALID"
    );
  }


  /*
   * ========================================================
   * SEALED MANIFEST + SEALED PLAN
   * ========================================================
   */

  const rawManifestBytes =
    await readFile(
      manifestPath,
      "utf8"
    );


  const actualManifestSha =
    sha256Bytes(
      rawManifestBytes
    );


  if (
    actualManifestSha !==
      SEALED_MANIFEST_SHA
  ) {
    throw new Error(
      `MANIFEST_BYTES_SHA_MISMATCH:${actualManifestSha}`
    );
  }


  const manifest =
    JSON.parse(
      rawManifestBytes
    ) as Manifest;


  if (
    canonicalReplayRosterV2ManifestBytes(
      manifest
    ) !==
      rawManifestBytes
  ) {
    throw new Error(
      "MANIFEST_BYTES_NOT_CANONICAL"
    );
  }


  if (
    manifest.manifestVersion !==
      MANIFEST_VERSION ||
    manifest.policyVersion !==
      PUBLIC_REPLAY_ROSTER_V2_POLICY
  ) {
    throw new Error(
      "MANIFEST_IDENTITY_INVALID"
    );
  }


  if (
    !sameStable(
      manifest.parserContract,
      HD_REPLAY_PARSER_CONTRACT
    )
  ) {
    throw new Error(
      "MANIFEST_PARSER_CONTRACT_INVALID"
    );
  }


  const expectedTopBoundary = {
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
  };


  if (
    !sameStable(
      manifest.authorityBoundary,
      expectedTopBoundary
    )
  ) {
    throw new Error(
      "MANIFEST_AUTHORITY_BOUNDARY_INVALID"
    );
  }


  const entries =
    manifest.entries;


  if (
    manifest.entryCount !==
      entries.length ||
    entries.length !==
      13
  ) {
    throw new Error(
      `MANIFEST_ENTRY_COUNT_INVALID:${manifest.entryCount}:${entries.length}`
    );
  }


  const ids =
    entries.map(
      (
        entry
      ) =>
        entry.gameStatsId
    );


  const expectedIds = [
    11619,
    11679,
    11793,
    11794,
    11991,
    12097,
    12163,
    12282,
    12421,
    12638,
    12682,
    12713,
    13112,
  ];


  if (
    !sameStable(
      ids,
      expectedIds
    )
  ) {
    throw new Error(
      "CAMPAIGN_GAME_IDS_INVALID"
    );
  }


  if (
    applyGame !==
      null &&
    !ids.includes(
      applyGame
    )
  ) {
    throw new Error(
      `APPLY_GAME_NOT_IN_CAMPAIGN:${applyGame}`
    );
  }


  for (
    const entry of
    entries
  ) {
    if (
      stableReplayRosterV2Hash(
        entry.before
          .players
      ) !==
        lower(
          entry.before
            .playersHash
        ) ||
      stableReplayRosterV2Hash(
        entry.projection
          .projectedPlayers
      ) !==
        lower(
          entry.projection
            .projectedPlayersHash
        )
    ) {
      throw new Error(
        `MANIFEST_PLAYER_HASH_INVALID:${entry.gameStatsId}`
      );
    }


    const hashes = [
      entry.source
        .replayHash,

      entry.source
        .inputHash,

      entry.source
        .artifactSha256,

      entry.source
        .runIdentityHash,

      entry.source
        .parserConfigHash,

      entry.source
        .candidateOutputHash,

      entry.source
        .teamObservationValueHash,

      entry.source
        .evidenceHash,

      entry.before
        .playersHash,

      entry.projection
        .projectedPlayersHash,
    ];


    if (
      hashes.some(
        (
          value
        ) =>
          !validSha256(
            value
          )
      )
    ) {
      throw new Error(
        `MANIFEST_HASH_INVALID:${entry.gameStatsId}`
      );
    }
  }


  const sealedPlan =
    entries.map(
      sealedPlanRow
    );


  const sealedPlanHash =
    stableReplayRosterV2Hash(
      sealedPlan
    );


  if (
    sealedPlanHash !==
      SEALED_PLAN_SHA
  ) {
    throw new Error(
      `SEALED_PLAN_RECONSTRUCTION_MISMATCH:${sealedPlanHash}`
    );
  }


  const planByGame =
    new Map(
      sealedPlan.map(
        (
          row
        ) => [
          row.gameStatsId,
          row,
        ]
      )
    );


  /*
   * ========================================================
   * PRE-APPLY LIVE VALIDATION
   *
   * Always runs first, even in apply mode.
   * No writes occur in this phase.
   * ========================================================
   */

  const prisma =
    getPrisma();


  const validationResults:
    ValidationResult[] =
    [];


  const appliedIds:
    number[] =
    [];


  const alreadyAppliedIds:
    number[] =
    [];


  try {
    for (
      const entry of
      entries
    ) {
      const planRow =
        planByGame.get(
          entry.gameStatsId
        );


      if (!planRow) {
        throw new Error(
          `PLAN_ROW_MISSING:${entry.gameStatsId}`
        );
      }


      const result =
        await prisma
          .$transaction(
            async (
              tx
            ) =>
              validateEntry(
                tx,
                entry,
                planRow,
                false
              ),
            {
              maxWait:
                10_000,

              timeout:
                30_000,

              isolationLevel:
                "Serializable",
            }
          );


      validationResults.push(
        result
      );
    }


    const blocked =
      validationResults
        .filter(
          (
            result
          ) =>
            result.blockers
              .length >
            0
        );


    if (
      blocked.length >
      0
    ) {
      console.log(
        JSON.stringify(
          {
            phase:
              "pre_apply_validation",

            blocked,
          },
          null,
          2
        )
      );

      throw new Error(
        `PRE_APPLY_VALIDATION_BLOCKED:${blocked.length}`
      );
    }


    const livePlan =
      validationResults
        .map(
          (
            result
          ) =>
            result.planRow
        );


    const livePlanHash =
      stableReplayRosterV2Hash(
        livePlan
      );


    if (
      livePlanHash !==
        SEALED_PLAN_SHA
    ) {
      throw new Error(
        `LIVE_PLAN_HASH_MISMATCH:${livePlanHash}`
      );
    }


    /*
     * ======================================================
     * APPLY PHASE
     *
     * Sequential, concurrency 1.
     * Each row gets its own short SERIALIZABLE transaction.
     * Each transaction revalidates everything before writing.
     * ======================================================
     */

    if (APPLY) {
      const targets =
        applyGame ===
          null
          ? entries
          : entries.filter(
              (
                entry
              ) =>
                entry.gameStatsId ===
                  applyGame
            );


      for (
        const entry of
        targets
      ) {
        const planRow =
          planByGame.get(
            entry.gameStatsId
          );


        if (!planRow) {
          throw new Error(
            `PLAN_ROW_MISSING_DURING_APPLY:${entry.gameStatsId}`
          );
        }


        const outcome =
          await prisma
            .$transaction(
              async (
                tx
              ) => {
                /*
                 * Lock GameStats first, then rebuild the complete
                 * source/result/financial contract inside the
                 * same SERIALIZABLE transaction.
                 */
                const validation =
                  await validateEntry(
                    tx,
                    entry,
                    planRow,
                    true
                  );


                if (
                  validation
                    .blockers
                    .length >
                  0
                ) {
                  throw new Error(
                    `ROW_REVALIDATION_BLOCKED:${entry.gameStatsId}:${validation.blockers.join("|")}`
                  );
                }


                if (
                  validation
                    .alreadyApplied
                ) {
                  return {
                    status:
                      "already_applied" as const,
                  };
                }


                const actor =
                  await tx
                    .user
                    .findFirst({
                      where: {
                        uid:
                          ADMIN_UID,

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
                    "ADMIN_ACTOR_UNAVAILABLE"
                  );
                }


                /*
                 * THE ONLY TWO DATABASE MUTATIONS PERMITTED.
                 */

                await tx.replayRosterPromotion.create({
                  data: {
                    observationId:
                      planRow
                        .observationId,

                    gameStatsId:
                      entry
                        .gameStatsId,

                    promotedByUserId:
                      actor.id,

                    idempotencyKey:
                      planRow
                        .idempotencyKey,

                    promotionKey:
                      PUBLIC_REPLAY_ROSTER_V2_POLICY,

                    decisionHash:
                      planRow
                        .decisionHash,

                    policyVersion:
                      PUBLIC_REPLAY_ROSTER_V2_POLICY,

                    replayHash:
                      planRow
                        .replayHash,

                    previousPlayersHash:
                      planRow
                        .previousPlayersHash,

                    projectedPlayersHash:
                      planRow
                        .projectedPlayersHash,

                    format:
                      planRow
                        .format,

                    playerCount:
                      planRow
                        .playerCount,

                    previousPlayers:
                      entry.before
                        .players as never,

                    projectedPlayers:
                      entry.projection
                        .projectedPlayers as never,

                    reason:
                      "Promote exact balanced Pass-8 replay roster into public GameStats.players. Existing result authority is preserved exactly. No betting or settlement authority.",

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


                await tx.gameStats.update({
                  where: {
                    id:
                      entry
                        .gameStatsId,
                  },

                  data: {
                    players:
                      entry.projection
                        .projectedPlayers as never,
                  },
                });


                return {
                  status:
                    "applied" as const,
                };
              },
              {
                maxWait:
                  10_000,

                timeout:
                  30_000,

                isolationLevel:
                  "Serializable",
              }
            );


        if (
          outcome.status ===
            "already_applied"
        ) {
          alreadyAppliedIds.push(
            entry.gameStatsId
          );
        } else {
          appliedIds.push(
            entry.gameStatsId
          );
        }


        /*
         * Immediate post-commit verification before proceeding
         * to another row.
         */

        const post =
          await prisma
            .$transaction(
              async (
                tx
              ) =>
                validateEntry(
                  tx,
                  entry,
                  planRow,
                  false
                ),
              {
                maxWait:
                  10_000,

                timeout:
                  30_000,

                isolationLevel:
                  "Serializable",
              }
            );


        if (
          post.blockers
            .length >
            0 ||
          !post.alreadyApplied
        ) {
          throw new Error(
            `POST_APPLY_VERIFY_FAILED:${entry.gameStatsId}:${post.blockers.join("|")}`
          );
        }
      }
    }


    /*
     * ======================================================
     * REPORT
     * ======================================================
     */

    const preflightAlreadyApplied =
      validationResults
        .filter(
          (
            result
          ) =>
            result
              .alreadyApplied
        )
        .map(
          (
            result
          ) =>
            result
              .gameStatsId
        );


    const report = {
      ok:
        true,

      generatedAt:
        new Date()
          .toISOString(),

      mode:
        APPLY
          ? "apply"
          : "dry_run",

      campaign: {
        gate3SourceSha:
          SEALED_GATE3_SOURCE_SHA,

        manifestSha256:
          SEALED_MANIFEST_SHA,

        planSha256:
          SEALED_PLAN_SHA,

        policyVersion:
          PUBLIC_REPLAY_ROSTER_V2_POLICY,

        entryCount:
          entries.length,
      },

      preflight: {
        authorized:
          validationResults
            .length,

        blocked:
          0,

        alreadyApplied:
          preflightAlreadyApplied,

        planHash:
          livePlanHash,
      },

      apply: {
        requested:
          APPLY,

        applyGame,

        appliedIds,

        alreadyAppliedIds,

        databaseMutations:
          appliedIds.length *
          2,
      },
    };


    await writeFile(
      reportPath,
      `${JSON.stringify(
        report,
        null,
        2
      )}\n`,
      "utf8"
    );


    await chmod(
      reportPath,
      0o600
    );


    console.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );
  } finally {
    await prisma
      .$disconnect();
  }
}


await main();
