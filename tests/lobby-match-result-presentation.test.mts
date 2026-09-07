import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { winnerLabel } from "../lib/gameStatsView.ts";
import { presentSanitizedLobbyWinner } from "../lib/lobbyMatchResultPresentation.ts";
import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";

const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/lobby-result-display-2026-09-07.json", import.meta.url),
  "utf8",
)) as {
  cases: Array<{
    raw: Record<string, unknown>;
    public: Record<string, unknown>;
    expectedWinner: string;
  }>;
};

for (const entry of fixture.cases) {
  test(`lobby preserves the sanitized complete winner for game ${entry.raw.id}`, () => {
    const rawTruth = publicReplayWinnerTruth(entry.raw);
    assert.equal(rawTruth.statsEligible, true);
    assert.equal(rawTruth.winner, entry.expectedWinner);
    assert.equal(rawTruth.bettingEligible, false);
    assert.equal(entry.public.winnerProof, "trusted_structured_result");
    assert.equal(entry.public.reviewNeeded, false);

    // The previous UI threw away the roster/proof before revalidating it.
    assert.equal(winnerLabel(
      entry.expectedWinner,
      entry.public.parse_reason as string,
    ), "Winner unresolved");
    assert.deepEqual(presentSanitizedLobbyWinner(entry.public), {
      headline: entry.expectedWinner,
      pill: "Win by resignation",
    });
    assert.equal(presentSanitizedLobbyWinner(entry.raw), null);
  });
}

test("FN map labels do not determine team sizes", () => {
  assert.deepEqual(fixture.cases.map((entry) => [
    entry.raw.id,
    (entry.raw.players as unknown[]).length,
  ]), [[32538, 6], [32491, 8], [32444, 6]]);
});

const publicRow = fixture.cases[0].public;
for (const [label, patch] of Object.entries({
  "proof absent": { winnerProof: undefined },
  "unrecognized proof": { winnerProof: "postgame_winner_flags" },
  "explicit review": { reviewNeeded: true },
  "review clearance absent": { reviewNeeded: undefined },
  "string review clearance": { reviewNeeded: "false" },
  "nested review": { unresolvedResult: { reviewNeeded: true } },
  "human confirmed desync": { humanConfirmedDesync: true },
  "disconnect": { disconnect_detected: true },
  "camel case disconnect": { disconnectDetected: true },
  "nested disconnect": { key_events: { disconnect_detected: true } },
  "encoded nested disconnect": { key_events: '{"disconnect_detected":true}' },
  "legacy 1v1 inference": { parse_reason: "watcher_inferred_opponent_win_on_incomplete_1v1" },
  "legacy team inference": { parse_reason: "watcher_inferred_opponent_win_on_incomplete" },
  "provisional inference": { parse_reason: "watcher_inferred_backfill" },
  "early exit": { parse_reason: "hd_early_exit_under_60s" },
  "empty winner": { winner: " " },
  "unknown winner": { winner: "Unknown" },
  "player flags without winner": { winner: null },
})) {
  test(`sanitized presentation fails closed for ${label}`, () => {
    assert.equal(presentSanitizedLobbyWinner({ ...publicRow, ...patch }), null);
  });
}

test("other explicit sanitizer proofs preserve the existing accepted winner", () => {
  for (const winnerProof of ["replay_winner_truth", "manual_winner_flag"]) {
    assert.deepEqual(presentSanitizedLobbyWinner({
      ...publicRow,
      winnerProof,
      parse_reason: "manual_backfill",
    }), {
      headline: publicRow.winner,
      pill: "Replay result",
    });
  }
});

test("human adjudication and historical fallback retain their existing component authority", () => {
  const source = readFileSync("components/lobby/RecentMatchesPanel.tsx", "utf8");
  const existingAuthority = source.indexOf("acceptedPublicFallback ||");
  const sanitizedAuthority = source.indexOf("presentSanitizedLobbyWinner(match)");
  const strippedRevalidation = source.indexOf("headline: winnerLabel(");
  assert.match(source, /acceptedPublicFallback \|\|\s+acceptedAdjudicatedWinner/);
  assert.match(source, /acceptedAdjudicatedWinner\s+\? h\("Reviewed result"\)/);
  assert.ok(existingAuthority < sanitizedAuthority);
  assert.ok(sanitizedAuthority < strippedRevalidation);
  for (const guard of ["readLobbyHumanConfirmedDesync(\n      match", "rejectedLegacyInference &&"]) {
    const guardPosition = source.indexOf(guard);
    assert.ok(guardPosition >= 0 && guardPosition < sanitizedAuthority);
  }
  for (const winnerProof of ["replay_result_adjudication", "historical_inferred_fallback"]) {
    assert.equal(presentSanitizedLobbyWinner({ ...publicRow, winnerProof }), null);
  }
});
