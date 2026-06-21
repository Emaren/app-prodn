import Link from "next/link";
import { notFound } from "next/navigation";

import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ marketId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ViewMode = "advanced" | "basic";
type SortMode = "newest" | "oldest";

type MarketRow = {
  id: number;
  slug: string;
  title: string;
  eventLabel: string | null;
  status: string;
  leftLabel: string;
  rightLabel: string;
  seedLeftWolo: number;
  seedRightWolo: number;
  settledAt: Date | null;
  winnerSide: string | null;
  linkedSessionKey: string | null;
  linkedGameStatsId: number | null;
  settlementStatus: string | null;
  settlementDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type IntentRow = {
  id: number;
  side: string | null;
  amountWolo: number;
  status: string;
  stakeTxHash: string | null;
  player: string;
  createdAt: Date;
  verifiedAt: Date | null;
};

type WagerRow = {
  id: number;
  side: string | null;
  amountWolo: number;
  payoutWolo: number | null;
  status: string;
  executionMode: string | null;
  stakeTxHash: string | null;
  payoutTxHash: string | null;
  player: string;
  createdAt: Date;
  settledAt: Date | null;
};

type BonusRow = {
  id: number;
  bonusType: string;
  totalAmountWolo: number;
  status: string;
  note: string | null;
  createdAt: Date;
  settledAt: Date | null;
};

type ClaimRow = {
  id: number;
  displayPlayerName: string;
  amountWolo: number;
  claimKind: string | null;
  claimGroupKey: string | null;
  status: string;
  payoutTxHash: string | null;
  createdAt: Date;
  claimedAt: Date | null;
};

type TimelineRow = {
  key: string;
  kind: "intent" | "wager" | "bonus" | "claim" | "result";
  actor: string;
  title: string;
  detail: string;
  amountWolo: number;
  side: string | null;
  status: string;
  txHash: string | null;
  timestamp: Date;
  tone: "amber" | "emerald" | "sky" | "rose" | "slate";
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeMode(value: string | string[] | undefined): ViewMode {
  return firstParam(value) === "basic" ? "basic" : "advanced";
}

function normalizeSort(value: string | string[] | undefined): SortMode {
  return firstParam(value) === "oldest" ? "oldest" : "newest";
}

function formatWolo(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(Number(value || 0));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateLong(value: Date | string | null | undefined) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function sideLabel(market: MarketRow, side: string | null | undefined) {
  if (side === "left") return market.leftLabel;
  if (side === "right") return market.rightLabel;
  return "Book";
}

function shortHash(value: string | null | undefined) {
  if (!value) return null;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function isCountableIntent(status: string) {
  return !["failed", "cancelled", "canceled", "orphaned"].includes(status.toLowerCase());
}

function isCountableWager(status: string) {
  return !["cancelled", "canceled", "failed"].includes(status.toLowerCase());
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "won" || normalized === "claimed" || normalized === "executed" || normalized === "settled") {
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  }
  if (normalized === "lost") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (normalized === "void" || normalized === "refunded") {
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  }
  if (normalized === "pending" || normalized === "recorded" || normalized === "partial") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }
  return "border-white/15 bg-white/10 text-slate-200";
}

function timelineTone(row: TimelineRow) {
  if (row.tone === "emerald") return "border-emerald-300/20 bg-emerald-300/[0.06]";
  if (row.tone === "amber") return "border-amber-300/20 bg-amber-300/[0.06]";
  if (row.tone === "sky") return "border-sky-300/20 bg-sky-300/[0.06]";
  if (row.tone === "rose") return "border-rose-300/20 bg-rose-300/[0.06]";
  return "border-white/10 bg-slate-950/45";
}

function railDot(row: TimelineRow) {
  if (row.tone === "emerald") {
    return "bg-gradient-to-br from-emerald-200 via-emerald-500 to-emerald-950 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)] ring-1 ring-emerald-100/30";
  }
  if (row.tone === "amber") {
    return "bg-gradient-to-br from-amber-200 via-amber-500 to-amber-950 text-white shadow-[0_0_24px_rgba(245,158,11,0.45)] ring-1 ring-amber-100/30";
  }
  if (row.tone === "sky") {
    return "bg-gradient-to-br from-sky-200 via-sky-500 to-sky-950 text-white shadow-[0_0_24px_rgba(14,165,233,0.45)] ring-1 ring-sky-100/30";
  }
  if (row.tone === "rose") {
    return "bg-gradient-to-br from-rose-200 via-rose-500 to-rose-950 text-white shadow-[0_0_24px_rgba(244,63,94,0.45)] ring-1 ring-rose-100/30";
  }
  return "bg-gradient-to-br from-slate-200 via-slate-500 to-slate-950 text-white shadow-[0_0_20px_rgba(148,163,184,0.35)] ring-1 ring-slate-100/25";
}

function viewHref(marketId: number, view: ViewMode, sort: SortMode) {
  return `/bets/${marketId}?view=${view}&order=${sort}`;
}

function gameHref(market: MarketRow) {
  if (market.linkedGameStatsId) return `/game-stats/${market.linkedGameStatsId}`;
  if (market.linkedSessionKey) {
    return `/game-stats/live/${encodeURIComponent(market.linkedSessionKey)}`;
  }
  return null;
}

function splitMatchTitle(title: string) {
  const parts = title.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      left: parts[0],
      right: parts.slice(1).join(" vs "),
    };
  }

  return {
    left: title,
    right: "",
  };
}

