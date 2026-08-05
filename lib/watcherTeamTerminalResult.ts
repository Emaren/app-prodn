import {
  normalizeReplayPlayers,
  type CanonicalReplayPlayer,
} from "./teamResolution.ts";

export const WATCHER_TEAM_TERMINAL_POLICY_VERSION =
  "replay-team-terminal-action-tail-v2" as const;

export const WATCHER_TEAM_TERMINAL_MIN_LEAD_MS = 10_000;
export const WATCHER_TEAM_TERMINAL_MIN_LOSER_SILENCE_MS = 10_000;
export const WATCHER_TEAM_TERMINAL_MAX_WINNER_TAIL_MS = 5_000;

export type WatcherTeamTerminalInput = {
  id: number;
  replayHash: string;
  parseIteration: number;
  parseSource: string | null;
  parseReason: string | null;
  isFinal: boolean;
  winner: unknown;
  players: unknown;
  keyEvents: unknown;
  eventTypes: unknown;
  disconnectDetected: boolean;
  durationSeconds: number | null;
  uploaderSteamId: string | null;
  uploaderUid: string | null;
  uploaderUserId?: number | null;
  hasAdjudicationHistory: boolean;
  currentDesyncOccurred: boolean | null;
  terminalReceipt: unknown;
  terminalFailureCount: number;
  rawActivityByPlayer: unknown;
  parseRun?: unknown;
};

export type WatcherTeamTerminalTeam = {
  teamKey: string;
  players: Array<{
    stablePlayerKey: string;
    name: string;
    normalizedName: string;
    steamId: string | null;
    sourceTeamId: string | null;
    playerNumber: number | null;
  }>;
};

export type WatcherTeamTerminalEvaluation =
  | {
      eligible: false;
      reason: string;
    }
  | {
      eligible: true;
      reason: "decisive_team_terminal_action_tail";
      uploader: CanonicalReplayPlayer;
      losingTeam: WatcherTeamTerminalTeam;
      winningTeam: WatcherTeamTerminalTeam;
      teams: WatcherTeamTerminalTeam[];
      winningTeamKey: string;
      evidence: Record<string, unknown>;
    };

type ActivityRow = {
  playerNumber: number;
  playerName: string;
  actionPacketCount: number;
  firstActionMs: number;
  lastActionMs: number;
};

type TeamState = {
  team: WatcherTeamTerminalTeam;
  rosterSize: number;
  resignedPlayers: CanonicalReplayPlayer[];
  survivingPlayers: CanonicalReplayPlayer[];
  survivingActivity: Array<{
    player: CanonicalReplayPlayer;
    activity: ActivityRow;
  }>;
  resignationCount: number;
  lastSurvivorActionMs: number;
};

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);

  return parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function cleanText(value: unknown, maxLength = 255) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function normalizedName(value: unknown) {
  return cleanText(value, 100).toLowerCase();
}

function truth(value: unknown) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function explicitFalse(value: unknown) {
  return (
    value === false ||
    value === "false" ||
    value === 0 ||
    value === "0"
  );
}

function nonNegativeInteger(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    /^\d+$/.test(value.trim())
  ) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed)
      ? parsed
      : null;
  }

  return null;
}

function positiveInteger(value: unknown) {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0
    ? parsed
    : null;
}

function finiteNumber(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function stableJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>
      )
        .filter(
          ([, entry]) =>
            entry !== undefined
        )
        .sort(
          ([left], [right]) =>
            left.localeCompare(right)
        )
        .map(
          ([key, entry]) => [
            key,
            stableJsonValue(entry),
          ]
        )
    );
  }

  return null;
}

function eventTypes(value: unknown) {
  return new Set(
    arrayValue(value)
      .map(
        (entry) =>
          cleanText(entry, 80).toLowerCase()
      )
      .filter(Boolean)
  );
}

