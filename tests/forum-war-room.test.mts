import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumFallbackSnapshot,
  FORUM_CHANNELS,
  FORUM_SEED_THREADS,
  FORUM_TABS,
  isForumChannel,
  normalizeForumBody,
  normalizeForumExcerpt,
  normalizeForumTitle,
} from "../lib/forum.ts";
import {
  applyTileViewDefaultMigration,
  getTileViewMode,
  markTileViewDefaultMigrationApplied,
  normalizeTileViewPreferences,
  LIVE_GAMES_VIEW_STORAGE_KEY,
  TILE_VIEW_DEFAULT_VERSION,
  TILE_VIEW_DEFAULT_VERSION_KEY,
} from "../lib/tileViewPreferences.ts";

test("forum opens on Extreme and persists as a recognized tile preference", () => {
  assert.equal(getTileViewMode({}, "forum"), "extreme");
  assert.deepEqual(normalizeTileViewPreferences({ forum: "basic" }), {
    forum: "basic",
  });
});

test("the Extreme launch migration respects the independent live-games choice", () => {
  const storage = new Map<string, string>();
  storage.set(LIVE_GAMES_VIEW_STORAGE_KEY, "extreme");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });

  try {
    assert.deepEqual(
      applyTileViewDefaultMigration({
        forum: "basic",
        live_games: "basic",
        leaderboard: "advanced",
      }),
      {
        forum: "extreme",
        live_games: "extreme",
        leaderboard: "advanced",
      }
    );

    markTileViewDefaultMigrationApplied();
    assert.equal(storage.get(TILE_VIEW_DEFAULT_VERSION_KEY), TILE_VIEW_DEFAULT_VERSION);
    assert.deepEqual(
      applyTileViewDefaultMigration({
        forum: "advanced",
        leaderboard: "basic",
      }),
      {
        forum: "advanced",
        live_games: "extreme",
        leaderboard: "basic",
      }
    );
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("editorial fallback is deep, unique, and fully browsable", () => {
  const snapshot = buildForumFallbackSnapshot();
  const slugs = new Set(snapshot.threads.map((thread) => thread.slug));
  const seedKeys = new Set(snapshot.threads.map((thread) => thread.seedKey));

  assert.equal(snapshot.threads.length, FORUM_SEED_THREADS.length);
  assert.equal(snapshot.ledgerAvailable, false);
  assert.equal(slugs.size, snapshot.threads.length);
  assert.equal(seedKeys.size, snapshot.threads.length);
  assert.ok(snapshot.threads.filter((thread) => thread.isFeatured).length >= 4);
  assert.ok(snapshot.threads.every((thread) => thread.body.length > 200));
  assert.ok(snapshot.threads.every((thread) => thread.posts.length > 0));
  assert.equal(
    snapshot.channels.reduce((total, channel) => total + channel.count, 0),
    snapshot.threads.length
  );
});

test("every tab and seed points to a real War Room channel", () => {
  const channelKeys = new Set(FORUM_CHANNELS.map((channel) => channel.key));
  for (const seed of FORUM_SEED_THREADS) {
    assert.equal(isForumChannel(seed.channel), true);
    assert.equal(channelKeys.has(seed.channel), true);
  }
  for (const tab of FORUM_TABS) {
    for (const channel of tab.channels) {
      assert.equal(channelKeys.has(channel), true);
    }
  }
});

test("forum copy inputs normalize whitespace and enforce storage bounds", () => {
  assert.equal(normalizeForumTitle("  Castle   drop  "), "Castle drop");
  assert.equal(normalizeForumExcerpt("  one \n useful   line "), "one useful line");
  assert.equal(normalizeForumBody("first  \r\nsecond"), "first\nsecond");
  assert.equal(normalizeForumTitle("x".repeat(200)).length, 180);
  assert.equal(normalizeForumExcerpt("x".repeat(400)).length, 320);
  assert.equal(normalizeForumBody("x".repeat(13_000)).length, 12_000);
});
