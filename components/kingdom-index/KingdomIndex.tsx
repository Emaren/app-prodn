"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Castle, ChevronDown, Clock3, Compass, Grid2X2, List, X } from "lucide-react";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import type { District, KingdomIndexEntry, KingdomIndexSnapshot } from "@/lib/kingdomIndex";
import { isLatestKingdomIndexRefresh } from "@/lib/kingdomIndexRefreshOrder";
import styles from "./KingdomIndex.module.css";

const REGIONS: ReadonlyArray<{ id: District; name: string; numeral: string; subtitle: string }> = [
  { id: "citadel", name: "The Citadel", numeral: "I", subtitle: "Command · intelligence · governance" },
  { id: "arena", name: "The Arena", numeral: "II", subtitle: "Warriors · champions · competition" },
  { id: "forge", name: "The Forge", numeral: "III", subtitle: "Replays · knowledge · machinery" },
  { id: "bazaar", name: "The Bazaar", numeral: "IV", subtitle: "Trade · stakes · economy" },
  { id: "commons", name: "The Commons", numeral: "V", subtitle: "Guilds · culture · community" },
];
type Mode = "realm" | "ledger";
const validScore = (n: number | null): n is number => n !== null && Number.isFinite(n);
function scoreString(n: number | null) { return validScore(n) ? String(n) : "—"; }
function statusTitle(entry: KingdomIndexEntry) {
  if (entry.authenticatedPublication) {
    if (entry.status==="current" && entry.score===100) return "CURRENT · CERTIFIED";
    if (entry.score!==null) return "VERIFIED · PROVISIONAL";
    return "EVIDENCE INCOMPLETE · NOT CERTIFIED";
  }
  switch (entry.status) {
    case "current": return entry.kind==="certified"?"CERTIFIED":"AGENT OBSERVED";
    case "provisional": return entry.kind==="certified"?"CERTIFICATION CLAIM UNVERIFIED":"SOURCE REVIEW";
    case "stale": return "INSPECTION AGED";
    case "drifted": return "SOURCE DRIFT";
    default: return "NOT YET ASSESSED";
  }
}
function formatStamp(input: string | null) {
  if (!input) return "—";
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(input)) return input+" · DATE ONLY";
  const d=new Date(input);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0,16).replace("T"," ")+" UTC" : "—";
}
function Sparkline({ points, score, compact=false }: {points: KingdomIndexEntry["history"]; score:number|null; compact?:boolean}) {
  const valid=points.filter(point=>Number.isFinite(point.score)&&point.score>=0&&point.score<=100).slice(-36);
  if(valid.length<2) return <span className={styles.emptySpark} aria-label="No comparable historical scores">—</span>;
  const width=compact?94:130, height=compact?26:34;
  const coords=valid.map((p,i)=>[4+i*(width-8)/Math.max(1,valid.length-1),height-4-p.score*(height-8)/100]);
  const coordinates=coords.map(([x,y])=>x.toFixed(1)+","+y.toFixed(1)).join(" ");
  const latest=coords[coords.length-1];
  const previous=valid[valid.length-2].score;
  const stroke=score!==null&&score<previous?"#e4a598":"#cbbd86";
  return <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Verified inspection history: ${valid.length} readings`}>
    <polyline points={coordinates} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={latest[0]} cy={latest[1]} r="2.7" fill={stroke}/>
  </svg>;
}
function Score({ entry, small=false }: {entry:KingdomIndexEntry;small?:boolean}) {
  return <span className={small?styles.scoreSmall:styles.score} data-status={entry.status} aria-label={validScore(entry.score)?`${entry.score} out of 100, ${statusTitle(entry)}`:statusTitle(entry)}>
    {scoreString(entry.score)}{validScore(entry.score)&&<span className={styles.denom}>/100</span>}
  </span>;
}
function PageDetail({ item, close }: {item:KingdomIndexEntry;close:()=>void}) {
  return <section className={styles.detail} aria-label={`${item.label} engineering evidence`}>
    <div className={styles.detailHead}>
      <div><span className={styles.eyebrow}>{statusTitle(item)}</span><h2>{item.label}</h2></div>
      <button className={styles.close} onClick={close} type="button" aria-label="Close details"><X size={17}/></button>
    </div>
    <div className={styles.detailScore}><Score entry={item}/><Sparkline points={item.history} score={item.score}/></div>
    {item.lastReviewScore!==null&&item.score===null&&<p className={styles.evidenceNote}>HISTORICAL REVIEW: {item.lastReviewScore}/100. No current source-aligned engineering score is independently established.</p>}
    <p className={styles.evidenceNote}>Route source fingerprint is a local Git census only; transitive dependencies and deployed runtime still require independent proof.</p>
    {item.authenticatedPublication&&<section className={styles.evidenceNote} aria-label="Authenticated certification provenance">
      <strong>INDEPENDENTLY SIGNED PUBLICATION</strong>
      <p>Deployed source: <code>{item.authenticatedPublication.gitSha}</code></p>
      <p>Emitted build: <code>{item.authenticatedPublication.buildId}</code></p>
      <p>Evidence SHA-256: <code>{item.authenticatedPublication.evidenceSha256}</code></p>
      <p>Release receipt SHA-256: <code>{item.authenticatedPublication.releaseSha256}</code></p>
      <p>Issued: {formatStamp(item.authenticatedPublication.issuedAt)} · Expires: {formatStamp(item.authenticatedPublication.expiresAt)}</p>
    </section>}
    <div className={styles.detailMetrics}>
      <div><span>LAST REVIEW</span><b>{formatStamp(item.checkedAt)}</b></div>
      <div><span>PAGE LOAD</span><b>{item.loadMs!==null?`${Math.round(item.loadMs)} ms`:"—"}</b></div>
      <div><span>PAYLOAD</span><b>{item.bytes!==null?`${(item.bytes/1024).toFixed(1)} KB`:"—"}</b></div>
      <div><span>ROUTE SOURCE</span><b title={item.sourceVersion??""}>{item.sourceVersion?item.sourceVersion.slice(0,19):"—"}</b></div>
    </div>
    {item.dimensions&&<div className={styles.bars} aria-label={item.score===null?"Historical review dimensions, not current certification":"Observed engineering dimensions"}>
      {Object.entries(item.dimensions).map(([name,value])=>{
        const denominator:Record<string,number>={correctness:30,functionality:25,performance:20,maintainability:15,tests:10};
        const max=denominator[name]??100;
        return <div key={name} className={styles.barRow}><span>{name}</span><div><i style={{width:`${Math.min(100,Math.max(0,value/max*100))}%`}}/></div><b>{value}/{max}</b></div>;
      })}
    </div>}
    {item.dimensions&&item.score===null&&<p className={styles.evidenceNote}>The dimension bars above belong to the historical review, not a current, verified audit.</p>}
    {item.notes&&<p className={styles.evidenceNote}>{item.notes}</p>}
    {item.specializedAssurance.gates.length>0&&<section className={styles.assurancePanel} aria-label={`${item.label} specialized engineering proof obligations`}>
      <h3>MANDATORY PROOF GATES <span>{item.specializedAssurance.profile.toUpperCase()}</span></h3>
      <div className={styles.assuranceList} role="list">
        {item.specializedAssurance.gates.map(gate=><div className={styles.assuranceItem} role="listitem" key={gate.id}>
          <div><strong>{gate.id.replace(/-/g," ")}</strong><span>{gate.status.toUpperCase()}</span></div>
          <p>{gate.requirement}</p>
        </div>)}
      </div>
      <p className={styles.evidenceNote}>Specialized obligations are mandatory, not bonus points. No gate counts as passed without authenticated source-bound evidence.</p>
    </section>}
    <Link href={item.href} className={styles.detailLink}>ENTER PAGE <ArrowUpRight size={15}/></Link>
  </section>;
}
function PageNode({ item, onFocus, active }: {item:KingdomIndexEntry;onFocus:(href:string)=>void;active:boolean}) {
  return <article className={styles.node} data-status={item.status} data-selected={active||undefined}>
    <div className={styles.nodeTop}><span className={styles.signal} aria-hidden="true"/><span className={styles.nodeStatus} title={statusTitle(item)}>{item.status==="current"?"●":item.status==="provisional"?"◒":item.status==="drifted"||item.status==="stale"?"◇":"·"}</span></div>
    <button type="button" className={styles.nodeFocus} onClick={()=>onFocus(item.href)} aria-label={`Inspect ${item.label}`}>
      <Score entry={item} small/>
    </button>
    <Link href={item.href} className={styles.nodeName} title={item.label}>{item.label}<ArrowUpRight size={12}/></Link>
    <span className={styles.nodePath} title={item.href}>{item.href}</span>
  </article>;
}
function DistrictSection({ region, pages, selected, focus }: {region:(typeof REGIONS)[number];pages:KingdomIndexEntry[];selected:string|null;focus:(href:string)=>void}) {
  return <section className={styles.district} data-region={region.id} aria-label={region.name}>
    <div className={styles.districtCircuit} aria-hidden="true"/>
    <header className={styles.districtHeader}>
      <span className={styles.districtNumeral}>{region.numeral}</span>
      <div className={styles.districtTitles}><h2>{region.name}</h2><span>{region.subtitle}</span></div>
      <span className={styles.districtCount}>{String(pages.length).padStart(2,"0")}</span>
    </header>
    <div className={styles.buildings}>
      {pages.map((item)=><PageNode key={item.href} item={item} active={selected===item.href} onFocus={focus}/>)}
    </div>
  </section>;
}
export default function KingdomIndex({initial}:{initial:KingdomIndexSnapshot}){
  const [snapshot,setSnapshot]=useState(initial);
  const [mode,setMode]=useState<Mode>("ledger");
  const [selected,setSelected]=useState<string|null>(null);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [connectionLost,setConnectionLost]=useState(false);
  const latestRefreshId=useRef(0);
  const refresh=useCallback(async (signal?:AbortSignal)=>{
    const requestId=++latestRefreshId.current;
    try{
      const response=await fetch("/api/kingdom-index",{cache:"no-store",signal});
      if(!response.ok)throw new Error("no measurement feed");
      const next=await response.json() as KingdomIndexSnapshot;
      if(next.schema!==1||!Array.isArray(next.pages))throw new Error("bad evidence");
      if(!signal?.aborted&&isLatestKingdomIndexRefresh(requestId,latestRefreshId.current)){
        setSnapshot(next);setConnectionLost(false);
      }
    }catch{
      if(!signal?.aborted&&isLatestKingdomIndexRefresh(requestId,latestRefreshId.current))setConnectionLost(true);
    }
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    const tick=()=>{if(!document.hidden)void refresh(controller.signal);};
    const timer=window.setInterval(tick,60_000);
    document.addEventListener("visibilitychange",tick);
    return ()=>{controller.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",tick);};
  },[refresh]);
  const byRegion=useMemo(()=>new Map(REGIONS.map(r=>[r.id,snapshot.pages.filter(page=>page.district===r.id)])),[snapshot.pages]);
  const focused=snapshot.pages.find(page=>page.href===selected)??null;
  const rows=useMemo(()=>snapshot.pages.slice().sort((a,b)=>REGIONS.findIndex(r=>r.id===a.district)-REGIONS.findIndex(r=>r.id===b.district)||a.label.localeCompare(b.label)),[snapshot.pages]);
  const focus=(href:string)=>{setSelected(prev=>prev===href?null:href);};
  return <main className={styles.root}>
    <SpeedReadyMarker route="/kingdom-index"/>
    <div className={styles.ambient} aria-hidden="true"/>
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroIdentity}>
          <div className={styles.superline}><span className={styles.bead}/> AOE2WAR <span className={styles.superSlash}>/</span> ENGINEERING ATLAS</div>
          <h1>KINGDOM <em>INDEX</em></h1>
          <div className={styles.motto}>THE MEASURE OF THE REALM</div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.counters} aria-label="Page measurement overview">
            <div title="Public indexed pages"><b>{snapshot.pages.length.toString().padStart(2,"0")}</b><span>ROUTES</span></div>
            <div title="Source or agent reviewed pages"><b>{snapshot.observed.toString().padStart(2,"0")}</b><span>READINGS</span></div>
            <div title="Independently certified, current pages"><b>{snapshot.certified.toString().padStart(2,"0")}</b><span>CERTIFIED</span></div>
          </div>
          <div className={styles.modeSwitch} role="group" aria-label="Kingdom Index view">
            <button aria-label="Kingdom map" title="Realm view" aria-pressed={mode==="realm"} data-active={mode==="realm"} type="button" onClick={()=>setMode("realm")}><Grid2X2 size={17}/></button>
            <button aria-label="Performance ledger" title="Ledger view" aria-pressed={mode==="ledger"} data-active={mode==="ledger"} type="button" onClick={()=>setMode("ledger")}><List size={19}/></button>
          </div>
        </div>
      </header>
      {mode==="realm"?<div className={styles.atlas} aria-label="Kingdom map">
        <div className={styles.contours} aria-hidden="true"/>
        <div className={styles.compassRose} aria-hidden="true"><Compass size={22}/><span>N</span></div>
        <div className={styles.atlasSeal} aria-hidden="true"><Castle size={27}/><span>A · II · E</span></div>
        <div className={styles.territories}>
          {REGIONS.map(region=><DistrictSection key={region.id} region={region} pages={byRegion.get(region.id)??[]} selected={selected} focus={focus}/>)}
        </div>
      </div>:<section className={styles.ledger} aria-label="Engineering ledger">
        <header className={styles.ledgerHead}><span>REALM / ROUTE</span><span>QUALITY</span><span>HISTORY</span><span>OBSERVED</span><span/></header>
        {rows.map(item=><div key={item.href} className={styles.ledgerGroup}>
          <div className={styles.ledgerRow} data-status={item.status}>
            <div className={styles.ledgerName}><span className={styles.signal}/><div><Link href={item.href}>{item.label}<ArrowUpRight size={12}/></Link><span>{item.href}</span></div></div>
            <Score entry={item}/>
            <Sparkline points={item.history} score={item.score} compact/>
            <div className={styles.ledgerTime} title={formatStamp(item.checkedAt)}><Clock3 size={12}/>{item.checkedAt?new Date(item.checkedAt).toISOString().slice(0,10):"—"}</div>
            <button className={styles.expandButton} type="button" aria-expanded={expanded===item.href} aria-label={`Details for ${item.label}`} onClick={()=>setExpanded(v=>v===item.href?null:item.href)}><ChevronDown size={18}/></button>
          </div>
          {expanded===item.href&&<PageDetail item={item} close={()=>setExpanded(null)}/>}
        </div>)}
      </section>}
      {mode==="realm"&&focused&&<div className={styles.floatingEvidence}><PageDetail item={focused} close={()=>setSelected(null)}/></div>}
      <section className={styles.companionSection} aria-label="Companion applications engineering index">
        <header className={styles.companionHeader}>
          <div><span className={styles.eyebrow}>EXTERNAL SYSTEMS / DESKTOP</span><h2>COMPANION APPLICATIONS</h2></div>
          <span className={styles.companionCount}>{String(snapshot.companions?.length??0).padStart(2,"0")} COMPANION</span>
        </header>
        {(snapshot.companions??[]).map(companion=><article className={styles.companionCard} key={companion.id}>
          <div className={styles.companionSummary}>
            <div><span className={styles.eyebrow}>DESKTOP · RELEASE {companion.version}</span><h3>{companion.label}</h3>
              <p>Replay ingestion · capture · telemetry · cross-platform update lifecycle</p></div>
            <div className={styles.companionGrade}><b aria-label="No independently certified desktop quality score">—<small>/100</small></b><span>UNMEASURED</span></div>
          </div>
          <p className={styles.companionNote}>Desktop quality shares the Kingdom&apos;s 100-point rubric, but needs its own installed-client, source-drift, resource and replay integrity receipts. The release SHA is a baseline, not proof that a user&apos;s installed version or live runtime is current.</p>
          <div className={styles.companionLinks}>
            <Link href={companion.downloadHref}>DOWNLOAD &amp; RELEASE <ArrowUpRight size={13}/></Link>
            <a href={companion.repositoryUrl} target="_blank" rel="noopener noreferrer">SOURCE REPOSITORY <ArrowUpRight size={13}/></a>
            <code title={companion.sourceSha}>RELEASE SOURCE {companion.sourceSha.slice(0,12)}</code>
          </div>
          <details className={styles.companionChecks}>
            <summary>INSPECTION GATES · {companion.gates.length} UNVERIFIED <ChevronDown size={15}/></summary>
            <div className={styles.assuranceList} role="list">{companion.gates.map(gate=><div className={styles.assuranceItem} role="listitem" key={gate.id}>
              <div><strong>{gate.id.replace(/-/g," ")}</strong><span>{gate.status.toUpperCase()}</span></div><p>{gate.requirement}</p>
            </div>)}</div>
          </details>
        </article>)}
      </section>
      <footer className={styles.footer}>
        <span><span className={styles.liveDot}/> {connectionLost?"SIGNAL UNAVAILABLE":snapshot.source==="file"?"INSPECTION FEED":"SOURCE REVIEW BASELINE"}</span>
        <span>{snapshot.drifted>0?`${snapshot.drifted} AGED / DRIFTED`:"NO VERIFIED DRIFT"} <span className={styles.footerDivider}>·</span> {formatStamp(snapshot.generatedAt)}</span>
      </footer>
    </div>
  </main>;
}
