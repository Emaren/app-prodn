/**
 * Bounded, read-only visibility for funded Satchel holds that have aged out of
 * automatic Watcher submission. This is NOT proof that any funds are safe to
 * release: durable attempt/consensus evidence must be separately reconciled.
 */
import type { PrismaClient, Prisma } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import { FUNDED_MECHA_CANDIDATE_MAX_AGE_MS } from "./warSatchelEligibleOutbox.ts";

export const SATCHEL_AGED_REVIEW_SCAN_LIMIT = 25;

type PendingReviewRow = Readonly<{
  amountUwolo: bigint;
  wagerAuthorization: null | {
    approval: null | { operationId: string };
    broadcast: null | { operationId: string };
  };
}>;

export function summarizeAgedSatchelReviews(rows: readonly PendingReviewRow[], max = SATCHEL_AGED_REVIEW_SCAN_LIMIT) {
  if (!Number.isSafeInteger(max) || max < 1 || max > SATCHEL_AGED_REVIEW_SCAN_LIMIT) {
    throw Error("SATCHEL_AGED_REVIEW_INVALID_BOUND");
  }
  const selected = rows.slice(0, max);
  let noApproval = 0, approvedButUnattempted = 0, inconsistentBroadcastMarker = 0;
  let inspectedReservedUwolo = BigInt(0);
  for (const row of selected) {
    if (row.amountUwolo <= BigInt(0)) throw Error("SATCHEL_AGED_REVIEW_INVALID_LIABILITY");
    inspectedReservedUwolo += row.amountUwolo;
    if (row.wagerAuthorization?.broadcast) inconsistentBroadcastMarker++;
    else if (row.wagerAuthorization?.approval) approvedButUnattempted++;
    else noApproval++;
  }
  return Object.freeze({
    status: "operator_reconciliation_required" as const,
    automaticRefundAuthorized: false as const,
    automaticSubmissionAuthorized: false as const,
    inspected: selected.length,
    moreRows: rows.length > max,
    noApproval,
    approvedButUnattempted,
    inconsistentBroadcastMarker,
    inspectedReservedUwolo: inspectedReservedUwolo.toString(),
    // A bounded sample must never be represented as total vault liabilities.
    financialTotalCertified: false as const,
  });
}

/**
 * Read-only selection contract, share the exact execution clock used by
 * fundedMechaEligibleQuery. A reservation may be created much later than the
 * Watcher execution it represents; reservation.createdAt is NOT the moment
 * at which automatic admission aged out. Otherwise a legitimately aged hold
 * can disappear from both the tick and the operator recovery census.
 *
 * This only reports a bounded liability sample. It never grants a refund,
 * authorizes signing, or proves the funds have not been broadcast.
 */
export function agedSatchelReviewQuery(
  now: Date,
  limit: number = SATCHEL_AGED_REVIEW_SCAN_LIMIT,
) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > SATCHEL_AGED_REVIEW_SCAN_LIMIT) {
    throw Error("SATCHEL_AGED_REVIEW_INVALID_BOUND");
  }
  const cutoff = new Date(now.getTime() - FUNDED_MECHA_CANDIDATE_MAX_AGE_MS);
  return {
    where: {
      status: "reserved",
      execution: { is: {
        status: "funded_reserved",
        attemptCount: 1,
        ticketId: null,
        createdAt: { lt: cutoff },
      } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      amountUwolo: true,
      wagerAuthorization: {
        select: {
          approval: { select: { operationId: true } },
          broadcast: { select: { operationId: true } },
        },
      },
    },
  } satisfies Prisma.SatchelFundedReservationFindManyArgs;
}

/**
 * Called only from authorized operator dry-run after financial bridge has
 * been separately certified. No signer, wallet or chain network I/O.
 * Does not expose wallet addresses, owner identifiers, or operation IDs.
 */
export async function inspectAgedSatchelReviews(
  prisma: PrismaClient,
  options: { now?: Date; limit?: number } = {},
) {
  requireSatchelFinancialBridge();
  const now = options.now ?? new Date();
  const limit = options.limit ?? SATCHEL_AGED_REVIEW_SCAN_LIMIT;
  const query = agedSatchelReviewQuery(now, limit);
  const rows = await prisma.satchelFundedReservation.findMany(query);
  return summarizeAgedSatchelReviews(rows, limit);
}
