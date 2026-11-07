import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("automatic market settlement cannot send pooled Satchel winnings or unmatched refunds to Keplr",()=>{
  const bets=read("lib/bets.ts");
  const start=bets.indexOf("const pooledOwnerIds = new Set<number>()");
  const end=bets.indexOf("let validationResult: SettlementRunResult",start);
  assert(start>0 && end>start);
  const guard=bets.slice(start,end);
  assert.match(guard,/marketId: market\.id/);
  assert.match(guard,/source: "auto", walletProvider: "satchel-vault"/);
  assert.match(guard,/pooledOwnerIds\.add\(wager\.userId\)/);
  assert.match(guard,/pooledCensusComplete = false/);
  assert.match(guard,/pooledWagers\.length <= 1000/);
  assert.match(guard,/!pooledOwnerIds\.has\(plan\.claimedByUserId \?\? -1\)/);
  assert.match(guard,/const autoClaimPlans = claimPlanList\.filter/);
  const run=bets.indexOf("executeWoloEscrowSettlementRun(",end);
  assert(run>end,"execution is after the custody guard");
});

test("admin claim retry cannot bypass pooled vault return routing",()=>{
 const admin=read("lib/adminWoloClaims.ts");
 const guard=read("lib/warSatchelClaimSettlementGuard.ts");
 assert.match(admin,/await assertNoUnroutedSatchelSettlementClaim\(prisma/);
 assert.match(guard,/ticket\.walletProvider === "satchel-vault"/);
 assert.match(guard,/SATCHEL_SETTLEMENT_RETURN_NOT_CERTIFIED/);
 // Mutable legacy wager status cannot hide the owner's pooled custody.
 assert.doesNotMatch(guard,/status: input\.claimKind === "bet_refund"/);
});
