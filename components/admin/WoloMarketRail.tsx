"use client";

import Link from "next/link";

import TimeDisplayText from "@/components/time/TimeDisplayText";

export type MarketRailBettor = {
  userId: number;
  userUid: string;
  displayName: string;
  totalStakeWolo: number;
  slipCount: number;
  executionMode: "app_only" | "onchain_escrow" | "mixed";
  wagerStatus: "active" | "won" | "lost" | "void" | "mixed";
  estimatedPayoutWolo: number;
  stakeWalletAddress: string | null;
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
  payoutWolo: number | null;
  payoutTxHash: string | null;
  payoutProofUrl: string | null;
  recoveryState: "reconciled" | "pending" | "suspect" | "orphaned";
  unresolvedIntentCount: number;
};

export type MarketRailIntent = {
  id: number;
  userUid: string;
  displayName: string;
  side: "left" | "right";
  amountWolo: number;
  status: string;
  walletAddress: string | null;
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
  errorDetail: string | null;
  updatedAt: string;
};

export type MarketRailRow = {
  id: number;
  title: string;
  eventLabel: string;
  status: string;
  featured: boolean;
  leftLabel: string;
  rightLabel: string;
  winnerSide: "left" | "right" | null;
  leftPoolWolo: number;
  rightPoolWolo: number;
  totalPotWolo: number;
  settlementRunId: string | null;
  settlementStatus: string | null;
  settlementFailureCode: string | null;
  settlementDetail: string | null;
  settlementAttemptedAt: string | null;
  settlementExecutedAt: string | null;
  leftBettors: MarketRailBettor[];
  rightBettors: MarketRailBettor[];
  unresolvedIntents: MarketRailIntent[];
};

export type MarketRailSummary = {
  betEscrowMode: "disabled" | "optional" | "required";
  onchainEscrowEnabled: boolean;
  onchainEscrowRequired: boolean;
  escrowConfigError: string | null;
  settlementServiceConfigured: boolean;
  settlementAuthConfigured: boolean;
  settlementExecutionMode: "settlement_service" | "local_signer_fallback" | "unconfigured";
  groupedRunCapability:
    | "supported"
    | "fallback_to_singles"
    | "not_configured"
    | "auth_required"
    | "auth_failed"
    | "unknown";
  escrowVerifyCapability: "supported" | "not_configured" | "unavailable" | "unknown";
  escrowRecentCapability: "supported" | "not_configured" | "unavailable" | "unknown";
  settlementSurfaceWarnings: string[];
  settlementSurfaceDetail: string | null;
  openCount: number;
  liveCount: number;
  pendingSettlementCount: number;
  failedSettlementCount: number;
  unresolvedIntentCount: number;
  totalPotWolo: number;
};

type Props = {
  summary: MarketRailSummary;
  rows: MarketRailRow[];
};

function formatWolo(value: number) {
  return value.toLocaleString();
}

function shortenHash(value: string | null) {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function marketStatusTone(status: string) {
  if (status === "live") return "border-red-400/30 bg-red-500/10 text-red-100";
  if (status === "settled") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (status === "closing") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  return "border-sky-300/30 bg-sky-400/10 text-sky-100";
}

function settlementTone(status: string | null) {
  if (status === "executed") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (status === "partial") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (status === "failed") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  if (status === "dry_run") return "border-sky-300/30 bg-sky-400/10 text-sky-100";
  return "border-white/10 bg-white/5 text-slate-300";
}

function settlementLabel(status: string | null) {
  if (!status) return "Not started";
  if (status === "dry_run") return "Dry run";
  if (status === "executed") return "Executed";
  if (status === "partial") return "Partial";
  if (status === "failed") return "Failed";
  return "Pending";
}

function recoveryTone(state: MarketRailBettor["recoveryState"]) {
  if (state === "reconciled") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (state === "pending") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (state === "orphaned") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100";
}

function executionTone(mode: MarketRailBettor["executionMode"]) {
  if (mode === "onchain_escrow") return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
  if (mode === "mixed") return "border-indigo-400/30 bg-indigo-500/10 text-indigo-100";
  return "border-white/10 bg-white/5 text-slate-300";
}

function escrowTone(summary: MarketRailSummary) {
  if (summary.onchainEscrowRequired && summary.onchainEscrowEnabled) {
    return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
  }
  if (summary.onchainEscrowRequired && !summary.onchainEscrowEnabled) {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }
  if (summary.betEscrowMode === "optional") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }
  return "border-white/10 bg-white/5 text-slate-300";
}

