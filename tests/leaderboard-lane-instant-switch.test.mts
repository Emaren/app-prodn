import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const dedicated = readFileSync(
  new URL(
    "../components/leaderboard/ModernLeaderboardPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const homepage = readFileSync(
  new URL(
    "../app/HomePageClient.tsx",
    import.meta.url,
  ),
  "utf8",
);

const cache = readFileSync(
  new URL(
    "../lib/leaderboardLaneClientCache.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "shared RM DM lane cache exists",
  () => {
    assert.match(
      cache,
      /seedLeaderboardLaneCache/,
    );

    assert.match(
      cache,
      /readLeaderboardLaneCache/,
    );

    assert.match(
      cache,
      /prefetchLeaderboardLane/,
    );
  },
);

test(
  "dedicated leaderboard prefetches alternate lane",
  () => {
    assert.match(
      dedicated,
      /prefetchLeaderboardLane/,
    );

    assert.match(
      dedicated,
      /readLeaderboardLaneCache/,
    );
  },
);

test(
  "dedicated lane click never performs blocking skeleton reset",
  () => {
    assert.match(
      dedicated,
      /preserveRows:\s*true/,
    );

    assert.match(
      dedicated,
      /laneOverride:\s*nextLane/,
    );

    assert.match(
      dedicated,
      /skipNextLaneReloadRef/,
    );
  },
);

test(
  "homepage no longer fetches 600 rows on DM click",
  () => {
    assert.doesNotMatch(
      homepage,
      /limit:\s*"600"/,
    );

    assert.match(
      homepage,
      /LEADERBOARD_LANE_PREFETCH_SIZE = 64/,
    );
  },
);

test(
  "homepage applies cached lane before changing preference",
  () => {
    const cachePosition =
      homepage.indexOf(
        "readLeaderboardLaneCache",
        homepage.indexOf(
          "handleLeaderboardLaneChange",
        ),
      );

    const lanePosition =
      homepage.indexOf(
        "setLeaderboardLane(",
        homepage.indexOf(
          "handleLeaderboardLaneChange",
        ),
      );

    assert.ok(
      cachePosition >= 0,
    );

    assert.ok(
      lanePosition >
        cachePosition,
    );
  },
);

test(
  "homepage lane refresh does not disable toggle",
  () => {
    assert.doesNotMatch(
      homepage,
      /setLeaderboardLaneLoading\(true\)/,
    );
  },
);
