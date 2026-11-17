import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  KT84_DOMAIN, KT84_SOURCE_SHA, KT84_STUDY_SHA, KT84_SIGNED_SCHEMA,
  kt84Canonical, verifyKt84Envelope, readKt84ProductionProjection,
} from "../lib/kt84ReadonlyProjection.ts";

const signer = generateKeyPairSync("ed25519");
const pem = signer.publicKey.export({format:"pem",type:"spki"}).toString();
const other = generateKeyPairSync("ed25519").publicKey.export({format:"pem",type:"spki"}).toString();
const at = new Date("2026-11-17T10:00:00.000Z");
const sourceAt = "2026-11-16T02:00:00+00:00";
function originalRecord() {
  return {
    schema:"KT84_STELLAR_ONE_BOT_PRIVATE_READONLY_TELEMETRY_V1",
    sourceOwner:"WE3_PRODUCT_READ_ONLY",
    authenticationRequiredByHost:true,
    noBotWritersOrPrivateKeys:true,
    exportIsHistorical:true,
    observedAtUTC:sourceAt,
    currentlyLive:false,
    currentRuntimeVerified:false,
    realOrders:0,
    fundedAuthority:false,
    studyReceiptSHA256:KT84_STUDY_SHA,
    bot:{
      botId:"stellar-paper-001",status:"HISTORICAL_HALTED",
      cashUSDC:"99.999845443923960000",inventoryXLM:"0",
      feesUSDC:"0.000154556076040000",
      realizedPaperPnLUSDC:"-0.000154556076040000",
      moneyJournalSHA256Head:"a".repeat(64),
      originalControlSHA256Head:"b".repeat(64),
      profitIsHypothetical:true,
    },
    worker:{status:"NOT_RUNNING_NOT_INSTALLED",lastSignedCommand:null,originalControlCryptographicallySigned:false},
    providers:[
      ["stellar-classic","Stellar Classic native DEX","ORDER_BOOK","HISTORICAL_VERIFIED_ORIGINAL_BYTES_NOT_LIVE"],
      ["soroswap-amm","Soroswap AMM","AMM","HISTORICAL_VERIFIED_RPC_BYTES_RESERVE_TIME_UNKNOWN"],
      ["aquarius","Aquarius","AMM","UNVERIFIED_DIRECT_SOURCE"],
      ["sushi","Sushi on Stellar","AMM","UNVERIFIED_DIRECT_SOURCE"],
      ["comet","Comet","AMM","UNVERIFIED_DIRECT_SOURCE"],
      ["soroswap-aggregator","Soroswap Aggregator","ROUTER_NOT_LIQUIDITY","ROUTER_DISCOVERY_NO_API_QUOTE"],
    ].map(([id,title,type,sourceStatus],i)=>({
      id,title,type,sourceStatus,
      executionAdmitted:false,fundedTradesAdmitted:false,researchOnly:true,
      dataFresh:false,independentLiquiditySource:i!==5,notToCountTwice:i===5,
      roundtripAllCost:null,sorobanResourceFee:null,
      quoteObservedAtUTC:i<2?sourceAt:null,
      dataAgeSeconds:i<2?86400:null,
      sourceLedger:i<2?12345678:null,
      liquidityUSDC:i<2?"10":null,
      liquidityXLM:i<2?"10":null,
    })),
    opportunities:Array.from({length:10},(_,i)=>({
      route:"XLM/USDC source research "+i,
      decision:"REJECT_UNVERIFIED_FEES",
      reason:"Cannot establish an executable profit after fees",
      realOrders:0,eligibleForPaper:false,allCostProfitUSDC:null,
      sourceReceiptSHA256:KT84_STUDY_SHA,
    })),
    fleet:{
      capacity:100,pageSize:10,commissionedNow:0,
      entries:Array.from({length:100},(_,i)=>({
        slot:i+1,status:i===0?"HISTORICAL_HALTED":"UNCOMMISSIONED",
        realOrders:0,signedOperatorPresent:false,
      })),
    },
    wallet:{role:"WATCH_ONLY_NOT_CONNECTED",address:null,fundedTradingAdmitted:false},
    microBudget:{targetTotalUSD:"10",fundedTradingAdmitted:false,budgetFeasible:null,signer:null},
  };
}
function envelope(payload=originalRecord()) {
  const signed = {
    schema:KT84_SIGNED_SCHEMA,sourceSha:KT84_SOURCE_SHA,
    signedAtUTC:"2026-11-17T09:50:00Z",expiresAtUTC:"2026-11-17T10:10:00Z",
    payload,
  };
  const signatureBase64=sign(null,Buffer.from(KT84_DOMAIN+kt84Canonical(signed)),signer.privateKey).toString("base64");
  return {...signed,signatureBase64};
}
function signedMutation(fn) {
  const value=originalRecord();
  fn(value);
  return envelope(value);
}

