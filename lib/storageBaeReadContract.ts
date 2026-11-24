/** Four storage surfaces / five transport lanes for private B/A/E views.
 * PURE projection of already admitted read-only evidence. No scans, SSH,
 * acceptance, transfer, financial grant, or generated authority.
 */
import type {StorageCommandCenter} from "./storageCommandCenterProjection.ts";
import type {IntelColdView} from "./intelColdStorageEvidence.ts";

export const BAE_SCHEMA="aoe2war.storage-bae.topology.v1";
export const LANE_GATES=["SOURCE VERIFIED","DESTINATION VERIFIED","COPY AUTHORIZED",
  "TRANSFERRED","HASH VERIFIED","RESTORE VERIFIED","RETIREMENT ELIGIBLE"] as const;
export type LaneGate=typeof LANE_GATES[number];
export type GateStatus="VERIFIED"|"NOT_PROVEN";
export type VerifiedAck={
  submissionId:string; receivedAt:string; storedSha256:string;
  acceptedSourceIds:readonly ["mac","hel1-root","hel1-volume-105319120"];
  evidence:"ROOT_RECEIVER_LEDGER_AND_HMAC_STATE_HASH_MATCH";
  replayProtection:"DURABLE_UNIQUE_SUBMISSION_LEDGER_PRESENT_REPLAY_DENIAL_NOT_CHALLENGED";
};
export type Machine={
  id:"mac"|"hel1-root"|"hel1-volume-105319120"|"intel";
  displayName:string; role:string; physicalHost:"M1"|"HEL1"|"INTEL";
  trust:"SERVER_HMAC_VERIFIED_NOT_SOURCE_RECHECK"|"WE2_NATIVE_V2_ED25519"|
    "INTEL_WE2_DERIVED_ED25519"|"NOT_ADMITTED";
  signedSourceType:string|null;
  observedAt:string|null; ageSeconds:number|null;
  freshness:"CURRENT"|"STALE"|"UNKNOWN"|"HOLD";
  evidenceTypes:string[];
  grossInventory:{present:boolean; categoryCount:number|null;
    grossReportedBytes:number|null; coverage:"MEASURED_PARTIAL"|"NOT_SCANNED_FOR_HOGS"|"UNKNOWN";
    meaning:"GROSS_MAY_OVERLAP_NOT_RECLAIM"};
  certifiedCapacity:{present:boolean; availableBytes:number|null;
    usedPercent:number|null; basis:string|null};
  blockers:string[];
};
export type Lane={
  id:string; label:string; source:string; destination:string;
  owner:string; gates:Record<LaneGate,GateStatus>;
  sourceReceiptScope:string|null; blockers:string[]; nextAction:string;
};
export type BaeTopology={
  schema:typeof BAE_SCHEMA; authority:"ADMIN_READ_ONLY_NO_TRANSFER_OR_RETIREMENT";
  capturedAt:string; machineCount:4; physicalHostCount:3; laneCount:5;
  machines:Machine[]; lanes:Lane[];
  receipts:{lastDurableAck:VerifiedAck|null; sourceRefreshCycles:"NOT_PROVEN";
    activeReplayDenialTest:"NOT_PERFORMED"; certifiedReclaimedBytes:null};
  presentation:{basic:"MACHINES";advanced:"MACHINES_AND_LANES";
    extreme:"MACHINES_LANES_AND_RECEIPTS"};
};

