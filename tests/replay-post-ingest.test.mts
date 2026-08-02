import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReplayIngestReceipt,
  coordinateReplayPostIngest,
  summarizeReplayIngestStages,
} from "../lib/replayPostIngest.ts";

test("trusted replay receipts preserve independent ingest stages", () => {
  const receipt = classifyReplayIngestReceipt(
    {
      replay_hash: "a".repeat(64),
      game_id: 42,
      finality_status: "trusted_final",
      raw_replay_archived: true,
      artifact_accepted: true,
      parse_completed: true,
      players_count: 4,
      has_reliable_teams: true,
      result_resolved: true,
      result_trusted: true,
      final_accepted: true,
      should_settle: true,
      statistics_complete: false,
      stats_eligible: true,
      betting_eligible: true,
    },
    true
  );

  assert.equal(receipt.storage.archived, true);
  assert.equal(receipt.parser.completed, true);
  assert.equal(receipt.teams.reliable, true);
  assert.equal(receipt.result.resolved, true);
  assert.equal(receipt.result.trusted, true);
  assert.equal(receipt.result.ready, true);
  assert.equal(receipt.statistics.complete, false);
  assert.equal(receipt.statistics.eligible, true);
  assert.equal(receipt.financial.eligible, true);
  assert.equal(receipt.reviewRouted, false);
});

test("an archived unresolved final never becomes result or financial truth", () => {
  const receipt = classifyReplayIngestReceipt(
    {
      replay_hash: "b".repeat(64),
      game_id: 43,
      finality_status: "final_recorded",
      raw_replay_archived: true,
      parse_completed: true,
      players_count: 2,
      has_reliable_teams: true,
      result_resolved: false,
      result_trusted: false,
      final_accepted: false,
      should_settle: false,
      statistics_complete: false,
      stats_eligible: false,
      betting_eligible: false,
    },
    true
  );

  assert.equal(receipt.storage.archived, true);
  assert.equal(receipt.parser.completed, true);
  assert.equal(receipt.teams.reliable, true);
  assert.equal(receipt.result.ready, false);
  assert.equal(receipt.statistics.complete, false);
  assert.equal(receipt.financial.eligible, false);
  assert.equal(receipt.reviewRouted, true);
});

test("a package coordinates tournament and market reconciliation once per batch", async () => {
  const trusted = classifyReplayIngestReceipt(
    {
      replay_hash: "c".repeat(64),
      finality_status: "trusted_final",
      raw_replay_archived: true,
      parse_completed: true,
      should_settle: true,
      final_accepted: true,
    },
    true
  );
  const unresolved = classifyReplayIngestReceipt(
    {
      replay_hash: "d".repeat(64),
      finality_status: "final_recorded",
      raw_replay_archived: true,
      parse_completed: true,
      should_settle: false,
    },
    true
  );
  let tournamentCalls = 0;
  let marketCalls = 0;

  const report = await coordinateReplayPostIngest({
    prisma: { label: "fake" },
    receipts: [trusted, unresolved],
    source: "package_upload",
    dependencies: {
      reconcileTournamentMatchProofs: async () => {
        tournamentCalls += 1;
      },
      ensureBetMarkets: async () => {
        marketCalls += 1;
      },
    },
  });

  assert.equal(tournamentCalls, 1);
  assert.equal(marketCalls, 1);
  assert.equal(report.result.readyCount, 1);
  assert.equal(report.result.reviewCount, 1);
  assert.equal(report.financial.tournament.succeeded, true);
  assert.equal(report.financial.markets.succeeded, true);
});

test("unresolved package receipts do not trigger financial side effects", async () => {
  const unresolved = classifyReplayIngestReceipt(
    {
      replay_hash: "e".repeat(64),
      finality_status: "final_recorded",
      raw_replay_archived: true,
      parse_completed: true,
      should_settle: false,
    },
    true
  );
  let calls = 0;

  const report = await coordinateReplayPostIngest({
    prisma: {},
    receipts: [unresolved],
    source: "package_upload",
    dependencies: {
      reconcileTournamentMatchProofs: async () => {
        calls += 1;
      },
      ensureBetMarkets: async () => {
        calls += 1;
      },
    },
  });

  assert.equal(calls, 0);
  assert.equal(report.financial.tournament.requested, false);
  assert.equal(report.financial.markets.requested, false);
});

