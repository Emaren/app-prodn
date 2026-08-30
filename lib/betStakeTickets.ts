import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

import {
  POST_BROADCAST_RECOVERY_MARKET_STATUSES,
  isPostBroadcastStakeRecovery,
} from "@/lib/betStakeRecoveryPolicy";
import {
  acquireBetStakeTicketLock,
  acquireBetStakeTransferLock,
} from "@/lib/betStakeFunding";
import {
  BET_STAKE_TICKET_VERSION,
  buildBetStakeTicketMemo,
} from "@/lib/betStakeMemo";
import {
  BetWagerError,
  type WagerViewer,
  assertBetMarketPreflight,
  ensureBetMarketWalletSideLock,
  loadBetMarketPreflightContext,
  normalizeBetAmount,
  normalizeBetSide,
  normalizeBetTxHash,
} from "@/lib/betWagering";
import {
  DESYNC_SIDE_MARKET_TYPE,
  WINNER_MARKET_TYPE,
} from "@/lib/desyncSideMarket";
import { recordUserActivity } from "@/lib/userExperience";
import {
  getWoloBetEscrowRuntime,
  toUwoLoAmount,
} from "@/lib/woloChain";
import {
  listRecentEscrowDeposits,
  validateWoloAddress,
  verifyStakeTransfer,
} from "@/lib/woloBetSettlement";

const TICKET_SOURCES = new Set(["manual", "auto", "ai"]);
export const BET_STAKE_TICKET_RECOVERABLE_STATUSES = [
  "awaiting_signature",
  "broadcast_submitted",
  "verified_unrecorded",
  "failed",
  "suspect",
  "orphaned",
] as const;
export const BET_STAKE_TICKET_UNSIGNED_MARKET_GUARD_MS = 15 * 60 * 1000;

/**
 * Keep a market alive while an unsigned ticket is fresh, or indefinitely once
 * any transfer hash/proof state exists. Old unsigned failed/suspect/orphaned
 * rows are operator evidence but cannot hold a vanished game open forever.
 */
export function buildBetStakeTicketMarketGuardWhere(
  now = new Date()
): Prisma.BetStakeTicketWhereInput {
  return {
    OR: [
      {
        status: "awaiting_signature",
        stakeTxHash: null,
        createdAt: {
          gte: new Date(now.getTime() - BET_STAKE_TICKET_UNSIGNED_MARKET_GUARD_MS),
        },
      },
      {
        status: {
          in: ["broadcast_submitted", "verified_unrecorded", "recorded"],
        },
      },
      {
        stakeTxHash: { not: null },
        status: {
          in: [...BET_STAKE_TICKET_RECOVERABLE_STATUSES, "recorded"],
        },
      },
    ],
  };
}
const TICKET_DISCOVERY_WINDOW_MS =
  24 * 60 * 60 * 1000;
const TICKET_ORPHAN_AFTER_MS =
  15 * 60 * 1000;

export type BetStakeTicketLegInput = {
  marketId: unknown;
  side: unknown;
  amountWolo: unknown;
};

export type PrepareBetStakeTicketInput = {
  version?: unknown;
  clientRequestId: unknown;
  source?: unknown;
  totalAmountWolo: unknown;
  walletAddress: unknown;
  walletProvider?: unknown;
  walletType?: unknown;
  browserInfo?: unknown;
  routePath?: unknown;
  legs: unknown;
};

type NormalizedTicketLeg = {
  marketId: number;
  side: "left" | "right";
  amountWolo: number;
};

