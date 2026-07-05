import assert from "node:assert/strict";
import test from "node:test";

import {
  BATTLE_CAM_STANDBY_VIDEO_URL,
  BETS_BATTLE_CAM_VISIBILITY_STORAGE_KEY,
  isExplicitlyAttachedBroadcastFeed,
  readStoredBattleCamVisibility,
  writeStoredBattleCamVisibility,
} from "../lib/broadcastPresentation.ts";

test("Battle Cam defaults closed and persists only its versioned preference", () => {
  const storage = new Map<string, string>([
    ["aoe2hdbets.betsView.v2", "extreme"],
    ["aoe2hdbets.broadcastVisible", "open"],
  ]);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    },
  });

  try {
    assert.equal(readStoredBattleCamVisibility(), "closed");
    writeStoredBattleCamVisibility("open");
    assert.equal(
      storage.get(BETS_BATTLE_CAM_VISIBILITY_STORAGE_KEY),
      "open"
    );
    assert.equal(readStoredBattleCamVisibility(), "open");
    writeStoredBattleCamVisibility("closed");
    assert.equal(readStoredBattleCamVisibility(), "closed");
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("Battle Cam uses the shared local standby loop", () => {
  assert.equal(
    BATTLE_CAM_STANDBY_VIDEO_URL,
    "/watch-loops/live-hero-loop.mp4"
  );
});

test("only a persisted stream attached to the current session is trusted", () => {
  const attachedFeed = { id: 42, sessionKey: "replay-current" };

  assert.equal(
    isExplicitlyAttachedBroadcastFeed(attachedFeed, "replay-current"),
    true
  );
  assert.equal(
    isExplicitlyAttachedBroadcastFeed(attachedFeed, "replay-other"),
    false
  );
  assert.equal(
    isExplicitlyAttachedBroadcastFeed(
      { id: -42, sessionKey: "replay-current" },
      "replay-current"
    ),
    false
  );
  assert.equal(isExplicitlyAttachedBroadcastFeed(attachedFeed, null), false);
});
