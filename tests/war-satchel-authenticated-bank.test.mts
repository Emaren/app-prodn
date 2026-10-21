import assert from "node:assert/strict";
import test from "node:test";
import {authenticatedWarSatchelBankFreshAt,authenticateWarSatchelBank} from "../lib/warSatchelAuthenticatedBank.ts";
import {verifiedBankReceiptMetadata} from "../lib/warSatchelAuthenticatedFinancialProof.ts";

const now=Date.parse("2026-10-20T20:00:00Z"),vault="wolo1"+"q".repeat(38);
function receipt(){
  return {protocol:1,status:"AUTHENTICATED_BANK_NONAUTHORIZING",chain_id:"wolo-1",denom:"uwolo",vault,
    balance_uwolo:"100000000",height:9,commit_height:10,block_hash:"A".repeat(64),app_hash:"B".repeat(64),
    head_height:10,head_block_hash:"A".repeat(64),head_time:"2026-10-20T19:59:30.123456789Z",
    authenticated_expires_at:"2026-10-20T20:00:00.123456789Z",
    credit_authorized:false,spending_authorized:false,solvency_authorized:false};
}

test("native bank metadata retains original signed-head and trust-anchor deadlines",()=>{
  const raw=receipt(),verified=verifiedBankReceiptMetadata(raw,vault,9,now);
  assert.equal(verified.authenticatedHeadExpiresAtMs,now+123);
  assert.throws(()=>verifiedBankReceiptMetadata(raw,vault,9,now+123),/authenticated_bank_evidence_expired/);
  raw.authenticated_expires_at="2026-10-20T20:00:00.001Z";
  assert.equal(verifiedBankReceiptMetadata(raw,vault,9,now).authenticatedHeadExpiresAtMs,now+1,
    "a near-expired trust anchor cannot gain a fresh head window");
  assert.equal(authenticatedWarSatchelBankFreshAt(verified,now),false,"metadata validation alone issues no capability");
});

test("authenticated historical bank state and mismatched native identities are refused",()=>{
  for(const mutate of [
    (x:ReturnType<typeof receipt>)=>{x.head_height=11;},
    (x:ReturnType<typeof receipt>)=>{x.commit_height=9;},
    (x:ReturnType<typeof receipt>)=>{x.head_block_hash="C".repeat(64);},
    (x:ReturnType<typeof receipt>)=>{x.chain_id="other";},
    (x:ReturnType<typeof receipt>)=>{x.denom="stake";},
    (x:ReturnType<typeof receipt>)=>{x.vault="wolo1"+"p".repeat(38);},
    (x:ReturnType<typeof receipt>)=>{x.block_hash="0".repeat(64);x.head_block_hash=x.block_hash;},
    (x:ReturnType<typeof receipt>)=>{x.credit_authorized=true;},
    (x:ReturnType<typeof receipt>)=>{x.spending_authorized=true;},
    (x:ReturnType<typeof receipt>)=>{x.solvency_authorized=true;},
    (x:ReturnType<typeof receipt>)=>{x.balance_uwolo="9223372036854775808";},
    (x:ReturnType<typeof receipt>)=>{x.balance_uwolo="01";},
    (x:ReturnType<typeof receipt>)=>{Object.assign(x,{HEAD_HEIGHT:10});},
    (x:ReturnType<typeof receipt>)=>{delete (x as Partial<ReturnType<typeof receipt>>).head_height;},
    (x:ReturnType<typeof receipt>)=>{x.head_time="2026-02-30T19:59:30Z";},
  ]){
    const raw=receipt();mutate(raw);
    assert.throws(()=>verifiedBankReceiptMetadata(raw,vault,9,now),/bank_verifier_receipt_invalid/);
  }
  for(const [time,expiry] of [
    ["2026-10-20T19:59:29Z","2026-10-20T19:59:59Z"],
    ["2026-10-20T20:00:06Z","2026-10-20T20:00:30Z"],
    ["2026-10-20T19:59:59Z","2026-10-20T20:00:30Z"],
  ])assert.throws(()=>verifiedBankReceiptMetadata({...receipt(),head_time:time,authenticated_expires_at:expiry},vault,9,now),/authenticated_bank_evidence_expired/);
  assert.equal(verifiedBankReceiptMetadata({...receipt(),balance_uwolo:"0"},vault,9,now).balanceUwolo,0n);
});

