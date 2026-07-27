import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import {
  buildPlayerIdentityDiscoveryPlan,
  PLAYER_IDENTITY_APPLY_CONFIRMATION,
  summarizePlayerIdentityDiscoveryPlan,
  type PlayerIdentityDiscoveryPlan,
} from "@/lib/playerIdentityDiscovery";

type Mode = "plan" | "apply";

type IdentitySourceClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "user"
>;

type RawIdentitySnapshot = {
  id: number;
  projectionId: number;
  projectionHash: string;
  gameStatsId: number;
  displayName: string;
  normalizedName: string;
  steamId: string | null;
  exact: boolean;
  confidenceBps: number | null;
  provenance: Prisma.JsonValue;
  createdAt: Date;
  playedOn: Date | null;
  gameTimestamp: Date | null;
  replayHash: string;
};

const CHUNK_SIZE = 400;
const ADVISORY_LOCK_NAMESPACE = 207702;
const ADVISORY_LOCK_KEY = 1;

function readArgument(name: string) {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function modeArgument(): Mode {
  const value = readArgument("--mode") ?? "plan";
  if (value === "plan" || value === "apply") return value;
  throw new Error("--mode must be plan or apply.");
}

function optionalPositiveInteger(name: string) {
  const raw = readArgument(name);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function requiredArgument(name: string) {
  const value = readArgument(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function chunks<T>(values: T[], size = CHUNK_SIZE) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function writeJson(path: string, value: unknown) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return target;
}

async function loadSource(
  client: IdentitySourceClient,
  input: {
    maxSnapshotId: number | null;
    maxUserId: number | null;
  }
) {
  const snapshotWatermark = input.maxSnapshotId
    ? Prisma.sql`AND s.id <= ${input.maxSnapshotId}`
    : Prisma.empty;
  const snapshots = await client.$queryRaw<RawIdentitySnapshot[]>(Prisma.sql`
    SELECT
      s.id,
      s.projection_id AS "projectionId",
      p.projection_hash AS "projectionHash",
      s.game_stats_id AS "gameStatsId",
      s.display_name AS "displayName",
      s.normalized_name AS "normalizedName",
      s.steam_id AS "steamId",
      s.exact,
      s.confidence_bps AS "confidenceBps",
      s.provenance,
      s.created_at AS "createdAt",
      g.played_on AS "playedOn",
      g.timestamp AS "gameTimestamp",
      g.replay_hash AS "replayHash"
    FROM replay_player_snapshots s
    JOIN replay_stat_projections p
      ON p.id = s.projection_id
    JOIN game_stats g
      ON g.id = s.game_stats_id
    WHERE p.projection_status = 'accepted'
      AND p.affects_public_aggregates = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM replay_stat_projections newer
        WHERE newer.supersedes_id = p.id
      )
      ${snapshotWatermark}
    ORDER BY s.id ASC
  `);
  const users = await client.user.findMany({
    where: {
      steamId: { not: null },
      ...(input.maxUserId ? { id: { lte: input.maxUserId } } : {}),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamId: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
      verificationMethod: true,
      verifiedAt: true,
      createdAt: true,
    },
  });

  return {
    snapshots,
    users,
  };
}

async function identityTableCounts() {
  const prisma = getPrisma();
  const [
    warriors,
    platformAccounts,
    platformNameObservations,
    provisionalIdentities,
    identityDecisions,
    identityDecisionSubjects,
    warriorPlatformLinks,
    warriorClaims,
    identityResolutionRuns,
    replayPlayerIdentityProjections,
    identityProjectionPublications,
  ] = await Promise.all([
    prisma.warrior.count(),
    prisma.platformAccount.count(),
    prisma.platformNameObservation.count(),
    prisma.provisionalIdentity.count(),
    prisma.identityDecision.count(),
    prisma.identityDecisionSubject.count(),
    prisma.warriorPlatformLink.count(),
    prisma.warriorClaim.count(),
    prisma.identityResolutionRun.count(),
    prisma.replayPlayerIdentityProjection.count(),
    prisma.identityProjectionPublication.count(),
  ]);
  return {
    warriors,
    platformAccounts,
    platformNameObservations,
    provisionalIdentities,
    identityDecisions,
    identityDecisionSubjects,
    warriorPlatformLinks,
    warriorClaims,
    identityResolutionRuns,
    replayPlayerIdentityProjections,
    identityProjectionPublications,
  };
}

function assertEmptyIdentityFoundation(counts: Record<string, number>) {
  const nonempty = Object.entries(counts).filter(([, count]) => count !== 0);
  if (nonempty.length > 0) {
    throw new Error(
      `Wave 2 first backfill requires an empty identity foundation: ${nonempty
        .map(([name, count]) => `${name}=${count}`)
        .join(", ")}`
    );
  }
}

async function createManyInChunks<T>(
  values: T[],
  create: (data: T[]) => Promise<unknown>
) {
  for (const group of chunks(values)) {
    await create(group);
  }
}

async function applyPlan(input: {
  reviewedPlan: PlayerIdentityDiscoveryPlan;
  maxSnapshotId: number;
  maxUserId: number;
  expectedInputHash: string;
  expectedResultHash: string;
}) {
  const prisma = getPrisma();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, ${ADVISORY_LOCK_KEY})`
      );

      const lockedSource = await loadSource(tx, {
        maxSnapshotId: input.maxSnapshotId,
        maxUserId: input.maxUserId,
      });
      const plan = buildPlayerIdentityDiscoveryPlan(lockedSource);
      if (
        plan.inputHash !== input.expectedInputHash ||
        plan.inputHash !== input.reviewedPlan.inputHash
      ) {
        throw new Error(
          `Input hash changed inside the write transaction: expected ${input.expectedInputHash}, found ${plan.inputHash}.`
        );
      }
      if (
        plan.resultHash !== input.expectedResultHash ||
        plan.resultHash !== input.reviewedPlan.resultHash
      ) {
        throw new Error(
          `Result hash changed inside the write transaction: expected ${input.expectedResultHash}, found ${plan.resultHash}.`
        );
      }

      const [
        warriors,
        platformAccounts,
        platformNameObservations,
        provisionalIdentities,
        identityDecisions,
        identityDecisionSubjects,
        warriorPlatformLinks,
        warriorClaims,
        identityResolutionRuns,
        replayPlayerIdentityProjections,
        identityProjectionPublications,
      ] = await Promise.all([
        tx.warrior.count(),
        tx.platformAccount.count(),
        tx.platformNameObservation.count(),
        tx.provisionalIdentity.count(),
        tx.identityDecision.count(),
        tx.identityDecisionSubject.count(),
        tx.warriorPlatformLink.count(),
        tx.warriorClaim.count(),
        tx.identityResolutionRun.count(),
        tx.replayPlayerIdentityProjection.count(),
        tx.identityProjectionPublication.count(),
      ]);
      assertEmptyIdentityFoundation({
        warriors,
        platformAccounts,
        platformNameObservations,
        provisionalIdentities,
        identityDecisions,
        identityDecisionSubjects,
        warriorPlatformLinks,
        warriorClaims,
        identityResolutionRuns,
        replayPlayerIdentityProjections,
        identityProjectionPublications,
      });

      await createManyInChunks(plan.platformAccounts, async (group) => {
        await tx.platformAccount.createMany({
          data: group.map((account) => ({
            platform: account.platform,
            externalAccountId: account.externalAccountId,
            status: "active",
            latestDisplayName: account.latestDisplayName,
            firstObservedAt: new Date(account.firstObservedAt),
            lastObservedAt: new Date(account.lastObservedAt),
            createdFrom:
              account.sourceKind === "replay_evidence"
                ? "replay_backfill_v2"
                : "site_account_profile_v2",
            metadata: {
              discoveryVersion: plan.discoveryVersion,
              normalizationVersion: plan.normalizationVersion,
              logicalKey: account.logicalKey,
              sourceKind: account.sourceKind,
              siteAccountUserId: account.siteAccountUserId,
              latestNormalizedName: account.latestNormalizedName,
              snapshotCount: account.snapshotIds.length,
            } as Prisma.InputJsonValue,
          })),
        });
      });

      const accountRows = await tx.platformAccount.findMany({
        where: {
          platform: "steam",
          externalAccountId: {
            in: plan.platformAccounts.map(
              (account) => account.externalAccountId
            ),
          },
        },
        select: { id: true, externalAccountId: true },
      });
      const accountIdBySteam = new Map(
        accountRows.map((account) => [account.externalAccountId, account.id])
      );
      if (accountIdBySteam.size !== plan.platformAccounts.length) {
        throw new Error("PlatformAccount creation count does not match plan.");
      }

      await createManyInChunks(plan.nameObservations, async (group) => {
        await tx.platformNameObservation.createMany({
          data: group.map((observation) => {
            const platformAccountId = accountIdBySteam.get(
              observation.platformExternalAccountId
            );
            if (!platformAccountId) {
              throw new Error(
                `Missing PlatformAccount for ${observation.platformExternalAccountId}.`
              );
            }
            return {
              platformAccountId,
              replayPlayerSnapshotId: observation.replayPlayerSnapshotId,
              idempotencyKey: observation.idempotencyKey,
              displayName: observation.displayName,
              normalizedName: observation.normalizedName,
              normalizationVersion: observation.normalizationVersion,
              observedAt: new Date(observation.observedAt),
              sourceKind: observation.sourceKind,
              sourceIdentity: observation.sourceIdentity,
              exact: observation.exact,
              confidenceBps: observation.confidenceBps,
              provenance: observation.provenance as Prisma.InputJsonValue,
            };
          }),
        });
      });

      await createManyInChunks(plan.provisionalIdentities, async (group) => {
        await tx.provisionalIdentity.createMany({
          data: group.map((identity) => ({
            normalizationVersion: identity.normalizationVersion,
            normalizedName: identity.normalizedName,
            status: "open",
            firstObservedAt: new Date(identity.firstObservedAt),
            lastObservedAt: new Date(identity.lastObservedAt),
          })),
        });
      });

      const provisionalRows = await tx.provisionalIdentity.findMany({
        where: {
          normalizationVersion: plan.normalizationVersion,
          normalizedName: {
            in: plan.provisionalIdentities.map(
              (identity) => identity.normalizedName
            ),
          },
        },
        select: { id: true, normalizedName: true },
      });
      const provisionalIdByName = new Map(
        provisionalRows.map((identity) => [
          identity.normalizedName,
          identity.id,
        ])
      );
      if (
        provisionalIdByName.size !== plan.provisionalIdentities.length
      ) {
        throw new Error(
          "ProvisionalIdentity creation count does not match plan."
        );
      }

      await createManyInChunks(plan.warriors, async (group) => {
        await tx.warrior.createMany({
          data: group.map((warrior) => {
            const seedPlatformAccountId = accountIdBySteam.get(
              warrior.platformExternalAccountId
            );
            if (!seedPlatformAccountId) {
              throw new Error(
                `Missing seed PlatformAccount for ${warrior.logicalKey}.`
              );
            }
            return {
              seedPlatformAccountId,
              kind: warrior.kind,
              preferredDisplayName: warrior.preferredDisplayName,
              normalizedDisplayName: warrior.normalizedDisplayName,
              status: warrior.status,
            };
          }),
        });
      });

      const warriorRows = await tx.warrior.findMany({
        where: {
          seedPlatformAccountId: { in: [...accountIdBySteam.values()] },
        },
        select: { id: true, seedPlatformAccountId: true },
      });
      const warriorIdBySteam = new Map<string, number>();
      const steamByAccountId = new Map(
        [...accountIdBySteam.entries()].map(([steamId, id]) => [id, steamId])
      );
      for (const warrior of warriorRows) {
        if (!warrior.seedPlatformAccountId) continue;
        const steamId = steamByAccountId.get(warrior.seedPlatformAccountId);
        if (steamId) warriorIdBySteam.set(steamId, warrior.id);
      }
      if (warriorIdBySteam.size !== plan.warriors.length) {
        throw new Error("Warrior creation count does not match plan.");
      }

      const decisionClockRows = await tx.$queryRaw<
        { decidedAt: Date }[]
      >(Prisma.sql`
        SELECT transaction_timestamp() AS "decidedAt"
      `);
      const decisionRecordedAt = decisionClockRows[0]?.decidedAt;
      if (!decisionRecordedAt) {
        throw new Error("Unable to capture the identity decision timestamp.");
      }

      const allDecisions = [
        ...plan.provisionalDecisions.map((decision) => ({
          decisionKey: decision.decisionKey,
          decisionType: "discover_provisional_identity",
          inputHash: decision.decisionInputHash,
          evidence: decision.evidence,
          reason:
            "Deterministic accepted name-only replay evidence opens a provisional discovery bucket; no human identity, merge, Warrior, claim, or attribution is asserted.",
          impactPreview: {
            provisionalStatus: "open",
            humanIdentityAsserted: false,
            permanentMergeAsserted: false,
            independentlyAdjudicableSnapshots: true,
          },
        })),
        ...plan.proposedLinks.map((link) => ({
          decisionKey: link.decisionKey,
          decisionType: "propose_platform_link",
          inputHash: link.decisionInputHash,
          evidence: link.evidence,
          reason:
            "Deterministic exact-Steam replay evidence proposes a seed Warrior-platform link; no control or historical attribution is activated.",
          impactPreview: {
            linkStatus: "proposed",
            activeAttributionCreated: false,
          },
        })),
        ...plan.proposedClaims.map((claim) => ({
          decisionKey: claim.decisionKey,
          decisionType: "propose_warrior_claim",
          inputHash: claim.decisionInputHash,
          evidence: claim.evidence,
          reason:
            "Deterministic exact-Steam replay evidence proposes a SiteAccount claim; legacy verification is evidence only and no active claim is created.",
          impactPreview: {
            claimStatus: "proposed",
            activeClaimCreated: false,
            effectiveFrom: null,
          },
        })),
      ];
      await createManyInChunks(allDecisions, async (group) => {
        await tx.identityDecision.createMany({
          data: group.map((decision) => ({
            decisionKey: decision.decisionKey,
            decisionType: decision.decisionType,
            outcome: "proposed",
            actorUserId: null,
            actorRoleSnapshot: "system:identity-discovery-v2",
            reason: decision.reason,
            evidence: decision.evidence as Prisma.InputJsonValue,
            inputHash: decision.inputHash,
            impactPreview: decision.impactPreview as Prisma.InputJsonValue,
            effectiveFrom: null,
            effectiveTo: null,
            supersedesDecisionId: null,
            decidedAt: decisionRecordedAt,
          })),
        });
      });

      const decisionRows = await tx.identityDecision.findMany({
        where: {
          decisionKey: {
            in: allDecisions.map((decision) => decision.decisionKey),
          },
        },
        select: { id: true, decisionKey: true },
      });
      const decisionIdByKey = new Map(
        decisionRows.map((decision) => [decision.decisionKey, decision.id])
      );
      if (decisionIdByKey.size !== allDecisions.length) {
        throw new Error("IdentityDecision creation count does not match plan.");
      }

      await createManyInChunks(plan.proposedLinks, async (group) => {
        await tx.warriorPlatformLink.createMany({
          data: group.map((link) => {
            const warriorId = warriorIdBySteam.get(
              link.platformExternalAccountId
            );
            const platformAccountId = accountIdBySteam.get(
              link.platformExternalAccountId
            );
            const authorizedByDecisionId = decisionIdByKey.get(
              link.decisionKey
            );
            if (!warriorId || !platformAccountId || !authorizedByDecisionId) {
              throw new Error(`Missing link dependency for ${link.linkKey}.`);
            }
            return {
              linkKey: link.linkKey,
              warriorId,
              platformAccountId,
              status: link.status,
              attributionFrom: new Date(link.attributionFrom),
              attributionTo: null,
              controlVerifiedAt: null,
              verificationMethod: link.verificationMethod,
              confidenceBps: link.confidenceBps,
              evidence: link.evidence as Prisma.InputJsonValue,
              authorizedByDecisionId,
              supersededByDecisionId: null,
              createdByUserId: null,
            };
          }),
        });
      });

      await createManyInChunks(plan.proposedClaims, async (group) => {
        await tx.warriorClaim.createMany({
          data: group.map((claim) => {
            const warriorId = warriorIdBySteam.get(
              claim.platformExternalAccountId
            );
            const authorizedByDecisionId = decisionIdByKey.get(
              claim.decisionKey
            );
            if (!warriorId || !authorizedByDecisionId) {
              throw new Error(`Missing claim dependency for ${claim.claimKey}.`);
            }
            return {
              claimKey: claim.claimKey,
              warriorId,
              userId: claim.userId,
              role: claim.role,
              status: claim.status,
              effectiveFrom: null,
              effectiveTo: null,
              verificationMethod: claim.verificationMethod,
              evidence: claim.evidence as Prisma.InputJsonValue,
              authorizedByDecisionId,
              supersededByDecisionId: null,
            };
          }),
        });
      });

      const linkRows = await tx.warriorPlatformLink.findMany({
        where: { linkKey: { in: plan.proposedLinks.map((link) => link.linkKey) } },
        select: { id: true, linkKey: true },
      });
      const claimRows = await tx.warriorClaim.findMany({
        where: {
          claimKey: { in: plan.proposedClaims.map((claim) => claim.claimKey) },
        },
        select: { id: true, claimKey: true },
      });
      const linkIdByKey = new Map(linkRows.map((link) => [link.linkKey, link.id]));
      const claimIdByKey = new Map(
        claimRows.map((claim) => [claim.claimKey, claim.id])
      );

      const subjects: Prisma.IdentityDecisionSubjectCreateManyInput[] = [];
      for (const provisional of plan.provisionalDecisions) {
        const decisionId = decisionIdByKey.get(provisional.decisionKey);
        const provisionalIdentityId = provisionalIdByName.get(
          provisional.normalizedName
        );
        if (!decisionId || !provisionalIdentityId) {
          throw new Error(
            `Missing provisional decision dependency for ${provisional.decisionKey}.`
          );
        }
        subjects.push({
          decisionId,
          subjectRole: "provisional_bucket",
          provisionalIdentityId,
        });
        for (const replayPlayerSnapshotId of provisional.snapshotIds) {
          subjects.push({
            decisionId,
            subjectRole: "source_snapshot",
            replayPlayerSnapshotId,
          });
        }
      }
      for (const link of plan.proposedLinks) {
        const decisionId = decisionIdByKey.get(link.decisionKey);
        const warriorId = warriorIdBySteam.get(link.platformExternalAccountId);
        const platformAccountId = accountIdBySteam.get(
          link.platformExternalAccountId
        );
        const warriorPlatformLinkId = linkIdByKey.get(link.linkKey);
        if (
          !decisionId ||
          !warriorId ||
          !platformAccountId ||
          !warriorPlatformLinkId
        ) {
          throw new Error(`Missing decision subject dependency for ${link.linkKey}.`);
        }
        subjects.push(
          { decisionId, subjectRole: "warrior", warriorId },
          {
            decisionId,
            subjectRole: "platform_account",
            platformAccountId,
          },
          {
            decisionId,
            subjectRole: "proposed_link",
            warriorPlatformLinkId,
          }
        );
      }
      for (const claim of plan.proposedClaims) {
        const decisionId = decisionIdByKey.get(claim.decisionKey);
        const warriorId = warriorIdBySteam.get(claim.platformExternalAccountId);
        const platformAccountId = accountIdBySteam.get(
          claim.platformExternalAccountId
        );
        const warriorClaimId = claimIdByKey.get(claim.claimKey);
        if (
          !decisionId ||
          !warriorId ||
          !platformAccountId ||
          !warriorClaimId
        ) {
          throw new Error(
            `Missing decision subject dependency for ${claim.claimKey}.`
          );
        }
        subjects.push(
          { decisionId, subjectRole: "warrior", warriorId },
          {
            decisionId,
            subjectRole: "site_account",
            siteAccountUserId: claim.userId,
          },
          {
            decisionId,
            subjectRole: "platform_account",
            platformAccountId,
          },
          {
            decisionId,
            subjectRole: "proposed_claim",
            warriorClaimId,
          }
        );
      }
      await createManyInChunks(subjects, async (group) => {
        await tx.identityDecisionSubject.createMany({ data: group });
      });

      const [
        createdPlatformAccounts,
        createdNameObservations,
        createdProvisionalIdentities,
        createdWarriors,
        createdDecisions,
        createdSubjects,
        createdLinks,
        createdClaims,
        activeLinks,
        activeClaims,
        resolutionRuns,
        projections,
        publications,
      ] = await Promise.all([
        tx.platformAccount.count(),
        tx.platformNameObservation.count(),
        tx.provisionalIdentity.count(),
        tx.warrior.count(),
        tx.identityDecision.count(),
        tx.identityDecisionSubject.count(),
        tx.warriorPlatformLink.count(),
        tx.warriorClaim.count(),
        tx.warriorPlatformLink.count({ where: { status: "active" } }),
        tx.warriorClaim.count({ where: { status: "active" } }),
        tx.identityResolutionRun.count(),
        tx.replayPlayerIdentityProjection.count(),
        tx.identityProjectionPublication.count(),
      ]);

      const expectedSubjects = plan.counts.decisionSubjects;
      const expectedDecisions = plan.counts.decisions;
      const checks = {
        platformAccounts:
          createdPlatformAccounts === plan.counts.platformAccounts,
        nameObservations:
          createdNameObservations === plan.counts.nameObservations,
        provisionalIdentities:
          createdProvisionalIdentities === plan.counts.provisionalIdentities,
        warriors: createdWarriors === plan.counts.warriors,
        decisions: createdDecisions === expectedDecisions,
        subjects: createdSubjects === expectedSubjects,
        links: createdLinks === plan.counts.proposedLinks,
        claims: createdClaims === plan.counts.proposedClaims,
        activeLinks: activeLinks === 0,
        activeClaims: activeClaims === 0,
        resolutionRuns: resolutionRuns === 0,
        projections: projections === 0,
        publications: publications === 0,
      };
      const failed = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      if (failed.length > 0) {
        throw new Error(`Wave 2 verification failed: ${failed.join(", ")}.`);
      }

      return {
        applied: true,
        planResultHash: plan.resultHash,
        decisionTimestampPolicy: plan.decisionTimestampPolicy,
        decisionRecordedAt: decisionRecordedAt.toISOString(),
        counts: {
          platformAccounts: createdPlatformAccounts,
          nameObservations: createdNameObservations,
          provisionalIdentities: createdProvisionalIdentities,
          warriors: createdWarriors,
          decisions: createdDecisions,
          decisionSubjects: createdSubjects,
          proposedLinks: createdLinks,
          proposedClaims: createdClaims,
          activeLinks,
          activeClaims,
          resolutionRuns,
          projections,
          publications,
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 600_000,
    }
  );
}

async function main() {
  const mode = modeArgument();
  const maxSnapshotId = optionalPositiveInteger("--max-snapshot-id");
  const maxUserId = optionalPositiveInteger("--max-user-id");
  const output = readArgument("--output");
  const prisma = getPrisma();
  const source = await loadSource(prisma, {
    maxSnapshotId,
    maxUserId,
  });
  const plan = buildPlayerIdentityDiscoveryPlan(source);
  const currentIdentityCounts = await identityTableCounts();
  const summary = {
    mode,
    ...summarizePlayerIdentityDiscoveryPlan(plan),
    currentIdentityCounts,
  };

  if (mode === "plan") {
    if (output) {
      const target = writeJson(output, { summary, plan });
      console.log(JSON.stringify({ ...summary, output: target }, null, 2));
    } else {
      console.log(JSON.stringify(summary, null, 2));
    }
    return;
  }

  if (requiredArgument("--confirm") !== PLAYER_IDENTITY_APPLY_CONFIRMATION) {
    throw new Error(
      `Apply mode requires --confirm ${PLAYER_IDENTITY_APPLY_CONFIRMATION}.`
    );
  }
  const expectedInputHash = requiredArgument("--expected-input-hash");
  const expectedResultHash = requiredArgument("--expected-result-hash");
  if (plan.inputHash !== expectedInputHash) {
    throw new Error(
      `Input hash changed: expected ${expectedInputHash}, found ${plan.inputHash}.`
    );
  }
  if (plan.resultHash !== expectedResultHash) {
    throw new Error(
      `Result hash changed: expected ${expectedResultHash}, found ${plan.resultHash}.`
    );
  }
  if (!maxSnapshotId || !maxUserId) {
    throw new Error(
      "Apply mode requires --max-snapshot-id and --max-user-id from the reviewed plan."
    );
  }
  if (!output) {
    throw new Error("Apply mode requires --output for the immutable plan receipt.");
  }
  assertEmptyIdentityFoundation(currentIdentityCounts);
  const reviewedPlanOutput = writeJson(output, {
    phase: "reviewed_apply_intent",
    summary,
    plan,
  });
  const result = await applyPlan({
    reviewedPlan: plan,
    maxSnapshotId,
    maxUserId,
    expectedInputHash,
    expectedResultHash,
  });
  const appliedOutput = writeJson(`${output}.applied.json`, {
    phase: "applied",
    summary,
    plan,
    confirmation: PLAYER_IDENTITY_APPLY_CONFIRMATION,
    result,
  });
  console.log(
    JSON.stringify(
      {
        ...summary,
        reviewedPlanOutput,
        appliedOutput,
        confirmation: PLAYER_IDENTITY_APPLY_CONFIRMATION,
        result,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
