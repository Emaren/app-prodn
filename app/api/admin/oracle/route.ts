import { NextRequest, NextResponse } from "next/server";

import type { PrismaClient } from "@/lib/generated/prisma";

import { requireAdmin } from "@/lib/adminSession";
import {
  loadOracleSnapshot,
  OracleInputError,
  ORACLE_CATEGORIES,
  requireOracleActor,
  reviewOracleProposal,
  setOracleMarketStatus,
} from "@/lib/oracle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_STOCK_SLUGS = [
  "three-thousand-citizens",
  "one-thousand-september-games",
  "twenty-five-million-staked",
  "forge-first-authorization",
  "one-hundred-chamber-votes",
] as const;

const EDITABLE_MARKET_STATUSES = new Set(["draft", "review", "approved"]);

function textField(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  if (typeof value !== "string") {
    throw new OracleInputError(`${label} is required.`);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < min || normalized.length > max) {
    throw new OracleInputError(
      `${label} must be between ${min} and ${max} characters.`,
    );
  }
  return normalized;
}

function ruleField(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new OracleInputError(`${label} is required.`);
  }
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length < 20 || normalized.length > 4_000) {
    throw new OracleInputError(
      `${label} must be between 20 and 4,000 characters.`,
    );
  }
  return normalized;
}

