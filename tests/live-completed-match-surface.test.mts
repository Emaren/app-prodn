import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCompletedSessionsIntoLobbyMatches,
} from "../lib/liveCompletedMatchSurface.ts";

test("completed-live shells retain parsed desync no-result truth", () => {
  const parsed = {
    id: 20452,
    winner: null,
    map: { name: "FN 5x5" },
    players: [
      { name: "Jim", winner: null },
      { name: "MEZ1692", winner: null },
    ],
    played_at: "2026-08-02T02:42:21.218Z",
    played_on: "2026-08-02T02:42:21.218Z",
    timestamp: "2026-08-02T02:42:21.218Z",
    parse_reason: "watcher_final_submission",
    original_filename: "match-20452.aoe2record",
    replay_file: "match-20452.aoe2record",
    disconnect_detected: true,
    winnerProof: "disconnect_or_desync",
    reviewNeeded: false,
    unresolvedResult: {
      code: "disconnect_or_desync",
      label: "Desynced",
      explanation:
        "Replay ended in a disconnect or desync before a canonical winner existed.",
      reviewNeeded: false,
    },
  } as never;

  const session = {
    id: 20452,
    sessionKey: "match-20452.aoe2record",
    replayFile: "match-20452.aoe2record",
    replayHash: "a".repeat(64),
    parseIteration: 7,
    createdAt: "2026-08-02T02:37:20.000Z",
    updatedAt: "2026-08-02T02:42:21.218Z",
    completedAt: "2026-08-02T02:42:21.218Z",
    playedOn: "2026-08-02T02:42:21.218Z",
    mapName: "FN 5x5",
    durationSeconds: 306,
    originalFilename: "match-20452.aoe2record",
    disconnectDetected: true,
    winner: null,
    parseReason: "watcher_final_submission",
    parseSource: "watcher_final",
    unresolvedResult: null,
    state: "completed",
    finalProofPending: false,
    players: [
      { name: "Jim", normalizedName: "jim", winner: null },
      { name: "MEZ1692", normalizedName: "mez1692", winner: null },
    ],
    teamResolution: { status: "resolved" },
    uploaders: [],
    watcherCount: 1,
    watcherIds: [],
    watcherSessionIds: [],
    replayFingerprints: [],
    watcherVersions: [],
    parseRows: 1,
    coverageLevel: "single",
    disposition: { status: "completed" },
    uploader: null,
  } as never;

  const [row] = mergeCompletedSessionsIntoLobbyMatches(
    [parsed],
    [session],
    1
  ) as Array<Record<string, unknown>>;

  assert.equal(row.winner, null);
  assert.equal(row.disconnect_detected, true);
  assert.equal(row.winnerProof, "disconnect_or_desync");
  assert.deepEqual(row.unresolvedResult, {
    code: "disconnect_or_desync",
    label: "Desynced",
    explanation:
      "Replay ended in a disconnect or desync before a canonical winner existed.",
    reviewNeeded: false,
  });
});