function knownWinner(value: unknown) {
  const normalized =
    cleanText(value, 100).toLowerCase();

  return Boolean(
    normalized &&
      ![
        "unknown",
        "unresolved",
        "undetermined",
        "none",
        "null",
        "n/a",
        "tbd",
      ].includes(normalized)
  );
}

function activityRows(value: unknown): ActivityRow[] {
  return arrayValue(value)
    .map((entry) => {
      const source =
        objectValue(entry);

      const playerNumber =
        positiveInteger(
          source.player_number
        );

      const actionPacketCount =
        nonNegativeInteger(
          source.action_packet_count
        );

      const firstActionMs =
        finiteNumber(
          source.first_action_ms
        );

      const lastActionMs =
        finiteNumber(
          source.last_action_ms
        );

      if (
        playerNumber === null ||
        actionPacketCount === null ||
        actionPacketCount < 1 ||
        firstActionMs === null ||
        lastActionMs === null ||
        firstActionMs < 0 ||
        lastActionMs < firstActionMs
      ) {
        return null;
      }

      return {
        playerNumber,
        playerName:
          cleanText(
            source.player_name,
            100
          ),
        actionPacketCount,
        firstActionMs,
        lastActionMs,
      };
    })
    .filter(
      (
        entry
      ): entry is ActivityRow =>
        entry !== null
    );
}

function terminalReceipt(value: unknown) {
  const source =
    objectValue(value);

  return {
    eventType:
      cleanText(
        source.eventType ??
          source.event_type,
        80
      ).toLowerCase(),

    userId:
      positiveInteger(
        source.userId ??
          source.user_id
      ),

    userUid:
      cleanText(
        source.userUid ??
          source.user_uid,
        100
      ),

    sessionId:
      cleanText(
        source.sessionId ??
          source.session_id,
        100
      ),

    replayHash:
      cleanText(
        source.replayHash ??
          source.replay_hash,
        64
      ).toLowerCase(),

    replayFile:
      cleanText(
        source.replayFile ??
          source.replay_file,
        255
      ),

    metadata:
      objectValue(
        source.metadata
      ),
  };
}

function sameSet(
  left: Set<string>,
  right: Set<string>
) {
  return (
    left.size === right.size &&
    [...left].every(
      (value) =>
        right.has(value)
    )
  );
}

function teamIdKey(value: unknown) {
  const id =
    cleanText(value, 100);

  return id
    ? `team:${id}`
    : "";
}

function canonicalTeamPlayers(
  teamSource: Record<string, unknown>,
  playersByKey: Map<string, CanonicalReplayPlayer>
) {
  const playerKeys =
    arrayValue(
      teamSource.player_keys
    )
      .map(
        (entry) =>
          cleanText(entry, 160)
      )
      .filter(Boolean);

  if (
    playerKeys.length < 2 ||
    new Set(playerKeys).size !==
      playerKeys.length
  ) {
    return null;
  }

  const players =
    playerKeys.map(
      (key) =>
        playersByKey.get(key) ??
        null
    );

  if (
    players.some(
      (player) =>
        player === null
    )
  ) {
    return null;
  }

  return players as CanonicalReplayPlayer[];
}

