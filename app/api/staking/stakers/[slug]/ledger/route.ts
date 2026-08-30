
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadBetLifecycleActivityPage } from "@/lib/betLifecycleActivity";
import type { BetLifecycleEventKind } from "@/lib/betLifecycleProjection";
import { normalizePendingWoloClaimName } from "@/lib/pendingWoloClaims";
import { resolveStakerBetLedgerOutcome } from "@/lib/stakerBetLedger";
import {
  resolveActiveStakerProfile,
  type ActiveStakerProfile,
} from "@/lib/stakerProfileResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAINNET_START = "2026-05-25";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type LedgerView = "all" | "staking" | "compounded" | "championships" | "bounties" | "bets" | "grouped-bets";

type AllocationRow = {
  id: number | null;
  reward_wolo: number | string | null;
  reward_uwolo: bigint | number | string | null;
  status: string | null;
  occurred_at: Date | string | null;
  distribution_date: Date | string | null;
};

type StakingEventRow = {
  id: number;
  type: string | null;
  amount_wolo: number | string | null;
  status: string | null;
  tx_hash: string | null;
  occurred_at: Date | string | null;
};

type BadgeRow = {
  id: number;
  label: string | null;
  note: string | null;
  status: string | null;
  occurred_at: Date | string | null;
};

type GiftRow = {
  id: number;
  kind: string | null;
  amount: number | string | null;
  note: string | null;
  status: string | null;
  occurred_at: Date | string | null;
};

type BountyLedgerRow = {
  source_type: "transfer" | "gift";
  id: number;
  tx_hash: string | null;
  transfer_index: number | null;
  recipient_address: string | null;
  amount_wolo: number | string | null;
  memo: string | null;
  status: string | null;
  occurred_at: Date | string | null;
};


type WalletTransferRow = {
  id: number;
  tx_hash: string | null;
  transfer_index: number | null;
  sender_address: string | null;
  recipient_address: string | null;
  amount_wolo: number | string | null;
  memo: string | null;
  occurred_at: Date | string | null;
};

type BetRow = {
  id: number;
  kind: "wager" | "intent";
  market_id: number | null;
  market_title: string | null;
  side: string | null;
  amount_wolo: number | string | null;
  payout_wolo: number | string | null;
  market_payout_wolo: number | string | null;
  status: string | null;
  payout_tx_hash: string | null;
  tx_hash: string | null;
  occurred_at: Date | string | null;
};

type LedgerRow = {
  key: string;
  view: LedgerView | "staking-day";
  tone: "gold" | "emerald" | "red" | "sky" | "slate";
  label: string;
  detail: string;
  meta: string;
  metaKind?: "label" | "timestamp";
  occurredAt: string;
  amountLabel?: string;
  txHash?: string | null;
};

