import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const mirror = source("lib/trophies/beltHonorMirror.ts");
const service = source("lib/trophies/service.ts");
const playerProfile = source("components/players/PlayerProfilePage.tsx");
const adminBootstrap = source("app/api/admin/users/route.ts");
const adminLive = source("app/api/admin/users/live/route.ts");
const adminTypes = source("components/admin/command-tower/types.ts");
const adminClient = source("components/admin/command-tower/useAdminCommandTowerData.ts");
const legacyChallenge = source("lib/challenges.ts");
const titleState = source("lib/champions/titleState.ts");
const trophyApi = source("app/api/trophies/route.ts");
const walletDashboard = source("app/api/wolo/wallet-dashboard/route.ts");
const trophyMetadata = source("app/api/trophies/[trophyId]/metadata/route.ts");
const championship = source("lib/trophies/championship.ts");
const championshipChallenges = source("lib/championshipChallenges.ts");

test("Trophy custody is the only current-champion authority for User Command mirrors", () => {
  assert.match(
    mirror,
    /export async function reconcileChampionshipBeltHonorMirrors/,
  );
  assert.match(mirror, /championshipCustodyReign\.findMany/);
  assert.match(mirror, /where: \{ endedAt: null \}/);
  assert.match(mirror, /explicitHolderIdsByTrophyId/);
  assert.match(mirror, /trophy\.status === "held" \|\| trophy\.status === "active"/);
  assert.match(mirror, /syncChampionshipBeltHonorMirror\(tx/);

  assert.match(service, /await reconcileChampionshipBeltHonorMirrors\(prisma\)/);
  assert.match(adminBootstrap, /await ensureTrophySeedData\(prisma\)/);

  // The 20-second live refresh must carry corrected Belt mirrors too, otherwise
  // User Command can visually remain stale after Trophy Command changes custody.
  assert.match(adminTypes, /\| "badges"/);
  assert.match(adminLive, /badges: community\.badges/);
  assert.match(adminClient, /badges: live\.badges/);
});

test("every known solo transfer writer keeps the User Command mirror in the same transaction", () => {
  assert.match(legacyChallenge, /syncChampionshipBeltHonorMirror\(tx/);
  assert.match(legacyChallenge, /holderUserIds: \[winner\.id\]/);
  assert.match(legacyChallenge, /now: completedAt/);
  assert.match(championship, /syncChampionshipBeltHonorMirror\(tx/);
});

test("player title honors use current custody, never Guardian custody", () => {
  assert.match(playerProfile, /\["held","active"\]\.includes\(trophy\.status\)/);
  assert.doesNotMatch(
    playerProfile,
    /\["held","active","guardian_held"\]\.includes\(trophy\.status\)/,
  );
  assert.doesNotMatch(
    playerProfile,
    /trophy\.guardianHolder\?\.uid === holderUid/,
  );
  assert.match(playerProfile, /trophyPresentationAssetUrl\(\{/);
});

test("managed media is the presentation authority and persisted NFT images are fallback provenance only", () => {
  assert.match(
    service,
    /export function trophyPresentationAssetUrl/,
  );
  assert.match(
    service,
    /definition\?\.assetUrl \|\| input\.nftImageUri \|\| null/,
  );
  assert.doesNotMatch(
    titleState,
    /assetUrl: trophy\.nftImageUri\?\.trim\(\) \|\| definition\.assetUrl/,
  );
  assert.match(titleState, /assetUrl: definition\.assetUrl/);

  for (const currentSource of [
    playerProfile,
    trophyApi,
    walletDashboard,
    trophyMetadata,
    championship,
    championshipChallenges,
  ]) {
    assert.match(currentSource, /trophyPresentationAssetUrl/);
  }

  assert.doesNotMatch(
    playerProfile,
    /imageUrl: trophy\.nftImageUri \|\| null/,
  );
});