const PLANE_IDS=["mac","hel1-root","hel1-volume-105319120"] as const;
const LABELS={
  mac:["M1 Development Mac","Development workstation","M1"],
  "hel1-root":["HEL1 Root","Production OS filesystem","HEL1"],
  "hel1-volume-105319120":["HEL1 Mounted Data Volume","Production attached filesystem","HEL1"],
} as const;
function age(at:string|null,now:Date):number|null {
  if(!at)return null;
  const ms=Date.parse(at),elapsed=now.getTime()-ms;
  return Number.isFinite(ms)&&elapsed>=-60000?Math.max(0,Math.floor(elapsed/1000)):null;
}
function safeGross(hogs:readonly {grossBytes:number}[]):number|null{
  let n=0;
  for(const h of hogs){
    if(!Number.isSafeInteger(h.grossBytes)||h.grossBytes<0)return null;
    n+=h.grossBytes;
    if(!Number.isSafeInteger(n))return null;
  }
  return n;
}
function blankGates():Record<LaneGate,GateStatus>{
  return Object.fromEntries(LANE_GATES.map(k=>[k,"NOT_PROVEN"])) as Record<LaneGate,GateStatus>;
}
function lane(id:string,label:string,source:string,destination:string,owner:string,
  nextAction:string,blockers:string[]):Lane {
  return {id,label,source,destination,owner,gates:blankGates(),
    sourceReceiptScope:null,blockers,nextAction};
}
export function projectStorageBaeTopology(
  storage:StorageCommandCenter,intel:IntelColdView,ack:VerifiedAck|null,
  now:Date=new Date(),
):BaeTopology {
  if(!Number.isFinite(now.getTime()))throw Error("BAE_CLOCK_INVALID");
  const verifiedVisual=storage.visual.source==="SIGNED_PRIVATE_RECEIPT" &&
    storage.visual.authority==="PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY";
  const machines:Machine[]=PLANE_IDS.map(id=>{
    const p=verifiedVisual?storage.visual.planes.find(x=>x.id===id):undefined;
    const r=storage.planes.find(x=>x.id===id);
    const native=!!p?.nativeV2Source&&storage.visual.contract==="WE2_NATIVE_V2_ED25519";
    const fresh=!!p&&p.status==="RECEIPT"&&age(p.observedAt,now)!==null&&
      age(p.observedAt,now)!<=36*3600;
    const observedAt=p?.observedAt??null;
    const hasHogs=!!p&&fresh;
    // v1 HEL1 explicitly signs empty buckets WITHOUT scanning directories.
    // A source count of zero is evidence of no published categories, never
    // evidence that the filesystem contains zero allocated bytes.
    const unscanned=hasHogs&&id!=="mac"&&p!.hogs.length===0&&p!.coverage==="PARTIAL";
    // Only separately signed three-host/native V2 capacity counts as certified.
    // In particular, OPERATOR_ESTATE_SNAPSHOT and HMAC gross categories do NOT.
    const capacity=!!r&&r.status==="RECEIPT"&&r.freeBytes!==null&&
      (r.source==="SIGNED_THREE_PLANE_RECEIPT"||r.source==="WE2_NATIVE_V2_SIGNED_PLANE");
    const blockers:string[]=[];
    if(!p)blockers.push("SIGNED_GROSS_OBSERVATION_NOT_ADMITTED");
    else if(!fresh)blockers.push("GROSS_OBSERVATION_STALE");
    if(!capacity)blockers.push("CERTIFIED_CAPACITY_NOT_ADMITTED");
    if(!native)blockers.push("NATIVE_V2_SOURCE_NOT_ADMITTED");
    blockers.push("INDIVIDUAL_FILE_RECLAIM_NOT_VERIFIED");
    const [displayName,role,physicalHost]=LABELS[id];
    return {
      id,displayName,role,physicalHost,
      trust:native?"WE2_NATIVE_V2_ED25519":p?"SERVER_HMAC_VERIFIED_NOT_SOURCE_RECHECK":"NOT_ADMITTED",
      signedSourceType:native?"WE2_NATIVE_V2_ED25519":p?"HMAC_V1_SERVER_SIGNED_GROSS":null,
      observedAt,ageSeconds:age(observedAt,now),
      freshness:!p?"UNKNOWN":fresh?"CURRENT":"STALE",
      evidenceTypes:[...(p?["SIGNED_GROSS_CATEGORIES"]:[]),
        ...(native?["WE2_NATIVE_V2_ADMITTED"]:[]),
        ...(capacity?["SIGNED_CAPACITY_READING"]:[])],
      grossInventory:{present:hasHogs,categoryCount:hasHogs?p!.hogs.length:null,
        grossReportedBytes:unscanned?null:hasHogs?safeGross(p!.hogs):null,
        coverage:unscanned?"NOT_SCANNED_FOR_HOGS":hasHogs?"MEASURED_PARTIAL":"UNKNOWN",
        meaning:"GROSS_MAY_OVERLAP_NOT_RECLAIM"},
      certifiedCapacity:{present:capacity,availableBytes:capacity?r!.freeBytes:null,
        usedPercent:capacity?r!.usedPercent:null,basis:capacity?r!.source:null},
      blockers,
    } satisfies Machine;
  });
  const admittedIntel=intel.source==="SIGNED_PRIVATE_RECEIPT";
  const intelFresh=admittedIntel&&intel.health==="ONLINE";
  machines.push({
    id:"intel",displayName:"Intel Cold-Storage Mac",
    role:"Encrypted archive receiver / independent trust",physicalHost:"INTEL",
    trust:admittedIntel?"INTEL_WE2_DERIVED_ED25519":"NOT_ADMITTED",
    signedSourceType:admittedIntel?"INTEL_ED25519_WE2_DERIVED":null,
    observedAt:admittedIntel?intel.observedAt:null,
    ageSeconds:age(admittedIntel?intel.observedAt:null,now),
    freshness:!admittedIntel?"HOLD":intelFresh?"CURRENT":intel.health==="STALE"?"STALE":"HOLD",
    evidenceTypes:admittedIntel?["INTEL_SIGNED_VAULT_STATUS",
      ...(intel.objects?["SIGNED_CIPHERTEXT_OBJECT_INVENTORY"]:[])]:[],
    grossInventory:{present:false,categoryCount:null,grossReportedBytes:null,
      coverage:"UNKNOWN",meaning:"GROSS_MAY_OVERLAP_NOT_RECLAIM"},
    certifiedCapacity:{present:intelFresh&&intel.capacity.availableBytes!==null,
      availableBytes:intelFresh?intel.capacity.availableBytes:null,usedPercent:null,
      basis:intelFresh?"INTEL_SIGNED_AVAILABLE_BYTES":null},
    blockers:[...(!admittedIntel?["INTEL_WE2_DERIVED_ROOT_TRUST_NOT_ADMITTED"]:[]),
      ...(admittedIntel&&!intelFresh?[intel.reason]:[]),
      "INTEL_SOURCE_INDEPENDENT_OF_HMAC_BRIDGE",
      "INTEL_ARCHIVE_RETIREMENT_NOT_AUTHORIZED"],
  });
  const lanes=[
    lane("m1_hel1_operator","M1 ↔ HEL1 Operator","mac","hel1-root","WE2",
      "Verify a lane-specific operator heartbeat/command receipt under existing operator authentication.",
      ["OPERATOR_LANE_RECEIPT_NOT_ATTACHED"]),
    lane("m1_intel_archive","M1 → Intel Archive","mac","intel","WE4 / owner",
      "Match an exact M1 archive campaign to source copy authorization, ciphertext readback and independent restore.",
      ["EXACT_COPY_PERMIT_NOT_ADMITTED","ITEM_SPECIFIC_HASH_AND_RESTORE_NOT_BOUND"]),
    lane("hel1_recovery_intel","HEL1 Historical Recovery → Intel","hel1-root","intel","WE4 / owner",
      "Present an exact historical recovery artifact and its independent Intel restore receipt.",
      ["EXACT_HISTORICAL_ITEM_LANE_PROOF_MISSING"]),
    lane("hel1_root_volume","HEL1 Root ↔ HEL1 Mounted Volume","hel1-root","hel1-volume-105319120","WE2",
      "Present a source-and-destination scoped same-host copy/restore receipt before marking transfer.",
      ["SAME_HOST_LANE_TRANSFER_RECEIPT_NOT_ADMITTED"]),
    lane("hel1_intel_direct","HEL1 → Intel Direct","hel1-root","intel","WE4 / owner",
      "Direct route not admitted; ask the source owner for an independently reviewed route-specific controller.",
      ["DIRECT_LANE_PERMIT_AND_TRANSFER_RECEIPT_NOT_ADMITTED"]),
  ];
  // Historical tenant and catalog summaries are not a campaign/object/route
  // receipt chain. Keep them in the independently signed Intel view; never
  // promote a tenant's unrelated last-copy and last-restore or an aggregate
  // destination inventory to a route gate. A future authenticated per-object
  // adapter can supply a correlated projection without changing authority.
  const m1Archive=admittedIntel?intel.tenants.find(t=>
    t.id==="WE2"&&t.identity==="ISOLATED"&&t.namespace==="M1-ARCHIVE"):undefined;
  if(m1Archive?.lastTransfer||m1Archive?.lastRestore){
    lanes[1].sourceReceiptScope="SIGNED_INTEL_WE2_TENANT_HISTORICAL_PROOFS";
    lanes[1].blockers.push("HISTORICAL_TENANT_PROOFS_NOT_BOUND_TO_SAME_OBJECT");
  }
  const hel1Archive=admittedIntel?intel.objects?.filter(o=>
    o.namespace==="HEL1-RECOVERY"&&o.contentSha256VerifiedNow)??[]:[];
  if(hel1Archive.length>0){
    lanes[2].sourceReceiptScope="SIGNED_INTEL_HEL1_RECOVERY_HISTORICAL_OBJECT_ONLY";
    lanes[2].blockers.push("HISTORICAL_DESTINATION_INVENTORY_NOT_ROUTE_PROOF");
  }
  return {
    schema:BAE_SCHEMA,authority:"ADMIN_READ_ONLY_NO_TRANSFER_OR_RETIREMENT",
    capturedAt:now.toISOString(),machineCount:4,physicalHostCount:3,laneCount:5,
    machines,lanes,
    receipts:{lastDurableAck:ack,sourceRefreshCycles:"NOT_PROVEN",
      activeReplayDenialTest:"NOT_PERFORMED",certifiedReclaimedBytes:null},
    presentation:{basic:"MACHINES",advanced:"MACHINES_AND_LANES",
      extreme:"MACHINES_LANES_AND_RECEIPTS"},
  };
}
