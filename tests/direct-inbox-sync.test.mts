import assert from "node:assert/strict";
import test from "node:test";
import {directInboxMarker,readDirectInboxSyncMarker} from "../lib/directInboxSync.ts";
import {directInboxUnchanged,directSyncBaseline} from "../components/contact/directInboxSyncClient.ts";
const row={id:42,deliveredAt:null,editedAt:null};
test("marker changes on new ID, delivery, edit, deletion and pair",()=>{
 const marker=directInboxMarker(1,[row]);
 for(const [pair,rows] of [[2,[row]],[1,[]],[1,[{...row,id:43}]],[1,[{...row,deliveredAt:new Date(100)}]],[1,[{...row,editedAt:new Date(100)}]]] as const)
  assert.notEqual(marker,directInboxMarker(pair,[...rows]));
 assert.equal(directInboxMarker(1,[row,{...row,id:40}]),directInboxMarker(1,[{...row,id:40},row]));
});
test("exact bounded read is parameterized, denied pair returns null",async()=>{
 let calls=0;
 const db={$queryRaw:async<T>(sql:TemplateStringsArray,...args:unknown[])=>{
  calls++;assert.deepEqual(args,["bob","alice"]);assert.match(sql.join("?"),/LIMIT 80/);assert.match(sql.join("?"),/NOT EXISTS/);return [{conversationId:1,...row}] as T;
 }};
 assert.equal(await readDirectInboxSyncMarker(db,"alice","bob"),directInboxMarker(1,[row]));
 assert.equal(await readDirectInboxSyncMarker(db,"alice","alice"),null);assert.equal(calls,1);
 assert.equal(await readDirectInboxSyncMarker({$queryRaw:async<T>()=>[] as T},"alice","bob"),null);
});
test("only matching recent full snapshot avoids full read; scope, change, error and expiry fall through",async()=>{
 const marker=directInboxMarker(1,[row]);
 const b=directSyncBaseline({viewer:{uid:"alice"},activeTargetUid:"bob",syncMarker:marker},0);
 const sig=new AbortController().signal;let calls=0;
 const send=async()=>{calls++;return new Response(JSON.stringify({syncMarker:marker}));};
 assert.equal(await directInboxUnchanged(b,"alice","bob",sig,send as typeof fetch,5000),true);
 for(const [viewer,target,now] of [["alice","other",5000],["other","bob",5000],["alice","bob",30000]] as const)
  assert.equal(await directInboxUnchanged(b,viewer,target,sig,send as typeof fetch,now),false);
 assert.equal(calls,1);
 assert.equal(await directInboxUnchanged(b,"alice","bob",sig,async()=>new Response("{}",{status:404}),5000),false);
 assert.equal(await directInboxUnchanged(b,"alice","bob",sig,async()=>new Response(JSON.stringify({syncMarker:"b".repeat(64)})),5000),false);
});
