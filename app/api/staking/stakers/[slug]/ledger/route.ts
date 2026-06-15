
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAINNET_START = "2026-05-25";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type LedgerView = "all" | "staking" | "championships" | "bets" | "grouped-bets";

type UserRow = {
  user_id: number | null;
  player: string | null;
  wallet_address: string | null;
};

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


type BetRow = {
  id: number;
  kind: "wager" | "intent";
  market_id: number | null;
  market_title: string | null;
  side: string | null;
  amount_wolo: number | string | null;
  payout_wolo: number | string | null;
  status: string | null;
  tx_hash: string | null;
  occurred_at: Date | string | null;
};

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

const REGISTRY: Record<string, { player: string; championship?: string; designation?: string }> = {
  jim: {
    player: "Jim",
    championship: "United States Champion",
    designation: "First Guardian · Crown Lane",
  },
  "julio-alvarez": {
    player: "Julio Alvarez",
    designation: "First Scout · Early Seat",
  },
  emaren: {
    player: "Emaren",
    designation: "Operator Founder · Verified Grind",
  },
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dayKey(value: Date | string) {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
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

async function resolveUser(slug: string): Promise<UserRow | null> {
  const prisma = getPrisma();

  const rows = await prisma.$queryRawUnsafe<UserRow[]>(`
    select
      u.id as user_id,
      coalesce(u.in_game_name, u.steam_persona_name, u.uid::text) as player,
      coalesce(sp.wallet_address, u.wallet_address) as wallet_address
    from users u
    left join staking_positions sp on sp.user_id = u.id
    where coalesce(u.in_game_name, u.steam_persona_name, u.uid::text) is not null
    order by coalesce(sp.current_staked_wolo, 0) desc, u.created_at asc
    limit 500
  `);

  return rows.find((row) => slugify(row.player || "") === slug) ?? null;
}

function registryChampionshipRows(slug: string): LedgerRow[] {
  const profile = REGISTRY[slug];
  if (!profile) return [];

  const rows: LedgerRow[] = [];

  if (profile.championship) {
    rows.push({
      key: `registry-championship-${slug}`,
      view: "championships",
      tone: "gold",
      label: profile.championship,
      detail: `${profile.player} · Kingdom designation · visible on the staking hall`,
      meta: "KINGDOM",
      occurredAt: "2026-05-25T12:00:00.000Z",
    });
  }

  if (profile.designation) {
    rows.push({
      key: `registry-designation-${slug}`,
      view: "championships",
      tone: "emerald",
      label: profile.designation,
      detail: `${profile.player} · Founding staker designation`,
      meta: "DESIGNATION",
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
          view: "staking",
          tone: status.includes("compound") || amount < 1 ? "gold" : "emerald",
          label:
            amount > 0 && amount < 1
              ? `${formatWolo(amount)} held reward`
              : status.includes("compound")
                ? `${formatWolo(amount)} reward compounded`
                : `${formatWolo(amount)} reward`,
          detail: `Distribution ${formatDate(allocation.distribution_date)} · canonical ${status} receipt${txLabel}`,
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
        label: `Quiet staking day: ${key}`,
        detail: "No staking movement recorded · mainnet day preserved",
        meta: "0 WOLO",
        occurredAt: `${key}T12:10:00.000Z`,
        amountLabel: "0 WOLO",
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
    rows,
    nextBefore: hasMore ? nextDay.toISOString() : null,
    hasMore,
  };
}

async function loadChampionshipRows(slug: string, userId: number | null) {
  const prisma = getPrisma();
  const rows = [...registryChampionshipRows(slug)];

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

async function loadBetRows(userId: number | null, grouped: boolean) {
  if (userId == null) return [] as LedgerRow[];

  const prisma = getPrisma();

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
      bw.status,
      coalesce(bw.payout_tx_hash, bw.stake_tx_hash) as tx_hash,
      coalesce(bw.settled_at, bw.stake_locked_at, bw.created_at) as occurred_at
    from bet_wagers bw
    join bet_markets bm on bm.id = bw.market_id
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
      null as payout_wolo,
      bsi.status,
      bsi.stake_tx_hash as tx_hash,
      coalesce(bsi.recorded_at, bsi.verified_at, bsi.created_at) as occurred_at
    from bet_stake_intents bsi
    join bet_markets bm on bm.id = bsi.market_id
    where bsi.user_id = $1
      and coalesce(bsi.recorded_at, bsi.verified_at, bsi.created_at)::date >= $2::date

    order by occurred_at desc
    limit 120
    `,
    userId,
    MAINNET_START
  );

  if (grouped) {
    const groupedRows = new Map<string, { market: string; amount: number; payout: number; count: number; occurredAt: string }>();

    for (const row of rows) {
      const key = String(row.market_id || row.market_title || row.id);
      const current =
        groupedRows.get(key) ||
        {
          market: row.market_title || "Bet market",
          amount: 0,
          payout: 0,
          count: 0,
          occurredAt: new Date(row.occurred_at || new Date()).toISOString(),
        };

      current.amount += asNumber(row.amount_wolo);
      current.payout += asNumber(row.payout_wolo);
      current.count += 1;
      const occurredAt = new Date(row.occurred_at || new Date()).toISOString();
      if (new Date(occurredAt) > new Date(current.occurredAt)) current.occurredAt = occurredAt;
      groupedRows.set(key, current);
    }

    return Array.from(groupedRows.entries()).map(([key, row]) => ({
      key: `grouped-bet-${key}`,
      view: "grouped-bets" as const,
      tone: "sky" as const,
      label: `${formatWolo(row.amount)} grouped bet activity`,
      detail: `${row.market} · ${row.count} ${row.count === 1 ? "entry" : "entries"} · ${formatWolo(row.payout)} payout value`,
      meta: formatTime(row.occurredAt),
      occurredAt: row.occurredAt,
      amountLabel: formatWolo(row.amount),
    }));
  }

  return rows.map((row) => {
    const occurredAt = new Date(row.occurred_at || new Date()).toISOString();
    const amount = asNumber(row.amount_wolo);
    const payout = asNumber(row.payout_wolo);

    return {
      key: `bet-${row.kind}-${row.id}`,
      view: "bets",
      tone: row.kind === "intent" ? "sky" : payout > 0 ? "emerald" : "sky",
      label: `${formatWolo(amount)} ${row.kind === "intent" ? "bet stake intent" : "bet wager"}`,
      detail: [
        row.market_title,
        row.side ? `side ${row.side}` : null,
        row.status,
        payout > 0 ? `${formatWolo(payout)} payout` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      meta: formatTime(occurredAt),
      occurredAt,
      amountLabel: formatWolo(amount),
      txHash: row.tx_hash,
    };
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const viewParam = url.searchParams.get("view") || "all";
  const view: LedgerView =
    viewParam === "staking" ||
    viewParam === "championships" ||
    viewParam === "bets" ||
    viewParam === "grouped-bets" ||
    viewParam === "all"
      ? viewParam
      : "all";

  const before = url.searchParams.get("before");
  const limitDays = Math.max(7, Math.min(45, Number(url.searchParams.get("limitDays") || 18)));

  if (!REGISTRY[slug]) {
    return NextResponse.json({ ok: false, rows: [], hasMore: false, nextBefore: null }, { status: 404 });
  }

  const user = await resolveUser(slug);

  const [staking, championships, bets, groupedBets] = await Promise.all([
    view === "all" || view === "staking" ? loadStakingRows(user?.user_id ?? null, before, limitDays) : Promise.resolve({ rows: [], hasMore: false, nextBefore: null }),
    view === "all" || view === "championships" ? loadChampionshipRows(slug, user?.user_id ?? null) : Promise.resolve([]),
    view === "all" || view === "bets" ? loadBetRows(user?.user_id ?? null, false) : Promise.resolve([]),
    view === "grouped-bets" ? loadBetRows(user?.user_id ?? null, true) : Promise.resolve([]),
  ]);

  const rows =
    view === "staking"
      ? staking.rows
      : view === "championships"
        ? championships
        : view === "bets"
          ? bets
          : view === "grouped-bets"
            ? groupedBets
            : [...staking.rows, ...championships, ...bets].sort(
                (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
              );

  return NextResponse.json({
    ok: true,
    slug,
    player: REGISTRY[slug].player,
    view,
    rows,
    hasMore: view === "all" || view === "staking" ? staking.hasMore : false,
    nextBefore: view === "all" || view === "staking" ? staking.nextBefore : null,
    counts: {
      staking: staking.rows.length,
      championships: championships.length,
      bets: bets.length,
      groupedBets: groupedBets.length,
    },
  });
}
