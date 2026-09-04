import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  invalidateCurrentWatcherAccountStateCache,
  loadCurrentWatcherAccountStates,
} from "../lib/currentWatcherAccountState.ts";

test(
  "current account state reads both Watcher live and final observations",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../lib/currentWatcherAccountState.ts",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /'watcher_live'[\s\S]*'watcher_final'/,
    );

    assert.match(
      source,
      /g\.played_on IS NOT NULL/,
    );

    assert.match(
      source,
      /\^\[0-9\]\{17\}\$/,
    );

    assert.match(
      source,
      /latest_rm[\s\S]*DISTINCT ON \(steam_id\)/,
    );

    assert.match(
      source,
      /latest_dm[\s\S]*DISTINCT ON \(steam_id\)/,
    );

    assert.doesNotMatch(
      source,
      /created_at[\s\S]*ORDER BY[\s\S]*steam_id/,
    );
  },
);

test(
  "current account state uses explicit RM and DM fields instead of ambiguous rate_snapshot",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../lib/currentWatcherAccountState.ts",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /steam_rm_rating/,
    );

    assert.match(
      source,
      /steam_dm_rating/,
    );

    assert.doesNotMatch(
      source,
      /rate_snapshot/,
    );
  },
);

test(
  "public directory overlays current state without letting live rows create identity or history",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../lib/publicPlayerDirectory.ts",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /loadCurrentWatcherAccountStates/,
    );

    assert.match(
      source,
      /directory\.get\(\s*`steam:\$\{state\.steamId\}`/,
    );

    assert.match(
      source,
      /if \(!entry\) \{\s*continue;/,
    );

    assert.match(
      source,
      /entry\.steamRmRating\s*=\s*state\.steamRmRating/,
    );

    assert.match(
      source,
      /entry\.steamDmRating\s*=\s*state\.steamDmRating/,
    );

    assert.match(
      source,
      /entry\.ratingLastSeenAt\s*=\s*state\.ratingObservedAt/,
    );
  },
);

test(
  "historical public corpus remains final-only",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../lib/publicLeaderboardGameCorpus.ts",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /is_final:\s*true/,
    );
  },
);

test(
  "current account state normalizes one exact Steam account from the newest Watcher clocks",
  async () => {
    invalidateCurrentWatcherAccountStateCache();

    const prisma = {
      $queryRaw: async () => [
        {
          steamId:
            "76561199849204394",
          latestObservedName:
            "  mYsTikaL_VeGeTa  ",
          nameObservedAt:
            new Date(
              "2026-09-03T21:48:44.000Z",
            ),
          steamRmRating: 1631,
          steamRmObservedAt:
            new Date(
              "2026-09-03T21:48:40.000Z",
            ),
          steamDmRating: 2346,
          steamDmObservedAt:
            new Date(
              "2026-09-03T21:48:44.000Z",
            ),
        },
      ],
    };

    const states =
      await loadCurrentWatcherAccountStates(
        prisma as never,
      );

    assert.equal(
      states.length,
      1,
    );

    assert.deepEqual(
      states[0],
      {
        steamId:
          "76561199849204394",
        latestObservedName:
          "mYsTikaL_VeGeTa",
        nameObservedAt:
          "2026-09-03T21:48:44.000Z",
        steamRmRating:
          1631,
        steamRmObservedAt:
          "2026-09-03T21:48:40.000Z",
        steamDmRating:
          2346,
        steamDmObservedAt:
          "2026-09-03T21:48:44.000Z",
        ratingObservedAt:
          "2026-09-03T21:48:44.000Z",
        lastObservedAt:
          "2026-09-03T21:48:44.000Z",
      },
    );

    invalidateCurrentWatcherAccountStateCache();
  },
);
