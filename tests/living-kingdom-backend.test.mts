import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_CONCIERGE_UID,
  AI_GRIMER_UID,
  AI_GUY_UID,
  AOE2WAR_HALL_SCRIBE_UID,
  BETTING_BOT_PAULIE_UID,
  BETTING_BOT_TONY_UID,
  CHALLENGE_PROTOCOL_UID,
} from "../lib/internalSystemAccounts.ts";
import { LivingKingdomHub, livingKingdomHub } from "../lib/livingKingdom/hub.ts";
import {
  invalidateLivingKingdomAvatar,
  registerLivingKingdomAvatar,
  resetLivingKingdomAvatarRegistryForTests,
  resolveLivingKingdomAvatar,
} from "../lib/livingKingdom/avatarRegistry.ts";
import {
  invalidateLivingKingdomIdentity,
  livingKingdomIdentityGeneration,
  livingKingdomFeatureAllowsUser,
  livingKingdomFeatureMode,
  loadLivingKingdomIdentityProfile,
  resolveLivingKingdomPreferenceMode,
} from "../lib/livingKingdom/identity.ts";
import {
  LIVING_KINGDOM_PRESENCE_TTL_MS,
  parseLivingKingdomDeleteMutation,
  parseLivingKingdomPostMutation,
  type LivingKingdomStateMutation,
} from "../lib/livingKingdom/protocol.ts";
import {
  livingKingdomRealmForPath,
  livingKingdomRealmHref,
} from "../lib/livingKingdom/realms.ts";
import { livingKingdomUidForManagedAvatarTarget } from "../lib/livingKingdom/managedAvatarTargets.ts";
import { livingKingdomManagedAvatarTargetsForUid } from "../lib/livingKingdom/managedAvatarTargets.ts";
import {
  LivingKingdomActiveStreamRegistry,
  LivingKingdomRateLimiter,
  livingKingdomClientAddress,
} from "../lib/livingKingdom/rateLimit.ts";

const repoRoot = new URL("../", import.meta.url);

function identity(uid: string, publicId = `lk_${uid}`) {
  return {
    uid,
    publicId,
    displayName: `Citizen ${uid}`,
    avatarUrl: `/avatar/${uid}.webp`,
  };
}

function state(
  tabId: string,
  seq: number,
  overrides: Partial<LivingKingdomStateMutation> = {},
): LivingKingdomStateMutation {
  return {
    protocol: 1,
    kind: "state",
    tabId,
    seq,
    realmId: "home",
    depthBand: 5,
    motion: "idle",
    visibility: "visible",
    ...overrides,
  };
}

test("protocol rejects unknown fields, invalid depth, stale protocol, and short tab ids", () => {
  assert.equal(LIVING_KINGDOM_PRESENCE_TTL_MS, 90_000);
  assert.equal(parseLivingKingdomPostMutation(state("tab_0001", 1)).ok, true);
  assert.equal(
    parseLivingKingdomPostMutation(state("tab_0001", 2, { renewOnly: true })).ok,
    true,
  );
  assert.equal(
    parseLivingKingdomPostMutation(
      state("tab_0001", 2, { realmId: "page:/clans/jims-clan" }),
    ).ok,
    true,
  );
  assert.equal(
    parseLivingKingdomPostMutation(
      state("tab_0001", 3, { realmId: "page:/admin/user-list" as never }),
    ).ok,
    false,
  );
  assert.equal(
    parseLivingKingdomPostMutation({ ...state("tab_0001", 1), uid: "must-not-enter" }).ok,
    false,
  );
  assert.equal(
    parseLivingKingdomPostMutation({ ...state("tab_0001", 1), renewOnly: "yes" }).ok,
    false,
  );
  assert.equal(parseLivingKingdomPostMutation(state("tab_0001", 1, { depthBand: 21 })).ok, false);
  assert.equal(parseLivingKingdomPostMutation({ ...state("tab_0001", 1), protocol: 2 }).ok, false);
  assert.equal(parseLivingKingdomDeleteMutation({ protocol: 1, tabId: "short", seq: 2 }).ok, false);
});

