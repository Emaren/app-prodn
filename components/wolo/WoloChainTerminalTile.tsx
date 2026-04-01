"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

type WoloStatusSnapshot = {
  healthy: boolean;
  chainId: string;
  moniker: string;
  nodeVersion: string;
  latestBlockHeight: string;
  latestBlockTime: string | null;
  peers: number;
  catchingUp: boolean;
  validatorAddress: string | null;
  latestBlockHash: string | null;
  latestAppHash: string | null;
  source: string;
  terminalLines: string[];
};

type DaemonLogPayload = {
  ok: boolean;
  label: string;
  lines: string[];
};

const RUNTIME_VIEW_KEY = "wolo-runtime-view";

function formatTime(value: string | null) {
  if (!value) return "Waiting on node";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waiting on node";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function prettySource(value: string | undefined) {
  return (value || "https://rpc.aoe2hdbets.com").replace(/^https?:\/\//, "");
}

function shouldToggleFromTarget(target: EventTarget | null) {
  return !(
    target instanceof Element &&
    target.closest("a, button, input, textarea, select, label, [data-no-toggle='true']")
  );
}

export default function WoloChainTerminalTile() {
  const [snapshot, setSnapshot] = useState<WoloStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [daemon, setDaemon] = useState<DaemonLogPayload | null>(null);
  const [premiumRuntimeView, setPremiumRuntimeView] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPremiumRuntimeView(window.localStorage.getItem(RUNTIME_VIEW_KEY) === "premium");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RUNTIME_VIEW_KEY, premiumRuntimeView ? "premium" : "prod");
  }, [premiumRuntimeView]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/wolo/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as
          | WoloStatusSnapshot
          | { detail?: string };

        if (!response.ok) {
          throw new Error(
            typeof payload === "object" &&
              payload &&
              "detail" in payload &&
              typeof payload.detail === "string"
              ? payload.detail
              : "Chain status failed."
          );
        }

        if (!cancelled) {
          setSnapshot(payload as WoloStatusSnapshot);
          setError(null);
        }
      } catch (statusError) {
        if (!cancelled) {
          setError(statusError instanceof Error ? statusError.message : "Chain status failed.");
        }
      }
    }

    async function loadDaemonLog() {
      try {
        const response = await fetch("/api/wolo/daemon-log", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as DaemonLogPayload;

        if (!cancelled) {
          setDaemon(payload);
        }
      } catch {
        if (!cancelled) {
          setDaemon({
            ok: false,
            label: "daemon.log",
            lines: ["[daemon] failed to load daemon log"],
          });
        }
      }
    }

    void loadStatus();
    void loadDaemonLog();

    const interval = window.setInterval(() => {
      void loadStatus();
      void loadDaemonLog();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  function handleRuntimeToggle(event: ReactMouseEvent<HTMLElement>) {
    if (!shouldToggleFromTarget(event.target)) return;
    setPremiumRuntimeView((current) => !current);
  }

  const runtimeLines =
    snapshot?.terminalLines?.length && snapshot.terminalLines.length > 0
      ? snapshot.terminalLines
      : [
          "[boot] dialing chain rail",
          "[boot] waiting for node snapshot",
          error ? `[boot] ${error}` : "[boot] status request in flight",
        ];

  const premiumRuntimeLines =
    snapshot?.terminalLines?.length && snapshot.terminalLines.length > 0
      ? snapshot.terminalLines.slice(0, 10)
      : [
          "[boot] dialing chain rail",
          "[boot] waiting for node snapshot",
          error ? `[boot] ${error}` : "[boot] status request in flight",
          "[boot] chain truth mounted",
        ];

  const daemonLines =
    daemon?.lines?.length && daemon.lines.length > 0
      ? daemon.lines
      : ["[daemon] waiting for log output"];

  if (!premiumRuntimeView) {
    return (
      <div className="space-y-3">
        <section
          onClick={handleRuntimeToggle}
          className="rounded-[1.75rem] border border-white/10 bg-[#050b15] p-5 sm:rounded-[2rem] sm:p-6 lg:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">
                WoloChain Runtime
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RuntimeChip label={`height ${snapshot?.latestBlockHeight || "0"}`} />
                <RuntimeChip label={`peers ${snapshot?.peers ?? 0}`} />
                <RuntimeChip label={snapshot?.catchingUp ? "catching up" : "in sync"} />
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs ${
                snapshot?.healthy
                  ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : "border border-amber-300/25 bg-amber-400/10 text-amber-100"
              }`}
            >
              {snapshot?.healthy ? "Node live" : "Standby"}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <TerminalStat label="Chain ID" value={snapshot?.chainId || "wolo"} />
              <TerminalStat label="Latest Height" value={snapshot?.latestBlockHeight || "0"} />
              <TerminalStat label="Peers" value={String(snapshot?.peers ?? 0)} />
              <TerminalStat
                label="Block Time"
                value={formatTime(snapshot?.latestBlockTime || null)}
                compact
              />
            </div>

            <ConsolePanel
              title={snapshot?.source || "rpc.aoe2hdbets.com"}
              badge={snapshot?.moniker || "WoloChain"}
              lines={runtimeLines}
            />
          </div>
        </section>

        <section
          onClick={handleRuntimeToggle}
          className="rounded-[1.75rem] border border-white/10 bg-[#050b15] p-5 sm:rounded-[2rem] sm:p-6 lg:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">
                WoloChain Daemon
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RuntimeChip label="raw live tail" />
                <RuntimeChip label="last 40 lines" />
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs ${
                daemon?.ok
                  ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : "border border-amber-300/25 bg-amber-400/10 text-amber-100"
              }`}
            >
              {daemon?.ok ? "Streaming" : "Waiting"}
            </div>
          </div>

          <div className="mt-5">
            <ConsolePanel title={daemon?.label || "daemon.log"} badge="local" lines={daemonLines} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section
        onClick={handleRuntimeToggle}
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#040914] px-5 py-5 shadow-[0_35px_120px_rgba(0,0,0,0.32)] sm:px-6 sm:py-6 lg:px-8 lg:py-7"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_22%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_20%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/70">
              WoloChain Runtime
            </div>
            <div className="flex flex-wrap gap-2">
              <PremiumRuntimeChip label={`height ${snapshot?.latestBlockHeight || "0"}`} />
              <PremiumRuntimeChip label={`peers ${snapshot?.peers ?? 0}`} />
              <PremiumRuntimeChip label={snapshot?.catchingUp ? "catching up" : "in sync"} />
            </div>
          </div>

          <div
            className={`rounded-full border px-4 py-2 text-sm ${
              snapshot?.healthy
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                : "border-amber-300/25 bg-amber-400/10 text-amber-100"
            }`}
          >
            {snapshot?.healthy ? "Ready" : "Standby"}
          </div>
        </div>

        <div className="relative mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <PremiumRuntimeStat label="Chain ID" value={snapshot?.chainId || "wolo"} />
            <PremiumRuntimeStat label="Latest Height" value={snapshot?.latestBlockHeight || "0"} />
            <PremiumRuntimeStat label="Peers" value={String(snapshot?.peers ?? 0)} />
            <PremiumRuntimeStat
              label="Block Time"
              value={formatTime(snapshot?.latestBlockTime || null)}
              compact
            />
          </div>

          <PremiumConsolePanel
            title={prettySource(snapshot?.source).toUpperCase()}
            subtitle={`${snapshot?.moniker || "WoloChain"} · wolo1... · uwolo · Fixed Supply`}
            badge={snapshot?.moniker || "WoloChain"}
            lines={premiumRuntimeLines}
          />
        </div>
      </section>

      <section
        onClick={handleRuntimeToggle}
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#040914] px-5 py-5 shadow-[0_35px_120px_rgba(0,0,0,0.32)] sm:px-6 sm:py-6 lg:px-8 lg:py-7"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_22%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_20%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/70">
              WoloChain Daemon
            </div>
            <div className="flex flex-wrap gap-2">
              <PremiumRuntimeChip label="raw live tail" />
              <PremiumRuntimeChip label="last 40 lines" />
            </div>
          </div>

          <div
            className={`rounded-full border px-4 py-2 text-sm ${
              daemon?.ok
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                : "border-amber-300/25 bg-amber-400/10 text-amber-100"
            }`}
          >
            {daemon?.ok ? "Streaming" : "Waiting"}
          </div>
        </div>

        <div className="relative mt-4">
          <PremiumConsolePanel
            title={(daemon?.label || "daemon.log").toUpperCase()}
            subtitle="raw chain output · live local tail"
            badge="local"
            lines={daemonLines}
          />
        </div>
      </section>
    </div>
  );
}

function ConsolePanel({
  title,
  badge,
  lines,
}: {
  title: string;
  badge: string;
  lines: string[];
}) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] bg-[#020712] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.15)]">
      <div className="flex items-center justify-between border-b border-emerald-500/10 px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/70">
          {title}
        </div>
        <div className="text-xs text-emerald-100/70">{badge}</div>
      </div>
      <div className="space-y-2 px-4 py-4 font-mono text-[12px] leading-6 text-emerald-300">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function PremiumConsolePanel({
  title,
  subtitle,
  badge,
  lines,
}: {
  title: string;
  subtitle: string;
  badge: string;
  lines: string[];
}) {
  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-emerald-400/15 bg-[#020712] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]">
      <div className="border-b border-white/6 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/75">
              {title}
            </div>
            <div className="mt-1 text-xs text-slate-400 sm:text-sm">{subtitle}</div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 whitespace-nowrap">
            {badge}
          </div>
        </div>
      </div>

      <div className="space-y-2 px-5 py-4 font-mono text-[12px] leading-6 text-emerald-300 sm:text-[13px]">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function RuntimeChip({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
      {label}
    </div>
  );
}

function TerminalStat({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div
        className={
          compact
            ? "mt-3 text-lg font-semibold text-white"
            : "mt-3 text-3xl font-semibold text-white"
        }
      >
        {value}
      </div>
    </div>
  );
}

function PremiumRuntimeChip({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
      {label}
    </div>
  );
}

function PremiumRuntimeStat({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/5 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div
        className={
          compact
            ? "mt-3 text-lg font-semibold text-white"
            : "mt-3 text-[2rem] font-semibold tracking-tight text-white"
        }
      >
        {value}
      </div>
    </div>
  );
}