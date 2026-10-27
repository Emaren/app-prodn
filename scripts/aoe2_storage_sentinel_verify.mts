/* Operator-only subprocess. Reuses #945 Ed25519 verifier; NO HTTP endpoint. */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {authenticateStorageAtlas} from "../lib/aoe2StorageAtlasAuth.ts";
const DOMAIN=Buffer.from("aoe2war/storage-atlas/receipt-v1\0","utf8");
const PLANES=["mac","hel1-root","hel1-volume-105319120"];
function stop(reason){process.stderr.write("HOLD:"+reason+"\n");process.exit(2)}
let input;
try{
 const raw=readFileSync(0);if(raw.length>600000)stop("INPUT_LIMIT");
 input=JSON.parse(raw.toString("utf8"));
 const authenticated=authenticateStorageAtlas(input.envelope,input.policy);
 if(!authenticated||authenticated.admission!=="HOLD")stop("AUTH_CONTRACT");
 const result=[];
 for(const signed of input.envelope.receipts){
   if(!PLANES.includes(signed.plane))stop("PLANE");
   const data=Buffer.from(signed.payload_base64,"base64");
   const sig=Buffer.from(signed.signature_base64,"base64");
   const v=JSON.parse(data.toString("utf8"));
   const total=v.capacity.total_bytes, free=v.capacity.free_blocks_bytes,
         ordinary=v.capacity.ordinary_free_bytes;
   const effective=total-free+ordinary;
   const percent=effective>0?Math.round(10000*(total-free)/effective)/100:null;
   const backup=v.backup_health;
   const backup_status=backup&&typeof backup==="object"&&
      ["ok","failed","unknown"].includes(backup.status)?backup.status:"unknown";
   const expiration=v.build_health;
   const expired=expiration&&typeof expiration==="object"&&
     Number.isSafeInteger(expiration.expired_generations)&&
     expiration.expired_generations>=0&&expiration.expired_generations<=1000&&
     expiration.reviewed===true?expiration.expired_generations:null;
   // Optional bounded, SIGNED candidate inventory is still review-only.
   // Existing Python Storage OS policy must independently classify every row.
   const artifacts=v.candidate_inventory;
   if(artifacts!==undefined &&
      (!artifacts||typeof artifacts!=="object"||artifacts.kind!=="aoe2war-storage-artifact-inventory"||
       !Array.isArray(artifacts.items)||artifacts.items.length>16))stop("ARTIFACT_BOUNDS");
   result.push({
     candidate_inventory:artifacts??null,
     plane:signed.plane,collector_id:v.collector_id,
     source_sha:v.source.source_sha,sequence:v.sequence,
     observed_at:v.observed_at,issued_at:v.issued_at,
     coverage:v.coverage,ttl_seconds:v.ttl_seconds,
     capacity:{effective_used_percent:percent,ordinary_free_bytes:ordinary,
       total_bytes:total,free_blocks_bytes:free},
     backup_status,expired_generations:expired,
     // Attested class counts are descriptive, NOT deletion authority.
     // Observed generated builds are not themselves independently reviewable.
     generated_observed:v.consumers.filter(c=>c.class==="generated_rebuildable"&&c.probe_ok===true).length,
     receipt_sha256:createHash("sha256").update(DOMAIN).update(data).update(sig).digest("hex")
   });
 }
 if(result.length!==3)stop("THREE_PLANE");
 process.stdout.write(JSON.stringify({schema:"aoe2war.storage-sentinel.verified-input.v1",
   authenticated_live:false,planes:result})+"\n");
}catch(error){stop("SIGNED_RECEIPT_REJECTED")}
