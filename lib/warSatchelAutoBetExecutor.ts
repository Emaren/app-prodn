/**
 * HD War Satchel → Mecha → existing BetStakeTicket bridge.
 *
 * Source-only until an INDEPENDENT vault signer service is provisioned.
 * Never use the current payout, bet escrow, treasury, validator, staking or
 * founder keys. No browser credential can satisfy IsolatedSatchelSigner.
 *
 * After the wallet-funded ledger, signed Keplr mandate and exact Watcher
 * session are proven, this submits one fixed transfer to the existing bet
 * escrow rail and commits the existing canonical stake ticket.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import type { WagerViewer } from "./betWagering.ts";
import { prepareBetStakeTicket, commitBetStakeTicket } from "./betStakeTickets.ts";
import { getWoloBetEscrowRuntime } from "./woloChain.ts";
import {
  readIndependentSatchelBank,
  reserveForWatcherExecution,
  markSatchelSubmissionAttempt,
  releaseUnbroadcastSatchelReservation,
  commitVerifiedSatchelAutoTicket,
  quarantineUnknownSatchelWager,
  prepareSatchelWagerReview, loadSatchelWagerReview, recordSatchelWagerBroadcastCandidate,
} from "./warSatchelFundedLedger.ts";
import {
  runFundedMechaTransitionBatch,
  type FundedAutoTicketOutcome,
  type FundedAutoReservedClaim,
  type FundedAutoWorkerCounts,
} from "./betAutomationFundedTransition.ts";

import {authenticateWarSatchelFinancialProof,type AuthenticatedWarSatchelFinancialProof} from "./warSatchelAuthenticatedFinancialProof.ts";
import {wagerFinancialContext} from "./warSatchelWagerAuthorization.ts";
import type { SatchelWagerReservation } from "./warSatchelWagerReservation.ts";

const HASH = /^[A-Fa-f0-9]{64}$/;
const VAULT = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const MAX_BATCH = 25;

/**
 * Port must be implemented in a separate restricted OS process with an
 * attested exclusive vault key, monotonic one-shot request-key protection
 * and independently checked exact escrow destination, amount and memo.
 * A thrown error, HTTP timeout or ambiguous chain status is ALWAYS UNKNOWN.
 */
export type IsolatedSatchelSigner = {
  readonly attestedVaultAddress: string;
  readonly custodyRole: "exclusive-war-satchel-v1";
  /**
   * This call is NEVER retried automatically.
   * The signer itself must permanently fence ticketRequestId before signing.
   */
  submitOneShot(input: Readonly<{
    requestId: string;
    ownerUid: string;
    chainId: "wolo-1";
    senderAddress: string;
    recipientAddress: string;
    denom: "uwolo";
    amountUwolo: string;
    memo: string;
    reservation: SatchelWagerReservation;
  }>): Promise<
    | Readonly<{ kind: "broadcast_accepted"; txHash: string }>
    | Readonly<{ kind: "unknown"; reason: string }>
  >;
};

function enabled(signer: IsolatedSatchelSigner) {
  requireSatchelFinancialBridge();
  const vault = (process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "").trim();
  if (process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED !== "true" ||
      process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED !== "true" ||
      signer.custodyRole !== "exclusive-war-satchel-v1" ||
      !VAULT.test(vault) || signer.attestedVaultAddress !== vault) {
    throw Error("MECHA_FUNDED_EXECUTOR_DISABLED_OR_SIGNER_UNCERTIFIED");
  }
}
function ownerView(user: {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress: string | null;
}): WagerViewer {
  return {
    id: user.id,
    uid: user.uid,
    inGameName: user.inGameName,
    steamPersonaName: user.steamPersonaName,
    walletAddress: user.walletAddress,
  };
}

/**
 * Explicit exact IDs only, no broad cron scan. The canonical watcher's
 * existing shadow outbox is the ONLY candidate authority.
 */
