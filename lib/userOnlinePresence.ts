import {
  USER_ONLINE_LEAVE_GRACE_MS,
  USER_ONLINE_MAX_CLIENTS_PER_UID,
  USER_ONLINE_MAX_TRACKED_UIDS,
  USER_ONLINE_STALE_MS,
} from "@/lib/userOnlinePresenceConfig";

export {
  USER_ONLINE_HEARTBEAT_MS,
  USER_ONLINE_LAST_SEEN_WRITE_INTERVAL_MS,
  USER_ONLINE_LEAVE_GRACE_MS,
  USER_ONLINE_MAX_CLIENTS_PER_UID,
  USER_ONLINE_MAX_REQUEST_BYTES,
  USER_ONLINE_MAX_TRACKED_UIDS,
  USER_ONLINE_STALE_MS,
  USER_ONLINE_TRAFFIC_SYNC_MS,
} from "@/lib/userOnlinePresenceConfig";

const USER_ONLINE_CLIENT_ID_MAX_LENGTH = 128;
const USER_ONLINE_OFFLINE_BARRIER_TTL_MS = 5 * 60_000;

type UserOnlineLease = {
  active: boolean;
  lastSeenMs: number;
  sequence: number;
};

export type UserOnlineLeaseMutation = {
  accepted: boolean;
  activeClients: number;
};

export type UserOnlineLeaseState = "online" | "offline" | "unknown";

type GlobalWithUserOnlineLeases = typeof globalThis & {
  __aoe2UserOnlineLeases?: Map<string, Map<string, UserOnlineLease>>;
  __aoe2UserOnlineOfflineBarriers?: Map<string, number>;
};

const onlineLeaseGlobal = globalThis as GlobalWithUserOnlineLeases;
const onlineLeases =
  onlineLeaseGlobal.__aoe2UserOnlineLeases ??
  new Map<string, Map<string, UserOnlineLease>>();
const offlineBarriers =
  onlineLeaseGlobal.__aoe2UserOnlineOfflineBarriers ??
  new Map<string, number>();

onlineLeaseGlobal.__aoe2UserOnlineLeases = onlineLeases;
onlineLeaseGlobal.__aoe2UserOnlineOfflineBarriers = offlineBarriers;

function normalizeUid(uid: string) {
  return uid.trim().slice(0, 100);
}

function pruneOfflineBarriers(nowMs: number) {
  for (const [uid, forcedOfflineAt] of offlineBarriers) {
    if (nowMs - forcedOfflineAt > USER_ONLINE_OFFLINE_BARRIER_TTL_MS) {
      offlineBarriers.delete(uid);
    }
  }
}

function evictOldestOfflineBarrier() {
  let selectedUid: string | null = null;
  let selectedAt = Number.POSITIVE_INFINITY;

  for (const [uid, forcedOfflineAt] of offlineBarriers) {
    if (
      forcedOfflineAt < selectedAt ||
      (forcedOfflineAt === selectedAt && (selectedUid === null || uid < selectedUid))
    ) {
      selectedUid = uid;
      selectedAt = forcedOfflineAt;
    }
  }

  if (selectedUid !== null) offlineBarriers.delete(selectedUid);
}

export function normalizeUserOnlineClientId(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .slice(0, USER_ONLINE_CLIENT_ID_MAX_LENGTH);

  return normalized || null;
}

export function normalizeUserOnlineSequence(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(numeric) || numeric < 1) return null;
  return numeric;
}

export function userOnlineSessionIsForcedOffline(uid: string) {
  return offlineBarriers.has(normalizeUid(uid));
}

export function allowUserOnlineSession(uid: string) {
  offlineBarriers.delete(normalizeUid(uid));
}

export function forceUserOnlineOffline(uid: string, nowMs = Date.now()) {
  pruneOfflineBarriers(nowMs);
  const normalizedUid = normalizeUid(uid);
  onlineLeases.delete(normalizedUid);
  if (
    !offlineBarriers.has(normalizedUid) &&
    offlineBarriers.size >= USER_ONLINE_MAX_TRACKED_UIDS
  ) {
    evictOldestOfflineBarrier();
  }
  offlineBarriers.set(normalizedUid, nowMs);
}