function matchTitleSizeClass(left: string, right: string) {
  const total = left.length + right.length;
  const longest = Math.max(left.length, right.length);

  if (total > 48 || longest > 26) {
    return "text-[clamp(1.35rem,2.35vw,2.85rem)]";
  }

  if (total > 40 || longest > 22) {
    return "text-[clamp(1.6rem,2.85vw,3.35rem)]";
  }

  if (total > 32 || longest > 18) {
    return "text-[clamp(1.95rem,3.55vw,4.05rem)]";
  }

  return "text-[clamp(2.35rem,4.75vw,4.85rem)]";
}

function PremiumMatchTitle({ title }: { title: string }) {
  const names = splitMatchTitle(title);

  if (!names.right) {
    return (
      <h1 className="mt-6 max-w-full overflow-visible bg-gradient-to-b from-white via-slate-100 to-slate-500 bg-clip-text text-[clamp(2.35rem,4.75vw,4.85rem)] font-extrabold leading-[0.9] tracking-[-0.07em] text-transparent drop-shadow-[0_16px_30px_rgba(0,0,0,0.5)]">
        {title}
      </h1>
    );
  }

  const sizeClass = matchTitleSizeClass(names.left, names.right);

  return (
    <div className="mt-7 max-w-full overflow-visible px-1 pb-1">
      <div className="flex min-w-0 max-w-full items-end gap-x-4 whitespace-nowrap overflow-visible">
        <span
          title={names.left}
          className={`${sizeClass} shrink-0 overflow-visible bg-gradient-to-b from-white via-slate-100 to-slate-500 bg-clip-text pr-1 font-extrabold leading-[0.9] tracking-[-0.07em] text-transparent drop-shadow-[0_16px_30px_rgba(0,0,0,0.5)]`}
        >
          {names.left}
        </span>

        <span className="mb-[0.56em] shrink-0 rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.34em] text-amber-100/65 shadow-[0_0_24px_rgba(245,158,11,0.13)]">
          vs
        </span>

        <span
          title={names.right}
          className={`${sizeClass} shrink-0 overflow-visible bg-gradient-to-b from-slate-50 via-slate-200 to-slate-600 bg-clip-text pr-2 font-extrabold leading-[0.9] tracking-[-0.07em] text-transparent drop-shadow-[0_16px_30px_rgba(0,0,0,0.5)]`}
        >
          {names.right}
        </span>
      </div>

      <div className="mt-5 flex max-w-[88%] items-center gap-3">
        <div className="h-px w-24 bg-amber-200/30" />
        <div className="h-px flex-1 bg-gradient-to-r from-white/18 via-white/8 to-transparent" />
      </div>
    </div>
  );
}

