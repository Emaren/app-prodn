/** C-owned post-W1 private visual freshness read model.
 * The already authenticated server-side visual reader verifies the *server*
 * HMAC. It does NOT prove the source-plane HMAC on this read, a durable signed
 * bridge ACK, a natural launchd/systemd execution or private Chrome adoption.
 * Never upgrade any of those unknowns because a visual file merely exists.
 */
import type { PlaneId, StorageVisualView } from "./storageVisualPrivate.ts";

export const FRESHNESS_SCHEMA = "aoe2war.storage-os.signed-freshness.v1";
export const FRESHNESS_PLANES = ["mac", "hel1-root", "hel1-volume-105319120"] as const;
export type FreshnessPlane = {
  id: PlaneId;
  label: string;
  status: "UNKNOWN"|"CURRENT_SERVER_SIGNED"|"STALE_SERVER_SIGNED";
  observedAt: string|null;
  ageSeconds: number|null;
  coverage: "PARTIAL"|"UNKNOWN";
  serverVisualHmacVerified: boolean;
  sourceHmacVerifiedAtRead: false;
  durableBridgeAckVerified: false;
  scheduledCyclesVerified: 0;
  reason: string;
};
export type SignedFreshnessView = {
  schema: typeof FRESHNESS_SCHEMA;
  authority: "PRIVATE_READ_ONLY_NOT_ADOPTION";
  decision: "NOT_ADOPTED";
  capturedAt: string;
  bridgeAck: "UNKNOWN_NOT_IN_SIGNED_VISUAL_CONTRACT";
  macNaturalCyclesVerified: 0;
  hel1NaturalCyclesVerified: 0;
  hostPermit: "NOT_PROVEN";
  liveReceiver: "NOT_PROVEN";
  publicProjection: "UNAVAILABLE";
  planes: FreshnessPlane[];
};
const LABELS: Record<PlaneId,string> = {
  mac: "Mac Pulse",
  "hel1-root": "HEL1 Root",
  "hel1-volume-105319120": "HEL1 Evidence Volume",
};
const TTL = 36*3600_000;
const FUTURE = 60_000;
export function unknownSignedFreshness(now:Date):SignedFreshnessView {
  return {
    schema:FRESHNESS_SCHEMA,authority:"PRIVATE_READ_ONLY_NOT_ADOPTION",
    decision:"NOT_ADOPTED",capturedAt:now.toISOString(),
    bridgeAck:"UNKNOWN_NOT_IN_SIGNED_VISUAL_CONTRACT",
    macNaturalCyclesVerified:0,hel1NaturalCyclesVerified:0,
    hostPermit:"NOT_PROVEN",liveReceiver:"NOT_PROVEN",
    publicProjection:"UNAVAILABLE",
    planes:FRESHNESS_PLANES.map(id=>({
      id,label:LABELS[id],status:"UNKNOWN",observedAt:null,ageSeconds:null,
      coverage:"UNKNOWN",serverVisualHmacVerified:false,
      sourceHmacVerifiedAtRead:false,durableBridgeAckVerified:false,
      scheduledCyclesVerified:0,reason:"NO_AUTHENTICATED_SERVER_VISUAL",
    })),
  };
}
export function projectSignedFreshness(
  signed:StorageVisualView|null|undefined,now:Date=new Date()
):SignedFreshnessView {
  if(!Number.isFinite(now.getTime()))throw Error("FRESHNESS_CLOCK_INVALID");
  const view=unknownSignedFreshness(now);
  // Only readPrivateStorageVisual can authenticate this exact signed schema.
  // This function must be called solely on the server with its verified output.
  if(!signed||signed.source!=="SIGNED_PRIVATE_RECEIPT"||
      signed.authority!=="PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY")return view;
  const found=new Set<PlaneId>();
  for(const p of signed.planes){
    if(!FRESHNESS_PLANES.includes(p.id)||found.has(p.id))continue;
    found.add(p.id);
    const ms=Date.parse(p.observedAt);
    const bad=!Number.isFinite(ms)||ms>now.getTime()+FUTURE;
    const age=bad?null:Math.max(0,Math.floor((now.getTime()-ms)/1000));
    const status:FreshnessPlane["status"]=bad?"UNKNOWN":
      age!==null&&age*1000<=TTL&&p.status==="RECEIPT"
        ?"CURRENT_SERVER_SIGNED":"STALE_SERVER_SIGNED";
    const item=view.planes.find(x=>x.id===p.id)!;
    item.status=status;
    item.observedAt=bad?null:p.observedAt;
    item.ageSeconds=age;
    item.coverage=status==="UNKNOWN"?"UNKNOWN":"PARTIAL";
    item.serverVisualHmacVerified=status!=="UNKNOWN";
    item.reason=status==="CURRENT_SERVER_SIGNED"
      ?"SERVER_SIGNED_SOURCE_PRESENT_ACK_AND_NATIVE_UNPROVEN"
      :status==="STALE_SERVER_SIGNED"
        ?"SERVER_SIGNED_SOURCE_EXPIRED":"INVALID_SOURCE_TIME";
  }
  return view;
}
