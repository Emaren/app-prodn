import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";

const source = readFileSync(new URL("../lib/publicLeaderboardGameCorpus.ts", import.meta.url), "utf8");

test("the paginated raw leaderboard corpus retains persisted disconnect evidence", () => {
  assert.match(source, /disconnect_detected:\s*boolean/);
  const start = source.indexOf("async function loadPublicLeaderboardRawGamePage(");
  const end = source.indexOf("async function loadPublicLeaderboardRawGamesFresh(", start);
  assert.ok(start !== -1 && end > start, "bounded paginated corpus loader must exist");
  assert.match(source.slice(start, end), /disconnect_detected:\s*true/);
  assert.match(source.slice(start, end), /parse_source:\s*true/);
  assert.match(source.slice(start, end), /replayResultAdjudications:/);
});

test("one stored-winner Watcher final with a disconnect is not a leaderboard win", () => {
  const row = {
    id: 11001,
    winner: "Alpha",
    players: [
      { name: "Alpha", team_id: 1, winner: true },
      { name: "Bravo", team_id: 1, winner: false },
      { name: "Charlie", team_id: 2, winner: false },
      { name: "Delta", team_id: 2, winner: false },
    ],
    parse_source: "watcher_final",
    parse_reason: "recorded_resignation_final",
    is_final: true,
    key_events: { completed: true },
  };
  assert.equal(publicReplayWinnerTruth({ ...row, disconnect_detected: false }).statsEligible, true);
  const vetoed = publicReplayWinnerTruth({ ...row, disconnect_detected: true });
  assert.equal(vetoed.statsEligible, false);
  assert.equal(vetoed.bettingEligible, false);
  assert.ok(vetoed.truthReasons.includes("disconnect_or_desync"));
});
