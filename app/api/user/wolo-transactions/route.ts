import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { pendingWoloClaimNameKeys } from "@/lib/pendingWoloClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WoloTransactionRow = {
  id: string;
  direction: "in" | "out";
  amountWolo: number;
  label: string;
  status: string;
  occurredAt: string;
  txHash: string | null;
};

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(40, Math.max(10, parsed));
}

function clampOffset(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2_000) : 0;
}

function formatStatus(value: string | null | undefined) {
  return (value || "recorded").replace(/_/g, " ");
}

function opponentLabel(input: {
  userId: number;
  challengerUserId: number;
  challengedUserId: number;
  challenger: { inGameName: string | null; steamPersonaName: string | null; uid: string };
  challenged: { inGameName: string | null; steamPersonaName: string | null; uid: string };
}) {
  const opponent =
    input.userId === input.challengerUserId ? input.challenged : input.challenger;
  return opponent.inGameName || opponent.steamPersonaName || opponent.uid;
}

function pushRow(rows: WoloTransactionRow[], row: WoloTransactionRow | null) {
  if (!row || row.amountWolo <= 0 || !row.occurredAt) return;
  rows.push(row);
}

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const offset = clampOffset(request.nextUrl.searchParams.get("offset"));
    const sourceTake = Math.min(2_500, offset + limit + 80);
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const nameKeys = pendingWoloClaimNameKeys([
      user.inGameName,
      user.steamPersonaName,
      user.uid,
    ]);

    const [claims, gifts, wagers, stakeIntents, scheduledMatches] = await Promise.all([
      prisma.pendingWoloClaim.findMany({
        where: {
          OR: [
            { claimedByUserId: user.id },
            ...(nameKeys.length > 0 ? [{ normalizedPlayerName: { in: nameKeys } }] : []),
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amountWolo: true,
          claimKind: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          claimedAt: true,
          payoutAttemptedAt: true,
          payoutTxHash: true,
        },
      }),
      prisma.userGift.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amount: true,
          kind: true,
          status: true,
          acceptedAt: true,
          createdAt: true,
        },
      }),
      prisma.betWager.findMany({
        where: { userId: user.id },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amountWolo: true,
          payoutWolo: true,
          status: true,
          stakeTxHash: true,
          stakeLockedAt: true,
          payoutTxHash: true,
          createdAt: true,
          settledAt: true,
          market: {
            select: {
              title: true,
            },
          },
        },
      }),
      prisma.betStakeIntent.findMany({
        where: { userId: user.id },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amountWolo: true,
          status: true,
          stakeTxHash: true,
          recordedAt: true,
          verifiedAt: true,
          createdAt: true,
          market: {
            select: {
              title: true,
            },
          },
          wager: {
            select: {
              id: true,
            },
          },
        },
      }),
      prisma.scheduledMatch.findMany({
        where: {
          OR: [{ challengerUserId: user.id }, { challengedUserId: user.id }],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          status: true,
          challengerUserId: true,
          challengedUserId: true,
          wagerAmountWolo: true,
          guaranteeAmountWolo: true,
          challengerFundedAt: true,
          challengerFundingTxHash: true,
          challengedFundedAt: true,
          challengedFundingTxHash: true,
          challenger: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
          challenged: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      }),
    ]);

    const rows: WoloTransactionRow[] = [];

    for (const claim of claims) {
      pushRow(rows, {
        id: `claim-${claim.id}`,
        direction: "in",
        amountWolo: claim.amountWolo,
        label: `${claim.claimKind.replace(/_/g, " ")} claim`,
        status: formatStatus(claim.status),
        occurredAt: (
          claim.claimedAt ||
          claim.payoutAttemptedAt ||
          claim.updatedAt ||
          claim.createdAt
        ).toISOString(),
        txHash: claim.payoutTxHash,
      });
    }

    for (const gift of gifts) {
      pushRow(rows, {
        id: `gift-${gift.id}`,
        direction: "in",
        amountWolo: gift.amount ?? 0,
        label: `${gift.kind} grant`,
        status: formatStatus(gift.status),
        occurredAt: (gift.acceptedAt || gift.createdAt).toISOString(),
        txHash: null,
      });
    }

    for (const wager of wagers) {
      pushRow(rows, {
        id: `wager-out-${wager.id}`,
        direction: "out",
        amountWolo: wager.amountWolo,
        label: `Bet stake · ${wager.market.title}`,
        status: formatStatus(wager.status),
        occurredAt: (wager.stakeLockedAt || wager.createdAt).toISOString(),
        txHash: wager.stakeTxHash,
      });

      pushRow(rows, {
        id: `wager-in-${wager.id}`,
        direction: "in",
        amountWolo: wager.payoutWolo ?? 0,
        label: `Bet payout · ${wager.market.title}`,
        status: wager.payoutTxHash ? "paid" : formatStatus(wager.status),
        occurredAt: (wager.settledAt || wager.createdAt).toISOString(),
        txHash: wager.payoutTxHash,
      });
    }

    for (const intent of stakeIntents) {
      if (intent.wager) continue;
      pushRow(rows, {
        id: `stake-intent-${intent.id}`,
        direction: "out",
        amountWolo: intent.amountWolo,
        label: `Stake intent · ${intent.market.title}`,
        status: formatStatus(intent.status),
        occurredAt: (intent.recordedAt || intent.verifiedAt || intent.createdAt).toISOString(),
        txHash: intent.stakeTxHash,
      });
    }

    for (const match of scheduledMatches) {
      const amountWolo = match.wagerAmountWolo + match.guaranteeAmountWolo;
      const label = `Scheduled escrow · vs ${opponentLabel({ ...match, userId: user.id })}`;
      if (match.challengerUserId === user.id) {
        pushRow(rows, {
          id: `scheduled-challenger-${match.id}`,
          direction: "out",
          amountWolo,
          label,
          status: formatStatus(match.status),
          occurredAt: match.challengerFundedAt?.toISOString() ?? "",
          txHash: match.challengerFundingTxHash,
        });
      }
      if (match.challengedUserId === user.id) {
        pushRow(rows, {
          id: `scheduled-challenged-${match.id}`,
          direction: "out",
          amountWolo,
          label,
          status: formatStatus(match.status),
          occurredAt: match.challengedFundedAt?.toISOString() ?? "",
          txHash: match.challengedFundingTxHash,
        });
      }
    }

    rows.sort((left, right) => {
      const timeDiff = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
      return timeDiff || right.id.localeCompare(left.id);
    });

    const pageRows = rows.slice(offset, offset + limit);
    const nextOffset = offset + pageRows.length;

    return NextResponse.json({
      rows: pageRows,
      nextOffset,
      hasMore: nextOffset < rows.length,
    });
  } catch (error) {
    console.error("Failed to load WOLO transactions:", error);
    return NextResponse.json({ detail: "WOLO transactions unavailable." }, { status: 500 });
  }
}
