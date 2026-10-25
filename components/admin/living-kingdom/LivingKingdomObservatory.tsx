"use client";
import Image from "next/image";
import Link from "next/link";
import {useCallback,useEffect,useState,type FormEvent,type ReactNode} from "react";
import {Activity,ArrowLeft,ArrowRight,BarChart3,Clock3,Compass,Crown,Eye,MousePointerClick,Radio,RefreshCw,Search,ShieldCheck,UsersRound,Waves} from "lucide-react";

type Count={label:string;count:number};
type Trend={period:string;events:number;visitors:number;repeatVisitors:number};
type Warrior={
 uid:string;name:string;avatar:string;joinedAt:string;accountLastSeenAt:string|null;
 presence:{status:string;realm:string|null;observedAt:string|null};
 journey:{views:number;clicks:number;sessions:number;visitDays:number;returning:boolean|null;
  estimatedActiveSeconds:number|null;estimateConfidence:string;lastPath:string|null;previousPath:string|null;
  lastEventAt:string|null;truncated:boolean;eventsObserved:number};
 signals:{label:string;engagement:string;provenance:string};
};
type Payload={
 generatedAt:string;days:7|30;hasMore:boolean;nextCursor:number|null;cards:Warrior[];
 presence:{mode:string;activeActors:number;tabs:number;subscribers:number;realms:Record<string,number>;
  caps:{ttlMs:number};semantics:string};
 aggregates:{cohortUsers:number;clippedUsers:number;views:number;clicks:number;
  returningUsersObserved:number;estimatedActiveSeconds:number|null;dwellUserSamples:number;
  topDestinations:Count[];transitions:Count[];daily:Trend[];weekly:Trend[];notes:string[]};
 scrollHistory:{status:string;count:null};
};
const FRAME="rounded-[1.4rem] border border-amber-100/10 bg-slate-950/75 shadow-[0_18px_60px_rgba(0,0,0,.2)]";
const CAPTION="text-[10px] font-semibold uppercase tracking-[.22em] text-amber-200/65";
const BUTTON="rounded-xl border border-white/15 bg-white/[.055] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-300/40 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-30";
function Stamp({value}:{value:string|null}){
 if(!value)return <span className="text-slate-500">Unknown</span>;
 const d=new Date(value);
 return <time dateTime={value}>{Number.isFinite(d.getTime())?d.toLocaleString():"Unknown"}</time>;
}
function Metric({label,value,note,icon}:{label:string;value:ReactNode;note:string;icon:ReactNode}){
 return <div className={FRAME+" relative overflow-hidden p-4"}>
  <div className="absolute -right-3 -top-3 rounded-full bg-amber-200/[.035] p-7 text-amber-200/40">{icon}</div>
  <p className={CAPTION}>{label}</p><div className="relative mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
  <p className="relative mt-2 text-xs leading-5 text-slate-400">{note}</p>
 </div>;
}
function Panel({title,sub,children}:{title:string;sub:string;children:ReactNode}){
 return <section className={FRAME+" p-5"}><div className="mb-5">
  <h2 className="text-lg font-semibold text-white">{title}</h2>
  <p className="mt-1 text-xs leading-relaxed text-slate-400">{sub}</p>
 </div>{children}</section>;
}
function Ranked({rows}:{rows:Count[]}){
 const max=Math.max(1,...rows.map(r=>r.count));
 if(!rows.length)return <p className="py-6 text-sm text-slate-500">No eligible observations in this cohort.</p>;
 return <ol className="space-y-3">{rows.map((r,i)=><li key={r.label}>
  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
   <span className="min-w-0 break-words text-slate-200"><span className="mr-2 tabular-nums text-amber-300/60">{String(i+1).padStart(2,"0")}</span>{r.label}</span>
   <span className="font-semibold tabular-nums text-white">{r.count}</span>
  </div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div
   className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-200" style={{width:String(100*r.count/max)+"%"}}/></div>
 </li>)}</ol>;
}
function TrendBars({rows,label}:{rows:Trend[];label:string}){
 const max=Math.max(1,...rows.map(r=>r.events));
 return <div><div className="flex h-32 items-end gap-1.5 border-b border-white/10 pb-2"
  role="img" aria-label={label+": "+rows.map(r=>r.period+" "+r.events+" events").join(", ")}>
  {rows.length?rows.map(r=><div key={r.period}
   title={r.period+": "+r.events+" events, "+r.visitors+" accounts"}
   className="group relative min-w-0 flex-1" style={{height:String(Math.max(4,100*r.events/max))+"%"}}>
   <div className="absolute inset-0 rounded-t-md bg-gradient-to-t from-amber-800/80 to-amber-300/90 transition group-hover:from-amber-600"/>
  </div>):<span className="m-auto text-sm text-slate-500">No observations</span>}
 </div><div className="mt-2 flex justify-between gap-2 text-[10px] tabular-nums text-slate-500">
  <span>{rows[0]?.period??"No sample"}</span><span>{rows.at(-1)?.period??""}</span></div></div>;
}
function WarriorCard({person}:{person:Warrior}){
 const live=person.presence.status==="present_this_process";
 return <Link href={"/admin/living-kingdom/"+encodeURIComponent(person.uid)}
  className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-950/90 p-4 transition hover:border-amber-300/40 hover:shadow-[0_12px_40px_rgba(217,119,6,.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
  <div className="flex items-start gap-3"><div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-amber-200/20 bg-slate-800">
   <Image src={person.avatar} alt={person.name+" avatar"} fill sizes="56px" className="object-cover" unoptimized/>
   <span className={"absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 "+(live?"bg-emerald-400":"bg-slate-500")}/>
  </div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-white group-hover:text-amber-100">{person.name}</h3>
   <p className="mt-0.5 truncate text-[11px] text-slate-500">{live?"Observed in this process":"Not observed on this process"}</p>
   <p className="mt-1 truncate text-[11px] text-amber-200/70">{live?person.presence.realm??"Realm unknown":person.signals.engagement+" · "+person.signals.label+" confidence"}</p>
  </div><ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-200"/></div>
  <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
   {([["Pages",person.journey.views],["Clicks",person.journey.clicks],["Visit days",person.journey.visitDays]] as const)
    .map(([key,value])=><div key={key}><p className="text-lg font-semibold tabular-nums text-white">{value}</p>
    <p className="text-[10px] text-slate-500">{key}</p></div>)}
  </div><p className="mt-3 truncate text-xs text-slate-300">{person.journey.lastPath??"No recorded page view"}</p>
  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
   <span>{person.journey.returning===true?"Observed return":person.journey.returning===null?"Return unknown":"No return observed"}</span>
   <span>{person.journey.truncated?"120+ events · clipped":"Capped window"}</span>
  </div>
 </Link>;
}
export function LivingKingdomObservatory(){
 const[days,setDays]=useState<7|30>(7);
 const[draft,setDraft]=useState("");
 const[search,setSearch]=useState("");
 const[cursor,setCursor]=useState<number|null>(null);
 const[history,setHistory]=useState<Array<number|null>>([]);
 const[revision,setRevision]=useState(0);
 const[data,setData]=useState<Payload|null>(null);
 const[busy,setBusy]=useState(true);
 const[error,setError]=useState<string|null>(null);
 const load=useCallback((signal:AbortSignal)=>{
  const q=new URLSearchParams({days:String(days)});
  if(search)q.set("q",search);
  if(cursor!==null)q.set("cursor",String(cursor));
  return fetch("/api/admin/living-kingdom?"+q.toString(),{credentials:"same-origin",cache:"no-store",signal});
 },[days,search,cursor]);
 useEffect(()=>{
  const ctl=new AbortController();setBusy(true);
  load(ctl.signal).then(async response=>{
   if(!response.ok)throw new Error("Observatory returned "+response.status);
   return (await response.json()) as Payload;
  }).then(value=>{if(!ctl.signal.aborted){setData(value);setError(null);}})
  .catch(e=>{if(!ctl.signal.aborted)setError(e instanceof Error?e.message:"Observatory unavailable");})
  .finally(()=>{if(!ctl.signal.aborted)setBusy(false);});
  return ()=>ctl.abort();
 },[load,revision]);
 useEffect(()=>{
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")setRevision(v=>v+1);},30000);
  return ()=>window.clearInterval(timer);
 },[]);
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setSearch(draft.trim().slice(0,48));setCursor(null);setHistory([]);
 }
 function choose(value:7|30){setDays(value);setCursor(null);setHistory([]);}
 return <main className="min-h-screen bg-[radial-gradient(ellipse_at_50%_-12%,rgba(180,83,9,.18),transparent_52%),linear-gradient(180deg,#020617,#0b1224_50%,#020617)] px-4 pb-28 pt-8 text-slate-100 sm:px-6 lg:px-10">
  <div className="mx-auto max-w-[1500px] space-y-7">
   <div className="flex flex-wrap items-start justify-between gap-4"><div>
    <Link href="/admin/user-list" className="mb-4 inline-flex items-center gap-2 text-xs text-amber-200/70 hover:text-amber-100"><ArrowLeft size={14}/> Command Tower</Link>
    <div className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-300"/><span className={CAPTION}>Admin command · Living Kingdom</span></div>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-5xl">The Living <span className="text-amber-200">Kingdom</span></h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Signed-in warrior journeys, with live presence and durable activity kept separate.</p>
   </div><div className="flex items-center gap-2">
    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200"><ShieldCheck size={12} className="mr-1 inline"/>Admin-only · no-store</span>
    <button className={BUTTON} onClick={()=>setRevision(v=>v+1)} disabled={busy} type="button"><RefreshCw className={"mr-1 inline h-4 w-4 "+(busy?"animate-spin":"")}/>Refresh</button>
   </div></div>
   <div className={FRAME+" flex flex-wrap items-center gap-3 p-4"}>
    <form onSubmit={submit} className="flex min-w-[240px] flex-1 items-center gap-2">
     <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500"/>
      <span className="sr-only">Find warrior by name or UID</span>
      <input type="search" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={48}
       placeholder="Find warrior by name…" className="w-full rounded-xl border border-white/10 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-300/50"/></label>
     <button className={BUTTON} type="submit">Search</button>
    </form>
    <div className="flex rounded-xl border border-white/10 bg-slate-900/70 p-1" aria-label="Observation window">
     {([7,30] as const).map(n=><button key={n} type="button" onClick={()=>choose(n)} aria-pressed={days===n}
      className={"rounded-lg px-4 py-2 text-xs font-semibold transition "+(days===n?"bg-amber-300/20 text-amber-100":"text-slate-500 hover:text-white")}>{n} days</button>)}
    </div><span className="text-[11px] text-slate-500">20 users/page · 120 events/user</span>
   </div>
   {error&&<div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error} · Last successful data may be stale.</div>}
   {!data&&busy?<div role="status" className={FRAME+" p-10 text-center text-slate-300"}>Loading authenticated evidence…</div>:null}
   {data&&<>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
     <Metric label="Presence now" value={data.presence.activeActors} icon={<Radio/>} note={"Hub mode "+data.presence.mode+" · THIS process only"}/>
     <Metric label="Cohort warriors" value={data.aggregates.cohortUsers} icon={<UsersRound/>} note="Current roster page, not whole site"/>
     <Metric label="Page views" value={data.aggregates.views} icon={<Eye/>} note={String(data.days)+"-day sampled cohort"}/>
     <Metric label="Safe clicks" value={data.aggregates.clicks} icon={<MousePointerClick/>} note="Stored events; click text hidden"/>
     <Metric label="Observed returns" value={data.aggregates.returningUsersObserved} icon={<Compass/>} note="At least two UTC activity dates"/>
    </div>
    <Panel title="Live realm distribution" sub="Current process-local Living Kingdom hub rooms, aggregated into safe categories. Detail route IDs are withheld. Not a cluster-wide census.">
     <Ranked rows={Object.entries(data.presence.realms).filter(([,count])=>count>0)
      .map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count).slice(0,8)}/>
     <p className="mt-4 text-xs text-slate-500">{data.presence.tabs} ephemeral tab leases · {data.presence.subscribers} subscribers · {Math.round(data.presence.caps.ttlMs/1000)}-second TTL</p>
    </Panel>
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
     <Panel title="Warrior activity • daily" sub="Recorded events for this roster cohort, not anonymous visitors.">
      <TrendBars rows={data.aggregates.daily} label="Daily recorded journey activity"/>
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-400"><span><Activity size={13} className="mr-1 inline text-amber-200"/>{data.aggregates.views} views</span><span><MousePointerClick size={13} className="mr-1 inline text-amber-200"/>{data.aggregates.clicks} clicks</span>
       <span><Clock3 size={13} className="mr-1 inline text-amber-200"/>Activity estimate: {data.aggregates.estimatedActiveSeconds===null?"unknown":Math.round(data.aggregates.estimatedActiveSeconds/60)+" minutes"} · {data.aggregates.dwellUserSamples} users</span></div>
     </Panel>
     <Panel title="Weekly signal" sub="UTC week buckets over the selected sample."><TrendBars rows={data.aggregates.weekly} label="Weekly recorded journey activity"/>
      <p className="mt-4 text-xs text-slate-400">A single event never establishes dwell. Time here is capped event-gap estimation.</p>
     </Panel>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
     <Panel title="Most visited destinations" sub="Public route categories only; private paths and URL parameters suppressed."><Ranked rows={data.aggregates.topDestinations}/></Panel>
     <Panel title="Observed route transitions" sub="Consecutive page views within a session, not reconstructed avatar travel."><Ranked rows={data.aggregates.transitions}/></Panel>
    </div>
    <section className={FRAME+" p-5"}><div className="mb-5 flex flex-wrap items-center justify-between gap-3">
     <div><h2 className="text-xl font-semibold text-white">Warrior registry</h2>
      <p className="mt-1 text-xs text-slate-400">Searchable accounts · paginated history · presence scoped to this server process.</p></div>
     <span className={CAPTION}>{data.cards.length} warriors on this page</span></div>
     {data.cards.length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.cards.map(card=><WarriorCard key={card.uid} person={card}/>)}</div>:
      <p className="py-10 text-center text-sm text-slate-500">No matching warriors. Try another search.</p>}
     <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
      <button type="button" className={BUTTON} disabled={!history.length||busy}
       onClick={()=>{setCursor(history.at(-1)??null);setHistory(v=>v.slice(0,-1));}}><ArrowLeft className="mr-1 inline h-4 w-4"/>Previous</button>
      <p className="text-xs text-slate-500">{data.aggregates.clippedUsers} accounts capped at 120 events</p>
      <button type="button" className={BUTTON} disabled={!data.hasMore||!data.nextCursor||busy}
       onClick={()=>{setHistory(v=>[...v,cursor]);setCursor(data.nextCursor);}}>Next warriors<ArrowRight className="ml-1 inline h-4 w-4"/></button>
     </div>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
     <div className={FRAME+" p-5"}><p className={CAPTION}><Waves size={14} className="mr-1 inline"/>Scroll evidence</p>
      <h3 className="mt-2 text-xl font-semibold text-white">Historical scroll: not recorded</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">The roaming hub has coarse, ephemeral depth only. No historical scroll path, coordinate or scroll-event count was persisted.</p></div>
     <div className={FRAME+" p-5"}><p className={CAPTION}><BarChart3 size={14} className="mr-1 inline"/>Evidence limits</p>
      <h3 className="mt-2 text-xl font-semibold text-white">Cohort, not census</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{data.aggregates.notes.join(" ")} Traffic and Radio listening identities are not joined.</p></div>
    </div>
    <p className="text-center text-[11px] text-slate-500">Generated <Stamp value={data.generatedAt}/> · no production certification · no wallet/chat/form data</p>
   </>}
  </div>
 </main>;
}
