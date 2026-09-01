import { featuredAvatarCardUrlForUser } from "@/lib/avatarAssets";
import {
  canonicalizeNumberedBountyTransfers,
  isPublicBountyContract,
  isVerifiedCanonicalBountyPayout,
  OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
} from "@/lib/bountyHall";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { buildPreviewDataUrl } from "@/lib/previewDataSource";

const ACTIVE_OPPORTUNITY_STATUSES = new Set([
  "available",
  "in_progress",
]);

const LEGACY_TRANSFER_KEYWORDS = [
  "bounty",
  "reward",
  "trophy",
  "belt",
  "artifact",
] as const;

function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

const LEGACY_TRANSFER_WHERE: Prisma.WoloIndexedTransferWhereInput = {
  memo: { not: null },
  OR: LEGACY_TRANSFER_KEYWORDS.map((keyword) => ({
    memo: {
      contains: keyword,
      mode: "insensitive",
    },
  })),
};

export function classifyLegacyBountySource(input: {
  claimKind?: string | null;
  payoutKind?: string | null;
  source?: string | null;
}) {
  if (input.claimKind === "winner_bounty") return "winner_bonus";
  if (
    input.claimKind === "founders_bonus" ||
    input.claimKind === "founders_win"
  ) {
    return "founder_bonus";
  }
  if (input.payoutKind === "daily_tribute") return "championship_tribute";
  if (input.payoutKind) return "championship_reward";
  if (input.source) return "generic_chain_transfer";
  return "other";
}


type PreviewBountyDirectoryEntry = {
  key: string;
  uid: string | null;
  name: string;
  aliases: string[];
  href: string;
  steamRmRating: number | null;
  totalMatches: number;
  hasFeaturedAvatar: boolean;
  claimed: boolean;
};

function normalizePreviewLeaderboardEntry(
  value: unknown,
): PreviewBountyDirectoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  const name =
    typeof row.name === "string"
      ? row.name.trim()
      : "";

  if (!name) {
    return null;
  }

  const aliases =
    Array.isArray(row.nameHistory)
      ? row.nameHistory
          .flatMap((item) => {
            if (!item || typeof item !== "object") {
              return [];
            }

            const candidate =
              (item as Record<string, unknown>).name;

            return typeof candidate === "string" &&
              candidate.trim()
              ? [candidate.trim()]
              : [];
          })
          .filter(
            (alias, index, values) =>
              alias !== name &&
              values.indexOf(alias) === index,
          )
      : [];

  return {
    key:
      typeof row.key === "string" && row.key.trim()
        ? row.key
        : name.toLowerCase(),
    uid:
      typeof row.uid === "string" && row.uid.trim()
        ? row.uid
        : null,
    name,
    aliases,
    href:
      typeof row.href === "string" && row.href.startsWith("/")
        ? row.href
        : "/players",
    steamRmRating:
      typeof row.steamRmRating === "number" &&
      Number.isFinite(row.steamRmRating)
        ? row.steamRmRating
        : null,
    totalMatches:
      typeof row.totalMatches === "number" &&
      Number.isFinite(row.totalMatches)
        ? Math.max(0, Math.trunc(row.totalMatches))
        : 0,
    hasFeaturedAvatar:
      row.hasFeaturedAvatar === true,
    claimed:
      row.claimed === true,
  };
}

async function loadPreviewLeaderboardEntries(
  scope: "all" | "claimed",
): Promise<PreviewBountyDirectoryEntry[] | null> {
  const url =
    buildPreviewDataUrl(
      "/api/lobby/leaderboard",
      new URLSearchParams({
        lane: "rm",
        scope,
        offset: "0",
        limit: "600",
      }),
    );

  if (!url) {
    return null;
  }

  const response =
    await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15_000),
    });

  if (!response.ok) {
    throw new Error(
      `Production leaderboard preview failed: ${response.status}`,
    );
  }

  const payload =
    await response.json() as {
      entries?: unknown;
    };

  if (!Array.isArray(payload.entries)) {
    throw new Error(
      "Production leaderboard preview returned an invalid payload",
    );
  }

  return payload.entries.flatMap((entry) => {
    const normalized =
      normalizePreviewLeaderboardEntry(entry);

    return normalized
      ? [normalized]
      : [];
  });
}