type LedgerRowsPage = {
  rows: LedgerRow[];
  hasMore: boolean;
  nextBefore: string | null;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dayKey(value: Date | string) {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

function parseOptionalBefore(value: string | null) {
  if (!value) return { ok: true as const, value: null as string | null };
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? { ok: true as const, value: parsed.toISOString() }
    : { ok: false as const, value: null };
}

function parseLimitDays(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(7, Math.min(45, parsed)) : 18;
}

function combinedNextCursor(
  ...pages: Array<{ hasMore: boolean; nextBefore: string | null | undefined }>
) {
  const candidates = pages
    .filter((page) => page.hasMore)
    .map((page) => (page.nextBefore ? new Date(page.nextBefore) : null))
    .filter((value): value is Date => Boolean(value && Number.isFinite(value.getTime())))
    .sort((left, right) => right.getTime() - left.getTime());
  return candidates[0]?.toISOString() ?? null;
}

function startOfUtcDay(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function todayUtcDay() {
  return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatWolo(value: number) {
  if (!Number.isFinite(value)) return "0 WOLO";
  if (value > 0 && value < 1) return `${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} WOLO`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`;
}

function amountFromUwolo(value: unknown, fallbackWolo: unknown) {
  const uwolo = BigInt(String(value || 0));
  if (uwolo > BigInt(0)) return Number(uwolo) / 1_000_000;
  return asNumber(fallbackWolo);
}

function featuredChampionshipRows(profile: ActiveStakerProfile): LedgerRow[] {
  const featured = profile.featured;
  if (!featured) return [];

  const rows: LedgerRow[] = [];

  if (featured.ledgerChampionship) {
    rows.push({
      key: `featured-championship-${profile.userId}`,
      view: "championships",
      tone: "gold",
      label: featured.ledgerChampionship,
      detail: `${profile.player} · Kingdom designation · visible on the staking hall`,
      meta: "KINGDOM",
      metaKind: "label",
      occurredAt: "2026-05-25T12:00:00.000Z",
    });
  }

  if (featured.ledgerDesignation) {
    rows.push({
      key: `featured-designation-${profile.userId}`,
      view: "championships",
      tone: "emerald",
      label: featured.ledgerDesignation,
      detail: `${profile.player} · Founding staker designation`,
      meta: "DESIGNATION",
      metaKind: "label",
      occurredAt: "2026-05-25T12:00:01.000Z",
    });
  }

  return rows;
}

async function loadStakingRows(userId: number | null, before: string | null, limitDays: number) {
  const mainnetStart = startOfUtcDay(MAINNET_START);
  const beforeDate = before ? startOfUtcDay(dayKey(before)) : todayUtcDay();
  const endDay = before ? beforeDate : todayUtcDay();
  const startDay = addDays(endDay, -(limitDays - 1)) < mainnetStart ? mainnetStart : addDays(endDay, -(limitDays - 1));

  const dayKeys: string[] = [];
  for (let cursor = new Date(endDay); cursor >= startDay; cursor = addDays(cursor, -1)) {
    dayKeys.push(cursor.toISOString().slice(0, 10));
  }

  if (dayKeys.length === 0) {
    return { rows: [] as LedgerRow[], nextBefore: null as string | null, hasMore: false };
  }

  const prisma = getPrisma();
  const allocations =
    userId == null
      ? []
      : await prisma.$queryRawUnsafe<AllocationRow[]>(
          `
          select
            a.id,
            a.reward_wolo,
            a.reward_uwolo,
            a.status,
            coalesce(a.credited_at, a.claimed_at, a.created_at, d.created_at) as occurred_at,
            d.distribution_date
          from staking_reward_distributions d
          left join staking_reward_allocations a
            on a.distribution_id = d.id
           and a.user_id = $1
          where d.status = 'FINALIZED'
            and d.distribution_date::date >= $2::date
            and d.distribution_date::date <= $3::date
          order by d.distribution_date desc, coalesce(a.credited_at, a.claimed_at, a.created_at, d.created_at) desc, a.id desc
          `,
          userId,
          dayKeys[dayKeys.length - 1],
          dayKeys[0]
        );

  const events =
    userId == null
      ? []
      : await prisma.$queryRawUnsafe<StakingEventRow[]>(
          `
          select
            id,
            type,
            amount_wolo,
            status,
            tx_hash,
            coalesce(confirmed_at, created_at) as occurred_at
          from staking_events
          where user_id = $1
            and coalesce(confirmed_at, created_at)::date >= $2::date
            and coalesce(confirmed_at, created_at)::date <= $3::date
          order by coalesce(confirmed_at, created_at) desc, id desc
          `,
          userId,
          dayKeys[dayKeys.length - 1],
          dayKeys[0]
        );

  const allocationsByDay = new Map<string, AllocationRow[]>();
  const activeStakingDays = new Set<string>();

  for (const row of allocations) {
    if (!row.distribution_date) continue;
    const key = dayKey(row.distribution_date);
    const list = allocationsByDay.get(key) || [];
    if (row.id != null) {
      list.push(row);
      activeStakingDays.add(key);
    }
    allocationsByDay.set(key, list);
  }

  const eventTxByKindDay = new Map<string, string>();
  const allocationKindDays = new Set<string>();

  for (const row of allocations) {
    if (!row.id || !row.occurred_at) continue;
    const status = String(row.status || "").toLowerCase();
    const kind = status.includes("compound") ? "compound" : status.includes("claim") ? "claim" : null;
    if (!kind) continue;
    allocationKindDays.add(`${kind}:${dayKey(row.occurred_at)}`);
  }

  for (const event of events) {
    if (!event.occurred_at) continue;
    activeStakingDays.add(dayKey(event.occurred_at));

    const type = String(event.type || "").toLowerCase();
    const kind = type.includes("compound") ? "compound" : type.includes("claim") ? "claim" : null;
    if (kind && event.tx_hash) {
      eventTxByKindDay.set(`${kind}:${dayKey(event.occurred_at)}`, event.tx_hash);
    }
  }

  const visibleEvents = events.filter((event) => {
    if (!event.occurred_at) return true;
    const type = String(event.type || "").toLowerCase();
    const kind = type.includes("compound") ? "compound" : type.includes("claim") ? "claim" : null;
    if (!kind) return true;
    return !allocationKindDays.has(`${kind}:${dayKey(event.occurred_at)}`);
  });

  const eventRows: LedgerRow[] = visibleEvents.map((event) => {
    const occurredAt = new Date(event.occurred_at || new Date()).toISOString();
    const type = String(event.type || "staking event").toLowerCase();
    const amount = asNumber(event.amount_wolo);

    return {
      key: `staking-event-${event.id}`,
      view: "staking",
      tone: type.includes("unstake") ? "sky" : "gold",
      label: `${formatWolo(amount)} ${type}`,
      detail: `${String(event.status || "recorded")} ${event.tx_hash ? `· tx ${event.tx_hash.slice(0, 8)}...${event.tx_hash.slice(-6)}` : ""}`.trim(),
      meta: formatTime(event.occurred_at),
      occurredAt,
      amountLabel: formatWolo(amount),
      txHash: event.tx_hash,
    };
  });

  const dailyRows: LedgerRow[] = [];
  for (const key of dayKeys) {
    const allocationRows = allocationsByDay.get(key) || [];

    if (allocationRows.length > 0) {
      for (const allocation of allocationRows) {
        const amount = amountFromUwolo(allocation.reward_uwolo, allocation.reward_wolo);
        const status = String(allocation.status || "reward").toLowerCase();
        const occurredAt = new Date(allocation.occurred_at || `${key}T12:10:00.000Z`).toISOString();
        const kind = status.includes("compound") ? "compound" : status.includes("claim") ? "claim" : null;
        const mergedTx = kind ? eventTxByKindDay.get(`${kind}:${dayKey(occurredAt)}`) : null;
        const txLabel = mergedTx ? ` · tx ${mergedTx.slice(0, 8)}...${mergedTx.slice(-6)}` : "";

        dailyRows.push({
          key: `staking-allocation-${allocation.id}`,
          view: status.includes("compound") ? "compounded" : "staking",
          tone: status.includes("compound") || amount < 1 ? "gold" : "emerald",
          label:
            amount > 0 && amount < 1
              ? `${formatWolo(amount)} held micro reward`
              : status.includes("compound")
                ? `${formatWolo(amount)} auto-compounded reward`
                : `${formatWolo(amount)} reward`,
          detail: status.includes("compound")
            ? `Rolled into principal · Distribution ${formatDate(allocation.distribution_date)} · canonical compounded receipt${txLabel}`
            : `Distribution ${formatDate(allocation.distribution_date)} · canonical ${status} receipt${txLabel}`,
          meta: formatTime(occurredAt),
          occurredAt,
          amountLabel: formatWolo(amount),
          txHash: mergedTx,
        });
      }
    } else if (!activeStakingDays.has(key)) {
      dailyRows.push({
        key: `staking-day-${key}`,
        view: "staking-day",
        tone: "slate",
        label: `Quiet staking day · ${key}`,
        detail: "No staking movement recorded · mainnet day preserved",
        meta: "Quiet day",
        occurredAt: `${key}T12:10:00.000Z`,
      });
    }
  }

  const rows = [...eventRows, ...dailyRows].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );

  const oldestDay = dayKeys[dayKeys.length - 1];
  const nextDay = addDays(startOfUtcDay(oldestDay), -1);
  const hasMore = nextDay >= mainnetStart;

  return {
    rows: (rows as unknown as LedgerRow[]).filter(isVisibleStakerLedgerRow),
    nextBefore: hasMore ? nextDay.toISOString() : null,
    hasMore,
  };
}

async function loadChampionshipRows(profile: ActiveStakerProfile, userId: number | null) {
  const prisma = getPrisma();
  const rows = [...featuredChampionshipRows(profile)];

  if (userId != null) {
    const [badges, gifts] = await Promise.all([
      prisma.$queryRawUnsafe<BadgeRow[]>(
        `
        select id, label, note, status, coalesce(accepted_at, created_at) as occurred_at
        from user_badges
        where user_id = $1
          and coalesce(accepted_at, created_at)::date >= $2::date
        order by coalesce(accepted_at, created_at) desc, id desc
        limit 40
        `,
        userId,
        MAINNET_START
      ),
      prisma.$queryRawUnsafe<GiftRow[]>(
        `
        select id, kind, amount, note, status, coalesce(accepted_at, created_at) as occurred_at
        from user_gifts
        where user_id = $1
          and coalesce(accepted_at, created_at)::date >= $2::date
        order by coalesce(accepted_at, created_at) desc, id desc
        limit 40
        `,
        userId,
        MAINNET_START
      ),
    ]);

    for (const badge of badges) {
      rows.push({
        key: `badge-${badge.id}`,
        view: "championships",
        tone: "gold",
        label: badge.label || "Kingdom badge",
        detail: [badge.note, badge.status].filter(Boolean).join(" · ") || "Kingdom designation",
        meta: formatTime(badge.occurred_at),
        occurredAt: new Date(badge.occurred_at || new Date()).toISOString(),
      });
    }

    for (const gift of gifts) {
      rows.push({
        key: `gift-${gift.id}`,
        view: "championships",
        tone: "emerald",
        label: `${formatWolo(asNumber(gift.amount))} ${gift.kind || "gift"}`,
        detail: [gift.note, gift.status].filter(Boolean).join(" · ") || "Kingdom benefit",
        meta: formatTime(gift.occurred_at),
        occurredAt: new Date(gift.occurred_at || new Date()).toISOString(),
        amountLabel: formatWolo(asNumber(gift.amount)),
      });
    }
  }

  return rows;
}

const STAKER_LIFECYCLE_LABELS: Record<BetLifecycleEventKind, string> = {
  stake_intent: "stake awaiting verification",
  stake_recorded: "app-side stake recorded",
  escrow_funded: "verified on-chain stake",
  founder_participants: "Founder participant bonus",
  founder_winner: "Founder winner premium",
  result: "result",
  payout: "payout",
  refund: "refund",
  winner_bounty: "winner bounty",
};

async function loadBetRows(
  userId: number | null,
  grouped: boolean,
  playerName?: string | null,
  before?: string | null,
): Promise<LedgerRowsPage> {
  if (userId == null) return { rows: [], hasMore: false, nextBefore: null };

  const prisma = getPrisma();

  if (grouped) {
    const normalizedPlayerName = normalizePendingWoloClaimName(playerName);
    const lifecyclePage = await loadBetLifecycleActivityPage(prisma, {
      limit: 40,
      minimumAt: new Date(`${MAINNET_START}T00:00:00.000Z`),
      before,
      userId,
      normalizedPlayerNames: normalizedPlayerName ? [normalizedPlayerName] : [],
    });

    const rows = lifecyclePage.groups.map((group) => {
      const failed = group.events.some((event) => event.payoutDestination === "failed");
      const paid = group.events.some((event) => event.payoutDestination === "wallet");
      const refunded = group.events.some((event) => event.kind === "refund");
      const pending = group.events.some((event) =>
        event.payoutDestination === "awaiting_wallet_link" ||
        event.payoutDestination === "settlement_queue"
      );
      const tone: LedgerRow["tone"] = failed
        ? "red"
        : paid
          ? "emerald"
          : refunded
            ? "slate"
            : "sky";
      const phaseSummary = group.events
        .map((event) => STAKER_LIFECYCLE_LABELS[event.kind])
        .join(" · ");
      const destination = failed
        ? "payout needs operator attention"
        : pending
          ? "settlement is not complete"
          : paid
            ? "wallet transaction present"
            : null;

      return {
        key: group.id,
        view: "grouped-bets" as const,
        tone,
        label: `${formatWolo(group.stakeTotalWolo)} bet lifecycle`,
        detail: [group.marketTitle, phaseSummary, destination].filter(Boolean).join(" · "),
        meta: formatTime(group.occurredAt),
        occurredAt: group.occurredAt,
        amountLabel: formatWolo(group.stakeTotalWolo),
      } satisfies LedgerRow;
    });
    return {
      rows,
      hasMore: lifecyclePage.hasMore,
      nextBefore: lifecyclePage.nextBefore,
    };
  }

  const rows = await prisma.$queryRawUnsafe<BetRow[]>(
    `
    select
      bw.id,
      'wager' as kind,
      bw.market_id,
      bm.title as market_title,
      bw.side,
      bw.amount_wolo,
      bw.payout_wolo,
      (
        select coalesce(sum(winner_wager.payout_wolo), 0)
        from bet_wagers winner_wager
        where winner_wager.market_id = bw.market_id
          and winner_wager.status = 'won'
      ) as market_payout_wolo,
      bw.status,
      bw.payout_tx_hash,
      coalesce(
        bw.payout_tx_hash,
        bw.stake_tx_hash,
        case
          when ticket.status = 'recorded' then ticket.stake_tx_hash
          else null
        end
      ) as tx_hash,
      coalesce(bw.settled_at, bw.stake_locked_at, bw.created_at) as occurred_at
    from bet_wagers bw
    join bet_markets bm on bm.id = bw.market_id
    left join bet_stake_legs leg on leg.id = bw.stake_leg_id
    left join bet_stake_tickets ticket on ticket.id = leg.ticket_id
    where bw.user_id = $1
      and coalesce(bw.settled_at, bw.stake_locked_at, bw.created_at)::date >= $2::date

    union all

    select
      bsi.id,
      'intent' as kind,
      bsi.market_id,
      bm.title as market_title,
      bsi.side,
      bsi.amount_wolo,
      null::numeric as payout_wolo,
      (
        select coalesce(sum(winner_wager.payout_wolo), 0)
        from bet_wagers winner_wager
        where winner_wager.market_id = bsi.market_id
          and winner_wager.status = 'won'
      ) as market_payout_wolo,
      bsi.status,
      null::text as payout_tx_hash,
      bsi.stake_tx_hash as tx_hash,
      coalesce(bsi.recorded_at, bsi.verified_at, bsi.created_at) as occurred_at
    from bet_stake_intents bsi
    join bet_markets bm on bm.id = bsi.market_id
    where bsi.user_id = $1
      and coalesce(bsi.recorded_at, bsi.verified_at, bsi.created_at)::date >= $2::date
      and (
        bsi.status = 'recorded'
        or bsi.stake_tx_hash is not null
      )
      and not exists (
        select 1
        from bet_wagers linked_wager
        where linked_wager.stake_intent_id = bsi.id
           or (
             linked_wager.market_id = bsi.market_id
             and linked_wager.user_id = bsi.user_id
             and linked_wager.stake_tx_hash is not null
             and bsi.stake_tx_hash is not null
             and upper(linked_wager.stake_tx_hash) = upper(bsi.stake_tx_hash)
           )
      )

    order by occurred_at desc
    limit 120
    `,
    userId,
    MAINNET_START
  );

  return {
    rows: rows.map((row) => {
    const occurredAt = new Date(
      row.occurred_at || new Date()
    ).toISOString();

    const amount = asNumber(row.amount_wolo);
    const payout = asNumber(row.payout_wolo);
    const marketPayout = asNumber(row.market_payout_wolo);
    const status = String(row.status || "recorded").toLowerCase();
    const outcome = resolveStakerBetLedgerOutcome({
      kind: row.kind,
      status: row.status,
      payoutTxHash: row.payout_tx_hash,
    });
    const won = outcome === "won";
    const lost = outcome === "lost";
    const refunded = outcome === "refunded";
    const refundQueued = outcome === "refund_queued";
    const stakeRecovery = outcome === "stake_recovery";

    const tone: LedgerRow["tone"] =
      won ? "emerald" : lost ? "red" : refunded ? "slate" : "sky";

    const label =
      won
        ? `${formatWolo(amount)} bet won`
        : lost
          ? `${formatWolo(amount)} bet lost`
          : refunded
            ? `${formatWolo(amount)} bet refunded`
            : refundQueued
              ? `${formatWolo(amount)} bet voided`
              : stakeRecovery
                ? `${formatWolo(amount)} stake recovery`
                : row.kind === "intent"
                  ? `${formatWolo(amount)} bet pending`
                  : `${formatWolo(amount)} bet active`;

    return {
      key: `bet-${row.kind}-${row.id}`,
      view: "bets",
      tone,
      label,
      detail: [
        row.market_title,
        row.side ? `side ${row.side}` : null,
        status,
        won ? `${formatWolo(payout)} paid out` : null,
        refunded ? `${formatWolo(payout || amount)} exact stake returned` : null,
        refundQueued ? "refund awaiting chain proof" : null,
        stakeRecovery ? "wallet transfer needs reconciliation" : null,
        lost && marketPayout > 0
          ? `${formatWolo(marketPayout)} payout value`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      meta: formatTime(occurredAt),
      occurredAt,
      amountLabel: formatWolo(amount),
      txHash: row.tx_hash,
      };
    }),
    hasMore: false,
    nextBefore: null,
  };
}

function shortClaimTx(value?: string | null) {
  if (!value) return null;
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function shortWalletAddress(value?: string | null) {
  const clean = value?.trim();
  if (!clean) return "unknown";
  return clean.length > 18 ? `${clean.slice(0, 8)}...${clean.slice(-6)}` : clean;
}

function isBetLikeWalletMemo(value?: string | null) {
  const memo = String(value || "").toLowerCase();
  return (
    memo.includes("bet stake") ||
    memo.includes("bet_refund") ||
    memo.includes("founders_bonus") ||
    memo.includes("bounty #")
  );
}


function isVisibleStakerLedgerRow(row: LedgerRow): boolean {
  const label = String(row.label || "").toLowerCase();
  const detail = String(row.detail || "").toLowerCase();
  const amountLabel = String(row.amountLabel || "").toLowerCase();
  const text = `${label} ${detail} ${amountLabel}`;

  const isFaucetHotWallet =
    text.includes("wolo1dsh") &&
    text.includes("myp5g0");

  return !isFaucetHotWallet;
}


function dedupeLedgerRowsForAll(rows: unknown[]): LedgerRow[] {
  const seen = new Set<string>();
  const out: LedgerRow[] = [];

  for (const raw of rows) {
    const row = raw as LedgerRow;
    // One chain transaction may fund several economic legs or claims. A hash is
    // proof, not event identity, so only collapse an exact projected row.
    const key = row.key;

    if (seen.has(key)) continue;

    seen.add(key);
    out.push(row);
  }

  return out;
}

async function loadWalletTransferRows(walletAddress: string | null | undefined): Promise<LedgerRow[]> {
  const wallet = walletAddress?.trim().toLowerCase();
  if (!wallet) return [];

  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<WalletTransferRow[]>(
      `
      select
        t.id,
        t.tx_hash,
        t.transfer_index,
        t.sender_address,
        t.recipient_address,
        t.amount_wolo_display as amount_wolo,
        t.memo,
        coalesce(t.timestamp, t.created_at) as occurred_at
      from wolo_indexed_transfers t
      where (
          lower(t.sender_address) = lower($1)
          or lower(t.recipient_address) = lower($1)
        )
        and coalesce(t.timestamp, t.created_at)::date >= $2::date
      order by coalesce(t.timestamp, t.created_at) desc, t.id desc, t.transfer_index desc
      limit 360
      `,
      wallet,
      MAINNET_START
    );

    return rows
      .filter((row) => !isBetLikeWalletMemo(row.memo))
      .map((row) => {
        const sender = row.sender_address?.trim().toLowerCase() || "";
        const recipient = row.recipient_address?.trim().toLowerCase() || "";
        const incoming = recipient === wallet;
        const outgoing = sender === wallet;
        const amount = asNumber(row.amount_wolo);
        const tx = shortClaimTx(row.tx_hash);
        const counterparty = incoming ? row.sender_address : row.recipient_address;
        const direction = incoming ? "received" : outgoing ? "sent" : "wallet transfer";

        return {
          key: `wallet-transfer-${row.id}-${row.transfer_index ?? 0}`,
          view: "all",
          tone: incoming ? "emerald" : "sky",
          label: `${formatWolo(amount)} ${direction}`,
          detail: [
            incoming ? `from ${shortWalletAddress(counterparty)}` : `to ${shortWalletAddress(counterparty)}`,
            row.memo?.trim() || null,
            tx ? `tx ${tx}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          meta: formatTime(row.occurred_at),
          occurredAt: new Date(row.occurred_at || Date.now()).toISOString(),
          amountLabel: formatWolo(amount),
          txHash: row.tx_hash,
        };
      });
  } catch (error) {
    console.error("[staking/stakers/ledger] failed to load wallet transfer rows", error);
    return [];
  }
}



