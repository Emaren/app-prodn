import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifySatchelSignedV2Return } from "../lib/warSatchelSignedV2Return.ts";

// Public test-only fixture from WoloChain PR #29 at 04912e1b. These are
// deterministic demo keys, never operator-trust material or mainnet authority.
const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/satchel-financial-bridge-v1.json", import.meta.url), "utf8",
));
const allocation = fixture.allocation;
const entitlement = allocation.legs[0].entitlements[0];
const expected = {
  ownerId: allocation.owner_id,
  operationId: allocation.operation_id,
  ticketId: allocation.ticket_id,
  fundingTxHash: allocation.funding_tx_hash,
  claimId: entitlement.claim_id,
  marketId: allocation.legs[0].market_id,
  legId: allocation.legs[0].leg_id,
  entitlementId: entitlement.entitlement_id,
  claimKind: entitlement.claim_kind,
  amountUwolo: entitlement.amount_uwolo,
  fundedAmountUwolo: allocation.legs[0].stake_uwolo,
  escrowAddress: fixture.betting_escrow,
  vaultAddress: fixture.vault,
} as const;

function verify(approval: unknown = fixture.return_approval,
                overrides: Partial<import('../lib/warSatchelSignedV2Return.ts').ExpectedSignedReturn> = {},
                independentOperatorPublicKeyHex = fixture.approval_public_key_hex) {
  return verifySatchelSignedV2Return({
    approval, independentOperatorPublicKeyHex, expected: {...expected, ...overrides},
  });
}
type MutableFixture = {
  allocation: { signature:string; issued_at:number; expires_at:number;
    funds_available_uwolo:string;
    legs:Array<{entitlements:Array<{amount_uwolo:string;principal_uwolo:string}>}> };
  signature:string; amount_uwolo:string; allocation_digest:string;
  [key:string]:unknown;
};
function altered(change: (r: MutableFixture) => void) {
  const approval = structuredClone(fixture.return_approval) as MutableFixture;
  change(approval);
  return approval;
}

test("HD verifies real Wolo Ed25519 allocation + return signatures independently", () => {
  const proof = verify();
  assert.equal(proof.nonCrediting, true);
  assert.equal(proof.claimId, "101");
  assert.equal(proof.amountUwolo, 1000000n);
  assert.equal(proof.allocationDigest, fixture.allocation_digest);
  assert(Object.isFrozen(proof));
  assert.equal(JSON.stringify([
    "aoe2war/satchel/claim-return-approval/v2", "wolo-1", "uwolo",
    fixture.betting_escrow, fixture.vault, 2,
    expected.operationId, expected.claimId, expected.ownerId,
    expected.ticketId, expected.marketId, expected.legId,
    expected.entitlementId, expected.claimKind, expected.amountUwolo,
    fixture.allocation_digest,
    fixture.return_approval.issued_at, fixture.return_approval.expires_at,
  ]), fixture.return_approval_sign_bytes);
});
test("a fake operator key or a modified allocation signature fails", () => {
  assert.throws(() => verify(undefined, {}, "f".repeat(64)), /invalid_review_signature/);
  assert.throws(() => verify(altered(x => {x.allocation.signature = "A".repeat(86)+"==";})),
    /noncanonical_signature|invalid_review_signature/);
});
test("wrong original HD owner, funding hash, market and ticket cannot reuse proof", () => {
  assert.throws(() => verify(undefined, {ownerId:"other"}), /wrong_owner_or_original_funding/);
  assert.throws(() => verify(undefined, {fundingTxHash:"A".repeat(64)}), /wrong_owner_or_original_funding/);
  assert.throws(() => verify(undefined, {marketId:"999"}), /not_exact_funded_ticket_allocation/);
  assert.throws(() => verify(undefined, {ticketId:"2"}), /wrong_owner_or_original_funding/);
});
test("unmatched refund haircut, extra principal and duplicate entitlement are blocked", () => {
  assert.throws(() => verify(altered(x => {
    x.allocation.legs[0].entitlements[0].amount_uwolo = "980000";
  })), /unmatched_principal_not_fully_refunded/);
  assert.throws(() => verify(altered(x => {
    x.allocation.legs[0].entitlements[0].principal_uwolo = "2000000";
    x.allocation.legs[0].entitlements[0].amount_uwolo = "2000000";
  })), /principal_exceeds_stake/);
  assert.throws(() => verify(altered(x => {
    x.allocation.legs[0].entitlements.push(
      structuredClone(x.allocation.legs[0].entitlements[0]));
  })), /duplicate_or_unsorted_entitlement/);
});
test("forged approval and altered economic budget cannot steal a claim", () => {
  assert.throws(() => verify(altered(x => {x.amount_uwolo="900000";})),
    /approval_does_not_match_claim/);
  assert.throws(() => verify(altered(x => {x.signature="A".repeat(86)+"==";})),
    /noncanonical_signature|invalid_review_signature/);
  assert.throws(() => verify(altered(x => {x.allocation.funds_available_uwolo="999";})),
    /invalid_reviewed_budget/);
  assert.throws(() => verify(altered(x => {x.allocation_digest="0".repeat(64);})),
    /allocation_digest_mismatch/);
});
test("structural alias, extra field and expired interval inversion reject", () => {
  assert.throws(() => verify(altered(x => {x["ownerId"]=x.owner_id;})),
    /unknown_or_missing_field/);
  assert.throws(() => verify(altered(x => {
    x.allocation.expires_at=x.allocation.issued_at;
  })), /invalid_signature_interval/);
});


test("signed plan cannot rename a unique market, duplicate a claim, or include founder 889", () => {
  assert.throws(() => verify(altered(x => {
    x.allocation.legs.push(structuredClone(x.allocation.legs[0]));
  })), /duplicate_or_unsorted_leg/);
  assert.throws(() => verify(altered(x => {
    x.allocation.legs[0].entitlements[0].claim_id = "889";
  })), /duplicate_or_unsorted_entitlement/);
});
test("Go v2 signatures must expire within the reviewed 300-second window", () => {
  assert.throws(() => verify(altered(x => {
    x.allocation.expires_at = x.allocation.issued_at + 301;
  })), /invalid_signature_interval/);
});
