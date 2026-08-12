import {
  createHash,
} from "node:crypto";

import {
  chmod,
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
  publicReplayRosterV2DisplayState,
  stableReplayRosterV2Hash,
  type PublicReplayRosterV2Observation,
} from "../lib/publicReplayRosterV2.ts";


const MANIFEST_VERSION =
  "public_replay_roster_v2_manifest_v1";

const MANIFEST_PATH =
  process.env.ROSTER_V2_MANIFEST ??
  "/tmp/aoe2war-public-roster-v2-manifest.json";

const REPORT_PATH =
  process.env.ROSTER_V2_FORGE_REPORT ??
  "/tmp/aoe2war-public-roster-v2-forge-report.json";


type Obj =
  Record<string, unknown>;


function obj(
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

  if (
    typeof value === "bigint"
  ) {
    return value.toString();
  }

  return "";
}


function lower(
  value: unknown
) {
  return text(value)
    .toLowerCase();
}


function unknownWinner(
  value: unknown
) {
  const normalized =
    lower(value);

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
  return /^[0-9a-f]{64}$/i.test(
    text(value)
  );
}


function bump(
  target:
    Record<string, number>,

  key:
    string
) {
  target[key] =
    (target[key] ?? 0) + 1;
}


function addSample(
  target:
    Record<
      string,
      number[]
    >,

  key:
    string,

  id:
    number,

  limit =
    12
) {
  const bucket =
    target[key] ??
    [];

  if (
    bucket.length <
    limit
  ) {
    bucket.push(
      id
    );
  }

  target[key] =
    bucket;
}


function truthArray(
  value: unknown
) {
  return Array.isArray(value)
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
        game.players,

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
        [game],
        {
          includeReview:
            false,

          includeLive:
            false,
        }
      ).length === 1,

    reviewVisible:
      cleanPublicGameRows(
        [game],
        {
          includeReview:
            true,

          includeLive:
            false,
        }
      ).length === 1,
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


const prisma =
  getPrisma();


