import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/index.ts";
import {
  dedupeStreamedSessions,
  loadStandaloneLiveStreamSessions,
  sessionStreamKeys,
  streamedSessionDedupeKeys,
  type LiveGamesSnapshot,
} from "../lib/liveGames.ts";
import {
  LIVE_FINAL_PROOF_LOOKBACK_MS,
  LIVE_SESSION_LINGER_MS,
  buildLiveSessionGroupingIndex,
  buildLiveSessionGroupingProjection,
  liveSessionRowGroupingKey,
  loadLiveSessionSnapshot,
  normalizeSessionKey,
  strongLiveReplayAlias,
} from "../lib/liveSessionSnapshot.ts";
import type { WatchStreamPayload } from "../lib/watchStreams.ts";

type StreamedSession = LiveGamesSnapshot["activeSessions"][number];

function stream(id: number, sessionKey: string): WatchStreamPayload {
  const observedAt = "2026-08-26T12:00:00.000Z";
  return {
    id,
    sessionKey,
    provider: "aoe2war",
    sourceType: "watcher_native",
    role: "caster",
    label: "AoE2WAR Live",
    title: "Same generic title",
    url: `aoe2war://stream/${id}`,
    playbackUrl: `/api/streams/${id}/manifest`,
    embedId: null,
    playerLabel: null,
    thumbnailUrl: null,
    mediaMimeType: "video/webm",
    isPrimary: true,
    status: "live",
    chunkCount: 1,
    latestChunkSeq: 0,
    lastHeartbeatAt: observedAt,
    startedAt: observedAt,
    endedAt: null,
    canEmbed: true,
    externalOnly: false,
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

function streamedSession(
  id: number,
  sessionKey: string,
  overrides: Partial<StreamedSession> = {}
): StreamedSession {
  const observedAt = new Date(Date.UTC(2026, 7, 26, 12, 0, id)).toISOString();
  const attachedStream = stream(id, sessionKey);
  return {
    id,
    sessionKey,
    replayFile: `replay-${id}-20260826.aoe2record`,
    replayHash: `hash-${id}`,
    parseIteration: 1,
    createdAt: observedAt,
    updatedAt: observedAt,
    completedAt: null,
    playedOn: observedAt,
    mapName: "Arabia",
    durationSeconds: 30,
    originalFilename: `replay-${id}-20260826.aoe2record`,
    disconnectDetected: false,
    winner: null,
    bettingEligible: false,
    parseReason: "watcher_live_iteration",
    parseSource: "watcher_live",
    unresolvedResult: null,
    state: "live",
    finalProofPending: false,
    players: [{ name: "Jim" }, { name: "Zodiac" }],
    teamResolution: {
      format: "1v1",
      status: "resolved",
      confidence: "high",
      provenance: "explicit",
      teams: [],
      reasonCodes: [],
    },
    uploaders: [],
    watcherCount: 1,
    watcherIds: [`watcher-${id}`],
    watcherSessionIds: [`process-${id}`],
    replayFingerprints: [`fingerprint-${id}`],
    watcherVersions: ["1.5.7"],
    parseRows: 1,
    coverageLevel: "single",
    disposition: "live",
    uploader: null,
    streams: [attachedStream],
    primaryStream: attachedStream,
    ...overrides,
  } as StreamedSession;
}

test("generic legacy replay names use stable watcher scope across partial roster growth", () => {
  const generic = {
    original_filename: "MP Replay.aoe2record",
    replay_file: "/saves/MP Replay.aoe2record",
    map: { name: "Arabia" },
  };
  const first = {
    ...generic,
    id: 1,
    replayHash: "first",
    players: [{ name: "Jim" }, { name: "Zodiac" }],
    key_events: {
      watcher_upload: { watcher_session_id: "process-a" },
    },
  };
  const rollingFirst = {
    ...first,
    id: 2,
    replayHash: "first-next-iteration",
    players: [{ name: "Jim" }],
  };
  const unrelated = {
    ...generic,
    id: 3,
    replayHash: "second",
    players: [{ name: "Rick" }, { name: "Emaren" }],
    key_events: {
      watcher_upload: { watcher_session_id: "process-b" },
    },
  };
  const underSpecified = {
    ...generic,
    id: 4,
    replayHash: "metadata-only",
    players: [{ name: "Jim" }],
    key_events: {},
    user: null,
  };

  assert.equal(
    liveSessionRowGroupingKey(first),
    liveSessionRowGroupingKey(rollingFirst)
  );
  assert.notEqual(
    liveSessionRowGroupingKey(first),
    liveSessionRowGroupingKey(unrelated)
  );
  assert.match(liveSessionRowGroupingKey(underSpecified), /^observation:id:4$/);
});

test("legacy rows without watcher-session metadata scope generic names by uploader", () => {
  const base = {
    original_filename: "MP Replay.aoe2record",
    replay_file: "MP Replay.aoe2record",
    key_events: {},
  };
  const first = liveSessionRowGroupingKey({
    ...base,
    id: 1,
    user: { uid: "uploader-a" },
  });
  const rolling = liveSessionRowGroupingKey({
    ...base,
    id: 2,
    user: { uid: "uploader-a" },
  });
  const unrelated = liveSessionRowGroupingKey({
    ...base,
    id: 3,
    user: { uid: "uploader-b" },
  });

  assert.equal(first, rolling);
  assert.notEqual(first, unrelated);
});

test("one watcher process receives a new battle epoch when a generic replay resets", () => {
  const startedAt = Date.UTC(2026, 7, 26, 12, 0, 0);
  const row = (
    id: number,
    parseIteration: number,
    replayHash: string,
    offsetMs: number,
    players: Array<{ name: string }>
  ) => ({
    id,
    replayHash,
    replay_file: "/saves/MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    parse_iteration: parseIteration,
    createdAt: new Date(startedAt + offsetMs),
    players,
    map: { name: "Arabia" },
    key_events: {
      watcher_upload: { watcher_session_id: "one-long-running-process" },
    },
    user: { uid: "jim" },
  });

  const firstStart = row(1, 1, "first-start", 0, [{ name: "Jim" }]);
  const firstRetry = row(2, 1, "first-start", 1_000, [{ name: "Jim" }]);
  const firstRolling = row(3, 2, "first-growing", 30_000, [
    { name: "Jim" },
    { name: "Zodiac" },
  ]);
  const secondStart = row(4, 1, "second-start", 90_000, [{ name: "Rick" }]);
  const secondRolling = row(5, 2, "second-growing", 120_000, [
    { name: "Rick" },
    { name: "Emaren" },
  ]);
  const secondFinal = row(6, 1, "second-final-proof", 150_000, [
    { name: "Rick" },
    { name: "Emaren" },
  ]);

  const index = buildLiveSessionGroupingIndex([
    firstStart,
    firstRetry,
    firstRolling,
    secondStart,
    secondRolling,
    secondFinal,
  ], new Set([firstStart.id, firstRetry.id, secondStart.id]));

  assert.equal(index.get(firstStart.id), index.get(firstRetry.id));
  assert.equal(index.get(firstStart.id), index.get(firstRolling.id));
  assert.equal(index.get(secondStart.id), index.get(secondRolling.id));
  assert.equal(index.get(secondStart.id), index.get(secondFinal.id));
  assert.notEqual(index.get(firstStart.id), index.get(secondStart.id));
  assert.match(index.get(firstStart.id) ?? "", /:battle:1$/);
  assert.match(index.get(secondStart.id) ?? "", /:battle:4$/);
});

test("a parse-one completion is final proof, never a new generic battle boundary", async () => {
  const startedAt = Date.now() - 60_000;
  const row = (
    id: number,
    parseIteration: number,
    replayHash: string,
    offsetMs: number,
    completed = false
  ) => {
    const observedAt = new Date(startedAt + offsetMs);
    return {
      id,
      replayHash,
      replay_file: "/saves/MP Replay.aoe2record",
      original_filename: "MP Replay.aoe2record",
      parse_iteration: parseIteration,
      createdAt: observedAt,
      timestamp: observedAt,
      played_on: new Date(startedAt),
      map: { name: "Arabia" },
      game_duration: Math.max(1, Math.floor(offsetMs / 1_000)),
      winner: completed ? "Jim" : null,
      players: [
        { name: "Jim", winner: completed ? true : null, team_id: 1 },
        { name: "Zodiac", winner: completed ? false : null, team_id: 2 },
      ],
      event_types: [],
      key_events: {
        ...(completed ? { completed: true, completion_source: "watcher" } : {}),
        watcher_upload: { watcher_session_id: "one-process" },
      },
      disconnect_detected: false,
      parse_reason: completed
        ? "watcher_live_completed"
        : "watcher_live_iteration",
      parse_source: "watcher_live",
      user: {
        uid: "jim",
        inGameName: "Jim",
        steamPersonaName: null,
      },
    };
  };

  const start = row(81, 1, "initial-hash", 0);
  const rolling = row(82, 2, "growing-hash", 20_000);
  const completion = row(83, 1, "final-proof-hash", 40_000, true);
  const responses = [
    [start, rolling, completion],
    [],
    [completion],
    [start, completion],
  ];
  let queryIndex = 0;
  const prisma = {
    gameStats: {
      findMany: async () => responses[queryIndex++] ?? [],
    },
  } as unknown as PrismaClient;

  const snapshot = await loadLiveSessionSnapshot(prisma);
  assert.equal(snapshot.activeSessions.length, 0);
  assert.equal(snapshot.recentlyCompletedSessions.length, 1);
  assert.equal(snapshot.recentlyCompletedSessions[0]?.winner, "Jim");
  assert.match(
    snapshot.recentlyCompletedSessions[0]?.sessionKey ?? "",
    /:battle:81$/
  );
});

test("a UUID replay name remains a strong cross-watcher rolling identity", () => {
  const replayName = "record-550e8400-e29b-41d4-a716-446655440000.aoe2mpgame";
  const first = liveSessionRowGroupingKey({
    id: 1,
    original_filename: replayName,
    replay_file: replayName,
    players: [{ name: "Jim" }, { name: "Zodiac" }],
    key_events: { watcher_upload: { watcher_session_id: "process-a" } },
  });
  const second = liveSessionRowGroupingKey({
    id: 2,
    original_filename: replayName,
    replay_file: replayName,
    players: [{ name: "Jim" }],
    key_events: { watcher_upload: { watcher_session_id: "process-b" } },
  });

  assert.equal(first, second);
  assert.match(first, /^replay:/);
});

test("only a complete replay timestamp qualifies as a global timestamp alias", () => {
  assert.equal(
    strongLiveReplayAlias({
      original_filename: "MP Replay v5.8 @2026.08.26 210331 (1).aoe2record",
    }),
    "mp replay v5.8 @2026.08.26 210331 (1).aoe2record"
  );
  assert.equal(
    strongLiveReplayAlias({
      original_filename: "MP Replay 2026-08-26 12.aoe2record",
    }),
    ""
  );
  assert.equal(
    strongLiveReplayAlias({
      original_filename: "MP Replay 2026-08-26 game-12.aoe2record",
    }),
    ""
  );
});

test("placeholder platform IDs never become global battle identity", () => {
  for (const platformMatchId of [
    "unknown",
    " NONE ",
    "n/a",
    "players parsing",
    "to be determined",
  ]) {
    assert.equal(
      normalizeSessionKey({
        original_filename: "MP Replay.aoe2record",
        key_events: { platform_match_id: platformMatchId },
      }),
      "MP Replay.aoe2record"
    );
  }

  assert.equal(
    normalizeSessionKey({
      original_filename: "MP Replay.aoe2record",
      key_events: {
        platform_match_id: " 3C24787E-36DF-4E15-A5C8-105C90C2CC58 ",
      },
    }),
    "platform:3c24787e-36df-4e15-a5c8-105c90c2cc58"
  );
});

test("a later platform ID promotes its earlier rolling fallback cohort", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const base = {
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    user: { uid: "jim" },
  };
  const early = {
    ...base,
    id: 41,
    replayHash: "rolling-before-platform",
    parse_iteration: 1,
    createdAt: new Date(startedAt),
    key_events: {
      watcher_upload: { watcher_session_id: "process-a" },
    },
  };
  const identified = {
    ...base,
    id: 42,
    replayHash: "rolling-after-platform",
    parse_iteration: 2,
    createdAt: new Date(startedAt + 5_000),
    key_events: {
      platform_match_id: "battle-42",
      watcher_upload: { watcher_session_id: "process-a" },
    },
  };

  const index = buildLiveSessionGroupingIndex(
    [early, identified],
    new Set([early.id])
  );
  assert.equal(index.get(early.id), "platform:battle-42");
  assert.equal(index.get(identified.id), "platform:battle-42");

  const projection = buildLiveSessionGroupingProjection(
    [early, identified],
    new Set([early.id])
  );
  assert.deepEqual(
    projection.promotionAliasesBySessionKey.get("platform:battle-42"),
    ["legacy:mp%20replay.aoe2record:watcher:process-a:battle:41"]
  );
});

test("an uploader-scoped early cohort promotes after watcher metadata appears", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const early = {
    id: 43,
    replayHash: "early-uploader-only",
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    parse_iteration: 1,
    createdAt: new Date(startedAt),
    key_events: {},
    user: { uid: "jim" },
  };
  const identified = {
    ...early,
    id: 44,
    replayHash: "later-exact-platform",
    parse_iteration: 2,
    createdAt: new Date(startedAt + 5_000),
    key_events: {
      platform_match_id: "battle-uploader-bridge",
      watcher_upload: { watcher_session_id: "jim-process" },
    },
  };

  const index = buildLiveSessionGroupingIndex(
    [early, identified],
    new Set([early.id])
  );
  assert.equal(index.get(early.id), "platform:battle-uploader-bridge");
  assert.equal(index.get(identified.id), "platform:battle-uploader-bridge");
});

