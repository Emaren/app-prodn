"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Activity,ArrowLeft,ArrowRight,BrainCircuit,CircleHelp,Clock3,Crown,GitBranch,GitCommitHorizontal,GitMerge,GitPullRequest,LockKeyhole,RadioTower,RefreshCcw,ShieldCheck,Workflow} from "lucide-react";
import type {WorkLedger,LedgerEvent,LaneReceipt,WorkItem,LaneId} from "@/lib/centralWorkLedger";
import styles from "./WorkObservatory.module.css";

type Props={mode:"work"|"lanes"};
type Pulse={id:string;fresh:boolean};
const STAGES=[
 {id:"queue",name:"QUEUED",sub:"Authority only",num:"01"},
 {id:"dispatch",name:"DISPATCH",sub:"Published instructions",num:"02"},
 {id:"commit",name:"SOURCE",sub:"Real commits / PRs",num:"03"},
 {id:"ci",name:"HEAD CI",sub:"Exact SHA conclusions",num:"04"},
 {id:"review",name:"REVIEW",sub:"Submitted reviews",num:"05"},
 {id:"merge",name:"MERGED",sub:"Accepted source only",num:"06"},
 {id:"return",name:"RETURNED",sub:"Return receipt",num:"07"},
 {id:"live",name:"LIVE",sub:"Signed host witness",num:"08"}
] as const;
const COLOR:Record<LaneId,string>={B:"rose",C:"cyan",D:"blue",E:"amber",F:"emerald",G:"violet"};
const when=(v:string|null|undefined)=>{if(!v)return"UNKNOWN";const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toLocaleString():"UNKNOWN"};
const short=(v:string|null|undefined)=>v?v.slice(0,12):"UNVERIFIED";
const stageLabel=(e:LedgerEvent)=>e.kind.replaceAll("_"," ");
const iconFor=(kind:string)=>kind==="SOURCE_COMMIT_OBSERVED"?GitCommitHorizontal:kind==="MERGE_ACCEPTED"?GitMerge:kind==="HEAD_CI_CONCLUDED"?ShieldCheck:kind.startsWith("PR_")?GitPullRequest:Activity;

