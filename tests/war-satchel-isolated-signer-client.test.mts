import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

// These flags affect only this isolated Node test process. No live key,
// network call, shell or actual chain money transfer exists in this test.
const vault="wolo1"+"p".repeat(38);
const escrow="wolo1"+"q".repeat(38);
const secret="ab".repeat(32);
process.env.WOLO_BET_ESCROW_ADDRESS=escrow;
process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS=vault;
process.env.WAR_SATCHEL_SIGNER_SIDECAR_SHARED_SECRET=secret;
process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED="true";
process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED="true";
process.env.WAR_SATCHEL_SIGNER_SIDECAR_READY="true";
const { makeSatchelLoopbackSigner }=await import("../lib/warSatchelIsolatedSignerClient.ts");

function hmac(val:unknown){
  return createHmac("sha256",Buffer.from(secret,"hex"))
    .update(JSON.stringify(val)).digest("hex").toUpperCase();
}
function rig(silent=false){
  const bodies:Array<Record<string,unknown>>=[];
  const fetcher=(async (url:RequestInfo|URL,init?:RequestInit)=>{
    assert.equal(init?.method,"POST");
    const payload=JSON.parse(String(init?.body)) as Record<string,unknown>;
    const tag=String((init?.headers as Record<string,string>)?.["X-Satchel-Hmac"]||"");
    assert.equal(tag.toUpperCase(),hmac(payload));
    if(String(url).endsWith("/v1/health")){
      const result={protocol:"satchel-custody-v1",challenge:payload.challenge,
        role:"exclusive-war-satchel-v1",chainId:"wolo-1",
        vaultAddress:vault,escrowAddress:escrow,ready:true,loopbackOnly:true};
      return new Response(JSON.stringify({...result,proof:hmac(result)}),{
        status:200,headers:{"Content-Type":"application/json"},
      });
    }
    assert.equal(String(url),"http://127.0.0.1:8194/v1/one-shot");
    bodies.push(payload);
    if(silent) throw new Error("timeout after unknown send");
    return new Response(JSON.stringify({
      protocol:"satchel-custody-v1",requestId:payload.requestId,
      status:"broadcast_confirmed",txHash:"AB".repeat(32),
    }),{status:200,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  return {fetcher,bodies};
}
function claim(executionId:number,ticketId:number){
  return {
    requestId:"satchel:ticket:"+executionId,
    chainId:"wolo-1" as const,denom:"uwolo" as const,
    senderAddress:vault,recipientAddress:escrow,
    amountUwolo:"250000000",
    memo:"AoE2HDBets bet ticket v1 · ticket "+ticketId,
  };
}
test("signer loopback identity challenge authenticates without leaking key",async()=>{
  const {fetcher,bodies}=rig();
  const client=await makeSatchelLoopbackSigner(fetcher);
  assert.equal(client.custodyRole,"exclusive-war-satchel-v1");
  assert.equal(client.attestedVaultAddress,vault);
  assert.deepEqual(bodies,[]);
});
test("two different exact Watcher games can be submitted, same ID never resubmits",async()=>{
  const {fetcher,bodies}=rig();
  const client=await makeSatchelLoopbackSigner(fetcher);
  const first=await client.submitOneShot(claim(7,81));
  const second=await client.submitOneShot(claim(8,82));
  const duplicate=await client.submitOneShot(claim(7,81));
  assert.deepEqual(first,{kind:"broadcast_confirmed",txHash:"AB".repeat(32)});
  assert.deepEqual(second,first);
  assert.deepEqual(duplicate,{kind:"unknown",reason:"same_payment_id_never_retried"});
  assert.equal(bodies.length,2);
  assert.deepEqual(bodies.map(x=>x.requestId),["satchel:ticket:7","satchel:ticket:8"]);
});
test("an arbitrary memo, external payout account, or overlarge stake is never sent",async()=>{
  const {fetcher,bodies}=rig();
  const client=await makeSatchelLoopbackSigner(fetcher);
  assert.equal((await client.submitOneShot({...claim(7,81),memo:"send to me"})).kind,"unknown");
  assert.equal((await client.submitOneShot({...claim(8,82),recipientAddress:vault})).kind,"unknown");
  assert.equal((await client.submitOneShot({...claim(9,83),amountUwolo:"1001000000"})).kind,"unknown");
  assert.equal(bodies.length,0);
});
test("missing signer HTTP acknowledgement is UNKNOWN, never a rejection or retry",async()=>{
  const {fetcher,bodies}=rig(true);
  const client=await makeSatchelLoopbackSigner(fetcher);
  const first=await client.submitOneShot(claim(7,81));
  const second=await client.submitOneShot(claim(7,81));
  assert.deepEqual(first,{kind:"unknown",reason:"sidecar_http_or_transport_unknown"});
  assert.equal(second.kind,"unknown");
  assert.equal(bodies.length,1);
});
