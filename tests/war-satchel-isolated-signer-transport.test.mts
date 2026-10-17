import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalSatchelSignerHealth, createLocalIsolatedSatchelSigner,
  type LocalSatchelSignerConfig,
} from "../lib/warSatchelIsolatedSignerTransport.ts";

const vault="wolo1"+"q".repeat(38);
const escrow="wolo1"+"p".repeat(38);
const cfg: LocalSatchelSignerConfig={
  approvedByOperator:true, vaultAddress:vault,escrowAddress:escrow,
  keyFingerprint:"a".repeat(64),serviceAccessToken:"a".repeat(55),
};
const health={protocol:1,chainId:"wolo-1",custodyRole:"exclusive-war-satchel-v1",
  vaultAddress:vault,keyFingerprint:"a".repeat(64),
  exclusiveSignOnly:true,accepting:true};
const input={
  requestId:"satchel:ticket:17",chainId:"wolo-1" as const,
  senderAddress:vault,recipientAddress:escrow,denom:"uwolo" as const,
  amountUwolo:"50000000",memo:"AoE2HDBets bet ticket v1 · ticket 123",
};
function fake(behavior:(url:string,init?:RequestInit)=>Promise<Response>):typeof fetch{
  return behavior as typeof fetch;
}
test("one shot signer client connects ONLY to hardcoded loopback health and send addresses",async()=>{
  const urls:string[]=[];
  const messages:unknown[]=[];
  const reader=fake(async (url,init)=>{
    urls.push(url);
    assert.equal(init?.redirect,"error");
    assert.equal((init?.headers as Record<string,string>)?.Authorization,
      "Bearer "+cfg.serviceAccessToken);
    if(url.endsWith("/health"))return Response.json(health);
    messages.push(JSON.parse(String(init?.body)));
    return Response.json({kind:"broadcast_confirmed",txHash:"AA".repeat(32)});
  });
  const signer=createLocalIsolatedSatchelSigner(cfg,reader);
  assert.equal(signer.custodyRole,"exclusive-war-satchel-v1");
  const result=await signer.submitOneShot(input);
  assert.deepEqual(result,{kind:"broadcast_confirmed",txHash:"AA".repeat(32)});
  assert.deepEqual(urls,[
    "http://127.0.0.1:8094/satchel/v1/health",
    "http://127.0.0.1:8094/satchel/v1/one-shot",
  ]);
  assert.deepEqual(messages,[{protocol:1,...input}]);
});
test("wrong key fingerprint or lying health report prohibits signing",async()=>{
  let posts=0;
  const reader=fake(async (_url,init)=>{
    if(init?.method==="POST")posts++;
    return Response.json({...health,keyFingerprint:"f".repeat(64)});
  });
  await assert.rejects(assertLocalSatchelSignerHealth(cfg,reader),/fingerprint_mismatch/);
  const result=await createLocalIsolatedSatchelSigner(cfg,reader).submitOneShot(input);
  assert.equal(result.kind,"unknown");
  assert.equal(posts,0);
});
test("wrong role, payee, wallet or oversized amount rejected BEFORE contacting remote service",async()=>{
  let calls=0;
  const reader=fake(async()=>{calls++;return Response.json(health);});
  for(const changed of [
    {...input,recipientAddress:vault},
    {...input,senderAddress:escrow},
    {...input,chainId:"not-wolo" as "wolo-1"},
    {...input,amountUwolo:"1001000000"},
    {...input,amountUwolo:"-2"},
    {...input,memo:"arbitrary token withdrawal"},
    {...input,requestId:"satchel:ticket:17/again"},
  ]){
    await assert.rejects(createLocalIsolatedSatchelSigner(cfg,reader).submitOneShot(changed),
      /invalid_one_shot_wager_identity_or_amount/);
  }
  assert.equal(calls,0);
});
test("timeout or lost ACK is UNKNOWN, never auto-retried or falsely confirmed",async()=>{
  let posts=0;
  const reader=fake(async(url)=>{
    if(url.endsWith("/health"))return Response.json(health);
    posts++;
    throw Error("network timeout after chain may have accepted transaction");
  });
  const result=await createLocalIsolatedSatchelSigner(cfg,reader).submitOneShot(input);
  assert.equal(result.kind,"unknown");
  assert.equal(posts,1);
});
test("client refuses uncertified signer even when a URL/remote says ready",async()=>{
  assert.throws(()=>createLocalIsolatedSatchelSigner({...cfg,approvedByOperator:false}),
    /independent_custody_configuration_missing/);
  assert.throws(()=>createLocalIsolatedSatchelSigner({...cfg,vaultAddress:escrow}),
    /independent_custody_configuration_missing/);
  assert.throws(()=>createLocalIsolatedSatchelSigner({...cfg,serviceAccessToken:"123"}),
    /independent_custody_configuration_missing/);
});
