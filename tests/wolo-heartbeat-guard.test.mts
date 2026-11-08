import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const guard=new URL("../scripts/wolo-transfer-heartbeat-result-guard.mjs",import.meta.url);
const good={ok:true,chainId:"wolo-1",errors:[],created:0,updated:1,txsSeen:100,latestHeight:2813553};
function run(content:string){
 const d=mkdtempSync(join(tmpdir(),"wolo-heartbeat-"));
 try {
  const p=join(d,"result.json");writeFileSync(p,content);
  return spawnSync(process.execPath,[guard.pathname,p],{encoding:"utf8",timeout:5000});
 }finally{rmSync(d,{recursive:true,force:true});}
}
test("full true success emits only summarized nonsecret counters",()=>{
 const r=run(JSON.stringify(good));
 assert.equal(r.status,0);
 assert.match(r.stdout,/wolo-transfer-heartbeat ok height=2813553 seen=100 created=0 updated=1/);
});
test("false/missing ok, errors, corrupt JSON and malicious counters are nonzero HOLD",()=>{
 const values=[
  {...good,ok:false},{...good,errors:["upstream timeout"]},
  Object.fromEntries(Object.entries(good).filter(([key])=>key!=="ok")),
  {...good,chainId:"wrong"},
  {...good,created:-1},{...good,txsSeen:"100"},{...good,latestHeight:0},
  {...good,updated:1.5},{...good,txsSeen:Infinity},
 ];
 for(const v of values) {
  const r=run(JSON.stringify(v));
  assert.equal(r.status,3);
  assert.match(r.stderr,/HOLD_WOLO_HEARTBEAT_RESULT_NOT_CONFIRMED/);
  assert.equal(r.stdout,"");
 }
 for(const raw of ["", "not json", '{"ok":true,"chainId":"wolo-1"', " ".repeat(65537)]){
  const r=run(raw);assert.equal(r.status,3);
 }
});
test("staged shell cannot run without syntax support",()=>{
 const path=new URL("../scripts/aoe2-wolo-transfer-heartbeat.c03-held.sh",import.meta.url);
 execFileSync("/bin/bash",["-n",path.pathname],{timeout:3000});
});
