"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, BrainCircuit,
  ChevronRight, CircleHelp, Download, Eye, Gauge, GitBranch,
  Radio, RefreshCw, ScanLine, ShieldCheck,
  Signal, Sparkles, Waves,
} from "lucide-react";
import type { WatcherPublicSnapshot, WatcherSignalState } from "@/lib/kingdomWatcherPublic";
import styles from "./KingdomWatcher.module.css";

type StateKey = WatcherSignalState | "all";
const STATES: Array<{
  key: WatcherSignalState; label: string; legend: string; color: string;
}> = [
  { key: "monitoring", label: "MONITORING", legend: "Waiting for replay changes", color: "#53e4d5" },
  { key: "detected", label: "GAME DETECTED", legend: "Recent replay detection", color: "#ffd277" },
  { key: "batch", label: "BATCH IMPORT", legend: "Historical import underway", color: "#ba92ff" },
  { key: "uploading", label: "UPLOADING", legend: "Recent transfer attempt", color: "#ff9c84" },
  { key: "streaming", label: "STREAMING", legend: "Broadcast-start evidence", color: "#80aeff" },
  { key: "idle", label: "IDLE", legend: "Recent signal; no active operation proven", color: "#698294" },
];
const format = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-CA") : "—";
const metric = (n: number | null | undefined, suffix = "") => typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) + suffix : "—";
const age = (iso: string) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(11, 16) : "—";
};
const colors: Record<WatcherSignalState, string> = Object.fromEntries(STATES.map(row => [row.key, row.color])) as Record<WatcherSignalState, string>;
const coordinates = (index: number) => {
  // Fixed deterministic positions: no synthetic telemetry or random animation.
  const ring = index % 4, lane = Math.floor(index / 4);
  const angle = (index * 137.50776 - 30) * Math.PI / 180;
  const radius = 17 + ring * 8 + (lane % 3) * 1.9;
  return { left: 50 + Math.cos(angle) * radius + "%", top: 50 + Math.sin(angle) * radius * .77 + "%" };
};
function Digit({ label, value, unit, sub, tint }: { label: string; value: string; unit?: string; sub: string; tint?: string }) {
  return <article className={styles.digit}>
    <div className={styles.digitLabel}>{label}</div>
    <div className={styles.digitValue} style={tint ? { color: tint } : undefined}>{value}<small>{unit}</small></div>
    <div className={styles.digitSub}>{sub}</div>
  </article>;
}
function Evidence({ title, value, detail, good }: { title: string; value: string; detail: string; good?: boolean }) {
  return <div className={styles.evidence}>
    <div className={styles.evidenceHead}>{title}<span className={good ? styles.evidenceGood : styles.evidenceAwait}>{good ? "VERIFIED" : "UNMEASURED"}</span></div>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>;
}
function StreamChart({ rows, truncated }: { rows: WatcherPublicSnapshot["streaming"]["fourteenDays"]; truncated: boolean }) {
  const values = rows.map(row => row.starts);
  const max = Math.max(1, ...values);
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? 500 : 40 + index * 920 / Math.max(1, rows.length - 1);
    const y = 227 - row.starts / max * 175;
    return { x, y, ...row };
  });
  return <div className={styles.chartWrap}>
    <div className={styles.chartLegend}><span className={styles.chartDot} /> OBSERVED STREAM STARTS / UTC DAY <span>{truncated ? "PARTIAL SAMPLE" : "RECEIVED EVENT LEDGER"}</span></div>
    {points.length ? <>
      <svg className={styles.chart} viewBox="0 0 1000 270" preserveAspectRatio="none" role="img" aria-label="Observed stream start events by UTC day">
        <defs>
          <linearGradient id="watcherWave" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64e6d9" stopOpacity=".35" />
            <stop offset="100%" stopColor="#64e6d9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[55,110,165,225].map(y => <line key={y} x1="20" x2="980" y1={y} y2={y} stroke="#7ba9b5" strokeOpacity=".12" strokeDasharray="3 9" />)}
        {points.length > 1 ? <polygon points={"40,245 "+points.map(p => p.x+","+p.y).join(" ")+" 960,245"} fill="url(#watcherWave)" /> : null}
        {points.length > 1 ? <polyline points={points.map(p => p.x+","+p.y).join(" ")} fill="none" stroke="#63e7d9" strokeWidth="3.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
        {points.map((p,index) => <g key={p.date}>
          <circle cx={p.x} cy={p.y} r="6" fill="#6bf7e8" stroke="#09232d" strokeWidth="3" />
          <title>{p.date}: {p.starts} observed starts</title>
          {(index===0 || index===points.length-1 || index % 3 === 0) ? <text x={p.x} y="261" textAnchor="middle" fill="#819aab" fontSize="18">{p.date.slice(5)}</text> : null}
        </g>)}
      </svg>
      <div className={styles.chartBottom}><strong>{format(values.reduce((a,b) => a+b,0))}</strong> recorded starts in the available 14-day query <span>No synthetic zeros · no claimed completed broadcasts</span></div>
    </> : <div className={styles.chartEmpty}>No signed-in Watcher stream-start signals in the observed window.</div>}
  </div>;
}
export default function KingdomWatcherClient({ initial }: { initial: WatcherPublicSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState<StateKey>("all");
  const [activeNode, setActiveNode] = useState("observe");
  const [fetching, setFetching] = useState(false);
  const [connection, setConnection] = useState<"ready" | "reconnecting">("ready");

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const update = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        setFetching(true);
        const result = await fetch("/api/kingdom-watcher", {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        if (!result.ok) throw new Error("Signal unavailable");
        const next = await result.json() as WatcherPublicSnapshot;
        if (!next || next.schema !== 1 || !next.fleet || !next.release) throw new Error("Invalid snapshot");
        if (alive) { setSnapshot(next); setConnection("ready"); }
      } catch {
        if (alive && !controller.signal.aborted) setConnection("reconnecting");
      } finally { if (alive) setFetching(false); }
    };
    const timer = window.setInterval(() => void update(), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void update(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  const fleet = snapshot.fleet;
  const selectedSignals = useMemo(() => selected === "all" ? fleet.signals : fleet.signals.filter(row => row.state === selected), [fleet.signals, selected]);
  const stateMetrics = STATES.map(s => ({...s, count: fleet[s.key]}));
  const nodes = [
    { key:"observe", label:"WATCH", icon:Eye, note:"Replay folder observation, detection and live monitor state", link:"/hd-replay-engine" },
    { key:"capture", label:"CAPTURE", icon:ScanLine, note:"Replay snapshots, batch imports and game-state recognition", link:"/game-stats" },
    { key:"transfer", label:"TRANSFER", icon:Waves, note:"Bounded authenticated upload, retries and delivery receipts", link:"/download" },
    { key:"interpret", label:"PARSE", icon:BrainCircuit, note:"Deterministic HD replay interpretation with independently reviewed evidence", link:"/game-stats" },
    { key:"project", label:"PROVE", icon:ShieldCheck, note:"Source-bound code qualifications; production and hardware gates remain separate", link:"/kingdom-index" },
  ];
  const chosen = nodes.find(node => node.key === activeNode) ?? nodes[0];
  return <main className={styles.page}>
    <div className={styles.mesh} aria-hidden="true" />
    <div className={styles.lightOne} aria-hidden="true" />
    <div className={styles.lightTwo} aria-hidden="true" />
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <span><Signal size={14}/> KINGDOM SYSTEM / WATCHER OBSERVATORY</span>
        <span className={styles.topTime}><i className={snapshot.available ? styles.green : styles.grey} /> {snapshot.available ? "AUTHENTICATED EVENT LEDGER" : "LIVE FEED UNAVAILABLE"} · {age(snapshot.observedAt)} UTC-OBSERVED</span>
      </div>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}><span className={styles.kickerRule} /> THE REPLAY INTELLIGENCE ENGINE · LIVE EXHIBITION</div>
          <h1><span>KINGDOM</span><em>WATCHER</em></h1>
          <div className={styles.heroSub}>Invisible in the background. <strong>Unmissable in the evidence.</strong></div>
          <div className={styles.heroTokens}>
            <span><i /> RELEASE {snapshot.release.current}</span>
            <span><GitBranch size={13}/> NEXT {snapshot.build.version} · DEVELOPMENT</span>
            <span><ShieldCheck size={13}/> QUALITY: NOT YET CERTIFIED</span>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/download"><Download size={17}/> GET THE WATCHER <ArrowUpRight size={16}/></Link>
            <Link className={styles.secondaryCta} href="/kingdom-index"><Gauge size={16}/> SOURCE QUALITY INDEX <ChevronRight size={15}/></Link>
          </div>
        </div>
        <div className={styles.heroCore} aria-hidden="true">
          <div className={styles.orbitOuter} />
          <div className={styles.orbitMiddle} />
          <div className={styles.orbitInner} />
          <div className={styles.coreGlow} />
          <div className={styles.coreCenter}><div>W</div><small>REPLAY OS</small></div>
          <span className={styles.orbitOne}>01 / DETECT</span>
          <span className={styles.orbitTwo}>02 / SECURE</span>
          <span className={styles.orbitThree}>03 / PROVE</span>
        </div>
      </header>

      <section className={styles.readout} aria-label="Watcher fleet telemetry">
        <Digit label="SIGNED-IN DOWNLOADERS" value={format(fleet.signedInDownloaders)} sub="Unique accounts with download receipts" tint="#d8faff"/>
        <Digit label="RECENTLY SIGNALING" value={format(fleet.active)} sub="Authenticated client events within 150 sec" tint="#75ffdd"/>
        <Digit label="GAMES DETECTED" value={format(fleet.detected)} sub="Recent replay-detected signals · not active matches"/>
        <Digit label="BATCH / IMPORT" value={format(fleet.batch)} sub="Recent batch-start state, not completed games" tint="#d0afff"/>
        <Digit label="STREAMING SIGNALS" value={format(fleet.streaming)} sub="Stream-start activity, not verified continuous live" tint="#8db9ff"/>
        <Digit label="DOWNLOAD RECEIPTS" value={format(fleet.downloadReceipts)} sub="Package requests, not confirmed installs"/>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className={styles.overline}>01 // FLEET TELEMETRY</div><h2>THE LIVING <em>WATCHER GRID</em></h2><p>Anonymous, authenticated signals. Each light represents a recently observed session.</p></div>
          <div className={styles.headerIndicator}><span className={snapshot.available ? styles.pulseDot : styles.greyDot} />{connection==="reconnecting"?"RECONNECTING":snapshot.available?"30S OBSERVATION CYCLE":"SOURCE UNAVAILABLE"}{fetching ? <RefreshCw size={12} className={styles.spin}/> : null}</div>
        </div>
        <div className={styles.fleetGrid}>
          <div className={styles.radarPanel}>
            <div className={styles.radarHead}><span>NETWORK / PRIVATE SESSION SHAPES</span><span>{format(selectedSignals.length)} OBSERVED</span></div>
            <div className={styles.radar}>
              <div className={styles.radarRingA} /><div className={styles.radarRingB}/><div className={styles.radarRingC}/>
              <div className={styles.radarCrossH}/><div className={styles.radarCrossV}/>
              <div className={styles.radarSweep}/>
              <div className={styles.radarCenter}><Radio size={22}/><span>WATCHER</span><small>FLEET</small></div>
              {selectedSignals.map((signal,index) => <button
                type="button" key={index}
                className={styles.signalNode}
                style={{ ...coordinates(index), "--node-color": colors[signal.state] } as React.CSSProperties}
                title={signal.state.toUpperCase()+" · "+signal.minutesAgo+"m ago · anonymous client"}
                onClick={() => setSelected(signal.state)}
                aria-label={"Anonymous "+signal.state+" signal; show related signals"}
              ><i /></button>)}
              {!selectedSignals.length && <div className={styles.radarEmpty}>NO VERIFIED SIGNALS IN THIS VIEW</div>}
            </div>
            <div className={styles.radarFoot}>PUBLIC VIEW HIDES IDENTITIES · SESSION STATES INFERRED FROM RECENT EVENTS · NOT A LIVE GAME PRESENCE SERVICE</div>
          </div>
          <div className={styles.statePanel}>
            <div className={styles.stateHeading}><span>OPERATIONAL MODES</span><button type="button" className={selected==="all"?styles.filterSelected:styles.filter} onClick={()=>setSelected("all")}>ALL STATES</button></div>
            {stateMetrics.map(s => <button type="button" key={s.key} onClick={()=>setSelected(selected===s.key?"all":s.key)} className={selected===s.key?styles.modeSelected:styles.mode}>
              <span className={styles.modeMark} style={{color:s.color}}><i /></span>
              <span className={styles.modeInfo}><strong>{s.label}</strong><small>{s.legend}</small></span>
              <span className={styles.modeCount}>{format(s.count)}</span>
              <ChevronRight size={15}/>
            </button>)}
            <div className={styles.stateFooter}><ShieldCheck size={15}/> No user accounts, IDs, private IPs, keys or device fingerprints are published. Account-level visibility requires an opt-in design.</div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><div className={styles.overline}>02 // SOURCE-BOUND ENGINEERING</div><h2>THE RELEASE <em>EVOLUTION</em></h2><p>Three separate authorities. Never confuse a draft candidate with a deployed version.</p></div><Link className={styles.headerLink} href="/kingdom-index">QUALITY RUBRIC <ArrowUpRight size={15}/></Link></div>
        <div className={styles.versionGrid}>
          <div className={styles.versionCard}><div className={styles.versionTitle}>PREVIOUS RELEASE <span>HISTORICAL</span></div><strong>{snapshot.release.previous}</strong><div className={styles.versionBar}><i style={{width:"100%",background:"#617b8e"}}/></div><p>Historical published generation</p><div className={styles.versionSpecs}><div><span>MEASURED CODE SCORE</span><b>—</b></div><div><span>CPU / RAM BASELINE</span><b>—</b></div><div><span>VERIFIED PACKAGE SIZE</span><b>—</b></div></div><small>No unsupported historical metrics invented.</small></div>
          <div className={styles.versionCardCurrent}><div className={styles.versionTitle}>CURRENT LIVE RELEASE <span>PRODUCTION</span></div><strong>{snapshot.release.current}</strong><div className={styles.versionBar}><i style={{width:"100%",background:"#62eadc"}}/></div><p>{snapshot.release.releasedOn} · {snapshot.release.formats} packages · {snapshot.release.platforms} platforms</p><div className={styles.versionSpecs}><div><span>MEASURED CODE SCORE</span><b>—</b></div><div><span>CPU / RAM BASELINE</span><b>—</b></div><div><span>VERIFIED PACKAGE SIZE</span><b>—</b></div></div><small>Live release source: application download registry.</small></div>
          <div className={styles.versionCardNext}><div className={styles.versionTitle}>NEXT GENERATION <span>UNDER CONSTRUCTION</span></div><strong>{snapshot.build.version}</strong><div className={styles.versionBar}><i style={{width:"100%",background:"#b98dff"}}/></div><p>Unmerged development source · not shipped to users</p><div className={styles.versionSpecs}><div><span>NODE CONTRACTS</span><b>{format(snapshot.build.nodeTests)}</b></div><div><span>CI JOBS GREEN</span><b>{snapshot.build.nativeJobs === null ? "—" : snapshot.build.nativeJobs + "/4"}</b></div><div><span>PHYSICAL BENCHMARK</span><b>—</b></div></div>{snapshot.build.checkedEvidence ? <a href={snapshot.build.checkedEvidence} target="_blank" rel="noopener noreferrer">VIEW TEST RECEIPT <ArrowUpRight size={13}/></a> : <small>Fresh exact-head CI evidence pending</small>}</div>
        </div>
        <div className={styles.comparisonCaveat}><CircleHelp size={16}/> PASSING SOURCE TESTS IS NOT A 100/100 SCORE. EXACT-SOURCE HARDWARE PERFORMANCE, REPLAY FINALITY, SIGNED MAC UPDATE/ROLLBACK AND PROTECTED DEPLOYMENT ARE STILL OPEN.</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><div className={styles.overline}>03 // OBSERVED THROUGHPUT</div><h2>THE STREAM <em>PULSE</em></h2><p>Real recorded start events, by UTC date. No invented daily history.</p></div><span className={styles.headerIndicator}><Activity size={14}/> 14-DAY SOURCE WINDOW</span></div>
        <StreamChart rows={snapshot.streaming.fourteenDays} truncated={snapshot.streaming.truncated}/>
        <div className={styles.meterGrid}>
          <Evidence title="CPU / REPORTING CLIENTS" value={metric(snapshot.resources.cpuPercent,"%")} detail={snapshot.resources.reportingSessions+" sampled active sessions"} good={snapshot.resources.cpuPercent!==null}/>
          <Evidence title="WORKING SET MEMORY" value={metric(snapshot.resources.workingSetMb," MiB")} detail="Recent heartbeat samples; not a package-size metric" good={snapshot.resources.workingSetMb!==null}/>
          <Evidence title="IDLE WAKEUPS / SECOND" value={metric(snapshot.resources.idleWakeupsPerSecond)} detail="Observed client resource profile · not watts" good={snapshot.resources.idleWakeupsPerSecond!==null}/>
          <Evidence title="MANUAL FILE IMPORTS / 24H" value={format(fleet.manualImports24h)} detail="Server parse receipts; separate from Watcher batch clients" good={fleet.manualImports24h!==null}/>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><div className={styles.overline}>04 // INTERACTIVE SYSTEMS ATLAS</div><h2>INSIDE THE <em>MACHINE</em></h2><p>Select a subsystem to trace how evidence travels through the Kingdom.</p></div><span className={styles.headerIndicator}><GitBranch size={14}/> VERIFIED ARCHITECTURE</span></div>
        <div className={styles.systemArea}>
          <div className={styles.systemMap}>
            <svg className={styles.systemLines} viewBox="0 0 1000 280" aria-hidden="true" preserveAspectRatio="none">
              <path d="M92 138 C155 40 210 45 296 138 S451 231 501 138 S657 38 708 138 S862 229 906 138" stroke="#5acdc7" strokeOpacity=".35" strokeWidth="2.5" fill="none"/>
              <path d="M92 138 C155 40 210 45 296 138 S451 231 501 138 S657 38 708 138 S862 229 906 138" stroke="#aefef5" strokeOpacity=".7" strokeWidth="1.2" fill="none" strokeDasharray="2 12" className={styles.dashFlow}/>
            </svg>
            {nodes.map((node,index)=>{const Icon=node.icon;return <button key={node.key} type="button" className={activeNode===node.key?styles.systemSelected:styles.systemNode} onClick={()=>setActiveNode(node.key)}><Icon size={23}/><strong>{node.label}</strong><span>{"0"+(index+1)}</span></button>})}
          </div>
          <div className={styles.systemDossier}><span>SELECTED SYSTEM</span><h3>{chosen.label}</h3><p>{chosen.note}</p><Link href={chosen.link}>OPEN SOURCE SURFACE <ArrowUpRight size={15}/></Link></div>
        </div>
      </section>
      <footer className={styles.footer}>
        <div><Sparkles size={17}/> KINGDOM WATCHER · BUILT TO BE OBSERVED</div>
        <div><Link href="/download">DOWNLOAD <ArrowUpRight size={13}/></Link><Link href="/kingdom-brain">KINGDOM BRAIN <ArrowUpRight size={13}/></Link><Link href="/speed">SPEED <ArrowUpRight size={13}/></Link><Link href="/traffic">TRAFFIC <ArrowUpRight size={13}/></Link></div>
        <small>PUBLIC OBSERVATORY · {fleet.truncated ? "FLEET EVENT QUERY CAPPED — COUNTS MAY BE UNDERSTATED" : "RECENT AUTHENTICATED EVENT SAMPLE"} · NOT A CLAIM OF INDIVIDUAL GAME PRESENCE OR PERFECT SOFTWARE</small>
      </footer>
    </div>
  </main>;
}
