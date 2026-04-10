import type { PrismaClient } from "@/lib/generated/prisma";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export type PendingWoloClaimSummary = {
  pendingAmountWolo: number;
  pendingCount: number;
  latestCreatedAt: string | null;
  claimIds: number[];
};

export type PendingWoloClaimLookupUser = {
  id: number;
  inGameName: string | null;
  steamPersonaName: string | null;
};

type PendingWoloClaimDb = Pick<PrismaClient, "pendingWoloClaim">;

export function pendingWoloClaimNameKeys(values: Array<string | null | undefined>) {
  return uniqueNameKeys(values);
}

export function claimMatchesPlayerNames(
  claim: { normalizedPlayerName: string },
  values: Array<string | null | undefined>
) {
  const keys = uniqueNameKeys(values);
  return keys.includes(claim.normalizedPlayerName);
}

export function normalizePendingWoloClaimName(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase().slice(0, 64);
}

function normalizePendingWoloDisplayName(value: string | null | undefined) {
  return normalizePublicPlayerName(value).slice(0, 100);
}

function uniqueNameKeys(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = normalizePendingWoloClaimName(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }

  return result;
}

function emptySummary(): PendingWoloClaimSummary {
  return {
    pendingAmountWolo: 0,
    pendingCount: 0,
    latestCreatedAt: null,
    claimIds: [],
  };
}

function mergeSummary(
  current: PendingWoloClaimSummary,
  row: { id: number; amountWolo: number; createdAt: Date }
) {
  current.pendingAmountWolo += row.amountWolo;
  current.pendingCount += 1;
  current.claimIds.push(row.id);

  const currentMs = current.latestCreatedAt
    ? new Date(current.latestCreatedAt).getTime()
    : 0;
  const nextMs = row.createdAt.getTime();

  if (!current.latestCreatedAt || nextMs > currentMs) {
    current.latestCreatedAt = row.createdAt.toISOString();
  }
}

