import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  buildWoloRestTxLookupUrl,
  getWoloMainnetDisplayStartAt,
  isWoloMainnet,
  toUwoLoAmount,
} from "@/lib/woloChain";
import { resolveCommunityTreasuryAddressConfig } from "@/lib/woloCommunityTreasury";
import {
  executeWoloSettlementRun,
  getWoloPayoutSignerRuntime,
  hasWoloPayoutExecutionConfigured,
  validateWoloAddress,
  validateWoloSettlementRun,
  type SettlementRunPayoutInput,
  type SettlementRunResult,
} from "@/lib/woloBetSettlement";

export const STAKING_TREASURY_PAYOUT_BACKFILL_DISTRIBUTION_IDS = [1, 2] as const;

const SOURCE_APP = "aoe2hdbets";
const EXECUTION_STALE_MS = 15 * 60 * 1000;
const ADVISORY_LOCK_NAMESPACE = 752108;

const STAKING_TREASURY_DISTRIBUTION_SELECT = {
  id: true,
  distributionDate: true,
  periodStart: true,
  periodEnd: true,
  bettingFeePoolWolo: true,
  stakerPoolWolo: true,
  treasuryPoolWolo: true,
  status: true,
  treasuryPayoutStatus: true,
  treasuryPayoutRequestId: true,
  treasuryPayoutTxHash: true,
  treasuryPayoutAttemptedAt: true,
  treasuryPayoutExecutedAt: true,
  treasuryPayoutError: true,
  finalizedAt: true,
} as const;

type StakingTreasuryDistributionRow = Prisma.StakingRewardDistributionGetPayload<{
  select: typeof STAKING_TREASURY_DISTRIBUTION_SELECT;
}>;

type StakingTreasuryDbClient = PrismaClient | Prisma.TransactionClient;

export type StakingTreasuryPayoutState =
  | "ready"
  | "blocked"
  | "failed"
  | "paid"
  | "processing"
  | "not_ready";

export type StakingTreasuryPayoutStatus =
  | "UNPAID"
  | "PROCESSING"
  | "PAID"
  | "FAILED";

export type StakingTreasuryPayoutBalanceCheck = {
  ok: boolean | null;
  signerBalanceBeforeUWolo: string | null;
  requestedTotalUWolo: string | null;
  projectedRemainingUWolo: string | null;
  estimatedFeeTotalUWolo: string | null;
  detail: string | null;
};

export type StakingTreasuryPayoutPlan = {
  id: number;
  distributionDate: string;
  periodStart: string;
  periodEnd: string;
  finalizedAt: string | null;
  status: string;
  state: StakingTreasuryPayoutState;
  stateLabel: string;
  stateDetail: string;
  amountWolo: number;
  requestId: string;
  settlementRunId: string;
  sourceEventId: string;
  signerRole: "payout";
  signingRail: string;
  signerAddress: string | null;
  payoutExecutionConfigured: boolean;
  recipientAddress: string | null;
  recipientLabel: string;
  recipientConfigSource: string | null;
  treasuryPayoutStatus: string;
  treasuryPayoutTxHash: string | null;
  treasuryPayoutProofUrl: string | null;
  treasuryPayoutAttemptedAt: string | null;
  treasuryPayoutExecutedAt: string | null;
  treasuryPayoutError: string | null;
  blockers: string[];
  canExecute: boolean;
  dryRun: SettlementRunResult | null;
  balanceCheck: StakingTreasuryPayoutBalanceCheck;
};

export type StakingTreasuryPayoutsPayload = {
  ok: true;
  checkedAt: string;
  dryRun: boolean;
  backfillDistributionIds: number[];
  signer: {
    role: "payout";
    signingRail: string;
    address: string | null;
    configured: boolean;
  };
  recipient: {
    label: string;
    address: string | null;
    configSource: string | null;
  };
  summary: {
    openCount: number;
    paidCount: number;
    failedCount: number;
    processingCount: number;
    blockedCount: number;
    readyCount: number;
    totalOwedWolo: number;
    totalPaidWolo: number;
    dryRunReadyCount: number;
    dryRunBlockedCount: number;
  };
  rows: StakingTreasuryPayoutPlan[];
  paidRows: StakingTreasuryPayoutPlan[];
};

