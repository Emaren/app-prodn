import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LIVE_GAME_CLIENT_GRACE_MS,
  liveSessionIdentity,
  reconcileLiveGamesSnapshots,
} from "../lib/liveGamesClientReconcile.ts";
import {
  RECENT_OUTCOME_BASE_WINDOW_MS,
  RECENT_OUTCOME_BUSY_WINDOW_MS,
  RECENT_OUTCOME_SURGE_WINDOW_MS,
  compareLiveSessionOrder,
  earliestLiveObservationMs,
  isInRecentOutcomePresentationWindow,
  recentOutcomePresentationWindowMs,
} from "../lib/liveSessionOrdering.ts";
import {
  collectLiveLaneIdentities,
  excludeOccupiedLiveLaneItems,
  projectArchiveLane,
  projectArchiveLaneAcrossPages,
  type LiveGamesSnapshot,
} from "../lib/liveGames.ts";

type LiveSession = LiveGamesSnapshot["activeSessions"][number];

function liveSession(index: number, overrides: Partial<LiveSession> = {}): LiveSession {
  const startedAt = new Date(Date.UTC(2026, 7, 26, 12, 0, index)).toISOString();
  return {
    id: index + 1,
    sessionKey: `platform:battle-${String(index).padStart(3, "0")}`,
    identityAliases: [],
    replayFile: "MP Replay shared-name.aoe2record",
    replayHash: `rolling-${index}-a`,
    parseIteration: 1,
    createdAt: startedAt,
    updatedAt: startedAt,
    completedAt: null,
    playedOn: startedAt,
    mapName: "Yucatan",
    durationSeconds: 10,
    originalFilename: "MP Replay shared-name.aoe2record",
    disconnectDetected: false,
    winner: null,
    bettingEligible: false,
    parseReason: "watcher_live_iteration",
    parseSource: "watcher_live",
    unresolvedResult: null,
    state: "live",
    finalProofPending: false,
    players: [
      { name: `Left ${index}`, winner: null },
      { name: `Right ${index}`, winner: null },
    ],
    teamResolution: {
      format: "1v1",
      teams: [],
      confident: true,
      reasonCodes: [],
    },
    uploaders: [],
    watcherCount: 1,
    watcherIds: [`watcher-${index}`],
    watcherSessionIds: [`watcher-session-${index}`],
    replayFingerprints: [`${1000 + index}:1`],
    watcherVersions: ["1.0.0"],
    parseRows: 1,
    coverageLevel: "single",
    disposition: "live",
    uploader: null,
    streams: [],
    primaryStream: null,
    ...overrides,
  } as LiveSession;
}

function snapshot(activeSessions: LiveSession[]): LiveGamesSnapshot {
  return {
    liveCount: activeSessions.length,
    readyCount: 0,
    onDeckCount: 0,
    updatedAt: "2026-08-26T12:10:00.000Z",
    tournament: null,
    activeSessions,
    recentlyCompletedSessions: [],
    liveMatches: [],
    readyMatches: [],
    scheduledMatches: [],
    recentMatches: [],
    archiveTotal: 0,
  };
}

