import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import type {
  WoloRecoveryActionType,
  WoloRecoveryAppStatus,
  WoloRecoveryRow,
  WoloTransactionRecoveryDashboard,
} from "@/lib/woloTransactionRecovery";
import {
  WOLO_RECOVERY_ACTION_LABELS,
  WOLO_RECOVERY_STATUS_LABELS,
} from "@/lib/woloTransactionRecovery";
import WoloTransferBackfillButton from "./WoloTransferBackfillButton";

type Props = {
  data: WoloTransactionRecoveryDashboard;
};

const STATUS_FILTERS: Array<WoloRecoveryAppStatus | "all"> = [
  "all",
  "needs_review",
  "pending",
  "failed",
  "confirmed",
  "reconciled",
];

const ACTION_FILTERS: Array<WoloRecoveryActionType | "all"> = [
  "all",
  "faucet_claim",
  "stake",
  "unstake",
  "bet_challenge_escrow",
  "payout_settlement",
  "other",
];

function formatNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortHash(value: string | null | undefined) {
  if (!value) return "no tx hash";
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "not tracked";
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function statusTone(status: WoloRecoveryAppStatus) {
  switch (status) {
    case "confirmed":
    case "reconciled":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
    case "pending":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "failed":
      return "border-rose-300/25 bg-rose-400/10 text-rose-100";
    default:
      return "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100";
  }
}

function chainTone(row: WoloRecoveryRow) {
  if (row.chain.status === "found" && row.chain.success) {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }
  if (row.chain.status === "found" && row.chain.success === false) {
    return "border-rose-300/25 bg-rose-400/10 text-rose-100";
  }
  if (row.chain.status === "not_found") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  }
  if (row.chain.status === "unavailable") {
    return "border-slate-400/25 bg-slate-400/10 text-slate-200";
  }
  return "border-white/10 bg-white/5 text-slate-300";
}

function chainLabel(row: WoloRecoveryRow) {
  if (row.chain.status === "found") {
    return row.chain.success ? "found / success" : `found / code ${row.chain.code ?? "?"}`;
  }
  if (row.chain.status === "not_found") return "not found";
  if (row.chain.status === "unavailable") return "lookup unavailable";
  return "not checked";
}

function buildHref({
  status,
  actionType,
  query,
}: {
  status?: WoloRecoveryAppStatus | "all";
  actionType?: WoloRecoveryActionType | "all";
  query?: string;
}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (actionType && actionType !== "all") params.set("type", actionType);
  if (query) params.set("q", query);
  const suffix = params.toString();
  return suffix ? `/admin/wolo-transactions?${suffix}` : "/admin/wolo-transactions";
}

