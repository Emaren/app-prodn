import {BET_MAX_STAKE_UWOLO,AUTO_BET_MAX_DAILY_WOLO,autoBetDailyBudgetAvailable} from "./betMoneyLimits.ts";
import {buildSatchelWagerAuthorization,wagerReviewContext,assertAuthenticatedSatchelWager,assertSatchelWagerTicketLegs,type SatchelWagerSnapshot} from "./warSatchelWagerAuthorization.ts";
import { authenticateWarSatchelBank,authenticatedWarSatchelBankFreshAt,type AuthenticatedWarSatchelBank } from "./warSatchelAuthenticatedBank.ts";
import {verifyIndependentWagerReservation,type SatchelWagerReservation} from "./warSatchelWagerReservation.ts";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import { prebroadcastReleaseEvidenceIssue } from "./warSatchelPrebroadcastReleaseEvidence.ts";
import { satchelReserveDebitIssue } from "./warSatchelReserveDebitEvidence.ts";
import { authenticatedWarSatchelDepositFreshAt, type AuthenticatedWarSatchelDeposit } from "./warSatchelAuthenticatedDeposit.ts";
import { inspectSingleTicketSatchelReturn } from "./warSatchelClaimReturnAttribution.ts";
import { authenticateSatchelClaimReturn, authenticatedWarSatchelClaimReturnFreshAt } from "./warSatchelAuthenticatedClaimReturn.ts";
import { loadDurableSatchelClaimReturnExpectation } from "./warSatchelClaimReturnAuthorization.ts";
import { getWoloBetEscrowRuntime } from "./woloChain.ts";
import { isVerifiedSatchelWithdrawal, type SatchelVerifiedWithdrawal } from "./warSatchelWithdrawalAuthorization.ts";
import { randomUUID } from "node:crypto";
import { satchelFiniteGameSlotAvailable, satchelWatcherSpendWindowIssue } from "./warSatchelWatcherSpendWindow.ts";
import { verifyDurableSatchelAutoSpendMandate } from "./warSatchelAutoSpendConsent.ts";
import { authenticateWarSatchelFinancialProof,financialProofFreshAt,type AuthenticatedWarSatchelFinancialProof } from "./warSatchelAuthenticatedFinancialProof.ts";
import { createHash } from "node:crypto";
import {withdrawalReservationDigest,withdrawalOwnerMandateDigest,verifyIndependentWithdrawalApproval,readWithdrawalReviewerKey,
 type WithdrawalOwnerMandate,type IndependentWithdrawalApproval,type DurableWithdrawalEconomics} from "./warSatchelWithdrawalReview.ts";
import {readWagerReviewerKey} from "./warSatchelWagerReviewerKey.ts";
/**
 * War Satchel C4: database-atomic, source-idempotent financial posting.
 *
 * NO HTTP exports, wallet signers, CLI transactions, or cron entry points.
 * This module remains DISABLED until the independently governed mainnet vault
 * owner, RPC, solvency and mainnet release controller are certified.
 *
 * Entries are segregated from C3a simulation by entirely different tables.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { warSatchelVaultDistinctFromKnownWallets } from "./warSatchelVaultBoundary.ts";
import { resolveCommunityTreasuryAddressConfig } from "./woloCommunityTreasury.ts";

const MAX_I64 = BigInt("9223372036854775807");
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const TX_HASH = /^[A-F0-9]{64}$/;
const FINANCIAL_LOCK_CLASS = 724176;
const FINANCIAL_LOCK_ID = 47;

export type CanonicalSatchelBank = AuthenticatedWarSatchelBank;

function stop(reason: string): never {
  throw new Error("WAR_SATCHEL_FUNDED_REFUSED:" + reason);
}
function positiveAmount(value: bigint) {
  return value > BigInt(0) && value <= MAX_I64;
}
function noFundsUntilCertified() {
  // Cannot be bypassed with environment flags, including operator-attested.
  // Canonical decoded REST tx JSON is not signed committed-chain evidence.
  requireSatchelFinancialBridge();
  if (process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true") {
    stop("operator_financial_activation_not_certified");
  }
}
function fundedVaultAddress(): string {
  const vault = (process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "").trim();
  const excluded = [
    process.env.WOLO_BET_ESCROW_ADDRESS,
    process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS,
    process.env.WOLO_BET_PAYOUT_ADDRESS,
    process.env.WOLO_CHALLENGE_ESCROW_ADDRESS,
    process.env.NEXT_PUBLIC_WOLO_CHALLENGE_ESCROW_ADDRESS,
    process.env.WOLO_STAKING_WALLET_ADDRESS,
    process.env.WOLO_COMMUNITY_TREASURY_ADDRESS,
    resolveCommunityTreasuryAddressConfig().address,
  ];
  if (!ADDRESS.test(vault) || excluded.filter(Boolean).length < 2 ||
      !warSatchelVaultDistinctFromKnownWallets(vault, excluded)) {
    stop("exclusive_vault_not_certified");
  }
  return vault;
}

/**
 * Authenticate physical vault bank state against the operator's protected
 * Comet trust root through the exact pinned offline verifier. Untrusted HTTP
 * evidence cannot mint this capability. The balance does not attest signer
 * control or completeness of external liabilities.
 */
