"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowUpRight, Box, ChevronRight,
  Code2, Cpu, FlaskConical, GitBranch, LockKeyhole, PackageCheck,
  Radar, RefreshCw, Rocket, RotateCcw, ShieldCheck, Workflow, Zap,
} from "lucide-react";
import {
  FACTORY_SERVICES, FACTORY_STAGES, FACTORY_TEST_GROUPS,
  readFactoryPublicStatus, unknownFactoryStatus, factoryStageEvidence, factoryHeadroomEvidence,
  type FactoryActivity, type FactoryFeed, type FactoryRelease,
  type FactorySignal, type FactoryStage,
} from "@/lib/factoryPublicStatus";
import css from "./factory.module.css";

const stageSpecs = [
  { id: "develop", name: "SOURCE / BRANCH", icon: Code2 },
  { id: "test", name: "CI / SECURITY", icon: FlaskConical },
  { id: "build", name: "LINUX BUILD", icon: PackageCheck },
  { id: "approve", name: "INDEPENDENT VERIFY", icon: ShieldCheck },
  { id: "deploy", name: "TRANSPORT / STAGING", icon: Rocket },
  { id: "verify", name: "ACTIVATION / HTTPS", icon: Radar },
  { id: "rollback", name: "ROLLBACK / REACTIVATION", icon: RotateCcw },
] as const;

const unknownFeed: FactoryFeed = {
  authority: "unavailable",
  value: unknownFactoryStatus(),
};
type EdgeSignal = { reachable: boolean | null; source: string | null; observedAt: string | null };

const signalWord: Record<FactorySignal, string> = {
  pass: "PASS", running: "RUNNING", hold: "HOLD", fail: "FAIL",
  unknown: "UNKNOWN", pending: "PENDING", stale: "STALE",
};
const shortId = (id: string | null) =>
  id ? (id.length > 18 ? id.slice(0, 11) + "…" + id.slice(-6) : id) : "— — — —";
const localTime = (value: string | null) => {
  if (!value) return "NO RECEIPT";
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "NO RECEIPT";
};

function SignalDot({ signal, small = false }: { signal: FactorySignal; small?: boolean }) {
  return <span className={small ? css.signalDotSmall : css.signalDot} data-signal={signal} aria-hidden="true" />;
}

function ReleaseCard({
  mode, label, release, edge,
}: {
  mode: "live" | "candidate" | "rollback";
  label: string;
  release: FactoryRelease;
  edge: EdgeSignal;
}) {
  const isEdge = mode === "live" && edge.reachable === true && !release.id;
  const observed = isEdge ? edge.source : null;
  return (
    <div className={css.releaseCard} data-kind={mode} data-signal={release.status}>
      <div className={css.releaseTop}>
        <span className={css.releaseTag}><SignalDot signal={release.status} small />{label}</span>
        {mode === "live" ? <Activity size={15} aria-hidden /> :
          mode === "candidate" ? <GitBranch size={15} aria-hidden /> : <RotateCcw size={15} aria-hidden />}
      </div>
      <div className={css.releaseId} title={release.id || observed || "No verified release identifier"}>
        {shortId(release.id || observed)}
      </div>
      <div className={css.releaseFoot}>
        <span>{isEdge ? "EDGE HEADER OBSERVED" : signalWord[release.status]}</span>
        <span>{release.verifiedAt ? localTime(release.verifiedAt) :
          isEdge ? localTime(edge.observedAt) : "NO RECEIPT"}</span>
      </div>
    </div>
  );
}

