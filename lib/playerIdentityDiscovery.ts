import { createHash } from "node:crypto";

export const PLAYER_IDENTITY_DISCOVERY_VERSION =
  "player-identity-discovery-v2";
export const PLAYER_IDENTITY_NORMALIZATION_VERSION =
  "player-name-normalization-v1";
export const PLAYER_IDENTITY_FOUNDATION_SCHEMA_VERSION =
  "player-identity-foundation-v1";
export const PLAYER_IDENTITY_APPLY_CONFIRMATION =
  "APPLY-PROPOSED-IDENTITY-DISCOVERY-V2";
export const PLAYER_IDENTITY_DECISION_TIMESTAMP_POLICY =
  "apply_transaction_timestamp" as const;

const STEAM_ID_64 = /^\d{17}$/;

export type IdentityDiscoverySnapshot = {
  id: number;
  projectionId: number;
  projectionHash: string;
  gameStatsId: number;
  displayName: string;
  normalizedName: string;
  steamId: string | null;
  exact: boolean;
  confidenceBps: number | null;
  provenance: unknown;
  createdAt: Date | string;
  playedOn: Date | string | null;
  gameTimestamp: Date | string | null;
  replayHash: string;
};

export type IdentityDiscoveryUser = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamId: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  verificationMethod: string;
  verifiedAt: Date | string | null;
  createdAt: Date | string;
};

export type PlatformAccountPlan = {
  logicalKey: string;
  platform: "steam";
  externalAccountId: string;
  sourceKind: "replay_evidence" | "site_account_profile";
  siteAccountUserId: number | null;
  latestDisplayName: string;
  latestNormalizedName: string;
  firstObservedAt: string;
  lastObservedAt: string;
  snapshotIds: number[];
};

export type PlatformNameObservationPlan = {
  idempotencyKey: string;
  platformExternalAccountId: string;
  replayPlayerSnapshotId: number;
  displayName: string;
  normalizedName: string;
  normalizationVersion: string;
  observedAt: string;
  sourceKind: "replay_player_snapshot";
  sourceIdentity: string;
  exact: boolean;
  confidenceBps: number | null;
  provenance: Record<string, unknown>;
};

export type ProvisionalIdentityPlan = {
  logicalKey: string;
  normalizationVersion: string;
  normalizedName: string;
  firstObservedAt: string;
  lastObservedAt: string;
  snapshotIds: number[];
  latestDisplayName: string;
};

export type ProvisionalIdentityDecisionPlan = {
  decisionKey: string;
  decisionInputHash: string;
  provisionalLogicalKey: string;
  normalizedName: string;
  snapshotIds: number[];
  evidence: Record<string, unknown>;
};

export type WarriorSeedPlan = {
  logicalKey: string;
  platformExternalAccountId: string;
  kind: "platform_seed";
  preferredDisplayName: string;
  normalizedDisplayName: string;
  status: "provisional";
};

export type ProposedLinkPlan = {
  decisionKey: string;
  decisionInputHash: string;
  linkKey: string;
  platformExternalAccountId: string;
  warriorLogicalKey: string;
  status: "proposed";
  attributionFrom: string;
  attributionTo: null;
  controlVerifiedAt: null;
  verificationMethod: "replay_exact_steam";
  confidenceBps: 10000;
  evidence: Record<string, unknown>;
};

export type ProposedClaimPlan = {
  decisionKey: string;
  decisionInputHash: string;
  claimKey: string;
  platformExternalAccountId: string;
  warriorLogicalKey: string;
  userId: number;
  userUid: string;
  role: "primary";
  status: "proposed";
  effectiveFrom: null;
  effectiveTo: null;
  verificationMethod: "legacy_exact_steam_evidence";
  evidence: Record<string, unknown>;
};

