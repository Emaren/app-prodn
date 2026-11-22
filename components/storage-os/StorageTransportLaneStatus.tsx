"use client";

/**
 * Storage OS Transport evidence rail. Presentation only.
 *
 * A signed capacity observation is not an exact-object transport proof.
 * This UI accepts no browser-provided claim of copy/restore/retirement,
 * creates no controller, and issues no network writes.
 *
 * Follow existing Kingdom registry PR #1442's seven ordered gates; do NOT
 * infer completion of any gate without independently admitted per-object
 * transition receipts from the original responsible OS/controller.
 */
import {Archive,LockKeyhole,ShieldAlert} from "lucide-react";

type SourceEvidence="SIGNED_CAPACITY_ONLY"|"STALE"|"UNAVAILABLE";
type IntelEvidence="SIGNED_CAPACITY_ONLY"|"UNAVAILABLE";

const STEPS=[
  {
    name:"SOURCE VERIFIED",
    owner:"VPSSentry / original source-class observer",
    proof:"Exact object identity, signed source manifest and current filesystem evidence",
  },
  {
    name:"DESTINATION VERIFIED",
    owner:"Intel Cold Storage / WE4 custody",
    proof:"Authenticated encrypted receiver and destination reservation/identity receipt",
  },
  {
    name:"COPY AUTHORIZED",
    owner:"Original source-class controller and owner permit",
    proof:"Scoped object, source, destination, campaign, expiry and recovery authorization",
  },
  {
    name:"TRANSFERRED",
    owner:"Original bounded sender and Intel forced-command receiver",
    proof:"Matching durable sender and ciphertext-receiver completion receipts",
  },
  {
    name:"HASH VERIFIED",
    owner:"Source owner and independent receiving custody",
    proof:"Full destination hash readback plus source/ciphertext manifest parity",
  },
  {
    name:"RESTORE VERIFIED",
    owner:"WE4 independent restore verifier",
    proof:"Actual isolated decryption and restore with source lineage",
  },
  {
    name:"RETIREMENT ELIGIBLE",
    owner:"WE2 exact-item retirement controller (where applicable)",
    proof:"Independent restore, all references cleared, protected rollback, one-use permit and recovery inverse",
  },
] as const;

/**
 * Public read-only lane taxonomy reviewed against the existing owner-M1
 * transport-os-lanes-current.json SHA256:
 * 8eca2ea156cea6dfa9ff1acb39868872ea4172f8ce882cfc4a360b6bf1e5282a
 *
 * That document is a private source SNAPSHOT, not a Bridge-authenticated
 * production event or any authorization. Only stable ID/source/destination
 * labels are captured here; NEVER embed mutable status or receipt claims.
 */
const LANES=[
  {
    id:"m1-to-hel1-operator",
    title:"M1 ↔ HEL1 operator",
    source:"M1 development Mac",
    destination:"HEL1 root and attached volume",
    controller:"Original M1 operator channel / WE2 Bridge admission",
    hold:"Host connectivity is not authority for file copying",
  },
  {
    id:"m1-to-intel-factory-v2",
    title:"M1 → Intel Factory archive",
    source:"M1 original Factory ZIP cache",
    destination:"Intel FileVault encrypted M1-ARCHIVE",
    controller:"WE4 source-class archive controller / Intel restricted receiver",
    hold:"Exact object owner choice and protected nonce ACK required",
  },
  {
    id:"hel1-to-intel-old-recovery",
    title:"HEL1 → Intel historical recovery",
    source:"HEL1 allowlisted completed historical migration dump",
    destination:"Intel encrypted HEL1-RECOVERY, via original M1 controller",
    controller:"VPSSentry source-class sender / WE4 recovery custody",
    hold:"Original permitted object class, capacity floor and recovery proof required",
  },
  {
    id:"hel1-local-root-volume",
    title:"HEL1 root ↔ mounted volume",
    source:"HEL1 production ext4 root /dev/sda1",
    destination:"HEL1 attached ext4 volume /dev/sdb",
    controller:"WE2 original exact class-bound local storage controller",
    hold:"Separate mount observations do not authorize file movement",
  },
  {
    id:"hel1-direct-intel",
    title:"HEL1 → Intel direct (unadmitted)",
    source:"HEL1 generic historical source",
    destination:"Intel recovery vault",
    controller:"No approved direct sender/receiver class enrolled",
    hold:"Not an authenticated route: no reuse of M1 sender credentials",
  },
] as const;

export const TRANSPORT_LANES=LANES;
export const TRANSPORT_STEPS=STEPS;

