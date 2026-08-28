import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  activeLiveIterationDedupeKey,
  dedupeActiveLiveIterations,
} from "../lib/liveGames.ts";
import { readWatcherUploadMetadata, type LiveGameSession } from "../lib/liveSessionSnapshot.ts";

test("Watcher 1.5.7 identity metadata is read from the persisted watcher_upload envelope", () => {
  assert.deepEqual(
    readWatcherUploadMetadata({
      watcher_upload: {
        watcher_id: "watcher-a",
        watcher_session_id: "session-a",
        replay_fingerprint: "fingerprint-a",
        watcher_version: "1.5.7",
      },
    }),
    {
      watcherId: "watcher-a",
      watcherSessionId: "session-a",
      replayFingerprint: "fingerprint-a",
      watcherVersion: "1.5.7",
    }
  );
});

test("the same platform game dedupes across independent watcher sessions", () => {
  const first = {
    id: 10,
    sessionKey: "platform:1234",
    replayFile: "battle.mgx2",
    originalFilename: "battle.mgx2",
    watcherSessionIds: ["watcher-session-42"],
    players: [],
    mapName: "Arabia",
  } as unknown as LiveGameSession;
  const second = {
    ...first,
    id: 11,
    watcherSessionIds: ["watcher-session-99"],
  } as unknown as LiveGameSession;

  assert.equal(activeLiveIterationDedupeKey(first), "platform:1234");
  assert.equal(activeLiveIterationDedupeKey(second), activeLiveIterationDedupeKey(first));
});

test("different platform games never collapse just because their replay filenames match", () => {
  const first = {
    id: 12,
    sessionKey: "platform:game-alpha",
    replayFile: "MP Replay shared-name.aoe2record",
    originalFilename: "MP Replay shared-name.aoe2record",
    watcherSessionIds: ["watcher-session-42"],
    players: [{ name: "Emaren" }, { name: "Jim" }],
    mapName: "Arabia",
  } as unknown as LiveGameSession;
  const second = {
    ...first,
    id: 13,
    sessionKey: "platform:game-bravo",
    watcherSessionIds: ["watcher-session-99"],
  } as unknown as LiveGameSession;

  assert.notEqual(
    activeLiveIterationDedupeKey(first),
    activeLiveIterationDedupeKey(second)
  );
  assert.equal(dedupeActiveLiveIterations([first, second]).length, 2);
});

test("fallback dedupe remains game-specific when watcher session metadata is absent", () => {
  const session = {
    id: 11,
    sessionKey: "fallback-a",
    replayFile: "battle-two.mgx2",
    originalFilename: "battle-two.mgx2",
    watcherSessionIds: [],
    players: [{ name: "Emaren" }, { name: "Jim" }],
    mapName: "Yucatan",
  } as unknown as LiveGameSession;

  assert.equal(
    activeLiveIterationDedupeKey(session),
    "session:fallback-a:players:emaren|jim:map:yucatan"
  );
});

test("one process-wide watcher session cannot collapse sequential legacy games", () => {
  const base = {
    id: 20,
    sessionKey: "MP Replay 2026-08-26 120000.aoe2record",
    replayFile: "MP Replay 2026-08-26 120000.aoe2record",
    originalFilename: "MP Replay 2026-08-26 120000.aoe2record",
    watcherSessionIds: ["process-session"],
    players: [{ name: "Emaren" }, { name: "Jim" }],
    mapName: "Yucatan",
  } as unknown as LiveGameSession;
  const next = {
    ...base,
    id: 21,
    sessionKey: "MP Replay 2026-08-26 123000.aoe2record",
    replayFile: "MP Replay 2026-08-26 123000.aoe2record",
    originalFilename: "MP Replay 2026-08-26 123000.aoe2record",
  } as unknown as LiveGameSession;

  assert.notEqual(
    activeLiveIterationDedupeKey(base),
    activeLiveIterationDedupeKey(next)
  );
});

test("duplicate platform observations merge watcher coverage instead of discarding it", () => {
  const first = {
    id: 30,
    sessionKey: "platform:coverage",
    replayFile: "coverage.mgx2",
    originalFilename: "coverage.mgx2",
    replayFingerprints: ["100:1"],
    watcherIds: ["watcher-a"],
    watcherSessionIds: ["process-a"],
    watcherVersions: ["1.5.7"],
    watcherCount: 1,
    uploaders: [
      { uid: "a", displayName: "Emaren", parseRows: 3, lastSeenAt: "2026-08-26T12:00:03Z" },
    ],
    uploader: { uid: "a", displayName: "Emaren" },
    players: [{ name: "Emaren" }, { name: "Jim" }],
    teamResolution: { confident: true },
    mapName: "Yucatan",
    durationSeconds: 30,
    parseRows: 3,
    coverageLevel: "single",
    createdAt: "2026-08-26T12:00:00Z",
    playedOn: "2026-08-26T12:00:00Z",
    updatedAt: "2026-08-26T12:00:03Z",
  } as unknown as LiveGameSession;
  const second = {
    ...first,
    id: 31,
    replayFingerprints: ["140:2"],
    watcherIds: ["watcher-b"],
    watcherSessionIds: ["process-b"],
    uploaders: [
      { uid: "b", displayName: "Jim", parseRows: 2, lastSeenAt: "2026-08-26T12:00:05Z" },
    ],
    uploader: { uid: "b", displayName: "Jim" },
    durationSeconds: 40,
    parseRows: 2,
    createdAt: "2026-08-26T12:00:02Z",
    playedOn: "2026-08-26T12:00:02Z",
    updatedAt: "2026-08-26T12:00:05Z",
  } as unknown as LiveGameSession;

  const [merged] = dedupeActiveLiveIterations([first, second]);
  assert.deepEqual(merged.watcherIds, ["watcher-a", "watcher-b"]);
  assert.deepEqual(merged.replayFingerprints, ["100:1", "140:2"]);
  assert.deepEqual(merged.uploaders.map((uploader) => uploader.uid).sort(), ["a", "b"]);
  assert.equal(merged.watcherCount, 2);
  assert.equal(merged.coverageLevel, "dual");
  assert.equal(merged.createdAt, "2026-08-26T12:00:00Z");
  assert.equal(merged.updatedAt, "2026-08-26T12:00:05Z");
});

