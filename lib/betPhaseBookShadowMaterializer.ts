import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  buildBetPhaseBookKey,
  planBetPhaseBookWindows,
  readBetPhaseBooksV2Runtime,
  type ActiveBetBookPhase,
} from "@/lib/betPhaseBooks";

export const BET_PHASE_BOOKS_V2_SHADOW_STATUS = "phase_shadow";
export const BET_PHASE_BOOKS_V2_SHADOW_MARKET_TYPE = "phase_shadow_winner";

export type BetPhaseBookShadowSource = {
  battleId?: number | null;
  scheduledMatchId: number | null;
  linkedSessionKey: string | null;
  linkedGameStatsId?: number | null;
  battleStartedAt?: Date | null;
  slug: string;
  title: string;
  eventLabel: string;
  marketType: string;
  status: string;
  leftLabel: string;
  rightLabel: string;
  leftHref: string | null;
  rightHref: string | null;
  closeAt: Date | null;
  settledAt: Date | null;
  teamFormat: string | null;
  teamResolutionStatus: string | null;
  teamResolutionProvenance: string | null;
  teamConfidence: string | null;
  leftRosterSnapshot: Prisma.InputJsonValue;
  rightRosterSnapshot: Prisma.InputJsonValue;
  sourceParseIteration: number | null;
  sourceRosterHash: string | null;
  propositionHash: string | null;
  integrityStatus: string;
  integrityReason: string | null;
};

export type BetPhaseBookShadowPlan = {
  authorityIdentityKey: string;
  phaseBookKey: string;
  phase: ActiveBetBookPhase;
  phaseOpensAt: Date | null;
  phaseClosesAt: Date | null;
  source: BetPhaseBookShadowSource;
};

function validDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function preGamePlan(
  source: BetPhaseBookShadowSource
): BetPhaseBookShadowPlan | null {
  if (
    source.marketType !== "winner" ||
    !source.scheduledMatchId ||
    !validDate(source.closeAt)
  ) {
    return null;
  }

  const authorityIdentityKey = `scheduled-match:${source.scheduledMatchId}`;
  const phase: ActiveBetBookPhase = "pre_game";
  const closesAt = new Date(source.closeAt);

  return {
    authorityIdentityKey,
    phaseBookKey: buildBetPhaseBookKey({
      authorityIdentityKey,
      marketType: source.marketType,
      phase,
    }),
    phase,
    phaseOpensAt: null,
    phaseClosesAt: closesAt,
    source,
  };
}

function livePhasePlans(
  source: BetPhaseBookShadowSource
): BetPhaseBookShadowPlan[] {
  if (
    source.marketType !== "winner" ||
    !source.battleId ||
    !validDate(source.battleStartedAt) ||
    !source.propositionHash ||
    source.integrityStatus !== "verified"
  ) {
    return [];
  }

  const terminalAt =
    validDate(source.settledAt) &&
    source.settledAt.getTime() > source.battleStartedAt.getTime()
      ? source.settledAt
      : null;
  const windows = planBetPhaseBookWindows({
    battleStartAt: source.battleStartedAt,
    battleTerminalAt: terminalAt,
  });
  const authorityIdentityKey = `battle:${source.battleId}`;

  return windows
    .filter(
      (window): window is typeof window & {
        phase: "opening_minute" | "late";
      } =>
        window.phase === "opening_minute" ||
        window.phase === "late"
    )
    .map((window) => ({
      authorityIdentityKey,
      phaseBookKey: buildBetPhaseBookKey({
        authorityIdentityKey,
        marketType: source.marketType,
        phase: window.phase,
      }),
      phase: window.phase,
      phaseOpensAt: window.opensAt,
      phaseClosesAt: window.closesAt,
      source,
    }));
}

export function planBetPhaseBookShadowMaterialization(
  sources: readonly BetPhaseBookShadowSource[]
) {
  const plans: BetPhaseBookShadowPlan[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const candidates = [
      preGamePlan(source),
      ...livePhasePlans(source),
    ].filter(
      (plan): plan is BetPhaseBookShadowPlan => Boolean(plan)
    );

    for (const plan of candidates) {
      if (seen.has(plan.phaseBookKey)) continue;
      seen.add(plan.phaseBookKey);
      plans.push(plan);
    }
  }

  return plans;
}

function phaseSlug(plan: BetPhaseBookShadowPlan) {
  return plan.phaseBookKey.replaceAll(":", "-").slice(0, 120);
}

