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
  "OG board preserves parsed-game archive presentation",
  () => {
    assert.match(
      ogBoard,
      /AoE2WAR battle archive/,
    );

    assert.match(
      ogBoard,
      /The first board\. Every battle remembered\./,
    );

    assert.match(
      ogBoard,
      /OgBattleCard/,
    );

    assert.match(
      ogBoard,
      /latest=\{index === 0\}/,
    );

    assert.match(
      ogBoard,
      /Final HD replays will appear here newest first/,
    );
  },
);

test(
  "sort click changes visible rows immediately before server authority returns",
  () => {
    assert.match(
      sort,
      /export function sortLeaderboardEntries/,
    );

    assert.match(
      modernPage,
      /setEntries\(\(current\) =>[\s\S]*sortLeaderboardEntries/,
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