test("realm registry is allowlisted and private precedence wins", () => {
  assert.equal(livingKingdomRealmForPath("/watch"), "watch");
  assert.equal(livingKingdomRealmForPath("/live-games"), "live-games");
  assert.notEqual(
    livingKingdomRealmForPath("/watch"),
    livingKingdomRealmForPath("/live-games"),
  );
  assert.equal(livingKingdomRealmForPath("/traffic"), "traffic");
  assert.equal(livingKingdomRealmForPath("/wolochain"), "wolo");
  assert.equal(livingKingdomRealmForPath("/requests"), "community");
  assert.equal(livingKingdomRealmForPath("/clans"), "clans");
  assert.equal(livingKingdomRealmForPath("/clans/jims-clan"), "page:/clans/jims-clan");
  assert.equal(livingKingdomRealmForPath("/clans/aoe2war"), "page:/clans/aoe2war");
  assert.equal(livingKingdomRealmForPath("/bets"), "bets");
  assert.equal(livingKingdomRealmForPath("/bets/481"), "page:/bets/481");
  assert.equal(livingKingdomRealmForPath("/game-stats/42"), "page:/game-stats/42");
  assert.equal(livingKingdomRealmForPath("/game-stats/42/review"), null);
  assert.equal(livingKingdomRealmForPath("/game-stats/live/42"), null);
  assert.equal(livingKingdomRealmForPath("/market/invoices/sealed"), null);
  assert.equal(livingKingdomRealmForPath("/market/%69nvoices/sealed"), null);
  assert.equal(livingKingdomRealmForPath("/bets/%62roadcast-previews/private"), null);
  assert.equal(livingKingdomRealmForPath("/game-stats/%6cive/private"), null);
  assert.equal(livingKingdomRealmForPath("/game-stats/42/%72eview"), null);
  assert.equal(livingKingdomRealmForPath("/market/%2569nvoices/sealed"), null);
  assert.equal(livingKingdomRealmForPath("/market/%2e%2e/admin"), null);
  assert.equal(livingKingdomRealmForPath("/market/%zz"), null);
  assert.equal(livingKingdomRealmForPath("/ai"), "community");
  assert.equal(livingKingdomRealmForPath("/unknown-future-page"), null);
  assert.equal(livingKingdomRealmHref("traffic"), "/traffic");
  assert.equal(livingKingdomRealmHref("tournaments"), "/tournaments/founders-cup");
  assert.equal(livingKingdomRealmHref("matchups"), "/rivalries");
  assert.equal(livingKingdomRealmHref("watch"), "/watch");
  assert.equal(livingKingdomRealmHref("live-games"), "/live-games");
  assert.equal(livingKingdomRealmHref("page:/clans/jims-clan"), "/clans/jims-clan");
  assert.equal(livingKingdomRealmHref("page:/bets/481"), "/bets/481");
});

test("invalid feature modes fail closed and staff/canary allowlists are exact", () => {
  assert.equal(livingKingdomFeatureMode(undefined), "off");
  assert.equal(livingKingdomFeatureMode("PUBLIC"), "off");
  assert.equal(livingKingdomFeatureMode("public"), "public");
  assert.equal(
    livingKingdomFeatureAllowsUser({ mode: "staff", uid: "u_staff", isAdmin: false }),
    false,
  );
  assert.equal(
    livingKingdomFeatureAllowsUser({
      mode: "staff",
      uid: "u_staff",
      isAdmin: false,
      staffAllowlist: "u_other,u_staff",
    }),
    true,
  );
  assert.equal(
    livingKingdomFeatureAllowsUser({
      mode: "canary",
      uid: "u_canary",
      isAdmin: false,
      canaryAllowlist: "u_canary",
    }),
    true,
  );
});

test("presence publication is always public-coarse for eligible accounts", async () => {
  assert.equal(resolveLivingKingdomPreferenceMode(null), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode(undefined), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode({ mode: "off" }), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode({ mode: "corrupt" }), "public_coarse");

  const uid = "default-public-profile";
  const avatarUpdatedAt = new Date("2026-08-21T19:00:00.000Z");
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 701,
        uid,
        inGameName: "Default Public Warrior",
        steamPersonaName: null,
        isAdmin: false,
        presencePreference: null,
      }),
    },
    managedMediaAsset: {
      findMany: async () => [
        { id: 801, target: `user-${uid}`, updatedAt: avatarUpdatedAt },
      ],
    },
  };

  const previousFeatureMode = process.env.LIVING_KINGDOM_MODE;
  process.env.LIVING_KINGDOM_MODE = "public";
  try {
    const profile = await loadLivingKingdomIdentityProfile(prisma as never, uid, 1_000);
    assert.equal(profile?.preferenceExists, false);
    assert.equal(profile?.preferenceMode, "public_coarse");
    assert.equal(profile?.displayEligible, true);
    assert.equal(profile?.avatarEligible, true);
    assert.ok(profile?.identity, "an eligible signed-in human with an avatar publishes by default");
  } finally {
    if (previousFeatureMode === undefined) delete process.env.LIVING_KINGDOM_MODE;
    else process.env.LIVING_KINGDOM_MODE = previousFeatureMode;
  }
});