function pruneUserOnlineLeases(uid: string, nowMs: number) {
  const normalizedUid = normalizeUid(uid);
  const leases = onlineLeases.get(normalizedUid);

  if (!leases) return null;

  for (const [clientId, lease] of leases) {
    if (nowMs - lease.lastSeenMs > USER_ONLINE_STALE_MS) {
      leases.delete(clientId);
    }
  }

  if (leases.size === 0) {
    onlineLeases.delete(normalizedUid);
    return null;
  }

  return leases;
}

function pruneAllUserOnlineLeases(nowMs: number) {
  for (const uid of onlineLeases.keys()) {
    pruneUserOnlineLeases(uid, nowMs);
  }
}

function evictOldestOnlineUid() {
  let selectedUid: string | null = null;
  let selectedAt = Number.POSITIVE_INFINITY;

  for (const [uid, leases] of onlineLeases) {
    let latestAt = Number.NEGATIVE_INFINITY;
    for (const lease of leases.values()) {
      latestAt = Math.max(latestAt, lease.lastSeenMs);
    }
    if (
      latestAt < selectedAt ||
      (latestAt === selectedAt && (selectedUid === null || uid < selectedUid))
    ) {
      selectedUid = uid;
      selectedAt = latestAt;
    }
  }

  if (selectedUid !== null) onlineLeases.delete(selectedUid);
}

function makeRoomForOnlineUid(uid: string, nowMs: number) {
  if (onlineLeases.has(uid) || onlineLeases.size < USER_ONLINE_MAX_TRACKED_UIDS) return;
  pruneAllUserOnlineLeases(nowMs);
  if (onlineLeases.size >= USER_ONLINE_MAX_TRACKED_UIDS) evictOldestOnlineUid();
}

function countActiveLeases(leases: Map<string, UserOnlineLease> | null) {
  if (!leases) return 0;
  let activeClients = 0;
  for (const lease of leases.values()) {
    if (lease.active) activeClients += 1;
  }
  return activeClients;
}

function evictLeaseForNewClient(leases: Map<string, UserOnlineLease>) {
  let selectedClientId: string | null = null;
  let selectedLease: UserOnlineLease | null = null;

  for (const [clientId, lease] of leases) {
    if (
      !selectedLease ||
      (selectedLease.active && !lease.active) ||
      selectedLease.active === lease.active &&
        (lease.lastSeenMs < selectedLease.lastSeenMs ||
          (lease.lastSeenMs === selectedLease.lastSeenMs && clientId < selectedClientId!))
    ) {
      selectedClientId = clientId;
      selectedLease = lease;
    }
  }

  if (selectedClientId !== null) leases.delete(selectedClientId);
}

export function touchUserOnlineLease(
  uid: string,
  clientId: string,
  nowMs = Date.now(),
  sequence?: number | null,
): UserOnlineLeaseMutation {
  const normalizedUid = normalizeUid(uid);
  const normalizedClientId = normalizeUserOnlineClientId(clientId);

  if (!normalizedUid || !normalizedClientId) {
    return { accepted: false, activeClients: 0 };
  }

  pruneOfflineBarriers(nowMs);
  if (offlineBarriers.has(normalizedUid)) {
    return { accepted: false, activeClients: 0 };
  }

  const existingLeases = pruneUserOnlineLeases(normalizedUid, nowMs);
  if (!existingLeases) makeRoomForOnlineUid(normalizedUid, nowMs);
  const leases = existingLeases ?? new Map<string, UserOnlineLease>();
  const current = leases.get(normalizedClientId);
  const normalizedSequence = normalizeUserOnlineSequence(sequence);
  const nextSequence = normalizedSequence ?? (current?.sequence ?? 0) + 1;

  if (
    current &&
    normalizedSequence !== null &&
    (nextSequence < current.sequence ||
      (nextSequence === current.sequence && !current.active))
  ) {
    return {
      accepted: false,
      activeClients: countActiveLeases(leases),
    };
  }

  if (!current && leases.size >= USER_ONLINE_MAX_CLIENTS_PER_UID) {
    evictLeaseForNewClient(leases);
  }

  leases.set(normalizedClientId, {
    active: true,
    lastSeenMs: nowMs,
    sequence: nextSequence,
  });
  onlineLeases.set(normalizedUid, leases);

  return {
    accepted: true,
    activeClients: countActiveLeases(leases),
  };
}

