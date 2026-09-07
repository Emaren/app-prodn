import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  GitBranch,
  HardDrive,
  History,
  Radar,
  Radio,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Workflow,
} from "lucide-react";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import PageWidthSettingsBar from "@/components/tile-view/PageWidthSettingsBar";
import {
  loadPublicKingdomIntelligence,
  type PublicKingdomIntelligence,
} from "@/lib/kingdomIntelligencePublic";

import BrowserLocalTime from "./BrowserLocalTime";
import KingdomIntelligenceRefresh from "./KingdomIntelligenceRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVE_PROCESS_STATES = new Set([
  "ACTIVE",
  "RUNNING",
  "RUNNING_CAPTURE",
  "RUNNING_TRANSACTION",
  "RESUME_REQUESTED",
  "CLAIMED",
]);

function isActiveProcessState(value: string | null | undefined) {
  return ACTIVE_PROCESS_STATES.has(String(value || "").toUpperCase());
}

function tone(status: string | null | undefined) {
  const value = String(status || "").toUpperCase();
  if (["PASS", "READY", "HEALTHY", "CERTIFIED", "COMPLETE"].includes(value)) {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  }
  if (["ATTENTION", "ATTENTION_REQUIRED", "MAINTENANCE_DUE", "WATCH", "RUNNING", "RUNNING_CAPTURE", "RUNNING_TRANSACTION", "RESUME_REQUESTED", "DO NOW", "MUST FIX"].includes(value)) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }
  if (["FAIL", "FAILED", "BLOCKED", "UNSAFE"].includes(value)) {
    return "border-rose-300/25 bg-rose-400/10 text-rose-100";
  }
  return "border-slate-400/15 bg-slate-500/10 text-slate-300";
}

function ageLabel(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "awaiting signal";
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  return Math.floor(seconds / 3600) + "h ago";
}

function pct(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? "—" : value.toFixed(digits) + "%";
}

function numberLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-4 backdrop-blur-sm">
      <div className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function beacon(state: string | null | undefined) {
  const value = String(state || "").toUpperCase();
  if (isActiveProcessState(value)) {
    return "bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,.8)] animate-pulse";
  }
  if (["HEALTHY", "PASS", "COMPLETE", "CERTIFIED"].includes(value)) {
    return "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.5)]";
  }
  if (["FAILED", "FAIL", "BLOCKED", "UNSAFE"].includes(value)) {
    return "bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,.55)]";
  }
  if (["ATTENTION", "WAITING", "WATCH"].includes(value)) {
    return "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.5)] animate-pulse";
  }
  return "bg-slate-600";
}

