import Link from "next/link";
import { notFound } from "next/navigation";

import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ marketId: string }>;
};

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

function formatWolo(value: number | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(amount);
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

function sideLabel(market: MarketRow, side: string | null | undefined) {
  if (side === "left") return market.leftLabel;
  if (side === "right") return market.rightLabel;
  return "Book";
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "won") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (normalized === "lost") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (normalized === "void" || normalized === "refunded") return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  if (normalized === "pending" || normalized === "recorded") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-white/15 bg-white/10 text-slate-200";
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

export default async function BetMarketDetailPage({ params }: PageProps) {
  const { marketId } = await params;
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
  const displayPotWolo = Math.max(seededWolo + wageredWolo, intentWolo, claimWolo);

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

  const gameHref = market.linkedGameStatsId
    ? `/game-stats/${market.linkedGameStatsId}`
    : market.linkedSessionKey
      ? `/game-stats/live/${encodeURIComponent(market.linkedSessionKey)}`
      : null;

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/bets"
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-300 hover:border-amber-200/40 hover:text-white"
          >
            ← Back to Bets
          </Link>

          {gameHref ? (
            <Link
              href={gameHref}
              className="rounded-full border border-sky-200/20 bg-sky-200/10 px-4 py-2 text-xs font-bold text-sky-100 hover:border-sky-200/50"
            >
              Open game replay
            </Link>
          ) : null}
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.45em] text-amber-300/75">
                Bet Book #{market.id}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                {market.title}
              </h1>
              <p className="mt-3 text-sm text-slate-400">
                {market.eventLabel || "AoE2WAR book"} · {market.status}
                {market.settledAt ? ` · settled ${formatDate(market.settledAt)}` : ""}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-right">
              <div className="text-[10px] uppercase tracking-[0.35em] text-amber-100/70">
                Visible Book
              </div>
              <div className="mt-1 text-3xl font-black text-white">{formatWolo(displayPotWolo)} WOLO</div>
              <div className="mt-1 text-xs text-amber-100/70">
                payout rail: {formatWolo(Math.max(payoutWolo, claimWolo))} WOLO
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              {
                side: "left",
                label: market.leftLabel,
                amount: Math.max(market.seedLeftWolo + leftWagerWolo, leftIntentWolo),
              },
              {
                side: "right",
                label: market.rightLabel,
                amount: Math.max(market.seedRightWolo + rightWagerWolo, rightIntentWolo),
              },
            ].map((side) => {
              const won = market.winnerSide === side.side;
              return (
                <div
                  key={side.side}
                  className={`rounded-2xl border p-5 ${
                    won
                      ? "border-emerald-300/30 bg-emerald-300/10"
                      : "border-white/10 bg-slate-950/45"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
                        {side.side}
                      </div>
                      <div className="mt-1 text-xl font-black text-white">{side.label}</div>
                    </div>
                    {won ? (
                      <span className="rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-xs font-black text-emerald-100">
                        Winner
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 text-2xl font-black text-white">{formatWolo(side.amount)} WOLO</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.4em] text-slate-500">
              Betting Rail
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Orders, wagers, refunds, payouts.</h2>

            <div className="mt-5 grid gap-3">
              {intents.length === 0 && wagers.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                  No wager rows recorded yet.
                </div>
              ) : null}

              {intents.map((intent) => (
                <div key={`intent-${intent.id}`} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">
                        {intent.player} offered {formatWolo(intent.amountWolo)} WOLO on {sideLabel(market, intent.side)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        stake intent · {formatDate(intent.createdAt)}
                        {intent.verifiedAt ? ` · verified ${formatDate(intent.verifiedAt)}` : ""}
                      </div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(intent.status)}`}>
                      {intent.status}
                    </span>
                  </div>
                  {intent.stakeTxHash ? (
                    <div className="mt-2 font-mono text-[11px] text-slate-500">
                      stake tx {shortHash(intent.stakeTxHash)}
                    </div>
                  ) : null}
                </div>
              ))}

              {wagers.map((wager) => (
                <div key={`wager-${wager.id}`} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">
                        {wager.player} wagered {formatWolo(wager.amountWolo)} WOLO on {sideLabel(market, wager.side)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {wager.executionMode || "wager"} · {formatDate(wager.createdAt)}
                        {wager.settledAt ? ` · settled ${formatDate(wager.settledAt)}` : ""}
                      </div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(wager.status)}`}>
                      {wager.status === "void" ? "refund" : wager.status}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <div>Payout/refund: <span className="font-bold text-white">{formatWolo(wager.payoutWolo)} WOLO</span></div>
                    <div>Status decides meaning. Payout alone is not a win.</div>
                  </div>

                  <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-500">
                    {wager.stakeTxHash ? <div>stake tx {shortHash(wager.stakeTxHash)}</div> : null}
                    {wager.payoutTxHash ? <div>payout tx {shortHash(wager.payoutTxHash)}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5">
            <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/[0.04] p-5">
              <div className="text-[11px] uppercase tracking-[0.4em] text-emerald-200/70">
                Founder Bonus
              </div>
              <h2 className="mt-2 text-2xl font-black text-white">{formatWolo(founderBonusWolo)} WOLO</h2>
              <div className="mt-4 grid gap-3">
                {bonuses.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                    No Founder Bonus rows recorded.
                  </div>
                ) : null}
                {bonuses.map((bonus) => (
                  <div key={bonus.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-white">
                          {formatWolo(bonus.totalAmountWolo)} WOLO · {bonus.bonusType}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{formatDate(bonus.createdAt)}</div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(bonus.status)}`}>
                        {bonus.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-sky-300/15 bg-sky-300/[0.04] p-5">
              <div className="text-[11px] uppercase tracking-[0.4em] text-sky-200/70">
                Claim / Payout Rail
              </div>
              <h2 className="mt-2 text-2xl font-black text-white">{formatWolo(claimWolo)} WOLO</h2>
              <div className="mt-4 grid gap-3">
                {claims.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                    No pending claim rows for this book.
                  </div>
                ) : null}
                {claims.map((claim) => (
                  <div key={claim.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-white">
                          {claim.displayPlayerName} · {formatWolo(claim.amountWolo)} WOLO
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {claim.claimKind || "claim"} · {formatDate(claim.createdAt)}
                        </div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(claim.status)}`}>
                        {claim.status}
                      </span>
                    </div>
                    {claim.payoutTxHash ? (
                      <div className="mt-2 font-mono text-[11px] text-slate-500">
                        payout tx {shortHash(claim.payoutTxHash)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.04] p-5">
              <div className="text-[11px] uppercase tracking-[0.4em] text-amber-200/70">
                Trust Rule
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Matched wagers settle. Voids display as refunds. Founder Bonuses stay separate from
                the betting pot. Payout amount alone never means a win — the wager status tells the truth.
              </p>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