test("250 simultaneous platform sessions survive heartbeat and fingerprint churn without overtaking", () => {
  const initialSessions = Array.from({ length: 250 }, (_, index) => liveSession(index));
  const initial = snapshot(initialSessions);
  const seenAt = new Map(
    initialSessions.map((session) => [liveSessionIdentity(session), 1_000])
  );

  const incomingSessions = initialSessions
    .filter((_, index) => index !== 77)
    .map((session, index) => ({
      ...session,
      id: session.id + 10_000,
      // Simulate the rolling DB window losing the original observation.
      createdAt: new Date(Date.parse(session.createdAt) + 12 * 60_000).toISOString(),
      playedOn: new Date(Date.parse(session.playedOn ?? session.createdAt) + 12 * 60_000).toISOString(),
      updatedAt: new Date(Date.parse(session.updatedAt) + (250 - index) * 1000).toISOString(),
      parseIteration: 20,
      watcherIds: [...session.watcherIds, `mirror-${index}`],
      replayFingerprints: [`${9000 + index}:99`],
    }))
    .reverse();
  incomingSessions.push(
    liveSession(250, {
      sessionKey: "platform:genuinely-new",
      createdAt: "2026-08-26T12:30:00.000Z",
      playedOn: "2026-08-26T12:30:00.000Z",
      updatedAt: "2026-08-26T12:30:05.000Z",
    })
  );

  const reconciled = reconcileLiveGamesSnapshots(
    initial,
    snapshot(incomingSessions),
    seenAt,
    5_000
  );

  assert.equal(reconciled.activeSessions.length, 251);
  assert.deepEqual(
    reconciled.activeSessions.slice(0, 250).map((session) => session.sessionKey),
    initialSessions.map((session) => session.sessionKey)
  );
  assert.equal(reconciled.activeSessions.at(-1)?.sessionKey, "platform:genuinely-new");
  assert.equal(reconciled.activeSessions[77].sessionKey, "platform:battle-077");
  assert.deepEqual(reconciled.activeSessions[0].watcherIds, ["mirror-0", "watcher-0"]);
  assert.deepEqual(reconciled.activeSessions[0].replayFingerprints, ["1000:1", "9000:99"]);
  assert.equal(reconciled.activeSessions[0].createdAt, initialSessions[0].createdAt);
});

test("a completed identity exits active immediately while an unproven omission expires quickly", () => {
  const session = liveSession(1);
  const initial = snapshot([session]);
  const identity = liveSessionIdentity(session);
  const completed = {
    ...session,
    state: "completed" as const,
    completedAt: "2026-08-26T12:10:00.000Z",
  };
  const completedIncoming = {
    ...snapshot([]),
    recentlyCompletedSessions: [completed],
  };

  const completedResult = reconcileLiveGamesSnapshots(
    initial,
    completedIncoming,
    new Map([[identity, 1_000]]),
    2_000
  );
  assert.equal(completedResult.activeSessions.length, 0);

  const expiredResult = reconcileLiveGamesSnapshots(
    initial,
    snapshot([]),
    new Map([[identity, 1_000]]),
    1_000 + LIVE_GAME_CLIENT_GRACE_MS + 1
  );
  assert.equal(expiredResult.activeSessions.length, 0);
});

test("an unproven legacy-to-platform rename expires the old card within grace", () => {
  const legacy = liveSession(2, {
    sessionKey: "legacy:mp%20replay.aoe2record:watcher:one-process:battle:91",
    originalFilename: "MP Replay.aoe2record",
    replayFile: "MP Replay.aoe2record",
    watcherSessionIds: ["one-process"],
  });
  const exact = liveSession(2, {
    id: 102,
    sessionKey: "platform:exact-battle-102",
    originalFilename: "MP Replay.aoe2record",
    replayFile: "MP Replay.aoe2record",
    watcherSessionIds: ["one-process"],
    updatedAt: "2026-08-26T12:01:00.000Z",
  });
  const legacyIdentity = liveSessionIdentity(legacy);
  const seenAt = new Map([[legacyIdentity, 1_000]]);

  const duringGrace = reconcileLiveGamesSnapshots(
    snapshot([legacy]),
    snapshot([exact]),
    seenAt,
    2_000
  );
  assert.deepEqual(
    duringGrace.activeSessions.map((session) => session.sessionKey),
    [legacy.sessionKey, exact.sessionKey]
  );

  const afterGrace = reconcileLiveGamesSnapshots(
    duringGrace,
    snapshot([exact]),
    seenAt,
    1_000 + LIVE_GAME_CLIENT_GRACE_MS + 1
  );
  assert.deepEqual(
    afterGrace.activeSessions.map((session) => session.sessionKey),
    [exact.sessionKey]
  );
});

