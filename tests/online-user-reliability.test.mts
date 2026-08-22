import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  USER_ONLINE_HEARTBEAT_BURST,
  USER_ONLINE_HEARTBEAT_MS,
  USER_ONLINE_HEARTBEAT_RATE_PER_SECOND,
  USER_ONLINE_LAST_SEEN_WRITE_INTERVAL_MS,
  USER_ONLINE_LEAVE_GRACE_MS,
  USER_ONLINE_MAX_CLIENTS_PER_UID,
  USER_ONLINE_MAX_REQUEST_BYTES,
  USER_ONLINE_MAX_TRACKED_UIDS,
  USER_ONLINE_STALE_MS,
  USER_ONLINE_TRAFFIC_SYNC_MS,
} from "../lib/userOnlinePresenceConfig.ts";
import {
  allowUserOnlineSession,
  clearUserOnlineLeases,
  countUserOnlineLeases,
  countUserOnlineTrackedClients,
  countUserOnlineTrackedUids,
  forceUserOnlineOffline,
  releaseUserOnlineLease,
  touchUserOnlineLease,
  userOnlineClientLeaseState,
  userIsOnline,
  userOnlineLeaseState,
  userOnlineSessionIsForcedOffline,
} from "../lib/userOnlinePresence.ts";
import {
  isUserOnlineSameOrigin,
  readUserOnlineJsonBody,
  UserOnlineHeartbeatLimiter,
  UserOnlineLastSeenPersister,
} from "../lib/userOnlinePresenceGuards.ts";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function reset(uid: string) {
  clearUserOnlineLeases(uid);
  allowUserOnlineSession(uid);
}

function streamedJsonRequest(text: string, advertisedLength?: number) {
  const bytes = new TextEncoder().encode(text);
  const splitAt = Math.max(1, Math.floor(bytes.byteLength / 2));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, splitAt));
      controller.enqueue(bytes.slice(splitAt));
      controller.close();
    },
  });
  const headers = new Headers();
  if (advertisedLength !== undefined) {
    headers.set("Content-Length", String(advertisedLength));
  }
  return new Request("http://localhost/api/user/ping", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("online timing has fast heartbeats with six missed-heartbeat tolerance", () => {
  assert.equal(USER_ONLINE_HEARTBEAT_MS, 15_000);
  assert.equal(USER_ONLINE_STALE_MS, 90_000);
  assert.equal(
    USER_ONLINE_STALE_MS / USER_ONLINE_HEARTBEAT_MS,
    6,
  );
  assert.equal(USER_ONLINE_TRAFFIC_SYNC_MS, 60_000);
  assert.ok(USER_ONLINE_LEAVE_GRACE_MS < 1_000);
  assert.equal(USER_ONLINE_MAX_CLIENTS_PER_UID, 8);
  assert.equal(USER_ONLINE_MAX_TRACKED_UIDS, 2_000);
  assert.equal(USER_ONLINE_MAX_REQUEST_BYTES, 2_048);
  assert.equal(USER_ONLINE_HEARTBEAT_BURST, 8);
  assert.equal(USER_ONLINE_HEARTBEAT_RATE_PER_SECOND, 1);
  assert.equal(USER_ONLINE_LAST_SEEN_WRITE_INTERVAL_MS, 5_000);
});

test("per-user leases stay capped and evict inactive clients before active clients", () => {
  const uid = "online-lease-cap-test";
  const startedAt = 1_800_000_010_000;
  reset(uid);

  for (let index = 0; index < USER_ONLINE_MAX_CLIENTS_PER_UID; index += 1) {
    const result = touchUserOnlineLease(
      uid,
      `tab-${index}`,
      startedAt + index,
      1,
    );
    assert.equal(result.accepted, true);
  }
  assert.equal(countUserOnlineTrackedClients(uid, startedAt + 10), 8);

  releaseUserOnlineLease(uid, "tab-3", startedAt + 20, 2);
  releaseUserOnlineLease(uid, "tab-5", startedAt + 21, 2);
  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-8", startedAt + 22, 1),
    { accepted: true, activeClients: 7 },
  );
  assert.equal(countUserOnlineTrackedClients(uid, startedAt + 23), 8);
  assert.equal(
    userOnlineClientLeaseState(uid, "tab-3", startedAt + 24),
    null,
    "the oldest inactive lease is evicted first",
  );
  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-5", startedAt + 25, 1),
    { accepted: false, activeClients: 7 },
    "the newer inactive sequence fence remains",
  );

  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-9", startedAt + 26, 1),
    { accepted: true, activeClients: 8 },
  );
  assert.equal(
    userOnlineClientLeaseState(uid, "tab-5", startedAt + 27),
    null,
    "the last inactive lease is evicted before any active lease",
  );
  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-10", startedAt + 28, 1),
    { accepted: true, activeClients: 8 },
  );
  assert.equal(
    userOnlineClientLeaseState(uid, "tab-0", startedAt + 29),
    null,
    "when all leases are active, the oldest active lease is evicted",
  );

  reset(uid);
});

