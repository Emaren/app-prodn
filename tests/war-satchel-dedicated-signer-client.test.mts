import assert from "node:assert/strict";
import {createPrivateKey,createPublicKey,sign} from "node:crypto";
import {mkdtempSync,writeFileSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {after,test} from "node:test";
import {connectCertifiedSatchelSigner} from "../lib/warSatchelDedicatedSignerClient.ts";
import {wagerReservationSignBytes,type SatchelWagerReservation} from "../lib/warSatchelWagerReservation.ts";

const addr="wolo1dehxumnwdehxumnwdehxumnwdehxumnwep0k7e";
const escrow="wolo1dahk7mm0dahk7mm0dahk7mm0dahk7mm0c3wh5c";
const code="a".repeat(64),token="T".repeat(80);
const reviewer=createPrivateKey({format:"der",type:"pkcs8",key:Buffer.concat([
 Buffer.from("302e020100300506032b657004220420","hex"),Buffer.alloc(32,11)])});
const pub=createPublicKey(reviewer).export({format:"der",type:"spki"}).subarray(-32).toString("hex");
const directory=realpathSync(mkdtempSync(join(tmpdir(),"satchel-client-public-authority-")));
const authority=join(directory,"withdrawal-authority.json");
const wagerAuthority=join(directory,"wager-authority.json");
const withdrawalPublicKey="3".repeat(64); // purpose-specific, never the wager signer key
writeFileSync(authority,JSON.stringify({approval_public_key_hex:withdrawalPublicKey}),{mode:0o600});
writeFileSync(wagerAuthority,JSON.stringify({wager_approval_public_key_hex:pub}),{mode:0o600});
after(()=>rmSync(directory,{recursive:true,force:true}));
const envKeys=["WAR_SATCHEL_SIGNER_CLIENT_ENABLED","WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED",
 "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED","WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS",
 "WAR_SATCHEL_SIGNER_BUILD_SHA256","WAR_SATCHEL_SIGNER_AUTH_TOKEN","WOLO_BET_ESCROW_ADDRESS",
 "WAR_SATCHEL_VERIFIER_AUTHORITY_FILE","WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE"];
const original=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
function configure(){Object.assign(process.env,{
 WAR_SATCHEL_SIGNER_CLIENT_ENABLED:"true",WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED:"true",
 WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:addr,
 WAR_SATCHEL_SIGNER_BUILD_SHA256:code,WAR_SATCHEL_SIGNER_AUTH_TOKEN:token,
 WOLO_BET_ESCROW_ADDRESS:escrow,WAR_SATCHEL_VERIFIER_AUTHORITY_FILE:authority,
 WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE:wagerAuthority,
});}
function restore(){for(const k of envKeys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}}
function args(patch:Partial<SatchelWagerReservation>={}){
 const now=Math.floor(Date.now()/1000);
 const reservation:SatchelWagerReservation={version:1,operation_id:"satchel:ticket:112",owner_id:"owner.with.dot",
  vault:addr,recipient:escrow,amount_uwolo:"10000000",memo:"AoE2HDBets bet ticket v1 · ticket 112",
  reservation_digest:"c".repeat(64),ledger_revision:"d".repeat(64),consent_digest:"e".repeat(64),
  fee_uwolo:"5000",issued_at:now-1,expires_at:now+120,signature:"",...patch};
 const signed={...reservation,signature:sign(null,wagerReservationSignBytes(reservation),reviewer).toString("base64")};
 return {requestId:signed.operation_id,ownerUid:signed.owner_id,chainId:"wolo-1" as const,senderAddress:addr,
  recipientAddress:escrow,denom:"uwolo" as const,amountUwolo:signed.amount_uwolo,memo:signed.memo,reservation:signed};
}
function health(patch:Record<string,unknown>={}){return {ok:true,accepting:true,chain_id:"wolo-1",signer_role:"exclusive-war-satchel-v1",
 durable_one_shot:true,replay_after_restart_forbidden:true,refunds_require_chain_proof:true,vault_address:addr,
 build_sha256:code,custody_mnemonic_shared_with_other_roles:false,execution_protocol:2,
 owner_bound_wager_reservation_required:true,...patch};}
function ack(patch:Record<string,unknown>={}){return {operation_id:"satchel:ticket:112",request_id:"satchel:ticket:112",
 chain_id:"wolo-1",signer_role:"exclusive-war-satchel-v1",status:"ACCEPTED",kind:"broadcast_accepted",confirmed:false,
 reason:"accepted",durable_request_fenced:true,tx_hash:"B".repeat(64),credit_authorized:false,...patch};}
function mockRead(result:Record<string,unknown>=ack(),h:Record<string,unknown>=health()){
 let healthCalls=0,sendCalls=0;
 const reader=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer "+token);
  if(url.endsWith("/health")){healthCalls++;return Response.json(h);}
  sendCalls++;assert.equal(url,"http://127.0.0.1:8094/satchel/v2/one-shot");
  const body=JSON.parse(String(init?.body));assert.equal(body.protocol,2);assert.equal(body.owner_id,"owner.with.dot");
  assert.equal(body.reservation.operation_id,body.request_id);return Response.json(result);
 }) as typeof fetch;
 return {reader,calls:()=>({healthCalls,sendCalls})};
}

