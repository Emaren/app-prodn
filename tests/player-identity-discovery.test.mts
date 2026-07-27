import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPlayerIdentityDiscoveryPlan,
  canonicalSteamId,
  PLAYER_IDENTITY_DECISION_TIMESTAMP_POLICY,
  PLAYER_IDENTITY_NORMALIZATION_VERSION,
} from "../lib/playerIdentityDiscovery.ts";

const base = {
  projectionId: 1,
  projectionHash: "projection-hash-fixture",
  exact: true,
  confidenceBps: 10000,
  provenance: { source: "fixture" },
  playedOn: null,
  gameTimestamp: null,
};

function snapshot(input: {
  id: number;
  gameStatsId?: number;
  displayName: string;
  normalizedName?: string;
  steamId: string | null;
  createdAt: string;
}) {
  return {
    ...base,
    gameStatsId: input.gameStatsId ?? input.id,
    normalizedName: input.normalizedName ?? input.displayName.toLowerCase(),
    replayHash: `hash-${input.id}`,
    ...input,
  };
}

function user(input: {
  id: number;
  uid: string;
  steamId: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return {
    inGameName: null,
    steamPersonaName: null,
    verified: true,
    verificationLevel: 2,
    verificationMethod: "watcher",
    verifiedAt: "2026-01-10T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

test("exact SteamID64 groups name changes under one platform account and Warrior", () => {
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 1,
        displayName: "Old Name",
        steamId: "76561198000000001",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      snapshot({
        id: 2,
        displayName: "New Name",
        steamId: "76561198000000001",
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
    ],
    users: [],
  });

  assert.equal(plan.counts.platformAccounts, 1);
  assert.equal(plan.counts.warriors, 1);
  assert.equal(plan.counts.nameObservations, 2);
  assert.equal(plan.platformAccounts[0]?.latestDisplayName, "New Name");
  assert.equal(plan.proposedLinks[0]?.status, "proposed");
  assert.equal(plan.proposedLinks[0]?.controlVerifiedAt, null);
});

test("same normalized name on distinct Steam accounts never merges", () => {
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 1,
        displayName: "Knight",
        steamId: "76561198000000001",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      snapshot({
        id: 2,
        displayName: "KNIGHT",
        steamId: "76561198000000002",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ],
    users: [],
  });

  assert.equal(plan.counts.platformAccounts, 2);
  assert.equal(plan.counts.warriors, 2);
  assert.notEqual(
    plan.warriors[0]?.platformExternalAccountId,
    plan.warriors[1]?.platformExternalAccountId
  );
});

test("name-only snapshots create a discovery bucket, not a Warrior", () => {
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 1,
        displayName: "Mystery Player",
        steamId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      snapshot({
        id: 2,
        displayName: "  MYSTERY   PLAYER ",
        steamId: null,
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ],
    users: [],
  });

  assert.equal(plan.counts.provisionalIdentities, 1);
  assert.equal(plan.counts.platformAccounts, 0);
  assert.equal(plan.counts.warriors, 0);
  assert.equal(
    plan.provisionalIdentities[0]?.normalizationVersion,
    PLAYER_IDENTITY_NORMALIZATION_VERSION
  );
  assert.deepEqual(plan.provisionalIdentities[0]?.snapshotIds, [1, 2]);
});

test("exact site-account match creates a proposed claim with no effective start", () => {
  const steamId = "76561198000000001";
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 1,
        displayName: "Emaren",
        steamId,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ],
    users: [user({ id: 7, uid: "emaren", steamId })],
  });

  assert.equal(plan.counts.proposedClaims, 1);
  assert.equal(plan.counts.activeClaims, 0);
  assert.equal(plan.proposedClaims[0]?.status, "proposed");
  assert.equal(plan.proposedClaims[0]?.effectiveFrom, null);
  assert.equal(
    plan.proposedClaims[0]?.verificationMethod,
    "legacy_exact_steam_evidence"
  );
  assert.equal(
    plan.proposedClaims[0]?.evidence.siteAccountCreatedAt,
    "2026-01-01T00:00:00.000Z"
  );
  assert.equal(plan.counts.decisionSubjects, 7);
});

