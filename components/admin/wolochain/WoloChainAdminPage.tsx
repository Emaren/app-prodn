"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Blocks,
  CircuitBoard,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import type { AdminUsersRailsPayload } from "@/components/admin/command-tower/types";
import type {
  WoloChainAdminBalance,
  WoloChainAdminChallengeRun,
  WoloChainAdminPayload,
} from "@/lib/adminWoloChainTypes";

type LoadState = {
  wolochain: WoloChainAdminPayload | null;
  rails: AdminUsersRailsPayload | null;
  loading: boolean;
  error: string | null;
};

function formatWolo(value: number) {
  return value.toLocaleString();
}

function shorten(value: string | null | undefined, lead = 10, tail = 8) {
  if (!value) return "—";
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function CopyableAddress({
  address,
  lead = 14,
  tail = 10,
}: {
  address: string | null | undefined;
  lead?: number;
  tail?: number;
}) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return <span className="font-mono text-xs text-slate-500">Not configured</span>;
  }

  const fullAddress = address;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={fullAddress}
      className="group inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-left transition hover:border-cyan-200/35 hover:bg-cyan-300/10"
    >
      <span className="truncate font-mono text-xs text-slate-300">
        {shorten(fullAddress, lead, tail)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-slate-500 transition group-hover:text-cyan-100">
        {copied ? <Check className="h-3 w-3 text-emerald-200" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function formatAge(value: number | null) {
  if (value === null) return "unknown";
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
}

function statusTone(kind: "good" | "warn" | "bad" | "muted") {
  switch (kind) {
    case "good":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
    case "warn":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "bad":
      return "border-rose-300/25 bg-rose-400/10 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function capabilityTone(value: string | null | undefined) {
  if (value === "supported" || value === "settlement_service" || value === "executed") {
    return statusTone("good");
  }
  if (
    value === "fallback_to_singles" ||
    value === "auth_required" ||
    value === "unknown" ||
    value === "partial" ||
    value === "dry_run"
  ) {
    return statusTone("warn");
  }
  if (value === "auth_failed" || value === "failed" || value === "unavailable") {
    return statusTone("bad");
  }
  return statusTone("muted");
}

function compactLabel(value: string | null | undefined) {
  if (!value) return "Not configured";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function SummaryTile({
  label,
  value,
  detail,
  tone = "muted",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "bad" | "muted";
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.24)]">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
      <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs ${statusTone(tone)}`}>
        {detail}
      </div>
    </div>
  );
}

function BalanceTile({ balance }: { balance: WoloChainAdminBalance }) {
  const tone =
    balance.status === "ready" ? "good" : balance.status === "error" ? "bad" : "warn";

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            {balance.label}
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">
            {balance.amountWolo || "Unavailable"}
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(tone)}`}>
          {balance.status}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyableAddress address={balance.address} />
        {balance.configSource ? (
          <span className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {balance.configSource}
          </span>
        ) : null}
      </div>
      {balance.detail ? <div className="mt-2 text-xs leading-5 text-slate-400">{balance.detail}</div> : null}
    </div>
  );
}

function BucketCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="text-[11px] uppercase tracking-[0.26em] text-amber-200/70">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{detail}</div>
    </div>
  );
}