async function loadBountyRows(userId: number | null, walletAddress: string | null | undefined): Promise<LedgerRow[]> {
  const wallet = walletAddress?.trim().toLowerCase() || "";
  if (userId == null && !wallet) return [];

  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<BountyLedgerRow[]>(
      `
      with paid_transfers as (
        select
          'transfer'::text as source_type,
          t.id,
          t.tx_hash,
          t.transfer_index,
          t.recipient_address,
          t.amount_wolo_display as amount_wolo,
          t.memo,
          'paid'::text as status,
          coalesce(t.timestamp, t.created_at) as occurred_at
        from wolo_indexed_transfers t
        where lower(t.recipient_address) = lower($2)
          and lower(coalesce(t.memo, '')) like '%bounty #%'
          and coalesce(t.timestamp, t.created_at)::date >= $3::date
      ),
      unclaimed_gifts as (
        select
          'gift'::text as source_type,
          g.id,
          null::text as tx_hash,
          null::int as transfer_index,
          u.wallet_address as recipient_address,
          g.amount::numeric as amount_wolo,
          g.note as memo,
          g.status,
          g.created_at as occurred_at
        from user_gifts g
        join users u on u.id = g.user_id
        where g.user_id = $1::int
          and g.kind = 'WOLO'
          and g.amount > 0
          and lower(coalesce(g.note, '')) like '%bounty #%'
          and lower(coalesce(g.status, '')) in ('pending', 'accepted')
          and coalesce(g.display_on_profile, false) = true
      )
      select *
      from (
        select * from paid_transfers
        union all
        select * from unclaimed_gifts
      ) rows
      order by occurred_at desc, id desc, coalesce(transfer_index, 0) desc
      limit 180
      `,
      userId ?? -1,
      wallet,
      MAINNET_START
    );

    return rows.map((row) => {
      const amount = asNumber(row.amount_wolo);
      const tx = shortClaimTx(row.tx_hash);
      const memo = row.memo?.trim() || "Bounty";
      const isGift = row.source_type === "gift";
      const status = String(row.status || "").toLowerCase();
      const statusLabel = isGift && status !== "accepted" ? "unclaimed" : "paid";

      return {
        key: `bounty-${row.source_type}-${row.id}-${row.transfer_index ?? 0}`,
        view: "bounties",
        tone: isGift && status !== "accepted" ? "gold" : "emerald",
        label: `${formatWolo(amount)} bounty ${statusLabel}`,
        detail: `${memo}${tx ? ` · tx ${tx}` : ""}`,
        meta: formatTime(row.occurred_at),
        occurredAt: new Date(row.occurred_at || Date.now()).toISOString(),
        amountLabel: formatWolo(amount),
        txHash: row.tx_hash,
      };
    });
  } catch (error) {
    console.error("[staking/stakers/ledger] failed to load bounty rows", error);
    return [];
  }
}

