"use client";

/** Fourth plane inside the existing Explorer, not a second dashboard.
 * Intel v1 authenticates receiver/vault status; optional per-object cards require
 * separately WE2-admitted original Intel source linkage and root-signed UI proof.
 * A free-byte receipt is never converted into "used", radial wedges or reclaim.
 */
import {Archive,Clock3,HardDrive,LockKeyhole,RefreshCw,ShieldCheck,ShieldAlert} from "lucide-react";
import type {IntelColdView} from "@/lib/intelColdStorageEvidence";

const formatBytes=(value:number|null|undefined)=>
  value===null||value===undefined||!Number.isSafeInteger(value)||value<0
    ?"UNKNOWN":(value/1024**3).toFixed(2)+" GiB";
const formatItemBytes=(v:number)=>
  !Number.isSafeInteger(v)||v<0?"UNKNOWN":v.toLocaleString("en-US")+" bytes";

export function IntelColdStoragePanel({snapshot,loading,error,onRefresh}:{
  snapshot:IntelColdView|null;loading:boolean;error:string|null;onRefresh:()=>void;
}){
  const valid=snapshot?.source==="SIGNED_PRIVATE_RECEIPT"&&snapshot.health==="ONLINE";
  const tenants=valid?snapshot?.tenants??[]:[];
  const objects=valid?snapshot?.objects??null:null;
  const restoreCounts=objects?{
    pass:objects.filter(x=>x.restore==="HISTORICAL_RESTORE_PROOF_PRESENT").length,
    unknown:objects.filter(x=>x.restore==="RECOVERY_UNVERIFIED").length,
    failed:objects.filter(x=>x.restore==="KNOWN_FAILED_DECRYPTION").length,
  }:null;
  return <section aria-label="Fourth signed storage plane: Intel encrypted vault"
    className="rounded-[24px] border border-white/[.09] bg-[#0c1624]/90 p-5 shadow-[0_15px_55px_rgba(0,0,0,.15)] sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.26em] text-cyan-300">
          Fourth plane / independent source contract</div>
        <h2 className="mt-2 flex items-center gap-2 text-2xl font-black text-white">
          <Archive className="h-6 w-6 text-cyan-300"/> Intel · Encrypted cold-storage vault</h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
          Authenticated vault status and recovery provenance only. No host scan from the browser.
          Per-file identities, allocated/logical bytes, archive overlaps and unique recovery remain UNKNOWN
          until independently accepted signed source contracts deliver them.</p>
      </div>
      <button type="button" onClick={onRefresh} disabled={loading}
        aria-label="Refresh independently signed Intel vault observation"
        className="rounded-xl border border-cyan-300/30 p-3 text-cyan-100 disabled:opacity-40">
        <RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/></button>
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
      <span role="status" className={"rounded-full border px-3 py-1.5 font-bold "+
        (valid?"border-emerald-300/35 text-emerald-200":"border-amber-300/35 text-amber-200")}>
        {valid?"FRESH / SIGNATURE VERIFIED":(snapshot?.health??"HOLD")+" / NOT ADMITTED"}</span>
      <span className="flex items-center gap-1 text-slate-400"><Clock3 className="h-4 w-4"/>
        Observed {valid?snapshot.observedAt:"UNKNOWN"}</span>
      <span className="font-mono text-slate-500">{error??snapshot?.reason??"NO SIGNED INTEL RECEIPT"}</span>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Ordinary available",valid?formatBytes(snapshot.capacity.availableBytes):"UNKNOWN"],
        ["Signed vault filesystem",valid?snapshot.hardware.volumeUuid??"UNKNOWN":"UNKNOWN"],
        ["FileVault",valid?(snapshot.hardware.fileVault?"ENABLED":"HOLD"):"UNKNOWN"],
        ["Receiver / source",valid?(snapshot.receiverVersion??"UNKNOWN")+" · "+(snapshot.hardware.model??"UNKNOWN"):"UNKNOWN"],
      ].map(([key,value])=><div key={key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs text-slate-400">{key}</div>
        <div className="mt-2 break-words font-mono text-sm font-semibold text-white">{value}</div>
      </div>)}
    </div>
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100"><HardDrive className="h-4 w-4 text-cyan-300"/>
        Signed archive namespaces · recovery evidence</h3>
      {tenants.length===0?<p className="mt-3 text-sm text-amber-100">
        No current verified Intel tenant inventory. Missing evidence is not an empty vault.</p>:
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {tenants.map(t=><div key={t.id} className="rounded-xl border border-white/10 p-3 text-xs">
          <div className="font-bold text-white">{t.id} · {t.namespace}</div>
          <div className="mt-1 text-slate-400">Identity: {t.identity}</div>
          <div className="mt-1 text-slate-300">Committed objects: {t.committedObjects??"UNKNOWN"}</div>
          <div className="mt-1 text-slate-300">Quota: {formatBytes(t.quotaBytes)}</div>
          <div className="mt-2 text-slate-300">Last restore:
            <strong className="text-amber-100"> {t.lastRestore?"SHA parity recorded · not deletion proof":"NOT PROVEN"}</strong>
          </div>
          {t.lastRestore&&<div className="mt-1 break-all text-[10px] text-slate-400">
            {t.lastRestore.campaign} · {t.lastRestore.observedAt}</div>}
          <div className="mt-2 text-slate-400">Independent failure-domain escrow: {t.failureDomainEscrow}</div>
        </div>)}
      </div>}
    </div>
    <section aria-label="WE2-admitted Intel ciphertext object recovery classes"
      className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <h3 className="text-sm font-bold text-white">Signed vault objects · recovery truth</h3>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        Only opaque source aliases are shown. Allocation is observed ciphertext storage,
        not unique space reclaimed. Protection is UNKNOWN until individually classified
        against its own source identity. Historical restores do not authorize deletion.</p>
      {!objects||!restoreCounts?
        <p role="status" className="mt-4 text-sm text-amber-100">
          UNADMITTED per-object source proof. Object count, sizes and recovery classes
          remain UNKNOWN; a signed vault status alone cannot certify them.</p>:
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              ["HISTORICAL RESTORE PASS",restoreCounts.pass],
              ["RECOVERY UNKNOWN",restoreCounts.unknown],
              ["FAILED DECRYPTION",restoreCounts.failed],
            ].map(([label,count])=><div key={label} className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-white">{count}</p>
            </div>)}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[...objects].sort((a,b)=>
              (a.restore==="KNOWN_FAILED_DECRYPTION"?0:a.restore==="RECOVERY_UNVERIFIED"?1:2)-
              (b.restore==="KNOWN_FAILED_DECRYPTION"?0:b.restore==="RECOVERY_UNVERIFIED"?1:2)
              ||a.alias.localeCompare(b.alias)).map(o=>
              <article key={o.alias} className="min-w-0 rounded-xl border border-white/10 p-3 text-xs">
                <p className="break-all font-mono font-semibold text-slate-100">{o.alias}</p>
                <p className="mt-1 text-slate-400">{o.namespace} ·
                  signed {snapshot?.observedAt??"UNKNOWN"}</p>
                <p className="mt-2 font-semibold text-amber-100">
                  {o.restore==="HISTORICAL_RESTORE_PROOF_PRESENT"?
                    "PASS · historical independent restore receipt":
                    o.restore==="KNOWN_FAILED_DECRYPTION"?
                      "FAILED DECRYPTION · NOT RECOVERABLE":
                      "RECOVERY UNKNOWN · NOT CERTIFIED"}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-slate-300">
                  <span>Allocated: {formatItemBytes(o.allocatedBytes)}</span>
                  <span>Logical: {formatItemBytes(o.logicalBytes)}</span>
                  <span>Protection: UNKNOWN</span>
                  <span>Shared blocks: UNCERTAIN</span>
                </div>
                <p className="mt-2 break-all text-[10px] text-slate-500">
                  Independent receipt: {o.restoreReceiptSha256??"UNKNOWN"}
                  {" · "}Now-hashed ciphertext: {o.contentSha256VerifiedNow?"YES":"NOT VERIFIED"}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  Reclaim: UNKNOWN · No transfer, retirement or deletion authority.</p>
              </article>)}
          </div>
        </>}
    </section>
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.025] p-3 text-xs leading-5 text-amber-100">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>
      Signed free space is not signed used space. Optional verified ciphertext items may report
      their own logical/allocated bytes, but cannot establish unique physical reclaim, source-retirement
      eligibility or independent current restore. The previous incomplete v1 ciphertext is NOT RECOVERABLE.</p>
    <p className="mt-3 flex items-center gap-2 text-xs text-slate-300">
      <LockKeyhole className="h-4 w-4 text-rose-300"/> Intel classification and automated cleanup: HOLD.
      Owner teaching on this plane requires a distinct accepted individual-item source and ledger version.
      <ShieldCheck className="ml-1 h-4 w-4 text-emerald-300"/> No delete authority.</p>
  </section>;
}
