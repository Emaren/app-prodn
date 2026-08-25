import {
  Prisma,
  type PrismaClient,
} from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  buildWarGraphSettlementJob,
  correlateWarGraphAttestations,
  parseWarGraphCorrelationJobPayload,
  type WarGraphCorrelationAttestation,
  type WarGraphCorrelationContext,
  type WarGraphCorrelationMembership,
  type WarGraphCorrelationPairing,
  type WarGraphLiveContestPlan,
  type WarGraphQualifiedContestPlan,
} from "./correlation.ts";
import type {
  LeasedWarGraphCorrelationJob,
  WarGraphCorrelationJobTransition,
  WarGraphCorrelationPersistedResult,
  WarGraphCorrelationWorkerAdapter,
} from "./correlationWorker.ts";
import {
  appendWarGraphEvent,
  lockWarGraphTransaction,
  WARGRAPH_SLUG,
} from "./foundation.ts";
import { stableWarGraphJson } from "./foundationContract.ts";
import { getWarGraphNightKey } from "./time.ts";

const CORRELATION_JOB_TYPE = "correlate_attestation" as const;
const TERMINAL_CONTEST_STATUSES = new Set([
  "settled",
  "voided",
  "rejected",
]);

type TransactionClient = Prisma.TransactionClient;

type LeasedRow = {
  id: bigint;
  graphId: number;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  version: number;
  createdAt: Date;
};

function permanent(
  code: string,
  detail: string,
): WarGraphCorrelationPersistedResult {
  return { kind: "dead", code, detail } as WarGraphCorrelationPersistedResult;
}

function temporary(
  code: string,
  detail: string,
): WarGraphCorrelationPersistedResult {
  return { kind: "retry", code, detail } as WarGraphCorrelationPersistedResult;
}

class WarGraphCorrelationRollback extends Error {
  readonly result: WarGraphCorrelationPersistedResult;

