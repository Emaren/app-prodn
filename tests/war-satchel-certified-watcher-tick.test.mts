import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read=(x:string)=>readFileSync(new URL("../"+x,import.meta.url),"utf8");

test("certified Watcher tick uses shared market, consent, and non-stale funded selector",()=>{
 const tick=read("lib/warSatchelFundedWatcherTick.ts");
 const selector=read("lib/warSatchelEligibleOutbox.ts");
 assert.match(tick,/readEligibleFundedMechaIds\(prisma\)/);
 assert.doesNotMatch(tick,/betAutoExecution\.findMany/);
 assert.match(selector,/FUNDED_MECHA_CANDIDATE_MAX_AGE_MS = 4 \* 60 \* 1000/);
 assert.match(selector,/status: "shadow_ready", reservationId: null, attemptCount: 0/);
 assert.match(selector,/status: "funded_reserved", reservationId: \{ not: null \}, attemptCount: 1/);
 assert.match(selector,/wagerAuthorization: \{ isNot: null \}/);
 assert.doesNotMatch(selector,/status: "funded_submitting"|status: "funded_unknown_hold"/);
 assert.match(selector,/winnerMarket: \{ status: "live", integrityStatus: "verified"/);
 assert.match(selector,/satchelAutoSpendConsents: \{ some:/);
 assert.match(selector,/signedAt: \{ not: null \}, revokedAt: null, spendExpiresAt: \{ gt: now \}/);
 assert.match(selector,/availableUwolo: \{ gt: BigInt\(0\) \}/);
 assert.match(selector,/createdAt: \{ gte: earliest, lte: now \}/);
 assert.match(selector,/take: max/);
 assert.match(tick,/executeFundedMechaTicketBatch\(prisma,signer,ids\)/);
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
