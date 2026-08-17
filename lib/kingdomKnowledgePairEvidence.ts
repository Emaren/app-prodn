export type KingdomPairRelationship =
  | "teammates"
  | "opponents"
  | "unknown";

export type KingdomPairMeeting = {
  id: number | string | null;
  relationship: KingdomPairRelationship;
  result:
    | "won_together"
    | "lost_together"
    | "first_won"
    | "second_won"
    | "unknown";
  winner: string | null;
  winnerProof: string | null;
  mapName: string | null;
  playedAt: string | null;
  firstPlayerName: string;
  secondPlayerName: string;
};

export type KingdomPairEvidence = {
  queryPlayers: [string, string];
  meetingsFound: number;
  teammates: number;
  opponents: number;
  unknownRelationship: number;
  meetings: KingdomPairMeeting[];
  note: string;
};

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function normalize(value: unknown) {
  return (cleanText(value) ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readPlayers(game: Row) {
  return Array.isArray(game.players)
    ? game.players
        .map(asRow)
        .filter((row): row is Row => Boolean(row))
    : [];
}

function playerName(player: Row) {
  return (
    cleanText(player.name) ??
    cleanText(player.currentName) ??
    cleanText(player.displayName) ??
    cleanText(player.steamPersonaName) ??
    ""
  );
}

function playerTeam(player: Row) {
  for (const key of ["teamId", "team_id", "team"]) {
    const value = player[key];
    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return String(value);
    }
  }

  return null;
}

function playerWinner(player: Row) {
  return typeof player.winner === "boolean"
    ? player.winner
    : null;
}

function readMapName(game: Row) {
  const map = asRow(game.map);
  return (
    cleanText(map?.name) ??
    cleanText(game.mapName) ??
    cleanText(game.map_name)
  );
}

function readPlayedAt(game: Row) {
  for (const key of [
    "playedAt",
    "played_on",
    "playedOn",
    "createdAt",
    "created_at",
    "timestamp",
  ]) {
    const value = cleanText(game[key]);
    if (value) return value;
  }

  return null;
}

function resolveTeamFromStructuredTruth(
  game: Row,
  firstName: string,
  secondName: string,
): KingdomPairRelationship | null {
  const teamResolution =
    asRow(game.teamResolution) ??
    asRow(game.team_resolution) ??
    asRow(asRow(game.key_events)?.team_resolution) ??
    asRow(asRow(game.keyEvents)?.team_resolution);

  if (!teamResolution || !Array.isArray(teamResolution.teams)) {
    return null;
  }

  let firstTeam: number | null = null;
  let secondTeam: number | null = null;

  teamResolution.teams.forEach((team, index) => {
    const row = asRow(team);
    if (!row || !Array.isArray(row.players)) return;

    const names = row.players
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const player = asRow(entry);
        return player ? playerName(player) : "";
      })
      .map(normalize);

    if (names.some((name) => name.includes(firstName))) {
      firstTeam = index;
    }

    if (names.some((name) => name.includes(secondName))) {
      secondTeam = index;
    }
  });

  if (firstTeam === null || secondTeam === null) return null;

  return firstTeam === secondTeam
    ? "teammates"
    : "opponents";
}

function resolveRelationship(
  game: Row,
  first: Row,
  second: Row,
  firstTerm: string,
  secondTerm: string,
): KingdomPairRelationship {
  const structured = resolveTeamFromStructuredTruth(
    game,
    firstTerm,
    secondTerm,
  );
  if (structured) return structured;

  const firstTeam = playerTeam(first);
  const secondTeam = playerTeam(second);

  if (firstTeam !== null && secondTeam !== null) {
    return firstTeam === secondTeam
      ? "teammates"
      : "opponents";
  }

  const firstWinner = playerWinner(first);
  const secondWinner = playerWinner(second);

  if (
    firstWinner !== null &&
    secondWinner !== null &&
    firstWinner !== secondWinner
  ) {
    return "opponents";
  }

  const winnerText = normalize(game.winner);

  if (
    firstWinner === true &&
    secondWinner === true &&
    winnerText.includes(firstTerm) &&
    winnerText.includes(secondTerm)
  ) {
    return "teammates";
  }

  return "unknown";
}

