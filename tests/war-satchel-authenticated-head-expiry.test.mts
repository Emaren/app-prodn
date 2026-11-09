import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedWarSatchelDepositFreshAt,
  verifiedDepositTranscriptHeadExpiry,
} from "../lib/warSatchelAuthenticatedDeposit.ts";

const now = Date.parse("2026-10-18T12:00:00.000Z");
function transcript(primary: string, witness = primary) {
  return {proof:{version:1,chain_id:"wolo-1",kind:"deposit",responses:[
    ...["primary","witness"].map((source,index)=>({source,path:"/status",query:"",body:{result:{
      node_info:{network:"wolo-1"},sync_info:{catching_up:false,
        latest_block_time:index===0?primary:witness},
    }}})),
  ]}};
}

test("near-expired authenticated head keeps its original deadline after verification",()=>{
  const raw=JSON.stringify(transcript("2026-10-18T11:59:31.000Z"));
  assert.equal(verifiedDepositTranscriptHeadExpiry(raw,now),now+1000);
  // A five-second database lock wait must not become another 30 seconds of
  // authority merely because the verifier returned a moment earlier.
  assert.throws(()=>verifiedDepositTranscriptHeadExpiry(raw,now+5000),/authenticated_chain_head_expired/);
  assert.throws(()=>verifiedDepositTranscriptHeadExpiry(raw,now+1000),/authenticated_chain_head_expired/);
});

test("the independent witness can expire before the primary head",()=>{
  const raw=JSON.stringify(transcript("2026-10-18T11:59:59Z","2026-10-18T11:59:30.250Z"));
  assert.equal(verifiedDepositTranscriptHeadExpiry(raw,now),now+250);
  assert.throws(()=>verifiedDepositTranscriptHeadExpiry(raw,now+251),/authenticated_chain_head_expired/);
});

test("RFC3339Nano fractions are preserved conservatively and future heads remain bounded",()=>{
  assert.equal(verifiedDepositTranscriptHeadExpiry(JSON.stringify(transcript("2026-10-18T11:59:30.123456789Z")),now),now+123);
  assert.equal(verifiedDepositTranscriptHeadExpiry(JSON.stringify(transcript("2026-10-18T12:00:05Z")),now),now+35000);
  assert.throws(()=>verifiedDepositTranscriptHeadExpiry(JSON.stringify(transcript("2026-10-18T12:00:05.001Z")),now),/authenticated_head_metadata_invalid/);
});

test("missing, duplicate, wrong-chain or invalid status metadata cannot provide a deadline",()=>{
  for(const change of [
    (x:ReturnType<typeof transcript>)=>{x.proof.responses.pop();},
    (x:ReturnType<typeof transcript>)=>{x.proof.responses.push(x.proof.responses[0]);},
    (x:ReturnType<typeof transcript>)=>{x.proof.responses[1].body.result.node_info.network="wrong-chain";},
    (x:ReturnType<typeof transcript>)=>{x.proof.responses[1].body.result.sync_info.catching_up=true;},
    (x:ReturnType<typeof transcript>)=>{x.proof.responses[1].body.result.sync_info.latest_block_time="yesterday";},
    (x:ReturnType<typeof transcript>)=>{x.proof.responses[1].query="caller=head";},
  ]){
    const value=transcript("2026-10-18T11:59:59Z");change(value);
    assert.throws(()=>verifiedDepositTranscriptHeadExpiry(JSON.stringify(value),now),/authenticated_head_metadata/);
  }
  assert.throws(()=>verifiedDepositTranscriptHeadExpiry(" ".repeat(15*1024*1024+1),now),/authenticated_head_metadata_invalid/);
});

test("numeric metadata and copied proof properties never forge a fresh opaque deposit",()=>{
  assert.equal(authenticatedWarSatchelDepositFreshAt({verifiedAtMs:now,authenticatedHeadExpiresAtMs:now+30000},now),false);
  assert.equal(authenticatedWarSatchelDepositFreshAt(null,now),false);
});

test("case and Unicode aliases cannot select an unauthenticated freshness timestamp",()=>{
  for(const inject of [
    (x:ReturnType<typeof transcript>)=>Object.assign(x.proof.responses[0].body,{RESULT:x.proof.responses[0].body.result}),
    (x:ReturnType<typeof transcript>)=>Object.assign(x.proof.responses[0].body.result,{SYNC_INFO:{latest_block_time:"2026-10-18T11:59:31Z",catching_up:false}}),
    (x:ReturnType<typeof transcript>)=>Object.assign(x.proof.responses[0].body.result,{"ſync_info":{latest_block_time:"2026-10-18T11:59:31Z",catching_up:false}}),
    (x:ReturnType<typeof transcript>)=>Object.assign(x.proof.responses[0].body.result.sync_info,{LATEST_BLOCK_TIME:"2026-10-18T11:59:31Z"}),
    (x:ReturnType<typeof transcript>)=>Object.assign(x.proof.responses[0].body.result.node_info,{NETWORK:"other-chain"}),
  ]){
    const value=transcript("2026-10-18T11:59:59Z");inject(value);
    assert.throws(()=>verifiedDepositTranscriptHeadExpiry(JSON.stringify(value),now),/authenticated_head_metadata_aliased_or_unknown/);
  }
});
