import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { getWoloMainnetDisplayStartAt, isWoloMainnet } from "@/lib/woloChain";

export type WalletFrictionRailRow = {
  id: number;
  userUid: string;
  userDisplayName: string;
  path: string | null;
  label: string | null;
  marketId: number | null;
  marketTitle: string | null;
  marketStatus: string | null;
  marketType: string | null;
  side: "left" | "right" | null;
  amountWolo: number | null;
  walletAddress: string | null;
  walletProvider: string | null;
  walletType: string | null;
  step: string | null;
  rawError: string | null;
  intentId: number | null;
  intentStatus: string | null;
  preIntent: boolean;
  browserInfo: string | null;
  createdAt: string;
};

export type WalletFrictionRailSummary = {
  totalCount: number;
  loadedCount: number;
  last24Hours: number;
  last7Days: number;
  preIntentCount: number;
  intentFailureCount: number;
  ledgerCount: number;
  keplrCount: number;
  latestAt: string | null;
  topSteps: Array<{
    step: string;
    count: number;
  }>;
};

export type WalletFrictionRailPayload = {
  summary: WalletFrictionRailSummary;
  rows: WalletFrictionRailRow[];
};

function displayUserName(entry: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return entry.inGameName || entry.steamPersonaName || entry.uid || "Unknown";
}

function metadataRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(record: Record<string, unknown>, key: string) {
  return record[key] === true;
}

function readSide(record: Record<string, unknown>) {
  const value = readString(record, "side");
  if (value === "left" || value === "right") {
    return value;
  }
  return null;
}

function addCount(map: Map<string, number>, key: string | null) {
  const normalized = key?.trim() || "unknown";
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

export async function loadBetWalletFrictionRail(
  prisma: PrismaClient,
  options: { take?: number } = {}
): Promise<WalletFrictionRailPayload> {
  const take = Math.max(1, Math.min(options.take ?? 80, 200));
  const now = Date.now();
  const last24Cutoff = new Date(now - 24 * 60 * 60 * 1000);
  const last7Cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const visibleCreatedAt = isWoloMainnet()
    ? { gte: getWoloMainnetDisplayStartAt() }
    : undefined;
  const baseWhere: Prisma.UserActivityEventWhereInput = {
    type: "bet_wallet_error",
    ...(visibleCreatedAt ? { createdAt: visibleCreatedAt } : {}),
  };

  const [totalCount, last24Hours, last7Days, events] = await Promise.all([
    prisma.userActivityEvent.count({
      where: baseWhere,
    }),
    prisma.userActivityEvent.count({
      where: {
        ...baseWhere,
        createdAt: { gte: visibleCreatedAt?.gte && visibleCreatedAt.gte > last24Cutoff ? visibleCreatedAt.gte : last24Cutoff },
      },
    }),
    prisma.userActivityEvent.count({
      where: {
        ...baseWhere,
        createdAt: { gte: visibleCreatedAt?.gte && visibleCreatedAt.gte > last7Cutoff ? visibleCreatedAt.gte : last7Cutoff },
      },
    }),
    prisma.userActivityEvent.findMany({
      where: baseWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        path: true,
        label: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
  ]);

  const stepCounts = new Map<string, number>();
  let preIntentCount = 0;
  let intentFailureCount = 0;
  let ledgerCount = 0;
  let keplrCount = 0;

  const rows = events.map((event) => {
    const metadata = metadataRecord(event.metadata);
    const walletType = readString(metadata, "walletType");
    const walletProvider = readString(metadata, "walletProvider");
    const preIntent = readBoolean(metadata, "preIntent");
    const step = readString(metadata, "step");
    const intentId = readNumber(metadata, "intentId");

    addCount(stepCounts, step);
    if (preIntent) preIntentCount += 1;
    if (intentId !== null || readString(metadata, "intentStatus")) intentFailureCount += 1;
    if (walletType === "ledger") ledgerCount += 1;
    if (walletProvider === "keplr" || walletType === "keplr") keplrCount += 1;

    return {
      id: event.id,
      userUid: event.user.uid,
      userDisplayName: displayUserName(event.user),
      path: event.path,
      label: event.label,
      marketId: readNumber(metadata, "marketId"),
      marketTitle: readString(metadata, "marketTitle") || event.label,
      marketStatus: readString(metadata, "marketStatus"),
      marketType: readString(metadata, "marketType"),
      side: readSide(metadata),
      amountWolo: readNumber(metadata, "amountWolo"),
      walletAddress: readString(metadata, "walletAddress"),
      walletProvider,
      walletType,
      step,
      rawError: readString(metadata, "rawError"),
      intentId,
      intentStatus: readString(metadata, "intentStatus"),
      preIntent,
      browserInfo: readString(metadata, "browserInfo"),
      createdAt: event.createdAt.toISOString(),
    } satisfies WalletFrictionRailRow;
  });

  return {
    summary: {
      totalCount,
      loadedCount: rows.length,
      last24Hours,
      last7Days,
      preIntentCount,
      intentFailureCount,
      ledgerCount,
      keplrCount,
      latestAt: rows[0]?.createdAt ?? null,
      topSteps: Array.from(stepCounts.entries())
        .map(([step, count]) => ({ step, count }))
        .sort((left, right) => right.count - left.count || left.step.localeCompare(right.step))
        .slice(0, 5),
    },
    rows,
  };
}