function buildTeams(
  teamResolution: Record<string, unknown>,
  players: CanonicalReplayPlayer[]
) {
  const rawTeams =
    arrayValue(
      teamResolution.teams
    );

  if (rawTeams.length !== 2) {
    return null;
  }

  const playersByKey =
    new Map(
      players.map(
        (player) => [
          player.stablePlayerKey,
          player,
        ]
      )
    );

  const teams =
    rawTeams
      .map((entry) => {
        const source =
          objectValue(entry);

        const sourceTeamId =
          cleanText(
            source.team_id,
            100
          );

        const teamKey =
          teamIdKey(
            source.team_id
          );

        const teamPlayers =
          canonicalTeamPlayers(
            source,
            playersByKey
          );

        if (
          !sourceTeamId ||
          !teamKey ||
          !teamPlayers
        ) {
          return null;
        }

        if (
          teamPlayers.some(
            (player) =>
              player.teamId !==
                null &&
              player.teamId !==
                sourceTeamId
          )
        ) {
          return null;
        }

        return {
          teamKey,
          players:
            teamPlayers
              .map((player) => ({
                stablePlayerKey:
                  player.stablePlayerKey,

                name:
                  player.name,

                normalizedName:
                  player.normalizedName,

                steamId:
                  player.steamId,

                sourceTeamId:
                  sourceTeamId,

                playerNumber:
                  player.playerNumber,
              }))
              .sort(
                (left, right) =>
                  left.stablePlayerKey.localeCompare(
                    right.stablePlayerKey
                  )
              ),
        };
      });

  if (
    teams.some(
      (team) =>
        team === null
    )
  ) {
    return null;
  }

  const canonicalTeams =
    teams as WatcherTeamTerminalTeam[];

  const assignedKeys =
    canonicalTeams.flatMap(
      (team) =>
        team.players.map(
          (player) =>
            player.stablePlayerKey
        )
    );

  const rosterKeys =
    players.map(
      (player) =>
        player.stablePlayerKey
    );

  if (
    new Set(assignedKeys).size !==
      assignedKeys.length ||
    !sameSet(
      new Set(assignedKeys),
      new Set(rosterKeys)
    )
  ) {
    return null;
  }

  return canonicalTeams.sort(
    (left, right) =>
      left.teamKey.localeCompare(
        right.teamKey
      )
  );
}

function resignationNumbers(
  keyEvents: Record<string, unknown>,
  players: CanonicalReplayPlayer[]
) {
  const numbers =
    arrayValue(
      keyEvents.resigned_player_numbers
    )
      .map(positiveInteger)
      .filter(
        (
          value
        ): value is number =>
          value !== null
      );

  if (
    numbers.length === 0 ||
    new Set(numbers).size !==
      numbers.length
  ) {
    return null;
  }

  const playersByNumber =
    new Map(
      players.map(
        (player) => [
          player.playerNumber,
          player,
        ]
      )
    );

  if (
    numbers.some(
      (number) =>
        !playersByNumber.has(number)
    )
  ) {
    return null;
  }

  const declaredNames =
    arrayValue(
      keyEvents.resigned_player_names
    )
      .map(normalizedName)
      .filter(Boolean);

  if (declaredNames.length > 0) {
    const mappedNames =
      numbers.map(
        (number) =>
          playersByNumber.get(number)!
            .normalizedName
      );

    if (
      declaredNames.length !==
        mappedNames.length ||
      !sameSet(
        new Set(declaredNames),
        new Set(mappedNames)
      )
    ) {
      return null;
    }
  }

  return new Set(numbers);
}

function parserResignationCounts(
  resultEvidence: Record<string, unknown>
) {
  const entries =
    arrayValue(
      resultEvidence
        .resignation_counts_by_team
    );

  const counts =
    new Map<
      string,
      {
        playerCount: number;
        resignedPlayerCount: number;
      }
    >();

  for (const entry of entries) {
    const source =
      objectValue(entry);

    const key =
      teamIdKey(
        source.team_id
      );

    const playerCount =
      positiveInteger(
        source.player_count
      );

    const resignedPlayerCount =
      nonNegativeInteger(
        source.resigned_player_count
      );

    if (
      !key ||
      playerCount === null ||
      resignedPlayerCount === null ||
      resignedPlayerCount >
        playerCount ||
      counts.has(key)
    ) {
      return null;
    }

    counts.set(key, {
      playerCount,
      resignedPlayerCount,
    });
  }

  return counts.size === 2
    ? counts
    : null;
}

