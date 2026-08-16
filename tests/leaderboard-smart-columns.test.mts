import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

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

test("Living board exposes recent competitive form", () => {
  const table =
    source(
      "components/leaderboard/LivingLeaderboardTable.tsx",
    );

  assert.match(
    table,
    /Last 10/,
  );

  assert.match(
    table,
    /30d W–L/,
  );

  assert.match(
    table,
    /RecentForm/,
  );

  assert.match(
    table,
    /ThirtyDayRecord/,
  );
});

test("Auto columns prioritize form and hide Last played", () => {
  const table =
    source(
      "components/leaderboard/LivingLeaderboardTable.tsx",
    );

  assert.match(
    table,
    /case "last10"/,
  );

  assert.match(
    table,
    /case "last30"/,
  );

  assert.match(
    table,
    /case "lastPlayed":\s*return "hidden"/,
  );

  assert.match(
    table,
    /table-fixed/,
  );
});

test("Living command cluster owns persistent column customization", () => {
  const living =
    source(
      "components/leaderboard/LivingLeaderboard.tsx",
    );

  assert.match(
    living,
    /Columns3/,
  );

  assert.match(
    living,
    /LIVING_LEADERBOARD_COLUMNS\.map/,
  );

  assert.match(
    living,
    /columnMode:\s*"custom"/,
  );

  assert.match(
    living,
    /columnMode:\s*"auto"/,
  );
});