export async function executeFundedMechaTicketBatch(
  prisma: PrismaClient,
  signer: IsolatedSatchelSigner,
  executionIds: readonly number[],
): Promise<FundedAutoWorkerCounts> {
  enabled(signer);
  if (executionIds.length > MAX_BATCH ||
      new Set(executionIds).size !== executionIds.length ||
      executionIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw Error("MECHA_FUNDED_QUEUE_IDS_INVALID");
  }
  const escrow = getWoloBetEscrowRuntime();
  if (!escrow.onchainAllowed || !escrow.escrowAddress ||
      escrow.escrowAddress === signer.attestedVaultAddress) {
    throw Error("MECHA_FUNDED_ESCROW_NOT_CERTIFIED");
  }
  const userById = new Map<number, WagerViewer>();
  const provenByExecution = new Map<number, AuthenticatedWarSatchelFinancialProof>();

  return runFundedMechaTransitionBatch(executionIds, {
    async claimAndReserve(executionId) {
      const execution = await prisma.betAutoExecution.findUnique({
        where: { id: executionId },
        include: { preset: { include: { user: true } } },
      });
      if (!execution || execution.ticketId !== null) return { kind: "already_handled" as const };
      // Resume ONLY an unattempted durable reservation awaiting independent
      // review. UNKNOWN/funded_submitting rows never re-enter a signing path.
      if(execution.status==="funded_reserved" && execution.reservationId && execution.attemptCount===1){
        const prior=await prisma.satchelFundedReservation.findUnique({where:{executionId}});
        if(!prior||prior.status!=="reserved"||prior.ownerUserId!==execution.preset.userId||prior.id!==execution.reservationId)
          return {kind:"already_handled" as const};
        userById.set(executionId,ownerView(execution.preset.user));
        return {kind:"atomically_reserved" as const,executionId,ownerUid:execution.preset.user.uid,
          gameIdentityKey:execution.gameIdentityKey,reservationId:prior.id,ticketRequestId:prior.ticketRequestId,
          reserveUwolo:prior.amountUwolo.toString()};
      }
      if(execution.status !== "shadow_ready"||execution.reservationId!==null||execution.attemptCount!==0)
        return {kind:"already_handled" as const};
      const user = execution.preset.user;
      if (!execution.preset.enabled || !execution.preset.selfOnly ||
          !user.walletAddress ||
          !execution.selectedSide || !["left", "right"].includes(execution.selectedSide) ||
          execution.winnerStakeWolo + execution.desyncStakeWolo <= 0) {
        return { kind: "ineligible" as const };
      }
      // The SQL reserve helper RECHECKS the signed mandate, every market,
      // owner wallet, daily cap, physical vault and immutable Watcher evidence
      // UNDER a global serializable vault lock.
      const bank = await readIndependentSatchelBank();
      let reservation: Awaited<ReturnType<typeof reserveForWatcherExecution>>;
      try {
        reservation = await reserveForWatcherExecution(prisma, {
          ownerUserId: user.id,
          ownerUid: user.uid,
          executionId,
          presetVersion: execution.presetVersion,
          expectedGameIdentityKey: execution.gameIdentityKey,
          expectedPropositionHash: execution.propositionHash,
          selectedSide: execution.selectedSide as "left" | "right",
          reserveUwolo: BigInt(execution.winnerStakeWolo + execution.desyncStakeWolo) * BigInt(1000000),
          bank,
        });
      } catch (error) {
        // An explicit, deterministic gate rejection rolls BACK the entire
        // PostgreSQL reservation transaction. A stale/paused player's plan
        // must not starve every other eligible Watcher game in the queue.
        // All other errors, including ambiguous commit/DB transport, STOP:
        // there may be a durable reservation we have not received.
        if (error instanceof Error &&
            error.message.startsWith("WAR_SATCHEL_FUNDED_REFUSED:")) {
          return { kind: "ineligible" as const };
        }
        throw error;
      }
      if (reservation.status !== "reserved") return { kind: "already_handled" as const };
      userById.set(executionId, ownerView(user));
      return {
        kind: "atomically_reserved" as const,
        executionId,
        ownerUid: user.uid,
        gameIdentityKey: execution.gameIdentityKey,
        reservationId: reservation.reservationId,
        ticketRequestId: "satchel:ticket:" + executionId,
        reserveUwolo: String(BigInt(execution.winnerStakeWolo + execution.desyncStakeWolo) * BigInt(1000000)),
      };
    },
    async submitReservedTicket(claim: FundedAutoReservedClaim): Promise<FundedAutoTicketOutcome> {
      const viewer = userById.get(claim.executionId);
      if (!viewer) return { kind: "unknown_after_broadcast", reason: "missing_viewer_after_claim" };
      const execution = await prisma.betAutoExecution.findUnique({
        where: { id: claim.executionId },
      });
      if (!execution || execution.reservationId !== claim.reservationId ||
          execution.status !== "funded_reserved") {
        return { kind: "unknown_after_broadcast", reason: "reserved_execution_drift" };
      }
      const legs: Array<{ marketId: number; side: "left" | "right"; amountWolo: number }> = [{
        marketId: execution.winnerMarketId,
        side: execution.selectedSide === "right" ? "right" : "left",
        amountWolo: execution.winnerStakeWolo,
      }];
      if (execution.desyncMarketId !== null) {
        legs.push({
          marketId: execution.desyncMarketId,
          side: execution.desyncSide === "yes" ? "right" : "left",
          amountWolo: execution.desyncStakeWolo,
        });
      }
      // Ticket creation is DB-only. No wallet or chain access occurs here.
      // A refusal here permits the ORIGINAL whole reservation to return.
      let ticket: Awaited<ReturnType<typeof prepareBetStakeTicket>>;
      try {
        ticket = await prepareBetStakeTicket(prisma, {
          viewer,
          version: 1,
          clientRequestId: claim.ticketRequestId,
          source: "auto",
          totalAmountWolo: execution.winnerStakeWolo + execution.desyncStakeWolo,
          walletAddress: signer.attestedVaultAddress,
          walletProvider: "satchel-vault",
          walletType: "server-custody",
          routePath: "/mecha/funded-executor",
          legs,
        });
      } catch {
        return { kind: "rejected_before_broadcast", reason: "canonical_ticket_preparation_refused" };
      }
      if (ticket.ticket.status !== "awaiting_signature" ||
          ticket.ticket.source !== "auto" ||
          ticket.ticket.walletAddress !== signer.attestedVaultAddress ||
          ticket.ticket.clientRequestId !== claim.ticketRequestId ||
          ticket.ticket.totalAmountWolo * 1000000 !== Number(claim.reserveUwolo) ||
          ticket.ticket.legs.length !== legs.length) {
        return { kind: "unknown_after_broadcast", reason: "ticket_preparation_conflict" };
      }
      await prepareSatchelWagerReview(prisma,{executionId:claim.executionId,ownerUserId:viewer.id,ticketId:ticket.ticket.id});
      let reviewed:Awaited<ReturnType<typeof loadSatchelWagerReview>>;
      try{reviewed=await loadSatchelWagerReview(prisma,{operationId:claim.ticketRequestId,ownerUserId:viewer.id});}
      catch(error){
        if(error instanceof Error && error.message.startsWith("SATCHEL_WAGER_RESERVATION_REFUSED:"))
          return {kind:"rejected_before_broadcast",reason:"independent_review_invalid_or_expired"};
        throw error;
      }
      if(!reviewed.review)return {kind:"waiting_for_review",reason:"independent_reservation_review_required"};
      // HARD DURABLE FENCE BEFORE signing/network call, including if the
      // signer times out. From here the reserved funds CANNOT be auto-refunded.
      try {
        await markSatchelSubmissionAttempt(prisma, {
          executionId: claim.executionId,
          ownerUserId: viewer.id,
          ticketRequestId: claim.ticketRequestId,
          reservation: reviewed.review,
        });
      } catch (error) {
        // A deterministic refusal raised inside the serializable DB
        // transaction means the attempt fence rolled back and NO signer
        // was called. The initial reserve may be released in FULL.
        // A database timeout, lost COMMIT acknowledgement or unknown
        // exception must remain quarantined, never retried/refunded.
        if (error instanceof Error &&
            error.message.startsWith("WAR_SATCHEL_FUNDED_REFUSED:") &&
            !/already_submitted_or_not_owner|racing_funded_submission/.test(error.message)) {
          return {
            kind: "rejected_before_broadcast",
            reason: "prebroadcast_mandate_or_market_refused",
          };
        }
        return {
          kind: "unknown_after_broadcast",
          reason: "submission_fence_acknowledgement_unknown",
        };
      }
      let txHash: string;
      try {
        const response = await signer.submitOneShot({
          requestId: claim.ticketRequestId,
          ownerUid: viewer.uid,
          chainId: "wolo-1",
          senderAddress: signer.attestedVaultAddress,
          recipientAddress: escrow.escrowAddress!,
          denom: "uwolo",
          amountUwolo: claim.reserveUwolo,
          memo: ticket.ticket.memo,
          reservation: reviewed.review,
        });
        if (response.kind !== "broadcast_accepted" || !HASH.test(response.txHash)) {
          return { kind: "unknown_after_broadcast", reason: "signer_did_not_prove_broadcast" };
        }
        txHash = response.txHash.toUpperCase();
      } catch {
        return { kind: "unknown_after_broadcast", reason: "signer_transport_unknown" };
      }
      let proven:AuthenticatedWarSatchelFinancialProof;
      try{
        await recordSatchelWagerBroadcastCandidate(prisma,{operationId:claim.ticketRequestId,ownerUserId:viewer.id,txHash});
        proven=await authenticateWarSatchelFinancialProof({kind:"wager",ownerUid:viewer.uid,
          operationId:claim.ticketRequestId,txHash,vault:signer.attestedVaultAddress,
          expectedContext:wagerFinancialContext(reviewed.authorization,reviewed.review,txHash),
          requestPath:"/satchel/v1/proofs/operation",requestBody:{operation_id:claim.ticketRequestId}});
      }catch{return {kind:"unknown_after_broadcast",reason:"wager_consensus_proof_unavailable"};}
      try {
        const result = await commitBetStakeTicket(prisma, {
          ticketId: ticket.ticket.id, viewer, stakeTxHash: txHash,
          walletAddress: signer.attestedVaultAddress, satchelFundingProof:proven,
        });
        if (result.ticket.status !== "recorded" ||
            result.ticket.stakeTxHash !== txHash) {
          return { kind: "unknown_after_broadcast", reason: "ticket_chain_commit_not_proven" };
        }
      } catch {
        return { kind: "unknown_after_broadcast", reason: "canonical_ticket_commit_unknown" };
      }
      provenByExecution.set(claim.executionId,proven);
      return { kind: "accepted", ticketId: ticket.ticket.id, fundingTxHash: txHash };
    },
    async commitAccepted(claim, accepted) {
      const viewer = userById.get(claim.executionId);
      if (!viewer) throw Error("MECHA_FUNDED_CLAIM_VIEWER_LOST");
      await commitVerifiedSatchelAutoTicket(prisma, {
        executionId: claim.executionId,
        ownerUserId: viewer.id,
        ticketId: accepted.ticketId,
        fundingTxHash: accepted.fundingTxHash,
        authenticatedWager:provenByExecution.get(claim.executionId),
      });
    },
    async releaseUnbroadcast(claim) {
      const viewer = userById.get(claim.executionId);
      if (!viewer) throw Error("MECHA_FUNDED_CLAIM_VIEWER_LOST");
      await releaseUnbroadcastSatchelReservation(prisma, {
        executionId: claim.executionId, ownerUserId: viewer.id,
        independentlyNoBroadcast: true,
      });
    },
    async holdUnknown(claim, reason) {
      const user = userById.get(claim.executionId);
      if (!user) {
        // The claim has its own ownerUid, but never synthesize numeric IDs:
        // an unverified fallback could hold another player's reservation.
        throw Error("MECHA_FUNDED_UNKNOWN_HOLD_OWNER_NOT_RESOLVED");
      }
      await quarantineUnknownSatchelWager(prisma, {
        executionId: claim.executionId,
        ownerUserId: user.id,
        reservationId: claim.reservationId,
        reason,
      });
    },
  });
}

