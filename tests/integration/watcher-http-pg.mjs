#!/usr/bin/env node
// Actual HTTP Next ingress -> real PrismaPg -> disposable PostgreSQL 16.
// All requests use the unresolved key branch; no users or financial tables.
import assert from "node:assert/strict";
import process from "node:process";
import pg from "pg";

const BASE="http://127.0.0.1:43821";
const DB=process.env.DATABASE_URL;
if(process.env.CI!=="true"||!DB||
   !/^postgresql:\/\/watcher_ci:[^@]+@127\.0\.0\.1:5432\/watcher_ci$/.test(DB)){
 throw Error("STOP: HTTP/PG test requires isolated watcher_ci DB");
}
const pool=new pg.Pool({connectionString:DB,max:3});
const id=char=>"telemetry_"+char.repeat(32);
const event=(eid,kind="heartbeat")=>({
 event_type:kind,watcher_id:"http-pg-ci-watcher",
 replay_file:kind==="replay_detected_ignored"?"fixture.aoe2record":undefined,
 metadata:{telemetryEventId:eid,...(kind==="replay_detected_ignored"?{reason:"monitoring"}:{})},
});
async function post(body){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const res=await fetch(BASE+"/api/watcher/events",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify(body),signal:controller.signal,
  });
  return {status:res.status,body:await res.json()};
 }finally{clearTimeout(timeout);}
}
async function ready(){
 let last;
 for(let i=0;i<90;i++){
  try{
   const receipt=await post({events:[]});
   if(receipt.status===400)return;
   last=Error("unexpected warmup status "+receipt.status);
  }catch(e){last=e;}
  await new Promise(r=>setTimeout(r,1000));
 }
 throw new Error("Next route never became ready: "+last);
}
async function count(eid){
 const r=await pool.query(
 "SELECT count(*)::integer AS n FROM watcher_client_events WHERE telemetry_event_id=$1",
 [eid]);return r.rows[0].n;
}
async function awaitInjectedPgSleep(){
 for(let i=0;i<110;i++){
  const r=await pool.query(
   "SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname='watcher_ci' AND wait_event='PgSleep'");
  if(r.rows[0].n>0)return;
  await new Promise(r=>setTimeout(r,50));
 }
 throw Error("no real database sleep observed; cannot claim concurrent proof");
}
function accept(r,stored){
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.body.ok,true,JSON.stringify(r));
 assert.equal(r.body.stored,stored,JSON.stringify(r));
 assert.equal(r.body.failed,0,JSON.stringify(r));
 assert.equal(r.body.stored+r.body.suppressed,1,JSON.stringify(r));
}
try{
 await ready();
 accept(await post(event(id("a"))),1);
 assert.equal(await count(id("a")),1);
 accept(await post(event(id("a"))),0);
 assert.equal(await count(id("a")),1);
 console.log("WATCHER_HTTP_PG_DUPLICATE_ACK_PASS");

 const failing=post(event(id("e"),"replay_detected_ignored"));
 await awaitInjectedPgSleep();
 const parallel=await post(event(id("b"),"replay_detected_ignored"));
 accept(parallel,1);
 assert.equal(await count(id("b")),1);
 const receipt=await failing;
 assert.equal(receipt.status,503,JSON.stringify(receipt));
 assert.equal(receipt.body.failed,1,JSON.stringify(receipt));
 assert.equal(await count(id("e")),0);
 await pool.query("DROP TRIGGER watcher_ci_delayed_failure ON watcher_client_events");
 accept(await post(event(id("e"),"replay_detected_ignored")),1);
 assert.equal(await count(id("e")),1);
 assert.equal(await count(id("b")),1);
 console.log("WATCHER_HTTP_PG_INJECTED_DB_FAILURE_AND_RETRY_PASS");

 const bad=await post({events:[event(id("c")),null]});
 assert.equal(bad.status,400,JSON.stringify(bad));
 assert.equal(await count(id("c")),0);
 const huge=await post({event_type:"heartbeat",metadata:{message:"X".repeat(70000)}});
 assert.equal(huge.status,413,JSON.stringify(huge));
 console.log("WATCHER_HTTP_PG_BATCH_AND_SIZE_PASS");
}finally{await pool.end();}
