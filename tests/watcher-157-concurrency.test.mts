import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { activeLiveIterationDedupeKey } from "../lib/liveGames.ts";
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
    "file:battle-two.mgx2:players:emaren|jim:map:yucatan"
  );
});

test("live snapshot ordering puts newest starts first", async () => {
  const source = await readFile("lib/liveSessionSnapshot.ts", "utf8");
  assert.match(source, /const startedDiff = rightStartedAt - leftStartedAt/);
});
