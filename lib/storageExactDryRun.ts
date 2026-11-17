/**
 * Source-bound exact-item MANIFEST DRAFT. Deliberately never touches hosts,
 * calls filesystem APIs or returns a cleanup/delete capability.
 * A successful draft is NOT a native dry-run or reclaim authorization.
 */
import {createHash} from "node:crypto";
import type {PlaneId,StorageVisualView} from "./storageVisualPrivate.ts";

export type ManifestRequest={
  plane:PlaneId;alias:string;observedAt:string;sourceDigest:string;
};
export type ManifestDraft={
  schema:"aoe2war.storage-manifest-draft.v1";
  status:"HOLD_NATIVE_IDENTITY_AND_RECOVERY";
  authority:"NO_DELETE";
  plane:PlaneId; alias:string; category:string; classification:1|2;
  fingerprint:string; sourceDigest:string;sourceRevision:string;
  observedAt:string;grossAllocatedBytes:number;
  manifestDigest:string;
  gates:readonly {name:string;verdict:"PARTIAL"|"HOLD"}[];
};
export class StorageManifestHold extends Error{
  readonly reason:string;
  constructor(reason:string){super(reason);this.reason=reason;}
}
const STEP_NAMES=[
  "DISCOVER","VERIFY IDENTITY","OWNER CLASSIFIES","EXACT MANIFEST",
  "RECHECK DEPENDENCIES","CHECK RECOVERY","DRY RUN",
  "OWNER APPROVES","EXECUTE","VERIFY PHYSICAL RECLAIM","AUDIT",
] as const;
const KEY=/^[A-Z][A-Z0-9_-]{5,39}$/;
const HEX=/^[0-9a-f]{64}$/;
const IDS=["mac","hel1-root","hel1-volume-105319120"] as const;
export function buildManifestDraft(
  view:StorageVisualView,request:ManifestRequest,admitted:boolean,
  now:Date=new Date(),
):ManifestDraft{
  if(!admitted)throw new StorageManifestHold("INDIVIDUAL_TRANSPORT_NOT_ADMITTED");
  if(!IDS.includes(request.plane)||!KEY.test(request.alias)||!HEX.test(request.sourceDigest))
    throw new StorageManifestHold("SOURCE_SCOPE_OR_IDENTITY_INVALID");
  if(view.source!=="SIGNED_PRIVATE_RECEIPT")
    throw new StorageManifestHold("SIGNED_SOURCE_UNAVAILABLE");
  const plane=view.planes.find(p=>p.id===request.plane);
  if(!plane||plane.status!=="RECEIPT"||plane.observedAt!==request.observedAt)
    throw new StorageManifestHold("SOURCE_CHANGED_OR_STALE");
  const age=now.getTime()-Date.parse(plane.observedAt);
  if(!Number.isFinite(age)||age< -60000||age>3600000)
    throw new StorageManifestHold("FRESH_EXACT_SOURCE_REQUIRED");
  const item=plane.reviewItems?.find(x=>x.alias===request.alias);
  if(!item||item.sourceDigest!==request.sourceDigest||
    item.proofState!=="COMPLETE"||item.overlaps||
    item.level>2||!["GUARDED","REVIEW_ONLY"].includes(item.sourceStatus))
    throw new StorageManifestHold("INDIVIDUAL_CERTIFICATION_OR_PROTECTION_HOLD");
  if(item.level===1&&item.sourceStatus!=="GUARDED")
    throw new StorageManifestHold("LEVEL1_NONDEPENDENCY_CERTIFICATION_HOLD");
  // Alias+digest are NOT a path, inode, native allocation or mount identity.
  // All post-discovery steps therefore remain HOLD; no deletion admission.
  const fields=[request.plane,item.alias,item.category,item.fingerprint,
    item.sourceDigest,item.sourceRevision,plane.observedAt,
    String(item.grossBytes),String(item.level)].join("\0");
  const manifestDigest=createHash("sha256")
    .update("AOE2WAR:PROVISIONAL-STORAGE-MANIFEST:V1\0").update(fields).digest("hex");
  return {
    schema:"aoe2war.storage-manifest-draft.v1",
    status:"HOLD_NATIVE_IDENTITY_AND_RECOVERY",authority:"NO_DELETE",
    plane:request.plane,alias:item.alias,category:item.category,
    classification:item.level as 1|2,fingerprint:item.fingerprint,
    sourceDigest:item.sourceDigest,sourceRevision:item.sourceRevision,
    observedAt:plane.observedAt,grossAllocatedBytes:item.grossBytes,manifestDigest,
    gates:STEP_NAMES.map((name,index)=>({name,verdict:index===0?"PARTIAL":"HOLD" as const})),
  };
}
