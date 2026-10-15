"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, BrainCircuit, CheckCircle2, Code2, Cpu, Database, GitBranch, GitCommitHorizontal, GitPullRequest, HardDrive, Network, Radio, RefreshCw, Server, ShieldCheck, TestTube2, Workflow, Zap } from "lucide-react";
import type { OsEvent, OsPublicSnapshot } from "@/lib/aoe2warOsPublic";
import modelAtlas from "@/config/aoe2war-os-models.json";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import styles from "./Aoe2warOsDeck.module.css";

function age(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "NOT PROVEN";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return minutes + "M AGO";
  if (minutes < 1440) return Math.floor(minutes / 60) + "H AGO";
  return Math.floor(minutes / 1440) + "D AGO";
}
function dateUtc(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
function short(value: string | null, length = 12) { return value ? value.slice(0, length) : "UNVERIFIED"; }
function number(value: number | null) { return value === null ? "—" : value.toLocaleString("en-US"); }
function isRunning(value: OsPublicSnapshot["github"]["workflow"]) {
  return Boolean(value && ["queued", "in_progress", "waiting", "requested"].includes(value.status));
}
const eventIcon = { commit: GitCommitHorizontal, pull_request: GitPullRequest, ci: Workflow, release_control: Server };

function Beacon({ active, warning = false }: { active: boolean; warning?: boolean }) {
  return <span className={styles.beacon + (active ? " " + (warning ? styles.beaconAlert : styles.beaconActive) : "")} aria-hidden="true" />;
}
function Gauge({ label, value, detail, variant }: {
  label: string; value: number | null; detail: string; variant?: "cyan" | "amber";
}) {
  const amount = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className={styles.gauge}>
    <div className={styles.gaugeRing} style={{ background: `conic-gradient(${variant === "amber" ? "#e8b65d" : "#77e1f2"} ${amount}%,rgba(101,134,154,.16) ${amount}% 100%)` }}>
      <div className={styles.gaugeCenter}><strong>{value === null ? "—" : amount}</strong><small>/100</small></div>
    </div>
    <div><b>{label}</b><span>{detail}</span></div>
  </div>;
}
function Section({ label, title, note, children }: {
  label: string; title: string; note: string; children: ReactNode;
}) {
  return <section className={styles.section}><header className={styles.sectionHeader}>
    <div><span className={styles.eyebrow}>{label}</span><h2>{title}</h2></div><span className={styles.sectionNote}>{note}</span>
  </header>{children}</section>;
}

export default function Aoe2warOsDeck({ initial }: { initial: OsPublicSnapshot }) {
  const [data, setData] = useState(initial);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<"all" | OsEvent["kind"]>("all");
  const [atlasFilter, setAtlasFilter] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const reply = await fetch("/api/aoe2war-os", { cache: "no-store", signal });
      if (!reply.ok) throw new Error("unavailable");
      const next: OsPublicSnapshot = await reply.json();
      if (next.schema !== 1 || !Array.isArray(next.events)) throw new Error("invalid");
      if (signal?.aborted) return;
      setData(next); setOffline(false);
    } catch { if (!signal?.aborted) setOffline(true); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const poll = () => {
      if (document.hidden || pending) return;
      pending = true;
      void refresh(controller.signal).finally(() => { pending = false; });
    };
    const timer = window.setInterval(poll, 45_000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); controller.abort(); };
  }, [refresh]);
  const b = data.sourceBaseline;
  const ciRunning = isRunning(data.github.workflow);
  const activeDeploy = data.release.deploying && !offline;
  const sourceGap = Boolean(data.release.sha && data.github.latestCommitSha &&
    !data.github.latestCommitSha.startsWith(data.release.sha) &&
    !data.release.sha.startsWith(data.github.latestCommitSha));
  const events = useMemo(() => data.events.filter(event => filter === "all" || event.kind === filter), [data.events, filter]);
  const agents = data.agentCounts;
  const atlas = useMemo(() => modelAtlas.models.filter(item => item.toLowerCase().includes(atlasFilter.toLowerCase())), [atlasFilter]);
  const pythonPercent = Math.round(1000 * b.pythonPassed / (b.pythonPassed + b.pythonSkipped)) / 10;
  return <main className={styles.page}>
    <SpeedReadyMarker route="/aoe2war-os" />
    <div className={styles.mesh} aria-hidden="true" />
    <div className={styles.shell}>
      <div className={styles.systemLine}>
        <span><Beacon active={!offline && data.release.evidence === "verified"} /> AO E II // KINGDOM OPERATING GRID</span>
        <span>PUBLIC READ-ONLY TELEMETRY <span className={styles.separator}>/</span> {dateUtc(data.observedAt)}</span>
      </div>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.tag}><Radio size={13}/> THE MACHINE BEHIND THE KINGDOM</div>
          <h1><span>AOE2WAR</span><em>OS</em></h1>
          <p>ONE KINGDOM. A THOUSAND MOVING PARTS.</p>
          <div className={styles.statusRail} aria-live="polite">
            <div className={activeDeploy ? styles.statusAlert : styles.statusCell}>
              <Beacon active={activeDeploy} warning={activeDeploy}/>
              <span>{activeDeploy ? "RELEASE CONTROL ACTIVE" : "RELEASE CONTROL"}</span>
              <strong>{activeDeploy ? data.release.releaseAction?.toUpperCase() + " / " + data.release.releaseStatus?.toUpperCase() : "NO VERIFIED ACTIVE DEPLOY"}</strong>
            </div>
            <div className={ciRunning ? styles.statusRunning : styles.statusCell}>
              <Beacon active={ciRunning}/><span>GITHUB BUILD</span>
              <strong>{offline ? "SIGNAL INTERRUPTED" : data.github.workflow ? (ciRunning ? "IN PROGRESS" : data.github.workflow.conclusion?.toUpperCase() ?? "UNKNOWN") : "NO SIGNAL"}</strong>
            </div>
            <div className={styles.statusCell}><Beacon active={!offline && data.github.connected}/><span>GIT SIGNAL</span><strong>{offline ? "LINK INTERRUPTED" : data.github.connected ? "CONNECTED" : "UNKNOWN"}</strong></div>
          </div>
        </div>
        <div className={styles.reactor} aria-label="AoE2WAR operational signal reactor">
          <div className={styles.orbitA}/><div className={styles.orbitB}/><div className={styles.orbitC}/>
          <div className={styles.reactorCore}><Cpu size={36} strokeWidth={1.2}/><strong>WAR / OS</strong><span>{activeDeploy ? "RELEASE SEQUENCE" : ciRunning ? "CI ACTIVE" : "OBSERVING"}</span></div>
          <div className={styles.radialBeam}/><span className={styles.reactorCaption}>LIVE SIGNALS <b>{!offline && data.github.connected ? "●" : "○"}</b> / SOURCE-BOUND</span>
        </div>
      </section>

      <div className={styles.liveCards}>
        <div><span>VERIFIED PRODUCTION SOURCE</span><strong className={styles.mono}>{short(data.release.sha)}</strong><small>{data.release.evidence === "verified" ? "INSPECTION AUTHORITY" : "SOURCE UNKNOWN"}</small></div>
        <div><span>LIVE BUILD GENERATION</span><strong className={styles.mono}>{data.release.buildVersion?.slice(0, 21) ?? "—"}</strong><small>NOT THE GIT BRANCH HEAD</small></div>
        <div><span>LATEST GITHUB COMMIT</span><strong className={styles.mono}>{short(data.github.latestCommitSha)}</strong><small>{sourceGap ? "SOURCE / LIVE MAY DIFFER" : "GIT SOURCE · NOT A DEPLOY"}</small></div>
        <div><span>LAST VERIFIED DEPLOY TIME</span><strong>{age(data.release.lastDeployAt)}</strong><small>{data.release.lastDeployAt ? dateUtc(data.release.lastDeployAt) : "AWAITING CERTIFIED TIMESTAMP"}</small></div>
      </div>
      {activeDeploy && <div className={styles.alertBar} role="status"><Beacon active warning /> RELEASE CONTROL IS ACTIVE — DEPLOYMENT IS NOT CERTIFIED UNTIL FINISH PROOF <Beacon active warning /></div>}
      <div className={styles.pair}>
        <section className={styles.console}>
          <header><span><Activity size={16}/> ENGINEERING ACTIVITY</span><span className={styles.faint}>LATEST SOURCE EVENTS · 45S VIEWPORT REFRESH</span></header>
          <div className={styles.filters}>
            {(["all", "commit", "pull_request", "ci", "release_control"] as const).map(key => <button type="button" key={key} aria-pressed={filter === key} className={filter === key ? styles.activeFilter : ""} onClick={() => setFilter(key)}>{({ all: "ALL", commit: "COMMITS", pull_request: "PRs", ci: "BUILDS", release_control: "DEPLOYS" })[key]}</button>)}
            <button type="button" className={styles.refresh} onClick={() => void refresh()} title="Refresh evidence"><RefreshCw size={14}/></button>
          </div>
          <div className={styles.eventList} aria-live="polite">
            {events.length ? events.slice(0, 12).map(event => {
              const Icon = eventIcon[event.kind];
              const content = <><span className={styles.eventIcon}><Icon size={15}/></span><span className={styles.eventDetail}><b>{event.title}</b><small>{event.detail}</small></span><time>{age(event.at)}</time>{event.url && <ArrowUpRight size={14}/>}</>;
              return event.url ? <a key={event.id} className={styles.event + " " + styles[event.state]} href={event.url} target="_blank" rel="noopener noreferrer">{content}</a> : <div key={event.id} className={styles.event + " " + styles[event.state]}>{content}</div>;
            }) : <div className={styles.empty}>NO VERIFIED EVENTS FROM THIS SOURCE</div>}
          </div>
        </section>
        <div className={styles.readinessStack}>
          <section className={styles.scoreCard}><header><ShieldCheck size={17}/> READINESS SIGNAL <small>LIVE INSPECTIONS</small></header>
            <Gauge label="GENERAL INSPECTIONS" value={data.inspections.score} detail={data.release.evidence === "verified" ? "CURRENT RUNTIME PROJECTION" : "RUNTIME SOURCE UNAVAILABLE"} variant="amber"/>
            <div className={styles.barList}>{data.inspections.categories.map(c => <div key={c.name}><span>{c.name}</span><strong>{c.score}/100</strong><div className={styles.bar}><i style={{width: `${c.score}%`}} className={c.state === "red" ? styles.redBar : c.state === "amber" ? styles.goldBar : ""}/></div></div>)}</div>
            {!data.inspections.categories.length && <div className={styles.empty}>NO CURRENT INSPECTION EVIDENCE</div>}
          </section>
          <section className={styles.agentSummary}><header><BrainCircuit size={17}/> AGENT CONSTELLATION</header>
            <div className={styles.agentCounters}>{([["healthy",agents.healthy],["working",agents.working],["watch",agents.watch],["blocked",agents.blocked],["unknown",agents.unknown]] as const).map(([label,count]) => <div key={label}><strong>{count}</strong><span>{label.toUpperCase()}</span></div>)}</div>
            <Link href="/kingdom-agents">EXPLORE AGENT GRID <ArrowUpRight size={14}/></Link>
          </section>
        </div>
      </div>
      <Section label="01 // THE CODE FORGE" title="THE ENGINEERING ESTATE" note={`CODE HEALTH CENSUS · ${dateUtc(b.capturedAt)}`}>
        <div className={styles.metrics}>{[
          ["SOURCE FILES",b.sourceFiles,Code2],["LINES OF SOURCE",b.sourceLines,Activity],
          ["ANALYZED MODULES",b.modules,Cpu],["DEPENDENCY EDGES",b.dependencies,Network],
          ["API ROUTES",b.apiRoutes,Workflow],["HTTP HANDLERS",b.handlers,Zap],
          ["PRISMA MODELS",b.prismaModels,Database],["SCHEMA MIGRATIONS",b.prismaMigrations,HardDrive]
        ].map(([label,value,Icon]) => {const MetricIcon = Icon as typeof Cpu;return <div className={styles.metric} key={String(label)}><MetricIcon size={18}/><span>{label as string}</span><strong>{number(value as number)}</strong></div>;})}</div>
      </Section>
      <Section label="02 // VERIFICATION FORGE" title="THE TEST ARMORY" note="LAST CAPTURED HOSTED CERTIFICATES · NOT LIVE TEST EXECUTION">
        <div className={styles.testDeck}>
          <div className={styles.testHero}><TestTube2 size={26}/><span>PYTHON CONTRACTS</span><strong>{number(b.pythonPassed)}</strong><small>PASSED · SOURCE-BOUND</small><div className={styles.progress}><i style={{width: pythonPercent + "%"}}/></div><footer>{pythonPercent}% PASS OF EXECUTED + SKIPPED <b>{b.pythonSkipped} SKIPPED</b></footer></div>
          <div className={styles.testHero}><ShieldCheck size={26}/><span>WATCHER CONTRACTS</span><strong>{number(b.watcherPassed)}</strong><small>PASSED · CERTIFIED WATCHER MAIN</small><div className={styles.progress}><i style={{width:"100%"}}/></div><footer>0 REPORTED FAILURES <b>LAST CAPTURED RUN</b></footer></div>
          <div className={styles.testHero}><CheckCircle2 size={26}/><span>DOCUMENTATION REGISTRY</span><strong>{number(b.documents)}</strong><small>OWNED DOCUMENTS</small><div className={styles.progress}><i style={{width:"100%"}}/></div><footer>SOURCE-BOUND INDEX <b>PROOF, NOT SCORE</b></footer></div>
        </div>
        <div className={styles.ciStrip}><GitBranch size={18}/><div><b>{data.github.workflow?.name ?? "GITHUB CI UNAVAILABLE"}</b><span>{data.github.workflow ? dateUtc(data.github.workflow.at) : "NO RECENT WORKFLOW RECEIPT"}</span></div><strong>{data.github.workflow ? (ciRunning ? "RUNNING" : data.github.workflow.conclusion?.toUpperCase() ?? "UNKNOWN") : "UNKNOWN"}</strong>{data.github.workflow && <a href={data.github.workflow.url} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={16}/></a>}</div>
      </Section>
      <Section label="03 // DEPENDENCY ORBIT" title="THE MODULE GALAXY" note="LEXICAL GRAPH · TYPE-ONLY EDGES EXCLUDED FROM RUNTIME">
        <div className={styles.networkBox}>
          <div className={styles.orbitDiagram}><div className={styles.orbitRingA}/><div className={styles.orbitRingB}/><div className={styles.orbitRingC}/><div className={styles.orbitInner}><Network size={27}/><strong>{number(b.dependencies)}</strong><span>EDGES</span></div></div>
          <div className={styles.dependencyData}>
            <div><span>RUNTIME EDGES</span><strong>{number(b.runtimeEdges)}</strong><div className={styles.progress}><i style={{width: b.runtimeEdges / b.dependencies * 100 + "%"}}/></div></div>
            <div><span>TYPE-ONLY EDGES</span><strong>{number(b.typeEdges)}</strong><div className={styles.progress}><i style={{width: b.typeEdges / b.dependencies * 100 + "%"}}/></div></div>
            <div className={styles.cycleTiles}><div><strong>{b.runtimeCycles}</strong><span>RUNTIME CYCLE GROUPS</span></div><div><strong>{b.typeCycles}</strong><span>TYPE-AUGMENTED GROUPS</span></div><div><strong>{b.clientServerViolations}</strong><span>LEXICAL CLIENT / SERVER LEAKS</span></div></div>
          </div>
        </div>
      </Section>
      <Section label="04 // DATA CITADEL" title="THE PRISMA ATLAS" note={`${modelAtlas.models.length} SOURCE MODELS · EXACT SCHEMA ENUMERATION`}>
        <div className={styles.prismaHeader}><Database size={20}/><strong>{b.prismaModels}</strong><span>MODELS</span><strong>{b.prismaMigrations}</strong><span>MIGRATIONS</span><label>FIND MODEL <input value={atlasFilter} onChange={event => setAtlasFilter(event.target.value)} placeholder="Search 193 models…" aria-label="Find a Prisma model"/></label></div>
        <div className={styles.modelGrid}>{atlas.slice(0,193).map(name=><div key={name}><small>{String(modelAtlas.models.indexOf(name)+1).padStart(3,"0")}</small><span>{name}</span></div>)}</div>
        {!atlas.length && <div className={styles.empty}>NO MODEL MATCHES THIS FILTER</div>}
      </Section>
      <Section label="05 // MAINTENANCE DEBT" title="THE REFACTOR RADAR" note="MEASURED SOURCE SHAPE · NOT PROVEN DEFECTS">
        <div className={styles.maintCards}>{[[b.largeModules,"LARGE FILES","≥ 1,500 LINES"],[b.giantModules,"GIANT FILES","≥ 2,500 LINES"],[b.runtimeCycles,"RUNTIME CYCLES","GRAPH GROUPS"],[b.duplicateGroups,"EXACT DUPLICATES","SOURCE GROUPS"]].map(([v,label,unit])=><div key={label}><strong>{v}</strong><span>{label}</span><small>{unit}</small></div>)}</div>
      </Section>
      <footer className={styles.footer}><span>AOE2WAR OS // PROVENANCE FIRST</span><span>BUILD ≠ DEPLOY · UNKNOWN ≠ ZERO · GREEN ≠ PERFECT</span><a href={b.sourceRun} target="_blank" rel="noopener noreferrer">SOURCE CERTIFICATE <ArrowUpRight size={12}/></a></footer>
    </div>
  </main>;
}
