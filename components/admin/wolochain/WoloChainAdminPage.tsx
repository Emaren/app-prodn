"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CircuitBoard,
  Check,
  Copy,
  WalletCards,
} from "lucide-react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import type { AdminUsersRailsPayload } from "@/components/admin/command-tower/types";
import WoloMarketRail from "@/components/admin/WoloMarketRail";
import WoloSettlementRail from "@/components/admin/WoloSettlementRail";
import type {
  WoloChainAdminBalance,
  WoloChainAdminChallengeRun,
  WoloChainAdminPayload,
} from "@/lib/adminWoloChainTypes";
import type {
  ScheduledMatchSettlementPlan,
  ScheduledMatchSettlementPlansPayload,
} from "@/lib/scheduledMatchSettlements";

type LoadState = {
  wolochain: WoloChainAdminPayload | null;
  rails: AdminUsersRailsPayload | null;
  scheduledSettlements: ScheduledMatchSettlementPlansPayload | null;
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

function settlementPlanTone(value: ScheduledMatchSettlementPlan["state"]) {
  switch (value) {
    case "executed":
      return statusTone("good");
    case "ready":
    case "funding_recorded":
    case "review_only":
      return statusTone("warn");
    case "blocked":
    case "failed":
      return statusTone("bad");
    default:
      return statusTone("muted");
  }
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

function ScheduledSettlementPlanCard({
  plan,
  busy,
  onExecute,
}: {
  plan: ScheduledMatchSettlementPlan;
  busy: boolean;
  onExecute: (matchId: number) => void;
}) {
  const payoutByRequestId = new Map(
    (plan.dryRun?.payouts ?? []).map((payout) => [payout.requestId, payout])
  );
  const canExecute =
    plan.blockers.length === 0 &&
    plan.transfers.length > 0 &&
    !["executed", "review_only", "no_funding", "funding_recorded"].includes(plan.state);

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            Challenge #{plan.id} escrow settlement
          </div>
          <div className="mt-2 truncate text-lg font-semibold text-white">{plan.title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-400">{plan.stateDetail}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs ${settlementPlanTone(plan.state)}`}>
            {plan.stateLabel}
          </span>
          <button
            type="button"
            disabled={!canExecute || busy}
            onClick={() => onExecute(plan.id)}
            className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-50 transition hover:border-emerald-200/60 hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Executing" : plan.state === "failed" ? "Retry execute" : "Execute"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Funded liability</div>
          <div className="mt-2 font-semibold text-white">{formatWolo(plan.liability.fundedLiabilityWolo)} WOLO</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Refund plan</div>
          <div className="mt-2 font-semibold text-white">{formatWolo(plan.liability.refundWolo)} WOLO</div>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/70">Treasury route</div>
          <div className="mt-2 font-semibold text-amber-50">{formatWolo(plan.liability.treasuryWolo)} WOLO</div>
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/70">Executed</div>
          <div className="mt-2 font-semibold text-emerald-50">{formatWolo(plan.liability.executedWolo)} WOLO</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
        <div>
          Status <span className="text-slate-200">{compactLabel(plan.status)}</span>
        </div>
        <div>
          Settlement ready{" "}
          {plan.settlementReadyAt ? (
            <TimeDisplayText value={plan.settlementReadyAt} className="text-slate-200" />
          ) : (
            <span className="text-slate-500">not stamped</span>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/55 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Dry-run transfer plan</div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${capabilityTone(plan.dryRun?.status)}`}>
            {plan.dryRun ? compactLabel(plan.dryRun.status) : "App plan"}
          </span>
        </div>
        {plan.dryRun?.detail ? (
          <div className="mt-2 text-xs leading-5 text-slate-400">{plan.dryRun.detail}</div>
        ) : null}
        <div className="mt-3 space-y-2">
          {plan.transfers.length ? (
            plan.transfers.map((transfer) => {
              const payout = payoutByRequestId.get(transfer.requestId);
              const txHash = transfer.existingSettlement?.txHash || payout?.txHash || null;
              return (
                <div
                  key={transfer.requestId}
                  className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">
                      {transfer.label} · {formatWolo(transfer.amountWolo)} WOLO
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${capabilityTone(transfer.existingSettlement?.status || payout?.status)}`}>
                      {compactLabel(transfer.existingSettlement?.status || payout?.status || "planned")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{transfer.recipientLabel}</span>
                    <CopyableAddress address={transfer.recipientAddress} lead={10} tail={7} />
                    {txHash ? <span className="text-emerald-200">tx {shorten(txHash)}</span> : null}
                    {transfer.existingSettlement?.errorDetail ? (
                      <span className="text-rose-200">{transfer.existingSettlement.errorDetail}</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
              No executable transfer plan for this match.
            </div>
          )}
        </div>
      </div>

      {plan.blockers.length ? (
        <div className="mt-3 space-y-2">
          {plan.blockers.map((blocker) => (
            <div
              key={blocker}
              className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-50"
            >
              {blocker}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function WoloChainAdminPage() {
  const [state, setState] = useState<LoadState>({
    wolochain: null,
    rails: null,
    scheduledSettlements: null,
    loading: true,
    error: null,
  });
  const [rescindingClaimId, setRescindingClaimId] = useState<number | null>(null);
  const [retryingClaimId, setRetryingClaimId] = useState<number | null>(null);
  const [reconcilingPending, setReconcilingPending] = useState(false);
  const [executingScheduledMatchId, setExecutingScheduledMatchId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }

    try {
      const [woloResponse, railsResponse, scheduledResponse] = await Promise.all([
        fetch("/api/admin/wolochain", { cache: "no-store" }),
        fetch("/api/admin/users/rails", { cache: "no-store" }),
        fetch("/api/admin/wolochain/scheduled-settlements?dryRun=1", { cache: "no-store" }),
      ]);

      const [woloPayload, railsPayload, scheduledPayload] = await Promise.all([
        woloResponse.json().catch(() => ({})),
        railsResponse.json().catch(() => ({})),
        scheduledResponse.json().catch(() => ({})),
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

      setState({
        wolochain: woloPayload as WoloChainAdminPayload,
        rails: railsPayload as AdminUsersRailsPayload,
        scheduledSettlements: scheduledResponse.ok
          ? (scheduledPayload as ScheduledMatchSettlementPlansPayload)
          : null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "WoloChain admin unavailable.",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRescind(claimId: number) {
    const confirmed = window.confirm("Rescind this pending WOLO claim from the AoE2HDBets claim rail?");
    if (!confirmed) return;

    setRescindingClaimId(claimId);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/admin/wolo-claims/${claimId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rescind",
          note: "Rescinded from WoloChain admin operator rail.",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Rescind failed.");
      }
      setActionMessage(`Claim #${claimId} rescinded.`);
      await load(true);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Rescind failed.");
    } finally {
      setRescindingClaimId(null);
    }
  }

  async function handleRetry(claimId: number) {
    setRetryingClaimId(claimId);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/admin/wolo-claims/${claimId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_settlement" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Retry failed.");
      }
      const txHash = typeof payload.txHash === "string" ? payload.txHash : null;
      setActionMessage(`Claim #${claimId} retry completed${txHash ? ` · tx ${shorten(txHash)}` : ""}.`);
      await load(true);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setRetryingClaimId(null);
    }
  }

  async function handleReconcilePending() {
    setReconcilingPending(true);
    setActionMessage(null);
    try {
      const response = await fetch("/api/admin/wolo-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile_pending", take: 25 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Pending sweep failed.");
      }
      const summary =
        payload.summary &&
        typeof payload.summary === "object" &&
        "scannedCount" in payload.summary &&
        "claimedCount" in payload.summary &&
        "failedCount" in payload.summary
          ? (payload.summary as {
              scannedCount: number;
              claimedCount: number;
              failedCount: number;
            })
          : null;
      setActionMessage(
        summary
          ? `Pending sweep scanned ${summary.scannedCount}, claimed ${summary.claimedCount}, failed ${summary.failedCount}.`
          : "Pending sweep completed."
      );
      await load(true);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Pending sweep failed.");
    } finally {
      setReconcilingPending(false);
    }
  }

  async function handleExecuteScheduledSettlement(matchId: number) {
    const confirmed = window.confirm(
      `Execute scheduled-match escrow settlement for challenge #${matchId}?`
    );
    if (!confirmed) return;

    setExecutingScheduledMatchId(matchId);
    setActionMessage(null);
    try {
      const response = await fetch(
        `/api/admin/wolochain/scheduled-settlements/${matchId}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "execute" }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : "Scheduled settlement execution failed."
        );
      }
      const execution =
        payload.execution && typeof payload.execution === "object"
          ? (payload.execution as { status?: string; confirmedPayoutCount?: number })
          : null;
      setActionMessage(
        `Challenge #${matchId} settlement ${compactLabel(execution?.status || "completed")} · ${
          execution?.confirmedPayoutCount ?? 0
        } confirmed transfer(s).`
      );
      await load(true);
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : "Scheduled settlement execution failed."
      );
      await load(true);
    } finally {
      setExecutingScheduledMatchId(null);
    }
  }

  const failureNotes = useMemo(() => {
    const marketFailures =
      state.rails?.marketRail.rows
        .filter((row) => row.settlementFailureCode || row.settlementStatus === "failed" || row.settlementStatus === "partial")
        .map((row) => `${row.title}: ${row.settlementFailureCode || row.settlementDetail || row.settlementStatus}`) ?? [];
    const payoutFailures =
      state.rails?.settlementRail.rows
        .filter((row) => row.errorState)
        .map((row) => `${row.displayPlayerName}: ${row.errorState}`) ?? [];
    const scheduledFailures =
      state.scheduledSettlements?.rows
        .filter((row) => row.state === "blocked" || row.state === "failed")
        .map((row) => `Challenge #${row.id}: ${row.stateDetail}`) ?? [];

    return [...(state.wolochain?.warnings ?? []), ...marketFailures, ...payoutFailures, ...scheduledFailures].slice(0, 8);
  }, [state.rails?.marketRail.rows, state.rails?.settlementRail.rows, state.scheduledSettlements?.rows, state.wolochain?.warnings]);

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
              Chain health, settlement capability, balances, payout proof, claim controls, and scheduled-match economy disposition in one focused operator surface.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-cyan-200/15 bg-cyan-300/10 p-4 text-sm text-cyan-50">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-100/70">
              <CircuitBoard className="h-4 w-4" />
              Operator plane
            </div>
            <div className="mt-2 font-semibold">AoE-side payout controls</div>
            <div className="mt-1 text-cyan-100/75">Visibility plus claim retry/rescind where the app owns the rail.</div>
          </div>
        </div>
      </section>

      {state.error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
          {state.error}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-50">
          {actionMessage}
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
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Escrow, payout signer, treasury
                {state.wolochain.balances.dexLiquidity ? ", DEX liquidity" : ""}
              </h2>
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
          <div
            className={`mt-5 grid gap-3 md:grid-cols-3 ${
              state.wolochain.balances.dexLiquidity ? "xl:grid-cols-4" : ""
            }`}
          >
            <BalanceTile balance={state.wolochain.balances.escrow} />
            <BalanceTile balance={state.wolochain.balances.payoutSigner} />
            <BalanceTile balance={state.wolochain.balances.treasury} />
            {state.wolochain.balances.dexLiquidity ? (
              <BalanceTile balance={state.wolochain.balances.dexLiquidity} />
            ) : null}
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
          detail="Returns when both players check in; missed-side guarantees route to Community Treasury on no-show."
        />
        <BucketCard
          label="Treasury Route"
          value="No-show guarantees"
          detail="One-sided no-show sends the missed guarantee to Treasury; double no-show sends both guarantees."
        />
        <BucketCard
          label="Payout / Refund"
          value="App decision, chain execution"
          detail="AoE2HDBets records disposition; WoloChain primitives verify escrow and execute transfer/refund paths."
        />
      </section>

      {state.rails ? (
        <section className="space-y-6">
          <WoloSettlementRail
            summary={state.rails.settlementRail.summary}
            rows={state.rails.settlementRail.rows}
            rescindingClaimId={rescindingClaimId}
            retryingClaimId={retryingClaimId}
            reconcilingPending={reconcilingPending}
            onRescind={handleRescind}
            onRetry={handleRetry}
            onReconcilePending={handleReconcilePending}
          />
          <WoloMarketRail
            summary={state.rails.marketRail.summary}
            rows={state.rails.marketRail.rows}
          />
        </section>
      ) : null}

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
            {state.scheduledSettlements?.rows.length ?? state.wolochain?.challengeRuns.length ?? 0} tracked
          </span>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {state.scheduledSettlements?.rows.length ? (
            state.scheduledSettlements.rows.map((plan) => (
              <ScheduledSettlementPlanCard
                key={plan.id}
                plan={plan}
                busy={executingScheduledMatchId === plan.id}
                onExecute={handleExecuteScheduledSettlement}
              />
            ))
          ) : state.wolochain?.challengeRuns.length ? (
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
