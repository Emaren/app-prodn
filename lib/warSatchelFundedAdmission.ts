/**
 * HD War Satchel C4->C5 funded admission boundary.
 *
 * This is a PURE proposal gate: neither a vault attestation, DB reservation,
 * signing authority, BetStakeTicket nor a live executor. Callers MUST obtain
 * all inputs from independent trusted sources and re-check them inside the
 * eventual per-owner/market serializable transaction. Never treat a returned
 * proposal as a wager or spend authority.
 */
import {
  BET_AUTOMATION_MAX_PER_GAME_WOLO,
  BET_AUTOMATION_MAX_RESERVE_WOLO,
  storedBetAutoFinancialIssue,
  type BetAutoShadowAdmission,
  type BetAutoShadowPresetInput,
} from "./betAutomation.ts";

const INT64_MAX = 9223372036854775807n;
const UWOLO_PER_WOLO = 1000000n;
const HASH = /^[0-9a-fA-F]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const MAX_VAULT_HEAD_AGE_MS = 90_000;

export type SatchelBalanceSnapshot = {
  ownerUid: string;
  availableUwolo: string;
  reservedUwolo: string;
  committedUwolo: string;
  withdrawalPendingUwolo: string;
};

export type IndependentVaultSnapshot = {
  /** The verifier, not the player, must provide this canonical bank observation. */
  chainId: string;
  denom: string;
  address: string;
  bankBalanceUwolo: string;
  /** ALL already credited obligations within this exclusive vault, not one user's. */
  aggregateLiabilityUwolo: string;
  headHeight: string;
  observedAtUtc: string;
  /** A digest of a persisted, independently auditable bank+ledger observation. */
  evidenceHash: string;
};

export type FundedAutoExecutionSnapshot = {
  id: number;
  presetId: number;
  presetVersion: number;
  ownerUid: string;
  status: string;
  gameIdentityKey: string;
  winnerMarketId: number;
  desyncMarketId: number | null;
  propositionHash: string;
  selectedSide: string;
  ticketId: number | null;
  reservationId: string | null;
  attemptCount: number;
};

export type FundedAutoConsent = {
  ownerUid: string;
  version: number;
  enabled: boolean;
  selfOnly: boolean;
  /** Already verified signed consent; a UI toggle or Keplr login is NOT consent. */
  signedBudgetVerified: boolean;
  expiresAtUtc: string;
  perGameCapWolo: number;
  dailyCapWolo: number;
  dailyCommittedWolo: number;
  dailyReservedWolo: number;
};

export type FundedAutoAdmissionInput = {
  admission: BetAutoShadowAdmission;
  preset: BetAutoShadowPresetInput;
  execution: FundedAutoExecutionSnapshot;
  consent: FundedAutoConsent;
  balance: SatchelBalanceSnapshot;
  vault: IndependentVaultSnapshot;
  expectedVaultAddress: string;
  /** A finality-verified on-chain receipt may not exceed the observed bank head. */
  latestCreditedDepositHeight: string;
  nowUtc: string;
};

export type FundedAutoAdmission =
  | Readonly<{ ready: false; reason: string }>
  | Readonly<{
      ready: true;
      kind: "PROPOSAL_ONLY_NOT_WAGER_AUTHORIZATION";
      executionId: number;
      presetId: number;
      presetVersion: number;
      ownerUid: string;
      gameIdentityKey: string;
      winnerMarketId: number;
      desyncMarketId: number | null;
      selectedSide: "left" | "right";
      propositionHash: string;
      reserveUwolo: string;
      vaultEvidenceHash: string;
    }>;

function no(reason: string): FundedAutoAdmission {
  return Object.freeze({ ready: false as const, reason });
}

function parseAmount(value: string): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value)) return null;
  const n = BigInt(value);
  return n <= INT64_MAX ? n : null;
}

function parseHeight(value: string): bigint | null {
  const n = parseAmount(value);
  return n !== null && n > 0n ? n : null;
}

function utc(value: string): number | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * A fundable proposal is NOT a fundable balance. This gate intentionally has
 * no dependency on private keys, deposit-credit writers, or transaction clients.
 * Re-derivation under a transaction/chain checkpoint is obligatory.
 */