export type StakingTreasuryPayoutExecutionResult = {
  ok: boolean;
  plan: StakingTreasuryPayoutPlan;
  execution: SettlementRunResult;
};

export class StakingTreasuryPayoutError extends Error {
  status: number;
  code: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "StakingTreasuryPayoutError";
    this.status = options?.status ?? 409;
    this.code = options?.code ?? "STAKING_TREASURY_PAYOUT_ERROR";
  }
}

export function stakingTreasuryDistributionDateKey(input: Date | string) {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) {
    return "unknown-date";
  }
  return date.toISOString().slice(0, 10);
}

export function buildStakingTreasuryPayoutRequestId(input: Date | string) {
  return `aoe2-staking-treasury-${stakingTreasuryDistributionDateKey(input)}:community`;
}

function buildSettlementRunId(row: Pick<StakingTreasuryDistributionRow, "id" | "distributionDate">) {
  return `aoe2hdbets:staking-treasury-${stakingTreasuryDistributionDateKey(row.distributionDate)}-${row.id}:v1`;
}

function buildSourceEventId(row: Pick<StakingTreasuryDistributionRow, "id">) {
  return `staking-treasury-${row.id}`;
}

function compactError(value: string | null | undefined) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 500) : null;
}

function normalizePayoutStatus(value: string | null | undefined): StakingTreasuryPayoutStatus {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "PROCESSING" || normalized === "PAID" || normalized === "FAILED") {
    return normalized;
  }
  return "UNPAID";
}

function isFinalized(row: StakingTreasuryDistributionRow) {
  return row.status.trim().toUpperCase() === "FINALIZED";
}

function isFreshProcessing(row: StakingTreasuryDistributionRow) {
  if (normalizePayoutStatus(row.treasuryPayoutStatus) !== "PROCESSING") return false;
  const attemptedAt = row.treasuryPayoutAttemptedAt?.getTime() ?? 0;
  return attemptedAt > 0 && Date.now() - attemptedAt < EXECUTION_STALE_MS;
}

function resolveSigningRail() {
  const runtime = getWoloPayoutSignerRuntime();
  if (runtime.settlementServiceConfigured) {
    return "settlement_service_grouped_run";
  }
  if (runtime.localSignerFallbackConfigured) {
    return "local_payout_signer_fallback";
  }
  if (runtime.localSignerFallbackEnabled) {
    return "local_payout_signer_fallback_unconfigured";
  }
  return "unconfigured";
}

function buildBalanceCheck(run: SettlementRunResult | null): StakingTreasuryPayoutBalanceCheck {
  return {
    ok: run ? run.ok : null,
    signerBalanceBeforeUWolo: run?.signerBalanceBeforeUWolo ?? null,
    requestedTotalUWolo: run?.requestedTotalUWolo ?? null,
    projectedRemainingUWolo: run?.projectedRemainingUWolo ?? null,
    estimatedFeeTotalUWolo: run?.estimatedFeeTotalUWolo ?? null,
    detail: run?.detail ?? null,
  };
}

