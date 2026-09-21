import assert from "node:assert/strict";
import test from "node:test";

import { deriveReplayDetectionGapWarning } from "../lib/watcherDetectionGap.ts";

const base = {
  connected: true,
  monitorState: "active" as const,
  folderState: "valid_hd" as const,
  folderActivityProven: true,
  currentReplay: null,
  folderLatestReplayModifiedAt: "2026-09-21T00:33:08.383Z",
  lastServerReplayAt: new Date("2026-09-20T10:57:00.000Z"),
};

test("flags a fresh folder replay that the connected watcher failed to adopt", () => {
  assert.match(
    deriveReplayDetectionGapWarning(base) || "",
    /client replay detection\/recovery before upload/,
  );
});

test("does not flag ordinary active or already-received replay states", () => {
  assert.equal(deriveReplayDetectionGapWarning({ ...base, currentReplay: "live.aoe2mpgame" }), null);
  assert.equal(deriveReplayDetectionGapWarning({ ...base, folderActivityProven: false }), null);
  assert.equal(
    deriveReplayDetectionGapWarning({
      ...base,
      folderLatestReplayModifiedAt: "2026-09-20T10:56:00.000Z",
    }),
    null,
  );
});