test("valid original WE3 historical only: six roles, one router, ten rejects, 100 exact slots",()=>{
  const s=verifyKt84Envelope(envelope(),pem,at);
  assert.equal(s.sourceKind,"SIGNED_WE3_HISTORICAL_ONLY");
  assert.equal(s.historicalBot.state,"HISTORICAL_HALTED");
  assert.equal(s.historicalBot.cashUSDC,"99.999845443923960000");
  assert.equal(s.newAccount,null);
  assert.equal(s.worker.status,"NOT_RUNNING_NOT_INSTALLED");
  assert.equal(s.worker.verifiedHeartbeat,false);
  assert.equal(s.providers.length,6);
  assert.equal(s.providers.filter(x=>x.independentLiquiditySource).length,5);
  assert.equal(s.providers.at(-1)?.independentLiquiditySource,false);
  assert.equal(s.opportunities.length,10);
  assert.equal(s.fleet.entries.length,100);
  assert.equal(s.fleet.entries[0].status,"HISTORICAL_HALTED");
  assert.equal(s.fleet.entries[99].status,"UNCOMMISSIONED");
  assert.equal(s.wallet.address,null);
  assert.equal(s.microBudget.status,"HOLD");
  assert.equal(s.microBudget.executionAdmitted,false);
  assert.ok(!("privateKey" in s));
  assert.ok(!("orderXdr" in s));
});

test("signed JSON mutation, substituted signer, source and copied envelope deny",()=>{
  const good=envelope();
  assert.throws(()=>verifyKt84Envelope(good,other,at),/AUTHENTICITY_FAILED/);
  assert.throws(()=>verifyKt84Envelope({...good,sourceSha:"0".repeat(40)},pem,at),/SOURCE_VERSION_HOLD/);
  assert.throws(()=>verifyKt84Envelope({...good,signatureBase64:"x"},pem,at),/SIGNATURE_MISSING/);
  const changed=structuredClone(good);
  changed.payload.bot.cashUSDC="1000000";
  assert.throws(()=>verifyKt84Envelope(changed,pem,at),/AUTHENTICITY_FAILED/);
});

test("new running worker, real order and signed RESUME are refused even by a signer",()=>{
  for(const mutation of [
    (x)=>{x.currentlyLive=true;},
    (x)=>{x.worker.status="RUNNING";},
    (x)=>{x.worker.originalControlCryptographicallySigned=true;},
    (x)=>{x.realOrders=1;},
    (x)=>{x.fundedAuthority=true;},
    (x)=>{x.bot.status="RUNNING";},
    (x)=>{x.fleet.commissionedNow=1;},
  ]) assert.throws(()=>verifyKt84Envelope(signedMutation(mutation),pem,at),
    /HOLD|FALSE_RUNNING|HISTORY_MISMATCH/);
});