test("uploader fallback cannot pull another watcher process into a platform battle", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const row = (
    id: number,
    watcherSessionId: string,
    offsetMs: number,
    platformMatchId?: string
  ) => ({
    id,
    replayHash: `rolling-${id}`,
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    parse_iteration: platformMatchId ? 2 : 1,
    createdAt: new Date(startedAt + offsetMs),
    key_events: {
      ...(platformMatchId ? { platform_match_id: platformMatchId } : {}),
      watcher_upload: { watcher_session_id: watcherSessionId },
    },
    user: { uid: "shared-uploader" },
  });
  const watcherA = row(45, "process-a", 0);
  const watcherB = row(46, "process-b", 500);
  const watcherAIdentified = row(47, "process-a", 5_000, "battle-a");

  const index = buildLiveSessionGroupingIndex(
    [watcherA, watcherB, watcherAIdentified],
    new Set([watcherA.id, watcherB.id])
  );
  assert.equal(index.get(watcherA.id), "platform:battle-a");
  assert.equal(index.get(watcherAIdentified.id), "platform:battle-a");
  assert.match(index.get(watcherB.id) ?? "", /watcher:process-b/);
});

test("independent fallback cohorts may converge on one exact platform battle", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const row = (
    id: number,
    watcherSessionId: string,
    offsetMs: number,
    platformMatchId?: string
  ) => ({
    id,
    replayHash: `rolling-${id}`,
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    parse_iteration: platformMatchId ? 2 : 1,
    createdAt: new Date(startedAt + offsetMs),
    key_events: {
      ...(platformMatchId ? { platform_match_id: platformMatchId } : {}),
      watcher_upload: { watcher_session_id: watcherSessionId },
    },
    user: { uid: watcherSessionId },
  });
  const jimEarly = row(61, "jim-process", 0);
  const mouldyEarly = row(62, "mouldy-process", 500);
  const jimIdentified = row(63, "jim-process", 5_000, "shared-battle");
  const mouldyIdentified = row(64, "mouldy-process", 5_500, "shared-battle");

  const index = buildLiveSessionGroupingIndex(
    [jimEarly, mouldyEarly, jimIdentified, mouldyIdentified],
    new Set([jimEarly.id, mouldyEarly.id])
  );

  for (const rowId of [61, 62, 63, 64]) {
    assert.equal(index.get(rowId), "platform:shared-battle");
  }

  const projection = buildLiveSessionGroupingProjection(
    [jimEarly, mouldyEarly, jimIdentified, mouldyIdentified],
    new Set([jimEarly.id, mouldyEarly.id])
  );
  assert.deepEqual(
    projection.promotionAliasesBySessionKey.get("platform:shared-battle"),
    [
      "legacy:mp%20replay.aoe2record:watcher:jim-process:battle:61",
      "legacy:mp%20replay.aoe2record:watcher:mouldy-process:battle:62",
    ]
  );
});

