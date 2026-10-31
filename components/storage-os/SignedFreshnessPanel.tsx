"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Activity,Clock3,LockKeyhole,ShieldAlert,ShieldCheck,WifiOff} from "lucide-react";
import type {SignedFreshnessView,FreshnessPlane} from "@/lib/storageSignedFreshness";

const IDS=["mac","hel1-root","hel1-volume-105319120"] as const;
const LABELS=["Mac Pulse","HEL1 Root","HEL1 Evidence Volume"] as const;
function describe(p:FreshnessPlane, now:number):string {
  if(p.status==="UNKNOWN"||!p.observedAt||p.ageSeconds===null)return "NO VERIFIED READING";
  const delta=Date.parse(p.observedAt);
  if(!Number.isFinite(delta)||delta>now+60000)return "INVALID SOURCE CLOCK";
  const seconds=Math.max(0,Math.floor((now-delta)/1000));
  if(seconds<60)return "<1m ago";
  if(seconds<3600)return Math.floor(seconds/60)+"m ago";
  return Math.floor(seconds/3600)+"h ago";
}
const FALLBACK:FreshnessPlane[]=IDS.map((id,i)=>({
 id,label:LABELS[i],status:"UNKNOWN",observedAt:null,ageSeconds:null,
 coverage:"UNKNOWN",serverVisualHmacVerified:false,sourceHmacVerifiedAtRead:false,
 durableBridgeAckVerified:false,scheduledCyclesVerified:0,
 reason:"NO_AUTHENTICATED_SERVER_VISUAL"
}));
export default function SignedFreshnessPanel(){
  const [view,setView]=useState<SignedFreshnessView|null>(null);
  const [failure,setFailure]=useState(false);
  const [busy,setBusy]=useState(true);
  const ref=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(ref.current)return;
    const controller=new AbortController();
    ref.current=controller;
    const timeout=window.setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch("/api/admin/storage-os/freshness",{
        cache:"no-store",credentials:"same-origin",signal:controller.signal
      });
      if(!response.ok)throw new Error("PRIVATE_RECEIPT_UNAVAILABLE");
      const data=await response.json() as SignedFreshnessView;
      if(data.schema!=="aoe2war.storage-os.signed-freshness.v1"||
          data.authority!=="PRIVATE_READ_ONLY_NOT_ADOPTION"||
          data.decision!=="NOT_ADOPTED"||!Array.isArray(data.planes)||
          data.planes.length!==3||data.planes.some(p=>!IDS.includes(p.id)))
        throw new Error("UNRECOGNIZED_EVIDENCE");
      if(ref.current===controller&&!controller.signal.aborted){
        setView(data);setFailure(false);
      }
    }catch{
      if(ref.current===controller){setView(null);setFailure(true);}
    }finally{
      window.clearTimeout(timeout);
      if(ref.current===controller){ref.current=null;setBusy(false);}
    }
  },[]);
  useEffect(()=>{
    const handle=()=>{
      if(document.visibilityState==="visible")void refresh();
      else {ref.current?.abort();ref.current=null;setView(null);}
    };
    handle();
    const id=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15_000);
    document.addEventListener("visibilitychange",handle);
    return()=>{window.clearInterval(id);document.removeEventListener("visibilitychange",handle);
      ref.current?.abort();ref.current=null;};
  },[refresh]);
  const records=view?.planes??FALLBACK;
  return <section aria-labelledby="c-freshness-title" data-testid="c-signed-freshness"
    className="relative overflow-hidden rounded-[1.65rem] border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-[#0c1727] to-slate-950 p-5 shadow-[0_20px_70px_rgba(0,0,0,.20)] sm:p-7">
    <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/[.055] blur-3xl"/>
    <div className="relative flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-200/80">
          <Activity aria-hidden className="h-4 w-4"/> Source trust / Freshness
        </div>
        <h2 id="c-freshness-title" className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Signed observation integrity</h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
          Signed server visual is not an authenticated host delivery ACK, a natural schedule witness, or a production adoption permit.
        </p>
      </div>
      <span data-testid="c-adoption-state" className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-amber-200">
        <LockKeyhole aria-hidden className="h-4 w-4"/> Not adopted
      </span>
    </div>
    {failure&&<p role="alert" className="relative mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[.06] p-3 text-xs text-rose-200">
      Authenticated freshness read failed. All source states withheld as UNKNOWN.
    </p>}
    <div className="relative mt-5 grid gap-3 md:grid-cols-3" aria-label="Signed freshness per host plane">
      {IDS.map((id,i)=>{
        const plane=records.find(p=>p.id===id)??FALLBACK[i];
        const current=plane.status==="CURRENT_SERVER_SIGNED"&&plane.serverVisualHmacVerified;
        const stale=plane.status==="STALE_SERVER_SIGNED";
        const label=current?"SERVER SIGNED":stale?"STALE SIGNED":"UNKNOWN";
        const Icon=current?ShieldCheck:stale?Clock3:ShieldAlert;
        return <div key={id} data-testid={"c-freshness-"+id}
          className="min-w-0 rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-slate-200">{LABELS[i]}</span>
            <Icon aria-hidden className={"h-4 w-4 "+(current?"text-cyan-300":stale?"text-amber-300":"text-slate-400")}/>
          </div>
          <div data-testid={"c-status-"+id} className={"mt-4 text-[10px] font-black tracking-[.17em] "+(current?"text-cyan-200":stale?"text-amber-200":"text-slate-400")}>
            {label}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <Clock3 aria-hidden className="h-3.5 w-3.5 text-slate-400"/>
            {describe(plane,Date.now())}
          </div>
          <div className="mt-3 border-t border-white/[.06] pt-3 text-[10px] leading-5 text-slate-400">
            <div>Source HMAC at read <span className="float-right text-amber-200/80">UNPROVEN</span></div>
            <div>Durable signed ACK <span className="float-right text-amber-200/80">UNKNOWN</span></div>
          </div>
        </div>;
      })}
    </div>
    <div className="relative mt-4 grid gap-2 border-t border-white/10 pt-4 text-xs sm:grid-cols-3">
      <div className="flex items-center gap-2 text-slate-300"><WifiOff aria-hidden className="h-4 w-4 text-amber-300"/> Receiver live: NOT PROVEN</div>
      <div className="text-slate-300">Mac scheduled signed: <strong className="text-amber-200">0/2 VERIFIED</strong></div>
      <div className="text-slate-300">HEL1 scheduled signed: <strong className="text-amber-200">0/2 VERIFIED</strong></div>
    </div>
    <p className="relative mt-3 text-[10px] leading-5 text-slate-400">
      {busy?"CHECKING PRIVATE RECEIPTS · ":""}Foreground read-only · 15s bounded polling · no host scan · no deletion or financial authority.
    </p>
  </section>;
}
