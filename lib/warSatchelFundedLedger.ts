import { inspectSingleTicketSatchelReturn } from "./warSatchelClaimReturnAttribution.ts";
import { verifyLiveCanonicalSatchelClaimReturn } from "./warSatchelCanonicalClaimReturn.ts";
import { getWoloBetEscrowRuntime } from "./woloChain.ts";
import { isVerifiedSatchelWithdrawal, type SatchelVerifiedWithdrawal } from "./warSatchelWithdrawalAuthorization.ts";
import { randomUUID } from "node:crypto";
import { inspectLiveCanonicalWithdrawal } from "./warSatchelCanonicalWithdrawal.ts";
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
const BANK_HEAD_MAX_AGE_MS = 30_000;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const TX_HASH = /^[A-F0-9]{64}$/;
const PROOF_ID = /^[A-F0-9]{64}$/;
const RPC = "https://rpc-mainnet.aoe2war.com";
const REST = "https://rest-mainnet.aoe2war.com";
const FINANCIAL_LOCK_CLASS = 724176;
const FINANCIAL_LOCK_ID = 47;

export type CanonicalSatchelBank = Readonly<{
  chainId: "wolo-1";
  denom: "uwolo";
  vaultAddress: string;
  balanceUwolo: bigint;
  height: bigint;
  observedAtMs: number;
}>;

function stop(reason: string): never {
  throw new Error("WAR_SATCHEL_FUNDED_REFUSED:" + reason);
}
function positiveAmount(value: bigint) {
  return value > BigInt(0) && value <= MAX_I64;
}
function noFundsUntilCertified() {
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

function chainObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) stop("bad_chain_response");
  return input as Record<string, unknown>;
}
function chainAmount(value: unknown, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value)) {
    stop("invalid_bank_integer");
  }
  const n = BigInt(value);
  if (n > MAX_I64 || (!allowZero && n === BigInt(0))) stop("bank_integer_out_of_range");
  return n;
}
async function readChainJson(url: string, reader: typeof fetch) {
  if (url !== RPC + "/status" &&
      !/^https:\/\/rest-mainnet\.aoe2war\.com\/cosmos\/bank\/v1beta1\/balances\/wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}\/by_denom\?denom=uwolo$/.test(url)) {
    stop("untrusted_chain_endpoint");
  }
  const response = await reader(url, {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 200 || !response.ok) stop("bank_network_unavailable");
  const size = Number(response.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(size) || size > 65536) stop("bank_body_too_large");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 65536) stop("bank_body_too_large");
  return chainObject(JSON.parse(raw) as unknown);
}

/**
 * Independently read a *physical* mainnet vault bank balance and canonical
 * head. Never use a player's wallet JSON, request headers, or a simulation
 * journal as authority. A bank snapshot does NOT attest signer key control.
 */
