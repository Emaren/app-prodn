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
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${FINANCIAL_LOCK_CLASS}, ${FINANCIAL_LOCK_ID})`;
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
    signedSpendingConsentVerified: boolean;
    bank: CanonicalSatchelBank;
  },
): Promise<{ status: "reserved" | "already_reserved"; reservationId: string }> {
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0 ||
      !Number.isSafeInteger(input.executionId) || input.executionId <= 0 ||
      !Number.isSafeInteger(input.presetVersion) || input.presetVersion <= 0 ||
      !positiveAmount(input.reserveUwolo) ||
      !input.signedSpendingConsentVerified) stop("unverified_spending_consent_or_reserve");
  return withExclusiveSatchelTx(prisma, async tx => {
    const found = await tx.satchelFundedReservation.findUnique({
      where: { executionId: input.executionId },
    });
    if (found) {
      if (found.ownerUserId !== input.ownerUserId || found.amountUwolo !== input.reserveUwolo) {
        stop("duplicate_execution_not_same_owner_or_amount");
      }
      return { status: "already_reserved" as const, reservationId: found.id };
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
