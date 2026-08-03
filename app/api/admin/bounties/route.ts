import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  parseBountyRewardWolo,
  requiresBountyValuationReason,
} from "@/lib/bountyHall";
import { loadBountyAdminSnapshot } from "@/lib/bounties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE_STATUSES = [
  "available",
  "in_progress",
  "historical",
] as const;

type EditableStatus = (typeof EDITABLE_STATUSES)[number];

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function optionalDate(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function slugPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}

function editableStatus(value: unknown): EditableStatus | null {
  const candidate = text(value, 24) as EditableStatus;
  return EDITABLE_STATUSES.includes(candidate) ? candidate : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  return NextResponse.json(await loadBountyAdminSnapshot(gate.prisma));
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const id = integer(body.id);
  const assignedUid = text(body.assignedUid, 100);
  const status = editableStatus(body.status);

  if (!status) {
    return NextResponse.json(
      {
        detail:
          "A bounty may be available, in progress, or historical. Paid and locked states are derived from claims and payout proof.",
      },
      { status: 400 },
    );
  }

  const reward = parseBountyRewardWolo(body.rewardWolo);

  if (!reward.ok) {
    return NextResponse.json(
      { detail: reward.error },
      { status: 400 },
    );
  }

  const amount = reward.value;
  const valuationReason = text(body.valuationReason, 500);
  const eventMemo = text(body.eventMemo, 4_000);
  const expiresAtInput = text(body.expiresAt, 80);
  const publishedAtInput = text(body.publishedAt, 80);
  const expiresAt = optionalDate(expiresAtInput);
  const publishedAt = optionalDate(publishedAtInput);

  if (
    (expiresAtInput && !expiresAt) ||
    (publishedAtInput && !publishedAt)
  ) {
    return NextResponse.json(
      { detail: "Publication and expiration must be valid ISO dates." },
      { status: 400 },
    );
  }

  const assignedUser = assignedUid
    ? await gate.prisma.user.findUnique({
        where: { uid: assignedUid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
        },
      })
    : null;

  if (assignedUid && !assignedUser) {
    return NextResponse.json(
      { detail: "Assigned warrior account not found." },
      { status: 404 },
    );
  }

  const existing = id
    ? await gate.prisma.bountyOpportunity.findUnique({ where: { id } })
    : assignedUser
      ? await gate.prisma.bountyOpportunity.findFirst({
          where: {
            assignedUserId: assignedUser.id,
            isNextForWarrior: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        })
      : null;

  if (id && !existing) {
    return NextResponse.json(
      { detail: "Bounty opportunity not found." },
      { status: 404 },
    );
  }

  if (!existing && !assignedUser) {
    return NextResponse.json(
      { detail: "An existing bounty id or assigned warrior is required." },
      { status: 400 },
    );
  }

  const rewardChanged =
    requiresBountyValuationReason({
      existing: Boolean(existing),
      previousRewardWolo:
        existing?.rewardWolo ?? null,
      nextRewardWolo: amount,
    });

  if (rewardChanged && !valuationReason) {
    return NextResponse.json(
      {
        detail:
          "An operator reason is required whenever a published WOLO valuation is created, changed, or withdrawn.",
      },
      { status: 400 },
    );
  }

  const title = text(body.title, 160) || existing?.title || "Next Bounty";
  const description =
    text(body.description, 8_000) ||
    existing?.description ||
    "Complete the published deed under its proof requirements.";
  const eligibility = text(body.eligibility, 8_000) || null;
  const verification = text(body.verification, 8_000) || null;
  const activePersonal = Boolean(assignedUser) && status !== "historical";
  const now = new Date();

  if (expiresAt && (publishedAt || existing?.publishedAt || now) >= expiresAt) {
    return NextResponse.json(
      { detail: "Expiration must follow publication." },
      { status: 400 },
    );
  }

  const saved = await gate.prisma.$transaction(async (tx) => {
    if (assignedUser && activePersonal) {
      await tx.bountyOpportunity.updateMany({
        where: {
          assignedUserId: assignedUser.id,
          isNextForWarrior: true,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        data: { isNextForWarrior: false },
      });
    }

    const opportunity = existing
      ? await tx.bountyOpportunity.update({
          where: { id: existing.id },
          data: {
            title,
            description,
            eligibility,
            verification,
            actionLabel:
              text(body.actionLabel, 100) || existing.actionLabel,
            actionHref:
              text(body.actionHref, 500) || existing.actionHref,
            rewardWolo: amount,
            status,
            featured: body.featured === true,
            priority: Math.max(-1000, Math.min(1000, integer(body.priority))),
            bountyKind: assignedUser ? "personal" : existing.bountyKind,
            assignedUserId: assignedUser?.id ?? existing.assignedUserId,
            isNextForWarrior: activePersonal,
            publishedAt:
              status === "historical"
                ? existing.publishedAt
                : publishedAt || existing.publishedAt || now,
            expiresAt,
          },
        })
      : await tx.bountyOpportunity.create({
          data: {
            slug: `warrior-${slugPart(
              assignedUser!.uid,
            )}-${randomUUID().slice(0, 8)}`,
            title,
            category: "warrior",
            bountyKind: "personal",
            assignedUserId: assignedUser!.id,
            isNextForWarrior: activePersonal,
            description,
            eligibility,
            verification,
            actionLabel: "Open warrior profile",
            actionHref: `/players/${encodeURIComponent(
              assignedUser!.uid,
            )}`,
            rewardWolo: amount,
            status,
            featured: true,
            priority: 110,
            publishedAt: publishedAt || now,
            expiresAt,
          },
        });

    const currentValuation = await tx.bountyValuation.findFirst({
      where: {
        opportunityId: opportunity.id,
        effectiveTo: null,
      },
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    });

    const needsValuation =
      amount !== null &&
      (!currentValuation || currentValuation.rewardWolo !== amount);

    if (currentValuation && (amount === null || needsValuation)) {
      await tx.bountyValuation.update({
        where: { id: currentValuation.id },
        data: { effectiveTo: now },
      });
    }

    if (needsValuation) {
      await tx.bountyValuation.create({
        data: {
          opportunityId: opportunity.id,
          rewardWolo: amount!,
          changedByUserId: gate.user.id,
          reason: valuationReason,
          effectiveFrom: now,
        },
      });
    }

    if (
      eventMemo ||
      !existing ||
      existing.status !== status ||
      rewardChanged
    ) {
      await tx.bountyEvent.create({
        data: {
          opportunityId: opportunity.id,
          eventType: "note",
          actorDisplayName: gate.user.uid,
          amountWolo: amount,
          memo:
            eventMemo ||
            valuationReason ||
            `${title} updated by ${gate.user.uid}.`,
          sourceKind: "operator",
        },
      });
    }

    return opportunity;
  });

  return NextResponse.json({ ok: true, id: saved.id });
}