test("a release that beats the first heartbeat leaves a bounded sequence tombstone", () => {
  const uid = "online-unknown-leave-test";
  const startedAt = 1_800_000_020_000;
  reset(uid);

  assert.deepEqual(
    releaseUserOnlineLease(uid, "pagehide-first", startedAt, 2),
    { accepted: true, activeClients: 0 },
  );
  assert.equal(countUserOnlineTrackedClients(uid, startedAt + 1), 1);
  assert.equal(countUserOnlineLeases(uid, startedAt + 1), 0);
  assert.deepEqual(
    touchUserOnlineLease(uid, "pagehide-first", startedAt + 2, 1),
    { accepted: false, activeClients: 0 },
    "the delayed initial heartbeat cannot resurrect a departed document",
  );
  assert.equal(countUserOnlineTrackedClients(uid, startedAt + 3), 1);

  reset(uid);

  const boundedUid = "online-random-leave-cap-test";
  reset(boundedUid);
  for (let index = 0; index < 10; index += 1) {
    releaseUserOnlineLease(
      boundedUid,
      `unknown-${index}`,
      startedAt + 10 + index,
      2,
    );
  }
  assert.equal(countUserOnlineTrackedClients(boundedUid, startedAt + 30), 8);
  assert.equal(countUserOnlineLeases(boundedUid, startedAt + 30), 0);
  assert.equal(
    userOnlineClientLeaseState(boundedUid, "unknown-0", startedAt + 30),
    null,
  );
  assert.equal(
    userOnlineClientLeaseState(boundedUid, "unknown-9", startedAt + 30),
    "inactive",
  );
  reset(boundedUid);
});

test("tracked-user leases and logout barriers remain globally bounded", () => {
  const startedAt = 1_800_000_030_000;
  const uids = Array.from(
    { length: USER_ONLINE_MAX_TRACKED_UIDS + 1 },
    (_, index) => `bounded-online-uid-${String(index).padStart(4, "0")}`,
  );

  for (let index = 0; index < uids.length; index += 1) {
    touchUserOnlineLease(uids[index], "only-tab", startedAt + index, 1);
  }
  assert.equal(countUserOnlineTrackedUids(startedAt + uids.length), 2_000);
  assert.equal(countUserOnlineTrackedClients(uids[0], startedAt + uids.length), 0);
  assert.equal(countUserOnlineTrackedClients(uids.at(-1)!, startedAt + uids.length), 1);

  for (const uid of uids) clearUserOnlineLeases(uid);
  for (let index = 0; index < uids.length; index += 1) {
    forceUserOnlineOffline(uids[index], startedAt + 10_000 + index);
  }
  assert.equal(userOnlineSessionIsForcedOffline(uids[0]), false);
  assert.equal(userOnlineSessionIsForcedOffline(uids.at(-1)!), true);

  for (const uid of uids) allowUserOnlineSession(uid);
});

test("heartbeat limiter admits eight synchronized tabs then refills at one per second", () => {
  const limiter = new UserOnlineHeartbeatLimiter({
    ratePerSecond: 1,
    burst: 8,
    maxKeys: 2,
    idleTtlMs: 10_000,
  });
  const nowMs = 50_000;

  for (let index = 0; index < 8; index += 1) {
    assert.deepEqual(limiter.consume("uid-a", nowMs), { allowed: true });
  }
  assert.deepEqual(limiter.consume("uid-a", nowMs), {
    allowed: false,
    retryAfterMs: 1_000,
  });
  assert.deepEqual(limiter.consume("uid-a", nowMs + 999), {
    allowed: false,
    retryAfterMs: 1,
  });
  for (let second = 1; second <= 30; second += 1) {
    const at = nowMs + second * 1_000;
    assert.deepEqual(limiter.consume("uid-a", at), { allowed: true });
    assert.deepEqual(limiter.consume("uid-a", at), {
      allowed: false,
      retryAfterMs: 1_000,
    });
  }
  assert.deepEqual(limiter.consume("uid-a", nowMs - 10_000), {
    allowed: false,
    retryAfterMs: 1_000,
  });

  limiter.consume("uid-b", nowMs + 30_001);
  limiter.consume("uid-c", nowMs + 30_002);
  assert.equal(limiter.size(), 2, "the limiter key map stays bounded");
});