function teamStates(
  teams: WatcherTeamTerminalTeam[],
  players: CanonicalReplayPlayer[],
  resignedNumbers: Set<number>,
  activities: ActivityRow[],
  parserCounts: Map<
    string,
    {
      playerCount: number;
      resignedPlayerCount: number;
    }
  >
) {
  const playersByKey =
    new Map(
      players.map(
        (player) => [
          player.stablePlayerKey,
          player,
        ]
      )
    );

  const activitiesByNumber =
    new Map<number, ActivityRow>();

  for (const activity of activities) {
    if (
      activitiesByNumber.has(
        activity.playerNumber
      )
    ) {
      return null;
    }

    activitiesByNumber.set(
      activity.playerNumber,
      activity
    );
  }

  if (
    activitiesByNumber.size !==
      players.length
  ) {
    return null;
  }

  const states =
    teams.map((team) => {
      const canonicalPlayers =
        team.players.map(
          (player) =>
            playersByKey.get(
              player.stablePlayerKey
            ) ??
            null
        );

      if (
        canonicalPlayers.some(
          (player) =>
            player === null ||
            player.playerNumber ===
              null
        )
      ) {
        return null;
      }

      const roster =
        canonicalPlayers as CanonicalReplayPlayer[];

      const resignedPlayers =
        roster.filter(
          (player) =>
            resignedNumbers.has(
              player.playerNumber!
            )
        );

      const survivingPlayers =
        roster.filter(
          (player) =>
            !resignedNumbers.has(
              player.playerNumber!
            )
        );

      if (
        survivingPlayers.length === 0
      ) {
        return null;
      }

      const survivingActivity =
        survivingPlayers.map(
          (player) => ({
            player,
            activity:
              activitiesByNumber.get(
                player.playerNumber!
              ) ??
              null,
          })
        );

      if (
        survivingActivity.some(
          (entry) =>
            entry.activity === null
        )
      ) {
        return null;
      }

      const exactActivity =
        survivingActivity as Array<{
          player: CanonicalReplayPlayer;
          activity: ActivityRow;
        }>;

      const parserCount =
        parserCounts.get(
          team.teamKey
        );

      if (
        !parserCount ||
        parserCount.playerCount !==
          roster.length ||
        parserCount
          .resignedPlayerCount !==
          resignedPlayers.length
      ) {
        return null;
      }

      return {
        team,
        rosterSize:
          roster.length,
        resignedPlayers,
        survivingPlayers,
        survivingActivity:
          exactActivity,
        resignationCount:
          resignedPlayers.length,
        lastSurvivorActionMs:
          Math.max(
            ...exactActivity.map(
              (entry) =>
                entry.activity
                  .lastActionMs
            )
          ),
      };
    });

  if (
    states.some(
      (state) =>
        state === null
    )
  ) {
    return null;
  }

  return states as TeamState[];
}

