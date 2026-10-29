"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, CircleHelp, GitBranch, RadioTower, RefreshCw, Shield, Timer, ArrowDownWideNarrow, ArrowUpWideNarrow, Clock3 } from "lucide-react";
import projects from "@/config/kingdom-progress-projects.json";
import styles from "./KingdomProgress.module.css";
import { sortProgressEntries, type ProgressSort, type PublicProgressEntry } from "@/lib/kingdomProgressProjection";

type Intelligence = { available?: boolean; stale?: boolean; generatedAt?: string | null; source?: { productionRelease?: string } | null };
const palettes = ["cyan", "amber", "violet", "rose", "green"] as const;
const labels = ["CLIENT / RELEASE", "FINANCE / EXECUTION", "MEDIA / STREAM", "REPLAY / MACHINERY", "REPLAY / CERTAINTY"];
function clock(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function KingdomProgressClient() {
  const [focus, setFocus] = useState<string | null>(projects.projects[0]?.id ?? null);
  const [signal, setSignal] = useState<Intelligence | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"waiting" | "ok" | "failed">("waiting");
  const [progressState, setProgressState] = useState<"FRESH" | "STALE" | "UNKNOWN">("UNKNOWN");
  const [live, setLive] = useState<PublicProgressEntry[]>([]);
  const [sort, setSort] = useState<ProgressSort>("recent");
  const generation = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const sequence = ++generation.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const request = { cache: "no-store" as const, signal: controller.signal, credentials: "same-origin" as const };
    try {
      // Both existing read-only sources share the original 120-second visible-only cadence.
      const [intelligence, progress] = await Promise.allSettled([
        fetch("/api/kingdom-intelligence", request).then(async response => {
          if (!response.ok) throw new Error("Unavailable");
          const data = await response.json() as Intelligence;
          if (typeof data.available !== "boolean") throw new Error("Invalid intelligence");
          return data;
        }),
        fetch("/api/kingdom-progress", request).then(async response => {
          if (!response.ok) throw new Error("Unavailable");
          const data: unknown = await response.json();
          if (!data || typeof data !== "object" || !("schema" in data) ||
              data.schema !== 1 || !("status" in data) ||
              !["FRESH", "STALE", "UNKNOWN"].includes(String(data.status)) ||
              !("entries" in data) || !Array.isArray(data.entries) || data.entries.length > 13) {
            throw new Error("Invalid progress feed");
          }
          return data as { status: "FRESH" | "STALE" | "UNKNOWN"; entries: PublicProgressEntry[] };
        })
      ]);
      if (sequence !== generation.current || controller.signal.aborted) return;
      if (intelligence.status === "fulfilled") {
        setSignal(intelligence.value);
        setLastRead(new Date().toISOString());
        setLoadState("ok");
      } else {
        setSignal(null);
        setLoadState("failed");
      }
      if (progress.status === "fulfilled") {
        setLive(progress.value.entries.filter(entry =>
          entry && typeof entry.id === "string" &&
          (projects.projects.some(project => project.id === entry.id) || /^Q(?:0[1-9]|1[0-9]|2[0-9])$/.test(entry.id)) &&
          typeof entry.label === "string" && entry.label.length <= 48 &&
          Array.isArray(entry.milestones) && entry.milestones.length <= 8 &&
          (entry.percent === null || (typeof entry.percent === "number" &&
            Number.isFinite(entry.percent) && entry.percent >= 0 && entry.percent <= 100))
        ));
        setProgressState(progress.value.status);
      } else {
        setProgressState(previous => previous === "FRESH" ? "STALE" : "UNKNOWN");
      }
    } finally {
      window.clearTimeout(timeout);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 120000);
    return () => { generation.current++; inFlight.current?.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const sourceCurrent = Boolean(loadState === "ok" && signal?.available && !signal.stale);
  const originalOrder = projects.projects.map(project => project.id);
  const projected = new Map(live.map(entry => [entry.id, entry]));
  const originals = projects.projects.map((project, index) => {
    const approved = projected.get(project.id);
    const fallback: PublicProgressEntry = {
      id: project.id, label: project.label, category: project.category, source: project.source,
      href: project.href, scopeVersion: projects.version,
      milestones: project.milestones.map(id => ({ id, label: id.replaceAll("-", " "), verified: false })),
      verifiedCount: null, percent: null, lastWorkedAt: null, evidenceStatus: "UNKNOWN"
    };
    // Immutable original display names, routes and campaign positions are never overridden.
    return { ...(approved ?? fallback), id: project.id, label: project.label,
      source: project.source, href: project.href, originalIndex: index };
  });
  const additions = live.filter(entry => /^Q\d{2}$/.test(entry.id) && !originalOrder.includes(entry.id))
    .map((entry, index) => ({ ...entry, originalIndex: projects.projects.length + index }));
  const ordered = sortProgressEntries([...originals, ...additions], sort, originalOrder);
  const complete = ordered.filter(p => p.percent !== null);
  const labelsByCategory: Record<string, string> = {
    client: "CLIENT / RELEASE", financial: "FINANCE / EXECUTION", media: "MEDIA / STREAM",
    replay: "REPLAY / CERTAINTY", platform: "KINGDOM / PLATFORM", experience: "KINGDOM / EXPERIENCE"
  };
  return (
    <main className={styles.page}>
      <div className={styles.aurora} aria-hidden="true"/>
      <div className={styles.shell}>
        <header className={styles.heading}>
          <span className={styles.kicker}><span className={styles.dot}/> AOE2WAR / ENGINEERING CHRONICLE / 02</span>
          <div className={styles.headline}>
            <div><h1>KINGDOM <em>PROGRESS</em></h1><div className={styles.subline}><span>THE GREAT WORK</span><b/> <span>PROOF OVER PROMISES</span></div></div>
            <div className={styles.headingControls}>
              <div className={styles.sortControls} role="group" aria-label="Sort campaigns">
                <button type="button" className={[styles.sortButton, sort === "most" ? styles.sortActive : ""].join(" ")} aria-label="Sort most verified complete first" title="Most verified complete" aria-pressed={sort === "most"} onClick={() => setSort("most")}><ArrowDownWideNarrow size={17}/></button>
                <button type="button" className={[styles.sortButton, sort === "least" ? styles.sortActive : ""].join(" ")} aria-label="Sort least verified complete first" title="Least verified complete" aria-pressed={sort === "least"} onClick={() => setSort("least")}><ArrowUpWideNarrow size={17}/></button>
                <button type="button" className={[styles.sortButton, sort === "recent" ? styles.sortActive : ""].join(" ")} aria-label="Sort latest verified code contribution first" title="Latest code contribution" aria-pressed={sort === "recent"} onClick={() => setSort("recent")}><Clock3 size={17}/></button>
              </div>
              <button type="button" aria-label="Refresh engineering source signal" className={styles.refresh} onClick={() => void refresh()}><RefreshCw size={16}/></button>
            </div>
          </div>
        </header>
        <div className={styles.telemetry}>
          <div><GitBranch size={17}/><strong>{ordered.length.toString().padStart(2,"0")}</strong><small>REGISTERED CAMPAIGNS</small></div>
          <div><Shield size={17}/><strong>{complete.length ? String(complete.length).padStart(2,"0") : "—"}</strong><small>VERIFIED CAMPAIGNS</small></div>
          <div><RadioTower size={17}/><strong>{sourceCurrent ? "PRESENT" : "UNKNOWN"}</strong><small>INTELLIGENCE SIGNAL</small></div>
          <div><Timer size={17}/><strong>{sourceCurrent ? clock(signal?.generatedAt) : "—"}</strong><small>SOURCE OBSERVATION</small></div>
        </div>
        <section className={styles.stack} aria-label="Project progress capsules">
          {ordered.map((project, i) => {
            const expanded = focus === project.id;
            return <article key={project.id} data-campaign-id={project.id} className={[styles.capsule, styles[palettes[project.originalIndex % palettes.length]], expanded ? styles.expanded : ""].join(" ")}>
              <button type="button" className={styles.pill} aria-expanded={expanded} onClick={() => setFocus(expanded ? null : project.id)}>
                <span className={styles.glass} aria-hidden="true"/>
                <span className={styles.flare} aria-hidden="true"/>
                <span className={styles.number}>{String(i+1).padStart(2,"0")}</span>
                <span className={styles.identity}><span className={styles.kind}>{labelsByCategory[project.category] ?? labels[i % labels.length]}</span><strong>{project.label}</strong><span className={styles.source}>SOURCE / {project.source.toUpperCase()} · {project.lastWorkedAt ? "CODE " + clock(project.lastWorkedAt) : "CODE UNKNOWN"}</span></span>
                <span className={styles.meterSlot}><span className={styles.unknown}><span className={styles.unknownGlyph}>{project.percent === null ? "◇" : "◆"}</span> {project.percent === null ? "MILESTONE EVIDENCE PENDING" : `${project.verifiedCount}/${project.milestones.length} VERIFIED GATES`}</span><span className={styles.track} style={{ gridTemplateColumns: `repeat(${project.milestones.length},1fr)` }} aria-hidden="true">{project.milestones.map(m => <span key={m.id} className={[styles.tick, m.verified ? styles.tickVerified : ""].join(" ")} />)}</span></span>
                <span className={styles.percentage}>{project.percent === null ? "—" : `${project.percent}%`}<small>VERIFIED %</small></span>
                <ChevronDown className={expanded ? styles.rotate : ""} size={17}/>
              </button>
              {expanded && <div className={styles.detail}>
                <div className={styles.detailTitle}>RELEASE GATES <span>{project.milestones.length} DEFINED · {project.verifiedCount ?? "UNKNOWN"} ACCEPTED</span></div>
                <div className={styles.milestones}>{project.milestones.map((milestone, n) => <div key={milestone.id} className={styles.milestone}><span>{String(n+1).padStart(2,"0")}</span><b>{milestone.label.toUpperCase()}</b><i>{milestone.verified ? "VERIFIED" : "UNVERIFIED"}</i></div>)}</div>
                <div className={styles.detailsFoot}><span>{project.percent === null ? "NO ACCEPTED SOURCE RECEIPT · COMPLETION UNKNOWN" : `SCOPE ${project.scopeVersion} · SOURCE GATES ONLY`}</span><Link href={project.href}>VIEW SOURCE <ArrowUpRight size={14}/></Link></div>
              </div>}
            </article>;
          })}
        </section>
        <footer className={styles.footer}>
          <div><CircleHelp size={14}/> PROGRESS BARS FILL ONLY WHEN A CERTIFIED, SOURCE-ALIGNED MILESTONE READER IS CONNECTED.</div>
          <nav><Link href="/workshop">WORKSHOP</Link><Link href="/kingdom-brain">BRAIN</Link><Link href="/kingdom-index">INDEX</Link><Link href="/kingdom-agents">AGENTS</Link></nav>
        </footer>
        <div className={styles.evidence}>OBSERVATION RECEIVED {lastRead ? clock(lastRead) : "—"} · {loadState.toUpperCase()} · PUBLIC FEED {progressState} · {sourceCurrent ? "INTELLIGENCE CURRENT" : "INTELLIGENCE UNVERIFIED"}</div>
      </div>
    </main>
  );
}
