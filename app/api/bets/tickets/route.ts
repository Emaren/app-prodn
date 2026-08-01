import { NextRequest, NextResponse } from "next/server";

import {
  prepareBetStakeTicket,
  type PrepareBetStakeTicketInput,
} from "@/lib/betStakeTickets";
import { BetWagerError } from "@/lib/betWagering";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { getWoloSettlementSurfaceStatus } from "@/lib/woloBetSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  walletAddress: true,
} as const;

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }
    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: VIEWER_SELECT,
    });
    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const settlement = await getWoloSettlementSurfaceStatus();
    if (
      settlement.payoutExecutionMode === "unconfigured" ||
      (settlement.payoutExecutionMode === "settlement_service" &&
        (!settlement.payoutReady || settlement.settlementHealthOk !== true))
    ) {
      return NextResponse.json(
        { detail: "Betting temporarily paused. Settlement rail health is being verified." },
        { status: 503 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as PrepareBetStakeTicketInput;
    const result = await prepareBetStakeTicket(prisma, {
      ...payload,
      source: "manual",
      viewer,
      routePath: request.nextUrl.pathname,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BetWagerError) {
      return NextResponse.json(
        { detail: error.message, code: "bet_stake_ticket_error" },
        { status: error.status }
      );
    }
    console.error("Failed to prepare bet stake ticket:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not prepare bet ticket." },
      { status: 500 }
    );
  }
}
