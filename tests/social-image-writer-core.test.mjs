import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,chmod,readdir,readFile,rm,realpath} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {executeSocialImageWrite} from "../lib/socialImageWriterCore.mjs";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2m0AAAAASUVORK5CYII=","base64");
const input={targetUid:"u_bob",body:"",replyToMessageId:null,requestKey:"1".repeat(32),name:"test.png",mimeType:"image/png",imageBase64:png.toString("base64")};
const token="X".repeat(64);
async function fixture(fn){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"direct-media-test-")));
 try{await chmod(root,0o750);await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
function harness(root,options={}){
 const queries=[];const errors=[];
 const pool={connect:async()=>({query:async(sql,args)=>{
   queries.push([sql,args]);
   if(sql.startsWith("SELECT")){
     assert.equal(args[0],"u_alice");
     assert.match(args[5],/^[a-f0-9]{64}$/);
     assert.match(args[6],/^file:v1:dm-[a-f0-9-]+\.png$/);
     assert.deepEqual(await readFile(path.join(root,args[6].slice(8))),png);
     return {rows:[{decision:options.decision??{status:201,body:{ok:true,messageId:4,targetUid:"u_bob",replayed:false}}}]};
   }
   if(sql==="COMMIT"&&options.uncertain)throw Error("commit reply lost");
   return {rows:[]};
 },release(){}})};
 return {queries,errors,call:(overrides={})=>executeSocialImageWrite({pool,root,sessionToken:token,input,
    verifySession:async()=>"u_alice",verifyImage:async(b,m)=>b.equals(png)&&m==="image/png",
    onError:code=>errors.push(code),...overrides})};
}
test("image-only and caption save durable private bytes before admitted SQL and retain after commit",async()=>fixture(async root=>{
 const h=harness(root);const result=await h.call();assert.equal(result.status,201);
 assert.equal((await readdir(root)).length,1);
 const next=await h.call({input:{...input,body:"caption",requestKey:"2".repeat(32)}});
 assert.equal(next.status,201);assert.equal((await readdir(root)).length,2);
 assert.ok(h.queries.some(([q,a])=>q.startsWith("SELECT")&&a[2]==="caption"));
}));
test("denial and confirmed replay remove only the newly written file",async()=>fixture(async root=>{
 const first=harness(root);await first.call();const original=await readdir(root);
 const denied=harness(root,{decision:{status:403,body:{detail:"NOT_PARTICIPANT"}}});
 assert.equal((await denied.call()).status,403);assert.deepEqual(await readdir(root),original);
 const replay=harness(root,{decision:{status:201,body:{ok:true,messageId:4,targetUid:"u_bob",replayed:true}}});
 assert.equal((await replay.call()).body.replayed,true);assert.deepEqual(await readdir(root),original);
}));
test("uncertain COMMIT retains file and emits only bounded reconciliation code",async()=>fixture(async root=>{
 const h=harness(root,{uncertain:true});assert.equal((await h.call()).status,503);
 assert.equal((await readdir(root)).length,1);assert.ok(h.errors.includes("MEDIA_ORPHAN_RECONCILE_REQUIRED"));
}));
test("invalid bytes, forged actor, unverified session, oversize and unsupported MIME never enter DB",async()=>fixture(async root=>{
 const h=harness(root);
 for(const [override,status] of [
   [{input:{...input,actorUid:"u_bob"}},400],
   [{verifySession:async()=>{throw Error();}},401],
   [{verifyImage:async()=>false},415],
   [{input:{...input,mimeType:"image/svg+xml"}},400],
   [{input:{...input,imageBase64:"A".repeat(13_333_340)}},400],
   [{input:{...input,requestKey:"wrong"}},400],
 ])assert.equal((await h.call(override)).status,status);
 assert.equal(h.queries.length,0);assert.deepEqual(await readdir(root),[]);
}));