function FilterLink({
  active,
  href,
  label,
  count,
}: {
  active: boolean;
  href: string;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-cyan-200/50 bg-cyan-400/15 text-cyan-50"
          : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-200/35 hover:text-white"
      }`}
    >
      {label}
      {typeof count === "number" ? (
        <span className="rounded-full bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-slate-300">
          {formatNumber(count)}
        </span>
      ) : null}
    </Link>
  );
}

function TxRow({ row }: { row: WoloRecoveryRow }) {
  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(row.appStatus)}`}>
              {WOLO_RECOVERY_STATUS_LABELS[row.appStatus]}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${chainTone(row)}`}>
              {chainLabel(row)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              {WOLO_RECOVERY_ACTION_LABELS[row.actionType]}
            </span>
          </div>

          <h2 className="mt-3 text-lg font-semibold text-white">{row.actionLabel}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{row.appStatusDetail}</p>
        </div>

        <div className="text-right text-xs text-slate-400">
          <div>created {formatDate(row.createdAt)}</div>
          <div>updated {formatDate(row.updatedAt)}</div>
          <div>checked {formatDate(row.lastCheckedAt)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr_1fr]">
        <div className="rounded-lg border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase text-slate-500">Transaction</div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 font-mono text-sm text-white">
            <span className="break-all">{shortHash(row.txHash)}</span>
            {row.txUrl ? (
              <a
                href={row.txUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100"
              >
                REST <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {row.chain.height ? (
            <div className="mt-2 text-xs text-slate-400">height {row.chain.height}</div>
          ) : null}
          {row.chain.rawLogSummary ? (
            <div className="mt-2 break-words text-xs leading-5 text-slate-400">
              {row.chain.rawLogSummary}
            </div>
          ) : null}
          {row.chain.detail ? (
            <div className="mt-2 text-xs leading-5 text-amber-100/80">{row.chain.detail}</div>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase text-slate-500">User</div>
          <div className="mt-2 text-sm font-medium text-white">
            {row.user?.displayName ?? "not linked"}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {row.user?.uid ?? "no user uid"}
          </div>
        </div>

        <div className="rounded-lg border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase text-slate-500">Wallet</div>
          <div className="mt-2 break-all font-mono text-xs text-slate-200">
            {shortAddress(row.walletAddress)}
          </div>
          <div className="mt-2 text-xs text-slate-400">{formatNumber(row.amountWolo)} WOLO</div>
        </div>

        <div className="rounded-lg border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase text-slate-500">Source</div>
          <div className="mt-2 break-words text-sm text-white">{row.contextLabel}</div>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {row.source} · {row.sourceId}
          </div>
        </div>
      </div>
    </article>
  );
}

function DirectTransferRow({
  row,
}: {
  row: WoloTransactionRecoveryDashboard["indexedTransfers"]["rows"][number];
}) {
  const sender = row.senderLabel || shortAddress(row.senderAddress);
  const recipient = row.recipientLabel || shortAddress(row.recipientAddress);

  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-100">
              direct transfer
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              {row.amountLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              height {row.height}
            </span>
          </div>
          <h3 className="mt-3 break-words text-base font-semibold text-white">
            {sender} {"->"} {recipient}
          </h3>
          <div className="mt-1 font-mono text-xs text-slate-500">{shortHash(row.txHash)}</div>
          {row.memo ? (
            <p className="mt-2 text-sm leading-5 text-slate-400">memo: {row.memo}</p>
          ) : null}
        </div>
        <div className="text-right text-xs text-slate-400">{formatDate(row.timestamp)}</div>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <div className="rounded-lg border border-white/8 bg-white/5 p-3">
          <div className="uppercase text-slate-500">Sender</div>
          <div className="mt-1 break-all font-mono text-slate-300">{row.senderAddress}</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/5 p-3">
          <div className="uppercase text-slate-500">Recipient</div>
          <div className="mt-1 break-all font-mono text-slate-300">{row.recipientAddress}</div>
        </div>
      </div>
    </article>
  );
}

export default function WoloTransactionRecoveryDashboard({ data }: Props) {
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.15),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.12),_transparent_28%),linear-gradient(135deg,_#020617,_#0f172a_52%,_#111827)] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/wolochain"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-200/40 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                WoloChain admin
              </Link>
              <Link
                href="/admin/user-list"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-200/40 hover:text-white"
              >
                User ops
              </Link>
            </div>
            <div className="mt-5 text-xs uppercase tracking-[0.35em] text-cyan-100/70">
              WOLO Recovery Diagnostics
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
              Signed tx visibility without touching funds
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Find app records that have tx hashes, check whether WoloChain can see them, and flag
              pending app state that needs reconciliation through existing safe rails.
            </p>
          </div>
          <div className="rounded-lg border border-cyan-200/15 bg-cyan-300/10 p-4 text-sm text-cyan-50">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-100/70">
              <ShieldCheck className="h-4 w-4" />
              Read-only
            </div>
            <div className="mt-2 font-semibold">No replay, no transfer, no chain mutation</div>
            <div className="mt-1 text-cyan-100/75">Generated {formatDate(data.generatedAt)}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
              <AlertTriangle className="h-4 w-4" />
              Needs review
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{data.summary.needsReview}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
              <WalletCards className="h-4 w-4" />
              Pending
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{data.summary.pending}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
              <CheckCircle2 className="h-4 w-4" />
              Chain found
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{data.summary.chainFound}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
              <Database className="h-4 w-4" />
              Checked
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{data.summary.checkedTxHashes}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
              <Filter className="h-4 w-4" />
              Rows
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{data.summary.totalRows}</div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-emerald-300/15 bg-[linear-gradient(135deg,rgba(6,20,18,0.86),rgba(2,6,23,0.96))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-emerald-100/65">
              Mainnet Bank Sends
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Indexed direct transfers</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Successful wolo-1 MsgSend transfers cached from WoloChain REST tx search. This is a
              read-only scan and does not replay, send, or settle funds.
            </p>
          </div>
          <WoloTransferBackfillButton />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="text-[11px] uppercase text-slate-500">Cached transfers</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {formatNumber(data.indexedTransfers.totalRows)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="text-[11px] uppercase text-slate-500">Latest transfer</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {formatDate(data.indexedTransfers.latestTimestamp)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
            <div className="text-[11px] uppercase text-slate-500">Source</div>
            <div className="mt-2 break-words font-mono text-sm text-slate-200">
              {data.indexedTransfers.source}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {data.indexedTransfers.notes.map((note) => (
            <div key={note} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">
              {note}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {data.indexedTransfers.rows.length > 0 ? (
            data.indexedTransfers.rows.map((row) => (
              <DirectTransferRow key={row.key} row={row} />
            ))
          ) : (
            <div className="rounded-lg border border-white/10 bg-slate-950/60 px-4 py-6 text-sm text-slate-400 xl:col-span-2">
              No direct bank-send transfers are cached yet. Run the capped read-only backfill.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
        <form className="grid gap-3 lg:grid-cols-[1fr_auto]" action="/admin/wolo-transactions">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={data.filters.query}
              placeholder="Search tx hash, wallet, user, source, or context"
              className="w-full rounded-full border border-white/10 bg-slate-950/80 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/40"
            />
          </label>
          {data.filters.status !== "all" ? (
            <input type="hidden" name="status" value={data.filters.status} />
          ) : null}
          {data.filters.actionType !== "all" ? (
            <input type="hidden" name="type" value={data.filters.actionType} />
          ) : null}
          <button
            type="submit"
            className="rounded-full border border-cyan-200/30 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-400/15"
          >
            Check
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => (
            <FilterLink
              key={status}
              active={data.filters.status === status}
              href={buildHref({
                status,
                actionType: data.filters.actionType,
                query: data.filters.query,
              })}
              label={status === "all" ? "All statuses" : WOLO_RECOVERY_STATUS_LABELS[status]}
              count={status === "all" ? data.summary.totalRows : data.statusCounts[status]}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {ACTION_FILTERS.map((actionType) => (
            <FilterLink
              key={actionType}
              active={data.filters.actionType === actionType}
              href={buildHref({
                status: data.filters.status,
                actionType,
                query: data.filters.query,
              })}
              label={actionType === "all" ? "All types" : WOLO_RECOVERY_ACTION_LABELS[actionType]}
              count={actionType === "all" ? data.summary.totalRows : data.actionTypeCounts[actionType]}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {data.notes.map((note) => (
          <div key={note} className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
            {note}
          </div>
        ))}
      </section>

      <section className="space-y-4">
        {data.rows.length > 0 ? (
          data.rows.map((row) => <TxRow key={row.id} row={row} />)
        ) : (
          <div className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-8 text-center text-slate-400">
            No WOLO transaction diagnostics match the current filters.
          </div>
        )}
      </section>
    </main>
  );
}
