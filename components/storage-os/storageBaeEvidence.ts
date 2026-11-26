/**
 * BAE is a pure read-side projection of the EXISTING authenticated Storage
 * Explorer API results. Never promote server HMAC to source HMAC / durable
 * ACK, signed capacity to copy permission, or gross bytes to unique reclaim.
 */
import type {StorageCommandCenter,StorageReading} from "@/lib/storageCommandCenterProjection";
import type {IntelColdView} from "@/lib/intelColdStorageEvidence";
import {signedHogInventory} from "../../lib/storageSignedFreshness.ts";

export type BaeMode="B"|"A"|"E";
export type BaeTruth="PASS"|"HOLD"|"STALE"|"UNKNOWN"|"NOT ADMITTED";
export type BaeNode={
  id:"mac"|"hel1-root"|"hel1-volume-105319120"|"intel";
  name:string;role:string;status:BaeTruth;sourceTrust:string;
  sourceHmacAtRead:string;durableAck:string;observedAt:string|null;
  ageLabel:string;availableBytes:number|null;capacityEvidence:string;
  grossCategoryCount:number|null;grossReportedBytes:number|null;
  inventoryStatus:string;reclaimableBytes:null;
};
export const BAE_STORAGE_KEY="aoe2war.storage-os.bae-mode.v1";
export const BAE_DEFAULT_MODE:BaeMode="B";
const SOURCE_IDS=["mac","hel1-root","hel1-volume-105319120"] as const;
const ROLES={
  mac:["M1 development Mac","Development, owner source and release cache"],
  "hel1-root":["HEL1 root filesystem","Production runtime, system and rollback"],
  "hel1-volume-105319120":["HEL1 mounted data volume","Protected database, traffic and retained evidence"],
} as const;
export function validMode(s:string|null):s is BaeMode {
  return s==="B"||s==="A"||s==="E";
}
export function ageLabel(at:string|null,now:number):string{
  if(!at||!Number.isFinite(Date.parse(at))||!Number.isFinite(now))return "UNKNOWN";
  const age=now-Date.parse(at);
  if(age < -60000)return "CLOCK DRIFT";
  if(age<0)return "<1 MIN";
  if(age<60000)return "<1 MIN";
  if(age<3600000)return Math.floor(age/60000)+" MIN";
  if(age<86400000)return Math.floor(age/3600000)+" HR";
  return Math.floor(age/86400000)+" DAY";
}
const isSourceSigned=(r:StorageReading|undefined)=>
  r?.source==="SIGNED_THREE_PLANE_RECEIPT"||
  r?.source==="WE2_NATIVE_V2_SIGNED_PLANE";
