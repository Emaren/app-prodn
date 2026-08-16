import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const modernPage = readFileSync(
  new URL(
    "../components/leaderboard/ModernLeaderboardPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const viewLink = readFileSync(
  new URL(
    "../components/leaderboard/LeaderboardViewLink.tsx",
    import.meta.url,
  ),
  "utf8",
);

const modernRoute = readFileSync(
  new URL(
    "../app/leaderboard/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const ogRoute = readFileSync(
  new URL(
    "../app/leaderboard/og/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const ogBoard = readFileSync(
  new URL(
    "../components/leaderboard/OgBoardPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const preference = readFileSync(
  new URL(
    "../lib/leaderboardViewPreference.ts",
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

test(
  "Modern and OG preference persists in browser and server-visible cookie",
  () => {
    assert.match(
      preference,
      /aoe2hdbets:leaderboard-view/,
    );

    assert.match(
      preference,
      /aoe2hdbets_leaderboard_view/,
    );

    assert.match(
      viewLink,
      /writeStoredLeaderboardView\(to\)/,
    );

    assert.match(
      modernRoute,
      /preferredView === "og"/,
    );

    assert.match(
      modernRoute,
      /redirect\("\/leaderboard\/og"\)/,
    );
  },
);

test(
  "OG user can deliberately switch back to Modern",
  () => {
    assert.match(
      ogBoard,
      /href="\/leaderboard\?view=modern"/,
    );

    assert.match(
      modernRoute,
      /explicitView !== "modern"/,
    );
  },
);

test(
  "OG route is the chronological parsed-games board",
  () => {
    assert.match(
      ogRoute,
      /loadOgBoardPage/,
    );

    assert.match(
      ogRoute,
      /OgBoardPage/,
    );

    assert.doesNotMatch(
      ogRoute,
      /loadLobbyLeaderboard/,
    );

    assert.doesNotMatch(
      ogRoute,
      /TrueOgLeaderboardPanel/,
    );
  },
);

test(
  "OG route preserves the original parsed-game presentation",
  () => {
    assert.match(
      ogBoard,
      /Game Stats/,
    );

    assert.match(
      ogBoard,
      /No game stats available\./,
    );

    assert.match(
      ogBoard,
      /OgBattleCard/,
    );

    assert.match(
      ogBoard,
      /latest=\{index === 0\}/,
    );

    assert.doesNotMatch(
      ogBoard,
      /AoE2WAR battle archive/,
    );

    assert.doesNotMatch(
      ogBoard,
      /The first board\. Every battle remembered\./,
    );
  },
);

test(
  "sort click preserves rows while server-authoritative warm ordering resolves",
  () => {
    assert.match(
      sort,
      /export function sortLeaderboardEntries/,
    );

    assert.doesNotMatch(
      modernPage,
      /sortLeaderboardEntries/,
    );

    assert.match(
      modernPage,
      /The server owns the requested ordering\./,
    );

    assert.match(
      modernPage,
      /commandSortWarmRef/,
    );

    assert.match(
      modernPage,
      /commandSortWarmPromiseRef/,
    );

    assert.match(
      modernPage,
      /preserveRows:\s*true/,
    );

    assert.match(
      modernPage,
      /sortOverride:\s*next/,
    );
  },
);

test(
  "sort state no longer causes generic load effect recreation",
  () => {
    assert.doesNotMatch(
      modernPage,
      /\[\s*lane,\s*query,\s*sort\.key,\s*sort\.direction,\s*\]/,
    );

    assert.match(
      modernPage,
      /sortRef\.current/,
    );
  },
);