test("no signer connection without explicit operator gates",async()=>{try{
 for(const k of envKeys)delete process.env[k];let calls=0;
 await assert.rejects(()=>connectCertifiedSatchelSigner((async()=>{calls++;throw Error("unexpected");})as typeof fetch),/operator_activation_not_certified/);
 assert.equal(calls,0);
}finally{restore();}});

test("health must advertise exact v2 owner review and isolated signer",async()=>{try{configure();
 for(const patch of [{custody_mnemonic_shared_with_other_roles:true},{execution_protocol:1},{owner_bound_wager_reservation_required:false},{accepting:false}]){
  const t=mockRead(ack(),health(patch));await assert.rejects(()=>connectCertifiedSatchelSigner(t.reader),/signer_is_not_exclusive_or_not_attested/);assert.equal(t.calls().sendCalls,0);
 }
}finally{restore();}});

test("signed v2 one-shot returns broadcast_accepted only, never financial confirmation",async()=>{try{configure();
 const t=mockRead();const signer=await connectCertifiedSatchelSigner(t.reader);const input=args();
 assert.deepEqual(await signer.submitOneShot(input),{kind:"broadcast_accepted",txHash:"B".repeat(64)});
 assert.deepEqual(t.calls(),{healthCalls:2,sendCalls:1});
}finally{restore();}});

test("even service CONFIRMED is only a candidate for independent proof",async()=>{try{configure();
 const result=ack({status:"CONFIRMED",kind:"unknown"});delete (result as Record<string,unknown>).confirmed;
 const t=mockRead(result);const signer=await connectCertifiedSatchelSigner(t.reader);
 assert.deepEqual(await signer.submitOneShot(args()),{kind:"broadcast_accepted",txHash:"B".repeat(64)});
}finally{restore();}});

test("expired, forged, cross-owner or changed fee approvals never POST",async()=>{try{configure();
 const t=mockRead(),signer=await connectCertifiedSatchelSigner(t.reader),valid=args();
 const inputs=[args({issued_at:Math.floor(Date.now()/1000)-20,expires_at:Math.floor(Date.now()/1000)-1}),
 {...valid,ownerUid:"other-owner"},{...valid,reservation:{...valid.reservation,fee_uwolo:"6000"}},
 {...valid,reservation:{...valid.reservation,signature:"A".repeat(86)+"=="}},
 {...valid,reservation:undefined},{...valid,memo:"AoE2HDBets bet ticket v1 · ticket 113"}];
 for(const input of inputs)assert.equal((await signer.submitOneShot(input as typeof valid)).kind,"unknown");
 assert.equal(t.calls().sendCalls,0);
}finally{restore();}});

test("configuration change before send or during health prevents POST",async()=>{try{configure();
 const t=mockRead(),signer=await connectCertifiedSatchelSigner(t.reader);process.env.WAR_SATCHEL_SIGNER_BUILD_SHA256="f".repeat(64);
 assert.equal((await signer.submitOneShot(args())).kind,"unknown");assert.equal(t.calls().sendCalls,0);
 configure();let calls=0,sends=0;
 const reader=(async(input:RequestInfo|URL)=>{if(String(input).endsWith("/health")){if(++calls===2)process.env.WOLO_BET_ESCROW_ADDRESS=addr;return Response.json(health());}sends++;return Response.json(ack());})as typeof fetch;
 const other=await connectCertifiedSatchelSigner(reader);assert.equal((await other.submitOneShot(args())).kind,"unknown");assert.equal(sends,0);
}finally{restore();}});

