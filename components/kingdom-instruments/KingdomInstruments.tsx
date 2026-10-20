"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Atom, Boxes, ChevronRight, CircleHelp,
  CircuitBoard, Cpu, Gauge, HardDrive,
  LockKeyhole, Microscope, RadioTower, RefreshCw, RotateCcw,
  ScanLine, ShieldCheck, ShieldAlert, Waves,
} from "lucide-react";
import wolo from "@/config/wolo-machine-capabilities.json";
import styles from "./KingdomInstruments.module.css";

export type InstrumentKind = "sensors" | "tests" | "recovery" | "systems" | "replay" | "wolo";
type Reading = Record<string, unknown>;
type Feed = { payload: Reading | null; state: "loading" | "observed" | "unavailable"; fetchedAt: string | null };
const sources: Record<InstrumentKind, readonly string[]> = {
  sensors: ["/api/general-inspections", "/api/kingdom-intelligence"],
  tests: ["/api/general-inspections", "/api/kingdom-index"],
  recovery: ["/api/kingdom-intelligence", "/api/general-inspections"],
  systems: ["/api/kingdom-route-census", "/api/kingdom-patrol", "/api/kingdom-intelligence"],
  replay: ["/api/hd-replay-engine"],
  wolo: ["/api/wolo/status", "/api/kingdom-intelligence"],
};
const titles: Record<InstrumentKind, { name: string; accent: string; kicker: string; number: string }> = {
  sensors: { name: "KINGDOM SENSORS", accent: "SENSORS", kicker: "OBSERVATION ARRAY", number: "04" },
  tests: { name: "KINGDOM TESTS", accent: "TESTS", kicker: "THE PROVING GROUNDS", number: "05" },
  recovery: { name: "KINGDOM RECOVERY", accent: "RECOVERY", kicker: "THE BLACK VAULT", number: "06" },
  systems: { name: "KINGDOM SYSTEMS", accent: "SYSTEMS", kicker: "MACHINE DECK", number: "07" },
  replay: { name: "REPLAY LABORATORY", accent: "LABORATORY", kicker: "THE UNKNOWN FRONTIER", number: "08" },
  wolo: { name: "WOLO MACHINE", accent: "MACHINE", kicker: "WOLO-1 / HD CHAIN ENGINEERING", number: "09" },
};
const isRecord = (v: unknown): v is Reading => Boolean(v && typeof v === "object" && !Array.isArray(v));
const rec = (v: unknown): Reading => isRecord(v) ? v : {};
const arr = (v: unknown): Reading[] => Array.isArray(v) ? v.filter(isRecord) : [];
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const str = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const fmt = (v: unknown, unit = "") => { const n = num(v); return n === null ? "—" : n.toLocaleString("en-CA", { maximumFractionDigits: 1 }) + unit; };
const pct = (v: unknown) => { const n = num(v); return n === null ? null : Math.min(100, Math.max(0, n)); };
const time = (v: unknown) => { const s = str(v); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit",hour12:false}) : "—"; };

function GaugePanel({ label, value, total, tone = "cyan" }: { label:string; value:number|null;total:number|null;tone?:string }) {
  const valid = value !== null && total !== null && total > 0;
  const fraction = valid ? Math.min(100, 100 * (value / total)) : 0;
  return <div className={styles.gaugeBox}>
    <div className={styles.gaugeTop}><span>{label}</span><strong>{valid ? fraction.toFixed(1)+"%" : "—"}</strong></div>
    <div className={styles.gaugeTrack} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valid ? fraction : undefined}>
      {valid && <span className={styles.gaugeFill} style={{width:fraction+"%"}} data-tone={tone}/>}
    </div>
    <span className={styles.gaugeFoot}>{valid ? fmt(value)+" / "+fmt(total) : "MEASUREMENT UNAVAILABLE"}</span>
  </div>;
}

function SourceTag({ source, state }: {source:string;state:string}) {
  return <span className={styles.sourceTag} title={source}><span className={state==="observed"?styles.spark:styles.darkSpark}/>{source.replace("/api/","").toUpperCase().replaceAll("/"," · ")} <b>{state==="observed"?"OBSERVED":"UNKNOWN"}</b></span>;
}

