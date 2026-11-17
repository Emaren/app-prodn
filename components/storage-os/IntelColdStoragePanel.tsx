"use client";

import {useCallback,useEffect,useState} from "react";
import {
  Archive,CheckCircle2,CloudOff,Database,HardDrive,KeyRound,LockKeyhole,
  RefreshCw,Server,ShieldAlert,ShieldCheck,Wifi,WifiOff,
} from "lucide-react";
import type {IntelColdView,ColdTenant} from "@/lib/intelColdStorageEvidence";

const PANEL="rounded-[24px] border border-white/10 bg-[#0c1624]/95 p-5 sm:p-6";
const UNKNOWN="UNKNOWN · NO ADMITTED RECEIPT";
function size(n:number|null|undefined){
  if(n===null||n===undefined||!Number.isSafeInteger(n)||n<0)return "UNKNOWN";
  return (n/1024**3).toFixed(2)+" GiB";
}
function observed(d:string|null){
  if(!d)return "No signed Intel observation";
  const age=Date.now()-Date.parse(d);
  if(!Number.isFinite(age)||age<0)return "CLOCK DRIFT";
  return Math.floor(age/60_000)+" min ago · "+d;
}
function proofStatus(proof:ColdTenant["lastRestore"]){
  return proof&&proof.sourceSha256===proof.restoredSha256?"SOURCE SHA PARITY":"NO INDEPENDENT RESTORE";
}
const TENANT_TITLE:Record<ColdTenant["id"],string>={
  WE2:"AoE2WAR · Working infrastructure",
  WE3:"Kingdom Traders · PAPER estate",
  WE4:"Meditations · private records",
};
function Tenant({item}:{item:ColdTenant}){
  const isHeld=item.identity!=="ISOLATED";
  return <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-bold text-white">{TENANT_TITLE[item.id]}</h4>
        <p className="mt-1 text-[11px] text-slate-400">
          Namespace: <code className="text-slate-200">{item.namespace}</code>
        </p></div>
      <span className={"rounded-full border px-2 py-1 text-[10px] font-black "+
        (isHeld?"border-amber-300/30 text-amber-100":"border-cyan-300/35 text-cyan-100")}>
        {isHeld?"NOT ENROLLED / HOLD":"ISOLATED IDENTITY"}
      </span>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div><dt className="text-slate-400">Per-tenant quota</dt>
        <dd className="mt-1 font-semibold text-white">{size(item.quotaBytes)}</dd></div>
      <div><dt className="text-slate-400">Committed / invalid</dt>
        <dd className="mt-1 font-semibold text-white">
          {item.committedObjects??"?"} / {item.invalidObjects??"?"}</dd></div>
      <div className="col-span-2"><dt className="text-slate-400">Last independent restore</dt>
        <dd className="mt-1 font-semibold text-white">{proofStatus(item.lastRestore)}</dd>
        {item.lastRestore&&<p className="mt-1 break-all font-mono text-[10px] text-slate-400">
          {item.lastRestore.campaign} · {item.lastRestore.observedAt}</p>}</div>
      <div className="col-span-2"><dt className="text-slate-400">Recovery-key custody / second failure domain</dt>
        <dd className="mt-1 font-semibold text-amber-100">{item.failureDomainEscrow}</dd></div>
    </dl>
    <div className="mt-4 flex items-center justify-between rounded-lg border border-stone-400/20 bg-stone-600/10 px-3 py-2 text-xs">
      <span className="flex items-center gap-2 text-stone-200">
        <LockKeyhole className="h-4 w-4"/> Source reclamation</span>
      <strong className="text-stone-100">LOCKED</strong>
    </div>
  </section>;
}
export default function IntelColdStoragePanel(){
  const [snapshot,setSnapshot]=useState<IntelColdView|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),6000);
    setLoading(true);
    try{
      const response=await fetch("/api/admin/storage-os/intel",{
        credentials:"same-origin",cache:"no-store",signal:controller.signal});
      if(!response.ok)throw Error("INTEL_SIGNED_EVIDENCE_REJECTED");
      const body=await response.json() as IntelColdView;
      if(body.schema!=="aoe2war.intel-cold.status.v1"||
        body.authority!=="READ_ONLY_NO_CLEANUP_OR_REINSTALL")throw Error("INTEL_SCHEMA_HOLD");
      setSnapshot(body);setError(null);
    }catch(e){
      if(!controller.signal.aborted){
        setSnapshot(null);setError(e instanceof Error?e.message:"INTEL_EVIDENCE_UNAVAILABLE");
      }
    }finally{window.clearTimeout(timeout);setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const poll=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},60000);
    return()=>window.clearInterval(poll);
  },[refresh]);
  const health=snapshot?.health??"HOLD";
  const good=health==="ONLINE"&&snapshot?.source==="SIGNED_PRIVATE_RECEIPT";
  const vault=snapshot?.hardware;
  const ssh=snapshot?.ssh;
  const capacity=snapshot?.capacity;
  return <section id="intel-cold-storage" aria-label="Intel Cold Storage OS"
    className={PANEL+" space-y-5"}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-[10px] font-black uppercase tracking-[.26em] text-cyan-300">
          Cold Storage OS / Intel vault
        </p>
        <h2 className="mt-2 flex items-center gap-3 text-2xl font-black text-white sm:text-3xl">
          <Archive className="h-7 w-7 text-cyan-300"/> Independent recovery vault
        </h2>
        <p className="mt-2 text-xs leading-6 text-slate-400">
          Tenant-separated, encrypted archive evidence. This website only reads a sanitized
          signed status. It cannot connect to Intel, export keys, reinstall SSH or delete an archive.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span role="status" className={"rounded-full border px-3 py-2 text-xs font-black "+
          (good?"border-emerald-300/40 text-emerald-100":
            "border-amber-300/40 text-amber-100")}>
          {good?"ONLINE / SIGNED":health+" / "+(snapshot?.source??"NO SOURCE")}
        </span>
        <button type="button" onClick={()=>void refresh()} disabled={loading}
          aria-label="Refresh signed Intel evidence, do not restart receiver"
          className="rounded-xl border border-cyan-300/35 p-2.5 text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-45">
          <RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>
        </button>
      </div>
    </header>
    {error&&<div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
      {error} · No unverified online status will be shown.
    </div>}
    <p className="text-[11px] text-slate-400">
      Observation: {observed(snapshot?.observedAt??null)} ·
      {snapshot?.reason??" NO SIGNED RECEIPT"} · No browser-origin host scan
    </p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Server className="h-4 w-4"/> Intel model / FileVault</div>
        <div className="mt-3 font-bold text-white">{vault?.model??UNKNOWN}</div>
        <p className="mt-2 text-xs text-slate-300">
          {vault?.fileVault===null||vault?.fileVault===undefined?"FILEVAULT UNKNOWN":
            vault.fileVault?"FileVault ON":"FILEVAULT OFF / HOLD"}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Wifi className="h-4 w-4"/> SSH service boundaries</div>
        <p className="mt-3 font-bold text-white">
          Port 22: {ssh?.port22===undefined||ssh.port22===null?"UNKNOWN":ssh.port22?"LISTEN":"OFF"}
        </p>
        <p className="mt-2 text-xs text-slate-300">
          Dedicated 2222: {ssh?.port2222===undefined||ssh.port2222===null?"UNKNOWN":
            ssh.port2222?"LISTEN":"OFF"}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <HardDrive className="h-4 w-4"/> Vault free / 60 GiB reserve</div>
        <div className="mt-3 text-xl font-black text-white">
          {size(capacity?.availableBytes)}</div>
        <p className="mt-2 text-xs text-slate-300">
          Margin: {size(capacity?.headroomAboveReserve)}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <KeyRound className="h-4 w-4"/> Receiver integrity</div>
        <div className="mt-3 font-bold text-white">
          {snapshot?.receiverVersion??"VERSION UNKNOWN"}</div>
        <p className="mt-2 break-all font-mono text-[10px] text-slate-400">
          {ssh?.hostFingerprint??"HOST KEY UNVERIFIED"}</p>
      </div>
    </div>
    <div className="rounded-2xl border border-rose-300/25 bg-rose-950/20 p-4">
      <h3 className="flex items-center gap-2 text-sm font-black text-rose-100">
        <ShieldAlert className="h-5 w-5"/> v1 incomplete archive incident · NOT RECOVERABLE
      </h3>
      <p className="mt-2 text-xs leading-6 text-slate-300">
        A valid receiver HMAC receipt once accompanied truncated age ciphertext.
        Independent decryption failed. Copy-only readback never grants source retirement.
        The original incident object is retained for investigation; even v2 receipts
        still require independent decryption and source SHA parity.
      </p>
      <p className="mt-2 text-[10px] font-black tracking-wider text-rose-200">
        NO RECLAIM · NO RETIREMENT · NO IMPLICIT V1 PROMOTION
      </p>
    </div>
    <div>
      <h3 className="flex items-center gap-2 text-lg font-bold text-white">
        <Database className="h-5 w-5 text-cyan-300"/> Isolated tenant archives
      </h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {(snapshot?.tenants??(["WE2","WE3","WE4"] as const).map(id=>({
          id,namespace:id==="WE2"?"M1-ARCHIVE":"NOT_ENROLLED",
          identity:"NOT_ENROLLED" as const,quotaBytes:null,committedObjects:null,
          invalidObjects:null,lastTransfer:null,lastRestore:null,
          failureDomainEscrow:"HOLD" as const,cleanup:"LOCKED" as const,
          reclaimableBytes:null}))).map(item=><Tenant key={item.id} item={item}/>)}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-stone-400/20 bg-stone-700/10 p-3 text-xs text-stone-200">
        <LockKeyhole className="h-4 w-4"/> WE1 financial custody remains quarantined;
        no vault UI or shared tenant key can authorize its transfer.
      </div>
    </div>
    <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer text-sm font-bold text-cyan-100">
        Reconnect and post-reboot checklist · read-only
      </summary>
      <ol className="mt-3 list-inside list-decimal space-y-2 text-xs leading-6 text-slate-300">
        <li>Check Intel LAN reachability and compare the known ED25519 host fingerprint.</li>
        <li>Confirm port 22 remains available, then check the isolated port 2222 listener.</li>
        <li>Inspect launchd service state and FileVault locally on Intel using the approved owner runbook.</li>
        <li>If sleeping/offline, inspect power and network before treating it as a failed installation.</li>
        <li>Do not reinstall, reactivate, bypass restricted SSH keys or reconfigure the healthy daemon.</li>
        <li>Only a proven broken service may enter separately approved owner-console repair.</li>
      </ol>
    </details>
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
      <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4"/> Signed evidence only</span>
      <span className="flex items-center gap-1.5"><CloudOff className="h-4 w-4"/> Offline means unknown, not zero</span>
      <span className="flex items-center gap-1.5"><WifiOff className="h-4 w-4"/> No live SSH from website</span>
      <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4"/> Restore before retire</span>
    </div>
  </section>;
}
