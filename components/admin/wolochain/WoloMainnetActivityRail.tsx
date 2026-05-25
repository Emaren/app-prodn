"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

type ActivityRailKind =
  | "direct"
  | "stake"
  | "unstake"
  | "wager"
  | "payout"
  | "settlement"
  | "treasury"
  | "faucet"
  | "other";

type ActivityRailRow = {
  key: string;
  kind: ActivityRailKind;
  label: string;
  detail: string;
  amountLabel: string | null;
  txHash: string | null;
  timestamp: string;
  source: string;
};

type ActivityRailPayload = {
  ok?: boolean;
  rows?: ActivityRailRow[];
  nextOffset?: number;
  hasMore?: boolean;
  totalVisible?: number;
  note?: string;
  detail?: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "direct", label: "Direct" },
  { key: "staking", label: "Staking" },
  { key: "settlement", label: "Settlement" },
  { key: "treasury", label: "Treasury" },
  { key: "faucet", label: "Faucet" },
] as const;

function kindTone(kind: ActivityRailKind) {
  if (kind === "direct") return "border-cyan-300/25 bg-cyan-400/10 text-cyan-50";
  if (kind === "stake" || kind === "unstake") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (kind === "payout" || kind === "settlement") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (kind === "treasury") return "border-violet-300/25 bg-violet-400/10 text-violet-100";
  if (kind === "faucet") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-white/10 bg-white/[0.055] text-slate-300";
}

function kindLabel(kind: ActivityRailKind) {
  if (kind === "direct") return "DIRECT";
  if (kind === "stake") return "STAKE";
  if (kind === "unstake") return "UNSTAKE";
  if (kind === "wager") return "WAGER";
  if (kind === "payout") return "PAYOUT";
  if (kind === "settlement") return "SETTLEMENT";
  if (kind === "treasury") return "TREASURY";
  if (kind === "faucet") return "FAUCET";
  return "OTHER";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function shortTx(value: string | null) {
  if (!value) return null;
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export default function WoloMainnetActivityRail() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [rows, setRows] = useState<ActivityRailRow[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const includeFaucet = filter === "faucet";

  const loadPage = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (loadingRef.current) return;

      const offset = reset ? 0 : nextOffset;
      loadingRef.current = true;
      setLoading(true);
      setMessage(null);

      try {
        const params = new URLSearchParams({
          offset: String(offset),
          take: "10",
          filter,
        });

        if (includeFaucet) params.set("includeFaucet", "1");

        const response = await fetch(`/api/admin/wolochain/activity?${params.toString()}`, {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as ActivityRailPayload | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.detail || `Activity rail failed with HTTP ${response.status}.`);
          return;
        }

        const incoming = payload.rows || [];

        setRows((current) => (reset ? incoming : [...current, ...incoming]));
        setNextOffset(payload.nextOffset ?? offset + incoming.length);
        setHasMore(Boolean(payload.hasMore));

        if (!incoming.length && !payload.hasMore) {
          setMessage("No more activity in the current rail window.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Activity rail failed.");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [filter, includeFaucet, nextOffset]
  );

  useEffect(() => {
    setRows([]);
    setNextOffset(0);
    setHasMore(true);
    loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const seenTx = useMemo(() => rows.filter((row) => row.txHash).length, [rows]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 96;
    if (nearBottom && hasMore && !loadingRef.current) {
      loadPage();
    }
  }

  return (
    <section className="rounded-[1.65rem] border border-white/10 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(3,6,12,0.99))] p-5 shadow-[0_26px_90px_rgba(2,6,23,0.35)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-cyan-100/65">WoloChain activity rail</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">WoloChain economy tape</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Direct transfers, staking, settlement, treasury, and payout activity indexed from WoloChain.
            Faucet claims stay hidden unless selected.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-cyan-200/45 bg-cyan-400/15 text-cyan-50"
                    : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-cyan-200/30 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => loadPage({ reset: true })}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Loaded</div>
          <div className="mt-1 text-xl font-semibold text-white">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">TX-backed</div>
          <div className="mt-1 text-xl font-semibold text-white">{seenTx}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Default</div>
          <div className="mt-1 text-sm font-semibold text-slate-200">All excluding faucet</div>
        </div>
      </div>

      <div
        onScroll={handleScroll}
        className="mt-4 max-h-[38rem] min-h-[28rem] overflow-y-auto rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-2"
      >
        <div className="space-y-2">
          {rows.map((row) => (
            <article
              key={row.key}
              className="grid gap-3 rounded-[1rem] border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm md:grid-cols-[7.5rem_minmax(0,1fr)_10rem] md:items-center"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] ${kindTone(row.kind)}`}>
                  {kindLabel(row.kind)}
                </span>
                {row.amountLabel ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                    {row.amountLabel}
                  </span>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{row.label}</div>
                <div className="mt-0.5 truncate text-xs leading-5 text-slate-400">{row.detail}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {row.txHash ? (
                  <span title={row.txHash} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[10px] text-slate-300">
                    {shortTx(row.txHash)}
                  </span>
                ) : null}
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-slate-300">
                  {formatDate(row.timestamp)}
                </span>
              </div>
            </article>
          ))}

          {loading ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-slate-300">
              Loading older activity…
            </div>
          ) : null}

          {!loading && !rows.length ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-slate-300">
              No activity found for this filter yet.
            </div>
          ) : null}

          {!loading && message ? (
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/[0.06] px-4 py-3 text-xs leading-5 text-cyan-50/80">
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
