import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertAdminRetryWinnerTruthGate,
  buildAdminMarketClaimRequestId,
  buildAdminMarketClaimSettlementRunId,
  buildAdminRetryEscrowFundingRequirements,
  type AdminRetryEscrowFundingWager,
  type AdminRetryWinnerTruthMarket,
} from "../lib/adminWoloClaims.ts";

function market(
  overrides: Partial<AdminRetryWinnerTruthMarket> = {}
): AdminRetryWinnerTruthMarket {
  return {
    id: 495852,
    title: "Emaren vs 276895603",
    eventLabel: "Watcher Final • Yucatan",
    leftLabel: "Emaren",
    rightLabel: "276895603",
    winnerSide: "right",
    linkedGameStatsId: 21166,
    linkedGameStats: {
      id: 21166,
      winner: "276895603",
      players: [
        {
          name: "Emaren",
          winner: false,
        },
        {
          name: "276895603",
          winner: true,
        },
      ],
    },
    wagers: [
      {
        userId: 18168,
        side: "right",
        payoutWolo: 108,
        status: "won",
      },
    ],
    ...overrides,
  };
}

function fundingWager(
  overrides: Partial<AdminRetryEscrowFundingWager> = {}
): AdminRetryEscrowFundingWager {
  return {
    id: 1,
    userId: 18168,
    status: "won",
    amountWolo: 100,
    payoutWolo: 108,
    executionMode: "onchain_escrow",
    stakeTxHash: "ABC123",
    stakeWalletAddress: "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz",
    stakeLeg: null,
    ...overrides,
  };
}

test(
  "bet payout retry follows the winning bettor entitlement, not the match winner name",
  () => {
    assert.doesNotThrow(() =>
      assertAdminRetryWinnerTruthGate({
        claim: {
          id: 8661,
          displayPlayerName: "Jim",
          normalizedPlayerName: "jim",
          claimKind: "bet_payout",
          amountWolo: 108,
        },
        matchedUserId: 18168,
        market: market(),
      })
    );
  }
);

test(
  "bet payout retry rejects a matched user without a stored winning wager",
  () => {
    assert.throws(
      () =>
        assertAdminRetryWinnerTruthGate({
          claim: {
            id: 8661,
            displayPlayerName: "Jim",
            normalizedPlayerName: "jim",
            claimKind: "bet_payout",
            amountWolo: 108,
          },
          matchedUserId: 63,
          market: market(),
        }),
      /ADMIN_RETRY_BETTOR_ENTITLEMENT_MISMATCH/
    );
  }
);

test(
  "bet payout retry rejects side and amount drift",
  () => {
    assert.throws(
      () =>
        assertAdminRetryWinnerTruthGate({
          claim: {
            id: 8661,
            displayPlayerName: "Jim",
            normalizedPlayerName: "jim",
            claimKind: "bet_payout",
            amountWolo: 108,
          },
          matchedUserId: 18168,
          market: market({
            wagers: [
              {
                userId: 18168,
                side: "left",
                payoutWolo: 108,
                status: "won",
              },
            ],
          }),
        }),
      /ADMIN_RETRY_BETTOR_ENTITLEMENT_MISMATCH/
    );

    assert.throws(
      () =>
        assertAdminRetryWinnerTruthGate({
          claim: {
            id: 8661,
            displayPlayerName: "Jim",
            normalizedPlayerName: "jim",
            claimKind: "bet_payout",
            amountWolo: 109,
          },
          matchedUserId: 18168,
          market: market(),
        }),
      /ADMIN_RETRY_BETTOR_ENTITLEMENT_MISMATCH/
    );
  }
);

test(
  "winner bounty retry still targets the actual winning player",
  () => {
    assert.doesNotThrow(() =>
      assertAdminRetryWinnerTruthGate({
        claim: {
          id: 9001,
          displayPlayerName: "276895603",
          normalizedPlayerName: "276895603",
          claimKind: "winner_bounty",
          amountWolo: 49,
        },
        matchedUserId: 999,
        market: market(),
      })
    );

    assert.throws(
      () =>
        assertAdminRetryWinnerTruthGate({
          claim: {
            id: 9002,
            displayPlayerName: "Jim",
            normalizedPlayerName: "jim",
            claimKind: "winner_bounty",
            amountWolo: 49,
          },
          matchedUserId: 18168,
          market: market(),
        }),
      /ADMIN_RETRY_WINNER_TRUTH_MISMATCH/
    );
  }
);

