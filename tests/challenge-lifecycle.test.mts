import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChallengeEconomySurface,
} from "../lib/challengeEconomy.ts";

import {
  buildChallengeAcceptBy,
  buildChallengeFundBy,
  buildChallengePlayBy,
  deriveChallengeLifecycle,
  deriveChallengeMoneyState,
  normalizeAcceptanceWindowHours,
} from "../lib/challengeLifecycle.ts";

const now = new Date("2026-07-18T18:00:00.000Z");

test("defaults acceptance window to 72 hours", () => {
  assert.equal(normalizeAcceptanceWindowHours(undefined), 72);
  assert.equal(buildChallengeAcceptBy(now).toISOString(), "2026-07-21T18:00:00.000Z");
});

test("supports only the published acceptance windows", () => {
  assert.equal(normalizeAcceptanceWindowHours(24), 24);
  assert.equal(normalizeAcceptanceWindowHours(72), 72);
  assert.equal(normalizeAcceptanceWindowHours(168), 168);
  assert.equal(normalizeAcceptanceWindowHours(720), 720);
  assert.equal(normalizeAcceptanceWindowHours(12), 72);
});

test("open challenge awaits opponent until acceptance expiry", () => {
  const acceptBy = buildChallengeAcceptBy(now, 72);
  const snapshot = deriveChallengeLifecycle({
    status: "creator_funded",
    timingMode: "open",
    createdAt: now,
    acceptBy,
    challengerFundedAt: now,
  }, now);
  assert.equal(snapshot.phase, "awaiting_opponent");
  assert.equal(snapshot.deadlineAt?.toISOString(), acceptBy.toISOString());
});

test("expired acceptance window requests expiry reconciliation", () => {
  const snapshot = deriveChallengeLifecycle({
    status: "creator_funded",
    timingMode: "open",
    createdAt: now,
    acceptBy: new Date(now.getTime() - 1),
    challengerFundedAt: now,
  }, now);
  assert.equal(snapshot.phase, "expired");
  assert.equal(snapshot.shouldExpireAcceptance, true);
});

test("accepted challenge gets a one-hour funding window", () => {
  const acceptedAt = now;
  assert.equal(buildChallengeFundBy(acceptedAt).toISOString(), "2026-07-18T19:00:00.000Z");
});

test("exact match time caps the post-acceptance funding window", () => {
  const exactStart = new Date("2026-07-18T18:30:00.000Z");
  assert.equal(
    buildChallengeFundBy(now, exactStart).toISOString(),
    exactStart.toISOString()
  );
});

test("fully funded open challenge is match ready and play-anytime", () => {
  const snapshot = deriveChallengeLifecycle({
    status: "funded",
    timingMode: "open",
    createdAt: now,
    acceptedAt: now,
    challengerFundedAt: now,
    challengedFundedAt: now,
    playBy: buildChallengePlayBy(now),
  }, now);
  assert.equal(snapshot.phase, "match_ready");
  assert.equal(snapshot.canPlayAnytime, true);
});

test("exact time proposal is distinct from acceptance and funding", () => {
  const matchTime = new Date("2026-07-20T20:00:00.000Z");
  const proposed = deriveChallengeLifecycle({
    status: "funded",
    timingMode: "scheduled",
    createdAt: now,
    acceptedAt: now,
    challengerFundedAt: now,
    challengedFundedAt: now,
    matchTime,
  }, now);
  assert.equal(proposed.phase, "time_proposed");

  const confirmed = deriveChallengeLifecycle({
    status: "funded",
    timingMode: "scheduled",
    createdAt: now,
    acceptedAt: now,
    challengerFundedAt: now,
    challengedFundedAt: now,
    matchTime,
    matchTimeConfirmedAt: now,
  }, now);
  assert.equal(confirmed.phase, "scheduled");
});

test("money state reports a completed refund only after all planned transfers execute", () => {
  assert.equal(deriveChallengeMoneyState({
    challengerFunded: true,
    challengedFunded: false,
    terminalStatus: "canceled",
    plannedTransferCount: 1,
    executedTransferCount: 0,
  }), "refund_pending");

  assert.equal(deriveChallengeMoneyState({
    challengerFunded: true,
    challengedFunded: false,
    terminalStatus: "canceled",
    plannedTransferCount: 1,
    executedTransferCount: 1,
  }), "refunded");
});

test("accepted but incompletely funded challenge expires its funding window", () => {
  const fundBy = new Date(now.getTime() - 1);
  const snapshot = deriveChallengeLifecycle({
    status: "accepted",
    timingMode: "open",
    createdAt: new Date(now.getTime() - 60 * 60 * 1000),
    acceptedAt: new Date(now.getTime() - 30 * 60 * 1000),
    fundBy,
    challengerFundedAt: new Date(now.getTime() - 20 * 60 * 1000),
  }, now);

  assert.equal(snapshot.phase, "funding_expired");
  assert.equal(snapshot.shouldExpireFunding, true);
  assert.equal(snapshot.awaitingActor, "opponent");
});

test("funded play-anytime challenge expires after its play runway", () => {
  const snapshot = deriveChallengeLifecycle({
    status: "funded",
    timingMode: "open",
    createdAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    acceptedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    challengerFundedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    challengedFundedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    playBy: new Date(now.getTime() - 1),
  }, now);

  assert.equal(snapshot.phase, "expired");
  assert.equal(snapshot.shouldExpirePlayWindow, true);
});

test("refund state stays pending when only some planned transfers executed", () => {
  assert.equal(deriveChallengeMoneyState({
    challengerFunded: true,
    challengedFunded: true,
    terminalStatus: "expired",
    plannedTransferCount: 2,
    executedTransferCount: 1,
  }), "partially_refunded");
});

test("a failed transfer takes precedence over an otherwise partial refund", () => {
  assert.equal(deriveChallengeMoneyState({
    challengerFunded: true,
    challengedFunded: true,
    terminalStatus: "expired",
    plannedTransferCount: 2,
    executedTransferCount: 1,
    failedTransferCount: 1,
  }), "settlement_failed");
});


test("legacy terminal Challenge rows keep their terminal presentation", () => {
  const expired = buildChallengeEconomySurface({
    status: "expired",
    scheduledAt: now,
    wagerAmountWolo: 0,
    guaranteeAmountWolo: 0,
  }, now);
  assert.equal(expired.displayState, "expired");
  assert.equal(expired.economy.statusLabel, "Expired");

  const refunded = buildChallengeEconomySurface({
    status: "refunded",
    scheduledAt: now,
    wagerAmountWolo: 0,
    guaranteeAmountWolo: 0,
  }, now);
  assert.equal(refunded.displayState, "refunded");
  assert.equal(refunded.economy.statusLabel, "Refunded");
});

test("no-show guarantee copy matches the settlement rail", () => {
  const noShow = buildChallengeEconomySurface({
    status: "no_show_right",
    scheduledAt: now,
    timingMode: "scheduled",
    matchTime: now,
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 10,
    challengerFundedAt: new Date(now.getTime() - 1000),
    challengedFundedAt: new Date(now.getTime() - 1000),
    challengerCheckedInAt: new Date(now.getTime() - 1000),
  }, now);
  assert.equal(noShow.displayState, "no_show_right");
  assert.match(noShow.economy.resolution.guarantee || "", /awarded to the creator who showed/);
  assert.equal(noShow.economy.resolution.treasury, null);
});
