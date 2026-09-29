import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  buildBetCounterIdempotencyKey,
  buildBetCounterProposal,
  readBettingBotRuntime,
  type BettingBotPolicyConfig,
} from "@/lib/bettingBots";

const BET_COUNTER_SHADOW_LOCK_NAMESPACE = 29417;
const ELIGIBLE_SOURCE_MARKET_STATUSES = ["open", "live"] as const;

export type BetCounterShadowWorkerResult = {
  evaluatedCount: number;
  proposedCount: number;
  skippedCount: number;
  duplicateCount: number;
};

function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
  );
}

function policyConfig(row: {
  id: number;
  slug: string;
  reservedUid: string;
  displayName: string;
  avatarUrl: string | null;
  mode: string;
  commentaryEnabled: boolean;
  commentaryPrompt: string;
  oppositeOnly: boolean;
  defaultCounterstakeWolo: number;
  maxCounterstakeWolo: number;
  perMarketExposureWolo: number;
  dailyExposureWolo: number;
  balanceFloorWolo: number;
  policyId: string;
  policyVersion: number;
}): BettingBotPolicyConfig | null {
  if (
    row.mode !== "disabled" &&
    row.mode !== "shadow" &&
    row.mode !== "live"
  ) {
    return null;
  }
  if (!row.oppositeOnly) return null;

  return {
    id: row.id,
    slug: row.slug,
    reservedUid: row.reservedUid,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    mode: row.mode,
    commentaryEnabled: row.commentaryEnabled,
    commentaryPrompt: row.commentaryPrompt,
    oppositeOnly: true,
    defaultCounterstakeWolo: row.defaultCounterstakeWolo,
    maxCounterstakeWolo: row.maxCounterstakeWolo,
    perMarketExposureWolo: row.perMarketExposureWolo,
    dailyExposureWolo: row.dailyExposureWolo,
    balanceFloorWolo: row.balanceFloorWolo,
    policyId: row.policyId,
    policyVersion: row.policyVersion,
  };
}

const BOT_POLICY_SELECT = {
  id: true,
  slug: true,
  reservedUid: true,
  displayName: true,
  avatarUrl: true,
  mode: true,
  commentaryEnabled: true,
  commentaryPrompt: true,
  oppositeOnly: true,
  defaultCounterstakeWolo: true,
  maxCounterstakeWolo: true,
  perMarketExposureWolo: true,
  dailyExposureWolo: true,
  balanceFloorWolo: true,
  policyId: true,
  policyVersion: true,
  version: true,
} satisfies Prisma.BettingBotConfigSelect;

const SOURCE_WAGER_SELECT = {
  id: true,
  status: true,
  side: true,
  amountWolo: true,
  executionMode: true,
  user: {
    select: {
      uid: true,
    },
  },
  market: {
    select: {
      id: true,
      status: true,
      marketType: true,
      propositionHash: true,
      integrityStatus: true,
      linkedSessionKey: true,
      scheduledMatchId: true,
      title: true,
    },
  },
} satisfies Prisma.BetWagerSelect;