  constructor(result: WarGraphCorrelationPersistedResult) {
    super("WARGRAPH_CORRELATION_ROLLBACK");
    this.name = "WarGraphCorrelationRollback";
    this.result = result;
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableWarGraphJson(left) === stableWarGraphJson(right);
}

async function lockCorrelationTruth(
  tx: TransactionClient,
  gameStatsId: number,
  graphId: number,
) {
  // Desync/adjudication writers use the one-argument game lock. Always take it
  // before the graph lock to prevent a decision from committing mid-read.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(${gameStatsId})
  `;
  await lockWarGraphTransaction(tx, graphId);
}

async function reconstructOrganicStart(
  tx: TransactionClient,
  input: {
    graphId: number;
    membershipId: number;
    commencedAt: Date;
    authoritativeOrderKey: string;
  },
) {
  const rows = await tx.$queryRaw<
    Array<{
      nodeId: number;
      layerOrdinal: number;
      occupancyVersion: number;
    }>
  >(Prisma.sql`
    SELECT
      movement."to_node_id" AS "nodeId",
      movement."to_layer_ordinal" AS "layerOrdinal",
      GREATEST(
        COUNT(*) OVER () - 1,
        0
      )::integer AS "occupancyVersion"
    FROM "war_graph_movements" movement
    JOIN "war_graph_nodes" node
      ON node."id" = movement."to_node_id"
     AND node."graph_id" = movement."graph_id"
    JOIN "war_graph_layers" layer
      ON layer."id" = node."layer_id"
     AND layer."graph_id" = movement."graph_id"
    LEFT JOIN "war_graph_contests" contest
      ON contest."id" = movement."contest_id"
     AND contest."graph_id" = movement."graph_id"
    WHERE movement."graph_id" = ${input.graphId}
      AND movement."membership_id" = ${input.membershipId}
      AND movement."to_layer_ordinal" = layer."ordinal"
      AND (
        (
          movement."movement_type" = 'INITIAL_ASSIGNMENT'
          AND movement."moved_at" <= ${input.commencedAt}
        )
        OR
        (
          contest."status" = 'settled'
          AND contest."commenced_at" IS NOT NULL
          AND (
            contest."commenced_at" < ${input.commencedAt}
            OR (
              contest."commenced_at" = ${input.commencedAt}
              AND contest."authoritative_order_key" < ${input.authoritativeOrderKey}
            )
          )
        )
      )
    ORDER BY
      COALESCE(contest."commenced_at", movement."moved_at") DESC,
      COALESCE(contest."authoritative_order_key", '') DESC,
      movement."id" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function countAuthoritativeActions(
  tx: TransactionClient,
  input: {
    graphId: number;
    nightId: number;
    membershipId: number;
    commencedAt: Date;
    authoritativeOrderKey: string;
  },
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ used: number }>>(Prisma.sql`
    SELECT COUNT(*)::integer AS "used"
    FROM "war_graph_actions" action
    JOIN "war_graph_contests" contest
      ON contest."id" = action."contest_id"
     AND contest."graph_id" = action."graph_id"
     AND contest."night_id" = action."night_id"
    WHERE action."graph_id" = ${input.graphId}
      AND action."night_id" = ${input.nightId}
      AND action."membership_id" = ${input.membershipId}
      AND contest."status" = 'settled'
      AND contest."commenced_at" IS NOT NULL
      AND (
        contest."commenced_at" < ${input.commencedAt}
        OR (
          contest."commenced_at" = ${input.commencedAt}
          AND contest."authoritative_order_key" < ${input.authoritativeOrderKey}
        )
      )
  `);
  return rows[0]?.used ?? 0;
}

async function hasConflictingEngagementAtStart(
  tx: TransactionClient,
  input: {
    graphId: number;
    membershipId: number;
    commencedAt: Date;
    allowedPairingId: number | null;
  },
): Promise<boolean> {
  const count = await tx.warGraphEngagement.count({
    where: {
      graphId: input.graphId,
      membershipId: input.membershipId,
      acquiredAt: { lte: input.commencedAt },
      OR: [
        { releasedAt: null },
        { releasedAt: { gt: input.commencedAt } },
      ],
      ...(input.allowedPairingId
        ? { pairingId: { not: input.allowedPairingId } }
        : {}),
    },
  });
  return count > 0;
}

function exactMemberSet(
  pairing: {
    aggressorMembershipId: number;
    defenderMembershipId: number;
  },
  membershipIds: readonly number[],
): boolean {
  const expected = new Set(membershipIds);
  return (
    expected.size === 2 &&
    expected.has(pairing.aggressorMembershipId) &&
    expected.has(pairing.defenderMembershipId)
  );
}

async function loadExactPairing(
  tx: TransactionClient,
  input: {
    graphId: number;
    membershipIds: readonly number[];
    commencedAt: Date;
  },
): Promise<
  | WarGraphCorrelationPairing
  | null
  | "WARGRAPH_PAIRING_CONFLICT"
> {
  const candidates = await tx.warGraphPairing.findMany({
    where: {
      graphId: input.graphId,
      source: { in: ["advance", "organic_autobind"] },
      status: { in: ["accepted", "engaged", "live", "settled", "voided"] },
      acceptedAt: { lte: input.commencedAt },
      launchDeadlineAt: { gte: input.commencedAt },
      aggressorMembershipId: { in: [...input.membershipIds] },
      defenderMembershipId: { in: [...input.membershipIds] },
      OR: [
        { commencedAt: null },
        { commencedAt: input.commencedAt },
      ],
    },
    include: {
      advanceRequest: { select: { createdAt: true, graphId: true } },
      night: { select: { graphId: true, rulesetId: true } },
      ruleset: { select: { graphId: true } },
      engagements: {
        select: {
          membershipId: true,
          role: true,
          status: true,
          acquiredAt: true,
          releasedAt: true,
        },
      },
      aggressorStartNode: {
        select: { graphId: true, layer: { select: { ordinal: true } } },
      },
      defenderStartNode: {
        select: { graphId: true, layer: { select: { ordinal: true } } },
      },
    },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    take: 3,
  });
  const exact = candidates.filter(
    (row) =>
      exactMemberSet(row, input.membershipIds) &&
      ((row.source === "advance" &&
        row.advanceRequest?.graphId === input.graphId) ||
        (row.source === "organic_autobind" &&
          row.advanceRequest === null &&
          row.commencedAt?.getTime() === input.commencedAt.getTime())) &&
      row.night.graphId === input.graphId &&
      row.night.rulesetId === row.rulesetId &&
      row.ruleset.graphId === input.graphId &&
      row.engagements.length === 2 &&
      row.engagements.some(
        (engagement) =>
          engagement.membershipId === row.aggressorMembershipId &&
          engagement.role === "aggressor" &&
          engagement.acquiredAt <= input.commencedAt &&
          (engagement.releasedAt === null ||
            engagement.releasedAt > input.commencedAt),
      ) &&
      row.engagements.some(
        (engagement) =>
          engagement.membershipId === row.defenderMembershipId &&
          engagement.role === "defender" &&
          engagement.acquiredAt <= input.commencedAt &&
          (engagement.releasedAt === null ||
            engagement.releasedAt > input.commencedAt),
      ) &&
      row.aggressorStartNode.graphId === input.graphId &&
      row.defenderStartNode.graphId === input.graphId &&
      row.aggressorStartNode.layer.ordinal ===
        row.aggressorStartLayerOrdinal &&
      row.defenderStartNode.layer.ordinal ===
        row.defenderStartLayerOrdinal,
  );
  if (exact.length > 1) return "WARGRAPH_PAIRING_CONFLICT";
  const row = exact[0];
  if (!row) return null;
  return {
    path: row.source === "advance" ? "BOUND_PAIRING" : "ORGANIC",
    id: row.id,
    advanceRequestId: row.advanceRequestId,
    aggressorMembershipId: row.aggressorMembershipId,
    defenderMembershipId: row.defenderMembershipId,
    aggressorStartNodeId: row.aggressorStartNodeId,
    defenderStartNodeId: row.defenderStartNodeId,
    aggressorStartLayer: row.aggressorStartLayerOrdinal,
    defenderStartLayer: row.defenderStartLayerOrdinal,
    aggressorStartVersion: row.aggressorStartVersion,
    defenderStartVersion: row.defenderStartVersion,
    nightId: row.nightId,
    rulesetId: row.rulesetId,
    acceptedAt: row.acceptedAt,
    launchDeadlineAt: row.launchDeadlineAt,
    commencedAt: row.commencedAt,
    advanceCreatedAt: row.advanceRequest?.createdAt ?? null,
    status: row.status,
  };
}

type AnyContestPlan = WarGraphLiveContestPlan | WarGraphQualifiedContestPlan;

async function ensureContestPairing(
  tx: TransactionClient,
  plan: AnyContestPlan,
): Promise<
  | { ok: true; plan: AnyContestPlan; pairingCreated: boolean }
  | { ok: false; result: WarGraphCorrelationPersistedResult }
> {
  if (plan.pairingId) {
    let pairing = await tx.warGraphPairing.findUnique({
      where: { id: plan.pairingId },
    });
    if (
      !pairing ||
      pairing.graphId !== plan.graphId ||
      pairing.nightId !== plan.nightId ||
      pairing.rulesetId !== plan.rulesetId ||
      pairing.aggressorMembershipId !== plan.aggressorMembershipId ||
      pairing.defenderMembershipId !== plan.defenderMembershipId ||
      pairing.aggressorStartNodeId !== plan.aggressorStartNodeId ||
      pairing.defenderStartNodeId !== plan.defenderStartNodeId ||
      (pairing.commencedAt !== null &&
        pairing.commencedAt.getTime() !== plan.commencedAt.getTime()) ||
      (pairing.status !== "accepted" &&
        pairing.status !== "engaged" &&
        pairing.status !== "live" &&
        pairing.status !== "settled" &&
        pairing.status !== "voided")
    ) {
      return {
        ok: false,
        result: permanent(
          "WARGRAPH_PAIRING_CHANGED_DURING_CORRELATION",
          "The frozen pairing no longer matches the correlated game.",
        ),
      };
    }
    if (
      pairing.status !== "settled" &&
      pairing.status !== "voided" &&
      (!pairing.commencedAt || pairing.status !== "live")
    ) {
      pairing = await tx.warGraphPairing.update({
        where: { id: pairing.id },
        data: {
          commencedAt: pairing.commencedAt ?? plan.commencedAt,
          status: "live",
          version: { increment: 1 },
        },
      });
    }
    return { ok: true, plan, pairingCreated: false };
  }

  const idempotencyKey = `wargraph-organic:${plan.liveGameFingerprint}`;
  const existing = await tx.warGraphPairing.findUnique({
    where: { idempotencyKey },
  });
  if (
    existing &&
    (existing.graphId !== plan.graphId ||
      existing.nightId !== plan.nightId ||
      existing.rulesetId !== plan.rulesetId ||
      existing.advanceRequestId !== null ||
      existing.aggressorMembershipId !== plan.aggressorMembershipId ||
      existing.defenderMembershipId !== plan.defenderMembershipId ||
      existing.aggressorStartNodeId !== plan.aggressorStartNodeId ||
      existing.defenderStartNodeId !== plan.defenderStartNodeId ||
      existing.aggressorStartLayerOrdinal !== plan.aggressorStartLayer ||
      existing.defenderStartLayerOrdinal !== plan.defenderStartLayer ||
      existing.aggressorStartVersion !== plan.aggressorStartVersion ||
      existing.defenderStartVersion !== plan.defenderStartVersion ||
      existing.source !== "organic_autobind" ||
      (existing.status !== "live" &&
        existing.status !== "settled" &&
        existing.status !== "voided") ||
      existing.acceptedAt.getTime() !== plan.commencedAt.getTime() ||
      existing.launchDeadlineAt.getTime() !==
        plan.commencedAt.getTime() + 30 * 60_000 ||
      existing.commencedAt?.getTime() !== plan.commencedAt.getTime())
  ) {
    return {
      ok: false,
      result: permanent(
        "WARGRAPH_PAIRING_IDENTITY_COLLISION",
        "The organic pairing identity is already bound to different facts.",
      ),
    };
  }
  let pairing = existing;
  let pairingCreated = false;
  if (!pairing) {
    const currentEngagements = await tx.warGraphEngagement.findMany({
      where: {
        graphId: plan.graphId,
        membershipId: {
          in: [plan.aggressorMembershipId, plan.defenderMembershipId],
        },
        status: "active",
        releasedAt: null,
      },
      select: { pairingId: true },
    });
    if (currentEngagements.length > 0) {
      return {
        ok: false,
        result: temporary(
          "WARGRAPH_AUTHORITATIVE_ORDER_BLOCKED",
          "A later active engagement prevents safe organic autobinding.",
        ),
      };
    }
    pairing = await tx.warGraphPairing.create({
      data: {
        graphId: plan.graphId,
        nightId: plan.nightId,
        rulesetId: plan.rulesetId,
        advanceRequestId: null,
        aggressorMembershipId: plan.aggressorMembershipId,
        defenderMembershipId: plan.defenderMembershipId,
        aggressorStartNodeId: plan.aggressorStartNodeId,
        defenderStartNodeId: plan.defenderStartNodeId,
        aggressorStartLayerOrdinal: plan.aggressorStartLayer,
        defenderStartLayerOrdinal: plan.defenderStartLayer,
        aggressorStartVersion: plan.aggressorStartVersion,
        defenderStartVersion: plan.defenderStartVersion,
        source: "organic_autobind",
        idempotencyKey,
        status: "live",
        acceptedAt: plan.commencedAt,
        launchDeadlineAt: new Date(plan.commencedAt.getTime() + 30 * 60_000),
        commencedAt: plan.commencedAt,
      },
    });
    await tx.warGraphEngagement.createMany({
      data: [
        {
          graphId: plan.graphId,
          pairingId: pairing.id,
          membershipId: plan.aggressorMembershipId,
          role: "aggressor",
          status: "active",
          acquiredAt: plan.commencedAt,
        },
        {
          graphId: plan.graphId,
          pairingId: pairing.id,
          membershipId: plan.defenderMembershipId,
          role: "defender",
          status: "active",
          acquiredAt: plan.commencedAt,
        },
      ],
    });
    pairingCreated = true;
  }
  return {
    ok: true,
    plan: { ...plan, pairingId: pairing.id },
    pairingCreated,
  };
}

function exactContest(
  contest: {
    graphId: number;
    nightId: number;
    rulesetId: number;
    pairingId: number | null;
    advanceRequestId: number | null;
    aggressorMembershipId: number;
    defenderMembershipId: number;
    aggressorStartNodeId: number;
    defenderStartNodeId: number;
    aggressorStartLayerOrdinal: number;
    defenderStartLayerOrdinal: number;
    aggressorStartVersion: number;
    defenderStartVersion: number;
    kind: string;
    provenance: string;
    idempotencyKey: string;
    liveGameFingerprint: string | null;
    platformMatchId: string | null;
    gameStatsId: number | null;
    authoritativeOrderKey: string | null;
    commencedAt: Date | null;
    qualificationStatus: string;
    qualificationReason: string | null;
    resultStatus: string;
    outcomeCode: string | null;
    winnerMembershipId: number | null;
    loserMembershipId: number | null;
    rosterHash: string | null;
    propositionHash: string | null;
    resultHash: string | null;
  },
  plan: WarGraphQualifiedContestPlan,
): boolean {
  return Boolean(
    contest.graphId === plan.graphId &&
      contest.nightId === plan.nightId &&
      contest.rulesetId === plan.rulesetId &&
      contest.pairingId === plan.pairingId &&
      contest.advanceRequestId === plan.advanceRequestId &&
      contest.aggressorMembershipId === plan.aggressorMembershipId &&
      contest.defenderMembershipId === plan.defenderMembershipId &&
      contest.aggressorStartNodeId === plan.aggressorStartNodeId &&
      contest.defenderStartNodeId === plan.defenderStartNodeId &&
      contest.aggressorStartLayerOrdinal === plan.aggressorStartLayer &&
      contest.defenderStartLayerOrdinal === plan.defenderStartLayer &&
      contest.aggressorStartVersion === plan.aggressorStartVersion &&
      contest.defenderStartVersion === plan.defenderStartVersion &&
      contest.kind === "VERIFIED_BATTLE" &&
      contest.provenance === "LIVE_DOUBLE_WATCHER" &&
      contest.idempotencyKey === plan.idempotencyKey &&
      contest.liveGameFingerprint === plan.liveGameFingerprint &&
      contest.platformMatchId === plan.platformMatchId &&
      contest.gameStatsId === plan.gameStatsId &&
      contest.authoritativeOrderKey === plan.authoritativeOrderKey &&
      contest.commencedAt?.getTime() === plan.commencedAt.getTime() &&
      contest.qualificationStatus === "eligible" &&
      contest.qualificationReason === "WARGRAPH_ELIGIBLE" &&
      contest.resultStatus === "verified" &&
      contest.outcomeCode === plan.outcomeCode &&
      contest.winnerMembershipId === plan.winnerMembershipId &&
      contest.loserMembershipId === plan.loserMembershipId &&
      contest.rosterHash === plan.rosterHash &&
      contest.propositionHash === plan.propositionHash &&
      contest.resultHash === plan.resultHash,
  );
}

function exactContestStartIdentity(
  contest: Parameters<typeof exactContest>[0],
  plan: AnyContestPlan,
): boolean {
  return Boolean(
    contest.graphId === plan.graphId &&
      contest.nightId === plan.nightId &&
      contest.rulesetId === plan.rulesetId &&
      contest.pairingId === plan.pairingId &&
      contest.advanceRequestId === plan.advanceRequestId &&
      contest.aggressorMembershipId === plan.aggressorMembershipId &&
      contest.defenderMembershipId === plan.defenderMembershipId &&
      contest.aggressorStartNodeId === plan.aggressorStartNodeId &&
      contest.defenderStartNodeId === plan.defenderStartNodeId &&
      contest.aggressorStartLayerOrdinal === plan.aggressorStartLayer &&
      contest.defenderStartLayerOrdinal === plan.defenderStartLayer &&
      contest.aggressorStartVersion === plan.aggressorStartVersion &&
      contest.defenderStartVersion === plan.defenderStartVersion &&
      contest.kind === "VERIFIED_BATTLE" &&
      contest.provenance === "LIVE_DOUBLE_WATCHER" &&
      contest.idempotencyKey === plan.idempotencyKey &&
      contest.liveGameFingerprint === plan.liveGameFingerprint &&
      contest.platformMatchId === plan.platformMatchId &&
      contest.authoritativeOrderKey === plan.authoritativeOrderKey &&
      contest.commencedAt?.getTime() === plan.commencedAt.getTime() &&
      contest.qualificationStatus === "eligible" &&
      contest.qualificationReason === "WARGRAPH_ELIGIBLE" &&
      contest.rosterHash === plan.rosterHash &&
      contest.propositionHash === plan.propositionHash
  );
}

async function persistQualifiedContest(
  tx: TransactionClient,
  plan: WarGraphQualifiedContestPlan,
  now: Date,
): Promise<WarGraphCorrelationPersistedResult> {
  const collisionRows = await tx.warGraphContest.findMany({
    where: {
      OR: [
        { idempotencyKey: plan.idempotencyKey },
        { liveGameFingerprint: plan.liveGameFingerprint },
        ...(plan.platformMatchId
          ? [{ platformMatchId: plan.platformMatchId }]
          : []),
        { gameStatsId: plan.gameStatsId },
        ...(plan.pairingId ? [{ pairingId: plan.pairingId }] : []),
      ],
    },
    take: 6,
  });
  const contestIds = new Set(collisionRows.map((row) => row.id));
  if (contestIds.size > 1) {
    return permanent(
      "WARGRAPH_CONTEST_IDENTITY_COLLISION",
      "Unique contest identities resolve to different stored contests.",
    );
  }
  const existing = collisionRows[0] ?? null;
  const existingIsStart = Boolean(
    existing &&
      existing.status === "evidence_pending" &&
      existing.resultStatus === "unresolved" &&
      existing.winnerMembershipId === null &&
      existing.loserMembershipId === null &&
      existing.resultHash === null &&
      exactContestStartIdentity(existing, plan),
  );
  if (existing && !exactContest(existing, plan) && !existingIsStart) {
    return permanent(
      "WARGRAPH_CONTEST_IDENTITY_COLLISION",
      "A stored contest unique key has different immutable facts.",
    );
  }

  const claimCollisions = await tx.warGraphContestAttestation.findMany({
    where: {
      OR: [
        { attestationId: { in: plan.evidenceLinks.map((row) => row.attestationId) } },
        { idempotencyKey: { in: plan.evidenceLinks.map((row) => row.idempotencyKey) } },
      ],
    },
  });
  for (const collision of claimCollisions) {
    const expected = plan.evidenceLinks.find(
      (row) => row.attestationId === collision.attestationId,
    );
    if (
      !expected ||
      !existing ||
      collision.contestId !== existing.id ||
      collision.evidencePhase !== "final" ||
      collision.membershipId !== expected.membershipId ||
      collision.uploaderUserId !== expected.uploaderUserId ||
      collision.participantRole !== expected.participantRole ||
      collision.validationHash !== expected.validationHash ||
      collision.idempotencyKey !== expected.idempotencyKey
    ) {
      return permanent(
        "WARGRAPH_ATTESTATION_CLAIM_CONFLICT",
        "An immutable attestation claim is already bound to different facts.",
      );
    }
  }

  if (existing && TERMINAL_CONTEST_STATUSES.has(existing.status)) {
    if (claimCollisions.length !== 2) {
      return permanent(
        "WARGRAPH_TERMINAL_CONTEST_EVIDENCE_INCOMPLETE",
        "A terminal contest is missing its required immutable double-Watcher claims.",
      );
    }
    return {
      kind: "terminal",
      contestId: existing.id,
      status: existing.status as "settled" | "voided" | "rejected",
    };
  }
  if (
    existing &&
    existing.status !== "qualified" &&
    !existingIsStart
  ) {
    return permanent(
      "WARGRAPH_CONTEST_STATE_CONFLICT",
      "An existing nonterminal contest cannot be silently reopened or rewritten.",
    );
  }

  let contest = existing;
  let contestCreated = false;
  if (!contest) {
    contest = await tx.warGraphContest.create({
      data: {
        graphId: plan.graphId,
        nightId: plan.nightId,
        rulesetId: plan.rulesetId,
        pairingId: plan.pairingId,
        advanceRequestId: plan.advanceRequestId,
        aggressorMembershipId: plan.aggressorMembershipId,
        defenderMembershipId: plan.defenderMembershipId,
        aggressorStartNodeId: plan.aggressorStartNodeId,
        defenderStartNodeId: plan.defenderStartNodeId,
        aggressorStartLayerOrdinal: plan.aggressorStartLayer,
        defenderStartLayerOrdinal: plan.defenderStartLayer,
        aggressorStartVersion: plan.aggressorStartVersion,
        defenderStartVersion: plan.defenderStartVersion,
        kind: "VERIFIED_BATTLE",
        provenance: "LIVE_DOUBLE_WATCHER",
        idempotencyKey: plan.idempotencyKey,
        liveGameFingerprint: plan.liveGameFingerprint,
        platformMatchId: plan.platformMatchId,
        gameStatsId: plan.gameStatsId,
        authoritativeOrderKey: plan.authoritativeOrderKey,
        commencedAt: plan.commencedAt,
        qualificationStatus: "eligible",
        qualificationReason: "WARGRAPH_ELIGIBLE",
        resultStatus: "verified",
        outcomeCode: plan.outcomeCode,
        winnerMembershipId: plan.winnerMembershipId,
        loserMembershipId: plan.loserMembershipId,
        rosterHash: plan.rosterHash,
        propositionHash: plan.propositionHash,
        resultHash: plan.resultHash,
        status: "qualified",
      },
    });
    contestCreated = true;
  } else if (existingIsStart) {
    contest = await tx.warGraphContest.update({
      where: { id: contest.id },
      data: {
        gameStatsId: plan.gameStatsId,
        resultStatus: "verified",
        outcomeCode: plan.outcomeCode,
        winnerMembershipId: plan.winnerMembershipId,
        loserMembershipId: plan.loserMembershipId,
        resultHash: plan.resultHash,
        status: "qualified",
        version: { increment: 1 },
      },
    });
  }

  for (const claim of plan.evidenceLinks) {
    if (claimCollisions.some((row) => row.attestationId === claim.attestationId)) {
      continue;
    }
    await tx.warGraphContestAttestation.create({
      data: {
        contestId: contest.id,
        ...claim,
        linkedAt: now,
      },
    });
  }
  const claims = await tx.warGraphContestAttestation.findMany({
    where: { contestId: contest.id, evidencePhase: "final" },
    orderBy: { participantRole: "asc" },
  });
  if (
    claims.length !== 2 ||
    new Set(claims.map((row) => row.uploaderUserId)).size !== 2 ||
    new Set(claims.map((row) => row.membershipId)).size !== 2 ||
    new Set(claims.map((row) => row.participantRole)).size !== 2
  ) {
    throw new Error("WARGRAPH_DOUBLE_WATCHER_CLAIMS_NOT_ATOMIC");
  }

  const eventKey = `wargraph:event:correlated:${plan.liveGameFingerprint}`;
  const eventPayload = {
    schema: "aoe2war-wargraph-contest-correlated/v1",
    liveGameFingerprint: plan.liveGameFingerprint,
    platformMatchId: plan.platformMatchId,
    gameStatsId: plan.gameStatsId,
    rosterHash: plan.rosterHash,
    propositionHash: plan.propositionHash,
    resultHash: plan.resultHash,
    outcomeCode: plan.outcomeCode,
    claimValidationHashes: plan.evidenceLinks
      .map((row) => row.validationHash)
      .sort(),
  };
  const existingEvent = await tx.warGraphEvent.findUnique({
    where: { idempotencyKey: eventKey },
  });
  if (
    existingEvent &&
    (existingEvent.graphId !== plan.graphId ||
      existingEvent.nightId !== plan.nightId ||
      existingEvent.contestId !== contest.id ||
      existingEvent.aggregateType !== "contest" ||
      existingEvent.aggregateId !== contest.publicId ||
      existingEvent.eventType !== "WARGRAPH_CONTEST_CORRELATED" ||
      !jsonEqual(existingEvent.payload, eventPayload))
  ) {
    throw new Error("WARGRAPH_CORRELATION_EVENT_IDENTITY_COLLISION");
  }
  if (!existingEvent) {
    await appendWarGraphEvent(tx, {
      graphId: plan.graphId,
      nightId: plan.nightId,
      pairingId: plan.pairingId,
      contestId: contest.id,
      aggregateType: "contest",
      aggregateId: contest.publicId,
      eventType: "WARGRAPH_CONTEST_CORRELATED",
      idempotencyKey: eventKey,
      priorVersion: null,
      newVersion: contest.version,
      payload: eventPayload,
      occurredAt: now,
    });
  }

  const settlementJob = buildWarGraphSettlementJob(contest.id, plan);
  const existingSettlementJob = await tx.warGraphJob.findUnique({
    where: { dedupeKey: settlementJob.dedupeKey },
  });
  if (
    existingSettlementJob &&
    (existingSettlementJob.graphId !== settlementJob.graphId ||
      existingSettlementJob.jobType !== settlementJob.jobType ||
      !jsonEqual(existingSettlementJob.payload, settlementJob.payload))
  ) {
    throw new Error("WARGRAPH_SETTLEMENT_JOB_IDENTITY_COLLISION");
  }
  if (!existingSettlementJob) {
    await tx.warGraphJob.create({
      data: {
        ...settlementJob,
        payload: settlementJob.payload,
        availableAt: now,
      },
    });
  }

  if (plan.pairingId) {
    const pairing = await tx.warGraphPairing.findUnique({
      where: { id: plan.pairingId },
    });
    if (
      !pairing ||
      pairing.graphId !== plan.graphId ||
      (pairing.commencedAt &&
        pairing.commencedAt.getTime() !== plan.commencedAt.getTime()) ||
      (pairing.status !== "accepted" &&
        pairing.status !== "engaged" &&
        pairing.status !== "live")
    ) {
      throw new Error("WARGRAPH_PAIRING_CHANGED_DURING_CORRELATION");
    }
    if (!pairing.commencedAt || pairing.status !== "live") {
      await tx.warGraphPairing.update({
        where: { id: pairing.id },
        data: {
          commencedAt: pairing.commencedAt ?? plan.commencedAt,
          status: "live",
          version: { increment: 1 },
        },
      });
    }
  }

  if (contestCreated || existingIsStart) {
    await Promise.all([
      tx.warGraph.update({
        where: { id: plan.graphId },
        data: { projectionVersion: { increment: 1 } },
      }),
      tx.warGraphNight.update({
        where: { id: plan.nightId },
        data: { version: { increment: 1 } },
      }),
    ]);
  }
  return {
    kind: "qualified",
    contestId: contest.id,
    settlementJobCreated: !existingSettlementJob,
  };
}

async function persistLiveContest(
  tx: TransactionClient,
  plan: WarGraphLiveContestPlan,
  now: Date,
): Promise<WarGraphCorrelationPersistedResult> {
  if (!plan.pairingId) {
    throw new Error("WARGRAPH_LIVE_CONTEST_PAIRING_REQUIRED");
  }
  const collisions = await tx.warGraphContest.findMany({
    where: {
      OR: [
        { idempotencyKey: plan.idempotencyKey },
        { liveGameFingerprint: plan.liveGameFingerprint },
        { gameStatsId: plan.gameStatsId },
        { pairingId: plan.pairingId },
        ...(plan.platformMatchId
          ? [{ platformMatchId: plan.platformMatchId }]
          : []),
      ],
    },
    take: 6,
  });
  if (new Set(collisions.map((row) => row.id)).size > 1) {
    return permanent(
      "WARGRAPH_CONTEST_IDENTITY_COLLISION",
      "Start-proof identities resolve to different stored contests.",
    );
  }
  let contest = collisions[0] ?? null;
  if (contest && !exactContestStartIdentity(contest, plan)) {
    return permanent(
      "WARGRAPH_CONTEST_IDENTITY_COLLISION",
      "A live-game identity is already bound to different immutable facts.",
    );
  }
  if (contest && TERMINAL_CONTEST_STATUSES.has(contest.status)) {
    return {
      kind: "terminal",
      contestId: contest.id,
      status: contest.status as "settled" | "voided" | "rejected",
    };
  }
  if (contest?.status === "qualified") {
    return { kind: "live", contestId: contest.id, pairingId: plan.pairingId };
  }
  if (contest && contest.status !== "evidence_pending") {
    return permanent(
      "WARGRAPH_CONTEST_STATE_CONFLICT",
      "The live contest cannot be reopened from its current state.",
    );
  }

  const claimCollisions = await tx.warGraphContestAttestation.findMany({
    where: {
      OR: [
        { attestationId: { in: plan.evidenceLinks.map((row) => row.attestationId) } },
        { idempotencyKey: { in: plan.evidenceLinks.map((row) => row.idempotencyKey) } },
      ],
    },
  });
  for (const collision of claimCollisions) {
    const expected = plan.evidenceLinks.find(
      (row) => row.attestationId === collision.attestationId,
    );
    if (
      !expected ||
      !contest ||
      collision.contestId !== contest.id ||
      collision.evidencePhase !== "start" ||
      collision.membershipId !== expected.membershipId ||
      collision.uploaderUserId !== expected.uploaderUserId ||
      collision.participantRole !== expected.participantRole ||
      collision.validationHash !== expected.validationHash ||
      collision.idempotencyKey !== expected.idempotencyKey
    ) {
      return permanent(
        "WARGRAPH_ATTESTATION_CLAIM_CONFLICT",
        "A start-proof claim is already bound to different facts.",
      );
    }
  }

  let contestCreated = false;
  if (!contest) {
    contest = await tx.warGraphContest.create({
      data: {
        graphId: plan.graphId,
        nightId: plan.nightId,
        rulesetId: plan.rulesetId,
        pairingId: plan.pairingId,
        advanceRequestId: plan.advanceRequestId,
        aggressorMembershipId: plan.aggressorMembershipId,
        defenderMembershipId: plan.defenderMembershipId,
        aggressorStartNodeId: plan.aggressorStartNodeId,
        defenderStartNodeId: plan.defenderStartNodeId,
        aggressorStartLayerOrdinal: plan.aggressorStartLayer,
        defenderStartLayerOrdinal: plan.defenderStartLayer,
        aggressorStartVersion: plan.aggressorStartVersion,
        defenderStartVersion: plan.defenderStartVersion,
        kind: "VERIFIED_BATTLE",
        provenance: "LIVE_DOUBLE_WATCHER",
        idempotencyKey: plan.idempotencyKey,
        liveGameFingerprint: plan.liveGameFingerprint,
        platformMatchId: plan.platformMatchId,
        gameStatsId: plan.gameStatsId,
        authoritativeOrderKey: plan.authoritativeOrderKey,
        commencedAt: plan.commencedAt,
        qualificationStatus: "eligible",
        qualificationReason: "WARGRAPH_ELIGIBLE",
        resultStatus: "unresolved",
        rosterHash: plan.rosterHash,
        propositionHash: plan.propositionHash,
        status: "evidence_pending",
      },
    });
    contestCreated = true;
  }
  for (const claim of plan.evidenceLinks) {
    if (claimCollisions.some((row) => row.attestationId === claim.attestationId)) {
      continue;
    }
    await tx.warGraphContestAttestation.create({
      data: {
        contestId: contest.id,
        ...claim,
        linkedAt: now,
      },
    });
  }
  const startClaims = await tx.warGraphContestAttestation.findMany({
    where: { contestId: contest.id, evidencePhase: "start" },
  });
  if (
    startClaims.length !== 2 ||
    new Set(startClaims.map((row) => row.uploaderUserId)).size !== 2 ||
    new Set(startClaims.map((row) => row.membershipId)).size !== 2 ||
    new Set(startClaims.map((row) => row.participantRole)).size !== 2
  ) {
    throw new Error("WARGRAPH_DOUBLE_WATCHER_START_CLAIMS_NOT_ATOMIC");
  }

  const eventKey = `wargraph:event:started:${plan.liveGameFingerprint}`;
  const eventPayload = {
    schema: "aoe2war-wargraph-contest-started/v1",
    liveGameFingerprint: plan.liveGameFingerprint,
    platformMatchId: plan.platformMatchId,
    sourceGameStatsId: plan.gameStatsId,
    rosterHash: plan.rosterHash,
    propositionHash: plan.propositionHash,
    claimValidationHashes: plan.evidenceLinks
      .map((row) => row.validationHash)
      .sort(),
  };
  const existingEvent = await tx.warGraphEvent.findUnique({
    where: { idempotencyKey: eventKey },
  });
  if (
    existingEvent &&
    (existingEvent.graphId !== plan.graphId ||
      existingEvent.nightId !== plan.nightId ||
      existingEvent.contestId !== contest.id ||
      existingEvent.aggregateType !== "contest" ||
      existingEvent.aggregateId !== contest.publicId ||
      existingEvent.eventType !== "WARGRAPH_CONTEST_STARTED" ||
      !jsonEqual(existingEvent.payload, eventPayload))
  ) {
    throw new Error("WARGRAPH_START_EVENT_IDENTITY_COLLISION");
  }
  if (!existingEvent) {
    await appendWarGraphEvent(tx, {
      graphId: plan.graphId,
      nightId: plan.nightId,
      pairingId: plan.pairingId,
      contestId: contest.id,
      aggregateType: "contest",
      aggregateId: contest.publicId,
      eventType: "WARGRAPH_CONTEST_STARTED",
      idempotencyKey: eventKey,
      priorVersion: null,
      newVersion: contest.version,
      payload: eventPayload,
      occurredAt: now,
    });
  }
  if (contestCreated) {
    await Promise.all([
      tx.warGraph.update({
        where: { id: plan.graphId },
        data: { projectionVersion: { increment: 1 } },
      }),
      tx.warGraphNight.update({
        where: { id: plan.nightId },
        data: { version: { increment: 1 } },
      }),
    ]);
  }
  return { kind: "live", contestId: contest.id, pairingId: plan.pairingId };
}

async function persistCorrelationPlan(
  tx: TransactionClient,
  plan: AnyContestPlan,
  now: Date,
): Promise<WarGraphCorrelationPersistedResult> {
  const paired = await ensureContestPairing(tx, plan);
  if (!paired.ok) throw new WarGraphCorrelationRollback(paired.result);
  const result =
    paired.plan.evidencePhase === "start"
      ? await persistLiveContest(tx, paired.plan, now)
      : await persistQualifiedContest(tx, paired.plan, now);
  if (result.kind === "dead" || result.kind === "retry") {
    throw new WarGraphCorrelationRollback(result);
  }
  return result;
}

async function correlateLeasedJob(
  prisma: PrismaClient,
  job: LeasedWarGraphCorrelationJob,
  now: Date,
): Promise<WarGraphCorrelationPersistedResult> {
  const payload = parseWarGraphCorrelationJobPayload(job.payload);
  if (!payload) {
    return permanent(
      "WARGRAPH_JOB_PAYLOAD_INVALID",
      "The leased job payload failed strict validation.",
    );
  }
  try {
    return await prisma.$transaction(
      async (tx) => {
      const liveJob = await tx.warGraphJob.findUnique({
        where: { id: job.id },
      });
      if (
        !liveJob ||
        liveJob.jobType !== CORRELATION_JOB_TYPE ||
        liveJob.status !== "running" ||
        liveJob.leaseOwner !== job.leaseOwner ||
        liveJob.version !== job.version ||
        liveJob.graphId !== job.graphId ||
        !jsonEqual(liveJob.payload, job.payload)
      ) {
        return temporary(
          "WARGRAPH_LEASE_CAS_LOST",
          "The leased job changed before correlation began.",
        );
      }
      await lockCorrelationTruth(tx, payload.gameStatsId, job.graphId);
      const graph = await tx.warGraph.findUnique({
        where: { id: job.graphId },
        select: { id: true, slug: true, status: true },
      });
      if (
        !graph ||
        graph.slug !== WARGRAPH_SLUG ||
        graph.status !== "active"
      ) {
        return temporary(
          "WARGRAPH_ACTIVE_GRAPH_UNAVAILABLE",
          "The canonical active graph is unavailable.",
        );
      }

      const commencedAt = new Date(payload.commencedAt);
      const nightKey = getWarGraphNightKey(commencedAt);
      if (!nightKey) {
        return permanent(
          "WARGRAPH_JOB_PAYLOAD_INVALID",
          "The commencement cannot be mapped to an Edmonton night.",
        );
      }
      const [gameStats, desync, adjudication, attestationRows] =
        await Promise.all([
          tx.gameStats.findUnique({
            where: { id: payload.gameStatsId },
            select: { id: true, replayHash: true, is_final: true },
          }),
          tx.replayDesyncIncident.findFirst({
            where: { gameStatsId: payload.gameStatsId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { desyncOccurred: true },
          }),
          tx.replayResultAdjudication.findFirst({
            where: {
              gameStatsId: payload.gameStatsId,
              decisionStatus: "accepted",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              sourceReplayHash: true,
              sourceRosterHash: true,
              winningPlayerKeys: true,
            },
          }),
          tx.warGraphWatcherAttestation.findMany({
            where: {
              OR: [
                { sourceAttestationId: payload.sourceAttestationId },
                {
                  liveGameFingerprint: payload.liveGameFingerprint,
                },
              ],
            },
            include: { contestClaim: { select: { contestId: true } } },
            orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
            take: 33,
          }),
        ]);
      if (attestationRows.length > 32) {
        return permanent(
          "WARGRAPH_EVIDENCE_CONFLICT",
          "The bounded evidence set exceeded the strict correlation limit.",
        );
      }
      const attestations: WarGraphCorrelationAttestation[] =
        attestationRows.map((row) => ({
          ...row,
          claimedContestId: row.contestClaim?.contestId ?? null,
        }));
      const uploaderUserIds = [
        ...new Set(attestations.map((row) => row.uploaderUserId)),
      ];
      const membershipRows = await tx.warGraphMembership.findMany({
        where: {
          graphId: job.graphId,
          userId: { in: uploaderUserIds },
        },
        select: {
          id: true,
          publicId: true,
          userId: true,
          playerKey: true,
          status: true,
        },
      });
      const relevantMemberIds = membershipRows.map((row) => row.id);
      const pairing = await loadExactPairing(tx, {
        graphId: job.graphId,
        membershipIds: relevantMemberIds,
        commencedAt,
      });
      if (pairing === "WARGRAPH_PAIRING_CONFLICT") {
        return permanent(
          pairing,
          "Multiple bound pairings match the same verified game.",
        );
      }

      let nightId = pairing?.nightId ?? 0;
      let rulesetId = pairing?.rulesetId ?? 0;
      if (!pairing) {
        const night = await tx.warGraphNight.findUnique({
          where: {
            graphId_localDate: {
              graphId: job.graphId,
              localDate: new Date(`${nightKey}T00:00:00.000Z`),
            },
          },
          include: { ruleset: { select: { graphId: true } } },
        });
        if (
          !night ||
          night.graphId !== job.graphId ||
          night.ruleset.graphId !== job.graphId ||
          night.timezone !== "America/Edmonton"
        ) {
          return temporary(
            "WARGRAPH_NIGHT_PENDING",
            "The exact historical night and frozen ruleset are not materialized.",
          );
        }
        nightId = night.id;
        rulesetId = night.rulesetId;
      }

      const orderKey = `${payload.commencedAt}:${payload.platformMatchId}`;
      const memberships: WarGraphCorrelationMembership[] = [];
      for (const member of membershipRows) {
        const pairingStart = pairing
          ? member.id === pairing.aggressorMembershipId
            ? {
                nodeId: pairing.aggressorStartNodeId,
                layer: pairing.aggressorStartLayer,
                version: pairing.aggressorStartVersion,
              }
            : member.id === pairing.defenderMembershipId
              ? {
                  nodeId: pairing.defenderStartNodeId,
                  layer: pairing.defenderStartLayer,
                  version: pairing.defenderStartVersion,
                }
              : null
          : null;
        const organicStart = pairingStart
          ? null
          : await reconstructOrganicStart(tx, {
              graphId: job.graphId,
              membershipId: member.id,
              commencedAt,
              authoritativeOrderKey: orderKey,
            });
        const [actionsUsed, conflicting] = await Promise.all([
          countAuthoritativeActions(tx, {
            graphId: job.graphId,
            nightId,
            membershipId: member.id,
            commencedAt,
            authoritativeOrderKey: orderKey,
          }),
          hasConflictingEngagementAtStart(tx, {
            graphId: job.graphId,
            membershipId: member.id,
            commencedAt,
            allowedPairingId: pairing?.id ?? null,
          }),
        ]);
        memberships.push({
          ...member,
          startNodeId: pairingStart?.nodeId ?? organicStart?.nodeId ?? null,
          startLayer:
            pairingStart?.layer ?? organicStart?.layerOrdinal ?? null,
          startVersion:
            pairingStart?.version ?? organicStart?.occupancyVersion ?? null,
          actionsUsed,
          hasConflictingEngagement: conflicting,
        });
      }

      const context: WarGraphCorrelationContext = {
        graphId: job.graphId,
        nightId,
        rulesetId,
        gameStats: gameStats
          ? {
              id: gameStats.id,
              replayHash: gameStats.replayHash,
              isFinal: gameStats.is_final,
            }
          : null,
        latestDesyncOccurred: desync?.desyncOccurred ?? null,
        latestAcceptedAdjudication: adjudication,
        attestations,
        memberships,
        pairing,
      };
      const decision = correlateWarGraphAttestations(job.payload, context);
      if (decision.kind !== "qualified" && decision.kind !== "live") {
        return decision;
      }
      if (
        decision.plan.graphId !== graph.id ||
        decision.plan.nightId !== nightId ||
        decision.plan.rulesetId !== rulesetId
      ) {
        return permanent(
          "WARGRAPH_SCOPE_MISMATCH",
          "Correlation crossed a graph, night, or ruleset boundary.",
        );
      }
      return persistCorrelationPlan(tx, decision.plan, now);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 25_000,
      },
    );
  } catch (error) {
    if (error instanceof WarGraphCorrelationRollback) return error.result;
    throw error;
  }
}

async function leaseJobs(
  prisma: PrismaClient,
  input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    limit: number;
  },
): Promise<readonly LeasedWarGraphCorrelationJob[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "war_graph_jobs"
      SET
        "status" = 'dead',
        "lease_owner" = NULL,
        "lease_expires_at" = NULL,
        "last_error_code" = 'WARGRAPH_MAX_ATTEMPTS_EXHAUSTED',
        "last_error" = 'Expired lease exhausted the durable retry budget.',
        "completed_at" = ${input.now},
        "version" = "version" + 1,
        "updated_at" = ${input.now}
      WHERE "job_type" = ${CORRELATION_JOB_TYPE}
        AND "status" = 'running'
        AND "lease_expires_at" <= ${input.now}
        AND "attempt_count" >= "max_attempts"
    `);
    const rows = await tx.$queryRaw<LeasedRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "war_graph_jobs"
        WHERE "job_type" = ${CORRELATION_JOB_TYPE}
          AND "attempt_count" < "max_attempts"
          AND (
            (
              "status" = 'queued'
              AND "available_at" <= ${input.now}
            )
            OR (
              "status" = 'running'
              AND "lease_expires_at" <= ${input.now}
            )
          )
        ORDER BY
          "payload" ->> 'commencedAt' ASC NULLS LAST,
          "created_at" ASC,
          "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "war_graph_jobs" job
      SET
        "status" = 'running',
        "lease_owner" = ${input.workerId},
        "lease_expires_at" = ${input.leaseExpiresAt},
        "attempt_count" = job."attempt_count" + 1,
        "last_error_code" = NULL,
        "last_error" = NULL,
        "completed_at" = NULL,
        "version" = job."version" + 1,
        "updated_at" = ${input.now}
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING
        job."id" AS "id",
        job."graph_id" AS "graphId",
        job."payload" AS "payload",
        job."attempt_count" AS "attemptCount",
        job."max_attempts" AS "maxAttempts",
        job."lease_owner" AS "leaseOwner",
        job."lease_expires_at" AS "leaseExpiresAt",
        job."version" AS "version",
        job."created_at" AS "createdAt"
    `);
    return rows;
  });
}