test("sequential generic epochs promote only to their own later platform battle", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const row = (
    id: number,
    parseIteration: number,
    offsetMs: number,
    platformMatchId?: string
  ) => ({
    id,
    replayHash: `rolling-${id}`,
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    parse_iteration: parseIteration,
    createdAt: new Date(startedAt + offsetMs),
    key_events: {
      ...(platformMatchId ? { platform_match_id: platformMatchId } : {}),
      watcher_upload: { watcher_session_id: "one-long-running-process" },
    },
    user: { uid: "jim" },
  });
  const firstEarly = row(71, 1, 0);
  const firstIdentified = row(72, 2, 5_000, "battle-one");
  const secondEarly = row(73, 1, 60_000);
  const secondIdentified = row(74, 2, 65_000, "battle-two");

  const index = buildLiveSessionGroupingIndex(
    [firstEarly, firstIdentified, secondEarly, secondIdentified],
    new Set([firstEarly.id, secondEarly.id])
  );

  assert.equal(index.get(firstEarly.id), "platform:battle-one");
  assert.equal(index.get(firstIdentified.id), "platform:battle-one");
  assert.equal(index.get(secondEarly.id), "platform:battle-two");
  assert.equal(index.get(secondIdentified.id), "platform:battle-two");

  const projection = buildLiveSessionGroupingProjection(
    [firstEarly, firstIdentified, secondEarly, secondIdentified],
    new Set([firstEarly.id, secondEarly.id])
  );
  assert.deepEqual(
    projection.promotionAliasesBySessionKey.get("platform:battle-one"),
    [
      "legacy:mp%20replay.aoe2record:watcher:one-long-running-process:battle:71",
    ]
  );
  assert.deepEqual(
    projection.promotionAliasesBySessionKey.get("platform:battle-two"),
    [
      "legacy:mp%20replay.aoe2record:watcher:one-long-running-process:battle:73",
    ]
  );
});