export type PlayerIdentityDiscoveryPlan = {
  discoveryVersion: string;
  normalizationVersion: string;
  schemaVersion: string;
  decisionTimestampPolicy: typeof PLAYER_IDENTITY_DECISION_TIMESTAMP_POLICY;
  sourceWatermark: {
    maxReplayPlayerSnapshotId: number;
    maxUserId: number;
    snapshotCount: number;
    userCount: number;
  };
  inputHash: string;
  resultHash: string;
  counts: {
    snapshots: number;
    exactSteamSnapshots: number;
    nameOnlySnapshots: number;
    platformAccounts: number;
    replayBackedPlatformAccounts: number;
    profileOnlyPlatformAccounts: number;
    nameObservations: number;
    provisionalIdentities: number;
    provisionalDecisions: number;
    warriors: number;
    proposedLinks: number;
    proposedClaims: number;
    decisions: number;
    decisionSubjects: number;
    activeLinks: 0;
    activeClaims: 0;
  };
  platformAccounts: PlatformAccountPlan[];
  nameObservations: PlatformNameObservationPlan[];
  provisionalIdentities: ProvisionalIdentityPlan[];
  provisionalDecisions: ProvisionalIdentityDecisionPlan[];
  warriors: WarriorSeedPlan[];
  proposedLinks: ProposedLinkPlan[];
  proposedClaims: ProposedClaimPlan[];
};

type NormalizedSnapshot = {
  id: number;
  projectionId: number;
  projectionHash: string;
  gameStatsId: number;
  displayName: string;
  normalizedName: string;
  steamId: string | null;
  exact: boolean;
  confidenceBps: number | null;
  provenance: unknown;
  observedAt: string;
  replayHash: string;
};

function assertSafePositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer.`);
  }
}

function iso(value: Date | string, field: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date.`);
  }
  return date.toISOString();
}

function optionalIso(value: Date | string | null, field: string) {
  return value === null ? null : iso(value, field);
}

export function canonicalSteamId(
  value: string | null,
  field = "steamId"
): string | null {
  if (value === null) return null;
  const canonical = value.trim();
  if (!STEAM_ID_64.test(canonical)) {
    throw new Error(`${field} must be an exact 17-digit SteamID64.`);
  }
  return canonical;
}

export function canonicalDisplayName(value: string, field = "displayName") {
  const canonical = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!canonical) {
    throw new Error(`${field} must not be empty.`);
  }
  return canonical;
}

function optionalCanonicalDisplayName(
  value: string | null,
  field: string
): string | null {
  if (value === null || !value.trim()) return null;
  return canonicalDisplayName(value, field);
}

export function normalizePlayerName(
  normalizedName: string,
  displayName: string
) {
  const source = normalizedName.trim() ? normalizedName : displayName;
  return canonicalDisplayName(source, "normalizedName").toLowerCase();
}

function effectiveObservedAt(snapshot: IdentityDiscoverySnapshot) {
  return optionalIso(snapshot.playedOn, "playedOn") ??
    optionalIso(snapshot.gameTimestamp, "gameTimestamp") ??
    iso(snapshot.createdAt, "createdAt");
}

function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)])
  );
}

export function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function normalizeSnapshot(
  snapshot: IdentityDiscoverySnapshot
): NormalizedSnapshot {
  assertSafePositiveInteger(snapshot.id, "snapshot.id");
  assertSafePositiveInteger(snapshot.projectionId, "snapshot.projectionId");
  assertSafePositiveInteger(snapshot.gameStatsId, "snapshot.gameStatsId");
  const projectionHash = snapshot.projectionHash.trim();
  if (!projectionHash) {
    throw new Error(`snapshot ${snapshot.id} projectionHash must not be empty.`);
  }
  const displayName = canonicalDisplayName(
    snapshot.displayName,
    `snapshot ${snapshot.id} displayName`
  );
  const normalizedName = normalizePlayerName(
    snapshot.normalizedName,
    displayName
  );
  const steamId = canonicalSteamId(
    snapshot.steamId,
    `snapshot ${snapshot.id} steamId`
  );
  if (
    snapshot.confidenceBps !== null &&
    (!Number.isSafeInteger(snapshot.confidenceBps) ||
      snapshot.confidenceBps < 0 ||
      snapshot.confidenceBps > 10000)
  ) {
    throw new Error(
      `snapshot ${snapshot.id} confidenceBps must be between 0 and 10000.`
    );
  }
  return {
    id: snapshot.id,
    projectionId: snapshot.projectionId,
    projectionHash,
    gameStatsId: snapshot.gameStatsId,
    displayName,
    normalizedName,
    steamId,
    exact: snapshot.exact,
    confidenceBps: snapshot.confidenceBps,
    provenance: stableValue(snapshot.provenance),
    observedAt: effectiveObservedAt(snapshot),
    replayHash: snapshot.replayHash,
  };
}

