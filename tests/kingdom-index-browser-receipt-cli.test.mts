import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
const cli=new URL("../scripts/kingdom_index_browser_receipt_audit.mjs",import.meta.url);
const url="https://aoe2war.com/kingdom-index",sha="a".repeat(40),collector="b".repeat(40);
function percentile(arr,q){const s=[...arr].sort((a,b)=>a-b),x=(s.length-1)*q,l=Math.floor(x),h=Math.ceil(x);return s[l]+(s[h]-s[l])*(x-l);}
function summary(arr){return {count:arr.length,p50:percentile(arr,0.5),p75:percentile(arr,0.75),p95:percentile(arr,0.95),max:Math.max(...arr)};}
function makeReceipt(){
 const rows=Array.from({length:10},(_,i)=>({
  sample:i+1,viewport:"desktop",loaded:true,documentStatus:200,harnessAttempt:1,failedResources:[],
  metrics:{href:url,readyMs:300+i*10,finalLcp:{startTime:500+i*20},
   navigation:{responseStart:50+i*2,responseEnd:80+i*2}}
 }));
 return {schema:1,kind:"aoe2war-cold-process-lcp",generatedAt:"2026-10-21T20:00:00.000Z",
  releaseSha:sha,buildVersion:"fixture",collectorSourceSha:collector,url,viewport:"desktop",samples:10,
  sampleAttempts:2,productionMutated:false,databaseMutated:false,woloMutated:false,
  summary:{readyMs:summary(rows.map(r=>r.metrics.readyMs)),lcpMs:summary(rows.map(r=>r.metrics.finalLcp.startTime)),
   documentTtfbMs:summary(rows.map(r=>r.metrics.navigation.responseStart))},rows};
}
test("operator CLI audits immutable sample receipt without network and fails closed on wrong release",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"aoe2war-browser-cli-"));
 try{
  const file=join(dir,"receipt.json");
  await writeFile(file,JSON.stringify(makeReceipt(),null,2)+"\n",{mode:0o600});
  const opts=["--input",file,"--url",url,"--release-sha",sha,"--build-version","fixture",
   "--collector-sha",collector,"--viewport","desktop"];
  const run=(args)=>spawnSync(process.execPath,[cli.pathname,...args],{encoding:"utf8",timeout:10000});
  const ok=run(opts);
  assert.equal(ok.status,0,ok.stderr);
  const result=JSON.parse(ok.stdout);
  assert.equal(result.certified,false);assert.equal(result.score,null);
  assert.equal(result.status,"SOURCE_BOUND_BROWSER_DIAGNOSTIC");
  const invalid=run(opts.map(x=>x===sha?"c".repeat(40):x));
  assert.equal(invalid.status,2);
  assert.match(invalid.stderr,/mismatch/);
  assert.equal(invalid.stdout,"");
 }finally{await rm(dir,{recursive:true,force:true});}
});
