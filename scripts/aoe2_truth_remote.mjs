import {
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  join,
  resolve,
} from "node:path";
import {
  gunzipSync,
} from "node:zlib";

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


const TRUTH_CANDIDATE_ROOT =
  "/mnt/HC_Volume_105319120/aoe2-parser-engine";

const TRUTH_ARCHIVE_ROOT =
  "/mnt/HC_Volume_105319120/aoe2-replay-archive";

const SHA256_RE =
  /^[0-9a-f]{64}$/;

function cleanTruthText(
  value
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function truthRecord(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? value
    : {};
}

function insideTruthRoot(
  candidate,
  root
) {
  const full =
    resolve(
      candidate
    );

  const fullRoot =
    resolve(
      root
    );

  return (
    full ===
      fullRoot ||
    full.startsWith(
      fullRoot +
      "/"
    )
  );
}

function canonicalArchiveAvailable(
  replayHash
) {
  const hash =
    cleanTruthText(
      replayHash
    )
      .toLowerCase();

  if (
    !SHA256_RE.test(
      hash
    )
  ) {
    return false;
  }

  const directory =
    join(
      TRUTH_ARCHIVE_ROOT,
      hash.slice(
        0,
        2
      ),
      hash.slice(
        2,
        4
      )
    );

  try {
    return readdirSync(
      directory,
      {
        withFileTypes:
          true,
      }
    )
      .some(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(
            `${hash}.`
          )
      );
  } catch {
    return false;
  }
}

function expectedTopologyPlayerCount(
  teamSize
) {
  const parts =
    cleanTruthText(
      teamSize
    )
      .match(
        /\d+/g
      );

  if (
    !parts ||
    parts.length ===
      0
  ) {
    return null;
  }

  return parts.reduce(
    (
      total,
      part
    ) =>
      total +
      Number(
        part
      ),
    0
  );
}

function extractCandidateTopologyEvidence(
  run
) {
  const key =
    cleanTruthText(
      run
        ?.candidateOutputStorageKey
    );

  if (!key) {
    return {
      available:
        false,

      reason:
        "candidate_output_missing",

      gameDiplomacy:
        null,

      playerTeams:
        [],
    };
  }

  const candidatePath =
    resolve(
      key
    );

  if (
    !insideTruthRoot(
      candidatePath,
      TRUTH_CANDIDATE_ROOT
    )
  ) {
    return {
      available:
        false,

      reason:
        "candidate_output_outside_allowed_root",

      gameDiplomacy:
        null,

      playerTeams:
        [],
    };
  }

  try {
    const bytes =
      readFileSync(
        candidatePath
      );

    const raw =
      candidatePath.endsWith(
        ".gz"
      )
        ? gunzipSync(
            bytes
          ).toString(
            "utf8"
          )
        : bytes.toString(
            "utf8"
          );

    const parsed =
      JSON.parse(
        raw
      );

    let gameDiplomacy =
      null;

    const playerTeams =
      [];

    function walk(
      node
    ) {
      if (
        node === null ||
        node === undefined
      ) {
        return;
      }

      if (
        Array.isArray(
          node
        )
      ) {
        for (
          const entry
          of node
        ) {
          walk(
            entry
          );
        }

        return;
      }

      if (
        typeof node !==
        "object"
      ) {
        return;
      }

      if (
        node.field ===
          "game.diplomacy" &&
        node.exact ===
          true &&
        node.provenance_class ===
          "derived_coherent" &&
        node.evidence_source ===
          "mgz.summary.get_diplomacy"
      ) {
        gameDiplomacy = {
          value:
            node.value ??
            null,

          provenanceClass:
            node.provenance_class,

          evidenceSource:
            node.evidence_source,
        };
      }

      if (
        node.field ===
          "player.team_id" &&
        node.exact ===
          true &&
        (
          node.provenance_class ===
            "direct_header" ||
          node.provenance_class ===
            "absent"
        ) &&
        node.evidence_source ===
          "mgz.header.player.team_id"
      ) {
        playerTeams.push({
          value:
            node.value ??
            null,

          subject:
            node.subject ??
            null,

          provenanceClass:
            node.provenance_class,

          evidenceSource:
            node.evidence_source,
        });
      }

      for (
        const entry
        of Object.values(
          node
        )
      ) {
        walk(
          entry
        );
      }
    }

    walk(
      parsed
    );

    return {
      available:
        true,

      reason:
        null,

      candidatePath,
      gameDiplomacy,
      playerTeams,
    };
  } catch (
    error
  ) {
    return {
      available:
        false,

      reason:
        error instanceof Error
          ? error.message
          : String(
              error
            ),

      gameDiplomacy:
        null,

      playerTeams:
        [],
    };
  }
}

function groupedDirectTopologyTeams(
  observations
) {
  const direct =
    observations.filter(
      (entry) =>
        entry.provenanceClass ===
          "direct_header" &&
        entry.value !==
          null &&
        entry.value !==
          undefined
    );

  const subjects =
    new Set();

  const grouped =
    new Map();

  for (
    const entry
    of direct
  ) {
    const subject =
      truthRecord(
        entry.subject
      );

    /*
     * Direct-header topology is replay-slot evidence.
     *
     * Distinct AI/player slots may legitimately share a normalized name or
     * stable player key. Prefer the exact replay player number so duplicate
     * identities cannot erase otherwise complete side composition evidence.
     */
    const subjectKey =
      (
        subject.player_number !==
          undefined &&
        subject.player_number !==
          null
          ? `number:${subject.player_number}`
          : ""
      ) ||
      cleanTruthText(
        subject.player_key
      );

    if (!subjectKey) {
      return null;
    }

    if (
      subjects.has(
        subjectKey
      )
    ) {
      return null;
    }

    subjects.add(
      subjectKey
    );

    const teamKey =
      String(
        entry.value
      );

    const members =
      grouped.get(
        teamKey
      ) ??
      [];

    members.push({
      name:
        subject.player_name ??
        null,

      playerNumber:
        subject.player_number ??
        null,

      playerKey:
        subject.player_key ??
        null,

      teamId:
        entry.value,
    });

    grouped.set(
      teamKey,
      members
    );
  }

  return {
    playerCount:
      direct.length,

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
              members,
          })
        ),
  };
}