function latestSnapshot(left: NormalizedSnapshot, right: NormalizedSnapshot) {
  const time = left.observedAt.localeCompare(right.observedAt);
  if (time !== 0) return time > 0 ? left : right;
  return left.id > right.id ? left : right;
}

function orderedSnapshots(snapshots: NormalizedSnapshot[]) {
  return snapshots.slice().sort((left, right) => left.id - right.id);
}

function normalizedUser(user: IdentityDiscoveryUser) {
  assertSafePositiveInteger(user.id, "user.id");
  const uid = user.uid.trim();
  if (!uid) throw new Error(`user ${user.id} uid must not be empty.`);
  return {
    id: user.id,
    uid,
    inGameName: optionalCanonicalDisplayName(
      user.inGameName,
      `user ${user.id} inGameName`
    ),
    steamId: canonicalSteamId(user.steamId, `user ${user.id} steamId`),
    steamPersonaName: optionalCanonicalDisplayName(
      user.steamPersonaName,
      `user ${user.id} steamPersonaName`
    ),
    verified: user.verified,
    verificationLevel: user.verificationLevel,
    verificationMethod: user.verificationMethod,
    verifiedAt: optionalIso(user.verifiedAt, `user ${user.id} verifiedAt`),
    createdAt: iso(user.createdAt, `user ${user.id} createdAt`),
  };
}

export function assertProposedOnlyIdentityPlan(
  plan: PlayerIdentityDiscoveryPlan
) {
  if (plan.counts.activeLinks !== 0 || plan.counts.activeClaims !== 0) {
    throw new Error("Discovery plan must contain zero active links and claims.");
  }
  for (const link of plan.proposedLinks) {
    if (
      link.status !== "proposed" ||
      link.controlVerifiedAt !== null ||
      link.attributionTo !== null
    ) {
      throw new Error(`Link ${link.linkKey} is not proposed-only.`);
    }
  }
  for (const claim of plan.proposedClaims) {
    if (
      claim.status !== "proposed" ||
      claim.effectiveFrom !== null ||
      claim.effectiveTo !== null
    ) {
      throw new Error(`Claim ${claim.claimKey} is not proposed-only.`);
    }
  }
  for (const decision of plan.provisionalDecisions) {
    if (
      decision.snapshotIds.length === 0 ||
      decision.evidence.humanIdentityAsserted !== false
    ) {
      throw new Error(
        `Provisional decision ${decision.decisionKey} lacks safe lineage.`
      );
    }
  }
}