function SignalPath({ names, active = -1 }: {names:string[]; active?:number}) {
  return <div className={styles.signalPath}>{names.map((name,i)=><div key={name} className={[styles.pathNode,i===active?styles.activePath:""].join(" ")}><span className={styles.pathDot}/><strong>{name}</strong>{i<names.length-1&&<span className={styles.pathWire}/>}</div>)}</div>;
}

function Waveform({ energized }: {energized:boolean}) {
  return <svg viewBox="0 0 1000 125" role="img" aria-label={energized?"Decorative live signal trace, not a numeric oscilloscope measurement":"Decorative signal trace; no evidence connected"} className={styles.wave}>
    <defs><linearGradient id="instrument-wave" x1="0" x2="1"><stop stopColor="#50e1de" stopOpacity=".22"/><stop offset=".5" stopColor="#8debd0"/><stop offset="1" stopColor="#50e1de" stopOpacity=".2"/></linearGradient></defs>
    {Array.from({length:9},(_,i)=><line key={i} x1={0} x2={1000} y1={i*15+2} y2={i*15+2} stroke="#8edaca" strokeOpacity=".08"/>)}
    <path d={energized?"M0 63 L115 63 L139 61 L145 39 L153 86 L163 55 L171 65 L272 64 L294 42 L308 78 L320 49 L332 63 L480 63 L499 30 L512 92 L521 57 L534 63 L670 63 L688 45 L703 75 L716 63 L838 63 L856 35 L869 94 L879 62 L1000 63":"M0 63 L1000 63"} fill="none" stroke="url(#instrument-wave)" strokeWidth="2.4" strokeLinecap="round"/>
  </svg>;
}

function WoloCanvas({ w, ki }: {w:Reading;ki:Reading}) {
  const invariants = arr(ki.invariants);
  const source = rec(ki.source),health=rec(ki.health);
  const live = w.healthy === true && ki.available === true && ki.stale === false;
  const chainLive = w.healthy === true && w.chainId === "wolo-1";
  const selected = invariants.filter(r=>["wolo-listener-boundary","source-authority-exact","estate-p1-zero"].includes(str(r.key)||""));
  return <div className={styles.stageStack}>
    <section className={styles.machineCore}>
      <div className={styles.machineOrbit} aria-hidden="true"><div className={styles.machineRing}/><div className={styles.machineRing2}/><span className={styles.orbitSymbol}><Atom size={46}/></span></div>
      <div className={styles.machineCenter}><span className={styles.micro}>CHAIN ID / LIVE RPC</span><strong>{chainLive ? str(w.chainId) : "UNVERIFIED"}</strong><div className={styles.chainStats}>
        <div><small>HEIGHT</small><b>{chainLive && str(w.latestBlockHeight) ? str(w.latestBlockHeight) : "—"}</b></div>
        <div><small>PEERS</small><b>{chainLive ? fmt(num(w.peers)) : "—"}</b></div>
        <div><small>CONSENSUS</small><b>{chainLive ? str(w.consensusStatus)?.toUpperCase() : "UNKNOWN"}</b></div>
      </div>
      <div className={styles.machineSource}>{chainLive ? "RPC OBSERVATION" : "RPC EVIDENCE UNAVAILABLE"} · {chainLive ? time(w.latestBlockTime) : "—"}</div></div>
    </section>
    <section className={styles.machineModules}>
      {wolo.modules.map((m,i)=><div className={[styles.module, m.kind==="external"?styles.externalModule:""].join(" ")} key={m.key}>
        <span className={styles.moduleNumber}>{String(i+1).padStart(2,"0")}</span>
        <span className={styles.moduleIcon}>{m.kind==="protocol"?<Boxes size={22}/>:m.kind==="external"?<LockKeyhole size={21}/>:<CircuitBoard size={22}/>}</span>
        <strong>{m.label}</strong><small>{m.kind==="external"?"SEVERED SCOPE":"SOURCE-DECLARED"}</small>
        <span className={styles.moduleProof}>{m.kind==="external"?"NO HD DEPENDENCY":m.owner}</span>
      </div>)}
    </section>
    <section className={styles.provenance}>
      <div className={styles.sectionBar}><ShieldAlert size={16}/> FINANCIAL PROVENANCE <span>HD ONLY · FAIL CLOSED</span></div>
      <SignalPath names={["GIT SOURCE","RELEASE CONTROLLER","VPS EXECUTABLE","SETTLEMENT PROOF","HD SATCHEL"]} active={-1}/>
      <div className={styles.guardGrid}>
        <div><small>APP SOURCE AUTHORITY</small><strong>{live ? source.exact === true?"MATCH OBSERVED":"NOT PROVEN":"UNKNOWN"}</strong><span>{live && source.productionRelease ? "ACTIVE APP "+String(source.productionRelease) : "RELEASE SHA UNAVAILABLE"}</span></div>
        <div><small>WOLO RELEASE GATE</small><strong>UNVERIFIED</strong><span>NO FINANCIAL CERTIFICATION FEED</span></div>
        <div><small>ESTATE P1 OBSERVATIONS</small><strong>{live?fmt(health.p1):"—"}</strong><span>NOT A FINANCIAL-CONTROL COUNT</span></div>
      </div>
      <div className={styles.guardStrip}>{selected.length?selected.map(v=><span key={String(v.key)}>{str(v.label)||str(v.key)||"GUARD"} <b>{str(v.status)||"UNKNOWN"}</b></span>):<span>INDEPENDENT FINANCIAL-GATE EVIDENCE NOT PRESENT</span>}</div>
    </section>
    <footer className={styles.paths}><Link href="/wolochain">PUBLIC CHAIN <ArrowUpRight size={14}/></Link><Link href="/wolo">WOLO <ArrowUpRight size={14}/></Link><Link href="/kingdom-brain">TRUTH ATLAS <ArrowUpRight size={14}/></Link></footer>
  </div>;
}

