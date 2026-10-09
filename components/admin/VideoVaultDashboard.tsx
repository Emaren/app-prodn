"use client";
import { useCallback, useEffect, useState } from "react";
import { Activity, HardDrive, Radio, ShieldCheck, Trash2, RefreshCcw } from "lucide-react";

type VideoVaultRow={
 id:number;sessionKey:string;sourceType:string;status:string;
 chunkCount:number;actualChunkCount:number|null;bytes:number|null;lastSeq:number;
 player:string;startedAt:string|null;endedAt:string|null;updatedAt:string;
 retained:boolean;retainedUntil:string|null;
};
type VideoVaultResponse={
 rows:VideoVaultRow[];totalCount:number;scanned:number;recentBytes:number;
 complete:boolean;limits:{perStreamBytes:number;perStreamChunks:number};note:string;
};
const bytes=(value:number|null)=>value===null?"Unavailable":
  value<1048576?(value/1024).toFixed(1)+" KiB":(value/1073741824).toFixed(2)+" GiB";
const date=(value:string|null)=>value?new Date(value).toLocaleString():"—";
export default function VideoVaultDashboard(){
  const [data,setData]=useState<VideoVaultResponse|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const [deleting,setDeleting]=useState<number|null>(null);
  const load=useCallback(async()=>{
    setPending(true);
    try {
      const r=await fetch("/api/admin/video-vault",{cache:"no-store"});
      if(!r.ok)throw new Error("Video Vault request failed (HTTP "+r.status+").");
      setData(await r.json() as VideoVaultResponse);
      setError(null);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setPending(false)}
  },[]);
  useEffect(()=>{void load()},[load]);
  const remove=async(row:VideoVaultRow)=>{
    if(row.retained||!["ended","failed"].includes(row.status))return;
    if(!window.confirm("Permanently delete only video chunks for #"+row.id+" ("+row.player+")? This cannot be undone. The replay and game statistics are preserved."))return;
    setDeleting(row.id);
    try{
      const r=await fetch("/api/admin/video-vault",{method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({streamId:row.id})});
      const body=await r.json().catch(()=>({})) as {detail?:string};
      if(!r.ok)throw new Error(body.detail||"Delete denied");
      await load();
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setDeleting(null)}
  };
  const live=data?.rows.filter(row=>["starting","live"].includes(row.status)).length??0;
  const recent=data?.rows.filter(row=>row.bytes!==null && row.bytes>0).length??0;
  const metrics=[
    {label:"Active captures",value:live,Icon:Radio},
    {label:"Recent recordings with bytes",value:recent,Icon:Activity},
    {label:"Measured recent storage",value:data?bytes(data.recentBytes):"—",Icon:HardDrive},
    {label:"Known first-party streams",value:data?.totalCount??"—",Icon:ShieldCheck},
  ];
  return <section className="space-y-5">
    <header className="rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,.13),transparent_50%),linear-gradient(125deg,#06111f,#160c29)] p-7">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Broadcast operations · admin only</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Wolo TV · Video Vault</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
        Capture inventory, verified filesystem storage and guarded ended-video disposal. No replay
        artifact, match record, Championship or WOLO settlement can be deleted here.
      </p>
      <button type="button" onClick={()=>void load()} disabled={pending} className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100 disabled:opacity-50">
        <RefreshCcw className="h-4 w-4"/>{pending?"Refreshing…":"Refresh inventory"}
      </button>
    </header>
    {error?<div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-900/20 p-4 text-sm text-rose-200">{error}</div>:null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(({label,value,Icon})=><div key={label} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <Icon className="h-5 w-5 text-cyan-300"/><div className="mt-4 text-xl font-bold">{value}</div>
        <div className="mt-1 text-xs text-slate-400">{label}</div>
      </div>)}
    </div>
    <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-6 text-amber-100/80">
      Storage figures are measured from actual WebM chunks for only the {data?.scanned??0} newest first-party sessions.
      {data?.complete?" This inventory covers all registered first-party sessions.":" Older recordings and orphan files are not included in the subtotal."}
      {" "}The streaming budget and automatic global retention controls need separate release certification before wide capture.
      Existing caps: {data?bytes(data.limits.perStreamBytes):"—"} per stream / {data?.limits.perStreamChunks??"—"} chunks.
    </div>
    <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-950/70">
      <div className="border-b border-white/10 p-5 text-sm font-bold text-white">Recent first-party recordings · newest first</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="bg-white/[0.04] text-slate-400"><tr>
            <th className="px-4 py-3">Stream / player</th><th className="px-4 py-3">Battle session</th>
            <th className="px-4 py-3">Health</th><th className="px-4 py-3">Bytes / chunks</th>
            <th className="px-4 py-3">When</th><th className="px-4 py-3">Controls</th>
          </tr></thead>
          <tbody className="divide-y divide-white/[0.06]">
          {(data?.rows??[]).map(row=><tr key={row.id} className="align-top hover:bg-white/[0.025]">
            <td className="px-4 py-4"><div className="font-bold text-white">{row.player}</div><div className="mt-1 text-slate-500">#{row.id} · {row.sourceType}</div></td>
            <td className="max-w-[210px] break-all px-4 py-4 text-slate-300">{row.sessionKey}</td>
            <td className="px-4 py-4"><div className={["live","starting"].includes(row.status)?"text-emerald-300":"text-slate-300"}>{row.status}</div>
            {row.retained?<div className="mt-1 text-amber-200">Protected demo</div>:null}</td>
            <td className="px-4 py-4 text-slate-200">{bytes(row.bytes)}<div className="text-slate-500">{row.actualChunkCount??"?"} verified chunks</div></td>
            <td className="px-4 py-4 text-slate-400">{date(row.startedAt)}</td>
            <td className="px-4 py-4">
            {["ended","failed"].includes(row.status)&&!row.retained?
              <button type="button" disabled={deleting!==null} onClick={()=>void remove(row)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-300/25 px-3 py-2 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5"/>{deleting===row.id?"Deleting…":"Delete video"}
              </button>:
              <span className="text-slate-500">{row.retained?"Protected":"Not deletable while live"}</span>}
            </td>
          </tr>)}
          {data?.rows.length===0?<tr><td colSpan={6} className="p-8 text-center text-slate-400">No first-party capture sessions yet.</td></tr>:null}
          </tbody>
        </table>
      </div>
    </section>
  </section>;
}
