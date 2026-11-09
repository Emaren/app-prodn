/**
 * HD Watcher → queued Mecha funded wagers.
 * This is a bounded private backend tick, NOT an HTTP route, scheduled task,
 * cron, or production money activation by itself.
 *
 * Watcher game admission remains the exact canonical shadow outbox producer.
 * Candidate discovery is advisory; every real stake is rechecked in the
 * serializable vault-wide reservation transaction before signing.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import { executeFundedMechaTicketBatch } from "./warSatchelAutoBetExecutor.ts";
import { connectCertifiedSatchelSigner } from "./warSatchelDedicatedSignerClient.ts";
import { readEligibleFundedMechaIds } from "./warSatchelEligibleOutbox.ts";

function financialReady(){
  requireSatchelFinancialBridge();
  if(process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED!=="true" ||
     process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED!=="true" ||
     process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED!=="true" ||
     process.env.WAR_SATCHEL_WATCHER_TICK_ENABLED!=="true" ||
     process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED!=="true" ||
     process.env.WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED!=="true" ||
     process.env.WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED!=="true" ||
     process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED!=="true" ||
     process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED!=="true"){
    throw Error("MECHA_WATCHER_TICK_NOT_CERTIFIED");
  }
}
export async function runCertifiedWatcherFundedTick(prisma:PrismaClient){
  financialReady();
  // The certified private tick, operator CLI and bounded tick now share
  // the same trusted Watcher market, owner, consent and age filter.
  const ids=await readEligibleFundedMechaIds(prisma);
  if(ids.length===0){
    return Object.freeze({
      examined:0,claimed:0,accepted:0,rejectedBeforeBroadcast:0,
      unknownHeld:0,skipped:0,
    });
  }
  // No signer connection is attempted until there is an eligible
  // Watcher-sourced candidate and ALL certified operator controls pass.
  const signer=await connectCertifiedSatchelSigner();
  return executeFundedMechaTicketBatch(prisma,signer,ids);
}