test("single-upload compatibility can refresh tournaments without settling markets", async () => {
  const live = classifyReplayIngestReceipt(
    {
      replay_hash: "f".repeat(64),
      finality_status: "live",
      raw_replay_archived: false,
      parse_completed: true,
      should_settle: false,
    },
    true
  );
  let tournamentCalls = 0;
  let marketCalls = 0;

  const report = await coordinateReplayPostIngest({
    prisma: {},
    receipts: [live],
    source: "single_upload",
    reconcileTournamentForAcceptedUpload: true,
    dependencies: {
      reconcileTournamentMatchProofs: async () => {
        tournamentCalls += 1;
      },
      ensureBetMarkets: async () => {
        marketCalls += 1;
      },
    },
  });

  assert.equal(tournamentCalls, 1);
  assert.equal(marketCalls, 0);
  assert.equal(report.financial.tournament.succeeded, true);
  assert.equal(report.financial.markets.requested, false);
});

test("one reconciliation failure does not suppress the other stage", async () => {
  const trusted = classifyReplayIngestReceipt(
    {
      replay_hash: "1".repeat(64),
      finality_status: "trusted_final",
      final_accepted: true,
      should_settle: true,
    },
    true
  );
  let marketCalls = 0;

  const report = await coordinateReplayPostIngest({
    prisma: {},
    receipts: [trusted],
    source: "package_upload",
    dependencies: {
      reconcileTournamentMatchProofs: async () => {
        throw new Error("tournament unavailable");
      },
      ensureBetMarkets: async () => {
        marketCalls += 1;
      },
    },
  });

  assert.equal(report.financial.tournament.succeeded, false);
  assert.equal(report.financial.tournament.error, "tournament unavailable");
  assert.equal(marketCalls, 1);
  assert.equal(report.financial.markets.succeeded, true);
});

test("stage summaries expose a stable retry correlation key", () => {
  const left = classifyReplayIngestReceipt(
    {
      replay_hash: "2".repeat(64),
      finality_status: "final_recorded",
    },
    true
  );
  const right = classifyReplayIngestReceipt(
    {
      replay_hash: "3".repeat(64),
      finality_status: "final_recorded",
    },
    true
  );

  const forward = summarizeReplayIngestStages(
    [left, right],
    "package_upload"
  );
  const reversed = summarizeReplayIngestStages(
    [right, left],
    "package_upload"
  );

  assert.equal(forward.idempotencyKey, reversed.idempotencyKey);
});

test("automatic watcher evidence promotes an unresolved final before market reconciliation", async () => {
  const unresolved = classifyReplayIngestReceipt(
    {
      replay_hash: "4".repeat(64),
      game_id: 20432,
      finality_status: "final_recorded",
      effective_is_final: true,
      raw_replay_archived: true,
      parse_completed: true,
      should_settle: false,
    },
    true
  );
  const order: string[] = [];

  const report = await coordinateReplayPostIngest({
    prisma: {},
    receipts: [unresolved],
    source: "watcher",
    dependencies: {
      reconcileAutomaticWatcherTerminalResults: async (_prisma, gameStatsIds) => {
        order.push(`result:${gameStatsIds.join(",")}`);
        return {
          createdCount: 1,
          existingCount: 0,
          skippedCount: 0,
        };
      },
      ensureReplayIdentityProjections: async (_prisma, gameStatsIds) => {
        order.push(`identity:${gameStatsIds.join(",")}`);
        return {
          createdCount: 1,
          existingCount: 0,
          skippedCount: 0,
        };
      },
      reconcileTournamentMatchProofs: async () => {
        order.push("tournament");
      },
      ensureBetMarkets: async () => {
        order.push("markets");
      },
    },
  });

  assert.deepEqual(order, [
    "result:20432",
    "identity:20432",
    "tournament",
    "markets",
  ]);
  assert.equal(report.automatic.results.createdCount, 1);
  assert.equal(report.automatic.identities.createdCount, 1);
  assert.equal(report.result.readyCount, 1);
  assert.equal(report.result.reviewCount, 0);
  assert.equal(report.financial.markets.succeeded, true);
});