async function evaluateOne(
  prisma: PrismaClient,
  input: {
    botId: number;
    sourceWagerId: number;
    reservedUids: ReadonlySet<string>;
    env: Record<string, string | undefined>;
    now: Date;
  }
): Promise<"proposed" | "skipped" | "duplicate"> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ${BET_COUNTER_SHADOW_LOCK_NAMESPACE},
        ${input.botId}
      )
    `;

    const [storedBot, sourceWager] = await Promise.all([
      tx.bettingBotConfig.findUnique({
        where: { id: input.botId },
        select: BOT_POLICY_SELECT,
      }),
      tx.betWager.findUnique({
        where: { id: input.sourceWagerId },
        select: SOURCE_WAGER_SELECT,
      }),
    ]);

    if (!storedBot || !sourceWager) return "skipped";

    const config = policyConfig(storedBot);
    if (!config) return "skipped";

    const runtime = readBettingBotRuntime(config, input.env, null);
    if (!runtime.canPropose || runtime.effectiveMode !== "shadow") {
      return "skipped";
    }

    const sourceUid = sourceWager.user.uid.trim();
    const propositionHash = sourceWager.market.propositionHash?.trim() || "";
    const sourceSide =
      sourceWager.side === "left"
        ? ("left" as const)
        : sourceWager.side === "right"
          ? ("right" as const)
          : null;

    if (
      !sourceUid ||
      input.reservedUids.has(sourceUid) ||
      sourceWager.status !== "active" ||
      !sourceSide ||
      !Number.isSafeInteger(sourceWager.amountWolo) ||
      sourceWager.amountWolo <= 0 ||
      !ELIGIBLE_SOURCE_MARKET_STATUSES.includes(
        sourceWager.market.status as (typeof ELIGIBLE_SOURCE_MARKET_STATUSES)[number]
      ) ||
      sourceWager.market.integrityStatus !== "verified" ||
      !propositionHash
    ) {
      return "skipped";
    }

    const idempotencyKey = buildBetCounterIdempotencyKey({
      botConfigId: config.id,
      policyId: config.policyId,
      policyVersion: config.policyVersion,
      marketId: sourceWager.market.id,
      sourceWagerId: sourceWager.id,
      propositionHash,
    });

    const duplicate = await tx.betCounterAction.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (duplicate) return "duplicate";

    const dayStart = utcDayStart(input.now);
    const [marketExposure, dailyExposure] = await Promise.all([
      tx.betCounterAction.aggregate({
        where: {
          botConfigId: config.id,
          marketId: sourceWager.market.id,
          eventType: "shadow_proposal",
          proposedCounterstakeWolo: { not: null },
        },
        _sum: { proposedCounterstakeWolo: true },
      }),
      tx.betCounterAction.aggregate({
        where: {
          botConfigId: config.id,
          eventType: "shadow_proposal",
          proposedCounterstakeWolo: { not: null },
          createdAt: { gte: dayStart },
        },
        _sum: { proposedCounterstakeWolo: true },
      }),
    ]);

    const marketExposureWolo =
      marketExposure._sum.proposedCounterstakeWolo ?? 0;
    const dailyExposureWolo =
      dailyExposure._sum.proposedCounterstakeWolo ?? 0;

    /*
     * Shadow mode has no custody authority. This planning balance exists only
     * to keep the pure proposal function's balance-floor guard from becoming
     * the limiting factor before the configured daily exposure cap. It is
     * recorded in metadata, never in available_balance_wolo.
     */
    const shadowPlanningBalanceWolo =
      config.balanceFloorWolo + config.dailyExposureWolo;

    const proposal = buildBetCounterProposal({
      config,
      runtime,
      marketId: sourceWager.market.id,
      sourceWagerId: sourceWager.id,
      propositionHash,
      sourceSide,
      sourceAmountWolo: sourceWager.amountWolo,
      marketExposureWolo,
      dailyExposureWolo,
      availableBalanceWolo: shadowPlanningBalanceWolo,
    });

    if (proposal.idempotencyKey !== idempotencyKey) {
      throw new Error(
        "Counter-bet idempotency drift for source wager " + sourceWager.id
      );
    }

    try {
      await tx.betCounterAction.create({
        data: {
          botConfigId: config.id,
          botSlugSnapshot: config.slug,
          reservedUidSnapshot: config.reservedUid,
          marketId: sourceWager.market.id,
          sourceWagerId: sourceWager.id,
          eventType:
            proposal.decision === "shadow_proposed"
              ? "shadow_proposal"
              : "evaluation_skipped",
          idempotencyKey: proposal.idempotencyKey,
          policyIdSnapshot: config.policyId,
          policyVersionSnapshot: config.policyVersion,
          configuredModeSnapshot: runtime.configuredMode,
          effectiveModeSnapshot: runtime.effectiveMode,
          sourceSide,
          counterSide: proposal.counterSide,
          proposedCounterstakeWolo:
            proposal.amountWolo > 0 ? proposal.amountWolo : null,
          committedCounterstakeWolo: null,
          marketExposureBeforeWolo: marketExposureWolo,
          dailyExposureBeforeWolo: dailyExposureWolo,
          availableBalanceWolo: null,
          custodyVerified: false,
          custodyVerificationId: null,
          custodyReservationId: null,
          stakeTxHash: null,
          reasonCode: proposal.reasonCode,
          reasonDetail:
            proposal.decision === "shadow_proposed"
              ? "Deterministic opposite-side shadow preview only. No custody balance was queried and no wager was created."
              : "Shadow policy exposure guard produced no preview amount.",
          actorUid: null,
          metadata: {
            mode: "shadow",
            initiatedBy: "counter_bettor_shadow_worker",
            sourceUserUid: sourceUid,
            sourceExecutionMode: sourceWager.executionMode,
            sourceAmountWolo: sourceWager.amountWolo,
            marketType: sourceWager.market.marketType,
            marketStatus: sourceWager.market.status,
            marketTitle: sourceWager.market.title,
            propositionHash,
            linkedSessionKey: sourceWager.market.linkedSessionKey,
            scheduledMatchId: sourceWager.market.scheduledMatchId,
            configVersion: storedBot.version,
            balanceSource: "shadow_policy_envelope",
            shadowPlanningBalanceWolo,
            llmAuthority: "flavour_only",
            executionInstalled: false,
          } satisfies Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return "duplicate";
      throw error;
    }

    return proposal.decision === "shadow_proposed" ? "proposed" : "skipped";
  });
}

/**
 * Create append-only deterministic counter-bettor preview evidence for exact
 * committed human wagers. This worker never creates BetWager/BetStake* rows,
 * never reserves WOLO, and never claims custody proof.
 */
export async function runBetCounterShadowWorker(
  prisma: PrismaClient,
  options: {
    sourceWagerIds: readonly number[];
    env?: Record<string, string | undefined>;
    now?: Date;
  }
): Promise<BetCounterShadowWorkerResult> {
  const sourceWagerIds = [
    ...new Set(
      options.sourceWagerIds.filter(
        (value) => Number.isSafeInteger(value) && value > 0
      )
    ),
  ];
  if (sourceWagerIds.length === 0) {
    return {
      evaluatedCount: 0,
      proposedCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
    };
  }

  const storedBots = await prisma.bettingBotConfig.findMany({
    orderBy: [{ id: "asc" }],
    select: BOT_POLICY_SELECT,
  });
  const configs = storedBots
    .map(policyConfig)
    .filter((value): value is BettingBotPolicyConfig => Boolean(value));
  const reservedUids = new Set(
    storedBots.map((bot) => bot.reservedUid.trim()).filter(Boolean)
  );

  let evaluatedCount = 0;
  let proposedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;

  for (const sourceWagerId of sourceWagerIds) {
    for (const config of configs) {
      evaluatedCount += 1;
      const outcome = await evaluateOne(prisma, {
        botId: config.id,
        sourceWagerId,
        reservedUids,
        env,
        now,
      });
      if (outcome === "proposed") proposedCount += 1;
      else if (outcome === "duplicate") duplicateCount += 1;
      else skippedCount += 1;
    }
  }

  return {
    evaluatedCount,
    proposedCount,
    skippedCount,
    duplicateCount,
  };
}