async function transitionJob(
  prisma: PrismaClient,
  transition: WarGraphCorrelationJobTransition,
): Promise<boolean> {
  const commonWhere = {
    id: transition.jobId,
    jobType: CORRELATION_JOB_TYPE,
    status: "running",
    leaseOwner: transition.leaseOwner,
    version: transition.leasedVersion,
  } as const;
  const data: Prisma.WarGraphJobUpdateManyMutationInput =
    transition.kind === "succeeded"
      ? {
          status: "succeeded",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastError: null,
          completedAt: transition.now,
          version: { increment: 1 },
        }
      : transition.kind === "retry"
        ? {
            status: "queued",
            availableAt: transition.availableAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: transition.code.slice(0, 80),
            lastError: transition.detail.slice(0, 2_000),
            completedAt: null,
            version: { increment: 1 },
          }
        : {
            status: "dead",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: transition.code.slice(0, 80),
            lastError: transition.detail.slice(0, 2_000),
            completedAt: transition.now,
            version: { increment: 1 },
          };
  const result = await prisma.warGraphJob.updateMany({
    where: commonWhere,
    data,
  });
  return result.count === 1;
}

export function createPrismaWarGraphCorrelationWorkerAdapter(
  prisma: PrismaClient = getPrisma(),
): WarGraphCorrelationWorkerAdapter {
  return {
    lease: (input) => leaseJobs(prisma, input),
    correlate: (job, now) => correlateLeasedJob(prisma, job, now),
    transition: (transition) => transitionJob(prisma, transition),
  };
}
