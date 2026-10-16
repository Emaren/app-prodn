import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma";
import type { LiveGameSession } from "@/lib/liveSessionSnapshot";
import {
  evaluateBetAutoShadowAdmission,
  storedBetAutoFinancialIssue,
  readBetAutomationRuntime,
} from "@/lib/betAutomation";

export const BET_AUTO_SHADOW_READY_STATUS = "shadow_ready";

export type BetAutoShadowWorkerResult = {
  mode: "disabled" | "shadow";
  evaluatedCount: number;
  eligibleCount: number;
  createdCount: number;
  existingCount: number;
  skippedCount: number;
};

function exactSessionIndex(sessions: readonly LiveGameSession[]) {
  const index = new Map<string, LiveGameSession | null>();

  for (const session of sessions) {
    const identities = [
      session.sessionKey,
      ...(session.identityAliases ?? []),
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    for (const identity of identities) {
      const existing = index.get(identity);
      if (existing && existing.sessionKey !== session.sessionKey) {
        index.set(identity, null);
      } else if (!index.has(identity)) {
        index.set(identity, session);
      }
    }
  }

  return index;
}

function isPrismaUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
  );
}

/**
 * Materialize preview-only Auto Bet outbox rows from canonical live Watcher
 * markets. This worker is deliberately non-financial:
 *
 * - no WOLO reservation
 * - no BetWager / BetStakeTicket creation
 * - no finite-plan decrement
 * - no acceptedAt transition
 */
