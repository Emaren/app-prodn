"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, CircleHelp, GitBranch, RadioTower, RefreshCw, Shield, Timer } from "lucide-react";
import projects from "@/config/kingdom-progress-projects.json";
import styles from "./KingdomProgress.module.css";

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
  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/kingdom-intelligence", { cache: "no-store", signal: controller.signal, credentials: "same-origin" });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json() as Intelligence;
      if (typeof data.available !== "boolean") throw new Error("Invalid source");
      setSignal(data);
      setLastRead(new Date().toISOString());
      setLoadState("ok");
    } catch {
      setSignal(null);
      setLoadState("failed");
    } finally { window.clearTimeout(timeout); }
  }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 120000);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const sourceCurrent = Boolean(loadState === "ok" && signal?.available && !signal.stale);
  return (
    <main className={styles.page}>
      <div className={styles.aurora} aria-hidden="true"/>
      <div className={styles.shell}>
        <header className={styles.heading}>
          <span className={styles.kicker}><span className={styles.dot}/> AOE2WAR / ENGINEERING CHRONICLE / 02</span>
          <div className={styles.headline}>
            <div><h1>KINGDOM <em>PROGRESS</em></h1><div className={styles.subline}><span>THE GREAT WORK</span><b/> <span>PROOF OVER PROMISES</span></div></div>
            <button type="button" aria-label="Refresh engineering source signal" className={styles.refresh} onClick={() => void refresh()}><RefreshCw size={16}/></button>
          </div>
        </header>
        <div className={styles.telemetry}>
          <div><GitBranch size={17}/><strong>{projects.projects.length.toString().padStart(2,"0")}</strong><small>REGISTERED CAMPAIGNS</small></div>
          <div><Shield size={17}/><strong>—</strong><small>VERIFIED COMPLETION</small></div>
          <div><RadioTower size={17}/><strong>{sourceCurrent ? "PRESENT" : "UNKNOWN"}</strong><small>INTELLIGENCE SIGNAL</small></div>
          <div><Timer size={17}/><strong>{sourceCurrent ? clock(signal?.generatedAt) : "—"}</strong><small>SOURCE OBSERVATION</small></div>
        </div>
        <section className={styles.stack} aria-label="Project progress capsules">
          {projects.projects.map((project, i) => {
            const expanded = focus === project.id;
            return <article key={project.id} className={[styles.capsule, styles[palettes[i % palettes.length]], expanded ? styles.expanded : ""].join(" ")}>
              <button type="button" className={styles.pill} aria-expanded={expanded} onClick={() => setFocus(expanded ? null : project.id)}>
                <span className={styles.glass} aria-hidden="true"/>
                <span className={styles.flare} aria-hidden="true"/>
                <span className={styles.number}>{String(i+1).padStart(2,"0")}</span>
                <span className={styles.identity}><span className={styles.kind}>{labels[i % labels.length]}</span><strong>{project.label}</strong><span className={styles.source}>SOURCE / {project.source.toUpperCase()}</span></span>
                <span className={styles.meterSlot}><span className={styles.unknown}><span className={styles.unknownGlyph}>◇</span> MILESTONE EVIDENCE PENDING</span><span className={styles.track} aria-hidden="true"><span className={styles.tick} /><span className={styles.tick}/><span className={styles.tick}/><span className={styles.tick}/><span className={styles.tick}/><span className={styles.tick}/></span></span>
                <span className={styles.percentage}>—<small>VERIFIED %</small></span>
                <ChevronDown className={expanded ? styles.rotate : ""} size={17}/>
              </button>
              {expanded && <div className={styles.detail}>
                <div className={styles.detailTitle}>RELEASE GATES <span>{project.milestones.length} DEFINED · 0 ATTESTED IN THIS FEED</span></div>
                <div className={styles.milestones}>{project.milestones.map((milestone, n) => <div key={milestone} className={styles.milestone}><span>{String(n+1).padStart(2,"0")}</span><b>{milestone.replaceAll("-"," ").toUpperCase()}</b><i>UNVERIFIED</i></div>)}</div>
                <div className={styles.detailsFoot}><span>NO EVIDENCE-VERIFIED MILESTONE FEED CONNECTED · NO SYNTHETIC PERCENTAGE</span><Link href={project.href}>VIEW SOURCE <ArrowUpRight size={14}/></Link></div>
              </div>}
            </article>;
          })}
        </section>
        <footer className={styles.footer}>
          <div><CircleHelp size={14}/> PROGRESS BARS FILL ONLY WHEN A CERTIFIED, SOURCE-ALIGNED MILESTONE READER IS CONNECTED.</div>
          <nav><Link href="/workshop">WORKSHOP</Link><Link href="/kingdom-brain">BRAIN</Link><Link href="/kingdom-index">INDEX</Link><Link href="/kingdom-agents">AGENTS</Link></nav>
        </footer>
        <div className={styles.evidence}>OBSERVATION RECEIVED {lastRead ? clock(lastRead) : "—"} · {loadState.toUpperCase()} · {sourceCurrent ? "INTELLIGENCE CURRENT" : "INTELLIGENCE UNVERIFIED"}</div>
      </div>
    </main>
  );
}
