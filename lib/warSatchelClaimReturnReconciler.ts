/** Controlled server worker. It selects existing immutable signed reviews;
 * no caller-selected owner, tx, amount, approval or destination is accepted. */
import type { PrismaClient } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import { creditVerifiedSatchelClaimReturn } from "./warSatchelFundedLedger.ts";

export async function reconcileAuthorizedSatchelClaimReturns(prisma: PrismaClient, take = 10) {
  requireSatchelFinancialBridge();
  if (process.env.WAR_SATCHEL_CLAIM_RETURN_RECONCILER_ENABLED !== "true")
    throw Error("SATCHEL_RETURN_RECONCILER_NOT_CERTIFIED");
  if (!Number.isSafeInteger(take) || take < 1 || take > 20)
    throw Error("SATCHEL_RETURN_RECONCILER_INVALID_BOUND");
  const rows = await prisma.$queryRaw<Array<{claimId: number; ownerUserId: number; ownerUid: string}>>`
    SELECT a.claim_id AS "claimId", a.owner_user_id AS "ownerUserId", a.owner_uid AS "ownerUid"
    FROM war_satchel_claim_return_authorizations a
    WHERE a.claim_id <> 889 AND NOT EXISTS (
      SELECT 1 FROM war_satchel_funded_claim_returns r WHERE r.claim_id = a.claim_id
    ) ORDER BY a.created_at, a.claim_id LIMIT ${take}
  `;
  const results: Array<{claimId: number; status: string; reason?: string}> = [];
  for (const row of rows) {
    try {
      const posted = await creditVerifiedSatchelClaimReturn(prisma, row);
      results.push({claimId: row.claimId, status: posted.status});
    } catch (error) {
      // A proof outage, stale head, ambiguous aggregate or any disagreement
      // leaves the immutable review pending. It never prepares/resends funds.
      results.push({claimId: row.claimId, status: "held", reason: String(error instanceof Error ? error.message : error).slice(0, 240)});
    }
  }
  return {examined: rows.length, credited: results.filter(r => r.status === "credited").length,
    held: results.filter(r => r.status === "held").length, results};
}
