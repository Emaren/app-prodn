"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Activity, ArrowUpRight, BrainCircuit, CircleHelp, Database, GitBranch, Network, RefreshCw, ShieldCheck } from "lucide-react";
import atlas from "@/config/kingdom-brain-authorities.json";
import styles from "./KingdomBrain.module.css";
import {
  BRAIN_REFRESH_INTERVAL_MS, BRAIN_REFRESH_TIMEOUT_MS, brainSettledResult, brainSourceTimeLabel,
  createBrainRefreshCoordinator, isBrainSignalDisplayable, nextBrainSignalExpiryDelay, unavailableBrainSignal,
  type BrainSignalObservation,
} from "./brainSignalPolicy";

type Node = (typeof atlas.nodes)[number];
type IndexSignal = { schema?: number; generatedAt?: string; source?: string; pages?: unknown[]; observed?: number; certified?: number; drifted?: number };
type CensusSignal = { schema?: number; status?: string; source?: string; capturedAt?: string | null; buildVersion?: string | null; counts?: { totalPages?: number; apiHandlers?: number; publicStatic?: number; publicDynamic?: number; publicUtility?: number; admin?: number; sensitiveDynamic?: number } | null };
type PatrolSignal = { schema?: number; generatedAt?: string; registered?: number; assigned?: number; entries?: unknown[]; agentsRunning?: null; policyVersion?: string };
type AgentSignal = { schema?: number; observedAt?: string; releaseSha?: string | null; agents?: unknown[]; sources?: { intelligence?: boolean; inspections?: boolean; intelligenceStale?: boolean; releaseAlignment?: string } };
type Signal<T> = BrainSignalObservation<T>;
const empty = <T,>(): Signal<T> => ({ ...unavailableBrainSignal(), state: "unverified", reason: "timestamp-unknown", data: null, receivedAt: null });
type RefreshResults = [PromiseSettledResult<IndexSignal>, PromiseSettledResult<AgentSignal>, PromiseSettledResult<PatrolSignal>, PromiseSettledResult<CensusSignal>];
const points: Record<string, [number, number]> = {
  git: [110, 100], release: [348, 62], identity: [104, 262], rating: [125, 474],
  replay: [348, 545], finance: [968, 500], satchel: [1000, 318],
  speed: [355, 300], inspections: [765, 95], agents: [800, 497],
  index: [757, 290], workshop: [580, 563], storage: [970, 110],
  intelligence: [563, 280],
};
const safeCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en-CA") : "—";
const time = (value: string | undefined) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "UNVERIFIED";
  return new Date(value).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
};
const read = async <T,>(url: string, validate: (value: T) => boolean, signal: AbortSignal): Promise<T> => {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) throw new Error("Signal unavailable");
  const payload = await response.json() as T;
  if (!validate(payload)) throw new Error("Invalid signal");
  return payload;
};

