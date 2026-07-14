import { publicReplayIdentity } from "@/lib/publicReplayTruth";
import type { PrismaClient } from "@/lib/generated/prisma";

import {
  displayPlayerName,
  parsePlayers,
  readMapName,
  readPlayedAt,
} from "@/lib/gameStatsView";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import {
  applyPendingWoloClaimSummary,
  buildPublicPlayerRef,
  buildReplayPublicPlayerRef,
  type PublicPlayerRef,
  findClaimedUsersForReplayNames,
  publicPlayerMatchesName,
  resolvePublicPlayerToken,
} from "@/lib/publicPlayers";
import {
  loadPendingWoloClaimSummariesByName,
} from "@/lib/pendingWoloClaims";
import {
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";
import {
  applyReplayAdjudicationToGameStats,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import {
  parseReplaySides,
  teamRivalryFormatLabel,
  type ParsedReplaySides,
  type ReplaySideFormat,
} from "@/lib/replaySides";

const RECENT_FINAL_MATCH_SCAN_LIMIT = 5000;

type TeamFormat = Exclude<
  ReplaySideFormat,
  "1v1"
>;

export type MatchupGameRow = {
  id: number;
  winner: string | null;
  players: unknown;
  played_on: Date | string | null;
  timestamp: Date | string | null;
  createdAt?: Date | string | null;
  original_filename?: string | null;
  replay_file?: string | null;
  parse_reason?: string | null;
  map?: unknown;
  disconnect_detected?: boolean;
  duration?: number | null;
  game_duration?: number | null;
  event_types?: unknown;
  key_events?: unknown;
  parse_source?: string | null;
};

export type RivalSummary = {
  ref: PublicPlayerRef;
  totalMatches: number;
  wins: number;
  losses: number;
  unknowns: number;
  lastPlayedAt: string | null;
};

export type PublicRivalryEntry = {
  key: string;
  left: PublicPlayerRef;
  right: PublicPlayerRef;
  leftWins: number;
  rightWins: number;
  unknowns: number;
  totalMatches: number;
  lastPlayedAt: string | null;
  href: string;
};

export type PublicTeamRivalryEntry = {
  key: string;
  format: TeamFormat;
  teamSize: number;
  left: PublicPlayerRef[];
  right: PublicPlayerRef[];
  leftLabel: string;
  rightLabel: string;
  leftWins: number;
  rightWins: number;
  unknowns: number;
  totalMatches: number;
  lastPlayedAt: string | null;
  href: string;
};

export type PublicRivalryActivityEntry = {
  key: string;
  gameId: number;
  kind: "duel" | "team";
  format: ReplaySideFormat;
  href: string;
  replayHref: string;
  marketHref: string | null;
  mapName: string;
  playedAt: string | null;
  left: PublicPlayerRef[];
  right: PublicPlayerRef[];
  winnerLabel: string | null;
};

export type PublicLatestRivalry =
  | {
      kind: "duel";
      rivalry: PublicRivalryEntry;
      latestGame: PublicRivalryActivityEntry;
    }
  | {
      kind: "team";
      rivalry: PublicTeamRivalryEntry;
      latestGame: PublicRivalryActivityEntry;
    };

export function canonicalizeMatchupPlayers(
  left: PublicPlayerRef,
  right: PublicPlayerRef
) {
  return [left, right].sort((a, b) => {
    if (a.token === b.token) return 0;
    return a.token.localeCompare(b.token);
  }) as [PublicPlayerRef, PublicPlayerRef];
}

export function buildMatchupHref(
  left: PublicPlayerRef,
  right: PublicPlayerRef
) {
  const [canonicalLeft, canonicalRight] =
    canonicalizeMatchupPlayers(left, right);

  return `/matchups/${encodeURIComponent(
    canonicalLeft.token
  )}/${encodeURIComponent(canonicalRight.token)}`;
}

function updateLastPlayedAt(
  current: string | null,
  next: Date | string | null
) {
  if (!next) return current;

  const nextDate = new Date(next);

  if (Number.isNaN(nextDate.getTime())) {
    return current;
  }

  if (!current) {
    return nextDate.toISOString();
  }

  const currentDate = new Date(current);

  if (
    Number.isNaN(currentDate.getTime()) ||
    nextDate > currentDate
  ) {
    return nextDate.toISOString();
  }

  return current;
}

function normalizeNameKey(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeWinnerName(value: unknown) {
  const winner = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (
    !winner ||
    winner.toLowerCase() === "unknown" ||
    winner.toLowerCase() === "winner unresolved"
  ) {
    return null;
  }

  return winner;
}

function matchWinnerFlagIsTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function resolveMatchWinnerName(
  game: MatchupGameRow
) {
  const adjudicatedGame =
    applyReplayAdjudicationToGameStats(game);

  return normalizeWinnerName(
    resolveReliableReplayWinner({
      winner: adjudicatedGame.winner,
      players: parsePlayers(
        adjudicatedGame.players
      ),
      parseReason: adjudicatedGame.parse_reason,
      parseSource: adjudicatedGame.parse_source,
      keyEvents: adjudicatedGame.key_events,
      eventTypes: adjudicatedGame.event_types,
    })
  );
}

function sideContainsName(
  side: ParsedReplaySides["left"],
  name: string
) {
  const key = normalizeNameKey(name);

  return side.some(
    (member) =>
      normalizeNameKey(member.name) === key
  );
}

function resolveParsedWinnerSide(
  game: MatchupGameRow,
  sides: ParsedReplaySides
): "left" | "right" | null {
  const adjudicatedGame =
    applyReplayAdjudicationToGameStats(game);
  const winner = resolveMatchWinnerName(adjudicatedGame);

  if (!winner) {
    return null;
  }

  const flaggedWinnerNames = parsePlayers(
    adjudicatedGame.players
  )
    .filter((player) => matchWinnerFlagIsTrue(player.winner))
    .map((player) => displayPlayerName(player))
    .filter(Boolean);

  const flaggedSides = new Set<
    "left" | "right"
  >();

  for (const flaggedName of flaggedWinnerNames) {
    if (
      sideContainsName(
        sides.left,
        flaggedName
      )
    ) {
      flaggedSides.add("left");
    }

    if (
      sideContainsName(
        sides.right,
        flaggedName
      )
    ) {
      flaggedSides.add("right");
    }
  }

  if (flaggedSides.size === 1) {
    return [...flaggedSides][0];
  }

  if (flaggedSides.size > 1) {
    return null;
  }

  const leftWinner = sideContainsName(
    sides.left,
    winner
  );
  const rightWinner = sideContainsName(
    sides.right,
    winner
  );

  return leftWinner !== rightWinner
    ? leftWinner
      ? "left"
      : "right"
    : null;
}

function winnerMatchesPlayer(
  player: PublicPlayerRef,
  game: MatchupGameRow
) {
  const winner = resolveMatchWinnerName(game);
  if (!winner) return false;

  const adjudicatedGame = applyReplayAdjudicationToGameStats(game);
  const playerRecord = parsePlayers(adjudicatedGame.players).find((candidate) =>
    publicPlayerMatchesName(player, displayPlayerName(candidate))
  );

  if (playerRecord && matchWinnerFlagIsTrue(playerRecord.winner)) {
    return true;
  }

  return publicPlayerMatchesName(player, winner);
}

function sortMatchRowsByPlayedAtDesc(
  left: MatchupGameRow,
  right: MatchupGameRow
) {
  const playedAtDelta =
    getLobbyMatchPlayedAtMs(right) -
    getLobbyMatchPlayedAtMs(left);

  if (playedAtDelta !== 0) {
    return playedAtDelta;
  }

  return right.id - left.id;
}

export async function loadRecentFinalMatchupRows(
  prisma: PrismaClient,
  take: number
) {
  const candidateMatches =
    await prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [
        { timestamp: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: Math.max(
        take,
        RECENT_FINAL_MATCH_SCAN_LIMIT
      ),
      select: {
        id: true,
        winner: true,
        players: true,
        played_on: true,
        timestamp: true,
        createdAt: true,
        original_filename: true,
        replay_file: true,
        parse_reason: true,
        map: true,
        disconnect_detected: true,
        duration: true,
        game_duration: true,
        event_types: true,
        key_events: true,
        parse_source: true,
        replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      },
    });

  return candidateMatches
    .map((game) => applyReplayAdjudicationToGameStats(game) as MatchupGameRow)
    .sort(sortMatchRowsByPlayedAtDesc)
    .slice(0, take);
}

function sideHasPlayer(
  side: ParsedReplaySides["left"],
  player: PublicPlayerRef
) {
  return side.some((member) =>
    publicPlayerMatchesName(
      player,
      member.name
    )
  );
}

export function filterHeadToHeadMatches(
  games: MatchupGameRow[],
  left: PublicPlayerRef,
  right: PublicPlayerRef
) {
  return games.filter((game) => {
    const sides = parseReplaySides(game.players);

    if (!sides || sides.format !== "1v1") {
      return false;
    }

    const direct =
      sideHasPlayer(sides.left, left) &&
      sideHasPlayer(sides.right, right);

    const reversed =
      sideHasPlayer(sides.left, right) &&
      sideHasPlayer(sides.right, left);

    return direct || reversed;
  });
}

export function summarizeHeadToHead(
  games: MatchupGameRow[],
  left: PublicPlayerRef,
  right: PublicPlayerRef
) {
  let leftWins = 0;
  let rightWins = 0;
  let unknowns = 0;
  let lastPlayedAt: string | null = null;

  for (const game of games) {
    if (winnerMatchesPlayer(left, game)) {
      leftWins += 1;
    } else if (
      winnerMatchesPlayer(right, game)
    ) {
      rightWins += 1;
    } else {
      unknowns += 1;
    }

    lastPlayedAt = updateLastPlayedAt(
      lastPlayedAt,
      readPlayedAt(game)
    );
  }

  return {
    leftWins,
    rightWins,
    unknowns,
    totalMatches: games.length,
    lastPlayedAt,
  };
}

export type PlayerPairBattleRelationship =
  | "duel"
  | "team_opponents"
  | "team_allies";

type PlayerPairBattleSide =
  | "left"
  | "right";

export type PlayerPairBattle = {
  game: MatchupGameRow;
  format: ReplaySideFormat;
  relationship: PlayerPairBattleRelationship;
  leftSideNames: string[];
  rightSideNames: string[];
  leftPlayerSide: PlayerPairBattleSide;
  rightPlayerSide: PlayerPairBattleSide;
  winnerSide: PlayerPairBattleSide | null;
  exactTeam: {
    href: string;
    leftNames: string[];
    rightNames: string[];
  } | null;
};

export type PlayerPairTeamSeries = {
  key: string;
  href: string;
  format: Exclude<
    ReplaySideFormat,
    "1v1"
  >;
  leftNames: string[];
  rightNames: string[];
  meetingCount: number;
  lastPlayedAt: string | null;
};

export type PlayerPairRivalryContext = {
  opposingBattles: PlayerPairBattle[];
  alliedBattles: PlayerPairBattle[];
  teamSeries: PlayerPairTeamSeries[];
  duelCount: number;
  teamBattleCount: number;
  tagTeamCount: number;
  triTeamCount: number;
  warTeamCount: number;
  alliedBattleCount: number;
  leftWins: number;
  rightWins: number;
  unknowns: number;
  totalMatches: number;
  lastPlayedAt: string | null;
};

function locatePlayerSide(
  sides: ParsedReplaySides,
  player: PublicPlayerRef
): PlayerPairBattleSide | null {
  const onLeft = sideHasPlayer(
    sides.left,
    player
  );

  const onRight = sideHasPlayer(
    sides.right,
    player
  );

  if (onLeft === onRight) {
    return null;
  }

  return onLeft ? "left" : "right";
}

function buildExactTeamIdentity(
  sides: ParsedReplaySides
) {
  if (sides.format === "1v1") {
    return null;
  }

  const rawLeft = sides.left.map(
    (member) =>
      buildReplayPublicPlayerRef(
        member.name
      )
  );

  const rawRight = sides.right.map(
    (member) =>
      buildReplayPublicPlayerRef(
        member.name
      )
  );

  const canonical =
    canonicalizeTeamRosters(
      rawLeft,
      rawRight
    );

  return {
    href: buildTeamMatchupHref(
      canonical.left,
      canonical.right
    ),
    leftNames: canonical.left.map(
      (player) => player.name
    ),
    rightNames: canonical.right.map(
      (player) => player.name
    ),
  };
}

function buildPlayerPairBattle(
  game: MatchupGameRow,
  leftPlayer: PublicPlayerRef,
  rightPlayer: PublicPlayerRef
): PlayerPairBattle | null {
  const sides = parseReplaySides(game.players);

  if (!sides) {
    return null;
  }

  const leftPlayerSide = locatePlayerSide(
    sides,
    leftPlayer
  );

  const rightPlayerSide = locatePlayerSide(
    sides,
    rightPlayer
  );

  if (
    !leftPlayerSide ||
    !rightPlayerSide
  ) {
    return null;
  }

  let relationship:
    | PlayerPairBattleRelationship
    | null = null;

  if (
    leftPlayerSide === rightPlayerSide
  ) {
    if (sides.format === "1v1") {
      return null;
    }

    relationship = "team_allies";
  } else {
    relationship =
      sides.format === "1v1"
        ? "duel"
        : "team_opponents";
  }

  return {
    game,
    format: sides.format,
    relationship,
    leftSideNames: sides.left.map(
      (member) => member.name
    ),
    rightSideNames: sides.right.map(
      (member) => member.name
    ),
    leftPlayerSide,
    rightPlayerSide,
    winnerSide: resolveParsedWinnerSide(
      game,
      sides
    ),
    exactTeam:
      buildExactTeamIdentity(sides),
  };
}

export function buildPlayerPairRivalryContext(
  games: MatchupGameRow[],
  leftPlayer: PublicPlayerRef,
  rightPlayer: PublicPlayerRef
): PlayerPairRivalryContext {
  const battles = games
    .map((game) =>
      buildPlayerPairBattle(
        game,
        leftPlayer,
        rightPlayer
      )
    )
    .filter(
      (
        battle
      ): battle is PlayerPairBattle =>
        battle !== null
    );

  const opposingBattles = battles.filter(
    (battle) =>
      battle.relationship === "duel" ||
      battle.relationship ===
        "team_opponents"
  );

  const alliedBattles = battles.filter(
    (battle) =>
      battle.relationship === "team_allies"
  );

  let leftWins = 0;
  let rightWins = 0;
  let unknowns = 0;
  let lastPlayedAt: string | null = null;

  for (const battle of opposingBattles) {
    if (!battle.winnerSide) {
      unknowns += 1;
    } else if (
      battle.winnerSide ===
      battle.leftPlayerSide
    ) {
      leftWins += 1;
    } else if (
      battle.winnerSide ===
      battle.rightPlayerSide
    ) {
      rightWins += 1;
    } else {
      unknowns += 1;
    }

    lastPlayedAt = updateLastPlayedAt(
      lastPlayedAt,
      readPlayedAt(battle.game)
    );
  }

  const teamSeriesByHref = new Map<
    string,
    PlayerPairTeamSeries
  >();

  for (const battle of opposingBattles) {
    if (
      battle.relationship !==
        "team_opponents" ||
      !battle.exactTeam
    ) {
      continue;
    }

    const existing =
      teamSeriesByHref.get(
        battle.exactTeam.href
      ) ||
      ({
        key: battle.exactTeam.href,
        href: battle.exactTeam.href,
        format:
          battle.format as Exclude<
            ReplaySideFormat,
            "1v1"
          >,
        leftNames:
          battle.exactTeam.leftNames,
        rightNames:
          battle.exactTeam.rightNames,
        meetingCount: 0,
        lastPlayedAt: null,
      } satisfies PlayerPairTeamSeries);

    existing.meetingCount += 1;

    existing.lastPlayedAt =
      updateLastPlayedAt(
        existing.lastPlayedAt,
        readPlayedAt(battle.game)
      );

    teamSeriesByHref.set(
      battle.exactTeam.href,
      existing
    );
  }

  const teamSeries = Array.from(
    teamSeriesByHref.values()
  ).sort((left, right) => {
    if (
      left.meetingCount !==
      right.meetingCount
    ) {
      return (
        right.meetingCount -
        left.meetingCount
      );
    }

    if (
      left.lastPlayedAt &&
      right.lastPlayedAt
    ) {
      return (
        new Date(
          right.lastPlayedAt
        ).getTime() -
        new Date(
          left.lastPlayedAt
        ).getTime()
      );
    }

    if (
      left.lastPlayedAt ||
      right.lastPlayedAt
    ) {
      return left.lastPlayedAt
        ? -1
        : 1;
    }

    return left.key.localeCompare(
      right.key
    );
  });

  return {
    opposingBattles,
    alliedBattles,
    teamSeries,
    duelCount: opposingBattles.filter(
      (battle) =>
        battle.relationship === "duel"
    ).length,
    teamBattleCount:
      opposingBattles.filter(
        (battle) =>
          battle.relationship ===
          "team_opponents"
      ).length,
    tagTeamCount:
      opposingBattles.filter(
        (battle) =>
          battle.format === "2v2"
      ).length,
    triTeamCount:
      opposingBattles.filter(
        (battle) =>
          battle.format === "3v3"
      ).length,
    warTeamCount:
      opposingBattles.filter(
        (battle) =>
          battle.format === "4v4"
      ).length,
    alliedBattleCount:
      alliedBattles.length,
    leftWins,
    rightWins,
    unknowns,
    totalMatches: opposingBattles.length,
    lastPlayedAt,
  };
}

function readDuelOpponentName(
  match: MatchupGameRow,
  currentPlayer: PublicPlayerRef
) {
  const sides = parseReplaySides(match.players);

  if (!sides || sides.format !== "1v1") {
    return null;
  }

  if (
    sideHasPlayer(sides.left, currentPlayer)
  ) {
    return sides.right[0]?.name || null;
  }

  if (
    sideHasPlayer(sides.right, currentPlayer)
  ) {
    return sides.left[0]?.name || null;
  }

  return null;
}

export async function buildRivalSummaries(
  prisma: PrismaClient,
  matches: MatchupGameRow[],
  currentPlayer: PublicPlayerRef
) {
  // Individual rivalry cards are now true duels only.
  // Team games belong to roster-vs-roster boards.
  const duelMatches = matches
    .map((match) => ({
      match,
      opponentName: readDuelOpponentName(
        match,
        currentPlayer
      ),
    }))
    .filter(
      (
        entry
      ): entry is {
        match: MatchupGameRow;
        opponentName: string;
      } => Boolean(entry.opponentName)
    );

  const opponentNames = Array.from(
    new Set(
      duelMatches.map(
        (entry) => entry.opponentName
      )
    )
  );

  const claimedPlayers =
    await findClaimedUsersForReplayNames(
      prisma,
      opponentNames
    );

  const pendingClaimSummaries =
    await loadPendingWoloClaimSummariesByName(
      prisma,
      opponentNames
    );

  const summaries = new Map<
    string,
    RivalSummary
  >();

  for (const {
    match,
    opponentName,
  } of duelMatches) {
    const ref = applyPendingWoloClaimSummary(
      buildPublicPlayerRef(
        opponentName,
        claimedPlayers
      ),
      pendingClaimSummaries
    );

    const summary =
      summaries.get(ref.token) ||
      ({
        ref,
        totalMatches: 0,
        wins: 0,
        losses: 0,
        unknowns: 0,
        lastPlayedAt: null,
      } satisfies RivalSummary);

    summary.totalMatches += 1;
    summary.lastPlayedAt = updateLastPlayedAt(
      summary.lastPlayedAt,
      readPlayedAt(match)
    );

    if (
      winnerMatchesPlayer(
        currentPlayer,
        match
      )
    ) {
      summary.wins += 1;
    } else if (
      winnerMatchesPlayer(ref, match)
    ) {
      summary.losses += 1;
    } else {
      summary.unknowns += 1;
    }

    summaries.set(ref.token, summary);
  }

  return Array.from(summaries.values()).sort(
    (left, right) => {
      if (
        left.totalMatches !==
        right.totalMatches
      ) {
        return (
          right.totalMatches -
          left.totalMatches
        );
      }

      if (left.wins !== right.wins) {
        return right.wins - left.wins;
      }

      if (
        left.lastPlayedAt &&
        right.lastPlayedAt
      ) {
        return (
          new Date(
            right.lastPlayedAt
          ).getTime() -
          new Date(
            left.lastPlayedAt
          ).getTime()
        );
      }

      if (
        left.lastPlayedAt ||
        right.lastPlayedAt
      ) {
        return left.lastPlayedAt ? -1 : 1;
      }

      return left.ref.name.localeCompare(
        right.ref.name
      );
    }
  );
}

function sortIndividualRivalries(
  rivalries: PublicRivalryEntry[]
) {
  return rivalries.sort((left, right) => {
    if (
      left.totalMatches !== right.totalMatches
    ) {
      return (
        right.totalMatches -
        left.totalMatches
      );
    }

    if (
      left.lastPlayedAt &&
      right.lastPlayedAt
    ) {
      return (
        new Date(right.lastPlayedAt).getTime() -
        new Date(left.lastPlayedAt).getTime()
      );
    }

    if (
      left.lastPlayedAt ||
      right.lastPlayedAt
    ) {
      return left.lastPlayedAt ? -1 : 1;
    }

    return `${left.left.name} ${left.right.name}`.localeCompare(
      `${right.left.name} ${right.right.name}`
    );
  });
}

async function buildPublicDuelRivalries(
  prisma: PrismaClient,
  candidateMatches: MatchupGameRow[]
) {
  const duelSeeds = candidateMatches
    .map((match) => ({
      match,
      sides: parseReplaySides(match.players),
    }))
    .filter(
      (
        entry
      ): entry is {
        match: MatchupGameRow;
        sides: ParsedReplaySides;
      } => entry.sides?.format === "1v1"
    );

  const names = Array.from(
    new Set(
      duelSeeds.flatMap((entry) => [
        entry.sides.left[0].name,
        entry.sides.right[0].name,
      ])
    )
  );

  const claimedPlayers =
    await findClaimedUsersForReplayNames(
      prisma,
      names
    );

  const pendingClaimSummaries =
    await loadPendingWoloClaimSummariesByName(
      prisma,
      names
    );

  const rivalries = new Map<
    string,
    PublicRivalryEntry
  >();

  for (const entry of duelSeeds) {
    const firstRef =
      applyPendingWoloClaimSummary(
        buildPublicPlayerRef(
          entry.sides.left[0].name,
          claimedPlayers
        ),
        pendingClaimSummaries
      );

    const secondRef =
      applyPendingWoloClaimSummary(
        buildPublicPlayerRef(
          entry.sides.right[0].name,
          claimedPlayers
        ),
        pendingClaimSummaries
      );

    if (firstRef.token === secondRef.token) {
      continue;
    }

    const [left, right] =
      canonicalizeMatchupPlayers(
        firstRef,
        secondRef
      );

    const key = `${left.token}::${right.token}`;

    const rivalry =
      rivalries.get(key) ||
      ({
        key,
        left,
        right,
        leftWins: 0,
        rightWins: 0,
        unknowns: 0,
        totalMatches: 0,
        lastPlayedAt: null,
        href: buildMatchupHref(left, right),
      } satisfies PublicRivalryEntry);

    rivalry.totalMatches += 1;
    rivalry.lastPlayedAt = updateLastPlayedAt(
      rivalry.lastPlayedAt,
      readPlayedAt(entry.match)
    );

    if (winnerMatchesPlayer(left, entry.match)) {
      rivalry.leftWins += 1;
    } else if (
      winnerMatchesPlayer(right, entry.match)
    ) {
      rivalry.rightWins += 1;
    } else {
      rivalry.unknowns += 1;
    }

    rivalries.set(key, rivalry);
  }

  return sortIndividualRivalries(
    Array.from(rivalries.values())
  );
}

function sortRoster(
  roster: PublicPlayerRef[]
) {
  return [...roster].sort((left, right) =>
    left.token.localeCompare(right.token)
  );
}

function rosterKey(
  roster: PublicPlayerRef[]
) {
  return sortRoster(roster)
    .map((player) => player.token)
    .join("~");
}

function rosterLabel(
  roster: PublicPlayerRef[]
) {
  return roster
    .map((player) => player.name)
    .join(" / ");
}

function canonicalizeTeamRosters(
  left: PublicPlayerRef[],
  right: PublicPlayerRef[]
) {
  const sortedLeft = sortRoster(left);
  const sortedRight = sortRoster(right);

  if (
    rosterKey(sortedLeft).localeCompare(
      rosterKey(sortedRight)
    ) <= 0
  ) {
    return {
      left: sortedLeft,
      right: sortedRight,
      swapped: false,
    };
  }

  return {
    left: sortedRight,
    right: sortedLeft,
    swapped: true,
  };
}

function encodeTeamRosterToken(
  roster: PublicPlayerRef[]
) {
  return Buffer.from(
    JSON.stringify(
      sortRoster(roster).map(
        (player) => player.token
      )
    ),
    "utf8"
  ).toString("base64url");
}

export function decodeTeamRosterToken(
  token: string
) {
  try {
    const parsed = JSON.parse(
      Buffer.from(
        token,
        "base64url"
      ).toString("utf8")
    ) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    const tokens = Array.from(
      new Set(
        parsed
          .map((value) =>
            String(value || "").trim()
          )
          .filter(Boolean)
      )
    );

    if (
      tokens.length < 2 ||
      tokens.length > 4
    ) {
      return null;
    }

    return tokens;
  } catch {
    return null;
  }
}

export async function resolvePublicTeamRosterToken(
  prisma: PrismaClient,
  token: string
) {
  const playerTokens =
    decodeTeamRosterToken(token);

  if (!playerTokens) {
    return null;
  }

  const resolved = await Promise.all(
    playerTokens.map((playerToken) =>
      resolvePublicPlayerToken(
        prisma,
        playerToken
      )
    )
  );

  if (resolved.some((player) => !player)) {
    return null;
  }

  const roster = sortRoster(
    resolved as PublicPlayerRef[]
  );

  return new Set(
    roster.map((player) => player.token)
  ).size === roster.length
    ? roster
    : null;
}

export function buildTeamMatchupHref(
  left: PublicPlayerRef[],
  right: PublicPlayerRef[]
) {
  const canonical =
    canonicalizeTeamRosters(left, right);

  return `/matchups/team/${encodeURIComponent(
    encodeTeamRosterToken(canonical.left)
  )}/${encodeURIComponent(
    encodeTeamRosterToken(canonical.right)
  )}`;
}

function sideMatchesRoster(
  side: ParsedReplaySides["left"],
  roster: PublicPlayerRef[]
) {
  if (side.length !== roster.length) {
    return false;
  }

  const used = new Set<number>();

  for (const player of roster) {
    const matchIndex = side.findIndex(
      (member, index) =>
        !used.has(index) &&
        publicPlayerMatchesName(
          player,
          member.name
        )
    );

    if (matchIndex < 0) {
      return false;
    }

    used.add(matchIndex);
  }

  return true;
}

function teamMatchOrientation(
  sides: ParsedReplaySides,
  left: PublicPlayerRef[],
  right: PublicPlayerRef[]
) {
  const direct =
    sideMatchesRoster(sides.left, left) &&
    sideMatchesRoster(sides.right, right);

  if (direct) return "direct" as const;

  const reversed =
    sideMatchesRoster(sides.left, right) &&
    sideMatchesRoster(sides.right, left);

  return reversed ? ("reversed" as const) : null;
}

export function filterTeamMatchupMatches(
  games: MatchupGameRow[],
  left: PublicPlayerRef[],
  right: PublicPlayerRef[]
) {
  if (
    left.length !== right.length ||
    left.length < 2 ||
    left.length > 4
  ) {
    return [];
  }

  return games.filter((game) => {
    const effectiveGame = applyReplayAdjudicationToGameStats(game) as MatchupGameRow;
    const sides = parseReplaySides(effectiveGame.players);

    if (
      !sides ||
      sides.format === "1v1" ||
      sides.teamSize !== left.length
    ) {
      return false;
    }

    return Boolean(
      teamMatchOrientation(
        sides,
        left,
        right
      )
    );
  });
}

export function resolveTeamMatchWinnerSide(
  game: MatchupGameRow,
  left: PublicPlayerRef[],
  right: PublicPlayerRef[]
): "left" | "right" | null {
  const effectiveGame = applyReplayAdjudicationToGameStats(game) as MatchupGameRow;
  const sides = parseReplaySides(effectiveGame.players);

  if (!sides || sides.format === "1v1") {
    return null;
  }

  const orientation = teamMatchOrientation(
    sides,
    left,
    right
  );

  if (!orientation) {
    return null;
  }

  const parsedWinnerSide =
    resolveParsedWinnerSide(effectiveGame, sides);

  if (!parsedWinnerSide) {
    return null;
  }

  if (orientation === "direct") {
    return parsedWinnerSide;
  }

  return parsedWinnerSide === "left"
    ? "right"
    : "left";
}

export function summarizeTeamMatchup(
  games: MatchupGameRow[],
  left: PublicPlayerRef[],
  right: PublicPlayerRef[]
) {
  let leftWins = 0;
  let rightWins = 0;
  let unknowns = 0;
  let lastPlayedAt: string | null = null;

  for (const game of games) {
    const winnerSide =
      resolveTeamMatchWinnerSide(
        game,
        left,
        right
      );

    if (winnerSide === "left") {
      leftWins += 1;
    } else if (winnerSide === "right") {
      rightWins += 1;
    } else {
      unknowns += 1;
    }

    lastPlayedAt = updateLastPlayedAt(
      lastPlayedAt,
      readPlayedAt(game)
    );
  }

  return {
    leftWins,
    rightWins,
    unknowns,
    totalMatches: games.length,
    lastPlayedAt,
  };
}

function sortTeamRivalries(
  rivalries: PublicTeamRivalryEntry[]
) {
  return rivalries.sort((left, right) => {
    if (
      left.totalMatches !== right.totalMatches
    ) {
      return (
        right.totalMatches -
        left.totalMatches
      );
    }

    if (
      left.lastPlayedAt &&
      right.lastPlayedAt
    ) {
      return (
        new Date(right.lastPlayedAt).getTime() -
        new Date(left.lastPlayedAt).getTime()
      );
    }

    if (
      left.lastPlayedAt ||
      right.lastPlayedAt
    ) {
      return left.lastPlayedAt ? -1 : 1;
    }

    return `${left.leftLabel} ${left.rightLabel}`.localeCompare(
      `${right.leftLabel} ${right.rightLabel}`
    );
  });
}

async function buildPublicTeamRivalries(
  prisma: PrismaClient,
  candidateMatches: MatchupGameRow[]
) {
  const teamSeeds = candidateMatches
    .map((match) => ({
      match,
      sides: parseReplaySides(match.players),
    }))
    .filter(
      (
        entry
      ): entry is {
        match: MatchupGameRow;
        sides: ParsedReplaySides;
      } => {
        const sides = entry.sides;

        return (
          sides !== null &&
          sides.format !== "1v1" &&
          sides.confidence ===
            "explicit_balanced"
        );
      }
    );

  const names = Array.from(
    new Set(
      teamSeeds.flatMap((entry) => [
        ...entry.sides.left.map(
          (member) => member.name
        ),
        ...entry.sides.right.map(
          (member) => member.name
        ),
      ])
    )
  );

  const claimedPlayers =
    await findClaimedUsersForReplayNames(
      prisma,
      names
    );

  const pendingClaimSummaries =
    await loadPendingWoloClaimSummariesByName(
      prisma,
      names
    );

  const rivalries = new Map<
    string,
    PublicTeamRivalryEntry
  >();

  for (const entry of teamSeeds) {
    const rawLeft = entry.sides.left.map(
      (member) =>
        applyPendingWoloClaimSummary(
          buildPublicPlayerRef(
            member.name,
            claimedPlayers
          ),
          pendingClaimSummaries
        )
    );

    const rawRight = entry.sides.right.map(
      (member) =>
        applyPendingWoloClaimSummary(
          buildPublicPlayerRef(
            member.name,
            claimedPlayers
          ),
          pendingClaimSummaries
        )
    );

    if (
      new Set(
        [...rawLeft, ...rawRight].map(
          (player) => player.token
        )
      ).size !==
      rawLeft.length + rawRight.length
    ) {
      continue;
    }

    const canonical =
      canonicalizeTeamRosters(
        rawLeft,
        rawRight
      );

    const format =
      entry.sides.format as TeamFormat;

    const key = `${format}:${rosterKey(
      canonical.left
    )}::${rosterKey(canonical.right)}`;

    const rivalry =
      rivalries.get(key) ||
      ({
        key,
        format,
        teamSize: entry.sides.teamSize,
        left: canonical.left,
        right: canonical.right,
        leftLabel: rosterLabel(
          canonical.left
        ),
        rightLabel: rosterLabel(
          canonical.right
        ),
        leftWins: 0,
        rightWins: 0,
        unknowns: 0,
        totalMatches: 0,
        lastPlayedAt: null,
        href: buildTeamMatchupHref(
          canonical.left,
          canonical.right
        ),
      } satisfies PublicTeamRivalryEntry);

    rivalry.totalMatches += 1;
    rivalry.lastPlayedAt = updateLastPlayedAt(
      rivalry.lastPlayedAt,
      readPlayedAt(entry.match)
    );

    const rawWinner =
      resolveParsedWinnerSide(
        entry.match,
        entry.sides
      );

    const canonicalWinner = canonical.swapped
      ? rawWinner === "left"
        ? "right"
        : rawWinner === "right"
          ? "left"
          : null
      : rawWinner;

    if (canonicalWinner === "left") {
      rivalry.leftWins += 1;
    } else if (
      canonicalWinner === "right"
    ) {
      rivalry.rightWins += 1;
    } else {
      rivalry.unknowns += 1;
    }

    rivalries.set(key, rivalry);
  }

  return sortTeamRivalries(
    Array.from(rivalries.values())
  );
}

async function buildRecentRivalryActivity(
  prisma: PrismaClient,
  candidateMatches: MatchupGameRow[],
  take = 18
) {
  const seeds = candidateMatches
    .slice(
      0,
      Math.max(take * 4, 80)
    )
    .map((game) => ({
      game,
      sides: parseReplaySides(game.players),
    }))
    .filter(
      (
        entry
      ): entry is {
        game: MatchupGameRow;
        sides: ParsedReplaySides;
      } => entry.sides !== null
    );

  const names = Array.from(
    new Set(
      seeds.flatMap((entry) => [
        ...entry.sides.left.map(
          (member) => member.name
        ),
        ...entry.sides.right.map(
          (member) => member.name
        ),
      ])
    )
  );

  const claimedPlayers =
    await findClaimedUsersForReplayNames(
      prisma,
      names
    );

  const pendingClaimSummaries =
    await loadPendingWoloClaimSummariesByName(
      prisma,
      names
    );

  const sessionKeysForGame = (
    game: MatchupGameRow
  ) =>
    Array.from(
      new Set(
        [
          publicReplayIdentity(game),
          game.original_filename,
          game.replay_file,
        ]
          .map((value) =>
            String(value || "").trim()
          )
          .filter(Boolean)
      )
    );

  const gameIds = seeds.map(
    (entry) => entry.game.id
  );

  const sessionKeys = Array.from(
    new Set(
      seeds.flatMap((entry) =>
        sessionKeysForGame(entry.game)
      )
    )
  );

  const [
    gameMarketRows,
    sessionMarketRows,
  ] = await Promise.all([
    prisma.betMarket.findMany({
      where: {
        linkedGameStatsId: {
          in: gameIds,
        },
      },
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
        linkedGameStatsId: true,
      },
    }),
    sessionKeys.length > 0
      ? prisma.betMarket.findMany({
          where: {
            linkedSessionKey: {
              in: sessionKeys,
            },
          },
          orderBy: {
            id: "desc",
          },
          select: {
            id: true,
            linkedSessionKey: true,
          },
        })
      : Promise.resolve(
          [] as Array<{
            id: number;
            linkedSessionKey: string | null;
          }>
        ),
  ]);

  const marketByGameId = new Map<
    number,
    number
  >();

  for (const row of gameMarketRows) {
    if (
      row.linkedGameStatsId &&
      !marketByGameId.has(
        row.linkedGameStatsId
      )
    ) {
      marketByGameId.set(
        row.linkedGameStatsId,
        row.id
      );
    }
  }

  const marketBySessionKey = new Map<
    string,
    number
  >();

  for (const row of sessionMarketRows) {
    const key = String(
      row.linkedSessionKey || ""
    ).trim();

    if (
      key &&
      !marketBySessionKey.has(key)
    ) {
      marketBySessionKey.set(
        key,
        row.id
      );
    }
  }

  const marketHrefForGame = (
    game: MatchupGameRow
  ) => {
    const directMarketId =
      marketByGameId.get(game.id);

    if (directMarketId) {
      return `/bets/${directMarketId}`;
    }

    for (
      const key
      of sessionKeysForGame(game)
    ) {
      const marketId =
        marketBySessionKey.get(key);

      if (marketId) {
        return `/bets/${marketId}`;
      }
    }

    return null;
  };

  const refForName = (name: string) =>
    applyPendingWoloClaimSummary(
      buildPublicPlayerRef(
        name,
        claimedPlayers
      ),
      pendingClaimSummaries
    );

  const activity: PublicRivalryActivityEntry[] =
    [];

  for (const entry of seeds) {
    const playedAt = updateLastPlayedAt(
      null,
      readPlayedAt(entry.game)
    );

    if (entry.sides.format === "1v1") {
      const first = refForName(
        entry.sides.left[0].name
      );

      const second = refForName(
        entry.sides.right[0].name
      );

      if (first.token === second.token) {
        continue;
      }

      const [left, right] =
        canonicalizeMatchupPlayers(
          first,
          second
        );

      const winnerSide =
        resolveParsedWinnerSide(
          entry.game,
          entry.sides
        );

      const winnerLabel =
        winnerSide === "left"
          ? entry.sides.left[0].name
          : winnerSide === "right"
            ? entry.sides.right[0].name
            : null;

      activity.push({
        key: `game:${entry.game.id}`,
        gameId: entry.game.id,
        kind: "duel",
        format: "1v1",
        href: buildMatchupHref(
          left,
          right
        ),
        replayHref:
          `/game-stats/${entry.game.id}`,
        mapName: readMapName(
          entry.game.map
        ),
        playedAt,
        left: [left],
        right: [right],
        winnerLabel,
      marketHref: marketHrefForGame(entry.game),
      });
    } else {
      const rawLeft =
        entry.sides.left.map(
          (member) =>
            refForName(member.name)
        );

      const rawRight =
        entry.sides.right.map(
          (member) =>
            refForName(member.name)
        );

      const uniqueTokens = new Set(
        [...rawLeft, ...rawRight].map(
          (player) => player.token
        )
      );

      if (
        uniqueTokens.size !==
        rawLeft.length + rawRight.length
      ) {
        continue;
      }

      const canonical =
        canonicalizeTeamRosters(
          rawLeft,
          rawRight
        );

      const rawWinnerSide =
        resolveParsedWinnerSide(
          entry.game,
          entry.sides
        );

      const winnerSide =
        canonical.swapped
          ? rawWinnerSide === "left"
            ? "right"
            : rawWinnerSide === "right"
              ? "left"
              : null
          : rawWinnerSide;

      const winnerLabel =
        winnerSide === "left"
          ? rosterLabel(canonical.left)
          : winnerSide === "right"
            ? rosterLabel(canonical.right)
            : null;

      activity.push({
        key: `game:${entry.game.id}`,
        gameId: entry.game.id,
        kind: "team",
        format: entry.sides.format,
        href: buildTeamMatchupHref(
          canonical.left,
          canonical.right
        ),
        replayHref:
          `/game-stats/${entry.game.id}`,
        mapName: readMapName(
          entry.game.map
        ),
        playedAt,
        left: canonical.left,
        right: canonical.right,
        winnerLabel,
      marketHref: marketHrefForGame(entry.game),
      });
    }

    if (activity.length >= take) {
      break;
    }
  }

  return activity;
}

export async function loadPublicRivalries(
  prisma: PrismaClient,
  options?: { take?: number }
) {
  const candidateMatches =
    await loadRecentFinalMatchupRows(
      prisma,
      options?.take ??
        RECENT_FINAL_MATCH_SCAN_LIMIT
    );

  return buildPublicDuelRivalries(
    prisma,
    candidateMatches
  );
}

export async function loadPublicTeamRivalries(
  prisma: PrismaClient,
  options?: { take?: number }
) {
  const candidateMatches =
    await loadRecentFinalMatchupRows(
      prisma,
      options?.take ??
        RECENT_FINAL_MATCH_SCAN_LIMIT
    );

  return buildPublicTeamRivalries(
    prisma,
    candidateMatches
  );
}

export async function loadPublicRivalryBoards(
  prisma: PrismaClient,
  options?: {
    take?: number;
    activityTake?: number;
  }
) {
  const candidateMatches =
    await loadRecentFinalMatchupRows(
      prisma,
      options?.take ??
        RECENT_FINAL_MATCH_SCAN_LIMIT
    );

  const [
    duels,
    teams,
    recentActivity,
  ] = await Promise.all([
    buildPublicDuelRivalries(
      prisma,
      candidateMatches
    ),
    buildPublicTeamRivalries(
      prisma,
      candidateMatches
    ),
    buildRecentRivalryActivity(
      prisma,
      candidateMatches,
      options?.activityTake ?? 18
    ),
  ]);

  const latestGame =
    recentActivity[0] || null;

  let latestRivalry:
    | PublicLatestRivalry
    | null = null;

  if (latestGame?.kind === "duel") {
    const rivalry = duels.find(
      (entry) =>
        entry.href === latestGame.href
    );

    if (rivalry) {
      // AOE2WAR_LATEST_RIVALRY_MATCHUP_TRUTH
      //
      // Keep the featured rivalry aligned with the
      // complete player-rivalry page. This includes
      // replay adjudication and historical inferred
      // winners instead of reducing those games to
      // unresolved records.
      const completeContext =
        buildPlayerPairRivalryContext(
          candidateMatches,
          rivalry.left,
          rivalry.right
        );

      latestRivalry = {
        kind: "duel",
        rivalry: {
          ...rivalry,
          leftWins:
            completeContext.leftWins,
          rightWins:
            completeContext.rightWins,
          unknowns:
            completeContext.unknowns,
          totalMatches:
            completeContext.totalMatches,
          lastPlayedAt:
            completeContext.lastPlayedAt,
        },
        latestGame,
      };
    }
  } else if (
    latestGame?.kind === "team"
  ) {
    const rivalry = teams.find(
      (entry) =>
        entry.href === latestGame.href
    );

    if (rivalry) {
      latestRivalry = {
        kind: "team",
        rivalry,
        latestGame,
      };
    }
  }

  return {
    duels,
    teams,
    recentActivity,
    latestRivalry,
  };
}

export async function loadPublicBattleArchive(
  prisma: PrismaClient,
  options?: {
    take?: number;
  }
) {
  const take = Math.max(
    1,
    Math.min(
      options?.take ?? 120,
      500
    )
  );

  const [
    candidateMatches,
    total,
  ] = await Promise.all([
    loadRecentFinalMatchupRows(
      prisma,
      take
    ),
    prisma.gameStats.count({
      where: {
        is_final: true,
      },
    }),
  ]);

  const entries =
    await buildRecentRivalryActivity(
      prisma,
      candidateMatches,
      take
    );

  return {
    entries,
    total,
  };
}

export {
  teamRivalryFormatLabel,
};