function dateField(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new OracleInputError(`${label} is required.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new OracleInputError(`${label} is not a valid date.`);
  }
  return date;
}

function wholeNumber(
  value: unknown,
  label: string,
  min: bigint,
  max: bigint,
) {
  const raw =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  if (!/^\d+$/.test(raw.trim())) {
    throw new OracleInputError(`${label} must be a whole number.`);
  }
  const parsed = BigInt(raw.trim());
  if (parsed < min || parsed > max) {
    throw new OracleInputError(
      `${label} must be between ${min.toString()} and ${max.toString()}.`,
    );
  }
  return parsed;
}

function integerField(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new OracleInputError(
      `${label} must be a whole number from ${min.toLocaleString()} to ${max.toLocaleString()}.`,
    );
  }
  return parsed;
}

function actorLabel(actor: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return actor.inGameName?.trim() || actor.steamPersonaName?.trim() || actor.uid;
}

async function adminPayload(
  prisma: PrismaClient,
  uid: string,
) {
  const [snapshot, recentEvents, totalPositions, totalEvents] = await Promise.all([
    loadOracleSnapshot(prisma, uid),
    prisma.oracleEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
      include: {
        actor: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.oraclePaperPosition.count(),
    prisma.oracleEvent.count(),
  ]);

  const legacyStock = snapshot.markets.filter((market) =>
    (LEGACY_STOCK_SLUGS as readonly string[]).includes(market.slug),
  );

  return {
    snapshot,
    admin: {
      previewReadOnly: process.env.AOE2WAR_PROD_DB_PREVIEW === "true",
      legacyStockSlugs: [...LEGACY_STOCK_SLUGS],
      legacyStockCount: legacyStock.length,
      totalPositions,
      totalEvents,
      pendingProposals: snapshot.proposals.filter((proposal) =>
        ["proposed", "rule_review"].includes(proposal.status),
      ).length,
    },
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      marketId: event.marketId,
      proposalId: event.proposalId,
      eventType: event.eventType,
      detail: event.detail,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
      actorLabel: event.actor ? actorLabel(event.actor) : null,
    })),
  };
}

async function editMarket(
  prisma: PrismaClient,
  actor: Awaited<ReturnType<typeof requireOracleActor>>,
  payload: Record<string, unknown>,
) {
  const slug = textField(payload.slug, "Market", 1, 100).toLowerCase();

  await prisma.$transaction(async (tx) => {
    const market = await tx.oracleMarket.findUnique({
      where: { slug },
      include: {
        _count: { select: { positions: true } },
      },
    });
    if (!market) {
      throw new OracleInputError("Oracle market not found.", 404);
    }
    if (!EDITABLE_MARKET_STATUSES.has(market.status)) {
      throw new OracleInputError(
        "The exact market contract is frozen once public trading begins. Delete/recreate or advance the published lifecycle instead.",
        409,
      );
    }
    if (market._count.positions > 0) {
      throw new OracleInputError(
        "A market with citizen positions cannot have its contract rewritten.",
        409,
      );
    }

    const question = textField(payload.question, "Question", 12, 240);
    if (!question.endsWith("?")) {
      throw new OracleInputError("Market questions must end with ?.");
    }
    const summary = textField(payload.summary, "Summary", 3, 500);
    const category = textField(payload.category, "Category", 2, 40).toLowerCase();
    if (!(ORACLE_CATEGORIES as readonly string[]).includes(category)) {
      throw new OracleInputError("Choose a supported Oracle category.");
    }
    const closesAt = dateField(payload.closesAt, "Close time");
    const resolvesAt = dateField(payload.resolvesAt, "Resolution time");
    if (resolvesAt.getTime() < closesAt.getTime()) {
      throw new OracleInputError("Resolution time cannot be earlier than close time.");
    }
    const sourceLabel = textField(payload.sourceLabel, "Resolution source", 3, 160);
    const resolutionRule = ruleField(payload.resolutionRule, "YES rule");
    const voidRule = ruleField(payload.voidRule, "VOID rule");
    const maxPoolWolo = wholeNumber(
      payload.maxPoolWolo,
      "WOLO ceiling",
      BigInt(1_000),
      BigInt(100_000_000),
    );
    const seedYesMarks = integerField(payload.seedYesMarks, "YES seed", 0, 1_000_000);
    const seedNoMarks = integerField(payload.seedNoMarks, "NO seed", 0, 1_000_000);

    await tx.oracleMarket.update({
      where: { id: market.id },
      data: {
        question,
        summary,
        category,
        closesAt,
        resolvesAt,
        sourceLabel,
        resolutionRule,
        voidRule,
        maxPoolWolo,
        seedYesMarks,
        seedNoMarks,
      },
    });
    await tx.oracleEvent.create({
      data: {
        marketId: market.id,
        actorUserId: actor.id,
        eventType: "market_contract_edited",
        detail: `${actorLabel(actor)} edited the pre-trading Oracle contract for ${slug}.`,
        metadata: {
          slug,
          category,
          closesAt: closesAt.toISOString(),
          resolvesAt: resolvesAt.toISOString(),
          sourceLabel,
          maxPoolWolo: maxPoolWolo.toString(),
          seedYesMarks,
          seedNoMarks,
        },
      },
    });
  });
}

async function deleteMarket(
  prisma: PrismaClient,
  actor: Awaited<ReturnType<typeof requireOracleActor>>,
  slug: string,
  confirmation: string,
) {
  if (confirmation !== `DELETE ${slug}`) {
    throw new OracleInputError(
      `Type DELETE ${slug} exactly to remove this market.`,
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    const market = await tx.oracleMarket.findUnique({
      where: { slug },
      include: {
        _count: { select: { positions: true, events: true } },
      },
    });
    if (!market) {
      throw new OracleInputError("Oracle market not found.", 404);
    }

    await tx.oracleEvent.create({
      data: {
        marketId: market.id,
        actorUserId: actor.id,
        eventType: "market_deleted",
        detail: `${actorLabel(actor)} permanently deleted Oracle market "${market.question}".`,
        metadata: {
          publicId: market.publicId,
          slug: market.slug,
          question: market.question,
          status: market.status,
          category: market.category,
          createdByLabel: market.createdByLabel,
          positionCount: market._count.positions,
          priorEventCount: market._count.events,
          paperStage: true,
        },
      },
    });

    await tx.oracleMarket.delete({ where: { id: market.id } });
  });
}

async function deleteLegacyStock(
  prisma: PrismaClient,
  actor: Awaited<ReturnType<typeof requireOracleActor>>,
  confirmation: string,
) {
  if (confirmation !== "DELETE LEGACY STOCK") {
    throw new OracleInputError(
      "Type DELETE LEGACY STOCK exactly to clear the five seeded Oracle markets.",
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    const markets = await tx.oracleMarket.findMany({
      where: { slug: { in: [...LEGACY_STOCK_SLUGS] } },
      include: {
        _count: { select: { positions: true, events: true } },
      },
    });

    for (const market of markets) {
      await tx.oracleEvent.create({
        data: {
          marketId: market.id,
          actorUserId: actor.id,
          eventType: "market_deleted",
          detail: `${actorLabel(actor)} removed legacy seeded Oracle market "${market.question}".`,
          metadata: {
            publicId: market.publicId,
            slug: market.slug,
            question: market.question,
            legacyStock: true,
            positionCount: market._count.positions,
            priorEventCount: market._count.events,
            paperStage: true,
          },
        },
      });
      await tx.oracleMarket.delete({ where: { id: market.id } });
    }
  });
}

function mutationBlockedResponse() {
  return NextResponse.json(
    {
      detail:
        "This local dev:prod session is a read-only production preview. Oracle admin mutations are deliberately disabled here.",
    },
    { status: 409 },
  );
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof OracleInputError) {
    return NextResponse.json({ detail: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ detail: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  try {
    return NextResponse.json(
      await adminPayload(gate.prisma, gate.user.uid),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Oracle Command could not load.");
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  if (process.env.AOE2WAR_PROD_DB_PREVIEW === "true") {
    return mutationBlockedResponse();
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = await requireOracleActor(gate.prisma, gate.user.uid);

    if (payload.action === "review_proposal") {
      await reviewOracleProposal(gate.prisma, actor, payload);
    } else if (payload.action === "market_status") {
      await setOracleMarketStatus(gate.prisma, actor, payload);
    } else if (payload.action === "edit_market") {
      await editMarket(gate.prisma, actor, payload);
    } else {
      throw new OracleInputError("Choose a valid Oracle admin command.");
    }

    return NextResponse.json(await adminPayload(gate.prisma, gate.user.uid));
  } catch (error) {
    return errorResponse(error, "Oracle Command mutation failed.");
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  if (process.env.AOE2WAR_PROD_DB_PREVIEW === "true") {
    return mutationBlockedResponse();
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = await requireOracleActor(gate.prisma, gate.user.uid);

    if (payload.kind === "legacy_stock") {
      await deleteLegacyStock(
        gate.prisma,
        actor,
        typeof payload.confirmation === "string" ? payload.confirmation : "",
      );
    } else if (payload.kind === "market") {
      const slug = textField(payload.slug, "Market", 1, 100).toLowerCase();
      await deleteMarket(
        gate.prisma,
        actor,
        slug,
        typeof payload.confirmation === "string" ? payload.confirmation : "",
      );
    } else {
      throw new OracleInputError("Choose a valid Oracle delete command.");
    }

    return NextResponse.json(await adminPayload(gate.prisma, gate.user.uid));
  } catch (error) {
    return errorResponse(error, "Oracle Command delete failed.");
  }
}