function buildBlockers(row: StakingTreasuryDistributionRow) {
  const blockers: string[] = [];
  const runtime = getWoloPayoutSignerRuntime();
  const treasuryConfig = resolveCommunityTreasuryAddressConfig();
  const treasuryAddress = treasuryConfig.address?.trim() || null;

  if (!isFinalized(row)) {
    blockers.push("Distribution is not FINALIZED yet.");
  }
  if (row.treasuryPoolWolo <= 0) {
    blockers.push("Distribution has no positive Treasury pool.");
  }
  if (!treasuryAddress) {
    blockers.push("WOLO_COMMUNITY_TREASURY_ADDRESS is not configured.");
  } else {
    const addressError = validateWoloAddress(treasuryAddress);
    if (addressError) {
      blockers.push(`Community Treasury address is invalid: ${addressError}`);
    }
  }
  if (!runtime.payoutAddress) {
    blockers.push("WOLO_BET_PAYOUT_ADDRESS is not configured for the Bet Payout signer.");
  }
  if (!hasWoloPayoutExecutionConfigured()) {
    blockers.push("WOLO payout execution is not configured in this environment.");
  }
  if (normalizePayoutStatus(row.treasuryPayoutStatus) === "PAID" && !row.treasuryPayoutTxHash) {
    blockers.push("Treasury payout is marked PAID but has no tx hash; operator review is required.");
  }

  return Array.from(new Set(blockers));
}

function determinePlanState(row: StakingTreasuryDistributionRow, blockers: string[]) {
  const payoutStatus = normalizePayoutStatus(row.treasuryPayoutStatus);

  if (row.treasuryPayoutTxHash) {
    return {
      state: "paid" as const,
      stateLabel: "Treasury paid",
      stateDetail: "This distribution has a recorded Community Treasury payout transaction.",
    };
  }

  if (isFreshProcessing(row)) {
    return {
      state: "processing" as const,
      stateLabel: "Executing",
      stateDetail: "A Treasury payout attempt is already in progress. Refresh before retrying.",
    };
  }

  if (!isFinalized(row)) {
    return {
      state: "not_ready" as const,
      stateLabel: "Not ready",
      stateDetail: "Only FINALIZED staking reward distributions are eligible for Treasury payout.",
    };
  }

  if (blockers.length > 0) {
    return {
      state: "blocked" as const,
      stateLabel: "Needs review",
      stateDetail: blockers[0],
    };
  }

  if (payoutStatus === "FAILED") {
    return {
      state: "failed" as const,
      stateLabel: "Failed / retryable",
      stateDetail: row.treasuryPayoutError || "Last Treasury payout attempt failed and can be retried.",
    };
  }

  return {
    state: "ready" as const,
    stateLabel: "Ready",
    stateDetail: "Dry-run confirms the Bet Payout source, balance, recipient, and amount before execution.",
  };
}

function baseCanExecute(plan: Pick<StakingTreasuryPayoutPlan, "state" | "blockers">) {
  return (plan.state === "ready" || plan.state === "failed") && plan.blockers.length === 0;
}

export function buildStakingTreasuryPayoutPlan(
  row: StakingTreasuryDistributionRow,
  options?: { dryRun?: SettlementRunResult | null }
): StakingTreasuryPayoutPlan {
  const runtime = getWoloPayoutSignerRuntime();
  const treasuryConfig = resolveCommunityTreasuryAddressConfig();
  const requestId =
    row.treasuryPayoutRequestId?.trim() ||
    buildStakingTreasuryPayoutRequestId(row.distributionDate);
  const blockers = buildBlockers(row);
  const state = determinePlanState(row, blockers);
  const dryRun = options?.dryRun ?? null;
  const plan = {
    id: row.id,
    distributionDate: stakingTreasuryDistributionDateKey(row.distributionDate),
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    status: row.status,
    state: state.state,
    stateLabel: state.stateLabel,
    stateDetail: state.stateDetail,
    amountWolo: row.treasuryPoolWolo,
    requestId,
    settlementRunId: buildSettlementRunId(row),
    sourceEventId: buildSourceEventId(row),
    signerRole: "payout" as const,
    signingRail: resolveSigningRail(),
    signerAddress: runtime.payoutAddress,
    payoutExecutionConfigured: hasWoloPayoutExecutionConfigured(),
    recipientAddress: treasuryConfig.address?.trim() || null,
    recipientLabel: "Community Treasury",
    recipientConfigSource: treasuryConfig.sourceLabel,
    treasuryPayoutStatus: normalizePayoutStatus(row.treasuryPayoutStatus),
    treasuryPayoutTxHash: row.treasuryPayoutTxHash?.trim() || null,
    treasuryPayoutProofUrl: buildWoloRestTxLookupUrl(row.treasuryPayoutTxHash),
    treasuryPayoutAttemptedAt: row.treasuryPayoutAttemptedAt?.toISOString() ?? null,
    treasuryPayoutExecutedAt: row.treasuryPayoutExecutedAt?.toISOString() ?? null,
    treasuryPayoutError: row.treasuryPayoutError ?? null,
    blockers,
    canExecute: false,
    dryRun,
    balanceCheck: buildBalanceCheck(dryRun),
  } satisfies StakingTreasuryPayoutPlan;

  return {
    ...plan,
    canExecute: baseCanExecute(plan) && (dryRun ? dryRun.ok : true),
  };
}

