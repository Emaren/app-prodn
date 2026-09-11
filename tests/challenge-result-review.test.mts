import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildChallengeEconomySurface } from "../lib/challengeEconomy.ts";
import { deriveChallengeLifecycle } from "../lib/challengeLifecycle.ts";
import { summarizeChallengeInboxMessage } from "../lib/challengeInboxMessages.ts";

const NOW = new Date("2026-09-11T18:00:00.000Z");
const MATCH = new Date("2026-09-11T17:00:00.000Z");
const FUNDED = new Date("2026-09-11T16:00:00.000Z");

test("result_pending is an active non-settlement hold", () => {
  const surface = buildChallengeEconomySurface({
    status: "result_pending",
    scheduledAt: MATCH,
    timingMode: "scheduled",
    matchTime: MATCH,
    acceptedAt: FUNDED,
    wagerAmountWolo: 100,
    guaranteeAmountWolo: 25,
    challengerFundedAt: FUNDED,
    challengedFundedAt: FUNDED,
    challengerCheckedInAt: FUNDED,
    challengedCheckedInAt: FUNDED,
    liveConfirmedAt: MATCH,
    resultAt: null,
    settlementReadyAt: null,
  }, NOW);

  assert.equal(surface.persistedStatus, "result_pending");
  assert.equal(surface.displayState, "result_pending");
  assert.equal(surface.economy.statusLabel, "Result review");
  assert.equal(surface.economy.readyForSettlement, false);
  assert.equal(surface.economy.settlementReadyAt, null);
});

test("result_pending freezes lifecycle deadlines without becoming terminal", () => {
  const lifecycle = deriveChallengeLifecycle({
    status: "result_pending",
    timingMode: "scheduled",
    createdAt: FUNDED,
    acceptedAt: FUNDED,
    matchTime: MATCH,
    playBy: new Date("2026-10-11T17:00:00.000Z"),
    challengerFundedAt: FUNDED,
    challengedFundedAt: FUNDED,
    challengerCheckedInAt: FUNDED,
    challengedCheckedInAt: FUNDED,
    liveConfirmedAt: MATCH,
  }, NOW);

  assert.equal(lifecycle.phase, "result_pending");
  assert.equal(lifecycle.active, true);
  assert.equal(lifecycle.terminal, false);
  assert.equal(lifecycle.deadlineAt, null);
  assert.equal(lifecycle.shouldExpirePlayWindow, false);
});

test("result review and settlement protocol cards are reserved recognized notices", () => {
  const review = summarizeChallengeInboxMessage(
    "Challenge result review\nEmaren vs Jim\nStatus: Replay verified · winner unresolved · WOLO held",
  );
  assert.equal(review?.state, "result_review");
  assert.equal(review?.compactHeadline, "Result review");

  const settled = summarizeChallengeInboxMessage(
    "Challenge settled\nEmaren vs Jim\nStatus: 250 WOLO settled · chain proof recorded",
  );
  assert.equal(settled?.state, "settled");
  assert.equal(settled?.compactHeadline, "WOLO settled");
});

test("verified replay reconciliation separates replay ownership from winner authority", () => {
  const source = fs.readFileSync(new URL("../lib/challenges.ts", import.meta.url), "utf8");
  assert.match(source, /protocolWinnerUnresolved/);
  assert.match(source, /targetStatus = protocolWinnerUnresolved \? "result_pending" : "completed"/);
  assert.match(source, /settlementReadyAt: persistedSettlementReadyAt/);
  assert.match(source, /verified-replay:\$\{canonicalClaim\.gameStatsId\}:\$\{targetStatus\}/);
});

test("settlement success uses exactly-once Challenge Protocol delivery", () => {
  const source = fs.readFileSync(new URL("../lib/scheduledMatchSettlements.ts", import.meta.url), "utf8");
  assert.match(source, /plan\.state === "executed"/);
  assert.match(source, /"Challenge settled"/);
  assert.match(source, /deliveryKey: `settlement:\$\{plan\.settlementRunId\}:completed`/);
});
