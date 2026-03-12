import type { PrismaClient } from "@/lib/generated/prisma";

export type ClaimedPublicPlayer = {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
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

export function getPublicPlayerHref(
  playerName: string,
  claimedPlayers: Map<string, ClaimedPublicPlayer>
) {
  const claimed = getClaimedPublicPlayer(playerName, claimedPlayers);
  return claimed ? `/players/${claimed.uid}` : buildReplayPlayerHref(playerName);
}