export async function readIndependentSatchelBank(
  reader: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<CanonicalSatchelBank> {
  noFundsUntilCertified();
  const vault = fundedVaultAddress();
  const bank=await authenticateWarSatchelBank(vault,reader);
  requireFreshBank(bank,Math.max(Date.now(),nowMs));
  return bank;
}

async function withExclusiveSatchelTx<T>(
  prisma: PrismaClient,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  noFundsUntilCertified();
  return prisma.$transaction(async tx => {
    // Global vault fence: even unrelated users must not race aggregate
    // physical bank liabilities or create two reservations concurrently.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FINANCIAL_LOCK_CLASS}, ${FINANCIAL_LOCK_ID})`;
    return action(tx);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000,
    timeout: 9000,
  });
}
async function outstandingVaultLiability(tx: Prisma.TransactionClient): Promise<bigint> {
  const aggregate = await tx.satchelFundedBalance.aggregate({
    _sum: { availableUwolo: true, reservedUwolo: true, withdrawalPendingUwolo: true },
  });
  return (aggregate._sum.availableUwolo ?? BigInt(0)) +
    (aggregate._sum.reservedUwolo ?? BigInt(0)) +
    (aggregate._sum.withdrawalPendingUwolo ?? BigInt(0));
}
function requireFreshBank(bank: CanonicalSatchelBank, nowMs: number) {
  if (!authenticatedWarSatchelBankFreshAt(bank,nowMs)||bank.chainId !== "wolo-1" || bank.denom !== "uwolo" ||
      bank.vaultAddress !== fundedVaultAddress() ||
      !positiveAmount(bank.height) || bank.balanceUwolo < BigInt(0) ||
      bank.balanceUwolo > MAX_I64) {
    stop("bank_observation_not_fresh_or_canonical");
  }
}
async function getOrCreateBalance(tx: Prisma.TransactionClient, ownerUserId: number) {
  const found = await tx.satchelFundedBalance.findUnique({ where: { ownerUserId } });
  if (found) return found;
  return tx.satchelFundedBalance.create({ data: { ownerUserId } });
}

async function requirePhysicalConsumption(
  tx: Prisma.TransactionClient, kind: "deposit" | "claim_return",
  receipt: {id: bigint; ownerUserId: number; txHash: string; amountUwolo: bigint; vaultAddress: string},
) {
  const consumed = await tx.satchelPhysicalReceiptConsumption.findUnique({
    where: {chainId_txHash: {chainId: "wolo-1", txHash: receipt.txHash}},
  });
  if (!consumed || consumed.messageIndex !== 0 || consumed.receiptKind !== kind ||
      consumed.sourceReceiptId !== receipt.id || consumed.ownerUserId !== receipt.ownerUserId ||
      consumed.amountUwolo !== receipt.amountUwolo || consumed.vaultAddress !== receipt.vaultAddress)
    stop("database_physical_consumption_missing_or_conflicting");
}

async function committedDepositResult(tx: Prisma.TransactionClient,
  receipt: {id:bigint;ownerUserId:number;txHash:string;amountUwolo:bigint;vaultAddress:string},
): Promise<FundedCreditResult> {
  await requirePhysicalConsumption(tx,"deposit",receipt);
  const journal = await tx.satchelFundedJournal.findUnique({
    where:{sourceKey:"satchel:credit:wolo-1:"+receipt.txHash+":0"},
  });
  const account = await tx.satchelFundedBalance.findUnique({where:{ownerUserId:receipt.ownerUserId}});
  if (!journal || !account || journal.receiptId !== receipt.id ||
      journal.ownerUserId !== receipt.ownerUserId || journal.eventKind !== "deposit_credit" ||
      journal.amountUwolo !== receipt.amountUwolo || journal.deltaAvailableUwolo !== receipt.amountUwolo ||
      journal.deltaReservedUwolo !== BigInt(0) || journal.deltaCommittedUwolo !== BigInt(0) ||
      journal.deltaWithdrawalPendingUwolo !== BigInt(0)) stop("incomplete_recorded_deposit_credit");
  return Object.freeze({status:"already_credited" as const,receiptId:String(receipt.id),availableUwolo:String(account.availableUwolo)});
}

/** Return the committed outcome after a lost response or restart, without RPC
 * or a second credit. Recheck the linked owner and immutable physical receipt.
 */
export async function readRecordedSatchelCredit(prisma: PrismaClient, input: {
  ownerUserId: number; ownerUid: string; intentId: string; txHash: string;
}): Promise<FundedCreditResult | null> {
  return withExclusiveSatchelTx(prisma, async tx => {
    const owners = await tx.$queryRaw<Array<{uid:string; wallet_address:string|null}>>`
      SELECT uid,wallet_address FROM users WHERE id=${input.ownerUserId} FOR UPDATE
    `;
    if (owners.length !== 1 || owners[0].uid !== input.ownerUid || !owners[0].wallet_address)
      stop("authenticated_wallet_binding_mismatch");
    const proof = await tx.warSatchelProofCandidate.findUnique({where:{intentId:input.intentId}});
    if (!proof) return null;
    if (proof.userId !== input.ownerUserId || proof.txHash !== input.txHash ||
        proof.senderAddress !== owners[0].wallet_address || proof.vaultAddress !== fundedVaultAddress())
      stop("canonical_receipt_owner_or_intent_mismatch");
    const receipt = await tx.satchelFundedReceipt.findUnique({where:{proofCandidateId:proof.id}});
    if (!receipt) return null;
    if (receipt.ownerUserId !== input.ownerUserId || receipt.txHash !== input.txHash ||
        receipt.amountUwolo !== proof.amountUwolo || receipt.canonicalHeight !== proof.txHeight)
      stop("recorded_credit_identity_mismatch");
    return committedDepositResult(tx,receipt);
  });
}

export type FundedCreditResult =
  | Readonly<{ status: "credited"; receiptId: string; availableUwolo: string }>
  | Readonly<{ status: "already_credited"; receiptId: string; availableUwolo: string }>;

/**
 * Only the server-side C3d canonical proof recorder may hand us proofCandidateId.
 * Caller MUST revalidate live chain tx and user-wallet/intent binding before
 * calling; this method independently checks persisted record+owner+vault
 * under a single serializable transaction.
 *
 * Critically the bank must have the deposit ON CHAIN and have room for ALL
 * existing user claims PLUS this credit. Crediting a duplicate chain tx or
 * a proof belonging to another Steam account is impossible by unique keys.
 */
export async function creditRecordedSatchelProof(
  prisma: PrismaClient,
  input: {
    ownerUserId: number;
    ownerUid: string;
    proofCandidateId: bigint;
    expectedTxHash: string;
    authenticatedDeposit: AuthenticatedWarSatchelDeposit;
    bank: CanonicalSatchelBank;
  },
): Promise<FundedCreditResult> {
  noFundsUntilCertified();
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0 ||
      !positiveAmount(input.proofCandidateId) ||
      !TX_HASH.test(input.expectedTxHash) ||
      !authenticatedWarSatchelDepositFreshAt(input.authenticatedDeposit) ||
      input.authenticatedDeposit.txHash !== input.expectedTxHash ||
      input.authenticatedDeposit.ownerUid !== input.ownerUid ||
      input.authenticatedDeposit.height <= BigInt(0)) {
    stop("authenticated_comet_deposit_required");
  }

  return withExclusiveSatchelTx(prisma, async tx => {
    const actors = await tx.$queryRaw<Array<{ id: number; uid: string; wallet_address: string | null }>>`
      SELECT id, uid, wallet_address FROM users WHERE id = ${input.ownerUserId} FOR UPDATE
    `;
    if (actors.length !== 1 || actors[0].uid !== input.ownerUid ||
        !actors[0].wallet_address) stop("authenticated_wallet_binding_mismatch");
    // Recheck after waiting for the global lock; an old opaque proof cannot
    // remain spendable across a delayed worker or an expired intent.
    if (!authenticatedWarSatchelDepositFreshAt(input.authenticatedDeposit))
      stop("authenticated_deposit_proof_stale");
    const proof = await tx.warSatchelProofCandidate.findUnique({
      where: { id: input.proofCandidateId },
      include: { intent: true },
    });
    if (proof) await tx.$queryRaw`SELECT id FROM war_satchel_deposit_intents WHERE id=${proof.intentId}::uuid FOR UPDATE`;
    if (!proof || proof.userId !== input.ownerUserId || proof.status !== "uncredited" ||
        proof.chainId !== "wolo-1" || proof.txHash !== input.expectedTxHash ||
        proof.transferIndex !== 0 || proof.vaultAddress !== fundedVaultAddress() ||
        proof.senderAddress !== actors[0].wallet_address || !positiveAmount(proof.amountUwolo) ||
        proof.txHeight <= BigInt(0) ||
        input.authenticatedDeposit.intentId !== proof.intentId ||
        input.authenticatedDeposit.sender !== proof.senderAddress ||
        input.authenticatedDeposit.vault !== proof.vaultAddress ||
        input.authenticatedDeposit.amountUwolo !== proof.amountUwolo.toString() ||
        input.authenticatedDeposit.height !== proof.txHeight ||
        input.authenticatedDeposit.memo !== proof.intent.memo ||
        input.authenticatedDeposit.createdAtUtc !== proof.intent.createdAt.toISOString() ||
        input.authenticatedDeposit.expiresAtUtc !== proof.intent.expiresAt.toISOString() ||
        proof.intent.userId !== input.ownerUserId ||
        proof.intent.senderAddress !== proof.senderAddress ||
        proof.intent.vaultAddress !== proof.vaultAddress ||
        proof.intent.amountUwolo !== proof.amountUwolo ||
        proof.intent.chainId !== "wolo-1") {
      stop("canonical_receipt_owner_or_intent_mismatch");
    }
    const previous = await tx.satchelFundedReceipt.findUnique({
      where: { proofCandidateId: proof.id },
    });
    if (previous) {
      if (previous.ownerUserId !== input.ownerUserId) stop("proof_already_claimed_by_other_owner");
      return committedDepositResult(tx,previous);
    }
    // The same physical MsgSend cannot first credit an escrow claim return
    // and then enter an owner's balance again as a wallet deposit. The two
    // receipt tables have independent unique keys, so enforce this cross-type
    // exclusion under the SAME global financial transaction lock.
    const priorReturn = await tx.satchelFundedClaimReturn.findUnique({
      where: { chainId_txHash_transferIndex: {
        chainId: "wolo-1", txHash: proof.txHash, transferIndex: 0,
      } },
    });
    if (priorReturn) stop("physical_transfer_already_credited_as_claim_return");
    if (Date.now() >= proof.intent.expiresAt.getTime() || proof.intent.status !== "prepared")
      stop("deposit_intent_expired_or_not_prepared");
    requireFreshBank(input.bank, Date.now());
    if (input.bank.height < proof.txHeight + BigInt(2)) stop("deposit_requires_three_confirmations");
    const oldLiability = await outstandingVaultLiability(tx);
    if (oldLiability + proof.amountUwolo > MAX_I64 ||
        oldLiability + proof.amountUwolo > input.bank.balanceUwolo) {
      stop("physical_vault_cannot_cover_credit");
    }
    const account = await getOrCreateBalance(tx, input.ownerUserId);
    if (account.availableUwolo + proof.amountUwolo > MAX_I64) stop("owner_balance_overflow");

    // Row/aggregate waits consume the original authenticated head window too.
    // Recheck after those waits, immediately before creating a new receipt.
    requireFreshBank(input.bank, Date.now());
    if (!authenticatedWarSatchelDepositFreshAt(input.authenticatedDeposit))
      stop("authenticated_deposit_proof_stale");

    const receipt = await tx.satchelFundedReceipt.create({
      data: {
        ownerUserId: input.ownerUserId,
        proofCandidateId: proof.id,
        chainId: "wolo-1",
        txHash: proof.txHash,
        transferIndex: 0,
        amountUwolo: proof.amountUwolo,
        canonicalHeight: proof.txHeight,
        vaultAddress: proof.vaultAddress,
      },
    });
    await requirePhysicalConsumption(tx,"deposit",receipt);
    const journalKey = "satchel:credit:wolo-1:" + proof.txHash + ":0";
    await tx.satchelFundedJournal.create({
      data: {
        ownerUserId: input.ownerUserId, sourceKey: journalKey,
        eventKind: "deposit_credit", amountUwolo: proof.amountUwolo,
        deltaAvailableUwolo: proof.amountUwolo,
        deltaReservedUwolo: BigInt(0),
        deltaCommittedUwolo: BigInt(0),
        deltaWithdrawalPendingUwolo: BigInt(0),
        receiptId: receipt.id,
      },
    });
    const updated = await tx.satchelFundedBalance.update({
      where: { ownerUserId: input.ownerUserId },
      data: {
        availableUwolo: { increment: proof.amountUwolo },
        version: { increment: BigInt(1) },
        updatedAt: new Date(),
      },
    });
    // Trigger/unique-index and balance writes may also wait. Throwing here
    // rolls back every new receipt, consumption, journal and balance change.
    requireFreshBank(input.bank, Date.now());
    if (!authenticatedWarSatchelDepositFreshAt(input.authenticatedDeposit))
      stop("authenticated_deposit_proof_stale");
    return Object.freeze({
      status: "credited" as const,
      receiptId: receipt.id.toString(),
      availableUwolo: updated.availableUwolo.toString(),
    });
  });
}

/**
 * Atomic reserve under trusted signed-budget and exact-Watcher admission.
 * Does NOT call a wallet or place a wager. The funded ticket adapter must
 * separately implement escrow send with a durable idempotency key.
 */
