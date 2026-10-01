import assert from "node:assert/strict";
import test from "node:test";
import { challengeCountdown, championshipPhaseLabel, challengeStakeLabel, normalizeChallengeDisplay } from "../lib/challengePresentation.ts";

test("presentation version and complexity are independent, including preserved E1", () => {
  for (const layout of ["basic", "advanced", "extreme"] as const) {
    for (const version of [1, 2] as const) assert.deepEqual(normalizeChallengeDisplay({ layout, version }), { layout, version });
  }
  assert.deepEqual(normalizeChallengeDisplay({ layout: "unknown", version: 3 }), { layout: "extreme", version: 2 });
});

test("one server-owned deadline counts seconds without accepting/funding resets", () => {
  const deadline = "2026-09-30T20:00:00.000Z";
  assert.equal(challengeCountdown(deadline, Date.parse("2026-09-29T20:00:00.000Z")).label, "24:00:00");
  assert.equal(challengeCountdown(deadline, Date.parse("2026-09-30T02:17:51.000Z")).label, "17:42:09");
  assert.equal(challengeCountdown(deadline, Date.parse("2026-09-30T02:17:52.000Z")).label, "17:42:08");
});

test("final hour has an exact accessible boundary and zero is clamped", () => {
  const deadline = "2026-09-30T20:00:00.000Z";
  assert.equal(challengeCountdown(deadline, Date.parse("2026-09-30T18:59:59.000Z")).finalHour, false);
  assert.equal(challengeCountdown(deadline, Date.parse("2026-09-30T19:00:00.000Z")).finalHour, true);
  assert.deepEqual(challengeCountdown(deadline, Date.parse("2026-09-30T21:00:00.000Z")), { label: "00:00:00", finalHour: false, expired: true });
  assert.deepEqual(challengeCountdown("unavailable", 0), { label: "—", finalHour: false, expired: false });
});

test("public states and stake presets use human labels without leaking enum names", () => {
  assert.equal(championshipPhaseLabel("default_grace"), "Commissioner grace");
  assert.equal(championshipPhaseLabel("defense_in_progress", false), "Battle in progress");
  assert.equal(championshipPhaseLabel("disputed"), "Title in dispute");
  assert.equal(championshipPhaseLabel("unexpected_private_state"), "Challenge awaiting review");
  assert.deepEqual([10,25,100,50].map(challengeStakeLabel), ["Friendly","Ranked","Grudge","Custom stakes"]);
});