test("durable last-seen writes coalesce per user and persistence state stays bounded", async () => {
  const persister = new UserOnlineLastSeenPersister({
    intervalMs: 5_000,
    maxKeys: 2,
    idleTtlMs: 10_000,
  });
  let writes = 0;
  const write = async () => {
    writes += 1;
    return 1;
  };

  assert.deepEqual(await persister.persist("uid-a", 10_000, write), {
    persisted: true,
    count: 1,
  });
  assert.deepEqual(await persister.persist("uid-a", 14_999, write), {
    persisted: false,
    count: null,
  });
  assert.deepEqual(await persister.persist("uid-a", 15_000, write), {
    persisted: true,
    count: 1,
  });
  assert.equal(writes, 2);

  await persister.persist("uid-b", 15_001, write);
  await persister.persist("uid-c", 15_002, write);
  assert.equal(persister.size(), 2, "the persistence key map stays bounded");
});

test("concurrent durable heartbeats share one in-flight write", async () => {
  const persister = new UserOnlineLastSeenPersister({
    intervalMs: 5_000,
    maxKeys: 8,
    idleTtlMs: 10_000,
  });
  let writes = 0;
  let finishWrite!: (count: number) => void;
  const pendingWrite = new Promise<number>((resolve) => {
    finishWrite = resolve;
  });
  const write = () => {
    writes += 1;
    return pendingWrite;
  };

  const first = persister.persist("uid-a", 20_000, write);
  const second = persister.persist("uid-a", 20_001, write);
  await Promise.resolve();
  assert.equal(writes, 1);
  finishWrite(1);

  assert.deepEqual(await first, { persisted: true, count: 1 });
  assert.deepEqual(await second, { persisted: false, count: 1 });
});

test("persistence coalesces failures and never evicts an in-flight key", async () => {
  const persister = new UserOnlineLastSeenPersister({
    intervalMs: 5_000,
    maxKeys: 1,
    idleTtlMs: 10_000,
  });
  let finishFirst!: (count: number) => void;
  const firstWrite = new Promise<number>((resolve) => {
    finishFirst = resolve;
  });
  const first = persister.persist("uid-a", 30_000, () => firstWrite);
  let overflowWrites = 0;
  assert.deepEqual(
    await persister.persist("uid-b", 30_001, async () => {
      overflowWrites += 1;
      return 1;
    }),
    { persisted: false, count: null },
  );
  assert.equal(overflowWrites, 0);
  assert.equal(persister.size(), 1);
  finishFirst(1);
  await first;

  const failing = new UserOnlineLastSeenPersister({
    intervalMs: 5_000,
    maxKeys: 1,
    idleTtlMs: 10_000,
  });
  let failedWrites = 0;
  await assert.rejects(
    failing.persist("uid-a", 40_000, async () => {
      failedWrites += 1;
      throw new Error("database unavailable");
    }),
    /database unavailable/,
  );
  assert.deepEqual(
    await failing.persist("uid-a", 40_001, async () => {
      failedWrites += 1;
      return 1;
    }),
    { persisted: false, count: null },
  );
  assert.equal(failedWrites, 1);
});

test("ping JSON reader enforces content length and streamed byte bounds", async () => {
  const oversizedByHeader = await readUserOnlineJsonBody(
    new Request("http://localhost/api/user/ping", {
      method: "POST",
      headers: { "Content-Length": "2049" },
      body: "{}",
    }),
  );
  assert.deepEqual(oversizedByHeader, {
    ok: false,
    status: 413,
    error: "Body too large",
  });

  const prefix = '{"padding":"';
  const suffix = '"}';
  const exactBody = `${prefix}${"x".repeat(2_048 - prefix.length - suffix.length)}${suffix}`;
  assert.equal(new TextEncoder().encode(exactBody).byteLength, 2_048);
  const exactBoundary = await readUserOnlineJsonBody(streamedJsonRequest(exactBody));
  assert.equal(exactBoundary.ok, true, "exactly 2,048 streamed bytes are accepted");

  const oversizedBody = `${prefix}${"x".repeat(2_049 - prefix.length - suffix.length)}${suffix}`;
  assert.equal(new TextEncoder().encode(oversizedBody).byteLength, 2_049);
  const oversizedStream = await readUserOnlineJsonBody(
    streamedJsonRequest(oversizedBody, 2),
  );
  assert.equal(oversizedStream.ok, false);
  if (!oversizedStream.ok) assert.equal(oversizedStream.status, 413);

  const valid = await readUserOnlineJsonBody(
    new Request("http://localhost/api/user/ping", {
      method: "POST",
      body: JSON.stringify({ action: "heartbeat" }),
    }),
  );
  assert.deepEqual(valid, {
    ok: true,
    value: { action: "heartbeat" },
  });
});