function ChallengeRunCard({ run }: { run: WoloChainAdminChallengeRun }) {
  const settlementTone =
    run.settlementReadyAt || ["completed", "no_show_left", "no_show_right", "double_no_show", "refunded"].includes(run.displayState)
      ? "good"
      : run.displayState === "funded" || run.displayState === "ready"
        ? "warn"
        : "muted";
  const fundingWallets = [
    { label: "Creator wallet", address: run.funding.challengerFundingWalletAddress },
    { label: "Opponent wallet", address: run.funding.challengedFundingWalletAddress },
  ];

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            Challenge #{run.id}
          </div>
          <div className="mt-2 truncate text-lg font-semibold text-white">{run.title}</div>
          <div className="mt-1 text-sm text-slate-400">{run.statusDetail}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(settlementTone)}`}>
          {run.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Wolo Wager</div>
          <div className="mt-2 font-semibold text-white">{formatWolo(run.terms.wagerAmountWolo)} WOLO</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Match Guarantee</div>
          <div className="mt-2 font-semibold text-white">{formatWolo(run.terms.guaranteeAmountWolo)} WOLO</div>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/70">Funding Each</div>
          <div className="mt-2 font-semibold text-amber-50">{formatWolo(run.terms.totalFundingWolo)} WOLO</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
        <div>
          Start{" "}
          <TimeDisplayText
            value={run.scheduledAt}
            className="text-slate-200"
            bubbleClassName="max-w-[16rem] text-center"
          />
        </div>
        <div>
          Settlement{" "}
          {run.settlementReadyAt ? (
            <TimeDisplayText
              value={run.settlementReadyAt}
              className="text-slate-200"
              bubbleClassName="max-w-[16rem] text-center"
            />
          ) : (
            <span className="text-slate-500">not ready</span>
          )}
        </div>
      </div>

      {run.funding.challengerFundingWalletAddress || run.funding.challengedFundingWalletAddress ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {fundingWallets.map(({ label, address }) =>
            address ? (
              <div
                key={label}
                className="min-w-0 rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-3"
              >
                <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  {label}
                </div>
                <CopyableAddress address={address} lead={12} tail={8} />
              </div>
            ) : null
          )}
        </div>
      ) : null}

      {run.disposition.label ? (
        <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/60 p-3 text-sm leading-6 text-slate-300">
          <span className="font-semibold text-white">{run.disposition.label}.</span>{" "}
          {run.disposition.guarantee} {run.disposition.wager}
          {run.disposition.treasury ? ` Treasury: ${run.disposition.treasury}.` : ""}
        </div>
      ) : null}
    </div>
  );
}

export default function WoloChainAdminPage() {
  const [state, setState] = useState<LoadState>({
    wolochain: null,
    rails: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const [woloResponse, railsResponse] = await Promise.all([
          fetch("/api/admin/wolochain", { cache: "no-store" }),
          fetch("/api/admin/users/rails", { cache: "no-store" }),
        ]);

        const [woloPayload, railsPayload] = await Promise.all([
          woloResponse.json().catch(() => ({})),
          railsResponse.json().catch(() => ({})),
        ]);

        if (!woloResponse.ok) {
          throw new Error(
            typeof woloPayload.detail === "string"
              ? woloPayload.detail
              : "WoloChain admin data failed to load."
          );
        }

        if (!railsResponse.ok) {
          throw new Error(
            typeof railsPayload.detail === "string"
              ? railsPayload.detail
              : "Settlement rails failed to load."
          );
        }

        if (!active) return;
        setState({
          wolochain: woloPayload as WoloChainAdminPayload,
          rails: railsPayload as AdminUsersRailsPayload,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "WoloChain admin unavailable.",
        }));
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const settlementRuns = useMemo(
    () =>
      (state.rails?.marketRail.rows ?? [])
        .filter(
          (row) =>
            row.settlementRunId ||
            row.settlementStatus ||
            row.settlementFailureCode ||
            row.settlementAttemptedAt ||
            row.settlementExecutedAt
        )
        .slice(0, 8),
    [state.rails?.marketRail.rows]
  );

  const payoutRows = useMemo(
    () =>
      (state.rails?.settlementRail.rows ?? [])
        .filter((row) => row.payoutTxHash || row.payoutProofUrl || row.errorState || row.claimStatus === "pending")
        .slice(0, 10),
    [state.rails?.settlementRail.rows]
  );

  const failureNotes = useMemo(() => {
    const marketFailures =
      state.rails?.marketRail.rows
        .filter((row) => row.settlementFailureCode || row.settlementStatus === "failed" || row.settlementStatus === "partial")
        .map((row) => `${row.title}: ${row.settlementFailureCode || row.settlementDetail || row.settlementStatus}`) ?? [];
    const payoutFailures =
      state.rails?.settlementRail.rows
        .filter((row) => row.errorState)
        .map((row) => `${row.displayPlayerName}: ${row.errorState}`) ?? [];

    return [...(state.wolochain?.warnings ?? []), ...marketFailures, ...payoutFailures].slice(0, 8);
  }, [state.rails?.marketRail.rows, state.rails?.settlementRail.rows, state.wolochain?.warnings]);

  const chainTone = state.wolochain?.chain.healthy
    ? state.wolochain.chain.consensusStatus === "advancing"
      ? "good"
      : "warn"
    : "bad";
  const settlementTone = state.wolochain?.settlementService.settlementServiceConfigured
    ? "good"
    : state.wolochain?.settlementService.localSignerFallbackEnabled
      ? "warn"
      : "bad";

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.13),_transparent_30%),linear-gradient(135deg,_#06111f,_#0f172a_56%,_#020617)] p-8 shadow-[0_24px_70px_rgba(0,0,0,0.36)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <Link
              href="/admin/user-list"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to user ops
            </Link>
            <div className="mt-6 text-xs uppercase tracking-[0.38em] text-cyan-200/70">
              WoloChain Admin
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
              Settlement infrastructure, separated from user ops.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Read-only chain health, settlement capability, balances, payout proof, and scheduled-match economy disposition in one focused operator surface.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-cyan-200/15 bg-cyan-300/10 p-4 text-sm text-cyan-50">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-100/70">
              <CircuitBoard className="h-4 w-4" />
              Phase 1
            </div>
            <div className="mt-2 font-semibold">Read-only control plane</div>
            <div className="mt-1 text-cyan-100/75">No WoloChain writes from this page.</div>
          </div>
        </div>
      </section>

      {state.error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
          {state.error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Chain Status"
          value={state.wolochain?.chain.statusLabel ?? (state.loading ? "Loading" : "Unavailable")}
          detail={
            state.wolochain
              ? `${state.wolochain.chain.sourceLabel} · ${state.wolochain.chain.peers} peers`
              : "Awaiting chain snapshot"
          }
          tone={chainTone}
        />
        <SummaryTile
          label="Settlement Service"
          value={
            state.wolochain
              ? compactLabel(state.wolochain.settlementService.payoutExecutionMode)
              : state.loading
                ? "Loading"
                : "Unavailable"
          }
          detail={
            state.wolochain
              ? compactLabel(state.wolochain.settlementService.groupedRunCapability)
              : "Awaiting settlement probe"
          }
          tone={settlementTone}
        />
        <SummaryTile
          label="Chain ID"
          value={state.wolochain?.chain.chainId ?? "—"}
          detail={state.wolochain?.chain.chainName ?? "Canonical chain"}
        />
        <SummaryTile
          label="Latest Height"
          value={state.wolochain?.chain.latestBlockHeight ?? "—"}
          detail={
            state.wolochain
              ? `last block ${formatAge(state.wolochain.chain.lastBlockAgeSeconds)} ago`
              : "Awaiting RPC"
          }
          tone={chainTone}
        />
      </section>

      {state.wolochain ? (
        <section className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <WalletCards className="h-4 w-4" />
                Balances
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Escrow, payout signer, treasury</h2>
            </div>
            <div className="text-xs text-slate-500">
              Checked{" "}
              <TimeDisplayText
                value={state.wolochain.checkedAt}
                className="text-slate-300"
                bubbleClassName="max-w-[16rem] text-center"
              />
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <BalanceTile balance={state.wolochain.balances.escrow} />
            <BalanceTile balance={state.wolochain.balances.payoutSigner} />
            <BalanceTile balance={state.wolochain.balances.treasury} />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-4">
        <BucketCard
          label="Wolo Wager"
          value="Result money"
          detail="Locks for match-result settlement when both players fund and check in; releases when no match is played."
        />
        <BucketCard
          label="Match Guarantee"
          value="Coordination bond"
          detail="Returns when both players check in; forfeits to the checked-in opponent on a one-sided no-show."
        />
        <BucketCard
          label="Treasury Route"
          value="Double no-show"
          detail="If neither player checks in before start, both Match Guarantees route to Community Treasury."
        />
        <BucketCard
          label="Payout / Refund"
          value="App decision, chain execution"
          detail="AoE2HDBets records disposition; WoloChain primitives verify escrow and execute transfer/refund paths."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.7rem] border border-white/10 bg-black/30 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <Blocks className="h-4 w-4" />
                Recent Settlement Runs
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Market run visibility</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {settlementRuns.length} shown
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {settlementRuns.length ? (
              settlementRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{run.title}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {run.eventLabel || "Market"} · pot {formatWolo(run.totalPotWolo)} WOLO
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${capabilityTone(run.settlementStatus)}`}>
                      {compactLabel(run.settlementStatus || "not_started")}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <div>Run {shorten(run.settlementRunId, 16, 8)}</div>
                    <div>
                      Attempt{" "}
                      {run.settlementAttemptedAt ? (
                        <TimeDisplayText
                          value={run.settlementAttemptedAt}
                          className="text-slate-300"
                          bubbleClassName="max-w-[16rem] text-center"
                        />
                      ) : (
                        <span className="text-slate-500">not started</span>
                      )}
                    </div>
                  </div>
                  {run.settlementDetail || run.settlementFailureCode ? (
                    <div className="mt-3 text-xs leading-5 text-amber-100">
                      {run.settlementFailureCode || run.settlementDetail}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                No grouped or market settlement runs recorded yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-white/10 bg-black/30 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <ShieldCheck className="h-4 w-4" />
                Proof / Tx Visibility
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Payout rail evidence</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {payoutRows.length} rows
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {payoutRows.length ? (
              payoutRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {row.marketTitle || row.eventLabel || row.note || `Settlement #${row.id}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {row.displayPlayerName} · {formatWolo(row.amountWolo)} WOLO
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${capabilityTone(row.settlementMode)}`}>
                      {compactLabel(row.settlementMode)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span className="font-mono text-slate-300">tx {shorten(row.payoutTxHash)}</span>
                    {row.payoutProofUrl ? (
                      <a
                        href={row.payoutProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-200 transition hover:text-cyan-100"
                      >
                        proof <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    <span>
                      created{" "}
                      <TimeDisplayText
                        value={row.createdAt}
                        className="text-slate-300"
                        bubbleClassName="max-w-[16rem] text-center"
                      />
                    </span>
                  </div>
                  {row.errorState ? (
                    <div className="mt-3 text-xs leading-5 text-amber-100">{row.errorState}</div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                No payout tx/proof rows need operator attention.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Banknote className="h-4 w-4" />
              Challenge Settlement Watch
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Scheduled match economy state</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {state.wolochain?.challengeRuns.length ?? 0} tracked
          </span>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {state.wolochain?.challengeRuns.length ? (
            state.wolochain.challengeRuns.map((run) => <ChallengeRunCard key={run.id} run={run} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
              No scheduled-match economy rows are ready for settlement review yet.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-white/10 bg-black/30 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          <AlertTriangle className="h-4 w-4" />
          Recent Warnings / Failures
        </div>
        <div className="mt-4 space-y-2">
          {failureNotes.length ? (
            failureNotes.map((note, index) => (
              <div
                key={`${note}-${index}`}
                className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50"
              >
                {note}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
              No current settlement warnings in the loaded rails.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          <Activity className="h-4 w-4" />
          Capability Matrix
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Grouped runs", state.wolochain?.settlementService.groupedRunCapability],
            ["Escrow verify", state.wolochain?.settlementService.escrowVerifyCapability],
            ["Escrow deposits", state.wolochain?.settlementService.escrowRecentCapability],
            ["Execution mode", state.wolochain?.settlementService.payoutExecutionMode],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
              <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm ${capabilityTone(value)}`}>
                {compactLabel(value)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