test("plan hashes and keys are deterministic across source row ordering", () => {
  const snapshots = [
    snapshot({
      id: 1,
      displayName: "One",
      steamId: "76561198000000001",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    snapshot({
      id: 2,
      displayName: "Two",
      steamId: null,
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
  ];
  const users = [
    user({ id: 8, uid: "one", steamId: "76561198000000001" }),
  ];

  const first = buildPlayerIdentityDiscoveryPlan({ snapshots, users });
  const second = buildPlayerIdentityDiscoveryPlan({
    snapshots: snapshots.slice().reverse(),
    users: users.slice().reverse(),
  });

  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.resultHash, second.resultHash);
  assert.deepEqual(first, second);
});

test("invalid or ambiguous Steam values fail closed", () => {
  assert.throws(
    () => canonicalSteamId("steam:76561198000000001"),
    /exact 17-digit SteamID64/
  );
  assert.throws(
    () =>
      buildPlayerIdentityDiscoveryPlan({
        snapshots: [
          snapshot({
            id: 1,
            displayName: "Bad",
            steamId: "123",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
        users: [],
      }),
    /exact 17-digit SteamID64/
  );
});


test("profile-only Steam user creates a PlatformAccount without a Warrior or claim", () => {
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [],
    users: [
      user({
        id: 12,
        uid: "profile-only",
        steamId: "76561198000000012",
        steamPersonaName: "Profile Only",
      }),
    ],
  });

  assert.equal(plan.counts.platformAccounts, 1);
  assert.equal(plan.counts.replayBackedPlatformAccounts, 0);
  assert.equal(plan.counts.profileOnlyPlatformAccounts, 1);
  assert.equal(plan.counts.warriors, 0);
  assert.equal(plan.counts.proposedLinks, 0);
  assert.equal(plan.counts.proposedClaims, 0);
  assert.equal(
    plan.platformAccounts[0]?.sourceKind,
    "site_account_profile"
  );
  assert.deepEqual(plan.platformAccounts[0]?.snapshotIds, []);
});

test("name-only provisional bucket preserves per-snapshot database lineage", () => {
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 4,
        displayName: "Mystery",
        steamId: null,
        createdAt: "2026-01-04T00:00:00.000Z",
      }),
      snapshot({
        id: 5,
        displayName: "MYSTERY",
        steamId: null,
        createdAt: "2026-01-05T00:00:00.000Z",
      }),
    ],
    users: [],
  });

  assert.equal(plan.counts.provisionalIdentities, 1);
  assert.equal(plan.counts.provisionalDecisions, 1);
  assert.equal(plan.counts.decisions, 1);
  assert.equal(plan.counts.decisionSubjects, 3);
  assert.deepEqual(plan.provisionalDecisions[0]?.snapshotIds, [4, 5]);
  assert.equal(
    plan.provisionalDecisions[0]?.evidence.humanIdentityAsserted,
    false
  );
  assert.equal(
    plan.provisionalDecisions[0]?.evidence.independentlyAdjudicableSnapshots,
    true
  );
});

test("decision plan records the apply-time timestamp policy without backdated decidedAt values", () => {
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 9,
        displayName: "Clock",
        steamId: "76561198000000009",
        createdAt: "2026-01-09T00:00:00.000Z",
      }),
    ],
    users: [],
  });

  assert.equal(
    plan.decisionTimestampPolicy,
    PLAYER_IDENTITY_DECISION_TIMESTAMP_POLICY
  );
  assert.equal("decidedAt" in (plan.proposedLinks[0] ?? {}), false);
});

test("claim decision subject count includes the exact PlatformAccount evidence bridge", () => {
  const steamId = "76561198000000010";
  const plan = buildPlayerIdentityDiscoveryPlan({
    snapshots: [
      snapshot({
        id: 10,
        displayName: "Claimed",
        steamId,
        createdAt: "2026-01-10T00:00:00.000Z",
      }),
    ],
    users: [user({ id: 10, uid: "claimed", steamId })],
  });

  assert.equal(plan.counts.proposedLinks, 1);
  assert.equal(plan.counts.proposedClaims, 1);
  assert.equal(plan.counts.decisionSubjects, 7);
});

test("accepted-source CLI mirrors the reviewed public projection corpus and rechecks inside the transaction", () => {
  const cli = readFileSync(
    new URL(
      "../scripts/backfill-player-identity-discovery.mts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    cli,
    /p\.projection_status = 'accepted'/
  );
  assert.match(
    cli,
    /p\.affects_public_aggregates = TRUE/
  );
  assert.match(
    cli,
    /WHERE newer\.supersedes_id = p\.id/
  );
  assert.match(
    cli,
    /const lockedSource = await loadSource\(tx,/
  );
  assert.match(
    cli,
    /Input hash changed inside the write transaction/
  );
  assert.match(
    cli,
    /Result hash changed inside the write transaction/
  );
  assert.match(cli, /SELECT transaction_timestamp\(\)/);
  assert.match(cli, /decidedAt: decisionRecordedAt/);
  assert.doesNotMatch(cli, /new Date\(decision\.decidedAt\)/);
  assert.match(cli, /subjectRole: "platform_account"/);
});