async function loadBountyDirectory(
  prisma: PrismaClient,
) {
  const claimedPreview =
    await loadPreviewLeaderboardEntries(
      "claimed",
    );

  if (!claimedPreview) {
    return loadPublicPlayerDirectory(
      prisma,
    );
  }

  const allPreview =
    (await loadPreviewLeaderboardEntries(
      "all",
    )) ?? [];

  return {
    claimedEntries:
      claimedPreview.filter(
        (entry) =>
          entry.claimed,
      ),
    replayEntries:
      allPreview.filter(
        (entry) =>
          !entry.claimed,
      ),
  };
}

export async function loadBountyBoard(prisma: PrismaClient) {
  const [
    opportunities,
    canonicalClaims,
    numberedTransferCandidates,
    directory,
  ] = await Promise.all([
    prisma.bountyOpportunity.findMany({
      orderBy: [
        { featured: "desc" },
        { priority: "desc" },
        { updatedAt: "desc" },
      ],
      include: {
        assignedUser: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
          },
        },
      },
    }),
    prisma.bountyClaim.findMany({
      where: {
        cancelledAt: null,
      },
      select: {
        payout: {
          select: {
            status: true,
            txHash: true,
          },
        },
      },
    }),
    prisma.woloIndexedTransfer.findMany({
      where: {
        senderAddress: {
          in: [
            ...OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
          ],
        },
        memo: {
          contains: "bounty",
          mode: "insensitive",
        },
      },
      orderBy: [
        { timestamp: "asc" },
        { id: "asc" },
        { transferIndex: "asc" },
      ],
      select: {
        id: true,
        txHash: true,
        transferIndex: true,
        timestamp: true,
        senderAddress: true,
        recipientAddress: true,
        amountWoloDisplay: true,
        memo: true,
      },
    }),
    loadBountyDirectory(prisma),
  ]);

  const numberedBounties =
    canonicalizeNumberedBountyTransfers(
      numberedTransferCandidates,
    );

  const recipientAddresses =
    Array.from(
      new Set(
        numberedBounties.map(
          (row) =>
            row.recipientAddress,
        ),
      ),
    );

  const recipientUsers =
    recipientAddresses.length
      ? await prisma.user.findMany({
          where: {
            walletAddress: {
              in: recipientAddresses,
            },
          },
          select: {
            id: true,
            uid: true,
            inGameName: true,
            walletAddress: true,
          },
        })
      : [];

  const recipientUserByWallet =
    new Map(
      recipientUsers.flatMap(
        (user) =>
          user.walletAddress
            ? [[
                user.walletAddress.toLowerCase(),
                user,
              ] as const]
            : [],
      ),
    );

  const serializedOpportunities =
    opportunities.map(
      (opportunity) => ({
        ...opportunity,
        createdAt:
          opportunity.createdAt.toISOString(),
        updatedAt:
          opportunity.updatedAt.toISOString(),
        publishedAt:
          toIso(
            opportunity.publishedAt,
          ),
        expiresAt:
          toIso(
            opportunity.expiresAt,
          ),
      }),
    );

  const ledger =
    numberedBounties
      .map((transfer) => {
        const recipientUser =
          recipientUserByWallet.get(
            transfer.recipientAddress.toLowerCase(),
          );

        const amountWolo =
          Number(
            transfer.amountWoloDisplay.toString(),
          );

        return {
          key:
            `numbered-bounty:${transfer.txHash}:${transfer.transferIndex}`,
          source:
            "Numbered on-chain bounty",
          sourceKind:
            "numbered_memo" as const,
          status:
            "paid" as const,
          actor:
            recipientUser
              ?.inGameName ||
            null,
          actorUserId:
            recipientUser?.id ??
            null,
          actorUid:
            recipientUser?.uid ??
            null,
          amountWolo,
          memo:
            transfer.canonicalMemo,
          originalMemo:
            transfer.memo ||
            "",
          canonicalNumber:
            transfer.canonicalNumber,
          writtenNumber:
            transfer.writtenNumber,
          txHash:
            transfer.txHash,
          proofUrl:
            null as string | null,
          occurredAt:
            transfer.timestamp.toISOString(),
          opportunity:
            null as {
              id: number;
              slug: string;
              title: string;
            } | null,
          errorState:
            null as string | null,
        };
      })
      .sort(
        (left, right) =>
          right.canonicalNumber -
            left.canonicalNumber ||
          right.occurredAt.localeCompare(
            left.occurredAt,
          ),
      );

  const lockedCanonicalClaims =
    canonicalClaims.filter(
      (claim) =>
        !isVerifiedCanonicalBountyPayout({
          status:
            claim.payout?.status,
          txHash:
            claim.payout?.txHash,
        }),
    );

  const publicContracts =
    serializedOpportunities.filter(
      isPublicBountyContract,
    );

  const nextBountyByUid =
    new Map(
      serializedOpportunities
        .filter(
          (opportunity) =>
            opportunity.bountyKind ===
              "personal" &&
            opportunity.assignedUser
              ?.uid &&
            opportunity
              .isNextForWarrior &&
            ACTIVE_OPPORTUNITY_STATUSES.has(
              opportunity.status,
            ),
        )
        .map(
          (opportunity) => [
            opportunity
              .assignedUser!.uid,
            opportunity,
          ],
        ),
    );

  const claimedWarriors =
    directory.claimedEntries
      .filter(
        (entry) =>
          entry.uid &&
          entry.hasFeaturedAvatar,
      )
      .map(
        (entry, index) => ({
          id:
            `claimed:${entry.uid}`,
          uid: entry.uid!,
          name: entry.name,
          aliases:
            entry.aliases,
          href: entry.href,
          imageUrl:
            featuredAvatarCardUrlForUser(
              entry.uid,
              entry.name,
            ),
          mystery: false,
          rank: index + 1,
          battlefieldLabel:
            entry.steamRmRating !==
            null
              ? `${entry.steamRmRating.toLocaleString()} RM`
              : `${entry.totalMatches.toLocaleString()} recorded battles`,
          nextBounty:
            nextBountyByUid.get(
              entry.uid!,
            ) ?? null,
        }),
      );

  const unclaimedCandidates =
    directory.replayEntries.filter(
      (entry) =>
        entry.totalMatches > 0,
    );

  const unclaimedIndex =
    unclaimedCandidates.length
      ? Math.floor(
          Math.random() *
            unclaimedCandidates.length,
        )
      : -1;

  const unclaimed =
    unclaimedIndex >= 0
      ? unclaimedCandidates[
          unclaimedIndex
        ]
      : null;

  const mysteryWarrior = {
    id:
      `unclaimed:${unclaimed?.key ?? "unknown"}`,
    uid: null,
    name:
      "Unclaimed Warrior",
    aliases: [] as string[],
    href:
      unclaimed?.href ??
      "/players",
    imageUrl:
      featuredAvatarCardUrlForUser(
        null,
        "silhouette",
      ),
    mystery: true,
    rank:
      unclaimedIndex >= 0
        ? unclaimedIndex + 1
        : null,
    battlefieldLabel:
      unclaimed
        ? `${unclaimed.totalMatches.toLocaleString()} recorded battles · profile unclaimed`
        : "A place in the Hall is waiting",
    nextBounty: null,
  };

  const warriors = [
    ...claimedWarriors,
    mysteryWarrior,
  ];

  const initialWarriorId =
    warriors.find(
      (warrior) =>
        warrior.mystery,
    )?.id ??
    warriors[0]?.id ??
    null;

  const paidWolo =
    ledger.reduce(
      (sum, item) =>
        sum +
        item.amountWolo,
      0,
    );

  return {
    generatedAt:
      new Date().toISOString(),
    opportunities:
      serializedOpportunities,
    ledger,
    hall: {
      initialWarriorId,
      warriors,
    },
    numbering: {
      paidCount:
        ledger.length,
      nextNumber:
        ledger.reduce(
          (highest, entry) =>
            Math.max(
              highest,
              entry.canonicalNumber,
            ),
          0,
        ) + 1,
    },
    totals: {
      available:
        publicContracts.filter(
          (item) =>
            item.status ===
            "available",
        ).length,
      inProgress:
        publicContracts.filter(
          (item) =>
            item.status ===
            "in_progress",
        ).length,
      locked:
        lockedCanonicalClaims.length,
      paid:
        ledger.length,
      paidWolo,
    },
  };
}

