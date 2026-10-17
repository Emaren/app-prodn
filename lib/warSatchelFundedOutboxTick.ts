/**
 * The existing Watcher shadow outbox is the ONLY intake for real Satchel
 * auto-bets. This bounded runner does not discover matches, rescan replays,
 * create markets, retry previously attempted payments or claim whole tables.
 *
 * It is NOT an HTTP route, cron job, autonomous timer or financial flag.
 * Deployment requires an operator-owned, authenticated scheduler with an
 * independently certified one-shot signer and chain recovery service.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { satchelFinancialBridgeReady } from "./warSatchelFinancialBridgeHold.ts";
import { connectCertifiedSatchelSigner } from "./warSatchelDedicatedSignerClient.ts";
import { executeFundedMechaTicketBatch } from "./warSatchelAutoBetExecutor.ts";

const MAX=25;
const MAX_AGE_MS=4*60*1000;
export type FundedMechaIntakeReport=Readonly<{
  state:"disabled"|"empty"|"examined";
  source:"watcher-shadow-outbox";
  selected:number;
  accepted:number;
  heldUnknown:number;
  refusedBeforeBroadcast:number;
  skipped:number;
}>;

function off():FundedMechaIntakeReport{
  return Object.freeze({
    state:"disabled",source:"watcher-shadow-outbox",selected:0,
    accepted:0,heldUnknown:0,refusedBeforeBroadcast:0,skipped:0,
  });
}
/**
 * A single scheduler tick, never a loop until empty. Each outbox row has a
 * database uniqueness constraint per player-preset and game identity.
 * The underlying transaction must recheck exact live market, owner, Keplr
 * mandate version, wallet solvency and all caps under the global vault lock.
 */
export async function runFundedMechaOutboxTick(
  prisma:PrismaClient,
  options?:{limit?:number;now?:Date},
):Promise<FundedMechaIntakeReport>{
  if(!satchelFinancialBridgeReady() ||
     process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED!=="true"||
     process.env.WAR_SATCHEL_AUTO_EXECUTION_TICK_ENABLED!=="true"||
     process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED!=="true"||
     process.env.WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED!=="true"||
     process.env.WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED!=="true"){
    return off();
  }
  const max=options?.limit??MAX;
  const now=options?.now??new Date();
  if(!Number.isSafeInteger(max)||max<1||max>MAX||
     !Number.isFinite(now.getTime()))throw Error("SATCHEL_OUTBOX_TICK_INVALID_BOUND");
  const earliest=new Date(now.getTime()-MAX_AGE_MS);
  // Verify the isolated sidecar's authenticated identity BEFORE selecting
  // work, and never downgrade to a shared Wolo escrow/payout signer.
  const signer=await connectCertifiedSatchelSigner();
  const rows=await prisma.betAutoExecution.findMany({
    where:{
      status:"shadow_ready",
      reservationId:null,ticketId:null,attemptCount:0,
      createdAt:{gte:earliest,lte:now},
      OR:[{nextAttemptAt:null},{nextAttemptAt:{lte:now}}],
      preset:{
        enabled:true,selfOnly:true,
        OR:[{untilOut:true},{gamesRemaining:{gt:0}}],
        user:{walletAddress:{not:null}},
      },
    },
    orderBy:[{createdAt:"asc"},{id:"asc"}],
    take:max,
    select:{id:true},
  });
  if(!rows.length)return Object.freeze({
    state:"empty" as const,source:"watcher-shadow-outbox" as const,
    selected:0,accepted:0,heldUnknown:0,refusedBeforeBroadcast:0,skipped:0,
  });
  const counts=await executeFundedMechaTicketBatch(
    prisma,signer,rows.map(row=>row.id),
  );
  return Object.freeze({
    state:"examined" as const,source:"watcher-shadow-outbox" as const,
    selected:counts.examined,accepted:counts.accepted,
    heldUnknown:counts.unknownHeld,
    refusedBeforeBroadcast:counts.rejectedBeforeBroadcast,
    skipped:counts.skipped,
  });
}
