import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

import {
  normalizeLivingLeaderboardPreferences,
} from "../lib/livingLeaderboardPreferences.ts";

const root =
  process.cwd();

function source(
  path: string,
) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("Living columns default to Auto with recent form but not Last played", () => {
  const preferences =
    normalizeLivingLeaderboardPreferences(
      {},
    );

  assert.equal(
    preferences.columnMode,
    "auto",
  );

  assert.ok(
    preferences.visibleColumns.includes(
      "last10",
    ),
  );

  assert.ok(
    preferences.visibleColumns.includes(
      "last30",
    ),
  );

  assert.equal(
    preferences.visibleColumns.includes(
      "lastPlayed",
    ),
    false,
  );
});

test("custom column choices are normalized and persisted safely", () => {
  const preferences =
    normalizeLivingLeaderboardPreferences({
      columnMode: "custom",
      visibleColumns: [
        "rating",
        "last10",
        "last30",
        "lastPlayed",
        "garbage",
      ],
    });

  assert.equal(
    preferences.columnMode,
    "custom",
  );

  assert.deepEqual(
    preferences.visibleColumns,
    [
      "rating",
      "last10",
      "last30",
      "lastPlayed",
    ],
  );
});

test("leaderboard rows expose compact Last 10 and rolling 30d truth", () => {
  const lobby =
    source(
      "lib/lobby.ts",
    );

  const engine =
    source(
      "lib/lobbyLeaderboard.ts",
    );

  assert.match(
    lobby,
    /last10Results/,
  );

  assert.match(
    lobby,
    /last30Wins/,
  );

  assert.match(
    lobby,
    /last30Losses/,
  );

  assert.match(
    lobby,
    /last30Games/,
  );

  assert.match(
    engine,
    /buildLast10Results/,
  );

  assert.match(
    engine,
    /entry\.replayEvidence\s*\.slice\(0,\s*10\)\s*\.reverse\(\)/,
  );

  assert.match(
    engine,
    /buildLast30Record/,
  );

  assert.match(
    engine,
    /evidence\.observedAt/,
  );
});