test("server-proven promotion aliases collapse many watcher cards immediately and keep their slot", () => {
  const firstLegacy = liveSession(2, {
    sessionKey: "legacy:mp%20replay.aoe2record:watcher:jims:battle:91",
    watcherIds: ["jim"],
    watcherSessionIds: ["jims"],
  });
  const otherBattle = liveSession(9, {
    sessionKey: "platform:other-battle",
    watcherIds: ["other"],
  });
  const secondLegacy = liveSession(3, {
    sessionKey: "legacy:mp%20replay.aoe2record:watcher:zodiac:battle:92",
    watcherIds: ["zodiac"],
    watcherSessionIds: ["zodiac"],
  });
  const exact = liveSession(20, {
    sessionKey: "platform:shared-battle",
    identityAliases: [firstLegacy.sessionKey, secondLegacy.sessionKey],
    watcherIds: ["mouldy"],
    watcherSessionIds: ["mouldy"],
    updatedAt: "2026-08-26T12:10:00.000Z",
  });
  const initial = snapshot([firstLegacy, otherBattle, secondLegacy]);
  const seenAt = new Map(
    initial.activeSessions.map((session) => [liveSessionIdentity(session), 1_000])
  );

  const reconciled = reconcileLiveGamesSnapshots(
    initial,
    snapshot([otherBattle, exact]),
    seenAt,
    2_000
  );

  assert.deepEqual(
    reconciled.activeSessions.map((session) => session.sessionKey),
    [exact.sessionKey, otherBattle.sessionKey]
  );
  assert.deepEqual(reconciled.activeSessions[0].watcherIds, ["jim", "mouldy", "zodiac"]);
  assert.equal(reconciled.activeSessions[0].watcherCount, 3);
  assert.equal(reconciled.activeSessions[0].coverageLevel, "stacked");
  assert.equal(seenAt.has(liveSessionIdentity(firstLegacy)), false);
  assert.equal(seenAt.has(liveSessionIdentity(secondLegacy)), false);
});

test("a completed canonical identity removes every exact legacy alias immediately", () => {
  const legacy = liveSession(2, {
    sessionKey: "legacy:mp%20replay.aoe2record:watcher:jims:battle:91",
  });
  const completed = liveSession(20, {
    sessionKey: "platform:shared-battle",
    identityAliases: [legacy.sessionKey],
    state: "completed",
    completedAt: "2026-08-26T12:10:00.000Z",
  });
  const result = reconcileLiveGamesSnapshots(
    snapshot([legacy]),
    {
      ...snapshot([]),
      recentlyCompletedSessions: [completed],
    },
    new Map([[liveSessionIdentity(legacy), 1_000]]),
    2_000
  );

  assert.equal(result.activeSessions.length, 0);
});

test("shared ordering uses anchored start and identity, never heartbeat rank", () => {
  const sessions = [
    liveSession(2, { sessionKey: "platform:z", updatedAt: "2026-08-26T14:00:00Z" }),
    liveSession(0, { sessionKey: "platform:a", updatedAt: "2026-08-26T15:00:00Z" }),
    liveSession(1, { sessionKey: "platform:m", updatedAt: "2026-08-26T13:00:00Z" }),
  ];
  const expected = sessions.map((session) => session.sessionKey).sort();
  const equalStart = sessions.map((session) => ({
    ...session,
    createdAt: "2026-08-26T12:00:00Z",
  }));

  assert.deepEqual(
    equalStart.sort(compareLiveSessionOrder).map((session) => session.sessionKey),
    expected
  );
  assert.equal(
    earliestLiveObservationMs([
      { createdAt: "2026-08-26T12:04:00Z" },
      { createdAt: "2026-08-26T12:01:00Z" },
      { createdAt: "2026-08-26T12:03:00Z" },
    ]),
    Date.parse("2026-08-26T12:01:00Z")
  );
});