test("ping same-origin authorization trusts Host rather than forwarded host", () => {
  const request = (origin: string | null) =>
    new Request("http://internal/api/user/ping", {
      method: "POST",
      headers: {
        ...(origin ? { Origin: origin } : {}),
        Host: "aoe2war.com",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "attacker.invalid",
      },
    });

  assert.equal(isUserOnlineSameOrigin(request("https://aoe2war.com")), true);
  assert.equal(isUserOnlineSameOrigin(request("https://attacker.invalid")), false);
  assert.equal(isUserOnlineSameOrigin(request(null)), false);
});

test("one tab leaving cannot mark a user offline while another tab remains", () => {
  const uid = "online-multi-tab-test";
  const startedAt = 1_800_000_000_000;
  reset(uid);

  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-a", startedAt, 1),
    { accepted: true, activeClients: 1 },
  );
  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-b", startedAt + 1, 1),
    { accepted: true, activeClients: 2 },
  );
  assert.deepEqual(
    releaseUserOnlineLease(uid, "tab-a", startedAt + 2, 2),
    { accepted: true, activeClients: 1 },
  );
  assert.equal(countUserOnlineLeases(uid, startedAt + 3), 1);

  assert.deepEqual(
    releaseUserOnlineLease(uid, "tab-b", startedAt + 4, 2),
    { accepted: true, activeClients: 0 },
  );

  reset(uid);
});

test("a delayed heartbeat cannot resurrect a tab after its leave event", () => {
  const uid = "online-event-order-test";
  const startedAt = 1_800_000_100_000;
  reset(uid);

  touchUserOnlineLease(uid, "tab-a", startedAt, 1);
  releaseUserOnlineLease(uid, "tab-a", startedAt + 2, 2);

  assert.deepEqual(
    touchUserOnlineLease(uid, "tab-a", startedAt + 3, 1),
    { accepted: false, activeClients: 0 },
  );
  assert.equal(countUserOnlineLeases(uid, startedAt + 4), 0);

  reset(uid);
});

test("logout fences old in-flight heartbeats but a new login may arrive", () => {
  const uid = "online-logout-fence-test";
  const oldSessionStartedAt = 1_800_000_200_000;
  const logoutAt = oldSessionStartedAt + 10;
  reset(uid);

  touchUserOnlineLease(
    uid,
    "old-tab",
    oldSessionStartedAt,
    1,
  );
  forceUserOnlineOffline(uid, logoutAt);

  assert.equal(userOnlineSessionIsForcedOffline(uid), true);
  assert.deepEqual(
    touchUserOnlineLease(
      uid,
      "old-tab",
      logoutAt + 1,
      2,
    ),
    { accepted: false, activeClients: 0 },
  );
  allowUserOnlineSession(uid);

  assert.deepEqual(
    touchUserOnlineLease(
      uid,
      "new-tab",
      logoutAt + 2,
      1,
    ),
    { accepted: true, activeClients: 1 },
  );
  assert.equal(userOnlineSessionIsForcedOffline(uid), false);

  reset(uid);
});

test("a final document leave flips live truth without erasing durable last-seen history", () => {
  const uid = "online-durable-history-test";
  const startedAt = 1_800_000_300_000;
  const durableLastSeen = new Date(startedAt);
  reset(uid);

  touchUserOnlineLease(uid, "tab-a", startedAt, 1);
  assert.equal(userIsOnline(uid, durableLastSeen, startedAt + 1), true);
  releaseUserOnlineLease(uid, "tab-a", startedAt + 2, 2);
  assert.equal(
    userOnlineLeaseState(uid, startedAt + 2 + USER_ONLINE_LEAVE_GRACE_MS - 1),
    "online",
  );
  assert.equal(
    userIsOnline(uid, durableLastSeen, startedAt + 2 + USER_ONLINE_LEAVE_GRACE_MS + 1),
    false,
  );
  assert.equal(durableLastSeen.getTime(), startedAt);

  reset(uid);
});

