import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fundedMechaEligibleQuery,FUNDED_MECHA_CANDIDATE_MAX_AGE_MS,
  FUNDED_MECHA_CANDIDATE_LIMIT } from "../lib/warSatchelEligibleOutbox.ts";

function stages(q: ReturnType<typeof fundedMechaEligibleQuery>){
  return q.where.AND[0].OR;
}
test("original reserved wager WITHOUT independent review is eligible for a 8095 pickup",()=>{
  const q=fundedMechaEligibleQuery({now:new Date("2026-10-19T20:00:00.000Z")});
  const held=stages(q).find(x=>x.status==="funded_reserved");
  assert.ok(held);
  assert.deepEqual(held.satchelFundedReservation,{
    is:{status:"reserved",wagerAuthorization:{isNot:null}},
  });
  assert.equal(held.attemptCount,1);
  assert.deepEqual(held.reservationId,{not:null});
  assert.equal("approval" in held.satchelFundedReservation.is.wagerAuthorization,false);
});
test("only original unattempted shadow and once-reserved states can enter queue",()=>{
  const q=fundedMechaEligibleQuery();
  assert.equal(q.where.ticketId,null);
  const options=stages(q);
  assert.equal(options.length,2);
  assert.deepEqual(options.find(x=>x.status==="shadow_ready"),{
    status:"shadow_ready",reservationId:null,attemptCount:0,
  });
  assert.equal(options.some(x=>x.status==="funded_submitting"||x.status==="unknown_hold"||
    x.status==="funded_accepted"),false);
  const file=readFileSync(new URL("../lib/warSatchelAutoBetExecutor.ts",import.meta.url),"utf8");
  assert.match(file,/execution\.status==="funded_reserved" && execution\.reservationId && execution\.attemptCount===1/);
  assert.match(file,/requestCertifiedIndependentSatchelReview\(prisma/);
  assert.match(file,/if\(!reviewed\.review\)return \{kind:"waiting_for_review"/);
});
test("review pickup remains bounded by canonical current live verified game and 4 minute freshness",()=>{
  const now=new Date("2026-10-19T20:00:00.000Z");
  const q=fundedMechaEligibleQuery({now});
  assert.equal(FUNDED_MECHA_CANDIDATE_LIMIT,25);
  assert.equal(FUNDED_MECHA_CANDIDATE_MAX_AGE_MS,240000);
  assert.equal(q.take,25);
  assert.deepEqual(q.where.createdAt,{
    gte:new Date(now.getTime()-240000),lte:now,
  });
  assert.deepEqual(q.where.winnerMarket,{
    status:"live",integrityStatus:"verified",marketType:"winner",
    bookPhase:"funded",
  });
  assert.deepEqual(q.orderBy,[{createdAt:"asc"},{id:"asc"}]);
});
test("review polling cannot bypass Keplr consent or positive reserved financial principal",()=>{
  const q=fundedMechaEligibleQuery();
  assert.equal(q.where.preset.enabled,true);
  assert.equal(q.where.preset.selfOnly,true);
  assert.deepEqual(q.where.preset.satchelAutoSpendConsents.some.revokedAt,null);
  assert.deepEqual(q.where.preset.user.satchelFundedBalance.is.OR,[
    {availableUwolo:{gt:BigInt(0)}},{reservedUwolo:{gt:BigInt(0)}},
  ]);
});