export function assessFundedMechaAdmission(input: FundedAutoAdmissionInput): FundedAutoAdmission {
  const { admission: a, execution: e, consent: c, preset: p, balance: b, vault: v } = input;
  if (!a.eligible) return no("watcher_admission_not_eligible");
  if (!positiveSafeInteger(e.id) || !positiveSafeInteger(e.presetId) ||
      !positiveSafeInteger(e.winnerMarketId) || !positiveSafeInteger(e.presetVersion)) {
    return no("invalid_execution_identity");
  }
  if (!p.enabled || !p.selfOnly || storedBetAutoFinancialIssue(p) !== null ||
      (!p.untilOut && (p.gamesRemaining ?? 0) <= 0)) {
    return no("preset_invalid_or_exhausted");
  }
  if (p.id !== e.presetId || p.version !== e.presetVersion ||
      c.version !== e.presetVersion || c.ownerUid !== e.ownerUid ||
      b.ownerUid !== e.ownerUid || !e.ownerUid.trim()) {
    return no("owner_or_preset_version_mismatch");
  }
  if (e.status !== "shadow_ready" || e.ticketId !== null ||
      e.reservationId !== null || e.attemptCount !== 0) {
    return no("execution_already_claimed_or_not_shadow_ready");
  }
  if (e.gameIdentityKey !== a.gameIdentityKey ||
      e.desyncMarketId !== a.desyncMarketId ||
      e.selectedSide !== a.selectedSide ||
      e.propositionHash !== a.evidence.propositionHash) {
    return no("frozen_watcher_proposition_mismatch");
  }
  if (!c.enabled || !c.selfOnly || !c.signedBudgetVerified) {
    return no("authenticated_spend_consent_absent");
  }

  const now = utc(input.nowUtc);
  const expires = utc(c.expiresAtUtc);
  const observed = utc(v.observedAtUtc);
  if (now === null || expires === null || observed === null ||
      expires <= now || observed > now ||
      now - observed > MAX_VAULT_HEAD_AGE_MS) {
    return no("expired_consent_or_stale_vault_evidence");
  }

  if (v.chainId !== "wolo-1" || v.denom !== "uwolo" ||
      !ADDRESS.test(v.address) ||
      v.address !== input.expectedVaultAddress ||
      !HASH.test(v.evidenceHash)) {
    return no("uncertified_or_mismatched_vault_identity");
  }
  const head = parseHeight(v.headHeight);
  const receiptHead = parseHeight(input.latestCreditedDepositHeight);
  if (head === null || receiptHead === null || head < receiptHead) {
    return no("vault_head_does_not_cover_credited_receipt");
  }

  const bank = parseAmount(v.bankBalanceUwolo);
  const globalLiabilities = parseAmount(v.aggregateLiabilityUwolo);
  const available = parseAmount(b.availableUwolo);
  const reserved = parseAmount(b.reservedUwolo);
  const committed = parseAmount(b.committedUwolo);
  const withdrawalPending = parseAmount(b.withdrawalPendingUwolo);
  if ([bank, globalLiabilities, available, reserved, committed, withdrawalPending]
    .some(value => value === null)) {
    return no("noncanonical_or_overflowing_uwolo");
  }
  const liabilityComponents = available! + reserved! + committed! + withdrawalPending!;
  if (bank! < globalLiabilities! ||
      liabilityComponents > globalLiabilities!) {
    return no("physical_vault_or_global_liability_shortfall");
  }

  const stake = p.winnerStakeWolo + p.desyncStakeWolo;
  if (!positiveSafeInteger(stake) ||
      stake > BET_AUTOMATION_MAX_PER_GAME_WOLO ||
      !positiveSafeInteger(c.perGameCapWolo) ||
      stake > c.perGameCapWolo ||
      !positiveSafeInteger(c.dailyCapWolo) ||
      c.dailyCapWolo > BET_AUTOMATION_MAX_RESERVE_WOLO ||
      !Number.isSafeInteger(c.dailyCommittedWolo) || c.dailyCommittedWolo < 0 ||
      !Number.isSafeInteger(c.dailyReservedWolo) || c.dailyReservedWolo < 0 ||
      c.dailyCommittedWolo + c.dailyReservedWolo + stake > c.dailyCapWolo) {
    return no("owner_signed_budget_exceeded");
  }
  const reserve = BigInt(stake) * UWOLO_PER_WOLO;
  if (available! < reserve) return no("insufficient_owner_available_balance");

  return Object.freeze({
    ready: true as const,
    kind: "PROPOSAL_ONLY_NOT_WAGER_AUTHORIZATION" as const,
    executionId: e.id,
    presetId: e.presetId,
    presetVersion: e.presetVersion,
    ownerUid: e.ownerUid,
    gameIdentityKey: e.gameIdentityKey,
    winnerMarketId: e.winnerMarketId,
    desyncMarketId: e.desyncMarketId,
    selectedSide: a.selectedSide,
    propositionHash: e.propositionHash,
    reserveUwolo: reserve.toString(),
    vaultEvidenceHash: v.evidenceHash,
  });
}
