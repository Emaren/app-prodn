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

test("Living preference normalization reserves standard discovery windows", () => {
  const normalized =
    normalizeLivingLeaderboardPreferences({
      spotlightMode:
        "center",
      rankWindowStart:
        432.8,
      rankWindowRows:
        25,
      hiddenPlayers: [
        {
          key: "steam:1",
          name: "One",
        },
        {
          key: "steam:1",
          name: "Duplicate",
        },
      ],
      bookmarkedPlayerKeys: [
        "steam:1",
        "steam:1",
        "steam:2",
      ],
      activityWindowDays:
        7,
      moverWindowDays:
        30,
      moverDirection:
        "down",
      heatWindowDays:
        3,
    });

  assert.equal(
    normalized.spotlightMode,
    "center",
  );

  const legacyTop =
    normalizeLivingLeaderboardPreferences({
      spotlightMode: "top",
    });

  assert.equal(
    legacyTop.spotlightMode,
    "center",
  );

  assert.equal(
    normalized.rankWindowStart,
    432,
  );

  assert.equal(
    normalized.rankWindowRows,
    25,
  );

  assert.equal(
    normalized.hiddenPlayers.length,
    1,
  );

  assert.deepEqual(
    normalized.bookmarkedPlayerKeys,
    [
      "steam:1",
      "steam:2",
    ],
  );

  assert.equal(
    normalized.activityWindowDays,
    7,
  );

  assert.equal(
    normalized.moverWindowDays,
    30,
  );

  assert.equal(
    normalized.moverDirection,
    "down",
  );

  assert.equal(
    normalized.heatWindowDays,
    3,
  );
});

test("Extreme owns an inner ranked viewport and direct personal controls", () => {
  const living =
    source(
      "components/leaderboard/LivingLeaderboard.tsx",
    );

  assert.match(
    living,
    /data-living-leaderboard-viewport/,
  );

  assert.match(
    living,
    /Crosshair/,
  );

  assert.match(
    living,
    /SlidersHorizontal/,
  );

  assert.match(
    living,
    /hiddenPlayers/,
  );

  assert.match(
    living,
    /rankWindowStart/,
  );

  assert.match(
    living,
    /spotlightMode/,
  );
});

test("controller loads personal rank windows directly instead of walking from rank one", () => {
  const page =
    source(
      "components/leaderboard/ModernLeaderboardPage.tsx",
    );

  assert.match(
    page,
    /limitOverride/,
  );

  assert.match(
    page,
    /\/api\/lobby\/leaderboard\/locate/,
  );

  assert.match(
    page,
    /rankWindowStart\s*-\s*1/,
  );

  assert.match(
    page,
    /SPOTLIGHT_CONTEXT_ROWS = 50/,
  );

  assert.match(
    page,
    /SPOTLIGHT_INITIAL_ROWS/,
  );
});

test("signed-in preference route persists through authenticated user activity truth", () => {
  const route =
    source(
      "app/api/user/leaderboard-preferences/route.ts",
    );

  assert.match(
    route,
    /getSessionUid/,
  );

  assert.match(
    route,
    /leaderboard_view_preference/,
  );

  assert.match(
    route,
    /recordUserActivity/,
  );
});

test("spotlight locator matches signed-in UID or exact Steam ID", () => {
  const route =
    source(
      "app/api/lobby/leaderboard/locate/route.ts",
    );

  assert.match(
    route,
    /candidate\.uid ===\s*user\.uid/,
  );

  assert.match(
    route,
    /candidate\.steamId ===\s*user\.steamId/,
  );
});

test("DM and RM share the same active blue visual language", () => {
  const lane =
    source(
      "components/lobby/LeaderboardLaneToggle.tsx",
    );

  const dm =
    lane.slice(
      lane.indexOf(
        "dm: {",
      ),
      lane.indexOf(
        "};",
        lane.indexOf(
          "dm: {",
        ),
      ),
    );

  assert.match(
    dm,
    /text-cyan-100/,
  );

  assert.match(
    dm,
    /border-cyan-200\/28/,
  );

  assert.doesNotMatch(
    dm,
    /yellow/,
  );
});

test("personal hiding does not rewrite rank values", () => {
  const table =
    source(
      "components/leaderboard/LivingLeaderboardTable.tsx",
    );

  assert.match(
    table,
    /onHideEntry/,
  );

  assert.match(
    table,
    /#\{entry\.rank\}/,
  );

  assert.doesNotMatch(
    table,
    /visibleIndex\s*\+\s*1/,
  );
});
