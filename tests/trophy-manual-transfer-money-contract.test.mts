import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync(
  new URL("../lib/trophies/actions.ts", import.meta.url),
  "utf8"
);
const service = readFileSync(
  new URL("../lib/trophies/service.ts", import.meta.url),
  "utf8"
);
const ui = readFileSync(
  new URL("../components/admin/trophies/TrophyCommandCenter.tsx", import.meta.url),
  "utf8"
);
const adminRoute = readFileSync(
  new URL("../app/api/admin/trophies/route.ts", import.meta.url),
  "utf8"
);

test("manual trophy custody change is serialized and money-aware", () => {
  assert.ok(service.includes("pg_advisory_xact_lock"));
  assert.ok(service.includes("FOR UPDATE"));
  assert.ok(service.includes("TROPHY_MONEY_LOCK_NAMESPACE"));
  assert.ok(actions.includes("lockTrophyMoneyState"));
  assert.ok(actions.includes("assertChallengeCustodyStillCurrent"));
  assert.ok(actions.includes("Title custody changed after this challenge was created"));
  assert.ok(actions.includes("Guardian custody changed after this challenge was created"));
  assert.ok(actions.includes("projectedTrophyBounty(currentTrophy)"));
  const dryRunStart = actions.indexOf('if (operation === "dry_run")');
  const dryRunEnd = actions.indexOf('if (operation === "settle")', dryRunStart);
  const dryRunSettlement = actions.slice(dryRunStart, dryRunEnd);
  assert.ok(
    dryRunSettlement.indexOf("assertTrophyChallengeDesyncAllowsTitleMutation") <
      dryRunSettlement.indexOf("lockTrophyMoneyState")
  );
  assert.ok(dryRunSettlement.includes("projectedTrophyBounty(currentTrophy)"));
  const chainStart = actions.indexOf("if (chainBacked)");
  const chainEnd = actions.indexOf('if (settingMap.get("app_only_fallback_enabled")', chainStart);
  const chainSettlement = actions.slice(chainStart, chainEnd);
  assert.ok(
    chainSettlement.indexOf("assertTrophyChallengeDesyncAllowsTitleMutation") <
      chainSettlement.indexOf("lockTrophyMoneyState")
  );
  const appStart = chainEnd;
  const appEnd = actions.indexOf('if (operation === "retry")', appStart);
  const appSettlement = actions.slice(appStart, appEnd);
  assert.ok(
    appSettlement.indexOf("assertTrophyChallengeDesyncAllowsTitleMutation") <
      appSettlement.indexOf("lockTrophyMoneyState")
  );
  assert.ok(actions.includes("prepareManualTrophyHolderTransferPayouts"));
  assert.ok(actions.includes("currentBountyWolo: 0"));
  assert.ok(actions.includes("holderSince: now"));
  assert.ok(actions.includes("HOLDER_DETAILS_REFRESHED"));
  assert.ok(actions.includes("const sameHolder = previousHolderId === user.id"));
  assert.ok(actions.includes("custodyChanged: false"));
  assert.ok(actions.includes("bountyReset: false"));
});

test("daily tribute queue re-reads custody under the same money lock", () => {
  assert.ok(service.includes("const trophy = await lockTrophyMoneyState(tx, candidate.id)"));
  assert.ok(service.includes("select: { id: true }"));
  assert.ok(service.includes("trophyHasActiveReignTribute(trophy.trophyId)"));
  assert.ok(service.includes('["held", "active"].includes(trophy.status)'));
  assert.ok(service.includes("const recipientUserId = trophy.currentHolderUserId"));
  assert.ok(service.includes("const recipientWoloAddress = trophy.currentHolderWoloAddress"));
  assert.ok(service.includes("trophy.holderSince.getTime() >= dayEnd.getTime()"));
});

