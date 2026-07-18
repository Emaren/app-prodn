import "dotenv/config";

import { getPrisma } from "@/lib/prisma";
import {
  executeScheduledMatchSettlement,
  loadScheduledMatchSettlementPlans,
  type ScheduledMatchSettlementPlan,
} from "@/lib/scheduledMatchSettlements";

const MATCH_ID = 24;
const EXPECTED_WAGER_WOLO = 1000;
const EXPECTED_GUARANTEE_WOLO = 10;
const EXPECTED_REFUND_WOLO = 1010;
const CONFIRMATION = "JIM-ZODIAC-24-1010";

function normalized(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function participantByName(plan: ScheduledMatchSettlementPlan, needle: string) {
  const key = normalized(needle);
  return [plan.participants.left, plan.participants.right].find((participant) =>
    normalized(participant.name).includes(key)
  ) || null;
}

function assertJimZodiacPlan(plan: ScheduledMatchSettlementPlan) {
  const jim = participantByName(plan, "jim");
  const zodiac = participantByName(plan, "zodiac");
  if (!jim || !zodiac || jim.side === zodiac.side) {
    throw new Error(
      `STOP: challenge #${MATCH_ID} no longer resolves uniquely to Jim vs Zodiac (title: ${plan.title}).`
    );
  }

  if (
    plan.terms.wagerAmountWolo !== EXPECTED_WAGER_WOLO ||
    plan.terms.guaranteeAmountWolo !== EXPECTED_GUARANTEE_WOLO ||
    plan.terms.totalFundingWolo !== EXPECTED_REFUND_WOLO
  ) {
    throw new Error(
      `STOP: challenge #${MATCH_ID} terms changed. Expected 1000 wager + 10 guarantee = 1010 WOLO; got ${plan.terms.wagerAmountWolo} + ${plan.terms.guaranteeAmountWolo} = ${plan.terms.totalFundingWolo}.`
    );
  }

  if (!["canceled", "cancelled", "expired"].includes(normalized(plan.status))) {
    throw new Error(
      `STOP: challenge #${MATCH_ID} status is ${plan.status}; expected a cancelled/expired terminal state.`
    );
  }

  if (plan.liability.fundedParticipantCount !== 1) {
    throw new Error(
      `STOP: challenge #${MATCH_ID} has ${plan.liability.fundedParticipantCount} funded participants; expected exactly 1.`
    );
  }

  if (!jim.funded || zodiac.funded) {
    throw new Error(
      `STOP: funding truth changed. Expected Jim funded=true and Zodiac funded=false; got Jim=${jim.funded}, Zodiac=${zodiac.funded}.`
    );
  }

  if (
    plan.liability.fundedLiabilityWolo !== EXPECTED_REFUND_WOLO ||
    plan.liability.plannedTransferWolo !== EXPECTED_REFUND_WOLO ||
    plan.liability.refundWolo !== EXPECTED_REFUND_WOLO ||
    plan.liability.treasuryWolo !== 0
  ) {
    throw new Error(
      `STOP: liability mismatch. Expected exactly 1010 WOLO refund and 0 treasury; got funded=${plan.liability.fundedLiabilityWolo}, planned=${plan.liability.plannedTransferWolo}, refund=${plan.liability.refundWolo}, treasury=${plan.liability.treasuryWolo}.`
    );
  }

  if (plan.transfers.length !== 1) {
    throw new Error(
      `STOP: expected exactly one transfer for challenge #${MATCH_ID}; got ${plan.transfers.length}.`
    );
  }

  const transfer = plan.transfers[0];
  if (
    transfer.reason !== "refund" ||
    transfer.amountWolo !== EXPECTED_REFUND_WOLO ||
    normalized(transfer.participantName) !== normalized(jim.name) ||
    !transfer.recipientAddress
  ) {
    throw new Error(
      `STOP: refund transfer is not the exact Jim 1010 WOLO return expected for challenge #${MATCH_ID}.`
    );
  }

  return { jim, zodiac, transfer };
}

async function readExactPlan(dryRun: boolean) {
  const prisma = getPrisma();
  const payload = await loadScheduledMatchSettlementPlans(prisma, {
    ids: [MATCH_ID],
    take: 1,
    dryRun,
  });
  if (payload.rows.length !== 1 || payload.rows[0].id !== MATCH_ID) {
    throw new Error(`STOP: challenge #${MATCH_ID} settlement plan was not found uniquely.`);
  }
  return payload.rows[0];
}

function printPlan(label: string, plan: ScheduledMatchSettlementPlan) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify({
    id: plan.id,
    title: plan.title,
    status: plan.status,
    state: plan.state,
    terms: plan.terms,
    participants: plan.participants,
    liability: plan.liability,
    blockers: plan.blockers,
    transfers: plan.transfers.map((transfer) => ({
      action: transfer.action,
      participantName: transfer.participantName,
      reason: transfer.reason,
      recipientAddress: transfer.recipientAddress,
      amountWolo: transfer.amountWolo,
      requestId: transfer.requestId,
      existingSettlement: transfer.existingSettlement,
    })),
    dryRun: plan.dryRun,
  }, null, 2));
}