function buildSettlementRunInput(plan: StakingTreasuryPayoutPlan) {
  return {
    settlementRunId: plan.settlementRunId,
    sourceApp: SOURCE_APP,
    sourceEventId: plan.sourceEventId,
    note: `Staking Treasury payout · distribution #${plan.id} · ${plan.distributionDate}`,
    memo: `AoE2 staking Treasury ${plan.distributionDate}`,
    payouts: [
      {
        requestId: plan.requestId,
        toAddress: plan.recipientAddress || "",
        amountWolo: plan.amountWolo,
        memo: `AoE2 staking Treasury ${plan.distributionDate}`,
      },
    ] satisfies SettlementRunPayoutInput[],
  };
}

function firstRunSigner(run: SettlementRunResult | null) {
  const payoutSigner = run?.payouts.find(
    (payout) => payout.signerRole || payout.signerAddress
  );
  return {
    role: run?.signerRole || payoutSigner?.signerRole || null,
    address: run?.signerAddress || payoutSigner?.signerAddress || null,
  };
}

function syntheticRun(
  plan: StakingTreasuryPayoutPlan,
  input: { code: string; detail: string; retryable?: boolean }
): SettlementRunResult {
  return {
    ok: false,
    dryRun: true,
    status: "failed",
    failureCode: input.code,
    retryable: input.retryable ?? true,
    idempotentReplay: false,
    settlementRunId: plan.settlementRunId,
    sourceApp: SOURCE_APP,
    sourceEventId: plan.sourceEventId,
    note: `Staking Treasury payout · distribution #${plan.id} · ${plan.distributionDate}`,
    memo: `AoE2 staking Treasury ${plan.distributionDate}`,
    signerRole: "payout",
    signerAddress: plan.signerAddress,
    signerBalanceBeforeUWolo: null,
    requestedPayoutCount: 1,
    executedPayoutCount: 0,
    confirmedPayoutCount: 0,
    acceptedPayoutCount: 0,
    refusedPayoutCount: 1,
    replayPayoutCount: 0,
    requestedTotalUWolo: toUwoLoAmount(plan.amountWolo),
    executedTotalUWolo: "0",
    projectedRemainingUWolo: null,
    estimatedFeeTotalUWolo: null,
    warnings: [input.detail],
    detail: input.detail,
    payouts: [
      {
        index: 0,
        requestId: plan.requestId,
        attempted: false,
        ok: false,
        status: "skipped",
        outcome: "blocked",
        failureCode: input.code,
        retryable: input.retryable ?? true,
        idempotentReplay: false,
        signerRole: "payout",
        signerAddress: plan.signerAddress,
        toAddress: plan.recipientAddress,
        amountUWolo: toUwoLoAmount(plan.amountWolo),
        amountWolo: String(plan.amountWolo),
        memo: `AoE2 staking Treasury ${plan.distributionDate}`,
        txHash: null,
        detail: input.detail,
        proofUrl: null,
        canonicalTxLookupPublic: null,
        canonicalTxLookupInternal: null,
      },
    ],
  };
}

