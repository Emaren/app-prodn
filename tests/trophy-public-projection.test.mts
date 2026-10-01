import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectPublicTrophy } from "../lib/trophies/service.ts";

function trophy(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    trophyId: "world_champion",
    displayName: "World Champion",
    kind: "belt",
    family: "champion",
    tier: "World",
    currentHolderUserId: 10,
    currentHolderDisplayName: "Historical Holder",
    currentHolderWoloAddress: "wolo1holder",
    guardianHolderUserId: 20,
    guardianHolderDisplayName: "Historical Guardian",
    guardianHolderWoloAddress: "wolo1guardian",
    status: "held",
    eligibilityNote: null,
    eligibleNationality: null,
    eloBandMin: null,
    eloBandMax: null,
    currentBountyWolo: 123,
    tributeAmountWolo: 0,
    bountyGrowthWolo: 5,
    payoutFrequency: "daily",
    bountyAccrualFrequency: "daily",
    chainStatus: "app_only",
    chainOwnerAddress: null,
    nftClassId: null,
    nftId: null,
    nftMetadataUri: null,
    nftImageUri: null,
    holderSince: new Date("2026-09-01T00:00:00.000Z"),
    forfeitureNeeded: true,
    lastChainSyncAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-29T00:00:00.000Z"),
    currentHolder: {
      uid: "holder-uid",
      inGameName: "Historical Holder",
      steamPersonaName: "Old Holder",
    },
    guardianHolder: {
      uid: "guardian-uid",
      inGameName: "Historical Guardian",
      steamPersonaName: "Old Guardian",
    },
    ...overrides,
  };
}

test("forced-vacant public projection preserves the Trophy row but removes stale custody", () => {
  const source = trophy();
  const projected = projectPublicTrophy(source as never);

  assert.notEqual(projected, source);
  assert.equal(source.status, "held");
  assert.equal(source.currentHolderUserId, 10);
  assert.equal(source.guardianHolderUserId, 20);

  assert.equal(projected.trophyId, "world_champion");
  assert.equal(projected.status, "vacant");
  assert.equal(projected.currentHolderUserId, null);
  assert.equal(projected.currentHolderDisplayName, null);
  assert.equal(projected.currentHolderWoloAddress, null);
  assert.equal(projected.currentHolder, null);
  assert.equal(projected.guardianHolderUserId, null);
  assert.equal(projected.guardianHolderDisplayName, null);
  assert.equal(projected.guardianHolderWoloAddress, null);
  assert.equal(projected.guardianHolder, null);
  assert.equal(projected.holderSince, null);
  assert.equal(projected.currentBountyWolo, 0);
  assert.equal(projected.forfeitureNeeded, false);
});

test("ordinary public Trophy projection leaves current rows untouched", () => {
  const source = trophy({
    trophyId: "usa_champion_belt",
    displayName: "United States Champion",
    currentHolderDisplayName: "Jim",
    currentHolderUserId: 30,
    guardianHolderUserId: null,
    guardianHolderDisplayName: null,
    guardianHolderWoloAddress: null,
    guardianHolder: null,
    forfeitureNeeded: false,
  });

  const projected = projectPublicTrophy(source as never);
  assert.equal(projected, source);
  assert.equal(projected.status, "held");
  assert.equal(projected.currentHolderUserId, 30);
});

test("public collection and metadata use the same retained projection path", () => {
  const service = readFileSync(
    new URL("../lib/trophies/service.ts", import.meta.url),
    "utf8"
  );
  const metadata = readFileSync(
    new URL("../app/api/trophies/[trophyId]/metadata/route.ts", import.meta.url),
    "utf8"
  );

  const publicStart = service.indexOf("export async function loadPublicTrophies");
  const publicEnd = service.indexOf("export async function loadUserTrophyHoldings", publicStart);
  const publicLoaders = service.slice(publicStart, publicEnd);

  assert.match(publicLoaders, /return projectPublicTrophy\(\{\.\.\.trophy, hasExplicitChampionshipCustody/);
  assert.doesNotMatch(publicLoaders, /\.filter\(\(trophy\)/);
  assert.match(publicLoaders, /export async function loadPublicTrophy/);
  assert.match(publicLoaders, /await ensurePublicTrophySeedData\(prisma\)/);

  assert.match(metadata, /loadPublicTrophy\(getPrisma\(\), trophyId\)/);
  assert.doesNotMatch(metadata, /ensureTrophySeedData/);
  assert.doesNotMatch(metadata, /prisma\.trophy\.findUnique/);
});


test("explicit current championship reign replaces historical forced-vacancy masking", () => {
  const current = trophy({hasExplicitChampionshipCustody:true,championshipRoster:[{userId:10,uid:"holder-uid",displayName:"New Champion",seat:0,walletAddress:"wolo1new"}]});
  const projected = projectPublicTrophy(current as never);
  assert.equal(projected.status,"held");
  assert.equal(projected.currentHolderUserId,10);
  assert.equal(projected.championshipRoster?.[0]?.displayName,"New Champion");
});