test("strong replay promotion exposes its prior public filename, never an internal grouping key", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const filename = "match-20260826-120000-1234567890abcdef12345678.aoe2record";
  const early = {
    id: 81,
    replayHash: "early-strong-replay",
    replay_file: filename,
    original_filename: filename,
    parse_iteration: 1,
    createdAt: new Date(startedAt),
    key_events: {},
    user: { uid: "jim" },
  };
  const identified = {
    ...early,
    id: 82,
    replayHash: "identified-strong-replay",
    parse_iteration: 2,
    createdAt: new Date(startedAt + 5_000),
    key_events: { platform_match_id: "strong-replay-battle" },
  };

  const projection = buildLiveSessionGroupingProjection([early, identified]);
  assert.deepEqual(
    projection.promotionAliasesBySessionKey.get("platform:strong-replay-battle"),
    [filename]
  );
  assert.equal(
    projection.promotionAliasesBySessionKey
      .get("platform:strong-replay-battle")
      ?.some((alias) => alias.startsWith("replay:")),
    false
  );
});

test("a new epoch and independent watcher cohorts converge only on their shared platform battle", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const row = (input: {
    id: number;
    watcherSessionId: string;
    uploaderUid: string;
    parseIteration: number;
    offsetMs: number;
    platformMatchId?: string;
  }) => ({
    id: input.id,
    replayHash: `rolling-${input.id}`,
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    parse_iteration: input.parseIteration,
    createdAt: new Date(startedAt + input.offsetMs),
    key_events: {
      ...(input.platformMatchId
        ? { platform_match_id: input.platformMatchId }
        : {}),
      watcher_upload: { watcher_session_id: input.watcherSessionId },
    },
    user: { uid: input.uploaderUid },
  });

  const jimOldStart = row({
    id: 91,
    watcherSessionId: "jim-long-running-process",
    uploaderUid: "jim",
    parseIteration: 1,
    offsetMs: 0,
  });
  const jimOldIdentified = row({
    id: 92,
    watcherSessionId: "jim-long-running-process",
    uploaderUid: "jim",
    parseIteration: 2,
    offsetMs: 5_000,
    platformMatchId: "older-battle",
  });
  const jimSharedStart = row({
    id: 93,
    watcherSessionId: "jim-long-running-process",
    uploaderUid: "jim",
    parseIteration: 1,
    offsetMs: 60_000,
  });
  const zodiacSharedStart = row({
    id: 94,
    watcherSessionId: "zodiac-process",
    uploaderUid: "zodiac",
    parseIteration: 1,
    offsetMs: 60_500,
  });
  const mouldySharedStart = row({
    id: 95,
    watcherSessionId: "mouldy-process",
    uploaderUid: "mouldy",
    parseIteration: 1,
    offsetMs: 61_000,
  });
  const jimSharedIdentified = row({
    id: 96,
    watcherSessionId: "jim-long-running-process",
    uploaderUid: "jim",
    parseIteration: 2,
    offsetMs: 65_000,
    platformMatchId: "shared-battle",
  });
  const zodiacSharedIdentified = row({
    id: 97,
    watcherSessionId: "zodiac-process",
    uploaderUid: "zodiac",
    parseIteration: 2,
    offsetMs: 65_500,
    platformMatchId: "shared-battle",
  });
  const mouldySharedIdentified = row({
    id: 98,
    watcherSessionId: "mouldy-process",
    uploaderUid: "mouldy",
    parseIteration: 2,
    offsetMs: 66_000,
    platformMatchId: "shared-battle",
  });

  const index = buildLiveSessionGroupingIndex(
    [
      jimOldStart,
      jimOldIdentified,
      jimSharedStart,
      zodiacSharedStart,
      mouldySharedStart,
      jimSharedIdentified,
      zodiacSharedIdentified,
      mouldySharedIdentified,
    ],
    new Set([
      jimOldStart.id,
      jimSharedStart.id,
      zodiacSharedStart.id,
      mouldySharedStart.id,
    ])
  );

  for (const rowId of [jimOldStart.id, jimOldIdentified.id]) {
    assert.equal(index.get(rowId), "platform:older-battle");
  }
  for (const rowId of [
    jimSharedStart.id,
    zodiacSharedStart.id,
    mouldySharedStart.id,
    jimSharedIdentified.id,
    zodiacSharedIdentified.id,
    mouldySharedIdentified.id,
  ]) {
    assert.equal(index.get(rowId), "platform:shared-battle");
  }
});