test("legacy stored off rows cannot suppress an eligible avatar", async () => {
  assert.equal(resolveLivingKingdomPreferenceMode({ mode: "off" }), "public_coarse");
  assert.equal(
    resolveLivingKingdomPreferenceMode({ mode: "unexpected-corrupt-value" }),
    "public_coarse",
  );

  const uid = "explicit-private-profile";
  const updatedAt = new Date("2026-08-21T20:00:00.000Z");
  const avatarUpdatedAt = new Date("2026-08-21T19:00:00.000Z");
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 702,
        uid,
        inGameName: "Private Warrior",
        steamPersonaName: null,
        isAdmin: false,
        presencePreference: {
          mode: "off",
          enabledAt: null,
          updatedAt,
        },
      }),
    },
    managedMediaAsset: {
      findMany: async () => [
        { id: 802, target: `user-${uid}`, updatedAt: avatarUpdatedAt },
      ],
    },
  };

  const previousFeatureMode = process.env.LIVING_KINGDOM_MODE;
  process.env.LIVING_KINGDOM_MODE = "public";
  try {
    const profile = await loadLivingKingdomIdentityProfile(prisma as never, uid, 1_000);
    assert.equal(profile?.preferenceExists, true);
    assert.equal(profile?.preferenceMode, "public_coarse");
    assert.equal(profile?.preferenceUpdatedAt, updatedAt);
    assert.equal(profile?.displayEligible, true);
    assert.equal(profile?.avatarEligible, true);
    assert.ok(profile?.identity, "legacy preference rows are non-authoritative");
  } finally {
    if (previousFeatureMode === undefined) delete process.env.LIVING_KINGDOM_MODE;
    else process.env.LIVING_KINGDOM_MODE = previousFeatureMode;
  }
});

test("an admin-created featured or pool avatar makes a new signup immediately eligible", async () => {
  const uid = "new-avatarized-warrior";
  const featuredTarget = `user-${uid}-featured`;
  const avatarUpdatedAt = new Date("2026-08-22T05:00:00.000Z");
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 706,
        uid,
        inGameName: "New Warrior",
        steamPersonaName: null,
        isAdmin: false,
        presencePreference: { mode: "off", enabledAt: null, updatedAt: avatarUpdatedAt },
      }),
    },
    managedMediaAsset: {
      findMany: async () => [
        { id: 806, target: `user-${uid}-pool`, updatedAt: avatarUpdatedAt },
        { id: 807, target: featuredTarget, updatedAt: avatarUpdatedAt },
      ],
    },
  };

  const previousFeatureMode = process.env.LIVING_KINGDOM_MODE;
  process.env.LIVING_KINGDOM_MODE = "public";
  resetLivingKingdomAvatarRegistryForTests();
  try {
    const profile = await loadLivingKingdomIdentityProfile(prisma as never, uid, 1_000);
    assert.equal(profile?.avatarEligible, true);
    assert.equal(profile?.preferenceMode, "public_coarse");
    assert.match(
      profile?.avatarUrl ?? "",
      new RegExp(`/api/media-assets/avatar/${featuredTarget}\\?`),
      "the private first-frame avatar uses the selected featured target",
    );
    assert.ok(profile?.identity);
    assert.deepEqual(resolveLivingKingdomAvatar(profile!.identity!.publicId, 1_001), {
      target: featuredTarget,
      fallback: "/champions/players/silhouette.webp",
    });
  } finally {
    invalidateLivingKingdomIdentity(uid);
    resetLivingKingdomAvatarRegistryForTests();
    if (previousFeatureMode === undefined) delete process.env.LIVING_KINGDOM_MODE;
    else process.env.LIVING_KINGDOM_MODE = previousFeatureMode;
  }
});