function enforcePayoutRunSource(
  plan: StakingTreasuryPayoutPlan,
  run: SettlementRunResult | null,
  options?: { requireVerifiedSigner?: boolean }
) {
  if (!run) return null;

  const signer = firstRunSigner(run);
  const role = signer.role?.trim().toLowerCase() || null;
  const address = signer.address?.trim() || null;
  const expectedAddress = plan.signerAddress?.trim() || null;
  const roleMismatch = role !== null && role !== "payout";
  const addressMismatch =
    address !== null &&
    expectedAddress !== null &&
    address.toLowerCase() !== expectedAddress.toLowerCase();
  const requiresVerifiedSigner = options?.requireVerifiedSigner ?? false;
  const missingRole = requiresVerifiedSigner && run.ok && !role;
  const missingAddress = requiresVerifiedSigner && run.ok && !address;
  const verified =
    run.ok &&
    role === "payout" &&
    Boolean(address) &&
    (!expectedAddress || address?.toLowerCase() === expectedAddress.toLowerCase());

  if (
    !roleMismatch &&
    !addressMismatch &&
    !missingRole &&
    !missingAddress &&
    (!run.ok || !requiresVerifiedSigner || verified)
  ) {
    return run;
  }

  const detail = roleMismatch
    ? `WoloChain grouped run reported signer role ${role}; staking Treasury payouts must execute from the Bet Payout signer.`
    : addressMismatch
      ? `WoloChain grouped run reported signer ${address}; expected Bet Payout ${expectedAddress}.`
      : missingRole
        ? "WoloChain grouped run did not confirm signer_role=payout for this staking Treasury payout."
        : "WoloChain grouped run did not confirm the Bet Payout signer address for this staking Treasury payout.";

  return {
    ...run,
    ok: false,
    status: "failed",
    failureCode: "PAYOUT_SIGNER_UNVERIFIED",
    retryable: false,
    detail,
  } satisfies SettlementRunResult;
}

async function validatePlanDryRun(plan: StakingTreasuryPayoutPlan) {
  if (!baseCanExecute(plan)) {
    return null;
  }
  const dryRun = await validateWoloSettlementRun(buildSettlementRunInput(plan));
  if (!dryRun) {
    return syntheticRun(plan, {
      code: "PAYOUT_DRY_RUN_UNAVAILABLE",
      detail: "WOLO grouped payout dry-run is not available; refusing to execute without a Bet Payout balance check.",
      retryable: false,
    });
  }
  return enforcePayoutRunSource(plan, dryRun, { requireVerifiedSigner: true });
}

async function requireExecutablePayoutDryRun(plan: StakingTreasuryPayoutPlan) {
  const dryRun = await validatePlanDryRun(plan);
  if (!dryRun) {
    throw new StakingTreasuryPayoutError(
      "Staking Treasury payout is not executable in its current state.",
      { status: 409, code: "PLAN_NOT_EXECUTABLE" }
    );
  }
  if (!dryRun.ok) {
    throw new StakingTreasuryPayoutError(
      dryRun.detail || dryRun.failureCode || "WOLO payout dry-run failed.",
      { status: 409, code: dryRun.failureCode || "PAYOUT_DRY_RUN_FAILED" }
    );
  }
  return dryRun;
}

