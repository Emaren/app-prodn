/** Operator/server-only future runtime path. Financial source hold is checked
 * before reading a database or proof endpoint; this is not an activation lane. */
import { readFile, open } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute } from "node:path";
import { requireSatchelFinancialBridge } from "../lib/warSatchelFinancialBridgeHold.ts";
import { getPrisma } from "../lib/prisma.ts";
import { reconcileAuthorizedSatchelClaimReturns } from "../lib/warSatchelClaimReturnReconciler.ts";
import { recordReviewedSatchelClaimReturnAuthorization } from "../lib/warSatchelClaimReturnAuthorization.ts";

async function main() {
  const args = process.argv.slice(2);
  const reconcile = args.length === 1 && args[0] === "--apply";
  const importReview = args.length === 2 && args[0] === "--record-review" && isAbsolute(args[1]);
  if (!reconcile && !importReview) throw Error("Use --apply or --record-review /absolute/private/review.json");
  requireSatchelFinancialBridge();
  const prisma = getPrisma();
  try {
    if (reconcile) {
      const report = await reconcileAuthorizedSatchelClaimReturns(prisma);
      console.log(JSON.stringify(report, null, 2));
      if (report.held) process.exitCode = 2;
    } else {
      const file = await open(args[1], constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let review;
      try {
        const before = await file.stat();
        if (!before.isFile() || before.size < 1 || before.size > 65536 || (before.mode & 0o022))
          throw Error("SATCHEL_RETURN_REVIEW_FILE_INVALID");
        const bytes = Buffer.alloc(Number(before.size) + 1);
        const {bytesRead} = await file.read(bytes, 0, bytes.length, 0);
        const after = await file.stat();
        if (bytesRead !== before.size || before.ino !== after.ino || before.dev !== after.dev ||
            before.size !== after.size || before.mtimeMs !== after.mtimeMs)
          throw Error("SATCHEL_RETURN_REVIEW_FILE_CHANGED");
        review = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
      } finally { await file.close(); }
      if (!review || typeof review !== "object" || Array.isArray(review) ||
          Object.keys(review).sort().join(",") !== "approval,claimId,entitlementId,ownerUid,ownerUserId")
        throw Error("SATCHEL_RETURN_REVIEW_FILE_FIELDS_INVALID");
      const result = await recordReviewedSatchelClaimReturnAuthorization(prisma, {
        claimId: review.claimId, ownerUserId: review.ownerUserId, ownerUid: review.ownerUid,
        vault: process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "",
        escrow: process.env.WOLO_BET_ESCROW_ADDRESS || "",
      }, {approval: review.approval, entitlementId: review.entitlementId});
      console.log(JSON.stringify(result, null, 2));
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "SATCHEL_RETURN_WORKER_FAILED");
  process.exitCode = 2;
});
