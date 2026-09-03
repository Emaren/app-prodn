import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

import {
  isPostBroadcastStakeRecovery,
  POST_BROADCAST_RECOVERY_MARKET_STATUSES,
} from "@/lib/betStakeRecoveryPolicy";
import {
  buildBetStakeMemo,
} from "@/lib/betStakeMemo";
import {
  buildFreshBetMarketWriteWhere,
  freshBettingCloseReason,
} from "@/lib/betMarketWagerability";
import { acquireBetStakeTransferLock } from "@/lib/betStakeFunding";
import { markBetStakeIntentRecorded, markBetStakeIntentVerified } from "@/lib/betStakeIntents";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { recordUserActivity } from "@/lib/userExperience";
import { getWoloBetEscrowRuntime } from "@/lib/woloChain";
import {
  isDesyncSideMarketType,
} from "@/lib/desyncSideMarket";
import {
  validateWoloAddress,
  verifyStakeTransfer,
} from "@/lib/woloBetSettlement";

export class BetWagerError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type WagerViewer = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress: string | null;
};

type PlaceBetWagerResult =
  | {
      kind: "duplicate_existing";
    }
  | {
      kind: "created";
    };

export type BetMarketPreflightContext = {
  market: {
    id: number;
    parentMarketId: number | null;
    slug: string;
    status: string;
    winnerSide: string | null;
    settledAt: Date | null;
    voidedAt: Date | null;
    refundStatus: string | null;
    settlementExecutedAt: Date | null;
    bettingLockedAt: Date | null;
    closeAt: Date | null;
    title: string;
    leftLabel: string;
    rightLabel: string;
    marketType: string;
    linkedSessionKey: string | null;
    scheduledMatchId: number | null;
    integrityStatus: string;
    teamResolutionStatus: string | null;
    teamConfidence: string | null;
    propositionHash: string | null;
    leftRosterSnapshot: unknown;
    rightRosterSnapshot: unknown;
  };
  activeMarketWagers: Array<{
    id: number;
    userId: number;
    side: string;
    stakeWalletAddress: string | null;
  }>;
  walletLock: {
    side: string;
    userId: number | null;
  } | null;
  unresolvedWalletIntent: {
    id: number;
    status: string;
  } | null;
};

function normalizePlayerKey(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase();
}

export function normalizeBetSide(value: unknown) {
  return value === "right" ? "right" : value === "left" ? "left" : null;
}

export function normalizeBetAmount(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 50_000) return null;
  return rounded;
}

export function normalizeBetTxHash(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function resolveViewerMatchSide(
  viewer: Pick<WagerViewer, "inGameName" | "steamPersonaName">,
  market: { leftLabel: string; rightLabel: string }
) {
  const viewerKeys = [viewer.inGameName, viewer.steamPersonaName]
    .map((value) => normalizePlayerKey(value))
    .filter(Boolean);
  const leftKey = normalizePlayerKey(market.leftLabel);
  const rightKey = normalizePlayerKey(market.rightLabel);

  const matchesLeft = leftKey && viewerKeys.includes(leftKey);
  const matchesRight = rightKey && viewerKeys.includes(rightKey);

  if (matchesLeft && !matchesRight) return "left" as const;
  if (matchesRight && !matchesLeft) return "right" as const;
  return null;
}

function readUniqueTargets(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return [] as string[];
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map((value) => String(value));
  }
  if (typeof target === "string") {
    return [target];
  }
  return [];
}

function isUniqueConstraintError(error: unknown, field: string) {
  return readUniqueTargets(error).some((target) => target.includes(field));
}

