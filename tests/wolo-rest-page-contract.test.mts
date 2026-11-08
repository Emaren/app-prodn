import assert from "node:assert/strict";
import test from "node:test";
import { searchNativeWoloRestPages } from "../lib/woloRestTxPages.ts";
const h=(i:number)=>i.toString(16).toUpperCase().padStart(64,"0");
const corpus=Array.from({length:230},(_,i)=>({txhash:h(i+1)}));
const endpoint="http://127.0.0.1:1318";
function fixture(mode:"normal"|"replayed"|"badtotal"|"short"="normal") {
 const calls:string[]=[];
 return {
  calls,
  load:async(url:string)=>{
   const u=new URL(url);
   calls.push(url);
   assert.equal(u.pathname,"/cosmos/tx/v1beta1/txs");
   assert.equal(u.searchParams.get("order_by"),"ORDER_BY_DESC");
   assert.equal(u.searchParams.get("limit"),"100");
   assert.equal(u.searchParams.get("pagination.offset"),null);
   assert.equal(u.searchParams.get("pagination.page"),null);
   const page=Number(u.searchParams.get("page"));
   const effective=mode==="replayed"?1:page;
   const tx_responses=corpus.slice((effective-1)*100,effective*100);
   if(mode==="short"&&page===2)tx_responses.length=5;
   return {
    tx_responses,
    pagination:{total:mode==="badtotal"&&page===2?"245":"230"},
   };
  },
 };
}
test("real Cosmos REST contract: bare 1-based page and fixed 100 limit",async()=>{
 const f=fixture();
 const result=await searchNativeWoloRestPages({restUrl:endpoint,query:"message.action='MsgSend'",limit:230,load:f.load});
 assert.deepEqual(result,corpus);
 assert.deepEqual(f.calls.map(u=>new URL(u).searchParams.get("page")),["1","2","3"]);
 assert.equal(new Set(result.map(x=>x.txhash)).size,230);
});
test("non-page-offset source stops at requested record count without losing 2nd page",async()=>{
 const f=fixture();
 const rows=await searchNativeWoloRestPages({restUrl:endpoint,query:"x",limit:125,load:f.load});
 assert.equal(rows.length,125);
 assert.equal(rows[124].txhash,h(125));
 assert.deepEqual(f.calls.map(u=>new URL(u).searchParams.get("page")),["1","2"]);
});
test("replayed first page on second request fails; no false success",async()=>{
 const f=fixture("replayed");
 await assert.rejects(searchNativeWoloRestPages({restUrl:endpoint,query:"x",limit:200,load:f.load}),/duplicate_or_replayed_page/);
});
test("changing total, truncated pages and malformed hashes fail",async()=>{
 for (const mode of ["badtotal","short"] as const) {
  const f=fixture(mode);
  await assert.rejects(searchNativeWoloRestPages({restUrl:endpoint,query:"x",limit:230,load:f.load}),/total_changed|truncated_page/);
 }
 await assert.rejects(searchNativeWoloRestPages({restUrl:endpoint,query:"x",limit:1,load:async()=>({tx_responses:[{txhash:"invalid"}]})}),/invalid_txhash/);
});
test("server error, missing tx_responses, impossible total, bounded request all fail",async()=>{
 const inputs=[
  {code:7,message:"upstream error",tx_responses:[]},
  {code:0},
  {tx_responses:[],pagination:{total:"not-int"}},
 ];
 for(const data of inputs){
  await assert.rejects(searchNativeWoloRestPages({restUrl:endpoint,query:"x",limit:2,load:async()=>data}),/invalid_response|bad_total/);
 }
 const f=fixture();
 await assert.rejects(searchNativeWoloRestPages({restUrl:endpoint,query:"x",limit:100001,load:f.load}),/invalid_request/);
 assert.equal(f.calls.length,0);
});