test("manual transfer preserves current tribute policy and immutable chain truth", () => {
  assert.ok(service.includes("trophyHasActiveReignTribute(input.trophy.trophyId)"));
  assert.ok(service.includes("reconcileDailyTrophyTribute(existing"));
  assert.ok(service.includes("blocked_by_chain_truth"));
  assert.ok(service.includes("DAILY_TRIBUTE_PAYOUT_SUPERSEDED"));
  assert.ok(service.includes('status: "superseded"'));
  assert.ok(service.includes('createdBy: "manual_holder_transfer"'));
});

test("dethrone bounty is a real Founder Rewards obligation but previews cannot execute", () => {
  assert.ok(service.includes('payoutKind: "dethrone_bounty"'));
  assert.ok(service.includes('status: "pending"'));
  assert.ok(service.includes("Championship Bounty"));
  assert.ok(service.includes('fundingAuthority: "Founder Rewards settlement"'));
  assert.ok(service.includes("it is not Bet Escrow and is not the public Bounty Pool"));
  assert.ok(service.includes("export async function executePendingTrophyPayouts"));
  assert.ok(service.includes("DETHRONE_BOUNTY_PAYOUT_PAID"));
  assert.ok(service.includes("DETHRONE_BOUNTY_PAYOUT_FAILED"));
  assert.ok(service.includes("EXECUTABLE_DETHRONE_BOUNTY_STATUSES"));
  assert.ok(service.includes("status: { in: [...EXECUTABLE_DETHRONE_BOUNTY_STATUSES] }"));
  assert.ok(actions.includes("includeBounties: true"));
  assert.ok(actions.includes("Championship bounty previews are not payable obligations"));
  assert.ok(actions.includes("cannot be converted back into a preview"));
  assert.ok(ui.includes("function trophyPayoutIsExecutable"));
  assert.ok(ui.includes('payout.payoutKind === "dethrone_bounty"'));
  assert.ok(ui.includes('["pending", "retrying", "failed"].includes(payout.status)'));
  assert.ok(ui.includes("!trophyPayoutIsExecutable(payout)"));
  assert.ok(ui.includes('payout.payoutKind === "dethrone_bounty" && payout.status === "dry_run"'));
  assert.ok(ui.includes('payout.payoutKind === "dethrone_bounty"'));
});

test("Guardian, vacancy, forfeiture, and economics use locked Trophy money state", () => {
  assert.ok(actions.includes("prepareTrophyCustodyExit"));
  assert.ok(actions.includes("GUARDIAN_DETAILS_REFRESHED"));
  assert.ok(actions.includes('case "clear_guardian"'));
  assert.ok(actions.includes("guardian_custody_cleared_before_chain_execution"));
  assert.ok(actions.includes("title_vacated_before_chain_execution"));
  assert.ok(actions.includes("title_retired_before_chain_execution"));
  assert.ok(actions.includes("national_eligibility_forfeiture_before_chain_execution"));
  assert.ok(actions.includes("Trophy cannot be marked held without a current holder"));
  assert.ok(actions.includes("Trophy cannot be marked Guardian-held without a Guardian"));
  assert.ok(actions.includes("const frozenBountyWolo = projectedTrophyBounty(currentTrophy)"));
  assert.ok(!adminRoute.includes('if (payload.action === "clear_guardian")'));
});

test("Trophy payout execution claims money authority before external settlement", () => {
  assert.ok(service.includes('status: "executing"'));
  assert.ok(service.includes("PAYOUT_EXECUTION_CLAIMED"));
  assert.ok(service.includes("trophyPayoutStatusIsExecutable"));
  assert.ok(service.includes("sameTrophyPayoutRecipient"));
  assert.ok(service.includes("custody_changed_before_execution_claim"));
  assert.ok(service.includes('row.status === "executing"'));
  assert.ok(actions.includes("Resolve the in-flight settlement before changing it"));
  assert.ok(actions.includes("Cancelled or superseded trophy payouts are terminal"));
  assert.ok(ui.includes("function trophyPayoutIsMutable"));
  assert.ok(ui.includes('payout.status !== "executing"'));
  assert.ok(ui.includes("!trophyPayoutIsMutable(payout)"));
});