function resolveResult(
  relationship: KingdomPairRelationship,
  first: Row,
  second: Row,
): KingdomPairMeeting["result"] {
  const firstWinner = playerWinner(first);
  const secondWinner = playerWinner(second);

  if (relationship === "teammates") {
    if (firstWinner === true && secondWinner === true) {
      return "won_together";
    }

    if (firstWinner === false && secondWinner === false) {
      return "lost_together";
    }

    return "unknown";
  }

  if (relationship === "opponents") {
    if (firstWinner === true && secondWinner === false) {
      return "first_won";
    }

    if (firstWinner === false && secondWinner === true) {
      return "second_won";
    }
  }

  return "unknown";
}

export function summarizeKingdomPairEvidence(
  games: unknown[],
  queryTerms: string[],
): KingdomPairEvidence | null {
  const terms = Array.from(
    new Set(
      queryTerms
        .map(normalize)
        .filter((term) => term.length >= 2),
    ),
  );

  if (terms.length !== 2) return null;

  const [firstTerm, secondTerm] = terms as [string, string];
  const meetings: KingdomPairMeeting[] = [];

  for (const value of games) {
    const game = asRow(value);
    if (!game) continue;

    const players = readPlayers(game);

    const first = players.find((player) =>
      normalize(playerName(player)).includes(firstTerm),
    );
    const second = players.find((player) =>
      normalize(playerName(player)).includes(secondTerm),
    );

    if (!first || !second || first === second) continue;

    const relationship = resolveRelationship(
      game,
      first,
      second,
      firstTerm,
      secondTerm,
    );

    meetings.push({
      id:
        typeof game.id === "number" || typeof game.id === "string"
          ? game.id
          : null,
      relationship,
      result: resolveResult(relationship, first, second),
      winner: cleanText(game.winner),
      winnerProof:
        cleanText(game.winnerProof) ??
        cleanText(game.winner_proof),
      mapName: readMapName(game),
      playedAt: readPlayedAt(game),
      firstPlayerName: playerName(first),
      secondPlayerName: playerName(second),
    });
  }

  const teammates = meetings.filter(
    (meeting) => meeting.relationship === "teammates",
  ).length;

  const opponents = meetings.filter(
    (meeting) => meeting.relationship === "opponents",
  ).length;

  const unknownRelationship =
    meetings.length - teammates - opponents;

  return {
    queryPlayers: [firstTerm, secondTerm],
    meetingsFound: meetings.length,
    teammates,
    opponents,
    unknownRelationship,
    meetings: meetings.slice(0, 12),
    note:
      meetings.length > 0
        ? "Positive participant co-occurrence exists. Do not claim there is no public record of these players meeting."
        : "No participant co-occurrence was found in this bounded repository payload. This does not prove there is no historical public record.",
  };
}

export type KingdomPairArchiveMeeting = {
  id: number | string | null;
  relationship: KingdomPairRelationship;
  battleType: "1v1" | "team_game" | "unknown";
  result:
    | "won_together"
    | "lost_together"
    | "first_won"
    | "second_won"
    | "unknown";
  mapName: string | null;
  playedAt: string | null;
  playersLabel: string;
  winnerLabel: string | null;
  sourceQueryPlayer: string;
};

export type KingdomPairArchiveEvidence = {
  queryPlayers: [string, string];
  meetingsFound: number;
  oneVOneOpponents: number;
  teamOpponents: number;
  teammates: number;
  unknownRelationship: number;
  firstPlayerWins: number;
  secondPlayerWins: number;
  winsTogether: number;
  lossesTogether: number;
  unknownResults: number;
  meetings: KingdomPairArchiveMeeting[];
  note: string;
};