function summarizePlans(
  rows: StakingTreasuryPayoutPlan[],
  paidRows: StakingTreasuryPayoutPlan[],
  dryRun: boolean
): StakingTreasuryPayoutsPayload {
  const runtime = getWoloPayoutSignerRuntime();
  const treasuryConfig = resolveCommunityTreasuryAddressConfig();
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    dryRun,
    backfillDistributionIds: isWoloMainnet()
      ? []
      : [...STAKING_TREASURY_PAYOUT_BACKFILL_DISTRIBUTION_IDS],
    signer: {
      role: "payout",
      signingRail: resolveSigningRail(),
      address: runtime.payoutAddress,
      configured: hasWoloPayoutExecutionConfigured(),
    },
    recipient: {
      label: "Community Treasury",
      address: treasuryConfig.address,
      configSource: treasuryConfig.sourceLabel,
    },
    summary: {
      openCount: rows.length,
      paidCount: paidRows.length,
      failedCount: rows.filter((plan) => plan.state === "failed").length,
      processingCount: rows.filter((plan) => plan.state === "processing").length,
      blockedCount: rows.filter((plan) => plan.state === "blocked").length,
      readyCount: rows.filter((plan) => plan.state === "ready").length,
      totalOwedWolo: rows.reduce((sum, plan) => sum + plan.amountWolo, 0),
      totalPaidWolo: paidRows.reduce((sum, plan) => sum + plan.amountWolo, 0),
      dryRunReadyCount: rows.filter((plan) => plan.dryRun?.ok).length,
      dryRunBlockedCount: rows.filter((plan) => plan.dryRun && !plan.dryRun.ok).length,
    },
    rows,
    paidRows,
  };
}

export async function loadStakingTreasuryPayoutPlans(
  prisma: PrismaClient,
  options?: {
    dryRun?: boolean;
    ids?: number[];
    take?: number;
  }
): Promise<StakingTreasuryPayoutsPayload> {
  const ids = options?.ids?.filter((id) => Number.isInteger(id) && id > 0) ?? [];
  const take = Math.max(1, Math.min(options?.take ?? 40, 100));
  const idFilter = ids.length > 0 ? { id: { in: ids } } : {};
  const mainnetFilter =
    ids.length === 0 && isWoloMainnet()
      ? { distributionDate: { gte: getWoloMainnetDisplayStartAt() } }
      : {};
  const [openRows, paidRows] = await Promise.all([
    prisma.stakingRewardDistribution.findMany({
      where: {
        ...idFilter,
        ...mainnetFilter,
        status: "FINALIZED",
        treasuryPoolWolo: { gt: 0 },
        treasuryPayoutTxHash: null,
      },
      orderBy: [{ distributionDate: "desc" }, { id: "desc" }],
      take,
      select: STAKING_TREASURY_DISTRIBUTION_SELECT,
    }),
    prisma.stakingRewardDistribution.findMany({
      where: {
        ...idFilter,
        ...mainnetFilter,
        status: "FINALIZED",
        treasuryPoolWolo: { gt: 0 },
        treasuryPayoutTxHash: { not: null },
      },
      orderBy: [{ treasuryPayoutExecutedAt: "desc" }, { distributionDate: "desc" }, { id: "desc" }],
      take,
      select: STAKING_TREASURY_DISTRIBUTION_SELECT,
    }),
  ]);

  let plans = openRows.map((row) => buildStakingTreasuryPayoutPlan(row));
  if (options?.dryRun) {
    plans = await Promise.all(
      plans.map(async (plan) => {
        try {
          const dryRun = await validatePlanDryRun(plan);
          return buildStakingTreasuryPayoutPlan(
            {
              id: plan.id,
              distributionDate: new Date(plan.distributionDate),
              periodStart: new Date(plan.periodStart),
              periodEnd: new Date(plan.periodEnd),
              bettingFeePoolWolo: 0,
              stakerPoolWolo: 0,
              treasuryPoolWolo: plan.amountWolo,
              status: plan.status,
              treasuryPayoutStatus: plan.treasuryPayoutStatus,
              treasuryPayoutRequestId: plan.requestId,
              treasuryPayoutTxHash: plan.treasuryPayoutTxHash,
              treasuryPayoutAttemptedAt: plan.treasuryPayoutAttemptedAt
                ? new Date(plan.treasuryPayoutAttemptedAt)
                : null,
              treasuryPayoutExecutedAt: plan.treasuryPayoutExecutedAt
                ? new Date(plan.treasuryPayoutExecutedAt)
                : null,
              treasuryPayoutError: plan.treasuryPayoutError,
              finalizedAt: plan.finalizedAt ? new Date(plan.finalizedAt) : null,
            },
            { dryRun }
          );
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : "WOLO payout dry-run failed.";
          const dryRun = syntheticRun(plan, {
            code: "DRY_RUN_FAILED",
            detail,
            retryable: true,
          });
          return { ...plan, dryRun, balanceCheck: buildBalanceCheck(dryRun), canExecute: false };
        }
      })
    );
  }

  return summarizePlans(
    plans,
    paidRows.map((row) => buildStakingTreasuryPayoutPlan(row)),
    Boolean(options?.dryRun)
  );
}

