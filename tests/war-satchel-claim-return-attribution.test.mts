import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectSingleTicketSatchelReturn,
  type SatchelReturnWager,
} from "../lib/warSatchelClaimReturnAttribution.ts";

const VAULT = "wolo1" + "v".repeat(38);
const TX = "AB".repeat(32);
const baseTicket = {
  id: 271, userId: 19, source: "auto",
  walletProvider: "satchel-vault", walletAddress: VAULT,
  status: "recorded", stakeTxHash: TX,
  clientRequestId: "satchel:ticket:91",
};
const paid: SatchelReturnWager = {
  id: 12, status: "won", amountWolo: 20, payoutWolo: 31,
  stakeLeg: { id: 101, marketId: 5, amountWolo: 20, ticket: baseTicket },
};
const refund: SatchelReturnWager = {
  ...paid, status: "void", payoutWolo: 20,
};
const claim = {
  ownerUserId: 19,
  claimKind: "bet_payout" as const,
  claimAmountWolo: 31,
  marketId: 5,
  vaultAddress: VAULT,
  wagers: [paid],
};
test("winning return binds exactly one funded ticket, operation and transfer", () => {
  const result = inspectSingleTicketSatchelReturn(claim);
  assert.equal(result.ticketId, 271);
  assert.equal(result.operationId, "satchel:ticket:91");
  assert.equal(result.fundingTxHash, TX);
  assert.equal(result.marketId, 5);
  assert.equal(result.amountUwolo, BigInt(31_000_000));
  assert.equal(result.principalUwolo, BigInt(20_000_000));
  assert(Object.isFrozen(result));
});
test("one unmatched leg gets 100% of its original stake, not 98%", () => {
  const result = inspectSingleTicketSatchelReturn({
    ...claim, claimKind: "bet_refund", claimAmountWolo: 20, wagers: [refund],
  });
  assert.equal(result.amountUwolo, result.principalUwolo);
  assert.throws(() => inspectSingleTicketSatchelReturn({
    ...claim, claimKind: "bet_refund", claimAmountWolo: 19,
    wagers: [{...refund, payoutWolo: 19}],
  }), /unmatched_principal_not_fully_refunded/);
});
test("aggregated claims spanning two physical stake tickets stay held for partition review", () => {
  const other: SatchelReturnWager = {
    ...paid, id: 13, payoutWolo: 19,
    stakeLeg: {id: 102, marketId: 5, amountWolo: 20,
      ticket: {...baseTicket, id: 272, clientRequestId: "satchel:ticket:92",
        stakeTxHash: "BC".repeat(32)}},
  };
  assert.throws(() => inspectSingleTicketSatchelReturn({
    ...claim, claimAmountWolo: 50, wagers: [paid, other],
  }), /multi_ticket_or_conflicting_funding_requires_claim_partition/);
});
test("a manual Keplr wager or a different Steam owner cannot be credited as Satchel money", () => {
  for (const ticket of [
    {...baseTicket, source: "manual", walletProvider: "keplr"},
    {...baseTicket, userId: 20},
    {...baseTicket, walletAddress: "wolo1" + "q".repeat(38)},
    {...baseTicket, status: "awaiting_signature"},
    {...baseTicket, clientRequestId: "arbitrary-request"},
    {...baseTicket, stakeTxHash: null},
  ]) {
    assert.throws(() => inspectSingleTicketSatchelReturn({
      ...claim, wagers: [{...paid, stakeLeg: {...paid.stakeLeg!, ticket}}],
    }), /unverified_wager_leg_owner_or_original_funding/);
  }
});
test("claim must bind exact market leg, original principal, and paid entitlement", () => {
  const broken: SatchelReturnWager[] = [
    {...paid, stakeLeg: {...paid.stakeLeg!, marketId: 6}},
    {...paid, stakeLeg: {...paid.stakeLeg!, amountWolo: 19}},
    {...paid, status: "lost"},
    {...paid, payoutWolo: -1},
    {...paid, stakeLeg: null},
  ];
  for (const wager of broken) {
    assert.throws(() => inspectSingleTicketSatchelReturn({
      ...claim, wagers: [wager],
    }), /unverified_wager_leg_owner_or_original_funding/);
  }
  assert.throws(() => inspectSingleTicketSatchelReturn({
    ...claim, claimAmountWolo: 32,
  }), /claim_not_exact_owner_entitlement/);
  assert.throws(() => inspectSingleTicketSatchelReturn({
    ...claim, wagers: Array.from({length: 1001}, () => paid),
  }), /invalid_owner_claim_or_bounded_census/);
});
test("one claim cannot double-count a ticket's market leg", () => {
  assert.throws(() => inspectSingleTicketSatchelReturn({
    ...claim, claimAmountWolo: 62,
    wagers: [paid, {...paid, id: 20}],
  }), /unverified_wager_leg_owner_or_original_funding/);
});
