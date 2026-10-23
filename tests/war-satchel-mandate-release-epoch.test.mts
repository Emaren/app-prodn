import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { makeSignDoc, pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";
import * as held from "../lib/warSatchelAutoSpendConsent.ts";

const heldEpoch = "aoe2war/satchel/mecha/v2/held-integration-1";
const releasedEpoch = "aoe2war/satchel/mecha/v2/release/isolated-test-only";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
const jwk = publicKey.export({ format: "jwk" }) as {x:string;y:string};
const y = Buffer.from(jwk.y,"base64url");
const key = Buffer.concat([Buffer.from([2+(y[y.length-1]&1)]),Buffer.from(jwk.x,"base64url")]).toString("base64");
const wallet = pubkeyToAddress({type:"tendermint/PubKeySecp256k1",value:key},"wolo");
const challenge: held.SatchelSpendChallenge = {
  ownerUid:"epoch-owner",walletAddress:wallet,presetId:1,presetVersion:2,
  winnerStakeWolo:25,desyncSide:"none",desyncStakeWolo:0,perGameCapWolo:25,dailyCapWolo:1000,
  untilOut:false,gamesRemaining:12,nonce:"a".repeat(32),
  issuedAtUtc:"2026-10-20T12:00:00.000Z",challengeExpiresAtUtc:"2026-10-20T12:05:00.000Z",
  spendExpiresAtUtc:"2026-10-21T11:00:00.000Z",signedAtUtc:null,revokedAtUtc:null,
};
function signature(text:string) {
  const doc=makeSignDoc([{type:"sign/MsgSignData",value:{signer:wallet,data:Buffer.from(text).toString("base64")}}],{amount:[],gas:"0"},"","","0","0");
  return {pub_key:{type:"tendermint/PubKeySecp256k1",value:key},signature:sign("sha256",Buffer.from(serializeSignDoc(doc)),{key:privateKey,dsaEncoding:"ieee-p1363"}).toString("base64")};
}
function durable(text:string) {
  const signedAt=new Date("2026-10-20T12:01:00.000Z");
  return {consent:{...challenge,issuedAt:new Date(challenge.issuedAtUtc),challengeExpiresAt:new Date(challenge.challengeExpiresAtUtc),
    spendExpiresAt:new Date(challenge.spendExpiresAtUtc),signedAt,revokedAt:null},
    originalMandate:{untilOut:false,gamesRemaining:12,challengeText:text,ownerSignatureJson:signature(text),signedAt},
    ownerUid:challenge.ownerUid,ownerWallet:wallet,presetId:1,presetVersion:2,untilOut:false,gamesRemaining:11,now:new Date("2026-10-20T12:02:00.000Z")};
}
async function isolatedReleaseModule(epoch:string):Promise<typeof held> {
  const source=readFileSync(new URL("../lib/warSatchelAutoSpendConsent.ts",import.meta.url),"utf8");
  assert.equal(source.split(heldEpoch).length-1,1);
  const rewritten=source.replace(heldEpoch,epoch).replace('from "@cosmjs/amino"',`from ${JSON.stringify(import.meta.resolve("@cosmjs/amino"))}`).replace('from "./betMoneyLimits.ts"',`from ${JSON.stringify(import.meta.resolve("../lib/betMoneyLimits.ts"))}`);
  // This private module changes an isolated test source epoch, never the
  // application's literal source or a mutable financial environment flag.
  return import("data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(rewritten)).toString("base64"));
}

test("held protocol-2 ADR36 proves the wallet but never gains spending authority from flags",()=>{
  const text=held.satchelAutoSpendChallengeText(challenge);
  assert(text.includes("Authorization protocol: aoe2war/satchel/mecha-auto-spend/v2\n"));
  assert(text.includes("Authorization epoch: "+heldEpoch+"\n"));
  const verified=held.verifySatchelAutoSpendSignature({challenge,ownerUid:challenge.ownerUid,ownerWallet:wallet,presetId:1,presetVersion:2,
    nowUtc:"2026-10-20T12:01:00.000Z",keplrSignature:signature(text)});
  assert.equal(verified.wagerAuthorized,false);
  const previous=process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED;
  process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED="true";
  try{
    assert.equal(held.satchelAutoSpendAuthorizationEpochReleased(),false);
    assert.throws(()=>held.verifyDurableSatchelAutoSpendMandate(durable(text)),/authorization epoch is held/);
  }finally{if(previous===undefined)delete process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED;else process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED=previous;}
});

test("unversioned, old, held and future epochs cannot replay into a released original mandate",async()=>{
  const current=await isolatedReleaseModule(releasedEpoch);
  const text=current.satchelAutoSpendChallengeText(challenge);
  assert.equal(current.satchelAutoSpendAuthorizationEpochReleased(),true);
  assert.equal(current.verifyDurableSatchelAutoSpendMandate(durable(text)).wagerAuthorized,false);
  for(const other of [heldEpoch,"aoe2war/satchel/mecha/v2/release/old-epoch","aoe2war/satchel/mecha/v2/release/future-epoch"]){
    // Each wrong epoch still has a genuine signature by the original wallet.
    assert.throws(()=>current.verifyDurableSatchelAutoSpendMandate(durable(text.replace(releasedEpoch,other))),/stored challenge text changed/);
  }
  const unversioned=text.split("\n").filter(line=>!line.startsWith("Authorization protocol:")&&!line.startsWith("Authorization epoch:")).join("\n");
  assert.throws(()=>current.verifyDurableSatchelAutoSpendMandate(durable(unversioned)),/stored challenge text changed/);
  const next=await isolatedReleaseModule("aoe2war/satchel/mecha/v2/release/next-reviewed-epoch");
  assert.throws(()=>next.verifyDurableSatchelAutoSpendMandate(durable(text)),/stored challenge text changed/);
  const revoked=durable(text);revoked.consent.revokedAt=revoked.now;
  assert.throws(()=>current.verifyDurableSatchelAutoSpendMandate(revoked),/absent expired or revoked/);
});

async function routeHarness(options:{uid?:string|null;failWrite?:boolean;revocable?:boolean;walletAddress?:string|null}={}) {
  const calls:{kind:string;value?:unknown}[]=[];
  const tx={$executeRaw:async(parts:TemplateStringsArray,...values:unknown[])=>{calls.push({kind:"lock",value:[...parts,...values]});return 1;},
    satchelAutoSpendConsent:{updateMany:async(value:unknown)=>{calls.push({kind:"revoke",value});if(options.failWrite)throw Error("isolated write failure");return{count:2};}}};
  const db={user:{findUnique:async()=>({id:7,uid:"epoch-owner",walletAddress:options.walletAddress===undefined?wallet:options.walletAddress,betAutoPreset:null})},
    satchelAutoSpendConsent:{findFirst:async(value:unknown)=>{calls.push({kind:"read",value});return options.revocable===false?null:{id:"owned-consent"};}},
    $transaction:async(fn:(value:typeof tx)=>unknown)=>fn(tx)};
  const identity="__satchel_epoch_route_"+randomUUID().replaceAll("-","");
  const globals=globalThis as unknown as Record<string,unknown>;
  globals[identity]={getPrisma:()=>db,getSessionUid:async()=>options.uid===undefined?"epoch-owner":options.uid,
    NextResponse:{json:(body:unknown,init:ResponseInit)=>new Response(JSON.stringify(body),init)},consent:held};
  let source=stripTypeScriptTypes(readFileSync(new URL("../app/api/user/war-satchel/auto-consent/route.ts",import.meta.url),"utf8"));
  const holder=`globalThis[${JSON.stringify(identity)}]`;
  source=source.replace(/import \{ NextRequest, NextResponse \} from "next\/server";/,`const {NextResponse}=${holder};`)
    .replace(/import \{ getPrisma \} from "@\/lib\/prisma";/,`const {getPrisma}=${holder};`)
    .replace(/import \{ getSessionUid \} from "@\/lib\/session";/,`const {getSessionUid}=${holder};`)
    .replace(/import \{ Prisma \} from "@\/lib\/generated\/prisma";/,"")
    .replace(/import \{([A-Za-z0-9_,\s]+)\} from "@\/lib\/warSatchelAutoSpendConsent";/,(_match,names:string)=>`const {${names}}=${holder}.consent;`)
    .replace(/from "@\/lib\/([^\"]+)"/g,(_match,name:string)=>`from ${JSON.stringify(new URL("../lib/"+name+".ts",import.meta.url).href)}`);
  const handlers=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
  return {module:handlers,calls,dispose:()=>{delete globals[identity];}};
}
function request(origin="https://aoe2war.com",site="same-origin") {
  return {headers:new Headers({origin,"sec-fetch-site":site})};
}

test("actual consent route keeps owner revocation available while every new issuance gate is closed",async()=>{
  const harness=await routeHarness({walletAddress:null});
  const previous=process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED;
  process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED="false";
  try{
    const state=await (await harness.module.GET(request())).json();
    assert.equal(state.available,false);assert.equal(state.signed,false);assert.equal(state.canRevoke,true);
    assert.equal((await harness.module.POST(request())).status,503);
    assert.equal((await harness.module.PUT(request())).status,503);
    const response=await harness.module.DELETE(request());
    assert.equal(response.status,200);assert.equal((await response.json()).revoked,true);
    const mutation=harness.calls.find(call=>call.kind==="revoke")?.value as {where:Record<string,unknown>};
    assert.deepEqual(mutation.where,{ownerUserId:7,revokedAt:null},"unsigned challenges must be revoked too");
    assert(harness.calls.some(call=>call.kind==="lock"));
    const component=readFileSync(new URL("../components/profile/WarSatchelSpendAuthorization.tsx",import.meta.url),"utf8");
    assert.match(component,/setCanRevoke\(data\.canRevoke === true\)/);
    assert.match(component,/if \(busy \|\| \(!canRevoke && !signed\)\) return;/);
    const effect=component.slice(component.indexOf("useEffect(() =>"),component.indexOf("const cap ="));
    assert.doesNotMatch(effect,/if \(!walletAddress|presetVersion <= 0\) return/,
      "Keplr disconnection or removed plan cannot hide session-owned revocation");
  }finally{harness.dispose();if(previous===undefined)delete process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED;else process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED=previous;}
});

test("actual held revocation still rejects foreign origins, absent sessions and failed durable writes",async()=>{
  for(const scenario of ["foreign_origin","cross_site","no_session","write_failure"]){
    const harness=await routeHarness({uid:scenario==="no_session"?null:undefined,failWrite:scenario==="write_failure"});
    try{
      const response=await harness.module.DELETE(request(scenario==="foreign_origin"?"https://attacker.invalid":"https://aoe2war.com",scenario==="cross_site"?"cross-site":"same-origin"));
      assert.equal(response.status,scenario==="write_failure"?503:scenario==="no_session"?401:403,scenario);
      if(scenario!=="write_failure")assert.equal(harness.calls.filter(c=>c.kind==="revoke").length,0);
    }finally{harness.dispose();}
  }
});
