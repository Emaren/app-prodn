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


const MANIFEST_VERSION =
  "public_replay_roster_v2_manifest_v2";


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


const MANIFEST_PATH =
  argValue(
    "--manifest="
  ) ??
  process.env
    .ROSTER_V2_MANIFEST ??
  "/tmp/aoe2war-public-roster-v2-manifest.json";


const EXPECTED_MANIFEST_SHA =
  (
    argValue(
      "--manifest-sha256="
    ) ??
    process.env
      .ROSTER_V2_EXPECTED_MANIFEST_SHA256 ??
    ""
  )
    .trim()
    .toLowerCase();


const REPORT_PATH =
  argValue(
    "--report="
  ) ??
  process.env
    .ROSTER_V2_PROMOTION_REPORT ??
  "/tmp/aoe2war-public-roster-v2-promotion-dry-run.json";


if (
  process.argv.includes(
    "--apply"
  )
) {
  throw new Error(
    "GATE3_DRY_RUN_ONLY_APPLY_REFUSED"
  );
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
  if (
    incidents.length ===
      0
  ) {
    return null;
  }

  return incidents[
    incidents.length -
    1
  ];
}


async function transactionReadOnly(
  prisma:
    ReturnType<
      typeof getPrisma
    >
) {
  const rows =
    await prisma
      .$queryRawUnsafe<
        Array<{
          transaction_read_only:
            string;
        }>
      >(
        "SHOW transaction_read_only"
      );

  return lower(
    rows?.[0]
      ?.transaction_read_only
  );
}


