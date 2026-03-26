import type { PrismaClient } from "@/lib/generated/prisma";

export const DEFAULT_BADGE_LABELS = ["OG", "Contributor", "Founder"] as const;

export type CommunityBadge = {
  id: number;
  label: string;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

export type CommunityGift = {
  id: number;
  kind: string;
  amount: number | null;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

export type UserCommunitySummary = {
  badges: CommunityBadge[];
  gifts: CommunityGift[];
  giftedWolo: number;
};

export function normalizeBadgeLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function normalizeGiftKind(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40).toUpperCase();
}

export function normalizeHonorStatus(value: string | null | undefined) {
  const normalized = (value || "pending").trim().toLowerCase();
  if (normalized === "accepted" || normalized === "declined") {
    return normalized;
  }
  return "pending";
}

export function badgeToneClassName(label: string) {
  const key = normalizeBadgeLabel(label).toLowerCase();
  if (key === "founder") {
    return "border-amber-300/30 bg-amber-400/12 text-amber-100";
  }
  if (key === "contributor") {
    return "border-sky-300/30 bg-sky-400/12 text-sky-100";
  }
  if (key === "og") {
    return "border-rose-300/30 bg-rose-400/12 text-rose-100";
  }
  return "border-white/10 bg-white/5 text-slate-200";
}

export async function loadUserCommunitySummaries(
  prisma: PrismaClient,
  userIds: number[],
  options?: {
    includePending?: boolean;
  }
): Promise<Map<number, UserCommunitySummary>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter((value) => Number.isInteger(value))));
  const summaryMap = new Map<number, UserCommunitySummary>();
  const includePending = Boolean(options?.includePending);

  for (const userId of uniqueUserIds) {
    summaryMap.set(userId, {
      badges: [],
      gifts: [],
      giftedWolo: 0,
    });
  }

  if (uniqueUserIds.length === 0) {
    return summaryMap;
  }

  const [badges, gifts] = await Promise.all([
    prisma.userBadge.findMany({
      where: { userId: { in: uniqueUserIds } },
      orderBy: [{ createdAt: "asc" }, { label: "asc" }],
    }),
    prisma.userGift.findMany({
      where: { userId: { in: uniqueUserIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  for (const badge of badges) {
    const summary = summaryMap.get(badge.userId);
    if (!summary) continue;
    const status = normalizeHonorStatus(badge.status);

    if (!includePending && (status !== "accepted" || !badge.displayOnProfile)) {
      continue;
    }

    summary.badges.push({
      id: badge.id,
      label: badge.label,
      note: badge.note,
      status,
      displayOnProfile: badge.displayOnProfile,
      acceptedAt: badge.acceptedAt?.toISOString() ?? null,
      createdAt: badge.createdAt.toISOString(),
    });
  }

  for (const gift of gifts) {
    const summary = summaryMap.get(gift.userId);
    if (!summary) continue;
    const normalizedKind = normalizeGiftKind(gift.kind);
    const amount = typeof gift.amount === "number" ? gift.amount : null;
    const status = normalizeHonorStatus(gift.status);

    if (!includePending && (status !== "accepted" || !gift.displayOnProfile)) {
      continue;
    }

    summary.gifts.push({
      id: gift.id,
      kind: normalizedKind,
      amount,
      note: gift.note,
      status,
      displayOnProfile: gift.displayOnProfile,
      acceptedAt: gift.acceptedAt?.toISOString() ?? null,
      createdAt: gift.createdAt.toISOString(),
    });

    if (normalizedKind === "WOLO" && amount && status === "accepted") {
      summary.giftedWolo += amount;
    }
  }

  return summaryMap;
}