const execute = process.argv.includes("--execute");
const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));
const confirm = confirmArg?.slice("--confirm=".length) || "";
const prisma = getPrisma();

try {
  const before = await readExactPlan(true);
  const { transfer } = assertJimZodiacPlan(before);
  printPlan("JIM / ZODIAC #24 PRE-FLIGHT", before);

  if (before.state === "executed") {
    if (
      transfer.existingSettlement?.status === "executed" &&
      transfer.existingSettlement.txHash
    ) {
      console.log(`\nPASS: challenge #${MATCH_ID} is already safely refunded exactly once.`);
      console.log(`tx: ${transfer.existingSettlement.txHash}`);
      process.exitCode = 0;
    } else {
      throw new Error("STOP: plan says executed but exact refund tx proof is missing.");
    }
  } else if (!execute) {
    if (before.state !== "ready" && before.state !== "failed") {
      throw new Error(`STOP: challenge #${MATCH_ID} is not executable; state=${before.state}.`);
    }
    if (before.blockers.length > 0) {
      throw new Error(`STOP: challenge #${MATCH_ID} has blockers: ${before.blockers.join(" | ")}`);
    }
    if (!before.dryRun?.ok) {
      throw new Error(
        `STOP: escrow dry-run did not pass: ${before.dryRun?.detail || before.dryRun?.failureCode || "unknown failure"}`
      );
    }
    console.log("\nPASS: exact 1010 WOLO Jim refund is ready and dry-run verified.");
    console.log(`To execute exactly once: npm run challenge:jim24 -- --execute --confirm=${CONFIRMATION}`);
  } else {
    if (confirm !== CONFIRMATION) {
      throw new Error(
        `STOP: execution requires --confirm=${CONFIRMATION}. No funds were moved.`
      );
    }
    if (before.state !== "ready" && before.state !== "failed") {
      throw new Error(`STOP: challenge #${MATCH_ID} is not executable; state=${before.state}.`);
    }
    if (before.blockers.length > 0 || !before.dryRun?.ok) {
      throw new Error("STOP: exact escrow dry-run is not green. No funds were moved.");
    }

    console.log("\n== EXECUTING EXACTLY ONE IDEMPOTENT JIM REFUND ==");
    const result = await executeScheduledMatchSettlement(prisma, MATCH_ID, null);
    console.log(JSON.stringify({
      ok: result.ok,
      execution: result.execution,
    }, null, 2));

    const after = await readExactPlan(false);
    const afterTruth = assertJimZodiacPlan(after);
    printPlan("JIM / ZODIAC #24 POST-FLIGHT", after);

    if (
      after.state !== "executed" ||
      afterTruth.transfer.existingSettlement?.status !== "executed" ||
      !afterTruth.transfer.existingSettlement.txHash
    ) {
      throw new Error(
        "STOP: execution returned but canonical database proof is not fully executed. Operator review required immediately."
      );
    }

    console.log("\nPASS: Jim's exact 1,010 WOLO challenge refund is confirmed in canonical settlement state.");
    console.log(`tx: ${afterTruth.transfer.existingSettlement.txHash}`);
  }
} finally {
  await prisma.$disconnect();
}