export async function reserveForWatcherExecution(
  prisma: PrismaClient,
  input: {
    ownerUserId: number;
    ownerUid: string;
    executionId: number;
    presetVersion: number;
    expectedGameIdentityKey: string;
    expectedPropositionHash: string;
    selectedSide: "left" | "right";
    reserveUwolo: bigint;
    bank: CanonicalSatchelBank;
  },
): Promise<{ status: "reserved" | "already_reserved_do_not_resubmit" | "already_processed_do_not_resubmit"; reservationId: string }> {
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0 ||
      !Number.isSafeInteger(input.executionId) || input.executionId <= 0 ||
      !Number.isSafeInteger(input.presetVersion) || input.presetVersion <= 0 ||
      !positiveAmount(input.reserveUwolo) ||
      input.reserveUwolo > BET_MAX_STAKE_UWOLO ||
      input.reserveUwolo % BigInt(1000000) !== BigInt(0)) stop("unverified_spending_consent_or_reserve");
  return withExclusiveSatchelTx(prisma, async tx => {
    const found = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (found) {
      if (found.ownerUserId !== input.ownerUserId || found.amountUwolo !== input.reserveUwolo) {
        stop("duplicate_execution_not_same_owner_or_amount");
      }
      return {
        status: found.status === "reserved"
          ? "already_reserved_do_not_resubmit" as const
          : "already_processed_do_not_resubmit" as const,
        reservationId: found.id,
      };
    }
    const exec = await tx.betAutoExecution.findUnique({
      where: { id: input.executionId },
      include: { preset: { include: { user: true } } },
    });
    if (!exec || exec.preset.userId !== input.ownerUserId ||
        exec.preset.user.uid !== input.ownerUid ||
        !exec.preset.enabled || !exec.preset.selfOnly ||
        exec.preset.version !== input.presetVersion ||
        exec.presetVersion !== input.presetVersion ||
        exec.status !== "shadow_ready" || exec.ticketId !== null ||
        exec.reservationId !== null || exec.attemptCount !== 0 ||
        exec.gameIdentityKey !== input.expectedGameIdentityKey ||
        exec.propositionHash !== input.expectedPropositionHash ||
        exec.selectedSide !== input.selectedSide ||
        BigInt(exec.winnerStakeWolo + exec.desyncStakeWolo) * BigInt(1000000) !== input.reserveUwolo) {
      stop("watcher_execution_or_consent_changed");
    }
    // A saved profile toggle or caller-supplied Boolean is NOT owner spend
    // consent. Re-read immutable Keplr ADR-36 signed plan at the instant of
    // serializable reservation. Pausing, editing or revoking immediately stops
    // new reserve claims, including racing Watcher workers.
    const mandate = await tx.satchelAutoSpendConsent.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        ownerUid: input.ownerUid,
        walletAddress: exec.preset.user.walletAddress || "",
        presetId: exec.presetId, presetVersion: exec.presetVersion,
        signedAt: { not: null }, revokedAt: null,
        spendExpiresAt: { gt: new Date() },
      },
      orderBy: { signedAt: "desc" },
      include: { originalMandate: true },
    });
    if (!mandate ||
        mandate.winnerStakeWolo !== exec.winnerStakeWolo ||
        mandate.desyncSide !== exec.desyncSide ||
        mandate.desyncStakeWolo !== exec.desyncStakeWolo ||
        mandate.perGameCapWolo < exec.winnerStakeWolo + exec.desyncStakeWolo ||
        mandate.dailyCapWolo > AUTO_BET_MAX_DAILY_WOLO ||
        mandate.signedAt === null) {
      stop("keplr_signed_spending_mandate_missing_or_stale");
    }
    try { verifyDurableSatchelAutoSpendMandate({ consent: mandate, originalMandate: mandate.originalMandate,
      ownerUid: input.ownerUid, ownerWallet: exec.preset.user.walletAddress || "",
      presetId: exec.presetId, presetVersion: exec.presetVersion,
      untilOut: exec.preset.untilOut, gamesRemaining: exec.preset.gamesRemaining, now: new Date() });
    } catch { stop("original_keplr_spending_signature_missing_or_invalid"); }
    // A finite plan's last game can have several simultaneous Watcher rows.
    // Keep each unresolved send/reserve in its own slot until commit decrements
    // gamesRemaining or a proven no-broadcast release frees it. UNKNOWN never
    // creates room for a replacement game. This read shares the vault lock.
    const unresolvedReservations = await tx.satchelFundedReservation.count({
      where: { status: { in: ["reserved", "unknown_hold"] },
        execution: { presetId: exec.presetId, presetVersion: exec.presetVersion } },
    });
    if (!satchelFiniteGameSlotAvailable({ untilOut: exec.preset.untilOut,
      gamesRemaining: exec.preset.gamesRemaining, unresolvedReservations })) {
      stop("finite_plan_exhausted_or_all_game_slots_reserved");
    }
    const evidence = exec.sourceEvidence && typeof exec.sourceEvidence === "object" &&
      !Array.isArray(exec.sourceEvidence)
        ? exec.sourceEvidence as Record<string, unknown>
        : {};
    if (evidence.mode !== "shadow" ||
        evidence.exactSteamRosterMatch !== true ||
        evidence.exactUploaderUidMatch !== true ||
        evidence.marketIntegrityStatus !== "verified" ||
        evidence.ownerUid !== input.ownerUid ||
        evidence.propositionHash !== exec.propositionHash ||
        evidence.canonicalSessionKey !== exec.gameIdentityKey) {
      stop("watcher_identity_evidence_not_attested");
    }
    const market = await tx.betMarket.findUnique({
      where: { id: exec.winnerMarketId },
      select: {
        id: true, status: true, marketType: true, bookPhase: true,
        integrityStatus: true, propositionHash: true,
        scheduledMatchId: true, linkedSessionKey: true, createdAt: true,
        closeAt: true, phaseOpensAt: true, phaseClosesAt: true,
        winnerSide: true, settledAt: true, voidedAt: true, refundStatus: true,
        settlementExecutedAt: true, linkedGameStatsId: true, lateFinalGameStatsId: true,
      },
    });
    if (!market || market.bookPhase === "preview_only" ||
        market.status !== "live" || market.marketType !== "winner" ||
        market.integrityStatus !== "verified" ||
        market.propositionHash !== exec.propositionHash) {
      stop("canonical_watcher_market_not_live");
    }
    const windowIssue = satchelWatcherSpendWindowIssue({ market,
      executionCreatedAt: exec.createdAt, signedAt: mandate.signedAt, now: new Date() });
    if (windowIssue) stop(windowIssue);
    if (exec.desyncMarketId !== null) {
      const desync = await tx.betMarket.findUnique({
        where: { id: exec.desyncMarketId },
        select: { status: true, marketType: true, parentMarketId: true, bookPhase: true,
          propositionHash: true, integrityStatus: true,
          scheduledMatchId: true, linkedSessionKey: true, createdAt: true,
          closeAt: true, phaseOpensAt: true, phaseClosesAt: true,
          winnerSide: true, settledAt: true, voidedAt: true, refundStatus: true,
          settlementExecutedAt: true, linkedGameStatsId: true, lateFinalGameStatsId: true },
      });
      if (!desync || desync.bookPhase === "preview_only" ||
          desync.status !== "live" || desync.marketType !== "desync" || desync.parentMarketId !== market.id ||
          desync.propositionHash !== market.propositionHash ||
          desync.integrityStatus !== "verified") {
        stop("desync_wager_market_no_longer_consistent");
      }
      const desyncIssue = satchelWatcherSpendWindowIssue({ market: desync,
        executionCreatedAt: exec.createdAt, signedAt: mandate.signedAt, now: new Date() });
      if (desyncIssue) stop(desyncIssue);
    }
    // A protected daily cap must be checked independently of the UI plan;
    // count the day's RESERVATION attempts, even if subsequently returned,
    // to bound runaway Watcher activity after reconnects/crashes.
    const todayUtc = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const daily = await tx.satchelFundedJournal.aggregate({
      where: {
        ownerUserId: input.ownerUserId, eventKind: "wager_reserve",
        createdAt: { gte: todayUtc },
      },
      _sum: { amountUwolo: true },
    });
    const dailySpent = daily._sum.amountUwolo ?? BigInt(0);
    if (!autoBetDailyBudgetAvailable(dailySpent, input.reserveUwolo, mandate.dailyCapWolo)) {
      stop("daily_watcher_wager_cap_exhausted");
    }

    requireFreshBank(input.bank, Date.now());
    const liabilities = await outstandingVaultLiability(tx);
    if (input.bank.balanceUwolo < liabilities) stop("vault_underfunded_before_reserve");

    const existing = await tx.satchelFundedBalance.findUnique({
      where: { ownerUserId: input.ownerUserId },
    });
    if (!existing || existing.availableUwolo < input.reserveUwolo) stop("insufficient_owner_available");
    const reservationId = "satchel:reserve:" + exec.id;
    const requestId = "satchel:ticket:" + exec.id;
    requireFreshBank(input.bank, Date.now());
    await tx.satchelFundedReservation.create({
      data: {
        id: reservationId, ownerUserId: input.ownerUserId,
        executionId: exec.id, amountUwolo: input.reserveUwolo,
        ticketRequestId: requestId, status: "reserved",
      },
    });
    await tx.satchelFundedJournal.create({
      data: {
        ownerUserId: input.ownerUserId,
        sourceKey: reservationId, eventKind: "wager_reserve",
        amountUwolo: input.reserveUwolo,
        deltaAvailableUwolo: -input.reserveUwolo,
        deltaReservedUwolo: input.reserveUwolo,
        deltaCommittedUwolo: BigInt(0),
        deltaWithdrawalPendingUwolo: BigInt(0),
        executionId: exec.id,
      },
    });
    await tx.satchelFundedBalance.update({
      where: { ownerUserId: input.ownerUserId },
      data: {
        availableUwolo: { decrement: input.reserveUwolo },
        reservedUwolo: { increment: input.reserveUwolo },
        version: { increment: BigInt(1) }, updatedAt: new Date(),
      },
    });
    await tx.betAutoExecution.update({
      where: { id: exec.id },
      data: { reservationId, status: "funded_reserved", attemptCount: 1 },
    });
    requireFreshBank(input.bank, Date.now());
    return { status: "reserved" as const, reservationId };
  });
}

/** Reject or cancel *only before broadcast*. Full amount returned, NO fee. */
export async function releaseUnbroadcastSatchelReservation(
  prisma: PrismaClient,
  input: { executionId: number; ownerUserId: number; independentlyNoBroadcast: boolean },
) {
  if (!input.independentlyNoBroadcast) stop("cannot_refund_unknown_broadcast");
  // Only reserve-only identities may be released. The *first possible*
  // broadcast must durably change status before any network call. Once
  // attempted, the source cannot be treated as prebroadcast merely because
  // an HTTP response was lost.
  return withExclusiveSatchelTx(prisma, async tx => {
    const reservation = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (!reservation || reservation.ownerUserId !== input.ownerUserId) stop("reservation_owner_missing");
    if (reservation.status === "released") return { status: "already_released" as const };
    if (reservation.status !== "reserved") stop("reservation_inflight_or_committed");
    // A caller-provided no-broadcast Boolean is NOT independent proof of
    // safety. Reconcile the actual durable execution, reservation, signed
    // authorization and canonical ticket within the shared vault lock.
    // Any contradictory persisted send evidence must quarantine the funds.
    const execution = await tx.betAutoExecution.findUnique({
      where: { id: reservation.executionId },
      select: { reservationId: true, ticketId: true, status: true, attemptCount: true },
    });
    const authority = await tx.satchelWagerAuthorization.findUnique({
      where: { operationId: reservation.ticketRequestId },
      include: { broadcast: true },
    });
    const ticket = await tx.betStakeTicket.findUnique({
      where: { userId_clientRequestId: {
        userId: input.ownerUserId, clientRequestId: reservation.ticketRequestId,
      } },
      select: { status: true, stakeTxHash: true, broadcastSubmittedAt: true },
    });
    const reserveJournal = await tx.satchelFundedJournal.findUnique({
      where: { sourceKey: reservation.id },
    });
    const issue = prebroadcastReleaseEvidenceIssue({
      reservation, ownerUserId: input.ownerUserId, execution, authority,
      ticket, reserveJournal,
    });
    if (issue) stop(issue);
    const account = await tx.satchelFundedBalance.findUnique({
      where: { ownerUserId: input.ownerUserId },
    });
    if (!account || account.reservedUwolo < reservation.amountUwolo ||
        account.availableUwolo + reservation.amountUwolo > MAX_I64) stop("reserve_liability_inconsistent");
    await tx.satchelFundedJournal.create({
      data: {
        ownerUserId: input.ownerUserId,
        sourceKey: "satchel:refund:" + reservation.id,
        eventKind: "wager_refund", amountUwolo: reservation.amountUwolo,
        deltaAvailableUwolo: reservation.amountUwolo,
        deltaReservedUwolo: -reservation.amountUwolo,
        deltaCommittedUwolo: BigInt(0),
        deltaWithdrawalPendingUwolo: BigInt(0),
        executionId: reservation.executionId,
      },
    });
    await tx.satchelFundedBalance.update({
      where: { ownerUserId: input.ownerUserId },
      data: {
        availableUwolo: { increment: reservation.amountUwolo },
        reservedUwolo: { decrement: reservation.amountUwolo },
        version: { increment: BigInt(1) }, updatedAt: new Date(),
      },
    });
    await tx.satchelFundedReservation.update({
      where: { id: reservation.id },
      data: { status: "released", updatedAt: new Date() },
    });
    await tx.betAutoExecution.update({
      where: { id: reservation.executionId },
      data: { status: "funded_rejected", reason: "no_broadcast_full_refund" },
    });
    return { status: "released_in_full" as const, returnedUwolo: reservation.amountUwolo.toString() };
  });
}

/**
 * MUST be committed before the first external WOLO signing/broadcast attempt.
 * A process crash after this transition leaves assets reserved in UNKNOWN,
 * never eligible for immediate refund or a second send.
 */