function CoreDiagram({ status }: { status: FactoryFeed }) {
  const active = status.value.pipelineStage.active;
  const live = status.value.liveRelease.id;
  return (
    <div className={css.coreStage} aria-label="The factory's visual release engine; the center reports only published pipeline data">
      <div className={css.coreGlass}>
        <svg viewBox="0 0 660 445" className={css.coreSvg} aria-hidden="true">
          <defs>
            <linearGradient id="factoryBeam" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#4be4ff" stopOpacity=".85" />
              <stop offset="55%" stopColor="#6578ff" stopOpacity=".65" />
              <stop offset="100%" stopColor="#cf83ff" stopOpacity=".85" />
            </linearGradient>
            <radialGradient id="factoryCore">
              <stop offset="0" stopColor="#69eaff" stopOpacity=".32" />
              <stop offset=".6" stopColor="#3a65dc" stopOpacity=".11" />
              <stop offset="1" stopColor="#1431aa" stopOpacity="0" />
            </radialGradient>
            <pattern id="factoryGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M30 0H0V30" fill="none" stroke="#7ea6e8" strokeOpacity=".07" strokeWidth=".7" />
            </pattern>
          </defs>
          <rect width="660" height="445" fill="url(#factoryGrid)" />
          <ellipse cx="328" cy="222" rx="256" ry="177" fill="url(#factoryCore)" />
          <g fill="none" stroke="url(#factoryBeam)" strokeWidth="1">
            <ellipse cx="328" cy="222" rx="196" ry="157" strokeOpacity=".15" />
            <ellipse cx="328" cy="222" rx="163" ry="131" strokeOpacity=".26" />
            <ellipse cx="328" cy="222" rx="125" ry="103" strokeOpacity=".25" />
            <path d="M328 26V92M328 347V418M54 222H174M482 222H606" strokeOpacity=".42" />
            <path d="M170 119 103 67M492 119 556 67M170 325 103 379M492 325 556 379" strokeOpacity=".28" />
            <path d="M328 76 470 146 470 297 328 367 186 297 186 146Z" strokeOpacity=".32" />
            <path d="M328 101 443 158 443 285 328 345 213 285 213 158Z" strokeOpacity=".22" />
          </g>
          <g className={css.orbitSlow} fill="none" stroke="#64dfff" strokeOpacity=".4" strokeWidth="1.6" strokeDasharray="3 14">
            <ellipse cx="328" cy="222" rx="183" ry="147" />
          </g>
          <g className={css.orbitReverse} fill="none" stroke="#a2a0ff" strokeOpacity=".6" strokeWidth="1.7" strokeDasharray="24 18 3 28">
            <ellipse cx="328" cy="222" rx="126" ry="103" />
          </g>
          <g fill="#06162a" stroke="#5fe2fa" strokeWidth="1.3">
            <path d="M328 147 389 181 389 259 328 297 267 259 267 181Z" strokeOpacity=".68" />
            <path d="M328 169 371 193 371 249 328 274 285 249 285 193Z" strokeOpacity=".48" />
            <path d="M328 187 354 202 354 242 328 258 302 242 302 202Z" strokeOpacity=".68" />
          </g>
          <g fill="none" stroke="#79eafa" strokeWidth="1.8">
            <path d="M314 214 328 203 342 214 342 232 328 241 314 232Z" />
            <path d="M328 204V241M314 214 328 222 342 214" />
          </g>
          {[
            [328, 46], [525, 163], [527, 280], [328, 399], [131, 280], [131, 163],
          ].map(([x, y], index) => (
            <g key={index}>
              <circle cx={x} cy={y} r="13" fill="#061526" stroke="#5d92c9" strokeOpacity=".48" />
              <circle cx={x} cy={y} r="3.3" fill="#6ee6ff" fillOpacity=".55" />
            </g>
          ))}
          <g fill="none" stroke="#75ceff" strokeOpacity=".28">
            <path d="M22 24h35M22 24v35M638 24h-35M638 24v35M22 419h35M22 419v-35M638 419h-35M638 419v-35" />
          </g>
        </svg>
        <div className={css.coreCenter}>
          <div className={css.coreEyebrow}>RELEASE ENGINE / 01</div>
          <div className={css.coreTitle}>{active ? active.toUpperCase() : "STANDBY"}</div>
          <div className={css.coreSub}>
            <SignalDot signal={active ? status.value.pipelineStage.stages[active] : "unknown"} small />
            {active ? signalWord[status.value.pipelineStage.stages[active]] : "NO ACTIVE STAGE"}
          </div>
        </div>
        <div className={css.coreCornerA}>SYSTEM<br />AOE2 / 01</div>
        <div className={css.coreCornerB}>{live ? "RELEASE SOURCE LOCK" : "SOURCE AWAITING RECEIPT"}</div>
      </div>
    </div>
  );
}

