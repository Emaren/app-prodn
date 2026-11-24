import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {Script} from "node:vm";
const req=createRequire(import.meta.url),ts=req("typescript");
const source=readFileSync("lib/storageAtlasNativeCapacityServer.ts","utf8");
const owner=JSON.parse(readFileSync("config/storage-atlas-m1-native-observation-20261122.v1.json","utf8"));
function harness(rootDev=1,dataDev=2,platform="linux",broken=false){
 const paths:string[]=[];
 const compiled=ts.transpileModule(source,{fileName:"storageAtlasNativeCapacityServer.ts",
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    esModuleInterop:true,resolveJsonModule:true}}).outputText;
 const mod={exports:{} as Record<string,unknown>};
 const fake=(name:string)=>{
  if(name==="server-only")return {};
  if(name==="../config/storage-atlas-m1-native-observation-20261122.v1.json")return owner;
  if(name==="node:fs/promises")return {
    stat:async(p:string)=>{paths.push("stat:"+p);return {isDirectory:()=>true,
      dev:p==="/"?rootDev:dataDev};},
    statfs:async(p:string)=>{paths.push("statfs:"+p);return {
      bsize:4096,blocks:broken?-1:10000,bfree:2000,bavail:1000};}
  };
  throw Error("UNEXPECTED_DEPENDENCY:"+name);
 };
 new Script("(function(require,module,exports,process){"+compiled+"\n})",{
   filename:"storage-native-test.mjs"}).runInThisContext()(
      fake,mod,mod.exports,{platform});
 return {read:mod.exports.readAtlasNativeCapacityObservations as ()=>Promise<
  Array<Record<string,unknown>>>,paths};
}
test("native HEL1 statfs only fixed independent mounts and never scans or deletes",async()=>{
 const h=harness();const rows=await h.read();
 assert.deepEqual(rows.map(x=>x.id),["hel1-root","hel1-data","m1"]);
 assert.deepEqual(h.paths,["stat:/","stat:/mnt/HC_Volume_105319120",
   "statfs:/","statfs:/mnt/HC_Volume_105319120"]);
 assert.equal(rows[0].totalBytes,40960000);
 assert.equal(rows[0].usedBytes,32768000);
 assert.equal(rows[0].availableBytes,4096000);
 assert.equal(rows[0].reservedBytes,4096000);
 assert.equal(rows[0].source,"NATIVE_HEL1_STATFS_UNCERTIFIED");
 assert.equal(rows[2].source,"OWNER_M1_APFS_DATED_UNCERTIFIED");
 assert.equal(rows[2].totalBytes,494384795648);
 assert.equal(rows[2].usedBytes,484315406336);
 assert.equal(rows[2].availableBytes,10069389312);
 assert.doesNotMatch(source,/readdir|opendir|walkDir|execFile|spawn|unlink|rm -rf|writeFile|fetch\(/);
});
test("no matching HEL1 separate mount means NO HEL1 observation",async()=>{
 const h=harness(1,1);const rows=await h.read();
 assert.deepEqual(rows.map(x=>x.id),["m1"]);
});
test("invalid native filesystem bytes are rejected, no fabricated INTEL",async()=>{
 const h=harness(1,2,"linux",true);const rows=await h.read();
 assert.deepEqual(rows.map(x=>x.id),["m1"]);
 const mac=harness(1,2,"darwin");
 assert.deepEqual((await mac.read()).map(x=>x.id),["m1"]);
 assert.deepEqual(mac.paths,[]);
 assert.equal(owner.independentlySigned,false);
 assert.equal(owner.categoryAuthority,false);
 assert.equal(owner.reclaimAuthority,false);
 assert.equal(owner.totalBytes,owner.usedBytes+owner.availableBytes+owner.reservedBytes);
});
