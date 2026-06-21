
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crown, Loader2, ScrollText, Shield, Swords, Trophy } from "lucide-react";

type LedgerView = "all" | "staking" | "compounded" | "championships" | "bounties" | "bets" | "grouped-bets";

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

const STAKER_LEDGER_VIEW_PREFS_KEY = "aoe2war:staker-ledger-view";

const VIEWS: Array<{ key: LedgerView; label: string }> = [
  { key: "all", label: "All" },
  { key: "staking", label: "Staking" },
  { key: "compounded", label: "Compounded" },
  { key: "championships", label: "Championships" },
  { key: "bounties", label: "Bounties" },
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
  if (row.view === "championships" || row.view === "bounties") return <Trophy className="h-4 w-4" />;
  if (row.view === "bets" || row.view === "grouped-bets") return <Swords className="h-4 w-4" />;
  if (row.view === "compounded") return <Crown className="h-4 w-4" />;
  if (row.view === "staking-day") return <ScrollText className="h-4 w-4" />;
  if (row.tone === "emerald") return <Shield className="h-4 w-4" />;
  return <Crown className="h-4 w-4" />;
}

function formatCompactWolo(value: number) {
  if (!Number.isFinite(value)) return "--";
  if (value > 0 && value < 0.000001) return "<0.000001 WOLO";
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value > 0 && value < 1 ? 6 : 2,
    minimumFractionDigits: 0,
  }).format(value)} WOLO`;
}

function formatLedgerDayLabel(value?: string | null) {
  if (!value) return "Quiet staking day";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function parseWoloAmount(label?: string) {
  if (!label) return 0;
  const parsed = Number(label.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeRewardTrail(rows: LedgerRow[]) {
  let compounded = 0;
  let building = 0;
  let paid = 0;

  for (const row of rows) {
    const text = `${row.label} ${row.detail}`.toLowerCase();
    const amount = parseWoloAmount(row.amountLabel || row.label);

    if (text.includes("held reward") || text.includes("micro_accrued") || text.includes("payout threshold")) {
      building += amount;
    } else if (text.includes("paid out") || text.includes("claimed") || text.includes("reward payout")) {
      paid += amount;
    } else if (text.includes("compound") || text.includes("rolled into principal")) {
      compounded += amount;
    }
  }

  return { compounded, building, paid, total: compounded + building + paid };
}


function computeBountySummary(rows: LedgerRow[]) {
  let paidTotal = 0;
  let paidCount = 0;
  let unclaimedCount = 0;

  for (const row of rows) {
    const text = `${row.label || ""} ${row.detail || ""} ${row.amountLabel || ""}`.toLowerCase();
    const isUnclaimed = text.includes("unclaimed");
    const isPaid = text.includes("bounty paid") && !isUnclaimed;

    if (isUnclaimed) {
      unclaimedCount += 1;
      continue;
    }

    if (isPaid) {
      paidCount += 1;
      paidTotal += parseWoloAmount(row.amountLabel || row.label);
    }
  }

  return {
    paidTotal,
    paidCount,
    unclaimedCount,
    totalCount: paidCount + unclaimedCount,
  };
}

function pillClass(active: boolean) {
  return active
    ? "border-amber-300/40 bg-amber-300/12 text-amber-100"
    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]";
}

function LedgerCard({ row }: { row: LedgerRow }) {
  if (row.view === "staking-day") {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-600/22 to-slate-700/10" />
        <div className="rounded-full border border-slate-600/35 bg-slate-900/72 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          {formatLedgerDayLabel(row.occurredAt)}
        </div>
        <div className="hidden h-px flex-1 bg-gradient-to-l from-transparent via-slate-600/22 to-slate-700/10 sm:block" />
      </div>
    );
  }

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

export default function StakerLedgerPanel({
  slug,
  player,
  rewardStats,
}: {
  slug: string;
  player: string;
  rewardStats?: {
    lifetime: number;
    compounded: number;
    claimed: number;
    pending: number;
  };
}) {
  const [view, setView] = useState<LedgerView>("all");
  const [viewPreferenceReady, setViewPreferenceReady] = useState(false);


  useEffect(() => {
    if (typeof window === "undefined") {
      setViewPreferenceReady(true);
      return;
    }

    const scopedKey = `${STAKER_LEDGER_VIEW_PREFS_KEY}:${slug}`;
    const saved = window.localStorage.getItem(scopedKey) || window.localStorage.getItem(STAKER_LEDGER_VIEW_PREFS_KEY);

    if (saved && VIEWS.some((option) => option.key === saved)) {
      setView(saved as LedgerView);
      window.localStorage.setItem(scopedKey, saved);
    }

    setViewPreferenceReady(true);
  }, [slug]);

  useEffect(() => {
    if (!viewPreferenceReady || typeof window === "undefined") return;
    window.localStorage.setItem(`${STAKER_LEDGER_VIEW_PREFS_KEY}:${slug}`, view);
  }, [slug, view, viewPreferenceReady]);

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const requestSeqRef = useRef(0);

  const loadRows = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (loadingRef.current && !reset) return;

      loadingRef.current = true;
      setLoading(true);
      const requestId = ++requestSeqRef.current;

      try {
        const url = new URL(`/api/staking/stakers/${slug}/ledger`, window.location.origin);
        url.searchParams.set("view", view);
        url.searchParams.set("limitDays", "18");
        if (!reset && nextBefore) url.searchParams.set("before", nextBefore);

        const response = await fetch(url.toString(), { cache: "no-store" });
        const payload = await response.json();
        if (requestId !== requestSeqRef.current) return;

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

  const bountySummary = view === "bounties" ? computeBountySummary(rows) : null;

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

      <div className="mt-4 rounded-[1.25rem] border border-amber-300/20 bg-[radial-gradient(circle_at_left,rgba(245,158,11,0.13),transparent_36%),linear-gradient(90deg,rgba(30,20,8,0.62),rgba(3,7,18,0.72))] p-4">
          {(() => {
            const visibleTrail = computeRewardTrail(rows);
            const trail = rewardStats
              ? {
                  total: rewardStats.lifetime,
                  compounded: rewardStats.compounded,
                  paid: rewardStats.claimed,
                  building: rewardStats.pending,
                }
              : visibleTrail;

            return (
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/70">Reward growth</div>
                  <div className="mt-1 text-lg font-semibold text-white">{formatCompactWolo(trail.total)}</div>
                  <div className="mt-1 text-xs text-slate-400">lifetime credited</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Inside stake</div>
                  <div className="mt-1 text-lg font-semibold text-amber-100">{formatCompactWolo(trail.compounded)}</div>
                  <div className="mt-1 text-xs text-slate-400">rolled into stake</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Paid out</div>
                  <div className="mt-1 text-lg font-semibold text-emerald-100">{formatCompactWolo(trail.paid)}</div>
                  <div className="mt-1 text-xs text-slate-400">all time</div>
                </div>
              </div>
            );
          })()}
      </div>

      {view === "bounties" && bountySummary ? (
        <div className="mt-4 rounded-[1.25rem] border border-emerald-300/20 bg-[radial-gradient(circle_at_left,rgba(16,185,129,0.13),transparent_34%),linear-gradient(90deg,rgba(5,24,18,0.72),rgba(3,7,18,0.78))] p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Total bounties paid out</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatCompactWolo(bountySummary.paidTotal)}</div>
              <div className="mt-1 text-xs text-slate-400">Numbered bounty rail</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Paid bounties</div>
              <div className="mt-1 text-lg font-semibold text-emerald-100">{bountySummary.paidCount}</div>
              <div className="mt-1 text-xs text-slate-400">on-chain receipts</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Unclaimed</div>
              <div className="mt-1 text-lg font-semibold text-amber-100">{bountySummary.unclaimedCount}</div>
              <div className="mt-1 text-xs text-slate-400">reserved gifts</div>
            </div>
          </div>
        </div>
      ) : null}

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