export default function StorageTransportLaneStatus({
  plane,sourceEvidence,observedAt,intelEvidence,ownerLedgerVerified,
}:{
  plane:string;
  sourceEvidence:SourceEvidence;
  observedAt:string|null;
  intelEvidence:IntelEvidence;
  ownerLedgerVerified:boolean;
}){
  const signedSource=sourceEvidence==="SIGNED_CAPACITY_ONLY";
  const signedIntel=intelEvidence==="SIGNED_CAPACITY_ONLY";
  return <section aria-label="Transport OS source-evidence and readiness lanes"
    className="rounded-[28px] border border-white/10 bg-[#0b1623] p-5 text-slate-100 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-black tracking-[.26em] text-cyan-300">TRANSPORT OS / RECEIPT-GATED READINESS</p>
        <h2 className="mt-2 text-2xl font-black text-white">From observation to proven recovery</h2>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">
          Seven separate authorities. No stage advances merely because a disk is online,
          a category is taught, or a copy was attempted. A verified source sample never authorizes a transfer.
        </p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 px-3 py-2 text-[10px] font-bold text-amber-100">
        <LockKeyhole className="h-4 w-4"/> READ-ONLY / NO COPY OR DELETE
      </span>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-3" aria-label="Independent observation coverage">
      <div className="rounded-xl border border-white/10 bg-white/[.035] p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Selected source · {plane}</div>
        <div className={"mt-2 text-sm font-bold "+(signedSource?"text-cyan-200":"text-amber-100")}>
          {signedSource?"SIGNED CAPACITY ONLY":sourceEvidence==="STALE"?"STALE / NOT ADMITTED":"UNKNOWN / NO SIGNED FEED"}
        </div>
        <div className="mt-2 break-all font-mono text-[11px] text-slate-400">
          Observed: {signedSource&&observedAt?observedAt:"UNKNOWN"}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[.035] p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Intel destination observation</div>
        <div className={"mt-2 text-sm font-bold "+(signedIntel?"text-cyan-200":"text-amber-100")}>
          {signedIntel?"SIGNED CAPACITY ONLY":"UNKNOWN / NOT ADMITTED"}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Vault capacity alone does not certify a transport destination or a receiving object.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[.035] p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Owner learning ledger</div>
        <div className={"mt-2 text-sm font-bold "+(ownerLedgerVerified?"text-cyan-200":"text-amber-100")}>
          {ownerLedgerVerified?"OWNER FEEDBACK VERIFIED":"OWNER LEDGER UNAVAILABLE"}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          A classification is owner intent, never a COPY AUTHORIZED receipt.
        </p>
      </div>
    </div>
    <div className="mt-7" aria-label="Five existing Transport OS lane definitions">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">Five existing transport lanes</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            Source-class map from the existing M1 registry, NOT a production-authenticated lane-state feed.
            All lanes require their own durable source and receiver evidence.
          </p>
        </div>
        <span className="text-[10px] font-bold text-amber-100">LIVE TRANSITION RECEIPTS · NOT ADMITTED</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {LANES.map(lane=><article key={lane.id}
          className="rounded-xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h4 className="text-sm font-black text-white">{lane.title}</h4>
            <span className="text-[10px] font-black text-amber-100">UNKNOWN / READ ONLY</span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-400">{lane.id}</p>
          <dl className="mt-3 grid gap-2 text-xs">
            <div><dt className="font-bold text-slate-300">Source</dt>
              <dd className="text-slate-400">{lane.source}</dd></div>
            <div><dt className="font-bold text-slate-300">Destination</dt>
              <dd className="text-slate-400">{lane.destination}</dd></div>
            <div><dt className="font-bold text-cyan-200">Existing controller</dt>
              <dd className="text-slate-400">{lane.controller}</dd></div>
          </dl>
          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-5 text-amber-100">
            Admission HOLD: {lane.hold}
          </p>
        </article>)}
      </div>
    </div>
    <div className="mt-5 grid gap-2 lg:grid-cols-2" aria-label="Transport evidence chain">
      {STEPS.map((step,i)=><div key={step.name}
        className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-slate-400">{String(i+1).padStart(2,"0")}/07</span>
            <span className="text-xs font-black tracking-wide text-white">{step.name}</span>
          </div>
          <span className="whitespace-nowrap text-[10px] font-black text-amber-200">NOT ADMITTED</span>
        </div>
        <p className="mt-2 text-[11px] text-cyan-100"><strong>Controller:</strong> {step.owner}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400"><strong>Required proof:</strong> {step.proof}</p>
      </div>)}
      <div className="flex min-h-[112px] items-center gap-3 rounded-xl border border-dashed border-amber-300/25 p-4 text-amber-100">
        <ShieldAlert className="h-5 w-5 shrink-0"/>
        <p className="text-xs leading-5">
          No per-object Transport OS transition receipts are admitted into this Explorer.
          Status remains NOT ADMITTED, not FAILED or completed. Archive, restore, prune
          and physical reclaim outcomes must come from their original signed controllers.
        </p>
      </div>
    </div>
    <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
      <Archive className="h-4 w-4 shrink-0"/>
      Inspect the source before any future authorization. No transfer request, path or executor is exposed here.
    </p>
  </section>;
}
