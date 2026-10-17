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
import { executeFundedMechaTicketBatch } from "./warSatchelAutoBetExecutor.ts";
import { connectCertifiedSatchelSigner } from "./warSatchelDedicatedSignerClient.ts";

const LIMIT=25;
function financialReady(){
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
  const now=new Date();
  // Query only bounded observed games which have an active, owner-signed,
  // time-valid Mecha plan and an existing positive ledger balance.
  const executions=await prisma.betAutoExecution.findMany({
    where:{
      status:"shadow_ready",ticketId:null,reservationId:null,attemptCount:0,
      OR:[{nextAttemptAt:null},{nextAttemptAt:{lte:now}}],
      winnerMarket:{status:"live",integrityStatus:"verified",
        marketType:"winner"},
      preset:{
        enabled:true,selfOnly:true,
        OR:[{untilOut:true},{gamesRemaining:{gt:0}}],
        satchelAutoSpendConsents:{some:{
          signedAt:{not:null},revokedAt:null,spendExpiresAt:{gt:now},
        }},
        user:{satchelFundedBalance:{is:{availableUwolo:{gt:BigInt(0)}}}},
      },
    },
    orderBy:[{createdAt:"asc"},{id:"asc"}],
    take:LIMIT,
    select:{id:true},
  });
  if(executions.length===0){
    return Object.freeze({
      examined:0,claimed:0,accepted:0,rejectedBeforeBroadcast:0,
      unknownHeld:0,skipped:0,
    });
  }
  // No signer connection is attempted until there is an eligible
  // Watcher-sourced candidate and ALL certified operator controls pass.
  const signer=await connectCertifiedSatchelSigner();
  return executeFundedMechaTicketBatch(prisma,signer,executions.map(x=>x.id));
}
