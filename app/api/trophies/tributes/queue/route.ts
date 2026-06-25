import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  ensureDailyTrophyTributePayouts,
  ensureTrophySeedData,
  executePendingTrophyTributePayouts,
} from "@/lib/trophies/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function getRunToken() {
  return (
    process.env.TROPHY_TRIBUTE_QUEUE_TOKEN?.trim() ||
    process.env.STAKING_REWARD_RUN_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get("x-trophy-tribute-token")?.trim() || "";
}

function parseUtcDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Use date=YYYY-MM-DD for trophy tribute queue backfills.");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Use date=YYYY-MM-DD for trophy tribute queue backfills.");
  }
  return parsed;
}

function utcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function POST(request: NextRequest) {
  const configuredToken = getRunToken();
  if (!configuredToken) {
    return NextResponse.json(
      { detail: "TROPHY_TRIBUTE_QUEUE_TOKEN, STAKING_REWARD_RUN_TOKEN, or CRON_SECRET is required." },
      { status: 503 }
    );
  }

  if (bearerToken(request) !== configuredToken) {
    return NextResponse.json({ detail: "Unauthorized trophy tribute queue run." }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    const requestedDate = parseUtcDate(request.nextUrl.searchParams.get("date"));
    const runAt = requestedDate ?? new Date();
    const dayStart = utcDayStart(runAt);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    await ensureTrophySeedData(prisma);

    const beforeTodayRows = await prisma.trophyPayout.count({
      where: {
        payoutKind: "daily_tribute",
        scheduledFor: { gte: dayStart, lt: dayEnd },
      },
    });

    await ensureDailyTrophyTributePayouts(prisma, runAt);

    const todayRows = await prisma.trophyPayout.findMany({
      where: {
        payoutKind: "daily_tribute",
        scheduledFor: { gte: dayStart, lt: dayEnd },
      },
      include: { trophy: true },
      orderBy: [{ id: "asc" }],
      take: 100,
    });

    const dueNow = todayRows.filter(
      (row) =>
        ["pending", "dry_run", "retrying", "failed"].includes(row.status) &&
        !row.txHash &&
        (!row.scheduledFor || row.scheduledFor <= runAt)
    );
    const paidToday = todayRows.filter(
      (row) => row.status === "paid" && Boolean(row.txHash)
    );
    const failedToday = todayRows.filter((row) => row.status === "failed");

    const autoExecuteSetting = await prisma.trophySetting.findUnique({
      where: { key: "trophy_tribute_auto_execute" },
      select: { value: true },
    });
    const trophyTributeAutoExecute = autoExecuteSetting?.value === true;
    const autoExecution = trophyTributeAutoExecute
      ? await executePendingTrophyTributePayouts(prisma, { limit: 25 })
      : null;

    return NextResponse.json({
      ok: true,
      queuedAt: new Date().toISOString(),
      queueDate: dayStart.toISOString().slice(0, 10),
      mode: trophyTributeAutoExecute ? "queue_and_auto_execute" : "queue_only_manual",
      beforeTodayRows,
      afterTodayRows: todayRows.length,
      createdTodayRows: Math.max(0, todayRows.length - beforeTodayRows),
      dueNowCount: dueNow.length,
      paidTodayCount: paidToday.length,
      failedTodayCount: failedToday.length,
      autoExecute: trophyTributeAutoExecute,
      executionSummary: autoExecution
        ? {
            scanned: autoExecution.scanned,
            paid: autoExecution.paid,
            failed: autoExecution.failed,
            skipped: autoExecution.skipped,
            results: autoExecution.results,
          }
        : null,
      rows: todayRows.map((row) => ({
        id: row.id,
        trophyId: row.trophy.trophyId,
        trophyName: row.trophy.displayName,
        recipient: row.recipientDisplayName,
        amountWolo: row.amountWolo,
        payoutKind: row.payoutKind,
        status: row.status,
        scheduledFor: row.scheduledFor?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        txHash: row.txHash,
      })),
    });
  } catch (error) {
    console.error("Failed to queue trophy tribute payouts:", error);
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not queue trophy tribute payouts.",
      },
      { status: 500 }
    );
  }
}