export function evaluateWatcherTeamTerminalResult(
  input: WatcherTeamTerminalInput
): WatcherTeamTerminalEvaluation {
  if (!input.isFinal) {
    return {
      eligible: false,
      reason: "not_final",
    };
  }

  if (
    cleanText(
      input.parseSource,
      40
    ) !== "watcher_final"
  ) {
    return {
      eligible: false,
      reason: "not_watcher_final",
    };
  }

  if (
    cleanText(
      input.parseReason,
      80
    ) !==
      "team_resignation_not_complete"
  ) {
    return {
      eligible: false,
      reason:
        "team_parse_reason_not_exact",
    };
  }

  if (input.parseIteration < 2) {
    return {
      eligible: false,
      reason:
        "parser_iteration_not_stable",
    };
  }

  if (input.disconnectDetected) {
    return {
      eligible: false,
      reason:
        "terminal_disconnect_present",
    };
  }

  if (
    (input.durationSeconds ?? 0) <
      60
  ) {
    return {
      eligible: false,
      reason:
        "duration_under_60_seconds",
    };
  }

  if (
    input.hasAdjudicationHistory
  ) {
    return {
      eligible: false,
      reason:
        "adjudication_history_exists",
    };
  }

  if (
    input.currentDesyncOccurred ===
      true
  ) {
    return {
      eligible: false,
      reason:
        "confirmed_desync",
    };
  }

  if (knownWinner(input.winner)) {
    return {
      eligible: false,
      reason:
        "stored_winner_exists",
    };
  }

  if (
    !Number.isSafeInteger(
      input.terminalFailureCount
    ) ||
    input.terminalFailureCount !== 0
  ) {
    return {
      eligible: false,
      reason:
        "terminal_failure_present",
    };
  }

  const players =
    normalizeReplayPlayers(
      parseJson(input.players)
    );

  if (
    ![4, 6, 8].includes(
      players.length
    ) ||
    players.some(
      (player) =>
        !player.steamId ||
        player.playerNumber ===
          null ||
        player.teamId === null
    ) ||
    new Set(
      players.map(
        (player) =>
          player.stablePlayerKey
      )
    ).size !== players.length
  ) {
    return {
      eligible: false,
      reason:
        "exact_steam_team_roster_required",
    };
  }

  const uploaderSteamId =
    cleanText(
      input.uploaderSteamId,
      32
    );

  if (!uploaderSteamId) {
    return {
      eligible: false,
      reason:
        "uploader_steam_id_missing",
    };
  }

  const uploaderMatches =
    players.filter(
      (player) =>
        player.steamId ===
          uploaderSteamId
    );

  if (
    uploaderMatches.length !== 1
  ) {
    return {
      eligible: false,
      reason:
        "uploader_player_not_exact",
    };
  }

  const uploader =
    uploaderMatches[0];

  const keyEvents =
    objectValue(
      input.keyEvents
    );

  const watcherUpload =
    objectValue(
      keyEvents.watcher_upload
    );

  const teamResolution =
    objectValue(
      keyEvents.team_resolution
    );

  const resultResolution =
    objectValue(
      keyEvents.result_resolution
    );

  const resultEvidence =
    objectValue(
      resultResolution
        .result_evidence
    );

  const replayHash =
    cleanText(
      input.replayHash,
      64
    ).toLowerCase();

  const archivedHash =
    cleanText(
      watcherUpload.server_sha256,
      64
    ).toLowerCase();

  if (
    cleanText(
      watcherUpload.file_role,
      40
    ).toLowerCase() !==
      "final_recording" ||
    !truth(
      watcherUpload.final_candidate
    ) ||
    truth(
      watcherUpload
        .checkpoint_final_rejected
    ) ||
    !replayHash ||
    archivedHash !== replayHash
  ) {
    return {
      eligible: false,
      reason:
        "watcher_final_proof_incomplete",
    };
  }

  if (
    !explicitFalse(
      keyEvents.restored
    ) ||
    cleanText(
      keyEvents.platform_id,
      20
    ).toLowerCase() !== "hd" ||
    !explicitFalse(
      keyEvents.completed
    )
  ) {
    return {
      eligible: false,
      reason:
        "hd_team_terminal_shape_missing",
    };
  }

  const expectedSize =
    players.length / 2;

  const expectedFormat =
    `${expectedSize}v${expectedSize}`;

  if (
    cleanText(
      teamResolution.format,
      20
    ).toLowerCase() !==
      expectedFormat ||
    cleanText(
      teamResolution.status,
      20
    ).toLowerCase() !==
      "resolved" ||
    cleanText(
      teamResolution.confidence,
      20
    ).toLowerCase() !==
      "high" ||
    cleanText(
      teamResolution.provenance,
      80
    ).toLowerCase() !==
      "explicit_final_team_ids"
  ) {
    return {
      eligible: false,
      reason:
        "team_resolution_not_exact",
    };
  }

  if (
    cleanText(
      resultResolution
        .result_status,
      40
    ).toLowerCase() !==
      "review_required" ||
    !explicitFalse(
      resultResolution
        .result_trusted
    ) ||
    cleanText(
      resultResolution
        .winning_team_id,
      100
    ) ||
    arrayValue(
      resultResolution
        .winning_player_names
    ).length > 0 ||
    arrayValue(
      resultResolution
        .winning_player_keys
    ).length > 0 ||
    truth(
      resultEvidence
        .resignation_result_conflict
    ) ||
    truth(
      resultEvidence
        .complete_losing_team_resignation
    ) ||
    truth(
      resultEvidence
        .winner_flags_coherent
    ) ||
    players.some(
      (player) =>
        player.winner === true
    )
  ) {
    return {
      eligible: false,
      reason:
        "conflicting_serialized_team_result",
    };
  }

  if (
    !eventTypes(
      input.eventTypes
    ).has("resign")
  ) {
    return {
      eligible: false,
      reason:
        "resignation_evidence_missing",
    };
  }

  const teams =
    buildTeams(
      teamResolution,
      players
    );

  if (
    !teams ||
    teams.some(
      (team) =>
        team.players.length !==
          expectedSize
    )
  ) {
    return {
      eligible: false,
      reason:
        "team_assignment_not_exact",
    };
  }

  const resignedNumbers =
    resignationNumbers(
      keyEvents,
      players
    );

  if (!resignedNumbers) {
    return {
      eligible: false,
      reason:
        "resignation_roster_not_exact",
    };
  }

  const parserCounts =
    parserResignationCounts(
      resultEvidence
    );

  if (!parserCounts) {
    return {
      eligible: false,
      reason:
        "parser_resignation_counts_missing",
    };
  }

  const activities =
    activityRows(
      input.rawActivityByPlayer
    );

  const states =
    teamStates(
      teams,
      players,
      resignedNumbers,
      activities,
      parserCounts
    );

  if (
    !states ||
    states.length !== 2
  ) {
    return {
      eligible: false,
      reason:
        "raw_team_activity_not_exact",
    };
  }

  const orderedByResignations =
    states
      .slice()
      .sort(
        (left, right) =>
          right.resignationCount -
          left.resignationCount
      );

  const losingTeam =
    orderedByResignations[0];

  const winningTeam =
    orderedByResignations[1];

  if (
    losingTeam.resignationCount <=
      winningTeam.resignationCount
  ) {
    return {
      eligible: false,
      reason:
        "resignation_advantage_missing",
    };
  }

  const minimumLosingResignations =
    Math.ceil(
      losingTeam.rosterSize / 2
    );

  if (
    losingTeam.resignationCount <
      minimumLosingResignations
  ) {
    return {
      eligible: false,
      reason:
        "losing_team_resignation_count_too_low",
    };
  }

  const durationMs =
    Math.round(
      (input.durationSeconds ?? 0) *
        1000
    );

  const winnerLeadMs =
    winningTeam
      .lastSurvivorActionMs -
    losingTeam
      .lastSurvivorActionMs;

  const loserSilenceMs =
    durationMs -
    losingTeam
      .lastSurvivorActionMs;

  const winnerTailMs =
    durationMs -
    winningTeam
      .lastSurvivorActionMs;

  if (
    winnerLeadMs <
      WATCHER_TEAM_TERMINAL_MIN_LEAD_MS
  ) {
    return {
      eligible: false,
      reason:
        "team_terminal_activity_gap_too_short",
    };
  }

  if (
    loserSilenceMs <
      WATCHER_TEAM_TERMINAL_MIN_LOSER_SILENCE_MS
  ) {
    return {
      eligible: false,
      reason:
        "losing_team_terminal_silence_too_short",
    };
  }

  if (
    winnerTailMs < 0 ||
    winnerTailMs >
      WATCHER_TEAM_TERMINAL_MAX_WINNER_TAIL_MS
  ) {
    return {
      eligible: false,
      reason:
        "winning_team_not_active_at_terminal_tail",
    };
  }

  const receipt =
    terminalReceipt(
      input.terminalReceipt
    );

  const receiptProvided =
    Boolean(
      receipt.eventType ||
      receipt.replayHash ||
      receipt.sessionId ||
      receipt.replayFile
    );

  const receiptTypeAllowed =
    [
      "final_settle_observation_complete",
      "legacy_final_monitor_settled",
    ].includes(
      receipt.eventType
    );

  const receiptIdentityMatches =
    receiptTypeAllowed &&
    receipt.replayHash ===
      replayHash &&
    Boolean(
      receipt.sessionId
    ) &&
    Boolean(
      receipt.replayFile
    ) &&
    (
      !input.uploaderUserId ||
      receipt.userId ===
        input.uploaderUserId
    ) &&
    (
      !input.uploaderUid ||
      !receipt.userUid ||
      receipt.userUid ===
        input.uploaderUid
    );

  if (
    receiptProvided &&
    (
      !receiptIdentityMatches ||
      (
        receipt.eventType ===
          "final_settle_observation_complete" &&
        explicitFalse(
          receipt.metadata
            .finalStored
        )
      )
    )
  ) {
    return {
      eligible: false,
      reason:
        "terminal_receipt_conflicts",
    };
  }

  const resignationAdvantage =
    losingTeam.resignationCount -
    winningTeam.resignationCount;

  return {
    eligible: true,
    reason:
      "decisive_team_terminal_action_tail",

    uploader,

    losingTeam:
      losingTeam.team,

    winningTeam:
      winningTeam.team,

    teams,

    winningTeamKey:
      winningTeam.team.teamKey,

    evidence:
      stableJsonValue({
        submittedVia:
          "automatic_replay_team_terminal_policy",

        policyVersion:
          WATCHER_TEAM_TERMINAL_POLICY_VERSION,

        replayHash,

        gameStatsId:
          input.id,

        uploaderUid:
          input.uploaderUid,

        uploaderUserId:
          input.uploaderUserId ??
          null,

        uploaderSteamId,

        uploaderPlayerKey:
          uploader.stablePlayerKey,

        uploaderPlayerName:
          uploader.name,

        exactFinalRecording:
          true,

        explicitTwoTeamRoster:
          true,

        serializedResultAbsent:
          true,

        confirmedDesyncAbsent:
          true,

        financialAuthority:
          false,

        durationSeconds:
          input.durationSeconds,

        terminalReceiptMode:
          receiptProvided
            ? "exact_watcher_receipt"
            : "action_tail_fallback",

        parseRun:
          input.parseRun ??
          null,

        resignationState: {
          winningTeamKey:
            winningTeam.team
              .teamKey,

          losingTeamKey:
            losingTeam.team
              .teamKey,

          winningTeamResignations:
            winningTeam
              .resignationCount,

          losingTeamResignations:
            losingTeam
              .resignationCount,

          resignationAdvantage,

          winningTeamSurvivors:
            winningTeam
              .survivingPlayers
              .map(
                (player) =>
                  player.stablePlayerKey
              ),

          losingTeamSurvivors:
            losingTeam
              .survivingPlayers
              .map(
                (player) =>
                  player.stablePlayerKey
              ),
        },

        actionTail: {
          winningTeamLastActionMs:
            winningTeam
              .lastSurvivorActionMs,

          losingTeamLastActionMs:
            losingTeam
              .lastSurvivorActionMs,

          winnerLeadMs,

          loserSilenceMs,

          winnerTailMs,

          winningTeamSurvivorActivity:
            winningTeam
              .survivingActivity
              .map((entry) => ({
                playerKey:
                  entry.player
                    .stablePlayerKey,

                playerName:
                  entry.player.name,

                activity:
                  entry.activity,
              })),

          losingTeamSurvivorActivity:
            losingTeam
              .survivingActivity
              .map((entry) => ({
                playerKey:
                  entry.player
                    .stablePlayerKey,

                playerName:
                  entry.player.name,

                activity:
                  entry.activity,
              })),

          thresholds: {
            minimumWinnerLeadMs:
              WATCHER_TEAM_TERMINAL_MIN_LEAD_MS,

            minimumLoserSilenceMs:
              WATCHER_TEAM_TERMINAL_MIN_LOSER_SILENCE_MS,

            maximumWinnerTailMs:
              WATCHER_TEAM_TERMINAL_MAX_WINNER_TAIL_MS,
          },
        },
      }) as Record<string, unknown>,
  };
}