async function loadSinglePayoutPlan(
  prisma: StakingTreasuryDbClient,
  distributionId: number
) {
  const row = await prisma.stakingRewardDistribution.findUnique({
    where: { id: distributionId },
    select: STAKING_TREASURY_DISTRIBUTION_SELECT,
  });
  return row ? buildStakingTreasuryPayoutPlan(row) : null;
}

function assertExecutablePlan(plan: StakingTreasuryPayoutPlan) {
  if (plan.treasuryPayoutTxHash || plan.state === "paid") {
    throw new StakingTreasuryPayoutError("Staking Treasury payout is already paid.", {
      status: 409,
      code: "ALREADY_PAID",
    });
  }
  if (plan.state === "processing") {
    throw new StakingTreasuryPayoutError(
      "Staking Treasury payout is already executing. Refresh before retrying.",
      { status: 409, code: "EXECUTION_IN_PROGRESS" }
    );
  }
  if (plan.state === "not_ready") {
    throw new StakingTreasuryPayoutError(plan.stateDetail, {
      status: 409,
      code: "NOT_READY",
    });
  }
  if (plan.amountWolo <= 0) {
    throw new StakingTreasuryPayoutError("Distribution has no positive Treasury amount.", {
      status: 409,
      code: "NO_TREASURY_AMOUNT",
    });
  }
  if (!plan.recipientAddress) {
    throw new StakingTreasuryPayoutError("Community Treasury recipient address is missing.", {
      status: 409,
      code: "RECIPIENT_MISSING",
    });
  }
  if (!plan.signerAddress) {
    throw new StakingTreasuryPayoutError("Bet Payout signer address is missing.", {
      status: 409,
      code: "PAYOUT_SIGNER_MISSING",
    });
  }
  if (plan.blockers.length > 0) {
    throw new StakingTreasuryPayoutError(plan.blockers[0], {
      status: 409,
      code: "PLAN_BLOCKED",
    });
  }
}