function AgentLine({
  label,
  state,
  summary,
  progress,
  progressLabel,
}: {
  label: string;
  state: string;
  summary: string;
  progress: number | null;
  progressLabel: string | null;
}) {
  const active = isActiveProcessState(state);

  return (
    <div
      className={
        "group rounded-2xl border px-4 py-3 transition " +
        (active
          ? "kingdom-current-process border-cyan-200/22 bg-cyan-300/[0.045] shadow-[0_0_34px_rgba(34,211,238,0.08)]"
          : "border-white/8 bg-white/[0.025] hover:border-cyan-200/15 hover:bg-cyan-300/[0.025]")
      }
    >
      <div className="flex items-start gap-3">
        <span className={"mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " + beacon(state)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">{label}</div>
            <span className={"rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] " + tone(state)}>
              {state}
            </span>
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{summary}</div>
          {progress !== null ? (
            <div className="mt-2">
              <div className="h-1 overflow-hidden rounded-full bg-white/6">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400/70 via-amber-300/80 to-emerald-300/85"
                  style={{ width: Math.max(0, Math.min(100, progress)) + "%" }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.15em] text-slate-600">
                <span>{progressLabel ?? "progress"}</span>
                <span>{progress.toFixed(progress % 1 === 0 ? 0 : 1)}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({
  icon: Icon,
  eyebrow,
  title,
  status,
  detail,
  children,
}: {
  icon: typeof Activity;
  eyebrow: string;
  title: string;
  status: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[1.7rem] border border-white/8 bg-[linear-gradient(145deg,rgba(15,23,42,0.78),rgba(2,6,23,0.9))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/25 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-amber-100/10 bg-amber-300/8 p-2.5 text-amber-100/80">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">{eyebrow}</div>
            <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
          </div>
        </div>
        <span className={"rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] " + tone(status)}>
          {status}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{detail}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}

export default async function KingdomIntelligencePage() {
  let data: PublicKingdomIntelligence | null = null;
  let error: string | null = null;

  try {
    data = await loadPublicKingdomIntelligence();
  } catch {
    error = "The Kingdom Intelligence signal could not be reached.";
  }

  const liveAge = data?.ageSeconds ?? null;

  const awake = Boolean(data?.available && liveAge !== null && liveAge < 15 * 60);
  const campaign = data?.storageCampaign;
  const systemAgents = data?.systemAgents ?? [];
  const orderedSystemAgents = [...systemAgents].sort((left, right) => {
    const activeDelta =
      Number(isActiveProcessState(right.state)) -
      Number(isActiveProcessState(left.state));
    if (activeDelta) return activeDelta;

    const attention = new Set(["ATTENTION", "BLOCKED", "FAILED"]);
    const attentionDelta =
      Number(attention.has(right.state)) -
      Number(attention.has(left.state));
    if (attentionDelta) return attentionDelta;

    return left.label.localeCompare(right.label);
  });
  const activeSystemCount = systemAgents.filter((item) =>
    isActiveProcessState(item.state)
  ).length;
  const attentionSystemCount = systemAgents.filter((item) =>
    ["ATTENTION", "BLOCKED", "FAILED"].includes(item.state)
  ).length;
  const nerveFeed = (() => {
    const runRows = (data?.liveActivity ?? []).map((item) => ({
      key: "run-" + (item.id ?? item.requestedAt),
      at: item.completedAt ?? item.requestedAt,
      system: item.system,
      label: item.label,
      status: item.status,
      proof: item.id,
      current: isActiveProcessState(item.status),
      progress: null as number | null,
      progressLabel: null as string | null,
    }));
    const activeAgentRows = systemAgents
      .filter((item) => isActiveProcessState(item.state))
      .map((item) => ({
        key: "agent-" + item.key,
        at: data?.receivedAt ?? data?.generatedAt ?? new Date(0).toISOString(),
        system: item.label,
        label: item.summary,
        status: item.state,
        proof: null as string | null,
        current: true,
        progress: item.progressPercent,
        progressLabel: item.progressLabel,
      }));
    const sourceRows = (data?.recentSourceActivity ?? []).map((item) => ({
      key: "src-" + item.sha,
      at: item.createdAt,
      system: item.system,
      label: item.title,
      status: item.status,
      proof: item.sha,
      current: false,
      progress: null as number | null,
      progressLabel: null as string | null,
    }));

    return [...activeAgentRows, ...runRows, ...sourceRows]
      .filter(
        (item, index, all) =>
          all.findIndex(
            (other) =>
              other.system === item.system &&
              other.label === item.label &&
              other.status === item.status,
          ) === index,
      )
      .sort((left, right) => {
        const currentDelta = Number(right.current) - Number(left.current);
        if (currentDelta) return currentDelta;
        return new Date(right.at).getTime() - new Date(left.at).getTime();
      })
      .slice(0, 14);
  })();

  return (
    <div className="mx-auto w-full space-y-6 pb-16">
      <SpeedReadyMarker route="/kingdom-intelligence" />
      <section className="relative min-h-[32rem] overflow-hidden rounded-[2.3rem] border border-amber-100/12 bg-[#04070c] shadow-[0_32px_120px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,rgba(217,119,6,0.18),transparent_18%),radial-gradient(circle_at_72%_40%,rgba(251,191,36,0.08),transparent_38%),linear-gradient(135deg,#08101c_0%,#030609_56%,#0b0805_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="absolute right-[6%] top-1/2 hidden h-[24rem] w-[24rem] -translate-y-1/2 lg:block">
          <div className="absolute inset-0 rounded-full border border-amber-200/10 shadow-[inset_0_0_70px_rgba(251,191,36,0.04)]" />
          <div className="absolute inset-[12%] animate-[spin_28s_linear_infinite] rounded-full border border-dashed border-amber-200/16" />
          <div className="absolute inset-[24%] animate-[spin_18s_linear_infinite_reverse] rounded-full border border-amber-100/12" />
          <div className="absolute inset-[35%] rounded-full border border-amber-200/20 bg-amber-300/[0.025] shadow-[0_0_80px_rgba(245,158,11,0.12)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-amber-100/20 bg-[#090b0e] shadow-[0_0_70px_rgba(245,158,11,0.18)]">
              <BrainCircuit className="h-12 w-12 text-amber-100/90" />
              <span className={"absolute -right-1 top-2 h-3 w-3 rounded-full " + (awake ? "animate-pulse bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.8)]" : "bg-amber-300")} />
            </div>
          </div>
        </div>

        <div className="relative z-10 flex min-h-[32rem] max-w-4xl flex-col justify-center px-7 py-10 sm:px-10 lg:px-14">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200/16 bg-amber-300/8 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.28em] text-amber-100/80">
              Kingdom Intelligence
            </span>
            <span className={"inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] " + (awake ? tone("PASS") : tone("ATTENTION"))}>
              <span className={"h-1.5 w-1.5 rounded-full " + (awake ? "animate-pulse bg-emerald-300" : "bg-amber-300")} />
              {awake ? "The mind is awake" : "Signal aging"}
            </span>
          </div>

          <div className="mt-6 text-[10px] font-black uppercase tracking-[0.38em] text-slate-500">
            Truth · Provenance · Invariants · Action
          </div>
          <h1 className="mt-4 max-w-4xl font-serif text-5xl font-semibold leading-[0.92] tracking-[-0.035em] text-[#f4e5bd] sm:text-6xl lg:text-7xl">
            THE KINGDOM
            <br />
            HAS A MIND.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            AoE2WAR watches its own releases, replay truth, performance, storage,
            workspaces, recovery and operating invariants — then ranks what the
            kingdom should do next.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <span className={"rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.22em] " + tone(data?.operatingState)}>
              {data?.operatingState ?? "WAKING"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 font-mono text-xs text-slate-300">
              War Date {data?.warDate ?? "—"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs text-slate-400">
              refreshed {ageLabel(liveAge)}
            </span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/8 px-5 py-4 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="24h source motion"
          value={numberLabel(data?.activity24h?.sourceCommits)}
          detail="sealed app-prodn commits observed"
        />
        <Stat
          label="OS agent array"
          value={systemAgents.length ? String(systemAgents.length) : "—"}
          detail="8 operating systems + System Doctor"
        />
        <Stat
          label="Working now"
          value={String(activeSystemCount)}
          detail={attentionSystemCount + " system(s) waiting or under attention"}
        />
        <Stat
          label="Certified finishes"
          value={numberLabel(data?.activity24h?.certifiedFinishes)}
          detail={numberLabel(data?.activity24h?.finishRuns) + " Finish run(s) observed"}
        />
        <Stat
          label="System doctor"
          value={data?.health?.doctorScore === null || data?.health?.doctorScore === undefined ? "—" : data.health.doctorScore + "/100"}
          detail={(data?.health?.doctorStatus ?? "UNKNOWN") + " · P0 " + (data?.health?.p0 ?? "—") + " · P1 " + (data?.health?.p1 ?? "—")}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-[2rem] border border-cyan-200/10 bg-[#02060c] shadow-[0_24px_90px_rgba(0,0,0,.28)]">
          <div className="flex items-center justify-between border-b border-white/7 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.05]">
                <Radio className="h-4 w-4 text-cyan-200/80" />
                <span className={"absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full " + (activeSystemCount ? beacon("ACTIVE") : beacon("IDLE"))} />
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-100/45">
                  War Pulse · live chronicle
                </div>
                <h2 className="mt-1 font-serif text-2xl text-white">The nervous system speaks.</h2>
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
              polls every 20s
            </div>
          </div>

          <div className="max-h-[34rem] overflow-y-auto px-4 py-3 font-mono text-xs sm:px-5">
            {nerveFeed.length ? (
              nerveFeed.map((item) => (
                <div
                  key={item.key}
                  className={
                    "relative grid grid-cols-[9px_62px_minmax(0,1fr)] gap-3 py-3 " +
                    (item.current
                      ? "kingdom-current-process my-1 rounded-xl border border-cyan-200/20 px-3 shadow-[0_0_34px_rgba(34,211,238,0.08)]"
                      : "border-b border-white/[0.045] last:border-0")
                  }
                >
                  <span className={"mt-1 h-2 w-2 rounded-full " + beacon(item.status === "SUCCEEDED" ? "HEALTHY" : item.status)} />
                  <span className={item.current ? "font-semibold text-cyan-100/70" : "text-slate-600"}>
                    <BrowserLocalTime value={item.at} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-cyan-100/80">{item.system}</span>
                      {item.current ? (
                        <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100">
                          Live process
                        </span>
                      ) : null}
                      <span className={tone(item.status) + " rounded-full border px-1.5 py-0.5 text-[8px] font-black tracking-[0.14em]"}>
                        {item.status}
                      </span>
                    </div>
                    <div className={"mt-1 " + (item.current ? "font-semibold text-slate-100" : "truncate text-slate-300")}>
                      {item.label}
                    </div>
                    {item.current && item.progress !== null ? (
                      <div className="mt-2">
                        <div className="h-1 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-amber-200 to-emerald-300"
                            style={{ width: Math.max(0, Math.min(100, item.progress)) + "%" }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.14em] text-cyan-100/45">
                          <span>{item.progressLabel ?? "process progress"}</span>
                          <span>{item.progress.toFixed(item.progress % 1 === 0 ? 0 : 1)}%</span>
                        </div>
                      </div>
                    ) : null}
                    {item.proof ? (
                      <div className="mt-1 text-[10px] text-slate-700">proof {item.proof}</div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-600">
                <Bot className="mb-3 h-7 w-7" />
                <div>No proven activity line is available yet.</div>
                <div className="mt-2 max-w-md text-[11px] leading-5 text-slate-700">
                  Kingdom Intelligence does not invent an agent heartbeat. Registered work, OS receipts and sealed source events appear here when evidence exists.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-amber-100/10 bg-[radial-gradient(circle_at_20%_0%,rgba(245,158,11,.08),transparent_32%),rgba(2,6,23,.82)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.32em] text-amber-100/45">
                Agent constellation
              </div>
              <h2 className="mt-2 font-serif text-2xl text-[#f4e5bd]">Eight OS agents. One Doctor.</h2>
            </div>
            <Cpu className="h-5 w-5 text-amber-200/60" />
          </div>
          <div className="mt-4 space-y-2.5">
            {orderedSystemAgents.map((agent) => (
              <AgentLine
                key={agent.key}
                label={agent.label}
                state={agent.state}
                summary={agent.summary}
                progress={agent.progressPercent}
                progressLabel={agent.progressLabel}
              />
            ))}
          </div>
          <div className="mt-4 border-t border-white/6 pt-4 text-[11px] leading-5 text-slate-600">
            Beacon law: cyan pulse = working · green solid = healthy/closed · amber pulse = waiting/attention · red = failed/blocked · slate = idle.
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-emerald-200/10 bg-[linear-gradient(145deg,rgba(3,20,16,.72),rgba(2,6,23,.9))] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-emerald-200/70" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.32em] text-emerald-100/40">
                Victory ledger
              </div>
              <h2 className="mt-1 font-serif text-2xl text-white">Recent seals in the source forge.</h2>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(data?.recentSourceActivity ?? []).slice(0, 8).map((item) => (
              <div key={item.sha} className="rounded-xl border border-white/7 bg-black/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-100/80">{item.system}</span>
                  <span className="font-mono text-[10px] text-slate-600">{item.sha}</span>
                </div>
                <div className="mt-1 text-sm text-slate-300">{item.title}</div>
              </div>
            ))}
            {!data?.recentSourceActivity?.length ? (
              <div className="py-8 text-center text-sm text-slate-600">No recent source seals published.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[2rem] border border-violet-200/10 bg-[radial-gradient(circle_at_90%_0%,rgba(139,92,246,.10),transparent_35%),rgba(2,6,23,.86)] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <ScrollText className="h-5 w-5 text-violet-200/70" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.32em] text-violet-100/40">
                Memory vault
              </div>
              <h2 className="mt-1 font-serif text-2xl text-white">Lessons that became machine memory.</h2>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(data?.memorySeals ?? []).slice(0, 8).map((item) => (
              <div key={item.sha} className="flex gap-3 rounded-xl border border-white/7 bg-black/20 px-4 py-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,.45)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-300">{item.title}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-600">memory seal {item.sha}</div>
                </div>
              </div>
            ))}
            {!data?.memorySeals?.length ? (
              <div className="py-8 text-center text-sm text-slate-600">No recent Engineering Memory seal published.</div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            icon: Radar,
            title: "Truth",
            body: "What is actually true now — source, production, replay outcomes, storage, health and current work.",
          },
          {
            icon: History,
            title: "Provenance",
            body: "Every claim is tied back to receipts, certified releases, immutable replay evidence and current observations.",
          },
          {
            icon: ShieldCheck,
            title: "Invariants",
            body: "The system knows what must never be traded away for speed: truth, WOLO boundaries, release safety and evidence.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-[1.7rem] border border-amber-100/10 bg-[linear-gradient(145deg,rgba(24,18,10,.72),rgba(4,7,12,.92))] p-6"
          >
            <Icon className="h-5 w-5 text-amber-200/80" />
            <h2 className="mt-4 font-serif text-2xl text-[#f0dfb8]">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
          </div>
        ))}
      </section>

      {data?.directive ? (
        <section className="overflow-hidden rounded-[2rem] border border-amber-200/16 bg-[radial-gradient(circle_at_10%_0%,rgba(245,158,11,.13),transparent_34%),linear-gradient(135deg,#120e08,#05080d)] p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.34em] text-amber-100/55">
                Council Directive
              </div>
              <h2 className="mt-3 max-w-4xl font-serif text-3xl text-[#f5e6bf] sm:text-4xl">
                {data.directive.title}
              </h2>
            </div>
            <span className={"rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] " + tone(data.directive.level)}>
              {data.directive.level}
            </span>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
            The deterministic Council ranks prerequisites before outer goals. It
            does not invent a green state to make the dashboard look better.
          </p>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.32em] text-slate-500">
              Living nervous system
            </div>
            <h2 className="mt-2 font-serif text-3xl text-white">What the kingdom knows right now</h2>
          </div>
          <div className="text-xs text-slate-500">Public projection · sensitive operator evidence withheld</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            icon={GitBranch}
            eyebrow="Release OS"
            title="Source Authority"
            status={data?.source?.exact ? "PASS" : "ATTENTION"}
            detail={
              data?.source
                ? "Production " + (data.source.productionRelease ?? "—") + " · " + data.source.certificationStatus + ". Git, runtime and certification must agree."
                : "Awaiting the next certified source observation."
            }
          />
          <ModuleCard
            icon={HardDrive}
            eyebrow="Storage OS"
            title="Recovery History"
            status={data?.storage?.health ?? "UNKNOWN"}
            detail={
              data?.storage
                ? pct(data.storage.usedPercent, 2) + " of the evidence volume is in use. Healthy target is below " + data.storage.healthyTargetPercent + "%."
                : "Awaiting storage evidence."
            }
          >
            {campaign?.active ? (
              <div className="rounded-xl border border-cyan-200/12 bg-cyan-300/5 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-100">
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  Detached campaign working
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {campaign.completedGenerations}/{campaign.maxGenerations ?? "?"} generations sealed
                  {campaign.currentGeneration ? " · " + campaign.currentGeneration : ""}
                </div>
              </div>
            ) : null}
          </ModuleCard>
          <ModuleCard
            icon={Database}
            eyebrow="Replay Truth OS"
            title="Battle Certainty"
            status={data?.replayTruth?.current ? "PASS" : "ATTENTION"}
            detail={
              data?.replayTruth?.available
                ? numberLabel(data.replayTruth.resolved) + " of " + numberLabel(data.replayTruth.finalGames) + " final battles have resolved winner authority. Unknown stays unknown until evidence proves otherwise."
                : "No current replay-closure evidence is published yet."
            }
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400/70 to-emerald-300/80"
                style={{ width: Math.max(0, Math.min(100, data?.replayTruth?.resultCoveragePercent ?? 0)) + "%" }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {pct(data?.replayTruth?.resultCoveragePercent, 2)} result authority
            </div>
          </ModuleCard>
          <ModuleCard
            icon={Gauge}
            eyebrow="Speed OS"
            title="Performance Evidence"
            status={data?.performance?.current ? "PASS" : "ATTENTION"}
            detail={
              data?.performance?.available
                ? numberLabel(data.performance.routeCount) + " route templates · TTFB p50 " + numberLabel(data.performance.ttfbP50Ms) + "ms · total p50 " + numberLabel(data.performance.totalP50Ms) + "ms."
                : "No current certified performance campaign is published."
            }
          />
          <ModuleCard
            icon={Workflow}
            eyebrow="Workspace OS"
            title="Parallel Engineering"
            status={(data?.workspace?.canonicalDriftCount ?? 0) === 0 ? "PASS" : "ATTENTION"}
            detail={numberLabel(data?.workspace?.activeAgentCount) + " registered agent workspace(s). Canonical drift: " + numberLabel(data?.workspace?.canonicalDriftCount) + ". Parallel work cannot silently redefine production authority."}
          />
          <ModuleCard
            icon={Cpu}
            eyebrow="Council"
            title="Operating State"
            status={data?.operatingState ?? "UNKNOWN"}
            detail="The Brain combines live facts, freshness, receipts and invariants into a ranked next action. An LLM may interpret it; the LLM is not the authority."
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/8 bg-slate-950/70 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Swords className="h-5 w-5 text-amber-200/70" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
              Constitutional guard
            </div>
            <h2 className="mt-1 font-serif text-2xl text-white">The things intelligence is not allowed to break</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.invariants ?? []).map((invariant) => (
            <div
              key={invariant.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3"
            >
              <div className="flex items-center gap-2.5 text-sm text-slate-300">
                <CheckCircle2 className={"h-4 w-4 " + (invariant.status === "PASS" ? "text-emerald-300" : "text-amber-300")} />
                {invariant.label}
              </div>
              <span className={"rounded-full border px-2 py-1 text-[8px] font-black tracking-[0.16em] " + tone(invariant.status)}>
                {invariant.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[1.7rem] border border-cyan-100/8 bg-cyan-300/[0.025] px-6 py-5 text-sm leading-6 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-4 w-4 shrink-0 text-cyan-200/60" />
          <p className="max-w-4xl">
            This page is deliberately sanitized. Kingdom Intelligence publishes
            operating facts, not private prompts, chain-of-thought, credentials,
            filesystem paths or unrestricted operator output.
          </p>
        </div>
        <KingdomIntelligenceRefresh />
      </section>

      <PageWidthSettingsBar
        tileKey="kingdom_intelligence"
        label="Kingdom Intelligence"
      />
    </div>
  );
}
