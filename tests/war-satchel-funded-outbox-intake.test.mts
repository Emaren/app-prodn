import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("only a bounded, signed Watcher shadow outbox feeds the funded executor",()=>{
  const source=load("lib/warSatchelFundedOutboxTick.ts");
  assert.match(source,/const MAX=25/);
  assert.match(source,/const MAX_AGE_MS=4\*60\*1000/);
  assert.match(source,/status:"shadow_ready"/);
  assert.match(source,/reservationId:null,ticketId:null,attemptCount:0/);
  assert.match(source,/createdAt:\{gte:earliest,lte:now\}/);
  assert.match(source,/user:\{walletAddress:\{not:null\}\}/);
  assert.match(source,/orderBy:\[\{createdAt:"asc"\},\{id:"asc"\}\]/);
  assert.match(source,/take:max/);
  assert.match(source,/executeFundedMechaTicketBatch\(/);
  assert.match(source,/warSatchelDedicatedSignerClient/);
  assert.doesNotMatch(source,/warSatchelIsolatedSignerClient|makeSatchelLoopbackSigner/);
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
test("only the separately authenticated loopback signer may authorize a real vault-to-escrow call",()=>{
  const transport=load("lib/warSatchelIsolatedSignerClient.ts");
  assert.match(transport,/127\.0\.0\.1:8194/);
  assert.match(transport,/timingSafeEqual/);
  assert.match(transport,/createHmac/);
  assert.match(transport,/SATCHEL_SIDECAR_CONTRACT/);
  assert.match(transport,/attempted\.add\(input\.requestId\)/);
  assert.match(transport,/attempted\.has\(input\.requestId\)/);
  assert.match(transport,/buildBetStakeTicketMemo\(parsedTicketId\)/);
  assert.match(transport,/sidecar_http_or_transport_unknown/);
  assert.doesNotMatch(transport,/fromMnemonic|DirectSecp256k1HdWallet|WOLO_BET_PAYOUT_MNEMONIC/);
});
