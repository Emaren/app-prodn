import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

export const ORACLE_MARK_ALLOWANCE = 1_000;
export const ORACLE_PROPOSAL_BOND_WOLO = 100;

export const ORACLE_CATEGORIES = [
  "growth",
  "games",
  "streaming",
  "economy",
  "forge",
  "community",
] as const;

export const ORACLE_ACTIVE_STATUSES = [
  "approved",
  "trading",
  "paused",
  "locked",
  "resolving",
  "challenge",
] as const;

export const ORACLE_MARKET_STATUSES = [
  "draft",
  "review",
  "approved",
  "trading",
  "paused",
  "locked",
  "resolving",
  "challenge",
  "settled",
  "voided",
] as const;

const ORACLE_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  draft: ["review", "voided"],
  review: ["approved", "voided"],
  approved: ["trading", "voided"],
  trading: ["paused", "locked", "voided"],
  paused: ["trading", "locked", "voided"],
  locked: ["resolving", "voided"],
  resolving: ["challenge", "settled", "voided"],
  challenge: ["resolving", "settled", "voided"],
  settled: [],
  voided: [],
};

const PUBLIC_PROPOSAL_STATUSES = ["proposed", "rule_review", "approved"];
const ORACLE_LOCK_NAMESPACE = 1_608_080;

export type OracleSide = "yes" | "no";

export type OracleViewer = {
  uid: string;
  displayName: string;
  isAdmin: boolean;
};

export type OracleEventView = {
  id: number;
  eventType: string;
  detail: string;
  createdAt: string;
  actorLabel: string | null;
};

export type OraclePositionView = {
  side: OracleSide;
  amountMarks: number;
  updatedAt: string;
};

export type OracleMarketView = {
  publicId: string;
  slug: string;
  question: string;
  summary: string;
  category: string;
  outcomeType: string;
  status: string;
  closesAt: string;
  resolvesAt: string;
  sourceMetricKey: string;
  sourceLabel: string;
  currentValue: string | null;
  targetValue: string | null;
  liveMetric: {
    value: string | null;
    label: string;
    note: string;
    observedAt: string;
  };
  resolutionRule: string;
  voidRule: string;
  maxPoolWolo: string | null;
  seedYesMarks: number;
  seedNoMarks: number;
  yesMarks: number;
  noMarks: number;
  placedMarks: number;
  uniqueForecasters: number;
  yesProbabilityBps: number;
  createdByLabel: string;
  createdAt: string;
  updatedAt: string;
  viewerPosition: OraclePositionView | null;
  events: OracleEventView[];
  availableAdminStatuses: string[];
};

export type OracleProposalView = {
  publicId: string;
  question: string;
  category: string;
  outcomeType: string;
  closesAt: string;
  resolvesAt: string;
  sourceMetricKey: string;
  sourceLabel: string;
  resolutionRule: string;
  voidRule: string;
  maxPoolWolo: string;
  bondWolo: number;
  bondStatus: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  creatorLabel: string;
  isViewerProposal: boolean;
  events: OracleEventView[];
};

export type OracleSnapshot = {
  generatedAt: string;
  stage: "oracle_marks";
  viewer: OracleViewer | null;
  markBalance: {
    total: number;
    allocated: number;
    available: number;
  };
  pulse: {
    registeredCitizens: number;
    verifiedBattles: number;
    stakedWolo: string;
    activeMarkets: number;
    placedMarks: number;
    forecasters: number;
  };
  markets: OracleMarketView[];
  proposals: OracleProposalView[];
};

export class OracleInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OracleInputError";
    this.status = status;
  }
}

type OracleActor = {
  id: number;
  uid: string;
  isAdmin: boolean;
  inGameName: string | null;
  steamPersonaName: string | null;
};

type LiveMetric = OracleMarketView["liveMetric"];

function userLabel(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid;
}