test("10,000 rolling observations preserve exactly 200 concurrent platform games", () => {
  const logicalSessionCount = 200;
  const iterationsPerSession = 50;
  const baseMs = Date.parse("2026-08-26T12:00:00Z");
  const observations: LiveGameSession[] = [];

  for (let sessionIndex = 0; sessionIndex < logicalSessionCount; sessionIndex += 1) {
    const sessionStartMs = baseMs + sessionIndex * 60_000;
    for (let iteration = 0; iteration < iterationsPerSession; iteration += 1) {
      const watcherIndex = iteration % 3;
      const observedAt = new Date(sessionStartMs + iteration * 5_000).toISOString();
      observations.push({
        id: sessionIndex * 1_000 + iteration + 1,
        sessionKey: `platform:load-${String(sessionIndex).padStart(3, "0")}`,
        replayFile: `battle-${sessionIndex}.mgx2`,
        originalFilename: `battle-${sessionIndex}.mgx2`,
        replayHash: `hash-${sessionIndex}-${iteration}`,
        replayFingerprints: [`${1000 + iteration}:${iteration}`],
        watcherIds: [`watcher-${watcherIndex}`],
        watcherSessionIds: [`process-${watcherIndex}`],
        watcherVersions: ["1.5.7"],
        watcherCount: 1,
        uploaders: [
          {
            uid: `uploader-${watcherIndex}`,
            displayName: `Watcher ${watcherIndex}`,
            parseRows: iteration + 1,
            lastSeenAt: observedAt,
          },
        ],
        uploader: {
          uid: `uploader-${watcherIndex}`,
          displayName: `Watcher ${watcherIndex}`,
        },
        players:
          iteration === 0
            ? [{ name: `Left ${sessionIndex}` }, { name: `Right ${sessionIndex}` }]
            : [{ name: `Left ${sessionIndex}` }],
        teamResolution: { confident: iteration === 0 },
        mapName: iteration === 0 ? "Yucatan" : null,
        durationSeconds: iteration * 5,
        parseIteration: iteration + 1,
        parseRows: iteration + 1,
        coverageLevel: "single",
        createdAt: observedAt,
        playedOn: observedAt,
        updatedAt: observedAt,
      } as unknown as LiveGameSession);
    }
  }

  const logicalSessions = dedupeActiveLiveIterations(observations.reverse());
  assert.equal(logicalSessions.length, logicalSessionCount);
  assert.equal(new Set(logicalSessions.map((session) => session.sessionKey)).size, logicalSessionCount);

  for (let sessionIndex = 0; sessionIndex < logicalSessionCount; sessionIndex += 1) {
    const session = logicalSessions[sessionIndex];
    assert.equal(session.sessionKey, `platform:load-${String(sessionIndex).padStart(3, "0")}`);
    assert.equal(session.parseIteration, iterationsPerSession);
    assert.equal(session.durationSeconds, (iterationsPerSession - 1) * 5);
    assert.equal(session.createdAt, new Date(baseMs + sessionIndex * 60_000).toISOString());
    assert.equal(
      session.updatedAt,
      new Date(baseMs + sessionIndex * 60_000 + (iterationsPerSession - 1) * 5_000).toISOString()
    );
    assert.equal(session.mapName, "Yucatan");
    assert.equal(session.players.length, 2);
    assert.equal(session.replayFingerprints.length, iterationsPerSession);
    assert.deepEqual(session.watcherIds, ["watcher-0", "watcher-1", "watcher-2"]);
    assert.equal(session.uploaders.length, 3);
    assert.equal(session.coverageLevel, "stacked");
  }
});

test("live snapshot ordering uses the shared stable comparator", async () => {
  const source = await readFile("lib/liveSessionSnapshot.ts", "utf8");
  assert.match(source, /activeSessions\.sort\(compareLiveSessionOrder\)/);
  assert.doesNotMatch(source, /rightStartedAt - leftStartedAt/);
});
