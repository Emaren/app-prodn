import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { loadMainnetTransferStakingActivityPage } from "@/lib/staking";
import { canInspectOperationalReserveActivity } from "@/lib/stakingTransferClassification";


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


function shortPublicBountyTx(value?: string | null) {
  if (!value) return null;
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatPublicBountyWolo(value: unknown) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 WOLO";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`;
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
      where lower(coalesce(t.memo, '')) like '%bounty%'
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
        and lower(coalesce(g.note, '')) like '%bounty%'
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
    limit $1
    `,
    limit
  );

  return rows.map((row) => {
    const amountLabel = formatPublicBountyWolo(row.amount_wolo);
    const isGift = row.source_type === "gift";
    const status = String(row.status || "").toLowerCase();
    const statusLabel =
      status === "pending" || status === "unclaimed" || (isGift && status !== "accepted")
        ? "unclaimed"
        : "paid";
    const tx = shortPublicBountyTx(row.tx_hash);
    const detail = `${String(row.memo || "Bounty").trim()}${tx ? ` · tx ${tx}` : ""}`;
    const occurredAt = new Date(row.occurred_at || Date.now()).toISOString();

    return {
      key: `public-bounty-${row.source_type}-${row.id}-${row.transfer_index ?? 0}`,
      label: `${amountLabel} bounty ${statusLabel}`,
      detail,
      meta: "BOUNTY",
      eventType: "BOUNTY",
      amountLabel,
      timestampLabel: occurredAt,
      occurredAt,
      tone: statusLabel === "unclaimed" ? "amber" : "emerald",
    };
  });
}

async function requestIsAdmin(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return false;
  const user = await getPrisma().user.findUnique({
    where: { uid },
    select: { isAdmin: true },
  });
  return Boolean(user?.isAdmin);
}


export async function GET(request: NextRequest) {
  try {
    const filterParam = request.nextUrl.searchParams.get("filter");
    const reserveViewAllowed = canInspectOperationalReserveActivity({
      isAdmin: filterParam === "reserve" ? await requestIsAdmin(request) : false,
      selectedFilter: filterParam,
    });
    if (filterParam === "reserve" && !reserveViewAllowed) {
      return NextResponse.json(
        { rows: [], hasMore: false, nextBefore: null },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (filterParam === "bounties" && request.nextUrl.searchParams.get("mode") !== "grouped") {
      const limitParam = Number(request.nextUrl.searchParams.get("limit") || 500);
      const safeLimit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, Math.trunc(limitParam))) : 500;
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
        reserveViewAllowed
          ? "reserve"
          : filterParam === "staking" || filterParam === "compounded" || filterParam === "bounties" || filterParam === "bets" || filterParam === "transfers"
          ? filterParam
          : "all",
      includeReserveActivity: reserveViewAllowed,
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
