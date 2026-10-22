import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("one bounded signed Watcher selector feeds both financial entrypoints",()=>{
  const tick=load("lib/warSatchelFundedOutboxTick.ts");
  const cli=load("scripts/war-satchel-funded-mecha-worker.ts");
  const legacyPoll=load("lib/warSatchelFundedWatcherPoll.ts");
  const selector=load("lib/warSatchelEligibleOutbox.ts");
  assert.match(selector,/FUNDED_MECHA_CANDIDATE_LIMIT = 25/);
  assert.match(selector,/FUNDED_MECHA_CANDIDATE_MAX_AGE_MS = 4 \* 60 \* 1000/);
  assert.match(selector,/status: "shadow_ready", reservationId: null, attemptCount: 0/);
  assert.match(selector,/status: "funded_reserved", reservationId: \{ not: null \}, attemptCount: 1/);
 assert.match(selector,/wagerAuthorization: \{ isNot: null \}/);
  assert.doesNotMatch(selector,/status: "unknown_hold"|status: "funded_submitting"/);
  assert.match(selector,/createdAt: \{ gte: earliest, lte: now \}/);
  assert.match(selector,/nextAttemptAt: \{ lte: now \}/);
  assert.match(selector,/walletAddress: \{ not: null \}/);
  assert.match(selector,/satchelFundedBalance: \{ is: \{ OR:/);
  assert.match(selector,/gamesRemaining: \{ gt: 0 \}/);
  assert.match(selector,/orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(selector,/take: max/);
  assert.match(selector,/requireSatchelFinancialBridge\(\)/);
  assert.match(tick,/readEligibleFundedMechaIds\(prisma,options\)/);
  assert.match(cli,/readEligibleFundedMechaIds\(prisma,\{limit:MAX_BATCH\}\)/);
  assert.match(legacyPoll,/readEligibleFundedMechaIds\(prisma,\{limit:maxBatch\}\)/);
  assert.doesNotMatch(tick+cli+legacyPoll,/betAutoExecution\.findMany/);
  assert.match(tick,/executeFundedMechaTicketBatch\(/);
  assert.match(tick,/warSatchelDedicatedSignerClient/);
  assert.doesNotMatch(tick+cli,/warSatchelIsolatedSignerClient|warSatchelIsolatedSignerTransport|makeSatchelLoopbackSigner|createLocalIsolatedSatchelSigner/);
  assert.doesNotMatch(tick+cli,/setInterval\(|while\s*\(/);
});

test("unapproved producer, withdrawal, claim return or custody flag cannot execute one funded bet",()=>{
  const source=load("lib/warSatchelFundedOutboxTick.ts");
  for(const flag of [
    "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED",
    "WAR_SATCHEL_AUTO_EXECUTION_TICK_ENABLED",
    "WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
    "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
    "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED",
  ])assert.match(source,new RegExp(flag));
  assert.match(source,/return off\(\)/);
  assert.match(source,/await connectCertifiedSatchelSigner\(\)/);
});
test("outbox execution uses only the canonical signed-reservation adapter",()=>{
  const source=load("lib/warSatchelDedicatedSignerClient.ts");
  assert.match(source,/const ENDPOINT = "http:\/\/127\.0\.0\.1:8094"/);
  assert.match(source,/Authorization:\s*"Bearer "\s*\+\s*token/);
  assert.match(source,/readWagerReviewerKey\(/);
  assert.doesNotMatch(source,/readWithdrawalReviewerKey\(/);
  assert.match(source,/verifyIndependentWagerReservation\(/);
  assert.match(source,/request\("\/satchel\/v2\/one-shot"/);
  assert.match(source,/reservation:reviewed/);
  assert.match(source,/durable_request_fenced\s*!==\s*true/);
  assert.match(source,/kind:"broadcast_accepted"/);
  assert.doesNotMatch(source,/8194|X-Satchel-Hmac|createHmac|kind:"broadcast_confirmed"/);
  assert.doesNotMatch(source,/fromMnemonic|DirectSecp256k1HdWallet|WOLO_BET_PAYOUT_MNEMONIC/);
});
test("retired sidecar entry points contain no callable financial transport",()=>{
  for(const name of ["lib/warSatchelIsolatedSignerClient.ts","lib/warSatchelIsolatedSignerTransport.ts"]){
    const source=load(name);
    assert.match(source,/SATCHEL_SIGNER_INTERFACE_RETIRED:use_connectCertifiedSatchelSigner/);
    assert.doesNotMatch(source,/https?:\/\/|8194|createHmac|X-Satchel-Hmac|submitOneShot|reader\(|fetch\(/);
  }
});

test("every real one-shot signer submission is source/build-bound to a revocable short PostgreSQL financial lease",()=>{
  const source=load("lib/warSatchelFundedOutboxTick.ts");
  assert.match(source,/withHdFinancialLease\(/);
  assert.match(source,/scope:"hd-satchel",producer:"war-satchel-auto-bet"/);
  assert.match(source,/wallet:signer\.attestedVaultAddress/);
  assert.match(source,/connectCertifiedSatchelSigner\(fetch,signal\)/);
  assert.match(source,/current\.attestedVaultAddress!==signer\.attestedVaultAddress/);
  assert.match(source,/prisma,leaseBoundSigner,ids/);
  assert.doesNotMatch(source,/prisma,signer,ids/);
  assert.match(source,/financial_fence_held_or_unknown/);
  assert.doesNotMatch(source,/privateKey|mnemonic|approveAll|allowUnfenced/);
});

test("empty funded Watcher outbox does not probe the custody signer",()=>{
 const source=load("lib/warSatchelFundedOutboxTick.ts");
 const query=source.indexOf("const ids=await readEligibleFundedMechaIds(prisma,options);");
 const empty=source.indexOf("if(!ids.length)return Object.freeze(");
 const signer=source.indexOf("const signer=await connectCertifiedSatchelSigner();");
 const execute=source.indexOf("const counts=await executeFundedMechaTicketBatch(");
 assert.ok(query>=0 && empty>query && signer>empty && execute>signer,
  "read-only queue selection and empty return must precede signer connection");
 assert.match(source,/if\(!satchelFinancialBridgeReady\(\)/);
 assert.doesNotMatch(source,/const MAX=FUNDED_MECHA_CANDIDATE_LIMIT/);
});
