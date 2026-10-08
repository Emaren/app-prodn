import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const loader = readFileSync(
  new URL(
    "../lib/lobbyLeaderboard.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "streak helper centralizes streak calculation",
  () => {
    assert.match(
      loader,
      /function populateLeaderboardStreaks/,
    );

    assert.match(
      loader,
      /buildStreakLabel\(entry,\s*games\)/,
    );

    assert.match(
      loader,
      /streakSortScore\(entry\.streakLabel\)/,
    );
  },
);

test(
  "normal leaderboard loads paginate before calculating streaks",
  () => {
    const selectionPosition =
      loader.indexOf(
        "buildLeaderboardSelection(",
        loader.indexOf(
          "async function loadLobbyLeaderboardFresh",
        ),
      );

    const selectedStreakPosition =
      loader.indexOf(
        "populateLeaderboardStreaks(\n      selectedEntries",
        selectionPosition,
      );

    assert.ok(
      selectionPosition >= 0,
      "selection call should exist",
    );

    assert.ok(
      selectedStreakPosition >
        selectionPosition,
      "selected-entry streak calculation must happen after pagination selection",
    );
  },
);

test(
  "only streak sorting pays the full candidate streak cost",
  () => {
    assert.match(
      loader,
      /if \(requestedSortKey === "streak"\) \{[\s\S]*populateLeaderboardStreaks\(\s*candidates,\s*recentGames\s*\)/,
    );

    assert.match(
      loader,
      /if \(requestedSortKey !== "streak"\) \{[\s\S]*populateLeaderboardStreaks\(\s*selectedEntries,\s*recentGames\s*\)/,
    );

    assert.doesNotMatch(
      loader,
      /for \(const candidate of candidates\) \{\s*candidate\.streakLabel/,
    );
  },
);

test(
  "global streak sort still occurs before pagination",
  () => {
    const fullStreakPosition =
      loader.indexOf(
        'if (requestedSortKey === "streak")',
      );

    const selectionPosition =
      loader.indexOf(
        "buildLeaderboardSelection(",
        fullStreakPosition,
      );

    assert.ok(
      fullStreakPosition >= 0,
    );

    assert.ok(
      selectionPosition >
        fullStreakPosition,
      "full candidate streak truth must exist before streak-sorted selection",
    );
  },
);