export type BountyBoardSnapshot = Awaited<ReturnType<typeof loadBountyBoard>>;

export async function loadBountyAdminSnapshot(prisma: PrismaClient) {
  const [
    board,
    canonicalClaims,
    canonicalPayouts,
    legacyClaimSummary,
    legacyClaims,
    trophySummary,
    trophyPayouts,
    keywordTransferCount,
    keywordTransfers,
  ] = await Promise.all([
    loadBountyBoard(prisma),
    prisma.bountyClaim.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        opportunity: { select: { id: true, slug: true, title: true } },
        user: { select: { id: true, uid: true, inGameName: true } },
        valuation: true,
        payout: true,
      },
    }),
    prisma.bountyPayout.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        claim: {
          include: {
            opportunity: { select: { id: true, slug: true, title: true } },
            user: { select: { id: true, uid: true, inGameName: true } },
          },
        },
      },
    }),
    prisma.pendingWoloClaim.groupBy({
      by: ["claimKind", "status"],
      where: {
        claimKind: { in: ["winner_bounty", "founders_bonus", "founders_win"] },
      },
      _count: { _all: true },
      _sum: { amountWolo: true },
    }),
    prisma.pendingWoloClaim.findMany({
      where: {
        claimKind: { in: ["winner_bounty", "founders_bonus", "founders_win"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    prisma.trophyPayout.groupBy({
      by: ["payoutKind", "status"],
      _count: { _all: true },
      _sum: { amountWolo: true },
    }),
    prisma.trophyPayout.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        trophy: { select: { trophyId: true, displayName: true } },
      },
    }),
    prisma.woloIndexedTransfer.count({ where: LEGACY_TRANSFER_WHERE }),
    prisma.woloIndexedTransfer.findMany({
      where: LEGACY_TRANSFER_WHERE,
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        txHash: true,
        transferIndex: true,
        timestamp: true,
        senderAddress: true,
        recipientAddress: true,
        amountWoloDisplay: true,
        memo: true,
        source: true,
      },
    }),
  ]);

  return {
    ...board,
    admin: {
      canonicalClaims,
      canonicalPayouts,
      legacyAudit: {
        claimSummary: legacyClaimSummary,
        claims: legacyClaims.map((claim) => ({
          ...claim,
          classification: classifyLegacyBountySource({
            claimKind: claim.claimKind,
          }),
        })),
        trophySummary,
        trophyPayouts: trophyPayouts.map((payout) => ({
          ...payout,
          classification: classifyLegacyBountySource({
            payoutKind: payout.payoutKind,
          }),
        })),
        keywordTransferCount,
        keywordTransfers: keywordTransfers.map((transfer) => ({
          ...transfer,
          classification: classifyLegacyBountySource({
            source: transfer.source,
          }),
        })),
      },
    },
  };
}

