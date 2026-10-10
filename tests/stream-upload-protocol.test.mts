import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  parseStreamChunkSequence,
  isAdmissibleStreamChunkContentLength,
} from "../lib/streamUploadProtocol.ts";

test("missing, empty, noncanonical and contradictory chunk sequence must fail closed",()=>{
  assert.equal(parseStreamChunkSequence(null,null),null);
  for(const x of ["","-1","01","1.0","1e1","NaN","Infinity"," 1 ","2000001"]) {
    assert.equal(parseStreamChunkSequence(x,null),null,x);
  }
  assert.equal(parseStreamChunkSequence("0",null),0);
  assert.equal(parseStreamChunkSequence(null,"12"),12);
  assert.equal(parseStreamChunkSequence("1","2"),null);
  assert.equal(parseStreamChunkSequence("12","12"),12);
  assert.equal(parseStreamChunkSequence("2000000",null),2_000_000);
});
test("missing Content-Length is legal, but declared invalid or oversized length is rejected",()=>{
  const max=8*1024*1024;
  assert.equal(isAdmissibleStreamChunkContentLength(null,max),true);
  assert.equal(isAdmissibleStreamChunkContentLength("1",max),true);
  assert.equal(isAdmissibleStreamChunkContentLength(String(max),max),true);
  for(const x of ["","0","-5","01","1e2","oops","Infinity",String(max+1)]) {
    assert.equal(isAdmissibleStreamChunkContentLength(x,max),false,x);
  }
});
test("native and browser chunk API still bounds actual body after optional length",()=>{
  const route=readFileSync("app/api/streams/[streamId]/chunks/route.ts","utf8");
  assert.match(route,/parseStreamChunkSequence/);
  assert.match(route,/isAdmissibleStreamChunkContentLength/);
  assert.match(route,/arrayBuffer\.byteLength <= 0 \|\| arrayBuffer\.byteLength > MAX_CHUNK_BYTES/);
  assert.match(route,/resolveStreamRequestActor/);
  assert.match(route,/isAoE2WarManagedStream/);
});
