/**
 * Post-W1 read-only freshness projection of the EXISTING authenticated storage
 * visual receipt. FRESH describes observation age only, never agent liveness,
 * financial health, full L1 coverage, physical reclaim or activation authority.
 *
 * The caller MUST obtain view only through readPrivateStorageVisual(), which
 * validates the original HMAC/source schema and fails closed on tampering.
 * This pure projection neither accepts unsigned network input nor opens files.
 */
import type { PlaneId, StorageVisualView } from "./storageVisualPrivate.ts";

export type SignedPulseState="FRESH"|"STALE"|"UNKNOWN";
export type SignedPulseReason=
  |"SIGNED_OBSERVATION_WITHIN_36H"
  |"SIGNED_OBSERVATION_EXPIRED_36H"
  |"NO_AUTHENTICATED_RECEIPT"
  |"RECEIPT_INVALID_OR_UNREADABLE"
  |"PLANE_NOT_IN_AUTHENTICATED_RECEIPT"
  |"OBSERVATION_TIME_INVALID"
  |"OBSERVATION_FUTURE_DATED"
  |"SOURCE_STATUS_CONTRADICTS_OBSERVATION"
  |"SOURCE_CLOCK_INVALID";

export const SIGNED_PULSE_TTL_MS=36*60*60*1000;
const FUTURE_LEEWAY_MS=60*1000;
export const SIGNED_PULSE_PLANES=[
  "mac","hel1-root","hel1-volume-105319120",
] as const satisfies readonly PlaneId[];

export type SignedPulseRow={
 id:PlaneId;
 state:SignedPulseState;
 reason:SignedPulseReason;
 observedAt:string|null;
};
export type CentralSignedPulse={
 authority:"SIGNED_GROSS_STORAGE_OBSERVATION_ONLY_NOT_AGENT_LIVENESS";
 ttlHours:36;
 planes:SignedPulseRow[];
};
export function projectCentralSignedPulse(
 view:StorageVisualView|null,
 readClock:number,
 invalidReceipt=false,
):CentralSignedPulse {
 const clockValid=Number.isFinite(readClock)&&readClock>=0;
 const authenticated=view?.source==="SIGNED_PRIVATE_RECEIPT"&&
   view.authority==="PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY";
 const rows=SIGNED_PULSE_PLANES.map(id=>{
  const unknown=(reason:SignedPulseReason):SignedPulseRow=>
   ({id,state:"UNKNOWN",reason,observedAt:null});
  if(!clockValid)return unknown("SOURCE_CLOCK_INVALID");
  if(invalidReceipt)return unknown("RECEIPT_INVALID_OR_UNREADABLE");
  if(!authenticated)return unknown("NO_AUTHENTICATED_RECEIPT");
  const plane=view?.planes.find(x=>x.id===id);
  if(!plane)return unknown("PLANE_NOT_IN_AUTHENTICATED_RECEIPT");
  const at=typeof plane.observedAt==="string"&&
   /^20\d\d-\d\d-\d\dT/.test(plane.observedAt)
   ?Date.parse(plane.observedAt):Number.NaN;
  if(!Number.isFinite(at))return unknown("OBSERVATION_TIME_INVALID");
  if(at>readClock+FUTURE_LEEWAY_MS)return unknown("OBSERVATION_FUTURE_DATED");
  const old=readClock-at>SIGNED_PULSE_TTL_MS;
  if(old&&plane.status==="STALE")return {
   id,state:"STALE",reason:"SIGNED_OBSERVATION_EXPIRED_36H",
   observedAt:new Date(at).toISOString(),
  };
  if(!old&&plane.status==="RECEIPT")return {
   id,state:"FRESH",reason:"SIGNED_OBSERVATION_WITHIN_36H",
   observedAt:new Date(at).toISOString(),
  };
  // A stale source bit paired with a fresh clock, or the reverse, is not
  // allowed to become FRESH (or to be silently presented as stale health).
  return unknown("SOURCE_STATUS_CONTRADICTS_OBSERVATION");
 });
 return {
  authority:"SIGNED_GROSS_STORAGE_OBSERVATION_ONLY_NOT_AGENT_LIVENESS",
  ttlHours:36,
  planes:rows,
 };
}
