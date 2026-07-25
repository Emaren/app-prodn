import "dotenv/config";

import {
  inspectLegacyChallengePreparation,
  LegacyChallengePreparationError,
  prepareLegacyChallengeTerminal,
  type LegacyChallengePreparationAssertions,
} from "@/lib/legacyChallengePreparation";
import { getPrisma } from "@/lib/prisma";

function valueFor(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredInteger(name: string) {
  const raw = valueFor(name);
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name}=<non-negative integer> is required.`);
  }
  return parsed;
}

function requiredText(name: string) {
  const value = valueFor(name)?.trim() || "";
  if (!value) {
    throw new Error(`--${name}=<exact value> is required.`);
  }
  return value;
}

function printPlan(
  label: string,
  plan: Awaited<ReturnType<typeof inspectLegacyChallengePreparation>>
) {
  console.log(`\n== ${label} ==`);
  console.log(
    JSON.stringify(
      {
        id: plan.id,
        legacy: plan.legacy,
        alreadyPrepared: plan.alreadyPrepared,
        previousStatus: plan.previousStatus,
        currentStatus: plan.currentStatus,
        targetStatus: plan.targetStatus,
        dueAt: plan.dueAt,
        participants: plan.participants,
        terms: plan.terms,
        funding: plan.funding,
        linkedExposure: plan.linkedExposure,
        operationKey: plan.operationKey,
        confirmation: plan.confirmation,
        blockers: plan.blockers,
      },
      null,
      2
    )
  );
}

function printApplyRequirements(
  plan: Awaited<ReturnType<typeof inspectLegacyChallengePreparation>>
) {
  console.log("\nPreparation is a database-only terminal transition. It never calls WoloChain.");
  if (plan.blockers.length > 0) {
    console.log("STOP: blockers must be resolved before preparation.");
    return;
  }
  console.log("To prepare this one exact row, rerun with all of these assertions:");
  console.log(`  --apply`);
  console.log(`  --expected-status=${plan.previousStatus}`);
  console.log(`  --expected-left-uid=${plan.participants.left.uid}`);
  console.log(`  --expected-right-uid=${plan.participants.right.uid}`);
  console.log(`  --expected-wager-wolo=${plan.terms.wagerAmountWolo}`);
  console.log(`  --expected-guarantee-wolo=${plan.terms.guaranteeAmountWolo}`);
  console.log(`  --expected-funding-fingerprint=${plan.funding.fingerprint}`);
  console.log(`  --confirm=${plan.confirmation}`);
}

const apply = process.argv.includes("--apply");
const idRaw = valueFor("id");
const challengeId = Number.parseInt(idRaw || "", 10);

if (!Number.isInteger(challengeId) || challengeId < 1) {
  console.error(
    "Usage: npm run challenge:legacy-prepare -- --id=<scheduled-match-id> [--apply plus exact assertions]"
  );
  process.exit(1);
}

const actorRaw = valueFor("actor-user-id");
const actorUserId = actorRaw ? Number.parseInt(actorRaw, 10) : null;
if (actorRaw && (!Number.isInteger(actorUserId) || (actorUserId ?? 0) < 1)) {
  console.error("--actor-user-id must be a positive integer when supplied.");
  process.exit(1);
}

const prisma = getPrisma();

try {
  const before = await inspectLegacyChallengePreparation(prisma, challengeId);
  printPlan("READ-ONLY LEGACY CHALLENGE PRE-FLIGHT", before);

  if (!apply) {
    printApplyRequirements(before);
    console.log("\nPASS: read-only audit complete. No database state changed and no funds moved.");
  } else {
    const assertions: LegacyChallengePreparationAssertions = {
      expectedStatus: requiredText("expected-status"),
      expectedLeftUid: requiredText("expected-left-uid"),
      expectedRightUid: requiredText("expected-right-uid"),
      expectedWagerAmountWolo: requiredInteger("expected-wager-wolo"),
      expectedGuaranteeAmountWolo: requiredInteger("expected-guarantee-wolo"),
      expectedFundingFingerprint: requiredText("expected-funding-fingerprint"),
      confirmation: requiredText("confirm"),
    };

    const result = await prepareLegacyChallengeTerminal(prisma, {
      challengeId,
      actorUserId,
      ...assertions,
    });
    printPlan(
      result.idempotentReplay
        ? "IDEMPOTENT PREPARATION RECEIPT"
        : "TERMINAL PREPARATION RECEIPT",
      result.plan
    );

    console.log(
      result.idempotentReplay
        ? "\nPASS: the exact preparation was already applied. No duplicate activity was appended."
        : "\nPASS: exact legacy row prepared and immutable activity appended."
    );
    console.log("No WoloChain call was made and no funds moved.");
    if (result.plan.funding.exactRefundWolo > 0) {
      console.log(
        `Next: review challenge #${challengeId} in /admin/wolochain. Its separate settlement rail must pass the exact dry-run before an admin confirms execution.`
      );
    } else {
      console.log("No settlement action is required because no funding was recorded.");
    }
  }
} catch (error) {
  const code =
    error instanceof LegacyChallengePreparationError ? ` [${error.code}]` : "";
  console.error(
    `\nSTOP${code}: ${
      error instanceof Error ? error.message : "Legacy challenge preparation failed."
    }`
  );
  console.error("No chain settlement was requested by this command.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
