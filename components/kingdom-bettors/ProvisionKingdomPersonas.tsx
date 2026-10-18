"use client";
import {useCallback,useEffect,useState} from "react";
import {Bot,PlusCircle} from "lucide-react";

type Persona={slug:string;displayName:string;mode:string};
export default function ProvisionKingdomPersonas(){
 const [rows,setRows]=useState<Persona[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=> {
   const response=await fetch("/api/admin/betting-bots",{cache:"no-store"});
   if(!response.ok)throw new Error("Unable to read house bettor configuration.");
   const data=await response.json() as {bots?:Persona[]};
   setRows(data.bots??[]);
 },[]);
 useEffect(()=>{void load().catch(c=>setError(String(c)));},[load]);
 const missing=["tony","paulie","tommy","henry"].filter(s=>!rows.some(r=>r.slug===s));
 async function provision(){
   setBusy(true);setError("");setNotice("");
   try{
     const response=await fetch("/api/admin/kingdom-bettors/personas",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
     const data=await response.json() as {detail?:string;created?:number};
     if(!response.ok)throw new Error(data.detail||"Could not provision missing personas.");
     await load();setNotice(`Provisioned ${data.created??0} missing disabled identities. Reload the policy editor to configure them.`);
   }catch(e){setError(e instanceof Error?e.message:"Provisioning failed.");}
   finally{setBusy(false);}
 }
 return <div className="mb-6 rounded-3xl border border-amber-200/20 bg-[#0b141c] p-5">
  <div className="flex flex-wrap items-center justify-between gap-4">
   <div className="flex items-start gap-3"><Bot className="mt-1 h-6 w-6 text-amber-200"/><div><h2 className="font-serif text-2xl text-amber-100">The four house seats</h2>
   <p className="mt-1 text-xs text-slate-400">Tony · Paulie · Tommy · Henry</p></div></div>
   {missing.length?<button onClick={()=>void provision()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/40 bg-amber-200/10 px-5 py-3 text-xs font-bold text-amber-100 disabled:opacity-40"><PlusCircle size={16}/>{busy?"Working…":`Provision ${missing.length} missing seats`}</button>:<span className="rounded-full border border-emerald-300/30 px-4 py-2 text-xs text-emerald-200">All four seats recorded</span>}
  </div>
  <div className="mt-3 flex flex-wrap gap-2">{["tony","paulie","tommy","henry"].map(slug=><span key={slug} className={`rounded-md border px-3 py-1 text-[10px] uppercase tracking-[.18em] ${rows.some(r=>r.slug===slug)?"border-emerald-300/20 text-emerald-200":"border-white/15 text-slate-500"}`}>{slug}</span>)}</div>
  {error?<p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>:null}
  {notice?<p role="status" className="mt-3 text-sm text-emerald-200">{notice}</p>:null}
  <p className="mt-3 text-[11px] text-slate-500">This action creates only disabled policy rows. It does not create accounts, fund custody or place wagers. House weighting and automated real-money execution remain unavailable until separately certified.</p>
 </div>;
}