test("recent-outcome presentation adapts without changing proof retention", () => {
  assert.equal(recentOutcomePresentationWindowMs(2, 2), RECENT_OUTCOME_BASE_WINDOW_MS);
  assert.equal(recentOutcomePresentationWindowMs(8, 2), RECENT_OUTCOME_BUSY_WINDOW_MS);
  assert.equal(recentOutcomePresentationWindowMs(20, 4), RECENT_OUTCOME_SURGE_WINDOW_MS);
  assert.equal(
    isInRecentOutcomePresentationWindow(
      { completedAt: "2026-08-26T12:00:00Z" },
      Date.parse("2026-08-26T12:14:59Z"),
      RECENT_OUTCOME_BASE_WINDOW_MS
    ),
    true
  );
  assert.equal(
    isInRecentOutcomePresentationWindow(
      { completedAt: "2026-08-26T12:00:00Z" },
      Date.parse("2026-08-26T12:15:01Z"),
      RECENT_OUTCOME_BASE_WINDOW_MS
    ),
    false
  );
});

test("a scheduled completed battle occupies the archive exclusion lane", () => {
  const scheduledCompleted = liveSession(10, {
    id: 501,
    sessionKey: "platform:scheduled-final-501",
    state: "completed",
    completedAt: "2026-08-26T12:10:00.000Z",
  });
  const duplicateArchiveRow = {
    id: 9001,
    sessionKey: "platform:scheduled-final-501",
    replayHash: "final-copy",
    winner: "Left 10",
    map: { name: "Yucatan" },
    players: [{ name: "Left 10" }, { name: "Right 10" }],
    played_on: "2026-08-26T12:10:00.000Z",
    timestamp: "2026-08-26T12:10:00.000Z",
  };
  const unrelatedArchiveRow = {
    ...duplicateArchiveRow,
    id: 9002,
    sessionKey: "platform:other-final-9002",
  };

  const projection = projectArchiveLane(
    [duplicateArchiveRow, unrelatedArchiveRow],
    collectLiveLaneIdentities([scheduledCompleted]),
    24
  );

  assert.deepEqual(projection.matches.map((match) => match.id), [9002]);
  assert.equal(projection.rawConsumed, 2);
});

test("a canonical active battle occupies its exact pre-platform watcher alias lane", () => {
  const legacySessionKey = "watcher:zodiac:session-before-platform-truth";
  const active = liveSession(10, {
    id: 501,
    sessionKey: "platform:canonical-battle-501",
    identityAliases: [legacySessionKey],
  });
  const legacyCompleted = liveSession(11, {
    id: 0,
    sessionKey: legacySessionKey,
    state: "completed",
    completedAt: "2026-08-26T12:10:00.000Z",
  });
  const legacyArchive = {
    id: 9001,
    sessionKey: legacySessionKey,
    replayHash: "legacy-final-copy",
  };

  const occupied = collectLiveLaneIdentities([active]);
  assert.deepEqual(
    excludeOccupiedLiveLaneItems([legacyCompleted], occupied),
    []
  );
  assert.deepEqual(projectArchiveLane([legacyArchive], occupied, 24).matches, []);
});

test("server lifecycle projection assigns one battle to exactly one strongest lane", () => {
  const active = liveSession(10, {
    id: 501,
    sessionKey: "platform:shared-lifecycle-501",
  });
  const duplicateCompleted = {
    ...active,
    state: "completed" as const,
    completedAt: "2026-08-26T12:10:00.000Z",
  };
  const uniqueCompleted = liveSession(11, {
    id: 502,
    sessionKey: "platform:recent-only-502",
    state: "completed",
    completedAt: "2026-08-26T12:11:00.000Z",
  });

  const activeIdentities = collectLiveLaneIdentities([active]);
  const completed = excludeOccupiedLiveLaneItems(
    [duplicateCompleted, uniqueCompleted],
    activeIdentities
  );
  assert.deepEqual(
    completed.map((session) => session.sessionKey),
    [uniqueCompleted.sessionKey]
  );

  const occupied = collectLiveLaneIdentities([active, ...completed]);
  const archive = projectArchiveLane(
    [
      {
        id: 501,
        sessionKey: active.sessionKey,
        replayHash: "active-final-copy",
      },
      {
        id: 502,
        sessionKey: uniqueCompleted.sessionKey,
        replayHash: "recent-final-copy",
      },
      {
        id: 503,
        sessionKey: "platform:archive-only-503",
        replayHash: "archive-only",
      },
    ],
    occupied,
    24
  );
  assert.deepEqual(
    archive.matches.map((match) => match.sessionKey),
    ["platform:archive-only-503"]
  );

  const identityCounts = new Map<string, number>();
  for (const entry of [active, ...completed, ...archive.matches]) {
    for (const identity of collectLiveLaneIdentities([entry])) {
      identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    }
  }
  assert.ok([...identityCounts.values()].every((count) => count === 1));
});

