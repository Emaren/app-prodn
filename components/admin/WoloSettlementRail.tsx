"use client";

import TimeDisplayText from "@/components/time/TimeDisplayText";

type FounderBonusType = "participants" | "winner";

export type SettlementRailRow = {
  id: number;
  marketId: number | null;
  marketTitle: string | null;
  eventLabel: string | null;
  winnerName: string | null;
  displayPlayerName: string;
  amountWolo: number;
  claimKind: string;
  targetScope: string | null;
  sourceFounderBonusId: number | null;
  sourceGameStatsId: number | null;
  claimStatus: "pending" | "claimed" | "rescinded";
  settlementMode: "pending" | "auto_settled" | "claimed_manual" | "rescinded";
  payoutTxHash: string | null;
  payoutProofUrl: string | null;
  errorState: string | null;
  note: string | null;
  payoutAttemptedAt: string | null;
  createdAt: string;
  claimedAt: string | null;
  rescindedAt: string | null;
};

export type SettlementRailSummary = {
  totalCount: number;
  totalAmountWolo: number;
  pendingCount: number;
  pendingAmountWolo: number;
  claimedCount: number;
  claimedAmountWolo: number;
  rescindedCount: number;
  rescindedAmountWolo: number;
  autoSettledCount: number;
  autoSettledAmountWolo: number;
  failedCount: number;
  failedAmountWolo: number;
};

type Props = {
  summary: SettlementRailSummary;
  rows: SettlementRailRow[];
  readOnly?: boolean;
  rescindingClaimId?: number | null;
  retryingClaimId?: number | null;
  reconcilingPending?: boolean;
  onRescind?: (claimId: number) => void | Promise<void>;
  onRetry?: (claimId: number) => void | Promise<void>;
  onReconcilePending?: () => void | Promise<void>;
  onAddFounderBonus?: (row: SettlementRailRow, bonusType: FounderBonusType) => void | Promise<void>;
  payoutExecutionConfigured?: boolean;
};

function formatWolo(value: number) {
  return value.toLocaleString();
}

function isFounderClaim(row: SettlementRailRow) {
  return row.claimKind === "founders_bonus" || row.claimKind === "founders_win";
}

function isAwaitingWalletLink(row: SettlementRailRow) {
  return (
    row.claimStatus === "pending" &&
    Boolean(row.errorState) &&
    /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
      row.errorState || ""
    )
  );
}

function isSettlementUnavailableDetail(value: string | null | undefined) {
  return /settlement.*not configured|settlement_health|payout_fee_headroom_too_low|escrow_balance_too_low|payout execution.*not configured|service.*unconfigured|signer.*missing|signers unavailable|127\.0\.0\.1:8092|127\.0\.0\.1:8091|wolo-testnet/i.test(
    value || ""
  );
}

function isSettlementUnavailable(row: SettlementRailRow, payoutExecutionConfigured: boolean) {
  return (
    row.claimStatus === "pending" &&
    !isAwaitingWalletLink(row) &&
    (!payoutExecutionConfigured || isSettlementUnavailableDetail(row.errorState))
  );
}

function requiresAdminReview(row: SettlementRailRow) {
  if (row.claimStatus !== "pending") return false;
  const detail = `${row.errorState || ""} ${row.note || ""}`.trim();
  if (!detail) return false;
  if (/fresh payout|retry fresh|fresh 1000/i.test(detail)) return false;
  return /admin review|review required|duplicate.*(?:tx|market)|single-send|duplicate-paid|duplicate_tx_hash/i.test(
    detail
  );
}

function isRetryableSettlementFailure(row: SettlementRailRow) {
  return (
    row.claimStatus === "pending" &&
    Boolean(row.errorState) &&
    !requiresAdminReview(row) &&
    !isAwaitingWalletLink(row) &&
    !isSettlementUnavailableDetail(row.errorState)
  );
}