test(
  "escrow recovery uses a deterministic v2 idempotency namespace distinct from legacy payout retries",
  () => {
    const runId = buildAdminMarketClaimSettlementRunId(700393, 9375);
    const requestId = buildAdminMarketClaimRequestId({
      claimId: 9375,
      claimKind: "bet_payout",
      matchedUserId: 18168,
    });

    assert.equal(
      runId,
      "aoe2-market-claim-700393-9375-escrow-v2",
    );
    assert.equal(
      requestId,
      "aoe2-claim-9375-bet_payout-202727-escrow-v2",
    );

    assert.notEqual(runId, "aoe2-market-claim-700393-9375");
    assert.notEqual(
      requestId,
      "aoe2-claim-9375-bet_payout-962247",
    );
  },
);

test(
  "direct bet payout recovery derives exact current-chain escrow funding proof",
  () => {
    const plan = buildAdminRetryEscrowFundingRequirements({
      claimId: 9375,
      claimKind: "bet_payout",
      claimAmountWolo: 108,
      marketId: 495852,
      matchedUserId: 18168,
      wagers: [fundingWager()],
    });

    assert.equal(plan.mode, "all");
    assert.equal(plan.requirements.length, 1);
    assert.deepEqual(plan.requirements[0], {
      key: "wager:1",
      wagerIds: [1],
      txHash: "ABC123",
      fromAddress: "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz",
      expectedAmountWolo: 100,
      expectedMemo: "AoE2HDBets bet stake · market 495852",
    });
  },
);

test(
  "refund recovery enforces exact stored entitlement and durable funding proof",
  () => {
    const wager = fundingWager({
      status: "void",
      amountWolo: 100,
      payoutWolo: 100,
    });

    const plan = buildAdminRetryEscrowFundingRequirements({
      claimId: 9400,
      claimKind: "bet_refund",
      claimAmountWolo: 100,
      marketId: 495852,
      matchedUserId: 18168,
      wagers: [wager],
    });
    assert.equal(plan.mode, "all");
    assert.equal(plan.requirements.length, 1);

    assert.throws(
      () =>
        buildAdminRetryEscrowFundingRequirements({
          claimId: 9400,
          claimKind: "bet_refund",
          claimAmountWolo: 99,
          marketId: 495852,
          matchedUserId: 18168,
          wagers: [wager],
        }),
      /does not match stored bet_refund entitlement 100/,
    );
  },
);

test(
  "ticket-funded recovery dedupes shared chain transfer proof",
  () => {
    const ticket = {
      id: 77,
      version: 1,
      totalAmountWolo: 200,
      walletAddress: "wolo1ticketwallet",
      stakeTxHash: "TICKETTX",
    };
    const plan = buildAdminRetryEscrowFundingRequirements({
      claimId: 9500,
      claimKind: "bet_payout",
      claimAmountWolo: 108,
      marketId: 495852,
      matchedUserId: 18168,
      wagers: [
        fundingWager({
          id: 10,
          amountWolo: 50,
          payoutWolo: 50,
          stakeTxHash: null,
          stakeWalletAddress: null,
          stakeLeg: { ticket },
        }),
        fundingWager({
          id: 11,
          amountWolo: 58,
          payoutWolo: 58,
          stakeTxHash: null,
          stakeWalletAddress: null,
          stakeLeg: { ticket },
        }),
      ],
    });

    assert.equal(plan.mode, "all");
    assert.equal(plan.requirements.length, 1);
    assert.deepEqual(plan.requirements[0].wagerIds, [10, 11]);
    assert.equal(plan.requirements[0].txHash, "TICKETTX");
    assert.equal(plan.requirements[0].expectedAmountWolo, 200);
    assert.equal(
      plan.requirements[0].expectedMemo,
      "AoE2HDBets bet ticket v1 · ticket 77",
    );
  },
);

