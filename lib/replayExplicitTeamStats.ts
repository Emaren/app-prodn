export type ExplicitUnevenTeamStatsCandidate = {
  winningTeamId: string;
  losingTeamId: string;
  winningPlayerNames: string[];
  winningPlayerKeys: string[];
  losingPlayerNames: string[];
  losingPlayerKeys: string[];
};

type UnknownRecord =
  Record<string, unknown>;

type PlayerEvidence = {
  name: string;
  normalizedName: string;
  stablePlayerKey: string;
  playerNumber: number | null;
  teamId: string;
  winner: boolean;
};

function record(
  value: unknown
): UnknownRecord {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    try {
      const parsed =
        JSON.parse(value) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as UnknownRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function records(
  value: unknown
): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (
          entry
        ): entry is UnknownRecord =>
          Boolean(entry) &&
          typeof entry === "object" &&
          !Array.isArray(entry)
      );
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    try {
      return records(
        JSON.parse(value)
      );
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(
  value: unknown
) {
  return typeof value === "string"
    ? value
        .trim()
        .replace(
          /\s+/g,
          " "
        )
    : "";
}

function normalizedText(
  value: unknown
) {
  return cleanText(value)
    .toLowerCase();
}

function explicitBoolean(
  value: unknown
): boolean | null {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    value === "false"
  ) {
    return false;
  }

  return null;
}

function playerNumber(
  player: UnknownRecord
) {
  const value =
    player.number ??
    player.player_number ??
    player.playerNumber;

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return Math.floor(value);
  }

  if (
    typeof value === "string" &&
    /^\d+$/.test(
      value.trim()
    )
  ) {
    return Number(
      value.trim()
    );
  }

  return null;
}

function explicitTeamId(
  player: UnknownRecord
) {
  const value =
    player.team_id ??
    player.teamId ??
    player.team_number ??
    player.teamNumber ??
    player.team;

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const teamId =
    String(value)
      .trim();

  if (
    !teamId ||
    teamId === "-1" ||
    teamId.toLowerCase() ===
      "none" ||
    teamId.toLowerCase() ===
      "unknown"
  ) {
    return null;
  }

  return teamId;
}

function stablePlayerKey(
  player: UnknownRecord,
  index: number
) {
  const explicit =
    cleanText(
      player.stablePlayerKey ??
      player.stable_player_key
    );

  if (explicit) {
    return explicit;
  }

  const steamId =
    cleanText(
      player.steam_id ??
      player.steamId ??
      player.user_id ??
      player.userId
    );

  if (steamId) {
    return `steam:${steamId}`;
  }

  const number =
    playerNumber(
      player
    );

  if (number !== null) {
    return `number:${number}`;
  }

  const name =
    normalizedText(
      player.name
    );

  if (name) {
    return `name:${name}`;
  }

  return `index:${index}`;
}

function normalizedNameSet(
  value: unknown
) {
  return new Set(
    Array.isArray(value)
      ? value
          .map(
            normalizedText
          )
          .filter(Boolean)
      : []
  );
}

function playerNumberSet(
  value: unknown
) {
  return new Set(
    Array.isArray(value)
      ? value
          .map(
            (entry) => {
              if (
                typeof entry ===
                  "number" &&
                Number.isFinite(entry)
              ) {
                return Math.floor(
                  entry
                );
              }

              const parsed =
                Number(
                  String(
                    entry ??
                    ""
                  )
                );

              return Number.isFinite(
                parsed
              )
                ? Math.floor(parsed)
                : null;
            }
          )
          .filter(
            (
              entry
            ): entry is number =>
              entry !== null
          )
      : []
  );
}

function meaningfulWinner(
  value: unknown
) {
  const winner =
    normalizedText(
      value
    );

  if (
    !winner ||
    winner === "unknown" ||
    winner === "battle filed" ||
    winner === "n/a" ||
    winner === "na"
  ) {
    return null;
  }

  return winner;
}

