"use client";
import Link from "next/link";
import {useMemo,useState} from "react";
import {Activity,ArrowLeft,ArrowRight,BrainCircuit,CheckCircle2,CircleHelp,Crown,GitCommit,GitMerge,GitPullRequest,LockKeyhole,RadioTower,RefreshCw,ShieldCheck,Ticket,Workflow} from "lucide-react";
import {useCentralEvidence,type EvidenceEvent} from "@/components/central-command/VerifiedEventStrip";
import styles from "./JobExchange.module.css";
type Lane={id:string;label:string;issueUrl:string};
type Props={lanes:Lane[]};
const tint:Record<string,string>={B:"rose",C:"cyan",D:"sky",E:"gold",F:"green",G:"violet"};
const stages=[{title:"OWNER",sub:"Source instruction",icon:Crown},{title:"CENTRAL",sub:"Published queue",icon:Workflow},{title:"BULLPEN",sub:"Eligibility gate",icon:Ticket},{title:"SIX CORES",sub:"Evidence receipts",icon:BrainCircuit},{title:"REVIEW",sub:"Source gates",icon:ShieldCheck},{title:"KINGDOM",sub:"Deployed proof",icon:CheckCircle2}];
const format=(s:string|null)=>{if(!s)return"UNKNOWN";const x=Date.parse(s);return Number.isFinite(x)?new Date(x).toLocaleString():"UNKNOWN"};
function state(e:EvidenceEvent|null){
 if(!e)return{label:"NO CONFIRMED SOURCE EVENT",code:"UNKNOWN"};
 if(e.kind==="MERGE_ACCEPTED")return{label:"SOURCE MERGED · NOT DEPLOYED",code:"MERGED"};
 if(e.kind==="REVIEW_SUBMITTED")return{label:"REVIEW RECORDED",code:"REVIEW"};
 if(e.kind==="SOURCE_COMMIT_OBSERVED")return{label:"COMMIT WITNESSED",code:"COMMIT"};
 if(e.kind==="DISPATCH_PUBLISHED")return{label:"DISPATCH PUBLISHED · NO WAKE PROOF",code:"DISPATCH"};
 if(e.kind==="PR_UPDATED"||e.kind==="PR_OPENED")return{label:"PULL REQUEST OBSERVED",code:"PR"};
 return{label:"SOURCE COMMENT OBSERVED",code:"SOURCE"};
}
const short=(s:string|null)=>s?s.slice(0,10):"—";
export default function JobExchangeClient({lanes}:Props){
 const {data,error,refresh}=useCentralEvidence();
 const [selected,setSelected]=useState("G");
 const events=data?.events??[];
 const byLane=useMemo(()=>Object.fromEntries(lanes.map(l=>[l.id,events.find(e=>e.laneId===l.id)??null])) as Record<string,EvidenceEvent|null>,[lanes,events]);
 const selectedLane=lanes.find(l=>l.id===selected)??lanes[0];
 const laneEvents=events.filter(e=>e.laneId===selected).slice(0,8);
 const merged=events.filter(e=>e.kind==="MERGE_ACCEPTED").length;
 const commits=events.filter(e=>e.kind==="SOURCE_COMMIT_OBSERVED").length;
 const CI=events.filter(e=>e.kind==="HEAD_CI_CONCLUDED").length;
 return <main className={styles.screen}>
  <div className={styles.haze}/>
  <div className={styles.content}>
   <header className={styles.top}>
    <div className={styles.smallNav}><Link href="/admin/central-command" className={styles.back}><ArrowLeft size={15}/> Central Command</Link><span className={styles.dividerDot}/>PRIVATE SOURCE OBSERVATORY <span className={styles.version}>Q09 · V1</span></div>
    <div className={styles.heading}><div><p className={styles.eyebrow}>THE LIVING KINGDOM · COMMAND SYSTEM</p>
     <h1>THE <em>JOB EXCHANGE</em></h1><p className={styles.subtitle}>Owner intent becomes visible, verifiable engineering work. No synthetic agent heartbeat. No claimed production without a signed witness.</p></div>
     <div className={styles.statusPanel}><span className={styles.statusTitle}>SOURCE FEED</span><strong className={data?.status==="FRESH"?styles.fresh:styles.warning}>{data?.status??"UNKNOWN"}</strong><span>{data?data.sourceCoverage.accepted+"/"+data.sourceCoverage.expected+" endpoints":"Awaiting authenticated source"}</span><button type="button" aria-label="Refresh job exchange source" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div></div>
    <div className={styles.stats}><div><span>OBSERVED COMMITS</span><strong>{data?commits:"—"}</strong></div><div><span>SOURCE MERGES</span><strong>{data?merged:"—"}</strong></div><div><span>CONCLUDED CI</span><strong>{data?CI:"—"}</strong></div><div className={styles.liveLock}><LockKeyhole size={15}/><span>DEPLOYED BUILD_ID</span><strong>UNKNOWN</strong></div></div>
   </header>
   <section className={styles.flow} aria-label="Owner instruction to verified production workflow">
    {stages.map((s,i)=>{const Icon=s.icon;return <div className={styles.stageWrap} key={s.title}><div className={styles.stage}>
      <Icon className={styles.stageIcon} size={21}/><span>{String(i+1).padStart(2,"0")}</span><strong>{s.title}</strong><small>{s.sub}</small>
     </div>{i<stages.length-1&&<ArrowRight aria-hidden="true" className={styles.flowArrow} size={14}/>}</div>})}
   </section>
   <div className={styles.sectionHead}><div><p className={styles.eyebrow}>GITHUB FACTS · SIX ORIGINAL OWNERS</p><h2>THE SIX BRAINS</h2></div><p>Illumination represents last GitHub source event, never a running ChatGPT instance.</p></div>
   <section aria-label="Six authenticated engineering lane cores" className={styles.brains}>
    {lanes.map(l=>{const event=byLane[l.id],status=state(event);return <button type="button" onClick={()=>setSelected(l.id)} aria-pressed={selected===l.id} aria-label={"Inspect Session "+l.id+" source evidence"} key={l.id} className={styles.brainCard} data-selected={selected===l.id} data-tint={tint[l.id]??"sky"}>
      <span className={styles.orb}><span className={styles.orbInner}><BrainCircuit size={32} strokeWidth={1.2}/></span></span>
      <span className={styles.laneNumber}>CORE {l.id}</span><strong className={styles.brainTitle}>{l.label}</strong>
      <span className={styles.brainStatus}>{status.label}</span>
      <span className={styles.brainTime}>{event?format(event.at):"NO TIMESTAMP"}</span>
      <span className={styles.brainSha}>{event?.sha?short(event.sha):"SHA UNVERIFIED"}</span>
     </button>})}
   </section>
   <div className={styles.lower}>
    <section className={styles.queue} aria-label="Source-published job bullpen">
     <div className={styles.panelTitle}><div><p className={styles.eyebrow}>OWNER → CENTRAL → BULLPEN</p><h2><Ticket size={19}/> NEXT WORK ORDERS</h2></div><span className={styles.unknownChip}>ELIGIBILITY UNKNOWN</span></div>
     <p className={styles.panelHint}>The spec defines these jobs; it does not independently prove a free lane, owner wake or executable lease. No candidate is falsely marked READY.</p>
     <a className={styles.jobTile} href="https://github.com/Emaren/app-prodn/issues/997" target="_blank" rel="noopener noreferrer"><span className={styles.jobOrdinal}>Q09–A1</span><div><strong>Verified Source Event Engine</strong><small>Auth · GitHub commits · reviews · concluded CI · freshness</small></div><span className={styles.jobFlag}>SOURCE SPEC</span></a>
     <a className={styles.jobTile} href="https://github.com/Emaren/app-prodn/issues/998" target="_blank" rel="noopener noreferrer"><span className={styles.jobOrdinal}>Q09–A2</span><div><strong>Living Job Exchange</strong><small>Six luminous cores · owner → release evidence</small></div><span className={styles.jobFlag}>SOURCE SPEC</span></a>
     <div className={styles.noEligible}><CircleHelp size={17}/><span>Highest eligible next job: <strong>UNKNOWN</strong> · No independently confirmed free-lane and dependency receipt.</span></div>
     <a className={styles.original} href="https://github.com/Emaren/app-prodn/issues/984" target="_blank" rel="noopener noreferrer">Authoritative owner priority queue <ArrowRight size={13}/></a>
    </section>
    <section aria-label="Selected brain evidence drill down" className={styles.evidence}>
     <div className={styles.panelTitle}><div><p className={styles.eyebrow}>INSPECT ACTUAL SOURCE</p><h2><Activity size={19}/> CORE {selectedLane?.id??"?"} — RECEIPTS</h2></div><span className={styles.count}>{laneEvents.length} IN BOUNDED WINDOW</span></div>
     <div className={styles.timeline}>{laneEvents.map((e,i)=><a key={e.id} href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.event}><span className={styles.eventSymbol}>{e.kind==="MERGE_ACCEPTED"?<GitMerge size={16}/>:e.kind==="SOURCE_COMMIT_OBSERVED"?<GitCommit size={16}/>:<GitPullRequest size={16}/>}</span><span><strong>{e.kind.replaceAll("_"," ")}</strong><small>{format(e.at)} · {e.state??"SOURCE"}</small><code>{e.sha?short(e.sha):e.repo}</code></span><ArrowRight size={14}/></a>)}
      {!laneEvents.length&&<div className={styles.empty}>No event currently evidenced for this lane in the bounded GitHub window. This is NOT proof of inactivity.</div>}</div>
     <div className={styles.eventFoot}><a href={selectedLane?.issueUrl} target="_blank" rel="noopener noreferrer">Original lane issue <ArrowRight size={13}/></a><span>OBSERVATION ≠ APPROVAL</span></div>
    </section>
   </div>
   <section className={styles.codex} aria-label="Separate Codex engineering track"><div className={styles.codexIcon}><RadioTower size={20}/></div><div><strong>CODEX · SEPARATE FUNDED WORKSTREAM</strong><p>Independent capacity, owner consent and Wolo custody gates. Not a seventh ChatGPT brain, not a deploy authority.</p></div><a href="https://github.com/Emaren/app-prodn/issues/934" target="_blank" rel="noopener noreferrer">Central evidence <ArrowRight size={14}/></a></section>
   <footer className={styles.foot}><p role="status">{error??(data?"Last source read "+format(data.readAt)+". "+data.history+". Partial/expired evidence never completes a production gate.":"Source UNKNOWN. No activity or live status inferred.")}</p><Link href="/admin/central-command">Return to Mission Control <ArrowRight size={13}/></Link></footer>
  </div>
 </main>;
}