function escrowLabel(summary: MarketRailSummary) {
  if (summary.onchainEscrowRequired && summary.onchainEscrowEnabled) {
    return "Verified escrow required";
  }
  if (summary.onchainEscrowRequired && !summary.onchainEscrowEnabled) {
    return "Escrow required · not ready";
  }
  if (summary.betEscrowMode === "optional" && summary.onchainEscrowEnabled) {
    return "Escrow optional";
  }
  return "App-side fallback";
}

function groupedRunLabel(summary: MarketRailSummary) {
  switch (summary.groupedRunCapability) {
    case "supported":
      return "Grouped settlement ready";
    case "fallback_to_singles":
      return "Grouped settlement missing";
    case "auth_required":
      return "Grouped settlement auth missing";
    case "auth_failed":
      return "Grouped settlement auth failed";
    case "not_configured":
      return "Settlement service not configured";
    default:
      return "Grouped settlement unconfirmed";
  }
}

function groupedRunTone(summary: MarketRailSummary) {
  switch (summary.groupedRunCapability) {
    case "supported":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "fallback_to_singles":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "auth_required":
    case "auth_failed":
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "not_configured":
      return "border-white/10 bg-white/5 text-slate-300";
    default:
      return "border-indigo-400/30 bg-indigo-500/10 text-indigo-100";
  }
}

