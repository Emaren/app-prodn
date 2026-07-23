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

const trueOg = readFileSync(
  new URL(
    "../components/leaderboard/TrueOgLeaderboardPanel.tsx",
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
      ogRoute,
      /href="\/leaderboard\?view=modern"/,
    );

    assert.match(
      modernRoute,
      /explicitView !== "modern"/,
    );
  },
);

test(
  "OG route uses current leaderboard truth, not chronological battle archive",
  () => {
    assert.match(
      ogRoute,
      /loadLobbyLeaderboard/,
    );

    assert.doesNotMatch(
      ogRoute,
      /loadOgBoardPage/,
    );

    assert.doesNotMatch(
      ogRoute,
      /OgBoardPage/,
    );
  },
);

test(
  "restored OG component contains original leaderboard fingerprints",
  () => {
    assert.match(
      trueOg,
      /Competition/,
    );

    assert.match(
      trueOg,
      /Replay-backed standings built from real parsed matches/,
    );

    assert.match(
      trueOg,
      /Last replay/,
    );

    assert.match(
      trueOg,
      /MetricPill/,
    );

    assert.match(
      trueOg,
      /SteamLinkedBadge/,
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
  "sort state no longer causes the generic load effect to recreate itself",
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
