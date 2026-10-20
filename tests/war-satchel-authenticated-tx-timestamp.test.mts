import assert from "node:assert/strict";
import test from "node:test";
import {verifiedFinancialTranscriptTxTimestamp,financialProofFreshAt} from "../lib/warSatchelAuthenticatedFinancialProof.ts";

const hash="B".repeat(64), height=BigInt(100);
function commit(time="2026-10-18T19:00:01.123456789Z"){
  return {source:"primary",path:"/commit",query:"height=100",body:{jsonrpc:"2.0",id:1,result:{canonical:true,
    signed_header:{header:{chain_id:"wolo-1",height:"100",time},
      commit:{height:"100",round:0,block_id:{hash,parts:{total:1,hash:"C".repeat(64)}},signatures:[]}}}}};
}
function envelope(responses:unknown[]=[commit()]){
  return {height:100,block_hash:hash,proof:{version:1,chain_id:"wolo-1",kind:"transfer",responses}};
}
function extract(value:unknown=envelope()){return verifiedFinancialTranscriptTxTimestamp(JSON.stringify(value),height,hash);}

test("matched authenticated commit retains all original RFC3339Nano fractional digits",()=>{
 for(const time of ["2026-10-18T19:00:01Z","2026-10-18T19:00:01.1Z","2026-10-18T19:00:01.123456789Z",
   "2026-10-18T19:00:01.123000000Z","2026-10-18T21:00:01.000000001+02:00"]){
  assert.equal(extract(envelope([commit(time)])),time);
 }
 assert.equal(financialProofFreshAt({...envelope(),txTimestamp:extract()}),false,"metadata is not authentication");
});

test("same replay commit may repeat but inconsistent timestamps cannot select an observation",()=>{
 assert.equal(extract(envelope([commit(),commit()])),"2026-10-18T19:00:01.123456789Z");
 assert.throws(()=>extract(envelope([commit(),commit("2026-10-18T19:00:01.123456788Z")])),/timestamp_inconsistent/);
});

test("REST, witness, another height and block-only responses cannot supply canonical time",()=>{
 for(const replacement of [{...commit(),source:"witness"},{...commit(),path:"/block"},
   {...commit(),query:"height=101"},{...commit(),query:"height=0100"},
   {source:"rest",path:"/cosmos/tx/v1beta1/txs/"+"A".repeat(64),query:"",body:{tx_response:{timestamp:"2026-10-18T19:00:01Z"}}}]){
  assert.throws(()=>extract(envelope([replacement])),/timestamp_missing/);
 }
 assert.throws(()=>extract(envelope([])),/timestamp_metadata_invalid/);
});

test("receipt, header and signed commit height/block/chain identities must all agree",()=>{
 for(const mutate of [
  (c:ReturnType<typeof commit>)=>{c.body.result.signed_header.header.height="101";},
  (c:ReturnType<typeof commit>)=>{c.body.result.signed_header.commit.height="101";},
  (c:ReturnType<typeof commit>)=>{c.body.result.signed_header.commit.block_id.hash="C".repeat(64);},
  (c:ReturnType<typeof commit>)=>{c.body.result.signed_header.header.chain_id="other";},
  (c:ReturnType<typeof commit>)=>{c.body.result.canonical=false;},
 ]){const c=commit();mutate(c);assert.throws(()=>extract(envelope([c])),/timestamp_identity_mismatch/);}
 for(const bad of [{...envelope(),height:101},{...envelope(),block_hash:"C".repeat(64)},
  {...envelope(),proof:{...envelope().proof,chain_id:"other"}}]){
  assert.throws(()=>extract(bad),/timestamp_metadata_invalid/);
 }
 const numeric=commit();(numeric.body.result.signed_header.header as Record<string,unknown>).height=100;
 assert.throws(()=>extract(envelope([numeric])),/timestamp_identity_mismatch/);
});

test("malformed dates, subnanosecond fractions, invalid zones and aliases fail closed",()=>{
 for(const time of ["2026-02-29T19:00:01Z","2026-04-31T19:00:01Z","2026-10-18T24:00:01Z",
  "2026-10-18T19:60:01Z","2026-10-18T19:00:60Z","2026-10-18 19:00:01Z",
  "2026-10-18T19:00:01.1234567890Z","2026-10-18T19:00:01,1Z",
  "2026-10-18T19:00:01+24:00","2026-10-18T19:00:01+00:60","not-a-clock"]){
  assert.throws(()=>extract(envelope([commit(time)])),/timestamp_identity_mismatch/,time);
 }
 const c=commit();Object.assign(c.body.result.signed_header.header,{Time:"2026-10-18T19:00:01Z"});
 assert.throws(()=>extract(envelope([c])),/timestamp_metadata_invalid/);
 const malformed=commit();(malformed.body.result.signed_header.header as Record<string,unknown>).time=null;
 assert.throws(()=>extract(envelope([malformed])),/timestamp_identity_mismatch/);
});

test("missing structures, conflicting matching block identities and resource limits refuse",()=>{
 assert.throws(()=>extract({}),/offline_receipt_malformed/);
 const missing=commit();delete (missing.body.result.signed_header as Record<string,unknown>).commit;
 assert.throws(()=>extract(envelope([missing])),/offline_receipt_malformed/);
 const different=commit();different.body.result.signed_header.commit.block_id.hash="D".repeat(64);
 assert.throws(()=>extract(envelope([commit(),different])),/timestamp_identity_mismatch/);
 assert.throws(()=>extract(envelope(Array.from({length:81},()=>commit()))),/timestamp_metadata_invalid/);
 for(const [h,b]of [[BigInt(0),hash],[BigInt(Number.MAX_SAFE_INTEGER)+BigInt(1),hash],[height,"0".repeat(64)],[height,"bad"]]as const){
  assert.throws(()=>verifiedFinancialTranscriptTxTimestamp(JSON.stringify(envelope()),h,b),/timestamp_metadata_invalid/);
 }
});
