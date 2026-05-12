"use client";

import { AlertTriangle, Clock3, WalletCards } from "lucide-react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import type {
  WalletFrictionRailPayload,
  WalletFrictionRailRow,
} from "@/lib/adminWalletFriction";

export type {
  WalletFrictionRailPayload,
  WalletFrictionRailRow,
  WalletFrictionRailSummary,
} from "@/lib/adminWalletFriction";

function formatWolo(value: number | null) {
  if (typeof value !== "number") return "Unknown";
  return value.toLocaleString();
}

function compactLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "No wallet";
  if (value.length <= 20) return value;
  return `${value.slice(0, 11)}...${value.slice(-7)}`;
}

function rowTone(row: WalletFrictionRailRow) {
  if (row.walletType === "ledger") {
    return "border-amber-300/18 bg-amber-400/[0.08]";
  }
  if (row.preIntent) {
    return "border-rose-300/18 bg-rose-400/[0.08]";
  }
  return "border-cyan-300/14 bg-cyan-400/[0.06]";
}

function WalletFrictionStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function WalletFrictionRowCard({ row }: { row: WalletFrictionRailRow }) {
  const title =
    row.marketTitle ||
    (typeof row.marketId === "number" ? `Market #${row.marketId}` : "Wallet friction event");
  const sideLabel = row.side ? `${row.side} side` : "side unknown";

  return (
    <article className={`rounded-[1.2rem] border px-4 py-4 ${rowTone(row)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
              {compactLabel(row.step)}
            </span>
            <span className="rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
              {row.preIntent ? "pre-intent" : row.intentStatus ? compactLabel(row.intentStatus) : "intent logged"}
            </span>
            {row.walletType ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-amber-100">
                {compactLabel(row.walletType)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 text-base font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-300">
            {row.userDisplayName} - {sideLabel} - {formatWolo(row.amountWolo)} WOLO
          </div>
          <div className="mt-2 max-w-4xl text-sm leading-6 text-rose-100/90">
            {row.rawError || "Wallet flow failed before the wager was recorded."}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="font-mono">{shortAddress(row.walletAddress)}</span>
            {row.intentId ? <span>intent #{row.intentId}</span> : null}
            {row.marketStatus ? <span>market {compactLabel(row.marketStatus)}</span> : null}
            {row.path ? <span>{row.path}</span> : null}
          </div>
        </div>

        <div className="shrink-0 text-right text-xs text-slate-400">
          <TimeDisplayText
            value={row.createdAt}
            className="text-slate-300"
            bubbleClassName="max-w-[16rem] text-center"
          />
          {row.browserInfo ? (
            <div className="mt-2 max-w-[18rem] truncate text-[11px] text-slate-500" title={row.browserInfo}>
              {row.browserInfo}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function WoloWalletFrictionRail({
  summary,
  rows,
}: WalletFrictionRailPayload) {
  const latestDetail = summary.latestAt ? "latest event loaded" : "no wallet friction logged";

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
            <WalletCards className="h-4 w-4" />
            Wallet friction
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Keplr and Ledger failure breadcrumbs</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Recent wallet failures that blocked or complicated WOLO stake recording. These are app-side
            operator clues, not chain settlement truth.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5" />
            {summary.last24Hours} last 24h
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
            <Clock3 className="h-3.5 w-3.5" />
            {summary.loadedCount} loaded
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <WalletFrictionStat
          label="All Time"
          value={summary.totalCount}
          detail={`${summary.last7Days} in the last 7 days`}
        />
        <WalletFrictionStat
          label="Pre-Intent"
          value={summary.preIntentCount}
          detail="Failed before stake intent creation"
        />
        <WalletFrictionStat
          label="Intent Failures"
          value={summary.intentFailureCount}
          detail="Logged against an existing stake intent"
        />
        <WalletFrictionStat
          label="Wallet Mix"
          value={`${summary.ledgerCount}/${summary.keplrCount}`}
          detail="Ledger / Keplr events in loaded rows"
        />
      </div>

      {summary.topSteps.length ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {summary.topSteps.map((entry) => (
            <span key={entry.step} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {compactLabel(entry.step)} {entry.count}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-300/18 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
          {latestDetail}.
        </div>
      )}

      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row) => <WalletFrictionRowCard key={row.id} row={row} />)
        ) : (
          <div className="rounded-2xl border border-emerald-300/18 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-50">
            No recent wallet-friction events.
          </div>
        )}
      </div>
    </section>
  );
}

export default WoloWalletFrictionRail;
