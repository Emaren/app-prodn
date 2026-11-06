import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";

// Use the *actual* bounded response reader and the production 8094 return
// parser. Earlier transport regressions mocked the entire reply parser and
// could not detect a forged, aliased, oversized, or contradictory response.
// This suite is entirely offline: no signer, bank, database, or network.
const transportSource=readFileSync("lib/woloBetSettlement.ts","utf8");
const bodySource=readFileSync("lib/warSatchelBoundedBody.ts","utf8");
const start=transportSource.indexOf('const SATCHEL_RETURN_ENDPOINT="http://127.0.0.1:8094/satchel/v1/returns";');
const end=transportSource.indexOf("/** One fixed 8094 request using the runtime",start);
assert.ok(start>=0 && end>start,"exact native source fragment must exist");
const code=bodySource+"\n"+transportSource.slice(start,end)+"\nexports.__realSatchelReply=satchelReturnReply;\n";
const compiled=ts.transpileModule(code,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const exports:Record<string,unknown>={};
runInNewContext(compiled,{
  exports,Uint8Array,TextDecoder,ReadableStream,AbortSignal,JSON,Set,
  process:{env:{}},Error,Number,Object,RegExp,
});
const parse=exports.__realSatchelReply as
  (response:Response,claimId:string,signal:AbortSignal)=>Promise<Record<string,unknown>>;
const claim="101";
const good={
  operation_id:"satchel:claim-return:101",status:"UNKNOWN",
  reason:"broadcast_uncertain",durable_fenced:true,
};
function body(bytes:Uint8Array):ReadableStream<Uint8Array>{
  return new ReadableStream<Uint8Array>({start(controller){
    controller.enqueue(bytes);controller.close();
  }});
}
function reply(input:string|Uint8Array,opts?:{status?:number,encoding?:string}):Response{
  const bytes=typeof input==="string"?new TextEncoder().encode(input):input;
  return {
    status:opts?.status??200,ok:(opts?.status??200)===200,
    headers:new Headers(opts?.encoding?{"Content-Encoding":opts.encoding}:{}),
    body:body(bytes),
  } as Response;
}
const signal=()=>new AbortController().signal;
async function rejected(raw:string|Uint8Array,opts?:{status?:number,encoding?:string}){
  await assert.rejects(parse(reply(raw,opts),claim,signal()));
}
test("real bounded 8094 response parser yields UNKNOWN without payment credit",async()=>{
  const got=await parse(reply(JSON.stringify(good)),claim,signal());
  assert.equal(got.status,"UNKNOWN");
  assert.equal(got.durable_fenced,true);
  assert.equal(got.operation_id,good.operation_id);
  assert.equal(Object.isFrozen(got),true);
  assert.notEqual(got.status,"CONFIRMED");
});
test("real parser rejects contradictory/confirmed financial status",async()=>{
  await rejected(JSON.stringify({...good,status:"CONFIRMED"}));
  await rejected(JSON.stringify({...good,status:"PAID"}));
  await rejected(JSON.stringify({...good,durable_fenced:false}));
});
test("real parser rejects mismatched claim and protected founder 889",async()=>{
  await rejected(JSON.stringify({...good,operation_id:"satchel:claim-return:102"}));
  await assert.rejects(parse(reply(JSON.stringify(good)),"889",signal()));
});
test("real parser refuses duplicated or aliased JSON field names",async()=>{
  await rejected(JSON.stringify(good).replace('"status":"UNKNOWN"','"status":"UNKNOWN","status":"CONFIRMED"'));
  await rejected(JSON.stringify(good).replace('"status"','"\\u0073tatus"'));
});
test("real parser refuses unknown reason and unexpected evidence fields",async()=>{
  await rejected(JSON.stringify({...good,reason:"paid"}));
  await rejected(JSON.stringify({...good,network:"wolo-1"}));
});
test("real parser does not treat a tx hash as independent finality",async()=>{
  const got=await parse(reply(JSON.stringify({...good,tx_hash:"A".repeat(64)})),claim,signal());
  assert.equal(got.status,"UNKNOWN");
  assert.equal(got.tx_hash,"A".repeat(64));
  await rejected(JSON.stringify({...good,tx_hash:"0".repeat(64)}));
  await rejected(JSON.stringify({...good,tx_hash:"not-a-hash"}));
});
test("real parser forbids non-200 and redirects",async()=>{
  await rejected(JSON.stringify(good),{status:404});
  await rejected(JSON.stringify(good),{status:302});
  await rejected(JSON.stringify(good),{status:500});
});
test("real parser refuses compressed or unexpected content encoding",async()=>{
  await rejected(JSON.stringify(good),{encoding:"gzip"});
  await rejected(JSON.stringify(good),{encoding:"br"});
});
test("real parser rejects bytes above exact 64KiB ceiling",async()=>{
  await rejected(JSON.stringify(good)+" ".repeat(65537));
});
test("real parser rejects malformed or invalid UTF-8",async()=>{
  await rejected('{"status":');
  await rejected(new Uint8Array([0xc3,0x28]));
});
test("real parser rejects signed-out/cancelled financial observation",async()=>{
  const abort=new AbortController();
  abort.abort(Error("lease_expired"));
  await assert.rejects(parse(reply(JSON.stringify(good)),claim,abort.signal));
});
test("native production source stays 8094-only, NEVER legacy fallback",()=>{
  assert.match(transportSource,/SATCHEL_RETURN_ENDPOINT="http:\/\/127\.0\.0\.1:8094\/satchel\/v1\/returns"/);
  const relevant=transportSource.slice(start,transportSource.indexOf("export async function verifyStakeTransfer",end));
  assert.doesNotMatch(relevant,/127\.0\.0\.1:8092|executeWoloSettlementRun\(/);
});