test("platform identity promotion fails closed for an ambiguous context", () => {
  const startedAt = Date.parse("2026-08-26T12:00:00.000Z");
  const base = {
    replay_file: "MP Replay.aoe2record",
    original_filename: "MP Replay.aoe2record",
    user: { uid: "jim" },
  };
  const early = {
    ...base,
    id: 51,
    replayHash: "rolling-before-platform",
    parse_iteration: 1,
    createdAt: new Date(startedAt),
    key_events: {
      watcher_upload: { watcher_session_id: "process-a" },
    },
  };
  const platformRow = (id: number, platformMatchId: string, offsetMs: number) => ({
    ...base,
    id,
    replayHash: `platform-${platformMatchId}`,
    parse_iteration: 2,
    createdAt: new Date(startedAt + offsetMs),
    key_events: {
      platform_match_id: platformMatchId,
      watcher_upload: { watcher_session_id: "process-a" },
    },
  });

  const index = buildLiveSessionGroupingIndex(
    [
      early,
      platformRow(52, "battle-a", 2_000),
      platformRow(53, "battle-b", 4_000),
    ],
    new Set([early.id])
  );
  assert.match(index.get(early.id) ?? "", /^legacy:/);
  assert.equal(index.get(52), "platform:battle-a");
  assert.equal(index.get(53), "platform:battle-b");

  const projection = buildLiveSessionGroupingProjection(
    [
      early,
      platformRow(52, "battle-a", 2_000),
      platformRow(53, "battle-b", 4_000),
    ],
    new Set([early.id])
  );
  assert.equal(projection.promotionAliasesBySessionKey.size, 0);
});

test("loader merges same-game watchers through roster and map churn while isolating another game", async () => {
  const startedAt = Date.now() - 90_000;
  const row = (input: {
    id: number;
    platformMatchId?: string;
    watcherId: string;
    watcherSessionId: string;
    uploaderUid: string;
    offsetMs: number;
    players: Array<Record<string, unknown>>;
    map: Record<string, unknown> | null;
  }) => {
    const observedAt = new Date(startedAt + input.offsetMs);
    return {
      id: input.id,
      replayHash: `rolling-${input.id}`,
      replay_file: "/saves/MP Replay.aoe2record",
      original_filename: "MP Replay.aoe2record",
      parse_iteration: input.platformMatchId ? input.id : 1,
      createdAt: observedAt,
      timestamp: observedAt,
      played_on: new Date(startedAt),
      map: input.map,
      game_duration: Math.floor(input.offsetMs / 1_000) + 1,
      winner: null,
      players: input.players,
      event_types: [],
      key_events: {
        ...(input.platformMatchId
          ? { platform_match_id: input.platformMatchId }
          : {}),
        watcher_upload: {
          watcher_id: input.watcherId,
          watcher_session_id: input.watcherSessionId,
          replay_fingerprint: `fingerprint-${input.id}`,
          watcher_version: "1.5.7",
        },
      },
      disconnect_detected: false,
      parse_reason: "watcher_live_iteration",
      parse_source: "watcher_live",
      user: {
        uid: input.uploaderUid,
        inGameName: input.uploaderUid,
        steamPersonaName: null,
      },
    };
  };
  const activeRows = [
    row({
      id: 99,
      watcherId: "watcher-jim",
      watcherSessionId: "process-jim",
      uploaderUid: "Jim",
      offsetMs: -5_000,
      players: [
        { name: "Jim", team_id: 1 },
        { name: "Zodiac", team_id: 2 },
      ],
      map: { name: "Arabia" },
    }),
    row({
      id: 100,
      watcherId: "watcher-zodiac",
      watcherSessionId: "process-zodiac",
      uploaderUid: "Zodiac",
      offsetMs: -4_000,
      players: [
        { name: "Jim", team_id: 1 },
        { name: "Zodiac", team_id: 2 },
      ],
      map: { name: "Arabia" },
    }),
    row({
      id: 101,
      platformMatchId: "shared-game",
      watcherId: "watcher-jim",
      watcherSessionId: "process-jim",
      uploaderUid: "Jim",
      offsetMs: 0,
      players: [
        { name: "Jim", team_id: 1 },
        { name: "Zodiac", team_id: 2 },
      ],
      map: { name: "Arabia" },
    }),
    row({
      id: 102,
      platformMatchId: "shared-game",
      watcherId: "watcher-zodiac",
      watcherSessionId: "process-zodiac",
      uploaderUid: "Zodiac",
      offsetMs: 20_000,
      players: [{ name: "Jim" }],
      map: null,
    }),
    row({
      id: 103,
      platformMatchId: "different-game",
      watcherId: "watcher-mouldy",
      watcherSessionId: "process-mouldy",
      uploaderUid: "Mouldy",
      offsetMs: 10_000,
      players: [
        { name: "Mouldy", team_id: 1 },
        { name: "Emaren", team_id: 2 },
      ],
      map: { name: "Yucatan" },
    }),
  ];
  const responses = [activeRows, [], [], []];
  let queryIndex = 0;
  const prisma = {
    gameStats: {
      findMany: async () => responses[queryIndex++] ?? [],
    },
  } as unknown as PrismaClient;

  const snapshot = await loadLiveSessionSnapshot(prisma);
  assert.equal(snapshot.activeSessions.length, 2);
  const shared = snapshot.activeSessions.find(
    (session) => session.sessionKey === "platform:shared-game"
  );
  const different = snapshot.activeSessions.find(
    (session) => session.sessionKey === "platform:different-game"
  );
  assert.ok(shared);
  assert.ok(different);
  assert.equal(shared.mapName, "Arabia");
  assert.deepEqual(
    shared.players.map((player) => player.name).sort(),
    ["Jim", "Zodiac"]
  );
  assert.deepEqual(shared.watcherIds, ["watcher-jim", "watcher-zodiac"]);
  assert.deepEqual(shared.watcherSessionIds, ["process-jim", "process-zodiac"]);
  assert.equal(shared.watcherCount, 2);
  assert.equal(shared.coverageLevel, "dual");
  assert.deepEqual(shared.identityAliases, [
    "legacy:mp%20replay.aoe2record:watcher:process-jim:battle:99",
    "legacy:mp%20replay.aoe2record:watcher:process-zodiac:battle:100",
  ]);
  assert.deepEqual(
    different.players.map((player) => player.name).sort(),
    ["Emaren", "Mouldy"]
  );
  assert.equal(different.watcherCount, 1);
});

