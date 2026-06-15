
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crown, Loader2, ScrollText, Shield, Swords, Trophy } from "lucide-react";

type LedgerView = "all" | "staking" | "championships" | "bets" | "grouped-bets";

type LedgerRow = {
  key: string;
  view: LedgerView | "staking-day";
  tone: "gold" | "emerald" | "sky" | "slate";
  label: string;
  detail: string;
  meta: string;
  occurredAt: string;
  amountLabel?: string;
  txHash?: string | null;
};

const VIEWS: Array<{ key: LedgerView; label: string }> = [
  { key: "all", label: "All" },
  { key: "staking", label: "Staking" },
  { key: "championships", label: "Championships" },
  { key: "bets", label: "Bets" },
  { key: "grouped-bets", label: "Grouped Bets" },
];

function toneClass(tone: LedgerRow["tone"]) {
  if (tone === "gold") {
    return "border-amber-300/25 bg-[radial-gradient(circle_at_left,rgba(245,158,11,0.15),transparent_34%),linear-gradient(90deg,rgba(40,25,10,0.42),rgba(3,7,18,0.88))] shadow-[inset_3px_0_0_rgba(245,158,11,0.65)]";
  }
  if (tone === "emerald") {
    return "border-emerald-800/70 bg-[radial-gradient(circle_at_left,rgba(6,95,70,0.18),transparent_34%),linear-gradient(90deg,rgba(5,46,22,0.30),rgba(3,7,18,0.88))] shadow-[inset_3px_0_0_rgba(52,211,153,0.55)]";
  }
  if (tone === "sky") {
    return "border-sky-300/25 bg-[radial-gradient(circle_at_left,rgba(14,165,233,0.13),transparent_34%),linear-gradient(90deg,rgba(8,47,73,0.28),rgba(3,7,18,0.88))] shadow-[inset_3px_0_0_rgba(56,189,248,0.55)]";
  }
  return "border-white/10 bg-[linear-gradient(90deg,rgba(15,23,42,0.58),rgba(3,7,18,0.88))] shadow-[inset_3px_0_0_rgba(148,163,184,0.35)]";
}

function iconFor(row: LedgerRow) {
  if (row.view === "championships") return <Trophy className="h-4 w-4" />;
  if (row.view === "bets" || row.view === "grouped-bets") return <Swords className="h-4 w-4" />;
  if (row.view === "staking-day") return <ScrollText className="h-4 w-4" />;
  if (row.tone === "emerald") return <Shield className="h-4 w-4" />;
  return <Crown className="h-4 w-4" />;
}

function pillClass(active: boolean) {
  return active
    ? "border-amber-300/40 bg-amber-300/12 text-amber-100"
    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]";
}

function LedgerCard({ row }: { row: LedgerRow }) {
  return (
    <div className={`rounded-[1.15rem] border p-4 ${toneClass(row.tone)}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-slate-100">
            {iconFor(row)}
          </div>
          <div className="min-w-0">
            <div className="break-words font-semibold text-white">{row.label}</div>
            <div className="mt-1 break-words text-sm leading-6 text-slate-300">{row.detail}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
          {row.amountLabel ? (
            <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              {row.amountLabel}
            </div>
          ) : null}
          <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            {row.meta}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StakerLedgerPanel({ slug, player }: { slug: string; player: string }) {
  const [view, setView] = useState<LedgerView>("all");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const loadRows = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (loadingRef.current) return;

      loadingRef.current = true;
      setLoading(true);

      try {
        const url = new URL(`/api/staking/stakers/${slug}/ledger`, window.location.origin);
        url.searchParams.set("view", view);
        url.searchParams.set("limitDays", "18");
        if (!reset && nextBefore) url.searchParams.set("before", nextBefore);

        const response = await fetch(url.toString(), { cache: "no-store" });
        const payload = await response.json();

        const nextRows: LedgerRow[] = Array.isArray(payload.rows) ? (payload.rows as LedgerRow[]) : [];

        setRows((current) => {
          const merged = reset ? nextRows : [...current, ...nextRows];
          const seen = new Set<string>();
          return merged.filter((row) => {
            const key = row.key || `${row.occurredAt}-${row.label}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });

        setNextBefore(payload.nextBefore || null);
        setHasMore(Boolean(payload.hasMore && payload.nextBefore));
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [nextBefore, slug, view]
  );

  useEffect(() => {
    setRows([]);
    setNextBefore(null);
    setHasMore(true);
    void loadRows({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, slug]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 220 && hasMore && !loadingRef.current) {
      void loadRows();
    }
  }

  return (
    <section className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,29,0.94),rgba(4,7,14,0.99))] p-5 shadow-[0_24px_90px_rgba(2,6,23,0.32)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Personal Ledger</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{`${player}'s public receipts`}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Mainnet-only from May 25 onward. Reward allocations show as canonical rows; matching compound tx details are folded into the same receipt when present.
          </p>
        </div>
        <Link
          href="/staking"
          className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:border-amber-300/35 hover:text-amber-100"
        >
          Full ledger
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setView(item.key)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${pillClass(view === item.key)}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="mt-5 max-h-[46rem] space-y-3 overflow-y-auto pr-1"
        onScroll={handleScroll}
      >
        {rows.length > 0 ? rows.map((row) => <LedgerCard key={row.key} row={row} />) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
            {loading ? "Loading ledger rows..." : "No ledger rows found for this view yet."}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs uppercase tracking-[0.18em] text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading older rows
          </div>
        ) : null}

        {!loading && hasMore ? (
          <button
            type="button"
            onClick={() => loadRows()}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-amber-300/30 hover:text-amber-100"
          >
            Load older rows
          </button>
        ) : null}

        {!loading && !hasMore && rows.length > 0 ? (
          <div className="py-4 text-center text-[11px] uppercase tracking-[0.24em] text-slate-600">
            Beginning of mainnet staking record
          </div>
        ) : null}
      </div>
    </section>
  );
}