function pendingDetail(row: SettlementRailRow, payoutExecutionConfigured: boolean) {
  if (isAwaitingWalletLink(row)) {
    return "Player must sign in and link a verified WOLO wallet before this payout can run.";
  }
  if (isSettlementUnavailable(row, payoutExecutionConfigured)) {
    return (
      row.errorState ||
      "Settlement service/signers unavailable: wolo-1 payouts require the mainnet settlement service on 127.0.0.1:8092 or an explicit mainnet Bet Payout signer. Do not retry against 127.0.0.1:8091; that is wolo-testnet."
    );
  }
  return row.errorState;
}

function statusTone(
  mode:
    | SettlementRailRow["settlementMode"]
    | "paid"
    | "retryable_failure"
    | "awaiting_wallet_link"
    | "settlement_unavailable"
    | "review_required"
  ) {
  switch (mode) {
    case "paid":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "awaiting_wallet_link":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "settlement_unavailable":
      return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
    case "retryable_failure":
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "review_required":
      return "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100";
    case "rescinded":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
}

function statusLabel(
  mode:
    | SettlementRailRow["settlementMode"]
    | "paid"
    | "retryable_failure"
    | "awaiting_wallet_link"
    | "settlement_unavailable"
    | "review_required"
  ) {
  switch (mode) {
    case "paid":
      return "Paid";
    case "awaiting_wallet_link":
      return "Pending wallet link";
    case "settlement_unavailable":
      return "Settlement service/signers unavailable";
    case "retryable_failure":
      return "Retryable settlement failure";
    case "review_required":
      return "Admin review required";
    case "rescinded":
      return "Rescinded";
    default:
      return "Pending";
  }
}

function claimKindLabel(row: SettlementRailRow) {
  switch (row.claimKind) {
    case "founders_bonus":
      return "Founders Bonus";
    case "founders_win":
      return "Founders Win";
    case "winner_bounty":
      return "Winner bounty";
    case "bet_refund":
      return "Refund";
    default:
      return "Winner payout";
  }
}

function targetScopeLabel(value: string | null) {
  if (value === "both_participants") return "both participants";
  if (value === "winner_only") return "winner only";
  return "matched target";
}

function claimKindTone(row: SettlementRailRow) {
  if (row.claimKind === "founders_bonus") {
    return "border-amber-300/20 bg-amber-400/10 text-amber-100";
  }
  if (row.claimKind === "founders_win") {
    return "border-sky-300/20 bg-sky-400/10 text-sky-100";
  }
  if (row.claimKind === "bet_refund") {
    return "border-indigo-300/20 bg-indigo-400/10 text-indigo-100";
  }
  if (row.claimKind === "winner_bounty") {
    return "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100";
  }
  return "border-white/10 bg-white/5 text-slate-200";
}

function shortenTxHash(value: string | null) {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function WoloSettlementRail({
  summary,
  rows,
  readOnly = false,
  rescindingClaimId = null,
  retryingClaimId = null,
  reconcilingPending = false,
  onRescind,
  onRetry,
  onReconcilePending,
  onAddFounderBonus,
  payoutExecutionConfigured = true,
}: Props) {
  const showActions = !readOnly && Boolean(onRescind || onRetry || onAddFounderBonus);
  const founderRowsByBonusId = new Map<number, SettlementRailRow[]>();

  for (const row of rows) {
    if (!row.sourceFounderBonusId || !isFounderClaim(row)) {
      continue;
    }
    const bucket = founderRowsByBonusId.get(row.sourceFounderBonusId) ?? [];
    bucket.push(row);
    founderRowsByBonusId.set(row.sourceFounderBonusId, bucket);
  }

  const founderGroupState = new Map<number, "partial" | "settled" | "pending" | "rescinded">();

  for (const [bonusId, founderRows] of founderRowsByBonusId.entries()) {
    const claimedCount = founderRows.filter((row) => row.claimStatus === "claimed").length;
    const pendingCount = founderRows.filter((row) => row.claimStatus === "pending").length;
    const rescindedCount = founderRows.filter((row) => row.claimStatus === "rescinded").length;

    if (claimedCount > 0 && claimedCount < founderRows.length) {
      founderGroupState.set(bonusId, "partial");
      continue;
    }

    if (claimedCount === founderRows.length) {
      founderGroupState.set(bonusId, "settled");
      continue;
    }

    if (rescindedCount === founderRows.length) {
      founderGroupState.set(bonusId, "rescinded");
      continue;
    }

    if (pendingCount > 0) {
      founderGroupState.set(bonusId, "pending");
    }
  }

  const pendingWalletLinkRows = rows.filter(
    (row) => row.claimStatus === "pending" && isAwaitingWalletLink(row)
  );
  const pendingWalletLinkAmountWolo = pendingWalletLinkRows.reduce(
    (total, row) => total + row.amountWolo,
    0
  );
  const pendingWalletPlayerTotals = new Map<string, { rows: number; amountWolo: number }>();

  for (const row of pendingWalletLinkRows) {
    const playerName = row.displayPlayerName || "Unknown player";
    const current = pendingWalletPlayerTotals.get(playerName) ?? { rows: 0, amountWolo: 0 };
    pendingWalletPlayerTotals.set(playerName, {
      rows: current.rows + 1,
      amountWolo: current.amountWolo + row.amountWolo,
    });
  }

  const pendingWalletLinkPlayerCount = pendingWalletPlayerTotals.size;
  const topPendingWalletPlayers = Array.from(pendingWalletPlayerTotals.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((left, right) => right.amountWolo - left.amountWolo || right.rows - left.rows)
    .slice(0, 4);

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300/70">
            WOLO Settlement Rail
          </div>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Actual payout state, not vibes
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Wallet-link waits, settled payouts, rescinds, tx proof, and failure breadcrumbs.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {!readOnly && onReconcilePending ? (
            <button
              type="button"
              onClick={() => onReconcilePending()}
              disabled={reconcilingPending || summary.pendingCount === 0}
              className="inline-flex items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reconcilingPending ? "Sweeping pending..." : "Sweep pending claims"}
            </button>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2">
              <div className="text-amber-200">Pending wallet links</div>
              <div className="mt-1 font-medium text-white">
                {summary.pendingCount} · {formatWolo(summary.pendingAmountWolo)} WOLO
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-amber-200/70">
                {pendingWalletLinkPlayerCount} player{pendingWalletLinkPlayerCount === 1 ? "" : "s"} waiting
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-400">Auto-settled</div>
              <div className="mt-1 font-medium text-white">
                {summary.autoSettledCount} · {formatWolo(summary.autoSettledAmountWolo)} WOLO
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-400">Claimed</div>
              <div className="mt-1 font-medium text-white">
                {summary.claimedCount} · {formatWolo(summary.claimedAmountWolo)} WOLO
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-400">Rescinded</div>
              <div className="mt-1 font-medium text-white">
                {summary.rescindedCount} · {formatWolo(summary.rescindedAmountWolo)} WOLO
              </div>
            </div>
            <div className="rounded-2xl border border-rose-400/15 bg-rose-500/5 px-3 py-2">
              <div className="text-slate-400">Failures</div>
              <div className="mt-1 font-medium text-white">
                {summary.failedCount} · {formatWolo(summary.failedAmountWolo)} WOLO
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-400">All</div>
              <div className="mt-1 font-medium text-white">
                {summary.totalCount} · {formatWolo(summary.totalAmountWolo)} WOLO
              </div>
            </div>
          </div>

          {topPendingWalletPlayers.length > 0 ? (
            <div className="w-full max-w-xl rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                    Pending wallet links
                  </div>
                  <div className="mt-1 font-medium text-white">
                    {pendingWalletLinkRows.length} claims · {formatWolo(pendingWalletLinkAmountWolo)} WOLO
                  </div>
                </div>
                <div className="rounded-full border border-amber-200/20 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100">
                  player action needed
                </div>
              </div>

              <div className="mt-3 grid gap-1.5">
                {topPendingWalletPlayers.map((player) => (
                  <div
                    key={player.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <span className="truncate text-slate-100">{player.name}</span>
                    <span className="shrink-0 font-medium text-amber-100">
                      {formatWolo(player.amountWolo)} WOLO
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
          No settlement rows yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Market</th>
                <th className="px-3 py-3 font-medium">Winner</th>
                <th className="px-3 py-3 font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">State</th>
                <th className="px-3 py-3 font-medium">Tx</th>
                <th className="px-3 py-3 font-medium">Time</th>
                {showActions ? <th className="px-3 py-3 font-medium">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => {
                const founderState =
                  row.sourceFounderBonusId != null
                    ? founderGroupState.get(row.sourceFounderBonusId) ?? null
                    : null;
                const compositeState =
                  row.claimStatus === "claimed"
                    ? "paid"
                    : row.claimStatus === "rescinded"
                      ? "rescinded"
                      : isAwaitingWalletLink(row)
                        ? "awaiting_wallet_link"
                        : isSettlementUnavailable(row, payoutExecutionConfigured)
                          ? "settlement_unavailable"
                          : requiresAdminReview(row)
                            ? "review_required"
                          : isRetryableSettlementFailure(row)
                          ? "retryable_failure"
                          : row.settlementMode;

                return (
                  <tr key={row.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">
                      {row.marketTitle || row.note || `Market #${row.marketId ?? row.id}`}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {row.eventLabel || row.note || "Settlement rail entry"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${claimKindTone(row)}`}
                      >
                        {claimKindLabel(row)}
                      </span>
                      {(row.claimKind === "founders_bonus" || row.claimKind === "founders_win") && row.targetScope ? (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
                          {targetScopeLabel(row.targetScope)}
                        </span>
                      ) : null}
                      {founderState === "partial" ? (
                        <span className="inline-flex rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-fuchsia-100">
                          Partial founder bonus
                        </span>
                      ) : null}
                      {founderState === "partial" && row.claimStatus === "claimed" ? (
                        <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-emerald-100">
                          Paid side
                        </span>
                      ) : null}
                      {isAwaitingWalletLink(row) ? (
                        <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-amber-100">
                          Pending wallet link
                        </span>
                      ) : null}
                      {isRetryableSettlementFailure(row) ? (
                        <span className="inline-flex rounded-full border border-rose-300/20 bg-rose-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-rose-100">
                          Retryable settlement failure
                        </span>
                      ) : null}
                      {requiresAdminReview(row) ? (
                        <span className="inline-flex rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-fuchsia-100">
                          Duplicate guard review
                        </span>
                      ) : null}
                      {isSettlementUnavailable(row, payoutExecutionConfigured) ? (
                        <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-cyan-100">
                          Settlement service/signers unavailable
                        </span>
                      ) : null}
                    </div>
                    {pendingDetail(row, payoutExecutionConfigured) ? (
                      <div
                        className={`mt-2 text-xs ${
                          isAwaitingWalletLink(row)
                            ? "text-amber-200"
                            : isSettlementUnavailable(row, payoutExecutionConfigured)
                              ? "text-cyan-100"
                              : "text-rose-300"
                        }`}
                      >
                        {pendingDetail(row, payoutExecutionConfigured)}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{row.winnerName || "—"}</div>
                    <div className="mt-1 text-xs text-slate-400">target {row.displayPlayerName}</div>
                    <div className="mt-1 text-xs text-slate-500">claim #{row.id}</div>
                    {row.sourceGameStatsId ? (
                      <div className="mt-1 text-xs text-slate-500">game #{row.sourceGameStatsId}</div>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-medium text-white">
                      {formatWolo(row.amountWolo)} WOLO
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(compositeState)}`}
                    >
                      {statusLabel(compositeState)}
                    </span>
                    <div className="mt-2 text-xs text-slate-400">raw: {row.claimStatus}</div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-mono text-xs text-slate-300">
                      {shortenTxHash(row.payoutTxHash)}
                    </div>
                    {row.payoutProofUrl ? (
                      <a
                        href={row.payoutProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-cyan-200 transition hover:text-cyan-100"
                      >
                        proof
                      </a>
                    ) : null}
                  </td>

                  <td className="px-3 py-3 text-xs text-slate-400">
                    <div>
                      created{" "}
                      <TimeDisplayText
                        value={row.createdAt}
                        className="text-slate-300"
                        bubbleClassName="max-w-[16rem] text-center"
                      />
                    </div>
                    {row.payoutAttemptedAt ? (
                      <div className="mt-1">
                        {isAwaitingWalletLink(row) ? "checked" : "attempted"}{" "}
                        <TimeDisplayText
                          value={row.payoutAttemptedAt}
                          className="text-slate-300"
                          bubbleClassName="max-w-[16rem] text-center"
                        />
                      </div>
                    ) : null}
                    {row.claimedAt ? (
                      <div className="mt-1">
                        claimed{" "}
                        <TimeDisplayText
                          value={row.claimedAt}
                          className="text-slate-300"
                          bubbleClassName="max-w-[16rem] text-center"
                        />
                      </div>
                    ) : null}
                    {row.rescindedAt ? (
                      <div className="mt-1">
                        rescinded{" "}
                        <TimeDisplayText
                          value={row.rescindedAt}
                          className="text-slate-300"
                          bubbleClassName="max-w-[16rem] text-center"
                        />
                      </div>
                    ) : null}
                  </td>

                  {showActions ? (
                    <td className="px-3 py-3">
                      {row.claimStatus === "pending" ? (
                        <div className="flex flex-wrap gap-2">
                          {row.errorState &&
                          onRetry &&
                          payoutExecutionConfigured &&
                          !requiresAdminReview(row) &&
                          !isAwaitingWalletLink(row) &&
                          !isSettlementUnavailable(row, payoutExecutionConfigured) ? (
                            <button
                              type="button"
                              onClick={() => onRetry(row.id)}
                              disabled={retryingClaimId === row.id}
                              className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {retryingClaimId === row.id
                                ? "Retrying..."
                                  : isAwaitingWalletLink(row)
                                    ? "Retry after link"
                                    : "Retry payout"}
                            </button>
                          ) : null}
                          {onRetry && isAwaitingWalletLink(row) ? (
                            <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100">
                              Waiting on player link
                            </span>
                          ) : null}
                          {onRetry && isSettlementUnavailable(row, payoutExecutionConfigured) ? (
                            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
                              Configure mainnet settlement
                            </span>
                          ) : null}
                          {requiresAdminReview(row) ? (
                            <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-3 py-1.5 text-xs font-medium text-fuchsia-100">
                              Review before retry
                            </span>
                          ) : null}
                          {row.marketId && onAddFounderBonus ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onAddFounderBonus(row, "participants")}
                                className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20"
                              >
                                Add Founders Bonus
                              </button>
                              <button
                                type="button"
                                onClick={() => onAddFounderBonus(row, "winner")}
                                className="rounded-full border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20"
                              >
                                Add Founders Win
                              </button>
                            </>
                          ) : null}
                          {onRescind ? (
                            <button
                              type="button"
                              onClick={() => onRescind(row.id)}
                              disabled={rescindingClaimId === row.id}
                              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {rescindingClaimId === row.id ? "Rescinding..." : "Rescind"}
                            </button>
                          ) : null}
                        </div>
                      ) : row.marketId && onAddFounderBonus ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onAddFounderBonus(row, "participants")}
                            className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20"
                          >
                            Add Founders Bonus
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddFounderBonus(row, "winner")}
                            className="rounded-full border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20"
                          >
                            Add Founders Win
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default WoloSettlementRail;
