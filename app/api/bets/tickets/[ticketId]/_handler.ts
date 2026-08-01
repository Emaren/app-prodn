import { NextRequest, NextResponse } from "next/server";

import { commitBetStakeTicket } from "@/lib/betStakeTickets";
import { BetWagerError } from "@/lib/betWagering";
import { loadBetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  walletAddress: true,
} as const;

export async function handleBetStakeTicketCommit(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> }
) {
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
    const { ticketId: ticketIdRaw } = await context.params;
    const ticketId = Number.parseInt(ticketIdRaw, 10);
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ detail: "Ticket id is required." }, { status: 400 });
    }
    const payload = (await request.json().catch(() => ({}))) as {
      stakeTxHash?: string;
      walletAddress?: string;
    };
    const result = await commitBetStakeTicket(prisma, {
      ticketId,
      viewer,
      stakeTxHash: payload.stakeTxHash,
      walletAddress: payload.walletAddress,
    });
    const board = await loadBetBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json({ ok: true, ...result, board });
  } catch (error) {
    if (error instanceof BetWagerError) {
      return NextResponse.json(
        { detail: error.message, code: "bet_stake_ticket_error" },
        { status: error.status }
      );
    }
    console.error("Failed to commit bet stake ticket:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not record bet ticket." },
      { status: 500 }
    );
  }
}