test("admin avatar target invalidation resolves a bounded verified UID candidate", async () => {
  const uid = "u_0123456789abcdef0123456789abcdef";
  let requestedUids: string[] = [];
  const prisma = {
    user: {
      findMany: async (query: { where: { uid: { in: string[] } } }) => {
        requestedUids = query.where.uid.in;
        return requestedUids.includes(uid) ? [{ uid }] : [];
      },
    },
  };

  assert.equal(
    await livingKingdomUidForManagedAvatarTarget(
      prisma as never,
      "user-u-0123456789abcdef0123456789abcdef-featured",
    ),
    uid,
  );
  assert.ok(requestedUids.length <= 3);
  assert.equal(requestedUids.includes(uid), true);
  assert.equal(
    await livingKingdomUidForManagedAvatarTarget(prisma as never, "global-warrior-avatar"),
    null,
  );
});

test("an in-flight stale identity read cannot repopulate avatar bindings", async () => {
  const uid = "deferred-avatar-race";
  const avatarUpdatedAt = new Date("2026-08-21T19:00:00.000Z");
  const nextAvatarUpdatedAt = new Date("2026-08-21T20:00:00.000Z");
  const preferenceUpdatedAt = new Date("2026-08-21T20:00:00.000Z");
  const publicUser = {
    id: 704,
    uid,
    inGameName: "Deferred Warrior",
    steamPersonaName: null,
    isAdmin: false,
    presencePreference: null,
  };
  const offUser = {
    ...publicUser,
    presencePreference: {
      mode: "off",
      enabledAt: null,
      updatedAt: preferenceUpdatedAt,
    },
  };
  const avatar = { id: 804, target: `user-${uid}`, updatedAt: avatarUpdatedAt };
  const nextAvatar = { id: 805, target: `user-${uid}`, updatedAt: nextAvatarUpdatedAt };
  const initialPrisma = {
    user: { findUnique: async () => publicUser },
    managedMediaAsset: { findMany: async () => [avatar] },
  };

  let releaseStaleRead!: (value: typeof publicUser) => void;
  let markReadStarted!: () => void;
  const staleRead = new Promise<typeof publicUser>((resolve) => {
    releaseStaleRead = resolve;
  });
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  let userReads = 0;
  const racingPrisma = {
    user: {
      findUnique: async () => {
        userReads += 1;
        if (userReads === 1) {
          markReadStarted();
          return staleRead;
        }
        return offUser;
      },
    },
    managedMediaAsset: {
      findMany: async () => (userReads <= 1 ? [avatar] : [nextAvatar]),
    },
  };

  const previousFeatureMode = process.env.LIVING_KINGDOM_MODE;
  process.env.LIVING_KINGDOM_MODE = "public";
  resetLivingKingdomAvatarRegistryForTests();
  try {
    const initial = await loadLivingKingdomIdentityProfile(initialPrisma as never, uid, 1_000);
    const publicId = initial?.identity?.publicId;
    assert.ok(publicId);

    invalidateLivingKingdomIdentity(uid);
    resetLivingKingdomAvatarRegistryForTests();

    const pending = loadLivingKingdomIdentityProfile(racingPrisma as never, uid, 2_000);
    await readStarted;
    invalidateLivingKingdomIdentity(uid);
    releaseStaleRead(publicUser);

    const resolved = await pending;
    assert.equal(userReads, 2, "the invalidated read is retried exactly once");
    assert.equal(resolved?.preferenceMode, "public_coarse");
    assert.ok(resolved?.identity);
    assert.match(resolved?.identity?.avatarUrl ?? "", new RegExp(`rev=${nextAvatarUpdatedAt.getTime()}`));
    assert.notEqual(resolveLivingKingdomAvatar(publicId, 2_001), null);

    let unexpectedReads = 0;
    const cached = await loadLivingKingdomIdentityProfile(
      {
        user: {
          findUnique: async () => {
            unexpectedReads += 1;
            return publicUser;
          },
        },
        managedMediaAsset: { findMany: async () => [avatar] },
      } as never,
      uid,
      2_001,
    );
    assert.equal(unexpectedReads, 0, "the retry caches only the post-invalidation profile");
    assert.equal(cached?.preferenceMode, "public_coarse");
    assert.match(cached?.identity?.avatarUrl ?? "", new RegExp(`rev=${nextAvatarUpdatedAt.getTime()}`));
  } finally {
    invalidateLivingKingdomIdentity(uid);
    resetLivingKingdomAvatarRegistryForTests();
    if (previousFeatureMode === undefined) delete process.env.LIVING_KINGDOM_MODE;
    else process.env.LIVING_KINGDOM_MODE = previousFeatureMode;
  }
});

