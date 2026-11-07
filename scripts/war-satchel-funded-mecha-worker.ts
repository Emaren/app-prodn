/**
 * OFF-BY-DEFAULT bounded HD Mecha funded queue operator entrypoint.
 *
 * No daemon, cron, public endpoint, wallet mnemonic, or automatic activation.
 * Dry-run is default and never signs/mutates a balance. --execute requires
 * a separately deployed, audited, exclusive-key loopback signer service
 * AND all production finance certifications. No bypass option.
 */
import { getPrisma } from "../lib/prisma.ts";
import { executeFundedMechaTicketBatch } from "../lib/warSatchelAutoBetExecutor.ts";
import { connectCertifiedSatchelSigner } from "../lib/warSatchelDedicatedSignerClient.ts";
import { satchelFinancialBridgeReady } from "../lib/warSatchelFinancialBridgeHold.ts";
import { readEligibleFundedMechaIds, FUNDED_MECHA_CANDIDATE_LIMIT } from "../lib/warSatchelEligibleOutbox.ts";
import { inspectAgedSatchelReviews } from "../lib/warSatchelAgedReviewVisibility.ts";

const MAX_BATCH = FUNDED_MECHA_CANDIDATE_LIMIT;

function approved() {
  const keys = [
    "WAR_SATCHEL_FUNDED_LEDGER_ENABLED",
    "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
    "WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED",
    "WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
    "WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED",
    "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED",
    "WAR_SATCHEL_AUTO_CONSENT_ENABLED",
    "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
    "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED",
    "WAR_SATCHEL_SIGNER_OPERATOR_APPROVED",
    "WAR_SATCHEL_SIGNER_CLIENT_ENABLED",
  ];
  return satchelFinancialBridgeReady() &&
    keys.every(key => process.env[key] === "true");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 &&
      args[0] !== "--dry-run" && args[0] !== "--execute")) {
    throw new Error("MECHA_FUNDED_USAGE: --dry-run (default) | --execute");
  }
  const execute = args[0] === "--execute";
  // A set of environment flags cannot override the immutable custody hold.
  // Avoid even opening the financial queue when the bridge is unverified.
  if (!execute && !satchelFinancialBridgeReady()) {
    console.log(JSON.stringify({
      mode: "dry_run", state: "financial_bridge_unverified_hold",
      liveWagersPlaced: 0, chainTransfersSent: 0,
    }));
    return;
  }
  // The actual on-chain queue cannot run until the additional funded ledger
  // migration is GOVERNED and installed. On an older DB do not probe these
  // financial tables or falsely report that they contain zero funds.
  if (execute && !approved()) {
    throw new Error("MECHA_FUNDED_LIVE_FINANCIAL_AUTHORITY_NOT_CERTIFIED");
  }
  const prisma = getPrisma();
  if (!execute && process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED !== "true") {
    console.log(JSON.stringify({
      mode: "dry_run", state: "funded_database_not_enabled",
      liveWagersPlaced: 0, chainTransfersSent: 0,
    }));
    return;
  }
  // Exactly the same bounded candidates as the scheduled tick: four-minute
  // Watcher freshness, per-plan slots, nextAttemptAt and wallet identity.
  const ids = await readEligibleFundedMechaIds(prisma,{limit:MAX_BATCH});
  if (!execute) {
    const aged=await inspectAgedSatchelReviews(prisma);
    console.log(JSON.stringify({
      mode: "dry_run", agedUnattemptedReservations: aged,
      queueEligibleForIndependentRecheck: ids.length,
      exactExecutionIds: ids, liveWagersPlaced: 0,
      chainTransfersSent: 0, vaultConfigured: Boolean(
        process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS),
    }));
    return;
  }
  // The protected HTTP tick and operator CLI MUST use the same exact
  // protocol, build pin, signing role and durable one-shot responses.
  // Do not resurrect the older alternate signer transport / wire schema.
  const signer = await connectCertifiedSatchelSigner();
  const totals = await executeFundedMechaTicketBatch(prisma, signer, ids);
  console.log(JSON.stringify({
    mode: "execute", ...totals,
    liveWagersAccepted: totals.accepted,
    heldForManualReconciliation: totals.unknownHeld,
  }));
  if (totals.unknownHeld !== 0) process.exitCode = 3;
}
main().catch(error => {
  const message = error instanceof Error ? error.message : "MECHA_FUNDED_UNKNOWN";
  // Never dump env, token, signer's HTTP headers or stack to release logs.
  console.error(/^MECHA_FUNDED_|^SATCHEL_/.test(message)
    ? message : "MECHA_FUNDED_OPERATOR_CHECK_FAILED");
  process.exitCode = 2;
});
