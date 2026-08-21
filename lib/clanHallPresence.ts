export const CLAN_HALL_PRESENCE_TTL_MS = 30_000;

export type ClanHallPresenceUser = {
  uid: string;
  displayName: string;
  lastSeenAt: string;
};

type PresenceEntry = {
  uid: string;
  displayName: string;
  lastSeenMs: number;
};

type GlobalWithClanHallPresence =
  typeof globalThis & {
    __aoe2ClanHallPresence?: Map<
      string,
      Map<string, PresenceEntry>
    >;
  };

const globalPresence =
  globalThis as GlobalWithClanHallPresence;

const halls =
  globalPresence.__aoe2ClanHallPresence ??
  new Map<
    string,
    Map<string, PresenceEntry>
  >();

globalPresence.__aoe2ClanHallPresence =
  halls;

function normalizeSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function pruneHall(
  slug: string,
  nowMs: number,
) {
  const normalized =
    normalizeSlug(slug);
  const hall = halls.get(normalized);

  if (!hall) return;

  for (const [uid, entry] of hall) {
    if (
      nowMs - entry.lastSeenMs >
      CLAN_HALL_PRESENCE_TTL_MS
    ) {
      hall.delete(uid);
    }
  }

  if (hall.size === 0) {
    halls.delete(normalized);
  }
}

export function touchClanHallPresence(
  slug: string,
  user: {
    uid: string;
    displayName: string;
  },
  nowMs = Date.now(),
) {
  const normalized =
    normalizeSlug(slug);

  pruneHall(normalized, nowMs);

  const hall =
    halls.get(normalized) ??
    new Map<string, PresenceEntry>();

  hall.set(user.uid, {
    uid: user.uid,
    displayName: user.displayName,
    lastSeenMs: nowMs,
  });

  halls.set(normalized, hall);
}

export function removeClanHallPresence(
  slug: string,
  uid: string,
) {
  const normalized =
    normalizeSlug(slug);
  const hall = halls.get(normalized);

  if (!hall) return;

  hall.delete(uid);

  if (hall.size === 0) {
    halls.delete(normalized);
  }
}

export function listClanHallPresence(
  slug: string,
  nowMs = Date.now(),
): ClanHallPresenceUser[] {
  const normalized =
    normalizeSlug(slug);

  pruneHall(normalized, nowMs);

  const hall = halls.get(normalized);

  if (!hall) return [];

  return Array.from(hall.values())
    .sort(
      (left, right) =>
        right.lastSeenMs -
        left.lastSeenMs ||
        left.displayName.localeCompare(
          right.displayName,
        ),
    )
    .map((entry) => ({
      uid: entry.uid,
      displayName:
        entry.displayName,
      lastSeenAt: new Date(
        entry.lastSeenMs,
      ).toISOString(),
    }));
}