function candidateTopologyProjection(
  run
) {
  const evidence =
    extractCandidateTopologyEvidence(
      run
    );

  const diplomacy =
    truthRecord(
      evidence
        .gameDiplomacy
        ?.value
    );

  const type =
    cleanTruthText(
      diplomacy.type
    )
      .toUpperCase();

  const teamSize =
    cleanTruthText(
      diplomacy.team_size
    );

  const diplomacyTeams =
    Array.isArray(
      diplomacy.teams
    )
      ? diplomacy.teams
      : [];

  if (
    type ===
      "FFA"
  ) {
    return {
      known:
        true,

      classification:
        "KNOWN_FFA",

      format:
        teamSize ||
        "FFA",

      provenance:
        "exact_game_diplomacy",

      teams:
        diplomacyTeams,

      candidateEvidence:
        evidence,
    };
  }

  if (
    diplomacy.coherent ===
      true &&
    diplomacyTeams.length >
      0
  ) {
    return {
      known:
        true,

      classification:
        type ===
          "TG"
          ? "KNOWN_TG"
          : diplomacyTeams.length ===
              1
            ? "KNOWN_SINGLE_GROUP"
            : "KNOWN_MULTI_SIDE",

      format:
        teamSize ||
        type ||
        "structured",

      provenance:
        "exact_game_diplomacy",

      teams:
        diplomacyTeams,

      candidateEvidence:
        evidence,
    };
  }

  const direct =
    groupedDirectTopologyTeams(
      evidence.playerTeams
    );

  const expected =
    expectedTopologyPlayerCount(
      teamSize
    );

  if (
    direct &&
    expected !==
      null &&
    expected >
      0 &&
    direct.playerCount ===
      expected
  ) {
    if (
      type ===
        "TG" &&
      direct.teams.length >=
        2
    ) {
      return {
        known:
          true,

        classification:
          "KNOWN_TG",

        format:
          teamSize ||
          "TG",

        provenance:
          "exact_direct_header_team_ids",

        teams:
          direct.teams,

        candidateEvidence:
          evidence,
      };
    }

    if (
      type ===
        "OTHER" &&
      direct.teams.length >=
        1
    ) {
      return {
        known:
          true,

        classification:
          direct.teams.length ===
            1
            ? "KNOWN_SINGLE_GROUP"
            : "KNOWN_MULTI_SIDE",

        format:
          teamSize ||
          "Other",

        provenance:
          "exact_direct_header_team_ids",

        teams:
          direct.teams,

        candidateEvidence:
          evidence,
      };
    }
  }

  return {
    known:
      false,

    classification:
      "UNRESOLVED",

    format:
      teamSize ||
      type ||
      "unknown",

    provenance:
      "candidate_topology_insufficient",

    teams:
      [],

    candidateEvidence:
      evidence,
  };
}

