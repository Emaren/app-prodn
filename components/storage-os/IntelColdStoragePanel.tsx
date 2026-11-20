"use client";

/** Fourth plane inside the existing Explorer, not a second dashboard.
 * Intel v1 authenticates receiver/vault status, NOT a per-file inventory.
 * A free-byte receipt is never converted into "used", radial wedges or reclaim.
 */
import {Archive,Clock3,HardDrive,LockKeyhole,RefreshCw,ShieldCheck,ShieldAlert} from "lucide-react";
import type {IntelColdView} from "@/lib/intelColdStorageEvidence";

const formatBytes=(value:number|null|undefined)=>
  value===null||value===undefined||!Number.isSafeInteger(value)||value<0
    ?"UNKNOWN":(value/1024**3).toFixed(2)+" GiB";

export function IntelColdStoragePanel({snapshot,loading,error,onRefresh}:{
  snapshot:IntelColdView|null;loading:boolean;error:string|null;onRefresh:()=>void;
}){
  const valid=snapshot?.source==="SIGNED_PRIVATE_RECEIPT"&&snapshot.health==="ONLINE";
  const tenants=valid?snapshot?.tenants??[]:[];
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
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.025] p-3 text-xs leading-5 text-amber-100">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>
      Signed free space is not signed used space. Neither this source contract nor historical archives
      establish individual inode, logical/allocated size, clone overlap or reclaimable capacity.
      The previously incomplete v1 ciphertext remains NOT RECOVERABLE.</p>
    <p className="mt-3 flex items-center gap-2 text-xs text-slate-300">
      <LockKeyhole className="h-4 w-4 text-rose-300"/> Intel classification and automated cleanup: HOLD.
      Owner teaching on this plane requires a distinct accepted individual-item source and ledger version.
      <ShieldCheck className="ml-1 h-4 w-4 text-emerald-300"/> No delete authority.</p>
  </section>;
}
