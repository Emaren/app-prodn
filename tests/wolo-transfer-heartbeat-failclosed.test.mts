import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assertWoloTransferHeartbeat} from "../scripts/verify-wolo-transfer-heartbeat.mjs";
const good={ok:true,chainId:"wolo-1",mode:"rest_tx_search",latestHeight:2879083,
  queriesAttempted:1,txsSeen:100,created:0,updated:0,errors:[]};
test("valid result verifies only safe counters",()=>{
 assert.deepEqual(assertWoloTransferHeartbeat(good),{height:2879083,seen:100,created:0,updated:0});
});
test("upstream query failure cannot become successful heartbeat",()=>{
 for(const bad of [
  {...good,ok:false},{...good,errors:["private upstream failure"]},
  {...good,ok:undefined},{...good,chainId:"not-wolo-1"},
  {...good,latestHeight:0},{...good,queriesAttempted:0},
  {...good,txsSeen:-1},{...good,created:Number.NaN},{...good,updated:1.5},
  {},null,[],false
 ]) assert.throws(()=>assertWoloTransferHeartbeat(bad));
});
test("actual Node CLI fails on false ok without echoing error details",()=>{
 const dir=mkdtempSync(join(tmpdir(),"c04-heartbeat-adversary-"));
 try{
  const file=join(dir,"out.json");
  writeFileSync(file,JSON.stringify({...good,ok:false,errors:["PRIVATE_SECRET_NEVER_ECHO"]}));
  const cmd=new URL("../scripts/verify-wolo-transfer-heartbeat.mjs",import.meta.url).pathname;
  const bad=spawnSync(process.execPath,[cmd,file],{encoding:"utf8"});
  assert.equal(bad.status,3);
  assert.match(bad.stderr,/HOLD_WOLO_TRANSFER_HEARTBEAT/);
  assert.equal(bad.stdout.includes("PRIVATE_SECRET_NEVER_ECHO"),false);
  assert.equal(bad.stderr.includes("PRIVATE_SECRET_NEVER_ECHO"),false);
  writeFileSync(file,JSON.stringify(good));
  const ok=execFileSync(process.execPath,[cmd,file],{encoding:"utf8"});
  assert.match(ok,/PASS_WOLO_TRANSFER_HEARTBEAT height=2879083/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("staged heartbeat does not grep counters as substitute for ok",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../scripts/aoe2-wolo-transfer-heartbeat-v2.sh",import.meta.url),"utf8");
 assert.ok(source.includes("verify-wolo-transfer-heartbeat.mjs"));
 assert.ok(source.includes("HOLD_WOLO_TRANSFER_HEARTBEAT"));
 assert.ok(source.includes("flock -n"));
 assert.equal(source.includes("grep -o"),false);
});