async function main() {
  if (
    !validSha256(
      EXPECTED_MANIFEST_SHA
    )
  ) {
    throw new Error(
      "EXPECTED_MANIFEST_SHA256_REQUIRED"
    );
  }


  /*
   * ========================================================
   * EXACT MANIFEST BYTES
   * ========================================================
   */

  const rawManifestBytes =
    await readFile(
      MANIFEST_PATH,
      "utf8"
    );

  const actualManifestSha =
    sha256Bytes(
      rawManifestBytes
    );

  if (
    actualManifestSha !==
      EXPECTED_MANIFEST_SHA
  ) {
    throw new Error(
      `MANIFEST_SHA_MISMATCH:${actualManifestSha}`
    );
  }


  const manifest =
    JSON.parse(
      rawManifestBytes
    ) as Manifest;


  const canonicalBytes =
    canonicalReplayRosterV2ManifestBytes(
      manifest
    );

  if (
    canonicalBytes !==
      rawManifestBytes
  ) {
    throw new Error(
      "MANIFEST_BYTES_NOT_CANONICAL"
    );
  }


  if (
    manifest.manifestVersion !==
      MANIFEST_VERSION
  ) {
    throw new Error(
      `MANIFEST_VERSION_INVALID:${manifest.manifestVersion}`
    );
  }


  if (
    manifest.policyVersion !==
      PUBLIC_REPLAY_ROSTER_V2_POLICY
  ) {
    throw new Error(
      `POLICY_VERSION_INVALID:${manifest.policyVersion}`
    );
  }


  if (
    !sameStable(
      manifest.parserContract,
      HD_REPLAY_PARSER_CONTRACT
    )
  ) {
    throw new Error(
      "TOP_LEVEL_PARSER_CONTRACT_MISMATCH"
    );
  }


  const expectedAuthorityBoundary = {
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
      expectedAuthorityBoundary
    )
  ) {
    throw new Error(
      "TOP_LEVEL_AUTHORITY_BOUNDARY_INVALID"
    );
  }


  const entries =
    manifest.entries;


  if (
    manifest.entryCount !==
      entries.length ||
    entries.length ===
      0
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


  const parseRunIds =
    entries.map(
      (
        entry
      ) =>
        entry.source
          .parseRunId
    );


  if (
    ids.some(
      (
        id
      ) =>
        !Number
          .isSafeInteger(
            id
          ) ||
        id <= 0
    ) ||
    new Set(
      ids
    ).size !==
      ids.length
  ) {
    throw new Error(
      "MANIFEST_GAME_IDS_INVALID"
    );
  }


  if (
    parseRunIds.some(
      (
        id
      ) =>
        !Number
          .isSafeInteger(
            id
          ) ||
        id <= 0
    ) ||
    new Set(
      parseRunIds
    ).size !==
      parseRunIds.length
  ) {
    throw new Error(
      "MANIFEST_PARSE_RUN_IDS_INVALID"
    );
  }


  const sortedIds =
    ids
      .slice()
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  if (
    JSON.stringify(
      sortedIds
    ) !==
    JSON.stringify(
      ids
    )
  ) {
    throw new Error(
      "MANIFEST_GAME_IDS_NOT_SORTED"
    );
  }


  for (
    const entry of
    entries
  ) {
    const requiredHashes = [
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
      requiredHashes.some(
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


    if (
      stableReplayRosterV2Hash(
        entry.before
          .players
      ) !==
        lower(
          entry.before
            .playersHash
        )
    ) {
      throw new Error(
        `MANIFEST_BEFORE_PLAYERS_HASH_INVALID:${entry.gameStatsId}`
      );
    }


    if (
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
        `MANIFEST_PROJECTED_PLAYERS_HASH_INVALID:${entry.gameStatsId}`
      );
    }
  }


  const prisma =
    getPrisma();


  try {
    /*
     * ======================================================
     * DATABASE MUST ITSELF BE READ ONLY FOR GATE 3
     * ======================================================
     */

    const initialReadOnly =
      await transactionReadOnly(
        prisma
      );


    if (
      initialReadOnly !==
        "on"
    ) {
      throw new Error(
        "GATE3_REQUIRES_TRANSACTION_READ_ONLY_ON"
      );
    }


    /*
     * Keep database work sequential and bounded.
     * Only thirteen sealed IDs are queried.
     */

    const games =
      await prisma
        .gameStats
        .findMany({
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

                idempotencyKey:
                  true,

                promotionKey:
                  true,

                decisionHash:
                  true,

                policyVersion:
                  true,

                projectedPlayersHash:
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


    const runs =
      await prisma
        .replayParseRun
        .findMany({
          where: {
            id: {
              in:
                parseRunIds,
            },
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


    if (
      games.length !==
        entries.length
    ) {
      throw new Error(
        `GAME_ROW_COUNT_MISMATCH:${games.length}:${entries.length}`
      );
    }


    if (
      runs.length !==
        entries.length
    ) {
      throw new Error(
        `PARSE_RUN_COUNT_MISMATCH:${runs.length}:${entries.length}`
      );
    }


    const gameById =
      new Map(
        games.map(
          (
            game
          ) => [
            game.id,
            game,
          ]
        )
      );


    const runById =
      new Map(
        runs.map(
          (
            run
          ) => [
            run.id,
            run,
          ]
        )
      );


    const blockedRecords:
      Array<{
        gameStatsId:
          number;

        blockers:
          string[];
      }> =
      [];


    const plan:
      Array<{
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
      }> =
      [];


    /*
     * ======================================================
     * EXACT LIVE EVIDENCE REBUILD
     * ======================================================
     */

    for (
      const entry of
      entries
    ) {
      const blockers:
        string[] =
        [];


      const game =
        gameById.get(
          entry.gameStatsId
        );


      const run =
        runById.get(
          entry.source
            .parseRunId
        );


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
        blockedRecords.push({
          gameStatsId:
            entry.gameStatsId,

          blockers:
            [
              ...new Set(
                blockers
              ),
            ],
        });

        continue;
      }


      const currentPlayersHash =
        stableReplayRosterV2Hash(
          game.players
        );


      if (
        currentPlayersHash !==
          lower(
            entry.before
              .playersHash
          )
      ) {
        blockers.push(
          "current_players_drifted"
        );
      }


      if (
        !sameStable(
          game.players,
          entry.before
            .players
        )
      ) {
        blockers.push(
          "current_players_content_drifted"
        );
      }


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


      if (
        game
          .replayRosterPromotions
          .length >
        0
      ) {
        blockers.push(
          `existing_roster_promotion:${
            game
              .replayRosterPromotions
              .length
          }`
        );
      }


      const logicalIdentity =
        publicReplayIdentity(
          game
        );


      if (
        logicalIdentity !==
          entry.logicalIdentity
      ) {
        blockers.push(
          "logical_identity_drifted"
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


      const projection =
        buildPublicReplayRosterV2Projection({
          currentPlayers:
            game.players,

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


        const expectedEntryBoundary = {
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
            expectedEntryBoundary
          )
        ) {
          blockers.push(
            "entry_authority_boundary_invalid"
          );
        }


        if (
          blockers.length ===
            0
        ) {
          const decisionHash =
            stableReplayRosterV2Hash({
              manifestSha256:
                EXPECTED_MANIFEST_SHA,

              policyVersion:
                PUBLIC_REPLAY_ROSTER_V2_POLICY,

              gameStatsId:
                game.id,

              logicalIdentity,

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
                currentPlayersHash,

              projectedPlayersHash:
                projection
                  .projectedPlayersHash,

              resultAuthorityBefore:
                beforeAuthority,

              resultAuthorityAfter:
                afterAuthority,

              authorityBoundary:
                entry
                  .authorityBoundary,
            });


          const idempotencyKey =
            [
              "public-roster-v2",
              game.id,
              decisionHash,
            ].join(
              ":"
            );


          plan.push({
            gameStatsId:
              game.id,

            parseRunId:
              run.id,

            observationId:
              entry.source
                .teamObservationId,

            decisionHash,

            idempotencyKey,

            replayHash:
              game.replayHash,

            previousPlayersHash:
              currentPlayersHash,

            projectedPlayersHash:
              projection
                .projectedPlayersHash ??
              "",

            format:
              projection.format ??
              "",

            playerCount:
              projection
                .projectedPlayers
                .length,

            resultAuthorityBefore:
              beforeAuthority,

            resultAuthorityAfter:
              afterAuthority,
          });
        }
      }


      const uniqueBlockers =
        [
          ...new Set(
            blockers
          ),
        ];


      if (
        uniqueBlockers.length >
          0
      ) {
        blockedRecords.push({
          gameStatsId:
            game.id,

          blockers:
            uniqueBlockers,
        });
      }
    }


    const planHash =
      stableReplayRosterV2Hash(
        plan
      );


    const finalReadOnly =
      await transactionReadOnly(
        prisma
      );


    if (
      finalReadOnly !==
        "on"
    ) {
      throw new Error(
        "GATE3_READ_ONLY_FENCE_DROPPED"
      );
    }


    const report = {
      ok:
        blockedRecords.length ===
          0 &&
        plan.length ===
          entries.length,

      generatedAt:
        new Date()
          .toISOString(),

      mode:
        "dry_run",

      applyCapability:
        false,

      authority: {
        transactionReadOnly:
          "on",

        databaseWrites:
          0,

        gameStatsWrites:
          0,

        rosterPromotionWrites:
          0,
      },

      manifest: {
        path:
          MANIFEST_PATH,

        version:
          manifest
            .manifestVersion,

        sha256:
          actualManifestSha,

        entryCount:
          manifest
            .entryCount,
      },

      authorized: {
        count:
          plan.length,

        ids:
          plan.map(
            (
              item
            ) =>
              item.gameStatsId
          ),

        planHash,

        rows:
          plan,
      },

      blocked: {
        count:
          blockedRecords.length,

        records:
          blockedRecords,
      },
    };


    await writeFile(
      REPORT_PATH,
      `${JSON.stringify(
        report,
        null,
        2
      )}\n`,
      "utf8"
    );


    await chmod(
      REPORT_PATH,
      0o600
    );


    console.log(
      JSON.stringify(
        {
          mode:
            report.mode,

          applyCapability:
            report.applyCapability,

          authority:
            report.authority,

          manifest:
            report.manifest,

          authorized: {
            count:
              report
                .authorized
                .count,

            ids:
              report
                .authorized
                .ids,

            planHash:
              report
                .authorized
                .planHash,
          },

          blocked:
            report.blocked,
        },
        null,
        2
      )
    );


    if (
      blockedRecords.length >
        0
    ) {
      throw new Error(
        `GATE3_PREFLIGHT_BLOCKED:${blockedRecords.length}`
      );
    }


    if (
      plan.length !==
        entries.length
    ) {
      throw new Error(
        `GATE3_AUTHORIZED_COUNT_MISMATCH:${plan.length}:${entries.length}`
      );
    }
  } finally {
    await prisma
      .$disconnect();
  }
}


await main();