export function baeNodes(
  data:StorageCommandCenter|null,
  intel:IntelColdView|null,
  now:number,
):BaeNode[]{
  const out:BaeNode[]=SOURCE_IDS.map(id=>{
    const r=data?.planes.find(p=>p.id===id);
    const inventory=signedHogInventory(data?.visual,id,now);
    const signedCapacity=isSourceSigned(r);
    const sourceStatus=r?.status??"UNKNOWN";
    // A signed server visual is historical category evidence; no real source
    // HMAC is re-verified by this browser-side projection.
    const readableInventory=inventory.status==="PARTIAL";
    const currentSignedCapacity=signedCapacity&&sourceStatus==="RECEIPT";
    const status:BaeTruth=currentSignedCapacity?"PASS":
      sourceStatus==="STALE"||inventory.status==="STALE"?"STALE":
      sourceStatus==="RECEIPT"||readableInventory?"HOLD":"UNKNOWN";
    // The existing HEL1 v1 producer deliberately emits [] in lieu of a
    // directory-allocation scan. Zero categories therefore means NOT SCANNED,
    // not 0 allocated bytes or a healthy/empty filesystem.
    const notScanned=id!=="mac"&&readableInventory&&inventory.categoryCount===0
      &&inventory.plane?.coverage==="PARTIAL";
    const gross=readableInventory&&!notScanned?inventory.plane!.hogs.reduce(
      (sum,h)=>sum+h.grossBytes,0):null;
    const sourceTrust=currentSignedCapacity?"PASS · source-qualified capacity":
      readableInventory?"HOLD · server HMAC only":
      sourceStatus==="RECEIPT"?"HOLD · unsigned estate snapshot":
      status==="STALE"?"STALE · observation expired":"UNKNOWN · no admitted source";
    const at=currentSignedCapacity?r!.asOf:
      readableInventory?inventory.plane?.observedAt??null:
      sourceStatus==="RECEIPT"||sourceStatus==="STALE"?r?.asOf??null:null;
    return {
      id,name:ROLES[id][0],role:ROLES[id][1],status,
      sourceTrust,sourceHmacAtRead:"UNKNOWN · not checked by this read",
      durableAck:"UNKNOWN · no durable receiver ACK proof in this contract",
      observedAt:at,ageLabel:ageLabel(at,now),
      // Reuse genuinely reported snapshot values only with source labelling.
      availableBytes:r?.freeBytes??null,
      capacityEvidence: currentSignedCapacity?"SIGNED CAPACITY":
        r?.source==="OPERATOR_ESTATE_SNAPSHOT"?"UNSIGNED ESTATE SNAPSHOT":
        r?.status==="STALE"?"STALE SOURCE":"UNKNOWN",
      grossCategoryCount:readableInventory?inventory.categoryCount:null,
      grossReportedBytes:gross,
      inventoryStatus:notScanned?"NOT SCANNED":
        inventory.status==="PARTIAL"?"PARTIAL / GROSS":
        inventory.status==="STALE"?"STALE":"UNKNOWN",
      reclaimableBytes:null,
    };
  });
  const verifiedIntel=intel?.source==="SIGNED_PRIVATE_RECEIPT";
  const intelTime=Date.parse(intel?.observedAt??"");
  const intelFresh=Number.isFinite(intelTime)&&intelTime<=now+60_000&&
    now-intelTime<=15*60_000;
  const online=verifiedIntel&&intel.health==="ONLINE"&&intelFresh;
  const intelStatus:BaeTruth=online?"PASS":
    verifiedIntel&&(!intelFresh||intel.health==="STALE")?"STALE":
    verifiedIntel?"HOLD":"UNKNOWN";
  const at=verifiedIntel?intel?.observedAt??null:null;
  out.push({
    id:"intel",name:"Intel cold-storage Mac",
    role:"FileVault vault, immutable ciphertext and independent restores",
    status:intelStatus,
    sourceTrust:online?"PASS · admitted independent Intel source":
      verifiedIntel?"HOLD · Intel source not current":
      "UNKNOWN · no admitted Intel source",
    sourceHmacAtRead:online?"INDEPENDENTLY ADMITTED INTEL RECEIPT":
      "UNKNOWN · no current signed source",
    durableAck:"UNKNOWN · Bridge ACK not implied by Intel source",
    observedAt:at,ageLabel:ageLabel(at,now),
    availableBytes:online?intel!.capacity.availableBytes:null,
    capacityEvidence:online?"SIGNED INTEL CAPACITY":"UNKNOWN",
    grossCategoryCount:null,grossReportedBytes:null,
    inventoryStatus:online&&intel!.objects?"SIGNED ARCHIVE CATALOG":"UNKNOWN",
    reclaimableBytes:null,
  });
  return out;
}
export function baeRecentObservations(nodes:BaeNode[]){
  return nodes.filter(n=>n.observedAt!==null&&
    (n.sourceTrust.startsWith("PASS")||n.inventoryStatus==="PARTIAL / GROSS"))
    .sort((a,b)=>Date.parse(b.observedAt!)-Date.parse(a.observedAt!));
}

/** A dated inspection rail, never fabricated file motion between snapshots. */
export type BaeEvidenceFrame={id:string;at:string;kind:string;source:string;detail:string};
export function verifiedFrames(nodes:BaeNode[],intel:IntelColdView|null):BaeEvidenceFrame[]{
  const frames:BaeEvidenceFrame[]=[];
  for(const n of nodes){
    if(!n.observedAt||!(n.status==="PASS"||n.inventoryStatus==="PARTIAL / GROSS"||n.inventoryStatus==="NOT SCANNED"))continue;
    const label=n.status==="PASS"?"Source-qualified observation":"Server-authenticated gross-category observation ONLY";
    frames.push({id:"host-"+n.id,at:n.observedAt,kind:"OBSERVATION",source:n.name,
      detail:label+". Copy, restore and unique reclaim NOT VERIFIED by this observation."});
  }
  // Intel is a separate signed source; stale/unadmitted health cannot present
  // historic proofs as currently source-qualified observations.
  if(intel?.source==="SIGNED_PRIVATE_RECEIPT"&&intel.health==="ONLINE"){
    for(const t of intel.tenants){
      if(t.lastTransfer)frames.push({
        id:"archive-"+t.id+"-"+t.lastTransfer.campaign,at:t.lastTransfer.observedAt,
        kind:"HISTORICAL INTEL ARCHIVE RECEIPT",source:"Intel / "+t.id,
        detail:"Campaign "+t.lastTransfer.campaign+" · signed ciphertext receipt, NOT a current lane transfer permit."
      });
      if(t.lastRestore)frames.push({
        id:"restore-"+t.id+"-"+t.lastRestore.campaign,at:t.lastRestore.observedAt,
        kind:"INDEPENDENT HISTORICAL RESTORE",source:"Intel / "+t.id,
        detail:"Campaign "+t.lastRestore.campaign+" · original/restored SHA matched; current retirement eligibility still UNKNOWN."
      });
    }
  }
  return frames.filter(f=>Number.isFinite(Date.parse(f.at)))
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||a.id.localeCompare(b.id)).slice(0,16);
}
