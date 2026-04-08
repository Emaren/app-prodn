import type { PrismaClient } from "@/lib/generated/prisma";

export type ClaimedPublicPlayer = {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
};

export type PublicPlayerRef = {
  token: string;
  name: string;
  href: string;
  claimed: boolean;
  uid: string | null;
  verified: boolean;
  verificationLevel: number;
  aliases: string[];
  steamPersonaName: string | null;
  inGameName: string | null;
  pendingWoloClaimCount: number;
  pendingWoloClaimAmount: number;
};

type PendingClaimSummaryLike = {
  pendingAmountWolo: number;
  pendingCount: number;
};

function normalizeKey(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePublicPlayerName(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, 64);
}

export function buildReplayPlayerHref(name: string) {
  return `/players/by-name/${encodeURIComponent(normalizePublicPlayerName(name))}`;
}

export function buildClaimedPlayerHref(uid: string) {
  return `/players/${uid}`;
}

export function buildClaimedPlayerToken(uid: string) {
  return `c_${uid}`;
}

export function buildReplayPlayerToken(name: string) {
  return `n_${normalizePublicPlayerName(name)}`;
}

export function parsePublicPlayerToken(token: string) {
  if (token.startsWith("c_") && token.length > 2) {
    return { kind: "claimed" as const, uid: token.slice(2) };
  }

  // Legacy claimed-player token format used during the first rivalry rollout.
  if (token.startsWith("u_u_") && token.length > 4) {
    return { kind: "claimed" as const, uid: token.slice(2) };
  }

  if (token.startsWith("n_") && token.length > 2) {
    return { kind: "replay" as const, name: normalizePublicPlayerName(token.slice(2)) };
  }

  return null;
}

function buildAliasList(values: Array<string | null | undefined>) {
  const aliases: string[] = [];

  for (const value of values) {
    const normalized = normalizePublicPlayerName(value);
    if (!normalized) continue;

    if (!aliases.some((alias) => normalizeKey(alias) === normalizeKey(normalized))) {
      aliases.push(normalized);
    }
  }

  return aliases;
}

export function buildClaimedPublicPlayerRef(
  claimed: ClaimedPublicPlayer,
  fallbackName?: string | null
): PublicPlayerRef {
  const aliases = buildAliasList([claimed.inGameName, claimed.steamPersonaName, fallbackName]);
  const name =
    normalizePublicPlayerName(claimed.inGameName) ||
    normalizePublicPlayerName(claimed.steamPersonaName) ||
    normalizePublicPlayerName(fallbackName) ||
    claimed.uid;

  return {
    token: buildClaimedPlayerToken(claimed.uid),
    name,
    href: buildClaimedPlayerHref(claimed.uid),
    claimed: true,
    uid: claimed.uid,
    verified: claimed.verified,
    verificationLevel: claimed.verificationLevel,
    aliases,
    steamPersonaName: claimed.steamPersonaName,
    inGameName: claimed.inGameName,
    pendingWoloClaimCount: 0,
    pendingWoloClaimAmount: 0,
  };
}

export function buildReplayPublicPlayerRef(name: string): PublicPlayerRef {
  const normalizedName = normalizePublicPlayerName(name) || "Unknown player";

  return {
    token: buildReplayPlayerToken(normalizedName),
    name: normalizedName,
    href: buildReplayPlayerHref(normalizedName),
    claimed: false,
    uid: null,
    verified: false,
    verificationLevel: 0,
    aliases: [normalizedName],
    steamPersonaName: null,
    inGameName: null,
    pendingWoloClaimCount: 0,
    pendingWoloClaimAmount: 0,
  };
}

export function applyPendingWoloClaimSummary<
  T extends {
    aliases: string[];
    pendingWoloClaimCount: number;
    pendingWoloClaimAmount: number;
  },
>(entry: T, summaryMap: Map<string, PendingClaimSummaryLike>) {
  const seen = new Set<string>();
  let pendingWoloClaimCount = 0;
  let pendingWoloClaimAmount = 0;

  for (const alias of entry.aliases) {
    const key = normalizeKey(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const summary = summaryMap.get(key);
    if (!summary) continue;

    pendingWoloClaimCount += summary.pendingCount;
    pendingWoloClaimAmount += summary.pendingAmountWolo;
  }

  return {
    ...entry,
    pendingWoloClaimCount,
    pendingWoloClaimAmount,
  };
}

export async function findClaimedUsersForReplayNames(prisma: PrismaClient, names: string[]) {
  const uniqueNames = Array.from(
    new Set(names.map((name) => normalizePublicPlayerName(name)).filter(Boolean))
  );

  if (uniqueNames.length === 0) {
    return new Map<string, ClaimedPublicPlayer>();
  }

  const users = await prisma.user.findMany({
    where: {
      OR: uniqueNames.flatMap((name) => [
        { inGameName: { equals: name, mode: "insensitive" as const } },
        { steamPersonaName: { equals: name, mode: "insensitive" as const } },
      ]),
    },
    select: {
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
    },
  });

  const map = new Map<string, ClaimedPublicPlayer>();

  for (const name of uniqueNames) {
    const key = normalizeKey(name);
    const exactInGame = users.find((user) => normalizeKey(user.inGameName) === key);
    const exactSteam = users.find((user) => normalizeKey(user.steamPersonaName) === key);
    const claimed = exactInGame || exactSteam;
    if (claimed) {
      map.set(key, claimed);
    }
  }

  return map;
}

export function getClaimedPublicPlayer(
  playerName: string,
  claimedPlayers: Map<string, ClaimedPublicPlayer>
) {
  return claimedPlayers.get(normalizeKey(playerName)) || null;
}

export function buildPublicPlayerRef(
  playerName: string,
  claimedPlayers: Map<string, ClaimedPublicPlayer>
) {
  const claimed = getClaimedPublicPlayer(playerName, claimedPlayers);
  return claimed
    ? buildClaimedPublicPlayerRef(claimed, playerName)
    : buildReplayPublicPlayerRef(playerName);
}

export function getPublicPlayerHref(
  playerName: string,
  claimedPlayers: Map<string, ClaimedPublicPlayer>
) {
  return buildPublicPlayerRef(playerName, claimedPlayers).href;
}

export async function resolvePublicPlayerToken(prisma: PrismaClient, token: string) {
  const parsed = parsePublicPlayerToken(token);
  if (!parsed) {
    return null;
  }

  if (parsed.kind === "claimed") {
    const user = await prisma.user.findUnique({
      where: { uid: parsed.uid },
      select: {
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        verified: true,
        verificationLevel: true,
      },
    });

    return user ? buildClaimedPublicPlayerRef(user) : null;
  }

  const claimedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { inGameName: { equals: parsed.name, mode: "insensitive" } },
        { steamPersonaName: { equals: parsed.name, mode: "insensitive" } },
      ],
    },
    select: {
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
    },
  });

  return claimedUser
    ? buildClaimedPublicPlayerRef(claimedUser, parsed.name)
    : buildReplayPublicPlayerRef(parsed.name);
}

export function publicPlayerMatchesName(player: PublicPlayerRef, name: string) {
  const key = normalizeKey(name);
  return player.aliases.some((alias) => normalizeKey(alias) === key);
}
