import { execFileSync } from "node:child_process";

import { getPrisma } from "@/lib/prisma";
import {
  executeWoloEscrowSettlementRun,
  validateWoloEscrowSettlementRun,
} from "@/lib/woloBetSettlement";
import {
  getWoloBetEscrowRuntime,
  toUwoLoAmount,
} from "@/lib/woloChain";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";
import { STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED } from "@/lib/stakingExecution";
import { finalizeLegacyStakingCustodyCohort } from "@/lib/legacyStakingCustody";
import {
  LEGACY_SYNTHETIC_COMPOUND_EXPECTED,
} from "./lib/legacy-synthetic-staking-compounds.mjs";

const CONFIRMATION =
  `FINALIZE-LEGACY-STAKING-CUSTODY-${LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows}-${LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo}`;
const SETTLEMENT_RUN_ID =
  `legacy-staking-custody-v1-${LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows}-${LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo}`;

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(key.slice(2), next && !next.startsWith("--") ? next : "true");
  if (next && !next.startsWith("--")) index += 1;
}
const apply = args.get("apply") === "true";

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function exactGitApplyEnvironment() {
  const command = (name: string, commandArgs: string[]) =>
    execFileSync(name, commandArgs, { encoding: "utf8" }).trim();
  const branch = command("git", ["branch", "--show-current"]);
  const head = command("git", ["rev-parse", "HEAD"]);
  const upstream = command("git", ["rev-parse", "origin/main"]);
  const dirty = command("git", [
    "--no-optional-locks",
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (branch !== "main" || head !== upstream || dirty) {
    throw new Error(
      `Apply requires clean main exactly matching origin/main; branch=${branch} head=${head} origin=${upstream} dirty=${Boolean(dirty)}`,
    );
  }
  return { branch, head, upstream };
}

if (apply && args.get("confirm") !== CONFIRMATION) {
  throw new Error(`Apply requires --confirm ${CONFIRMATION}`);
}
if (!STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED) {
  throw new Error(
    "Legacy custody reconciliation requires ordinary staking reward distribution to remain safety-paused.",
  );
}
const applyEnvironment = apply ? exactGitApplyEnvironment() : null;

const prisma = getPrisma();
const legacyEvents = (
  await prisma.stakingEvent.findMany({
    where: {
      type: "COMPOUND",
      status: "CONFIRMED",
      txHash: { startsWith: "COMPOUND-" },
    },
    select: {
      id: true,
      userId: true,
      amountWolo: true,
      txHash: true,
      metadata: true,
    },
    orderBy: { id: "asc" },
  })
).filter((event) => {
  const metadata = metadataObject(event.metadata);
  return (
    /^COMPOUND-\d+-\d+$/i.test(event.txHash || "") &&
    metadata.internalCompound === true &&
    metadata.chainBackedCompound !== true
  );
});

const allocationIds = legacyEvents.map((event) => {
  const id = Number(metadataObject(event.metadata).stakingRewardAllocationId || 0);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Legacy compound event ${event.id} has no valid allocation id.`);
  }
  return id;
});
if (allocationIds.length !== new Set(allocationIds).size) {
  throw new Error("Legacy compound allocation links are not unique.");
}

const allocations = await prisma.stakingRewardAllocation.findMany({
  where: { id: { in: allocationIds } },
  select: {
    id: true,
    userId: true,
    rewardWolo: true,
    status: true,
    walletAddress: true,
  },
  orderBy: { id: "asc" },
});

const eventTotal = legacyEvents.reduce((sum, row) => sum + row.amountWolo, 0);
const allocationTotal = allocations.reduce((sum, row) => sum + row.rewardWolo, 0);
if (
  legacyEvents.length !== LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows ||
  allocations.length !== LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows ||
  eventTotal !== LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo ||
  allocationTotal !== LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo
) {
  throw new Error(
    `Legacy custody cohort drift: events=${legacyEvents.length}/${eventTotal} allocations=${allocations.length}/${allocationTotal}.`,
  );
}

const allocationsByUser = new Map<number, typeof allocations>();
for (const allocation of allocations) {
  const rows = allocationsByUser.get(allocation.userId) ?? [];
  rows.push(allocation);
  allocationsByUser.set(allocation.userId, rows);
}

const expectedEntries = Object.entries(
  LEGACY_SYNTHETIC_COMPOUND_EXPECTED.byUser,
).map(([userId, expected]) => ({
  userId: Number(userId),
  rows: expected.rows,
  wolo: expected.wolo,
}));

for (const expected of expectedEntries) {
  const rows = allocationsByUser.get(expected.userId) ?? [];
  const wolo = rows.reduce((sum, row) => sum + row.rewardWolo, 0);
  if (rows.length !== expected.rows || wolo !== expected.wolo) {
    throw new Error(
      `Legacy custody user cohort drift for ${expected.userId}: rows=${rows.length}/${expected.rows} wolo=${wolo}/${expected.wolo}.`,
    );
  }
}
if (allocationsByUser.size !== expectedEntries.length) {
  throw new Error("Legacy custody contains an unexpected user cohort.");
}

const statuses = new Set(allocations.map((row) => row.status));
const alreadyFinalized = statuses.size === 1 && statuses.has("COMPOUNDED");
const pending = statuses.size === 1 && statuses.has("COMPOUND_PENDING");
if (!alreadyFinalized && !pending) {
  throw new Error(
    `Legacy custody allocation state is mixed or unexpected: ${Array.from(statuses).join(",")}.`,
  );
}

const stakingRuntime = getWoloStakingRuntime();
const escrowRuntime = getWoloBetEscrowRuntime();
const stakingCustodyAddress = stakingRuntime.stakingWalletAddress?.trim() || "";
const expectedEscrowAddress = escrowRuntime.escrowAddress?.trim() || "";
if (!stakingCustodyAddress) {
  throw new Error("Canonical staking custody address is not configured.");
}
if (!expectedEscrowAddress) {
  throw new Error("Canonical bet escrow address is not configured.");
}

const plans = expectedEntries.map((expected) => {
  const rows = allocationsByUser.get(expected.userId)!;
  return {
    userId: expected.userId,
    allocationIds: rows.map((row) => row.id),
    amountWolo: expected.wolo,
    requestId: `legacy-staking-custody-v1-u${expected.userId}`,
    toAddress: stakingCustodyAddress,
    memo: `AoE2 legacy staking custody u${expected.userId}`,
  };
});

console.log("== LEGACY STAKING CUSTODY PLAN ==");
console.log(JSON.stringify({
  apply,
  applyEnvironment,
  confirmation: CONFIRMATION,
  settlementRunId: SETTLEMENT_RUN_ID,
  expectedEscrowAddress,
  stakingCustodyAddress,
  rowCount: allocations.length,
  totalWolo: allocationTotal,
  statuses: Array.from(statuses),
  plans: plans.map((plan) => ({
    userId: plan.userId,
    allocationCount: plan.allocationIds.length,
    amountWolo: plan.amountWolo,
    requestId: plan.requestId,
  })),
}, null, 2));

if (alreadyFinalized) {
  console.log("PASS: exact legacy staking custody cohort is already finalized.");
  process.exit(0);
}

const settlementInput = {
  settlementRunId: SETTLEMENT_RUN_ID,
  sourceApp: "aoe2hdbets",
  sourceEventId: "legacy-synthetic-staking-custody-v1",
  note: "Finalize historical staking rewards into canonical staking custody",
  memo: "AoE2 legacy staking custody reconciliation",
  payouts: plans.map((plan) => ({
    requestId: plan.requestId,
    toAddress: plan.toAddress,
    amountWolo: plan.amountWolo,
    memo: plan.memo,
  })),
};

const validation = await validateWoloEscrowSettlementRun(settlementInput);
if (!validation?.ok) {
  throw new Error(
    validation?.detail ||
      validation?.failureCode ||
      "Legacy staking custody settlement dry-run failed.",
  );
}
if (
  validation.signerRole !== "escrow" ||
  normalizeAddress(validation.signerAddress) !== normalizeAddress(expectedEscrowAddress)
) {
  throw new Error(
    `Legacy staking custody dry-run signer mismatch: role=${validation.signerRole} address=${validation.signerAddress}.`,
  );
}

const validationByRequestId = new Map(
  validation.payouts.map((payout) => [payout.requestId, payout] as const),
);
for (const plan of plans) {
  const payout = validationByRequestId.get(plan.requestId);
  if (
    !payout?.ok ||
    normalizeAddress(payout.toAddress) !== normalizeAddress(stakingCustodyAddress) ||
    payout.amountUWolo !== toUwoLoAmount(plan.amountWolo)
  ) {
    throw new Error(`Legacy staking custody dry-run mismatch for user ${plan.userId}.`);
  }
}

console.log("DRY_RUN_VALIDATION");
console.log(JSON.stringify({
  ok: validation.ok,
  signerRole: validation.signerRole,
  signerAddress: validation.signerAddress,
  signerBalanceBeforeUWolo: validation.signerBalanceBeforeUWolo,
  requestedTotalUWolo: validation.requestedTotalUWolo,
  projectedRemainingUWolo: validation.projectedRemainingUWolo,
  estimatedFeeTotalUWolo: validation.estimatedFeeTotalUWolo,
  idempotentReplay: validation.idempotentReplay,
}, null, 2));

if (!apply) {
  console.log(`DRY RUN ONLY. Apply requires --apply --confirm ${CONFIRMATION}`);
  process.exit(0);
}

const execution = await executeWoloEscrowSettlementRun(settlementInput);
if (!execution?.ok) {
  throw new Error(
    execution?.detail ||
      execution?.failureCode ||
      "Legacy staking custody execution failed.",
  );
}
if (
  execution.signerRole !== "escrow" ||
  normalizeAddress(execution.signerAddress) !== normalizeAddress(expectedEscrowAddress)
) {
  throw new Error("Legacy staking custody execution signer did not match canonical escrow.");
}

const payoutByRequestId = new Map(
  execution.payouts.map((payout) => [payout.requestId, payout] as const),
);
for (const plan of plans) {
  const payout = payoutByRequestId.get(plan.requestId);
  if (
    !payout?.ok ||
    !payout.txHash ||
    normalizeAddress(payout.toAddress) !== normalizeAddress(stakingCustodyAddress) ||
    payout.amountUWolo !== toUwoLoAmount(plan.amountWolo)
  ) {
    throw new Error(`Legacy staking custody execution mismatch for user ${plan.userId}.`);
  }
}

const paidAt = new Date();
await prisma.$transaction(async (tx) => {
  for (const plan of plans) {
    const payout = payoutByRequestId.get(plan.requestId)!;
    await finalizeLegacyStakingCustodyCohort(tx, {
      userId: plan.userId,
      allocationIds: plan.allocationIds,
      amountWolo: plan.amountWolo,
      payoutTxHash: payout.txHash!,
      payoutProofUrl: payout.proofUrl ?? null,
      payoutRequestId: plan.requestId,
      settlementRunId: SETTLEMENT_RUN_ID,
      settlementSignerAddress:
        payout.signerAddress || execution.signerAddress || expectedEscrowAddress,
      stakingCustodyAddress,
      paidAt,
    });
  }
});

console.log("EXECUTED");
console.log(JSON.stringify({
  ok: execution.ok,
  settlementRunId: execution.settlementRunId,
  signerAddress: execution.signerAddress,
  idempotentReplay: execution.idempotentReplay,
  totalWolo: allocationTotal,
  payouts: plans.map((plan) => {
    const payout = payoutByRequestId.get(plan.requestId)!;
    return {
      userId: plan.userId,
      amountWolo: plan.amountWolo,
      txHash: payout.txHash,
      idempotentReplay: payout.idempotentReplay,
    };
  }),
}, null, 2));
