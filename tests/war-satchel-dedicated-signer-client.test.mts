import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectCertifiedSatchelSigner,
} from "../lib/warSatchelDedicatedSignerClient.ts";

const addr="wolo1"+"p".repeat(38);
const escrow="wolo1"+"q".repeat(38);
const code="a".repeat(64);
const token="T".repeat(80);
const envKeys=[
  "WAR_SATCHEL_SIGNER_CLIENT_ENABLED",
  "WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED",
  "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
  "WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS",
  "WAR_SATCHEL_SIGNER_BUILD_SHA256",
  "WAR_SATCHEL_SIGNER_AUTH_TOKEN",
  "WOLO_BET_ESCROW_ADDRESS",
];
const original=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
function configure() {
  Object.assign(process.env,{
    WAR_SATCHEL_SIGNER_CLIENT_ENABLED:"true",
    WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED:"true",
    WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",
    WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:addr,
    WAR_SATCHEL_SIGNER_BUILD_SHA256:code,
    WAR_SATCHEL_SIGNER_AUTH_TOKEN:token,
    WOLO_BET_ESCROW_ADDRESS:escrow,
  });
}
function restore(){
  for(const k of envKeys) {
    if(original[k]===undefined)delete process.env[k];
    else process.env[k]=original[k];
  }
}
function health(override:Record<string,unknown>={}){
  return {
    ok:true,chain_id:"wolo-1",signer_role:"exclusive-war-satchel-v1",
    durable_one_shot:true,replay_after_restart_forbidden:true,
    refunds_require_chain_proof:true,
    vault_address:addr,build_sha256:code,
    custody_mnemonic_shared_with_other_roles:false,
    ...override,
  };
}
function mockRead(healthBody:Record<string,unknown>,resultBody:Record<string,unknown>){
  let healthCalls=0,sendCalls=0;
  const reader=async (input:RequestInfo | URL, init?:RequestInit)=>{
    const url=String(input);
    assert.match(url,/^http:\/\/127\.0\.0\.1:8094\/satchel\/v1\//);
    assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer "+token);
    if(url.endsWith("/health")){
      healthCalls++;
      return new Response(JSON.stringify(healthBody),{status:200});
    }
    sendCalls++;
    assert.equal((init?.method||"GET"),"POST");
    return new Response(JSON.stringify(resultBody),{status:200});
  };
  return {reader:reader as typeof fetch,calls:()=>({healthCalls,sendCalls})};
}
const args={
 requestId:"satchel:ticket:112",
 ownerUid:"owner.with.dot",
 chainId:"wolo-1" as const,
 senderAddress:addr,
 recipientAddress:escrow,
 denom:"uwolo" as const,
 amountUwolo:"10000000",
 memo:"AoE2HDBets bet ticket v1 · ticket 112",
};

test("no signer connection if operator has not explicitly activated financial key separation",async()=>{
 try{
   for(const k of envKeys)delete process.env[k];
   let called=false;
   await assert.rejects(async()=>connectCertifiedSatchelSigner((async()=>{
     called=true;throw Error("unexpected signer transport");
   }) as typeof fetch),/operator_activation_not_certified/);
   assert.equal(called,false);
 }finally{restore()}
});
test("independent signer role, hash, and exclusive key attestation must match exactly",async()=>{
 try{
   configure();
   const bad=mockRead(health({custody_mnemonic_shared_with_other_roles:true}),{});
   await assert.rejects(()=>connectCertifiedSatchelSigner(bad.reader),/signer_is_not_exclusive_or_not_attested/);
   assert.equal(bad.calls().sendCalls,0);
 }finally{restore()}
});
test("signed one-shot request goes only once after two pinned service health checks",async()=>{
 try{
   configure();
   const t=mockRead(health(),{
     request_id:args.requestId,chain_id:"wolo-1",
     signer_role:"exclusive-war-satchel-v1",
     broadcast_status:"accepted_once",durable_request_fenced:true,
     tx_hash:"B".repeat(64),
   });
   const signer=await connectCertifiedSatchelSigner(t.reader);
   assert.equal(signer.attestedVaultAddress,addr);
   const response=await signer.submitOneShot(args);
   assert.equal(response.kind,"broadcast_confirmed");
   assert.deepEqual(response,{kind:"broadcast_confirmed",txHash:"B".repeat(64)});
   assert.deepEqual(t.calls(),{healthCalls:2,sendCalls:1});
 }finally{restore()}
});
test("a misleading HTTP 200 without durable signer fence is UNKNOWN, never a successful wager",async()=>{
 try{
   configure();
   const t=mockRead(health(),{
     request_id:args.requestId,chain_id:"wolo-1",
     signer_role:"exclusive-war-satchel-v1",
     broadcast_status:"accepted_once",durable_request_fenced:false,
     tx_hash:"B".repeat(64),
   });
   const signer=await connectCertifiedSatchelSigner(t.reader);
   assert.deepEqual(await signer.submitOneShot(args),
     {kind:"unknown",reason:"signer_receipt_not_proven"});
   assert.equal(t.calls().sendCalls,1);
 }finally{restore()}
});
test("wrong valid recipient, bad memo or wrong account fail BEFORE a signer POST",async()=>{
 try{
   configure();
   const t=mockRead(health(),{});
   const signer=await connectCertifiedSatchelSigner(t.reader);
   for(const dangerous of [
     {...args,ownerUid:""},
     {...args,ownerUid:"different owner"},
     {...args,recipientAddress:addr},
     {...args,recipientAddress:"wolo1"+"r".repeat(38)},
     {...args,memo:"unrelated Wolo bank withdrawal"},
     {...args,memo:"AoE2HDBets bet ticket v1 · ticket 112\nother-send"},
   ]){
     assert.deepEqual(await signer.submitOneShot(dangerous),
       {kind:"unknown",reason:"invalid_or_ambiguous_signer_payload"});
   }
   assert.equal(t.calls().sendCalls,0);
 }finally{restore()}
});
test("a timeout after signing is UNKNOWN, with no automatic second network submission",async()=>{
 try{
   configure();
   let sendCalls=0;
   const reader=(async(input:RequestInfo | URL)=>{
     if(String(input).endsWith("/health"))return new Response(JSON.stringify(health()),{status:200});
     sendCalls++;
     throw Error("connection reset after a valid send");
   }) as typeof fetch;
   const signer=await connectCertifiedSatchelSigner(reader);
   assert.deepEqual(await signer.submitOneShot(args),
     {kind:"unknown",reason:"signer_transport_or_identity_unknown"});
   assert.equal(sendCalls,1);
 }finally{restore()}
});
