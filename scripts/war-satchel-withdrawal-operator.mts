/**
 * PRIVATE, OFF-BY-DEFAULT HD withdrawal operator entrypoint.
 *
 * No signing keys, broad retry loop, public route or financial activation.
 * --inspect is read-only and never reaches the signer. --record-review accepts
 * ONLY an independent, externally signed approval in a root-owned 0600 file.
 * --execute invokes the existing exact durable UNKNOWN-fenced one-shot path.
 * The hard source-level Satchel bridge hold remains active throughout review.
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { requireSatchelFinancialBridge, satchelFinancialBridgeReady } from "../lib/warSatchelFinancialBridgeHold.ts";
import { getPrisma } from "../lib/prisma.ts";
import { recordReviewedSatchelWithdrawalApproval } from "../lib/warSatchelFundedLedger.ts";
import { processCertifiedSatchelWithdrawal } from "../lib/warSatchelWithdrawalRuntime.ts";
import type { IndependentWithdrawalApproval } from "../lib/warSatchelWithdrawalReview.ts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_REVIEW = 65536;
const KEY_NAMES = [
  "approval", "withdrawalId",
] as const;

function reject(message: string): never {
  throw Error("SATCHEL_WITHDRAW_OPERATOR_REFUSED:" + message);
}
function protectedOperator() {
  // Explicit source-level hold; no environment flag or CLI can bypass it.
  requireSatchelFinancialBridge();
  if (process.getuid?.() !== 0 ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED !== "true" ||
      process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED !== "true") {
    reject("operator_or_financial_custody_not_certified");
  }
}
async function loadPrivateReview(path: string): Promise<{withdrawalId: string; approval: IndependentWithdrawalApproval}> {
  if (!path.startsWith("/") || path.includes("\0")) reject("absolute_review_path_required");
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const a = await f.stat();
    if (!a.isFile() || a.uid !== 0 || a.gid !== 0 || a.nlink !== 1 ||
        (a.mode & 0o777) !== 0o600 || a.size < 1 || a.size > MAX_REVIEW) {
      reject("private_review_not_root_owned_0600_regular_file");
    }
    const buf = Buffer.alloc(a.size + 1);
    const {bytesRead} = await f.read(buf, 0, buf.length, 0);
    const b = await f.stat();
    if (bytesRead !== a.size || a.ino !== b.ino || a.dev !== b.dev ||
        a.size !== b.size || a.mtimeMs !== b.mtimeMs) {
      reject("review_file_changed_during_read");
    }
    const raw: unknown = JSON.parse(buf.subarray(0, bytesRead).toString("utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) reject("invalid_review");
    const obj = raw as Record<string, unknown>;
    if (Object.keys(obj).sort().join(",") !== [...KEY_NAMES].sort().join(",") ||
        typeof obj.withdrawalId !== "string" || !UUID.test(obj.withdrawalId) ||
        !obj.approval || typeof obj.approval !== "object" || Array.isArray(obj.approval)) {
      reject("invalid_review_fields");
    }
    return {withdrawalId: obj.withdrawalId, approval: obj.approval as IndependentWithdrawalApproval};
  } finally { await f.close(); }
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 2 ||
      !["--inspect", "--record-review", "--execute"].includes(argv[0])) {
    reject("usage: --inspect UUID | --record-review /absolute/root-0600-review.json | --execute UUID");
  }
  const [mode, value] = argv;
  if (mode !== "--record-review" && !UUID.test(value)) reject("invalid_withdrawal_id");
  if (mode === "--inspect" && !satchelFinancialBridgeReady()) {
    console.log(JSON.stringify({mode:"inspect",state:"bridge_unverified_hold",
      noFundsMoved:true,signerInvoked:false,databaseQueried:false}));
    return;
  }
  if (mode !== "--inspect") protectedOperator();
  const prisma = getPrisma();
  try {
    if (mode === "--inspect") {
      if (process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED !== "true") {
        console.log(JSON.stringify({mode:"inspect",state:"funded_schema_not_enabled",
          noFundsMoved:true,signerInvoked:false,databaseQueried:false}));
        return;
      }
      const row = await prisma.satchelFundedWithdrawal.findUnique({
        where:{id:value},select:{id:true,ownerUserId:true,status:true,amountUwolo:true,createdAt:true},
      });
      if (!row) reject("withdrawal_not_found");
      const [attempt, approval] = await Promise.all([
        prisma.satchelWithdrawalAttempt.findUnique({where:{withdrawalId:value},select:{operationId:true}}),
        prisma.satchelWithdrawalApproval.findUnique({where:{withdrawalId:value},select:{withdrawalId:true}}),
      ]);
      console.log(JSON.stringify({mode:"inspect",withdrawalId:row.id,ownerUserId:row.ownerUserId,
        state:row.status,amountUwolo:row.amountUwolo.toString(),reviewed:Boolean(approval),
        attempted:Boolean(attempt),noFundsMoved:true,signerInvoked:false}));
    } else if (mode === "--record-review") {
      if (process.env.WAR_SATCHEL_WITHDRAWAL_REVIEW_IMPORT_ENABLED !== "true") {
        reject("independent_approval_ingress_not_enabled");
      }
      const review = await loadPrivateReview(value);
      const outcome = await recordReviewedSatchelWithdrawalApproval(prisma, review);
      console.log(JSON.stringify({mode:"record_review",withdrawalId:review.withdrawalId,state:outcome.state,
        signerInvoked:false}));
    } else {
      if (process.env.WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY !== "true" ||
          process.env.WAR_SATCHEL_SIGNER_CLIENT_ENABLED !== "true") {
        reject("exclusive_signer_not_ready");
      }
      // Exactly one explicit durable withdrawal; uncertain sends are never retried.
      const outcome = await processCertifiedSatchelWithdrawal(prisma, value);
      console.log(JSON.stringify({mode:"execute",withdrawalId:value,...outcome}));
      if (outcome.state === "unknown_hold") process.exitCode = 3;
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(error => {
  const reason = error instanceof Error ? error.message : "SATCHEL_WITHDRAW_OPERATOR_UNKNOWN";
  console.error(/^SATCHEL_WITHDRAW_OPERATOR_REFUSED:/.test(reason)
    ? reason : "SATCHEL_WITHDRAW_OPERATOR_FAILED_CLOSED");
  process.exitCode = 2;
});
