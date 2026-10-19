"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Activity, ArrowUpRight, BrainCircuit, CircleHelp, Database, GitBranch, Network, RefreshCw, ShieldCheck } from "lucide-react";
import atlas from "@/config/kingdom-brain-authorities.json";
import styles from "./KingdomBrain.module.css";

type Node = (typeof atlas.nodes)[number];
type IndexSignal = { schema?: number; generatedAt?: string; pages?: unknown[]; observed?: number; certified?: number; drifted?: number };
type PatrolSignal = { schema?: number; registered?: number; assigned?: number; entries?: unknown[]; agentsRunning?: null; policyVersion?: string };
type AgentSignal = { schema?: number; observedAt?: string; releaseSha?: string | null; agents?: unknown[]; sources?: { intelligence?: boolean; inspections?: boolean; intelligenceStale?: boolean; releaseAlignment?: string } };
type Signal<T> = { state: "unknown" | "current" | "unavailable"; data: T | null; receivedAt: number | null };
const empty = <T,>(): Signal<T> => ({ state: "unknown", data: null, receivedAt: null });
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
  const [busy, setBusy] = useState(false);
  const [captureAt, setCaptureAt] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setBusy(true);
    try {
      const [a, b, c] = await Promise.allSettled([
        read<IndexSignal>("/api/kingdom-index", value => value?.schema === 1 && Array.isArray(value.pages), controller.signal),
        read<AgentSignal>("/api/kingdom-agents", value => value?.schema === 1 && Array.isArray(value.agents), controller.signal),
        read<PatrolSignal>("/api/kingdom-patrol", value => value?.schema === 1 && Array.isArray(value.entries), controller.signal),
      ]);
      const now = Date.now();
      setIndex(a.status === "fulfilled" ? { state: "current", data: a.value, receivedAt: now } : { state: "unavailable", data: null, receivedAt: null });
      setAgents(b.status === "fulfilled" ? { state: "current", data: b.value, receivedAt: now } : { state: "unavailable", data: null, receivedAt: null });
      setPatrol(c.status === "fulfilled" ? { state: "current", data: c.value, receivedAt: now } : { state: "unavailable", data: null, receivedAt: null });
      setCaptureAt(new Date(now).toISOString());
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 120000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(interval); };
  }, [refresh]);

  const chosen: Node = useMemo(() => atlas.nodes.find(node => node.id === selected) ?? atlas.nodes[0], [selected]);
  const incoming = atlas.edges.filter(edge => edge.to === selected);
  const outgoing = atlas.edges.filter(edge => edge.from === selected);
  const connected = new Set([...incoming.map(edge => edge.from), ...outgoing.map(edge => edge.to), selected]);
  const indexKnown = index.state === "current" && index.data;
  const agentsKnown = agents.state === "current" && agents.data;
  const patrolKnown = patrol.state === "current" && patrol.data;
  const agentCurrent = agentsKnown && agentsKnown.sources?.releaseAlignment === "aligned" && !agentsKnown.sources?.intelligenceStale;
  const sourceStatus = !agentsKnown ? "UNKNOWN" : agentCurrent ? "ALIGNED" : "UNVERIFIED";

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
              <div className={styles.signal}><span className={styles.signalDot}/> {sourceStatus}<small>RELEASE ALIGNMENT</small></div>
              <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={busy} aria-label="Refresh authority signals"><RefreshCw size={17} className={busy ? styles.spin : ""} /></button>
            </div>
          </div>
        </header>

        <section className={styles.meters} aria-label="Live status summary">
          <div className={styles.meter}><GitBranch size={17}/><strong>{safeCount(indexKnown ? index.data?.pages?.length : null)}</strong><span>INDEX ROUTES</span></div>
          <div className={styles.meter}><ShieldCheck size={17}/><strong>{safeCount(indexKnown ? index.data?.certified : null)}</strong><span>CERTIFIED</span></div>
          <div className={styles.meter}><Network size={17}/><strong>{safeCount(patrolKnown ? patrolKnown.assigned : null)}/{safeCount(patrolKnown ? patrolKnown.registered : null)}</strong><span>POLICY ASSIGNMENTS</span></div>
          <div className={styles.meter}><Network size={17}/><strong>{safeCount(agentsKnown ? agentsKnown.agents?.length : null)}</strong><span>OBSERVED WATCHPOSTS</span></div>
          <div className={styles.meter}><Activity size={17}/><strong>{captureAt ? time(captureAt) : "—"}</strong><span>LAST SIGNAL RECEIVED</span></div>
        </section>

        <section className={styles.stage} aria-label="Interactive authority graph">
          <div className={styles.stageHeader}><span><BrainCircuit size={15}/> THE SOURCE CONSTELLATION</span><span>{atlas.nodes.length} DOMAINS · {atlas.edges.length} DECLARED FLOWS</span></div>
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