export async function readIndependentSatchelBank(
  reader: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<CanonicalSatchelBank> {
  noFundsUntilCertified();
  const vault = fundedVaultAddress();
  const [status, bank] = await Promise.all([
    readChainJson(RPC + "/status", reader),
    readChainJson(REST + "/cosmos/bank/v1beta1/balances/" + vault + "/by_denom?denom=uwolo", reader),
  ]);
  const result = chainObject(status.result);
  const node = chainObject(result.node_info);
  const sync = chainObject(result.sync_info);
  if (node.network !== "wolo-1" || sync.catching_up !== false) stop("chain_or_sync_mismatch");
  const height = chainAmount(sync.latest_block_height);
  const balance = chainObject(bank.balance);
  if (balance.denom !== "uwolo") stop("wrong_bank_denom");
  const amount = chainAmount(balance.amount, true);
  return Object.freeze({
    chainId: "wolo-1" as const,
    denom: "uwolo" as const,
    vaultAddress: vault,
    balanceUwolo: amount,
    height,
    observedAtMs: nowMs,
  });
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
  if (bank.chainId !== "wolo-1" || bank.denom !== "uwolo" ||
      bank.vaultAddress !== fundedVaultAddress() ||
      !positiveAmount(bank.height) || bank.balanceUwolo < BigInt(0) ||
      bank.balanceUwolo > MAX_I64 ||
      bank.observedAtMs > nowMs || nowMs - bank.observedAtMs > BANK_HEAD_MAX_AGE_MS) {
    stop("bank_observation_not_fresh_or_canonical");
  }
}
async function getOrCreateBalance(tx: Prisma.TransactionClient, ownerUserId: number) {
  const found = await tx.satchelFundedBalance.findUnique({ where: { ownerUserId } });
  if (found) return found;
  return tx.satchelFundedBalance.create({ data: { ownerUserId } });
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
    bank: CanonicalSatchelBank;
  },
): Promise<FundedCreditResult> {
  noFundsUntilCertified();
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0 ||
      !positiveAmount(input.proofCandidateId) ||
      !TX_HASH.test(input.expectedTxHash)) stop("invalid_credit_identity");

  return withExclusiveSatchelTx(prisma, async tx => {
    const actors = await tx.$queryRaw<Array<{ id: number; uid: string; wallet_address: string | null }>>`
      SELECT id, uid, wallet_address FROM users WHERE id = ${input.ownerUserId} FOR UPDATE
    `;
    if (actors.length !== 1 || actors[0].uid !== input.ownerUid ||
        !actors[0].wallet_address) stop("authenticated_wallet_binding_mismatch");
    const proof = await tx.warSatchelProofCandidate.findUnique({
      where: { id: input.proofCandidateId },
      include: { intent: true },
    });
    if (!proof || proof.userId !== input.ownerUserId || proof.status !== "uncredited" ||
        proof.chainId !== "wolo-1" || proof.txHash !== input.expectedTxHash ||
        proof.transferIndex !== 0 || proof.vaultAddress !== fundedVaultAddress() ||
        proof.senderAddress !== actors[0].wallet_address || !positiveAmount(proof.amountUwolo) ||
        proof.txHeight <= BigInt(0) || proof.intent.userId !== input.ownerUserId ||
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
      const account = await tx.satchelFundedBalance.findUnique({ where: { ownerUserId: input.ownerUserId } });
      return Object.freeze({
        status: "already_credited" as const,
        receiptId: previous.id.toString(),
        availableUwolo: String(account?.availableUwolo ?? BigInt(0)),
      });
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
    requireFreshBank(input.bank, Date.now());
    if (input.bank.height < proof.txHeight + BigInt(2)) stop("deposit_requires_three_confirmations");
    const oldLiability = await outstandingVaultLiability(tx);
    if (oldLiability + proof.amountUwolo > MAX_I64 ||
        oldLiability + proof.amountUwolo > input.bank.balanceUwolo) {
      stop("physical_vault_cannot_cover_credit");
    }
    const account = await getOrCreateBalance(tx, input.ownerUserId);
    if (account.availableUwolo + proof.amountUwolo > MAX_I64) stop("owner_balance_overflow");

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
      input.reserveUwolo > BigInt(1000) * BigInt(1000000) ||
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
    });
    if (!mandate ||
        mandate.winnerStakeWolo !== exec.winnerStakeWolo ||
        mandate.desyncSide !== exec.desyncSide ||
        mandate.desyncStakeWolo !== exec.desyncStakeWolo ||
        mandate.perGameCapWolo < exec.winnerStakeWolo + exec.desyncStakeWolo ||
        mandate.dailyCapWolo > 10000 ||
        mandate.signedAt === null) {
      stop("keplr_signed_spending_mandate_missing_or_stale");
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
        id: true, status: true, marketType: true,
        integrityStatus: true, propositionHash: true,
      },
    });
    if (!market || market.status !== "live" || market.marketType !== "winner" ||
        market.integrityStatus !== "verified" ||
        market.propositionHash !== exec.propositionHash) {
      stop("canonical_watcher_market_not_live");
    }
    if (exec.desyncMarketId !== null) {
      const desync = await tx.betMarket.findUnique({
        where: { id: exec.desyncMarketId },
        select: { status: true, marketType: true, parentMarketId: true,
          propositionHash: true, integrityStatus: true },
      });
      if (!desync || desync.status !== "live" ||
          desync.marketType !== "desync" || desync.parentMarketId !== market.id ||
          desync.propositionHash !== market.propositionHash ||
          desync.integrityStatus !== "verified") {
        stop("desync_wager_market_no_longer_consistent");
      }
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
    if (dailySpent + input.reserveUwolo >
        BigInt(mandate.dailyCapWolo) * BigInt(1000000)) {
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
  input: { executionId: number; ownerUserId: number; ticketRequestId: string },
) {
  return withExclusiveSatchelTx(prisma, async tx => {
    const reservation = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (!reservation || reservation.ownerUserId !== input.ownerUserId ||
        reservation.ticketRequestId !== input.ticketRequestId ||
        reservation.status !== "reserved") {
      stop("already_submitted_or_not_owner");
    }
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
    });
    if (!permit || permit.winnerStakeWolo !== execution.winnerStakeWolo ||
        permit.desyncStakeWolo !== execution.desyncStakeWolo ||
        permit.desyncSide !== execution.desyncSide ||
        permit.perGameCapWolo < execution.winnerStakeWolo + execution.desyncStakeWolo) {
      stop("keplr_auto_spending_mandate_revoked_before_broadcast");
    }
    const market = await tx.betMarket.findUnique({
      where: { id: execution.winnerMarketId },
      select: { status: true, integrityStatus: true, propositionHash: true },
    });
    if (!market || market.status !== "live" ||
        market.integrityStatus !== "verified" ||
        market.propositionHash !== execution.propositionHash) {
      stop("watcher_proposition_not_live_before_broadcast");
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
export async function markSatchelWithdrawalAttempt(
  prisma: PrismaClient,
  input:{withdrawalId:string;ownerUserId:number},
) {
  withdrawalGate();
  return withExclusiveSatchelTx(prisma,async tx=>{
    const found=await tx.satchelFundedWithdrawal.findUnique({
      where:{id:input.withdrawalId},
    });
    if (!found || found.ownerUserId!==input.ownerUserId || found.status!=="reserved") {
      stop("already_attempted_withdrawal_never_resubmit");
    }
    const changed=await tx.satchelFundedWithdrawal.updateMany({
      where:{id:found.id,status:"reserved"},
      data:{status:"unknown_hold",updatedAt:new Date()},
    });
    if(changed.count!==1)stop("withdrawal_attempt_race");
    return Object.freeze({state:"broadcast_uncertainty_locked" as const});
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
export async function finalizeProvenSatchelWithdrawal(
  prisma: PrismaClient,
  input:{withdrawalId:string;ownerUserId:number;txHash:string},
) {
  withdrawalGate();
  if(!TX_HASH.test(input.txHash))stop("invalid_withdrawal_tx_hash");
  const withdrawal=await prisma.satchelFundedWithdrawal.findUnique({
    where:{id:input.withdrawalId},
  });
  if(!withdrawal || withdrawal.ownerUserId!==input.ownerUserId ||
      !["unknown_hold","sent"].includes(withdrawal.status))stop("withdrawal_not_inflight");
  const vault=fundedVaultAddress();
  const proven=await inspectLiveCanonicalWithdrawal({
    withdrawalId:withdrawal.id,txHash:input.txHash,
    vaultAddress:vault,ownerWalletAddress:withdrawal.ownerWalletAddress,
    amountUwolo:withdrawal.amountUwolo.toString(),
  });
  const bank=await readIndependentSatchelBank();
  if(bank.height<BigInt(proven.headHeight))stop("bank_snapshot_precedes_withdrawal_proof");
  return withExclusiveSatchelTx(prisma,async tx=>{
    const fresh=await tx.satchelFundedWithdrawal.findUnique({
      where:{id:withdrawal.id},
    });
    if(!fresh || fresh.ownerUserId!==input.ownerUserId ||
       fresh.ownerWalletAddress!==withdrawal.ownerWalletAddress ||
       fresh.amountUwolo!==withdrawal.amountUwolo)stop("withdrawal_identity_changed");
    if(fresh.status==="sent"){
      if(fresh.txHash!==proven.hash || fresh.confirmedHeight!==BigInt(proven.confirmedHeight))
        stop("withdrawal_conflicting_finality_proof");
      return Object.freeze({state:"already_sent" as const,txHash:proven.hash});
    }
    if(fresh.status!=="unknown_hold")stop("cannot_finalize_unattempted_withdrawal");
    const account=await tx.satchelFundedBalance.findUnique({
      where:{ownerUserId:input.ownerUserId},
    });
    if(!account || account.withdrawalPendingUwolo<fresh.amountUwolo)stop("withdrawal_not_liability_backed");
    requireFreshBank(bank,Date.now());
    const liabilities=await outstandingVaultLiability(tx);
    // This specific transfer already LEFT the vault. The current physical
    // balance must fund every other claimant AFTER its pending liability
    // is removed, not before (which would falsely require double collateral).
    if(liabilities<fresh.amountUwolo ||
       bank.balanceUwolo<liabilities-fresh.amountUwolo)
       stop("post_withdrawal_vault_insolvent");
    await tx.satchelFundedJournal.create({
      data:{
        ownerUserId:input.ownerUserId,
        sourceKey:"satchel:withdraw:sent:"+fresh.id,
        eventKind:"withdraw_sent",amountUwolo:fresh.amountUwolo,
        deltaAvailableUwolo:BigInt(0),
        deltaReservedUwolo:BigInt(0),
        deltaCommittedUwolo:BigInt(0),
        deltaWithdrawalPendingUwolo:-fresh.amountUwolo,
      },
    });
    await tx.satchelFundedBalance.update({
      where:{ownerUserId:input.ownerUserId},
      data:{
        withdrawalPendingUwolo:{decrement:fresh.amountUwolo},
        version:{increment:BigInt(1)},updatedAt:new Date(),
      },
    });
    await tx.satchelFundedWithdrawal.update({
      where:{id:fresh.id},
      data:{status:"sent",txHash:proven.hash,
        confirmedHeight:BigInt(proven.confirmedHeight),updatedAt:new Date()},
    });
    return Object.freeze({state:"sent" as const,txHash:proven.hash});
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
  if(!Number.isSafeInteger(input.claimId)||input.claimId<1||
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
  const proof=await verifyLiveCanonicalSatchelClaimReturn({
    claimId:claim.id,claimKind:claim.claimKind,
    txHash,escrowAddress:escrow.escrowAddress,
    vaultAddress:vault,
    amountUwolo:(BigInt(claim.amountWolo)*BigInt(1000000)).toString(),
  });
  const bank=await readIndependentSatchelBank();
  if(bank.height<proof.headHeight || bank.height<proof.canonicalHeight+BigInt(2))
    stop("bank_does_not_cover_canonical_return_height");
  return withExclusiveSatchelTx(prisma,async tx=>{
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
      if(prior.ownerUserId!==input.ownerUserId||
         prior.txHash!==proof.txHash ||
         prior.amountUwolo!==proof.amountUwolo)
        stop("claim_return_already_owned_or_conflicting");
      const account=await tx.satchelFundedBalance.findUnique({
        where:{ownerUserId:input.ownerUserId},
      });
      return Object.freeze({
        status:"already_credited" as const,
        returnId:prior.id.toString(),
        availableUwolo:String(account?.availableUwolo??BigInt(0)),
      });
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
    const attributed=inspectSingleTicketSatchelReturn({
      ownerUserId:input.ownerUserId,
      claimKind:claim.claimKind,
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
    const receipt=await tx.satchelFundedClaimReturn.create({
      data:{
        claimId:claim.id,ownerUserId:input.ownerUserId,
        sourceMarketId,claimKind:claim.claimKind,
        chainId:"wolo-1",txHash:proof.txHash,transferIndex:0,
        amountUwolo:proof.amountUwolo,vaultAddress:vault,
        canonicalHeight:proof.canonicalHeight,
      },
    });
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
    return Object.freeze({
      status:"credited" as const,
      returnId:receipt.id.toString(),
      availableUwolo:account.availableUwolo.toString(),
    });
  });
}
