import { NextRequest, NextResponse } from "next/server";

import {
  LEAGUE_CREATION_PRICE_WOLO,
  buildLeagueCreationMemo,
  normalizeLeagueRequestId,
  resolveLeagueCommissioner,
} from "@/lib/leagues";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { detail: "Sign in before founding a league." },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const requestId = normalizeLeagueRequestId(
      request.nextUrl.searchParams.get("requestId"),
    );
    if (!requestId) {
      return NextResponse.json(
        { detail: "A valid league creation request ID is required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const prisma = getPrisma();
    const commissioner = await resolveLeagueCommissioner(prisma);

    return NextResponse.json(
      {
        ok: true,
        requestId,
        amountWolo: LEAGUE_CREATION_PRICE_WOLO,
        recipientAddress: commissioner.walletAddress,
        recipientUid: commissioner.uid,
        recipientLabel: commissioner.displayName,
        memo: buildLeagueCreationMemo({
          requestId,
          creatorUid: sessionUid,
        }),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "League payment quote unavailable.";
    console.error("League creation quote failed:", error);
    return NextResponse.json(
      { detail },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