function SensorCanvas({ inspection, intelligence }: {inspection:Reading;intelligence:Reading}) {
  const categories=arr(inspection.categories),health=rec(intelligence.health),storage=rec(intelligence.storage),perf=rec(intelligence.performance);
  const valid=inspection.schema===1&&Array.isArray(inspection.categories);
  return <div className={styles.stageStack}>
    <div className={styles.waveFrame}><div className={styles.waveLabel}><Waves size={17}/> SENSOR BUS <span>{valid?"CONNECTED INSPECTIONS":"SENSOR BUS UNAVAILABLE"}</span></div><Waveform energized={valid}/></div>
    <div className={styles.sensorRack}>{categories.slice(0,12).map((row,i)=><div className={styles.sensorCell} key={str(row.id)||i}><div className={styles.sensorHead}><span>{String(i+1).padStart(2,"0")}</span><RadioTower size={16}/></div><strong>{str(row.title)||"UNKNOWN"}</strong><b>{valid?fmt(row.score):"—"}</b><small>{str(row.state)?.toUpperCase()||"UNVERIFIED"} · INSPECTIONS</small><div className={styles.sensorBar}><span style={{width:valid?(pct(row.score)||0)+"%":"0%"}}/></div></div>)}
      {!categories.length&&<div className={styles.emptyGrid}>INSPECTION SENSORS UNAVAILABLE</div>}</div>
    <div className={styles.miniObservations}><span><Activity size={16}/> DOCTOR {intelligence.available===true&&!intelligence.stale?fmt(health.doctorScore):"—"}</span><span><HardDrive size={16}/> VOLUME {intelligence.available===true&&!intelligence.stale?fmt(storage.usedPercent,"%"):"—"}</span><span><Gauge size={16}/> SPEED {intelligence.available===true&&!intelligence.stale&&perf.current===true?fmt(perf.ttfbP50Ms,"ms"):"—"}</span></div>
  </div>;
}

