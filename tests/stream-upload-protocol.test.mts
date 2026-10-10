import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  parseStreamChunkSequence,
  isAdmissibleStreamChunkContentLength,
  readBoundedStreamChunkBody,
  StreamChunkBodyLimitError,
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
  assert.match(route,/readBoundedStreamChunkBody\(request.body, MAX_CHUNK_BYTES\)/);
  assert.match(route,/resolveStreamRequestActor/);
  assert.match(route,/isAoE2WarManagedStream/);
});

test("oversize and unsupported codec are terminal video-only rejections",()=>{
  const route=readFileSync("app/api/streams/[streamId]/chunks/route.ts","utf8");
  assert.match(route,/code: "STREAM_CHUNK_TOO_LARGE", terminal: true/);
  assert.match(route,/code: "STREAM_FORMAT_UNSUPPORTED", terminal: true/);
  assert.match(route,/status: 415/);
  assert.match(route,/status: 413/);
  assert.match(route,/await endRejectedVideo\(prisma, id\)/);
  assert.match(route,/failed to mark refused video ended/);
  assert.match(route,/resolveStreamRequestActor/);
  assert.doesNotMatch(route,/transferWolo|betWager.update|winnerProof.*update/);
});

test("streamed upload body accepts exact byte-limit frames without giant allocation",async()=>{
  const body=new ReadableStream<Uint8Array>({start(c){
    c.enqueue(new Uint8Array([1,2,3]));
    c.enqueue(new Uint8Array([4,5]));
    c.close();
  }});
  assert.deepEqual([...await readBoundedStreamChunkBody(body,5)],[1,2,3,4,5]);
});
test("oversize or empty streams reject while receiving, not after whole-body buffering",async()=>{
  const oversized=new ReadableStream<Uint8Array>({start(c){
    c.enqueue(new Uint8Array(4));
    c.enqueue(new Uint8Array(4));
    c.close();
  }});
  await assert.rejects(()=>readBoundedStreamChunkBody(oversized,7),StreamChunkBodyLimitError);
  const empty=new ReadableStream<Uint8Array>({start(c){c.close()}});
  await assert.rejects(()=>readBoundedStreamChunkBody(empty,7),StreamChunkBodyLimitError);
  assert.equal(readFileSync("app/api/streams/[streamId]/chunks/route.ts","utf8").includes("request.arrayBuffer()"),false);
});