try {
  /*
   * ========================================================
   * DATABASE-LEVEL READ-ONLY FENCE
   * ========================================================
   */

  const initialReadOnly =
    await prisma
      .$queryRawUnsafe<
        Array<{
          transaction_read_only:
            string;
        }>
      >(
        "SHOW transaction_read_only"
      );


  if (
    lower(
      initialReadOnly?.[0]
        ?.transaction_read_only
    ) !== "on"
  ) {
    throw new Error(
      "READ_ONLY_FENCE_FAILED"
    );
  }


  /*
   * ========================================================
   * FINAL STORED GAME CORPUS
   * ========================================================
   */

  const rawGames =
    await prisma
      .gameStats
      .findMany({
        where: {
          is_final:
            true,
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

              policyVersion:
                true,

              promotionKey:
                true,

              projectedPlayersHash:
                true,
            },
          },
        },
      });


  /*
   * Logical dedupe is for cohort selection only.
   *
   * Before-state hashes always come from the selected STORED
   * GameStats row, not from the cleaned public projection.
   */
  const logicalRows =
    cleanPublicGameRows(
      rawGames,
      {
        includeReview:
          true,

        includeLive:
          false,
      }
    );


  const logicalIds =
    new Set(
      logicalRows
        .map(
          (
            row
          ) =>
            Number(
              row.id
            )
        )
        .filter(
          (
            id
          ) =>
            Number.isSafeInteger(
              id
            ) &&
            id > 0
        )
    );


  const incompleteGames =
    rawGames
      .filter(
        (
          game
        ) =>
          logicalIds.has(
            game.id
          )
      )
      .filter(
        (
          game
        ) =>
          !publicReplayRosterV2DisplayState(
            game.players
          ).complete
      );


  const incompleteIds =
    incompleteGames.map(
      (
        game
      ) =>
        game.id
    );


  /*
   * ========================================================
   * EXACT CURRENT PASS-8 CANDIDATES FOR ONLY THE INCOMPLETE
   * LOGICAL ROWS
   * ========================================================
   */

  const runs =
    incompleteIds.length ===
      0
      ? []
      : await prisma
          .replayParseRun
          .findMany({
            where: {
              gameStatsId: {
                in:
                  incompleteIds,
              },

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

              completedAt:
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


  const runsByGame =
    new Map<
      number,
      typeof runs
    >();


  for (
    const run of
    runs
  ) {
    if (
      typeof run.gameStatsId !==
      "number"
    ) {
      continue;
    }

    const bucket =
      runsByGame.get(
        run.gameStatsId
      ) ??
      [];

    bucket.push(
      run
    );

    runsByGame.set(
      run.gameStatsId,
      bucket
    );
  }


  const blockerCounts:
    Record<
      string,
      number
    > =
      {};


  const blockerSamples:
    Record<
      string,
      number[]
    > =
      {};


  const eligibleByFormat:
    Record<
      string,
      number
    > =
      {};


  const eligibleByProvenance:
    Record<
      string,
      number
    > =
      {};


  const blockedRecords:
    Array<{
      gameStatsId:
        number;

      blockers:
        string[];
    }> =
      [];


  const entries:
    Array<
      Record<
        string,
        unknown
      >
    > =
      [];


  /*
   * ========================================================
   * FAIL-CLOSED COHORT FORGE
   * ========================================================
   */

  for (
    const game of
    incompleteGames
  ) {
    const blockers:
      string[] =
      [];


    const matchingRuns =
      (
        runsByGame.get(
          game.id
        ) ??
        []
      )
        .filter(
          (
            run
          ) =>
            lower(
              run.inputHash
            ) ===
              lower(
                game.replayHash
              )
        );


    const run =
      matchingRuns[0] ??
      null;


    if (!run) {
      blockers.push(
        "exact_current_pass8_missing"
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
        "existing_roster_promotion"
      );
    }


    if (
      !unknownWinner(
        game.winner
      )
    ) {
      blockers.push(
        `stored_winner_not_unknown:${
          text(
            game.winner
          )
        }`
      );
    }


    if (run) {
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
          run.artifact.sha256
        ) !==
          lower(
            game.replayHash
          ) ||
        lower(
          run.inputHash
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


      /*
       * A V2 roster promotion is not allowed to create result
       * authority as a side effect.
       */
      const beforeGame =
        {
          ...game,
        } as Record<
          string,
          unknown
        >;


      const beforeAuthority =
        resultAuthoritySnapshot(
          beforeGame
        );


      if (
        beforeAuthority
          .winner ||
        beforeAuthority
          .candidateWinner ||
        beforeAuthority
          .reliableWinner ||
        beforeAuthority
          .statsEligible ||
        beforeAuthority
          .bettingEligible ||
        beforeAuthority
          .resolvedVisible ||
        !beforeAuthority
          .reviewVisible
      ) {
        blockers.push(
          "before_result_authority_not_clean"
        );
      }


      if (
        projection.ok
      ) {
        const projectedGame =
          {
            ...game,

            players:
              projection
                .projectedPlayers,
          } as Record<
            string,
            unknown
          >;


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
          afterAuthority
            .winner ||
          afterAuthority
            .candidateWinner ||
          afterAuthority
            .reliableWinner ||
          afterAuthority
            .statsEligible ||
          afterAuthority
            .bettingEligible ||
          afterAuthority
            .resolvedVisible ||
          !afterAuthority
            .reviewVisible
        ) {
          blockers.push(
            "projected_result_authority_not_clean"
          );
        }


        if (
          blockers.length ===
          0
        ) {
          const teamObservation =
            run.observations
              .find(
                (
                  observation
                ) =>
                  observation.id ===
                  projection
                    .teamObservationId
              ) ??
            null;


          if (
            !teamObservation
          ) {
            blockers.push(
              "selected_team_observation_missing"
            );
          } else {
            const sourceObservationDigest =
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


            const previousPlayersHash =
              stableReplayRosterV2Hash(
                game.players
              );


            const evidenceHash =
              stableReplayRosterV2Hash(
                sourceObservationDigest
              );


            entries.push({
              gameStatsId:
                game.id,

              logicalIdentity:
                publicReplayIdentity(
                  game
                ),

              source: {
                parseRunId:
                  run.id,

                artifactId:
                  run.artifact.id,

                replayHash:
                  game.replayHash,

                artifactSha256:
                  run.artifact.sha256,

                runIdentityHash:
                  run.runIdentityHash,

                parserConfigHash:
                  run.parserConfigHash,

                candidateOutputHash:
                  run.candidateOutputHash,

                teamObservationId:
                  teamObservation.id,

                teamObservationValueHash:
                  teamObservation
                    .valueHash,

                evidenceHash,
              },

              before: {
                playersHash:
                  previousPlayersHash,

                players:
                  game.players,

                winner:
                  game.winner,

                parseReason:
                  game.parse_reason,

                parseSource:
                  game.parse_source,

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

                teamSizes:
                  projection
                    .teamSizes,

                provenance:
                  projection.provenance,

                confidenceBps:
                  projection
                    .confidenceBps,

                projectedPlayersHash:
                  projection
                    .projectedPlayersHash,

                projectedPlayers:
                  projection
                    .projectedPlayers,

                resultAuthority:
                  afterAuthority,
              },

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

                allProjectedWinnerFlags:
                  null,
              },
            });
          }
        }
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


      for (
        const blocker of
        uniqueBlockers
      ) {
        bump(
          blockerCounts,
          blocker
        );

        addSample(
          blockerSamples,
          blocker,
          game.id
        );
      }
    }
  }


  /*
   * A blocker can be discovered after an entry was tentatively
   * pushed. Retain only rows that have no blocked record.
   */
  const blockedIds =
    new Set(
      blockedRecords.map(
        (
          record
        ) =>
          record.gameStatsId
      )
    );


  const safeEntries =
    entries
      .filter(
        (
          entry
        ) =>
          !blockedIds.has(
            Number(
              entry.gameStatsId
            )
          )
      )
      .sort(
        (
          left,
          right
        ) =>
          Number(
            left.gameStatsId
          ) -
          Number(
            right.gameStatsId
          )
      );


  for (
    const entry of
    safeEntries
  ) {
    const projection =
      obj(
        entry.projection
      );

    bump(
      eligibleByFormat,
      text(
        projection.format
      ) ||
        "unknown"
    );

    bump(
      eligibleByProvenance,
      text(
        projection.provenance
      ) ||
        "unknown"
    );
  }


  /*
   * ========================================================
   * DETERMINISTIC MANIFEST
   *
   * No wall-clock timestamp is included in the sealed bytes.
   * Re-running against unchanged source state must reproduce
   * byte-for-byte identical output.
   * ========================================================
   */

  const manifest = {
    manifestVersion:
      MANIFEST_VERSION,

    policyVersion:
      PUBLIC_REPLAY_ROSTER_V2_POLICY,

    parserContract:
      HD_REPLAY_PARSER_CONTRACT,

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
    },

    entryCount:
      safeEntries.length,

    entries:
      safeEntries,
  };


  const manifestBytes =
    canonicalReplayRosterV2ManifestBytes(
      manifest
    );


  const manifestSha256 =
    sha256Bytes(
      manifestBytes
    );


  const report = {
    ok:
      true,

    generatedAt:
      new Date()
        .toISOString(),

    authority: {
      transactionReadOnly:
        "on",

      databaseWrites:
        0,

      parserRunsCreated:
        0,

      rosterPromotionsCreated:
        0,
    },

    parserContract:
      HD_REPLAY_PARSER_CONTRACT,

    corpus: {
      rawFinalRows:
        rawGames.length,

      logicalBattles:
        logicalRows.length,

      logicalRosterIncomplete:
        incompleteGames.length,

      pass8RunsLoaded:
        runs.length,
    },

    eligible: {
      count:
        safeEntries.length,

      ids:
        safeEntries.map(
          (
            entry
          ) =>
            entry.gameStatsId
        ),

      byFormat:
        eligibleByFormat,

      byProvenance:
        eligibleByProvenance,
    },

    blocked: {
      rows:
        blockedRecords.length,

      counts:
        Object.fromEntries(
          Object.entries(
            blockerCounts
          )
            .sort(
              (
                left,
                right
              ) =>
                right[1] -
                  left[1] ||
                left[0]
                  .localeCompare(
                    right[0]
                  )
            )
        ),

      samples:
        blockerSamples,

      records:
        blockedRecords
          .sort(
            (
              left,
              right
            ) =>
              left.gameStatsId -
              right.gameStatsId
          ),
    },

    manifest: {
      path:
        MANIFEST_PATH,

      version:
        MANIFEST_VERSION,

      entryCount:
        safeEntries.length,

      sha256:
        manifestSha256,

      bytes:
        Buffer.byteLength(
          manifestBytes
        ),
    },
  };


  await writeFile(
    MANIFEST_PATH,
    manifestBytes,
    {
      encoding:
        "utf8",

      mode:
        0o600,
    }
  );


  await chmod(
    MANIFEST_PATH,
    0o600
  );


  await writeFile(
    REPORT_PATH,
    `${
      JSON.stringify(
        report,
        null,
        2
      )
    }\n`,
    {
      encoding:
        "utf8",

      mode:
        0o600,
    }
  );


  await chmod(
    REPORT_PATH,
    0o600
  );


  /*
   * Reassert DB fence after all queries and local file writes.
   */
  const finalReadOnly =
    await prisma
      .$queryRawUnsafe<
        Array<{
          transaction_read_only:
            string;
        }>
      >(
        "SHOW transaction_read_only"
      );


  if (
    lower(
      finalReadOnly?.[0]
        ?.transaction_read_only
    ) !== "on"
  ) {
    throw new Error(
      "READ_ONLY_FENCE_DROPPED"
    );
  }


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