test("JSON, copied symbols and recent timestamps never mint bank authority",()=>{
  const claimed={chainId:"wolo-1",denom:"uwolo",vaultAddress:vault,balanceUwolo:100000000n,height:9n,
    observedAtMs:now,authenticatedHeadExpiresAtMs:now+30000,
    [Symbol("authenticated-wolo-comet-bank-state")]:true};
  assert.equal(authenticatedWarSatchelBankFreshAt(claimed,now),false);
  assert.equal(authenticatedWarSatchelBankFreshAt({...claimed},now),false);
  assert.equal(authenticatedWarSatchelBankFreshAt(null,now),false);
});

test("missing independently provisioned authority refuses before any network IO",async()=>{
  const enabled=process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED;
  delete process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED;
  let calls=0;
  try{
    await assert.rejects(authenticateWarSatchelBank(vault,(async()=>{calls++;return Response.json({});}) as typeof fetch),/operator_proof_authority_not_certified/);
    assert.equal(calls,0);
  }finally{
    if(enabled===undefined)delete process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED;
    else process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED=enabled;
  }
});

test("bank export is fixed server-owned, bounded, read-only and rejects untrusted JSON before native IO",async()=>{
  const env={WAR_SATCHEL_PROOF_VERIFIER_ENABLED:"true",WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",
    WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:vault,WAR_SATCHEL_SIGNER_AUTH_TOKEN:"t".repeat(64),
    WAR_SATCHEL_VERIFIER_BINARY:"/nonexistent/isolated-verifier",WAR_SATCHEL_VERIFIER_AUTHORITY_FILE:"/nonexistent/isolated-authority"};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  try{
    for(const response of [
      new Response("{}",{status:503}),new Response("{}",{headers:{"content-type":"text/plain"}}),
      new Response("{}",{headers:{"content-type":"application/json","content-encoding":"gzip"}}),
      new Response("{}",{headers:{"content-type":"application/json","content-length":String(15*1024*1024+1)}}),
      Response.json(receipt()),Response.json({version:1,chain_id:"wrong",denom:"uwolo",address:vault,height:9}),
      Response.json({version:1,chain_id:"wolo-1",denom:"uwolo",address:vault,height:9.5}),
    ]){
      let calls=0;
      const reader=(async(url,options)=>{calls++;assert.equal(url,"http://127.0.0.1:8094/satchel/v1/proofs/bank");
        assert.equal(options?.method,"POST");assert.equal(options?.redirect,"error");
        assert.deepEqual(JSON.parse(String(options?.body)),{protocol:1});
        assert.equal(new Headers(options?.headers).get("authorization"),"Bearer "+env.WAR_SATCHEL_SIGNER_AUTH_TOKEN);
        return response;}) as typeof fetch;
      await assert.rejects(authenticateWarSatchelBank(vault,reader),/bank_proof_(?:export_unavailable|identity_invalid)/);
      assert.equal(calls,1);
    }
    for(const oversized of [false,true]){
      let released=false;
      const body=new ReadableStream<Uint8Array>({start(controller){
        if(oversized)controller.enqueue(new Uint8Array(15*1024*1024+1));
      },cancel(){released=true;}});
      await assert.rejects(authenticateWarSatchelBank(vault,(async()=>new Response(body,{
        status:oversized?200:503,headers:{"content-type":"application/json"},
      })) as typeof fetch),/bank_proof_(?:export|envelope)_unavailable/);
      assert.equal(released,true,"refused or oversized response bodies must release their network stream");
    }
    const canceled=AbortSignal.abort();let calls=0;
    await assert.rejects(authenticateWarSatchelBank(vault,(async()=>{calls++;throw Error("unexpected");}) as typeof fetch,canceled));
    assert.equal(calls,0);
  }finally{for(const k of Object.keys(env)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