export function resolveExplicitUnevenTeamStats(
  input: {
    winner?: unknown;
    players?: unknown;
    keyEvents?: unknown;
    isFinal?: boolean | null;
    disconnectDetected?: boolean | null;
  }
): ExplicitUnevenTeamStatsCandidate | null {
  if (
    input.isFinal !== true ||
    input.disconnectDetected === true
  ) {
    return null;
  }

  const rawPlayers =
    records(
      input.players
    );

  if (
    rawPlayers.length <
    3
  ) {
    return null;
  }

  const players:
    PlayerEvidence[] =
    [];

  for (
    const [
      index,
      rawPlayer,
    ]
    of rawPlayers.entries()
  ) {
    const name =
      cleanText(
        rawPlayer.name
      );

    const normalizedName =
      normalizedText(
        rawPlayer.name
      );

    const teamId =
      explicitTeamId(
        rawPlayer
      );

    const winner =
      explicitBoolean(
        rawPlayer.winner
      );

    if (
      !name ||
      !normalizedName ||
      !teamId ||
      winner === null
    ) {
      return null;
    }

    players.push({
      name,
      normalizedName,

      stablePlayerKey:
        stablePlayerKey(
          rawPlayer,
          index
        ),

      playerNumber:
        playerNumber(
          rawPlayer
        ),

      teamId,
      winner,
    });
  }

  const allKeys =
    players.map(
      (player) =>
        player.stablePlayerKey
    );

  if (
    new Set(
      allKeys
    ).size !==
    allKeys.length
  ) {
    return null;
  }

  const teams =
    new Map<
      string,
      PlayerEvidence[]
    >();

  for (
    const player
    of players
  ) {
    const members =
      teams.get(
        player.teamId
      ) ??
      [];

    members.push(
      player
    );

    teams.set(
      player.teamId,
      members
    );
  }

  if (
    teams.size !==
    2
  ) {
    return null;
  }

  const teamEntries =
    [...teams.entries()];

  const teamSizes =
    teamEntries.map(
      (
        [
          ,
          members,
        ]
      ) =>
        members.length
    );

  /*
   * This helper deliberately handles only unequal explicit teams.
   * Balanced 1v1–4v4 games remain governed by ReplayTeamResolution.
   */
  if (
    teamSizes[0] ===
    teamSizes[1]
  ) {
    return null;
  }

  const trueTeams =
    teamEntries
      .filter(
        (
          [
            ,
            members,
          ]
        ) =>
          members.every(
            (member) =>
              member.winner ===
              true
          )
      )
      .map(
        ([teamId]) =>
          teamId
      );

  const falseTeams =
    teamEntries
      .filter(
        (
          [
            ,
            members,
          ]
        ) =>
          members.every(
            (member) =>
              member.winner ===
              false
          )
      )
      .map(
        ([teamId]) =>
          teamId
      );

  if (
    trueTeams.length !==
      1 ||
    falseTeams.length !==
      1 ||
    trueTeams[0] ===
      falseTeams[0]
  ) {
    return null;
  }

  const keyEvents =
    record(
      input.keyEvents
    );

  const resignedNames =
    normalizedNameSet(
      keyEvents
        .resigned_player_names
    );

  const resignedNumbers =
    playerNumberSet(
      keyEvents
        .resigned_player_numbers
    );

  if (
    resignedNames.size ===
      0 &&
    resignedNumbers.size ===
      0
  ) {
    return null;
  }

  const resignationCounts =
    new Map<
      string,
      number
    >();

  for (
    const [
      teamId,
      members,
    ]
    of teamEntries
  ) {
    let count =
      0;

    for (
      const member
      of members
    ) {
      if (
        resignedNames.has(
          member.normalizedName
        ) ||
        (
          member.playerNumber !==
            null &&
          resignedNumbers.has(
            member.playerNumber
          )
        )
      ) {
        count += 1;
      }
    }

    resignationCounts.set(
      teamId,
      count
    );
  }

  const fullyResignedTeams =
    teamEntries
      .filter(
        (
          [
            teamId,
            members,
          ]
        ) =>
          resignationCounts.get(
            teamId
          ) ===
          members.length
      )
      .map(
        ([teamId]) =>
          teamId
      );

  const zeroResignedTeams =
    teamEntries
      .filter(
        ([teamId]) =>
          (
            resignationCounts.get(
              teamId
            ) ??
            0
          ) === 0
      )
      .map(
        ([teamId]) =>
          teamId
      );

  if (
    fullyResignedTeams.length !==
      1 ||
    zeroResignedTeams.length !==
      1
  ) {
    return null;
  }

  const losingTeamId =
    fullyResignedTeams[0];

  const winningTeamId =
    zeroResignedTeams[0];

  if (
    trueTeams[0] !==
      winningTeamId ||
    falseTeams[0] !==
      losingTeamId
  ) {
    return null;
  }

  const teamResolution =
    record(
      keyEvents
        .team_resolution
    );

  const resultResolution =
    record(
      keyEvents
        .result_resolution
    );

  const resultEvidence =
    record(
      resultResolution
        .result_evidence ??
      teamResolution
        .result_evidence
    );

  if (
    resultEvidence
      .resignation_result_conflict ===
      true
  ) {
    return null;
  }

  const winningMembers =
    teams.get(
      winningTeamId
    ) ??
    [];

  const losingMembers =
    teams.get(
      losingTeamId
    ) ??
    [];

  const winningPlayerKeys =
    winningMembers.map(
      (member) =>
        member.stablePlayerKey
    );

  const existingWinningTeamId =
    cleanText(
      resultResolution
        .winning_team_id ??
      teamResolution
        .winning_team_id
    );

  if (
    existingWinningTeamId &&
    existingWinningTeamId !==
      winningTeamId &&
    !winningPlayerKeys.includes(
      existingWinningTeamId
    )
  ) {
    return null;
  }

  const storedWinner =
    meaningfulWinner(
      input.winner
    );

  /*
   * Public projection replaces an incomplete historical scalar
   * winner with the canonical complete winning-side label:
   *
   *   aus_die_maus / Weroloco5566
   *
   * When this helper runs again on that public row, the canonical
   * team label must support—not invalidate—the same strict result.
   *
   * We still accept only:
   *   1. one exact winning member name; or
   *   2. the exact complete winning-team label generated here.
   *
   * No arbitrary partial roster or mismatching scalar is accepted.
   */
  const canonicalWinningTeamLabel =
    winningMembers
      .map(
        (member) =>
          member.normalizedName
      )
      .join(" / ");

  const storedWinnerMatchesMember =
    Boolean(
      storedWinner
    ) &&
    winningMembers.some(
      (member) =>
        member.normalizedName ===
        storedWinner
    );

  const storedWinnerMatchesCompleteTeam =
    Boolean(
      storedWinner
    ) &&
    storedWinner ===
      canonicalWinningTeamLabel;

  if (
    storedWinner &&
    !storedWinnerMatchesMember &&
    !storedWinnerMatchesCompleteTeam
  ) {
    return null;
  }

  return {
    winningTeamId,
    losingTeamId,

    winningPlayerNames:
      winningMembers.map(
        (member) =>
          member.name
      ),

    winningPlayerKeys,

    losingPlayerNames:
      losingMembers.map(
        (member) =>
          member.name
      ),

    losingPlayerKeys:
      losingMembers.map(
        (member) =>
          member.stablePlayerKey
      ),
  };
}
