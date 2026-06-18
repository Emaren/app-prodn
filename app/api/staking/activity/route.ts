import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadMainnetTransferStakingActivityPage } from "@/lib/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 16;
  return Math.max(1, Math.min(parsed, 40));
}

function parseBefore(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}


type PublicBountyActivityRow = {
  source_type: "transfer" | "gift";
  id: number;
  tx_hash: string | null;
  transfer_index: number | null;
  amount_wolo: number | string | null;
  memo: string | null;
  status: string | null;
  occurred_at: Date | string | null;
};

const ECOSYSTEM_BOUNTIES_WALLET = "wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq";

function shortPublicBountyTx(value?: string | null) {
  if (!value) return null;
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatPublicBountyWolo(value: unknown) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 WOLO";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`;
}

function formatPublicBountyTime(value: unknown) {
  const d = new Date(String(value || Date.now()));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(d);
}

async function loadPublicNumberedBounties(limit: number) {
  const prisma = getPrisma();

  const rows = await prisma.$queryRawUnsafe<PublicBountyActivityRow[]>(
    `
    with paid_transfers as (
      select
        'transfer'::text as source_type,
        t.id,
        t.tx_hash,
        t.transfer_index,
        t.amount_wolo_display as amount_wolo,
        t.memo,
        'paid'::text as status,
        coalesce(t.timestamp, t.created_at) as occurred_at
      from wolo_indexed_transfers t
      where lower(t.sender_address) = lower($1)
        and lower(coalesce(t.memo, '')) like '%bounty #%'
    ),
    unclaimed_gifts as (
      select
        'gift'::text as source_type,
        g.id,
        null::text as tx_hash,
        null::int as transfer_index,
        g.amount::numeric as amount_wolo,
        g.note as memo,
        g.status,
        g.created_at as occurred_at
      from user_gifts g
      where g.kind = 'WOLO'
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
    order by occurred_at desc, id desc
    limit $2
    `,
    ECOSYSTEM_BOUNTIES_WALLET,
    limit
  );

  return rows.map((row) => {
    const amountLabel = formatPublicBountyWolo(row.amount_wolo);
    const isGift = row.source_type === "gift";
    const status = String(row.status || "").toLowerCase();
    const statusLabel = isGift && status !== "accepted" ? "unclaimed" : "paid";
    const tx = shortPublicBountyTx(row.tx_hash);
    const detail = `${String(row.memo || "Bounty").trim()}${tx ? ` · tx ${tx}` : ""}`;
    const occurredAt = new Date(row.occurred_at || Date.now()).toISOString();
    const timestampLabel = formatPublicBountyTime(row.occurred_at);

    return {
      key: `public-bounty-${row.source_type}-${row.id}-${row.transfer_index ?? 0}`,
      label: `${amountLabel} bounty ${statusLabel}`,
      detail,
      meta: timestampLabel,
      eventType: "BOUNTY",
      amountLabel,
      timestampLabel,
      occurredAt,
      tone: statusLabel === "unclaimed" ? "amber" : "emerald",
    };
  });
}


export async function GET(request: NextRequest) {
  try {
    const filterParam = request.nextUrl.searchParams.get("filter");
    if (filterParam === "bounties" && request.nextUrl.searchParams.get("mode") !== "grouped") {
      const limitParam = Number(request.nextUrl.searchParams.get("limit") || 20);
      const safeLimit = Number.isFinite(limitParam) ? Math.max(1, Math.min(120, Math.trunc(limitParam))) : 20;
      const rows = await loadPublicNumberedBounties(safeLimit);

      return NextResponse.json({
        ok: true,
        rows,
        hasMore: false,
        nextBefore: null,
      });
    }

    const payload = await loadMainnetTransferStakingActivityPage(getPrisma(), {
      limit: clampLimit(request.nextUrl.searchParams.get("limit")),
      before: parseBefore(request.nextUrl.searchParams.get("before")),
      mode: request.nextUrl.searchParams.get("mode") === "grouped" ? "grouped" : "ledger",
      filter:
        filterParam === "staking" || filterParam === "compounded" || filterParam === "bounties" || filterParam === "bets" || filterParam === "transfers"
          ? filterParam
          : "all",
    });

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Staking activity is unavailable.";
    return NextResponse.json(
      { detail, rows: [], hasMore: false, nextBefore: null },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