function bigintString(value: bigint | number | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

function normalizeText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") {
    throw new OracleInputError(`${label} is required.`);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new OracleInputError(
      `${label} must be between ${minimum} and ${maximum} characters.`,
    );
  }
  return normalized;
}

function normalizeRule(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new OracleInputError(`${label} is required.`);
  }
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length < 20 || normalized.length > 4_000) {
    throw new OracleInputError(`${label} must be between 20 and 4,000 characters.`);
  }
  return normalized;
}

function parseFutureDate(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new OracleInputError(`${label} is required.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new OracleInputError(`${label} is not a valid date.`);
  }
  return parsed;
}

function parsePoolCeiling(value: unknown) {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(raw.trim())) {
    throw new OracleInputError("The future WOLO market ceiling must be a whole number.");
  }
  const amount = BigInt(raw.trim());
  if (amount < BigInt(1_000) || amount > BigInt(100_000_000)) {
    throw new OracleInputError("The future WOLO market ceiling must be between 1,000 and 100,000,000.");
  }
  return amount;
}

function slugifyQuestion(question: string, publicId: string) {
  const base = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/^will-/, "")
    .slice(0, 76)
    .replace(/-$/g, "");
  return `${base || "citizen-market"}-${publicId.replace(/-/g, "").slice(0, 8)}`;
}

export function oraclePoolProbabilityBps(yesMarks: number, noMarks: number) {
  const total = yesMarks + noMarks;
  return total > 0 ? Math.round((yesMarks / total) * 10_000) : 5_000;
}

export function oracleNextAllocatedMarks(input: {
  currentAllocated: number;
  previousMarketAmount: number;
  requestedAmount: number;
}) {
  return input.currentAllocated - input.previousMarketAmount + input.requestedAmount;
}

function serializeEvent(event: {
  id: number;
  eventType: string;
  detail: string;
  createdAt: Date;
  actor?: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
}): OracleEventView {
  return {
    id: event.id,
    eventType: event.eventType,
    detail: event.detail,
    createdAt: event.createdAt.toISOString(),
    actorLabel: event.actor ? userLabel(event.actor) : null,
  };
}

async function loadViewer(prisma: PrismaClient, uid: string | null) {
  if (!uid) return null;
  return prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });
}

export async function requireOracleActor(prisma: PrismaClient, uid: string | null) {
  if (!uid) {
    throw new OracleInputError("Sign in with Steam to enter the Oracle.", 401);
  }
  const actor = await loadViewer(prisma, uid);
  if (!actor) {
    throw new OracleInputError("The signed account could not be found.", 404);
  }
  return actor;
}

async function loadLiveContext(prisma: PrismaClient) {
  const septemberStart = new Date("2026-09-01T00:00:00.000Z");
  const octoberStart = new Date("2026-10-01T00:00:00.000Z");
  const augustStart = new Date("2026-08-01T00:00:00.000Z");
  const [
    registeredCitizens,
    verifiedBattles,
    septemberBattles,
    stakeAggregate,
    augustBallots,
    forgeProjects,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.gameStats.count({ where: { is_final: true } }),
    prisma.gameStats.count({
      where: {
        is_final: true,
        played_on: { gte: septemberStart, lt: octoberStart },
      },
    }),
    prisma.stakingPosition.aggregate({
      where: { status: "active" },
      _sum: { currentStakedWolo: true },
    }),
    prisma.roundVote.count({
      where: { createdAt: { gte: augustStart, lt: septemberStart } },
    }),
    prisma.forgeProject.findMany({
      where: { slug: { in: ["battle-cam-ii", "academy-intelligence"] } },
      select: { slug: true, title: true, status: true, updatedAt: true },
    }),
  ]);

  return {
    observedAt: new Date().toISOString(),
    registeredCitizens,
    verifiedBattles,
    septemberBattles,
    stakedWolo: stakeAggregate._sum.currentStakedWolo ?? 0,
    augustBallots,
    forgeProjects,
  };
}

function unavailableLiveContext(): Awaited<ReturnType<typeof loadLiveContext>> {
  return {
    observedAt: new Date().toISOString(),
    registeredCitizens: 0,
    verifiedBattles: 0,
    septemberBattles: 0,
    stakedWolo: 0,
    augustBallots: 0,
    forgeProjects: [],
  };
}

function liveMetricFor(
  metricKey: string,
  fallbackValue: bigint | null,
  context: Awaited<ReturnType<typeof loadLiveContext>>,
): LiveMetric {
  const base = {
    observedAt: context.observedAt,
    note: "Live context only — the frozen resolution source and rule remain authoritative.",
  };

  switch (metricKey) {
    case "registered_citizen_count_v1":
      return {
        ...base,
        value: String(context.registeredCitizens),
        label: "Registered citizens now",
      };
    case "verified_battles_2026_09_v1":
      return {
        ...base,
        value: String(context.septemberBattles),
        label: "Final September battles now",
      };
    case "citizen_stake_wolo_v1":
      return {
        ...base,
        value: String(context.stakedWolo),
        label: "App-indexed active stake",
      };
    case "round_ballot_count_2026_08_v1":
      return {
        ...base,
        value: String(context.augustBallots),
        label: "Unique August ballots now",
      };
    case "forge_authorization_order_v1": {
      const order = context.forgeProjects
        .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())
        .map((project) => `${project.title}: ${project.status}`)
        .join(" · ");
      return {
        ...base,
        value: order || null,
        label: "Forge project state",
      };
    }
    default:
      return {
        ...base,
        value: bigintString(fallbackValue),
        label: "Published market context",
      };
  }
}

export async function loadOracleSnapshot(
  prisma: PrismaClient,
  viewerUid: string | null,
): Promise<OracleSnapshot> {
  const viewer = await loadViewer(prisma, viewerUid);
  const proposalWhere: Prisma.OracleMarketProposalWhereInput = viewer?.isAdmin
    ? {}
    : viewer
      ? {
          OR: [
            { status: { in: PUBLIC_PROPOSAL_STATUSES } },
            { createdByUserId: viewer.id },
          ],
        }
      : { status: { in: PUBLIC_PROPOSAL_STATUSES } };

  const [markets, proposals, liveContext, allocatedAggregate, distinctForecasters] =
    await Promise.all([
      prisma.oracleMarket.findMany({
        orderBy: [{ closesAt: "asc" }, { createdAt: "desc" }],
        include: {
          positions: {
            select: {
              userId: true,
              side: true,
              amountMarks: true,
              updatedAt: true,
            },
          },
          events: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 18,
            include: {
              actor: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
        },
      }),
      prisma.oracleMarketProposal.findMany({
        where: proposalWhere,
        orderBy: [{ createdAt: "desc" }],
        take: 60,
        include: {
          creator: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
          events: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 10,
            include: {
              actor: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
        },
      }),
      // Pulse metrics add atmosphere and current context, but they never settle a
      // market. Keep the Oracle floor available if an adjacent metric source is
      // temporarily unavailable; published market rules remain authoritative.
      loadLiveContext(prisma).catch(() => unavailableLiveContext()),
      viewer
        ? prisma.oraclePaperPosition.aggregate({
            where: {
              userId: viewer.id,
              market: { status: { in: [...ORACLE_ACTIVE_STATUSES] } },
            },
            _sum: { amountMarks: true },
          })
        : Promise.resolve({ _sum: { amountMarks: null } }),
      prisma.oraclePaperPosition.findMany({
        distinct: ["userId"],
        select: { userId: true },
      }),
    ]);

  const allocated = allocatedAggregate._sum.amountMarks ?? 0;
  const marketViews = markets.map<OracleMarketView>((market) => {
    const yesPlaced = market.positions.reduce(
      (total, position) => total + (position.side === "yes" ? position.amountMarks : 0),
      0,
    );
    const noPlaced = market.positions.reduce(
      (total, position) => total + (position.side === "no" ? position.amountMarks : 0),
      0,
    );
    const yesMarks = market.seedYesMarks + yesPlaced;
    const noMarks = market.seedNoMarks + noPlaced;
    const viewerPosition = viewer
      ? market.positions.find((position) => position.userId === viewer.id) ?? null
      : null;

    return {
      publicId: market.publicId,
      slug: market.slug,
      question: market.question,
      summary: market.summary,
      category: market.category,
      outcomeType: market.outcomeType,
      status: market.status,
      closesAt: market.closesAt.toISOString(),
      resolvesAt: market.resolvesAt.toISOString(),
      sourceMetricKey: market.sourceMetricKey,
      sourceLabel: market.sourceLabel,
      currentValue: bigintString(market.currentValue),
      targetValue: bigintString(market.targetValue),
      liveMetric: liveMetricFor(market.sourceMetricKey, market.currentValue, liveContext),
      resolutionRule: market.resolutionRule,
      voidRule: market.voidRule,
      maxPoolWolo: bigintString(market.maxPoolWolo),
      seedYesMarks: market.seedYesMarks,
      seedNoMarks: market.seedNoMarks,
      yesMarks,
      noMarks,
      placedMarks: yesPlaced + noPlaced,
      uniqueForecasters: market.positions.length,
      yesProbabilityBps: oraclePoolProbabilityBps(yesMarks, noMarks),
      createdByLabel: market.createdByLabel,
      createdAt: market.createdAt.toISOString(),
      updatedAt: market.updatedAt.toISOString(),
      viewerPosition: viewerPosition
        ? {
            side: viewerPosition.side === "no" ? "no" : "yes",
            amountMarks: viewerPosition.amountMarks,
            updatedAt: viewerPosition.updatedAt.toISOString(),
          }
        : null,
      events: market.events.map(serializeEvent),
      availableAdminStatuses: [...(ORACLE_STATUS_TRANSITIONS[market.status] ?? [])],
    };
  });

  return {
    generatedAt: liveContext.observedAt,
    stage: "oracle_marks",
    viewer: viewer
      ? {
          uid: viewer.uid,
          displayName: userLabel(viewer),
          isAdmin: viewer.isAdmin,
        }
      : null,
    markBalance: {
      total: ORACLE_MARK_ALLOWANCE,
      allocated,
      available: Math.max(0, ORACLE_MARK_ALLOWANCE - allocated),
    },
    pulse: {
      registeredCitizens: liveContext.registeredCitizens,
      verifiedBattles: liveContext.verifiedBattles,
      stakedWolo: String(liveContext.stakedWolo),
      activeMarkets: marketViews.filter((market) =>
        (ORACLE_ACTIVE_STATUSES as readonly string[]).includes(market.status),
      ).length,
      placedMarks: marketViews.reduce((total, market) => total + market.placedMarks, 0),
      forecasters: distinctForecasters.length,
    },
    markets: marketViews,
    proposals: proposals.map((proposal) => ({
      publicId: proposal.publicId,
      question: proposal.question,
      category: proposal.category,
      outcomeType: proposal.outcomeType,
      closesAt: proposal.closesAt.toISOString(),
      resolvesAt: proposal.resolvesAt.toISOString(),
      sourceMetricKey: proposal.sourceMetricKey,
      sourceLabel: proposal.sourceLabel,
      resolutionRule: proposal.resolutionRule,
      voidRule: proposal.voidRule,
      maxPoolWolo: String(proposal.maxPoolWolo),
      bondWolo: proposal.bondWolo,
      bondStatus: proposal.bondStatus,
      status: proposal.status,
      reviewNote: proposal.reviewNote,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
      creatorLabel: userLabel(proposal.creator),
      isViewerProposal: proposal.createdByUserId === viewer?.id,
      events: proposal.events.map(serializeEvent),
    })),
  };
}

export async function placeOraclePosition(
  prisma: PrismaClient,
  actor: OracleActor,
  payload: { slug?: unknown; side?: unknown; amountMarks?: unknown },
) {
  const slug = normalizeText(payload.slug, "Market", 1, 100).toLowerCase();
  const side: OracleSide = payload.side === "yes" ? "yes" : payload.side === "no" ? "no" : (() => {
    throw new OracleInputError("Choose YES or NO.");
  })();
  const amountMarks = Number(payload.amountMarks);
  if (!Number.isSafeInteger(amountMarks) || amountMarks < 0 || amountMarks > ORACLE_MARK_ALLOWANCE) {
    throw new OracleInputError(`Oracle Marks must be a whole number from 0 to ${ORACLE_MARK_ALLOWANCE}.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ORACLE_LOCK_NAMESPACE}, ${actor.id})`;
    const market = await tx.oracleMarket.findUnique({
      where: { slug },
      select: { id: true, slug: true, question: true, status: true, closesAt: true },
    });
    if (!market) throw new OracleInputError("Oracle market not found.", 404);
    if (market.status !== "trading") {
      throw new OracleInputError("This market is not accepting forecasts.", 409);
    }
    if (market.closesAt.getTime() <= Date.now()) {
      throw new OracleInputError("This market has reached its published close time.", 409);
    }

    const previous = await tx.oraclePaperPosition.findUnique({
      where: { marketId_userId: { marketId: market.id, userId: actor.id } },
      select: { id: true, side: true, amountMarks: true },
    });
    const allocation = await tx.oraclePaperPosition.aggregate({
      where: {
        userId: actor.id,
        market: { status: { in: [...ORACLE_ACTIVE_STATUSES] } },
      },
      _sum: { amountMarks: true },
    });
    const nextAllocated = oracleNextAllocatedMarks({
      currentAllocated: allocation._sum.amountMarks ?? 0,
      previousMarketAmount: previous?.amountMarks ?? 0,
      requestedAmount: amountMarks,
    });
    if (nextAllocated > ORACLE_MARK_ALLOWANCE) {
      throw new OracleInputError(
        `That forecast needs ${nextAllocated.toLocaleString()} Marks, but each account may allocate ${ORACLE_MARK_ALLOWANCE.toLocaleString()} across active markets.`,
        409,
      );
    }

    if (amountMarks === 0) {
      if (!previous) return;
      await tx.oraclePaperPosition.delete({ where: { id: previous.id } });
      await tx.oracleEvent.create({
        data: {
          marketId: market.id,
          actorUserId: actor.id,
          eventType: "position_cleared",
          detail: `${userLabel(actor)} cleared a ${previous.side.toUpperCase()} forecast of ${previous.amountMarks} Oracle Marks.`,
          metadata: {
            previousSide: previous.side,
            previousAmountMarks: previous.amountMarks,
            unit: "oracle_marks",
          },
        },
      });
      return;
    }

    await tx.oraclePaperPosition.upsert({
      where: { marketId_userId: { marketId: market.id, userId: actor.id } },
      create: { marketId: market.id, userId: actor.id, side, amountMarks },
      update: { side, amountMarks },
    });
    await tx.oracleEvent.create({
      data: {
        marketId: market.id,
        actorUserId: actor.id,
        eventType: previous ? "position_updated" : "position_opened",
        detail: `${userLabel(actor)} ${previous ? "updated" : "opened"} a ${side.toUpperCase()} forecast with ${amountMarks} Oracle Marks.`,
        metadata: {
          side,
          amountMarks,
          previousSide: previous?.side ?? null,
          previousAmountMarks: previous?.amountMarks ?? null,
          unit: "oracle_marks",
        },
      },
    });
  });
}

export async function submitOracleProposal(
  prisma: PrismaClient,
  actor: OracleActor,
  payload: Record<string, unknown>,
) {
  const question = normalizeText(payload.question, "Question", 12, 240);
  if (!question.endsWith("?")) {
    throw new OracleInputError("Write the market question as a question ending in ?.");
  }
  const category = normalizeText(payload.category, "Category", 2, 40).toLowerCase();
  if (!(ORACLE_CATEGORIES as readonly string[]).includes(category)) {
    throw new OracleInputError("Choose a supported Oracle category.");
  }
  const outcomeType = payload.outcomeType === "binary" || payload.outcomeType === undefined
    ? "binary"
    : (() => {
        throw new OracleInputError("The first Oracle season accepts exact YES / NO proposals.");
      })();
  const closesAt = parseFutureDate(payload.closesAt, "Close time");
  const resolvesAt = parseFutureDate(payload.resolvesAt, "Resolution time");
  if (closesAt.getTime() < Date.now() + 15 * 60_000) {
    throw new OracleInputError("Close time must be at least 15 minutes in the future.");
  }
  if (resolvesAt.getTime() < closesAt.getTime()) {
    throw new OracleInputError("Resolution time cannot be earlier than close time.");
  }
  if (resolvesAt.getTime() > closesAt.getTime() + 366 * 24 * 60 * 60_000) {
    throw new OracleInputError("Resolution must occur within one year of market close.");
  }

  const sourceMetricKey = normalizeText(payload.sourceMetricKey, "Metric key", 3, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const sourceLabel = normalizeText(payload.sourceLabel, "Resolution source", 3, 160);
  const resolutionRule = normalizeRule(payload.resolutionRule, "YES resolution rule");
  const voidRule = normalizeRule(payload.voidRule, "Void rule");
  const maxPoolWolo = parsePoolCeiling(payload.maxPoolWolo);

  await prisma.$transaction(async (tx) => {
    const proposal = await tx.oracleMarketProposal.create({
      data: {
        createdByUserId: actor.id,
        question,
        category,
        outcomeType,
        closesAt,
        resolvesAt,
        sourceMetricKey,
        sourceLabel,
        resolutionRule,
        voidRule,
        maxPoolWolo,
        bondWolo: ORACLE_PROPOSAL_BOND_WOLO,
        bondStatus: "not_funded",
      },
      select: { id: true },
    });
    await tx.oracleEvent.create({
      data: {
        proposalId: proposal.id,
        actorUserId: actor.id,
        eventType: "proposal_submitted",
        detail: `${userLabel(actor)} submitted an exact-rule YES / NO market for Oracle review.`,
        metadata: {
          category,
          sourceMetricKey,
          maxPoolWolo: String(maxPoolWolo),
          bondWolo: ORACLE_PROPOSAL_BOND_WOLO,
          bondStatus: "not_funded",
        },
      },
    });
  });
}

export async function reviewOracleProposal(
  prisma: PrismaClient,
  actor: OracleActor,
  payload: { publicId?: unknown; decision?: unknown; reviewNote?: unknown },
) {
  if (!actor.isAdmin) throw new OracleInputError("Admin access is required.", 403);
  const publicId = normalizeText(payload.publicId, "Proposal", 8, 64);
  const decision = payload.decision === "approved" ? "approved" : payload.decision === "rejected" ? "rejected" : null;
  if (!decision) throw new OracleInputError("Choose approve or reject.");
  const reviewNote = typeof payload.reviewNote === "string" ? payload.reviewNote.trim().slice(0, 2_000) : "";
  if (decision === "rejected" && reviewNote.length < 3) {
    throw new OracleInputError("Add a short review note when rejecting a proposal.");
  }

  await prisma.$transaction(async (tx) => {
    const proposal = await tx.oracleMarketProposal.findUnique({
      where: { publicId },
      include: {
        creator: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    });
    if (!proposal) throw new OracleInputError("Proposal not found.", 404);
    if (!["proposed", "rule_review"].includes(proposal.status)) {
      throw new OracleInputError("This proposal has already received a final review.", 409);
    }

    await tx.oracleMarketProposal.update({
      where: { id: proposal.id },
      data: {
        status: decision,
        reviewNote: reviewNote || (decision === "approved" ? "Exact-rule market approved." : null),
        reviewedByUid: actor.uid,
        reviewedAt: new Date(),
      },
    });
    await tx.oracleEvent.create({
      data: {
        proposalId: proposal.id,
        actorUserId: actor.id,
        eventType: decision === "approved" ? "proposal_approved" : "proposal_rejected",
        detail: `${userLabel(actor)} ${decision} the citizen market proposal.${reviewNote ? ` ${reviewNote}` : ""}`,
        metadata: { decision, reviewNote: reviewNote || null },
      },
    });

    if (decision === "approved") {
      const slug = slugifyQuestion(proposal.question, proposal.publicId);
      const market = await tx.oracleMarket.create({
        data: {
          slug,
          question: proposal.question,
          summary: "A citizen-created exact-rule market approved for the first Oracle season.",
          category: proposal.category,
          outcomeType: proposal.outcomeType,
          status: "trading",
          closesAt: proposal.closesAt,
          resolvesAt: proposal.resolvesAt,
          sourceMetricKey: proposal.sourceMetricKey,
          sourceLabel: proposal.sourceLabel,
          resolutionRule: proposal.resolutionRule,
          voidRule: proposal.voidRule,
          maxPoolWolo: proposal.maxPoolWolo,
          seedYesMarks: 500,
          seedNoMarks: 500,
          createdByLabel: userLabel(proposal.creator),
        },
        select: { id: true },
      });
      await tx.oracleEvent.create({
        data: {
          marketId: market.id,
          actorUserId: actor.id,
          eventType: "market_opened",
          detail: "Approved citizen proposal opened with balanced Oracle Mark seed liquidity.",
          metadata: {
            proposalPublicId: proposal.publicId,
            seedYesMarks: 500,
            seedNoMarks: 500,
            unit: "oracle_marks",
          },
        },
      });
    }
  });
}

export async function setOracleMarketStatus(
  prisma: PrismaClient,
  actor: OracleActor,
  payload: { slug?: unknown; status?: unknown },
) {
  if (!actor.isAdmin) throw new OracleInputError("Admin access is required.", 403);
  const slug = normalizeText(payload.slug, "Market", 1, 100).toLowerCase();
  const nextStatus = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
  if (!(ORACLE_MARKET_STATUSES as readonly string[]).includes(nextStatus)) {
    throw new OracleInputError("Choose a valid Oracle market status.");
  }

  await prisma.$transaction(async (tx) => {
    const market = await tx.oracleMarket.findUnique({
      where: { slug },
      select: { id: true, status: true, closesAt: true },
    });
    if (!market) throw new OracleInputError("Oracle market not found.", 404);
    const available = ORACLE_STATUS_TRANSITIONS[market.status] ?? [];
    if (!available.includes(nextStatus)) {
      throw new OracleInputError(
        `${market.status} cannot move directly to ${nextStatus}; preserve the published lifecycle.`,
        409,
      );
    }
    if (nextStatus === "trading" && market.closesAt.getTime() <= Date.now()) {
      throw new OracleInputError("A market cannot reopen after its published close time.", 409);
    }

    await tx.oracleMarket.update({ where: { id: market.id }, data: { status: nextStatus } });
    await tx.oracleEvent.create({
      data: {
        marketId: market.id,
        actorUserId: actor.id,
        eventType: "market_status_changed",
        detail: `${userLabel(actor)} moved the market from ${market.status} to ${nextStatus}.`,
        metadata: { previousStatus: market.status, status: nextStatus },
      },
    });
  });
}