function useLedger(){
 const [data,setData]=useState<WorkLedger|null>(null),[error,setError]=useState<string|null>(null),[pulse,setPulse]=useState<Pulse|null>(null);
 const pending=useRef<AbortController|null>(null),prior=useRef<Set<string>|null>(null);
 const refresh=useCallback(async()=>{
  if(pending.current)return;
  const control=new AbortController();pending.current=control;
  const timeout=window.setTimeout(()=>control.abort(),21000);
  try{
   const r=await fetch("/api/admin/central-command/work-ledger",{credentials:"same-origin",cache:"no-store",signal:control.signal});
   if(!r.ok)throw Error("Source ledger unavailable · status UNKNOWN");
   const obj:WorkLedger=await r.json();
   if(obj.schema!=="aoe2war.central-work-ledger.v1"||!Array.isArray(obj.events)||obj.events.length>60||!Array.isArray(obj.lanes)||obj.lanes.length!==6||!Array.isArray(obj.items)||obj.items.length>20)throw Error("Source schema invalid · HOLD");
   if(!control.signal.aborted&&pending.current===control){
    const incoming=new Set(obj.events.map(e=>e.id));
    // ONE visual state transition only when an original, unseen provider event arrives.
    if(prior.current!==null){const unseen=obj.events.find(e=>!prior.current!.has(e.id));if(unseen)setPulse({id:unseen.id,fresh:true});}
    prior.current=incoming;setData(obj);setError(null);
   }
  }catch(e){if(pending.current===control){setError(e instanceof Error?e.message:"Source UNKNOWN");setData(null);setPulse(null);}}
  finally{window.clearTimeout(timeout);if(pending.current===control)pending.current=null;}
 },[]);
 useEffect(()=>{void refresh();const visible=()=>{if(document.visibilityState==="visible")void refresh()};
 const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},75000);
 document.addEventListener("visibilitychange",visible);
 return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);pending.current?.abort();pending.current=null};
 },[refresh]);
 return{data,error,refresh,pulse};
}
function SourceTile({event,selected=false}:{event:LedgerEvent;selected?:boolean}){
 const Icon=iconFor(event.kind);
 return <a className={styles.event} data-new={selected} href={event.sourceUrl} target="_blank" rel="noopener noreferrer" title={event.id}>
  <span className={styles.eventGlyph}><Icon size={16}/></span>
  <span className={styles.eventCopy}><strong>{stageLabel(event)}</strong><small>{event.laneId?"CORE "+event.laneId+" · ":""}{when(event.at)}</small><code>{event.sha?short(event.sha):event.repo} · {event.state??"SOURCE"}</code></span>
  <ArrowRight size={14} className={styles.eventArrow}/>
 </a>;
}
function Header({mode,data,error,refresh}:{mode:Props["mode"];data:WorkLedger|null;error:string|null;refresh:()=>Promise<void>}){
 return <header className={styles.hero}>
  <div className={styles.crumbs}><Link href="/admin/central-command"><ArrowLeft size={15}/> MISSION CONTROL</Link><span className={styles.dot}/> Q09 / PRIVATE EVIDENCE OS <span className={styles.version}>A3 · SOURCE ONLY</span></div>
  <div className={styles.heroRow}><div><p className={styles.kicker}>⚔ THE LIVING KINGDOM · SIX-LANE OBSERVATORY</p>
   <h1>{mode==="work"?<>THE <em>WORK BOARD</em></>:<>THE <em>EVIDENCE LEDGER</em></>}</h1>
   <p className={styles.desc}>{mode==="work"?"Watch real engineering receipts advance across the Kingdom's source gates. Every signal is cited; nothing here commands an agent.":"Six original engineering cores. Authenticated source identities, original dispatches, precise timestamps and uncompromising release boundaries."}</p></div>
   <div className={styles.heartbeat}><span>SOURCE-WINDOW HEALTH</span><strong data-fresh={data?.status==="FRESH"}>{data?.status??"UNKNOWN"}</strong><small>{data?data.sourceCoverage.accepted+"/"+data.sourceCoverage.expected+" endpoints":"No read completed"}</small><button type="button" onClick={()=>void refresh()} aria-label="Refresh Work Ledger"><RefreshCcw size={15}/> Refresh source</button></div></div>
  <nav className={styles.localNav} aria-label="Private Central Command views">
   <Link href="/admin/central-command/job-board"><Workflow size={15}/> Job Exchange</Link>
   <Link href="/admin/central-command/work-board" aria-current={mode==="work"?"page":undefined}><GitBranch size={15}/> Work Board</Link>
   <Link href="/admin/central-command/lanes" aria-current={mode==="lanes"?"page":undefined}><BrainCircuit size={15}/> Six Lanes</Link>
   <a href="https://github.com/Emaren/app-prodn/issues/984" target="_blank" rel="noopener noreferrer"><Crown size={15}/> Owner queue</a>
  </nav>
  <div className={styles.metrics}>
   <div><span>OBSERVED SOURCE EVENTS</span><strong>{data?.counts.observedEvents??"—"}</strong></div>
   <div><span>SOURCE PR CARDS</span><strong>{data?.counts.observedPRs??"—"}</strong></div>
   <div><span>MERGE RECEIPTS</span><strong>{data?.counts.observedMerges??"—"}</strong></div>
   <div className={styles.unknownMetric}><LockKeyhole size={16}/><span>PRODUCTION BUILD_ID</span><strong>UNKNOWN</strong></div>
  </div>
  <p className={styles.readState} role="status">{error??(data?"LAST SOURCE READ "+when(data.readAt)+" · "+data.history+" · visibility refresh 75s":"Awaiting private evidence read; missing is UNKNOWN, not idle.")}</p>
 </header>;
}
function WorkBoard({data,pulse}:{data:WorkLedger|null;pulse:Pulse|null}){
 const events=data?.events??[];
 const columns=useMemo(()=>STAGES.map(stage=>{
  const filtered=events.filter(e=>stage.id==="dispatch"?e.kind==="DISPATCH_PUBLISHED":
   stage.id==="commit"?["SOURCE_COMMIT_OBSERVED","PR_OPENED","PR_UPDATED"].includes(e.kind):
   stage.id==="ci"?e.kind==="HEAD_CI_CONCLUDED":
   stage.id==="review"?e.kind==="REVIEW_SUBMITTED":
   stage.id==="merge"?e.kind==="MERGE_ACCEPTED":false).slice(0,8);
  return{...stage,events:filtered};
 }),[events]);
 return <>
  <div className={styles.sectionTitle}><div><p className={styles.kicker}>EVIDENCE-LINKED · READ ONLY</p><h2>The source flow</h2></div><span className={styles.unknownPill}><CircleHelp size={14}/> Queue eligibility UNKNOWN</span></div>
  <p className={styles.panelIntro}>Columns represent independently observed events across different GitHub issues and PRs—not one presumed end-to-end job. No source comment can certify that a ChatGPT session woke.</p>
  <section className={styles.board} aria-label="Source-milestone evidence columns">
   {columns.map(stage=><div className={styles.column} key={stage.id} data-stage={stage.id}>
     <div className={styles.columnTop}><span>{stage.num}</span><strong>{stage.name}</strong><small>{stage.events.length?stage.events.length:"—"}</small></div>
     <p className={styles.columnSub}>{stage.sub}</p>
     <div className={styles.columnItems}>
      {stage.id==="queue"?<a className={styles.authority} href="https://github.com/Emaren/app-prodn/issues/984" target="_blank" rel="noopener noreferrer"><Crown size={18}/><strong>OWNER PRIORITY AUTHORITY</strong><small>#984 · eligibility UNKNOWN · read-only link</small><ArrowRight size={14}/></a>:null}
      {stage.events.map(e=><SourceTile key={e.id} event={e} selected={pulse?.id===e.id}/>)}
      {stage.id==="return"||stage.id==="live"?<div className={styles.noWitness}><CircleHelp size={19}/><strong>UNKNOWN</strong><p>{stage.id==="return"?"A return comment is not classified as a source-return receipt by this bounded feed.":"No authenticated signed host deployment or BUILD_ID observation is present."}</p></div>:null}
      {!stage.events.length&&!["queue","return","live"].includes(stage.id)?<div className={styles.blank}><CircleHelp size={16}/> No verified event in the bounded window</div>:null}
     </div>
   </div>)}
  </section>
  <div className={styles.lowerGrid}>
   <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.kicker}>INFERRED FROM PR IDENTITY ONLY</p><h2><GitPullRequest size={19}/> Source work tickets</h2></div><span>{data?.items.length??"—"} CARDS</span></div>
    <p className={styles.panelIntro}>Only trusted PR identities appear. A single successful workflow never proves all exact-head checks passed.</p>
    <div className={styles.workTickets}>{data?.items.length?data.items.map(item=><WorkTicket key={item.id} item={item}/>):<div className={styles.blank}>No proven PR identities observed. This is not evidence of no work.</div>}</div>
   </section>
   <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.kicker}>SOURCE ≠ HOST</p><h2><ShieldCheck size={19}/> Three release boundaries</h2></div><span className={styles.unknownPill}>HOLD</span></div>
    <div className={styles.releaseRails}><div><span className={styles.railLight}/><strong>W1 · FROZEN WEBSITE</strong><small>Source acceptance ≠ activation</small><em>HOST UNKNOWN</em></div><div><span className={styles.railLight}/><strong>POST-W1 · FEATURE TRAIN</strong><small>PR merged is not BUILD_ID installed</small><em>DEPLOYMENT UNKNOWN</em></div><div><span className={styles.railLight}/><strong>WOLO · FUNDED</strong><small>Independent custody and source reviews</small><em>SEPARATE HOLD</em></div></div>
   </section>
  </div>
 </>;
}
function WorkTicket({item}:{item:WorkItem}){
 return <article className={styles.ticket} data-lane={item.laneId}><div className={styles.ticketFirst}><span className={styles.ticketLane}>CORE {item.laneId}</span><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">PR #{item.number} <ArrowRight size={12}/></a></div>
 <div className={styles.ticketMeta}><code>HEAD {short(item.headSha)}</code><span>{when(item.lastEvidenceAt)}</span></div>
 <div className={styles.ticketGates}><span>CI: {item.ci}</span><span>REVIEW: {item.review}</span><span>MERGE: {item.merge==="MERGED_SOURCE_NOT_LIVE"?"SOURCE ONLY":"UNKNOWN"}</span><span>LIVE: UNKNOWN</span></div>
 </article>;
}
function LaneView({data,pulse}:{data:WorkLedger|null;pulse:Pulse|null}){
 const [selected,setSelected]=useState<LaneId>("G");
 const lane=data?.lanes.find(x=>x.id===selected);
 return <>
 <div className={styles.sectionTitle}><div><p className={styles.kicker}>GITHUB ISSUES · SIX AUTHORIZED SESSIONS</p><h2>Neural source cores</h2></div><span className={styles.unknownPill}><CircleHelp size={14}/> No agent presence witness</span></div>
 <section className={styles.brains} aria-label="Six original source evidence cores">
 {(data?.lanes??(["B","C","D","E","F","G"] as LaneId[]).map(id=>({id,label:"Session "+id,lastEvent:null}))).map(entry=>{
 const id=entry.id as LaneId;const last=entry.lastEvent;
 return <button key={id} type="button" data-lane={id} data-selected={id===selected} aria-pressed={selected===id} aria-label={"Inspect core "+id+" evidence"} onClick={()=>setSelected(id)} className={styles.brain}>
   <span className={styles.brainOrb}><BrainCircuit size={34} strokeWidth={1.25}/></span><span className={styles.brainId}>CORE {id}</span>
   <strong>{entry.label}</strong><small>{last?stageLabel(last):"NO CONFIRMED EVENT"}</small><code>{short(last?.sha)}</code><span className={styles.brainClock}>{when(last?.at)}</span>
  </button>})}
 </section>
 <div className={styles.lowerGrid}>
  <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.kicker}>PROVENANCE / ORIGINAL EVENTS</p><h2><Activity size={19}/> CORE {selected} — Evidence</h2></div><span>{lane?.events.length??"—"} OBSERVED</span></div>
   <p className={styles.panelIntro}>Source-only events for the selected original lane. No claim of live ChatGPT agent presence or native host access.</p>
   <div className={styles.eventList}>{lane?.events.map(e=><SourceTile key={e.id} event={e} selected={pulse?.id===e.id}/>)??null}{!lane?.events.length?<div className={styles.blank}>No lane receipt in this bounded GitHub window.</div>:null}</div>
   {lane&&<a className={styles.inlineOriginal} href={lane.issueUrl} target="_blank" rel="noopener noreferrer">Original lane issue <ArrowRight size={14}/></a>}
  </section>
  <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.kicker}>TRUST BOUNDARY / PROOF GATES</p><h2><LockKeyhole size={19}/> Verifiable gates</h2></div><span className={styles.unknownPill}>NOT LIVE</span></div>
   <div className={styles.trustGates}>{[
    ["ORIGINAL OWNER ISSUE",lane?.issueUrl?"SOURCE LINK":"UNKNOWN"],
    ["LATEST PR/COMMIT",lane?.lastEvent?"SOURCE OBSERVED":"UNKNOWN"],
    ["AGENT AWAKE / COMPUTING","UNKNOWN"],
    ["NATIVE HOST RECEIPT","UNKNOWN"],
    ["FINANCIAL CUSTODY","UNKNOWN"],
    ["ACTUAL PRODUCTION BUILD_ID","UNKNOWN"]
   ].map(([k,v])=><div key={k}><span>{k}</span><strong data-known={v!=="UNKNOWN"}>{v}</strong></div>)}</div>
   <div className={styles.codex}><RadioTower size={21}/><div><strong>CODEX · FUNDED PARALLEL RAIL</strong><p>Not a seventh ChatGPT session. Separate consent, custody and deployment witnesses.</p></div></div>
  </section>
 </div>
 </>;
}
export function WorkObservatoryClient({mode}:Props){
 const {data,error,refresh,pulse}=useLedger();
 return <main className={styles.screen}><div className={styles.backdrop}/><div className={styles.content}>
  <Header mode={mode} data={data} error={error} refresh={refresh}/>
  {mode==="work"?<WorkBoard data={data} pulse={pulse}/>:<LaneView data={data} pulse={pulse}/>}
  <footer className={styles.footer}><span><Clock3 size={14}/> BOUNDED GITHUB WINDOW · NOT THE SIGNED HISTORY LEDGER · NO PRODUCTION CERTIFICATION</span>
   <Link href="/admin/central-command/job-board">Return to Job Exchange <ArrowRight size={14}/></Link></footer>
 </div></main>;
}
