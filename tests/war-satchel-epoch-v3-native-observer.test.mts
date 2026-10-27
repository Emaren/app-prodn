import {test} from "node:test";
import assert from "node:assert/strict";
import {readHeldEpochV3Observation} from "../lib/warSatchelEpochV3NativeObserver.ts";
const epoch="epoch_20261026_scope_1",commit="a".repeat(40),
  operationId="satchel:e3:"+epoch+":200";
const ctx={epochId:epoch,expectedWoloSourceCommit:commit,expectedChainId:"wolo-1" as const};
const response=(overrides:Record<string,unknown>={},status=200)=>
  new Response(JSON.stringify({protocol:"aoe2war/escrow-epoch/v3",
    chain_id:"wolo-1",epoch_id:epoch,source_commit:commit,
    operation_id:operationId,bank_verified:true,credit_authorized:true,...overrides}),{
    status,headers:{"content-type":"application/json"}
  });
test("proposed new 8095 escrow observer can only emit UNA UTHENTICATED candidates",async()=>{
  let seenUrl="",seenMethod="";
  const r=await readHeldEpochV3Observation("bank",ctx,async(url,init)=>{
    seenUrl=url;seenMethod=init.method||"";assert.equal(init.redirect,"error");
    assert.equal(init.credentials,"omit");return response();
  });
  assert.match(seenUrl,/^http:\/\/127\.0\.0\.1:8095\/epoch\/v3\/bank\//);
  assert.doesNotMatch(seenUrl,/8092|8093|settlement\/v1\/runs/);
  assert.equal(seenMethod,"GET");
  assert.equal(r.bankVerified,false);assert.equal(r.custodianVerified,false);
  assert.equal(r.moneyAuthorized,false);
});
test("only epoch-bound, canonical operation GET is permitted, never historical claim",async()=>{
  const r=await readHeldEpochV3Observation("operation",{...ctx,operationId},
    async(url,init)=>{assert.equal(init.method,"GET");return response()});
  assert.equal(r.kind,"operation");assert.equal(r.moneyAuthorized,false);
  await assert.rejects(()=>readHeldEpochV3Observation("operation",
    {...ctx,operationId:"satchel:claim-return:889"},async()=>response()),/wrong_epoch_operation/);
  await assert.rejects(()=>readHeldEpochV3Observation("operation",
    {...ctx,operationId:"satchel:e3:epoch_other_scope_1:200"},async()=>response()),/wrong_epoch_operation/);
});
test("transport cannot promote source/epoch/chain impostors to evidence",async()=>{
  for(const changes of [{epoch_id:"epoch_other_scope_1"},{chain_id:"testnet"},
    {source_commit:"b".repeat(40)},{protocol:"/settlement/v1/runs"}]){
    await assert.rejects(()=>readHeldEpochV3Observation("bank",ctx,
      async()=>response(changes)),/source_or_epoch_mismatch/);
  }
});
test("unimplemented executor HTTP 404 and unreachable fail closed without old fallback",async()=>{
  await assert.rejects(()=>readHeldEpochV3Observation("bank",ctx,
    async()=>response({},404)),/native_observer_not_installed/);
  await assert.rejects(()=>readHeldEpochV3Observation("bank",ctx,
    async()=>{throw Error("refused")}),/native_observer_unavailable/);
});
test("incorrect operation, invalid canonical hash and oversized body rejected",async()=>{
  await assert.rejects(()=>readHeldEpochV3Observation("operation",{...ctx,operationId},
    async()=>response({operation_id:"other"})),/wrong_operation/);
  await assert.rejects(()=>readHeldEpochV3Observation("bank",
    {...ctx,expectedWoloSourceCommit:"0".repeat(64)},async()=>response()),/invalid_source_or_epoch/);
  await assert.rejects(()=>readHeldEpochV3Observation("bank",ctx,
    async()=>new Response(JSON.stringify({data:"x".repeat(65*1024)}),{
      headers:{"content-type":"application/json"}})),/oversized_native_observation|native_observation_body_bounded/);
});