export async function markSatchelSubmissionAttempt(
  prisma: PrismaClient,
  input: { executionId: number; ownerUserId: number; ticketRequestId: string; reservation: SatchelWagerReservation },
) {
  const reviewKey = await readWagerReviewerKey();
  return withExclusiveSatchelTx(prisma, async tx => {
    const reservation = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (!reservation || reservation.ownerUserId !== input.ownerUserId ||
        reservation.ticketRequestId !== input.ticketRequestId ||
        reservation.status !== "reserved") {
      stop("already_submitted_or_not_owner");
    }
    const authorization = await tx.satchelWagerAuthorization.findUnique({where:{operationId:input.ticketRequestId},include:{approval:true}});
    if(!authorization?.approval || authorization.reservationId!==reservation.id || authorization.ownerUserId!==input.ownerUserId)
      stop("independent_wager_review_missing_before_attempt");
    const a=decodeWagerAuthorization(authorization);
    // Recheck source-of-funds inside this same exclusive transaction
    // IMMEDIATELY before first broadcast authorization. The persisted review
    // cannot substitute for the original debit; a missing/misowned/changed
    // source journal must never reach signer.submitOneShot.
    const reserveJournal=await tx.satchelFundedJournal.findUnique({where:{sourceKey:reservation.id}});
    if(satchelReserveDebitIssue(reservation,reserveJournal) ||
       !reserveJournal || reserveJournal.id.toString()!==a.snapshot.journalId)
      stop("original_reservation_debit_changed_before_attempt");
    const grant=verifyIndependentWagerReservation(authorization.approval.approvalJson,wagerReviewContext(a,input.reservation),reviewKey,Date.now());
    const reviewedTicket=await tx.betStakeTicket.findUnique({where:{id:a.snapshot.ticketId},include:{legs:true}});
    if(!reviewedTicket || reviewedTicket.userId!==input.ownerUserId || reviewedTicket.clientRequestId!==input.ticketRequestId ||
      reviewedTicket.walletAddress!==a.snapshot.vault || reviewedTicket.status!=="awaiting_signature" || reviewedTicket.stakeTxHash!==null)
      stop("reviewed_ticket_changed_before_attempt");
    try{assertSatchelWagerTicketLegs(a,reviewedTicket.legs);}catch{stop("reviewed_ticket_legs_changed_before_attempt");}

    if(grant.signature!==input.reservation.signature)stop("wager_review_changed_before_attempt");
    // A Watcher reservation can sit between creation and first broadcast.
    // Revalidate the CURRENT linked Keplr wallet, enabled preset, signed
    // spending mandate and live proposition while still holding the same
    // global financial lock. A revoked plan must never start a NEW send.
    const execution = await tx.betAutoExecution.findUnique({
      where: { id: input.executionId },
      include: { preset: { include: { user: true } } },
    });
    if (!execution || execution.reservationId !== reservation.id ||
        execution.preset.userId !== input.ownerUserId ||
        execution.gameIdentityKey!==a.snapshot.gameIdentityKey || execution.propositionHash!==a.snapshot.propositionHash ||
        execution.presetId!==a.snapshot.presetId || execution.presetVersion!==a.snapshot.presetVersion ||
        execution.status !== "funded_reserved" ||
        !execution.preset.enabled || !execution.preset.selfOnly ||
        execution.preset.version !== execution.presetVersion ||
        !execution.preset.user.walletAddress ||
        BigInt(execution.winnerStakeWolo + execution.desyncStakeWolo) *
          BigInt(1000000) !== reservation.amountUwolo) {
      stop("execution_changed_before_first_broadcast");
    }
    const now = new Date();
    const permit = await tx.satchelAutoSpendConsent.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        ownerUid: execution.preset.user.uid,
        walletAddress: execution.preset.user.walletAddress,
        presetId: execution.presetId,
        presetVersion: execution.presetVersion,
        signedAt: { not: null }, revokedAt: null, spendExpiresAt: { gt: now },
      },
      orderBy: { signedAt: "desc" },
      include: { originalMandate: true },
    });
    if (!permit || permit.winnerStakeWolo !== execution.winnerStakeWolo ||
        permit.desyncStakeWolo !== execution.desyncStakeWolo ||
        permit.desyncSide !== execution.desyncSide ||
        permit.perGameCapWolo < execution.winnerStakeWolo + execution.desyncStakeWolo) {
      stop("keplr_auto_spending_mandate_revoked_before_broadcast");
    }
    try { verifyDurableSatchelAutoSpendMandate({ consent: permit, originalMandate: permit.originalMandate,
      ownerUid: execution.preset.user.uid, ownerWallet: execution.preset.user.walletAddress,
      presetId: execution.presetId, presetVersion: execution.presetVersion,
      untilOut: execution.preset.untilOut, gamesRemaining: execution.preset.gamesRemaining, now });
    } catch { stop("original_keplr_spending_signature_missing_or_invalid"); }
    if(permit.id!==a.snapshot.consentId || permit.originalMandate?.challengeText!==a.snapshot.challengeText)stop("wager_review_consent_changed_before_attempt");
    const market = await tx.betMarket.findUnique({
      where: { id: execution.winnerMarketId },
      select: { status: true, integrityStatus: true, propositionHash: true,
        marketType: true, bookPhase: true, scheduledMatchId: true, linkedSessionKey: true, createdAt: true,
        closeAt: true, phaseOpensAt: true, phaseClosesAt: true,
        winnerSide: true, settledAt: true, voidedAt: true, refundStatus: true,
        settlementExecutedAt: true, linkedGameStatsId: true, lateFinalGameStatsId: true },
    });
    if (!market || market.bookPhase === "preview_only" || market.status !== "live" ||
        market.integrityStatus !== "verified" ||
        market.propositionHash !== execution.propositionHash) {
      stop("watcher_proposition_not_live_before_broadcast");
    }
    const windowIssue = satchelWatcherSpendWindowIssue({ market,
      executionCreatedAt: execution.createdAt, signedAt: permit.signedAt!, now });
    if (windowIssue) stop(windowIssue);
    if (execution.desyncMarketId !== null) {
      const desync = await tx.betMarket.findUnique({ where: { id: execution.desyncMarketId } });
      if (!desync || desync.bookPhase === "preview_only" ||
          desync.parentMarketId !== execution.winnerMarketId ||
          desync.propositionHash !== execution.propositionHash || desync.integrityStatus !== "verified") {
        stop("desync_wager_market_no_longer_consistent");
      }
      const desyncIssue = satchelWatcherSpendWindowIssue({ market: desync,
        executionCreatedAt: execution.createdAt, signedAt: permit.signedAt!, now });
      if (desyncIssue) stop(desyncIssue);
    }
    const changed = await tx.satchelFundedReservation.updateMany({
      where: { id: reservation.id, status: "reserved" },
      data: { status: "unknown_hold", updatedAt: new Date() },
    });
    if (changed.count !== 1) stop("racing_funded_submission");
    await tx.betAutoExecution.updateMany({
      where: { id: input.executionId, reservationId: reservation.id },
      data: { status: "funded_submitting" },
    });
    return Object.freeze({ status: "submission_attempt_durably_fenced" as const });
  });
}

/**
 * Commit ONLY after the existing canonical BetStakeTicket verifier has
 * persisted an accepted auto ticket in the DB, based on a proven vault→bet
 * escrow transfer. The committed bucket is historical SPENT amount and is not
 * part of physical War Satchel bank liabilities anymore.
 *
 * Deliberately do not pretend that a chain send is complete just because a
 * signing endpoint returned HTTP 200.
 */
export async function commitVerifiedSatchelAutoTicket(
  prisma: PrismaClient,
  input: {
    executionId: number;
    ownerUserId: number;
    ticketId: number;
    fundingTxHash: string;
    authenticatedWager?: AuthenticatedWarSatchelFinancialProof;
  },
): Promise<{ status: "committed" | "already_committed"; ticketId: number }> {
  if (!Number.isSafeInteger(input.executionId) || input.executionId <= 0 ||
      !Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0 ||
      !Number.isSafeInteger(input.ticketId) || input.ticketId <= 0 ||
      !TX_HASH.test(input.fundingTxHash)) stop("invalid_ticket_proof");
  return withExclusiveSatchelTx(prisma, async tx => {
    const reservation = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (!reservation || reservation.ownerUserId !== input.ownerUserId) stop("not_reserved_for_owner");
    const authorization=await tx.satchelWagerAuthorization.findUnique({where:{operationId:reservation.ticketRequestId},include:{approval:true,broadcast:true}});
    if(!authorization?.approval || authorization.broadcast?.txHash!==input.fundingTxHash)stop("wager_commit_without_authenticated_attempt");
    const a=decodeWagerAuthorization(authorization);
    if(a.snapshot.ticketId!==input.ticketId || a.ownerUserId!==input.ownerUserId)stop("wager_commit_context_changed");
    assertAuthenticatedSatchelWager(input.authenticatedWager,a,authorization.approval.approvalJson as unknown as SatchelWagerReservation,input.fundingTxHash);
    if (reservation.status === "committed") {
      if (reservation.ticketId !== input.ticketId ||
          reservation.txHash !== input.fundingTxHash) stop("conflicting_committed_ticket");
      return { status: "already_committed" as const, ticketId: input.ticketId };
    }
    if (reservation.status !== "unknown_hold") stop("not_durably_marked_as_submitted");

    const [ticket, execution, account] = await Promise.all([
      tx.betStakeTicket.findUnique({
        where: { id: input.ticketId },
        include: { legs: true },
      }),
      tx.betAutoExecution.findUnique({
        where: { id: input.executionId },
        include: { preset: true },
      }),
      tx.satchelFundedBalance.findUnique({
        where: { ownerUserId: input.ownerUserId },
      }),
    ]);
    if (!ticket || !execution || !account ||
        ticket.userId !== input.ownerUserId || ticket.source !== "auto" ||
        ticket.status !== "recorded" ||
        ticket.walletAddress !== fundedVaultAddress() ||
        ticket.stakeTxHash?.toUpperCase() !== input.fundingTxHash ||
        execution.id !== reservation.executionId ||
        execution.preset.userId !== input.ownerUserId ||
        execution.reservationId !== reservation.id ||
        account.reservedUwolo < reservation.amountUwolo ||
        BigInt(ticket.totalAmountWolo) * BigInt(1000000) !== reservation.amountUwolo ||
        ticket.legs.length < 1 ||
        ticket.legs.some(leg => !Number.isSafeInteger(leg.amountWolo) || leg.amountWolo <= 0)) {
      stop("ticket_not_canonical_or_balance_inconsistent");
    }
    await tx.satchelFundedJournal.create({
      data: {
        ownerUserId: input.ownerUserId,
        sourceKey: "satchel:commit:" + reservation.id,
        eventKind: "wager_commit", amountUwolo: reservation.amountUwolo,
        deltaAvailableUwolo: BigInt(0),
        deltaReservedUwolo: -reservation.amountUwolo,
        deltaCommittedUwolo: reservation.amountUwolo,
        deltaWithdrawalPendingUwolo: BigInt(0),
        executionId: reservation.executionId,
      },
    });
    if (account.committedUwolo + reservation.amountUwolo > MAX_I64) {
      stop("cumulative_historical_spend_overflow");
    }
    await tx.satchelFundedBalance.update({
      where: { ownerUserId: input.ownerUserId },
      data: {
        reservedUwolo: { decrement: reservation.amountUwolo },
        committedUwolo: { increment: reservation.amountUwolo },
        version: { increment: BigInt(1) }, updatedAt: new Date(),
      },
    });
    await tx.satchelFundedReservation.update({
      where: { id: reservation.id },
      data: {
        status: "committed", ticketId: input.ticketId,
        txHash: input.fundingTxHash, updatedAt: new Date(),
      },
    });
    await tx.betAutoExecution.update({
      where: { id: execution.id },
      data: {
        status: "accepted", ticketId: input.ticketId, acceptedAt: new Date(),
      },
    });
    // A plan may have been paused/edited during the chain send. Never skip
    // recording the proven spend for that reason. Decrement only if the same
    // finite plan version still exists; otherwise surface via the durable
    // ticket/execution audit without fabricating another plan.
    if (!execution.preset.untilOut &&
        execution.preset.version === execution.presetVersion &&
        (execution.preset.gamesRemaining ?? 0) > 0) {
      await tx.betAutoPreset.updateMany({
        where: { id: execution.presetId, version: execution.presetVersion, gamesRemaining: { gt: 0 } },
        data: { gamesRemaining: { decrement: 1 } },
      });
    }
    assertAuthenticatedSatchelWager(input.authenticatedWager,a,authorization.approval.approvalJson as unknown as SatchelWagerReservation,input.fundingTxHash);
    return { status: "committed" as const, ticketId: input.ticketId };
  });
}

