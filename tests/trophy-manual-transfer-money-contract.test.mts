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

test("manual trophy custody change is serialized and money-aware", () => {
  assert.ok(actions.includes("pg_advisory_xact_lock"));
  assert.ok(actions.includes("prepareManualTrophyHolderTransferPayouts"));
  assert.ok(actions.includes("currentBountyWolo: 0"));
  assert.ok(actions.includes("holderSince: now"));
  assert.ok(actions.includes("HOLDER_DETAILS_REFRESHED"));
  assert.ok(actions.includes("const sameHolder = previousHolderId === user.id"));
  assert.ok(actions.includes('status: ["held", "active"].includes(currentTrophy.status)'));
  assert.ok(actions.includes("custodyChanged: false"));
  assert.ok(actions.includes("bountyReset: false"));
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
  assert.ok(service.includes('status: { in: ["pending", "retrying", "failed"] }'));
  assert.ok(actions.includes("includeBounties: true"));
  assert.ok(ui.includes("function trophyPayoutIsExecutable"));
  assert.ok(ui.includes('payout.payoutKind === "dethrone_bounty"'));
  assert.ok(ui.includes('["pending", "retrying", "failed"].includes(payout.status)'));
  assert.ok(ui.includes("!trophyPayoutIsExecutable(payout)"));
});
