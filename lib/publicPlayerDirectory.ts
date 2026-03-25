import type { PrismaClient } from "@/lib/generated/prisma";

import {
  displayPlayerName,
  parsePlayers,
  readPlayedAt,
  readPlayerSteamDmRating,
  readPlayerSteamId,
  readPlayerSteamRmRating,
} from "@/lib/gameStatsView";
import {
  buildReplayPlayerHref,
  findClaimedUsersForReplayNames,
  getClaimedPublicPlayer,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";

export type PublicPlayerDirectoryEntry = {
  key: string;
  name: string;
  href: string;
  claimed: boolean;
  uid: string | null;
  steamId: string | null;
  verified: boolean;
  verificationLevel: number;
  isOnline: boolean;
  totalMatches: number;
  wins: number;
  losses: number;
  unknowns: number;
  lastPlayedAt: string | null;
  ratingLastSeenAt: string | null;
  steamRmRating: number | null;
  steamDmRating: number | null;
  aliases: string[];
  steamPersonaName: string | null;
  inGameName: string | null;
};

export type PublicPlayerDirectory = {
  allEntries: PublicPlayerDirectoryEntry[];
  activeClaimed: PublicPlayerDirectoryEntry[];
  claimedEntries: PublicPlayerDirectoryEntry[];
  replayEntries: PublicPlayerDirectoryEntry[];
};

function normalizeDirectoryKey(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase();
}

function pushAlias(entry: PublicPlayerDirectoryEntry, nextAlias: string | null | undefined) {
  const alias = normalizePublicPlayerName(nextAlias);
  if (!alias) return;

  const aliasKey = normalizeDirectoryKey(alias);
  if (!entry.aliases.some((currentAlias) => normalizeDirectoryKey(currentAlias) === aliasKey)) {
    entry.aliases.push(alias);
  }
}

function updateLastPlayedAt(entry: PublicPlayerDirectoryEntry, nextPlayedAt: Date | string | null) {
  if (!nextPlayedAt) return;

  const nextValue = new Date(nextPlayedAt);
  if (Number.isNaN(nextValue.getTime())) return;

  if (!entry.lastPlayedAt) {
    entry.lastPlayedAt = nextValue.toISOString();
    return;
  }

  const currentValue = new Date(entry.lastPlayedAt);
  if (Number.isNaN(currentValue.getTime()) || nextValue > currentValue) {
    entry.lastPlayedAt = nextValue.toISOString();
  }
}

function updateOutcome(
  entry: PublicPlayerDirectoryEntry,
  winner: string | null | undefined,
  replayName: string
) {
  const normalizedWinner = normalizeDirectoryKey(winner);
  if (!normalizedWinner || normalizedWinner === "unknown") {
    entry.unknowns += 1;
    return;
  }

  if (normalizedWinner === normalizeDirectoryKey(replayName)) {
    entry.wins += 1;
    return;
  }

  entry.losses += 1;
}

function updateSteamRatings(
  entry: PublicPlayerDirectoryEntry,
  player: Record<string, unknown>,
  nextPlayedAt: Date | string | null
) {
  const steamId = readPlayerSteamId(player);
  const steamRmRating = readPlayerSteamRmRating(player);
  const steamDmRating = readPlayerSteamDmRating(player);

  if (!steamId && steamRmRating === null && steamDmRating === null) {
    return;
  }

  const nextValue = nextPlayedAt ? new Date(nextPlayedAt) : null;
  const nextTimestamp = nextValue && !Number.isNaN(nextValue.getTime()) ? nextValue.getTime() : null;
  const currentTimestamp = entry.ratingLastSeenAt ? new Date(entry.ratingLastSeenAt).getTime() : null;
  const shouldReplace =
    currentTimestamp === null ||
    currentTimestamp === 0 ||
    (nextTimestamp !== null && nextTimestamp >= currentTimestamp);

  if (steamId && !entry.steamId) {
    entry.steamId = steamId;
  }

  if (!shouldReplace) {
    return;
  }

  entry.steamId = steamId ?? entry.steamId;
  entry.steamRmRating = steamRmRating;
  entry.steamDmRating = steamDmRating;
  entry.ratingLastSeenAt = nextTimestamp !== null ? new Date(nextTimestamp).toISOString() : entry.ratingLastSeenAt;
}

function compareOfficialRatings(left: PublicPlayerDirectoryEntry, right: PublicPlayerDirectoryEntry) {
  const leftSteam = left.steamRmRating ?? Number.NEGATIVE_INFINITY;
  const rightSteam = right.steamRmRating ?? Number.NEGATIVE_INFINITY;
  if (leftSteam !== rightSteam) {
    return rightSteam - leftSteam;
  }

  const leftLadder = left.steamDmRating ?? Number.NEGATIVE_INFINITY;
  const rightLadder = right.steamDmRating ?? Number.NEGATIVE_INFINITY;
  if (leftLadder !== rightLadder) {
    return rightLadder - leftLadder;
  }

  return 0;
}

function sortClaimedEntries(left: PublicPlayerDirectoryEntry, right: PublicPlayerDirectoryEntry) {
  const ratingComparison = compareOfficialRatings(left, right);
  if (ratingComparison !== 0) {
    return ratingComparison;
  }

  if (left.isOnline !== right.isOnline) {
    return Number(right.isOnline) - Number(left.isOnline);
  }

  if (left.verified !== right.verified) {
    return Number(right.verified) - Number(left.verified);
  }

  if (left.totalMatches !== right.totalMatches) {
    return right.totalMatches - left.totalMatches;
  }

  if (left.lastPlayedAt && right.lastPlayedAt) {
    return new Date(right.lastPlayedAt).getTime() - new Date(left.lastPlayedAt).getTime();
  }

  if (left.lastPlayedAt || right.lastPlayedAt) {
    return left.lastPlayedAt ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function sortReplayEntries(left: PublicPlayerDirectoryEntry, right: PublicPlayerDirectoryEntry) {
  const ratingComparison = compareOfficialRatings(left, right);
  if (ratingComparison !== 0) {
    return ratingComparison;
  }

  if (left.totalMatches !== right.totalMatches) {
    return right.totalMatches - left.totalMatches;
  }

  if (left.wins !== right.wins) {
    return right.wins - left.wins;
  }

  if (left.lastPlayedAt && right.lastPlayedAt) {
    return new Date(right.lastPlayedAt).getTime() - new Date(left.lastPlayedAt).getTime();
  }

  if (left.lastPlayedAt || right.lastPlayedAt) {
    return left.lastPlayedAt ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

export async function loadPublicPlayerDirectory(
  prisma: PrismaClient
): Promise<PublicPlayerDirectory> {
  const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);

  const [users, games] = await Promise.all([
    prisma.user.findMany({
      select: {
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        steamId: true,
        verified: true,
        verificationLevel: true,
        lastSeen: true,
      },
      orderBy: [{ lastSeen: "desc" }, { verifiedAt: "desc" }, { createdAt: "desc" }],
      take: 250,
    }),
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        winner: true,
        players: true,
        played_on: true,
        timestamp: true,
      },
    }),
  ]);

  const replayNames = Array.from(
    new Set(
      games.flatMap((game) =>
        parsePlayers(game.players)
          .map((player) => normalizePublicPlayerName(displayPlayerName(player)))
          .filter(Boolean)
      )
    )
  );
  const claimedPlayersByReplayName = await findClaimedUsersForReplayNames(prisma, replayNames);

  const directory = new Map<string, PublicPlayerDirectoryEntry>();

  for (const user of users) {
    const entry: PublicPlayerDirectoryEntry = {
      key: `claimed:${user.uid}`,
      name: user.inGameName || user.steamPersonaName || user.uid,
      href: `/players/${user.uid}`,
      claimed: true,
      uid: user.uid,
      steamId: user.steamId,
      verified: user.verified,
      verificationLevel: user.verificationLevel,
      isOnline: Boolean(user.lastSeen && user.lastSeen > onlineThreshold),
      totalMatches: 0,
      wins: 0,
      losses: 0,
      unknowns: 0,
      lastPlayedAt: null,
      ratingLastSeenAt: null,
      steamRmRating: null,
      steamDmRating: null,
      aliases: [],
      steamPersonaName: user.steamPersonaName,
      inGameName: user.inGameName,
    };

    pushAlias(entry, user.inGameName);
    pushAlias(entry, user.steamPersonaName);
    directory.set(entry.key, entry);
  }

  for (const game of games) {
    const players = parsePlayers(game.players);
    const playedAt = readPlayedAt(game);

    for (const player of players) {
      const replayName = normalizePublicPlayerName(displayPlayerName(player));
      if (!replayName) continue;

      const claimed = getClaimedPublicPlayer(replayName, claimedPlayersByReplayName);
      const entryKey = claimed
        ? `claimed:${claimed.uid}`
        : `replay:${normalizeDirectoryKey(replayName)}`;

      let entry = directory.get(entryKey);

      if (!entry) {
        entry = {
          key: entryKey,
          name: replayName,
          href: buildReplayPlayerHref(replayName),
          claimed: false,
          uid: null,
          steamId: null,
          verified: false,
          verificationLevel: 0,
          isOnline: false,
          totalMatches: 0,
          wins: 0,
          losses: 0,
          unknowns: 0,
          lastPlayedAt: null,
          ratingLastSeenAt: null,
          steamRmRating: null,
          steamDmRating: null,
          aliases: [],
          steamPersonaName: null,
          inGameName: null,
        };
        directory.set(entry.key, entry);
      }

      pushAlias(entry, replayName);
      updateSteamRatings(entry, player, playedAt);
      entry.totalMatches += 1;
      updateOutcome(entry, game.winner, replayName);
      updateLastPlayedAt(entry, playedAt);
    }
  }

  const allEntries = Array.from(directory.values()).filter((entry) => {
    if (!entry.claimed) {
      return true;
    }

    const hasNamedIdentity = Boolean(
      normalizePublicPlayerName(entry.inGameName) ||
        normalizePublicPlayerName(entry.steamPersonaName) ||
        entry.aliases.length > 0
    );

    if (!hasNamedIdentity) {
      return false;
    }

    if (!normalizePublicPlayerName(entry.inGameName) && !normalizePublicPlayerName(entry.steamPersonaName)) {
      entry.name = entry.aliases[0] || entry.name;
    }

    if (entry.uid && entry.name === entry.uid && entry.totalMatches === 0) {
      return false;
    }

    return true;
  });

  const claimedEntries = allEntries.filter((entry) => entry.claimed).sort(sortClaimedEntries);
  const replayEntries = allEntries.filter((entry) => !entry.claimed).sort(sortReplayEntries);
  const activeClaimed = claimedEntries.filter((entry) => entry.isOnline);

  return {
    allEntries: [...claimedEntries, ...replayEntries],
    activeClaimed,
    claimedEntries,
    replayEntries,
  };
}