/**
 * Funded withdrawal liability transitions (no wallet signing here).
 * Only a future owner-authenticated, fresh Keplr withdrawal-mandate endpoint
 * may call reserveOwnerSatchelWithdrawal. This module itself is NOT a route.
 */
function withdrawalGate() {
  noFundsUntilCertified();
  if (process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED !== "true" ||
      process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED !== "true") {
    stop("withdrawal_or_exclusive_signer_not_certified");
  }
}

/**
 * Reserve exactly one owner-requested withdrawal before any external signing.
 * The credited Satchel ledger, not a Keplr wallet extension balance, pays it.
 * Economic payee is frozen to the user's independently linked Keplr wallet.
 *
 * The caller must have already verified a FRESH wallet-signed withdrawal
 * challenge bound to the exact amount and request ID; no HTTP route can reach
 * this function until that proof is implemented and certified.
 */
export async function reserveOwnerSatchelWithdrawal(
  prisma: PrismaClient,
  input: {
    ownerUserId: number; ownerUid: string;
    ownerKeplrWallet: string;
    amountUwolo: bigint;
    verifiedWithdrawalSignature: SatchelVerifiedWithdrawal;
    bank: CanonicalSatchelBank;
  },
) {
  withdrawalGate();
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId < 1 ||
      !ADDRESS.test(input.ownerKeplrWallet) ||
      !positiveAmount(input.amountUwolo) ||
      input.amountUwolo > BigInt(50000)*BigInt(1000000)) stop("invalid_withdrawal_request");
  const signed = input.verifiedWithdrawalSignature;
  if (!isVerifiedSatchelWithdrawal(signed) ||
      signed.ownerUid !== input.ownerUid ||
      signed.walletAddress !== input.ownerKeplrWallet ||
      signed.amountUwolo !== input.amountUwolo.toString() ||
      !Number.isFinite(signed.verifiedAtMs) ||
      signed.verifiedAtMs > Date.now() ||
      Date.now()-signed.verifiedAtMs > 5*60*1000) {
    stop("fresh_keplr_withdrawal_signature_required");
  }
  return withExclusiveSatchelTx(prisma, async tx => {
    const locked=await tx.$queryRaw<Array<{id:number;uid:string;wallet_address:string|null}>>`
      SELECT id,uid,wallet_address FROM users WHERE id=${input.ownerUserId} FOR UPDATE
    `;
    if (locked.length!==1 || locked[0].uid!==input.ownerUid ||
        locked[0].wallet_address!==input.ownerKeplrWallet) stop("withdrawal_owner_wallet_changed");
    const challenge=await tx.satchelWithdrawalChallenge.findUnique({
      where:{id:signed.challengeId},
    });
    const now=new Date();
    if(!challenge || challenge.ownerUserId!==input.ownerUserId ||
       challenge.ownerUid!==input.ownerUid ||
       challenge.walletAddress!==input.ownerKeplrWallet ||
       challenge.amountUwolo!==input.amountUwolo ||
       challenge.consumedAt!==null ||
       challenge.issuedAt.getTime()>signed.verifiedAtMs ||
       challenge.expiresAt<=now)stop("signed_withdrawal_challenge_consumed_or_changed");
    const account=await tx.satchelFundedBalance.findUnique({
      where:{ownerUserId:input.ownerUserId},
    });
    if (!account || account.availableUwolo<input.amountUwolo) stop("owner_withdrawal_overdrawn");
    requireFreshBank(input.bank,Date.now());
    const outstanding=await outstandingVaultLiability(tx);
    if (outstanding>input.bank.balanceUwolo) stop("withdrawal_vault_insolvent");
    requireFreshBank(input.bank,Date.now());
    const consumed=await tx.satchelWithdrawalChallenge.updateMany({
      where:{id:challenge.id,consumedAt:null,expiresAt:{gt:now}},
      data:{consumedAt:now},
    });
    if(consumed.count!==1)stop("withdrawal_nonce_replayed");
    const id=randomUUID();
    await tx.satchelFundedWithdrawal.create({
      data:{
        id, ownerUserId:input.ownerUserId,
        ownerWalletAddress:input.ownerKeplrWallet,
        authorizingChallengeId:challenge.id,
        amountUwolo:input.amountUwolo, status:"reserved",
      },
    });
    const economics={withdrawalId:id,ownerUserId:input.ownerUserId,ownerUid:input.ownerUid,
      wallet:input.ownerKeplrWallet,vault:fundedVaultAddress(),amountUwolo:input.amountUwolo.toString(),
      memo:"aoe2war/satchel/withdraw/v1/"+id,ownerMandate:signed.ownerMandate};
    await tx.satchelWithdrawalAuthorization.create({data:{
      withdrawalId:id,ownerUserId:input.ownerUserId,ownerUid:input.ownerUid,
      walletAddress:input.ownerKeplrWallet,vaultAddress:economics.vault,amountUwolo:input.amountUwolo,
      challengeId:challenge.id,ownerMandateJson:signed.ownerMandate as Prisma.InputJsonValue,
      ownerMandateDigest:withdrawalOwnerMandateDigest(signed.ownerMandate),
      reservationDigest:withdrawalReservationDigest(economics),memo:economics.memo,
    }});
    await tx.satchelFundedJournal.create({
      data:{
        ownerUserId:input.ownerUserId,sourceKey:"satchel:withdraw:reserve:"+id,
        eventKind:"withdraw_reserve",amountUwolo:input.amountUwolo,
        deltaAvailableUwolo:-input.amountUwolo,
        deltaReservedUwolo:BigInt(0),
        deltaCommittedUwolo:BigInt(0),
        deltaWithdrawalPendingUwolo:input.amountUwolo,
      },
    });
    await tx.satchelFundedBalance.update({
      where:{ownerUserId:input.ownerUserId},
      data:{
        availableUwolo:{decrement:input.amountUwolo},
        withdrawalPendingUwolo:{increment:input.amountUwolo},
        version:{increment:BigInt(1)},updatedAt:new Date(),
      },
    });
    requireFreshBank(input.bank,Date.now());
    return Object.freeze({
      state:"reserved" as const,withdrawalId:id,
      sendTo:input.ownerKeplrWallet,
      amountUwolo:input.amountUwolo.toString(),
      memo:"aoe2war/satchel/withdraw/v1/"+id,
    });
  });
}

/** A signer must durably fence the request before any possible network send.
 * Even a crash or timeout after this transition is NOT safe to resend.
 */
function withdrawalEconomics(a:{withdrawalId:string;ownerUserId:number;ownerUid:string;walletAddress:string;vaultAddress:string;amountUwolo:bigint;memo:string;reservationDigest:string;ownerMandateJson:unknown}):DurableWithdrawalEconomics{
  return {withdrawalId:a.withdrawalId,ownerUserId:a.ownerUserId,ownerUid:a.ownerUid,wallet:a.walletAddress,
    vault:a.vaultAddress,amountUwolo:a.amountUwolo.toString(),memo:a.memo,reservationDigest:a.reservationDigest,
    ownerMandate:a.ownerMandateJson as WithdrawalOwnerMandate};
}
/** Trusted reviewer ingress ONLY: signature supplied by a separate approval
 * authority after inspecting this durable reservation. Never a browser route. */
export async function recordReviewedSatchelWithdrawalApproval(prisma:PrismaClient,input:{withdrawalId:string;approval:IndependentWithdrawalApproval}){
  withdrawalGate();const reviewer=await readWithdrawalReviewerKey();
  return withExclusiveSatchelTx(prisma,async tx=>{
    const withdrawal=await tx.satchelFundedWithdrawal.findUnique({where:{id:input.withdrawalId}});
    const authorization=await tx.satchelWithdrawalAuthorization.findUnique({where:{withdrawalId:input.withdrawalId}});
    if(!withdrawal||!authorization||withdrawal.status!=="reserved"||
      await tx.satchelWithdrawalRevocation.findUnique({where:{withdrawalId:input.withdrawalId}}))stop("withdrawal_not_reviewable");
    const reserve=await tx.satchelFundedJournal.findUnique({where:{sourceKey:"satchel:withdraw:reserve:"+input.withdrawalId}});
    if(!reserve||reserve.amountUwolo!==authorization.amountUwolo||reserve.ownerUserId!==authorization.ownerUserId||
      reserve.deltaAvailableUwolo!==-authorization.amountUwolo||reserve.deltaWithdrawalPendingUwolo!==authorization.amountUwolo)
      stop("withdrawal_durable_hold_missing");
    verifyIndependentWithdrawalApproval(input.approval,withdrawalEconomics(authorization),reviewer,Date.now());
    const digest=createHash("sha256").update(JSON.stringify(input.approval)).digest("hex");
    const existing=await tx.satchelWithdrawalApproval.findUnique({where:{withdrawalId:input.withdrawalId}});
    if(existing){if(existing.approvalDigest!==digest)stop("withdrawal_approval_changed");return {state:"already_reviewed" as const};}
    await tx.satchelWithdrawalApproval.create({data:{withdrawalId:input.withdrawalId,
      approvalJson:input.approval as Prisma.InputJsonValue,approvalDigest:digest}});
    return {state:"reviewed" as const};
  });
}

/** Atomic pre-dispatch fence. A cancellation and this operation use the same
 * vault transaction lock. UNKNOWN is never automatically dispatched again. */