export async function ensureBetMarketWalletSideLock(
  prisma: Prisma.TransactionClient,
  input: {
    marketId: number;
    userId: number;
    walletAddress: string;
    side: "left" | "right";
  }
) {
  const existing = await prisma.betMarketWallet.findUnique({
    where: {
      marketId_walletAddress: {
        marketId: input.marketId,
        walletAddress: input.walletAddress,
      },
    },
    select: {
      id: true,
      side: true,
      userId: true,
    },
  });

  if (existing) {
    if (existing.side !== input.side) {
      throw new BetWagerError(
        409,
        "That wallet already has WOLO on the other side of this market."
      );
    }

    if (existing.userId !== input.userId) {
      await prisma.betMarketWallet.update({
        where: { id: existing.id },
        data: { userId: input.userId },
      });
    }
    return;
  }

  try {
    await prisma.betMarketWallet.create({
      data: {
        marketId: input.marketId,
        userId: input.userId,
        walletAddress: input.walletAddress,
        side: input.side,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error, "wallet_address")) {
      throw error;
    }

    const conflicting = await prisma.betMarketWallet.findUnique({
      where: {
        marketId_walletAddress: {
          marketId: input.marketId,
          walletAddress: input.walletAddress,
        },
      },
      select: {
        side: true,
        userId: true,
      },
    });

    if (!conflicting) {
      throw error;
    }

    if (conflicting.side !== input.side) {
      throw new BetWagerError(
        409,
        "That wallet already has WOLO on the other side of this market."
      );
    }

    if (conflicting.userId !== input.userId) {
      await prisma.betMarketWallet.update({
        where: {
          marketId_walletAddress: {
            marketId: input.marketId,
            walletAddress: input.walletAddress,
          },
        },
        data: { userId: input.userId },
      });
    }
  }
}

export async function loadBetMarketPreflightContext(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    marketId: number;
    side: "left" | "right";
    walletAddress?: string | null;
  }
): Promise<BetMarketPreflightContext> {
  const normalizedWalletAddress = input.walletAddress?.trim() || "";
  const freshUnsignedCutoff = new Date(Date.now() - 15 * 60 * 1000);

  const [
    market,
    activeMarketWagers,
    walletLock,
    unresolvedWalletIntent,
    unresolvedWalletTicket,
  ] = await Promise.all([
    prisma.betMarket.findUnique({
      where: { id: input.marketId },
      select: {
        id: true,
        parentMarketId: true,
        slug: true,
        status: true,
        winnerSide: true,
        settledAt: true,
        voidedAt: true,
        refundStatus: true,
        settlementExecutedAt: true,
        bettingLockedAt: true,
        closeAt: true,
        title: true,
        leftLabel: true,
        rightLabel: true,
        marketType: true,
        linkedSessionKey: true,
        scheduledMatchId: true,
        integrityStatus: true,
        teamResolutionStatus: true,
        teamConfidence: true,
        propositionHash: true,
        leftRosterSnapshot: true,
        rightRosterSnapshot: true,
      },
    }),
    prisma.betWager.findMany({
      where: {
        marketId: input.marketId,
        status: "active",
      },
      select: {
        id: true,
        userId: true,
        side: true,
        stakeWalletAddress: true,
      },
    }),
    normalizedWalletAddress
      ? prisma.betMarketWallet.findUnique({
          where: {
            marketId_walletAddress: {
              marketId: input.marketId,
              walletAddress: normalizedWalletAddress,
            },
          },
          select: {
            side: true,
            userId: true,
          },
        })
      : Promise.resolve(null),
    normalizedWalletAddress
      ? prisma.betStakeIntent.findFirst({
          where: {
            marketId: input.marketId,
            walletAddress: normalizedWalletAddress,
            side: { not: input.side },
            OR: [
              {
                status: "awaiting_signature",
                stakeTxHash: null,
                createdAt: { gte: freshUnsignedCutoff },
              },
              {
                status: {
                  in: ["broadcast_submitted", "verified_unrecorded", "recorded"],
                },
              },
              {
                stakeTxHash: { not: null },
                status: {
                  in: [
                    "awaiting_signature",
                    "broadcast_submitted",
                    "verified_unrecorded",
                    "failed",
                    "suspect",
                    "orphaned",
                    "recorded",
                  ],
                },
              },
            ],
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            side: true,
          },
        })
      : Promise.resolve(null),
    normalizedWalletAddress
      ? prisma.betStakeLeg.findFirst({
          where: {
            marketId: input.marketId,
            side: { not: input.side },
            ticket: {
              walletAddress: normalizedWalletAddress,
              OR: [
                {
                  status: "awaiting_signature",
                  stakeTxHash: null,
                  createdAt: { gte: freshUnsignedCutoff },
                },
                {
                  status: {
                    in: ["broadcast_submitted", "verified_unrecorded", "recorded"],
                  },
                },
                {
                  stakeTxHash: { not: null },
                  status: {
                    in: [
                      "awaiting_signature",
                      "broadcast_submitted",
                      "verified_unrecorded",
                      "failed",
                      "suspect",
                      "orphaned",
                      "recorded",
                    ],
                  },
                },
              ],
            },
          },
          orderBy: [{ ticket: { updatedAt: "desc" } }, { id: "desc" }],
          select: {
            id: true,
            ticket: {
              select: {
                status: true,
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!market) {
    throw new BetWagerError(404, "Market not found.");
  }

  return {
    market,
    activeMarketWagers,
    walletLock,
    unresolvedWalletIntent:
      unresolvedWalletIntent && unresolvedWalletIntent.side !== undefined
        ? {
            id: unresolvedWalletIntent.id,
            status: unresolvedWalletIntent.status,
          }
        : unresolvedWalletTicket
          ? {
              id: unresolvedWalletTicket.id,
              status: unresolvedWalletTicket.ticket.status,
            }
        : null,
  };
}

export function assertBetMarketPreflight(
  context: BetMarketPreflightContext,
  input: {
    viewer: Pick<WagerViewer, "id" | "inGameName" | "steamPersonaName">;
    side: "left" | "right";
    walletAddress?: string | null;
    allowLockedPostBroadcastRecovery?: boolean;
  }
) {
  const normalizedWalletAddress = input.walletAddress?.trim() || "";

  const desyncSideMarket =
    isDesyncSideMarketType(
      context.market.marketType
    );

  if (!input.allowLockedPostBroadcastRecovery) {
    const freshCloseReason =
      freshBettingCloseReason(
        context.market
      );

    if (freshCloseReason) {
      throw new BetWagerError(
        409,
        "This book is closed."
      );
    }

    if (
      context.market.integrityStatus !==
        "verified" ||
      !context.market.propositionHash ||
      (
        !desyncSideMarket &&
        (
          context.market.teamResolutionStatus !==
            "resolved" ||
          context.market.teamConfidence !==
            "high" ||
          !Array.isArray(
            context.market.leftRosterSnapshot
          ) ||
          !Array.isArray(
            context.market.rightRosterSnapshot
          ) ||
          context.market.leftRosterSnapshot.length ===
            0 ||
          context.market.rightRosterSnapshot.length ===
            0
        )
      )
    ) {
      throw new BetWagerError(
        409,
        desyncSideMarket
          ? "Desync betting unavailable — this battle proposition is not verified."
          : "Betting unavailable — both teams must be verified before WOLO can enter this market."
      );
    }

  }

  /*
   * Competitive winner books prevent a participant from betting
   * against themselves.
   *
   * The desync proposition is independent incident truth. A
   * participant may honestly predict either NO or YES.
   */
  const forcedSide =
    desyncSideMarket
      ? null
      : resolveViewerMatchSide(
          input.viewer,
          context.market
        );
  if (forcedSide && input.side !== forcedSide) {
    const forcedLabel =
      forcedSide === "left" ? context.market.leftLabel : context.market.rightLabel;
    throw new BetWagerError(
      409,
      `You can only back yourself in matches you are playing. Lock ${forcedLabel}.`
    );
  }

  const viewerActiveSides = new Set(
    context.activeMarketWagers
      .filter((wager) => wager.userId === input.viewer.id)
      .map((wager) => wager.side)
  );

  if (viewerActiveSides.size > 0 && !viewerActiveSides.has(input.side)) {
    throw new BetWagerError(
      409,
      "You can keep adding WOLO to your current side in this market, but you cannot switch sides."
    );
  }

  if (!normalizedWalletAddress) {
    return;
  }

  const addressError = validateWoloAddress(normalizedWalletAddress);
  if (addressError) {
    throw new BetWagerError(400, addressError);
  }

  const walletLockSide = context.walletLock?.side;
  if (walletLockSide && walletLockSide !== input.side) {
    throw new BetWagerError(
      409,
      "That wallet already has WOLO on the other side of this market."
    );
  }

  const walletSideConflict = context.activeMarketWagers.find(
    (wager) =>
      (wager.stakeWalletAddress || "").trim() === normalizedWalletAddress &&
      wager.side !== input.side
  );

  if (walletSideConflict) {
    throw new BetWagerError(
      409,
      "That wallet already has WOLO on the other side of this market."
    );
  }

  if (context.unresolvedWalletIntent) {
    throw new BetWagerError(
      409,
      "That wallet already has an unresolved stake on the other side of this market."
    );
  }
}

export async function preflightPooledBetWager(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    viewer: Pick<WagerViewer, "id" | "inGameName" | "steamPersonaName">;
    marketId: number;
    side: "left" | "right";
    walletAddress?: string | null;
  }
) {
  const context = await loadBetMarketPreflightContext(prisma, {
    marketId: input.marketId,
    side: input.side,
    walletAddress: input.walletAddress,
  });
  assertBetMarketPreflight(context, input);
  return context.market;
}

export async function placePooledBetWager(
  prisma: PrismaClient,
  input: {
    viewer: WagerViewer;
    marketId: number;
    side: "left" | "right";
    amountWolo: number;
    walletAddress?: string | null;
    stakeTxHash?: string | null;
    stakeIntentId?: number | null;
  }
): Promise<PlaceBetWagerResult> {
  const escrowRuntime = getWoloBetEscrowRuntime();
  const normalizedStakeTxHash = normalizeBetTxHash(input.stakeTxHash);
  const normalizedWalletAddress = input.walletAddress?.trim() || input.viewer.walletAddress || "";
  const shouldUseOnchainStake =
    escrowRuntime.onchainRequired ||
    (escrowRuntime.mode !== "disabled" &&
      escrowRuntime.ready &&
      Boolean(normalizedStakeTxHash && normalizedWalletAddress));

  const [
    context,
    duplicateStake,
    existingIntentWager,
    stakeIntent,
  ] = await Promise.all([
    loadBetMarketPreflightContext(
      prisma,
      {
        marketId:
          input.marketId,
        side:
          input.side,
        walletAddress:
          normalizedWalletAddress ||
          null,
      }
    ),
    normalizedStakeTxHash
      ? prisma.betWager.findUnique({
          where: { stakeTxHash: normalizedStakeTxHash },
          select: {
            id: true,
            marketId: true,
            userId: true,
          },
        })
      : Promise.resolve(null),
    typeof input.stakeIntentId === "number"
      ? prisma.betWager.findUnique({
          where: { stakeIntentId: input.stakeIntentId },
          select: { id: true },
        })
      : Promise.resolve(null),
    typeof input.stakeIntentId === "number"
      ? prisma.betStakeIntent.findUnique({
          where: { id: input.stakeIntentId },
          select: {
            id: true,
            userId: true,
            marketId: true,
            side: true,
            amountWolo: true,
            status: true,
            walletAddress: true,
            stakeTxHash: true,
            propositionHash: true,
            broadcastSubmittedAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const market =
    context.market;

  if (existingIntentWager) {
    return {
      kind:
        "duplicate_existing",
    };
  }

  if (stakeIntent) {
    if (
      stakeIntent.userId !==
        input.viewer.id ||
      stakeIntent.marketId !==
        input.marketId
    ) {
      throw new BetWagerError(
        409,
        "Stake recovery intent does not belong to this wager."
      );
    }

    if (
      stakeIntent.side !==
        input.side ||
      stakeIntent.amountWolo !==
        input.amountWolo
    ) {
      throw new BetWagerError(
        409,
        "Stake recovery intent no longer matches this wager request."
      );
    }
  }

  if (duplicateStake) {
    if (
      duplicateStake.marketId ===
        input.marketId &&
      duplicateStake.userId ===
        input.viewer.id
    ) {
      return {
        kind:
          "duplicate_existing",
      };
    }

    throw new BetWagerError(
      409,
      "That WOLO stake transaction is already attached to another slip."
    );
  }

  if (
    escrowRuntime.onchainRequired &&
    escrowRuntime.configError
  ) {
    throw new BetWagerError(
      503,
      escrowRuntime.configError
    );
  }

  let stakeVerification:
    | Awaited<
        ReturnType<
          typeof verifyStakeTransfer
        >
      >
    | null = null;

  if (shouldUseOnchainStake) {
    if (
      typeof input.stakeIntentId !==
        "number" ||
      !stakeIntent
    ) {
      throw new BetWagerError(
        409,
        "Real escrow slips require a matching stake intent before the wager can be recorded."
      );
    }

    if (!normalizedWalletAddress) {
      throw new BetWagerError(
        409,
        "Connect Keplr and lock your WOLO stake before recording the wager."
      );
    }

    const addressError =
      validateWoloAddress(
        normalizedWalletAddress
      );

    if (addressError) {
      throw new BetWagerError(
        400,
        addressError
      );
    }

    if (!normalizedStakeTxHash) {
      throw new BetWagerError(
        409,
        "Missing WOLO stake transaction hash for this wager."
      );
    }

    stakeVerification =
      await verifyStakeTransfer({
        txHash:
          normalizedStakeTxHash,
        fromAddress:
          normalizedWalletAddress,
        expectedAmountWolo:
          input.amountWolo,
        expectedMemo:
          buildBetStakeMemo(
            input.marketId
          ),
      });

    if (!stakeVerification.verified) {
      throw new BetWagerError(
        409,
        stakeVerification.detail
      );
    }
  }

  const postBroadcastRecovery =
    stakeIntent &&
    stakeVerification?.verified
      ? isPostBroadcastStakeRecovery({
          intentStatus:
            stakeIntent.status,
          requestedTxHash:
            normalizedStakeTxHash,
          intentTxHash:
            stakeIntent.stakeTxHash,
          requestedWalletAddress:
            normalizedWalletAddress,
          intentWalletAddress:
            stakeIntent.walletAddress,
          intentPropositionHash:
            stakeIntent.propositionHash,
          marketPropositionHash:
            market.propositionHash,
          intentCreatedAt:
            stakeIntent.createdAt,
          broadcastSubmittedAt:
            stakeIntent.broadcastSubmittedAt,
          txTimestamp:
            stakeVerification.txTimestamp ??
            null,
          marketType:
            market.marketType,
          marketLinkedSessionKey:
            market.linkedSessionKey,
          marketScheduledMatchId:
            market.scheduledMatchId,
          marketCloseAt:
            market.closeAt,
          marketStatus:
            market.status,
          winnerSide:
            market.winnerSide,
          settledAt:
            market.settledAt,
          voidedAt:
            market.voidedAt,
          refundStatus:
            market.refundStatus,
          settlementExecutedAt:
            market.settlementExecutedAt,
        })
      : false;

  assertBetMarketPreflight(
    context,
    {
      viewer:
        input.viewer,
      side:
        input.side,
      walletAddress:
        normalizedWalletAddress ||
        null,
      allowLockedPostBroadcastRecovery:
        postBroadcastRecovery,
    }
  );

  try {
    await prisma.$transaction(async (tx) => {
      const lockedAt = new Date();

      if (shouldUseOnchainStake) {
        await acquireBetStakeTransferLock(
          tx,
          normalizedStakeTxHash
        );
        const ticketClaim =
          await tx.betStakeTicket.findUnique({
            where: {
              stakeTxHash:
                normalizedStakeTxHash,
            },
            select: {
              id: true,
            },
          });
        if (ticketClaim) {
          throw new BetWagerError(
            409,
            "That WOLO transfer is already attached to a multi-leg ticket."
          );
        }
      }

      const lockResult =
        await tx.betMarket.updateMany({
          where: postBroadcastRecovery
            ? {
                id:
                  input.marketId,
                status: {
                  in: [
                    ...POST_BROADCAST_RECOVERY_MARKET_STATUSES,
                  ],
                },
                winnerSide:
                  null,
                settledAt:
                  null,
                voidedAt:
                  null,
                refundStatus:
                  null,
                settlementExecutedAt:
                  null,
                propositionHash:
                  market.propositionHash,
                marketType:
                   market.marketType,
                 linkedSessionKey:
                   market.linkedSessionKey,
                 scheduledMatchId:
                   market.scheduledMatchId,
                 bettingLockedAt:
                  market.bettingLockedAt,
                closeAt:
                  market.closeAt,
              }
            : {
                id:
                  input.marketId,
                ...buildFreshBetMarketWriteWhere(
                  lockedAt
                ),
                integrityStatus:
                  "verified",
                propositionHash:
                  market.propositionHash,
                ...(isDesyncSideMarketType(
                  market.marketType
                )
                  ? {}
                  : {
                      teamResolutionStatus:
                        "resolved",
                      teamConfidence:
                        "high",
                    }),
              },
          data: {
            bettingLockedAt:
              postBroadcastRecovery
                ? market.bettingLockedAt
                : lockedAt,
          },
        });

      if (lockResult.count !== 1) {
        throw new BetWagerError(
          409,
          postBroadcastRecovery
            ? "The transferred WOLO could not be reconciled because the market proposition or financial state changed."
            : "Market integrity changed before the stake was recorded."
        );
      }
      const firstStakeLock = await tx.betMarket.updateMany({
        where: { id: input.marketId, firstStakeAcceptedAt: null },
        data: {
          firstStakeAcceptedAt: lockedAt,
          rosterLockedAt: lockedAt,
        },
      });

      if (input.viewer.walletAddress !== normalizedWalletAddress && normalizedWalletAddress) {
        await tx.user.update({
          where: { id: input.viewer.id },
          data: { walletAddress: normalizedWalletAddress },
        });
      }

      if (normalizedWalletAddress) {
        await ensureBetMarketWalletSideLock(tx, {
          marketId: input.marketId,
          userId: input.viewer.id,
          walletAddress: normalizedWalletAddress,
          side: input.side,
        });
      }

      if (typeof input.stakeIntentId === "number" && shouldUseOnchainStake) {
        await markBetStakeIntentVerified(tx as PrismaClient, { intentId: input.stakeIntentId });
      }

      await tx.betWager.create({
        data: {
          marketId: input.marketId,
          userId: input.viewer.id,
          stakeIntentId:
            typeof input.stakeIntentId === "number" ? input.stakeIntentId : null,
          side: input.side,
          amountWolo: input.amountWolo,
          status: "active",
          executionMode: shouldUseOnchainStake ? "onchain_escrow" : "app_only",
          stakeTxHash: shouldUseOnchainStake ? normalizedStakeTxHash : null,
          stakeWalletAddress: normalizedWalletAddress || null,
          stakeLockedAt: shouldUseOnchainStake ? new Date() : null,
        },
      });

      if (firstStakeLock.count === 1) {
        await recordUserActivity(tx as PrismaClient, {
          userId: input.viewer.id,
          type: "market_proposition_locked",
          path: "/bets",
          label: market.title,
          metadata: {
            marketId: market.id,
            propositionHash: market.propositionHash,
            leftLabel: market.leftLabel,
            rightLabel: market.rightLabel,
            lockedAt: lockedAt.toISOString(),
          },
          dedupeWithinSeconds: 0,
        });
      }

      if (typeof input.stakeIntentId === "number" && shouldUseOnchainStake) {
        await markBetStakeIntentRecorded(tx as PrismaClient, { intentId: input.stakeIntentId });
      }

      await recordUserActivity(tx as PrismaClient, {
        userId: input.viewer.id,
        type: "bet_wager_placed",
        path: "/bets",
        label: market.title,
        metadata: {
          marketId: market.id,
              marketType: market.marketType,
              side: input.side,
              amountWolo: input.amountWolo,
              leftLabel: market.leftLabel,
              rightLabel: market.rightLabel,
              status: market.status,
              executionMode: shouldUseOnchainStake ? "onchain_escrow" : "app_only",
              stakeTxHash: normalizedStakeTxHash || null,
              walletAddress: normalizedWalletAddress || null,
              recoveredAfterMarketLock:
                postBroadcastRecovery,
          stakeIntentId:
            typeof input.stakeIntentId === "number" ? input.stakeIntentId : null,
          escrowMode: escrowRuntime.mode,
        },
        dedupeWithinSeconds: 5,
      });
    });
  } catch (error) {
    if (
      isUniqueConstraintError(error, "stake_tx_hash") ||
      isUniqueConstraintError(error, "stake_intent_id")
    ) {
      return { kind: "duplicate_existing" };
    }
    throw error;
  }

  return { kind: "created" };
}
