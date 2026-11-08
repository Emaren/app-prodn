import assert from "node:assert/strict";
import test from "node:test";
import { collectPagedCosmosRestTxs } from "../lib/woloRestTxPagination.ts";

const tx = (i: number) => ({ txhash: i.toString(16).padStart(64,"0").toUpperCase() });
const scan = (limit: number, fake: (page: number) => unknown) => {
  const urls: URL[] = [];
  return collectPagedCosmosRestTxs({
    restUrl: "http://127.0.0.1:1318",
    query: "message.action='/cosmos.bank.v1beta1.MsgSend'",
    limit, maxLimit: 100000,
    fetchPage: async url => {
      const u = new URL(url);
      urls.push(u);
      assert.equal(u.searchParams.has("pagination.offset"),false);
      assert.equal(u.searchParams.has("pagination.page"),false);
      assert.equal(u.searchParams.get("limit"),"100");
      return fake(Number(u.searchParams.get("page"))) as any;
    },
  }).then(rows => ({rows, urls}));
};
test("43 native pages return 4300 unique messages; page 2 must differ", async()=>{
  const {rows,urls}=await scan(4300,p=>({
    pagination:{total:"4300"},
    tx_responses:Array.from({length:100},(_,i)=>tx((p-1)*100+i)),
  }));
  assert.equal(rows.length,4300);
  assert.equal(urls.length,43);
  assert.equal(urls[0].searchParams.get("page"),"1");
  assert.equal(urls[1].searchParams.get("page"),"2");
  assert.notEqual(rows[0].txhash,rows[100].txhash);
});
test("fixed 100-per-page geometry preserves requested smaller limit",async()=>{
  const {rows,urls}=await scan(120,p=>({
    pagination:{total:"4300"},
    tx_responses:Array.from({length:100},(_,i)=>tx((p-1)*100+i)),
  }));
  assert.equal(rows.length,120);assert.equal(urls.length,2);
});
test("offset-ignoring server that repeats page one fails closed",async()=>{
  await assert.rejects(scan(200,()=>({tx_responses:Array.from({length:100},(_,i)=>tx(i))})),/DUPLICATE/);
});
test("false 200, malformed payload and invalid server error fail closed",async()=>{
  for(const payload of [{ok:false},null,{code:7,tx_responses:[]},{tx_responses:"bad"}]){
    await assert.rejects(scan(10,()=>payload),/PAGE_INVALID/);
  }
});
test("reported total cannot terminate on a truncated page",async()=>{
  await assert.rejects(scan(300,()=>({pagination:{total:"300"},tx_responses:[tx(0)]})),/PREMATURE_END/);
});
test("inconsistent totals, invalid hashes and oversize pages rejected",async()=>{
  await assert.rejects(scan(200,p=>({pagination:{total:String(p===1?200:201)},tx_responses:Array.from({length:100},(_,i)=>tx((p-1)*100+i))})),/TOTAL_DRIFT/);
  await assert.rejects(scan(1,()=>({tx_responses:[{txhash:"not-a-hash"}]})),/DUPLICATE_OR_MISSING_HASH/);
  await assert.rejects(scan(200,()=>({tx_responses:Array.from({length:101},(_,i)=>tx(i))})),/PAGE_OVERSIZE/);
});
test("request timeout/transport exception propagates, never a partial success",async()=>{
  await assert.rejects(scan(200,p=>{if(p===2)throw new Error("timeout");return {tx_responses:Array.from({length:100},(_,i)=>tx(i))};}),/timeout/);
});
