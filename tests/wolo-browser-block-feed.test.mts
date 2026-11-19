import test from "node:test";
import assert from "node:assert/strict";
import { parseWoloBrowserBlockFeed } from "../lib/woloBrowserBlockFeed.ts";
const now=Date.parse("2026-11-18T23:56:40.000Z");
const meta=(n,seconds=8,chain="wolo-1")=>({
  block_id:{hash:"A".repeat(64)},
  header:{chain_id:chain,height:String(n),time:new Date(now-seconds*1000).toISOString()},
  block_size:"735",num_txs:"2",
});
const feed=(metas,last=3055556)=>({jsonrpc:"2.0",id:-1,result:{
  last_height:String(last),block_metas:metas,
}});
test("canonical public chain response yields at most 8 newest blocks",()=>{
  const f=parseWoloBrowserBlockFeed(feed(Array.from({length:20},(_,i)=>meta(3055556-i))),null,now);
  assert.equal(f.rows.length,8);
  assert.equal(f.rows[0].height,"3055556");
  assert.equal(f.rows[7].height,"3055549");
  assert.equal(f.latestAgeSeconds,8);
  assert.equal(f.source,"/rpc/blockchain");
  assert.equal(f.rows[0].transactions,2);
  assert.equal(f.progressing,false);
});
test("legitimate forward progression and stale classification are separate",()=>{
  const a=parseWoloBrowserBlockFeed(feed([meta(3055556)]),"3055555",now);
  assert.equal(a.progressing,true);assert.equal(a.stale,false);
  const stalled=parseWoloBrowserBlockFeed(feed([meta(3055556,55)]),"3055556",now);
  assert.equal(stalled.progressing,false);assert.equal(stalled.stale,true);
});
test("wrong chain, regressed height and fraudulent ahead-of-tip rejected",()=>{
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([meta(3055556,8,"wrong")]),null,now),/WRONG_CHAIN/);
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([meta(3055556)]),"3055557",now),/REGRESSION/);
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([meta(3055558)]),null,now),/OUTSIDE_WINDOW/);
});
test("missing, too-large, duplicate and mismatched tip lists rejected",()=>{
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([]),null,now),/BAD_ROWS/);
  assert.throws(()=>parseWoloBrowserBlockFeed(feed(Array(101).fill(meta(3055556))),null,now),/BAD_ROWS/);
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([meta(3055556),meta(3055556)]),null,now),/DUPLICATE/);
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([meta(3055555)]),null,now),/TIP_MISMATCH/);
});
test("out-of-range fees, counts, hash and future time rejected",()=>{
  const invalidCount=meta(3055556);invalidCount.num_txs="999999999";
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([invalidCount]),null,now),/OUT_OF_RANGE/);
  const invalidHash=meta(3055556);invalidHash.block_id.hash="zz";
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([invalidHash]),null,now),/BAD_HASH/);
  assert.throws(()=>parseWoloBrowserBlockFeed(feed([meta(3055556,-20)]),null,now),/FUTURE_TIME/);
});
test("ignore unknown metadata without rendering untrusted fields",()=>{
  const original=meta(3055556);
  const entry={...original,sender:"<img src=x>",header:{...original.header,memo:"<script>"}};
  const out=parseWoloBrowserBlockFeed(feed([entry]),null,now);
  assert.deepEqual(Object.keys(out.rows[0]).sort(),["hash","height","sizeBytes","time","transactions"]);
});
