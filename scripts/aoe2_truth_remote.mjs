import { getPrisma } from "@/lib/prisma";
import {
  applyReplayAdjudicationToGameStats,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import {
  publicReplayWinnerTruth,
} from "@/lib/publicReplayTruth";
import {
  resolveExplicitUnevenTeamStats,
} from "@/lib/replayExplicitTeamStats";
import {
  resolveReplayResultForPlayer,
} from "@/lib/replayPlayerResult";
import {
  normalizeReplayPlayers,
  resolveReplayTeams,
} from "@/lib/teamResolution";

const command =
  String(
    process.env.AOE2WAR_TRUTH_COMMAND ??
    ""
  )
    .trim()
    .toLowerCase();

const gameId =
  Number(
    process.env.AOE2WAR_TRUTH_GAME_ID ??
    "0"
  );

const productionSource =
  String(
    process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE ??
    ""
  );

function increment(
  target,
  key,
  amount = 1
) {
  const normalized =
    String(
      key ??
      "unknown"
    ) || "unknown";

  target[normalized] =
    (target[normalized] ?? 0) +
    amount;
}

function orderedCounts(
  source
) {
  return Object.fromEntries(
    Object.entries(source)
      .sort(
        (left, right) =>
          right[1] - left[1] ||
          left[0].localeCompare(
            right[0]
          )
      )
  );
}

function participantProjection(
  game
) {
  const players =
    normalizeReplayPlayers(
      game.players
    );

  const outcomes =
    players.map(
      (player) => ({
        name:
          player.name,

        stablePlayerKey:
          player.stablePlayerKey,

        result:
          resolveReplayResultForPlayer(
            game,
            (candidate) =>
              candidate.stablePlayerKey ===
              player.stablePlayerKey
          ),
      })
    );

  const wins =
    outcomes.filter(
      (entry) =>
        entry.result === "win"
    ).length;

  const losses =
    outcomes.filter(
      (entry) =>
        entry.result === "loss"
    ).length;

  const unknown =
    outcomes.filter(
      (entry) =>
        entry.result === "unknown"
    ).length;

  return {
    playerCount:
      players.length,

    wins,
    losses,
    unknown,

    coherent:
      players.length >= 2 &&
      unknown === 0 &&
      wins > 0 &&
      losses > 0,

    outcomes,
  };
}

function observedExplicitTwoTeamComposition(
  players
) {
  if (
    players.length <
    3
  ) {
    return null;
  }

  const identityKeys =
    players.map(
      (player) =>
        player.stablePlayerKey
    );

  if (
    new Set(
      identityKeys
    ).size !==
    identityKeys.length
  ) {
    return null;
  }

  if (
    players.some(
      (player) =>
        player.teamId ===
        null
    )
  ) {
    return null;
  }

  const grouped =
    new Map();

  for (
    const player
    of players
  ) {
    const teamKey =
      player.teamId;

    const members =
      grouped.get(
        teamKey
      ) ??
      [];

    members.push(
      player
    );

    grouped.set(
      teamKey,
      members
    );
  }

  if (
    grouped.size !==
    2
  ) {
    return null;
  }

  return {
    teams:
      [...grouped.entries()]
        .map(
          (
            [
              teamKey,
              members,
            ]
          ) => ({
            teamKey,

            players:
              [...members]
                .sort(
                  (left, right) =>
                    left.stablePlayerKey
                      .localeCompare(
                        right.stablePlayerKey
                      )
                )
                .map(
                  (player) => ({
                    name:
                      player.name,

                    stablePlayerKey:
                      player.stablePlayerKey,

                    steamId:
                      player.steamId,

                    teamId:
                      player.teamId,
                  })
                ),
          })
        ),
  };
}

function canonicalTeamProjection(
  game
) {
  const effective =
    applyReplayAdjudicationToGameStats(
      game
    );

  const players =
    normalizeReplayPlayers(
      effective.players
    );

  const canonical =
    resolveReplayTeams(
      players,
      {
        final:
          effective.is_final === true,
      }
    );

  if (
    canonical.status ===
      "resolved" &&
    canonical.confidence ===
      "high"
  ) {
    return {
      known:
        true,

      mode:
        "canonical",

      format:
        canonical.format,

      provenance:
        canonical.provenance,

      reasonCodes:
        canonical.reasonCodes,

      teams:
        canonical.teams.map(
          (team) => ({
            teamKey:
              team.teamKey,

            players:
              team.players.map(
                (player) => ({
                  name:
                    player.name,

                  stablePlayerKey:
                    player.stablePlayerKey,

                  steamId:
                    player.steamId,

                  teamId:
                    player.teamId,
                })
              ),
          })
        ),
    };
  }

  /*
   * Team composition is a separate evidence dimension from result authority.
   *
   * A final 2v1, 3v2, 4v1, etc. may have complete explicit team IDs even when
   * no result lane can lawfully establish its winner. Preserve that useful
   * composition evidence without promoting it to winner/statistics authority.
   */
  const observedComposition =
    observedExplicitTwoTeamComposition(
      players
    );

  if (
    observedComposition
  ) {
    return {
      known:
        true,

      mode:
        "explicit_observed",

      format:
        "uneven_or_noncanonical",

      provenance:
        "explicit_replay_team_ids_observed",

      reasonCodes:
        canonical.reasonCodes,

      teams:
        observedComposition.teams,
    };
  }

  const uneven =
    resolveExplicitUnevenTeamStats({
      winner:
        effective.winner,

      players:
        effective.players,

      keyEvents:
        effective.key_events,

      isFinal:
        effective.is_final,

      disconnectDetected:
        effective.disconnect_detected,
    });

  if (uneven) {
    return {
      known:
        true,

      mode:
        "explicit_uneven",

      format:
        "uneven",

      provenance:
        "explicit_uneven_team_stats",

      reasonCodes:
        [],

      teams: [
        {
          teamKey:
            uneven.winningTeamId,

          result:
            "win",

          players:
            uneven.winningPlayerNames,
        },
        {
          teamKey:
            uneven.losingTeamId,

          result:
            "loss",

          players:
            uneven.losingPlayerNames,
        },
      ],
    };
  }

  return {
    known:
      false,

    mode:
      "unresolved",

    format:
      canonical.format,

    provenance:
      canonical.provenance,

    reasonCodes:
      canonical.reasonCodes,

    teams:
      [],
  };
}

function classifyRoute(
  game,
  truth,
  participants,
  team
) {
  if (
    team.known &&
    participants.coherent
  ) {
    return "RESOLVED";
  }

  if (
    !team.known
  ) {
    return "TEAM_EVIDENCE_REQUIRED";
  }

  const parseReason =
    String(
      game.parse_reason ??
      ""
    )
      .trim()
      .toLowerCase();

  if (
    parseReason.includes(
      "fragment"
    ) ||
    parseReason.includes(
      "header"
    ) ||
    parseReason.includes(
      "unparsed"
    ) ||
    parseReason.includes(
      "structural_projection"
    ) ||
    parseReason ===
      "watcher_final_submission"
  ) {
    return "REPARSE_REQUIRED";
  }

  if (
    parseReason.includes(
      "early_exit"
    ) ||
    parseReason.includes(
      "saved"
    ) ||
    parseReason.includes(
      "checkpoint"
    )
  ) {
    return "NON_BATTLE_CANDIDATE";
  }

  if (
    Array.isArray(
      game.replayResultAdjudications
    ) &&
    game.replayResultAdjudications
      .length >
      0
  ) {
    return "HUMAN_REVIEW_REQUIRED";
  }

  if (
    truth.candidateWinner
  ) {
    return "RESULT_EVIDENCE_REQUIRED";
  }

  return "RESULT_EVIDENCE_REQUIRED";
}

function analyzeGame(
  game
) {
  const truth =
    publicReplayWinnerTruth(
      game
    );

  const participants =
    participantProjection(
      game
    );

  const team =
    canonicalTeamProjection(
      game
    );

  const scalarAuthority =
    truth.statsEligible ===
      true &&
    truth.truthReasons.includes(
      "stored_winner_field"
    );

  const contractMismatch =
    Boolean(
      truth.statsEligible
    ) !==
    Boolean(
      participants.coherent
    );

  return {
    truth,
    participants,
    team,
    scalarAuthority,
    contractMismatch,

    route:
      classifyRoute(
        game,
        truth,
        participants,
        team
      ),
  };
}

const baseSelect = {
  id:
    true,

  winner:
    true,

  players:
    true,

  parse_reason:
    true,

  parse_source:
    true,

  key_events:
    true,

  event_types:
    true,

  is_final:
    true,

  disconnect_detected:
    true,

  replayResultAdjudications:
    EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
};

async function proveReadOnly(
  prisma
) {
  const rows =
    await prisma.$queryRawUnsafe(
      "SELECT " +
      "current_setting('transaction_read_only') AS transaction_mode, " +
      "current_setting('default_transaction_read_only') AS default_mode"
    );

  const row =
    Array.isArray(rows)
      ? rows[0]
      : null;

  const ok =
    row?.transaction_mode ===
      "on" &&
    row?.default_mode ===
      "on";

  if (!ok) {
    throw new Error(
      "PostgreSQL session is not hard read-only"
    );
  }

  return {
    transactionReadOnly:
      row.transaction_mode,

    defaultTransactionReadOnly:
      row.default_mode,
  };
}

async function loadFinalGames(
  prisma
) {
  return prisma.gameStats.findMany({
    where: {
      is_final:
        true,
    },

    orderBy: {
      id:
        "asc",
    },

    select:
      baseSelect,
  });
}

function buildCorpus(
  games
) {
  const parseReasonBuckets =
    {};

  const truthReasonBuckets =
    {};

  const playerCountBuckets =
    {};

  const routeBuckets =
    {};

  let teamResolved =
    0;

  let resultResolved =
    0;

  let bothResolved =
    0;

  let resultUnknown =
    0;

  let teamUnknown =
    0;

  let bothUnknown =
    0;

  let unknownParticipantResults =
    0;

  let unresolvedDisconnectGames =
    0;

  let contractMismatchGames =
    0;

  const contractMismatchIds =
    [];

  let scalarAuthorityRows =
    0;

  let scalarAuthorityIncoherent =
    0;

  const scalarAuthorityIncoherentIds =
    [];

  for (
    const game
    of games
  ) {
    const analysis =
      analyzeGame(
        game
      );

    if (
      analysis.team.known
    ) {
      teamResolved +=
        1;
    } else {
      teamUnknown +=
        1;
    }

    if (
      analysis.participants
        .coherent
    ) {
      resultResolved +=
        1;
    } else {
      resultUnknown +=
        1;

      unknownParticipantResults +=
        analysis.participants
          .unknown;

      increment(
        parseReasonBuckets,
        game.parse_reason ||
          "unknown"
      );

      const truthReasons =
        analysis.truth
          .truthReasons.length >
        0
          ? analysis.truth
              .truthReasons
          : ["unknown"];

      for (
        const reason
        of truthReasons
      ) {
        increment(
          truthReasonBuckets,
          reason
        );
      }

      increment(
        playerCountBuckets,
        String(
          analysis.participants
            .playerCount
        )
      );

      increment(
        routeBuckets,
        analysis.route
      );

      if (
        game.disconnect_detected ===
        true
      ) {
        unresolvedDisconnectGames +=
          1;
      }
    }

    if (
      analysis.team.known &&
      analysis.participants
        .coherent
    ) {
      bothResolved +=
        1;
    }

    if (
      !analysis.team.known &&
      !analysis.participants
        .coherent
    ) {
      bothUnknown +=
        1;
    }

    if (
      analysis.contractMismatch
    ) {
      contractMismatchGames +=
        1;

      contractMismatchIds.push(
        game.id
      );
    }

    if (
      analysis.scalarAuthority
    ) {
      scalarAuthorityRows +=
        1;

      if (
        !analysis.participants
          .coherent
      ) {
        scalarAuthorityIncoherent +=
          1;

        scalarAuthorityIncoherentIds.push(
          game.id
        );
      }
    }
  }

  return {
    finalGames:
      games.length,

    coverage: {
      teamResolved,
      teamUnknown,
      resultResolved,
      resultUnknown,
      bothResolved,
      bothUnknown,
      unknownParticipantResults,
      unresolvedDisconnectGames,
    },

    debt: {
      parseReasonBuckets:
        orderedCounts(
          parseReasonBuckets
        ),

      truthReasonBuckets:
        orderedCounts(
          truthReasonBuckets
        ),

      playerCountBuckets:
        orderedCounts(
          playerCountBuckets
        ),

      routeBuckets:
        orderedCounts(
          routeBuckets
        ),
    },

    contract: {
      contractMismatchGames,
      contractMismatchIds,
      scalarAuthorityRows,
      scalarAuthorityIncoherent,
      scalarAuthorityIncoherentIds,
    },
  };
}

async function runCensus(
  prisma,
  readOnly
) {
  const games =
    await loadFinalGames(
      prisma
    );

  return {
    schema:
      1,

    kind:
      "aoe2war-truth-census",

    generatedAt:
      new Date()
        .toISOString(),

    productionSource,
    databaseReadOnly:
      readOnly,

    ...buildCorpus(
      games
    ),
  };
}

async function runAudit(
  prisma,
  readOnly
) {
  const games =
    await loadFinalGames(
      prisma
    );

  const corpus =
    buildCorpus(
      games
    );

  return {
    schema:
      1,

    kind:
      "aoe2war-truth-audit",

    generatedAt:
      new Date()
        .toISOString(),

    productionSource,
    databaseReadOnly:
      readOnly,

    finalGames:
      corpus.finalGames,

    contract:
      corpus.contract,

    pass:
      corpus.contract
        .contractMismatchGames ===
        0 &&
      corpus.contract
        .scalarAuthorityIncoherent ===
        0,
  };
}

async function runTarget(
  prisma,
  readOnly
) {
  if (
    !Number.isSafeInteger(
      gameId
    ) ||
    gameId <=
      0
  ) {
    throw new Error(
      "target requires a positive game ID"
    );
  }

  const game =
    await prisma.gameStats.findUnique({
      where: {
        id:
          gameId,
      },

      select: {
        ...baseSelect,

        replayHash:
          true,

        replay_file:
          true,

        original_filename:
          true,

        createdAt:
          true,

        played_on:
          true,

        timestamp:
          true,

        parse_iteration:
          true,

        game_duration:
          true,

        duration:
          true,

        replayParseRuns: {
          where: {
            status:
              "completed",
          },

          orderBy: [
            {
              createdAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],

          take:
            1,

          select: {
            id:
              true,

            parserName:
              true,

            parserVersion:
              true,

            passName:
              true,

            passVersion:
              true,

            schemaVersion:
              true,

            candidateOutputHash:
              true,

            runIdentityHash:
              true,

            createdAt:
              true,
          },
        },

        replayStatProjections: {
          where: {
            projectionStatus:
              "accepted",

            affectsPublicAggregates:
              true,

            supersededBy:
              null,
          },

          orderBy: [
            {
              createdAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],

          take:
            1,

          select: {
            id:
              true,

            sourceIdentity:
              true,

            projectionHash:
              true,

            resultEligibility:
              true,

            playerMetricCount:
              true,

            gameMetricCount:
              true,

            createdAt:
              true,
          },
        },
      },
    });

  if (!game) {
    throw new Error(
      `game ${gameId} was not found`
    );
  }

  const analysis =
    analyzeGame(
      game
    );

  return {
    schema:
      1,

    kind:
      "aoe2war-truth-target",

    generatedAt:
      new Date()
        .toISOString(),

    productionSource,
    databaseReadOnly:
      readOnly,

    game: {
      id:
        game.id,

      final:
        game.is_final,

      replayHash:
        game.replayHash,

      replayFile:
        game.replay_file,

      originalFilename:
        game.original_filename,

      createdAt:
        game.createdAt,

      playedOn:
        game.played_on,

      parserTimestamp:
        game.timestamp,

      parseIteration:
        game.parse_iteration,

      parseSource:
        game.parse_source,

      parseReason:
        game.parse_reason,

      disconnectDetected:
        game.disconnect_detected,

      storedWinner:
        game.winner,

      duration:
        game.game_duration ??
        game.duration,
    },

    truth:
      analysis.truth,

    participants:
      analysis.participants,

    team:
      analysis.team,

    route:
      analysis.route,

    contractMismatch:
      analysis.contractMismatch,

    scalarAuthority:
      analysis.scalarAuthority,

    effectiveAdjudication:
      game.replayResultAdjudications?.[0] ??
      null,

    latestParseRun:
      game.replayParseRuns?.[0] ??
      null,

    currentAcceptedProjection:
      game.replayStatProjections?.[0] ??
      null,
  };
}

async function main() {
  if (
    ![
      "census",
      "audit",
      "target",
    ].includes(
      command
    )
  ) {
    throw new Error(
      `unsupported truth command: ${command}`
    );
  }

  const prisma =
    getPrisma();

  try {
    const readOnly =
      await proveReadOnly(
        prisma
      );

    const payload =
      command === "census"
        ? await runCensus(
            prisma,
            readOnly
          )
        : command === "audit"
          ? await runAudit(
              prisma,
              readOnly
            )
          : await runTarget(
              prisma,
              readOnly
            );

    process.stdout.write(
      JSON.stringify(
        payload
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(
  (error) => {
    console.error(
      error instanceof Error
        ? error.stack ??
          error.message
        : String(error)
    );

    process.exitCode =
      1;
  }
);
