import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/index.js";
import { assertNoUnroutedSatchelSettlementClaim } from "../lib/warSatchelClaimSettlementGuard.ts";

function mock(tickets: Array<{
  source: string;
  walletProvider: string | null;
}>): PrismaClient {
  return {
    betWager: {
      async findMany() {
        return tickets.map((ticket,i) => ({
          id:i+1,
          stakeLeg:{ticket:{
            source:ticket.source,walletProvider:ticket.walletProvider,
            walletAddress:"wolo1"+"p".repeat(38),
          }},
        }));
      },
    },
  } as unknown as PrismaClient;
}
const claim={claimId:114,claimKind:"bet_refund",marketId:31,ownerUserId:71};

test("an unmatched auto bet from pooled Satchel vault cannot be paid through legacy Keplr route",async()=>{
  await assert.rejects(
    assertNoUnroutedSatchelSettlementClaim(mock([{source:"auto",walletProvider:"satchel-vault"}]),claim),
    /SATCHEL_SETTLEMENT_RETURN_NOT_CERTIFIED/,
  );
});
test("a matched winning bet from pooled Satchel vault also requires owner ledger reconciliation",async()=>{
  await assert.rejects(
    assertNoUnroutedSatchelSettlementClaim(
      mock([{source:"auto",walletProvider:"satchel-vault"}]),
      {...claim,claimKind:"bet_payout"},
    ),
    /SATCHEL_SETTLEMENT_RETURN_NOT_CERTIFIED/,
  );
});
test("ordinary manual Keplr bets keep using the existing claim settlement rail",async()=>{
  await assert.doesNotReject(assertNoUnroutedSatchelSettlementClaim(
    mock([{source:"manual",walletProvider:"keplr"}]),claim,
  ));
});
test("one pooled wager in a group makes the entire legacy claim unsafe",async()=>{
  await assert.rejects(assertNoUnroutedSatchelSettlementClaim(
    mock([{source:"manual",walletProvider:"keplr"},{source:"auto",walletProvider:"satchel-vault"}]),
    claim,
  ),/SATCHEL_SETTLEMENT_RETURN_NOT_CERTIFIED/);
});
test("non-wager founder and unrelated claims are unaffected",async()=>{
  const failOnRead={betWager:{async findMany(){throw Error("SHOULD_NOT_READ");}}} as unknown as PrismaClient;
  await assert.doesNotReject(assertNoUnroutedSatchelSettlementClaim(
    failOnRead,{...claim,claimKind:"founders_bonus"},
  ));
});
test("a truncated wager census cannot authorize pooled settlement",async()=>{
  const overflow=mock(Array.from({length:1001},()=>({source:"manual",walletProvider:"keplr"})));
  await assert.rejects(assertNoUnroutedSatchelSettlementClaim(overflow,claim),/OWNER_CENSUS_OVERFLOW/);
});