export async function markSatchelWithdrawalAttempt(
  prisma:PrismaClient,input:{withdrawalId:string;ownerUserId:number},
){
  withdrawalGate();const reviewer=await readWithdrawalReviewerKey();
  const bank=await readIndependentSatchelBank();
  return withExclusiveSatchelTx(prisma,async tx=>{
    const found=await tx.satchelFundedWithdrawal.findUnique({where:{id:input.withdrawalId}});
    const authorization=await tx.satchelWithdrawalAuthorization.findUnique({where:{withdrawalId:input.withdrawalId}});
    const reviewed=await tx.satchelWithdrawalApproval.findUnique({where:{withdrawalId:input.withdrawalId}});
    if(!found||found.ownerUserId!==input.ownerUserId||found.status!=="reserved"||!authorization||!reviewed)
      stop("already_attempted_or_unreviewed_withdrawal_never_resubmit");
    const actors=await tx.$queryRaw<Array<{uid:string;wallet_address:string|null}>>`
      SELECT uid,wallet_address FROM users WHERE id=${input.ownerUserId} FOR UPDATE`;
    if(actors.length!==1||actors[0].uid!==authorization.ownerUid||actors[0].wallet_address!==authorization.walletAddress||
       await tx.satchelWithdrawalRevocation.findUnique({where:{withdrawalId:found.id}}))stop("withdrawal_revoked_or_owner_changed");
    const economics=withdrawalEconomics(authorization),approval=reviewed.approvalJson as IndependentWithdrawalApproval;
    if(economics.vault!==fundedVaultAddress()||found.amountUwolo!==authorization.amountUwolo||
      found.ownerWalletAddress!==authorization.walletAddress)stop("withdrawal_authorization_identity_changed");
    verifyIndependentWithdrawalApproval(approval,economics,reviewer,Date.now());
    requireFreshBank(bank,Date.now());
    const account=await tx.satchelFundedBalance.findUnique({where:{ownerUserId:input.ownerUserId}});
    if(!account||account.withdrawalPendingUwolo<found.amountUwolo||await outstandingVaultLiability(tx)>bank.balanceUwolo)
      stop("withdrawal_liability_or_vault_not_backed");
    const operationId="satchel:withdrawal:"+found.id;
    const request={protocol:1,operation_id:operationId,chain_id:"wolo-1",from_address:economics.vault,
      to_address:economics.wallet,amount:{denom:"uwolo",amount:economics.amountUwolo},memo:economics.memo,
      owner_id:economics.ownerUid,approval,owner_mandate:economics.ownerMandate};
    requireFreshBank(bank,Date.now());
    await tx.satchelWithdrawalAttempt.create({data:{operationId,withdrawalId:found.id,
      requestJson:request as Prisma.InputJsonValue,requestDigest:createHash("sha256").update(JSON.stringify(request)).digest("hex")}});
    const changed=await tx.satchelFundedWithdrawal.updateMany({where:{id:found.id,status:"reserved"},
      data:{status:"unknown_hold",updatedAt:new Date()}});
    if(changed.count!==1)stop("withdrawal_attempt_race");
    requireFreshBank(bank,Date.now());
    return Object.freeze({state:"broadcast_uncertainty_locked" as const,operationId,request:Object.freeze(request)});
  });
}

/**
 * Cancel only a 100% PROVEN non-broadcast request. Once attempted, no
 * cancellation can release the same money while a chain send is in flight.
 */
export async function cancelUnbroadcastSatchelWithdrawal(
  prisma: PrismaClient,
  input:{withdrawalId:string;ownerUserId:number;independentlyNoBroadcast:boolean},
) {
  withdrawalGate();
  if(!input.independentlyNoBroadcast)stop("cannot_cancel_ambiguous_payout");
  return withExclusiveSatchelTx(prisma,async tx=>{
    const found=await tx.satchelFundedWithdrawal.findUnique({
      where:{id:input.withdrawalId},
    });
    if(!found||found.ownerUserId!==input.ownerUserId)stop("withdrawal_not_owner");
    if(found.status==="cancelled")return Object.freeze({state:"already_cancelled" as const});
    if(found.status!=="reserved")stop("withdrawal_already_attempted_no_refund");
    const account=await tx.satchelFundedBalance.findUnique({
      where:{ownerUserId:input.ownerUserId},
    });
    if(!account || account.withdrawalPendingUwolo<found.amountUwolo ||
       account.availableUwolo+found.amountUwolo>MAX_I64)stop("withdrawal_liability_invalid");
    await tx.satchelFundedJournal.create({
      data:{
        ownerUserId:input.ownerUserId,
        sourceKey:"satchel:withdraw:cancel:"+found.id,
        eventKind:"withdraw_cancel",amountUwolo:found.amountUwolo,
        deltaAvailableUwolo:found.amountUwolo,
        deltaReservedUwolo:BigInt(0),deltaCommittedUwolo:BigInt(0),
        deltaWithdrawalPendingUwolo:-found.amountUwolo,
      },
    });
    await tx.satchelFundedBalance.update({
      where:{ownerUserId:input.ownerUserId},
      data:{
        availableUwolo:{increment:found.amountUwolo},
        withdrawalPendingUwolo:{decrement:found.amountUwolo},
        version:{increment:BigInt(1)},updatedAt:new Date(),
      },
    });
    const authorization=await tx.satchelWithdrawalAuthorization.findUnique({where:{withdrawalId:found.id}});
    if(authorization)await tx.satchelWithdrawalRevocation.create({data:{withdrawalId:found.id,ownerUserId:input.ownerUserId}});
    await tx.satchelFundedWithdrawal.update({
      where:{id:found.id},data:{status:"cancelled",updatedAt:new Date()},
    });
    return Object.freeze({state:"fully_cancelled" as const,returnedUwolo:found.amountUwolo.toString()});
  });
}

/**
 * Never finalize based on the signer reply alone. Pull canonical evidence
 * independently from the Wolo mainnet RPC + REST and prove the exact
 * immutable owner, memo, amount and 3 confirmations. There is no public
 * payout-completion API, and no path to mark an unknown hash as "sent"
 * without matching chain evidence.
 */
export async function finalizeProvenSatchelWithdrawal(prisma:PrismaClient,input:{withdrawalId:string;ownerUserId:number;txHash:string}){
  withdrawalGate();if(!TX_HASH.test(input.txHash))stop("invalid_withdrawal_tx_hash");
  const withdrawal=await prisma.satchelFundedWithdrawal.findUnique({where:{id:input.withdrawalId}});
  const authorization=await prisma.satchelWithdrawalAuthorization.findUnique({where:{withdrawalId:input.withdrawalId}});
  const attempt=await prisma.satchelWithdrawalAttempt.findUnique({where:{withdrawalId:input.withdrawalId}});
  const reviewed=await prisma.satchelWithdrawalApproval.findUnique({where:{withdrawalId:input.withdrawalId}});
  if(!withdrawal||withdrawal.ownerUserId!==input.ownerUserId||!["unknown_hold","sent"].includes(withdrawal.status)||
    !authorization||!attempt||!reviewed)stop("withdrawal_not_durably_inflight");
  const observed=await prisma.satchelWithdrawalObservation.findMany({where:{operationId:attempt.operationId,txHash:{not:null}},select:{txHash:true}});
  if(!observed.length||observed.some(x=>x.txHash!==input.txHash))stop("withdrawal_hash_missing_or_conflicting");
  const economics=withdrawalEconomics(authorization);
  const expectedContext={protocol:1,kind:"withdrawal",owner_id:economics.ownerUid,operation_id:attempt.operationId,
    sender:economics.vault,recipient:economics.wallet,amount_uwolo:economics.amountUwolo,memo:economics.memo,
    tx_hash:input.txHash,withdrawal_approval:reviewed.approvalJson,owner_mandate:authorization.ownerMandateJson};
  const proven=await authenticateWarSatchelFinancialProof({kind:"withdrawal",ownerUid:economics.ownerUid,
    operationId:attempt.operationId,txHash:input.txHash,vault:economics.vault,expectedContext,
    requestPath:"/satchel/v1/proofs/operation",requestBody:{operation_id:attempt.operationId}});
  const bank=await readIndependentSatchelBank();
  if(bank.height<proven.height)stop("bank_snapshot_precedes_withdrawal_proof");
  return withExclusiveSatchelTx(prisma,async tx=>{
    if(!financialProofFreshAt(proven))stop("withdrawal_authenticated_head_expired");
    const fresh=await tx.satchelFundedWithdrawal.findUnique({where:{id:withdrawal.id}});
    if(!fresh||fresh.ownerUserId!==input.ownerUserId||fresh.ownerWalletAddress!==economics.wallet||fresh.amountUwolo!==authorization.amountUwolo)
      stop("withdrawal_identity_changed");
    const physical=await tx.satchelWithdrawalPhysicalConsumption.findUnique({where:{chainId_txHash:{chainId:"wolo-1",txHash:proven.txHash}}});
    const journal=await tx.satchelFundedJournal.findUnique({where:{sourceKey:"satchel:withdraw:sent:"+fresh.id}});
    if(fresh.status==="sent"){
      if(fresh.txHash!==proven.txHash||fresh.confirmedHeight!==proven.height||!physical||physical.withdrawalId!==fresh.id||
        physical.ownerUserId!==input.ownerUserId||physical.amountUwolo!==fresh.amountUwolo||physical.vaultAddress!==economics.vault||
        !journal||journal.deltaWithdrawalPendingUwolo!==-fresh.amountUwolo)stop("withdrawal_incomplete_recorded_success");
      return Object.freeze({state:"already_sent" as const,txHash:proven.txHash});
    }
    if(fresh.status!=="unknown_hold"||physical||journal)stop("withdrawal_conflicting_finality_proof");
    const account=await tx.satchelFundedBalance.findUnique({where:{ownerUserId:input.ownerUserId}});
    if(!account||account.withdrawalPendingUwolo<fresh.amountUwolo)stop("withdrawal_not_liability_backed");
    requireFreshBank(bank,Date.now());const liabilities=await outstandingVaultLiability(tx);
    if(liabilities<fresh.amountUwolo||bank.balanceUwolo<liabilities-fresh.amountUwolo)stop("post_withdrawal_vault_insolvent");
    requireFreshBank(bank,Date.now());
    await tx.satchelWithdrawalPhysicalConsumption.create({data:{chainId:"wolo-1",txHash:proven.txHash,messageIndex:0,
      withdrawalId:fresh.id,ownerUserId:input.ownerUserId,amountUwolo:fresh.amountUwolo,vaultAddress:economics.vault}});
    await tx.satchelFundedJournal.create({data:{ownerUserId:input.ownerUserId,sourceKey:"satchel:withdraw:sent:"+fresh.id,
      eventKind:"withdraw_sent",amountUwolo:fresh.amountUwolo,deltaAvailableUwolo:BigInt(0),deltaReservedUwolo:BigInt(0),
      deltaCommittedUwolo:BigInt(0),deltaWithdrawalPendingUwolo:-fresh.amountUwolo}});
    await tx.satchelFundedBalance.update({where:{ownerUserId:input.ownerUserId},data:{
      withdrawalPendingUwolo:{decrement:fresh.amountUwolo},version:{increment:BigInt(1)},updatedAt:new Date()}});
    await tx.satchelFundedWithdrawal.update({where:{id:fresh.id},data:{status:"sent",txHash:proven.txHash,confirmedHeight:proven.height,updatedAt:new Date()}});
    if(!financialProofFreshAt(proven))stop("withdrawal_authenticated_head_expired");
    requireFreshBank(bank,Date.now());
    return Object.freeze({state:"sent" as const,txHash:proven.txHash});
  });
}

/**
 * Persist an UNKNOWN hold even if failure occurs between the atomic reserve
 * and the initial attempt fence. Never assume that a thrown network or DB
 * error proves "not broadcast." This is a durable no-retry financial quarantine
 * visible on the existing execution record. Never changes a terminal ticket.
 */
