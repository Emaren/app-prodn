import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

import { markBetStakeIntentRecorded, markBetStakeIntentVerified } from "@/lib/betStakeIntents";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { recordUserActivity } from "@/lib/userExperience";
import { getWoloBetEscrowRuntime } from "@/lib/woloChain";
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

type BetMarketPreflightContext = {
  market: {
    id: number;
    status: string;
    title: string;
    leftLabel: string;
    rightLabel: string;
    marketType: string;
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

async function ensureBetMarketWalletSideLock(
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

async function loadBetMarketPreflightContext(
  prisma: PrismaClient,
  input: {
    marketId: number;
    side: "left" | "right";
    walletAddress?: string | null;
  }
): Promise<BetMarketPreflightContext> {
  const normalizedWalletAddress = input.walletAddress?.trim() || "";

  const [market, activeMarketWagers, walletLock, unresolvedWalletIntent] = await Promise.all([
    prisma.betMarket.findUnique({
      where: { id: input.marketId },
      select: {
        id: true,
        status: true,
        title: true,
        leftLabel: true,
        rightLabel: true,
        marketType: true,
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
            status: {
              in: ["broadcast_submitted", "verified_unrecorded", "suspect", "orphaned"],
            },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            side: true,
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
        : null,
  };
}

function assertBetMarketPreflight(
  context: BetMarketPreflightContext,
  input: {
    viewer: Pick<WagerViewer, "id" | "inGameName" | "steamPersonaName">;
    side: "left" | "right";
    walletAddress?: string | null;
  }
) {
  const normalizedWalletAddress = input.walletAddress?.trim() || "";

  if (!["open", "closing", "live"].includes(context.market.status)) {
    throw new BetWagerError(409, "This book is closed.");
  }

  const forcedSide = resolveViewerMatchSide(input.viewer, context.market);
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
  prisma: PrismaClient,
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

  const [market, duplicateStake, existingIntentWager, stakeIntent] = await Promise.all([
    preflightPooledBetWager(prisma, {
      viewer: input.viewer,
      marketId: input.marketId,
      side: input.side,
      walletAddress: normalizedWalletAddress || null,
    }),
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
          },
        })
      : Promise.resolve(null),
  ]);

  if (existingIntentWager) {
    return { kind: "duplicate_existing" };
  }

  if (stakeIntent) {
    if (stakeIntent.userId !== input.viewer.id || stakeIntent.marketId !== input.marketId) {
      throw new BetWagerError(409, "Stake recovery intent does not belong to this wager.");
    }
    if (stakeIntent.side !== input.side || stakeIntent.amountWolo !== input.amountWolo) {
      throw new BetWagerError(409, "Stake recovery intent no longer matches this wager request.");
    }
  }

  if (duplicateStake) {
    if (
      duplicateStake.marketId === input.marketId &&
      duplicateStake.userId === input.viewer.id
    ) {
      return { kind: "duplicate_existing" };
    }
    throw new BetWagerError(
      409,
      "That WOLO stake transaction is already attached to another slip."
    );
  }

  if (escrowRuntime.onchainRequired && escrowRuntime.configError) {
    throw new BetWagerError(503, escrowRuntime.configError);
  }

  if (shouldUseOnchainStake) {
    if (typeof input.stakeIntentId !== "number" || !stakeIntent) {
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

    const addressError = validateWoloAddress(normalizedWalletAddress);
    if (addressError) {
      throw new BetWagerError(400, addressError);
    }

    if (!normalizedStakeTxHash) {
      throw new BetWagerError(409, "Missing WOLO stake transaction hash for this wager.");
    }

    const verification = await verifyStakeTransfer({
      txHash: normalizedStakeTxHash,
      fromAddress: normalizedWalletAddress,
      expectedAmountWolo: input.amountWolo,
    });

    if (!verification.verified) {
      throw new BetWagerError(409, verification.detail);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
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
