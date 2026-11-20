"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {Archive,LockKeyhole,RefreshCw,ShieldCheck} from "lucide-react";
import type {ExactItemView} from "@/lib/storageExactItemSource";
import type {ArchiveEvent,ArchiveChoice} from "@/lib/storageArchivePreferenceLedger";
import type {TeachingPlane} from "@/lib/storageHogTeachingPolicy";
type Snapshot={
  schema:string;source:ExactItemView;events:ArchiveEvent[];
  intelOnline:boolean;authority:string;transferAuthorized:false;deleteAuthorized:false;
};
const size=(v:number)=>v>=1024**3?(v/1024**3).toFixed(2)+" GiB":
  v>=1024**2?(v/1024**2).toFixed(1)+" MiB":v+" B";

export default function StorageArchivePreference({plane}:{plane:TeachingPlane}){
  const [data,setData]=useState<Snapshot|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    try{
      const r=await fetch("/api/admin/storage-os/archive-preference",{
        credentials:"same-origin",cache:"no-store"});
      const body=await r.json();
      if(!r.ok)throw Error(body.detail??"OWNER ARCHIVE PREFERENCE UNAVAILABLE");
      const view=body as Snapshot;
      if(view.schema!=="aoe2war.storage-archive-preferences.read.v1"||
        view.authority!=="OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE"||
        view.transferAuthorized!==false||view.deleteAuthorized!==false||
        !Array.isArray(view.source.items)||!Array.isArray(view.events))
        throw Error("ARCHIVE_READ_RECEIPT_INVALID");
      setData(view);setError(null);
    }catch(e){setData(null);setError(e instanceof Error?e.message:"ARCHIVE_SOURCE_HOLD");}
  },[]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},60_000);
    return()=>window.clearInterval(timer);
  },[refresh]);
  const items=useMemo(()=>data?.source.source==="SIGNED_PRIVATE_RECEIPT"
    ?data.source.items.filter(i=>i.plane===plane)??[]:[],[data,plane]);
  const item=items.find(x=>x.objectId===selected)??null;
  const history=item?(data?.events.filter(e=>e.objectId===item.objectId)??[]):[];
  const latest=history.at(-1)??null;
  const submit=async(choice:ArchiveChoice)=>{
    if(!item||loading)return;
    setLoading(true);setNotice(null);
    try{
      const response=await fetch("/api/admin/storage-os/archive-preference",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          objectId:item.objectId,fingerprint:item.fingerprint,
          sourceDigest:item.sourceDigest,observedAt:item.observedAt,
          choice,previousChoiceId:latest?.id??null,
        }),
      });
      const result=await response.json() as {
        detail?:string;status?:string;authority?:string;
        event?:ArchiveEvent;transferAuthorized?:boolean;deleteAuthorized?:boolean;
      };
      if(!response.ok)throw Error(result.detail??"ARCHIVE_OWNER_CHOICE_HOLD");
      if(result.authority!=="OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE"||
         result.transferAuthorized!==false||result.deleteAuthorized!==false||
         !result.event?.id||!/^[a-f0-9]{64}$/.test(result.event.digestSha256))
        throw Error("ARCHIVE_WRITE_RECEIPT_INCOMPLETE_CHECK_HISTORY");
      setNotice("Recorded "+choice+" · "+result.status+" · event "+result.event.id+
        " · no transfer or deletion authorized.");
      await refresh();
    }catch(e){setNotice(e instanceof Error?e.message:"ARCHIVE_WRITE_HOLD");}
    finally{setLoading(false);}
  };
  return <section aria-label="Owner Intel archive preference" className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-300">SEPARATE OWNER CHOICE · NEVER DELETE</p>
        <h3 className="mt-2 flex items-center gap-2 text-lg font-bold text-white">
          <Archive className="h-5 w-5 text-cyan-300"/> Send to Intel cold storage?</h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          YES / NO is saved against one independently signed filesystem object,
          separate from its Level 1–5 protection. Unanswered objects cannot transfer.
          YES never initiates a transfer or permits deletion.</p>
      </div>
      <button type="button" onClick={()=>void refresh()} disabled={loading}
        aria-label="Refresh signed object and archive choice history"
        className="rounded-xl border border-cyan-300/30 p-2 text-cyan-200 disabled:opacity-50">
        <RefreshCw className="h-4 w-4"/></button>
    </div>
    {error&&<p role="alert" className="mt-3 text-xs text-amber-200">{error} · No decision inferred.</p>}
    {!data||data.source.source!=="SIGNED_PRIVATE_RECEIPT"?
      <p className="mt-4 rounded-xl border border-dashed border-amber-300/20 p-4 text-xs leading-5 text-amber-100">
        Individual signed-object evidence: UNKNOWN / NOT ADMITTED.
        Gross category allocations do not identify a file. YES / NO stays unavailable until
        WE1 and WE2 accept a physical object ID, device/inode, measured allocation and fresh signature.
        The existing three-plane category teaching workflow is independent of this gate.</p>:
      items.length===0?<p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-300">
        No admitted exact objects on this source plane. This does not mean the drive is empty.</p>:
      <>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {items.map(x=>{
            const previous=data.events.filter(e=>e.objectId===x.objectId).at(-1);
            return <button key={x.objectId} type="button" aria-pressed={selected===x.objectId}
              onClick={()=>{setSelected(x.objectId);setNotice(null);}}
              className={"rounded-xl border px-4 py-3 text-left text-xs "+
                (selected===x.objectId?"border-cyan-300/60 bg-cyan-300/[.07]":
                  "border-white/10 hover:border-white/25")}>
              <div className="font-bold text-white">{x.alias} · {size(x.allocatedBytes)} allocated</div>
              <div className="mt-1 text-slate-400">{x.machine} · L{x.level} · {previous?.choice??"UNANSWERED"}</div>
            </button>;
          })}
        </div>
        {item&&<div className="mt-4 rounded-xl border border-cyan-300/15 p-4">
          <div className="text-sm font-bold text-white">{item.alias}</div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            {[
              ["Machine / plane",item.machine+" / "+item.plane],
              ["Allocated / logical",size(item.allocatedBytes)+" / "+size(item.logicalBytes)],
              ["Filesystem / device / inode",item.filesystemUuid+" · "+item.deviceId+" · "+item.inode],
              ["Protection / overlaps","L"+item.level+" / "+item.overlap],
              ["Source signature",item.observedAt+" · CURRENT VERIFIED"],
              ["Intel recoverability",item.restore+" · "+(data.intelOnline?"VAULT ONLINE":"VAULT OFFLINE OR UNVERIFIED")],
              ["Dependencies",item.dependencies],
              ["Object fingerprint",item.fingerprint],
            ].map(([label,value])=><div key={label} className="break-all">
              <dt className="text-slate-500">{label}</dt><dd className="mt-1 text-slate-200">{value}</dd>
            </div>)}
          </dl>
          <div className="mt-4 text-xs font-bold text-cyan-200">
            Current choice: {latest?.choice==="NO"?"NO · NOT QUEUED":
              latest?.choice==="YES"?(data.intelOnline?"YES · TRANSFER HELD":"YES · QUEUED (INTEL OFFLINE)"):
              "UNANSWERED · NOT QUEUED"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Send to Intel cold storage?">
            <button type="button" onClick={()=>void submit("YES")}
              disabled={loading||latest?.choice==="YES"}
              className="rounded-xl border border-emerald-300/40 px-5 py-2.5 text-sm font-bold text-emerald-100 disabled:opacity-35">
              YES · record preference</button>
            <button type="button" onClick={()=>void submit("NO")}
              disabled={loading||latest?.choice==="NO"}
              className="rounded-xl border border-rose-300/40 px-5 py-2.5 text-sm font-bold text-rose-100 disabled:opacity-35">
              NO · do not queue</button>
          </div>
          <p role="status" className="mt-3 text-xs text-slate-300">{notice??"Owner decides. Neither answer grants transfer, migration or cleanup authority."}</p>
          {history.length>0&&<details className="mt-3 rounded-xl border border-white/10 p-3">
            <summary className="cursor-pointer text-xs font-bold text-cyan-200">
              Inspect {history.length} immutable archive choice event(s)</summary>
            <ol className="mt-2 space-y-2">
              {history.map(e=><li key={e.id} className="break-all border-t border-white/10 py-2 text-xs">
                <div>{e.at} · {e.choice} · {e.id}</div>
                <div className="mt-1 text-slate-400">SHA-256 {e.digestSha256} · prior choice {e.previousChoiceId??"GENESIS"}</div>
              </li>)}
            </ol>
          </details>}
        </div>}
      </>}
    <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
      <LockKeyhole className="h-4 w-4 text-amber-200"/> No transfer executor.
      <ShieldCheck className="h-4 w-4 text-cyan-200"/> L3/L4 sticky and L5 permanent protection remain unchanged.</p>
  </section>;
}