function TestsCanvas({ inspection, index }: {inspection:Reading;index:Reading}) {
  const cats=arr(inspection.categories),pages=arr(index.pages),valid=inspection.schema===1;
  return <div className={styles.stageStack}>
    <div className={styles.testMatrix}>{cats.map((c,i)=><div className={styles.testLane} key={str(c.id)||i}><span>{String(i+1).padStart(2,"0")}</span><div><strong>{str(c.title)||"UNKNOWN"}</strong><small>{arr(c.checks).length} DECLARED CHECKS</small></div><div className={styles.testRail}><span style={{width:valid?(pct(c.score)||0)+"%":"0%"}}/></div><b>{valid?fmt(c.score)+"/100":"—"}</b><span className={styles.testState}>{str(c.state)?.toUpperCase()||"UNKNOWN"}</span></div>)}
      {!cats.length&&<div className={styles.emptyGrid}>NO RECENT INSPECTION TEST EVIDENCE</div>}</div>
    <div className={styles.testSummary}><div><small>KINGDOM INDEX ENTRIES</small><strong>{Array.isArray(index.pages)?fmt(pages.length):"—"}</strong></div><div><small>INSPECTION CHECKS</small><strong>{valid?fmt(cats.reduce((a,c)=>a+arr(c.checks).length,0)):"—"}</strong></div><div><small>OVERALL VERIFIED SCORE</small><strong>{valid?fmt(inspection.overallScore):"—"}</strong></div><Link href="/general-inspections">INSPECT PROOF <ChevronRight size={15}/></Link></div>
  </div>;
}

function RecoveryCanvas({ intelligence }: {intelligence:Reading}) {
  const campaigns=rec(intelligence.storageCampaign),storage=rec(intelligence.storage),source=rec(intelligence.source),valid=intelligence.available===true&&!intelligence.stale;
  const invariant=arr(intelligence.invariants);
  return <div className={styles.stageStack}>
    <section className={styles.vault}>
      <div className={styles.vaultDoor}><div className={styles.vaultRim}><div className={styles.vaultHandle}><RotateCcw size={43}/></div></div></div>
      <div className={styles.vaultReadings}><span className={styles.micro}>BLACK VAULT / OPERATOR RECEIPTS</span><strong>{valid?"RECOVERY EVIDENCE":"RECEIPTS UNVERIFIED"}</strong><div className={styles.vaultColumns}>
        <div><small>VOLUME USAGE</small><b>{valid?fmt(storage.usedPercent,"%"):"—"}</b></div>
        <div><small>APP CERTIFICATION</small><b>{valid?str(source.certificationStatus)||"UNKNOWN":"UNKNOWN"}</b></div>
        <div><small>RECOVERY CAMPAIGN</small><b>{valid?str(campaigns.status)||"UNKNOWN":"UNKNOWN"}</b></div>
      </div></div>
    </section>
    <div className={styles.recoveryProof}>{["offhost-recovery-verified","finish-closure-complete","control-state-current"].map(key=>{const item=invariant.find(r=>r.key===key);return<div key={key}><ShieldCheck size={20}/><strong>{(str(item?.label)||key).toUpperCase()}</strong><span>{valid&&item?str(item.status)||"UNKNOWN":"UNVERIFIED"}</span></div>})}</div>
    <div className={styles.recoveryFoot}><span><CircleHelp size={15}/> A BACKUP IS NOT A VERIFIED RESTORE</span><Link href="/kingdom-intelligence">RECOVERY EVIDENCE <ArrowUpRight size={14}/></Link></div>
  </div>;
}

function SystemsCanvas({ census, patrol, intelligence }: {census:Reading;patrol:Reading;intelligence:Reading}) {
  const counts=rec(census.counts),runtime=census.status==="verified";
  const lanes: Array<[string, unknown]>=[["PUBLIC",counts.publicStatic],["DYNAMIC",counts.publicDynamic],["UTILITY",counts.publicUtility],["ADMIN",counts.admin],["SENSITIVE",counts.sensitiveDynamic],["API",counts.apiHandlers]];
  return <div className={styles.stageStack}>
    <div className={styles.rackFrame}><div className={styles.rackHeader}><Cpu size={19}/> BUILD MANIFEST <span>{runtime?"EXACT DEPLOYED SOURCE":"RUNTIME MANIFEST UNKNOWN"}</span></div>
      <div className={styles.rackRows}>{lanes.map(([name,n],i)=><div className={styles.rackUnit} key={String(name)}><span>{String(i+1).padStart(2,"0")}</span><strong>{name}</strong><div className={styles.rackLights}>{Array.from({length:8},(_,j)=><i key={j} className={runtime&&num(n)!==null&&j<Math.min(8,Math.ceil((num(n)||0)/10))?styles.rackOn:""}/>)}</div><b>{runtime?fmt(n):"—"}</b></div>)}</div>
    </div>
    <div className={styles.systemLinks}><div><small>PAGE TEMPLATES</small><strong>{runtime?fmt(counts.totalPages):"—"}</strong></div><div><small>PATROL POLICIES</small><strong>{patrol.schema===1?fmt(patrol.assigned)+"/"+fmt(patrol.registered):"—"}</strong><span>ASSIGNED ≠ RUNNING</span></div><div><small>WORKSPACE DRIFT</small><strong>{intelligence.available===true&&!intelligence.stale?fmt(rec(intelligence.workspace).canonicalDriftCount):"—"}</strong></div></div>
    <SignalPath names={["SOURCE","NEXT BUILD","RELEASE","OBSERVATIONS","KINGDOM INDEX"]} active={runtime?2:-1}/>
  </div>;
}

