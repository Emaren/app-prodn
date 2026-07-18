import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingChallengeFundingProof,
  loadPendingChallengeFundingProof,
  storePendingChallengeFundingProof,
} from "../lib/clientChallengeFundingRetry.ts";

import {
  summarizeChallengeInboxMessage,
} from "../lib/challengeInboxMessages.ts";
import {
  buildChallengeFundingMemo,
} from "../lib/challengeFundingMemo.ts";

test("builds the WoloChain challenge funding memo with exact bucket amounts", () => {
  assert.equal(
    buildChallengeFundingMemo({
      challengeId: 42,
      wagerAmountWolo: 25,
      guaranteeAmountWolo: 10,
      participantSide: "left",
    }),
    "wolo.challenge.funding.v1:app=aoe2hdbets&sid=aoe2hdbets:challenge-42:v1&cid=42&side=left&w=25000000&g=10000000&t=35000000"
  );
});

test("parses title stakes into the rich challenge invitation contract", () => {
  const summary = summarizeChallengeInboxMessage(
    [
      "Challenge scheduled",
      "Emaren vs Jim",
      "Challenge ID: #42",
      "Start: Jun 27, 3:00 PM",
      "Start ISO: 2026-06-27T21:00:00.000Z",
      "Funding: 35 WOLO each",
      "Status: Awaiting terms acceptance",
      "Title Stakes: Canada Champion, Relic Baron",
      "Title Rule: Eligible app-side titles move only after verified watcher or replay proof.",
      "Note: One clean set. Winner owns the room.",
    ].join("\n")
  );

  assert.ok(summary);
  assert.equal(summary.challengeId, 42);
  assert.equal(summary.titleStakesLabel, "Canada Champion, Relic Baron");
  assert.equal(
    summary.titleRuleLabel,
    "Eligible app-side titles move only after verified watcher or replay proof."
  );
  assert.match(summary.compactLine, /Canada Champion/);
});

test("parses open Challenge v2 invitation with acceptance deadline and play-anytime terms", () => {
  const summary = summarizeChallengeInboxMessage(
    [
      "Challenge issued",
      "Emaren vs Jim",
      "Challenge ID: #77",
      "Accept by: Jul 21, 11:00 AM",
      "Accept by ISO: 2026-07-21T17:00:00.000Z",
      "Wolo Wager: 25 WOLO",
      "Match Guarantee: 10 WOLO",
      "Funding: 35 WOLO each",
      "Status: Awaiting acceptance",
    ].join("\n")
  );

  assert.ok(summary);
  assert.equal(summary.state, "issued");
  assert.equal(summary.challengeId, 77);
  assert.equal(summary.scheduledAtIso, "2026-07-21T17:00:00.000Z");
  assert.match(summary.compactLine, /Challenge issued/);
  assert.match(summary.compactLine, /35 WOLO each/);
});

test("parses proposed and confirmed exact-time notices without confusing them with acceptance", () => {
  const proposed = summarizeChallengeInboxMessage(
    [
      "Challenge time proposed",
      "Jim vs Zodiac",
      "Challenge ID: #24",
      "Proposed match time: Jul 22, 8:00 PM",
      "Match time ISO: 2026-07-23T02:00:00.000Z",
      "Status: Waiting for confirmation",
    ].join("\n")
  );
  assert.ok(proposed);
  assert.equal(proposed.compactHeadline, "Time proposed");
  assert.equal(proposed.scheduledAtIso, "2026-07-23T02:00:00.000Z");

  const confirmed = summarizeChallengeInboxMessage(
    [
      "Challenge time confirmed",
      "Jim vs Zodiac",
      "Challenge ID: #24",
      "Start: Jul 22, 8:00 PM",
      "Match time ISO: 2026-07-23T02:00:00.000Z",
      "Status: Exact time confirmed",
    ].join("\n")
  );
  assert.ok(confirmed);
  assert.equal(confirmed.compactHeadline, "Time confirmed");
  assert.equal(confirmed.scheduledAtIso, "2026-07-23T02:00:00.000Z");
});


test("persists one reusable funding proof per challenge side to prevent duplicate broadcasts", () => {
  const storage = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  };

  try {
    storePendingChallengeFundingProof({
      challengeId: 24,
      participantSide: "left",
      wagerAmountWolo: 1000,
      guaranteeAmountWolo: 10,
      fundingTxHash: "ABC123",
      walletAddress: "wolo1jim",
    });

    const same = loadPendingChallengeFundingProof({
      challengeId: 24,
      participantSide: "left",
      wagerAmountWolo: 1000,
      guaranteeAmountWolo: 10,
    });
    assert.equal(same?.fundingTxHash, "ABC123");

    const wrongSide = loadPendingChallengeFundingProof({
      challengeId: 24,
      participantSide: "right",
      wagerAmountWolo: 1000,
      guaranteeAmountWolo: 10,
    });
    assert.equal(wrongSide, null);

    clearPendingChallengeFundingProof(24);
    assert.equal(loadPendingChallengeFundingProof({
      challengeId: 24,
      participantSide: "left",
      wagerAmountWolo: 1000,
      guaranteeAmountWolo: 10,
    }), null);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});
