import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  inspectSignedButUnrecordedBetStakes,
  reconcileSignedButUnrecordedBetStakes,
} from "@/lib/betStakeAutoRecovery";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredRunToken() {
  return (
    process.env.BET_STAKE_RECONCILE_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function suppliedToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return (
    match?.[1]?.trim() ||
    request.headers.get("x-bet-stake-reconcile-token")?.trim() ||
    ""
  );
}

function tokensEqual(left: string, right: string) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: NextRequest) {
  const configured = configuredRunToken();
  if (!configured) {
    return NextResponse.json(
      { detail: "Bet stake reconciliation is not configured." },
      { status: 503 }
    );
  }
  if (!tokensEqual(suppliedToken(request), configured)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function parseTake(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10);
  return undefined;
}

export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  const take = parseTake(request.nextUrl.searchParams.get("take"));
  try {
    const plan = await inspectSignedButUnrecordedBetStakes(getPrisma(), { take });
    return NextResponse.json({ ok: true, mode: "plan", ...plan });
  } catch (error) {
    console.error("Bet stake reconciliation plan failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Bet stake reconciliation plan failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  const payload = (await request.json().catch(() => ({}))) as { take?: unknown };
  const take = parseTake(payload.take);

  try {
    const result = await reconcileSignedButUnrecordedBetStakes(getPrisma(), { take });
    return NextResponse.json({ ok: true, mode: "apply", ...result });
  } catch (error) {
    console.error("Bet stake reconciliation failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Bet stake reconciliation failed." },
      { status: 500 }
    );
  }
}