export type KingdomPairArchivePage = {
  queryPlayer: string;
  page: unknown;
};

function splitPlayersSide(value: string) {
  return value
    .split(/\s*(?:\/|\+)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePlayersLabel(value: unknown) {
  const label = cleanText(value);
  if (!label) return null;

  const sides = label.split(/\s+vs\s+/i);
  if (sides.length !== 2) {
    return {
      label,
      left: [] as string[],
      right: [] as string[],
    };
  }

  return {
    label,
    left: splitPlayersSide(sides[0] ?? ""),
    right: splitPlayersSide(sides[1] ?? ""),
  };
}

function sideContainsTerm(side: string[], term: string) {
  return side.some((name) => normalize(name).includes(term));
}

function pairArchiveRelationship(
  parsed: ReturnType<typeof parsePlayersLabel>,
  firstTerm: string,
  secondTerm: string,
): {
  relationship: KingdomPairRelationship;
  battleType: KingdomPairArchiveMeeting["battleType"];
} | null {
  if (!parsed) return null;

  const firstLeft = sideContainsTerm(parsed.left, firstTerm);
  const firstRight = sideContainsTerm(parsed.right, firstTerm);
  const secondLeft = sideContainsTerm(parsed.left, secondTerm);
  const secondRight = sideContainsTerm(parsed.right, secondTerm);

  if (!(firstLeft || firstRight) || !(secondLeft || secondRight)) {
    return null;
  }

  const sameSide =
    (firstLeft && secondLeft) ||
    (firstRight && secondRight);

  const oppositeSides =
    (firstLeft && secondRight) ||
    (firstRight && secondLeft);

  let relationship: KingdomPairRelationship = "unknown";
  if (sameSide) relationship = "teammates";
  else if (oppositeSides) relationship = "opponents";

  const battleType =
    relationship === "opponents" &&
    parsed.left.length === 1 &&
    parsed.right.length === 1
      ? "1v1"
      : parsed.left.length > 0 && parsed.right.length > 0
        ? "team_game"
        : "unknown";

  return {
    relationship,
    battleType,
  };
}

function archiveResultForQueryPlayer(
  item: Row,
  queryPlayer: string,
  firstTerm: string,
  secondTerm: string,
  relationship: KingdomPairRelationship,
): KingdomPairArchiveMeeting["result"] {
  const rawResult = normalize(item.result);

  if (
    rawResult !== "win" &&
    rawResult !== "loss"
  ) {
    return "unknown";
  }

  const query = normalize(queryPlayer);

  if (relationship === "teammates") {
    return rawResult === "win"
      ? "won_together"
      : "lost_together";
  }

  if (relationship !== "opponents") {
    return "unknown";
  }

  const queryIsFirst = query.includes(firstTerm);
  const queryIsSecond = query.includes(secondTerm);

  if (queryIsFirst) {
    return rawResult === "win"
      ? "first_won"
      : "second_won";
  }

  if (queryIsSecond) {
    return rawResult === "win"
      ? "second_won"
      : "first_won";
  }

  return "unknown";
}

function archiveMeetingPreference(
  meeting: KingdomPairArchiveMeeting,
) {
  let score = 0;

  if (meeting.relationship !== "unknown") score += 10;
  if (meeting.battleType !== "unknown") score += 5;
  if (meeting.result !== "unknown") score += 10;
  if (meeting.winnerLabel) score += 2;
  if (meeting.mapName) score += 1;
  if (meeting.playedAt) score += 1;

  return score;
}

export function summarizeKingdomPairArchiveEvidence(
  pages: KingdomPairArchivePage[],
  queryTerms: string[],
): KingdomPairArchiveEvidence | null {
  const terms = Array.from(
    new Set(
      queryTerms
        .map(normalize)
        .filter((term) => term.length >= 2),
    ),
  );

  if (terms.length !== 2) return null;

  const [firstTerm, secondTerm] = terms as [string, string];
  const meetingsByKey = new Map<string, KingdomPairArchiveMeeting>();

  for (const source of pages) {
    const page = asRow(source.page);
    const items = Array.isArray(page?.items)
      ? page.items
      : [];

    for (const value of items) {
      const item = asRow(value);
      if (!item) continue;

      const parsed = parsePlayersLabel(item.playersLabel);
      const relation = pairArchiveRelationship(
        parsed,
        firstTerm,
        secondTerm,
      );

      if (!parsed || !relation) continue;

      const id =
        typeof item.id === "number" ||
        typeof item.id === "string"
          ? item.id
          : null;

      const meeting: KingdomPairArchiveMeeting = {
        id,
        relationship: relation.relationship,
        battleType: relation.battleType,
        result: archiveResultForQueryPlayer(
          item,
          source.queryPlayer,
          firstTerm,
          secondTerm,
          relation.relationship,
        ),
        mapName: cleanText(item.mapName),
        playedAt: cleanText(item.playedAt),
        playersLabel: parsed.label,
        winnerLabel: cleanText(item.winnerLabel),
        sourceQueryPlayer: source.queryPlayer,
      };

      const key =
        id !== null
          ? `id:${String(id)}`
          : [
              normalize(parsed.label),
              normalize(item.playedAt),
              normalize(item.mapName),
            ].join("|");

      const current = meetingsByKey.get(key);

      if (
        !current ||
        archiveMeetingPreference(meeting) >
          archiveMeetingPreference(current)
      ) {
        meetingsByKey.set(key, meeting);
      }
    }
  }

  const meetings = Array.from(meetingsByKey.values())
    .sort((left, right) => {
      const leftTime = left.playedAt
        ? Date.parse(left.playedAt)
        : 0;
      const rightTime = right.playedAt
        ? Date.parse(right.playedAt)
        : 0;

      if (
        Number.isFinite(leftTime) &&
        Number.isFinite(rightTime) &&
        leftTime !== rightTime
      ) {
        return rightTime - leftTime;
      }

      return String(right.id ?? "").localeCompare(
        String(left.id ?? ""),
      );
    });

  const oneVOneOpponents = meetings.filter(
    (meeting) =>
      meeting.relationship === "opponents" &&
      meeting.battleType === "1v1",
  ).length;

  const teamOpponents = meetings.filter(
    (meeting) =>
      meeting.relationship === "opponents" &&
      meeting.battleType === "team_game",
  ).length;

  const teammates = meetings.filter(
    (meeting) =>
      meeting.relationship === "teammates",
  ).length;

  const unknownRelationship = meetings.filter(
    (meeting) =>
      meeting.relationship === "unknown",
  ).length;

  const firstPlayerWins = meetings.filter(
    (meeting) => meeting.result === "first_won",
  ).length;

  const secondPlayerWins = meetings.filter(
    (meeting) => meeting.result === "second_won",
  ).length;

  const winsTogether = meetings.filter(
    (meeting) => meeting.result === "won_together",
  ).length;

  const lossesTogether = meetings.filter(
    (meeting) => meeting.result === "lost_together",
  ).length;

  const unknownResults =
    meetings.length -
    firstPlayerWins -
    secondPlayerWins -
    winsTogether -
    lossesTogether;

  return {
    queryPlayers: [firstTerm, secondTerm],
    meetingsFound: meetings.length,
    oneVOneOpponents,
    teamOpponents,
    teammates,
    unknownRelationship,
    firstPlayerWins,
    secondPlayerWins,
    winsTogether,
    lossesTogether,
    unknownResults,
    meetings: meetings.slice(0, 24),
    note:
      meetings.length > 0
        ? "Targeted player archives contain positive pair evidence. Do not claim there is no public record of these players meeting in any relationship represented here."
        : "No pair meeting was found in the targeted player archives returned for these exact query names. Do not convert this bounded result into an absolute historical no-record claim.",
  };
}