function phaseTitle(plan: BetPhaseBookShadowPlan) {
  const label =
    plan.phase === "pre_game"
      ? "Pre-Game"
      : plan.phase === "opening_minute"
        ? "Opening Minute"
        : "Late";
  return `${plan.source.title} · ${label}`.slice(0, 255);
}

function phaseEventLabel(plan: BetPhaseBookShadowPlan) {
  const label =
    plan.phase === "pre_game"
      ? "Pre-Game"
      : plan.phase === "opening_minute"
        ? "Opening Minute"
        : "Late";
  return `${plan.source.eventLabel} · ${label} Shadow`.slice(0, 180);
}

export type BetPhaseBookShadowMaterializeResult = {
  mode: "disabled" | "shadow";
  plannedCount: number;
  createdCount: number;
  updatedCount: number;
  protectedCount: number;
};

export async function materializeBetPhaseBookShadows(
  prisma: PrismaClient,
  sources: readonly BetPhaseBookShadowSource[],
  env: Record<string, string | undefined> = process.env
): Promise<BetPhaseBookShadowMaterializeResult> {
  const runtime = readBetPhaseBooksV2Runtime(env);
  if (runtime.mode !== "shadow") {
    return {
      mode: "disabled",
      plannedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      protectedCount: 0,
    };
  }

  const plans = planBetPhaseBookShadowMaterialization(sources);
  let createdCount = 0;
  let updatedCount = 0;
  let protectedCount = 0;

  for (const plan of plans) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${plan.phaseBookKey}, 0))`
      );

      const existing = await tx.betMarket.findUnique({
        where: { phaseBookKey: plan.phaseBookKey },
        select: {
          id: true,
          status: true,
          firstStakeAcceptedAt: true,
          wagers: { select: { id: true }, take: 1 },
          stakeTicketLegs: { select: { id: true }, take: 1 },
        },
      });

      if (
        existing &&
        (
          existing.status !== BET_PHASE_BOOKS_V2_SHADOW_STATUS ||
          existing.firstStakeAcceptedAt ||
          existing.wagers.length > 0 ||
          existing.stakeTicketLegs.length > 0
        )
      ) {
        protectedCount += 1;
        return;
      }

      const data = {
        battleId: plan.source.battleId ?? null,
        scheduledMatchId: null,
        linkedSessionKey: plan.source.linkedSessionKey,
        linkedGameStatsId: plan.source.linkedGameStatsId ?? null,
        slug: phaseSlug(plan),
        title: phaseTitle(plan),
        eventLabel: phaseEventLabel(plan),
        marketType: BET_PHASE_BOOKS_V2_SHADOW_MARKET_TYPE,
        bookPhase: plan.phase,
        phaseBookKey: plan.phaseBookKey,
        phaseOpensAt: plan.phaseOpensAt,
        phaseClosesAt: plan.phaseClosesAt,
        status: BET_PHASE_BOOKS_V2_SHADOW_STATUS,
        featured: false,
        sortOrder: 10_000,
        leftLabel: plan.source.leftLabel,
        rightLabel: plan.source.rightLabel,
        leftHref: plan.source.leftHref,
        rightHref: plan.source.rightHref,
        seedLeftWolo: 0,
        seedRightWolo: 0,
        closeAt: null,
        settledAt: null,
        winnerSide: null,
        teamFormat: plan.source.teamFormat,
        teamResolutionStatus: plan.source.teamResolutionStatus,
        teamResolutionProvenance: plan.source.teamResolutionProvenance,
        teamConfidence: plan.source.teamConfidence,
        leftRosterSnapshot: plan.source.leftRosterSnapshot,
        rightRosterSnapshot: plan.source.rightRosterSnapshot,
        sourceParseIteration: plan.source.sourceParseIteration,
        sourceRosterHash: plan.source.sourceRosterHash,
        propositionHash: plan.source.propositionHash,
        integrityStatus: plan.source.integrityStatus,
        integrityReason: plan.source.integrityReason,
        resolutionReason: "phase_books_v2_shadow",
      };

      if (existing) {
        await tx.betMarket.update({
          where: { id: existing.id },
          data,
        });
        updatedCount += 1;
      } else {
        await tx.betMarket.create({ data });
        createdCount += 1;
      }
    });
  }

  return {
    mode: "shadow",
    plannedCount: plans.length,
    createdCount,
    updatedCount,
    protectedCount,
  };
}