export async function quarantineUnknownSatchelWager(
  prisma: PrismaClient,
  input: {
    executionId: number;
    ownerUserId: number;
    reservationId: string;
    reason: string;
  },
): Promise<"held" | "already_held" | "already_terminal"> {
  if (!Number.isSafeInteger(input.executionId) || input.executionId <= 0 ||
      !Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0 ||
      !/^satchel:reserve:[1-9][0-9]{0,14}$/.test(input.reservationId) ||
      !/^[a-z0-9_]{1,100}$/.test(input.reason)) {
    stop("bad_unknown_hold_identity");
  }
  return withExclusiveSatchelTx(prisma, async tx => {
    const reservation = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (!reservation || reservation.id !== input.reservationId ||
        reservation.ownerUserId !== input.ownerUserId) {
      stop("unknown_hold_owner_or_execution_mismatch");
    }
    if (reservation.status === "committed" || reservation.status === "released") {
      return "already_terminal" as const;
    }
    const initial = reservation.status === "reserved";
    if (initial) {
      const modified = await tx.satchelFundedReservation.updateMany({
        where: { id: reservation.id, status: "reserved" },
        data: { status: "unknown_hold", updatedAt: new Date() },
      });
      if (modified.count !== 1) stop("unknown_hold_transition_race");
    } else if (reservation.status !== "unknown_hold") {
      stop("unsupported_unknown_reservation_state");
    }
    await tx.betAutoExecution.updateMany({
      where: { id: input.executionId, reservationId: reservation.id },
      data: { status: "funded_unknown_hold", reason: input.reason },
    });
    return initial ? "held" as const : "already_held" as const;
  });
}

async function committedClaimReturnResult(tx:Prisma.TransactionClient,
  receipt:{id:bigint;claimId:number;ownerUserId:number;txHash:string;amountUwolo:bigint;vaultAddress:string},
) {
  await requirePhysicalConsumption(tx,"claim_return",receipt);
  const journal=await tx.satchelFundedJournal.findUnique({where:{sourceKey:"satchel:return:claim:"+receipt.claimId}});
  const account=await tx.satchelFundedBalance.findUnique({where:{ownerUserId:receipt.ownerUserId}});
  if(!journal||!account||journal.claimReturnId!==receipt.id||journal.ownerUserId!==receipt.ownerUserId||
     journal.eventKind!=="claim_return_credit"||journal.amountUwolo!==receipt.amountUwolo||
     journal.deltaAvailableUwolo!==receipt.amountUwolo||journal.deltaReservedUwolo!==BigInt(0)||
     journal.deltaCommittedUwolo!==BigInt(0)||journal.deltaWithdrawalPendingUwolo!==BigInt(0))
    stop("incomplete_recorded_claim_return_credit");
  return Object.freeze({status:"already_credited" as const,returnId:String(receipt.id),availableUwolo:String(account.availableUwolo)});
}

/**
 * Apply a physically received escrow payout/complete unmatched refund to the
 * ORIGINAL Steam owner's spendable War Satchel. No token is transmitted here.
 * The settled claim and its canonical 3-confirmation bank send are verified
 * independently; all ledger and receipt writes occur under one global lock.
 *
 * This is NOT a public API and remains off until the unique escrow→vault
 * payout path has its own protected production certification.
 */
export async function creditVerifiedSatchelClaimReturn(
  prisma: PrismaClient,
  input: {claimId:number;ownerUserId:number;ownerUid:string},
) {
  noFundsUntilCertified();
  if(process.env.WAR_SATCHEL_CLAIM_RETURN_CREDIT_ENABLED!=="true" ||
     process.env.WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED!=="true" ||
     process.env.WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED!=="true")
    stop("claim_return_credit_not_certified");
  if(!Number.isSafeInteger(input.claimId)||input.claimId<1||input.claimId===889||
     !Number.isSafeInteger(input.ownerUserId)||input.ownerUserId<1)
    stop("invalid_claim_return_identity");
  const vault=fundedVaultAddress();
  const escrow=getWoloBetEscrowRuntime();
  if(!escrow.onchainAllowed || !escrow.escrowAddress ||
      escrow.escrowAddress===vault)stop("escrow_sender_not_attested");

  // The client does not supply any chain data, bank amount, payout recipient,
  // transaction hash, or owner. Everything is sourced independently.
  const claim=await prisma.pendingWoloClaim.findUnique({where:{id:input.claimId}});
  if(!claim||claim.status!=="claimed"||claim.claimedByUserId!==input.ownerUserId||
     (claim.claimKind!=="bet_payout"&&claim.claimKind!=="bet_refund")||
     !claim.sourceMarketId||!claim.payoutTxHash||
     !Number.isSafeInteger(claim.amountWolo)||claim.amountWolo<=0)
    stop("claim_not_final_owner_bound_or_wager_kind");
  // Prisma's nullable claim market FK is not narrowed across async
  // financial transaction closures; snapshot a proven immutable integer.
  const sourceMarketId=claim.sourceMarketId;
  if(sourceMarketId===null)stop("missing_claim_market_identity");
  const txHash=claim.payoutTxHash.toUpperCase();
  const durableOwner={claimId:input.claimId,ownerUserId:input.ownerUserId,ownerUid:input.ownerUid,vault,escrow:escrow.escrowAddress};
  // Recover only a complete committed credit after restart; no new proof or
  // ledger mutation is required for this exact immutable receipt+journal.
  const recorded=await withExclusiveSatchelTx(prisma,async tx=>{
    await loadDurableSatchelClaimReturnExpectation(tx,durableOwner);
    const prior=await tx.satchelFundedClaimReturn.findUnique({where:{claimId:input.claimId}});
    if(!prior)return null;
    if(prior.ownerUserId!==input.ownerUserId || prior.txHash!==txHash ||
       prior.amountUwolo!==BigInt(claim.amountWolo)*BigInt(1000000) || prior.vaultAddress!==vault)
      stop("claim_return_already_owned_or_conflicting");
    return committedClaimReturnResult(tx,prior);
  });
  if(recorded)return recorded;
  const durable=await loadDurableSatchelClaimReturnExpectation(prisma,durableOwner);
  const proof=await authenticateSatchelClaimReturn(durable.expected);
  if(!authenticatedWarSatchelClaimReturnFreshAt(proof))stop("authenticated_comet_return_required");
  const bank=await readIndependentSatchelBank();
  if(bank.height<proof.canonicalHeight+BigInt(2))
    stop("bank_does_not_cover_canonical_return_height");
  return withExclusiveSatchelTx(prisma,async tx=>{
    if(!authenticatedWarSatchelClaimReturnFreshAt(proof))stop("authenticated_comet_return_expired_under_lock");
    const reloaded=await loadDurableSatchelClaimReturnExpectation(tx,durableOwner);
    if(reloaded.contextFingerprint!==durable.contextFingerprint ||
       proof.expected.contextFingerprint!==reloaded.contextFingerprint ||
       proof.txHash!==reloaded.expected.txHash)
      stop("claim_return_durable_context_changed");
    const owner=await tx.$queryRaw<Array<{id:number;uid:string}>>`
      SELECT id,uid FROM users WHERE id=${input.ownerUserId} FOR UPDATE
    `;
    if(owner.length!==1||owner[0].uid!==input.ownerUid)
      stop("claim_return_owner_identity_changed");
    const current=await tx.pendingWoloClaim.findUnique({where:{id:input.claimId}});
    if(!current||current.claimedByUserId!==input.ownerUserId||
       current.sourceMarketId!==sourceMarketId||
       current.status!=="claimed"||current.claimKind!==claim.claimKind||
       current.amountWolo!==claim.amountWolo||
       current.payoutTxHash?.toUpperCase()!==proof.txHash)
      stop("claim_changed_since_chain_verification");
    const prior=await tx.satchelFundedClaimReturn.findUnique({
      where:{claimId:claim.id},
    });
    if(prior){
      if(prior.ownerUserId!==input.ownerUserId||prior.txHash!==proof.txHash ||
         prior.amountUwolo!==proof.amountUwolo || prior.vaultAddress!==vault)
        stop("claim_return_already_owned_or_conflicting");
      return committedClaimReturnResult(tx,prior);
    }
    const wagers=await tx.betWager.findMany({
      where:{
        marketId:sourceMarketId,
        userId:input.ownerUserId,
        status:claim.claimKind==="bet_refund"?"void":"won",
      },
      select:{
        id:true,amountWolo:true,payoutWolo:true,status:true,
        stakeLeg:{select:{
          id:true,marketId:true,amountWolo:true,
          ticket:{select:{
            id:true,userId:true,source:true,walletProvider:true,
            walletAddress:true,stakeTxHash:true,status:true,
            clientRequestId:true,
          }},
        }},
      },
      take:1001,
    });
    // Existing market claims can aggregate several wager tickets. WoloChain's
    // signed return v2 binds each immutable claim to ONE original operation,
    // owner, funding tx and market leg. Never manufacture a single-ticket
    // allocation for an aggregated claim or credit a short unmatched refund.
    // Prisma stores a broad string; narrow the *transactionally reloaded*
    // claim kind before passing it to the per-ticket return verifier.
    const currentKind=current.claimKind;
    if(currentKind!=="bet_payout"&&currentKind!=="bet_refund")
      stop("claim_return_kind_changed_or_unsupported");
    const attributed=inspectSingleTicketSatchelReturn({
      ownerUserId:input.ownerUserId,
      claimKind:currentKind,
      claimAmountWolo:claim.amountWolo,
      marketId:sourceMarketId,
      vaultAddress:vault,
      wagers,
    });
    // Complete the chain of custody back to the exact durable Mecha request.
    // A recorded BetStakeTicket without a committed owner reservation is not
    // enough to attach an escrow return to the pooled customer ledger.
    const original=await tx.satchelFundedReservation.findUnique({
      where:{ticketId:attributed.ticketId},
      select:{
        ownerUserId:true,status:true,ticketRequestId:true,txHash:true,
        ticketId:true,
      },
    });
    if(!original || original.status!=="committed" ||
       original.ownerUserId!==input.ownerUserId ||
       original.ticketId!==attributed.ticketId ||
       original.ticketRequestId!==attributed.operationId ||
       original.txHash?.toUpperCase()!==attributed.fundingTxHash ||
       attributed.amountUwolo!==proof.amountUwolo) {
      stop("claim_return_original_funded_operation_not_committed_or_bound");
    }

    requireFreshBank(bank,Date.now());
    const liabilities=await outstandingVaultLiability(tx);
    if(liabilities+proof.amountUwolo>MAX_I64 ||
       bank.balanceUwolo<liabilities+proof.amountUwolo)
      stop("vault_cannot_cover_claim_return_and_other_players");
    // A pending, independently verified deposit candidate also reserves the
    // physical chain effect identity. Otherwise the claim-return route could
    // credit it first and the deposit route could try crediting it afterward.
    const existingDepositCandidate=await tx.warSatchelProofCandidate.findUnique({
      where:{chainId_txHash_transferIndex:{
        chainId:"wolo-1",txHash:proof.txHash,transferIndex:0,
      }},
    });
    if(existingDepositCandidate)stop("claim_return_hash_already_used_as_deposit_candidate");
    const existingDeposit=await tx.satchelFundedReceipt.findUnique({
      where:{chainId_txHash_transferIndex:{
        chainId:"wolo-1",txHash:proof.txHash,transferIndex:0,
      }},
    });
    if(existingDeposit)stop("claim_return_hash_already_used_as_deposit");

    const currentBalance=await getOrCreateBalance(tx,input.ownerUserId);
    if(currentBalance.availableUwolo+proof.amountUwolo>MAX_I64)
      stop("owner_spendable_overflow");
    requireFreshBank(bank,Date.now());
    if(!authenticatedWarSatchelClaimReturnFreshAt(proof))stop("authenticated_comet_return_expired_before_writes");
    const receipt=await tx.satchelFundedClaimReturn.create({
      data:{
        claimId:claim.id,ownerUserId:input.ownerUserId,
        sourceMarketId,claimKind:claim.claimKind,
        chainId:"wolo-1",txHash:proof.txHash,transferIndex:0,
        amountUwolo:proof.amountUwolo,vaultAddress:vault,
        canonicalHeight:proof.canonicalHeight,
      },
    });
    await requirePhysicalConsumption(tx,"claim_return",receipt);
    await tx.satchelFundedJournal.create({
      data:{
        ownerUserId:input.ownerUserId,
        sourceKey:"satchel:return:claim:"+claim.id,
        eventKind:"claim_return_credit",amountUwolo:proof.amountUwolo,
        deltaAvailableUwolo:proof.amountUwolo,
        deltaReservedUwolo:BigInt(0),deltaCommittedUwolo:BigInt(0),
        deltaWithdrawalPendingUwolo:BigInt(0),
        claimReturnId:receipt.id,
      },
    });
    const account=await tx.satchelFundedBalance.update({
      where:{ownerUserId:input.ownerUserId},
      data:{
        availableUwolo:{increment:proof.amountUwolo},
        version:{increment:BigInt(1)},updatedAt:new Date(),
      },
    });
    // Do not commit if row/trigger waits consumed either signed source head.
    if(!authenticatedWarSatchelClaimReturnFreshAt(proof))stop("authenticated_comet_return_expired_before_commit");
    requireFreshBank(bank,Date.now());
    return Object.freeze({
      status:"credited" as const,
      returnId:receipt.id.toString(),
      availableUwolo:account.availableUwolo.toString(),
    });
  });
}

