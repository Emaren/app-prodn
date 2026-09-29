import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync(
  new URL("../lib/lobbyLeaderboard.ts", import.meta.url),
  "utf8",
);

const client = fs.readFileSync(
  new URL(
    "../components/leaderboard/ModernLeaderboardPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const page = fs.readFileSync(
  new URL("../app/leaderboard/page.tsx", import.meta.url),
  "utf8",
);

test(
  "expired leaderboard snapshots are served stale while one refresh runs",
  () => {
    assert.match(
      server,
      /function startLeaderboardRefresh/,
    );

    assert.match(
      server,
      /const cacheIsCurrent/,
    );

    assert.match(
      server,
      /cached\?\.generation ===[\s\S]*projectionGeneration/,
    );

    assert.match(
      server,
      /cached\?\.timeBucket ===[\s\S]*timeBucket/,
    );

    assert.match(
      server,
      /void startLeaderboardRefresh\(/,
    );

    assert.match(
      server,
      /return options\.includePresence === false[\s\S]*cached\.value/,
    );

    assert.match(
      server,
      /const existing =\s*leaderboardPromises\.get\(/,
    );

    assert.match(
      server,
      /leaderboardPromises\.set\(/,
    );

    assert.match(
      server,
      /leaderboardPromises\.delete\(/,
    );
  },
);

test(
  "Warriors and Kingdom are prefetched and swap without blanking rows",
  () => {
    assert.match(
      client,
      /const alternateScope:/,
    );

    assert.match(
      client,
      /prefetchLeaderboardLane\(\s*activeLane,\s*RESET_PAGE_SIZE,\s*alternateScope,/,
    );

    assert.match(
      client,
      /const changeScope = useCallback/,
    );

    assert.match(
      client,
      /readLeaderboardLaneCache\(\s*lane,\s*nextScope,/,
    );

    assert.match(
      client,
      /scopeOverride:\s*nextScope/,
    );

    assert.match(
      client,
      /preserveRows: true/,
    );

    assert.match(
      client,
      /onChange=\{changeScope\}/,
    );

    assert.doesNotMatch(
      client,
      /onChange=\{setScope\}/,
    );

    assert.doesNotMatch(
      client,
      /onClick=\{\(\) => setScope\(/,
    );
  },
);

test(
  "leaderboard Ready is emitted by actual client readiness",
  () => {
    assert.doesNotMatch(
      page,
      /SpeedReadyMarker/,
    );

    assert.match(
      client,
      /route="\/leaderboard"/,
    );

    assert.match(
      client,
      /ready=\{!loading\}/,
    );
  },
);