test("default-on never projects any reserved system identity", async () => {
  const reservedUids = [
    AI_CONCIERGE_UID,
    AI_GRIMER_UID,
    AI_GUY_UID,
    AOE2WAR_HALL_SCRIBE_UID,
    BETTING_BOT_TONY_UID,
    BETTING_BOT_PAULIE_UID,
    CHALLENGE_PROTOCOL_UID,
    "aoe2hd_ai_clan_test-hall_hall_scribe",
  ];
  const previousFeatureMode = process.env.LIVING_KINGDOM_MODE;
  process.env.LIVING_KINGDOM_MODE = "public";
  try {
    for (const [index, uid] of reservedUids.entries()) {
      invalidateLivingKingdomIdentity(uid);
      const target = livingKingdomManagedAvatarTargetsForUid(uid)[0];
      const prisma = {
        user: {
          findUnique: async () => ({
            id: 703 + index,
            uid,
            inGameName: `System ${index}`,
            steamPersonaName: null,
            isAdmin: true,
            presencePreference: null,
          }),
        },
        managedMediaAsset: {
          findMany: async () => [{
            id: 803 + index,
            target,
            updatedAt: new Date("2026-08-21T19:00:00.000Z"),
          }],
        },
      };
      const profile = await loadLivingKingdomIdentityProfile(
        prisma as never,
        uid,
        1_000 + index,
      );
      assert.equal(profile?.preferenceMode, "public_coarse");
      assert.equal(profile?.avatarEligible, true);
      assert.equal(profile?.displayEligible, false);
      assert.equal(profile?.identity, null);
    }
  } finally {
    for (const uid of reservedUids) invalidateLivingKingdomIdentity(uid);
    if (previousFeatureMode === undefined) delete process.env.LIVING_KINGDOM_MODE;
    else process.env.LIVING_KINGDOM_MODE = previousFeatureMode;
  }
});

test("token bucket enforces a sustained rate while remaining bounded", () => {
  const limiter = new LivingKingdomRateLimiter({
    ratePerSecond: 2,
    burst: 4,
    maxKeys: 2,
    idleTtlMs: 1_000,
  });
  assert.equal(limiter.consume("a", 0).allowed, true);
  assert.equal(limiter.consume("a", 0).allowed, true);
  assert.equal(limiter.consume("a", 0).allowed, true);
  assert.equal(limiter.consume("a", 0).allowed, true);
  assert.equal(limiter.consume("a", 0).allowed, false);
  assert.equal(limiter.consume("a", 500).allowed, true);
  limiter.consume("b", 500);
  limiter.consume("c", 500);
  assert.equal(limiter.size(), 2);
});

test("active stream caps release idempotently without leaking slots", () => {
  const registry = new LivingKingdomActiveStreamRegistry({ perIp: 2, perUid: 1, maxKeys: 4 });
  const first = registry.acquire({ ip: "203.0.113.1", uid: "u_one" });
  assert.equal(first.allowed, true);
  assert.equal(registry.acquire({ ip: "203.0.113.2", uid: "u_one" }).allowed, false);
  const anonymous = registry.acquire({ ip: "203.0.113.1" });
  assert.equal(anonymous.allowed, true);
  assert.equal(registry.acquire({ ip: "203.0.113.1" }).allowed, false);
  assert.equal(registry.activeStreams(), 2);
  if (first.allowed) {
    first.release();
    first.release();
  }
  assert.equal(registry.activeStreams(), 1);
  if (anonymous.allowed) anonymous.release();
  assert.equal(registry.activeStreams(), 0);
});

test("stream admission prefers the proxy-owned client address", () => {
  const proxied = new Request("https://aoe2war.com/api/kingdom-presence/events", {
    headers: {
      "x-real-ip": "203.0.113.40",
      "x-forwarded-for": "198.51.100.8, 203.0.113.40",
    },
  });
  assert.equal(livingKingdomClientAddress(proxied), "203.0.113.40");

  const forwardedOnly = new Request("http://127.0.0.1:3030", {
    headers: { "x-forwarded-for": "198.51.100.8, 127.0.0.1" },
  });
  assert.equal(livingKingdomClientAddress(forwardedOnly), "127.0.0.1");
});