test("review expiry during health is caught before POST",async()=>{try{configure();
 let calls=0,sends=0;const originalNow=Date.now;const current=originalNow();
 const reader=(async(input:RequestInfo|URL)=>{if(String(input).endsWith("/health")){if(++calls===2)Date.now=()=>current+400000;return Response.json(health());}sends++;return Response.json(ack());})as typeof fetch;
 try{const signer=await connectCertifiedSatchelSigner(reader);const input=args();assert.equal((await signer.submitOneShot(input)).kind,"unknown");assert.equal(sends,0);}finally{Date.now=originalNow;}
}finally{restore();}});

test("forged ACK, legacy aliases, zero hash and uncertain states remain UNKNOWN",async()=>{try{configure();
 for(const patch of [{operation_id:"satchel:ticket:113"},{request_id:"satchel:ticket:113"},{chain_id:"other"},
  {signer_role:"payout"},{durable_request_fenced:false},{tx_hash:"0".repeat(64)},{tx_hash:"bad"},
  {status:"UNKNOWN"},{status:"FAILED"},{status:"REFUSED"},{confirmed:true},{credit_authorized:true},
  {kind:"broadcast_confirmed"},{broadcast_status:"accepted_once"},{txHash:"B".repeat(64)}]){
  const t=mockRead(ack(patch));const signer=await connectCertifiedSatchelSigner(t.reader);
  assert.equal((await signer.submitOneShot(args())).kind,"unknown",JSON.stringify(patch));assert.equal(t.calls().sendCalls,1);
 }
}finally{restore();}});

test("lost response or HTTP refusal never retries automatically",async()=>{try{configure();
 for(const mode of ["timeout","refused"]){let sends=0;
  const reader=(async(input:RequestInfo|URL)=>{if(String(input).endsWith("/health"))return Response.json(health());sends++;if(mode==="timeout")throw Error("lost ACK");return new Response("refused",{status:409});})as typeof fetch;
  const signer=await connectCertifiedSatchelSigner(reader);assert.equal((await signer.submitOneShot(args())).kind,"unknown");assert.equal(sends,1);
 }
}finally{restore();}});

test("oversized and malformed chunked responses are bounded and cancelled",async()=>{try{configure();
 let cancelled=0,reads=0;
 const reader=(async(input:RequestInfo|URL)=>{if(String(input).endsWith("/health"))return Response.json(health());return new Response(new ReadableStream({pull(c){reads++;if(reads>8)c.close();else c.enqueue(new Uint8Array(17000));},cancel(){cancelled++;}}));})as typeof fetch;
 const signer=await connectCertifiedSatchelSigner(reader);assert.equal((await signer.submitOneShot(args())).kind,"unknown");
 assert(cancelled>0);assert(reads<5);
 for(const length of ["-1","NaN","16385"]){const bad=(async()=>new Response("{}",{headers:{"content-length":length}}))as typeof fetch;await assert.rejects(()=>connectCertifiedSatchelSigner(bad));}
}finally{restore();}});

test("caller cancellation interrupts a stalled response body without another submit",async()=>{try{configure();
 const controller=new AbortController();let sends=0,cancelled=0;
 const reader=(async(input:RequestInfo|URL)=>{if(String(input).endsWith("/health"))return Response.json(health());sends++;return new Response(new ReadableStream({start(){setTimeout(()=>controller.abort(),15);},cancel(){cancelled++;}}));})as typeof fetch;
 const signer=await connectCertifiedSatchelSigner(reader,controller.signal);
 const result=await Promise.race([signer.submitOneShot(args()),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error("cancel was ignored")),1000))]);
 assert.equal(result.kind,"unknown");assert.equal(sends,1);assert(cancelled>0);
}finally{restore();}});


test("pre-aborted connection and bounded concurrent health reads release resources",async()=>{try{configure();
 const already=new AbortController();already.abort();let calls=0;
 const never=(async()=>{calls++;throw Error("unexpected request");})as typeof fetch;
 await assert.rejects(()=>connectCertifiedSatchelSigner(never,already.signal));assert.equal(calls,0);
 const shared=new AbortController();let entered=0;
 const stalled=(async()=>{entered++;return new Response(new ReadableStream<Uint8Array>({}));})as typeof fetch;
 const pending=Array.from({length:4},()=>connectCertifiedSatchelSigner(stalled,shared.signal));
 await assert.rejects(()=>connectCertifiedSatchelSigner(stalled,shared.signal),/signer_client_busy/);
 assert.equal(entered,4);shared.abort();
 const finished=await Promise.allSettled(pending);assert(finished.every(x=>x.status==="rejected"));
 const normal=mockRead();await assert.doesNotReject(()=>connectCertifiedSatchelSigner(normal.reader));
}finally{restore();}});
