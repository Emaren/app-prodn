import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertAdminRetryWinnerTruthGate,
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