/** Proof-only recovery of ONE exact attempted operation. No signer connection,
 * new authorization, new ticket preparation, release or broadcast exists here. */
export async function reconcileFundedSatchelWager(prisma:PrismaClient,input:{executionId:number;txHash:string}){
 requireSatchelFinancialBridge();
 if(!Number.isSafeInteger(input.executionId)||input.executionId<1||!HASH.test(input.txHash)||input.txHash==='0'.repeat(64))
  throw Error('MECHA_FUNDED_RECONCILIATION_IDENTITY_INVALID');
 const e=await prisma.betAutoExecution.findUnique({where:{id:input.executionId},include:{preset:{include:{user:true}},satchelFundedReservation:true}});
 if(!e?.satchelFundedReservation||!['unknown_hold','committed'].includes(e.satchelFundedReservation.status)||
   !['funded_submitting','funded_unknown_hold','accepted'].includes(e.status))throw Error('MECHA_FUNDED_RECONCILIATION_NOT_ATTEMPTED');
 const viewer=ownerView(e.preset.user),operationId=e.satchelFundedReservation.ticketRequestId;
 const {authorization:a,review,candidateHash}=await loadSatchelWagerReview(prisma,{operationId,ownerUserId:viewer.id},true);
 const txHash=input.txHash.toUpperCase();
 if(!review||a.snapshot.executionId!==e.id||a.reservationId!==e.satchelFundedReservation.id||
   (candidateHash!==null&&candidateHash!==txHash))throw Error('MECHA_FUNDED_RECONCILIATION_CONTEXT_CONFLICT');
 const proven=await authenticateWarSatchelFinancialProof({kind:'wager',ownerUid:viewer.uid,operationId,txHash,vault:a.snapshot.vault,
   expectedContext:wagerFinancialContext(a,review,txHash),requestPath:'/satchel/v1/proofs/operation',requestBody:{operation_id:operationId}});
 // If ACK was lost, admit its hash only AFTER the real journaled operation's
 // Comet proof authenticates. Never treat an operator-provided hash as payment.
 await recordSatchelWagerBroadcastCandidate(prisma,{operationId,ownerUserId:viewer.id,txHash});
 const ticket=await commitBetStakeTicket(prisma,{ticketId:a.snapshot.ticketId,viewer,stakeTxHash:txHash,
   walletAddress:a.snapshot.vault,satchelFundingProof:proven});
 if(ticket.ticket.status!=='recorded')throw Error('MECHA_FUNDED_RECONCILIATION_TICKET_UNRECORDED');
 return commitVerifiedSatchelAutoTicket(prisma,{executionId:e.id,ownerUserId:viewer.id,ticketId:a.snapshot.ticketId,
   fundingTxHash:txHash,authenticatedWager:proven});
}
