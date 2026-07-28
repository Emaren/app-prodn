import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL(
    "../components/leaderboard/ModernLeaderboardPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const table = readFileSync(
  new URL(
    "../components/leaderboard/ModernLeaderboardTable.tsx",
    import.meta.url,
  ),
  "utf8",
);

const route = readFileSync(
  new URL(
    "../app/api/lobby/leaderboard/route.ts",
    import.meta.url,
  ),
  "utf8",
);

const loader = readFileSync(
  new URL(
    "../lib/lobbyLeaderboard.ts",
    import.meta.url,
  ),
  "utf8",
);

const sort = readFileSync(
  new URL(
    "../lib/leaderboardSort.ts",
    import.meta.url,
  ),
  "utf8",
);

test("all nine leaderboard columns are sortable", () => {
  for (const column of [
    "rank",
    "rank_change_24h",
    "rating",
    "warrior",
    "win_rate",
    "wins",
    "losses",
    "games",
    "streak",
  ]) {
    assert.match(
      table,
      new RegExp(`column="${column}"`),
    );
  }
});

test("sort cycle is descending then ascending then default", () => {
  assert.match(
    sort,
    /direction:\s*"desc"/,
  );
  assert.match(
    sort,
    /current\.direction === "desc"/,
  );
  assert.match(
    sort,
    /direction:\s*"asc"/,
  );
  assert.match(
    sort,
    /key:\s*null[\s\S]*direction:\s*null/,
  );
});

test("API carries sort state into full leaderboard loader", () => {
  assert.match(
    route,
    /searchParams\.get\("sort"\)/,
  );
  assert.match(
    route,
    /searchParams\.get\("dir"\)/,
  );
  assert.match(
    route,
    /sortKey,[\s\S]*sortDirection,/,
  );
});

test("server sorts before pagination and preserves canonical rank", () => {
  assert.match(
    loader,
    /Rank is always canonical/,
  );
  assert.match(
    loader,
    /compareRequestedLeaderboardSort/,
  );
  assert.match(
    loader,
    /searchableEntries\.slice\([\s\S]*safeOffset/,
  );
});

test("infinite-scroll merge preserves server sort order", () => {
  assert.doesNotMatch(
    page,
    /Array\.from\(entries\.values\(\)\)\.sort/,
  );
  assert.match(
    page,
    /The server owns the requested ordering/,
  );
});

test("active sort shows ascending or descending indicators", () => {
  assert.match(table, /ArrowDown/);
  assert.match(table, /ArrowUp/);
  assert.match(table, /ChevronsUpDown/);
  assert.match(table, /aria-sort/);
});