function observedExplicitTopology(
  players
) {
  if (
    players.length ===
      0
  ) {
    return null;
  }

  const identities =
    players.map(
      (player) =>
        player.stablePlayerKey
    );

  if (
    new Set(
      identities
    ).size !==
    identities.length
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
    const members =
      grouped.get(
        player.teamId
      ) ??
      [];

    members.push({
      name:
        player.name,

      stablePlayerKey:
        player.stablePlayerKey,

      steamId:
        player.steamId,

      playerNumber:
        player.playerNumber,

      teamId:
        player.teamId,
    });

    grouped.set(
      player.teamId,
      members
    );
  }

  return {
    teamCount:
      grouped.size,

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
              members,
          })
        ),
  };
}

function topologyProjection(
  game,
  team
) {
  if (
    team.known
  ) {
    return {
      known:
        true,

      classification:
        team.mode ===
          "canonical"
          ? "KNOWN_CANONICAL_TWO_TEAM"
          : "KNOWN_EXPLICIT_TWO_SIDE",

      format:
        team.format,

      provenance:
        team.provenance,

      teams:
        team.teams,

      structuralDisposition:
        "KNOWN",

      recoveryRoute:
        null,

      artifactAvailable:
        true,

      explained:
        true,
    };
  }

  const run =
    game.replayParseRuns?.[0] ??
    null;

  const candidate =
    candidateTopologyProjection(
      run
    );

  if (
    candidate.known
  ) {
    return {
      ...candidate,

      structuralDisposition:
        "KNOWN",

      recoveryRoute:
        null,

      artifactAvailable:
        true,

      explained:
        true,
    };
  }

  const players =
    normalizeReplayPlayers(
      game.players
    );

  const explicit =
    observedExplicitTopology(
      players
    );

  if (explicit) {
    return {
      known:
        true,

      classification:
        explicit.teamCount ===
          1
          ? "KNOWN_SINGLE_GROUP"
          : explicit.teamCount ===
              2
            ? "KNOWN_EXPLICIT_TWO_SIDE"
            : "KNOWN_EXPLICIT_MULTI_SIDE",

      format:
        `${explicit.teamCount}-side`,

      provenance:
        "explicit_normalized_team_ids",

      teams:
        explicit.teams,

      structuralDisposition:
        "KNOWN",

      recoveryRoute:
        null,

      artifactAvailable:
        Boolean(
          run
        ) ||
        canonicalArchiveAvailable(
          game.replayHash
        ),

      explained:
        true,
    };
  }

  const artifactAvailable =
    Boolean(
      run
    ) ||
    canonicalArchiveAvailable(
      game.replayHash
    );

  const recoveryRoute =
    !artifactAvailable
      ? "SOURCE_ARTIFACT_REQUIRED"
      : run
        ? "PARSER_RESEARCH_REQUIRED"
        : "REPARSE_REQUIRED";

  return {
    known:
      false,

    classification:
      "UNRESOLVED",

    format:
      candidate.format ||
      "unknown",

    provenance:
      candidate.provenance,

    teams:
      [],

    structuralDisposition:
      players.length <
        2
        ? "ROSTER_INCOMPLETE"
        : "TOPOLOGY_EVIDENCE_INSUFFICIENT",

    recoveryRoute,
    artifactAvailable,

    explained:
      true,

    candidateEvidence:
      candidate
        .candidateEvidence,
  };
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
  topology
) {
  if (
    topology.known &&
    participants.coherent
  ) {
    return "RESOLVED";
  }

  if (
    !topology.known
  ) {
    return (
      topology.recoveryRoute ||
      "TEAM_EVIDENCE_REQUIRED"
    );
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

  const topology =
    topologyProjection(
      game,
      team
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
    topology,
    scalarAuthority,
    contractMismatch,

    route:
      classifyRoute(
        game,
        truth,
        participants,
        topology
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

  replayHash:
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

      candidateOutputStorageKey:
        true,
    },
  },

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

  const topologyClassBuckets =
    {};

  const topologyRecoveryBuckets =
    {};

  let topologyKnown =
    0;

  let topologyUnknown =
    0;

  let unexplainedTopologyDebt =
    0;

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

    increment(
      topologyClassBuckets,
      analysis.topology
        .classification
    );

    if (
      analysis.topology.known
    ) {
      topologyKnown +=
        1;
    } else {
      topologyUnknown +=
        1;

      increment(
        topologyRecoveryBuckets,
        analysis.topology
          .recoveryRoute ||
          "UNEXPLAINED"
      );

      if (
        !analysis.topology
          .explained
      ) {
        unexplainedTopologyDebt +=
          1;
      }
    }

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
      topologyKnown,
      topologyUnknown,
      unexplainedTopologyDebt,
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
      topologyClassBuckets:
        orderedCounts(
          topologyClassBuckets
        ),

      topologyRecoveryBuckets:
        orderedCounts(
          topologyRecoveryBuckets
        ),

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

            candidateOutputStorageKey:
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

    topology:
      analysis.topology,

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
