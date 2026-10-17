import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const src=readFileSync(new URL("../lib/warSatchelFundedWatcherPoll.ts",import.meta.url),"utf8");
test("funded Mecha polls only exactly Watcher-vetted, unclaimed and enabled owner bets",()=>{
 assert.match(src,/status:"shadow_ready"/);
 assert.match(src,/ticketId:null/);
 assert.match(src,/reservationId:null/);
 assert.match(src,/attemptCount:0/);
 assert.match(src,/selfOnly:true/);
 assert.match(src,/enabled:true/);
 assert.match(src,/walletAddress:\{not:null\}/);
 assert.match(src,/orderBy:\[\{id:"asc"\}\]/);
 assert.match(src,/take:maxBatch/);
 assert.match(src,/executeFundedMechaTicketBatch\(prisma,signer,ids\)/);
 assert.doesNotMatch(src,/prepareBetStakeTicket\(|getWoloBetEscrowRuntime\(|sendTokens\(/);
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
 assert.match(src,/MAX_BATCH=25/);
 assert.doesNotMatch(src,/export async function (GET|POST|PUT|DELETE)/);
});