/** Request an INDEPENDENT review of an existing hold. This never issues a signature. */
export async function prepareSatchelWagerReview(prisma:PrismaClient,input:{executionId:number;ownerUserId:number;ticketId:number}){
 return withExclusiveSatchelTx(prisma,async tx=>{
  const r=await tx.satchelFundedReservation.findUnique({where:{executionId:input.executionId}});
  if(!r||r.ownerUserId!==input.ownerUserId||r.status!=='reserved')stop('wager_review_requires_unattempted_owner_hold');
  const prior=await tx.satchelWagerAuthorization.findUnique({where:{operationId:r.ticketRequestId}});
  if(prior){const a=decodeWagerAuthorization(prior);if(a.snapshot.ticketId!==input.ticketId)stop('wager_review_ticket_changed');return a;}
  const e=await tx.betAutoExecution.findUnique({where:{id:input.executionId},include:{preset:{include:{user:true}}}});
  const t=await tx.betStakeTicket.findUnique({where:{id:input.ticketId},include:{legs:true}});
  const balance=await tx.satchelFundedBalance.findUnique({where:{ownerUserId:input.ownerUserId}});
  const journal=await tx.satchelFundedJournal.findUnique({where:{sourceKey:r.id}});
  if(!e||!t||!balance||!journal||e.preset.userId!==input.ownerUserId||e.reservationId!==r.id||
    e.status!=='funded_reserved'||t.userId!==input.ownerUserId||t.clientRequestId!==r.ticketRequestId||
    t.source!=='auto'||t.walletProvider!=='satchel-vault'||t.walletAddress!==fundedVaultAddress()||
    t.status!=='awaiting_signature'||t.stakeTxHash!==null||balance.reservedUwolo<r.amountUwolo||
    satchelReserveDebitIssue(r, journal))
    stop('wager_review_not_canonical_reserved_ticket');
  const winner=t.legs.find(l=>l.marketId===e.winnerMarketId),desync=t.legs.find(l=>l.marketId===e.desyncMarketId);
  if(!winner || winner.side!==e.selectedSide || winner.amountWolo!==e.winnerStakeWolo ||
    t.legs.some(l=>l.propositionHash!==e.propositionHash) ||
    (e.desyncMarketId===null ? t.legs.length!==1 : t.legs.length!==2 || !desync ||
      desync.side!==(e.desyncSide==='yes'?'right':'left') || desync.amountWolo!==e.desyncStakeWolo))
    stop('wager_review_ticket_differs_from_watcher_execution');
  const consent=await tx.satchelAutoSpendConsent.findFirst({where:{ownerUserId:input.ownerUserId,
    ownerUid:e.preset.user.uid,walletAddress:e.preset.user.walletAddress||'',presetId:e.presetId,presetVersion:e.presetVersion,
    signedAt:{not:null},revokedAt:null,spendExpiresAt:{gt:new Date()}},orderBy:{signedAt:'desc'},include:{originalMandate:true}});
  if(!consent?.originalMandate)stop('wager_review_original_consent_missing');
  try{verifyDurableSatchelAutoSpendMandate({consent,originalMandate:consent.originalMandate,ownerUid:e.preset.user.uid,
    ownerWallet:e.preset.user.walletAddress||'',presetId:e.presetId,presetVersion:e.presetVersion,
    untilOut:e.preset.untilOut,gamesRemaining:e.preset.gamesRemaining,now:new Date()});}catch{stop('wager_review_original_consent_invalid');}
  const escrow=getWoloBetEscrowRuntime();if(!escrow.onchainAllowed||!escrow.escrowAddress)stop('wager_review_escrow_unavailable');
  const a=buildSatchelWagerAuthorization({executionId:e.id,ownerUserId:input.ownerUserId,ownerUid:e.preset.user.uid,
    ownerWallet:e.preset.user.walletAddress||'',reservationId:r.id,operationId:r.ticketRequestId,ticketId:t.id,
    vault:t.walletAddress,recipient:escrow.escrowAddress,amountUwolo:r.amountUwolo.toString(),memo:"AoE2HDBets bet ticket v1 · ticket "+t.id,
    gameIdentityKey:e.gameIdentityKey,propositionHash:e.propositionHash,presetId:e.presetId,presetVersion:e.presetVersion,
    consentId:consent.id,challengeText:consent.originalMandate.challengeText,ownerSignatureJson:consent.originalMandate.ownerSignatureJson,
    ledgerVersion:balance.version.toString(),availableUwolo:balance.availableUwolo.toString(),reservedUwolo:balance.reservedUwolo.toString(),
    journalId:journal.id.toString(),legs:t.legs.map(l=>({id:l.id,marketId:l.marketId,side:l.side,amountWolo:l.amountWolo,propositionHash:l.propositionHash}))});
  await tx.satchelWagerAuthorization.create({data:{operationId:a.operationId,reservationId:a.reservationId,ownerUserId:a.ownerUserId,
    snapshotJson:a.snapshot as unknown as Prisma.InputJsonValue,reservationDigest:a.reservationDigest,ledgerRevision:a.ledgerRevision,consentDigest:a.consentDigest}});
  return a;
 });
}
function decodeWagerAuthorization(row:{snapshotJson:unknown;operationId:string;reservationId:string;ownerUserId:number;reservationDigest:string;ledgerRevision:string;consentDigest:string}){
 const a=buildSatchelWagerAuthorization(row.snapshotJson as SatchelWagerSnapshot);
 if(a.operationId!==row.operationId||a.reservationId!==row.reservationId||a.ownerUserId!==row.ownerUserId||
   a.reservationDigest!==row.reservationDigest||a.ledgerRevision!==row.ledgerRevision||a.consentDigest!==row.consentDigest)
   stop('wager_authorization_snapshot_corrupt');
 return a;
}
/** Trusted reviewer ingress, analogous to withdrawal approval. No public route,
 * signature generator, bearer-based authority or automatic signing fallback. */
export async function attachIndependentSatchelWagerReview(prisma:PrismaClient,input:{operationId:string;ownerUserId:number;approval:SatchelWagerReservation}){
 const key=await readWagerReviewerKey();
 return withExclusiveSatchelTx(prisma,async tx=>{
  const row=await tx.satchelWagerAuthorization.findUnique({where:{operationId:input.operationId}});
  if(!row||row.ownerUserId!==input.ownerUserId)stop('wager_review_owner_missing');
  const a=decodeWagerAuthorization(row);
  const approval=verifyIndependentWagerReservation(input.approval,wagerReviewContext(a,input.approval),key,Date.now());
  const prior=await tx.satchelWagerApproval.findUnique({where:{operationId:a.operationId}});
  if(prior){if(JSON.stringify(prior.approvalJson)!==JSON.stringify(JSON.parse(JSON.stringify(approval)))){
    // JSONB key order is not part of the signature; compare canonical sign bytes and signature.
    const old=verifyIndependentWagerReservation(prior.approvalJson,wagerReviewContext(a,approval),key,Date.now());
    if(old.signature!==approval.signature)stop('wager_review_conflict');
   }return {state:'already_reviewed' as const};}
  const r=await tx.satchelFundedReservation.findUnique({where:{id:a.reservationId}});
  if(!r||r.status!=='reserved'||r.ownerUserId!==input.ownerUserId)stop('wager_review_already_attempted');
  await tx.satchelWagerApproval.create({data:{operationId:a.operationId,approvalJson:approval as unknown as Prisma.InputJsonValue}});
  return {state:'reviewed' as const};
 });
}
export async function loadSatchelWagerReview(prisma:PrismaClient,input:{operationId:string;ownerUserId:number},historical=false){
 noFundsUntilCertified();
 const row=await prisma.satchelWagerAuthorization.findUnique({where:{operationId:input.operationId},include:{approval:true,broadcast:true}});
 if(!row||row.ownerUserId!==input.ownerUserId)stop('wager_review_owner_missing');
 const a=decodeWagerAuthorization(row),raw=row.approval?.approvalJson as unknown as SatchelWagerReservation|undefined;
 const review=raw?verifyIndependentWagerReservation(raw,wagerReviewContext(a,raw),await readWagerReviewerKey(),historical?raw.issued_at*1000:Date.now()):null;
 return {authorization:a,review,candidateHash:row.broadcast?.txHash??null};
}
/** Persist ACK identity before any proof I/O. A conflicting hash remains held. */
export async function recordSatchelWagerBroadcastCandidate(prisma:PrismaClient,input:{operationId:string;ownerUserId:number;txHash:string}){
 if(!TX_HASH.test(input.txHash)||input.txHash==='0'.repeat(64))stop('wager_candidate_hash_invalid');
 return withExclusiveSatchelTx(prisma,async tx=>{
  const a=await tx.satchelWagerAuthorization.findUnique({where:{operationId:input.operationId}});
  if(!a||a.ownerUserId!==input.ownerUserId)stop('wager_candidate_owner_missing');
  const r=await tx.satchelFundedReservation.findUnique({where:{id:a.reservationId}});
  const prior=await tx.satchelWagerBroadcast.findUnique({where:{operationId:a.operationId}});
  if(prior){if(prior.txHash!==input.txHash)stop('wager_candidate_hash_conflict');return;}
  if(!r||r.status!=='unknown_hold')stop('wager_candidate_without_attempt_fence');
  await tx.satchelWagerBroadcast.create({data:{operationId:a.operationId,txHash:input.txHash}});
 });
}
