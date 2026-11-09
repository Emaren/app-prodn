/**
 * Operator-only crash recovery of a ALREADY RECORDED auto stake ticket.
 *
 * It does not contact a signer, submit an HTTP payment, authorize a new
 * bet, release a reserve or infer chain confirmation from a timeout.
 * The normal ticket commit must have independently verified the original
 * transfer before setting ticket.status="recorded".
 *
 * Reconciliation is exact-ID, owner-bound, repeatable and transactionally
 * idempotent through commitVerifiedSatchelAutoTicket.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { commitVerifiedSatchelAutoTicket } from "./warSatchelFundedLedger.ts";

function enabled() {
  if (process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_RECORD_ONLY_RECONCILIATION_ENABLED !== "true") {
    throw Error("SATCHEL_RECORDED_TICKET_RECONCILIATION_NOT_CERTIFIED");
  }
}
function validId(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}
type ReconcileResult =
  | Readonly<{ state: "already_committed"; executionId: number; ticketId: number }>
  | Readonly<{ state: "recorded_ticket_reconciled"; executionId: number; ticketId: number }>
  | Readonly<{ state: "requires_independent_chain_reconciliation"; executionId: number }>;

export async function reconcileRecordedSatchelTicket(
  prisma: PrismaClient,
  input: { executionId: number; ownerUserId: number },
): Promise<ReconcileResult> {
  enabled();
  if (!validId(input.executionId) || !validId(input.ownerUserId)) {
    throw Error("SATCHEL_RECONCILE_INVALID_EXECUTION_OWNER");
  }
  const reserve = await prisma.satchelFundedReservation.findUnique({
    where: { executionId: input.executionId },
    select: {
      id: true, executionId: true, ownerUserId: true,
      ticketRequestId: true, status: true, ticketId: true,
      txHash: true, amountUwolo: true,
    },
  });
  if (!reserve || reserve.ownerUserId !== input.ownerUserId ||
      reserve.ticketRequestId !== "satchel:ticket:" + input.executionId ||
      reserve.id !== "satchel:reserve:" + input.executionId) {
    throw Error("SATCHEL_RECONCILE_RESERVATION_OWNER_OR_SOURCE_CONFLICT");
  }
  if (reserve.status === "released") {
    throw Error("SATCHEL_RECONCILE_REFUNDED_RESERVATION_CANNOT_SPEND");
  }
  if (reserve.status === "reserved") {
    // There has been no durable prebroadcast fence. This path never tries
    // to guess whether sending would have occurred elsewhere.
    throw Error("SATCHEL_RECONCILE_UNFENCED_RESERVATION");
  }
  if (reserve.status === "committed") {
    if (!validId(reserve.ticketId || 0) ||
        !reserve.txHash || !/^[0-9A-F]{64}$/.test(reserve.txHash)) {
      throw Error("SATCHEL_RECONCILE_MALFORMED_TERMINAL_RECEIPT");
    }
    return Object.freeze({
      state: "already_committed" as const,
      executionId: reserve.executionId,
      ticketId: reserve.ticketId as number,
    });
  }
  if (reserve.status !== "unknown_hold") {
    throw Error("SATCHEL_RECONCILE_UNSUPPORTED_RESERVATION_STATUS");
  }
  const ticket = await prisma.betStakeTicket.findFirst({
    where: {
      clientRequestId: reserve.ticketRequestId,
      userId: reserve.ownerUserId,
      source: "auto",
      walletProvider: "satchel-vault",
    },
    select: {
      id: true, userId: true, clientRequestId: true,
      totalAmountWolo: true, walletAddress: true,
      stakeTxHash: true, status: true, recordedAt: true,
    },
  });
  if (!ticket || ticket.status !== "recorded" ||
      ticket.recordedAt === null || !ticket.stakeTxHash) {
    return Object.freeze({
      state: "requires_independent_chain_reconciliation" as const,
      executionId: input.executionId,
    });
  }
  if (ticket.walletAddress !== (process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "").trim() ||
      ticket.userId !== input.ownerUserId ||
      ticket.totalAmountWolo * 1000000 !== Number(reserve.amountUwolo) ||
      !/^[0-9A-F]{64}$/.test(ticket.stakeTxHash.toUpperCase())) {
    throw Error("SATCHEL_RECONCILE_OWNER_AMOUNT_OR_VAULT_MISMATCH");
  }
  // Calls the existing atomic journal commit: it independently reloads
  // the recorded BetStakeTicket, exact owner, reservation, transfer hash,
  // amount and finite preset state under the global Satchel lock.
  const done = await commitVerifiedSatchelAutoTicket(prisma, {
    executionId: reserve.executionId,
    ownerUserId: reserve.ownerUserId,
    ticketId: ticket.id,
    fundingTxHash: ticket.stakeTxHash.toUpperCase(),
  });
  return Object.freeze({
    state: done.status === "already_committed"
      ? "already_committed" as const
      : "recorded_ticket_reconciled" as const,
    executionId: reserve.executionId,
    ticketId: done.ticketId,
  });
}
