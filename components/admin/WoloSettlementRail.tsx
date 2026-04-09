"use client";

export type SettlementRailRow = {
  id: number;
  marketId: number | null;
  marketTitle: string | null;
  eventLabel: string | null;
  displayPlayerName: string;
  amountWolo: number;
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
  rescindingClaimId: number | null;
  retryingClaimId: number | null;
  reconcilingPending: boolean;
  onRescind: (claimId: number) => void | Promise<void>;
  onRetry: (claimId: number) => void | Promise<void>;
  onReconcilePending: () => void | Promise<void>;
};

function formatWolo(value: number) {
  return value.toLocaleString();
}

function formatShortDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(mode: SettlementRailRow["settlementMode"]) {
  switch (mode) {
    case "auto_settled":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "claimed_manual":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
    case "rescinded":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
}

function statusLabel(mode: SettlementRailRow["settlementMode"]) {
  switch (mode) {
    case "auto_settled":
      return "Auto-settled";
    case "claimed_manual":
      return "Claimed";
    case "rescinded":
      return "Rescinded";
    default:
      return "Pending";
  }
}

function shortenTxHash(value: string | null) {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function WoloSettlementRail({
  summary,
  rows,
  rescindingClaimId,
  retryingClaimId,
  reconcilingPending,
  onRescind,
  onRetry,
  onReconcilePending,
}: Props) {
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
            Pending, auto-settled, claimed, rescinded, tx hash, and failure breadcrumbs.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <button
            type="button"
            onClick={() => onReconcilePending()}
            disabled={reconcilingPending || summary.pendingCount === 0}
            className="inline-flex items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reconcilingPending ? "Sweeping pending..." : "Sweep pending claims"}
          </button>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-400">Pending</div>
              <div className="mt-1 font-medium text-white">
                {summary.pendingCount} · {formatWolo(summary.pendingAmountWolo)} WOLO
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
                <th className="px-3 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">
                      {row.marketTitle || row.note || `Market #${row.marketId ?? row.id}`}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {row.eventLabel || row.note || "Settlement rail entry"}
                    </div>
                    {row.errorState ? (
                      <div className="mt-2 text-xs text-rose-300">{row.errorState}</div>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{row.displayPlayerName}</div>
                    <div className="mt-1 text-xs text-slate-400">claim #{row.id}</div>
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-medium text-white">
                      {formatWolo(row.amountWolo)} WOLO
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(row.settlementMode)}`}
                    >
                      {statusLabel(row.settlementMode)}
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
                    <div>created {formatShortDate(row.createdAt)}</div>
                    {row.payoutAttemptedAt ? (
                      <div className="mt-1">attempted {formatShortDate(row.payoutAttemptedAt)}</div>
                    ) : null}
                    {row.claimedAt ? (
                      <div className="mt-1">claimed {formatShortDate(row.claimedAt)}</div>
                    ) : null}
                    {row.rescindedAt ? (
                      <div className="mt-1">rescinded {formatShortDate(row.rescindedAt)}</div>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    {row.claimStatus === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        {row.errorState ? (
                          <button
                            type="button"
                            onClick={() => onRetry(row.id)}
                            disabled={retryingClaimId === row.id}
                            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {retryingClaimId === row.id ? "Retrying..." : "Retry payout"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onRescind(row.id)}
                          disabled={rescindingClaimId === row.id}
                          className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {rescindingClaimId === row.id ? "Rescinding..." : "Rescind"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default WoloSettlementRail;