function ReplayCanvas({ replay }: {replay:Reading}) {
  const counts=rec(replay.counts),unknown=rec(replay.unknown);
  const live=replay.schema===1;
  const reasons=arr(unknown.reasons).slice(0,9);
  const cases=arr(unknown.cases).slice(0,6);
  const maxReason=Math.max(...reasons.map(x=>num(x.count)||0),1);
  return <div className={styles.stageStack}>
    <div className={styles.replayHero}><div className={styles.replayOrbit}><Microscope size={49}/></div><div className={styles.replayFocus}><span>UNKNOWN BATTLE FRONTIER</span><strong>{live?fmt(counts.logicalTruthUnknown):"—"}</strong><small>LOGICAL BATTLES / UNRESOLVED EVIDENCE</small></div><div className={styles.replayMetrics}><div><small>FULL TRUTH</small><b>{live?fmt(counts.logicalFullTruth):"—"}</b></div><div><small>PARSER RUNS</small><b>{live?fmt(counts.parserRuns):"—"}</b></div><div><small>INDEXED FAILED</small><b>{live?fmt(counts.indexedFailed):"—"}</b></div></div></div>
    <GaugePanel label="LOGICAL TRUTH COVERAGE" value={live?num(counts.logicalFullTruth):null} total={live?num(counts.uniqueLogicalBattles):null} tone="amber"/>
    <div className={styles.replayColumns}><section><div className={styles.sectionBar}>FAILURE SPECTRUM <span>CANONICAL REPLAY OBSERVATORY</span></div>{reasons.length?reasons.map((r,i)=><div key={String(r.key)||i} className={styles.reason}><small>{str(r.key)||"UNKNOWN"}</small><div><span style={{width:((num(r.count)||0)/maxReason*100)+"%"}}/></div><b>{fmt(r.count)}</b></div>):<div className={styles.emptyGrid}>NO FAILURE CLASSIFICATIONS</div>}</section>
      <section><div className={styles.sectionBar}>LATEST UNRESOLVED <span>{cases.length} DISPLAYED</span></div>{cases.length?cases.map((c,i)=><div key={String(c.id)||i} className={styles.caseRow}><span>{String(i+1).padStart(2,"0")}</span><b>{str(c.owner)||str(c.mapName)||"EVIDENCE CASE"}</b><small>{str(c.reason)||str(c.status)||"UNRESOLVED"}</small></div>):<div className={styles.emptyGrid}>UNKNOWN CASES UNAVAILABLE</div>}</section></div>
    <div className={styles.paths}><Link href="/hd-replay-engine">PARSER OBSERVATORY <ArrowUpRight size={14}/></Link><Link href="/replay-parser">UPLOAD PARSER <ArrowUpRight size={14}/></Link></div>
  </div>;
}