function insertQuietRewardDays<T extends { key: string; occurredAt: string; view: string; tone: string; label: string; detail: string; meta?: string; amountLabel?: string }>(rows: T[]): T[] {
  if (!rows.length) return rows;

  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const day = row.occurredAt.slice(0, 10);
    const bucket = groups.get(day);
    if (bucket) bucket.push(row);
    else groups.set(day, [row]);
  }

  const orderedDays = [...groups.keys()].sort((a, b) => b.localeCompare(a));
  if (!orderedDays.length) return rows;

  const latest = new Date(`${orderedDays[0]}T00:00:00.000Z`);
  const oldest = new Date(`${orderedDays[orderedDays.length - 1]}T00:00:00.000Z`);

  const out: T[] = [];
  for (let d = new Date(latest); d >= oldest; d.setUTCDate(d.getUTCDate() - 1)) {
    const key = d.toISOString().slice(0, 10);
    const dayRows = groups.get(key);
    if (dayRows?.length) {
      out.push(...dayRows);
    } else {
      out.push({
        key: `quiet-reward-day-${key}`,
        view: "staking-day",
        tone: "slate",
        label: `Quiet reward day · ${key}`,
        detail: "No claim, payout, or compound movement recorded.",
        meta: "Quiet day",
        occurredAt: `${key}T12:00:00.000Z`,
      } as T);
    }
  }

  return out;
}

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const viewParam = url.searchParams.get("view") || "all";
  const view: LedgerView =
    viewParam === "staking" ||
    viewParam === "compounded" ||
    viewParam === "championships" ||
    viewParam === "bounties" ||
    viewParam === "bets" ||
    viewParam === "grouped-bets" ||
    viewParam === "all"
      ? viewParam
      : "all";

  const parsedBefore = parseOptionalBefore(url.searchParams.get("before"));
  if (!parsedBefore.ok) {
    return NextResponse.json(
      { ok: false, rows: [], hasMore: false, nextBefore: null, detail: "Invalid before cursor." },
      { status: 400 },
    );
  }
  const before = parsedBefore.value;
  const limitDays = parseLimitDays(url.searchParams.get("limitDays"));

  const profile = await resolveActiveStakerProfile(getPrisma(), slug);
  if (!profile) {
    return NextResponse.json(
      { ok: false, rows: [], hasMore: false, nextBefore: null },
      { status: 404 },
    );
  }

  const userId = profile.userId;
  const walletAddress = profile.walletAddress;

  const [staking, championships, bounties, bets, groupedBets, walletTransfers] = await Promise.all([
    view === "all" || view === "staking" || view === "compounded" ? loadStakingRows(userId, before, limitDays) : Promise.resolve({ rows: [], hasMore: false, nextBefore: null }),
    view === "all" || view === "championships" ? loadChampionshipRows(profile, userId) : Promise.resolve([]),
    view === "all" || view === "bounties" ? loadBountyRows(userId, walletAddress) : Promise.resolve([]),
    view === "bets"
      ? loadBetRows(userId, false, profile.player, before)
      : Promise.resolve({ rows: [], hasMore: false, nextBefore: null }),
    view === "all" || view === "grouped-bets"
      ? loadBetRows(userId, true, profile.player, before)
      : Promise.resolve({ rows: [], hasMore: false, nextBefore: null }),
    view === "all" ? loadWalletTransferRows(walletAddress) : Promise.resolve([]),
  ]);

  const rows =
    view === "staking"
      ? staking.rows
      : view === "compounded"
        ? insertQuietRewardDays(
            staking.rows.filter((row) => {
              const text = `${row.label} ${row.detail} ${row.txHash || ""}`.toLowerCase();
              return (
                row.view === "compounded" ||
                text.includes("auto-compounded") ||
                text.includes("compound") ||
                text.includes("rolled into principal") ||
                text.includes("held micro reward") ||
                text.includes("micro_accrued") ||
                text.includes("micro reward") ||
                text.includes("payout threshold") ||
                text.includes("reward payout") ||
                text.includes("paid out") ||
                text.includes("claimed reward") ||
                text.includes("canonical claimed")
              );
            })
          )
      : view === "championships"
        ? championships
        : view === "bounties"
          ? bounties
          : view === "bets"
          ? bets.rows
            : view === "grouped-bets"
              ? groupedBets.rows
              : dedupeLedgerRowsForAll(
                  [
                    ...bounties,
                    ...staking.rows.filter((row) => row.view !== "staking-day"),
                    ...walletTransfers,
                    ...championships,
                    ...groupedBets.rows,
                  ].sort(
                    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
                  )
                );

  return NextResponse.json({
    ok: true,
    slug: profile.slug,
    player: profile.player,
    view,
    rows: (rows as unknown as LedgerRow[]).filter(isVisibleStakerLedgerRow),
    hasMore:
      view === "grouped-bets"
        ? groupedBets.hasMore
        : view === "all"
          ? staking.hasMore || groupedBets.hasMore
          : view === "staking" || view === "compounded"
            ? staking.hasMore
            : false,
    nextBefore:
      view === "grouped-bets"
        ? groupedBets.nextBefore
        : view === "all"
          ? combinedNextCursor(staking, groupedBets)
          : view === "staking" || view === "compounded"
            ? staking.nextBefore
            : null,
    counts: {
      staking: staking.rows.length,
      championships: championships.length,
      bounties: bounties.length,
      bets: bets.rows.length,
      groupedBets: groupedBets.rows.length,
      walletTransfers: walletTransfers.length,
      compounded: staking.rows.filter((row) => {
        const text = `${row.label} ${row.detail} ${row.txHash || ""}`.toLowerCase();
        return (
          row.view === "compounded" ||
          text.includes("auto-compounded") ||
          text.includes("compound") ||
          text.includes("rolled into principal") ||
          text.includes("held micro reward") ||
          text.includes("micro_accrued") ||
          text.includes("micro reward") ||
          text.includes("payout threshold") ||
          text.includes("reward payout") ||
          text.includes("paid out") ||
          text.includes("claimed reward") ||
          text.includes("canonical claimed")
        );
      }).length,
    },
  });
}
