import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(
  new URL("../lib/trophies/service.ts", import.meta.url),
  "utf8"
);
const actionSource = readFileSync(
  new URL("../lib/trophies/actions.ts", import.meta.url),
  "utf8"
);
const uiSource = readFileSync(
  new URL("../components/admin/trophies/TrophyCommandCenter.tsx", import.meta.url),
  "utf8"
);

test("manual holder transfer atomically creates the new reign money obligations", () => {
  assert.match(actionSource, /pg_advisory_xact_lock/);
  assert.match(actionSource, /prepareManualTrophyHolderTransferPayouts/);
  assert.match(actionSource, /currentBountyWolo: 0/);
  assert.match(actionSource, /holderSince: now/);
  assert.match(actionSource, /bountyPayoutId/);
  assert.match(actionSource, /tributePayoutId/);
  assert.match(serviceSource, /payoutKind: "dethrone_bounty"/);
  assert.match(serviceSource, /payoutKind: "daily_tribute"/);
  assert.match(serviceSource, /DAILY_TRIBUTE_PAYOUT_SUPERSEDED/);
  assert.match(serviceSource, /status: "cancelled"/);
  assert.match(serviceSource, /row\.status !== "paid"/);
  assert.match(serviceSource, /!row\.txHash/);
});

test("trophy bounty execution uses the guarded Founder Rewards rail", () => {
  assert.match(serviceSource, /export async function executePendingTrophyPayouts/);
  assert.match(serviceSource, /\["daily_tribute", "dethrone_bounty"\]/);
  assert.match(serviceSource, /executeFounderWoloPayout/);
  assert.match(serviceSource, /requestPrefix/);
  assert.match(serviceSource, /trophy-bounty/);
  assert.match(serviceSource, /DETHRONE_BOUNTY_PAYOUT_PAID/);
  assert.match(serviceSource, /fundingAuthority: "Founder Rewards settlement"/);
  assert.match(
    serviceSource,
    /not Bet Escrow and is not the public Bounty Pool/
  );
  assert.match(actionSource, /executePendingTrophyPayouts/);
});

test("legacy manual transfers can be repaired exactly once from audited custody", () => {
  assert.match(actionSource, /repairLegacyHolderTransfer/);
  assert.match(actionSource, /LEGACY_HOLDER_TRANSFER_RECONCILED/);
  assert.match(actionSource, /economicsChangesDuringReign/);
  assert.match(actionSource, /Cannot safely infer the legacy bounty/);
  assert.match(actionSource, /existingBounty/);
  assert.match(actionSource, /accruedBountyWoloOverride: inferredBountyWolo/);
  assert.match(actionSource, /legacyTransferEventId/);
  assert.match(serviceSource, /legacyTransferRepairNeeded/);
  assert.match(uiSource, /Repair transfer payouts/);
});

test("trophy operator UI exposes identity-safe ratings and payout truth", () => {
  assert.match(serviceSource, /ratings\.byUid\.get\(user\.uid\)/);
  assert.match(serviceSource, /entry\.nameHistory\.map/);
  assert.match(uiSource, /Rating unavailable/);
  assert.doesNotMatch(uiSource, /No ELO/);
  assert.match(uiSource, /guardianHolderWoloAddress/);
  assert.match(uiSource, /Title transfer preview/);
  assert.match(uiSource, /Accrued bounty/);
  assert.match(uiSource, /New bounty clock/);
  assert.match(uiSource, /Founder Rewards/);
  assert.match(uiSource, /public Bounty Pool is a separate treasury domain/);
  assert.match(uiSource, /payout\.status === "cancelled"/);
});
