
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAINNET_START = "2026-05-25";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type LedgerView = "all" | "staking" | "compounded" | "championships" | "bounties" | "bets" | "grouped-bets";

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

const KNOWN_STAKER_WALLETS: Record<string, string> = {
  jim: "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz",
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
      metaKind: "label",
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
      (
        select coalesce(sum(winner_wager.payout_wolo), 0)
        from bet_wagers winner_wager
        where winner_wager.market_id = bw.market_id
          and winner_wager.status = 'won'
      ) as market_payout_wolo,
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
      null::numeric as payout_wolo,
      (
        select coalesce(sum(winner_wager.payout_wolo), 0)
        from bet_wagers winner_wager
        where winner_wager.market_id = bsi.market_id
          and winner_wager.status = 'won'
      ) as market_payout_wolo,
      bsi.status,
      bsi.stake_tx_hash as tx_hash,
      coalesce(bsi.recorded_at, bsi.verified_at, bsi.created_at) as occurred_at
    from bet_stake_intents bsi
    join bet_markets bm on bm.id = bsi.market_id
    where bsi.user_id = $1
      and coalesce(bsi.recorded_at, bsi.verified_at, bsi.created_at)::date >= $2::date
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

  if (grouped) {
    const groupedRows = new Map<
      string,
      {
        market: string;
        amount: number;
        marketPayout: number;
        count: number;
        won: number;
        lost: number;
        pending: number;
        occurredAt: string;
      }
    >();

    for (const row of rows) {
      const key = String(row.market_id || row.market_title || row.id);
      const current =
        groupedRows.get(key) ||
        {
          market: row.market_title || "Bet market",
          amount: 0,
          marketPayout: 0,
          count: 0,
          won: 0,
          lost: 0,
          pending: 0,
          occurredAt: new Date(row.occurred_at || new Date()).toISOString(),
        };

      current.amount += asNumber(row.amount_wolo);
      current.marketPayout = Math.max(
        current.marketPayout,
        asNumber(row.market_payout_wolo)
      );
      current.count += 1;

      const status = String(row.status || "").toLowerCase();

      if (row.kind === "wager" && status === "won") {
        current.won += 1;
      } else if (row.kind === "wager" && status === "lost") {
        current.lost += 1;
      } else {
        current.pending += 1;
      }

      const occurredAt = new Date(
        row.occurred_at || new Date()
      ).toISOString();

      if (new Date(occurredAt) > new Date(current.occurredAt)) {
        current.occurredAt = occurredAt;
      }

      groupedRows.set(key, current);
    }

    return Array.from(groupedRows.entries()).map(([key, row]) => {
      const outcome =
        row.won > 0 && row.lost === 0 && row.pending === 0
          ? "won"
          : row.lost > 0 && row.won === 0 && row.pending === 0
            ? "lost"
            : row.won === 0 && row.lost === 0
              ? "pending"
              : "mixed";

      const tone: LedgerRow["tone"] =
        outcome === "won"
          ? "emerald"
          : outcome === "lost"
            ? "red"
            : "sky";

      const label =
        outcome === "won"
          ? `${formatWolo(row.amount)} won`
          : outcome === "lost"
            ? `${formatWolo(row.amount)} lost`
            : outcome === "mixed"
              ? `${formatWolo(row.amount)} mixed result`
              : `${formatWolo(row.amount)} bet pending`;

      const countLabel =
        `${row.count} ${row.count === 1 ? "bet" : "bets"}`;

      const payoutLabel =
        outcome === "pending"
          ? "awaiting settlement"
          : `${formatWolo(row.marketPayout)} payout value`;

      return {
        key: `grouped-bet-${key}`,
        view: "grouped-bets" as const,
        tone,
        label,
        detail: `${row.market} · ${countLabel} · ${payoutLabel}`,
        meta: formatTime(row.occurredAt),
        occurredAt: row.occurredAt,
        amountLabel: formatWolo(row.amount),
      };
    });
  }

  return rows.map((row) => {
    const occurredAt = new Date(
      row.occurred_at || new Date()
    ).toISOString();

    const amount = asNumber(row.amount_wolo);
    const payout = asNumber(row.payout_wolo);
    const marketPayout = asNumber(row.market_payout_wolo);
    const status = String(row.status || "recorded").toLowerCase();

    const won = row.kind === "wager" && status === "won";
    const lost = row.kind === "wager" && status === "lost";

    const tone: LedgerRow["tone"] =
      won ? "emerald" : lost ? "red" : "sky";

    const label =
      row.kind === "intent"
        ? `${formatWolo(amount)} bet pending`
        : won
          ? `${formatWolo(amount)} bet won`
          : lost
            ? `${formatWolo(amount)} bet lost`
            : `${formatWolo(amount)} bet wager`;

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
  });
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
    memo.includes("founders_bonus")
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
    const tx = row.txHash?.trim().toUpperCase();
    const key = tx ? `tx:${tx}` : row.key;

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

  const before = url.searchParams.get("before");
  const limitDays = Math.max(7, Math.min(45, Number(url.searchParams.get("limitDays") || 18)));

  if (!REGISTRY[slug]) {

  return NextResponse.json({ ok: false, rows: [], hasMore: false, nextBefore: null }, { status: 404 });
  }

  const user = await resolveUser(slug);
  const walletAddress = KNOWN_STAKER_WALLETS[slug] || user?.wallet_address || null;

  const [staking, championships, bounties, bets, groupedBets, walletTransfers] = await Promise.all([
    view === "all" || view === "staking" || view === "compounded" ? loadStakingRows(user?.user_id ?? null, before, limitDays) : Promise.resolve({ rows: [], hasMore: false, nextBefore: null }),
    view === "all" || view === "championships" ? loadChampionshipRows(slug, user?.user_id ?? null) : Promise.resolve([]),
    view === "all" || view === "bounties" ? loadBountyRows(user?.user_id ?? null, walletAddress) : Promise.resolve([]),
    view === "bets" ? loadBetRows(user?.user_id ?? null, false) : Promise.resolve([]),
    view === "all" || view === "grouped-bets" ? loadBetRows(user?.user_id ?? null, true) : Promise.resolve([]),
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
            ? bets
            : view === "grouped-bets"
              ? groupedBets
              : dedupeLedgerRowsForAll(
                  [
                    ...bounties,
                    ...staking.rows.filter((row) => row.view !== "staking-day"),
                    ...walletTransfers,
                    ...championships,
                    ...groupedBets,
                  ].sort(
                    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
                  )
                );

  return NextResponse.json({
    ok: true,
    slug,
    player: REGISTRY[slug].player,
    view,
    rows: (rows as unknown as LedgerRow[]).filter(isVisibleStakerLedgerRow),
    hasMore: view === "all" || view === "staking" || view === "compounded" ? staking.hasMore : false,
    nextBefore: view === "all" || view === "staking" || view === "compounded" ? staking.nextBefore : null,
    counts: {
      staking: staking.rows.length,
      championships: championships.length,
      bounties: bounties.length,
      bets: bets.length,
      groupedBets: groupedBets.length,
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
