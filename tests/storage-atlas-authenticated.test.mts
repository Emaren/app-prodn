import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {authenticateStorageAtlas,SIGNED_ATLAS_SCHEMA,type AtlasTrustPolicy} from "../lib/aoe2StorageAtlasAuth.ts";

const time=new Date("2026-10-27T16:00:00.000Z");
const validTime="2026-10-27T15:59:00Z";
const domain=Buffer.from("aoe2war/storage-atlas/receipt-v1\0","utf8");
const names=["mac","hel1-root","hel1-volume-105319120"] as const;
function sample(){
 const keyPairs=names.map(()=>generateKeyPairSync("ed25519"));
 const pins={} as Record<string,unknown>;
 const data=names.map((plane,i)=>{
  const path=plane==="mac"?"/System/Volumes/Data":plane==="hel1-root"?"/":"/mnt/HC_Volume_105319120";
  const uuid=plane==="hel1-volume-105319120"?"a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42":("test-uuid-"+plane);
  const fs=plane==="mac"?"apfs":"ext4";
  const source=plane==="mac"?"/dev/disk3s5":i===1?"/dev/sda1":"/dev/sdb";
  pins[plane]={collector_id:"collector-"+plane,public_key_pem:keyPairs[i].publicKey.export({format:"pem",type:"spki"}).toString(),
    filesystem_uuid:uuid,mount_source:source,mountpoint:path,source_sha:"a".repeat(40),
    minimum_sequence:0,previous_receipt_sha256:"0".repeat(64)};
  return {plane,collector_id:"collector-"+plane,sequence:1,previous_receipt_sha256:"0".repeat(64),
   source:{collector:"collector-"+plane,source_sha:"a".repeat(40)},issued_at:validTime,
   observed_at:validTime,ttl_seconds:300,mount_verified:true,coverage:"partial",census_complete:false,
   filesystem:{fs_type:fs,uuid,mount_source:source,mountpoint:path},
   capacity:{total_bytes:100_000_000_000,free_blocks_bytes:30_000_000_000,ordinary_free_bytes:26_000_000_000},
   consumers:[{path:"/Users/private/.ssh/wolo-key",class:"protected",probe_ok:true,measured_bytes:42}],
   proposed_reclaim_bytes:88,measured_reclaimed_bytes:null};
 });
 const envelope=()=>({schema:SIGNED_ATLAS_SCHEMA,receipts:data.map((v,i)=>{
  const bytes=Buffer.from(JSON.stringify(v),"utf8");
  return {plane:v.plane,payload_base64:bytes.toString("base64"),
   signature_base64:sign(null,Buffer.concat([domain,bytes]),keyPairs[i].privateKey).toString("base64")};
 })});
 return {pins:pins as AtlasTrustPolicy,data,keys:keyPairs,envelope};
}
const rejected=(cb:()=>unknown,label:string)=>assert.throws(cb,/STORAGE_ATLAS_AUTH_HOLD/,label);
test("3 real independent Ed25519 signatures authenticate producer-to-public projection without live GO",()=>{
 const x=sample();const out=authenticateStorageAtlas(x.envelope(),x.pins,time);
 assert.equal(out.schema,"aoe2war.storage-atlas.authenticated-public.v1");
 assert.equal(out.admission,"HOLD");assert.equal(out.live,false);
 assert.equal(out.snapshot.planes.length,3);
 assert.equal(out.snapshot.planes[0].coverage,"partial");
 assert.equal(out.snapshot.planes[0].ordinary_free_bytes,26_000_000_000);
 assert.equal(out.snapshot.planes[0].measured_reclaimed_bytes,null);
 const serialized=JSON.stringify(out);
 for(const secret of ["/Users/","wolo-key","/dev/","test-uuid","public_key_pem","signature_base64","previous_receipt_sha256","collector-mac"])
  assert.equal(serialized.includes(secret),false,secret);
});
test("mutating signed payload, forged proof, wrong key and source drift all HOLD",()=>{
 const x=sample();
 const packet=x.envelope();packet.receipts[0].signature_base64=Buffer.alloc(64).toString("base64");
 rejected(()=>authenticateStorageAtlas(packet,x.pins,time),"bad signature");
 x.data[0].source.source_sha="b".repeat(40);
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"source drift");
 x.data[0].source.source_sha="a".repeat(40);
 const y=sample();y.pins.mac.public_key_pem=y.pins["hel1-root"].public_key_pem;
 rejected(()=>authenticateStorageAtlas(y.envelope(),y.pins,time),"duplicated signer keys");
});
test("replay sequence, swapped receipt ordinal and previous digest drift all HOLD",()=>{
 const x=sample();
 x.data[1].sequence=0;
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"old sequence");
 x.data[1].sequence=2;
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"skipped sequence");
 x.data[1].sequence=1;x.data[1].previous_receipt_sha256="f".repeat(64);
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"mismatched highwater");
});
test("missing plane, duplicate receipt and wrong device identity HOLD",()=>{
 const x=sample();let p=x.envelope();
 p.receipts.pop();
 rejected(()=>authenticateStorageAtlas(p,x.pins,time),"missing host");
 p=x.envelope();p.receipts[2]=p.receipts[1];
 rejected(()=>authenticateStorageAtlas(p,x.pins,time),"duplicate host");
 x.data[2].filesystem.uuid="lookalike-volume";
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"volume device drift");
});
test("stale, disputed, future and naive timestamps HOLD",()=>{
 const x=sample();x.data[0].observed_at="2026-10-27T15:40:00Z";
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"stale");
 x.data[0].observed_at=validTime;x.data[0].issued_at="2026-10-27T16:20:00Z";
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"future issued");
 x.data[0].issued_at="2026-10-27T16:00:00";
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"naive time");
});
test("incomplete inventory cannot claim complete; forged reclaim denied",()=>{
 const x=sample();x.data[0].coverage="complete";
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"fake completeness");
 x.data[0].coverage="partial";x.data[0].measured_reclaimed_bytes=9999999;
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"fabricated gained bytes");
});
test("oversized payload, negative capacity and malformed consumer HOLD",()=>{
 const x=sample();x.data[1].consumers[0].path="/private/"+ "X".repeat(200000);
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"payload size");
 x.data[1].consumers[0].path="/private/file";
 x.data[1].capacity.ordinary_free_bytes=40_000_000_000;
 rejected(()=>authenticateStorageAtlas(x.envelope(),x.pins,time),"reserved accounting");
});
test("concurrent, identical candidate publication cannot meet a subsequently advanced witness",async()=>{
 const x=sample();const signed=x.envelope(),first=authenticateStorageAtlas(signed,x.pins,time);
 assert.equal(first.receipt_sequences.mac,1);
 // A trusted publisher advances the external per-collector monotonic witness
 // under an exclusive lock; a second request with old sequence MUST be held.
 const advanced=Object.fromEntries(Object.entries(x.pins).map(([name,pin])=>
   [name,{...pin,minimum_sequence:1,previous_receipt_sha256:"1".repeat(64)}])) as AtlasTrustPolicy;
 const attempts=await Promise.allSettled([Promise.resolve().then(()=>authenticateStorageAtlas(signed,advanced,time)),
   Promise.resolve().then(()=>authenticateStorageAtlas(signed,advanced,time))]);
 assert.equal(attempts.every(p=>p.status==="rejected"),true);
});
