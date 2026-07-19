import { NextRequest, NextResponse } from "next/server";

import { reconcileChallengeExpiries } from "@/lib/challengeReconciler";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredToken() {
  return (
    process.env.CHALLENGE_RECONCILE_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function requestToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

export async function POST(request: NextRequest) {
  const token = configuredToken();
  if (!token) {
    return NextResponse.json(
      { detail: "CHALLENGE_RECONCILE_TOKEN or CRON_SECRET is required." },
      { status: 503 }
    );
  }
  if (requestToken(request) !== token) {
    return NextResponse.json({ detail: "Unauthorized Challenge reconciliation." }, { status: 401 });
  }

  try {
    const payload = await reconcileChallengeExpiries(getPrisma(), {
      autoExecuteRefunds:
        process.env.CHALLENGE_AUTO_REFUND_EXECUTION?.trim().toLowerCase() === "true",
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Challenge reconciliation failed:", error);
    return NextResponse.json(
      {
        detail:
          error instanceof Error ? error.message : "Challenge reconciliation failed.",
      },
      { status: 500 }
    );
  }
}
