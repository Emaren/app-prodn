import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {SIGNED_ATLAS_SCHEMA} from "../lib/aoe2StorageAtlasAuth.ts";

const planes=["mac","hel1-root","hel1-volume-105319120"] as const;
const domain=Buffer.from("aoe2war/storage-atlas/receipt-v1\0","utf8");
function fixture(){
 const when=new Date(Date.now()-1000).toISOString().replace(/\.\d{3}Z$/,"Z");
 const pins:Record<string,unknown>={};
 const keys=planes.map(()=>generateKeyPairSync("ed25519"));
 const data=planes.map((plane,i)=>{
  const uuid=plane==="hel1-volume-105319120"?"a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42":("fake-"+plane);
  const mountpoint=plane==="mac"?"/System/Volumes/Data":plane==="hel1-root"?"/":"/mnt/HC_Volume_105319120";
  const mount_source=plane==="mac"?"/dev/disk3s5":plane==="hel1-root"?"/dev/sda1":"/dev/sdb";
  const collector_id="synthetic-"+plane;
  pins[plane]={collector_id,source_sha:"b".repeat(40),
   public_key_pem:keys[i].publicKey.export({format:"pem",type:"spki"}).toString(),
   filesystem_uuid:uuid,mount_source,mountpoint,
   minimum_sequence:0,previous_receipt_sha256:"0".repeat(64)};
  return {plane,collector_id,sequence:1,previous_receipt_sha256:"0".repeat(64),
   source:{collector:collector_id,source_sha:"b".repeat(40)},
   issued_at:when,observed_at:when,ttl_seconds:120,mount_verified:true,
   coverage:"partial",census_complete:false,
   filesystem:{fs_type:plane==="mac"?"apfs":"ext4",uuid,mount_source,mountpoint},
   capacity:{total_bytes:100_000_000_000,free_blocks_bytes:30_000_000_000,
     ordinary_free_bytes:26_000_000_000},
   consumers:[{path:"/private/protected-evidence",class:"protected",
     probe_ok:true,measured_bytes:256}],
   measured_reclaimed_bytes:null,backup_health:{status:"unknown"}};
 });
 function envelope(){
  return {schema:SIGNED_ATLAS_SCHEMA,receipts:data.map((v,i)=>{
   const bytes=Buffer.from(JSON.stringify(v),"utf8");
   const signature=sign(null,Buffer.concat([domain,bytes]),keys[i].privateKey);
   return {plane:v.plane,payload_base64:bytes.toString("base64"),
    signature_base64:signature.toString("base64")};
  })};
 }
 return {pins,data,envelope};
}
function invoke(envelope:unknown,policy:unknown){
 return spawnSync(process.execPath,["--experimental-strip-types",
  "--experimental-loader","./scripts/aoe2-alias-loader.mjs",
  "scripts/aoe2_storage_sentinel_verify.mts"],
 {cwd:process.cwd(),input:JSON.stringify({envelope,policy}),encoding:"utf8",timeout:15000});
}
test("Sentinel subprocess consumes three real synthetic Ed25519 receipts without claiming live telemetry",()=>{
 const x=fixture(),signed=x.envelope();
 const proc=invoke(signed,x.pins);
 assert.equal(proc.status,0,proc.stderr);
 const result=JSON.parse(proc.stdout);
 assert.equal(result.schema,"aoe2war.storage-sentinel.verified-input.v1");
 assert.equal(result.authenticated_live,false);
 assert.deepEqual(result.planes.map((p:{plane:string})=>p.plane),planes);
 assert.equal(result.planes[0].sequence,1);
 assert.equal(result.planes[0].coverage,"partial");
 assert.equal(result.planes[2].backup_status,"unknown");
 const bytes=Buffer.from(signed.receipts[0].payload_base64,"base64");
 const sig=Buffer.from(signed.receipts[0].signature_base64,"base64");
 const expected=createHash("sha256").update(domain).update(bytes).update(sig).digest("hex");
 assert.equal(result.planes[0].receipt_sha256,expected);
 assert.equal(JSON.stringify(result).includes("/private/protected-evidence"),false);
});
test("Sentinel verifier fails closed on missing host, altered signature and replay",()=>{
 const x=fixture();
 const missing=x.envelope();missing.receipts.pop();
 assert.notEqual(invoke(missing,x.pins).status,0);
 const changed=x.envelope();changed.receipts[0].signature_base64=
   Buffer.alloc(64).toString("base64");
 assert.notEqual(invoke(changed,x.pins).status,0);
 const repeated=x.envelope();x.data[0].sequence=0;
 assert.notEqual(invoke(x.envelope(),x.pins).status,0);
 const advanced=Object.fromEntries(Object.entries(x.pins).map(([p,v])=>
  [p,{...(v as object),minimum_sequence:1,previous_receipt_sha256:"1".repeat(64)}]));
 assert.notEqual(invoke(repeated,advanced).status,0);
});