test("archive projection pages past a concurrency surge and preserves the logical cursor", async () => {
  const occupiedSessions = Array.from({ length: 100 }, (_, index) =>
    liveSession(index, {
      id: 10_000 + index,
      sessionKey: `platform:occupied-${index}`,
    })
  );
  const occupied = collectLiveLaneIdentities(occupiedSessions);
  const archiveMatch = (index: number, occupiedMatch = false) => ({
    id: 20_000 + index,
    sessionKey: occupiedMatch
      ? `platform:occupied-${index}`
      : `platform:archive-${index}`,
    replayHash: `archive-hash-${index}`,
    winner: `Winner ${index}`,
    map: { name: "Arabia" },
    players: [{ name: `Winner ${index}` }, { name: `Loser ${index}` }],
    createdAt: "2026-08-26T12:00:00.000Z",
    created_at: "2026-08-26T12:00:00.000Z",
    played_on: "2026-08-26T12:00:00.000Z",
    timestamp: "2026-08-26T12:00:00.000Z",
    parse_reason: "recorded_resignation_final",
    original_filename: `MP Replay ${index}.aoe2record`,
    replay_file: `MP Replay ${index}.aoe2record`,
  });
  const firstPage = {
    matches: Array.from({ length: 96 }, (_, index) => archiveMatch(index, true)),
    total: 6_100,
    offset: 0,
    nextOffset: 96,
  };
  const requestedOffsets: number[] = [];

  const projection = await projectArchiveLaneAcrossPages(
    firstPage,
    occupied,
    24,
    async (offset) => {
      requestedOffsets.push(offset);
      return {
        matches: [
          ...Array.from({ length: 4 }, (_, index) => archiveMatch(96 + index, true)),
          ...Array.from({ length: 24 }, (_, index) => archiveMatch(100 + index)),
        ],
        total: 6_100,
        offset,
        nextOffset: offset + 28,
      };
    }
  );

  assert.deepEqual(requestedOffsets, [96]);
  assert.equal(projection.matches.length, 24);
  assert.equal(projection.rawConsumed, 124);
  assert.equal(projection.total, 6_100);
  assert.ok(
    projection.matches.every(
      (match) =>
        [...collectLiveLaneIdentities([match])].every((key) => !occupied.has(key))
    )
  );
});

test("server source keeps platform identity strong and archive pagination cursor-aware", () => {
  const source = readFileSync("lib/liveGames.ts", "utf8");
  const board = readFileSync("components/live/LiveGamesBoard.tsx", "utf8");
  assert.match(source, /canonicalSessionKey\.startsWith\("platform:"\)/);
  assert.match(source, /strongSessionKey\.startsWith\("platform:"\)/);
  assert.match(source, /\.\.\.scheduledCompletedSessions/);
  assert.match(source, /\.\.\.scheduledActiveSessions/);
  assert.match(source, /await projectArchiveLaneAcrossPages\(/);
  assert.match(source, /archiveCursor/);
  assert.match(board, /snapshot\.archiveCursor \?\? snapshot\.recentMatches\.length/);
});
