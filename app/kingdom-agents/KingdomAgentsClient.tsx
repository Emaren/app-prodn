"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity, ArrowUpRight, BrainCircuit, CheckCircle2,
  Clock3, Eye, GitBranch, HeartPulse, RadioTower,
  Search, ShieldCheck, Swords, Workflow, X,
} from "lucide-react";
import { useUserAuth } from "@/context/UserAuthContext";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import type {
  KingdomAgentPublic,
  KingdomAgentPublicSnapshot,
} from "@/lib/kingdomAgentsPublic";
import type { KingdomAgentState } from "@/lib/kingdomAgentPolicy";
import styles from "./KingdomAgents.module.css";

const stateLabel: Record<KingdomAgentState, string> = {
  working: "WORKING",
  healthy: "CLEAR",
  watch: "WATCH",
  blocked: "BLOCKED",
  unknown: "NO PROOF",
};
const laneShortNames: Record<string, string> = {
  "Website Speed": "VELOCITY", Documentation: "RECORDS",
  "Organization & Storage": "STORAGE", "Test & Build Integrity": "FORGE",
  "Release & Runtime Integrity": "RELEASE",
  "Security & Resilience": "DEFENSE", "Data / Wolo / Replay Integrity": "TRUTH",
};

function formatTime(stamp: string | null) {
  if (!stamp) return "NO TIMESTAMP";
  const date = new Date(stamp);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "NO TIMESTAMP";
}

function stateOf(items: KingdomAgentPublic[]) {
  if (items.some((item) => item.state === "blocked")) return "blocked";
  if (items.some((item) => item.state === "watch")) return "watch";
  if (items.some((item) => item.state === "unknown")) return "unknown";
  if (items.some((item) => item.state === "working")) return "working";
  return items.length > 0 ? "healthy" : "unknown";
}

function Beacon({ state }: { state: KingdomAgentState }) {
  return <span className={styles.beacon + " " + styles[state]} aria-hidden="true" />;
}