test("unobserved providers cannot fake liquidity; router cannot double count",()=>{
  for(const index of [2,3,4,5]) {
    const changed=signedMutation(x=>{x.providers[index].liquidityUSDC="1000000";});
    assert.throws(()=>verifyKt84Envelope(changed,pem,at),/UNOBSERVED_PROVIDER_FAKE_DATA|ROUTER_DOUBLE_COUNT/);
  }
  assert.throws(()=>verifyKt84Envelope(signedMutation(x=>{
    x.providers[5].independentLiquiditySource=true;
  }),pem,at),/PROVIDER_ROLE_OR_ADMISSION_HOLD/);
});

test("untrusted fleet, positive research execution, wallet and $10 authority fail closed",()=>{
  for(const mutation of [
    (x)=>{x.fleet.entries[1].status="RUNNING";},
    (x)=>{x.opportunities[0].decision="EXECUTED";},
    (x)=>{x.wallet.address="G"+"A".repeat(55);},
    (x)=>{x.microBudget.fundedTradingAdmitted=true;},
    (x)=>{x.bot.moneyJournalSHA256Head="bad";},
  ]) assert.throws(()=>verifyKt84Envelope(signedMutation(mutation),pem,at));
});

test("expired or future-dated signature, non Ed25519, and missing public key are denied",()=>{
  assert.throws(()=>verifyKt84Envelope(envelope(),pem,new Date("2026-11-18T10:00:00Z")),/SIGNED_RECEIPT_EXPIRED/);
  assert.throws(()=>verifyKt84Envelope(envelope(),"-----BEGIN PRIVATE KEY-----",at),/PUBLIC_VERIFIER_UNAVAILABLE/);
  assert.throws(()=>verifyKt84Envelope(envelope(),"",at),/PUBLIC_VERIFIER_UNAVAILABLE/);
});

test("web API is owner-authenticated and requires independently signed read-only host file",()=>{
  const route=readFileSync(new URL("../app/api/kingdom-traders/paper-readonly/route.ts",import.meta.url),"utf8");
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/readKt84ProductionProjection\(/);
  assert.match(route,/Cache-Control/);
  assert.match(route,/private, no-store/);
  assert.doesNotMatch(route,/export async function POST|signTransaction|sendTransaction|prisma|sqlite3/i);
  const entry=readFileSync(new URL("../app/kingdom-traders/cockpit/route.ts",import.meta.url),"utf8");
  assert.match(entry,/requireAdmin\(request\)/);
  assert.match(entry,/NextResponse.redirect/);
  assert.match(entry,/status:303/);
  assert.match(entry,/private, no-store/);
  assert.doesNotMatch(entry,/POST|prisma|sqlite3|signTransaction/);
  const publicPage=readFileSync(new URL("../app/kingdom-traders/page.tsx",import.meta.url),"utf8");
  assert.match(publicPage,/Kt84CockpitEntry/);
  const mounted=readFileSync(new URL("../app/kingdom-traders/Kt84CockpitEntry.tsx",import.meta.url),"utf8");
  assert.match(mounted,/window.location.hash === "#cockpit"/);
  assert.match(mounted,/<Kt84Cockpit\/>/);
  const source=readFileSync(new URL("../lib/kt84ReadonlyProjection.ts",import.meta.url),"utf8");
  assert.match(source,/O_NOFOLLOW/);
  assert.match(source,/root\.uid|parent\.uid|before\.uid/);
  assert.match(source,/KT84_WE3_TELEMETRY_PUBLIC_PEM/);
  assert.doesNotMatch(source,/createPrivateKey|signTransaction|execFile|\/paper-arena|open\(.*sqlite/i);
});

test("missing WE3 verifier does not fabricate telemetry",async()=>{
  const old=process.env.KT84_WE3_TELEMETRY_PUBLIC_PEM;
  delete process.env.KT84_WE3_TELEMETRY_PUBLIC_PEM;
  try {
    await assert.rejects(readKt84ProductionProjection(),/PUBLIC_VERIFIER_NOT_ENROLLED/);
  } finally {
    if(old===undefined) delete process.env.KT84_WE3_TELEMETRY_PUBLIC_PEM;
    else process.env.KT84_WE3_TELEMETRY_PUBLIC_PEM=old;
  }
});
