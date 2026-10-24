/** Fail-closed funded/original LIVE identity regressions. No production DB, wallet or signer. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fundedMechaEligibleQuery } from "../lib/warSatchelEligibleOutbox.ts";
import { retryPendingClaimSettlement } from "../lib/adminWoloClaims.ts";

const source=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("funded scheduler excludes original nonfunded LIVE preview books",()=>{
  const q=fundedMechaEligibleQuery({now:new Date("2026-10-24T12:00:00.000Z")});
  assert.deepEqual(q.where.winnerMarket.bookPhase,{not:"preview_only"});
  assert.equal(q.where.winnerMarket.status,"live");
  assert.equal(q.where.winnerMarket.integrityStatus,"verified");
});

test("under-lock reservation and last prebroadcast fence inspect both LIVE book origins",()=>{
  const ledger=source("lib/warSatchelFundedLedger.ts");
  const reserve=ledger.slice(ledger.indexOf("export async function reserveForWatcherExecution"),ledger.indexOf("export async function releaseUnbroadcastSatchelReservation"));
  const attempt=ledger.slice(ledger.indexOf("export async function markSatchelSubmissionAttempt"),ledger.indexOf("export async function commitVerifiedSatchelAutoTicket"));
  for(const [name,section] of [["reserve",reserve],["prebroadcast",attempt]] as const){
    assert.ok(section.length>500,name+" function boundaries changed; inspect this test");
    assert.match(section,/bookPhase:\s*true/,name+" must read persisted book phase");
    assert.match(section,/market\.bookPhase === "preview_only"/,name+" must refuse display-only winner");
    assert.match(section,/desync\.bookPhase === "preview_only"/,name+" must refuse display-only desync");
    assert.match(section,/satchelWatcherSpendWindowIssue/,name+" must still enforce fresh Watcher identity");
  }
  assert.match(reserve,/withExclusiveSatchelTx\(prisma/);
  assert.match(attempt,/withExclusiveSatchelTx\(prisma/);
});

type Origin={marketId:number|null;founderId:number|null;kind:string;direct?:{id:number;bookPhase:string}|null;
  founder?:{marketId:number;market:{bookPhase:string}}|null};
async function rejectBeforeEffects(input:Origin,expected:string){
  const calls:string[]=[];
  const row={
    id:91837,status:"pending",claimKind:input.kind,sourceMarketId:input.marketId,
    sourceFounderBonusId:input.founderId,payoutAttemptedAt:null,payoutTxHash:null,
    createdAt:new Date("2026-09-01T12:00:00Z"),
  };
  const db={
    pendingWoloClaim:{
      findUnique:async()=>{calls.push("read:claim");return row;},
      update:async()=>{throw Error("FINANCIAL_DB_MUTATION_FORBIDDEN");},
    },
    betMarket:{findUnique:async()=>{calls.push("read:market");return input.direct ?? null;}},
    betMarketFounderBonus:{findUnique:async()=>{calls.push("read:founder");return input.founder ?? null;}},
    user:{findMany:async()=>{throw Error("WALLET_LOOKUP_AFTER_ORIGIN_REFUSAL");}},
    $executeRaw:async()=>{throw Error("SIGNING_ATTEMPT_FORBIDDEN");},
  };
  const old=globalThis.fetch;
  let network=0;
  globalThis.fetch=(async()=>{network++;throw Error("NETWORK_FORBIDDEN");}) as typeof fetch;
  try{
    const result=await retryPendingClaimSettlement(db as never,row.id);
    assert.equal(result.outcome,"skipped");
    assert.equal(result.outcome==="skipped"?result.reason:null,expected);
    assert.equal(network,0,"no payment/RPC/network access permitted");
    assert.ok(calls.every(v=>v.startsWith("read:")),"no DB mutations permitted");
  }finally{globalThis.fetch=old;}
}

test("six market-origin economic claims with BOTH historical SetNull origins never reach signer",async()=>{
  for(const kind of ["bet_refund","bet_payout","winner_bounty","founders_bonus","founders_win","bet_corrective_refund"]){
    await rejectBeforeEffects({kind,marketId:null,founderId:null},"source_attribution_conflict");
  }
});

test("direct and Founder preview origins refuse before legacy cleanup, wallet resolution, payout",async()=>{
  await rejectBeforeEffects({kind:"bet_payout",marketId:81,founderId:null,
    direct:{id:81,bookPhase:"preview_only"}},"preview_only_market");
  await rejectBeforeEffects({kind:"founders_bonus",marketId:null,founderId:77,
    founder:{marketId:81,market:{bookPhase:"preview_only"}}},"preview_only_market");
  await rejectBeforeEffects({kind:"founders_bonus",marketId:81,founderId:77,
    direct:{id:81,bookPhase:"legacy"},
    founder:{marketId:81,market:{bookPhase:"preview_only"}}},"preview_only_market");
});

test("missing, inconsistent or contradictory origins cannot fall back to generic payout",async()=>{
  await rejectBeforeEffects({kind:"bet_refund",marketId:81,founderId:null,direct:null},"source_attribution_conflict");
  await rejectBeforeEffects({kind:"founders_bonus",marketId:null,founderId:77,founder:null},"source_attribution_conflict");
  await rejectBeforeEffects({kind:"founders_bonus",marketId:81,founderId:77,
    direct:{id:81,bookPhase:"legacy"},founder:{marketId:82,market:{bookPhase:"legacy"}}},"source_attribution_conflict");
});