function LedTree({ state }: { state: FactorySignal }) {
  return (
    <div className={css.ledTree} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((count, rowIndex) => (
        <div className={css.ledRow} key={count}>
          {Array.from({ length: count }, (_, index) => (
            <span key={index} className={css.ledBulb} data-signal={state}
              style={{ animationDelay: String((rowIndex * 5 + index) * 80) + "ms" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ items }: { items: FactoryActivity[] }) {
  return (
    <section className={css.activityPanel} aria-label="Recent verified factory events">
      <div className={css.panelHead}>
        <div><span className={css.panelKicker}>TRANSMISSION LOG</span><h2>RECENT ACTIVITY</h2></div>
        <Activity size={18} aria-hidden />
      </div>
      <div className={css.activityList}>
        {items.length ? items.slice(0, 5).map((item) => (
          <div key={item.id} className={css.activityItem}>
            <SignalDot signal={item.state} small />
            <span className={css.activityLabel}>{item.label}</span>
            <time dateTime={item.at}>{localTime(item.at)}</time>
          </div>
        )) : (
          <div className={css.emptyActivity}>
            <div className={css.emptyWave} aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
            <span>NO VERIFIED RELEASE EVENTS</span>
            <small>Public event feed not connected</small>
          </div>
        )}
      </div>
    </section>
  );
}

const milestoneNames: Record<string, string> = {
  T0: "Engineering / request start", T1: "Source edit or commit", T2: "Pull request opened",
  T3: "CI and security complete", T4: "Independently verified artifact",
  T5: "Verified artifact received", T6: "Candidate staged",
  T7: "First verified production", T8: "Previous source verified",
  T9: "Candidate reactivated", T10: "Postflight and sealed receipt",
};
const elapsed = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? "UNKNOWN" : ms < 1000 ? Math.round(ms) + " ms" :
  ms < 60_000 ? (ms / 1000).toFixed(1) + " s" :
  Math.floor(ms / 60_000) + "m " + String(Math.floor(ms / 1000) % 60).padStart(2, "0") + "s";
const bytes = (value: number | null | undefined) => value === null || value === undefined
  ? "UNKNOWN" : (value / 1024 ** 2).toFixed(1) + " MiB";

function ReleaseTelemetry({ feed }: { feed: FactoryFeed }) {
  const cycle = feed.value.releaseOs;
  const hasLedger = !!cycle?.stages.length;
  const headroom = factoryHeadroomEvidence(cycle?.disk);
  const capacityCurrent = headroom.state === "pass" || headroom.state === "hold";
  const marginGiB = headroom.marginBytes === null ? null :
    (Math.abs(headroom.marginBytes) / 1024 ** 3).toFixed(2);
  const marginLabel = capacityCurrent
    ? headroom.marginBytes === 0 ? "At the 6 GiB minimum" :
      (headroom.marginBytes! > 0 ? "+" : "") + marginGiB + " GiB " +
      (headroom.marginBytes! > 0 ? "above" : "below") + " the 6 GiB minimum"
    : headroom.state === "stale" ? "Capacity observation expired" : "No fresh capacity observation";
  const observedSeconds = headroom.ageMs === null ? null :
    Math.max(0, Math.floor(headroom.ageMs / 1000));
  const observedAge = observedSeconds === null ? "UNKNOWN" :
    observedSeconds < 60 ? observedSeconds + "s ago" :
      Math.floor(observedSeconds / 60) + "m " + observedSeconds % 60 + "s ago";
  const headroomTitle = [
    headroom.observedAt ? "UTC observation: " + headroom.observedAt + "." : "Observation timestamp UNKNOWN.",
    cycle ? "Source: " + cycle.sourceSha + "; BUILD_ID: " + cycle.buildId + "." : "Source UNKNOWN.",
    "The release minimum remains 6 GiB. Incoming artifact and extraction readiness are UNKNOWN.",
    "This capacity sample does not authorize or certify the next release.",
  ].join(" ");
  const transfer = cycle?.transfer;
  const next = FACTORY_STAGES.map(stage => ({ stage, ...factoryStageEvidence(cycle, stage) }))
    .find(row => row.state !== "pass");
  return <section className={css.telemetryPanel} aria-label="Source-linked release stopwatch and evidence">
    <div className={css.panelHead}>
      <div><span className={css.panelKicker}>SOURCE-LINKED FLIGHT RECORDER</span><h2>RELEASE CONTROL ROOM</h2></div>
      <span className={css.miniChip}><LockKeyhole size={12} aria-hidden /> OBSERVE ONLY</span>
    </div>
    <div className={css.telemetryMetrics}>
      <div><small>START → FIRST VERIFIED PRODUCTION</small>
        <strong>{elapsed(cycle?.firstVerifiedProductionMs)}</strong>
        <span>{cycle?.startKind === "declared-request" ? "Declared request clock" :
          cycle?.startKind === "observed-engineering" ? "Observed engineering clock" : "Start timestamp UNKNOWN"}</span></div>
      <div><small>START → ROLLBACK-TESTED ACCEPTANCE</small>
        <strong>{elapsed(cycle?.finalAcceptedMs)}</strong><span>Previous proof, reactivation and sealed receipt</span></div>
      <div data-signal={headroom.state} title={headroomTitle}>
        <small>LIVE ROOT HEADROOM</small>
        <strong>{capacityCurrent ? (headroom.freeBytes! / 1024 ** 3).toFixed(2) + " GiB" :
          headroom.state === "stale" ? "STALE" : "UNKNOWN"}</strong>
        <span>{marginLabel}</span>
        <span>{headroom.observedAt ? <time dateTime={headroom.observedAt}
          title={"UTC: " + headroom.observedAt}>Observed {observedAge} · {
            new Date(headroom.observedAt).toLocaleString()}</time> : "Observation time UNKNOWN"}</span>
        <span>Capacity only · release readiness unverified</span>
      </div>
    </div>
    <dl className={css.identityGrid}>
      <div><dt>ACTIVE SOURCE</dt><dd>{feed.value.liveRelease.id || "UNKNOWN"}</dd></div>
      <div><dt>ACTIVE BUILD_ID</dt><dd>{feed.value.liveRelease.buildId || "UNKNOWN"}</dd></div>
      <div><dt>PREVIOUS SOURCE</dt><dd>{feed.value.previousRelease.id || "UNKNOWN"}</dd></div>
      <div><dt>PREVIOUS BUILD_ID</dt><dd>{feed.value.previousRelease.buildId || "UNKNOWN"}</dd></div>
    </dl>
    <div className={css.transferPanel}>
      <div><b>ARTIFACT TRANSPORT</b><span>{transfer ? signalWord[transfer.state] : "UNKNOWN"}</span></div>
      {transfer?.totalBytes ? <progress value={transfer.bytes} max={transfer.totalBytes}
        aria-label="Verified release artifact transfer progress" /> : <span>No fresh transfer observation</span>}
      <p>{bytes(transfer?.bytes)} / {bytes(transfer?.totalBytes)} · {
        transfer?.throughputBps === null || transfer?.throughputBps === undefined ? "Throughput UNKNOWN" :
          bytes(transfer.throughputBps) + "/s"} · Elapsed {elapsed(transfer?.elapsedMs)}</p>
      <p>Expected SHA256: {transfer?.expectedSha256 || "UNKNOWN"}</p>
      <p>Verification {transfer ? transfer.verification.toUpperCase() : "UNKNOWN"} · Retries {
        transfer?.retryCount ?? "UNKNOWN"} · Resumed {bytes(transfer?.resumedBytes)}</p>
    </div>
    <div className={css.milestoneGrid}>
      {Object.entries(milestoneNames).map(([event, label]) => {
        const row = cycle?.stages.find(item => item.event === event);
        const state = row?.state || "unknown";
        return <div key={event} className={css.milestone} data-signal={state}>
          <SignalDot signal={state} small /><div><b>{event} · {label}</b>
            <span>{signalWord[state]} · {row?.at ? new Date(row.at).toLocaleString() : "Timestamp UNKNOWN"}</span>
            <small>{elapsed(row?.durationMs)} · {row?.proofSha256 ?
              "Receipt SHA256 " + row.proofSha256.slice(0, 12) : "No proof receipt"}</small></div>
        </div>;
      })}
    </div>
    <div className={css.telemetryFoot}>
      <span>{hasLedger ? "Clock uncertainty: " + (cycle!.clocksUncertaintyMs === null ?
        "UNKNOWN" : cycle!.clocksUncertaintyMs + " ms") : "No source-linked release ledger published"}</span>
      {cycle?.provenanceUrl ? <a href={cycle.provenanceUrl} target="_blank" rel="noopener noreferrer">
        INSPECT PROVENANCE <ArrowUpRight size={12} /></a> : <span>PROVENANCE UNKNOWN</span>}
    </div>
    <p className={css.nextAction}>{!hasLedger ? "NEXT: publish source-linked evidence for the approved release." :
      next ? "NEXT: inspect " + stageSpecs.find(row => row.id === next.stage)!.name + " — " +
        signalWord[next.state] + ". Resume requires the existing approved operator command." :
        "Release milestones recorded. Qualify the next exact source before activation."}</p>
    <p className={css.benchmarkNote}>Historical benchmarks: R1 59m44s from first observed engineering to final public reactivation;
      R2 50.563s after the artifact was already on HEL1. Different scopes; neither is an instrumented request-to-production measurement.</p>
  </section>;
}

export default function FactoryConsole() {
  const [feed, setFeed] = useState<FactoryFeed>(unknownFeed);
  const [edge, setEdge] = useState<EdgeSignal>({ reachable: null, source: null, observedAt: null });
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    setScanning(true);
    const [snapshot, edgeResult] = await Promise.all([
      (async (): Promise<FactoryFeed> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        try {
          const response = await fetch("/factory/status.json", {
            cache: "no-store", credentials: "omit", signal: controller.signal,
          });
          if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return unknownFeed;
          const body = await response.text();
          if (body.length > 24_000) return unknownFeed;
          return readFactoryPublicStatus(JSON.parse(body));
        } catch {
          return unknownFeed;
        } finally {
          clearTimeout(timeout);
        }
      })(),
      (async (): Promise<EdgeSignal> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        try {
          const response = await fetch("/", { method: "HEAD", cache: "no-store",
            credentials: "omit", signal: controller.signal });
          const header = response.headers.get("x-aoe2war-source");
          const source = header && /^[a-f0-9]{40}$/.test(header) ? header : null;
          return { reachable: response.status === 200, source,
            observedAt: response.status === 200 ? new Date().toISOString() : null };
        } catch {
          return { reachable: false, source: null, observedAt: null };
        } finally {
          clearTimeout(timeout);
        }
      })(),
    ]);
    setFeed(snapshot);
    setEdge(edgeResult);
    setScanning(false);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const activeStage = feed.value.pipelineStage.active;
  const webStatus: FactorySignal = feed.authority === "fresh"
    ? feed.value.serviceHealth[0].state
    : edge.reachable === true ? "pass" : "unknown";
  const serviceSignals = useMemo(() =>
    FACTORY_SERVICES.map((service) => {
      const value = feed.value.serviceHealth.find((item) => item.id === service.id);
      return { ...service, state: service.id === "website" ? webStatus : value?.state || "unknown" };
    }), [feed.value.serviceHealth, webStatus]);

  return (
    <main className={css.factory}>
      <div className={css.sky} aria-hidden="true" />
      <header className={css.topbar}>
        <Link href="/kingdom" className={css.backLink} aria-label="Return to the Kingdom">
          <span className={css.brandGlyph}><Workflow size={22} strokeWidth={1.8} aria-hidden /></span>
          <span className={css.brandText}><b>AOE2WAR</b><small>PRODUCT SYSTEMS</small></span>
          <ChevronRight size={15} className={css.breadcrumb} aria-hidden />
          <span className={css.headerTrail}>FACTORY</span>
        </Link>
        <div className={css.topControls}>
          <span className={css.feedPill} data-authority={feed.authority}>
            <span className={css.feedPip} aria-hidden />
            {feed.authority === "fresh" ? "FEED CURRENT" : feed.authority === "stale" ? "FEED STALE" : "FEED UNVERIFIED"}
          </span>
          <button className={css.refresh} onClick={() => { void refresh(); }}
            type="button" aria-label="Rescan public factory status" disabled={scanning}>
            <RefreshCw size={17} className={scanning ? css.spinning : ""} aria-hidden />
            <span>SCAN</span>
          </button>
        </div>
      </header>

      <section className={css.hero} aria-label="Factory release observatory">
        <div className={css.heroIntro}>
          <div className={css.eyebrow}><Zap size={13} aria-hidden /> PUBLIC RELEASE OBSERVATORY <span> / SYSTEM 001</span></div>
          <h1>THE <span>WAR</span> FACTORY<span className={css.cursor}>_</span></h1>
          <div className={css.tagline}>CODE <ChevronRight size={12} /> CONFIDENCE <ChevronRight size={12} /> LAUNCH</div>
        </div>
        <div className={css.heroGrid}>
          <CoreDiagram status={feed} />
          <div className={css.releaseStack} aria-label="Release identities">
            <ReleaseCard mode="live" label="LIVE RELEASE" release={feed.value.liveRelease} edge={edge} />
            <ReleaseCard mode="candidate" label="NEXT CANDIDATE" release={feed.value.candidateRelease} edge={edge} />
            <ReleaseCard mode="rollback" label="ROLLBACK TARGET" release={feed.value.previousRelease} edge={edge} />
          </div>
        </div>
        <div className={css.heroFoot}>
          <span><SignalDot small signal={webStatus} /> EDGE {edge.reachable === true ? "HTTP 200" : "NOT VERIFIED"}</span>
          <span><LockKeyhole size={12} aria-hidden /> READ-ONLY / NO RELEASE CONTROLS</span>
          <span data-factory-release-marker="factory-20261113-loop-v2">SCAN {localTime(edge.observedAt)} · RELEASE LOOP R2</span>
        </div>
      </section>

      <section className={css.pipelineSection} aria-label="Seven-stage release pipeline">
        <div className={css.sectionHead}>
          <div className={css.sectionTitle}><span className={css.sectionNumber}>01</span><h2>ASSEMBLY LINE</h2></div>
          <div className={css.sectionMeta}>07 STAGES <span>•</span> {activeStage ? "IN " + activeStage.toUpperCase() : "AWAITING STAGE DATA"}</div>
        </div>
        <div className={css.pipelineScroller}>
          <div className={css.stageRail}>
            {stageSpecs.map(({ id, name, icon: Icon }, index) => {
              const evidence = factoryStageEvidence(feed.value.releaseOs, id as FactoryStage);
              const stageState: FactorySignal = feed.authority === "stale" ? "stale" : evidence.state;
              return (
                <div key={id} className={css.stage} data-signal={stageState}
                  data-active={activeStage === id ? "true" : "false"}>
                  <div className={css.stageCounter}>0{index + 1}</div>
                  <div className={css.stageIcon}><Icon size={23} strokeWidth={1.55} aria-hidden /></div>
                  <div className={css.stageInfo}><span>{name}</span><small>{signalWord[stageState]}</small>
                    <small>{evidence.at ? localTime(evidence.at) : "TIME UNKNOWN"}</small>
                    <small title={evidence.proofSha256 || "No source-linked proof receipt"}>
                      {evidence.proofSha256 ? "SHA " + evidence.proofSha256.slice(0, 10) : "NO RECEIPT"}
                    </small>
                    <small title={feed.value.releaseOs?.sourceSha || "Source UNKNOWN"}>
                      {feed.value.releaseOs ? feed.value.releaseOs.sourceSha.slice(0, 12) : "SOURCE UNKNOWN"} · {evidence.events.join("+")}
                    </small>
                  </div>
                  {index < FACTORY_STAGES.length - 1 && <span className={css.stageConnector} aria-hidden><i /></span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <ReleaseTelemetry feed={feed} />

      <div className={css.lowerGrid}>
        <section className={css.testPanel} aria-label="Grouped deployment checks and Christmas tree test lights">
          <div className={css.panelHead}>
            <div><span className={css.panelKicker}>QUALIFICATION MATRIX</span><h2>THE LIGHT BOARD</h2></div>
            <div className={css.miniChip}><Cpu size={13} aria-hidden /> 06 GROUPS</div>
          </div>
          <div className={css.testGrid}>
            {FACTORY_TEST_GROUPS.map(({ id, name }) => {
              const entry = feed.value.testGroups.find((item) => item.id === id)!;
              return (
                <div key={id} className={css.testCard} data-signal={entry.state}
                  aria-label={name + " group: " + signalWord[entry.state]}>
                  <div className={css.testCardTop}><span>{name}</span><SignalDot signal={entry.state} small /></div>
                  <LedTree state={entry.state} />
                  <div className={css.testCardBottom}>{entry.total === null ? "— / —" : String(entry.passed) + " / " + String(entry.total)}</div>
                </div>
              );
            })}
          </div>
          <div className={css.legend}>
            {[["pass", "PASS"], ["running", "RUNNING"], ["hold", "HOLD"], ["fail", "FAIL"], ["unknown", "NO SIGNAL"]].map(([state, label]) => (
              <span key={state}><SignalDot signal={state as FactorySignal} small />{label}</span>
            ))}
          </div>
        </section>

        <div className={css.sideColumn}>
          <section className={css.servicePanel} aria-label="Public service health signals">
            <div className={css.panelHead}>
              <div><span className={css.panelKicker}>PUBLIC BEACONS</span><h2>SYSTEM PULSE</h2></div>
              <Radar size={19} aria-hidden />
            </div>
            <div className={css.services}>
              {serviceSignals.map((item) => (
                <div key={item.id} className={css.service} data-signal={item.state}>
                  <div className={css.serviceBeacon}><span /></div>
                  <div className={css.serviceLabel}>{item.name}</div>
                  <div className={css.serviceState}>{item.id === "website" && feed.authority !== "fresh" && edge.reachable === true
                    ? "HTTP 200" : signalWord[item.state]}</div>
                </div>
              ))}
            </div>
          </section>
          <ActivityFeed items={feed.value.recentActivity} />
        </div>
      </div>

      <footer className={css.footer}>
        <span><Box size={14} aria-hidden /> FACTORY V1 / PUBLIC OBSERVATORY</span>
        <span>{feed.authority === "fresh" ? "PUBLIC SNAPSHOT / NOT A SIGNED DEPLOY PERMIT" :
          "NO VERIFIED DEPLOYMENT RECEIPTS — UNKNOWN ≠ PASS"}</span>
        <Link href="/kingdom-intelligence">KINGDOM INTELLIGENCE <ArrowUpRight size={13} aria-hidden /></Link>
      </footer>
    </main>
  );
}
