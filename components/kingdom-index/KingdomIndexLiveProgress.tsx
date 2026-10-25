"use client";
import {useEffect,useRef,useState} from "react";
type Status="PASS"|"FAIL"|"UNKNOWN"|"UNMEASURED";
type Feed={
 schema:1;kind:string;status:"CURRENT"|"STALE"|"INVALID"|"UNAVAILABLE";
 checkedAt:string|null;runUrl:string|null;sourceSha:string|null;buildId:string|null;
 routeCounts:Record<Status,number>|null;routes:Record<string,Status>|null;
 accessibility:{scannedRoutes:number;affectedRoutes:number}|null;
 certificationAuthority:"NOT_PROVIDED";
};
const empty:Feed={schema:1,kind:"aoe2war.kingdom-index.live-candidate-public.v1",
 status:"UNAVAILABLE",checkedAt:null,runUrl:null,sourceSha:null,buildId:null,
 routeCounts:null,routes:null,accessibility:null,certificationAuthority:"NOT_PROVIDED"};
export function useKingdomIndexLiveFeed(){
 const [feed,setFeed]=useState<Feed>(empty);
 const [connectionLost,setConnectionLost]=useState(false);
 const nextId=useRef(0);
 useEffect(()=>{
  let active:AbortController|null=null;
  const refresh=async()=>{
   if(document.hidden)return;
   active?.abort();const controller=new AbortController();active=controller;
   const sequence=++nextId.current;
   try{
    const response=await fetch("/api/kingdom-index/live",{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw Error("candidate feed unavailable");
    const item=await response.json() as Feed;
    if(item?.schema!==1||item.kind!=="aoe2war.kingdom-index.live-candidate-public.v1"||
       !["CURRENT","STALE","INVALID","UNAVAILABLE"].includes(item.status)||
       item.certificationAuthority!=="NOT_PROVIDED")throw Error("malformed candidate feed");
    if(!controller.signal.aborted&&sequence===nextId.current){
      setFeed(item);setConnectionLost(false);
    }
   }catch{
    if(!controller.signal.aborted&&sequence===nextId.current)setConnectionLost(true);
   }
  };
  void refresh();
  const timer=window.setInterval(()=>{void refresh()},60_000);
  const visible=()=>{if(!document.hidden)void refresh()};
  document.addEventListener("visibilitychange",visible);
  return()=>{active?.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[]);
 return{feed,connectionLost};
}
export function KingdomIndexLiveProgress({feed,connectionLost}:{feed:Feed;connectionLost:boolean}){
 const counts=feed.routeCounts;
 const visible=!!counts&&!!feed.routes;
 const good=feed.status==="CURRENT"&&!connectionLost;
 const timestamp=feed.checkedAt?new Date(feed.checkedAt).toISOString().replace("T"," ").slice(0,16)+" UTC":"UNAVAILABLE";
 return <section className="my-5 rounded-2xl border border-amber-200/15 bg-[#0d1520]/80 px-5 py-4 text-slate-200" aria-label="Live Renaissance candidate testing progress" data-live-status={connectionLost?"SIGNAL_LOST":feed.status}>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><span className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-100/70">Renaissance live evidence · refreshed every 60 seconds</span>
     <h2 className="mt-1 font-serif text-xl text-[#f4e5bd]">The Kingdom is measuring itself</h2></div>
    <span className="rounded-full border border-amber-200/20 px-3 py-1 text-[10px] font-bold tracking-wider" role="status">{connectionLost?"CONNECTION LOST":feed.status==="CURRENT"?"LATEST QUALIFIED CANDIDATE":feed.status==="STALE"?"HISTORICAL · STALE":"AWAITING LIVE PRODUCER"}</span>
   </div>
   <div className="mt-4 grid gap-3 sm:grid-cols-3">
    <div><div className="text-3xl font-semibold tabular-nums text-white">{visible?counts!.PASS:"—"}<span className="text-lg text-slate-400">/88</span></div><span className="text-[11px] uppercase tracking-widest text-slate-400">Candidate browser PASS</span></div>
    <div><div className="text-3xl font-semibold tabular-nums text-white">{visible?counts!.FAIL+counts!.UNKNOWN+counts!.UNMEASURED:"—"}<span className="text-lg text-slate-400">/88</span></div><span className="text-[11px] uppercase tracking-widest text-slate-400">Not yet browser PASS</span></div>
    <div><div className="text-3xl font-semibold tabular-nums text-white">{feed.accessibility?feed.accessibility.affectedRoutes:"—"}<span className="text-lg text-slate-400">/{feed.accessibility?feed.accessibility.scannedRoutes:"88"}</span></div><span className="text-[11px] uppercase tracking-widest text-slate-400">Automated axe-affected routes</span></div>
   </div>
   <p className="mt-3 text-xs leading-relaxed text-slate-400">
     {good?"Current candidate evidence, NOT a deployed-release or 100-point certificate.":visible?"Last known candidate observation only; producer freshness or connection not verified.":"No approved candidate feed is installed. Official scores remain independently evidence-gated."}
     {" "}Capture: {timestamp}. Source: <code>{feed.sourceSha?.slice(0,12)??"UNKNOWN"}</code> · Next BUILD_ID: <code>{feed.buildId??"UNKNOWN"}</code>.
     {feed.runUrl&&<>{" "}<a className="underline underline-offset-2" href={feed.runUrl} target="_blank" rel="noopener noreferrer">Inspect CI receipt</a></>}
   </p>
   {visible&&<details className="mt-3 text-xs text-slate-300"><summary className="cursor-pointer py-1">All 88 route browser observations (candidate only)</summary>
     <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(feed.routes!).sort(([a],[b])=>a.localeCompare(b)).map(([href,state])=>
       <li key={href} className="flex justify-between gap-2"><span className="truncate">{href}</span><strong className={state==="PASS"?"text-emerald-300":"text-amber-200"}>{state}</strong></li>)}</ul>
    </details>}
  </section>;
}
export function liveRouteStatus(feed:Feed,href:string,connectionLost:boolean){
 if(connectionLost||feed.status!=="CURRENT")return "CI NOT CURRENT";
 return feed.routes?.[href]??"CI UNMEASURED";
}
