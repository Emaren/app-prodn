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

test("manual trophy custody change is serialized and money-aware", () => {
  assert.match(actions, /pg_advisory_xact_lock/);
  assert.match(actions, /prepareManualTrophyHolderTransferPayouts/);
  assert.match(actions, /currentBountyWolo: 0/);
  assert.match(actions, /holderSince: now/);
  assert.match(actions, /HOLDER_DETAILS_REFRESHED/);
  assert.match(actions, /custodyChanged: false/);
  assert.match(actions, /bountyReset: false/);
});

test("manual transfer preserves current tribute policy and immutable chain truth", () => {
  assert.match(service, /trophyHasActiveReignTribute\(input\.trophy\.trophyId\)/);
  assert.match(service, /reconcileDailyTrophyTribute\(existing/);
  assert.match(service, /blocked_by_chain_truth/);
  assert.match(service, /DAILY_TRIBUTE_PAYOUT_SUPERSEDED/);
  assert.match(service, /status: "superseded"/);
  assert.match(service, /createdBy: "manual_holder_transfer"/);
});

test("dethrone bounty is a real Founder Rewards payout obligation", () => {
  assert.match(service, /payoutKind: "dethrone_bounty"/);
  assert.match(service, /status: "pending"/);
  assert.match(service, /Championship Bounty/);
  assert.match(service, /fundingAuthority: "Founder Rewards settlement"/);
  assert.match(
    service,
    /it is not Bet Escrow and is not the public Bounty Pool/
  );
  assert.match(service, /export async function executePendingTrophyPayouts/);
  assert.match(service, /DETHRONE_BOUNTY_PAYOUT_PAID/);
  assert.match(service, /DETHRONE_BOUNTY_PAYOUT_FAILED/);
  assert.match(service, /status: \{ in: \["pending", "retrying", "failed"\] \}/);
  assert.match(actions, /includeBounties: true/);
});