export default function KingdomBrainClient() {
  const [selected, setSelected] = useState("intelligence");
  const [index, setIndex] = useState<Signal<IndexSignal>>(empty);
  const [agents, setAgents] = useState<Signal<AgentSignal>>(empty);
  const [patrol, setPatrol] = useState<Signal<PatrolSignal>>(empty);
  const [census, setCensus] = useState<Signal<CensusSignal>>(empty);
  const [busy, setBusy] = useState(false);
  const [captureAt, setCaptureAt] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(0);
  const coordinatorRef = useRef<{ refresh(): Promise<void>; cancel(): void; dispose(): void } | null>(null);

  useEffect(() => {
    const coordinator = createBrainRefreshCoordinator<RefreshResults>({
      load: async signal => {
        // Exactly four read-only requests, one bounded refresh generation.
        // The coordinator owns cancellation; a separate timeout controller is
        // needed to abort fetches without issuing another page generation.
        const timerController = new AbortController();
        const abortTimer = () => timerController.abort();
        signal.addEventListener("abort", abortTimer, { once: true });
        const watchdog = window.setTimeout(abortTimer, BRAIN_REFRESH_TIMEOUT_MS);
        try {
          return await Promise.allSettled([
            read<IndexSignal>("/api/kingdom-index", value => value?.schema === 1 && Array.isArray(value.pages), timerController.signal),
            read<AgentSignal>("/api/kingdom-agents", value => value?.schema === 1 && Array.isArray(value.agents), timerController.signal),
            read<PatrolSignal>("/api/kingdom-patrol", value => value?.schema === 1 && Array.isArray(value.entries), timerController.signal),
            read<CensusSignal>("/api/kingdom-route-census", value => value?.schema === 1 && value.status === "verified" && typeof value.counts?.totalPages === "number", timerController.signal),
          ]) as RefreshResults;
        } finally {
          window.clearTimeout(watchdog);
          signal.removeEventListener("abort", abortTimer);
        }
      },
      publish: ([a, b, c, d]) => {
        const now = Date.now();
        const next = [
          brainSettledResult("index", a, now), brainSettledResult("agents", b, now),
          brainSettledResult("patrol", c, now), brainSettledResult("census", d, now),
        ] as const;
        setIndex(next[0]); setAgents(next[1]); setPatrol(next[2]); setCensus(next[3]);
        setClockMs(now);
        setCaptureAt(next.some(item => isBrainSignalDisplayable(item, now)) ? new Date(now).toISOString() : null);
      },
      setBusy,
      failed: () => {
        setIndex({ ...unavailableBrainSignal(), data: null, receivedAt: Date.now() });
        setAgents({ ...unavailableBrainSignal(), data: null, receivedAt: Date.now() });
        setPatrol({ ...unavailableBrainSignal(), data: null, receivedAt: Date.now() });
        setCensus({ ...unavailableBrainSignal(), data: null, receivedAt: Date.now() });
        setCaptureAt(null);
      },
    });
    coordinatorRef.current = coordinator;
    if (document.visibilityState === "visible") void coordinator.refresh();
    const onVisibility = () => {
      setClockMs(Date.now());
      if (document.visibilityState === "visible") void coordinator.refresh();
      else coordinator.cancel();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      setClockMs(Date.now());
      if (document.visibilityState === "visible") void coordinator.refresh();
    }, BRAIN_REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
    };
  }, []);

  // The existing 120-second interval performs network refreshes. This separate
  // one-shot deadline only clears aging local evidence at its exact expiry.
  // No additional fetch, collector or recurring poll is introduced.
  useEffect(() => {
    const signals = [index, agents, patrol, census];
    const delay = nextBrainSignalExpiryDelay(signals, clockMs, Date.now());
    if (delay === null) return;
    const timer = window.setTimeout(() => setClockMs(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [index, agents, patrol, census, clockMs]);

  const chosen: Node = useMemo(() => atlas.nodes.find(node => node.id === selected) ?? atlas.nodes[0], [selected]);
  const incoming = atlas.edges.filter(edge => edge.to === selected);
  const outgoing = atlas.edges.filter(edge => edge.from === selected);
  const connected = new Set([...incoming.map(edge => edge.from), ...outgoing.map(edge => edge.to), selected]);
  // Fresh transport alone never makes a domain authoritative or healthy.
  const indexKnown = isBrainSignalDisplayable(index, clockMs) ? index.data : null;
  const agentsKnown = isBrainSignalDisplayable(agents, clockMs) ? agents.data : null;
  const patrolKnown = isBrainSignalDisplayable(patrol, clockMs) ? patrol.data : null;
  const censusKnown = isBrainSignalDisplayable(census, clockMs) ? census.data : null;
  const sourceStatus = agentsKnown?.sources?.releaseAlignment === "aligned" ? "AGENTS ALIGNED" : "UNVERIFIED";
  const signalRows = [
    ["INDEX", index], ["AGENTS", agents], ["PATROL", patrol], ["CENSUS", census],
  ] as const;

  return (
    <main className={styles.page}>
      <div className={styles.mesh} aria-hidden="true" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}><span className={styles.spark}/> AOE2WAR / SYSTEM ATLAS / 01</div>
          <div className={styles.headerRow}>
            <div>
              <h1>KINGDOM <em>BRAIN</em></h1>
              <div className={styles.subline}><span>AUTHORITY</span><i/><span>PROVENANCE</span><i/><span>DEPENDENCIES</span></div>
            </div>
            <div className={styles.headerActions}>
              <div className={styles.signal}><span className={styles.signalDot}/> {sourceStatus}<small>AGENTS SOURCE ONLY · NOT GLOBAL HEALTH</small></div>
              <button type="button" className={styles.refresh} onClick={() => void coordinatorRef.current?.refresh()} disabled={busy} aria-label="Refresh authority signals"><RefreshCw size={17} className={busy ? styles.spin : ""} /></button>
            </div>
          </div>
        </header>

        <section className={styles.meters} aria-label="Live status summary">
          <div className={styles.meter}><GitBranch size={17}/><strong>{safeCount(censusKnown ? censusKnown.counts?.totalPages : null)}</strong><span>DEPLOYED PAGE TEMPLATES</span></div>
          <div className={styles.meter}><Database size={17}/><strong>{safeCount(censusKnown ? censusKnown.counts?.apiHandlers : null)}</strong><span>DEPLOYED API HANDLERS</span></div>
          <div className={styles.meter}><GitBranch size={17}/><strong>{safeCount(indexKnown ? index.data?.pages?.length : null)}</strong><span>INDEX ROUTES</span></div>
          <div className={styles.meter}><ShieldCheck size={17}/><strong>{safeCount(indexKnown ? index.data?.certified : null)}</strong><span>INDEX-REPORTED CERTIFIED</span></div>
          <div className={styles.meter}><Network size={17}/><strong>{safeCount(patrolKnown ? patrolKnown.assigned : null)}/{safeCount(patrolKnown ? patrolKnown.registered : null)}</strong><span>POLICY ASSIGNMENTS</span></div>
          <div className={styles.meter}><Network size={17}/><strong>{safeCount(agentsKnown ? agentsKnown.agents?.length : null)}</strong><span>OBSERVED WATCHPOSTS</span></div>
          <div className={styles.meter}><Activity size={17}/><strong>{captureAt ? time(captureAt) : "—"}</strong><span>LAST FRESH SIGNAL RECEIVED</span></div>
        </section>

        <section className={styles.routeRail} aria-label="Source-specific signal status; graph connections remain declared, not proven healthy" aria-live="polite">
          {signalRows.map(([name, signal]) => (
            <div className={styles.routeClass} key={name}>
              <small>{name}</small>
              <strong style={{ fontSize: 11 }}>{isBrainSignalDisplayable(signal, clockMs) ? signal.state.toUpperCase() : signal.state === "observed" || signal.state === "policy-only" ? "STALE" : signal.state.toUpperCase()}</strong>
              <small title={signal.reason}>{signal.reason.toUpperCase().replaceAll("-", " ")}</small>
              <small title={signal.sourceAt ?? "Source observation timestamp unavailable"} aria-label={signal.sourceAt ? "Source observation at " + signal.sourceAt : "Source observation timestamp unavailable"}>{brainSourceTimeLabel(signal.sourceAt)}</small>
            </div>
          ))}
          <span className={styles.railSource}>OBSERVATION ≠ CERTIFICATION · POLICY ≠ LIVE PATROL</span>
        </section>

        <section className={styles.routeRail} aria-label="Deployed route class inventory">
          {([
            ["STATIC", censusKnown ? censusKnown.counts?.publicStatic : null],
            ["DYNAMIC", censusKnown ? censusKnown.counts?.publicDynamic : null],
            ["UTILITY", censusKnown ? censusKnown.counts?.publicUtility : null],
            ["OPERATOR", censusKnown ? censusKnown.counts?.admin : null],
            ["SENSITIVE", censusKnown ? censusKnown.counts?.sensitiveDynamic : null],
          ] as const).map(([label, count]) => (
            <div key={label} className={styles.routeClass}>
              <small>{label}</small><strong>{safeCount(count)}</strong>
            </div>
          ))}
          <span className={styles.railSource}>DEPLOYED BUILD · {censusKnown ? (censusKnown.buildVersion ?? "UNVERIFIED") : "UNVERIFIED"}</span>
        </section>

        <section className={styles.stage} aria-label="Interactive authority graph">
          <div className={styles.stageHeader}><span><BrainCircuit size={15}/> THE SOURCE CONSTELLATION</span><span>{atlas.nodes.length} DOMAINS · {atlas.edges.length} DECLARED FLOWS · NOT HEALTH SIGNALS</span></div>
          <div className={styles.scroll}>
            <div className={styles.graph}>
              <div className={styles.orbitOne} /><div className={styles.orbitTwo} /><div className={styles.crosshair}/>
              <svg className={styles.wires} viewBox="0 0 1100 620" aria-hidden="true">
                <defs><linearGradient id="kingdomBrainLine" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#61e0dc"/><stop offset="1" stopColor="#c29bff"/></linearGradient></defs>
                {atlas.edges.map(edge => {
                  const a = points[edge.from], b = points[edge.to];
                  if (!a || !b) return null;
                  const active = connected.has(edge.from) && connected.has(edge.to) && (selected === edge.from || selected === edge.to);
                  return <line key={edge.from + "-" + edge.to} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={active ? "url(#kingdomBrainLine)" : "#367286"} strokeOpacity={active ? ".85" : ".21"} strokeWidth={active ? 2.1 : 1} strokeDasharray={active ? undefined : "3 7"}/>;
                })}
              </svg>
              {atlas.nodes.map(node => {
                const p = points[node.id]; if (!p) return null;
                return <button key={node.id} type="button" onClick={() => setSelected(node.id)} className={[styles.node, selected === node.id ? styles.nodeSelected : "", node.id === "intelligence" ? styles.core : "", !connected.has(node.id) ? styles.nodeDim : ""].join(" ")} style={{ "--node-x": p[0] + "px", "--node-y": p[1] + "px" } as CSSProperties} aria-pressed={selected === node.id}>
                  <span className={styles.nodeSymbol}>{node.id === "intelligence" ? <BrainCircuit size={24}/> : node.class === "financial" ? <Database size={17}/> : <span className={styles.nodeGlyph}/>}</span>
                  <span className={styles.nodeLabel}>{node.label}</span>
                  <small>{node.class.toUpperCase()}</small>
                </button>;
              })}
              <span className={styles.graphFoot}>STRUCTURAL GRAPH · LIVE STATES REQUIRE INDEPENDENT RECEIPTS</span>
            </div>
          </div>
        </section>

        <section className={styles.dossier} aria-label="Authority detail">
          <div className={styles.dossierLead}>
            <span className={styles.dossierKicker}>SELECTED AUTHORITY / {chosen.id.toUpperCase()}</span>
            <h2>{chosen.label}</h2>
            <span className={styles.authorityClass}>{chosen.class.toUpperCase()}</span>
          </div>
          <div className={styles.dossierData}>
            <div><small>OWNER</small><strong>{chosen.owner}</strong></div>
            <div><small>AUTHORITY</small><span>{chosen.authority}</span></div>
            <div><small>REQUIRED PROOF</small><span>{chosen.evidence}</span></div>
          </div>
          <div className={styles.connections}>
            <div><small>INBOUND / {incoming.length}</small><div className={styles.chips}>{incoming.length ? incoming.map(edge => <button key={edge.from} onClick={() => setSelected(edge.from)}>{edge.from.toUpperCase()} <span>→ {edge.relation}</span></button>) : <span className={styles.empty}>NONE DECLARED</span>}</div></div>
            <div><small>OUTBOUND / {outgoing.length}</small><div className={styles.chips}>{outgoing.length ? outgoing.map(edge => <button key={edge.to} onClick={() => setSelected(edge.to)}>{edge.to.toUpperCase()} <span>→ {edge.relation}</span></button>) : <span className={styles.empty}>NONE DECLARED</span>}</div></div>
          </div>
          <Link className={styles.open} href={chosen.publicPath}>OPEN AUTHORITY <ArrowUpRight size={15}/></Link>
        </section>

        <footer className={styles.footer}>
          <span><CircleHelp size={13}/> SOURCE MAP = DECLARED CONTRACT · SIGNALS = OBSERVED EVIDENCE</span>
          <nav aria-label="Companion consoles"><Link href="/kingdom-intelligence">INTELLIGENCE</Link><Link href="/kingdom-index">INDEX</Link><Link href="/kingdom-agents">AGENTS</Link><Link href="/general-inspections">INSPECTIONS</Link></nav>
        </footer>
      </div>
    </main>
  );
}
