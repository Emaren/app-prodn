import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { collectCursorPages } from "../lib/collectCursorPages.ts";
import { deriveMainnetStakingPositionsFromTransfers } from "../lib/mainnetStakingDerivation.ts";
import {
  cappedRewardWeightForWindow,
  cappedRewardPrincipalWolo,
  forgeEligiblePrincipalWolo,
  KINGDOM_STAKE_REWARD_CAP_WOLO,
} from "../lib/stakingRewardCap.ts";
import {
  normalizeRoundChamberChoice,
  normalizeRoundChamberPublicId,
  normalizeRoundChamberTitle,
  ROUND_CHAMBER_GOVERNANCE_MODE,
} from "../lib/roundChamber.ts";
import {
  ORACLE_MARK_ALLOWANCE,
  oracleNextAllocatedMarks,
  oraclePoolProbabilityBps,
} from "../lib/oracle.ts";

const stakingWallet = "wolo1staking000000000000000000000000000000000";

test("the first million earns while excess principal becomes Forge capacity", () => {
  assert.equal(KINGDOM_STAKE_REWARD_CAP_WOLO, 1_000_000);
  assert.equal(cappedRewardPrincipalWolo(500_000), 500_000);
  assert.equal(forgeEligiblePrincipalWolo(500_000), 0);
  assert.equal(cappedRewardPrincipalWolo(5_000_000), 1_000_000);
  assert.equal(forgeEligiblePrincipalWolo(5_000_000), 4_000_000);
  assert.equal(cappedRewardWeightForWindow(5_000_000, 86_400), BigInt(86_400_000_000));
});

test("reward weight caps once per linked identity across wallet deposits", () => {
  const positions = deriveMainnetStakingPositionsFromTransfers(
    [
      {
        txHash: "WALLET-A",
        timestamp: "2026-08-01T00:00:00.000Z",
        senderAddress: "wolo1citizena0000000000000000000000000000000",
        recipientAddress: stakingWallet,
        amountWolo: 800_000,
        senderUserId: 42,
        senderLabel: "One Citizen",
      },
      {
        txHash: "WALLET-B",
        timestamp: "2026-08-01T01:00:00.000Z",
        senderAddress: "wolo1citizenb0000000000000000000000000000000",
        recipientAddress: stakingWallet,
        amountWolo: 800_000,
        senderUserId: 42,
        senderLabel: "One Citizen",
      },
    ],
    {
      stakingWalletAddress: stakingWallet,
      mainnetStartAt: "2026-08-01T00:00:00.000Z",
      weightStartAt: "2026-08-01T00:00:00.000Z",
      asOf: "2026-08-01T02:00:00.000Z",
      rewardWeightCapWolo: KINGDOM_STAKE_REWARD_CAP_WOLO,
    },
  );

  assert.equal(positions.length, 1);
  assert.equal(positions[0].userId, 42);
  assert.equal(positions[0].currentStakedWolo, 1_600_000);
  assert.equal(positions[0].stakingWeight, "6480000000");
  assert.deepEqual(positions[0].txHashes, ["WALLET-A", "WALLET-B"]);
});

test("staking ledger pagination consumes later rows instead of truncating at page one", async () => {
  const sourceRows = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));
  const rows = await collectCursorPages(5, async (cursorId) =>
    sourceRows.filter((row) => row.id > (cursorId ?? 0)).slice(0, 5),
  );
  assert.deepEqual(rows.map((row) => row.id), sourceRows.map((row) => row.id));
  await assert.rejects(
    collectCursorPages(
      2,
      async (cursorId) =>
        sourceRows.filter((row) => row.id > (cursorId ?? 0)).slice(0, 2),
      3,
    ),
    /reconciliation fence/,
  );
});