export default function KingdomInstruments({ kind }: { kind: InstrumentKind }) {
  const [feeds,setFeeds] = useState<Record<string,Feed>>({});
  const [refreshId,setRefreshId]=useState(0);
  const [now,setNow]=useState<string|null>(null);
  const [visible,setVisible]=useState(true);
  const title=titles[kind];
  useEffect(()=>{
    const handler=()=>setVisible(document.visibilityState==="visible");
    handler();document.addEventListener("visibilitychange",handler);
    return()=>document.removeEventListener("visibilitychange",handler);
  },[]);
  useEffect(()=>{
    if(!visible)return;
    const ctrl=new AbortController();
    const timeout=window.setTimeout(()=>ctrl.abort(),10000);
    const urls=sources[kind];
    void Promise.all(urls.map(async url=>{
      try {
        const r=await fetch(url,{cache:"no-store",signal:ctrl.signal,credentials:"same-origin"});
        if(!r.ok) throw new Error("unavailable");
        const payload: unknown=await r.json();
        if(!isRecord(payload))throw new Error("malformed");
        if(!ctrl.signal.aborted) setFeeds(prev=>({...prev,[url]:{state:"observed",payload,fetchedAt:new Date().toISOString()}}));
      }catch {
        if(!ctrl.signal.aborted) setFeeds(prev=>({...prev,[url]:{state:"unavailable",payload:null,fetchedAt:null}}));
      }
    })).then(()=>{if(!ctrl.signal.aborted)setNow(new Date().toISOString())}).finally(()=>window.clearTimeout(timeout));
    return()=>{ctrl.abort();window.clearTimeout(timeout)};
  },[kind,refreshId,visible]);
  useEffect(()=>{if(!visible)return;const timer=window.setInterval(()=>setRefreshId(x=>x+1),90000);return()=>window.clearInterval(timer)},[visible]);
  const data=useCallback((url:string)=>rec(feeds[url]?.payload),[feeds]);
  const badges=useMemo(()=>sources[kind].map(url=>({url,state:feeds[url]?.state||"loading"})),[feeds,kind]);
  const ki=data("/api/kingdom-intelligence"),insp=data("/api/general-inspections");
  const features=kind==="wolo"?<WoloCanvas w={data("/api/wolo/status")} ki={ki}/>:
    kind==="sensors"?<SensorCanvas inspection={insp} intelligence={ki}/>:
    kind==="tests"?<TestsCanvas inspection={insp} index={data("/api/kingdom-index")}/>:
    kind==="recovery"?<RecoveryCanvas intelligence={ki}/>:
    kind==="systems"?<SystemsCanvas census={data("/api/kingdom-route-census")} patrol={data("/api/kingdom-patrol")} intelligence={ki}/>:
    <ReplayCanvas replay={data("/api/hd-replay-engine")}/>;
  const observed=badges.filter(x=>x.state==="observed").length;
  return <main className={styles.page} data-kind={kind}>
    <div className={styles.noise} aria-hidden="true"/>
    <div className={styles.shell}>
      <header className={styles.top}>
        <div className={styles.kicker}><span className={styles.liveDot}/>{title.kicker}<span className={styles.serial}>AOE2WAR / INSTRUMENT {title.number}</span></div>
        <div className={styles.titleRow}><h1>{title.name.split(" ").slice(0,-1).join(" ")} <em>{title.accent}</em></h1><button className={styles.refresh} type="button" onClick={()=>setRefreshId(v=>v+1)} aria-label="Refresh observed telemetry"><RefreshCw size={17}/></button></div>
        <div className={styles.subtitle}><span>AUTHORITY-BOUND INSTRUMENTS</span><i/><span>ZERO SYNTHETIC HEALTH</span><i/><span>OBSERVED {now?time(now):"—"}</span></div>
      </header>
      <section className={styles.evidenceStrip} aria-label="Telemetry source states"><div className={styles.evidenceSummary}><ScanLine size={18}/><strong>{observed}/{badges.length}</strong><small>RESPONDING READERS</small></div>{badges.map(b=><SourceTag key={b.url} source={b.url} state={b.state}/>)}</section>
      {features}
      <footer className={styles.footer}><span><CircleHelp size={14}/> LIVE NUMBERS REQUIRE A REAL READER · UNVERIFIED ≠ ZERO</span><nav><Link href="/kingdom-brain">BRAIN</Link><Link href="/kingdom-agents">AGENTS</Link><Link href="/kingdom-index">INDEX</Link><Link href="/kingdom-intelligence">INTELLIGENCE</Link></nav></footer>
    </div>
  </main>;
}
