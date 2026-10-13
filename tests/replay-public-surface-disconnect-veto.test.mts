import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";

const archive = readFileSync(new URL("../lib/publicBattleArchive.ts", import.meta.url), "utf8");
const og = readFileSync(new URL("../lib/ogBoard.ts", import.meta.url), "utf8");
const review = readFileSync(new URL("../lib/replayReviewQueue.ts", import.meta.url), "utf8");

test("paged public Battle Archive fetch includes original persisted veto and decisive event metadata", () => {
  const select = archive.slice(archive.indexOf("const rows = await prisma.gameStats.findMany({"));
  assert.match(select, /disconnect_detected:\s*true/);
  assert.match(select, /event_types:\s*true/);
  assert.match(select, /is_final:\s*true/);
  assert.match(select, /cleanPublicGameRows\(identityRows/);
});

test("OG leaderboard SQL row and typed transport both retain disconnect/desync", () => {
  assert.match(og, /disconnect_detected:\s*boolean/);
  const query = og.slice(og.indexOf("const rawRows = await prisma.$queryRaw"));
  assert.match(query, /parse_reason,\s*disconnect_detected\s+FROM game_stats/);
  assert.match(query, /cleanPublicGameRows\(rawRows/);
});

test("Replay Review queue selects and nominates final rows with persisted veto", () => {
  const query = review.slice(review.indexOf("const sourceRows = await prisma.gameStats.findMany({"));
  assert.match(query, /\{\s*disconnect_detected:\s*true\s*\}/);
  assert.match(query, /disconnect_detected:\s*true/);
  assert.match(query, /is_final:\s*true/);
  assert.match(query, /disconnectDetected:\s*row\.disconnect_detected/);
  assert.match(query, /isFinal:\s*row\.is_final/);
  assert.match(query, /eventTypes:\s*row\.event_types/);
});

test("public outcome resolver vetoes an otherwise apparently accepted Watcher final", () => {
  const row = {
    id: 25590,
    winner: "Alpha",
    players: [
      { name: "Alpha", number: 1, winner: true },
      { name: "Bravo", number: 2, winner: false },
    ],
    is_final: true,
    parse_source: "watcher_final",
    parse_reason: "recorded_resignation_final",
    key_events: { completed: true, completion_source: "resignation", resigned_player_names: ["Bravo"] },
    event_types: ["resign"],
  };
  assert.equal(publicReplayWinnerTruth({ ...row, disconnect_detected: false }).statsEligible, true);
  const vetoed = publicReplayWinnerTruth({ ...row, disconnect_detected: true });
  assert.equal(vetoed.statsEligible, false);
  assert.equal(vetoed.bettingEligible, false);
  assert.ok(vetoed.truthReasons.includes("disconnect_or_desync"));
});
