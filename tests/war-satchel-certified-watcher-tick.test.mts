import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read=(x:string)=>readFileSync(new URL("../"+x,import.meta.url),"utf8");

test("an observed canonical Watcher game is the only source of funded Mecha candidates",()=>{
 const src=read("lib/warSatchelFundedWatcherTick.ts");
 assert.match(src,/status:"shadow_ready"/);
 assert.match(src,/ticketId:null/);
 assert.match(src,/status:"shadow_ready",reservationId:null,attemptCount:0/);
 assert.match(src,/status:"funded_reserved",reservationId:\{not:null\},attemptCount:1/);
 assert.match(src,/status:"reserved",wagerAuthorization:\{is:\{approval:\{isNot:null\}/);
 assert.doesNotMatch(src,/status:"(?:funded_submitting|funded_unknown_hold)"/);
 assert.match(src,/winnerMarket:\{status:"live",integrityStatus:"verified"/);
 assert.match(src,/satchelAutoSpendConsents:\{some:\{/);
 assert.match(src,/signedAt:\{not:null\},revokedAt:null,spendExpiresAt:\{gt:now\}/);
 assert.match(src,/availableUwolo:\{gt:BigInt\(0\)\}/);
 assert.match(src,/take:LIMIT/);
 assert.match(src,/executeFundedMechaTicketBatch\(prisma,signer,executions\.map\(x=>x\.id\)\)/);
});
test("a live Watcher tick cannot open the isolated Satchel signer until every financial gate agrees",()=>{
 const src=read("lib/warSatchelFundedWatcherTick.ts");
 for(const flag of [
  "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED","WAR_SATCHEL_LIVE_EXECUTOR_ENABLED",
  "WAR_SATCHEL_WATCHER_TICK_ENABLED","WAR_SATCHEL_AUTO_CONSENT_ENABLED",
  "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED",
  "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
  "WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
 ])assert(src.includes(flag),flag);
 const first=src.indexOf("financialReady();");
 const sign=src.indexOf("connectCertifiedSatchelSigner();");
 assert(first>=0 && first<sign);
});
test("there is no public endpoint for arbitrary user-funded game execution",()=>{
 const api=read("app/api/internal/mecha/funded-tick/route.ts");
 assert.match(api,/timingSafeEqual/);
 assert.match(api,/WAR_SATCHEL_WATCHER_TICK_AUTH_TOKEN/);
 assert.match(api,/WAR_SATCHEL_WATCHER_TICK_ENABLED/);
 assert.match(api,/export async function POST/);
 assert.match(api,/if\(!authorized\(request\)\)/);
 assert.match(api,/runCertifiedWatcherFundedTick\(getPrisma\(\)\)/);
 assert.doesNotMatch(api,/request\.json\(\)|source:.*manual|playerUid/);
});
