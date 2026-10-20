import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {pollVerifiedWatcherFundedMecha} from "../lib/warSatchelFundedWatcherPoll.ts";
const src=readFileSync(new URL("../lib/warSatchelFundedWatcherPoll.ts",import.meta.url),"utf8");
test("legacy Watcher poll delegates to the same canonical bounded financial selector as the protected tick",()=>{
 assert.match(src,/readEligibleFundedMechaIds\\(prisma,\\{limit:maxBatch\\}\\)/);
 assert.match(src,/MAX_BATCH=FUNDED_MECHA_CANDIDATE_LIMIT/);
 assert.match(src,/executeFundedMechaTicketBatch\\(prisma,signer,ids\\)/);
 assert.doesNotMatch(src,/betAutoExecution\\.findMany\\(/);
 assert.doesNotMatch(src,/prepareBetStakeTicket\\(|getWoloBetEscrowRuntime\\(|sendTokens\\(/);
 const selector=readFileSync(new URL("../lib/warSatchelEligibleOutbox.ts",import.meta.url),"utf8");
 for(const pattern of [
   /createdAt: \\{ gte: earliest, lte: now \\}/,
   /winnerMarket: \\{ status: "live", integrityStatus: "verified"/,
   /wagerAuthorization: \\{ isNot: null \\}/,
   /spendExpiresAt: \\{ gt: now \\}/,
   /satchelFundedBalance: \\{ is: \\{ OR:/,
 ]) assert.match(selector,pattern);
});
test("poll hard-fails if real signer, refund or withdrawals have not been certified",()=>{
 for(const key of [
  "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED",
  "WAR_SATCHEL_FUNDED_LEDGER_ENABLED",
  "WAR_SATCHEL_AUTO_CONSENT_ENABLED",
  "WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED",
  "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
  "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED",
  "WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
 ]){
  assert(src.includes(key),key);
 }
 assert.match(src,/maxBatch>MAX_BATCH/);
 assert.match(src,/FUNDED_MECHA_CANDIDATE_LIMIT/);
 assert.doesNotMatch(src,/export async function (GET|POST|PUT|DELETE)/);
});

test("source-level financial HOLD prevents even Watcher funded-queue reads with every mutable flag enabled",async()=>{
 const keys=[
 "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED","WAR_SATCHEL_FUNDED_LEDGER_ENABLED",
 "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED","WAR_SATCHEL_AUTO_CONSENT_ENABLED",
 "WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED","WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
 "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED","WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
 ];
 const originals=keys.map(k=>process.env[k]);
 let reads=0;
 const db={betAutoExecution:{findMany:async()=>{reads++;throw Error("should never access funded queue");}}};
 try{
  keys.forEach(k=>process.env[k]="true");
  await assert.rejects(
   pollVerifiedWatcherFundedMecha(db as never,{} as never,{maxBatch:1}),
   /SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD/
  );
  assert.equal(reads,0);
 }finally{
  keys.forEach((k,i)=>{if(originals[i]===undefined)delete process.env[k];else process.env[k]=originals[i]});
 }
});
