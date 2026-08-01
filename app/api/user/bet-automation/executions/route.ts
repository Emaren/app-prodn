import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { detail: "No active session" },
        { status: 401, headers }
      );
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        betAutoPreset: { select: { id: true } },
      },
    });
    if (!viewer) {
      return NextResponse.json(
        { detail: "User not found" },
        { status: 404, headers }
      );
    }

    if (!viewer.betAutoPreset) {
      return NextResponse.json({ rows: [] }, { headers });
    }

    const rows = await prisma.betAutoExecution.findMany({
      where: { presetId: viewer.betAutoPreset.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 12,
      select: {
        id: true,
        gameIdentityKey: true,
        sessionKey: true,
        propositionHash: true,
        selectedSide: true,
        winnerStakeWolo: true,
        desyncSide: true,
        desyncStakeWolo: true,
        status: true,
        reason: true,
        attemptCount: true,
        createdAt: true,
        updatedAt: true,
        acceptedAt: true,
        winnerMarket: {
          select: {
            id: true,
            title: true,
            eventLabel: true,
            leftLabel: true,
            rightLabel: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        rows: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString() ?? null,
        })),
      },
      { headers }
    );
  } catch (error) {
    console.error("Failed to load bet automation executions:", error);
    return NextResponse.json(
      { detail: "Auto-bet preview history is unavailable." },
      { status: 500, headers }
    );
  }
}
