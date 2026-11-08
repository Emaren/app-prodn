import test from "node:test";
import assert from "node:assert/strict";
import {searchRestTxs} from "../lib/woloMainnetTransfers.ts";

const originalFetch=globalThis.fetch;
const originalRest=process.env.WOLO_INTERNAL_REST_URL;
const uri="http://127.0.0.1:1318";
const tx=(i:number)=>({txhash:i.toString(16).padStart(64,"0").toUpperCase()});
function install(
  fn:(number:number,limit:number,params:URLSearchParams)=>unknown,
  pages:number[],
){
 process.env.WOLO_INTERNAL_REST_URL=uri;
 globalThis.fetch=(async (url:RequestInfo|URL)=>{
  const parsed=new URL(String(url));
  assert.equal(parsed.origin,uri);
  assert.equal(parsed.pathname,"/cosmos/tx/v1beta1/txs");
  const params=parsed.searchParams;
  assert.equal(params.has("pagination.offset"),false);
  assert.equal(params.has("pagination.page"),false);
  assert.equal(params.has("pagination.limit"),false);
  assert.equal(params.get("query"),"message.action='/cosmos.bank.v1beta1.MsgSend'");
  const number=Number(params.get("page")),limit=Number(params.get("limit"));
  assert.equal(limit,100);
  pages.push(number);
  const value=fn(number,limit,params);
  return new Response(JSON.stringify(value),{status:200,
    headers:{"content-type":"application/json"}});
 }) as typeof fetch;
}
function cleanup(){
 globalThis.fetch=originalFetch;
 if(originalRest===undefined)delete process.env.WOLO_INTERNAL_REST_URL;
 else process.env.WOLO_INTERNAL_REST_URL=originalRest;
}
const query="message.action='/cosmos.bank.v1beta1.MsgSend'";
test("native REST only advances with plain page=N and fixed limit=100",async()=>{
 const calls:number[]=[];
 try {
  install((n,lim)=>({tx_responses:Array.from({length:lim},
   (_,i)=>tx((n-1)*lim+i+1))}),calls);
  const result=await searchRestTxs(query,250);
  assert.equal(result.length,250);
  assert.equal(result[0]?.txhash,tx(1).txhash);
  assert.equal(result[100]?.txhash,tx(101).txhash);
  assert.equal(result[249]?.txhash,tx(250).txhash);
  assert.deepEqual(calls,[1,2,3]);
 } finally {cleanup();}
});
test("truncated non-multiple-of-100 requests preserve immutable page boundaries",async()=>{
 const calls:number[]=[];
 try {
  install((n,lim)=>({tx_responses:Array.from({length:lim},(_,i)=>tx((n-1)*lim+i+1))}),calls);
  const values=await searchRestTxs(query,101);
  assert.deepEqual(calls,[1,2]);
  assert.deepEqual(values.map(v=>v.txhash),Array.from({length:101},(_,i)=>tx(i+1).txhash));
 } finally {cleanup();}
});
test("short final page stops without requesting a nonexistent page",async()=>{
 const calls:number[]=[];
 try{
  install((n,lim)=>({tx_responses:Array.from({length:n===2?12:lim},
   (_,i)=>tx((n-1)*lim+i+1))}),calls);
  assert.equal((await searchRestTxs(query,300)).length,112);
  assert.deepEqual(calls,[1,2]);
 }finally{cleanup();}
});
test("ignored page parameter or overlapping pages fail closed",async()=>{
 const calls:number[]=[];
 try {
  install((_n,lim)=>({tx_responses:Array.from({length:lim},(_,i)=>tx(i+1))}),calls);
  await assert.rejects(searchRestTxs(query,200),/page is invalid or repeated/);
  assert.deepEqual(calls,[1,2]);
 }finally{cleanup();}
});
test("empty transactions page is valid only as actual array",async()=>{
 const calls:number[]=[];
 try{
  install(()=>({tx_responses:[]}),calls);
  assert.deepEqual(await searchRestTxs(query,100),[]);
  assert.deepEqual(calls,[1]);
 }finally{cleanup();}
});
test("malformed 200, oversized, duplicate within page and upstream error deny",async()=>{
 for (const bad of [
  {},{tx_responses:null},{tx_responses:Array.from({length:101},(_,i)=>tx(i+1))},
  {tx_responses:[tx(1),tx(1)]},{tx_responses:[{txhash:"INVALID"}]},
  {code:500,message:"upstream failure",tx_responses:[]},
  [],"not a valid envelope",
 ]) {
  const calls:number[]=[];
  try {
   install(()=>bad,calls);
   await assert.rejects(searchRestTxs(query,100));
   assert.deepEqual(calls,[1]);
  }finally{cleanup();}
 }
});
test("invalid limits never call the network",async()=>{
 let called=false;
 globalThis.fetch=(async()=>{called=true;throw Error("unexpected network");}) as typeof fetch;
 try{
  for(const n of [0,-1,Number.NaN,Number.POSITIVE_INFINITY]){
   await assert.rejects(searchRestTxs(query,n),/limit must be/);
  }
  assert.equal(called,false);
 }finally{cleanup();}
});
