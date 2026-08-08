import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import { loadMainnetStakingPositions } from "@/lib/mainnetStakingPositions";
import { isWoloMainnet } from "@/lib/woloChain";
import {
  forgeEligiblePrincipalWolo,
  KINGDOM_STAKE_REWARD_CAP_WOLO,
} from "@/lib/stakingRewardCap";

export const FORGE_ACTIVE_COMMITMENT_STATUSES = [
  "signalled",
  "awaiting_funding",
  "funded",
] as const;

export const FORGE_PROJECT_STATUSES = [
  "gathering",
  "authorized",
  "building",
  "shipped",
  "paused",
  "closed",
] as const;

export const FORGE_MILESTONE_STATUSES = [
  "sealed",
  "ready",
  "building",
  "proven",
  "failed",
] as const;

export const FORGE_DEED_CLASSES = ["patron", "builder", "kingdom"] as const;

export type ForgeProjectStatus = (typeof FORGE_PROJECT_STATUSES)[number];
export type ForgeMilestoneStatus = (typeof FORGE_MILESTONE_STATUSES)[number];
export type ForgeDeedClass = (typeof FORGE_DEED_CLASSES)[number];

const USER_SELECT = {
  id: true,
  uid: true,
  isAdmin: true,
  walletAddress: true,
  inGameName: true,
  steamPersonaName: true,
} as const;

const STRICT_STAKE_RECONCILIATION_TTL_MS = 15_000;
let strictStakeReconciliationCache: {
  expiresAt: number;
  promise: ReturnType<typeof loadMainnetStakingPositions>;
} | null = null;

function loadStrictMainnetStakeReconciliation(prisma: PrismaClient) {
  const now = Date.now();
  if (
    strictStakeReconciliationCache &&
    strictStakeReconciliationCache.expiresAt > now
  ) {
    return strictStakeReconciliationCache.promise;
  }

  const promise = loadMainnetStakingPositions(prisma, {
    requireCompleteLedger: true,
    reconcileCanonicalCurrent: true,
  });
  const cacheEntry = {
    expiresAt: now + STRICT_STAKE_RECONCILIATION_TTL_MS,
    promise,
  };
  strictStakeReconciliationCache = cacheEntry;
  void promise.catch(() => {
    if (strictStakeReconciliationCache === cacheEntry) {
      strictStakeReconciliationCache = null;
    }
  });
  return promise;
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid;
}

