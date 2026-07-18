import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { reconcileChallengeLifecycle } from "@/lib/challengeReconciler";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredRunToken() {
  return (
    process.env.CHALLENGE_RECONCILE_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get("x-challenge-reconcile-token")?.trim() || "";
}

function tokensEqual(left: string, right: string) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: NextRequest) {
  const runToken = configuredRunToken();
  const suppliedToken = bearerToken(request);

  let prisma = getPrisma();
  let actorUserId: number | null = null;

  if (!(runToken && tokensEqual(suppliedToken, runToken))) {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    prisma = gate.prisma;
    actorUserId = gate.user.id;
  }

  const payload = (await request.json().catch(() => ({}))) as {
    executeRefunds?: boolean;
    take?: number;
  };

  try {
    const result = await reconcileChallengeLifecycle(prisma, {
      executeRefunds: payload.executeRefunds === true,
      actorUserId,
      take: payload.take,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Challenge reconciliation failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Challenge reconciliation failed." },
      { status: 500 }
    );
  }
}
