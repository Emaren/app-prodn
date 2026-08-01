import { createHash } from "node:crypto";

import type { Prisma } from "@/lib/generated/prisma";
import {
  getWoloMainnetDisplayStartAt,
  isMainnetVisibleBetWager,
  isWoloMainnet,
} from "./woloChain.ts";

export type BetStakeTicketFunding = {
  id?: number;
  status: string;
  stakeTxHash: string | null;
  recordedAt?: Date | string | null;
  chainTimestamp?: Date | string | null;
};

export type BetWagerFunding = {
  executionMode?: string | null;
  stakeTxHash?: string | null;
  createdAt?: Date | string | null;
  stakeLockedAt?: Date | string | null;
  stakeIntent?: {
    status?: string | null;
  } | null;
  stakeLeg?: {
    ticket?: BetStakeTicketFunding | null;
  } | null;
};

export function isRecordedBetStakeTicket(
  ticket: BetStakeTicketFunding | null | undefined
) {
  return Boolean(
    ticket?.status === "recorded" &&
      ticket.stakeTxHash?.trim()
  );
}

/**
 * Legacy wagers own their transfer hash directly. Ticket-funded wagers share
 * one transfer, so their immutable funding proof is resolved through the leg.
 */
export function effectiveBetWagerStakeTxHash(
  wager: BetWagerFunding
) {
  const legacyTxHash =
    wager.stakeTxHash?.trim();
  if (legacyTxHash) {
    return legacyTxHash;
  }

  const ticket =
    wager.stakeLeg?.ticket;
  return isRecordedBetStakeTicket(
    ticket
  )
    ? ticket?.stakeTxHash?.trim() ??
        null
    : null;
}

/**
 * A funded wager has exactly one recorded proof path: the legacy per-market
 * intent or a recorded multi-leg ticket. A bare hash never counts by itself.
 */
export function recordedBetWagerFundingTxHash(
  wager: BetWagerFunding
) {
  const legacyTxHash = wager.stakeTxHash?.trim();
  if (
    legacyTxHash &&
    wager.stakeIntent?.status === "recorded"
  ) {
    return legacyTxHash;
  }

  const ticket = wager.stakeLeg?.ticket;
  return isRecordedBetStakeTicket(ticket)
    ? ticket?.stakeTxHash?.trim() ?? null
    : null;
}

export function hasRecordedBetWagerFunding(
  wager: BetWagerFunding
) {
  return Boolean(
    recordedBetWagerFundingTxHash(wager)
  );
}

/**
 * Shared in-memory visibility rule for consumers that already loaded wagers.
 * It preserves the mainnet execution/date fence while accepting either
 * recorded funding rail.
 */
export function isMainnetVisibleFundedBetWager(
  wager: BetWagerFunding
) {
  if (!isWoloMainnet()) {
    return true;
  }

  if (!hasRecordedBetWagerFunding(wager)) {
    return false;
  }

  return isMainnetVisibleBetWager({
    executionMode: wager.executionMode,
    stakeTxHash:
      recordedBetWagerFundingTxHash(
        wager
      ),
    createdAt: wager.createdAt,
    stakeLockedAt: wager.stakeLockedAt,
  });
}

/**
 * Shared Prisma visibility rule for aggregates and lists. Extra predicates
 * live in a separate AND branch so caller OR conditions cannot weaken proof.
 */
export function visibleMainnetFundedBetWagerWhere(
  extra: Prisma.BetWagerWhereInput = {}
): Prisma.BetWagerWhereInput {
  if (!isWoloMainnet()) {
    return extra;
  }

  return {
    AND: [
      extra,
      {
        executionMode: "onchain_escrow",
        stakeLockedAt: {
          gte: getWoloMainnetDisplayStartAt(),
        },
        OR: [
          {
            stakeTxHash: { not: null },
            stakeIntent: {
              is: {
                status: "recorded",
              },
            },
          },
          {
            stakeLeg: {
              is: {
                ticket: {
                  is: {
                    status: "recorded",
                    stakeTxHash: {
                      not: null,
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

export function betWagerFundingTicketId(
  wager: BetWagerFunding
) {
  const ticket =
    wager.stakeLeg?.ticket;
  return isRecordedBetStakeTicket(
    ticket
  ) &&
    typeof ticket?.id === "number"
    ? ticket.id
    : null;
}

/**
 * Serializes claims on a chain transaction across the legacy intent/wager rail
 * and the ticket rail. Both writers must re-check the other table after taking
 * this transaction-scoped PostgreSQL lock.
 */
export async function acquireBetStakeTransferLock(
  tx: Prisma.TransactionClient,
  stakeTxHash: string
) {
  const digest = createHash("sha256")
    .update(`aoe2hdbets:bet-stake:${stakeTxHash.trim().toUpperCase()}`)
    .digest();
  const lockId = BigInt.asIntN(64, digest.readBigUInt64BE(0));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
}

/**
 * Serializes every attempt to bind a chain transfer to the same immutable
 * ticket. Transfer locks alone are insufficient because two different hashes
 * would otherwise use two different locks and could race to replace the
 * ticket's initially-null hash.
 */
export async function acquireBetStakeTicketLock(
  tx: Prisma.TransactionClient,
  ticketId: number
) {
  const digest = createHash("sha256")
    .update(`aoe2hdbets:bet-stake-ticket:${ticketId}`)
    .digest();
  const lockId = BigInt.asIntN(64, digest.readBigUInt64BE(0));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
}

/**
 * Serializes every attempt to bind a chain transfer to the same legacy stake
 * intent. The transfer hash cannot be the only lock key because two different
 * hashes would otherwise race while the intent is still unbound and the last
 * writer could replace the first broadcast proof.
 */
export async function acquireBetStakeIntentLock(
  tx: Prisma.TransactionClient,
  intentId: number
) {
  const digest = createHash("sha256")
    .update(`aoe2hdbets:bet-stake-intent:${intentId}`)
    .digest();
  const lockId = BigInt.asIntN(64, digest.readBigUInt64BE(0));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
}