test("200 rolling completion cohorts and 200 canonical finals cannot crowd each other out", async () => {
  const nowMs = Date.now();
  const rollingRows: Array<Record<string, unknown>> = [];
  const canonicalFinalRows: Array<Record<string, unknown>> = [];

  for (let sessionIndex = 0; sessionIndex < 200; sessionIndex += 1) {
    const platformId = `rolling-${sessionIndex}`;
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const observedAt = new Date(nowMs - (50 - iteration) * 1_000);
      rollingRows.push({
        id: sessionIndex * 1_000 + iteration + 1,
        replayHash: `rolling-${sessionIndex}-${iteration}`,
        replay_file: `rolling-${sessionIndex}.aoe2record`,
        original_filename: `rolling-${sessionIndex}.aoe2record`,
        parse_iteration: iteration + 1,
        createdAt: observedAt,
        timestamp: observedAt,
        played_on: new Date(nowMs - 10 * 60_000),
        map: { name: "Arabia" },
        game_duration: iteration + 1,
        winner: `Left ${sessionIndex}`,
        players: [
          { name: `Left ${sessionIndex}`, winner: true, team_id: 1 },
          { name: `Right ${sessionIndex}`, winner: false, team_id: 2 },
        ],
        event_types: [],
        key_events: {
          platform_match_id: platformId,
          completed: true,
          watcher_upload: {
            watcher_id: `watcher-${sessionIndex % 5}`,
            watcher_session_id: `process-${sessionIndex % 5}`,
          },
        },
        disconnect_detected: false,
        parse_reason: "watcher_live_completed",
        parse_source: "watcher_live",
        user: null,
      });
    }

    const finalObservedAt = new Date(nowMs - sessionIndex);
    canonicalFinalRows.push({
      id: 500_000 + sessionIndex,
      replayHash: `final-${sessionIndex}`,
      replay_file: `final-${sessionIndex}.aoe2record`,
      original_filename: `final-${sessionIndex}.aoe2record`,
      parse_iteration: 1,
      createdAt: finalObservedAt,
      timestamp: finalObservedAt,
      played_on: new Date(nowMs - 10 * 60_000),
      map: { name: "Yucatan" },
      game_duration: 600,
      winner: `Winner ${sessionIndex}`,
      players: [
        { name: `Winner ${sessionIndex}`, winner: true, team_id: 1 },
        { name: `Loser ${sessionIndex}`, winner: false, team_id: 2 },
      ],
      event_types: [],
      key_events: { platform_match_id: `canonical-final-${sessionIndex}` },
      disconnect_detected: false,
      parse_reason: "watcher_final_submission",
      parse_source: "watcher_final",
      user: null,
    });
  }

  const queries: Array<Record<string, unknown>> = [];
  const prisma = {
    gameStats: {
      findMany: async (args: Record<string, unknown>) => {
        queries.push(args);
        const where = args.where as Record<string, unknown>;
        if (where.is_final === true) return canonicalFinalRows;
        if (where.parse_source === "watcher_live") return rollingRows;
        return rollingRows;
      },
    },
  } as unknown as PrismaClient;

  const snapshot = await loadLiveSessionSnapshot(prisma);
  assert.equal(snapshot.activeSessions.length, 0);
  assert.equal(snapshot.recentlyCompletedSessions.length, 400);

  const finalQuery = queries.find((query) => {
    const where = query.where as Record<string, unknown>;
    return where.is_final === true;
  });
  const completedCompatQuery = queries.find((query) => {
    const where = query.where as Record<string, unknown>;
    return (
      where.parse_source === "watcher_live" &&
      typeof where.parse_iteration === "object"
    );
  });
  const boundaryQuery = queries.find((query) => {
    const where = query.where as Record<string, unknown>;
    return where.parse_source === "watcher_live" && where.parse_iteration === 1;
  });

  assert.ok(finalQuery);
  assert.ok(completedCompatQuery);
  assert.ok(boundaryQuery);
  for (const query of [finalQuery, completedCompatQuery, boundaryQuery]) {
    assert.equal("take" in query, false);
  }

  const finalWhere = finalQuery.where as {
    OR: Array<Record<string, { gte: Date }>>;
  };
  const finalCutoff =
    finalWhere.OR[0]?.timestamp?.gte ?? finalWhere.OR[0]?.createdAt?.gte;
  assert.ok(finalCutoff instanceof Date);
  assert.ok(nowMs - finalCutoff.getTime() <= LIVE_FINAL_PROOF_LOOKBACK_MS + 1_000);
  assert.ok(nowMs - finalCutoff.getTime() >= LIVE_FINAL_PROOF_LOOKBACK_MS - 1_000);

  const compatWhere = completedCompatQuery.where as {
    AND: Array<{ OR: Array<Record<string, unknown>> }>;
  };
  const compatTimeOr = compatWhere.AND[0]?.OR ?? [];
  const compatCutoff = (
    compatTimeOr[0]?.timestamp as { gte?: Date } | undefined
  )?.gte ?? (
    compatTimeOr[0]?.createdAt as { gte?: Date } | undefined
  )?.gte;
  assert.ok(compatCutoff instanceof Date);
  assert.ok(nowMs - compatCutoff.getTime() <= LIVE_SESSION_LINGER_MS + 1_000);
  assert.ok(nowMs - compatCutoff.getTime() >= LIVE_SESSION_LINGER_MS - 1_000);
  const candidateOr = compatWhere.AND[1]?.OR ?? [];
  assert.ok(candidateOr.some((candidate) => "winner" in candidate));
  assert.ok(candidateOr.some((candidate) => "key_events" in candidate));

  const boundaryWhere = boundaryQuery.where as {
    NOT: Array<Record<string, unknown>>;
  };
  assert.equal(
    boundaryWhere.NOT.some((candidate) => "key_events" in candidate),
    false,
    "placeholder platform IDs must reach JavaScript normalization"
  );
  const boundarySelect = boundaryQuery.select as Record<string, unknown>;
  assert.equal("players" in boundarySelect, false);
  assert.equal("event_types" in boundarySelect, false);
});

