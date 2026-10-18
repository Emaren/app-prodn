"use client";
import {useCallback,useEffect,useState} from "react";
import {RefreshCcw,Swords} from "lucide-react";
type Row={id:number;createdAt:string;proposer:string;metadata:unknown};
export default function NominationInbox(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/admin/kingdom-betters/nominations",{cache:"no-store"});const data=await r.json() as {rows?:Row[];detail?:string};if(!r.ok)throw new Error(data.detail||"Review queue unavailable");setRows(data.rows??[]);setError("");}catch(e){setError(e instanceof Error?e.message:"Unable to read nominations.");}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 return <section className="mb-7 rounded-3xl border border-amber-200/15 bg-slate-950/90 p-6 text-white">
  <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-3 font-serif text-2xl text-amber-100"><Swords size={22}/>Spectator Matchup Requests</h2>
    <button onClick={()=>void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-white/20 p-2 text-xs"><RefreshCcw size={14}/>Refresh</button></header>
  <p className="mt-2 text-xs text-slate-400">A nomination is not a scheduled match, accepted invitation, wager or title transfer. Review requests here, then use the canonical Challenge Hall.</p>
  {error?<p className="mt-3 text-rose-200" role="alert">{error}</p>:null}
  <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
    {rows.map(row=>{const m=row.metadata as {leftNames?:string[];rightNames?:string[];trophyId?:string|null}|null;
      return <div className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/10 bg-white/[.03] p-3" key={row.id}>
       <div><span className="font-semibold text-amber-100">#{row.id} · {row.proposer}</span><div className="mt-1 text-sm">{m?.leftNames?.join(" + ")||"—"} <span className="text-amber-300">vs</span> {m?.rightNames?.join(" + ")||"—"}</div>
        {m?.trophyId&&<div className="mt-1 text-xs text-slate-400">{m.trophyId}</div>}</div>
       <span className="text-xs text-slate-400">{new Date(row.createdAt).toLocaleString()}</span></div>;
     })}
    {!rows.length&&!error&&<p className="text-sm text-slate-500">No nominations recorded.</p>}
  </div>
 </section>;
}
