import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadBountyBoard } from "@/lib/bounties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["available", "in_progress", "locked", "paid", "historical"] as const;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  return NextResponse.json(await loadBountyBoard(gate.prisma));
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = integer(body.id);
  const status = text(body.status, 24);
  if (!id || !STATUSES.includes(status as never)) {
    return NextResponse.json({ detail: "Bounty id and valid status are required." }, { status: 400 });
  }
  const existing = await gate.prisma.bountyOpportunity.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ detail: "Bounty not found." }, { status: 404 });
  const amount = body.rewardWolo === null || body.rewardWolo === "" ? null : Math.max(0, integer(body.rewardWolo));
  const memo = text(body.eventMemo, 4_000);

  await gate.prisma.$transaction(async (tx) => {
    await tx.bountyOpportunity.update({
      where: { id },
      data: {
        title: text(body.title, 160) || existing.title,
        description: text(body.description, 8_000) || existing.description,
        eligibility: text(body.eligibility, 8_000) || null,
        verification: text(body.verification, 8_000) || null,
        actionLabel: text(body.actionLabel, 100) || existing.actionLabel,
        actionHref: text(body.actionHref, 500) || existing.actionHref,
        rewardWolo: amount,
        status,
        featured: body.featured === true,
        priority: Math.max(-1000, Math.min(1000, integer(body.priority))),
      },
    });
    if (memo || existing.status !== status) {
      await tx.bountyEvent.create({
        data: {
          opportunityId: id,
          eventType: status === "in_progress" ? "claimed" : status === "available" ? "note" : status,
          actorDisplayName: gate.user.uid,
          amountWolo: amount,
          memo: memo || `${existing.title} moved from ${existing.status} to ${status}.`,
          sourceKind: "operator",
        },
      });
    }
  });
  return NextResponse.json({ ok: true });
}

