import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("only a bounded, signed Watcher shadow outbox feeds the funded executor",()=>{
  const tick=load("lib/warSatchelFundedOutboxTick.ts");
  const selector=load("lib/warSatchelEligibleOutbox.ts");
  const source=tick+selector;
  assert.match(tick,/const MAX=FUNDED_MECHA_CANDIDATE_LIMIT/);
  assert.match(selector,/FUNDED_MECHA_CANDIDATE_LIMIT = 25/);
  assert.match(selector,/FUNDED_MECHA_CANDIDATE_MAX_AGE_MS = 4 \* 60 \* 1000/);
  assert.match(source,/status:"shadow_ready"/);
  assert.match(source,/ticketId:null/);
  assert.match(source,/status:"shadow_ready",reservationId:null,attemptCount:0/);
  // A durable pre-broadcast reservation may resume only after approval. An
  // attempted/uncertain send must never re-enter this intake.
  assert.match(source,/status:"funded_reserved",reservationId:\{not:null\},attemptCount:1/);
  assert.match(source,/satchelFundedReservation:\{is:\{status:"reserved",wagerAuthorization:\{is:\{approval:\{isNot:null\}\}\}\}\}/);
  assert.doesNotMatch(source,/status:"unknown_hold"|status:"funded_submitting"/);
  assert.match(source,/createdAt:\{gte:earliest,lte:now\}/);
  assert.match(source,/user:\{walletAddress:\{not:null\}\}/);
  assert.match(source,/orderBy:\[\{createdAt:"asc"\},\{id:"asc"\}\]/);
  assert.match(source,/take: max/);
  assert.match(tick,/readEligibleFundedMechaIds\(prisma,options\)/);
  assert.match(tick,/executeFundedMechaTicketBatch\(/);
  assert.match(source,/warSatchelDedicatedSignerClient/);
  assert.doesNotMatch(source,/warSatchelIsolatedSignerClient|warSatchelIsolatedSignerTransport|makeSatchelLoopbackSigner|createLocalIsolatedSatchelSigner/);
  assert.doesNotMatch(source,/setInterval\(|while\s*\(/);
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
  assert.match(source,/readWithdrawalReviewerKey\(/);
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

test("empty funded Watcher outbox does not probe the custody signer",()=>{
 const source=load("lib/warSatchelFundedOutboxTick.ts");
 const query=source.indexOf("const ids=await readEligibleFundedMechaIds(prisma,options);");
 const empty=source.indexOf("if(!ids.length)return Object.freeze(");
 const signer=source.indexOf("const signer=await connectCertifiedSatchelSigner();");
 const execute=source.indexOf("const counts=await executeFundedMechaTicketBatch(");
 assert.ok(query>=0 && empty>query && signer>empty && execute>signer,
  "read-only queue selection and empty return must precede signer connection");
 assert.match(source,/if\(!satchelFinancialBridgeReady\(\)/);
 assert.match(source,/const MAX=FUNDED_MECHA_CANDIDATE_LIMIT/);
});
