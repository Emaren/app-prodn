import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  isWatcherCurrentRatingSource,
  parseReplayRatingObservation,
  shouldReplaceCurrentReplayRating,
} from "../lib/playerRatingRecency.ts";

import {
  buildPlayerPerformanceStats,
} from "../lib/playerPerformance.ts";

import {
  buildReplayPublicPlayerRef,
} from "../lib/publicPlayers.ts";

test(
  "undated historical upload cannot replace an existing current rating",
  () => {
    assert.equal(
      shouldReplaceCurrentReplayRating({
        currentHasRating: true,
        currentObservedAt:
          "2026-09-03T23:00:00.000Z",
        nextPlayedOn: null,
      }),
      false,
    );
  },
);

test(
  "older replay played_on cannot replace a newer current rating",
  () => {
    assert.equal(
      shouldReplaceCurrentReplayRating({
        currentHasRating: true,
        currentObservedAt:
          "2026-09-03T23:00:00.000Z",
        nextPlayedOn:
          "2025-04-01T18:00:00.000Z",
      }),
      false,
    );
  },
);

test(
  "newer trustworthy played_on advances current rating",
  () => {
    assert.equal(
      shouldReplaceCurrentReplayRating({
        currentHasRating: true,
        currentObservedAt:
          "2026-09-02T23:00:00.000Z",
        nextPlayedOn:
          "2026-09-03T23:00:00.000Z",
      }),
      true,
    );
  },
);

test(
  "undated replay may bootstrap only an identity with no known rating",
  () => {
    assert.equal(
      shouldReplaceCurrentReplayRating({
        currentHasRating: false,
        currentObservedAt: null,
        nextPlayedOn: null,
      }),
      true,
    );
  },
);

test(
  "dated replay replaces an older undated bootstrap",
  () => {
    assert.equal(
      shouldReplaceCurrentReplayRating({
        currentHasRating: true,
        currentObservedAt: null,
        nextPlayedOn:
          "2026-09-03T23:00:00.000Z",
      }),
      true,
    );
  },
);

test(
  "invalid rating clocks fail closed",
  () => {
    assert.equal(
      parseReplayRatingObservation(
        "not-a-date",
      ),
      null,
    );
  },
);

test(
  "newly uploaded old replay cannot override newer replay rating",
  () => {
    const zodiac =
      buildReplayPublicPlayerRef(
        "Zodiac",
      );

    const stats =
      buildPlayerPerformanceStats(
        [
          {
            id: 101,
            winner: "Opponent",
            players: [
              {
                name: "Zodiac",
                steam_rm_rating: 1410,
              },
              {
                name: "Opponent",
              },
            ],
            map: {
              name: "Arabia",
            },

            /*
             * Simulate a historical replay uploaded today:
             * timestamp is current-ish but actual game date is old.
             */
            timestamp:
              "2026-09-04T06:00:00.000Z",
            played_on:
              "2025-01-10T06:00:00.000Z",
          },
          {
            id: 102,
            winner: "Zodiac",
            players: [
              {
                name: "Zodiac",
                steam_rm_rating: 1671,
              },
              {
                name: "Opponent",
              },
            ],
            map: {
              name: "Arabia",
            },
            timestamp:
              "2026-09-03T22:00:00.000Z",
            played_on:
              "2026-09-03T22:00:00.000Z",
          },
        ],
        zodiac,
      );

    assert.equal(
      stats.steamRating,
      1671,
    );

    assert.equal(
      stats.ratingLastSeenAt,
      "2026-09-03T22:00:00.000Z",
    );
  },
);

test(
  "undated batch replay arriving later cannot override known rating",
  () => {
    const zodiac =
      buildReplayPublicPlayerRef(
        "Zodiac",
      );

    const stats =
      buildPlayerPerformanceStats(
        [
          {
            id: 201,
            winner: "Zodiac",
            players: [
              {
                name: "Zodiac",
                steam_rm_rating: 1671,
              },
              {
                name: "Opponent",
              },
            ],
            map: {
              name: "Arena",
            },
            played_on:
              "2026-09-03T22:00:00.000Z",
          },
          {
            id: 202,
            winner: "Opponent",
            players: [
              {
                name: "Zodiac",
                steam_rm_rating: 1300,
              },
              {
                name: "Opponent",
              },
            ],
            map: {
              name: "Arena",
            },
            timestamp:
              "2026-09-04T06:30:00.000Z",
            played_on: null,
          },
        ],
        zodiac,
      );

    assert.equal(
      stats.steamRating,
      1671,
    );
  },
);

test(
  "leaderboard current Steam rating accepts only live/final Watcher sources",
  () => {
    assert.equal(
      isWatcherCurrentRatingSource(
        "watcher_live",
      ),
      true,
    );

    assert.equal(
      isWatcherCurrentRatingSource(
        "watcher_final",
      ),
      true,
    );

    assert.equal(
      isWatcherCurrentRatingSource(
        "file_upload",
      ),
      false,
    );

    assert.equal(
      isWatcherCurrentRatingSource(
        "browser",
      ),
      false,
    );
  },
);

test(
  "profile and directory consume chronology-aware current-rating authority",
  () => {
    const directory =
      fs.readFileSync(
        new URL(
          "../lib/publicPlayerDirectory.ts",
          import.meta.url,
        ),
        "utf8",
      );

    const profile =
      fs.readFileSync(
        new URL(
          "../lib/playerProfile.ts",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      directory,
      /isWatcherCurrentRatingSource\(\s*game\.parse_source/,
    );

    assert.match(
      directory,
      /updateSteamRatings\([\s\S]*game\.played_on/,
    );

    assert.match(
      profile,
      /const steamRmRating =\s*performance\.steamRating/,
    );

    assert.match(
      profile,
      /const steamDmRating =\s*performance\.ladderRating/,
    );
  },
);
