import assert from "node:assert/strict";
import test from "node:test";

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
