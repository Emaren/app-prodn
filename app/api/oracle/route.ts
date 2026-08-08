import { NextRequest, NextResponse } from "next/server";

import {
  loadOracleSnapshot,
  OracleInputError,
  placeOraclePosition,
  requireOracleActor,
  reviewOracleProposal,
  setOracleMarketStatus,
  submitOracleProposal,
} from "@/lib/oracle";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof OracleInputError) {
    return NextResponse.json({ detail: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ detail: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const uid = await getSessionUid(request);
    const snapshot = await loadOracleSnapshot(getPrisma(), uid);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "The Oracle could not read the Kingdom ledger.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const uid = await getSessionUid(request);
    const prisma = getPrisma();
    const actor = await requireOracleActor(prisma, uid);

    if (payload.action === "position") {
      await placeOraclePosition(prisma, actor, payload);
    } else if (payload.action === "proposal") {
      await submitOracleProposal(prisma, actor, payload);
    } else {
      throw new OracleInputError("Choose a valid Oracle action.");
    }

    return NextResponse.json(await loadOracleSnapshot(prisma, actor.uid), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "The Oracle action failed.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const uid = await getSessionUid(request);
    const prisma = getPrisma();
    const actor = await requireOracleActor(prisma, uid);

    if (payload.action === "review_proposal") {
      await reviewOracleProposal(prisma, actor, payload);
    } else if (payload.action === "market_status") {
      await setOracleMarketStatus(prisma, actor, payload);
    } else {
      throw new OracleInputError("Choose a valid Oracle admin action.");
    }

    return NextResponse.json(await loadOracleSnapshot(prisma, actor.uid), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "The Oracle admin action failed.");
  }
}
