import type { PrismaClient } from "@/lib/generated/prisma";
import type { CommunityBadge } from "@/lib/communityHonors";
import {
  parseReplayRatingObservation,
  shouldReplaceCurrentReplayRating,
} from "@/lib/playerRatingRecency";
import { normalizeManagedMediaTarget } from "@/lib/managedMediaAssets";

import {
  displayPlayerName,
  parsePlayers,
  readPlayedAt,
  readPlayerSteamDmRating,
  readPlayerSteamRmRating,
} from "@/lib/gameStatsView";
import {
  applyPendingWoloClaimSummary,
  buildReplayPlayerHref,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";
import { loadUserCommunitySummaries } from "@/lib/communityHonors";
import { isPublicBattleArchiveRow } from "@/lib/publicBattleArchiveEligibility";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";
import {
  applyReplayAdjudicationToGameStats,
} from "@/lib/replayAdjudications";
import {
  buildLeaderboardNameHistory,
  buildLeaderboardIdentityKey,
  normalizeLeaderboardDisplayName,
  normalizeLeaderboardIdentityName,
  normalizeLeaderboardSteamId,
  readLeaderboardSteamId,
  type LeaderboardIdentityKind,
  type LeaderboardNameHistoryEntry,
  type LeaderboardReplayResult,
} from "@/lib/leaderboardIdentity";

import {
  loadPublicLeaderboardRawGames,
} from "@/lib/publicLeaderboardGameCorpus";
import { userIsOnline } from "@/lib/userOnlinePresence";

export type PublicPlayerReplayEvidence = {
  gameStatsId: number;
  observedName: string;
  normalizedName: string;
  observedAt: string | null;
  acceptedAt: string;
  result: LeaderboardReplayResult;
  steamRmRating: number | null;
  steamDmRating: number | null;
};

export type PublicPlayerDirectoryEntry = {
  key: string;
  identityKind: LeaderboardIdentityKind;
  name: string;
  latestObservedName: string;
  href: string;
  claimed: boolean;
  uid: string | null;
  steamId: string | null;
  verified: boolean;
  verificationLevel: number;
  isOnline: boolean;
  hasFeaturedAvatar: boolean;
  totalMatches: number;
  wins: number;
  losses: number;
  unknowns: number;
  lastPlayedAt: string | null;
  ratingLastSeenAt: string | null;
  steamRmRating: number | null;
  steamDmRating: number | null;
  aliases: string[];
  nameHistory: LeaderboardNameHistoryEntry[];
  replayEvidence: PublicPlayerReplayEvidence[];
  steamPersonaName: string | null;
  inGameName: string | null;
  pendingWoloClaimCount: number;
  pendingWoloClaimAmount: number;
  badges: CommunityBadge[];
};

export type PublicPlayerDirectory = {
  allEntries: PublicPlayerDirectoryEntry[];
  activeClaimed: PublicPlayerDirectoryEntry[];
  claimedEntries: PublicPlayerDirectoryEntry[];
  replayEntries: PublicPlayerDirectoryEntry[];
};

type CandidateGameRow = {
  createdAt: Date;
  event_types: unknown;
  id: number;
  is_final: boolean;
  key_events: unknown;
  original_filename: string | null;
  played_on: Date | null;
  players: unknown;
  replay_file: string | null;
  replayHash: string | null;
  timestamp: Date | null;
  winner: string | null;
  parse_reason: string | null;
  parse_source: string | null;
};

type CanonicalPlayerSnapshot = {
  id: number;
  gameStatsId: number;
  displayName: string;
  normalizedName: string;
  steamId: string | null;
  playerSlot: number | null;
  resultEligible: boolean;
  resultStatus: string;
  createdAt: Date;
};

const PLAYER_DIRECTORY_CACHE_TTL_MS = 15_000;

type PublicPlayerDirectoryCacheEntry = {
  expiresAt: number;
  value: PublicPlayerDirectory;
};

let publicPlayerDirectoryCache: PublicPlayerDirectoryCacheEntry | null = null;
let publicPlayerDirectoryPromise: Promise<PublicPlayerDirectory> | null = null;
let publicPlayerDirectoryCacheGeneration = 0;

export function invalidatePublicPlayerDirectoryCache() {
  publicPlayerDirectoryCacheGeneration += 1;
  publicPlayerDirectoryCache = null;
  publicPlayerDirectoryPromise = null;
}

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

function isSafePublicReplayObservedName(value: string | null | undefined) {
  const name = normalizePublicPlayerName(value);
  return Boolean(name) && !name.includes(",");
}

function toIso(
  value: Date | string | null | undefined,
) {
  if (!value) return null;

  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : null;
}

function resultFromSnapshot(
  snapshot: CanonicalPlayerSnapshot,
): LeaderboardReplayResult {
  if (!snapshot.resultEligible) {
    return "unknown";
  }

  if (snapshot.resultStatus === "win") {
    return "win";
  }

  if (snapshot.resultStatus === "loss") {
    return "loss";
  }

  return "unknown";
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

function updateSteamRatings(
  entry: PublicPlayerDirectoryEntry,
  player: Record<string, unknown>,
  ratingPlayedOn: Date | string | null,
  identitySteamId: string | null,
) {
  const steamId =
    entry.identityKind === "steam"
      ? identitySteamId
      : null;
  const steamRmRating = readPlayerSteamRmRating(player);
  const steamDmRating = readPlayerSteamDmRating(player);

  if (!steamId && steamRmRating === null && steamDmRating === null) {
    return;
  }

  if (steamId && !entry.steamId) {
    entry.steamId = steamId;
  }

  if (
    steamRmRating === null &&
    steamDmRating === null
  ) {
    return;
  }

  const currentHasRating =
    entry.steamRmRating !== null ||
    entry.steamDmRating !== null;

  const shouldReplace =
    shouldReplaceCurrentReplayRating({
      currentHasRating,
      currentObservedAt:
        entry.ratingLastSeenAt,
      nextPlayedOn:
        ratingPlayedOn,
    });

  if (!shouldReplace) {
    return;
  }

  const observation =
    parseReplayRatingObservation(
      ratingPlayedOn,
    );

  entry.steamId =
    steamId ?? entry.steamId;

  if (steamRmRating !== null) {
    entry.steamRmRating =
      steamRmRating;
  }

  if (steamDmRating !== null) {
    entry.steamDmRating =
      steamDmRating;
  }

  if (observation) {
    entry.ratingLastSeenAt =
      observation.iso;
  }
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

  const nameComparison = left.name.localeCompare(right.name);
  return nameComparison !== 0
    ? nameComparison
    : left.key.localeCompare(right.key);
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

function getCandidateGamePlayedAtMs(game: CandidateGameRow) {
  const playedAt = readPlayedAt(game);
  if (!playedAt) return 0;

  const playedAtMs = new Date(playedAt).getTime();
  return Number.isFinite(playedAtMs) ? playedAtMs : 0;
}

function sortCandidateGamesByPlayedAtDesc(left: CandidateGameRow, right: CandidateGameRow) {
  const playedAtDiff = getCandidateGamePlayedAtMs(right) - getCandidateGamePlayedAtMs(left);
  if (playedAtDiff !== 0) {
    return playedAtDiff;
  }

  const timestampDiff =
    new Date(right.timestamp ?? right.createdAt).getTime() -
    new Date(left.timestamp ?? left.createdAt).getTime();
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return right.id - left.id;
}

function playerForCanonicalSnapshot(
  game: CandidateGameRow,
  snapshot: CanonicalPlayerSnapshot,
) {
  const players = parsePlayers(game.players);
  const steamId =
    normalizeLeaderboardSteamId(
      snapshot.steamId,
    );

  if (steamId) {
    const exact = players.find(
      (player) =>
        readLeaderboardSteamId(player) ===
        steamId,
    );

    return exact;
  }

  if (snapshot.playerSlot !== null) {
    const slotted = players.find((player) => {
      const rawSlot =
        player.number ??
        player.player_slot ??
        player.playerSlot;
      const slot =
        typeof rawSlot === "number"
          ? Math.round(rawSlot)
          : Number(rawSlot);

      return (
        Number.isFinite(slot) &&
        slot === snapshot.playerSlot
      );
    });

    if (slotted) return slotted;
  }

  return players.find(
    (player) =>
      normalizeLeaderboardIdentityName(
        displayPlayerName(player),
      ) === snapshot.normalizedName,
  );
}

export async function loadPublicPlayerDirectoryFresh(
  prisma: PrismaClient
): Promise<PublicPlayerDirectory> {
  const onlineSampleAt = Date.now();

  const [
    users,
    rawGames,
    activeFeaturedAvatarAssets,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        steamId: true,
        verified: true,
        verificationLevel: true,
        lastSeen: true,
      },
      orderBy: [
        { lastSeen: "desc" },
        { verifiedAt: "desc" },
        { createdAt: "desc" },
      ],
    }),

    loadPublicLeaderboardRawGames(prisma),

    prisma.managedMediaAsset.findMany({
      where: {
        kind: "avatar",
        active: true,
        target: {
          startsWith: "user-",
          endsWith: "-featured",
        },
      },
      select: {
        target: true,
      },
    }),
  ]);

  const activeFeaturedAvatarTargets =
    new Set(
      activeFeaturedAvatarAssets
        .map((asset) => asset.target)
        .filter(
          (target): target is string =>
            Boolean(target)
        )
    );

  const hasFeaturedAvatarForUid =
    (uid: string) => {
      const target =
        normalizeManagedMediaTarget(
          `user-${uid}-featured`
        );

      return Boolean(
        target &&
        activeFeaturedAvatarTargets.has(target)
      );
    };

  const games = rawGames
    .map((game) => applyReplayAdjudicationToGameStats(game) as CandidateGameRow)
    .sort(sortCandidateGamesByPlayedAtDesc);

  const communityMap = await loadUserCommunitySummaries(
    prisma,
    users.map((user) => user.id)
  );

  /*
   * Public player totals use the canonical public replay truth policy.
   *
   * Superseded rows are excluded at query time. Remaining rows are
   * sanitized so non-stats-eligible winner evidence cannot count as
   * W/L here while the same replay is unresolved on player profiles.
   */
  const uniqueGames = cleanPublicGameRows(
    games.filter(
      isPublicBattleArchiveRow,
    ),
    {
      includeReview: true,
      includeLive: false,
    },
  );

  /*
   * Identity grain comes from the accepted, current normalized replay
   * projection corpus. Raw GameStats JSON remains useful for rating snapshots
   * and presentation, but an unaccepted raw participant can never create a
   * leaderboard identity.
   */
  const canonicalSnapshots =
    uniqueGames.length > 0
      ? await prisma.replayPlayerSnapshot.findMany(
          {
            where: {
              gameStatsId: {
                in: uniqueGames.map(
                  (game) => game.id,
                ),
              },
              projection: {
                projectionStatus:
                  "accepted",
                affectsPublicAggregates:
                  true,
                supersededBy: null,
              },
            },
            orderBy: [
              { gameStatsId: "asc" },
              { playerSlot: "asc" },
              { id: "asc" },
            ],
            select: {
              id: true,
              gameStatsId: true,
              displayName: true,
              normalizedName: true,
              steamId: true,
              playerSlot: true,
              resultEligible: true,
              resultStatus: true,
              createdAt: true,
            },
          },
        )
      : [];

    const pendingGiftByUserUid = new Map<string, { count: number; amount: number }>();
    const userIdToUid = new Map(users.map((user) => [user.id, user.uid]));
    const claimedUserIds = users.map((user) => user.id);

    if (claimedUserIds.length > 0) {
      try {
        const pendingGiftGroups = await prisma.userGift.groupBy({
          by: ["userId"],
          where: {
            userId: { in: claimedUserIds },
            kind: "WOLO",
            status: "pending",
            amount: { gt: 0 },
          },
          _count: { _all: true },
          _sum: { amount: true },
        });

        for (const group of pendingGiftGroups) {
          const uid = userIdToUid.get(group.userId);
          if (!uid) continue;

          pendingGiftByUserUid.set(uid, {
            count: group._count._all,
            amount: group._sum.amount ?? 0,
          });
        }
      } catch (error) {
        console.warn(`Public player directory pending WOLO gift rail unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }


  const directory = new Map<string, PublicPlayerDirectoryEntry>();

  for (const user of users) {
    const steamId =
      normalizeLeaderboardSteamId(
        user.steamId,
      );
    const key =
      buildLeaderboardIdentityKey({
        steamId,
        claimedUid: user.uid,
      });

    if (!key) continue;

    if (directory.has(key)) {
      continue;
    }

    const initialName =
      user.inGameName ||
      user.steamPersonaName ||
      user.uid;
    const entry: PublicPlayerDirectoryEntry = {
      key,
      identityKind: steamId
        ? "steam"
        : "site",
      name: initialName,
      latestObservedName: initialName,
      href: `/players/${user.uid}`,
      claimed: true,
      uid: user.uid,
      steamId,
      verified: user.verified,
      verificationLevel: user.verificationLevel,
      isOnline: userIsOnline(user.uid, user.lastSeen, onlineSampleAt),
      hasFeaturedAvatar: hasFeaturedAvatarForUid(user.uid),
      totalMatches: 0,
      wins: 0,
      losses: 0,
      unknowns: 0,
      lastPlayedAt: null,
      ratingLastSeenAt: null,
      steamRmRating: null,
      steamDmRating: null,
      aliases: [],
      nameHistory: [],
      replayEvidence: [],
      steamPersonaName: user.steamPersonaName,
      inGameName: user.inGameName,
      pendingWoloClaimCount: 0,
      pendingWoloClaimAmount: 0,
      badges: communityMap.get(user.id)?.badges ?? [],
    };

    pushAlias(entry, user.inGameName);
    pushAlias(entry, user.steamPersonaName);
    directory.set(entry.key, entry);
  }

  const gameById = new Map(
    uniqueGames.map((game) => [
      game.id,
      game,
    ]),
  );
  const latestObservationByKey = new Map<
    string,
    {
      observedAt: string;
      snapshotId: number;
    }
  >();
  const seenGameIdentity = new Set<string>();

  for (const snapshot of canonicalSnapshots) {
    const game =
      gameById.get(snapshot.gameStatsId);

    if (!game) continue;

    const replayName =
      normalizeLeaderboardDisplayName(
        snapshot.displayName,
      );
    const normalizedName =
      normalizeLeaderboardIdentityName(
        snapshot.normalizedName ||
          replayName,
      );

    if (!replayName || !normalizedName) {
      continue;
    }

    const steamId =
      normalizeLeaderboardSteamId(
        snapshot.steamId,
      );
    const entryKey =
      buildLeaderboardIdentityKey({
        steamId,
        name: replayName,
        normalizedName,
      });

    if (!entryKey) continue;

    let entry = directory.get(entryKey);

    if (!entry) {
      const publicReplayName = isSafePublicReplayObservedName(replayName)
        ? replayName
        : "";

      entry = {
        key: entryKey,
        identityKind: steamId
          ? "steam"
          : "name",
        name: publicReplayName,
        latestObservedName:
          publicReplayName,
        href: publicReplayName
          ? buildReplayPlayerHref(publicReplayName)
          : "",
        claimed: false,
        uid: null,
        steamId,
        verified: false,
        verificationLevel: 0,
        isOnline: false,
        hasFeaturedAvatar: false,
        totalMatches: 0,
        wins: 0,
        losses: 0,
        unknowns: 0,
        lastPlayedAt: null,
        ratingLastSeenAt: null,
        steamRmRating: null,
        steamDmRating: null,
        aliases: [],
        nameHistory: [],
        replayEvidence: [],
        steamPersonaName: null,
        inGameName: null,
        pendingWoloClaimCount: 0,
        pendingWoloClaimAmount: 0,
        badges: [],
      };

      directory.set(entry.key, entry);
    }

    const gameIdentityKey =
      `${snapshot.gameStatsId}:${entry.key}`;

    if (
      seenGameIdentity.has(
        gameIdentityKey,
      )
    ) {
      continue;
    }

    seenGameIdentity.add(
      gameIdentityKey,
    );

    const playedAt =
      readPlayedAt(game) ??
      snapshot.createdAt;
    const observedAt =
      toIso(playedAt);
    const result =
      resultFromSnapshot(snapshot);
    const player =
      playerForCanonicalSnapshot(
        game,
        snapshot,
      );
    const steamRmRating = player
      ? readPlayerSteamRmRating(
          player,
        )
      : null;
    const steamDmRating = player
      ? readPlayerSteamDmRating(
          player,
        )
      : null;

    if (isSafePublicReplayObservedName(replayName)) {
      pushAlias(entry, replayName);
    }
    entry.totalMatches += 1;

    if (result === "win") {
      entry.wins += 1;
    } else if (result === "loss") {
      entry.losses += 1;
    } else {
      entry.unknowns += 1;
    }

    entry.replayEvidence.push({
      gameStatsId:
        snapshot.gameStatsId,
      observedName: replayName,
      normalizedName,
      observedAt,
      acceptedAt:
        snapshot.createdAt.toISOString(),
      result,
      steamRmRating,
      steamDmRating,
    });

    if (player) {
      updateSteamRatings(
        entry,
        player,
        game.played_on,
        steamId,
      );
    }

    updateLastPlayedAt(
      entry,
      playedAt,
    );

    const observationTime =
      observedAt ??
      snapshot.createdAt.toISOString();
    const currentObservation =
      latestObservationByKey.get(
        entry.key,
      );

    if (
      isSafePublicReplayObservedName(replayName) &&
      (
        !currentObservation ||
      observationTime >
        currentObservation.observedAt ||
      (observationTime ===
        currentObservation.observedAt &&
        snapshot.id >
          currentObservation.snapshotId)
      )
    ) {
      entry.latestObservedName =
        replayName;

      if (!entry.claimed) {
        entry.name = replayName;
        entry.href =
          buildReplayPlayerHref(
            replayName,
          );
      }

      latestObservationByKey.set(
        entry.key,
        {
          observedAt:
            observationTime,
          snapshotId: snapshot.id,
        },
      );
    }
  }

  for (const entry of directory.values()) {
    entry.replayEvidence.sort(
      (left, right) =>
        String(
          right.observedAt ?? "",
        ).localeCompare(
          String(
            left.observedAt ?? "",
          ),
        ) ||
        right.gameStatsId -
          left.gameStatsId,
    );
    entry.nameHistory =
      buildLeaderboardNameHistory(
        entry.replayEvidence
          .filter((evidence) => isSafePublicReplayObservedName(evidence.observedName))
          .map(
          (evidence) => ({
            name:
              evidence.observedName,
            normalizedName:
              evidence.normalizedName,
            observedAt:
              evidence.observedAt,
            result: evidence.result,
          }),
        ),
      );
  }

  const aliasOwners =
    new Map<
      string,
      Set<string>
    >();

  for (const entry of directory.values()) {
    for (const alias of entry.aliases) {
      const aliasKey =
        normalizeDirectoryKey(alias);

      if (!aliasKey) continue;

      const owners =
        aliasOwners.get(aliasKey) ??
        new Set<string>();

      owners.add(entry.key);
      aliasOwners.set(
        aliasKey,
        owners,
      );
    }
  }

  const pendingClaimSummaries = await loadPendingWoloClaimSummariesByName(
    prisma,
    Array.from(directory.values()).flatMap((entry) => entry.aliases)
  );

  const allEntries = Array.from(directory.values())
    .map((entry) => {
        /*
         * Pending claims remain a legacy name-keyed rail. Fail closed when
         * the same alias belongs to more than one identity row so WOLO
         * telemetry cannot imply an exact cross-account attribution.
         */
        const unambiguousClaimAliases =
          entry.aliases.filter(
            (alias) =>
              aliasOwners.get(
                normalizeDirectoryKey(
                  alias,
                ),
              )?.size === 1,
          );
        const claimTelemetry =
          applyPendingWoloClaimSummary(
            {
              aliases:
                unambiguousClaimAliases,
              pendingWoloClaimCount: 0,
              pendingWoloClaimAmount: 0,
            },
            pendingClaimSummaries,
          );
        const withClaims = {
          ...entry,
          pendingWoloClaimCount:
            claimTelemetry
              .pendingWoloClaimCount,
          pendingWoloClaimAmount:
            claimTelemetry
              .pendingWoloClaimAmount,
        };
        const pendingGift = withClaims.uid ? pendingGiftByUserUid.get(withClaims.uid) : null;

        if (!pendingGift) {
          return withClaims;
        }

        return {
          ...withClaims,
          pendingWoloClaimCount: withClaims.pendingWoloClaimCount + pendingGift.count,
          pendingWoloClaimAmount: withClaims.pendingWoloClaimAmount + pendingGift.amount,
        };
      })
    .filter((entry) => {
    if (!entry.claimed) {
      return Boolean(entry.name && entry.aliases.length > 0);
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
      entry.latestObservedName =
        entry.name;
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

export async function loadPublicPlayerDirectory(
  prisma: PrismaClient
): Promise<PublicPlayerDirectory> {
  const now = Date.now();

  if (
    publicPlayerDirectoryCache &&
    publicPlayerDirectoryCache.expiresAt > now
  ) {
    return publicPlayerDirectoryCache.value;
  }

  if (publicPlayerDirectoryPromise) {
    return publicPlayerDirectoryPromise;
  }

  const generation = publicPlayerDirectoryCacheGeneration;
  const run = loadPublicPlayerDirectoryFresh(prisma)
    .then((value) => {
      if (generation === publicPlayerDirectoryCacheGeneration) {
        publicPlayerDirectoryCache = {
          expiresAt: Date.now() + PLAYER_DIRECTORY_CACHE_TTL_MS,
          value,
        };
      }

      return value;
    })
    .finally(() => {
      if (publicPlayerDirectoryPromise === run) {
        publicPlayerDirectoryPromise = null;
      }
    });

  publicPlayerDirectoryPromise = run;
  return run;
}