test("client and routes implement idle-safe heartbeat, unload, and logout contracts", () => {
  const authClient = source("context/UserAuthContext.tsx");
  const pingRoute = source("app/api/user/ping/route.ts");
  const sessionRoute = source("app/api/auth/session/route.ts");
  const steamRoute = source("app/api/auth/steam/route.ts");
  const publicPresence = source("lib/publicPresence.ts");
  const publicPlayerDirectory = source("lib/publicPlayerDirectory.ts");
  const playerProfile = source("lib/playerProfile.ts");
  const challenges = source("lib/challenges.ts");
  const clanPresence = source("lib/clanHallPresence.ts");
  const onlineGuards = source("lib/userOnlinePresenceGuards.ts");

  assert.match(authClient, /USER_ONLINE_HEARTBEAT_MS/);
  assert.match(authClient, /SESSION_REFRESH_RETRY_MS = 5_000/);
  assert.match(authClient, /refreshUntilResolved/);
  assert.match(authClient, /transient session lookup failure/);
  assert.match(authClient, /setInterval/);
  assert.match(authClient, /visibilitychange/);
  assert.match(authClient, /addEventListener\(\s*"pagehide"/);
  assert.match(authClient, /addEventListener\(\s*"pageshow"/);
  assert.match(authClient, /let pendingPing = false/);
  assert.match(
    authClient,
    /if \(pingInFlight\)[\s\S]{0,260}pendingPing = true/,
    "pageshow during an in-flight pre-leave request must queue a prompt republish",
  );
  assert.match(
    authClient,
    /finally \{[\s\S]{0,320}!pageDeparted && pendingPing[\s\S]{0,240}void ping\(forcePendingTrafficIdentity\)/,
    "the queued BFCache republish must run immediately when the older request settles",
  );
  assert.match(authClient, /navigator\.sendBeacon/);
  assert.match(authClient, /presence_sequence/);
  assert.match(authClient, /report_traffic_identity/);

  assert.match(pingRoute, /action === "leave"/);
  assert.match(pingRoute, /USER_ONLINE_LEAVE_GRACE_MS/);
  assert.match(pingRoute, /report_traffic_identity !== false/);
  assert.doesNotMatch(pingRoute, /lastSeen:\s*null/);
  assert.match(pingRoute, /invalidatePublicPlayerDirectoryCache/);
  assert.match(pingRoute, /readUserOnlineJsonBody/);
  assert.doesNotMatch(pingRoute, /request\.json\(/);
  assert.match(pingRoute, /isUserOnlineSameOrigin\(request\)/);
  assert.match(pingRoute, /getSessionUid\(request\)/);
  assert.doesNotMatch(pingRoute, /resolveRequestUid/);
  assert.doesNotMatch(
    pingRoute,
    /ALLOW_LEGACY_UID_HEADERS|x-user-uid|x-aoe2-uid|body\.(?:uid|user_uid)/i,
  );
  assert.match(pingRoute, /userOnlineHeartbeatLimiter\.consume\(uid\)/);
  assert.match(pingRoute, /userOnlineLastSeenPersister\.persist/);
  assert.ok(
    pingRoute.indexOf('if (action === "leave")') <
      pingRoute.indexOf("userOnlineHeartbeatLimiter.consume(uid)"),
    "leave cleanup must bypass heartbeat limiting",
  );
  assert.match(onlineGuards, /content-length/);
  assert.match(onlineGuards, /function isUserOnlineSameOrigin/);
  assert.doesNotMatch(onlineGuards, /x-forwarded-host/);
  assert.match(onlineGuards, /request\.body\.getReader\(\)/);
  assert.match(onlineGuards, /reader\.cancel\("Body too large"\)/);
  assert.match(onlineGuards, /USER_ONLINE_MAX_REQUEST_BYTES/);
  assert.match(onlineGuards, /maxKeys/);
  assert.match(onlineGuards, /evictOldest/);
  assert.match(sessionRoute, /forceUserOnlineOffline/);
  assert.match(sessionRoute, /livingKingdomHub\.removeUser\(uid\)/);
  assert.doesNotMatch(sessionRoute, /lastSeen:\s*null/);
  assert.match(steamRoute, /lastSeen: new Date\(\)/);
  assert.match(publicPresence, /userIsOnline/);
  assert.match(publicPlayerDirectory, /userIsOnline/);
  assert.match(playerProfile, /userIsOnline/);
  assert.match(challenges, /userIsOnline/);

  // Clan Hall presence remains a separate, room-scoped signal.
  assert.match(clanPresence, /CLAN_HALL_PRESENCE_TTL_MS = 30_000/);
  assert.doesNotMatch(clanPresence, /USER_ONLINE_STALE_MS/);
});
