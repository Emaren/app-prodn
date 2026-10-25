"use client";
import Image from "next/image";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,CalendarDays,Clock3,Eye,Footprints,MousePointerClick,RefreshCw,ShieldCheck,Waves} from "lucide-react";

type Event={id:number;type:string;destination:string;at:string;label:string};
type History={
 user:{uid:string;name:string;avatar:string;joinedAt:string;accountLastSeenAt:string|null;
  presence:{status:string;realm:string|null;observedAt:string|null}};
 days:7|30;hasMore:boolean;nextCursor:number|null;events:Event[];
 sessions:Array<{ordinal:number;startedAt:string|null;endedAt:string|null;events:number;views:number;clicks:number;entry:string|null;exit:string|null;estimateSeconds:number|null;scope:string}>;
 slice:{views:number;clicks:number;sessions:number;visitDays:number;returning:boolean|null;
  estimatedActiveSeconds:number|null;estimateConfidence:string;lastPath:string|null;
  previousPath:string|null;lastEventAt:string|null;truncated:boolean;eventsObserved:number};
 limitations:string[];
};
const FRAME="rounded-[1.5rem] border border-amber-100/10 bg-slate-950/75 p-5";
const BTN="rounded-xl border border-white/15 bg-white/[.06] px-4 py-2 text-xs font-semibold text-white hover:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-30";
function Stamp({value}:{value:string|null}){
 if(!value)return <>Unknown</>;
 const d=new Date(value);return <time dateTime={value}>{Number.isFinite(d.getTime())?d.toLocaleString():"Unknown"}</time>;
}
export function LivingKingdomWarriorHistory({uid}:{uid:string}){
 const[days,setDays]=useState<7|30>(7);
 const[cursor,setCursor]=useState<number|null>(null);
 const[events,setEvents]=useState<Event[]>([]);
 const[data,setData]=useState<History|null>(null);
 const[revision,setRevision]=useState(0);
 const[busy,setBusy]=useState(true);
 const[error,setError]=useState<string|null>(null);
 const load=useCallback((signal:AbortSignal)=>{
  const q=new URLSearchParams({days:String(days)});
  if(cursor!==null)q.set("cursor",String(cursor));
  return fetch("/api/admin/living-kingdom/"+encodeURIComponent(uid)+"?"+q.toString(),
   {cache:"no-store",credentials:"same-origin",signal});
 },[uid,days,cursor]);
 useEffect(()=>{
  const ctl=new AbortController();setBusy(true);
  load(ctl.signal).then(async res=>{
   if(!res.ok)throw new Error("Warrior history returned "+res.status);
   return (await res.json()) as History;
  }).then(next=>{if(!ctl.signal.aborted){setData(next);
   setEvents(previous=>cursor===null?next.events:[...previous,...next.events.filter(e=>!previous.some(x=>x.id===e.id))]);
   setError(null);}})
  .catch(e=>{if(!ctl.signal.aborted)setError(e instanceof Error?e.message:"History unavailable");})
  .finally(()=>{if(!ctl.signal.aborted)setBusy(false);});
  return ()=>ctl.abort();
 },[load,revision,cursor]);
 function changeDays(value:7|30){setDays(value);setCursor(null);setEvents([]);}
 const grouped=new Map<string,Event[]>();
 for(const row of events){
  const day=row.at.slice(0,10);
  const bucket=grouped.get(day)||[];bucket.push(row);grouped.set(day,bucket);
 }
 return <main className="min-h-screen bg-[radial-gradient(ellipse_at_50%_-15%,rgba(180,83,9,.18),transparent_55%),linear-gradient(180deg,#020617,#0b1224,#020617)] px-4 pb-28 pt-8 text-slate-100 sm:px-6 lg:px-10">
  <div className="mx-auto max-w-6xl space-y-6">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <Link href="/admin/living-kingdom" className="inline-flex items-center gap-2 text-sm text-amber-200 hover:text-amber-100"><ArrowLeft className="h-4 w-4"/>Living Kingdom Observatory</Link>
    <div className="flex items-center gap-2"><span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200"><ShieldCheck className="mr-1 inline h-4 w-4"/>Admin-only</span>
    <button className={BTN} disabled={busy} onClick={()=>setRevision(x=>x+1)}><RefreshCw className={"mr-1 inline h-4 w-4 "+(busy?"animate-spin":"")}/>Refresh</button></div>
   </div>
   {error&&<div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-600/10 p-4 text-sm text-rose-200">{error}</div>}
   {!data&&busy?<div role="status" className={FRAME}>Loading secure journey history…</div>:null}
   {data&&<>
    <section className={FRAME+" flex flex-wrap items-center gap-5"}>
     <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-amber-200/20 bg-slate-900">
      <Image src={data.user.avatar} fill sizes="96px" className="object-cover" alt={data.user.name+" warrior avatar"} unoptimized/>
     </div>
     <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-[.24em] text-amber-200/70">Individual warrior record</p>
      <h1 className="mt-1 text-3xl font-semibold text-white sm:text-4xl">{data.user.name}</h1>
      <p className="mt-2 text-xs text-slate-500">Account ID: {data.user.uid}</p>
      <p className="mt-1 text-xs text-slate-400">{data.user.presence.status==="present_this_process"?
       "Currently observed in "+(data.user.presence.realm??"unknown realm")+" on this process":
       "Presence not observed on this process · not evidence of offline status"}</p>
     </div><div className="flex rounded-xl border border-white/10 bg-slate-900/70 p-1">
      {([7,30] as const).map(n=><button key={n} onClick={()=>changeDays(n)} aria-pressed={days===n}
       className={"rounded-lg px-4 py-2 text-xs font-semibold "+(days===n?"bg-amber-300/20 text-amber-100":"text-slate-500 hover:text-white")}>{n} days</button>)}
     </div>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     {([
      ["Observed page views",data.slice.views,Eye],
      ["Observed clicks",data.slice.clicks,MousePointerClick],
      ["Sampled visit dates",data.slice.visitDays,CalendarDays],
      ["Active-time estimate",data.slice.estimatedActiveSeconds===null?"Unknown":Math.round(data.slice.estimatedActiveSeconds/60)+" min",Clock3]
     ] as const).map(([label,value,Icon])=><div key={label} className={FRAME}>
      <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-amber-200/60"><Icon size={14} className="mr-2 inline"/>{label}</p>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-xs text-slate-500">Current 40-event slice, not lifetime total</p>
     </div>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
     <section className={FRAME}>
      <div className="flex items-start justify-between gap-4"><div>
       <h2 className="text-xl font-semibold text-white">Recorded journey</h2>
       <p className="mt-1 text-xs text-slate-400">Page views and generic controls · newest first · cursor pagination</p>
      </div><span className="text-xs text-amber-200/75">{events.length} loaded</span></div>
      {events.length===0?<p className="py-12 text-center text-sm text-slate-500">No persisted safe events in this date window.</p>:
       <div className="mt-6 space-y-6">{[...grouped.entries()].map(([day,items])=><section key={day}>
        <div className="sticky top-0 z-10 mb-3 rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-xs font-semibold text-amber-100"><CalendarDays className="mr-2 inline h-3.5 w-3.5"/>{day} · {items.length} records</div>
        <ol className="relative ml-3 space-y-1 border-l border-amber-200/20">{items.map(row=><li key={row.id} className="relative ml-5 rounded-lg px-3 py-3 hover:bg-white/[.04]">
         <span className={"absolute -left-[26px] top-5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 "+(row.type==="page_view"?"bg-amber-300":"bg-sky-300")}/>
         <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-white">
          {row.type==="page_view"?<Eye className="mr-2 inline h-4 w-4 text-amber-200"/>:
          <MousePointerClick className="mr-2 inline h-4 w-4 text-sky-200"/>}{row.label}</span>
          <span className="text-[11px] text-slate-500"><Stamp value={row.at}/></span></div>
         <p className="mt-1 break-words text-xs text-slate-400">{row.destination}</p>
        </li>)}</ol>
       </section>)}</div>}
      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
       <span className="text-xs text-slate-500">Records are projected from the existing signed-in activity rail.</span>
       <button className={BTN} disabled={busy||!data.hasMore||!data.nextCursor}
        onClick={()=>setCursor(data.nextCursor)}>Load older records<ArrowRight className="ml-1 inline h-3 w-3"/></button>
      </div>
     </section>
     <aside className="space-y-4">
      <section className={FRAME}><h2 className="text-lg font-semibold text-white">Session window</h2>
       <div className="mt-4 space-y-4 text-sm text-slate-300">
        <div><span className="text-xs text-slate-500">Latest categorized page</span><p className="mt-1">{data.slice.lastPath??"Unmeasured"}</p></div>
        <div><span className="text-xs text-slate-500">Previous distinct page</span><p className="mt-1">{data.slice.previousPath??"Unmeasured"}</p></div>
        <div><span className="text-xs text-slate-500">Account last seen</span><p className="mt-1"><Stamp value={data.user.accountLastSeenAt}/></p></div>
        <div><span className="text-xs text-slate-500">Return evidence</span><p className="mt-1">{data.slice.returning===null?"Unknown":data.slice.returning?"At least two dates sampled":"No repeat observed in slice"}</p></div>
       </div>
      </section>
      <section className={FRAME}>
       <p className="text-xs uppercase tracking-[.2em] text-amber-200/65"><Footprints className="mr-1 inline h-4 w-4"/>Presence ≠ navigation history</p>
       <p className="mt-3 text-sm leading-6 text-slate-400">Living Kingdom&apos;s floating portraits are transient, coarse, and process-local. These durable records come only from signed-in activity events.</p>
      </section>
      <section className={FRAME}>
       <p className="text-xs uppercase tracking-[.2em] text-amber-200/65"><Waves className="mr-1 inline h-4 w-4"/>What cannot be recovered</p>
       <p className="mt-3 text-sm leading-6 text-slate-400">Historical scroll paths and positions were not recorded. Click contents, wallet actions, chat messages, form text and sensitive URLs are never displayed.</p>
       <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-500">{data.limitations.map(note=><li key={note}>• {note}</li>)}</ul>
      </section>
      <section className={FRAME}>
       <h2 className="text-lg font-semibold text-white">Observed session slices</h2>
       <p className="mt-1 text-xs leading-5 text-slate-500">Grouped only within the latest 40-record page; no raw session keys are exposed.</p>
       <ol className="mt-4 space-y-3">{data.sessions.length?data.sessions.map(session=>
        <li key={session.ordinal} className="rounded-xl border border-white/10 bg-white/[.035] p-3">
         <p className="text-xs font-semibold text-amber-100">Slice {session.ordinal} · {session.views} views · {session.clicks} clicks</p>
         <p className="mt-1 text-xs text-slate-400">{session.entry??"Unmeasured"} → {session.exit??"Unmeasured"}</p>
         <p className="mt-2 text-[11px] text-slate-500"><Stamp value={session.startedAt}/> · {session.estimateSeconds===null?"Dwell unknown":Math.round(session.estimateSeconds/60)+" min estimated"}</p>
        </li>):<li className="text-xs text-slate-500">No observed session slice</li>}</ol>
      </section>
     </aside>
    </div>
   </>}
  </div>
 </main>;
}