test(
  "legacy-shaped payout rows without durable funding proof fail closed",
  () => {
    assert.throws(
      () =>
        buildAdminRetryEscrowFundingRequirements({
          claimId: 9600,
          claimKind: "bet_payout",
          claimAmountWolo: 108,
          marketId: 495852,
          matchedUserId: 18168,
          wagers: [
            fundingWager({
              stakeTxHash: null,
              stakeWalletAddress: null,
            }),
          ],
        }),
      /has no durable escrow funding proof/,
    );
  },
);

test(
  "winner bounty recovery requires at least one durable source-market funding candidate",
  () => {
    const plan = buildAdminRetryEscrowFundingRequirements({
      claimId: 9700,
      claimKind: "winner_bounty",
      claimAmountWolo: 98,
      marketId: 495852,
      matchedUserId: 999,
      wagers: [
        fundingWager({
          id: 20,
          executionMode: "app_only",
          stakeTxHash: null,
          stakeWalletAddress: null,
        }),
        fundingWager({ id: 21 }),
      ],
    });
    assert.equal(plan.mode, "any");
    assert.equal(plan.requirements.length, 1);
    assert.equal(plan.requirements[0].key, "wager:21");

    assert.throws(
      () =>
        buildAdminRetryEscrowFundingRequirements({
          claimId: 9701,
          claimKind: "winner_bounty",
          claimAmountWolo: 98,
          marketId: 495852,
          matchedUserId: 999,
          wagers: [
            fundingWager({
              executionMode: "app_only",
              stakeTxHash: null,
              stakeWalletAddress: null,
            }),
          ],
        }),
      /has no durable escrow funding proof/,
    );
  },
);

test(
  "strict Admin current-chain verifier cannot fall back to environment-only stake acceptance",
  async () => {
    const source = await readFile(
      new URL("../lib/woloBetSettlement.ts", import.meta.url),
      "utf8",
    );
    const helperStart = source.indexOf(
      "export async function verifyCurrentWoloEscrowStakeTransfer"
    );
    const helperEnd = source.indexOf(
      "\n}\n\nexport async function listRecentEscrowDeposits",
      helperStart,
    );
    assert.ok(helperStart >= 0 && helperEnd > helperStart);

    const helper = source.slice(helperStart, helperEnd);
    assert.match(helper, /verifyStakeTransferViaSettlementService\(input\)/);
    assert.match(
      helper,
      /Current-chain escrow verification is unavailable\. Admin recovery fails closed/,
    );
    assert.doesNotMatch(helper, /onchainAllowed|onchainRequired/);
    assert.doesNotMatch(helper, /verifyStakeTransfer\(input\)/);
  },
);

test(
  "current-chain custody proof is ordered before grouped escrow execution",
  async () => {
    const source = await readFile(
      new URL("../lib/adminWoloClaims.ts", import.meta.url),
      "utf8",
    );
    const retryStart = source.indexOf("export async function retryPendingClaimSettlement");
    const custodyGate = source.indexOf(
      "await assertAdminRetryCurrentChainEscrowAuthority",
      retryStart,
    );
    const payoutExecution = source.indexOf(
      "await executeMarketClaimSettlementRun",
      retryStart,
    );
    assert.ok(retryStart >= 0);
    assert.ok(custodyGate > retryStart);
    assert.ok(payoutExecution > custodyGate);
    assert.match(
      source.slice(custodyGate - 1500, custodyGate + 500),
      /buildAdminRetryEscrowFundingRequirements/,
    );
  },
);

test(
  "grouped core market claim retries preserve escrow signer authority",
  async () => {
    const source = await readFile(
      new URL("../lib/adminWoloClaims.ts", import.meta.url),
      "utf8",
    );

    const helperStart = source.indexOf("async function executeMarketClaimSettlementRun");
    const helperEnd = source.indexOf("\n}\n\nexport async function findMatchedClaimUser", helperStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart);

    const helper = source.slice(helperStart, helperEnd);
    assert.match(helper, /validateWoloEscrowSettlementRun\(runInput\)/);
    assert.match(helper, /executeWoloEscrowSettlementRun\(runInput\)/);
    assert.match(helper, /validation\.signerRole !== "escrow"/);
    assert.match(
      helper,
      /validatedSignerAddress !== expectedEscrowAddress/,
    );
    assert.match(helper, /Escrow claim retry dry-run failed closed/);
    assert.doesNotMatch(helper, /executeWoloSettlementRun\(/);
  }
);