export async function loadPendingWoloClaimSummariesByName(
  prisma: PendingWoloClaimDb,
  names: Array<string | null | undefined>
) {
  const keys = uniqueNameKeys(names);
  const summaryMap = new Map<string, PendingWoloClaimSummary>();

  if (keys.length === 0) {
    return summaryMap;
  }

  const rows = await prisma.pendingWoloClaim.findMany({
    where: {
      status: "pending",
      normalizedPlayerName: { in: keys },
    },
    select: {
      id: true,
      normalizedPlayerName: true,
      amountWolo: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  for (const row of rows) {
    const key = row.normalizedPlayerName;
    const current = summaryMap.get(key) ?? emptySummary();
    mergeSummary(current, row);
    summaryMap.set(key, current);
  }

  return summaryMap;
}

export async function loadPendingWoloClaimSummaryForUser(
  prisma: PendingWoloClaimDb,
  user: PendingWoloClaimLookupUser
): Promise<PendingWoloClaimSummary> {
  const keys = uniqueNameKeys([user.inGameName, user.steamPersonaName]);
  if (keys.length === 0) {
    return emptySummary();
  }

  const summaryMap = await loadPendingWoloClaimSummariesByName(prisma, keys);
  const merged = emptySummary();

  for (const key of keys) {
    const summary = summaryMap.get(key);
    if (!summary) continue;

    merged.pendingAmountWolo += summary.pendingAmountWolo;
    merged.pendingCount += summary.pendingCount;
    merged.claimIds.push(...summary.claimIds);

    const mergedMs = merged.latestCreatedAt
      ? new Date(merged.latestCreatedAt).getTime()
      : 0;
    const nextMs = summary.latestCreatedAt
      ? new Date(summary.latestCreatedAt).getTime()
      : 0;

    if (summary.latestCreatedAt && nextMs > mergedMs) {
      merged.latestCreatedAt = summary.latestCreatedAt;
    }
  }

  return merged;
}

export async function createPendingWoloClaim(
  prisma: PendingWoloClaimDb,
  input: {
    playerName: string;
    displayPlayerName?: string | null;
    amountWolo: number;
    claimKind?: string | null;
    claimGroupKey?: string | null;
    targetScope?: string | null;
    sourceMarketId?: number | null;
    sourceGameStatsId?: number | null;
    sourceFounderBonusId?: number | null;
    payoutTxHash?: string | null;
    payoutProofUrl?: string | null;
    errorState?: string | null;
    payoutAttemptedAt?: Date | null;
    note?: string | null;
    status?: "pending" | "claimed";
    claimedByUserId?: number | null;
    claimedAt?: Date | null;
  }
) {
  const normalizedPlayerName = normalizePendingWoloClaimName(input.playerName);
  const displayPlayerName =
    normalizePendingWoloDisplayName(input.displayPlayerName || input.playerName) ||
    "Unknown player";
  const amountWolo = Math.max(0, Math.round(input.amountWolo || 0));
  const claimKind = (input.claimKind || "bet_payout").trim().slice(0, 40) || "bet_payout";
  const claimGroupKey = (input.claimGroupKey || "market").trim().slice(0, 80) || "market";
  const targetScope = input.targetScope?.trim().slice(0, 32) || null;

  if (!normalizedPlayerName || amountWolo < 1) {
    return null;
  }

  const nextStatus = input.status === "claimed" ? "claimed" : "pending";
  const nextClaimedAt = nextStatus === "claimed" ? input.claimedAt ?? new Date() : null;
  const nextClaimedByUserId = nextStatus === "claimed" ? input.claimedByUserId ?? null : null;
  const nextPayoutTxHash = input.payoutTxHash?.trim().slice(0, 128) || null;
  const nextPayoutProofUrl = input.payoutProofUrl?.trim().slice(0, 500) || null;
  const nextErrorState = input.errorState?.trim().slice(0, 255) || null;
  const nextPayoutAttemptedAt = input.payoutAttemptedAt ?? null;

  if (typeof input.sourceMarketId === "number" && Number.isFinite(input.sourceMarketId)) {
    return prisma.pendingWoloClaim.upsert({
      where: {
        sourceMarketId_normalizedPlayerName_claimKind_claimGroupKey: {
          sourceMarketId: input.sourceMarketId,
          normalizedPlayerName,
          claimKind,
          claimGroupKey,
        },
      },
      update: {
        displayPlayerName,
        amountWolo,
        claimKind,
        claimGroupKey,
        targetScope,
        status: nextStatus,
        sourceGameStatsId: input.sourceGameStatsId ?? null,
        sourceFounderBonusId: input.sourceFounderBonusId ?? null,
        claimedByUserId: nextClaimedByUserId,
        rescindedByUserId: null,
        payoutTxHash: nextPayoutTxHash,
        payoutProofUrl: nextPayoutProofUrl,
        errorState: nextErrorState,
        payoutAttemptedAt: nextPayoutAttemptedAt,
        claimedAt: nextClaimedAt,
        rescindedAt: null,
        note: input.note?.trim().slice(0, 160) || null,
      },
      create: {
        normalizedPlayerName,
        displayPlayerName,
        amountWolo,
        claimKind,
        claimGroupKey,
        targetScope,
        status: nextStatus,
        sourceMarketId: input.sourceMarketId,
        sourceGameStatsId: input.sourceGameStatsId ?? null,
        sourceFounderBonusId: input.sourceFounderBonusId ?? null,
        claimedByUserId: nextClaimedByUserId,
        payoutTxHash: nextPayoutTxHash,
        payoutProofUrl: nextPayoutProofUrl,
        errorState: nextErrorState,
        payoutAttemptedAt: nextPayoutAttemptedAt,
        claimedAt: nextClaimedAt,
        note: input.note?.trim().slice(0, 160) || null,
      },
    });
  }

  return prisma.pendingWoloClaim.create({
    data: {
      normalizedPlayerName,
      displayPlayerName,
      amountWolo,
      claimKind,
      claimGroupKey,
      targetScope,
      status: nextStatus,
      sourceMarketId: input.sourceMarketId ?? null,
      sourceGameStatsId: input.sourceGameStatsId ?? null,
      sourceFounderBonusId: input.sourceFounderBonusId ?? null,
      claimedByUserId: nextClaimedByUserId,
      payoutTxHash: nextPayoutTxHash,
      payoutProofUrl: nextPayoutProofUrl,
      errorState: nextErrorState,
      payoutAttemptedAt: nextPayoutAttemptedAt,
      claimedAt: nextClaimedAt,
      note: input.note?.trim().slice(0, 160) || null,
    },
  });
}

export async function claimPendingWoloClaimsForUser(
  prisma: PendingWoloClaimDb,
  user: PendingWoloClaimLookupUser
) {
  const keys = uniqueNameKeys([user.inGameName, user.steamPersonaName]);
  if (keys.length === 0) {
    return {
      claimedCount: 0,
      claimedAmountWolo: 0,
      claimIds: [] as number[],
    };
  }

  const rows = await prisma.pendingWoloClaim.findMany({
    where: {
      status: "pending",
      normalizedPlayerName: { in: keys },
    },
    select: {
      id: true,
      amountWolo: true,
    },
  });

  if (rows.length === 0) {
    return {
      claimedCount: 0,
      claimedAmountWolo: 0,
      claimIds: [] as number[],
    };
  }

  const claimIds = rows.map((row) => row.id);
  const claimedAmountWolo = rows.reduce((sum, row) => sum + row.amountWolo, 0);

  await prisma.pendingWoloClaim.updateMany({
    where: {
      id: { in: claimIds },
    },
    data: {
      status: "claimed",
      claimedByUserId: user.id,
      claimedAt: new Date(),
    },
  });

  return {
    claimedCount: rows.length,
    claimedAmountWolo,
    claimIds,
  };
}

export async function rescindPendingWoloClaim(
  prisma: PendingWoloClaimDb,
  input: {
    claimId: number;
    adminUserId?: number | null;
    note?: string | null;
  }
) {
  return prisma.pendingWoloClaim.update({
    where: { id: input.claimId },
    data: {
      status: "rescinded",
      rescindedByUserId: input.adminUserId ?? null,
      rescindedAt: new Date(),
      note: input.note?.trim().slice(0, 160) || null,
    },
  });
}

export async function loadPendingWoloClaimsForAdmin(
  prisma: PendingWoloClaimDb,
  options?: {
    status?: "pending" | "claimed" | "rescinded";
    take?: number;
  }
) {
  return prisma.pendingWoloClaim.findMany({
    where: options?.status ? { status: options.status } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options?.take ?? 100,
  });
}