test("same-origin checks ignore client-authored forwarded host", async () => {
  const { isLivingKingdomSameOrigin } = await import(
    "../lib/livingKingdom/rateLimit.ts"
  );
  const forged = new Request("https://aoe2war.com/api/kingdom-presence/state", {
    headers: {
      host: "aoe2war.com",
      origin: "https://attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isLivingKingdomSameOrigin(forged), false);

  const genuine = new Request("https://aoe2war.com/api/kingdom-presence/state", {
    headers: {
      host: "aoe2war.com",
      origin: "https://aoe2war.com",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isLivingKingdomSameOrigin(genuine), true);
});

test("public avatar handles never contain durable account identity", () => {
  resetLivingKingdomAvatarRegistryForTests();
  const uid = "u-0123456789-private";
  const publicId = "lk_abcdefghijklmnopqr";
  const url = registerLivingKingdomAvatar({
    uid,
    publicId,
    target: "user-u-0123456789-private",
    revision: 123,
    nowMs: 1_000,
  });

  assert.equal(
    url,
    "/api/media-assets/avatar/lk_abcdefghijklmnopqr?size=presence&rev=123",
  );
  assert.doesNotMatch(String(url), /0123456789|private|user-/);
  assert.deepEqual(resolveLivingKingdomAvatar(publicId, 1_001), {
    target: "user-u-0123456789-private",
    fallback: "/champions/players/silhouette.webp",
  });
  invalidateLivingKingdomAvatar(uid);
  assert.equal(resolveLivingKingdomAvatar(publicId, 1_002), null);
});

test("identity invalidation advances the process-wide in-flight publish fence", () => {
  const before = livingKingdomIdentityGeneration();
  invalidateLivingKingdomIdentity("consent-fence-user");
  assert.equal(livingKingdomIdentityGeneration(), before + 1);
});

test("identity invalidation removes an already-live actor immediately", () => {
  const uid = "revoked-live-avatar";
  const who = identity("revoked-live-avatar");
  livingKingdomHub.resetForTests();
  livingKingdomHub.upsert(who, state("tab_0001", 1), 1_000);
  assert.equal(livingKingdomHub.publicProjectionForUid(uid, 1_001)?.id, who.publicId);

  invalidateLivingKingdomIdentity(uid);
  assert.equal(livingKingdomHub.publicProjectionForUid(uid, 1_002), null);
  livingKingdomHub.resetForTests();
});

test("one UID projects only its newest visible tab and rejects stale sequences", () => {
  const hub = new LivingKingdomHub({ deltaCoalesceMs: 0 });
  const who = identity("one");
  assert.equal(hub.upsert(who, state("tab_0001", 1), 1_000).accepted, true);
  assert.equal(
    hub.upsert(who, state("tab_0002", 1, { realmId: "staking" }), 1_001).accepted,
    true,
  );
  assert.equal(hub.snapshot("home", 1_001).length, 0);
  assert.equal(hub.snapshot("staking", 1_001)[0]?.id, who.publicId);
  assert.equal(hub.upsert(who, state("tab_0002", 1), 1_002).accepted, false);
  hub.upsert(who, state("tab_0002", 2, { visibility: "hidden" }), 1_003);
  assert.equal(hub.snapshot("home", 1_003)[0]?.id, who.publicId);
});

test("a pagehide leave that beats first publication fences the in-flight state", () => {
  const hub = new LivingKingdomHub({ ttlMs: 10_000, deltaCoalesceMs: 0 });
  const who = identity("fast-close");

  assert.deepEqual(hub.removeTab(who.uid, "tab_fast_close", 2, 1_000), {
    accepted: true,
    selfId: null,
  });
  assert.deepEqual(
    hub.upsert(who, state("tab_fast_close", 1), 1_001),
    { accepted: false, reason: "stale" },
  );
  assert.equal(hub.publicProjectionForUid(who.uid, 1_002), null);
  assert.equal(hub.stats(1_002).activeActors, 0);
  assert.equal(hub.stats(11_000).activeActors, 0);
});

test("static heartbeats renew a tab without stealing projection from the last active page", () => {
  const hub = new LivingKingdomHub({ ttlMs: 10_000, deltaCoalesceMs: 0 });
  const who = identity("multi-tab");
  hub.upsert(
    who,
    state("tab_first", 1, { realmId: "home", motion: "down" }),
    1_000,
  );
  hub.upsert(who, state("tab_second", 1, { realmId: "page:/clans/jims-clan" }), 1_001);

  hub.upsert(
    who,
    state("tab_first", 2, { realmId: "home", renewOnly: true }),
    2_000,
  );
  assert.equal(hub.snapshot("home", 2_000).length, 0);
  assert.equal(hub.snapshot("page:/clans/jims-clan", 2_000)[0]?.id, who.publicId);

  hub.upsert(who, state("tab_first", 3, { realmId: "home" }), 2_001);
  assert.equal(hub.snapshot("home", 2_001)[0]?.id, who.publicId);
  hub.removeTab(who.uid, "tab_first", 4, 2_002);
  assert.equal(
    hub.snapshot("page:/clans/jims-clan", 2_002)[0]?.id,
    who.publicId,
    "closing the active tab immediately falls back to another live tab",
  );
});

test("an evicted fourth tab cannot steal the realm with lease-only heartbeats", () => {
  const hub = new LivingKingdomHub({ maxTabsPerActor: 3, deltaCoalesceMs: 0 });
  const who = identity("four-tab-warrior");
  const startedAt = 1_900_000_000_000;

  assert.equal(hub.upsert(who, state("tab_0001", 1, { realmId: "home" }), startedAt).accepted, true);
  assert.equal(hub.upsert(who, state("tab_0002", 1, { realmId: "staking" }), startedAt + 1).accepted, true);
  assert.equal(hub.upsert(who, state("tab_0003", 1, { realmId: "bets" }), startedAt + 2).accepted, true);
  assert.equal(
    hub.upsert(
      who,
      state("tab_0004", 1, { realmId: "page:/clans/aoe2war" }),
      startedAt + 3,
    ).accepted,
    true,
  );
  assert.equal(
    hub.publicProjectionForUid(who.uid, startedAt + 4)?.realmId,
    "page:/clans/aoe2war",
  );

  const rejectedRenewal = hub.upsert(
    who,
    state("tab_0001", 2, { realmId: "home", renewOnly: true }),
    startedAt + 8_000,
  );
  assert.deepEqual(rejectedRenewal, { accepted: false, reason: "missing" });
  assert.equal(
    hub.publicProjectionForUid(who.uid, startedAt + 8_001)?.realmId,
    "page:/clans/aoe2war",
  );
  assert.equal(hub.stats(startedAt + 8_001).tabs, 3);
});

test("door intent is emitted to source only and destination requires later state", () => {
  const hub = new LivingKingdomHub({ deltaCoalesceMs: 0 });
  const sourceEvents: string[] = [];
  const destinationEvents: string[] = [];
  hub.subscribe("home", (event) => sourceEvents.push(event.kind));
  hub.subscribe("staking", (event) => destinationEvents.push(event.kind));
  const who = identity("door");
  hub.upsert(who, state("tab_door", 1), 2_000);
  sourceEvents.length = 0;
  hub.door(
    who,
    {
      protocol: 1,
      kind: "door",
      tabId: "tab_door",
      seq: 2,
      realmId: "home",
      destinationRealmId: "staking",
    },
    2_001,
  );
  assert.equal(sourceEvents.includes("door"), true);
  assert.equal(destinationEvents.includes("door"), false);
  assert.equal(hub.snapshot("staking", 2_001).length, 0);
});

test("TTL, actor cohort, subscriber, and sequence-fence memory are bounded", () => {
  const expiring = new LivingKingdomHub({ ttlMs: 100, deltaCoalesceMs: 0 });
  expiring.upsert(identity("ttl"), state("tab_0ttl", 1), 0);
  assert.equal(expiring.snapshot("home", 99).length, 1);
  assert.equal(expiring.snapshot("home", 100).length, 0);

  const cohort = new LivingKingdomHub({ deltaCoalesceMs: 0 });
  for (let index = 0; index < 70; index += 1) {
    const suffix = String(index).padStart(4, "0");
    cohort.upsert(identity(`u${suffix}`, `lk_${suffix}`), state(`tab_${suffix}`, 1), 1_000 + index);
  }
  const room = cohort.roomSnapshot("home", 1_100, "lk_0069");
  assert.equal(room.actors.length, 64);
  assert.equal(room.overflowCount, 6);
  assert.equal(room.actors.some((actor) => actor.id === "lk_0069"), true);

  const subscribers = new LivingKingdomHub({ maxSubscribers: 1 });
  assert.notEqual(subscribers.subscribe("home", () => undefined), null);
  assert.equal(subscribers.subscribe("home", () => undefined), null);

  const fences = new LivingKingdomHub({
    maxTabsPerActor: 1,
    maxSequenceFencesPerActor: 2,
    deltaCoalesceMs: 0,
  });
  const who = identity("fences");
  fences.upsert(who, state("tab_0001", 10), 1);
  fences.upsert(who, state("tab_0002", 10), 2);
  fences.upsert(who, state("tab_0003", 10), 3);
  assert.equal(fences.upsert(who, state("tab_0001", 1), 4).accepted, true);
});

test("one materialized fanout view preserves the bounded cohort and signed self", () => {
  const hub = new LivingKingdomHub({ deltaCoalesceMs: 0 });
  for (let index = 0; index < 70; index += 1) {
    const suffix = String(index).padStart(4, "0");
    hub.upsert(
      identity(`u${suffix}`, `lk_${suffix}`),
      state(`tab_${suffix}`, 1),
      1_000 + index,
    );
  }

  const view = hub.createRoomFanoutView("home", 1_100);
  const anonymous = view.snapshotForUid(null);
  const signed = view.snapshotForUid("u0069");

  assert.equal(anonymous.actors.length, 64);
  assert.equal(anonymous.overflowCount, 6);
  assert.equal(anonymous.selfId, undefined);
  assert.equal(anonymous.actors.some((actor) => actor.id === "lk_0069"), false);
  assert.equal(signed.actors.length, 64);
  assert.equal(signed.overflowCount, 6);
  assert.equal(signed.selfId, "lk_0069");
  assert.equal(signed.actors.some((actor) => actor.id === "lk_0069"), true);

  hub.removeUser("u0000", 1_101);
  assert.equal(
    view.snapshotForUid(null).actors.some((actor) => actor.id === "lk_0000"),
    true,
    "a single fanout event must remain internally consistent",
  );
  assert.equal(
    hub.createRoomFanoutView("home", 1_101).snapshotForUid(null).actors.some(
      (actor) => actor.id === "lk_0000",
    ),
    false,
  );
});

test("delta fanout coalesces to the latest actor state", async () => {
  const hub = new LivingKingdomHub({ deltaCoalesceMs: 20 });
  const events: Array<{ kind: string; data: unknown }> = [];
  hub.subscribe("home", (event) => events.push(event));
  const who = identity("batch");
  hub.upsert(who, state("tab_batch", 1, { depthBand: 1 }), Date.now());
  hub.upsert(who, state("tab_batch", 2, { depthBand: 9 }), Date.now() + 1);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "delta");
  const data = events[0].data as { upserts: Array<{ depthBand: number }> };
  assert.equal(data.upserts[0]?.depthBand, 9);
});

test("routes use strict session auth and never persist or export raw movement identity", () => {
  const stateRoute = readFileSync(new URL("app/api/kingdom-presence/state/route.ts", repoRoot), "utf8");
  const eventsRoute = readFileSync(new URL("app/api/kingdom-presence/events/route.ts", repoRoot), "utf8");
  const preferenceRoute = readFileSync(
    new URL("app/api/user/presence-preference/route.ts", repoRoot),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "prisma/migrations/20260821120000_add_user_presence_preference/migration.sql",
      repoRoot,
    ),
    "utf8",
  );

  assert.match(stateRoute, /getSessionUid/);
  assert.match(stateRoute, /loadLivingKingdomIdentityProfile/);
  assert.doesNotMatch(stateRoute, /presence_disabled|opt_in_required/);
  assert.doesNotMatch(stateRoute, /resolveRequestUid|UserActivityEvent|recordUserActivity|Traffic/);
  const deleteHandler = stateRoute.slice(stateRoute.indexOf("export async function DELETE"));
  assert.match(deleteHandler, /livingKingdomHub\.removeTab/);
  assert.doesNotMatch(
    deleteHandler,
    /rateLimitMutation/,
    "authenticated unload cleanup must not lose its leave token to prior scroll updates",
  );
  assert.match(eventsRoute, /status: 204/);
  assert.match(eventsRoute, /retry: 3000.*snapshot/s);
  assert.match(eventsRoute, /new WeakMap<LivingKingdomRoomEvent/);
  assert.match(eventsRoute, /createRoomFanoutView/);
  assert.match(eventsRoute, /snapshotForRoom\(realmId, uid, event\)/);
  assert.doesNotMatch(eventsRoute, /publicProjectionForUid/);
  assert.match(preferenceRoute, /code: "presence_always_on"/);
  assert.match(preferenceRoute, /status: 405/);
  assert.doesNotMatch(
    preferenceRoute,
    /userPresencePreference\.(?:create|update|upsert|delete)|livingKingdomHub\.removeUser|invalidateLivingKingdomIdentity/,
  );
  assert.doesNotMatch(preferenceRoute, /recordUserActivity|UserActivityEvent/);
  assert.match(migration, /public_coarse/);
  assert.doesNotMatch(migration, /"(?:depth|realm|path|tab_id)"/i);
});