test("generic stream presentation paths never merge unrelated non-platform sessions", () => {
  const first = streamedSession(-1, "watcher:session-a", {
    parseSource: "watcher_stream",
    replayFile: "Same generic title",
    originalFilename: "Same generic title",
    streams: [stream(1, "watcher:session-a")],
    primaryStream: stream(1, "watcher:session-a"),
  });
  const second = streamedSession(-2, "watcher:session-b", {
    parseSource: "watcher_stream",
    replayFile: "Same generic title",
    originalFilename: "Same generic title",
    streams: [stream(2, "watcher:session-b")],
    primaryStream: stream(2, "watcher:session-b"),
  });

  assert.equal(dedupeStreamedSessions([first, second]).length, 2);
  for (const key of [
    ...streamedSessionDedupeKeys(first),
    ...streamedSessionDedupeKeys(second),
  ]) {
    assert.doesNotMatch(key, /manifest|samegenerictitle/);
  }
});

test("shared stream URLs and manifest paths cannot erase a concurrent platform battle", () => {
  const firstStream = {
    ...stream(11, "MP Replay.aoe2record"),
    title: "Battle Cam",
    url: "https://www.twitch.tv/emaren19",
    playbackUrl: "/api/streams/shared/manifest",
  };
  const secondStream = {
    ...stream(12, "MP Replay.aoe2record"),
    title: "Battle Cam",
    url: "https://www.twitch.tv/emaren19",
    playbackUrl: "/api/streams/shared/manifest",
  };
  const jim = streamedSession(11, "platform:jims-battle", {
    streams: [firstStream],
    primaryStream: firstStream,
  });
  const zodiac = streamedSession(12, "platform:zodiacs-battle", {
    streams: [secondStream],
    primaryStream: secondStream,
  });

  const sessions = dedupeStreamedSessions([jim, zodiac]);
  assert.equal(sessions.length, 2);
  assert.deepEqual(
    sessions.map((session) => session.sessionKey),
    ["platform:jims-battle", "platform:zodiacs-battle"]
  );
});

test("generic replay basenames cannot undo conservative loader separation", () => {
  const first = streamedSession(11, "legacy:mp-replay:watcher:process-a", {
    replayFile: "MP Replay.aoe2record",
    originalFilename: "MP Replay.aoe2record",
  });
  const second = streamedSession(12, "legacy:mp-replay:watcher:process-b", {
    replayFile: "MP Replay.aoe2record",
    originalFilename: "MP Replay.aoe2record",
  });

  assert.equal(dedupeStreamedSessions([first, second]).length, 2);
  assert.equal(
    streamedSessionDedupeKeys(first).some((key) => key.startsWith("replay:")),
    false
  );
  assert.deepEqual(sessionStreamKeys(first), [first.sessionKey]);
});

