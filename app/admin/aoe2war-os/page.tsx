"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BookOpenCheck,
  CloudCog,
  DatabaseZap,
  FileArchive,
  GitBranch,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  UploadCloud,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ActionDefinition = {
  action: string;
  label: string;
  description: string;
  risk: "read" | "docs_write" | "production_write";
  confirmation: string | null;
  requiresSourceSha: boolean;
};

type RunEvent = {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
};

type Run = {
  id: string;
  action: string;
  label: string;
  risk: string;
  status: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  error: string | null;
  expectedSourceSha: string | null;
  events?: RunEvent[];
};

type Bridge = {
  bridgeId: string;
  hostname: string;
  platform: string;
  version: string;
  currentRunId: string | null;
  lastSeenAt: string;
  online: boolean;
};

type Snapshot = {
  bridgeId: string;
  runId: string | null;
  sourceAction: string;
  generatedAt: string;
  receivedAt: string;
  estate: string;
  p0: number;
  p1: number;
  payload: Record<string, unknown>;
};

type Dashboard = {
  bridgeTokenConfigured: boolean;
  storeDir: string;
  bridge: Bridge | null;
  snapshot: Snapshot | null;
  activeRun: Run | null;
  recentRuns: Run[];
  actions: ActionDefinition[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function relativeAge(value: string | null | undefined) {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function shortSha(value: unknown) {
  return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : "—";
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusTone(status: string) {
  if (["HEALTHY", "PASS", "succeeded", "CERTIFIED", "active"].includes(status)) {
    return "text-emerald-200 bg-emerald-400/10 border-emerald-300/20";
  }
  if (["ATTENTION_REQUIRED", "WARN", "queued", "claimed", "running"].includes(status)) {
    return "text-amber-100 bg-amber-400/10 border-amber-300/20";
  }
  if (["failed", "UNSAFE", "FAIL"].includes(status)) {
    return "text-rose-100 bg-rose-400/10 border-rose-300/20";
  }
  return "text-slate-300 bg-slate-400/10 border-slate-500/20";
}

function StatusCard({
  label,
  value,
  detail,
  Icon,
}: {
  label: string;
  value: string;
  detail: string;
  Icon: typeof Activity;
}) {
  return (
    <div className="rounded-[1.4rem] border border-slate-700/60 bg-slate-950/65 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</div>
          <div className="mt-3 text-xl font-semibold text-white">{value}</div>
          <div className="mt-2 text-sm leading-5 text-slate-400">{detail}</div>
        </div>
        <div className="rounded-2xl bg-slate-900 p-3 text-slate-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function AoE2WarOsAdminPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [clock, setClock] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/aoe2war-os", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Dashboard & {
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Could not load AoE2WAR OS state.");
      }
      setDashboard(payload);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load AoE2WAR OS state."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const snapshotPayload = record(dashboard?.snapshot?.payload);
  const areas = record(snapshotPayload.areas);
  const info = record(snapshotPayload.info);
  const sourceRepos = record(info.source_repositories);
  const release = record(info.release);
  const taxonomy = record(info.taxonomy);
  const archives = record(info.context_archives);

  const currentSourceSha = useMemo(() => {
    const app = record(sourceRepos["app-prodn"]);
    return typeof app.head === "string" ? app.head : null;
  }, [sourceRepos]);

  const activeRun = dashboard?.activeRun ?? null;
  const events = activeRun?.events ?? [];
  const runIsActive = Boolean(
    activeRun && ["queued", "claimed", "running"].includes(activeRun.status)
  );
  const runStartValue = activeRun?.startedAt ?? activeRun?.requestedAt ?? null;
  const runStartMs = runStartValue ? new Date(runStartValue).getTime() : Number.NaN;
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const latestActivityValue =
    latestEvent?.createdAt ?? activeRun?.startedAt ?? activeRun?.requestedAt ?? null;
  const latestActivityMs = latestActivityValue
    ? new Date(latestActivityValue).getTime()
    : Number.NaN;
  const runElapsed = Number.isFinite(runStartMs)
    ? formatElapsed(clock - runStartMs)
    : "00:00";
  const outputAgeMs = Number.isFinite(latestActivityMs)
    ? Math.max(0, clock - latestActivityMs)
    : 0;
  const outputIsFresh = events.length > 0 && outputAgeMs <= 15_000;

  async function queueAction(action: ActionDefinition) {
    try {
      setSubmitting(action.action);
      setError(null);

      const response = await fetch("/api/admin/aoe2war-os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.action,
          confirmation: confirmations[action.action] ?? "",
          expectedSourceSha: action.requiresSourceSha ? currentSourceSha : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Dashboard & {
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || `Could not queue ${action.label}.`);
      }

      setDashboard(payload);
      setConfirmations((current) => ({ ...current, [action.action]: "" }));
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Command queue failed.");
    } finally {
      setSubmitting(null);
    }
  }

  async function cancelQueuedRun() {
    if (!dashboard?.activeRun || dashboard.activeRun.status !== "queued") return;
    try {
      setSubmitting("cancel");
      const response = await fetch("/api/admin/aoe2war-os", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: dashboard.activeRun.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as Dashboard & {
        detail?: string;
      };
      if (!response.ok) throw new Error(payload.detail || "Could not cancel run.");
      setDashboard(payload);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel run.");
    } finally {
      setSubmitting(null);
    }
  }

  const readActions = dashboard?.actions.filter((item) => item.risk === "read") ?? [];
  const docsActions = dashboard?.actions.filter((item) => item.risk === "docs_write") ?? [];
  const productionActions =
    dashboard?.actions.filter((item) => item.risk === "production_write") ?? [];

  const bridgeOnline = Boolean(dashboard?.bridge?.online);
  const busy = Boolean(dashboard?.activeRun);

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="rounded-[2rem] bg-[radial-gradient(circle_at_12%_5%,rgba(16,185,129,0.16),transparent_28%),radial-gradient(circle_at_86%_12%,rgba(59,130,246,0.14),transparent_30%),linear-gradient(145deg,#07111f,#020617_58%,#07101c)] p-6 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
            <div className="mt-5 text-xs uppercase tracking-[0.4em] text-emerald-200/70">
              War Room
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
              AoE2WAR OS
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              One control surface for release engineering, estate audits, documentation
              federation, context evidence and the protected production pipeline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                bridgeOnline
                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-300/20 bg-rose-400/10 text-rose-100"
              }`}
            >
              {bridgeOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              Operator Bridge {bridgeOnline ? "online" : "offline"}
            </div>

            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {!dashboard?.bridgeTokenConfigured ? (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
            The server-side Operator Bridge token is not configured yet. The dashboard is
            safe to view, but remote controls remain offline until bridge setup is completed.
          </div>
        ) : null}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatusCard
            label="Estate"
            value={loading ? "Loading…" : dashboard?.snapshot?.estate ?? "No snapshot"}
            detail={
              dashboard?.snapshot
                ? `P0 ${dashboard.snapshot.p0} · P1 ${dashboard.snapshot.p1} · ${relativeAge(
                    dashboard.snapshot.generatedAt
                  )}`
                : "Waiting for the Operator Bridge to publish the first audit."
            }
            Icon={ShieldCheck}
          />
          <StatusCard
            label="Production"
            value={String(release.service ?? "Unknown")}
            detail={`source ${shortSha(release.production_source)} · build ${
              typeof release.active_build_id === "string"
                ? release.active_build_id.slice(0, 10)
                : "—"
            }`}
            Icon={ServerCog}
          />
          <StatusCard
            label="Release Engine"
            value={String(release.state ?? "Unknown")}
            detail={`certification ${String(record(release.certification).status ?? "—")}`}
            Icon={CloudCog}
          />
          <StatusCard
            label="Documentation"
            value={`${String(taxonomy.corpus_total ?? "—")} docs`}
            detail={`${String(taxonomy.semantic_index_total ?? "—")} indexed · ${String(
              taxonomy.raw_duplicate_heading_groups ?? "—"
            )} raw provenance H1 groups`}
            Icon={BookOpenCheck}
          />
          <StatusCard
            label="Bridge"
            value={bridgeOnline ? dashboard?.bridge?.hostname ?? "Online" : "Offline"}
            detail={
              dashboard?.bridge
                ? `${dashboard.bridge.platform} · seen ${relativeAge(dashboard.bridge.lastSeenAt)}`
                : "No heartbeat received."
            }
            Icon={Activity}
          />
        </section>

        {Object.keys(areas).length > 0 ? (
          <section className="mt-5 rounded-[1.4rem] border border-slate-700/50 bg-slate-950/45 p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Estate Areas
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(areas).map(([area, status]) => (
                <div
                  key={area}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${statusTone(
                    String(status)
                  )}`}
                >
                  <span>
                    {String(status) === "PASS"
                      ? "✓"
                      : String(status) === "WARN"
                        ? "!"
                        : "✕"}
                  </span>
                  <span>{area}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] bg-slate-950/80 p-6 shadow-xl sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-slate-500">
                Controls
              </div>
              <h2 className="mt-2 text-2xl font-semibold">Operator Actions</h2>
            </div>
            {busy ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {dashboard?.activeRun?.status}
              </div>
            ) : null}
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            The website only queues allow-listed requests. Your Mac Operator Bridge executes
            the existing AoE2WAR CLI and streams the result back here.
          </p>

          <div className="mt-6 space-y-5">
            <ActionGroup
              title="Safe / Read-only"
              subtitle="No production or documentation mutation."
              actions={readActions}
              disabled={!bridgeOnline || busy}
              submitting={submitting}
              confirmations={confirmations}
              onConfirmation={(action, value) =>
                setConfirmations((current) => ({ ...current, [action]: value }))
              }
              onRun={(action) => void queueAction(action)}
            />
            <ActionGroup
              title="Documentation / Context"
              subtitle="Writes documentation/control-plane state only."
              actions={docsActions}
              disabled={!bridgeOnline || busy}
              submitting={submitting}
              confirmations={confirmations}
              onConfirmation={(action, value) =>
                setConfirmations((current) => ({ ...current, [action]: value }))
              }
              onRun={(action) => void queueAction(action)}
            />
            <ActionGroup
              title="Production"
              subtitle={`Protected release engine · expected source ${shortSha(
                currentSourceSha
              )}`}
              actions={productionActions}
              disabled={!bridgeOnline || busy}
              submitting={submitting}
              confirmations={confirmations}
              onConfirmation={(action, value) =>
                setConfirmations((current) => ({ ...current, [action]: value }))
              }
              onRun={(action) => void queueAction(action)}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] bg-[#030712] shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-6 py-5">
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-slate-500">
                Live run
              </div>
              <h2 className="mt-2 text-xl font-semibold">
                {dashboard?.activeRun
                  ? `${dashboard.activeRun.label} · ${dashboard.activeRun.status}`
                  : "Operator Console"}
              </h2>
            </div>
            {dashboard?.activeRun?.status === "queued" ? (
              <button
                type="button"
                onClick={() => void cancelQueuedRun()}
                disabled={submitting === "cancel"}
                className="rounded-full bg-rose-500/15 px-4 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-50"
              >
                Cancel queued run
              </button>
            ) : null}
          </div>

          {activeRun ? (
            <div className="border-b border-slate-800/70 bg-slate-950/70 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="inline-flex items-center gap-2 font-medium text-cyan-100">
                    {runIsActive ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
                      </span>
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                    )}
                    {runIsActive ? "COMMAND ACTIVE" : activeRun.status.toUpperCase()}
                  </div>

                  <div className="text-slate-500">
                    Elapsed{" "}
                    <span className="font-mono font-semibold tabular-nums text-slate-100">
                      {runElapsed}
                    </span>
                  </div>

                  <div className="text-slate-500">
                    {events.length > 0 ? (
                      <>
                        Last output{" "}
                        <span
                          className={`font-mono tabular-nums ${
                            outputIsFresh ? "text-emerald-300" : "text-amber-200"
                          }`}
                        >
                          {formatElapsed(outputAgeMs)} ago
                        </span>
                      </>
                    ) : (
                      <span className="text-amber-200">Waiting for first output</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-slate-500">
                  <span>
                    <span className="font-mono text-slate-300">{events.length}</span> events
                  </span>
                  {dashboard?.bridge ? (
                    <span>
                      Bridge{" "}
                      <span className={bridgeOnline ? "text-emerald-300" : "text-rose-300"}>
                        seen {relativeAge(dashboard.bridge.lastSeenAt)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              {runIsActive ? (
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900"
                  aria-label="Command is still running"
                  role="progressbar"
                >
                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-cyan-500/25 via-emerald-300 to-cyan-500/25" />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="h-[520px] overflow-y-auto p-5 font-mono text-xs leading-5 text-slate-300">
            {events.length > 0 ? (
              events.map((event) => (
                <div key={event.id} className="grid grid-cols-[72px_1fr] gap-3 py-0.5">
                  <span className="text-slate-600">
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span
                    className={
                      event.kind === "stderr"
                        ? "text-rose-300"
                        : event.kind === "system"
                          ? "text-cyan-200"
                          : "whitespace-pre-wrap"
                    }
                  >
                    {event.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-600">
                <TerminalSquare className="mb-4 h-8 w-8" />
                <div>No command is running.</div>
                <div className="mt-2 max-w-sm text-slate-700">
                  Queue an audit, update plan or protected release action to watch its
                  output here.
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-slate-950/75 p-6 shadow-xl sm:p-7">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-cyan-300" />
            <h2 className="text-xl font-semibold">Source Authorities</h2>
          </div>
          <div className="mt-5 space-y-3">
            {Object.entries(sourceRepos).length ? (
              Object.entries(sourceRepos).map(([name, value]) => {
                const repo = record(value);
                return (
                  <div
                    key={name}
                    className="grid gap-2 rounded-2xl bg-slate-900/70 px-4 py-4 sm:grid-cols-[180px_1fr]"
                  >
                    <div className="font-medium text-white">{name}</div>
                    <div className="text-xs text-slate-400">
                      <div>branch {String(repo.branch ?? "—")}</div>
                      <div className="mt-1 font-mono text-slate-300">
                        {String(repo.head ?? "—")}
                      </div>
                      <div className="mt-1">dirty {String(repo.dirty_count ?? "—")}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-500">No audit snapshot yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] bg-slate-950/75 p-6 shadow-xl sm:p-7">
          <div className="flex items-center gap-3">
            <FileArchive className="h-5 w-5 text-amber-300" />
            <h2 className="text-xl font-semibold">Context Evidence</h2>
          </div>
          <div className="mt-5 space-y-3">
            {Object.entries(archives).length ? (
              Object.entries(archives).map(([name, value]) => {
                const archive = record(value);
                return (
                  <div key={name} className="rounded-2xl bg-slate-900/70 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-white">{name}</div>
                      <div
                        className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                          archive.stale
                            ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
                            : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                        }`}
                      >
                        {archive.stale ? "stale" : "current"}
                      </div>
                    </div>
                    <div className="mt-2 truncate font-mono text-xs text-slate-500">
                      {String(archive.sha256 ?? "—")}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-500">No context snapshot yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] bg-slate-950/75 p-6 shadow-xl sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.32em] text-slate-500">
              Receipts
            </div>
            <h2 className="mt-2 text-xl font-semibold">Recent AoE2WAR OS Runs</h2>
          </div>
          <div className="text-xs text-slate-600">
            store: {dashboard?.storeDir ?? "—"}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.24em] text-slate-600">
              <tr>
                <th className="pb-3 pr-4">When</th>
                <th className="pb-3 pr-4">Action</th>
                <th className="pb-3 pr-4">Risk</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Exit</th>
                <th className="pb-3">Run ID</th>
              </tr>
            </thead>
            <tbody>
              {dashboard?.recentRuns?.map((run) => (
                <tr key={run.id} className="border-t border-slate-800/60">
                  <td className="py-3 pr-4 text-slate-400">
                    {new Date(run.requestedAt).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 font-medium text-white">{run.label}</td>
                  <td className="py-3 pr-4 text-slate-400">{run.risk}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusTone(
                        run.status
                      )}`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-400">{run.exitCode ?? "—"}</td>
                  <td className="py-3 font-mono text-xs text-slate-600">{run.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!dashboard?.recentRuns?.length ? (
            <div className="py-8 text-center text-sm text-slate-600">
              No UI-triggered runs yet.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ActionGroup({
  title,
  subtitle,
  actions,
  disabled,
  submitting,
  confirmations,
  onConfirmation,
  onRun,
}: {
  title: string;
  subtitle: string;
  actions: ActionDefinition[];
  disabled: boolean;
  submitting: string | null;
  confirmations: Record<string, string>;
  onConfirmation: (action: string, value: string) => void;
  onRun: (action: ActionDefinition) => void;
}) {
  if (!actions.length) return null;

  const iconFor = (action: string) => {
    if (action.includes("rollback")) return RotateCcw;
    if (action.includes("deploy")) return UploadCloud;
    if (action.includes("update")) return DatabaseZap;
    if (action === "audit") return ShieldCheck;
    return Play;
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-slate-600">{subtitle}</span>
      </div>
      <div className="mt-3 grid gap-3">
        {actions.map((action) => {
          const Icon = iconFor(action.action);
          const isSubmitting = submitting === action.action;
          return (
            <div key={action.action} className="rounded-2xl bg-slate-900/70 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-slate-950 p-2.5 text-slate-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">{action.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {action.description}
                  </div>

                  {action.confirmation ? (
                    <input
                      value={confirmations[action.action] ?? ""}
                      onChange={(event) =>
                        onConfirmation(action.action, event.target.value)
                      }
                      placeholder={`Type ${action.confirmation}`}
                      className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-1 ring-slate-800 focus:ring-amber-400/40"
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onRun(action)}
                  disabled={
                    disabled ||
                    isSubmitting ||
                    Boolean(
                      action.confirmation &&
                        confirmations[action.action]?.trim() !== action.confirmation
                    )
                  }
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                    action.risk === "production_write"
                      ? "bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                      : action.risk === "docs_write"
                        ? "bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"
                        : "bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25"
                  }`}
                >
                  {isSubmitting ? "Queueing…" : action.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