export default async function BetMarketDetailPage({ params, searchParams }: PageProps) {
  const { marketId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const view = normalizeMode(resolvedSearchParams.view);
  const order = normalizeSort(resolvedSearchParams.order);

  const prisma = getPrisma();
  const numericMarketId = /^\d+$/.test(marketId) ? Number(marketId) : null;

  const markets =
    numericMarketId != null
      ? await prisma.$queryRaw<MarketRow[]>`
          select
            id,
            slug,
            title,
            event_label as "eventLabel",
            status,
            left_label as "leftLabel",
            right_label as "rightLabel",
            seed_left_wolo as "seedLeftWolo",
            seed_right_wolo as "seedRightWolo",
            settled_at as "settledAt",
            winner_side as "winnerSide",
            linked_session_key as "linkedSessionKey",
            linked_game_stats_id as "linkedGameStatsId",
            settlement_status as "settlementStatus",
            settlement_detail as "settlementDetail",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from bet_markets
          where id = ${numericMarketId}
          limit 1
        `
      : await prisma.$queryRaw<MarketRow[]>`
          select
            id,
            slug,
            title,
            event_label as "eventLabel",
            status,
            left_label as "leftLabel",
            right_label as "rightLabel",
            seed_left_wolo as "seedLeftWolo",
            seed_right_wolo as "seedRightWolo",
            settled_at as "settledAt",
            winner_side as "winnerSide",
            linked_session_key as "linkedSessionKey",
            linked_game_stats_id as "linkedGameStatsId",
            settlement_status as "settlementStatus",
            settlement_detail as "settlementDetail",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from bet_markets
          where slug = ${marketId}
          limit 1
        `;

  const market = markets[0];
  if (!market) notFound();

  const [intents, wagers, bonuses, claims] = await Promise.all([
    prisma.$queryRaw<IntentRow[]>`
      select
        i.id,
        i.side,
        i.amount_wolo as "amountWolo",
        i.status,
        i.stake_tx_hash as "stakeTxHash",
        coalesce(u.in_game_name, u.steam_persona_name, u.uid::text, 'User #' || i.user_id::text) as player,
        i.created_at as "createdAt",
        i.verified_at as "verifiedAt"
      from bet_stake_intents i
      left join users u on u.id = i.user_id
      where i.market_id = ${market.id}
      order by i.created_at asc, i.id asc
    `,
    prisma.$queryRaw<WagerRow[]>`
      select
        w.id,
        w.side,
        w.amount_wolo as "amountWolo",
        w.payout_wolo as "payoutWolo",
        w.status,
        w.execution_mode as "executionMode",
        w.stake_tx_hash as "stakeTxHash",
        w.payout_tx_hash as "payoutTxHash",
        coalesce(u.in_game_name, u.steam_persona_name, u.uid::text, 'User #' || w.user_id::text) as player,
        w.created_at as "createdAt",
        w.settled_at as "settledAt"
      from bet_wagers w
      left join users u on u.id = w.user_id
      where w.market_id = ${market.id}
      order by w.created_at asc, w.id asc
    `,
    prisma.$queryRaw<BonusRow[]>`
      select
        id,
        bonus_type as "bonusType",
        total_amount_wolo as "totalAmountWolo",
        status,
        note,
        created_at as "createdAt",
        settled_at as "settledAt"
      from bet_market_founder_bonuses
      where market_id = ${market.id}
        and rescinded_at is null
      order by created_at asc, id asc
    `,
    prisma.$queryRaw<ClaimRow[]>`
      select
        id,
        display_player_name as "displayPlayerName",
        amount_wolo as "amountWolo",
        claim_kind as "claimKind",
        claim_group_key as "claimGroupKey",
        status,
        payout_tx_hash as "payoutTxHash",
        created_at as "createdAt",
        claimed_at as "claimedAt"
      from pending_wolo_claims
      where source_market_id = ${market.id}
        and rescinded_at is null
      order by created_at asc, id asc
    `,
  ]);

  const seededWolo = market.seedLeftWolo + market.seedRightWolo;
  const intentWolo = intents
    .filter((intent) => isCountableIntent(intent.status))
    .reduce((sum, intent) => sum + intent.amountWolo, 0);
  const wageredWolo = wagers
    .filter((wager) => isCountableWager(wager.status))
    .reduce((sum, wager) => sum + wager.amountWolo, 0);
  const payoutWolo = wagers.reduce((sum, wager) => sum + (wager.payoutWolo || 0), 0);
  const claimWolo = claims.reduce((sum, claim) => sum + claim.amountWolo, 0);
  const founderBonusWolo = bonuses.reduce((sum, bonus) => sum + bonus.totalAmountWolo, 0);
  const visibleBookWolo = Math.max(seededWolo + wageredWolo, intentWolo, claimWolo);
  const payoutRailWolo = Math.max(payoutWolo, claimWolo);

  const leftIntentWolo = intents
    .filter((intent) => intent.side === "left" && isCountableIntent(intent.status))
    .reduce((sum, intent) => sum + intent.amountWolo, 0);
  const rightIntentWolo = intents
    .filter((intent) => intent.side === "right" && isCountableIntent(intent.status))
    .reduce((sum, intent) => sum + intent.amountWolo, 0);
  const leftWagerWolo = wagers
    .filter((wager) => wager.side === "left" && isCountableWager(wager.status))
    .reduce((sum, wager) => sum + wager.amountWolo, 0);
  const rightWagerWolo = wagers
    .filter((wager) => wager.side === "right" && isCountableWager(wager.status))
    .reduce((sum, wager) => sum + wager.amountWolo, 0);

  const leftBookWolo = Math.max(market.seedLeftWolo + leftWagerWolo, leftIntentWolo);
  const rightBookWolo = Math.max(market.seedRightWolo + rightWagerWolo, rightIntentWolo);
  const matchedWolo = Math.min(leftBookWolo, rightBookWolo);
  const openImbalanceWolo = Math.abs(leftBookWolo - rightBookWolo);
  const imbalanceSide =
    leftBookWolo > rightBookWolo ? market.leftLabel : rightBookWolo > leftBookWolo ? market.rightLabel : null;

  const winnerName = market.winnerSide === "right" ? market.rightLabel : market.leftLabel;
  const leftWon = market.winnerSide === "left";
  const rightWon = market.winnerSide === "right";

  const timeline: TimelineRow[] = [
    ...intents.map((intent) => ({
      key: `intent-${intent.id}`,
      kind: "intent" as const,
      actor: intent.player,
      title: `${intent.player} offered ${formatWolo(intent.amountWolo)} WOLO`,
      detail: `Stake intent on ${sideLabel(market, intent.side)}${intent.verifiedAt ? ` · verified ${formatDate(intent.verifiedAt)}` : ""}`,
      amountWolo: intent.amountWolo,
      side: intent.side,
      status: intent.status,
      txHash: intent.stakeTxHash,
      timestamp: intent.createdAt,
      tone: "amber" as const,
    })),
    ...wagers.map((wager) => ({
      key: `wager-${wager.id}`,
      kind: "wager" as const,
      actor: wager.player,
      title: `${wager.player} wagered ${formatWolo(wager.amountWolo)} WOLO`,
      detail:
        wager.status === "void"
          ? `Refund on ${sideLabel(market, wager.side)} · payout ${formatWolo(wager.payoutWolo)} WOLO`
          : `${sideLabel(market, wager.side)} · payout ${formatWolo(wager.payoutWolo)} WOLO`,
      amountWolo: wager.amountWolo,
      side: wager.side,
      status: wager.status === "void" ? "refund" : wager.status,
      txHash: wager.payoutTxHash || wager.stakeTxHash,
      timestamp: wager.settledAt || wager.createdAt,
      tone:
        wager.status === "won"
          ? ("emerald" as const)
          : wager.status === "lost"
            ? ("rose" as const)
            : wager.status === "void"
              ? ("sky" as const)
              : ("slate" as const),
    })),
    ...(market.settledAt && market.winnerSide
      ? [
          {
            key: "result-winner",
            kind: "result" as const,
            actor: winnerName,
            title: `${winnerName} won`,
            detail: `${market.title} settled`,
            amountWolo: visibleBookWolo,
            side: market.winnerSide,
            status: "settled",
            txHash: null,
            timestamp: market.settledAt,
            tone: "emerald" as const,
          },
        ]
      : []),
    ...bonuses.map((bonus) => ({
      key: `bonus-${bonus.id}`,
      kind: "bonus" as const,
      actor: "Founder Bonus",
      title: `${formatWolo(bonus.totalAmountWolo)} WOLO Founder Bonus`,
      detail: `${bonus.bonusType} · ${bonus.status}`,
      amountWolo: bonus.totalAmountWolo,
      side: null,
      status: bonus.status,
      txHash: null,
      timestamp: bonus.settledAt || bonus.createdAt,
      tone: "emerald" as const,
    })),
    ...claims.map((claim) => ({
      key: `claim-${claim.id}`,
      kind: "claim" as const,
      actor: claim.displayPlayerName,
      title: `${claim.displayPlayerName} claim · ${formatWolo(claim.amountWolo)} WOLO`,
      detail: `${claim.claimKind || "claim"} · ${claim.status}`,
      amountWolo: claim.amountWolo,
      side: null,
      status: claim.status,
      txHash: claim.payoutTxHash,
      timestamp: claim.claimedAt || claim.createdAt,
      tone: claim.status === "claimed" ? ("emerald" as const) : ("sky" as const),
    })),
  ].sort((a, b) =>
    order === "newest"
      ? b.timestamp.getTime() - a.timestamp.getTime()
      : a.timestamp.getTime() - b.timestamp.getTime()
  );

  const replayHref = gameHref(market);

  if (view === "basic") {
    return (
      <main className="min-h-screen bg-[#07111f] text-slate-100">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10">
          <BookTopBar market={market} view={view} order={order} replayHref={replayHref} />

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-end">
              <div>
                <div className="text-[11px] uppercase tracking-[0.45em] text-amber-300/75">
                  Bet Book #{market.id}
                </div>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-50 sm:text-5xl">
                  {market.title}
                </h1>
                <p className="mt-3 text-sm text-slate-400">
                  {market.eventLabel || "AoE2WAR book"} · {market.status}
                  {market.settledAt ? ` · ${formatDateLong(market.settledAt)}` : ""}
                </p>
              </div>

              <BookMetric label="Visible Book" value={`${formatWolo(visibleBookWolo)} WOLO`} helper={`Payout rail ${formatWolo(payoutRailWolo)} WOLO`} />
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              <SidePanel label="Left" name={market.leftLabel} amount={leftBookWolo} won={leftWon} />
              <SidePanel label="Right" name={market.rightLabel} amount={rightBookWolo} won={rightWon} />
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.4em] text-slate-500">Timeline</div>
            <div className="mt-4 grid gap-3">
              {timeline.map((row) => <CompactTimelineRow key={row.key} row={row} />)}
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050b16] text-slate-100">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-10%] top-[-20%] h-[520px] w-[520px] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute right-[-12%] top-[10%] h-[620px] w-[620px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-30%] left-[25%] h-[700px] w-[700px] rounded-full bg-emerald-500/8 blur-3xl" />
      </div>

      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
        <BookTopBar market={market} view={view} order={order} replayHref={replayHref} />

        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/40 sm:p-10">
          <div className="absolute right-[-80px] top-[-120px] h-80 w-80 rounded-full border border-amber-300/20 bg-amber-300/[0.04]" />
          <div className="absolute bottom-[-120px] left-[30%] h-72 w-72 rounded-full border border-sky-300/20 bg-sky-300/[0.035]" />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-amber-100">
                  Book #{market.id}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.32em] text-slate-300">
                  {market.status}
                </span>
              </div>

              <PremiumMatchTitle title={market.title} />

              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                {market.eventLabel || "AoE2WAR book"} · winner: {winnerName}
                {market.settledAt ? ` · settled ${formatDateLong(market.settledAt)}` : ""}
              </p>
            </div>

            <div className="grid gap-3">
              <BookMetric label="Visible Book" value={`${formatWolo(visibleBookWolo)} WOLO`} helper={`Payout rail ${formatWolo(payoutRailWolo)} WOLO`} />
              <div className="grid grid-cols-3 gap-3">
                <MiniMetric label="Matched" value={`${formatWolo(matchedWolo)}`} />
                <MiniMetric label="Open" value={`${formatWolo(openImbalanceWolo)}`} />
                <MiniMetric label="FB" value={`${formatWolo(founderBonusWolo)}`} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-5">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.42em] text-slate-500">Battle Book</div>
                </div>
                <div className="text-xs text-slate-500">
                  {imbalanceSide ? `${formatWolo(openImbalanceWolo)} WOLO open on ${imbalanceSide}` : "Balanced book"}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <AdvancedSidePanel label="Left" name={market.leftLabel} amount={leftBookWolo} won={leftWon} />
                <AdvancedSidePanel label="Right" name={market.rightLabel} amount={rightBookWolo} won={rightWon} />
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
                  <div className="h-3 bg-amber-300/30" style={{ width: `${visibleBookWolo > 0 ? Math.max(8, (leftBookWolo / visibleBookWolo) * 100) : 50}%` }} />
                  <div className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                    matched {formatWolo(matchedWolo)}
                  </div>
                  <div className="ml-auto h-3 bg-sky-300/30" style={{ width: `${visibleBookWolo > 0 ? Math.max(8, (rightBookWolo / visibleBookWolo) * 100) : 50}%` }} />
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.42em] text-slate-500">Chain Timeline</div>
                </div>

                <Link
                  href={viewHref(market.id, view, order === "newest" ? "oldest" : "newest")}
                  aria-label={order === "newest" ? "Switch to oldest first" : "Switch to newest first"}
                  title={order === "newest" ? "Switch to oldest first" : "Switch to newest first"}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-sm font-black text-slate-200 transition hover:border-amber-200/40 hover:text-white"
                >
                  ⇅
                </Link>
              </div>

              <div className="mt-6 grid gap-4">
                {timeline.map((row, index) => (
                  <AdvancedTimelineRow key={row.key} row={row} index={index} market={market} />
                ))}
              </div>
            </section>
          </div>

          <aside className="grid content-start gap-5">
            <section className="rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.045] p-5">
              <div className="text-[11px] uppercase tracking-[0.42em] text-emerald-200/70">Founder Bonus</div>
              <h2 className="mt-2 text-4xl font-black text-white">{formatWolo(founderBonusWolo)} WOLO</h2>
              <div className="mt-4 grid gap-3">
                {bonuses.length === 0 ? (
                  <EmptyCard text="No Founder Bonus rows recorded." />
                ) : (
                  bonuses.map((bonus) => (
                    <RailCard
                      key={bonus.id}
                      title={`${formatWolo(bonus.totalAmountWolo)} WOLO · ${bonus.bonusType}`}
                      detail={formatDate(bonus.createdAt)}
                      status={bonus.status}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-sky-300/15 bg-sky-300/[0.045] p-5">
              <div className="text-[11px] uppercase tracking-[0.42em] text-sky-200/70">Claim / Payout Rail</div>
              <h2 className="mt-2 text-4xl font-black text-white">{formatWolo(claimWolo)} WOLO</h2>
              <div className="mt-4 grid gap-3">
                {claims.length === 0 ? (
                  <EmptyCard text="No pending claim rows for this book." />
                ) : (
                  claims.map((claim) => (
                    <RailCard
                      key={claim.id}
                      title={`${claim.displayPlayerName} · ${formatWolo(claim.amountWolo)} WOLO`}
                      detail={`${claim.claimKind || "claim"} · ${formatDate(claim.createdAt)}`}
                      status={claim.status}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-amber-300/15 bg-amber-300/[0.045] p-5">
              <div className="text-[11px] uppercase tracking-[0.42em] text-amber-200/70">Liquidity Logic</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Human action gets priority. AI liquidity should fill unmatched exposure at lock when enabled.
                Refunds stay refunds. Founder Bonuses stay separate from the betting pot.
              </p>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
              <div className="text-[11px] uppercase tracking-[0.42em] text-slate-500">Trust Rule</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Payout amount alone never means a win. The wager status tells the truth:
                won, lost, refund, pending, or claimed.
              </p>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function BookTopBar({
  market,
  view,
  order,
  replayHref,
}: {
  market: MarketRow;
  view: ViewMode;
  order: SortMode;
  replayHref: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/bets"
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300 hover:border-amber-200/40 hover:text-white"
        >
          ← Back to Bets
        </Link>

        <Link
          href={viewHref(market.id, view === "advanced" ? "basic" : "advanced", order)}
          className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-black text-amber-100 hover:border-amber-200/50"
        >
          ◈ {view === "advanced" ? "Advanced" : "Basic"}
        </Link>

        <Link
          href={viewHref(market.id, view, order === "newest" ? "oldest" : "newest")}
          aria-label={order === "newest" ? "Switch to oldest first" : "Switch to newest first"}
          title={order === "newest" ? "Switch to oldest first" : "Switch to newest first"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-black text-slate-200 hover:border-sky-200/40"
        >
          ⇅
        </Link>
      </div>

      {replayHref ? (
        <Link
          href={replayHref}
          className="rounded-full border border-sky-200/20 bg-sky-200/10 px-4 py-2 text-xs font-bold text-sky-100 hover:border-sky-200/50"
        >
          Open game replay
        </Link>
      ) : null}
    </div>
  );
}

function BookMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-right">
      <div className="text-[10px] uppercase tracking-[0.35em] text-amber-100/70">{label}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-amber-100/70">{helper}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-center">
      <div className="text-[9px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function SidePanel({ label, name, amount, won }: { label: string; name: string; amount: number; won: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${won ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-slate-950/45"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">{label}</div>
          <div className="mt-1 text-xl font-black text-white">{name}</div>
        </div>
        {won ? (
          <span className="rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-xs font-black text-emerald-100">
            Winner
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-2xl font-black text-white">{formatWolo(amount)} WOLO</div>
    </div>
  );
}

function AdvancedSidePanel({ label, name, amount, won }: { label: string; name: string; amount: number; won: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border p-5 ${won ? "border-emerald-300/30 bg-emerald-300/[0.08]" : "border-white/10 bg-slate-950/45"}`}>
      <div className="absolute right-[-40px] top-[-40px] h-32 w-32 rounded-full bg-white/[0.035] blur-xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">{label}</div>
          {won ? (
            <span className="rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-xs font-black text-emerald-100">
              Winner
            </span>
          ) : null}
        </div>
        <div className="mt-3 text-2xl font-black text-white">{name}</div>
        <div className={`text-4xl font-black tracking-[-0.05em] text-white transition ${won ? "mt-5" : "mt-8 translate-y-2 opacity-90"}`}>{formatWolo(amount)}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-500">WOLO exposure</div>
      </div>
    </div>
  );
}

function CompactTimelineRow({ row }: { row: TimelineRow }) {
  if (row.kind === "result") {
    return (
      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.07] p-4">
        <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-100/60">Result</div>
        <div className="mt-1 text-lg font-black text-white">{row.title}</div>
        <div className="mt-1 text-xs text-emerald-100/60">{formatDate(row.timestamp)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{row.title}</div>
          <div className="mt-1 text-xs text-slate-500">{row.detail} · {formatDate(row.timestamp)}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(row.status)}`}>
          {row.status}
        </span>
      </div>
    </div>
  );
}

function AdvancedTimelineRow({ row, index, market }: { row: TimelineRow; index: number; market: MarketRow }) {
  if (row.kind === "result") {
    return (
      <div className="grid grid-cols-[34px_1fr] gap-3">
        <div className="flex flex-col items-center">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black shadow-xl ${railDot(row)}`}>
            ⚔
          </div>
          <div className="mt-2 h-full min-h-8 w-px bg-white/10" />
        </div>

        <div className="relative overflow-hidden rounded-[1.35rem] border border-emerald-300/25 bg-emerald-300/[0.07] px-5 py-4 shadow-[0_0_30px_rgba(16,185,129,0.08)]">
          <div className="absolute right-[-60px] top-[-80px] h-40 w-40 rounded-full bg-emerald-200/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-100/60">
                Result
              </div>
              <div className="mt-1 text-2xl font-black text-white">{row.title}</div>
              <div className="mt-1 text-xs text-emerald-100/60">{formatDate(row.timestamp)}</div>
            </div>
            <span className="rounded-full border border-emerald-100/25 bg-emerald-100/10 px-3 py-1 text-xs font-black text-emerald-50">
              won
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[34px_1fr] gap-3">
      <div className="flex flex-col items-center">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black shadow-xl ${railDot(row)}`}>
          {index + 1}
        </div>
        <div className="mt-2 h-full min-h-10 w-px bg-white/10" />
      </div>

      <article className={`rounded-[1.35rem] border p-4 ${timelineTone(row)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
              {row.kind} · {formatDate(row.timestamp)}
            </div>
            <h3 className="mt-2 text-lg font-black text-white">{row.title}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-400">{row.detail}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(row.status)}`}>
            {row.status}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
          <div>
            <span className="text-slate-500">Actor</span>
            <div className="mt-1 font-bold text-white">{row.actor}</div>
          </div>
          <div>
            <span className="text-slate-500">Side</span>
            <div className="mt-1 font-bold text-white">{sideLabel(market, row.side)}</div>
          </div>
          <div>
            <span className="text-slate-500">Amount</span>
            <div className="mt-1 font-bold text-white">{formatWolo(row.amountWolo)} WOLO</div>
          </div>
        </div>

        {row.txHash ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] text-slate-500">
            tx {shortHash(row.txHash)}
          </div>
        ) : null}
      </article>
    </div>
  );
}

function RailCard({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(status)}`}>
          {status}
        </span>
      </div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
      {text}
    </div>
  );
}