export default function KingdomAgentsClient({ initial }: { initial: KingdomAgentPublicSnapshot }) {
  const [data, setData] = useState(initial);
  const [signalLost, setSignalLost] = useState(false);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("ALL");
  const [filter, setFilter] = useState<KingdomAgentState | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const { playerName, isAuthenticated } = useUserAuth();

  const update = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetch("/api/kingdom-agents", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!result.ok) throw new Error("signal unavailable");
      const next = (await result.json()) as KingdomAgentPublicSnapshot;
      if (next.schema !== 1 || !Array.isArray(next.agents)) throw new Error("invalid signal");
      if (signal?.aborted) return;
      setData(next);
      setSignalLost(false);
    } catch {
      if (!signal?.aborted) setSignalLost(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const boundedPoll = () => {
      if (pending || document.hidden) return;
      pending = true;
      void update(controller.signal).finally(() => { pending = false; });
    };
    const interval = window.setInterval(boundedPoll, 45_000);
    document.addEventListener("visibilitychange", boundedPoll);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", boundedPoll);
    };
  }, [update]);

  const command = useMemo(() => data.agents.filter((agent) => agent.kind === "system"), [data.agents]);
  const watchposts = useMemo(() => data.agents.filter((agent) => agent.kind === "inspection"), [data.agents]);
  const lanes = useMemo(() => Array.from(new Set(watchposts.map((agent) => agent.lane))), [watchposts]);
  const tally = useMemo(() => {
    const count = { working: 0, healthy: 0, watch: 0, blocked: 0, unknown: 0 };
    for (const agent of data.agents) count[agent.state]++;
    return count;
  }, [data.agents]);
  const shown = useMemo(() => data.agents.filter((agent) =>
    (lane === "ALL" || agent.lane === lane) &&
    (filter === "all" || agent.state === filter) &&
    (query.trim() === "" || (agent.name + " " + agent.lane + " " + agent.task).toLowerCase().includes(query.trim().toLowerCase()))
  ), [data.agents, lane, filter, query]);
  const focus = data.agents.find((agent) => agent.id === selected) ?? null;
  const noSources = !data.sources.inspections && !data.sources.intelligence;
  const lost = signalLost || noSources || data.sources.intelligenceStale || data.sources.releaseAlignment !== "aligned";
  const scan = data.agents.slice(0, 48);
  const summary = data.directive?.title ?? (
    tally.blocked ? "A verified gate needs attention." :
    tally.watch ? "The watchposts have unfinished business." :
    noSources ? "Awaiting verified control-plane evidence." :
    "The inspection perimeter is holding."
  );

  return (
    <main className={styles.page}>
      <SpeedReadyMarker route="/kingdom-agents" />
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.inner}>
        <section className={styles.hero} aria-labelledby="agents-heading">
          <div className={styles.heroText}>
            <div className={styles.masthead}><span className={styles.ember} /> THE KINGDOM // OPERATIONS INTELLIGENCE <span className={styles.rule} /></div>
            <p className={styles.kicker}>THE SENTINEL NETWORK <span>·</span> LIVE SOURCE PROOFS</p>
            <h1 id="agents-heading">KINGDOM <em>AGENTS</em></h1>
            <p className={styles.heroTag}>A thousand duties. One command.</p>
            <div className={styles.heroPills}>
              <span className={lost ? styles.signalWarn : styles.signalGood}>
                <Beacon state={lost ? "watch" : "healthy"} />
                {signalLost ? "LINK INTERRUPTED" : noSources ? "SIGNAL ABSENT" : data.sources.intelligenceStale ? "INTELLIGENCE STALE" : data.sources.releaseAlignment === "mismatch" ? "SOURCE DRIFT" : data.sources.releaseAlignment === "unknown" ? "RELEASE UNVERIFIED" : "TELEMETRY CONNECTED"}
              </span>
              <span>PROVENANCE · {data.releaseSha ?? "UNVERIFIED"}</span>
            </div>
            <div className={styles.salutation}>
              {isAuthenticated && playerName ? "COMMAND RECOGNIZED // " + playerName : "WELCOME TO THE WATCH"}
              <span> — {formatTime(data.observedAt)}</span>
            </div>
          </div>
          <div className={styles.engine}>
            <div className={styles.engineGrid} aria-hidden="true" />
            <div className={styles.outerRing} aria-hidden="true" />
            <div className={styles.midRing} aria-hidden="true" />
            <div className={styles.innerRing} aria-hidden="true" />
            <div className={styles.sweep} aria-hidden="true" />
            {scan.map((agent, index) => {
              const angle = (index / Math.max(1, scan.length)) * Math.PI * 2 - Math.PI / 2;
              const radius = 30 + (index % 3) * 6;
              const position: CSSProperties = {
                left: (50 + Math.cos(angle) * radius) + "%",
                top: (50 + Math.sin(angle) * radius) + "%",
              };
              return <span key={agent.id} className={styles.node + " " + styles[agent.state]} style={position} title={agent.name} />;
            })}
            <div className={styles.core}>
              <BrainCircuit size={31} strokeWidth={1.3} aria-hidden="true" />
              <strong>SHEPHERD</strong>
              <small>OBSERVE · RECONCILE</small>
            </div>
            <span className={styles.orbitNote + " " + styles.orbitLeft}>SYSTEMS / {command.length}</span>
            <span className={styles.orbitNote + " " + styles.orbitRight}>WATCHPOSTS / {watchposts.length}</span>
          </div>
        </section>

        <section className={styles.metrics} aria-label="Network evidence">
          <div><small>REGISTERED SIGNALS</small><strong>{data.agents.length}</strong><span>Source-derived, not simulated</span></div>
          <div><small>CLEAR</small><strong className={styles.greenText}>{tally.healthy}</strong><span>Passing evidence</span></div>
          <div><small>IN MOTION</small><strong className={styles.cyanText}>{tally.working}</strong><span>Verified active process</span></div>
          <div><small>REQUIRE ATTENTION</small><strong className={styles.goldText}>{tally.watch + tally.blocked}</strong><span>{tally.blocked} blocked · {tally.watch} watch</span></div>
          <div><small>SIGNAL UNKNOWN</small><strong>{tally.unknown}</strong><span>Never counted as green</span></div>
        </section>

        <div className={styles.twoColumn}>
          <section className={styles.chamber}>
            <div className={styles.sectionHeading}><span>01 / THE EIGHT OS + DOCTOR</span><Link href="/kingdom-intelligence">KINGDOM INTELLIGENCE <ArrowUpRight size={12}/></Link></div>
            <div className={styles.commandGrid}>
              {command.length ? command.map((agent) => (
                <button key={agent.id} onClick={() => setSelected(selected === agent.id ? null : agent.id)} className={styles.commandTile + " " + (selected === agent.id ? styles.isSelected : "")} type="button">
                  <div className={styles.commandTop}><Beacon state={agent.state}/><span>{stateLabel[agent.state]}</span><Workflow size={14}/></div>
                  <strong>{agent.name}</strong>
                  <small>{agent.signal}</small>
                </button>
              )) : <div className={styles.empty}>NO CURRENT KINGDOM INTELLIGENCE SYSTEM SIGNAL.</div>}
            </div>
          </section>
          <section className={styles.chamber}>
            <div className={styles.sectionHeading}><span>02 / SHEPHERD&apos;S ORDERS</span><Link href="/general-inspections">GENERAL INSPECTIONS <ArrowUpRight size={12}/></Link></div>
            <div className={styles.directive}>
              <div className={styles.directiveCrest}><Swords size={25} strokeWidth={1.3}/></div>
              <div className={styles.directiveEyebrow}>PRIORITY DIRECTIVE · {data.directive?.level ?? "OBSERVATION"}</div>
              <p>{summary}</p>
              <div className={styles.judges}>
                <div><span>OPERATIONAL DOCTOR</span><strong>{data.doctorScore !== null ? data.doctorScore + "/100" : "—"}</strong></div>
                <div><span>INSPECTION READINESS</span><strong>{data.readinessScore !== null ? data.readinessScore + "/100" : "—"}</strong></div>
              </div>
              <small className={styles.scopeNote}>Distinct standards. A green Doctor does not override failing inspection evidence.</small>
            </div>
            <div className={styles.feedHead}><RadioTower size={14}/> RECENT VERIFIED OPERATIONS <span>{data.activity.length} SIGNALS</span></div>
            <div className={styles.feed}>
              {data.activity.length ? data.activity.slice(0, 6).map((event) => (
                <div key={event.id} className={styles.feedRow}>
                  <Beacon state={["SUCCEEDED", "COMPLETE", "CERTIFIED"].includes(event.status.toUpperCase()) ? "healthy" : ["FAILED", "BLOCKED", "TIMED_OUT"].includes(event.status.toUpperCase()) ? "blocked" : ["RUNNING", "ACTIVE", "CLAIMED"].includes(event.status.toUpperCase()) ? "working" : "unknown"}/>
                  <div><strong>{event.name}</strong><small>{event.system} · {event.status}</small></div>
                  <time dateTime={event.at}>{formatTime(event.at)}</time>
                </div>
              )) : <div className={styles.empty}>No recent operation receipts in the live intelligence feed.</div>}
            </div>
          </section>
        </div>

        <section className={styles.territory}>
          <div className={styles.sectionHeading}><span>03 / THE PATROL GRID</span><span>{watchposts.length} INSPECTION WATCHPOSTS</span></div>
          <div className={styles.lanes}>
            {lanes.map((item, index) => {
              const members = watchposts.filter((agent) => agent.lane === item);
              const state = stateOf(members);
              return <button type="button" onClick={() => { setLane(lane === item ? "ALL" : item); setFilter("all"); }} key={item}
                className={styles.lane + " " + (lane === item ? styles.laneSelected : "")}>
                <span className={styles.laneNumeral}>0{index + 1}</span>
                <span className={styles.laneIcon}>{index % 3 === 0 ? <Activity size={18}/> : index % 3 === 1 ? <GitBranch size={18}/> : <ShieldCheck size={18}/>}</span>
                <strong>{laneShortNames[item] ?? item.toUpperCase()}</strong>
                <span className={styles.laneDetails}><Beacon state={state}/>{members.filter(a => a.state === "healthy").length}/{members.length} CLEAR</span>
              </button>;
            })}
          </div>
        </section>

        <section className={styles.index}>
          <div className={styles.sectionHeading}><span>04 / THE AGENT REGISTER</span><span>READ-ONLY · LIVE EVIDENCE</span></div>
          <div className={styles.controls}>
            <div className={styles.searchBox}><Search size={16}/><input aria-label="Search kingdom agents" placeholder="Search watchposts, duties, systems…" value={query} onChange={event=>setQuery(event.target.value)}/>{query && <button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><X size={14}/></button>}</div>
            <button type="button" className={lane==="ALL"?styles.activeFilter:styles.plainFilter} onClick={()=>setLane("ALL")}>ALL LANES</button>
            {(["all","working","watch","blocked","healthy","unknown"] as const).map(item=><button key={item} type="button" className={filter===item?styles.activeFilter:styles.plainFilter} onClick={()=>setFilter(item)}>{item==="all"?"ALL SIGNALS":item.toUpperCase()}</button>)}
          </div>
          <div className={styles.register}>
            {shown.map((agent) => <button type="button" key={agent.id} onClick={()=>setSelected(selected===agent.id?null:agent.id)} className={styles.agentRow + " " + (selected===agent.id?styles.isSelected:"")}>
              <div className={styles.agentSymbol}>{agent.kind==="system"?<BrainCircuit size={18}/>:<Eye size={18}/>}</div>
              <div className={styles.agentBody}><strong>{agent.name}</strong><small>{agent.lane.toUpperCase()} · {agent.kind==="system"?"SYSTEM AGENT":"EVIDENCE WATCHPOST"}</small></div>
              <span className={styles.agentSignal}>{agent.signal}</span>
              <div className={styles.agentStatus}><Beacon state={agent.state}/><span>{stateLabel[agent.state]}</span></div>
            </button>)}
            {!shown.length && <div className={styles.empty}>No signals match this register filter.</div>}
          </div>
        </section>
        {focus && <div className={styles.detail} role="region" aria-label="Selected agent detail">
          <div><div className={styles.sectionHeading}><span>AGENT DOSSIER / {focus.id}</span><button type="button" aria-label="Close agent dossier" onClick={()=>setSelected(null)}><X size={17}/></button></div>
            <h2><Beacon state={focus.state}/>{focus.name}</h2>
            <p>{focus.task}</p>
          </div>
          <div className={styles.detailRight}><span>{stateLabel[focus.state]} · {focus.signal}</span><small>SOURCE · {focus.source}</small><small>OWNING EVIDENCE · {formatTime(focus.evidenceAt)}</small></div>
        </div>}
        <footer className={styles.footer}>
          <div><HeartPulse size={17}/> KINGDOM SHEPHERD <span>ONE NETWORK · NO DUPLICATE AUTHORITY</span></div>
          <nav><Link href="/kingdom-intelligence">THE MIND</Link><Link href="/general-inspections">THE INSPECTIONS</Link><Link href="/speed">THE SPEED</Link></nav>
        </footer>
        <p className={styles.truthLine}><Clock3 size={12}/> Read-only projections of existing operating receipts and inspection checks. A watchpost is not an autonomous worker. No unverified activity is animated as real execution. <CheckCircle2 size={12}/></p>
      </div>
    </main>
  );
}