export function releaseUserOnlineLease(
  uid: string,
  clientId: string,
  nowMs = Date.now(),
  sequence?: number | null,
): UserOnlineLeaseMutation {
  const normalizedUid = normalizeUid(uid);
  const normalizedClientId = normalizeUserOnlineClientId(clientId);

  if (!normalizedUid || !normalizedClientId) {
    return { accepted: false, activeClients: 0 };
  }

  const existingLeases = pruneUserOnlineLeases(normalizedUid, nowMs);
  if (!existingLeases) makeRoomForOnlineUid(normalizedUid, nowMs);
  const leases = existingLeases ?? new Map<string, UserOnlineLease>();
  const current = leases.get(normalizedClientId);

  const normalizedSequence = normalizeUserOnlineSequence(sequence);
  const nextSequence = normalizedSequence ?? (current?.sequence ?? 0) + 1;

  if (
    current &&
    normalizedSequence !== null &&
    nextSequence < current.sequence
  ) {
    return {
      accepted: false,
      activeClients: countActiveLeases(leases),
    };
  }

  if (!current && leases.size >= USER_ONLINE_MAX_CLIENTS_PER_UID) {
    evictLeaseForNewClient(leases);
  }

  leases.set(normalizedClientId, {
    active: false,
    lastSeenMs: nowMs,
    sequence: nextSequence,
  });
  onlineLeases.set(normalizedUid, leases);

  return {
    accepted: true,
    activeClients: countActiveLeases(leases),
  };
}

export function countUserOnlineLeases(uid: string, nowMs = Date.now()) {
  const leases = pruneUserOnlineLeases(uid, nowMs);

  if (!leases) return 0;

  return countActiveLeases(leases);
}

export function countUserOnlineTrackedClients(uid: string, nowMs = Date.now()) {
  return pruneUserOnlineLeases(uid, nowMs)?.size ?? 0;
}

export function userOnlineClientLeaseState(
  uid: string,
  clientId: string,
  nowMs = Date.now(),
) {
  const normalizedClientId = normalizeUserOnlineClientId(clientId);
  if (!normalizedClientId) return null;
  const lease = pruneUserOnlineLeases(uid, nowMs)?.get(normalizedClientId);
  return lease ? (lease.active ? "active" : "inactive") : null;
}

export function countUserOnlineTrackedUids(nowMs = Date.now()) {
  pruneAllUserOnlineLeases(nowMs);
  return onlineLeases.size;
}

/**
 * Process-local live truth for a signed-in user's browser documents.
 *
 * `unknown` deliberately falls back to durable `lastSeen` truth so a process
 * restart does not make every recently active user disappear. A recently
 * released final document remains online for the tiny navigation grace; this
 * prevents same-site page transitions from flashing offline.
 */
export function userOnlineLeaseState(
  uid: string,
  nowMs = Date.now(),
): UserOnlineLeaseState {
  const normalizedUid = normalizeUid(uid);

  if (!normalizedUid) return "unknown";

  pruneOfflineBarriers(nowMs);
  if (offlineBarriers.has(normalizedUid)) return "offline";

  const leases = pruneUserOnlineLeases(normalizedUid, nowMs);
  if (!leases) return "unknown";

  let latestReleaseAt = Number.NEGATIVE_INFINITY;

  for (const lease of leases.values()) {
    if (lease.active) return "online";
    latestReleaseAt = Math.max(latestReleaseAt, lease.lastSeenMs);
  }

  return nowMs - latestReleaseAt <= USER_ONLINE_LEAVE_GRACE_MS
    ? "online"
    : "offline";
}

export function userIsOnline(
  uid: string,
  lastSeen: Date | string | null | undefined,
  nowMs = Date.now(),
) {
  const leaseState = userOnlineLeaseState(uid, nowMs);

  if (leaseState === "online") return true;
  if (leaseState === "offline") return false;
  if (!lastSeen) return false;

  const lastSeenMs =
    lastSeen instanceof Date
      ? lastSeen.getTime()
      : new Date(lastSeen).getTime();

  return (
    Number.isFinite(lastSeenMs) &&
    nowMs - lastSeenMs <= USER_ONLINE_STALE_MS
  );
}

export function clearUserOnlineLeases(uid: string) {
  onlineLeases.delete(normalizeUid(uid));
}
