import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import test from "node:test";
import {readFileSync} from "node:fs";
import {fundedWatcherBookNames,fundedWatcherOriginSignBytes,
  verifyIndependentFundedWatcherOrigin,type SignedFundedWatcherOrigin}
  from "../lib/warSatchelFundedWatcherOrigin.ts";
import {fundedMechaEligibleQuery} from "../lib/warSatchelEligibleOutbox.ts";
const hash=(c:string)=>c.repeat(64);
const source={sessionKey:"game:synthetic:72691",propositionHash:hash("a"),
  rosterHash:hash("b"),sourceGameStatsId:21};
const signing=generateKeyPairSync("ed25519");
const pub=signing.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
const now=1782290000;
function approved(change:Partial<SignedFundedWatcherOrigin>={}):SignedFundedWatcherOrigin{
  const unsigned:SignedFundedWatcherOrigin={version:1,chain_id:"wolo-1",
    session_key:source.sessionKey,proposition_hash:source.propositionHash,
    roster_hash:source.rosterHash,source_game_stats_id:source.sourceGameStatsId,
    nonce:"synthetic-no-private-authority-0001",issued_at:now-3,expires_at:now+30,
    signature:"",...change};
  return {...unsigned,signature:sign(null,fundedWatcherOriginSignBytes(unsigned),signing.privateKey).toString("base64")};
}
function verify(x:unknown,e=source,time=now*1000){
  return verifyIndependentFundedWatcherOrigin({signed:x,expected:e,publicKeyHex:pub,nowMs:time});
}
test("independent synthetic Ed25519 authorization creates distinct funded winner and Desync identities",()=>{
  const proof=verify(approved()),n=fundedWatcherBookNames(proof);
  assert.match(n.winnerSlug,/^funded-[a-f0-9]{32}-winner$/);
  assert.notEqual(n.winnerSlug,n.desyncSlug);
  assert.notEqual(n.winnerPhaseKey,n.desyncPhaseKey);
  assert.equal(n.winnerPhaseKey.startsWith("funded:"),true);
  const again=fundedWatcherBookNames(verify(approved({nonce:"synthetic-repeat-unique-00000002"})));
  assert.deepEqual(n,again,"repeat approval never creates another book for the same game");
  const other=fundedWatcherBookNames(verify(approved({session_key:"game:synthetic:72692"}),
    {...source,sessionKey:"game:synthetic:72692"}));
  assert.notEqual(n.winnerSlug,other.winnerSlug);
});
test("signed source row, roster and proposition must be unchanged",()=>{
  const v=approved();
  assert.throws(()=>verify(v,{...source,sourceGameStatsId:22}),/watcher_proposition_mismatch/);
  assert.throws(()=>verify(v,{...source,rosterHash:hash("c")}),/watcher_proposition_mismatch/);
  assert.throws(()=>verify({...v,proposition_hash:hash("c")}),/watcher_proposition_mismatch/);
  assert.throws(()=>verify(v,source,(now+31)*1000),/expired_or_future/);
});
test("nonce replacement, unverifiable reviewer and object tricks fail closed",()=>{
  const v=approved();
  assert.throws(()=>verify({...v,nonce:"synthetic-replayed-but-forged-0002"}),/independent_signature/);
  assert.throws(()=>verify({...v,garbage:true}),/noncanonical_fields/);
  assert.throws(()=>verify({...v,signature:"0".repeat(88)}),/signature_encoding|independent_signature/);
  assert.throws(()=>verifyIndependentFundedWatcherOrigin({
    signed:v,expected:source,nowMs:now*1000,publicKeyHex:hash("0")}),/untrusted_reviewer/);
});
test("funded source and queue only recognize dedicated funded phase; public creator remains separate",()=>{
  const holder=readFileSync(new URL("../lib/warSatchelFinancialBridgeHold.ts",import.meta.url),"utf8");
  const writer=readFileSync(new URL("../lib/bets.ts",import.meta.url),"utf8");
  const ledger=readFileSync(new URL("../lib/warSatchelFundedLedger.ts",import.meta.url),"utf8");
  assert.match(holder,/SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
  assert.match(writer,/export async function admitReviewedFundedWatcherBooks/);
  assert.match(writer,/requireSatchelFinancialBridge\(\)/);
  assert.match(writer,/bookPhase:"preview_only"/);
  assert.match(writer,/bookPhase:"funded"/);
  assert.match(writer,/FUNDED_WATCHER_UNRELATED_FINANCIAL_BOOK_COLLISION/);
  assert.match(ledger,/market\.bookPhase !== "funded"/);
  assert.match(ledger,/desync\.bookPhase !== "funded"/);
  const q=fundedMechaEligibleQuery();
  assert.equal(q.where.winnerMarket.bookPhase,"funded");
});