test("attached generic stream session keys cannot re-merge independent watcher groups", () => {
  const firstStream = stream(21, "MP Replay.aoe2record");
  const secondStream = stream(22, "MP Replay.aoe2record");
  const first = streamedSession(21, "legacy:mp-replay:watcher:process-a", {
    replayFile: "MP Replay.aoe2record",
    originalFilename: "MP Replay.aoe2record",
    streams: [firstStream],
    primaryStream: firstStream,
  });
  const second = streamedSession(22, "legacy:mp-replay:watcher:process-b", {
    replayFile: "MP Replay.aoe2record",
    originalFilename: "MP Replay.aoe2record",
    streams: [secondStream],
    primaryStream: secondStream,
  });

  assert.equal(dedupeStreamedSessions([first, second]).length, 2);
  assert.equal(
    streamedSessionDedupeKeys(first).some(
      (key) => key === "session:mpreplay" || key === "replay:mpreplay"
    ),
    false
  );
  assert.equal(
    streamedSessionDedupeKeys(second).some(
      (key) => key === "session:mpreplay" || key === "replay:mpreplay"
    ),
    false
  );
});

test("standalone generic replay session keys remain isolated by stream observation", () => {
  const firstStream = stream(31, "MP Replay.aoe2record");
  const secondStream = stream(32, "MP Replay.aoe2record");
  const first = streamedSession(-31, "MP Replay.aoe2record", {
    parseSource: "watcher_stream",
    streams: [firstStream],
    primaryStream: firstStream,
  });
  const second = streamedSession(-32, "MP Replay.aoe2record", {
    parseSource: "watcher_stream",
    streams: [secondStream],
    primaryStream: secondStream,
  });

  assert.equal(dedupeStreamedSessions([first, second]).length, 2);
  assert.deepEqual(streamedSessionDedupeKeys(first), []);
  assert.deepEqual(streamedSessionDedupeKeys(second), []);
});

test("a pre-platform stream follows its server-proven alias onto the canonical card", () => {
  const legacySessionKey =
    "legacy:mp%20replay.aoe2record:watcher:process-jim:battle:99";
  const canonical = streamedSession(41, "platform:shared-battle", {
    identityAliases: [legacySessionKey],
    bettingEligible: true,
    streams: [],
    primaryStream: null,
  });
  const legacyStream = stream(42, legacySessionKey);
  const standalone = streamedSession(-42, legacySessionKey, {
    parseSource: "watcher_stream",
    updatedAt: "2026-08-26T13:00:00.000Z",
    streams: [legacyStream],
    primaryStream: legacyStream,
  });

  assert.deepEqual(sessionStreamKeys(canonical), [
    canonical.sessionKey,
    legacySessionKey,
  ]);
  const [merged] = dedupeStreamedSessions([standalone, canonical]);
  assert.equal(dedupeStreamedSessions([standalone, canonical]).length, 1);
  assert.deepEqual(merged.streams.map((item) => item.id), [legacyStream.id]);
  assert.equal(merged.sessionKey, canonical.sessionKey);
  assert.equal(merged.id, canonical.id);
  assert.equal(merged.parseSource, canonical.parseSource);
  assert.equal(merged.bettingEligible, true);
});

test("stream dedupe computes a true transitive union across bridge aliases", () => {
  const first = streamedSession(1, "session-alpha-0001", {
    replayFile: "replay-one-20260826-120000.aoe2record",
    originalFilename: "replay-one-20260826-120000.aoe2record",
  });
  const second = streamedSession(2, "session-bravo-0002", {
    replayFile: "replay-two-20260826-123000.aoe2record",
    originalFilename: "replay-two-20260826-123000.aoe2record",
  });
  const bridge = streamedSession(3, "session-alpha-0001", {
    replayFile: "replay-two-20260826-123000.aoe2record",
    originalFilename: "replay-two-20260826-123000.aoe2record",
  });

  const [merged] = dedupeStreamedSessions([first, second, bridge]);
  assert.equal(dedupeStreamedSessions([first, second, bridge]).length, 1);
  assert.deepEqual(merged.streams.map((item) => item.id).sort((a, b) => a - b), [1, 2, 3]);
});

test("standalone live stream loading admits hundreds inside the freshness window", async () => {
  const now = new Date();
  const rows = Array.from({ length: 250 }, (_, index) => ({
    id: index + 1,
    sessionKey: `platform:standalone-${index}`,
    userId: index + 1,
    provider: "aoe2war",
    sourceType: "watcher_native",
    role: "caster",
    label: "AoE2WAR Live",
    title: `Player ${index} vs Rival ${index}`,
    url: `aoe2war://stream/${index + 1}`,
    playbackUrl: `/api/streams/${index + 1}/manifest`,
    embedId: null,
    playerLabel: `Player ${index}`,
    thumbnailUrl: null,
    mediaMimeType: "video/webm",
    isPrimary: true,
    status: "live",
    chunkCount: 5,
    latestChunkSeq: 4,
    lastHeartbeatAt: now,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  let query: Record<string, unknown> | null = null;
  const prisma = {
    gameWatchStream: {
      findMany: async (args: Record<string, unknown>) => {
        query = args;
        return rows;
      },
    },
  } as unknown as PrismaClient;

  const sessions = await loadStandaloneLiveStreamSessions(prisma, new Set());
  assert.equal(sessions.length, 250);
  assert.equal(new Set(sessions.map((session) => session.sessionKey)).size, 250);
  assert.ok(query);
  assert.equal("take" in query, false);
});