async function markPayoutExecutionStarted(
  prisma: PrismaClient,
  distributionId: number
): Promise<StakingTreasuryPayoutPlan> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, ${distributionId})`;
    const plan = await loadSinglePayoutPlan(tx, distributionId);
    if (!plan) {
      throw new StakingTreasuryPayoutError("Staking reward distribution not found.", {
        status: 404,
        code: "NOT_FOUND",
      });
    }
    assertExecutablePlan(plan);

    const staleCutoff = new Date(Date.now() - EXECUTION_STALE_MS);
    const updated = await tx.stakingRewardDistribution.updateMany({
      where: {
        id: distributionId,
        treasuryPayoutTxHash: null,
        OR: [
          { treasuryPayoutStatus: { in: ["UNPAID", "FAILED"] } },
          { treasuryPayoutStatus: "PROCESSING", treasuryPayoutAttemptedAt: { lt: staleCutoff } },
          { treasuryPayoutStatus: "PROCESSING", treasuryPayoutAttemptedAt: null },
        ],
      },
      data: {
        treasuryPayoutStatus: "PROCESSING",
        treasuryPayoutAttemptedAt: new Date(),
        treasuryPayoutError: null,
      },
    });

    if (updated.count !== 1) {
      throw new StakingTreasuryPayoutError(
        "Staking Treasury payout could not be marked for execution; refresh before retrying.",
        { status: 409, code: "EXECUTION_MARK_FAILED" }
      );
    }

    return plan;
  });
}

function payoutResultForPlan(plan: StakingTreasuryPayoutPlan, run: SettlementRunResult) {
  return run.payouts.find((payout) => payout.requestId === plan.requestId) ?? null;
}

async function recordPayoutFailure(
  prisma: PrismaClient,
  distributionId: number,
  detail: string
) {
  await prisma.stakingRewardDistribution.updateMany({
    where: {
      id: distributionId,
      treasuryPayoutTxHash: null,
    },
    data: {
      treasuryPayoutStatus: "FAILED",
      treasuryPayoutError: compactError(detail),
      treasuryPayoutAttemptedAt: new Date(),
    },
  });
}

async function recordExecutionResult(
  prisma: PrismaClient,
  plan: StakingTreasuryPayoutPlan,
  execution: SettlementRunResult
): Promise<StakingTreasuryPayoutPlan> {
  const payout = payoutResultForPlan(plan, execution);
  const txHash = payout?.txHash?.trim() || null;
  const succeeded = Boolean(payout?.ok && txHash && execution.ok);
  const now = new Date();

  if (succeeded) {
    const updated = await prisma.stakingRewardDistribution.updateMany({
      where: {
        id: plan.id,
        treasuryPayoutTxHash: null,
      },
      data: {
        treasuryPayoutStatus: "PAID",
        treasuryPayoutTxHash: txHash,
        treasuryPayoutExecutedAt: now,
        treasuryPayoutError: null,
      },
    });

    if (updated.count !== 1) {
      const current = await loadSinglePayoutPlan(prisma, plan.id);
      if (current?.treasuryPayoutTxHash) {
        return current;
      }
      throw new StakingTreasuryPayoutError(
        "Treasury payout executed but the distribution ledger could not be updated.",
        { status: 500, code: "LEDGER_UPDATE_FAILED" }
      );
    }
  } else {
    const detail = compactError(
      payout?.detail ||
        payout?.failureCode ||
        execution.detail ||
        execution.failureCode ||
        "Staking Treasury payout did not return a confirmed tx hash."
    );
    await recordPayoutFailure(prisma, plan.id, detail || "Staking Treasury payout failed.");
  }

  const updatedPlan = await loadSinglePayoutPlan(prisma, plan.id);
  if (!updatedPlan) {
    throw new StakingTreasuryPayoutError("Staking reward distribution not found after execution.", {
      status: 404,
      code: "NOT_FOUND_AFTER_EXECUTION",
    });
  }
  return updatedPlan;
}

export async function executeStakingTreasuryPayout(
  prisma: PrismaClient,
  distributionId: number
): Promise<StakingTreasuryPayoutExecutionResult> {
  let markedPlan: StakingTreasuryPayoutPlan | null = null;

  try {
    markedPlan = await markPayoutExecutionStarted(prisma, distributionId);
    await requireExecutablePayoutDryRun(markedPlan);
    const execution = enforcePayoutRunSource(
      markedPlan,
      await executeWoloSettlementRun(buildSettlementRunInput(markedPlan)),
      { requireVerifiedSigner: false }
    );

    if (!execution) {
      throw new StakingTreasuryPayoutError(
        "WOLO payout execution did not return a settlement run result.",
        { status: 409, code: "PAYOUT_EXECUTION_UNAVAILABLE" }
      );
    }

    const plan = await recordExecutionResult(prisma, markedPlan, execution);
    return {
      ok: execution.ok && plan.state === "paid",
      plan,
      execution,
    };
  } catch (error) {
    if (markedPlan) {
      const detail = error instanceof Error ? error.message : "Staking Treasury payout failed.";
      await recordPayoutFailure(prisma, markedPlan.id, detail);
    }
    if (error instanceof StakingTreasuryPayoutError) {
      throw error;
    }
    throw new StakingTreasuryPayoutError(
      error instanceof Error ? error.message : "Staking Treasury payout failed.",
      { status: 500, code: "PAYOUT_EXECUTION_FAILED" }
    );
  }
}
