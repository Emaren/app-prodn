/**
 * HD Mecha C5 bounded WATCHER → funded execution handoff.
 *
 * The existing watcher admission evaluator is the ONLY source of eligible
 * (self-only, exact roster, verified market) shadow_ready executions.
 * No arbitrary game/event/browser-submitted IDs; no unbounded catch-up.
 *
 * This is a deliberately inert library function until a separately verified
 * isolated signer is injected by the protected OS runner. It is NOT an API
 * route, cron registration, server action or client-exposed webhook.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import {
  executeFundedMechaTicketBatch,
  type IsolatedSatchelSigner,
} from "./warSatchelAutoBetExecutor.ts";
import type { FundedAutoWorkerCounts } from "./betAutomationFundedTransition.ts";

export type FundedMechaWatcherPoll = Readonly<{
  readyIds: readonly number[];
  source: "verified_watcher_shadow_outbox";
  result: FundedAutoWorkerCounts;
}>;

const MAX_BATCH=25;
function guarded(){
  // A collection read is already an operational act. Do not consult the
  // funded queue until source authority has independently been released.
  requireSatchelFinancialBridge();
  if (process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED !== "true" ||
      process.env.WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED !== "true" ||
      process.env.WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED !== "true") {
    throw Error("MECHA_WATCHER_FUNDED_POLL_NOT_CERTIFIED");
  }
}

/**
 * Schedule through the protected OS runner ONLY after signer, credit,
 * escrow payout attribution, refund and withdrawal canaries are certified.
 * Eligible rows are monotonically ordered; concurrently polling workers
 * cannot pay twice because the downstream global-vault serializable reserve
 * and durable execution-id unique key are authoritative.
 */
export async function pollVerifiedWatcherFundedMecha(
  prisma: PrismaClient,
  signer: IsolatedSatchelSigner,
  options: { maxBatch?: number }={},
): Promise<FundedMechaWatcherPoll> {
  guarded();
  const maxBatch=options.maxBatch??MAX_BATCH;
  if(!Number.isSafeInteger(maxBatch)||maxBatch<1||maxBatch>MAX_BATCH)
    throw Error("MECHA_WATCHER_BATCH_OUT_OF_RANGE");
  const ready=await prisma.betAutoExecution.findMany({
    where:{
      status:"shadow_ready",
      ticketId:null,
      reservationId:null,
      attemptCount:0,
      preset:{
        is:{
          enabled:true,
          selfOnly:true,
          user:{is:{walletAddress:{not:null}}},
        },
      },
    },
    orderBy:[{id:"asc"}],
    take:maxBatch,
    select:{id:true},
  });
  const ids=ready.map(item=>item.id);
  if(ids.length===0){
    return Object.freeze({
      readyIds:Object.freeze([]),
      source:"verified_watcher_shadow_outbox" as const,
      result:Object.freeze({
        examined:0,claimed:0,accepted:0,rejectedBeforeBroadcast:0,
        unknownHeld:0,skipped:0,
      }),
    });
  }
  const result=await executeFundedMechaTicketBatch(prisma,signer,ids);
  return Object.freeze({
    readyIds:Object.freeze(ids),
    source:"verified_watcher_shadow_outbox" as const,
    result,
  });
}