export type BountyAdminSnapshot = Awaited<
  ReturnType<typeof loadBountyAdminSnapshot>
>;

export function bountyAdvisorGrounding(snapshot: BountyBoardSnapshot) {
  const opportunities = snapshot.opportunities.slice(0, 40).map((item) =>
    [
      `${item.title} [${item.status}]`,
      item.rewardWolo === null
        ? "reward amount not published"
        : `${item.rewardWolo} WOLO`,
      `eligibility: ${item.eligibility || "operator-defined"}`,
      `verification: ${item.verification || "operator verification required"}`,
      `action: ${item.actionHref}`,
    ].join(" · "),
  );
  const ledger = snapshot.ledger.slice(0, 35).map(
    (entry) =>
      `${entry.occurredAt} · ${entry.status} · ${entry.actor || "recipient not labeled"} · ${entry.amountWolo ?? "amount not recorded"} WOLO · memo: ${entry.memo} · tx: ${entry.txHash || "none"}`,
  );
  return [
    "Bounty Board snapshot. This is the only bounty status grounding for this reply.",
    "Available opportunities are not payment promises. Paid bounty history requires an identified warrior and transaction proof.",
    "Founder rewards, championship tributes, ordinary trophy income, and generic memo-matched transfers are excluded from public bounty totals.",
    "Opportunities:",
    ...opportunities,
    "Recent canonical bounty ledger rows:",
    ...ledger,
  ].join("\n");
}