export async function runBetAutoShadowWorker(
  prisma: PrismaClient,
  options: {
    activeSessions: readonly LiveGameSession[];
    env?: Record<string, string | undefined>;
  }
): Promise<BetAutoShadowWorkerResult> {
  const runtime = readBetAutomationRuntime(options.env ?? process.env);
  if (runtime.mode !== "shadow") {
    return {
      mode: "disabled",
      evaluatedCount: 0,
      eligibleCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount: 0,
    };
  }

  // A live auto-bet can only belong to an authenticated uploader of the
  // exact Watcher session. Restrict the DB candidate set *before* the
  // market-by-preset cross-product rather than loading every enabled owner.
  // This is only a CPU/DB optimization; admission still independently checks
  // the uploader UID, Steam roster, proposition and market integrity.
  const activeUploaderUids = [...new Set(
    options.activeSessions.flatMap((session) =>
      session.uploaders.map((uploader) => uploader.uid.trim()).filter(Boolean))
  )];
  if (activeUploaderUids.length === 0) {
    return {
      mode: "shadow",
      evaluatedCount: 0,
      eligibleCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount: 0,
    };
  }

  const presets = await prisma.betAutoPreset.findMany({
    where: {
      enabled: true,
      selfOnly: true,
      user: { uid: { in: activeUploaderUids } },
      OR: [
        { untilOut: true },
        { gamesRemaining: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      version: true,
      enabled: true,
      winnerStakeWolo: true,
      desyncSide: true,
      desyncStakeWolo: true,
      untilOut: true,
      gamesRemaining: true,
      selfOnly: true,
      user: {
        select: {
          uid: true,
          steamId: true,
        },
      },
    },
  });

  if (presets.length === 0) {
    return {
      mode: "shadow",
      evaluatedCount: 0,
      eligibleCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount: 0,
    };
  }

  // Only enumerate exact, unambiguous identities in this Watcher snapshot.
  // A global "newest 100 markets" query can silently miss the player's
  // still-live match behind 100 unrelated newer games.
  const sessionByIdentity = exactSessionIndex(options.activeSessions);
  const activePresetUids = new Set(presets.map((preset) => preset.user.uid.trim()));
  const activeSessionKeys = [...sessionByIdentity.entries()]
    .filter(([, session]) =>
      session !== null &&
      session.uploaders.some((uploader) => activePresetUids.has(uploader.uid.trim()))
    )
    .map(([identity]) => identity);
  if (activeSessionKeys.length === 0) {
    return {
      mode: "shadow",
      evaluatedCount: 0,
      eligibleCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount: 0,
    };
  }

  const markets = await prisma.betMarket.findMany({
    where: {
      marketType: "winner",
      status: "live",
      scheduledMatchId: null,
      linkedSessionKey: { in: activeSessionKeys },
      propositionHash: { not: null },
      teamResolutionStatus: "resolved",
      teamConfidence: "high",
      integrityStatus: "verified",
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    // Fetch one extra to detect overflow. Never silently claim completeness
    // when the bounded cohort is truncated; this worker is preview-only.
    take: 101,
    select: {
      id: true,
      marketType: true,
      status: true,
      scheduledMatchId: true,
      linkedSessionKey: true,
      propositionHash: true,
      teamResolutionStatus: true,
      teamResolutionProvenance: true,
      teamConfidence: true,
      integrityStatus: true,
      leftRosterSnapshot: true,
      rightRosterSnapshot: true,
      sourceParseIteration: true,
      sourceRosterHash: true,
      rosterLockedAt: true,
      childMarkets: {
        where: { marketType: "desync" },
        orderBy: { id: "asc" },
        select: {
          id: true,
          parentMarketId: true,
          marketType: true,
          status: true,
          propositionHash: true,
          integrityStatus: true,
        },
      },
    },
  });

  if (markets.length > 100) {
    throw new Error("BET_AUTO_SHADOW_ACTIVE_MARKET_COHORT_OVERFLOW");
  }

  if (markets.length === 0) {
    return {
      mode: "shadow",
      evaluatedCount: 0,
      eligibleCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount: 0,
    };
  }

  const candidates: Prisma.BetAutoExecutionCreateManyInput[] = [];
  let evaluatedCount = 0;
  let skippedCount = 0;

  for (const market of markets) {
    const linkedSessionKey = market.linkedSessionKey?.trim() || "";
    const session = linkedSessionKey
      ? sessionByIdentity.get(linkedSessionKey) ?? null
      : null;

    if (!session) {
      skippedCount += presets.length;
      evaluatedCount += presets.length;
      continue;
    }

    const matchingDesyncMarkets = market.childMarkets.filter(
      (child) =>
        child.status === "live" &&
        child.integrityStatus === "verified" &&
        child.propositionHash === market.propositionHash
    );
    const exactDesyncMarket =
      matchingDesyncMarkets.length === 1
        ? matchingDesyncMarkets[0]
        : null;

    for (const preset of presets) {
      evaluatedCount += 1;
      // A malformed legacy database value is not a new selection by the
      // player. Never coerce it into an unrequested Desync outcome.
      if (storedBetAutoFinancialIssue(preset)) {
        skippedCount += 1;
        continue;
      }
      const admission = evaluateBetAutoShadowAdmission({
        preset: {
          id: preset.id,
          version: preset.version,
          enabled: preset.enabled,
          winnerStakeWolo: preset.winnerStakeWolo,
          desyncSide: preset.desyncSide as "none" | "no" | "yes",
          desyncStakeWolo: preset.desyncStakeWolo,
          untilOut: preset.untilOut,
          gamesRemaining: preset.gamesRemaining,
          selfOnly: preset.selfOnly,
        },
        ownerUid: preset.user.uid,
        ownerSteamId: preset.user.steamId,
        market,
        session: {
          sessionKey: session.sessionKey,
          identityAliases: session.identityAliases,
          uploaders: session.uploaders,
        },
        desyncMarket: exactDesyncMarket,
      });

      if (!admission.eligible) {
        skippedCount += 1;
        continue;
      }

      candidates.push({
        presetId: preset.id,
        presetVersion: preset.version,
        gameIdentityKey: admission.gameIdentityKey,
        winnerMarketId: market.id,
        desyncMarketId: admission.desyncMarketId,
        ticketId: null,
        sessionKey: admission.sessionKey,
        propositionHash: admission.evidence.propositionHash,
        selectedSide: admission.selectedSide,
        winnerStakeWolo: preset.winnerStakeWolo,
        desyncSide:
          preset.desyncSide === "yes" || preset.desyncSide === "no"
            ? preset.desyncSide
            : "none",
        desyncStakeWolo: preset.desyncStakeWolo,
        status: BET_AUTO_SHADOW_READY_STATUS,
        reason: "shadow_preview_eligible",
        sourceEvidence: {
          ...admission.evidence,
          winnerMarketId: market.id,
          desyncMarketId: admission.desyncMarketId,
          canonicalSessionKey: session.sessionKey,
          linkedSessionKey,
          ownerUid: preset.user.uid,
          ownerSteamId: preset.user.steamId,
          sourceParseIteration: market.sourceParseIteration,
          sourceRosterHash: market.sourceRosterHash,
          teamResolutionProvenance: market.teamResolutionProvenance,
          rosterLockedAt: market.rosterLockedAt?.toISOString() ?? null,
        } satisfies Prisma.InputJsonValue,
        reservationId: null,
        attemptCount: 0,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        acceptedAt: null,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      mode: "shadow",
      evaluatedCount,
      eligibleCount: 0,
      createdCount: 0,
      existingCount: 0,
      skippedCount,
    };
  }

  let createdCount = 0;
  try {
    const created = await prisma.betAutoExecution.createMany({
      data: candidates,
      skipDuplicates: true,
    });
    createdCount = created.count;
  } catch (error) {
    /*
     * PostgreSQL createMany(skipDuplicates) is the primary concurrency guard.
     * Keep the fallback narrowly idempotent for mocked/alternate Prisma
     * surfaces that report P2002 at the batch boundary.
     */
    if (!isPrismaUniqueConstraintError(error)) throw error;
  }

  return {
    mode: "shadow",
    evaluatedCount,
    eligibleCount: candidates.length,
    createdCount,
    existingCount: candidates.length - createdCount,
    skippedCount,
  };
}