function numberFromBigInt(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadForgeStakePositions(
  prisma: PrismaClient,
  options: { strictReconciliation?: boolean } = {},
) {
  if (isWoloMainnet()) {
    try {
      const mainnet = options.strictReconciliation
        ? await loadStrictMainnetStakeReconciliation(prisma)
        : await loadMainnetStakingPositions(prisma, { canonicalOnly: true });
      return {
        source: options.strictReconciliation
          ? ("mainnet_reconciled" as const)
          : ("mainnet_canonical_snapshot" as const),
        health: "ok" as const,
        detail: options.strictReconciliation
          ? "Complete indexed transfer and canonical position reconciliation."
          : "Current confirmed staking snapshot; Forge mutations perform complete reconciliation.",
        positions: mainnet.map((position) => ({
          userId: position.userId,
          player: position.player,
          stakedWolo: Math.max(0, position.currentStakedWolo),
        })),
      };
    } catch (error) {
      console.error("Kingdom Forge staking reconciliation failed:", error);
      return {
        source: "mainnet_reconciled" as const,
        health: "unavailable" as const,
        detail:
          "Mainnet staking reconciliation is incomplete; Forge commitments are disabled until the ledger agrees.",
        positions: [],
      };
    }
  }

  const fallback = await prisma.stakingPosition.findMany({
    where: { status: "active", currentStakedWolo: { gt: 0 } },
    select: {
      userId: true,
      currentStakedWolo: true,
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
    },
  });

  return {
    source: "app_position_ledger" as const,
    health: "ok" as const,
    detail: "Non-mainnet app staking position ledger.",
    positions: fallback.map((position) => ({
      userId: position.userId,
      player: displayName(position.user),
      stakedWolo: Math.max(0, position.currentStakedWolo),
    })),
  };
}

export async function loadKingdomForgeSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null,
  options: { strictStakeLedger?: boolean } = {},
) {
  const [viewer, stakeLedger, projects, events] = await Promise.all([
    viewerUid
      ? prisma.user.findUnique({ where: { uid: viewerUid }, select: USER_SELECT })
      : null,
    loadForgeStakePositions(prisma, {
      strictReconciliation: options.strictStakeLedger === true,
    }),
    prisma.forgeProject.findMany({
      orderBy: [{ featuredOrder: "desc" }, { createdAt: "asc" }],
      include: {
        milestones: { orderBy: { sequence: "asc" } },
        commitments: {
          where: { status: { in: [...FORGE_ACTIVE_COMMITMENT_STATUSES] } },
          select: {
            userId: true,
            amountWolo: true,
            status: true,
            settlementMode: true,
            fundingTxHash: true,
            updatedAt: true,
          },
        },
        deedHoldings: {
          select: { deedClass: true, quantity: true, userId: true },
        },
      },
    }),
    prisma.forgeEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 24,
      include: {
        project: { select: { slug: true, title: true } },
        actor: { select: USER_SELECT },
      },
    }),
  ]);
  const positions = stakeLedger.positions;

  const totalStakedWolo = positions.reduce(
    (sum, position) => sum + position.stakedWolo,
    0,
  );
  const totalRewardEligibleWolo = positions.reduce(
    (sum, position) =>
      sum + Math.min(position.stakedWolo, KINGDOM_STAKE_REWARD_CAP_WOLO),
    0,
  );
  const totalForgeCapacityWolo = positions.reduce(
    (sum, position) => sum + forgeEligiblePrincipalWolo(position.stakedWolo),
    0,
  );
  const viewerPosition = viewer
    ? positions.find((position) => position.userId === viewer.id) ?? null
    : null;
  const viewerCommitmentWolo = viewer
    ? projects.reduce(
        (sum, project) =>
          sum +
          project.commitments
            .filter((commitment) => commitment.userId === viewer.id)
            .reduce(
              (projectSum, commitment) =>
                projectSum + numberFromBigInt(commitment.amountWolo),
              0,
            ),
        0,
      )
    : 0;
  const viewerStakeWolo = viewerPosition?.stakedWolo ?? 0;
  const viewerForgeCapacityWolo = forgeEligiblePrincipalWolo(viewerStakeWolo);

  const mappedProjects = projects.map((project) => {
    const signalledWolo = project.commitments.reduce(
      (sum, commitment) => sum + numberFromBigInt(commitment.amountWolo),
      0,
    );
    const targetWolo = numberFromBigInt(project.targetWolo);
    const deedCounts = project.deedHoldings.reduce(
      (acc, holding) => {
        const key = holding.deedClass as ForgeDeedClass;
        if (FORGE_DEED_CLASSES.includes(key)) {
          acc[key] += holding.quantity;
        }
        return acc;
      },
      { patron: 0, builder: 0, kingdom: 0 },
    );
    const viewerCommitment = viewer
      ? project.commitments.find((commitment) => commitment.userId === viewer.id)
      : null;

    return {
      publicId: project.publicId,
      slug: project.slug,
      title: project.title,
      category: project.category,
      summary: project.summary,
      body: project.body,
      status: project.status,
      targetWolo,
      signalledWolo,
      signalProgressBps:
        targetWolo > 0
          ? Math.min(10_000, Math.round((signalledWolo / targetWolo) * 10_000))
          : 0,
      developmentDays: project.developmentDays,
      targetDate: project.targetDate?.toISOString() ?? null,
      shippedAt: project.shippedAt?.toISOString() ?? null,
      deeds: {
        total: project.totalDeeds,
        patron: project.patronDeeds,
        builder: project.builderDeeds,
        kingdom: project.kingdomDeeds,
        issued: deedCounts,
      },
      patrons: new Set(project.commitments.map((commitment) => commitment.userId)).size,
      viewerCommitment: viewerCommitment
        ? {
            amountWolo: numberFromBigInt(viewerCommitment.amountWolo),
            status: viewerCommitment.status,
            settlementMode: viewerCommitment.settlementMode,
            fundingTxHash: viewerCommitment.fundingTxHash,
            updatedAt: viewerCommitment.updatedAt.toISOString(),
          }
        : null,
      milestones: project.milestones.map((milestone) => ({
        id: milestone.id,
        sequence: milestone.sequence,
        title: milestone.title,
        summary: milestone.summary,
        status: milestone.status,
        completedAt: milestone.completedAt?.toISOString() ?? null,
      })),
    };
  });

  const activePatrons = new Set(
    projects.flatMap((project) =>
      project.commitments.map((commitment) => commitment.userId),
    ),
  ).size;
  const totalSignalledWolo = mappedProjects.reduce(
    (sum, project) => sum + project.signalledWolo,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    stakeLedger: {
      source: stakeLedger.source,
      health: stakeLedger.health,
      detail: stakeLedger.detail,
    },
    policy: {
      rewardCapWolo: KINGDOM_STAKE_REWARD_CAP_WOLO,
      rewardCapScope: "linked_aoe2war_identity",
      featureDeedsPerProject: 10_000,
      patronDeeds: 7_000,
      builderDeeds: 2_000,
      kingdomDeeds: 1_000,
    },
    summary: {
      totalStakedWolo,
      totalRewardEligibleWolo,
      totalForgeCapacityWolo,
      totalSignalledWolo,
      activeStakers: positions.length,
      activePatrons,
      openProjects: mappedProjects.filter((project) =>
        ["gathering", "authorized", "building"].includes(project.status),
      ).length,
    },
    viewer: viewer
      ? {
          uid: viewer.uid,
          displayName: displayName(viewer),
          isAdmin: viewer.isAdmin,
          walletAddress: viewer.walletAddress,
          stakedWolo: viewerStakeWolo,
          kingdomStakeWolo: Math.min(
            viewerStakeWolo,
            KINGDOM_STAKE_REWARD_CAP_WOLO,
          ),
          forgeCapacityWolo: viewerForgeCapacityWolo,
          committedWolo: viewerCommitmentWolo,
          availableForgeWolo: Math.max(
            0,
            viewerForgeCapacityWolo - viewerCommitmentWolo,
          ),
        }
      : null,
    projects: mappedProjects,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      detail: event.detail,
      amountWolo: numberFromBigInt(event.amountWolo),
      txHash: event.txHash,
      createdAt: event.createdAt.toISOString(),
      project: event.project,
      actor: event.actor
        ? {
            uid: event.actor.uid,
            displayName: displayName(event.actor),
          }
        : null,
    })),
  };
}

export type KingdomForgeSnapshot = Awaited<
  ReturnType<typeof loadKingdomForgeSnapshot>
>;

export function normalizeForgeCommitmentWolo(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, ""))
        : Number.NaN;

  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized >= 1 && normalized <= 100_000_000 ? normalized : null;
}

export async function lockForgeActor(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${684211}, ${userId})`;
}
