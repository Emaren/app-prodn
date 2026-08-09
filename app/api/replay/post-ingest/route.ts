import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { queueBetMarketEnsure } from "@/lib/betMarketEnsureQueue";
import {
  classifyReplayIngestReceipt,
  coordinateReplayPostIngest,
  replayPostIngestReportSucceeded,
} from "@/lib/replayPostIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function authorized(request: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY?.trim();
  const supplied = request.headers.get("x-api-key")?.trim();
  return Boolean(expected && supplied && expected === supplied);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { detail: "Invalid internal replay post-ingest credential." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: JsonRecord | null = null;
  try {
    body = record(await request.json());
  } catch {
    body = null;
  }

  const payload = record(body?.receipt);
  if (!payload) {
    return NextResponse.json(
      { detail: "A replay ingest receipt is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const receipt = classifyReplayIngestReceipt(payload, true);
  if (!receipt.accepted || receipt.gameId === null) {
    return NextResponse.json(
      { detail: "The receipt must identify an accepted replay row." },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  const prisma = getPrisma();
  const report = await coordinateReplayPostIngest({
    prisma,
    receipts: [receipt],
    source:
      typeof body?.source === "string" && body.source.trim()
        ? body.source.trim().slice(0, 48)
        : "api_direct",
    reconcileMarketsForReadyResult: true,
  });

  // Live and final replay commits are the event that should make market
  // discovery run; public GET traffic is only a fallback trigger.
  if (
    !report.financial.markets.requested ||
    report.financial.markets.succeeded === false
  ) {
    queueBetMarketEnsure(prisma, 0);
  }

  const postIngestSucceeded =
    replayPostIngestReportSucceeded(
      report
    );

  return NextResponse.json(
    {
      ok: postIngestSucceeded,
      gameStatsId: receipt.gameId,
      idempotencyKey: report.idempotencyKey,
      automatic: report.automatic,
      financial: report.financial,
    },
    {
      status: postIngestSucceeded ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
