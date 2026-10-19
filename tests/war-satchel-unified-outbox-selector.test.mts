import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FUNDED_MECHA_CANDIDATE_LIMIT,
  FUNDED_MECHA_CANDIDATE_MAX_AGE_MS,
  fundedMechaEligibleQuery,
  readEligibleFundedMechaIds,
} from "../lib/warSatchelEligibleOutbox.ts";

test("CLI and scheduled tick share a precise four-minute and deferred-candidate query",()=>{
  assert.equal(FUNDED_MECHA_CANDIDATE_LIMIT,25);
  assert.equal(FUNDED_MECHA_CANDIDATE_MAX_AGE_MS,240000);
  const now=new Date("2026-10-18T22:00:00.000Z");
  const query=fundedMechaEligibleQuery({limit:7,now});
  assert.equal(query.take,7);
  assert.deepEqual(query.orderBy,[{createdAt:"asc"},{id:"asc"}]);
  assert.deepEqual(query.select,{id:true});
  assert.equal(query.where.ticketId,null);
  assert.deepEqual(query.where.createdAt,{
    gte:new Date("2026-10-18T21:56:00.000Z"),lte:now,
  });
  assert.deepEqual(query.where.OR,[
    {nextAttemptAt:null},{nextAttemptAt:{lte:now}},
  ]);
  assert.deepEqual(query.where.preset,{
    enabled:true,selfOnly:true,
    OR:[{untilOut:true},{gamesRemaining:{gt:0}}],
    user:{walletAddress:{not:null}},
  });
  assert.deepEqual(query.where.AND,[{OR:[
    {status:"shadow_ready",reservationId:null,attemptCount:0},
    {status:"funded_reserved",reservationId:{not:null},attemptCount:1,
      satchelFundedReservation:{is:{status:"reserved",
        wagerAuthorization:{is:{approval:{isNot:null}}}}},
    },
  ]}]);
});

test("invalid operator batch bounds and invalid times fail before database queries",()=>{
  for(const limit of [0,-1,1.5,26,NaN,Infinity]){
    assert.throws(()=>fundedMechaEligibleQuery({limit}),/SATCHEL_OUTBOX_TICK_INVALID_BOUND/);
  }
  for(const now of [new Date("invalid"),new Date(NaN)]){
    assert.throws(()=>fundedMechaEligibleQuery({now}),/SATCHEL_OUTBOX_TICK_INVALID_BOUND/);
  }
  assert.equal(fundedMechaEligibleQuery().take,25);
});

test("even direct selector calls are blocked before financial database access under immutable HOLD",async()=>{
  let queries=0;
  const db={betAutoExecution:{findMany:async()=>{
    queries++;throw Error("financial query was executed while HOLD active");
  }}};
  await assert.rejects(readEligibleFundedMechaIds(db as never),
    /SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD/);
  assert.equal(queries,0);
});