function PoolSide({
  label,
  winner,
  poolWolo,
  bettors,
}: {
  label: string;
  winner: boolean;
  poolWolo: number;
  bettors: MarketRailBettor[];
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {formatWolo(poolWolo)} WOLO
          </div>
        </div>
        {winner ? (
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-100">
            Winner
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {bettors.length ? (
          bettors.map((bettor) => (
            <div
              key={`${bettor.userId}:${bettor.userUid}:${bettor.totalStakeWolo}`}
              className="rounded-xl border border-white/8 bg-slate-950/70 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/players/${encodeURIComponent(bettor.userUid)}`}
                    className="text-sm font-medium text-white transition hover:text-amber-100"
                  >
                    {bettor.displayName}
                  </Link>
                  <div className="mt-1 text-xs text-slate-400">
                    {formatWolo(bettor.totalStakeWolo)} WOLO across {bettor.slipCount} slip
                    {bettor.slipCount === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    If this side wins: {formatWolo(bettor.estimatedPayoutWolo)} WOLO
                  </div>
                </div>
                <div className="text-right">
                  {bettor.payoutWolo ? (
                    <div className="text-sm font-medium text-emerald-100">
                      paid {formatWolo(bettor.payoutWolo)}
                    </div>
                  ) : null}
                  <div className="mt-1 text-xs text-slate-500">{bettor.wagerStatus}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className={`rounded-full border px-2 py-1 ${executionTone(bettor.executionMode)}`}>
                  {bettor.executionMode === "onchain_escrow"
                    ? "On-chain"
                    : bettor.executionMode === "mixed"
                      ? "Mixed"
                      : "App-only"}
                </span>
                <span className={`rounded-full border px-2 py-1 ${recoveryTone(bettor.recoveryState)}`}>
                  {bettor.recoveryState}
                  {bettor.unresolvedIntentCount > 0 ? ` · ${bettor.unresolvedIntentCount}` : ""}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                {bettor.stakeTxHash ? (
                  <span className="font-mono text-slate-300">
                    stake {shortenHash(bettor.stakeTxHash)}
                  </span>
                ) : null}
                {bettor.stakeProofUrl ? (
                  <a
                    href={bettor.stakeProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-200 transition hover:text-cyan-100"
                  >
                    stake proof
                  </a>
                ) : null}
                {bettor.payoutTxHash ? (
                  <span className="font-mono text-slate-300">
                    payout {shortenHash(bettor.payoutTxHash)}
                  </span>
                ) : null}
                {bettor.payoutProofUrl ? (
                  <a
                    href={bettor.payoutProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-200 transition hover:text-emerald-100"
                  >
                    payout proof
                  </a>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-4 text-sm text-slate-400">
            No side money logged yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function WoloMarketRail({ summary, rows }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300/70">
            WOLO Market Rail
          </div>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Pools, sides, recovery, and settlement in one pass
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Which market is live, who is on each side, how much is staked, and where settlement or recovery is stuck.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 ${escrowTone(summary)}`}>
              {escrowLabel(summary)}
            </span>
            <span className={`rounded-full border px-3 py-1 ${groupedRunTone(summary)}`}>
              {groupedRunLabel(summary)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              Pools exclude unresolved stake intents until they are recorded.
            </span>
          </div>
          {summary.escrowConfigError ? (
            <div className="mt-2 text-sm text-rose-300">{summary.escrowConfigError}</div>
          ) : null}
          {summary.settlementSurfaceDetail ? (
            <div className="mt-2 text-sm text-slate-400">{summary.settlementSurfaceDetail}</div>
          ) : null}
          {summary.settlementSurfaceWarnings.length ? (
            <div className="mt-3 space-y-2">
              {summary.settlementSurfaceWarnings.map((warning, index) => (
                <div
                  key={`${warning}-${index}`}
                  className="rounded-2xl border border-amber-400/20 bg-amber-500/8 px-3 py-2 text-sm text-amber-100"
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-slate-400">Open</div>
            <div className="mt-1 font-medium text-white">{summary.openCount}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-slate-400">Live</div>
            <div className="mt-1 font-medium text-white">{summary.liveCount}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-slate-400">Pot</div>
            <div className="mt-1 font-medium text-white">{formatWolo(summary.totalPotWolo)} WOLO</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-slate-400">Settlement</div>
            <div className="mt-1 font-medium text-white">{summary.pendingSettlementCount} pending</div>
          </div>
          <div className="rounded-2xl border border-rose-400/15 bg-rose-500/5 px-3 py-2">
            <div className="text-slate-400">Failures</div>
            <div className="mt-1 font-medium text-white">{summary.failedSettlementCount}</div>
          </div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 px-3 py-2">
            <div className="text-slate-400">Recovery</div>
            <div className="mt-1 font-medium text-white">{summary.unresolvedIntentCount} unresolved</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {rows.length ? (
          rows.map((market) => (
            <article
              key={market.id}
              className="rounded-[1.6rem] border border-white/8 bg-slate-950/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-white">{market.title}</h3>
                    {market.featured ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                        Featured
                      </span>
                    ) : null}
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${marketStatusTone(market.status)}`}>
                      {market.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{market.eventLabel}</div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full border px-3 py-1 ${settlementTone(market.settlementStatus)}`}>
                    {settlementLabel(market.settlementStatus)}
                  </span>
                  {market.settlementRunId ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                      run {market.settlementRunId}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                    pot {formatWolo(market.totalPotWolo)} WOLO
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Left Pool</div>
                  <div className="mt-2 font-medium text-white">{formatWolo(market.leftPoolWolo)} WOLO</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Right Pool</div>
                  <div className="mt-2 font-medium text-white">{formatWolo(market.rightPoolWolo)} WOLO</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Settlement Attempt</div>
                  <div className="mt-2 font-medium text-white">
                    <TimeDisplayText
                      value={market.settlementAttemptedAt}
                      className="text-white"
                      bubbleClassName="max-w-[16rem] text-center"
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Settlement Execute</div>
                  <div className="mt-2 font-medium text-white">
                    <TimeDisplayText
                      value={market.settlementExecutedAt}
                      className="text-white"
                      bubbleClassName="max-w-[16rem] text-center"
                    />
                  </div>
                </div>
              </div>

              {market.settlementDetail || market.settlementFailureCode ? (
                <div className="mt-4 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <div className="font-medium text-white">
                    {market.settlementFailureCode || "Settlement detail"}
                  </div>
                  <div className="mt-1 text-slate-400">
                    {market.settlementDetail || "No extra detail"}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <PoolSide
                  label={market.leftLabel}
                  winner={market.winnerSide === "left"}
                  poolWolo={market.leftPoolWolo}
                  bettors={market.leftBettors}
                />
                <PoolSide
                  label={market.rightLabel}
                  winner={market.winnerSide === "right"}
                  poolWolo={market.rightPoolWolo}
                  bettors={market.rightBettors}
                />
              </div>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Unresolved Stake Recovery
                </div>
                <div className="mt-3 space-y-2">
                  {market.unresolvedIntents.length ? (
                    market.unresolvedIntents.map((intent) => (
                      <div
                        key={intent.id}
                        className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-white">
                              {intent.displayName} · {intent.side} · {formatWolo(intent.amountWolo)} WOLO
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {intent.status} ·{" "}
                              <TimeDisplayText
                                value={intent.updatedAt}
                                className="text-slate-300"
                                bubbleClassName="max-w-[16rem] text-center"
                              />
                            </div>
                            {intent.errorDetail ? (
                              <div className="mt-1 text-xs text-rose-300">{intent.errorDetail}</div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                            {intent.stakeTxHash ? (
                              <span className="font-mono text-slate-300">
                                {shortenHash(intent.stakeTxHash)}
                              </span>
                            ) : null}
                            {intent.stakeProofUrl ? (
                              <a
                                href={intent.stakeProofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-200 transition hover:text-cyan-100"
                              >
                                stake proof
                              </a>
                            ) : null}
                            <Link
                              href={`/players/${encodeURIComponent(intent.userUid)}`}
                              className="text-amber-100 transition hover:text-amber-50"
                            >
                              player
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-3 py-4 text-sm text-slate-400">
                      No unresolved intents on this market.
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
            No active market telemetry yet.
          </div>
        )}
      </div>
    </section>
  );
}

export default WoloMarketRail;
