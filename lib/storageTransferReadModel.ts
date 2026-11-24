/** Source-only read model. No authorization, producer, filesystem or network I/O.
 * Inputs must come from a separately authenticated, source-owned receipt adapter.
 * This module validates shape and correlation, NOT signatures or admission. */
export const ENDPOINTS = ["mac","hel1-root","hel1-volume-105319120","intel"] as const;
export type Endpoint=typeof ENDPOINTS[number];
export const DIRECTED_ROUTES=ENDPOINTS.flatMap(source=>ENDPOINTS.filter(destination=>destination!==source)
  .map(destination=>({source,destination,id:source+">"+destination})));
export const LANE_ID_MAP={
 "m1-to-hel1-operator":"m1_hel1_operator",
 "m1-to-intel-factory-v2":"m1_intel_archive",
 "hel1-to-intel-old-recovery":"hel1_recovery_intel",
 "hel1-local-root-volume":"hel1_root_volume",
 "hel1-direct-intel":"hel1_intel_direct",
} as const;
export const PHASES=["queue","approval","source_read","encode","transport","relay_wait",
 "destination_write","fsync","readback","restore","retry"] as const;
export type Phase=typeof PHASES[number];
export const DIAGNOSTICS={
 BOTTLENECK_UNKNOWN:"Collect comparable stage measurements in the approved IO window.",
 SOURCE_READ_SLOW:"Ask source owner to inspect measured read latency.",
 RELAY_BACKPRESSURE:"Ask WE4 to inspect the measured relay wait.",
 TCP_RETRANSMIT_HIGH:"Ask WE4 to inspect the measured authenticated link.",
 DEST_FSYNC_SLOW:"Ask destination owner to inspect measured fsync latency.",
 SOURCE_STALE:"Refresh the original authenticated observation.",
} as const;
type Diagnostic=keyof typeof DIAGNOSTICS;
export type Identity={campaign:string;objectSha256:string;ciphertextSha256:string;
 source:Endpoint;destination:Endpoint;via:Endpoint|null;sourceClass:string};
type Receipt=Identity & {receiptSha256:string;observedAt:string};
export type CopyReceipt=Receipt & {ciphertextBytes:number;ackElapsedMs:number};
export type RestoreReceipt=Receipt & {restoredSha256:string;restoreElapsedMs:number};
export type Sample=Identity & {observedAt:string;sequence:number;ciphertextBytes:number|null;
 checkpointBytes:number|null;phaseMs:Partial<Record<Phase,number|null>>;
 diagnostic:Diagnostic|null};
const sha=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const token=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_.-]{1,128}$/.test(v);
const count=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const duration=(v:unknown):v is number=>count(v)&&v>0;
const validTime=(v:unknown,now:number)=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now+60_000;
function validIdentity(v:Identity){
 return token(v.campaign)&&token(v.sourceClass)&&sha(v.objectSha256)&&sha(v.ciphertextSha256)&&
 ENDPOINTS.includes(v.source)&&ENDPOINTS.includes(v.destination)&&v.source!==v.destination&&
 (v.via===null||(ENDPOINTS.includes(v.via)&&v.via!==v.source&&v.via!==v.destination));
}
const same=(a:Identity,b:Identity)=>a.campaign===b.campaign&&a.objectSha256===b.objectSha256&&
 a.ciphertextSha256===b.ciphertextSha256&&a.source===b.source&&a.destination===b.destination&&
 a.via===b.via&&a.sourceClass===b.sourceClass;
export function projectTransferEvidence(identity:Identity, samples:readonly Sample[],
 copy:CopyReceipt|null,restore:RestoreReceipt|null,now:number){
 if(!Number.isFinite(now)||!validIdentity(identity)||samples.length>128)throw Error("TRANSFER_EVIDENCE_INVALID");
 const validCopy=copy!==null&&same(identity,copy)&&sha(copy.receiptSha256)&&
  validTime(copy.observedAt,now)&&count(copy.ciphertextBytes)&&duration(copy.ackElapsedMs);
 const validRestore=validCopy&&restore!==null&&same(identity,restore)&&sha(restore.receiptSha256)&&
  restore.restoredSha256===identity.objectSha256&&validTime(restore.observedAt,now)&&
  Date.parse(restore.observedAt)>=Date.parse(copy!.observedAt)&&duration(restore.restoreElapsedMs);
 let previous:Sample|null=null;
 for(const sample of samples){
  if(!same(identity,sample)||!validTime(sample.observedAt,now)||!count(sample.sequence)||
   (sample.ciphertextBytes!==null&&!count(sample.ciphertextBytes))||
   (sample.checkpointBytes!==null&&(!count(sample.checkpointBytes)||sample.ciphertextBytes===null||
      sample.checkpointBytes>sample.ciphertextBytes))||
   Object.entries(sample.phaseMs).some(([k,v])=>!PHASES.includes(k as Phase)||(v!==null&&!count(v)))||
   (sample.diagnostic!==null&&!Object.hasOwn(DIAGNOSTICS,sample.diagnostic))||
   (previous!==null&&(sample.sequence<=previous.sequence||Date.parse(sample.observedAt)<Date.parse(previous.observedAt)||
    (previous.checkpointBytes!==null&&(sample.checkpointBytes===null||sample.checkpointBytes<previous.checkpointBytes))||
    (previous.ciphertextBytes!==null&&sample.ciphertextBytes!==previous.ciphertextBytes)||
    PHASES.some(p=>previous!.phaseMs[p]!=null&&(sample.phaseMs[p]==null||sample.phaseMs[p]!<previous!.phaseMs[p]!)))))
    throw Error("TRANSFER_CHECKPOINT_INVALID");
  previous=sample;
 }
 const fresh=previous!==null&&now-Date.parse(previous.observedAt)<=15*60_000;
 const phaseMs=Object.fromEntries(PHASES.map(p=>[p,previous?.phaseMs[p]??null]));
 const diagnostic=previous?(fresh?previous.diagnostic:"SOURCE_STALE"):null;
 return {routeId:identity.source+">"+identity.destination,via:identity.via,
  freshness:previous?(fresh?"CURRENT":"STALE"):"UNKNOWN",
  checkpointBytes:previous?.checkpointBytes??null,totalBytes:previous?.ciphertextBytes??null,
  phaseMs,checkpointHistory:samples.map(s=>({sequence:s.sequence,observedAt:s.observedAt,checkpointBytes:s.checkpointBytes})),
  copyVerified:validCopy,restoreVerified:validRestore,
  ackBytesPerSecond:validCopy?copy!.ciphertextBytes*1000/copy!.ackElapsedMs:null,
  restoreElapsedMs:validRestore?restore!.restoreElapsedMs:null,
  diagnostic,nextAction:diagnostic?DIAGNOSTICS[diagnostic]:null,
  copyAuthorized:false,retirementAuthorized:false};
}