test("Round Chamber input keeps one-account civic ballots bounded", () => {
  assert.equal(ROUND_CHAMBER_GOVERNANCE_MODE, "app_civic_one_account_one_ballot");
  assert.equal(normalizeRoundChamberChoice("support"), "support");
  assert.equal(normalizeRoundChamberChoice("abstain"), null);
  assert.equal(
    normalizeRoundChamberPublicId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(normalizeRoundChamberPublicId("not-a-seal"), null);
  assert.equal(normalizeRoundChamberTitle("  Build   the realm  "), "Build the realm");
});

test("Oracle probability and the global Mark allowance remain deterministic", () => {
  assert.equal(ORACLE_MARK_ALLOWANCE, 1_000);
  assert.equal(oraclePoolProbabilityBps(6_400, 3_600), 6_400);
  assert.equal(oraclePoolProbabilityBps(0, 0), 5_000);
  assert.equal(
    oracleNextAllocatedMarks({
      currentAllocated: 1_000,
      previousMarketAmount: 400,
      requestedAmount: 250,
    }),
    850,
  );
  assert.equal(
    oracleNextAllocatedMarks({
      currentAllocated: 750,
      previousMarketAmount: 0,
      requestedAmount: 250,
    }),
    1_000,
  );
});

test("the civic migration creates independent ledgers and immutable chronicles", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260808170000_add_kingdom_civic_surfaces/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const table of [
    "round_proposals",
    "round_votes",
    "round_comments",
    "round_events",
    "forge_projects",
    "forge_milestones",
    "forge_commitments",
    "forge_deed_holdings",
    "forge_events",
    "oracle_markets",
    "oracle_paper_positions",
    "oracle_market_proposals",
    "oracle_events",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }

  assert.match(migration, /"total_deeds" = 10000/);
  assert.match(migration, /"patron_deeds" = 7000/);
  assert.match(migration, /"builder_deeds" = 2000/);
  assert.match(migration, /"kingdom_deeds" = 1000/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "round_events"/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "forge_events"/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "oracle_events"/);
  assert.match(migration, /BEFORE TRUNCATE ON "round_events"/);
  assert.match(migration, /BEFORE TRUNCATE ON "forge_events"/);
  assert.match(migration, /BEFORE TRUNCATE ON "oracle_events"/);
  assert.match(migration, /enforce_forge_deed_class_supply/);
  assert.match(migration, /"status" <> 'funded' OR "settlement_mode" = 'chain_verified'/);
  assert.doesNotMatch(migration, /ALTER TABLE "bet_markets"/);
  assert.doesNotMatch(migration, /provider_key|api_key|password|database_url/i);
});

test("all three prestige surfaces and mutation APIs are discoverable", () => {
  const shell = readFileSync(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  const header = readFileSync(
    new URL("../components/HeaderMenu.tsx", import.meta.url),
    "utf8",
  );
  const staking = readFileSync(new URL("../lib/staking.ts", import.meta.url), "utf8");
  const mainnetPositions = readFileSync(
    new URL("../lib/mainnetStakingPositions.ts", import.meta.url),
    "utf8",
  );
  const forgeRoute = readFileSync(
    new URL("../app/api/kingdom-forge/route.ts", import.meta.url),
    "utf8",
  );

  for (const route of ["/round-chamber", "/kingdom-forge", "/oracle"]) {
    assert.match(shell, new RegExp(route.replace("/", "\\/")));
    assert.match(header, new RegExp(route.replace("/", "\\/")));
  }

  assert.match(staking, /rewardWeightCapWolo:\s*KINGDOM_STAKE_REWARD_CAP_WOLO/);
  assert.match(staking, /linked_identity_cap_v1/);
  assert.match(staking, /maximumIdentityWeight/);
  assert.match(mainnetPositions, /collectCursorPages/);
  assert.match(mainnetPositions, /requireCompleteLedger/);
  assert.match(forgeRoute, /FORGE_FUNDED_COMMITMENT_IMMUTABLE/);
  assert.match(forgeRoute, /settlementMode !== "app_signal"/);

  for (const file of [
    "../app/api/round-chamber/route.ts",
    "../app/api/kingdom-forge/route.ts",
    "../app/api/oracle/route.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /export async function GET/);
    assert.match(source, /export async function POST/);
  }
});