const TICKET_PUBLIC_INCLUDE = {
  legs: {
    orderBy: [{ marketId: "asc" }, { id: "asc" }],
    include: {
      market: {
        select: {
          id: true,
          parentMarketId: true,
          title: true,
          eventLabel: true,
          marketType: true,
          status: true,
          leftLabel: true,
          rightLabel: true,
          propositionHash: true,
        },
      },
      wager: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.BetStakeTicketInclude;

type TicketWithLegs = Prisma.BetStakeTicketGetPayload<{
  include: typeof TICKET_PUBLIC_INCLUDE;
}>;

export function areBetStakeTicketsEnabled() {
  return process.env.BET_STAKE_TICKETS_ENABLED?.trim().toLowerCase() !== "false";
}

function requireTicketRailEnabled() {
  if (!areBetStakeTicketsEnabled()) {
    throw new BetWagerError(503, "One-transfer bet tickets are temporarily paused.");
  }

  const runtime = getWoloBetEscrowRuntime();
  if (!runtime.onchainAllowed) {
    throw new BetWagerError(
      503,
      runtime.configError ||
        "One-transfer bet tickets require the verified WOLO escrow rail."
    );
  }

  return runtime;
}

function normalizeString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function normalizePositiveInt(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTotalAmount(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100_000
    ? parsed
    : null;
}

function normalizeLegs(value: unknown): NormalizedTicketLeg[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new BetWagerError(
      400,
      "A bet ticket needs one winner leg and may include one Desync leg."
    );
  }

  const legs = value.map((raw) => {
    const leg = raw && typeof raw === "object" ? (raw as BetStakeTicketLegInput) : null;
    const marketId = normalizePositiveInt(leg?.marketId);
    const side = normalizeBetSide(leg?.side);
    const amountWolo = normalizeBetAmount(leg?.amountWolo);
    if (!marketId || !side || !amountWolo) {
      throw new BetWagerError(
        400,
        "Every ticket leg needs a valid market, side, and WOLO amount."
      );
    }
    return {
      marketId,
      side,
      amountWolo,
    } satisfies NormalizedTicketLeg;
  });

  if (new Set(legs.map((leg) => leg.marketId)).size !== legs.length) {
    throw new BetWagerError(400, "A market may appear only once on a bet ticket.");
  }

  return legs;
}

export function canonicalBetStakeTicketPropositionSetHash(
  legs: Array<{
    marketId: number;
    legRole: string;
    side: string;
    amountWolo: number;
    propositionHash: string;
  }>
) {
  const canonical = [...legs]
    .sort((left, right) => left.marketId - right.marketId)
    .map((leg) => ({
      marketId: leg.marketId,
      role: leg.legRole,
      side: leg.side,
      amountWolo: leg.amountWolo,
      propositionHash: leg.propositionHash,
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function serializeBetStakeTicket(ticket: TicketWithLegs, duplicate = false) {
  return {
    duplicate,
    ticket: {
      id: ticket.id,
      version: ticket.version,
      status: ticket.status,
      source: ticket.source,
      clientRequestId: ticket.clientRequestId,
      totalAmountWolo: ticket.totalAmountWolo,
      propositionSetHash: ticket.propositionSetHash,
      walletAddress: ticket.walletAddress,
      stakeTxHash: ticket.stakeTxHash,
      memo: buildBetStakeTicketMemo(ticket.id, ticket.version),
      broadcastSubmittedAt: ticket.broadcastSubmittedAt?.toISOString() ?? null,
      verifiedAt: ticket.verifiedAt?.toISOString() ?? null,
      recordedAt: ticket.recordedAt?.toISOString() ?? null,
      errorDetail: ticket.errorDetail,
      legs: ticket.legs.map((leg) => ({
        id: leg.id,
        marketId: leg.marketId,
        legRole: leg.legRole,
        side: leg.side,
        amountWolo: leg.amountWolo,
        propositionHash: leg.propositionHash,
        wagerId: leg.wager?.id ?? null,
        wagerStatus: leg.wager?.status ?? null,
        market: leg.market,
      })),
    },
  };
}

function assertSamePreparedRequest(
  ticket: TicketWithLegs,
  input: {
    version: number;
    source: string;
    totalAmountWolo: number;
    walletAddress: string;
    legs: NormalizedTicketLeg[];
  }
) {
  const existingLegs = ticket.legs
    .map((leg) => `${leg.marketId}:${leg.side}:${leg.amountWolo}`)
    .sort();
  const requestedLegs = input.legs
    .map((leg) => `${leg.marketId}:${leg.side}:${leg.amountWolo}`)
    .sort();
  const same =
    ticket.version === input.version &&
    ticket.source === input.source &&
    ticket.totalAmountWolo === input.totalAmountWolo &&
    ticket.walletAddress === input.walletAddress &&
    existingLegs.join("|") === requestedLegs.join("|");
  if (!same) {
    throw new BetWagerError(
      409,
      "That client request id already belongs to a different immutable bet ticket."
    );
  }
}

type BetStakeTicketDbClient = PrismaClient | Prisma.TransactionClient;

async function loadTicketByUserRequest(
  prisma: BetStakeTicketDbClient,
  userId: number,
  clientRequestId: string
) {
  return prisma.betStakeTicket.findUnique({
    where: {
      userId_clientRequestId: { userId, clientRequestId },
    },
    include: TICKET_PUBLIC_INCLUDE,
  });
}

async function lockBetStakeTicketMarkets(
  tx: Prisma.TransactionClient,
  marketIds: number[]
) {
  const orderedMarketIds = [...new Set(marketIds)].sort(
    (left, right) => left - right
  );
  const locked = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT "id"
    FROM "bet_markets"
    WHERE "id" IN (${Prisma.join(orderedMarketIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
  if (locked.length !== orderedMarketIds.length) {
    throw new BetWagerError(
      404,
      "One or more selected markets no longer exist."
    );
  }
}

function canonicalTicketLegState(
  ticket: {
    propositionSetHash: string;
    legs: Array<{
      id: number;
      marketId: number;
      legRole: string;
      side: string;
      amountWolo: number;
      propositionHash: string;
    }>;
  }
) {
  return JSON.stringify({
    propositionSetHash: ticket.propositionSetHash,
    legs: [...ticket.legs]
      .sort((left, right) => left.id - right.id)
      .map((leg) => ({
        id: leg.id,
        marketId: leg.marketId,
        legRole: leg.legRole,
        side: leg.side,
        amountWolo: leg.amountWolo,
        propositionHash: leg.propositionHash,
      })),
  });
}

export async function prepareBetStakeTicket(
  prisma: PrismaClient,
  input: PrepareBetStakeTicketInput & { viewer: WagerViewer }
) {
  requireTicketRailEnabled();

  const version = input.version === undefined ? BET_STAKE_TICKET_VERSION : normalizePositiveInt(input.version);
  if (version !== BET_STAKE_TICKET_VERSION) {
    throw new BetWagerError(400, `Unsupported bet ticket version ${String(input.version)}.`);
  }
  const rawClientRequestId =
    typeof input.clientRequestId === "string"
      ? input.clientRequestId.trim()
      : "";
  const rawWalletAddress =
    typeof input.walletAddress === "string"
      ? input.walletAddress.trim()
      : "";
  if (rawClientRequestId.length > 128) {
    throw new BetWagerError(400, "Client request id must be 128 characters or fewer.");
  }
  if (rawWalletAddress.length > 100) {
    throw new BetWagerError(400, "WOLO wallet address is too long.");
  }
  const clientRequestId = rawClientRequestId || null;
  const walletAddress = rawWalletAddress || null;
  const totalAmountWolo = normalizeTotalAmount(input.totalAmountWolo);
  const legs = normalizeLegs(input.legs);
  if (!clientRequestId || !walletAddress || !totalAmountWolo) {
    throw new BetWagerError(
      400,
      "Client request id, connected wallet, and total WOLO amount are required."
    );
  }
  const addressError = validateWoloAddress(walletAddress);
  if (addressError) {
    throw new BetWagerError(400, addressError);
  }
  if (legs.reduce((sum, leg) => sum + leg.amountWolo, 0) !== totalAmountWolo) {
    throw new BetWagerError(400, "Ticket total must exactly equal the sum of its legs.");
  }
  const rawSource = normalizeString(input.source, 24) || "manual";
  const source = TICKET_SOURCES.has(rawSource) ? rawSource : "manual";

  const existing = await loadTicketByUserRequest(prisma, input.viewer.id, clientRequestId);
  if (existing) {
    assertSamePreparedRequest(existing, {
      version,
      source,
      totalAmountWolo,
      walletAddress,
      legs,
    });
    return serializeBetStakeTicket(existing, true);
  }

  try {
    const prepared = await prisma.$transaction(async (tx) => {
      // Serialize ticket preparation with cleanup and challenge-shadow merges.
      // Without these row locks, a user could sign a ticket for a market that
      // became terminal between preflight and immutable-leg creation.
      await lockBetStakeTicketMarkets(
        tx,
        legs.map((leg) => leg.marketId)
      );

      const raced = await loadTicketByUserRequest(
        tx,
        input.viewer.id,
        clientRequestId
      );
      if (raced) {
        assertSamePreparedRequest(raced, {
          version,
          source,
          totalAmountWolo,
          walletAddress,
          legs,
        });
        return { ticket: raced, duplicate: true };
      }

      const contexts: Array<{
        leg: NormalizedTicketLeg;
        context: Awaited<ReturnType<typeof loadBetMarketPreflightContext>>;
      }> = [];
      for (const leg of legs) {
        const context = await loadBetMarketPreflightContext(tx, {
          marketId: leg.marketId,
          side: leg.side,
          walletAddress,
        });
        assertBetMarketPreflight(context, {
          viewer: input.viewer,
          side: leg.side,
          walletAddress,
        });
        contexts.push({ leg, context });
      }

      const winner = contexts.filter(
        ({ context }) => context.market.marketType === WINNER_MARKET_TYPE
      );
      const desync = contexts.filter(
        ({ context }) => context.market.marketType === DESYNC_SIDE_MARKET_TYPE
      );
      if (
        winner.length !== 1 ||
        winner.length + desync.length !== contexts.length ||
        desync.length > 1
      ) {
        throw new BetWagerError(
          400,
          "A ticket must contain exactly one winner market and at most its one Desync market."
        );
      }
      if (
        desync.length === 1 &&
        desync[0].context.market.parentMarketId !== winner[0].context.market.id
      ) {
        throw new BetWagerError(
          409,
          "The Desync leg is not attached to this winner market. Refresh the betting board."
        );
      }

      const frozenLegs = contexts.map(({ leg, context }) => {
        if (!context.market.propositionHash) {
          throw new BetWagerError(
            409,
            "A selected market no longer has a verified proposition."
          );
        }
        return {
          marketId: leg.marketId,
          legRole:
            context.market.marketType === DESYNC_SIDE_MARKET_TYPE
              ? "desync"
              : "winner",
          side: leg.side,
          amountWolo: leg.amountWolo,
          propositionHash: context.market.propositionHash,
        };
      });

      // A fresh unsigned ticket is a real promise to the user: after they sign,
      // the app must not discover that another tab prepared the opposite side.
      // Market row locks make this check authoritative across concurrent tabs.
      const ticketMarketGuard = buildBetStakeTicketMarketGuardWhere(new Date());
      const conflictingTicketLeg = await tx.betStakeLeg.findFirst({
        where: {
          OR: legs.map((leg) => ({
            marketId: leg.marketId,
            side: { not: leg.side },
            ticket: {
              is: {
                walletAddress,
                ...ticketMarketGuard,
              },
            },
          })),
        },
        select: {
          id: true,
          marketId: true,
        },
      });
      if (conflictingTicketLeg) {
        throw new BetWagerError(
          409,
          "That wallet already has a pending ticket on the other side of a selected market."
        );
      }

      const propositionSetHash =
        canonicalBetStakeTicketPropositionSetHash(frozenLegs);
      const created = await tx.betStakeTicket.create({
        data: {
          version,
          userId: input.viewer.id,
          clientRequestId,
          source,
          totalAmountWolo,
          propositionSetHash,
          walletAddress,
          walletProvider: normalizeString(input.walletProvider, 32),
          walletType: normalizeString(input.walletType, 32),
          browserInfo: normalizeString(input.browserInfo, 255),
          routePath: normalizeString(input.routePath, 160),
          status: "awaiting_signature",
          legs: {
            create: frozenLegs,
          },
        },
        include: TICKET_PUBLIC_INCLUDE,
      });
      return { ticket: created, duplicate: false };
    });

    return serializeBetStakeTicket(prepared.ticket, prepared.duplicate);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await loadTicketByUserRequest(
        prisma,
        input.viewer.id,
        clientRequestId
      );
      if (raced) {
        assertSamePreparedRequest(raced, {
          version,
          source,
          totalAmountWolo,
          walletAddress,
          legs,
        });
        return serializeBetStakeTicket(raced, true);
      }
    }
    throw error;
  }
}

async function loadOwnedTicket(prisma: PrismaClient, ticketId: number, userId: number) {
  const ticket = await prisma.betStakeTicket.findUnique({
    where: { id: ticketId },
    include: TICKET_PUBLIC_INCLUDE,
  });
  if (!ticket || ticket.userId !== userId) {
    throw new BetWagerError(404, "Bet ticket not found.");
  }
  return ticket;
}

export async function bindBetStakeTicketBroadcast(
  prisma: PrismaClient,
  input: {
    ticketId: number;
    stakeTxHash: string;
    broadcastSubmittedAt: Date;
  }
) {
  return prisma.$transaction(
    async (tx) => {
      // Lock order is stable for every binding attempt: immutable ticket
      // identity first, then the candidate transfer. The ticket lock prevents
      // two different hashes from both observing an unbound ticket.
      await acquireBetStakeTicketLock(
        tx,
        input.ticketId
      );
      await acquireBetStakeTransferLock(
        tx,
        input.stakeTxHash
      );
      const current =
        await tx.betStakeTicket.findUnique({
          where: {
            id: input.ticketId,
          },
          select: {
            status: true,
            stakeTxHash: true,
            broadcastSubmittedAt: true,
          },
        });
      if (!current) {
        throw new BetWagerError(
          404,
          "Bet ticket not found."
        );
      }
      if (
        current.stakeTxHash &&
        current.stakeTxHash !==
          input.stakeTxHash
      ) {
        throw new BetWagerError(
          409,
          "This ticket is already bound to another transaction hash."
        );
      }
      const [
        legacyWager,
        legacyIntent,
        ticketClaim,
      ] = await Promise.all([
        tx.betWager.findUnique({
          where: {
            stakeTxHash:
              input.stakeTxHash,
          },
          select: { id: true },
        }),
        tx.betStakeIntent.findUnique({
          where: {
            stakeTxHash:
              input.stakeTxHash,
          },
          select: { id: true },
        }),
        tx.betStakeTicket.findUnique({
          where: {
            stakeTxHash:
              input.stakeTxHash,
          },
          select: {
            id: true,
            status: true,
          },
        }),
      ]);
      if (
        legacyWager ||
        legacyIntent ||
        (
          ticketClaim &&
          ticketClaim.id !==
            input.ticketId
        )
      ) {
        throw new BetWagerError(
          409,
          "That WOLO transfer is already attached to another stake."
        );
      }
      if (
        current.status ===
        "recorded"
      ) {
        return current;
      }

      return tx.betStakeTicket.update({
        where: {
          id: input.ticketId,
        },
        data: {
          stakeTxHash:
            input.stakeTxHash,
          broadcastSubmittedAt:
            current.broadcastSubmittedAt ??
            input.broadcastSubmittedAt,
          status:
            "broadcast_submitted",
          errorDetail: null,
          orphanedAt: null,
        },
      });
    }
  );
}

function parseChainTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function commitBetStakeTicket(
  prisma: PrismaClient,
  input: {
    ticketId: number;
    viewer: WagerViewer;
    stakeTxHash: unknown;
    walletAddress?: unknown;
  }
) {
  const escrowRuntime = requireTicketRailEnabled();
  const ticket = await loadOwnedTicket(prisma, input.ticketId, input.viewer.id);
  const stakeTxHash = normalizeBetTxHash(
    typeof input.stakeTxHash === "string" ? input.stakeTxHash : null
  );
  const requestedWallet = normalizeString(input.walletAddress, 100) || ticket.walletAddress;
  if (!stakeTxHash) {
    throw new BetWagerError(400, "Stake transaction hash is required.");
  }
  if (requestedWallet !== ticket.walletAddress) {
    throw new BetWagerError(409, "The connected wallet does not match this immutable ticket.");
  }
  if (ticket.status === "recorded") {
    if (ticket.stakeTxHash !== stakeTxHash) {
      throw new BetWagerError(409, "This ticket was already recorded with another transaction.");
    }
    if (ticket.legs.some((leg) => !leg.wager)) {
      throw new BetWagerError(409, "This recorded ticket is incomplete and needs operator review.");
    }
    return serializeBetStakeTicket(ticket, true);
  }
  if (ticket.stakeTxHash && ticket.stakeTxHash !== stakeTxHash) {
    throw new BetWagerError(409, "This ticket is already bound to another transaction hash.");
  }

  const [otherTicket, legacyWager, legacyIntent] = await Promise.all([
    prisma.betStakeTicket.findUnique({
      where: { stakeTxHash },
      select: { id: true, userId: true },
    }),
    prisma.betWager.findUnique({
      where: { stakeTxHash },
      select: { id: true },
    }),
    prisma.betStakeIntent.findUnique({
      where: { stakeTxHash },
      select: { id: true },
    }),
  ]);
  if ((otherTicket && otherTicket.id !== ticket.id) || legacyWager || legacyIntent) {
    throw new BetWagerError(409, "That WOLO transfer is already attached to another stake.");
  }

  const broadcastSubmittedAt = ticket.broadcastSubmittedAt ?? new Date();
  await bindBetStakeTicketBroadcast(
    prisma,
    {
      ticketId:
        ticket.id,
      stakeTxHash,
      broadcastSubmittedAt,
    }
  );

  const verification = await verifyStakeTransfer({
    txHash: stakeTxHash,
    fromAddress: ticket.walletAddress,
    expectedAmountWolo: ticket.totalAmountWolo,
    expectedMemo: buildBetStakeTicketMemo(ticket.id, ticket.version),
  });
  if (!verification.verified) {
    await prisma.betStakeTicket.updateMany({
      where: { id: ticket.id, status: { not: "recorded" } },
      data: {
        status: "suspect",
        errorDetail: verification.detail.slice(0, 255),
      },
    });
    throw new BetWagerError(409, verification.detail);
  }

  const chainTimestamp = parseChainTimestamp(verification.txTimestamp);
  await prisma.betStakeTicket.updateMany({
    where: { id: ticket.id, status: { not: "recorded" } },
    data: {
      status: "verified_unrecorded",
      verifiedAt: new Date(),
      chainTimestamp,
      errorDetail: null,
      orphanedAt: null,
    },
  });

  const contexts = await Promise.all(
    ticket.legs.map(async (leg) => {
      const context = await loadBetMarketPreflightContext(prisma, {
        marketId: leg.marketId,
        side: leg.side === "right" ? "right" : "left",
        walletAddress: ticket.walletAddress,
      });
      const postBroadcastRecovery = isPostBroadcastStakeRecovery({
        intentStatus: "verified_unrecorded",
        requestedTxHash: stakeTxHash,
        intentTxHash: stakeTxHash,
        requestedWalletAddress: ticket.walletAddress,
        intentWalletAddress: ticket.walletAddress,
        intentPropositionHash: leg.propositionHash,
        marketPropositionHash: context.market.propositionHash,
        intentCreatedAt: ticket.createdAt,
        broadcastSubmittedAt,
        txTimestamp: verification.txTimestamp ?? null,
        marketCloseAt: context.market.closeAt,
        marketStatus: context.market.status,
        winnerSide: context.market.winnerSide,
        settledAt: context.market.settledAt,
        voidedAt: context.market.voidedAt,
        refundStatus: context.market.refundStatus,
        settlementExecutedAt: context.market.settlementExecutedAt,
      });
      assertBetMarketPreflight(context, {
        viewer: input.viewer,
        side: leg.side === "right" ? "right" : "left",
        walletAddress: ticket.walletAddress,
        allowLockedPostBroadcastRecovery: postBroadcastRecovery,
      });
      return { leg, context, postBroadcastRecovery };
    })
  );

  try {
    await prisma.$transaction(async (tx) => {
      const lockedAt = new Date();
      await acquireBetStakeTicketLock(
        tx,
        ticket.id
      );
      const lockedTicket = await tx.betStakeTicket.findUnique({
        where: { id: ticket.id },
        select: {
          userId: true,
          walletAddress: true,
          totalAmountWolo: true,
          stakeTxHash: true,
          propositionSetHash: true,
          legs: {
            select: {
              id: true,
              marketId: true,
              legRole: true,
              side: true,
              amountWolo: true,
              propositionHash: true,
            },
          },
        },
      });
      if (
        !lockedTicket ||
        lockedTicket.userId !== input.viewer.id ||
        lockedTicket.walletAddress !== ticket.walletAddress ||
        lockedTicket.totalAmountWolo !== ticket.totalAmountWolo ||
        lockedTicket.stakeTxHash !== stakeTxHash ||
        canonicalTicketLegState(lockedTicket) !==
          canonicalTicketLegState(ticket)
      ) {
        throw new BetWagerError(
          409,
          "Ticket legs changed while the transfer was being verified. Retry recovery against the canonical market."
        );
      }
      await acquireBetStakeTransferLock(
        tx,
        stakeTxHash
      );
      const [legacyWagerClaim, legacyIntentClaim, ticketClaim] = await Promise.all([
        tx.betWager.findUnique({
          where: { stakeTxHash },
          select: { id: true },
        }),
        tx.betStakeIntent.findUnique({
          where: { stakeTxHash },
          select: { id: true },
        }),
        tx.betStakeTicket.findUnique({
          where: { stakeTxHash },
          select: { id: true },
        }),
      ]);
      if (
        legacyWagerClaim ||
        legacyIntentClaim ||
        ticketClaim?.id !== ticket.id
      ) {
        throw new BetWagerError(
          409,
          "That WOLO transfer is already attached to another stake."
        );
      }

      for (const { leg, context, postBroadcastRecovery } of [...contexts].sort(
        (left, right) => left.leg.marketId - right.leg.marketId
      )) {
        const market = context.market;
        const lock = await tx.betMarket.updateMany({
          where: postBroadcastRecovery
            ? {
                id: leg.marketId,
                status: { in: [...POST_BROADCAST_RECOVERY_MARKET_STATUSES] },
                winnerSide: null,
                settledAt: null,
                voidedAt: null,
                refundStatus: null,
                settlementExecutedAt: null,
                propositionHash: leg.propositionHash,
                bettingLockedAt: market.bettingLockedAt,
                closeAt: market.closeAt,
              }
            : {
                id: leg.marketId,
                status: {
                  in:
                    market.marketType === DESYNC_SIDE_MARKET_TYPE
                      ? ["open", "live"]
                      : ["open", "closing", "live"],
                },
                integrityStatus: "verified",
                propositionHash: leg.propositionHash,
                ...(market.marketType === DESYNC_SIDE_MARKET_TYPE
                  ? {}
                  : { teamResolutionStatus: "resolved", teamConfidence: "high" }),
              },
          data: {
            bettingLockedAt: postBroadcastRecovery ? market.bettingLockedAt : lockedAt,
          },
        });
        if (lock.count !== 1) {
          throw new BetWagerError(
            409,
            postBroadcastRecovery
              ? "The transferred WOLO could not be reconciled because a proposition changed."
              : "A ticket proposition changed before the stake was recorded."
          );
        }

        const firstStake = await tx.betMarket.updateMany({
          where: { id: leg.marketId, firstStakeAcceptedAt: null },
          data: { firstStakeAcceptedAt: lockedAt, rosterLockedAt: lockedAt },
        });
        await ensureBetMarketWalletSideLock(tx, {
          marketId: leg.marketId,
          userId: input.viewer.id,
          walletAddress: ticket.walletAddress,
          side: leg.side === "right" ? "right" : "left",
        });
        await tx.betWager.create({
          data: {
            marketId: leg.marketId,
            userId: input.viewer.id,
            stakeLegId: leg.id,
            side: leg.side,
            amountWolo: leg.amountWolo,
            status: "active",
            executionMode: "onchain_escrow",
            stakeTxHash: null,
            stakeWalletAddress: ticket.walletAddress,
            stakeLockedAt: chainTimestamp ?? lockedAt,
          },
        });
        if (firstStake.count === 1) {
          await recordUserActivity(tx as PrismaClient, {
            userId: input.viewer.id,
            type: "market_proposition_locked",
            path: "/bets",
            label: market.title,
            metadata: {
              marketId: market.id,
              propositionHash: leg.propositionHash,
              leftLabel: market.leftLabel,
              rightLabel: market.rightLabel,
              lockedAt: lockedAt.toISOString(),
              ticketId: ticket.id,
            },
            dedupeWithinSeconds: 0,
          });
        }
        await recordUserActivity(tx as PrismaClient, {
          userId: input.viewer.id,
          type: "bet_wager_placed",
          path: "/bets",
          label: market.title,
          metadata: {
            marketId: market.id,
            marketType: market.marketType,
            side: leg.side,
            amountWolo: leg.amountWolo,
            executionMode: "onchain_escrow",
            stakeTxHash,
            walletAddress: ticket.walletAddress,
            recoveredAfterMarketLock: postBroadcastRecovery,
            stakeTicketId: ticket.id,
            stakeLegId: leg.id,
            escrowMode: escrowRuntime.mode,
          },
          dedupeWithinSeconds: 0,
        });
      }

      if (input.viewer.walletAddress !== ticket.walletAddress) {
        await tx.user.update({
          where: { id: input.viewer.id },
          data: { walletAddress: ticket.walletAddress },
        });
      }
      const recorded = await tx.betStakeTicket.updateMany({
        where: {
          id: ticket.id,
          stakeTxHash,
          status: { in: [...BET_STAKE_TICKET_RECOVERABLE_STATUSES] },
        },
        data: {
          status: "recorded",
          recordedAt: lockedAt,
          verifiedAt: lockedAt,
          errorDetail: null,
          orphanedAt: null,
        },
      });
      if (recorded.count !== 1) {
        throw new BetWagerError(409, "Ticket state changed while its legs were being recorded.");
      }
    });
  } catch (error) {
    const refreshed = await loadOwnedTicket(prisma, ticket.id, input.viewer.id);
    if (
      refreshed.status === "recorded" &&
      refreshed.stakeTxHash === stakeTxHash &&
      refreshed.legs.every((leg) => Boolean(leg.wager))
    ) {
      return serializeBetStakeTicket(refreshed, true);
    }
    await prisma.betStakeTicket.updateMany({
      where: { id: ticket.id, status: { not: "recorded" } },
      data: {
        status: "suspect",
        errorDetail: (error instanceof Error ? error.message : "Ticket commit failed.").slice(0, 255),
      },
    });
    throw error;
  }

  return serializeBetStakeTicket(
    await loadOwnedTicket(prisma, ticket.id, input.viewer.id)
  );
}

function depositCouldFundTicket(
  deposit: NonNullable<
    Awaited<
      ReturnType<
        typeof listRecentEscrowDeposits
      >
    >
  >[number],
  ticket: {
    id: number;
    version: number;
    totalAmountWolo: number;
    walletAddress: string;
    createdAt: Date;
  }
) {
  const timestamp =
    deposit.timestamp
      ? Date.parse(
          deposit.timestamp
        )
      : Number.NaN;

  return (
    deposit.txSuccess &&
    Boolean(
      deposit.txHash
    ) &&
    deposit.sender?.trim() ===
      ticket.walletAddress &&
    deposit.amountUWolo?.trim() ===
      toUwoLoAmount(
        ticket.totalAmountWolo
      ) &&
    deposit.memo?.trim() ===
      buildBetStakeTicketMemo(
        ticket.id,
        ticket.version
      ) &&
    (
      !Number.isFinite(
        timestamp
      ) ||
      timestamp >=
        ticket.createdAt.getTime() -
          2 * 60 * 1000
    )
  );
}

export async function refreshRecoverableBetStakeTickets(
  prisma: PrismaClient,
  userId: number
) {
  const discoveryCutoff = new Date(
    Date.now() -
      TICKET_DISCOVERY_WINDOW_MS
  );
  const tickets =
    await prisma.betStakeTicket.findMany({
      where: {
        userId,
        createdAt: {
          gte: discoveryCutoff,
        },
        status: {
          in: [
            ...BET_STAKE_TICKET_RECOVERABLE_STATUSES,
          ],
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      take: 24,
    });

  const depositsByWallet =
    new Map<
      string,
      Awaited<
        ReturnType<
          typeof listRecentEscrowDeposits
        >
      >
    >();

  for (const ticket of tickets) {
    if (
      ticket.stakeTxHash ||
      ticket.status ===
        "failed"
    ) {
      continue;
    }
    if (
      !depositsByWallet.has(
        ticket.walletAddress
      )
    ) {
      depositsByWallet.set(
        ticket.walletAddress,
        await listRecentEscrowDeposits({
          sender:
            ticket.walletAddress,
          limit: 50,
        })
      );
    }
    const deposits =
      depositsByWallet.get(
        ticket.walletAddress
      );
    if (!deposits) {
      continue;
    }
    const matches = deposits.filter(
      (deposit) =>
        depositCouldFundTicket(
          deposit,
          ticket
        )
    );

    if (matches.length === 1) {
      const stakeTxHash =
        normalizeBetTxHash(
          matches[0].txHash
        );
      const [legacyWager, legacyIntent] =
        await Promise.all([
          prisma.betWager.findUnique({
            where: {
              stakeTxHash,
            },
            select: { id: true },
          }),
          prisma.betStakeIntent.findUnique({
            where: {
              stakeTxHash,
            },
            select: { id: true },
          }),
        ]);
      if (
        legacyWager ||
        legacyIntent
      ) {
        await prisma.betStakeTicket.update({
          where: { id: ticket.id },
          data: {
            status: "suspect",
            errorDetail:
              "Recovered escrow transfer is already attached to a legacy stake.",
          },
        });
        continue;
      }

      try {
        await bindBetStakeTicketBroadcast(
          prisma,
          {
            ticketId:
              ticket.id,
            stakeTxHash,
            broadcastSubmittedAt:
              ticket.broadcastSubmittedAt ??
              new Date(),
          }
        );
      } catch (error) {
        if (
          error instanceof
          BetWagerError
        ) {
          await prisma.betStakeTicket.update({
            where: { id: ticket.id },
            data: {
              status: "suspect",
              errorDetail:
                error.message.slice(0, 255),
            },
          });
          continue;
        }
        throw error;
      }
    } else if (
      matches.length > 1
    ) {
      await prisma.betStakeTicket.update({
        where: { id: ticket.id },
        data: {
          status: "suspect",
          errorDetail:
            "Multiple escrow transfers matched this ticket; operator review is required.",
        },
      });
    }
  }

  const orphanCutoff = new Date(
    Date.now() -
      TICKET_ORPHAN_AFTER_MS
  );
  await prisma.betStakeTicket.updateMany({
    where: {
      userId,
      status: {
        in: [
          "broadcast_submitted",
          "verified_unrecorded",
        ],
      },
      updatedAt: {
        lt: orphanCutoff,
      },
    },
    data: {
      status: "orphaned",
      orphanedAt: new Date(),
    },
  });
}

export async function loadViewerBetStakeTickets(
  prisma: PrismaClient,
  userId: number
) {
  if (
    process.env.AOE2WAR_PROD_DB_PREVIEW !== "true"
  ) {
    try {
      await refreshRecoverableBetStakeTickets(
        prisma,
        userId,
      );
    } catch (error) {
      console.warn(
        "Failed to refresh viewer bet stake tickets:",
        error,
      );
    }
  }

  const cutoff = new Date(
    Date.now() -
      TICKET_DISCOVERY_WINDOW_MS
  );
  return prisma.betStakeTicket.findMany({
    where: {
      userId,
      status: {
        in: [
          ...BET_STAKE_TICKET_RECOVERABLE_STATUSES,
        ],
      },
      OR: [
        {
          stakeTxHash: {
            not: null,
          },
        },
        {
          stakeTxHash: null,
          updatedAt: {
            gte: cutoff,
          },
        },
      ],
    },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: 8,
    include: TICKET_PUBLIC_INCLUDE,
  });
}
