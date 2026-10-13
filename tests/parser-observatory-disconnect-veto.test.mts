import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveReplayWinnerTruth } from "../lib/unresolvedWatcherResult.ts";

const source = readFileSync(new URL("../lib/parserObservatory.ts", import.meta.url), "utf8");

test("both public and viewer Observatory queries select stored disconnect/desync truth", () => {
  const queryStarts = [
    "return getPrisma().gameStats.findMany({",
    "const rawRows = await getPrisma().gameStats.findMany({",
  ];
  for (const start of queryStarts) {
    const pos = source.indexOf(start);
    assert.ok(pos !== -1, `Observatory query missing: ${start}`);
    const selectEnd = source.indexOf("replayResultAdjudications:", pos);
    assert.ok(selectEnd !== -1 && selectEnd - pos < 3000, "unexpected Observatory query boundary");
    const selection = source.slice(pos, selectEnd);
    assert.match(selection, /disconnect_detected:\s*true/, "stored disconnect veto must be selected");
  }
});

test("Observatory direct truth helper forwards the fetched disconnect flag", () => {
  const begin = source.indexOf("function resultTruth(");
  const end = source.indexOf("function bump(", begin);
  assert.ok(begin !== -1 && end > begin, "result helper structure is missing");
  const helper = source.slice(begin, end);
  assert.match(helper, /disconnectDetected:\s*row\.disconnect_detected/);
  assert.match(helper, /isFinal:\s*row\.is_final/);
});

test("an otherwise accepted canonical winner becomes unknown when watcher disconnect is proven", () => {
  const fixture = {
    winner: "Alpha",
    players: [
      { name: "Alpha", team_id: 1, winner: true },
      { name: "Bravo", team_id: 1, winner: false },
      { name: "Charlie", team_id: 2, winner: false },
      { name: "Delta", team_id: 2, winner: false },
    ],
    parseSource: "watcher_final",
    parseReason: "recorded_resignation_final",
    isFinal: true,
  };
  const withoutVeto = resolveReplayWinnerTruth({ ...fixture, disconnectDetected: false });
  assert.equal(withoutVeto.statsEligible, true, "positive control: scalar winner originally qualified");
  const withVeto = resolveReplayWinnerTruth({ ...fixture, disconnectDetected: true });
  assert.equal(withVeto.statsEligible, false);
  assert.equal(withVeto.bettingEligible, false);
  assert.equal(withVeto.winner, null);
  assert.ok(withVeto.truthReasons.includes("disconnect_or_desync"));
});