export function buildPlayerIdentityDiscoveryPlan(input: {
  snapshots: IdentityDiscoverySnapshot[];
  users: IdentityDiscoveryUser[];
}): PlayerIdentityDiscoveryPlan {
  const snapshots = orderedSnapshots(input.snapshots.map(normalizeSnapshot));
  const users = input.users.map(normalizedUser).sort((a, b) => a.id - b.id);

  const snapshotIds = new Set<number>();
  for (const snapshot of snapshots) {
    if (snapshotIds.has(snapshot.id)) {
      throw new Error(`Duplicate replay snapshot id ${snapshot.id}.`);
    }
    snapshotIds.add(snapshot.id);
  }

  const usersBySteamId = new Map<string, (typeof users)[number]>();
  for (const user of users) {
    if (!user.steamId) continue;
    const existing = usersBySteamId.get(user.steamId);
    if (existing) {
      throw new Error(
        `SteamID64 ${user.steamId} is assigned to users ${existing.id} and ${user.id}.`
      );
    }
    usersBySteamId.set(user.steamId, user);
  }

  const exactBySteam = new Map<string, NormalizedSnapshot[]>();
  const nameOnlyByNormalizedName = new Map<string, NormalizedSnapshot[]>();

  for (const snapshot of snapshots) {
    if (snapshot.steamId) {
      const group = exactBySteam.get(snapshot.steamId) ?? [];
      group.push(snapshot);
      exactBySteam.set(snapshot.steamId, group);
    } else {
      const group = nameOnlyByNormalizedName.get(snapshot.normalizedName) ?? [];
      group.push(snapshot);
      nameOnlyByNormalizedName.set(snapshot.normalizedName, group);
    }
  }

  const platformAccounts: PlatformAccountPlan[] = [];
  const nameObservations: PlatformNameObservationPlan[] = [];
  const warriors: WarriorSeedPlan[] = [];
  const proposedLinks: ProposedLinkPlan[] = [];
  const proposedClaims: ProposedClaimPlan[] = [];

  for (const steamId of [...exactBySteam.keys()].sort()) {
    const group = orderedSnapshots(exactBySteam.get(steamId) ?? []);
    const latest = group.reduce(latestSnapshot);
    const firstObservedAt = group
      .map((snapshot) => snapshot.observedAt)
      .sort()[0];
    const lastObservedAt = group
      .map((snapshot) => snapshot.observedAt)
      .sort()
      .at(-1);
    if (!firstObservedAt || !lastObservedAt) {
      throw new Error(`SteamID64 ${steamId} has no observation window.`);
    }

    const warriorLogicalKey = `warrior:steam:${steamId}`;
    const groupSnapshotIds = group.map((snapshot) => snapshot.id);
    const accountEvidence = {
      discoveryVersion: PLAYER_IDENTITY_DISCOVERY_VERSION,
      platform: "steam",
      externalAccountId: steamId,
      firstObservedAt,
      lastObservedAt,
      snapshotCount: groupSnapshotIds.length,
      snapshotIdsHash: sha256(groupSnapshotIds),
      firstSnapshotId: groupSnapshotIds[0],
      lastSnapshotId: groupSnapshotIds.at(-1),
      latestSnapshotId: latest.id,
    };

    platformAccounts.push({
      logicalKey: `platform:steam:${steamId}`,
      platform: "steam",
      externalAccountId: steamId,
      sourceKind: "replay_evidence",
      siteAccountUserId: usersBySteamId.get(steamId)?.id ?? null,
      latestDisplayName: latest.displayName,
      latestNormalizedName: latest.normalizedName,
      firstObservedAt,
      lastObservedAt,
      snapshotIds: group.map((snapshot) => snapshot.id),
    });

    for (const snapshot of group) {
      nameObservations.push({
        idempotencyKey: `pid:v2:obs:${snapshot.id}`,
        platformExternalAccountId: steamId,
        replayPlayerSnapshotId: snapshot.id,
        displayName: snapshot.displayName,
        normalizedName: snapshot.normalizedName,
        normalizationVersion: PLAYER_IDENTITY_NORMALIZATION_VERSION,
        observedAt: snapshot.observedAt,
        sourceKind: "replay_player_snapshot",
        sourceIdentity: `replay-player-snapshot:${snapshot.id}`,
        exact: snapshot.exact,
        confidenceBps: snapshot.confidenceBps,
        provenance: {
          discoveryVersion: PLAYER_IDENTITY_DISCOVERY_VERSION,
          projectionId: snapshot.projectionId,
          projectionHash: snapshot.projectionHash,
          gameStatsId: snapshot.gameStatsId,
          replayHash: snapshot.replayHash,
          sourceProvenance: snapshot.provenance,
        },
      });
    }

    warriors.push({
      logicalKey: warriorLogicalKey,
      platformExternalAccountId: steamId,
      kind: "platform_seed",
      preferredDisplayName: latest.displayName,
      normalizedDisplayName: latest.normalizedName,
      status: "provisional",
    });

    const linkEvidence = {
      ...accountEvidence,
      proposalOnly: true,
      controlVerifiedAt: null,
      historicalAttributionActivated: false,
    };
    proposedLinks.push({
      decisionKey: `pid:v2:decision:link:${steamId}`,
      decisionInputHash: sha256(linkEvidence),
      linkKey: `pid:v2:link:${steamId}`,
      platformExternalAccountId: steamId,
      warriorLogicalKey,
      status: "proposed",
      attributionFrom: firstObservedAt,
      attributionTo: null,
      controlVerifiedAt: null,
      verificationMethod: "replay_exact_steam",
      confidenceBps: 10000,
      evidence: linkEvidence,
    });

    const user = usersBySteamId.get(steamId);
    if (user) {
      const claimEvidence = {
        ...accountEvidence,
        proposalOnly: true,
        siteAccountUserId: user.id,
        siteAccountUid: user.uid,
        siteAccountCreatedAt: user.createdAt,
        legacyVerification: {
          verified: user.verified,
          verificationLevel: user.verificationLevel,
          verificationMethod: user.verificationMethod,
          verifiedAt: user.verifiedAt,
          steamPersonaName: user.steamPersonaName,
          inGameName: user.inGameName,
        },
        freshControlProof: false,
        historicalAttributionActivated: false,
      };
      proposedClaims.push({
        decisionKey: `pid:v2:decision:claim:u${user.id}:s${steamId}`,
        decisionInputHash: sha256(claimEvidence),
        claimKey: `pid:v2:claim:u${user.id}:s${steamId}`,
        platformExternalAccountId: steamId,
        warriorLogicalKey,
        userId: user.id,
        userUid: user.uid,
        role: "primary",
        status: "proposed",
        effectiveFrom: null,
        effectiveTo: null,
        verificationMethod: "legacy_exact_steam_evidence",
          evidence: claimEvidence,
      });
    }
  }

  for (const user of users) {
    if (!user.steamId || exactBySteam.has(user.steamId)) continue;
    const latestDisplayName =
      user.steamPersonaName ?? user.inGameName ?? user.uid;
    const firstObservedAt = user.createdAt;
    const lastObservedAt =
      user.verifiedAt && user.verifiedAt > user.createdAt
        ? user.verifiedAt
        : user.createdAt;
    platformAccounts.push({
      logicalKey: `platform:steam:${user.steamId}`,
      platform: "steam",
      externalAccountId: user.steamId,
      sourceKind: "site_account_profile",
      siteAccountUserId: user.id,
      latestDisplayName,
      latestNormalizedName: normalizePlayerName("", latestDisplayName),
      firstObservedAt,
      lastObservedAt,
      snapshotIds: [],
    });
  }
  platformAccounts.sort((left, right) =>
    left.externalAccountId.localeCompare(right.externalAccountId)
  );

  const provisionalIdentities: ProvisionalIdentityPlan[] = [];
  const provisionalDecisions: ProvisionalIdentityDecisionPlan[] = [];
  for (const normalizedName of [...nameOnlyByNormalizedName.keys()].sort()) {
    const group = orderedSnapshots(
      nameOnlyByNormalizedName.get(normalizedName) ?? []
    );
    const latest = group.reduce(latestSnapshot);
    const observed = group.map((snapshot) => snapshot.observedAt).sort();
    const firstObservedAt = observed[0];
    const lastObservedAt = observed.at(-1);
    if (!firstObservedAt || !lastObservedAt) {
      throw new Error(`Name-only bucket ${normalizedName} has no observations.`);
    }
    const provisionalLogicalKey =
      `provisional:${PLAYER_IDENTITY_NORMALIZATION_VERSION}:` +
      sha256(normalizedName).slice(0, 20);
    const groupSnapshotIds = group.map((snapshot) => snapshot.id);
    provisionalIdentities.push({
      logicalKey: provisionalLogicalKey,
      normalizationVersion: PLAYER_IDENTITY_NORMALIZATION_VERSION,
      normalizedName,
      firstObservedAt,
      lastObservedAt,
      snapshotIds: groupSnapshotIds,
      latestDisplayName: latest.displayName,
    });
    const provisionalEvidence = {
      discoveryVersion: PLAYER_IDENTITY_DISCOVERY_VERSION,
      normalizationVersion: PLAYER_IDENTITY_NORMALIZATION_VERSION,
      provisionalLogicalKey,
      normalizedName,
      firstObservedAt,
      lastObservedAt,
      latestDisplayName: latest.displayName,
      snapshotIds: groupSnapshotIds,
      snapshotIdsHash: sha256(groupSnapshotIds),
      humanIdentityAsserted: false,
      permanentMergeAsserted: false,
      independentlyAdjudicableSnapshots: true,
    };
    provisionalDecisions.push({
      decisionKey: `pid:v2:decision:provisional:${sha256(
        normalizedName
      ).slice(0, 20)}`,
      decisionInputHash: sha256(provisionalEvidence),
      provisionalLogicalKey,
      normalizedName,
      snapshotIds: groupSnapshotIds,
      evidence: provisionalEvidence,
    });
  }

  nameObservations.sort(
    (left, right) =>
      left.replayPlayerSnapshotId - right.replayPlayerSnapshotId
  );
  proposedClaims.sort((left, right) => left.userId - right.userId);

  const normalizedInput = {
    snapshots,
    users,
    discoveryVersion: PLAYER_IDENTITY_DISCOVERY_VERSION,
    normalizationVersion: PLAYER_IDENTITY_NORMALIZATION_VERSION,
    schemaVersion: PLAYER_IDENTITY_FOUNDATION_SCHEMA_VERSION,
    decisionTimestampPolicy: PLAYER_IDENTITY_DECISION_TIMESTAMP_POLICY,
  };

  const planWithoutResultHash = {
    discoveryVersion: PLAYER_IDENTITY_DISCOVERY_VERSION,
    normalizationVersion: PLAYER_IDENTITY_NORMALIZATION_VERSION,
    schemaVersion: PLAYER_IDENTITY_FOUNDATION_SCHEMA_VERSION,
    decisionTimestampPolicy: PLAYER_IDENTITY_DECISION_TIMESTAMP_POLICY,
    sourceWatermark: {
      maxReplayPlayerSnapshotId: snapshots.at(-1)?.id ?? 0,
      maxUserId: users.at(-1)?.id ?? 0,
      snapshotCount: snapshots.length,
      userCount: users.length,
    },
    inputHash: sha256(normalizedInput),
    counts: {
      snapshots: snapshots.length,
      exactSteamSnapshots: snapshots.filter((snapshot) => snapshot.steamId)
        .length,
      nameOnlySnapshots: snapshots.filter((snapshot) => !snapshot.steamId)
        .length,
      platformAccounts: platformAccounts.length,
      replayBackedPlatformAccounts: platformAccounts.filter(
        (account) => account.sourceKind === "replay_evidence"
      ).length,
      profileOnlyPlatformAccounts: platformAccounts.filter(
        (account) => account.sourceKind === "site_account_profile"
      ).length,
      nameObservations: nameObservations.length,
      provisionalIdentities: provisionalIdentities.length,
      provisionalDecisions: provisionalDecisions.length,
      warriors: warriors.length,
      proposedLinks: proposedLinks.length,
      proposedClaims: proposedClaims.length,
      decisions:
        provisionalDecisions.length +
        proposedLinks.length +
        proposedClaims.length,
      decisionSubjects:
        provisionalDecisions.reduce(
          (count, decision) => count + 1 + decision.snapshotIds.length,
          0
        ) +
        proposedLinks.length * 3 +
        proposedClaims.length * 4,
      activeLinks: 0 as const,
      activeClaims: 0 as const,
    },
    platformAccounts,
    nameObservations,
    provisionalIdentities,
    provisionalDecisions,
    warriors,
    proposedLinks,
    proposedClaims,
  };

  const plan: PlayerIdentityDiscoveryPlan = {
    ...planWithoutResultHash,
    resultHash: sha256(planWithoutResultHash),
  };
  assertProposedOnlyIdentityPlan(plan);
  return plan;
}

export function summarizePlayerIdentityDiscoveryPlan(
  plan: PlayerIdentityDiscoveryPlan
) {
  return {
    discoveryVersion: plan.discoveryVersion,
    normalizationVersion: plan.normalizationVersion,
    schemaVersion: plan.schemaVersion,
    decisionTimestampPolicy: plan.decisionTimestampPolicy,
    sourceWatermark: plan.sourceWatermark,
    inputHash: plan.inputHash,
    resultHash: plan.resultHash,
    counts: plan.counts,
    proposalSafety: {
      activeLinks: 0,
      activeClaims: 0,
      claimsRequireFreshControlForActivation: true,
      historicalAttributionActivated: false,
      publicationCreated: false,
      aggregateEligibilityChanged: false,
    },
  };
}
