import { NextRequest, NextResponse } from "next/server";

import {
  canonicalizeNumberedBountyTransfers,
  OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
} from "@/lib/bountyHall";
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


function shortPublicBountyTx(
  value?: string | null,
) {
  if (!value) return null;

  return value.length > 18
    ? `${value.slice(0, 8)}...${value.slice(-6)}`
    : value;
}

function formatPublicBountyWolo(
  value: unknown,
) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) {
    return "0 WOLO";
  }

  return `${n.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 6,
    },
  )} WOLO`;
}

async function loadPublicNumberedBounties(
  limit: number,
) {
  const prisma = getPrisma();

  const candidates =
    await prisma.woloIndexedTransfer.findMany({
      where: {
        senderAddress: {
          in: [
            ...OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
          ],
        },
        memo: {
          contains: "bounty",
          mode: "insensitive",
        },
      },
      orderBy: [
        { timestamp: "asc" },
        { id: "asc" },
        { transferIndex: "asc" },
      ],
      select: {
        id: true,
        txHash: true,
        transferIndex: true,
        timestamp: true,
        senderAddress: true,
        recipientAddress: true,
        amountWoloDisplay: true,
        memo: true,
      },
    });

  const rows =
    canonicalizeNumberedBountyTransfers(
      candidates,
    );

  return rows
    .slice(
      Math.max(
        0,
        rows.length - limit,
      ),
    )
    .reverse()
    .map((row) => {
      const amountLabel =
        formatPublicBountyWolo(
          row.amountWoloDisplay,
        );

      const tx =
        shortPublicBountyTx(
          row.txHash,
        );

      const occurredAt =
        row.timestamp.toISOString();

      const detail =
        `${row.canonicalMemo}` +
        `${tx ? ` · tx ${tx}` : ""}`;

      return {
        key:
          `public-numbered-bounty-${row.txHash}-${row.transferIndex}`,
        label:
          `${amountLabel} bounty paid`,
        detail,
        meta: "BOUNTY",
        eventType: "BOUNTY",
        amountLabel,
        timestampLabel:
          occurredAt,
        occurredAt,
        tone: "emerald",
        txHash:
          row.txHash,
        canonicalBountyNumber:
          row.canonicalNumber,
        writtenBountyNumber:
          row.writtenNumber,
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
      }, { headers: NO_STORE_HEADERS });
    }

    const beforeParam = request.nextUrl.searchParams.get("before");
    const before = parseBefore(beforeParam);
    if (beforeParam && !before) {
      return NextResponse.json(
        {
          detail: "Invalid before cursor.",
          rows: [],
          hasMore: false,
          nextBefore: null,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = await loadMainnetTransferStakingActivityPage(getPrisma(), {
      limit: clampLimit(request.nextUrl.searchParams.get("limit")),
      before,
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
    console.error("Staking activity load failed:", error);
    return NextResponse.json(
      {
        detail: "Staking activity is unavailable.",
        rows: [],
        hasMore: false,
        nextBefore: null,
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
