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
function reviewAgeDays(evaluatedAt: string, generatedAt: string): number | null {
  // The source review declares calendar-day precision, not an exact measurement hour.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evaluatedAt)) return null;
  const reviewed = Date.parse(evaluatedAt + "T00:00:00Z");
  const observed = Date.parse(generatedAt);
  return Number.isFinite(reviewed) && Number.isFinite(observed) && observed >= reviewed
    ? Math.floor((observed - reviewed) / 86_400_000) : null;
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
  const measured=validScore(entry.score);
  const provisional=!measured && validScore(entry.provisionalReviewScore);
  // A dated source review is still worth displaying as historical context.
  // Never put it into entry.score or present it as source-aligned certification.
  const historical=!measured && !provisional && validScore(entry.lastReviewScore);
  const visible=measured?entry.score:(provisional?entry.provisionalReviewScore:(historical?entry.lastReviewScore:null));
  const accessible=measured?`${visible} out of 100, ${statusTitle(entry)}`:
    provisional?`Approximately ${visible} out of 100, unverified source review, not certified`:
    historical?`Historical, unverified source review: approximately ${visible} out of 100; not a current deployed-build score`:
    `Unrated: ${statusTitle(entry)}`;
  const label=provisional?"PROVISIONAL SOURCE REVIEW · NOT CERTIFIED":
    historical?"HISTORICAL SOURCE REVIEW · NOT CURRENT OR CERTIFIED":statusTitle(entry);
  return <span className={small?styles.scoreSmall:styles.score} data-status={entry.status}
    data-authority={historical?"historical":provisional?"provisional":measured?"measured":"unrated"}
    aria-label={accessible} title={label}>
    {(provisional||historical)&&<span aria-hidden="true">~</span>}{scoreString(visible)}
    {validScore(visible)&&<span className={styles.denom}>/100</span>}
    {historical&&<span className={styles.historicalLabel}>HIST.</span>}
    {provisional&&!small&&<span className={styles.denom}> REVIEW</span>}
  </span>;
}
function PageDetail({ item, close, criterionRubric }: {item:KingdomIndexEntry;close:()=>void;criterionRubric:KingdomIndexSnapshot["criterionRubric"]}) {
  return <section className={styles.detail} aria-label={`${item.label} engineering evidence`}>
    <div className={styles.detailHead}>
      <div><span className={styles.eyebrow}>{statusTitle(item)}</span><h2>{item.label}</h2></div>
      <button className={styles.close} onClick={close} type="button" aria-label="Close details"><X size={17}/></button>
    </div>
    <div className={styles.detailScore}><Score entry={item}/><Sparkline points={item.history} score={item.score}/></div>
    {item.provisionalReviewScore!==null&&item.score===null&&<section className={styles.evidenceNote} aria-label="Unverified review references">
      <p>OPERATOR SOURCE REVIEW ONLY. This approximate /100 estimate is NOT an independently audited or certified engineering score. Missing browser, production, domain and financial proof remains unknown; review references are claims, not validated artifacts.</p>
      <p>Review references (claims only):</p>
      <ul>{item.provisionalReviewRefs.map(ref=><li key={ref}><a href={ref} target="_blank" rel="noopener noreferrer">{ref}</a></li>)}</ul>
    </section>}
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
    {item.dimensions&&<div className={styles.bars} aria-label={item.authenticatedPublication?"Authenticated measured dimension progress, certified only when all gates pass":item.score===null?"Historical review dimensions, not current certification":"Observed engineering dimensions"}>
      {Object.entries(item.dimensions).map(([name,value])=>{
        const denominator:Record<string,number>={correctness:30,functionality:25,performance:20,maintainability:15,tests:10};
        const max=denominator[name]??100;
        return <div key={name} className={styles.barRow}><span>{name}</span><div><i style={{width:`${Math.min(100,Math.max(0,value/max*100))}%`}}/></div><b>{value}/{max}</b></div>;
      })}
    </div>}
    {item.dimensions&&item.score===null&&<p className={styles.evidenceNote}>{item.authenticatedPublication?"These independently authenticated dimension earnings are not an official certified score because full 100/100 and every mandatory gate have not both passed.":"The dimension bars above belong to the historical review, not a current, verified audit."}</p>}
    {item.notes&&<p className={styles.evidenceNote}>{item.notes}</p>}
    <section className={styles.criterionPanel} aria-label={`${item.label} twenty-criterion source-bound progress`}>
      <div className={styles.criterionSummary}>
        <div><span>INDEPENDENTLY APPROVED</span><strong>{item.criterionProgress.approvedCriteria}/20 CRITERIA</strong></div>
        <div><span>AUTHENTICATED EARNED</span><strong>{item.criterionProgress.authenticatedEarned===null?"UNKNOWN":`${item.criterionProgress.authenticatedEarned}/100`}</strong></div>
        <div><span>EXACT DEPLOYED BUILD</span><strong>{item.authenticatedPublication?.buildId??"NOT ATTESTED"}</strong></div>
      </div>
      <p className={styles.evidenceNote}>Approval is separate from testing and historical source review. Missing evidence is UNKNOWN, not measured zero. No points are earned by CI status, links or unapproved browser traces alone.</p>
      <details className={styles.criterionDetails}>
        <summary>20 CANONICAL CRITERIA · {item.criterionProgress.pendingCriteria} PENDING <ChevronDown size={15}/></summary>
        <div className={styles.criterionRows}>
          {criterionRubric.map(criterion=>{
            const approved=item.criterionProgress.approvals.find(x=>x.id===criterion.id);
            return <article key={criterion.id} className={styles.criterionRow} data-verified={!!approved}>
              <div className={styles.criterionRowHead}>
                <strong>{criterion.id.replace(/_/g," ")}</strong>
                <span>{approved?approved.earned:"—"}/{criterion.maximum} · {approved?"APPROVED":"PENDING"}</span>
              </div>
              <p>{criterion.requirement}</p>
              <p>REQUIRED PROOF: {criterion.requiredProofKinds.join(" / ")}</p>
              <p>NEXT: {approved?"Renew independently reviewed proof when source/build or approval freshness changes":criterion.nextAction}</p>
              {approved&&approved.evidenceDigests.length>0&&<p>INDEPENDENTLY VERIFIED ARTIFACT SHA-256: {approved.evidenceDigests.map(x=><code key={x}>{x} </code>)}</p>}
            </article>;
          })}
        </div>
      </details>
      <p className={styles.evidenceNote}>Source census: <code>{item.sourceVersion??"UNKNOWN"}</code> · independently authenticated Git SHA: <code>{item.authenticatedPublication?.gitSha??"UNKNOWN"}</code> · BUILD_ID: <code>{item.authenticatedPublication?.buildId??"UNKNOWN"}</code> · approval freshness: {item.authenticatedPublication?`through ${formatStamp(item.authenticatedPublication.expiresAt)}`:"UNKNOWN / NOT APPROVED"}</p>
    </section>
    {item.browserCandidate&&<section className={styles.evidenceNote} aria-label="Historical browser-tested coverage, not current certified proof">
      <strong>HISTORICAL CANDIDATE BROWSER COVERAGE · NO POINTS AWARDED</strong>
      <p>Earlier source-bound candidate <code>{item.browserCandidate.gitSha}</code> · Next BUILD_ID <code>{item.browserCandidate.buildId}</code> · route fingerprint <code>{item.browserCandidate.sourceTree}</code>.</p>
      <p>{item.browserCandidate.sequentialRequests} sequential and {item.browserCandidate.concurrentRequests} concurrent loopback API observations with Chrome screenshots were reported in the prior <a href={item.browserCandidate.workflowUrl} target="_blank" rel="noopener noreferrer">candidate workflow</a>. This is not a current deployed-build receipt or an independent criterion approval.</p>
    </section>}
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
function PageNode({ item, onFocus, active }: {item:KingdomIndexEntry;onFocus:(href:string,trigger:HTMLButtonElement)=>void;active:boolean}) {
  return <article className={styles.node} data-status={item.status} data-selected={active||undefined}>
    <div className={styles.nodeTop}><span className={styles.signal} aria-hidden="true"/><span className={styles.nodeStatus} title={statusTitle(item)}>{item.status==="current"?"●":item.status==="provisional"?"◒":item.status==="drifted"||item.status==="stale"?"◇":"·"}</span></div>
    <button type="button" className={styles.nodeFocus} onClick={event=>onFocus(item.href,event.currentTarget)} aria-label={`Inspect ${item.label}`}>
      <Score entry={item} small/>
      <span className={styles.nodeProgress}>{item.criterionProgress.approvedCriteria}/20 APPROVED</span>
    </button>
    <Link href={item.href} className={styles.nodeName} title={item.label}>{item.label}<ArrowUpRight size={12}/></Link>
    <span className={styles.nodePath} title={item.href}>{item.href}</span>
  </article>;
}
function DistrictSection({ region, pages, selected, focus }: {region:(typeof REGIONS)[number];pages:KingdomIndexEntry[];selected:string|null;focus:(href:string,trigger:HTMLButtonElement)=>void}) {
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
  const detailTriggerRef=useRef<HTMLButtonElement|null>(null);
  const refresh=useCallback(async (signal?:AbortSignal)=>{
    const requestId=++latestRefreshId.current;
    try{
      const response=await fetch("/api/kingdom-index",{cache:"no-store",signal});
      if(!response.ok)throw new Error("no measurement feed");
      const next=await response.json() as KingdomIndexSnapshot;
      if(next.schema!==1||!Array.isArray(next.pages)||!Array.isArray(next.criterionRubric)||next.criterionRubric.length!==20)throw new Error("bad evidence");
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
  const focus=(href:string,trigger:HTMLButtonElement)=>{
    detailTriggerRef.current=trigger;
    setSelected(prev=>prev===href?null:href);
  };
  const closeDetail=()=>{
    // Return keyboard focus before unmounting the Close details button.
    // The originating native button remains connected in either display mode.
    detailTriggerRef.current?.focus();
    setSelected(null);
    setExpanded(null);
  };
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
      <section className={styles.runtimeSection} aria-label="Live Kingdom Index source-bound operational readings">
        <header className={styles.runtimeHeader}>
          <div><strong>LIVE EVIDENCE COUNTERS</strong><span>Operator reported only · refreshed from private source snapshots every 60 seconds · no score authority</span></div>
          <span aria-live="polite">{connectionLost?"TRANSPORT UNAVAILABLE":snapshot.runtimeTelemetry?"SOURCE-MATCHED / UNVERIFIED":"NO VALID CURRENT SOURCE SNAPSHOT"}</span>
        </header>
        <div className={styles.runtimeGrid} role="list">
          {([
            ["navigation","Candidate navigation tested","/88"],
            ["accessibility","Candidate accessibility affected","/88"],
            ["doctor","Doctor producer report","/100"],
            ["inspections","General Inspections producer report","/100"],
            ["releaseParity","Reported website release parity","/1"]
          ] as const).map(([id,label,suffix])=>{
            const reading=snapshot.runtimeTelemetry?.readings.find(row=>row.id===id);
            const current=reading?.status==="REPORTED_UNVERIFIED";
            return <div role="listitem" className={styles.runtimeMetric} key={id} data-fresh={current}>
              <span>{label}</span>
              <strong>{reading?`${reading.numerator}${suffix}`:"UNKNOWN"}</strong>
              <small>{!reading?"NO VALID SOURCE RECEIPT":current?"OPERATOR REPORTED · NOT CERTIFIED":"STALE · NOT CURRENT"}</small>
              {reading&&<small title={reading.receiptSha256}>Observed {formatStamp(reading.observedAt)} · expires {formatStamp(reading.expiresAt)}</small>}
            </div>;
          })}
          <div role="listitem" className={styles.runtimeMetric}>
            <span>Independently authenticated criteria</span>
            <strong>{snapshot.pages.reduce((sum,p)=>sum+p.criterionProgress.approvedCriteria,0)}/1760</strong>
            <small>ONLY AUTHENTICATED SIGNED GRANTS</small>
          </div>
        </div>
        <p className={styles.runtimeFoot}>Telemetry source: {snapshot.runtimeTelemetry?.sourceSha.slice(0,12)??"UNKNOWN"} · Next BUILD_ID: {snapshot.runtimeTelemetry?.buildId??"UNKNOWN"} · revision: {snapshot.runtimeTelemetry?.revisionSha256.slice(0,12)??"UNKNOWN"} · received by page: {formatStamp(snapshot.generatedAt)}. Candidate smoke and operator reports are never quality points.</p>
      </section>
      {mode==="realm"?<div className={styles.atlas} aria-label="Kingdom map">
        <div className={styles.contours} aria-hidden="true"/>
        <div className={styles.compassRose} aria-hidden="true"><Compass size={22}/><span>N</span></div>
        <div className={styles.atlasSeal} aria-hidden="true"><Castle size={27}/><span>A · II · E</span></div>
        <div className={styles.territories}>
          {REGIONS.map(region=><DistrictSection key={region.id} region={region} pages={byRegion.get(region.id)??[]} selected={selected} focus={focus}/>)}
        </div>
      </div>:<section className={styles.ledger} aria-label="Engineering ledger">
        <header className={styles.ledgerHead}><span>REALM / ROUTE</span><span title="A score is published only after independent evidence; a ~score is an unverified, provisional source review.">QUALITY / REVIEW</span><span>HISTORY</span><span>OBSERVED</span><span/></header>
        {rows.map(item=><div key={item.href} className={styles.ledgerGroup}>
          <div className={styles.ledgerRow} data-status={item.status}>
            <div className={styles.ledgerName}><span className={styles.signal}/><div><Link href={item.href}>{item.label}<ArrowUpRight size={12}/></Link><span>{item.href}</span></div></div>
            <div className={styles.ledgerApproval}><Score entry={item}/><span>{item.criterionProgress.approvedCriteria}/20 CRITERIA APPROVED</span></div>
            <Sparkline points={item.history} score={item.score} compact/>
            <div className={styles.ledgerTime} title={formatStamp(item.checkedAt)}><Clock3 size={12}/>{item.checkedAt?new Date(item.checkedAt).toISOString().slice(0,10):"—"}</div>
            <button className={styles.expandButton} type="button" aria-expanded={expanded===item.href} aria-label={`Details for ${item.label}`} onClick={event=>{detailTriggerRef.current=event.currentTarget;setExpanded(v=>v===item.href?null:item.href);}}><ChevronDown size={18}/></button>
          </div>
          {expanded===item.href&&<PageDetail item={item} close={closeDetail} criterionRubric={snapshot.criterionRubric}/>}
        </div>)}
      </section>}
      {mode==="realm"&&focused&&<div className={styles.floatingEvidence}><PageDetail item={focused} close={closeDetail} criterionRubric={snapshot.criterionRubric}/></div>}
      <section className={styles.companionSection} aria-label="Companion applications engineering index">
        <header className={styles.companionHeader}>
          <div><span className={styles.eyebrow}>EXTERNAL SYSTEMS / DESKTOP</span><h2>COMPANION APPLICATIONS</h2></div>
          <span className={styles.companionCount}>{String(snapshot.companions?.length??0).padStart(2,"0")} COMPANION</span>
        </header>
        {(snapshot.companions??[]).map(companion=><article className={styles.companionCard} key={companion.id}>
          <div className={styles.companionSummary}>
            <div><span className={styles.eyebrow}>DESKTOP · RELEASE {companion.version}</span><h3>{companion.label}</h3>
              <p>Replay ingestion · capture · telemetry · cross-platform update lifecycle</p></div>
            <div className={styles.companionGrade}>
              <b aria-label="No independently certified desktop quality score">—<small>/100</small></b>
              <span>UNMEASURED · PUBLISHED {companion.version}</span>
            </div>
          </div>
          <p className={styles.companionNote}>Desktop quality shares the Kingdom&apos;s 100-point rubric, but needs its own installed-client, source-drift, resource and replay integrity receipts. The release SHA is a baseline, not proof that a user&apos;s installed version or live runtime is current.</p>
          {companion.draftSourceReview&&<section className={styles.companionNote} aria-label="Unpublished Watcher AI-assisted source estimate, not a release grade">
            <strong>UNPUBLISHED {companion.draftSourceReview.version} CANDIDATE — NOT RELEASED OR CERTIFIED.</strong>
            <p>AI-assisted source estimate: ~{companion.draftSourceReview.estimatedScore}/100. THIS IS NOT THE LIVE WATCHER QUALITY SCORE. Published v{companion.version} remains UNMEASURED.</p>
            <p>Candidate source: <a href={`${companion.repositoryUrl}/commit/${companion.draftSourceReview.sourceSha}`} target="_blank" rel="noopener noreferrer">{companion.draftSourceReview.sourceSha.slice(0,12)}</a> · review date: {companion.draftSourceReview.evaluatedAt} · review age: {reviewAgeDays(companion.draftSourceReview.evaluatedAt,snapshot.generatedAt)??"unknown"} calendar days at snapshot</p>
            <p>Independent evidence: 0/{companion.gates.length} mandatory desktop gates verified; no authenticated published score. Source-review links are leads for verification, not signed proof.</p>
            <p>{companion.draftSourceReview.notes}</p>
            <details><summary>20 estimated criteria · source triage only · proof links</summary>
              <ol>{companion.draftSourceReview.criteria.map(c=><li key={c.id}>{c.id}: ~{c.estimated}/{c.max} · estimated, not independently measured</li>)}</ol>
              {companion.draftSourceReview.refs.map(url=><p key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>)}
            </details>
          </section>}
          <div className={styles.companionLinks}>
            <Link href={companion.downloadHref}>DOWNLOAD &amp; RELEASE <ArrowUpRight size={13}/></Link>
            <a href={companion.repositoryUrl} target="_blank" rel="noopener noreferrer">SOURCE REPOSITORY <ArrowUpRight size={13}/></a>
            <a href={`${companion.repositoryUrl}/commit/${companion.sourceSha}`} target="_blank" rel="noopener noreferrer" title={companion.sourceSha}>RELEASE SOURCE {companion.sourceSha.slice(0,12)} <ArrowUpRight size={13}/></a>
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
