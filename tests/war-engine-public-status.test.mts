import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePublicWarEngineStatus,
} from "../lib/warEngine.ts";

function carrier(overrides: Record<string, unknown> = {}) {
  return {
    warEngineCase: {
      id: 7,
      initialTier: 3,
      initialReasonCode: "standard_parse_exhausted_result_not_encoded",
      sourceReplayHashes: ["a".repeat(64)],
      financialHistoryLocked: true,
      financialLockReason: "Historical betting state is immutable.",
      createdAt: "2026-08-03T04:00:00.000Z",
      events: [
        {
          id: 9,
          sequence: 0,
          eventType: "queued",
          tier: 3,
          status: "queued",
          classification: null,
          publicLabel: "WAR ENGINE REQUIRED",
          publicDetail: "Result not encoded · Full battle reconstruction queued.",
          confidenceBps: null,
          winningTeamKey: null,
          winningPlayerKeys: [],
          createdAt: "2026-08-03T04:00:00.000Z",
        },
      ],
      runs: [],
      ...overrides,
    },
  };
}

test("queued cases expose the War Engine required public state", () => {
  const status = resolvePublicWarEngineStatus(carrier());

  assert.equal(status?.badge, "WAR ENGINE REQUIRED");
  assert.equal(status?.tier, 3);
  assert.equal(status?.tierLabel, "Fast Verdict Replay");
  assert.equal(status?.financialHistoryLocked, true);
  assert.equal(status?.href, "/war-engine#case-7");
});

test("completed reconstruction uses verified language", () => {
  const status = resolvePublicWarEngineStatus(
    carrier({
      events: [
        {
          id: 10,
          sequence: 4,
          eventType: "classified",
          tier: 4,
          status: "completed",
          classification: "reconstructed_result",
          publicLabel: "",
          publicDetail: "",
          confidenceBps: 10000,
          winningTeamKey: "team:julio",
          winningPlayerKeys: ["steam:julio"],
          createdAt: "2026-08-03T05:00:00.000Z",
        },
      ],
    })
  );

  assert.equal(status?.badge, "WAR ENGINE VERIFIED");
  assert.equal(status?.classification, "reconstructed_result");
  assert.equal(status?.tierLabel, "Full Battle Reconstruction");
});

test("inconclusive recordings remain distinct from likely outcomes", () => {
  const status = resolvePublicWarEngineStatus(
    carrier({
      events: [
        {
          id: 11,
          sequence: 5,
          eventType: "classified",
          tier: 4,
          status: "completed",
          classification: "inconclusive_recording",
          publicLabel: "",
          publicDetail: "",
          confidenceBps: null,
          winningTeamKey: null,
          winningPlayerKeys: [],
          createdAt: "2026-08-03T05:30:00.000Z",
        },
      ],
    })
  );

  assert.equal(status?.badge, "BATTLE INCONCLUSIVE");
  assert.match(status?.detail ?? "", /ended before/i);
});

test("games without a War Engine case receive no badge", () => {
  assert.equal(
    resolvePublicWarEngineStatus({ warEngineCase: null }),
    null
  );
});
