import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { storedBetAutoFinancialIssue } from "../lib/betAutomation.ts";

const preset = () => ({
  winnerStakeWolo: 500,
  desyncSide: "none",
  desyncStakeWolo: 0,
  untilOut: false,
  gamesRemaining: 20,
});

test("saved Mecha financial integrity is deterministic at the entire finite-plan boundary", () => {
  assert.equal(storedBetAutoFinancialIssue(preset()), null);
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), gamesRemaining: 21 }), "auto_stake_cap_exceeded");
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), gamesRemaining: 0 }), null,
    "A legitimately exhausted plan gets its own lifecycle status, not an invalid-data finding");
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), gamesRemaining: 10_001 }), "stored_preset_invalid");
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), untilOut: true, gamesRemaining: null }), null);
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), untilOut: true }), "stored_preset_invalid");
});

test("unknown legacy Desync values cannot be silently represented as an eligible none pick", () => {
  for (const desyncSide of ["legacy", "null", "", "maybe", "YES"]) {
    assert.equal(storedBetAutoFinancialIssue({ ...preset(), desyncSide }), "stored_preset_invalid");
  }
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), desyncSide: "no", desyncStakeWolo: 200, gamesRemaining: 10 }), null);
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), desyncSide: "yes", desyncStakeWolo: 600 }), "auto_stake_cap_exceeded");
  assert.equal(storedBetAutoFinancialIssue({ ...preset(), desyncSide: "none", desyncStakeWolo: 1 }), "auto_stake_cap_exceeded");
});

test("malformed legacy amounts fail closed without arithmetic, mutation or new wagers", () => {
  for (const winnerStakeWolo of [0, -1, 1001, NaN, Infinity, 10.2, Number.MAX_SAFE_INTEGER]) {
    assert.equal(storedBetAutoFinancialIssue({ ...preset(), winnerStakeWolo }), "auto_stake_cap_exceeded");
  }
  for (const desyncStakeWolo of [-1, 1001, NaN, 1.25]) {
    assert.equal(storedBetAutoFinancialIssue({ ...preset(), desyncStakeWolo }), "auto_stake_cap_exceeded");
  }
});

test("API, shadow worker and exact market admission share one source-bound integrity test", () => {
  const api = readFileSync(new URL("../app/api/user/bet-automation/route.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../lib/betAutomationShadowWorker.ts", import.meta.url), "utf8");
  const admission = readFileSync(new URL("../lib/betAutomation.ts", import.meta.url), "utf8");
  assert.match(api, /storedIssue = input\.preset \? storedBetAutoFinancialIssue\(input\.preset\)/);
  assert.match(api, /storedPlanValid: storedIssue === null/);
  assert.match(api, /requiresPlanReview: storedIssue !== null/);
  assert.match(api, /Boolean\(input\.preset\?\.enabled\) && storedIssue === null && automationRuntime\.executionReady/);
  assert.match(worker, /if \(storedBetAutoFinancialIssue\(preset\)\)/);
  assert.match(admission, /const issue = storedBetAutoFinancialIssue\(input\.preset\)/);
  assert.match(admission, /reason: "finite_plan_exhausted"/);
  assert.doesNotMatch(worker, /if \(!\["none", "no", "yes"\]\.includes\(preset\.desyncSide\)\)/);
});
