import { createHash } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
} from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  DEFAULT_WARGRAPH_REWARD_CONFIG,
  WARGRAPH_MATCH_LAUNCH_MS,
  WARGRAPH_MAX_RESOLVED_CONTESTS,
  WARGRAPH_PRIME_END_MINUTE,
  WARGRAPH_PRIME_START_MINUTE,
  WARGRAPH_RING_RESPONSE_MS,
  WARGRAPH_TIME_ZONE,
} from "./constants";
import { getWarGraphNightKey } from "./time";
import {
  normalizeWarGraphIdentity,
  stableWarGraphJson,
  warGraphAdvisoryLockKey,
  warGraphBoundaryInstant,
} from "./foundationContract";
import { WARGRAPH_FOSSILIZATION_JOB_SCHEMA } from "./maintenanceJobsContract";

export { warGraphBoundaryInstant } from "./foundationContract";

export const WARGRAPH_SLUG = "living-wargraph" as const;
export const WARGRAPH_RULESET_VERSION = 1 as const;

const FOUNDATION_CACHE_MS = 15_000;
const MEMBERSHIP_PAGE_SIZE = 500;
const MAX_MEMBERSHIP_SYNC = 5_000;
const RULESET_EFFECTIVE_FROM = new Date("2026-08-24T00:00:00.000Z");

type TransactionClient = Prisma.TransactionClient;

type LayerSeed = {
  key: "crown" | "ring-i" | "ring-ii" | "frontier";
  displayName: string;
  ordinal: 0 | 1 | 2 | 3;
  kind: "crown" | "inner" | "middle" | "frontier";
  capacity: number | null;
};

const LAYERS: readonly LayerSeed[] = [
  {
    key: "crown",
    displayName: "The Crown",
    ordinal: 0,
    kind: "crown",
    capacity: 1,
  },
  {
    key: "ring-i",
    displayName: "Ring I",
    ordinal: 1,
    kind: "inner",
    capacity: 2,
  },
  {
    key: "ring-ii",
    displayName: "Ring II",
    ordinal: 2,
    kind: "middle",
    capacity: 6,
  },
  {
    key: "frontier",
    displayName: "The Frontier",
    ordinal: 3,
    kind: "frontier",
    capacity: null,
  },
] as const;

const FOUNDING_SEATS = [
  { layer: "crown", ordinal: 0, aliases: ["jim"] },
  { layer: "ring-i", ordinal: 0, aliases: ["zodiac"] },
  {
    layer: "ring-i",
    ordinal: 1,
    aliases: ["c0lorz", "colors"],
  },
  {
    layer: "ring-ii",
    ordinal: 0,
    aliases: ["somniosator"],
  },
  { layer: "ring-ii", ordinal: 1, aliases: ["pinoy16"] },
  {
    layer: "ring-ii",
    ordinal: 2,
    aliases: ["julioalvarez"],
  },
  {
    layer: "ring-ii",
    ordinal: 3,
    aliases: ["sladk0eshka", "sladkoeshka"],
  },
  {
    layer: "ring-ii",
    ordinal: 4,
    aliases: ["dilpascana"],
  },
  { layer: "ring-ii", ordinal: 5, aliases: ["ra"] },
] as const;

const FOUNDING_CORRECTION_V1 = Object.freeze({
  julioPlayerKey: "steam:76561198190973517",
  sladkPlayerKey: "steam:76561198075626698",
  julioTargetSeatKey: "ring-ii:2",
  sladkTargetSeatKey: "ring-ii:3",
  movementType: "FOUNDING_CORRECTION",
  reasonCode: "FOUNDING_BOARD_CORRECTION_V1",
  sourcePrefix: `wargraph:${WARGRAPH_SLUG}:founding-correction:v1`,
} as const);

const FOUNDING_CORRECTION_V2 = Object.freeze({
  movementType: "FOUNDING_CORRECTION",
  reasonCode: "FOUNDING_BOARD_CORRECTION_V2",
  sourcePrefix: `wargraph:${WARGRAPH_SLUG}:founding-correction:v2`,
  playerKeys: {
    zodiac: "steam:76561198103810510",
    c0lorz: "steam:76561198138252884",
    somniosator: "steam:76561198257849801",
    pigman: "steam:76561198801484390",
    deltaforce: "steam:76561198087798523",
    julio: "steam:76561198190973517",
    sniper: "steam:76561198041444664",
    mouldy: "steam:76561199024931846",
    ra: "steam:76561197990322225",
    emaren: "steam:76561198065420384",
  },
} as const);

let foundationCache:
  | {
      expiresAt: number;
      promise: Promise<WarGraphFoundation>;
    }
  | null = null;

export type WarGraphFoundation = {
  graphId: number;
  rulesetId: number;
  nightId: number;
  nightKey: string;
  projectionVersion: number;
};

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(stableWarGraphJson(value))
    .digest("hex");
}

function boundedBigInt(
  raw: string | undefined,
  fallback: bigint,
  minimum: bigint,
  maximum: bigint,
): bigint {
  if (!raw || !/^\d{1,18}$/.test(raw.trim())) return fallback;
  const value = BigInt(raw.trim());
  return value >= minimum && value <= maximum ? value : fallback;
}

export async function lockWarGraphTransaction(
  tx: TransactionClient,
  graphId: number,
) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${warGraphAdvisoryLockKey(graphId)}, 0))`,
  );
}

export async function appendWarGraphEvent(
  tx: TransactionClient,
  input: {
    graphId: number;
    nightId?: number | null;
    membershipId?: number | null;
    advanceRequestId?: number | null;
    pairingId?: number | null;
    contestId?: number | null;
    actorUserId?: number | null;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    idempotencyKey: string;
    priorVersion?: number | null;
    newVersion?: number | null;
    payload: Prisma.InputJsonValue;
    occurredAt: Date;
  },
) {
  const existing = await tx.warGraphEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  const previous = await tx.warGraphEvent.findFirst({
    where: {
      graphId: input.graphId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
    },
    orderBy: { sequence: "desc" },
    select: { sequence: true, eventHash: true },
  });
  const sequence = (previous?.sequence ?? 0) + 1;
  const eventHash = sha256({
    graphId: input.graphId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    sequence,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    previousEventHash: previous?.eventHash ?? null,
    priorVersion: input.priorVersion ?? null,
    newVersion: input.newVersion ?? null,
    payload: input.payload,
    occurredAt: input.occurredAt,
  });

  return tx.warGraphEvent.create({
    data: {
      graphId: input.graphId,
      nightId: input.nightId ?? null,
      membershipId: input.membershipId ?? null,
      advanceRequestId: input.advanceRequestId ?? null,
      pairingId: input.pairingId ?? null,
      contestId: input.contestId ?? null,
      actorUserId: input.actorUserId ?? null,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      sequence,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      previousEventHash: previous?.eventHash ?? null,
      eventHash,
      priorVersion: input.priorVersion ?? null,
      newVersion: input.newVersion ?? null,
      payload: input.payload,
      occurredAt: input.occurredAt,
    },
  });
}

async function ensureGraph(tx: TransactionClient) {
  // The established hot path must not acquire a graph-row write lock before
  // the advisory lock: workers take the advisory lock first and later update
  // this row. A pre-lock upsert here would invert that order and can deadlock.
  const existing = await tx.warGraph.findUnique({
    where: { slug: WARGRAPH_SLUG },
  });
  const graph =
    existing ??
    (await tx.warGraph.upsert({
      where: { slug: WARGRAPH_SLUG },
      update: {},
      create: {
        slug: WARGRAPH_SLUG,
        name: "WarGraph · The Living Tournament",
        status: "active",
        timezone: WARGRAPH_TIME_ZONE,
        currentRulesetVersion: WARGRAPH_RULESET_VERSION,
      },
    }));

  if (graph.status !== "active" || graph.timezone !== WARGRAPH_TIME_ZONE) {
    throw new Error("WARGRAPH_FOUNDATION_NOT_ACTIVE");
  }

  return graph;
}

async function ensureGraphAndRuleset(
  tx: TransactionClient,
  now: Date,
  graph: Awaited<ReturnType<typeof ensureGraph>>,
) {

  const nightlyPayoutCeilingWolo = boundedBigInt(
    process.env.WARGRAPH_NIGHTLY_PAYOUT_CEILING_WOLO,
    BigInt(1_000),
    BigInt(1),
    BigInt(1_000_000_000),
  );
  const treasuryReserveFloorWolo = boundedBigInt(
    process.env.WARGRAPH_TREASURY_RESERVE_FLOOR_WOLO,
    BigInt(0),
    BigInt(0),
    BigInt(1_000_000_000_000),
  );
  const rulesetContract = {
    schema: "aoe2war-wargraph-ruleset/v1",
    source: "AoE2WAR_WarGraph_Manual_V1",
    timezone: WARGRAPH_TIME_ZONE,
    primeStartMinute: WARGRAPH_PRIME_START_MINUTE,
    primeEndMinute: WARGRAPH_PRIME_END_MINUTE,
    responseWindowSeconds: WARGRAPH_RING_RESPONSE_MS / 1_000,
    launchWindowSeconds: WARGRAPH_MATCH_LAUNCH_MS / 1_000,
    maxResolvedActions: WARGRAPH_MAX_RESOLVED_CONTESTS,
    capacities: { crown: 1, ringI: 2, ringII: 6 },
    rewards: DEFAULT_WARGRAPH_REWARD_CONFIG,
    nightlyPayoutCeilingWolo: nightlyPayoutCeilingWolo.toString(),
    treasuryReserveFloorWolo: treasuryReserveFloorWolo.toString(),
    payoutExecution: "disabled_until_chain_settlement_authority_is_configured",
  };
  const rulesetHash = sha256(rulesetContract);
  const ruleset = await tx.warGraphRuleset.upsert({
    where: {
      graphId_version: {
        graphId: graph.id,
        version: WARGRAPH_RULESET_VERSION,
      },
    },
    update: {},
    create: {
      graphId: graph.id,
      version: WARGRAPH_RULESET_VERSION,
      idempotencyKey: `wargraph:${WARGRAPH_SLUG}:ruleset:v1`,
      rulesetHash,
      timezone: WARGRAPH_TIME_ZONE,
      primeStartMinute: WARGRAPH_PRIME_START_MINUTE,
      primeEndMinute: WARGRAPH_PRIME_END_MINUTE,
      responseWindowSeconds: WARGRAPH_RING_RESPONSE_MS / 1_000,
      launchWindowSeconds: WARGRAPH_MATCH_LAUNCH_MS / 1_000,
      maxResolvedActions: WARGRAPH_MAX_RESOLVED_CONTESTS,
      crownCapacity: 1,
      ringOneCapacity: 2,
      ringTwoCapacity: 6,
      frontierAdvanceWolo: BigInt(DEFAULT_WARGRAPH_REWARD_CONFIG.frontierToRingII),
      ringTwoAdvanceWolo: BigInt(DEFAULT_WARGRAPH_REWARD_CONFIG.ringIIToRingI),
      firstCrownBloodWolo: BigInt(DEFAULT_WARGRAPH_REWARD_CONFIG.firstBlood),
      crownVictoryWolo: BigInt(DEFAULT_WARGRAPH_REWARD_CONFIG.crownBattleWinner),
      nightlyPayoutCeilingWolo,
      treasuryReserveFloorWolo,
      settings: rulesetContract,
      effectiveFrom: RULESET_EFFECTIVE_FROM,
      publishedAt: now,
    },
  });

  await appendWarGraphEvent(tx, {
    graphId: graph.id,
    aggregateType: "graph",
    aggregateId: graph.publicId,
    eventType: "WARGRAPH_FOUNDATION_PUBLISHED",
    idempotencyKey: `wargraph:${WARGRAPH_SLUG}:foundation:v1`,
    priorVersion: null,
    newVersion: graph.projectionVersion,
    payload: {
      rulesetVersion: ruleset.version,
      rulesetHash: ruleset.rulesetHash,
      topology: "1/2/6/elastic",
    },
    occurredAt: now,
  });

  return { graph, ruleset };
}

async function ensureTopology(
  tx: TransactionClient,
  graphId: number,
) {
  const layers = new Map<string, { id: number; key: string; ordinal: number }>();
  for (const seed of LAYERS) {
    const layer = await tx.warGraphLayer.upsert({
      where: { graphId_key: { graphId, key: seed.key } },
      update: {},
      create: {
        graphId,
        key: seed.key,
        displayName: seed.displayName,
        ordinal: seed.ordinal,
        kind: seed.kind,
        fixedCapacity: seed.capacity,
      },
      select: { id: true, key: true, ordinal: true },
    });
    layers.set(seed.key, layer);

    if (seed.capacity !== null) {
      for (let ordinal = 0; ordinal < seed.capacity; ordinal += 1) {
        const seatKey = `${seed.key}:${ordinal}`;
        const existingNode = await tx.warGraphNode.findUnique({
          where: {
            graphId_seatKey: {
              graphId,
              seatKey,
            },
          },
          select: {
            layerId: true,
            ordinal: true,
          },
        });

        if (existingNode) {
          if (
            existingNode.layerId !== layer.id ||
            existingNode.ordinal !== ordinal
          ) {
            throw new Error("WARGRAPH_TOPOLOGY_NODE_MISMATCH");
          }
          continue;
        }

        await tx.warGraphNode.create({
          data: {
            graphId,
            layerId: layer.id,
            seatKey,
            ordinal,
            angularSeed: ordinal,
            presentation: {},
          },
        });
      }
    }
  }
  return layers;
}

async function eligibleUsers(tx: TransactionClient) {
  const users: Array<{
    id: number;
    uid: string;
    inGameName: string | null;
    steamId: string | null;
    steamPersonaName: string | null;
  }> = [];
  let cursor = 0;
  while (users.length < MAX_MEMBERSHIP_SYNC) {
    const page = await tx.user.findMany({
      where: {
        id: { gt: cursor },
        steamId: { not: null },
      },
      orderBy: { id: "asc" },
      take: Math.min(MEMBERSHIP_PAGE_SIZE, MAX_MEMBERSHIP_SYNC - users.length),
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamId: true,
        steamPersonaName: true,
      },
    });
    users.push(...page);
    if (page.length < MEMBERSHIP_PAGE_SIZE) break;
    cursor = page.at(-1)?.id ?? cursor;
  }
  return users;
}

async function ensureMembershipsAndSeats(
  tx: TransactionClient,
  graphId: number,
  layers: Map<string, { id: number; key: string; ordinal: number }>,
  now: Date,
) {
  let assignmentsCreated = 0;
  const users = await eligibleUsers(tx);
  const memberships = [];
  for (const user of users) {
    if (!user.steamId) continue;
    const displayName =
      user.inGameName?.trim() ||
      user.steamPersonaName?.trim() ||
      user.uid;
    const membership = await tx.warGraphMembership.upsert({
      where: { graphId_userId: { graphId, userId: user.id } },
      update: {},
      create: {
        graphId,
        userId: user.id,
        playerKey: `steam:${user.steamId}`,
        userUidSnapshot: user.uid,
        steamIdSnapshot: user.steamId,
        displayNameSnapshot: displayName.slice(0, 100),
        status: "active",
        eligibilityReason: "STEAM_LINKED_ACCOUNT",
        eligibleAt: now,
      },
      include: { occupancy: true },
    });
    memberships.push(membership);
  }

  const occupiedFixed = await tx.warGraphOccupancy.findMany({
    where: {
      graphId,
      node: { layer: { ordinal: { lt: 3 } } },
    },
    select: { nodeId: true },
  });
  const unavailableNodeIds = new Set(occupiedFixed.map((row) => row.nodeId));
  const assignedMembershipIds = new Set(
    memberships.filter((row) => row.occupancy).map((row) => row.id),
  );

  const aliases = new Map<string, (typeof memberships)[number]>();
  for (const membership of memberships) {
    const normalized = normalizeWarGraphIdentity(
      membership.displayNameSnapshot,
    );
    if (normalized && !aliases.has(normalized)) aliases.set(normalized, membership);
  }

  for (const seat of FOUNDING_SEATS) {
    const membership = seat.aliases
      .map((alias) => aliases.get(alias))
      .find(Boolean);
    if (!membership || assignedMembershipIds.has(membership.id)) continue;
    const node = await tx.warGraphNode.findUnique({
      where: {
        graphId_seatKey: {
          graphId,
          seatKey: `${seat.layer}:${seat.ordinal}`,
        },
      },
      include: { layer: { select: { ordinal: true } } },
    });
    if (!node || unavailableNodeIds.has(node.id)) continue;
    if (await assignInitialSeat(tx, graphId, membership, node, now)) {
      assignmentsCreated += 1;
    }
    unavailableNodeIds.add(node.id);
    assignedMembershipIds.add(membership.id);
  }

  const frontier = layers.get("frontier");
  if (!frontier) throw new Error("WARGRAPH_FRONTIER_MISSING");
  const latestFrontier = await tx.warGraphNode.findFirst({
    where: { graphId, layerId: frontier.id },
    orderBy: { ordinal: "desc" },
    select: { ordinal: true },
  });
  let frontierOrdinal = (latestFrontier?.ordinal ?? -1) + 1;

  for (const membership of memberships) {
    if (assignedMembershipIds.has(membership.id)) continue;
    const node = await tx.warGraphNode.create({
      data: {
        graphId,
        layerId: frontier.id,
        seatKey: `frontier:${frontierOrdinal}`,
        ordinal: frontierOrdinal,
        angularSeed: frontierOrdinal,
        presentation: {},
      },
      include: { layer: { select: { ordinal: true } } },
    });
    frontierOrdinal += 1;
    if (await assignInitialSeat(tx, graphId, membership, node, now)) {
      assignmentsCreated += 1;
    }
    assignedMembershipIds.add(membership.id);
  }
  return assignmentsCreated;
}

async function assignInitialSeat(
  tx: TransactionClient,
  graphId: number,
  membership: {
    id: number;
    publicId: string;
    userId: number;
    version: number;
  },
  node: { id: number; publicId: string; layer: { ordinal: number } },
  now: Date,
) {
  const sourceKey = `wargraph:${WARGRAPH_SLUG}:initial-seat:${membership.publicId}`;
  const existing = await tx.warGraphMovement.findUnique({
    where: { sourceKey },
  });
  if (existing) return false;

  await tx.warGraphOccupancy.create({
    data: {
      graphId,
      membershipId: membership.id,
      nodeId: node.id,
      occupiedAt: now,
    },
  });
  const updated = await tx.warGraphMembership.update({
    where: { id: membership.id },
    data: { version: { increment: 1 } },
    select: { version: true },
  });
  await tx.warGraphMovement.create({
    data: {
      graphId,
      membershipId: membership.id,
      toNodeId: node.id,
      toLayerOrdinal: node.layer.ordinal,
      movementType: "INITIAL_ASSIGNMENT",
      reasonCode: "FOUNDING_BOARD_ASSIGNMENT",
      sourceKey,
      idempotencyKey: sourceKey,
      membershipVersionBefore: membership.version,
      membershipVersionAfter: updated.version,
      movedAt: now,
    },
  });
  await appendWarGraphEvent(tx, {
    graphId,
    membershipId: membership.id,
    actorUserId: membership.userId,
    aggregateType: "membership",
    aggregateId: membership.publicId,
    eventType: "WARGRAPH_INITIAL_SEAT_ASSIGNED",
    idempotencyKey: `${sourceKey}:event`,
    priorVersion: membership.version,
    newVersion: updated.version,
    payload: {
      nodeId: node.publicId,
      layerOrdinal: node.layer.ordinal,
      movementType: "INITIAL_ASSIGNMENT",
      reasonCode: "FOUNDING_BOARD_ASSIGNMENT",
    },
    occurredAt: now,
  });
  return true;
}

async function applyFoundingBoardCorrectionV1(
  tx: TransactionClient,
  graph: {
    id: number;
    publicId: string;
  },
  now: Date,
): Promise<boolean> {
  const completionKey =
    `${FOUNDING_CORRECTION_V1.sourcePrefix}:complete`;
  const julioSourceKey =
    `${FOUNDING_CORRECTION_V1.sourcePrefix}:julio`;
  const sladkSourceKey =
    `${FOUNDING_CORRECTION_V1.sourcePrefix}:sladk`;

  const [completion, julioMovement, sladkMovement] =
    await Promise.all([
      tx.warGraphEvent.findUnique({
        where: { idempotencyKey: completionKey },
      }),
      tx.warGraphMovement.findUnique({
        where: { sourceKey: julioSourceKey },
      }),
      tx.warGraphMovement.findUnique({
        where: { sourceKey: sladkSourceKey },
      }),
    ]);

  if (completion) {
    if (
      completion.graphId !== graph.id ||
      completion.aggregateType !== "graph" ||
      completion.aggregateId !== graph.publicId ||
      completion.eventType !== "WARGRAPH_FOUNDING_BOARD_CORRECTION_V1"
    ) {
      throw new Error(
        "WARGRAPH_FOUNDING_CORRECTION_COMPLETION_COLLISION",
      );
    }
    return false;
  }

  if (julioMovement || sladkMovement) {
    throw new Error(
      "WARGRAPH_FOUNDING_CORRECTION_PARTIAL_STATE",
    );
  }

  const [julio, sladk, julioTarget, sladkTarget] =
    await Promise.all([
      tx.warGraphMembership.findFirst({
        where: {
          graphId: graph.id,
          playerKey: FOUNDING_CORRECTION_V1.julioPlayerKey,
        },
        include: {
          occupancy: {
            include: {
              node: {
                include: {
                  layer: true,
                },
              },
            },
          },
        },
      }),
      tx.warGraphMembership.findFirst({
        where: {
          graphId: graph.id,
          playerKey: FOUNDING_CORRECTION_V1.sladkPlayerKey,
        },
        include: {
          occupancy: {
            include: {
              node: {
                include: {
                  layer: true,
                },
              },
            },
          },
        },
      }),
      tx.warGraphNode.findUnique({
        where: {
          graphId_seatKey: {
            graphId: graph.id,
            seatKey: FOUNDING_CORRECTION_V1.julioTargetSeatKey,
          },
        },
        include: {
          occupancy: {
            select: {
              membershipId: true,
            },
          },
          layer: true,
        },
      }),
      tx.warGraphNode.findUnique({
        where: {
          graphId_seatKey: {
            graphId: graph.id,
            seatKey: FOUNDING_CORRECTION_V1.sladkTargetSeatKey,
          },
        },
        include: {
          occupancy: {
            select: {
              membershipId: true,
            },
          },
          layer: true,
        },
      }),
    ]);

  // A partial historical dataset or a fresh realm without both real players
  // has nothing to correct yet. The normal founding allocator remains truth.
  if (
    !julio ||
    !sladk ||
    !julio.occupancy ||
    !sladk.occupancy ||
    !julioTarget ||
    !sladkTarget
  ) {
    return false;
  }

  const desiredState =
    julio.occupancy.node.seatKey ===
      FOUNDING_CORRECTION_V1.julioTargetSeatKey &&
    sladk.occupancy.node.seatKey ===
      FOUNDING_CORRECTION_V1.sladkTargetSeatKey;

  if (desiredState) {
    await appendWarGraphEvent(tx, {
      graphId: graph.id,
      aggregateType: "graph",
      aggregateId: graph.publicId,
      eventType: "WARGRAPH_FOUNDING_BOARD_CORRECTION_V1",
      idempotencyKey: completionKey,
      payload: {
        applied: false,
        reason: "FOUNDING_AUTHORITY_ALREADY_CORRECT",
        julioPlayerKey: FOUNDING_CORRECTION_V1.julioPlayerKey,
        julioSeatKey: FOUNDING_CORRECTION_V1.julioTargetSeatKey,
        sladkPlayerKey: FOUNDING_CORRECTION_V1.sladkPlayerKey,
        sladkSeatKey: FOUNDING_CORRECTION_V1.sladkTargetSeatKey,
      },
      occurredAt: now,
    });
    return true;
  }

  const legacyState =
    sladk.occupancy.node.seatKey ===
      FOUNDING_CORRECTION_V1.julioTargetSeatKey &&
    julio.occupancy.node.layer.key === "frontier" &&
    julioTarget.occupancy?.membershipId === sladk.id &&
    sladkTarget.occupancy === null;

  if (!legacyState) {
    throw new Error(
      "WARGRAPH_FOUNDING_CORRECTION_STATE_UNEXPECTED",
    );
  }

  const [
    contestCount,
    advanceCount,
    pairingCount,
    actionCount,
    rewardCount,
    nonInitialMovementCount,
  ] = await Promise.all([
    tx.warGraphContest.count({
      where: { graphId: graph.id },
    }),
    tx.warGraphAdvanceRequest.count({
      where: { graphId: graph.id },
    }),
    tx.warGraphPairing.count({
      where: { graphId: graph.id },
    }),
    tx.warGraphAction.count({
      where: { graphId: graph.id },
    }),
    tx.warGraphReward.count({
      where: { graphId: graph.id },
    }),
    tx.warGraphMovement.count({
      where: {
        graphId: graph.id,
        movementType: {
          not: "INITIAL_ASSIGNMENT",
        },
      },
    }),
  ]);

  if (
    contestCount !== 0 ||
    advanceCount !== 0 ||
    pairingCount !== 0 ||
    actionCount !== 0 ||
    rewardCount !== 0 ||
    nonInitialMovementCount !== 0
  ) {
    throw new Error(
      "WARGRAPH_FOUNDING_CORRECTION_WINDOW_CLOSED",
    );
  }

  const sladkVersionBefore = sladk.version;
  const julioVersionBefore = julio.version;

  await tx.warGraphOccupancy.update({
    where: { id: sladk.occupancy.id },
    data: {
      nodeId: sladkTarget.id,
      occupiedAt: now,
      version: { increment: 1 },
    },
  });

  const sladkUpdated = await tx.warGraphMembership.update({
    where: { id: sladk.id },
    data: {
      version: { increment: 1 },
    },
    select: {
      version: true,
    },
  });

  await tx.warGraphMovement.create({
    data: {
      graphId: graph.id,
      membershipId: sladk.id,
      fromNodeId: sladk.occupancy.node.id,
      toNodeId: sladkTarget.id,
      fromLayerOrdinal: sladk.occupancy.node.layer.ordinal,
      toLayerOrdinal: sladkTarget.layer.ordinal,
      movementType: FOUNDING_CORRECTION_V1.movementType,
      reasonCode: FOUNDING_CORRECTION_V1.reasonCode,
      sourceKey: sladkSourceKey,
      idempotencyKey: sladkSourceKey,
      membershipVersionBefore: sladkVersionBefore,
      membershipVersionAfter: sladkUpdated.version,
      movedAt: now,
    },
  });

  await appendWarGraphEvent(tx, {
    graphId: graph.id,
    membershipId: sladk.id,
    actorUserId: sladk.userId,
    aggregateType: "membership",
    aggregateId: sladk.publicId,
    eventType: "WARGRAPH_FOUNDING_SEAT_CORRECTED",
    idempotencyKey: `${sladkSourceKey}:event`,
    priorVersion: sladkVersionBefore,
    newVersion: sladkUpdated.version,
    payload: {
      movementType: FOUNDING_CORRECTION_V1.movementType,
      reasonCode: FOUNDING_CORRECTION_V1.reasonCode,
      fromSeatKey: sladk.occupancy.node.seatKey,
      toSeatKey: sladkTarget.seatKey,
    },
    occurredAt: now,
  });

  await tx.warGraphOccupancy.update({
    where: { id: julio.occupancy.id },
    data: {
      nodeId: julioTarget.id,
      occupiedAt: now,
      version: { increment: 1 },
    },
  });

  const julioUpdated = await tx.warGraphMembership.update({
    where: { id: julio.id },
    data: {
      version: { increment: 1 },
    },
    select: {
      version: true,
    },
  });

  await tx.warGraphMovement.create({
    data: {
      graphId: graph.id,
      membershipId: julio.id,
      fromNodeId: julio.occupancy.node.id,
      toNodeId: julioTarget.id,
      fromLayerOrdinal: julio.occupancy.node.layer.ordinal,
      toLayerOrdinal: julioTarget.layer.ordinal,
      movementType: FOUNDING_CORRECTION_V1.movementType,
      reasonCode: FOUNDING_CORRECTION_V1.reasonCode,
      sourceKey: julioSourceKey,
      idempotencyKey: julioSourceKey,
      membershipVersionBefore: julioVersionBefore,
      membershipVersionAfter: julioUpdated.version,
      movedAt: now,
    },
  });

  await appendWarGraphEvent(tx, {
    graphId: graph.id,
    membershipId: julio.id,
    actorUserId: julio.userId,
    aggregateType: "membership",
    aggregateId: julio.publicId,
    eventType: "WARGRAPH_FOUNDING_SEAT_CORRECTED",
    idempotencyKey: `${julioSourceKey}:event`,
    priorVersion: julioVersionBefore,
    newVersion: julioUpdated.version,
    payload: {
      movementType: FOUNDING_CORRECTION_V1.movementType,
      reasonCode: FOUNDING_CORRECTION_V1.reasonCode,
      fromSeatKey: julio.occupancy.node.seatKey,
      toSeatKey: julioTarget.seatKey,
    },
    occurredAt: now,
  });

  await appendWarGraphEvent(tx, {
    graphId: graph.id,
    aggregateType: "graph",
    aggregateId: graph.publicId,
    eventType: "WARGRAPH_FOUNDING_BOARD_CORRECTION_V1",
    idempotencyKey: completionKey,
    payload: {
      applied: true,
      reason: FOUNDING_CORRECTION_V1.reasonCode,
      julioPlayerKey: FOUNDING_CORRECTION_V1.julioPlayerKey,
      julioFromSeatKey: julio.occupancy.node.seatKey,
      julioToSeatKey: julioTarget.seatKey,
      sladkPlayerKey: FOUNDING_CORRECTION_V1.sladkPlayerKey,
      sladkFromSeatKey: sladk.occupancy.node.seatKey,
      sladkToSeatKey: sladkTarget.seatKey,
      actionsConsumed: 0,
      rewardsCreated: 0,
    },
    occurredAt: now,
  });

  return true;
}

async function applyFoundingBoardCorrectionV2(
  tx: TransactionClient,
  graph: {
    id: number;
    publicId: string;
  },
  now: Date,
): Promise<boolean> {
  const completionKey = `${FOUNDING_CORRECTION_V2.sourcePrefix}:complete`;
  const completion = await tx.warGraphEvent.findUnique({
    where: { idempotencyKey: completionKey },
  });
  if (completion) {
    if (
      completion.graphId !== graph.id ||
      completion.aggregateType !== "graph" ||
      completion.aggregateId !== graph.publicId ||
      completion.eventType !== "WARGRAPH_FOUNDING_BOARD_CORRECTION_V2"
    ) {
      throw new Error("WARGRAPH_FOUNDING_CORRECTION_V2_COMPLETION_COLLISION");
    }
    return false;
  }

  const partialMovementCount = await tx.warGraphMovement.count({
    where: {
      graphId: graph.id,
      sourceKey: { startsWith: `${FOUNDING_CORRECTION_V2.sourcePrefix}:` },
    },
  });
  if (partialMovementCount !== 0) {
    throw new Error("WARGRAPH_FOUNDING_CORRECTION_V2_PARTIAL_STATE");
  }

  const memberships = await tx.warGraphMembership.findMany({
    where: { graphId: graph.id },
    include: {
      occupancy: {
        include: {
          node: {
            include: {
              layer: true,
            },
          },
        },
      },
    },
  });

  function resolveMembership(
    key: keyof typeof FOUNDING_CORRECTION_V2.playerKeys,
  ) {
    const wanted =
      FOUNDING_CORRECTION_V2.playerKeys[key];
    const matches = memberships.filter(
      (membership) => membership.playerKey === wanted,
    );
    if (matches.length > 1) {
      throw new Error(
        `WARGRAPH_FOUNDING_CORRECTION_V2_${key.toUpperCase()}_IDENTITY_AMBIGUOUS`,
      );
    }
    if (matches.length === 0 || !matches[0].occupancy) return null;
    return matches[0];
  }

  const zodiac = resolveMembership("zodiac");
  const c0lorz = resolveMembership("c0lorz");
  const somniosator = resolveMembership("somniosator");
  const pigman = resolveMembership("pigman");
  const deltaforce = resolveMembership("deltaforce");
  const julio = resolveMembership("julio");
  const sniper = resolveMembership("sniper");
  const mouldy = resolveMembership("mouldy");
  const ra = resolveMembership("ra");
  const emaren = resolveMembership("emaren");

  if (
    !zodiac ||
    !c0lorz ||
    !somniosator ||
    !pigman ||
    !deltaforce ||
    !julio ||
    !sniper ||
    !mouldy ||
    !ra ||
    !emaren
  ) {
    return false;
  }

  const seatOf = (membership: typeof zodiac) =>
    membership.occupancy?.node.seatKey ?? "";
  const layerOf = (membership: typeof zodiac) =>
    membership.occupancy?.node.layer.key ?? "";

  const alreadyDesired =
    seatOf(pigman) === "ring-i:0" &&
    seatOf(deltaforce) === "ring-i:1" &&
    seatOf(zodiac) === "ring-ii:0" &&
    seatOf(mouldy) === "ring-ii:2" &&
    seatOf(emaren) === "ring-ii:5" &&
    layerOf(ra) === "frontier" &&
    layerOf(somniosator) === "frontier" &&
    layerOf(c0lorz) === "frontier" &&
    layerOf(julio) === "frontier" &&
    layerOf(sniper) === "frontier";

  if (alreadyDesired) {
    await appendWarGraphEvent(tx, {
      graphId: graph.id,
      aggregateType: "graph",
      aggregateId: graph.publicId,
      eventType: "WARGRAPH_FOUNDING_BOARD_CORRECTION_V2",
      idempotencyKey: completionKey,
      payload: {
        applied: false,
        reason: "FOUNDING_AUTHORITY_ALREADY_CORRECT",
        actionsConsumed: 0,
        rewardsCreated: 0,
      },
      occurredAt: now,
    });
    return true;
  }

  const legacyState =
    seatOf(zodiac) === "ring-i:0" &&
    seatOf(c0lorz) === "ring-i:1" &&
    seatOf(somniosator) === "ring-ii:0" &&
    seatOf(julio) === "ring-ii:2" &&
    seatOf(ra) === "ring-ii:5" &&
    layerOf(emaren) === "frontier" &&
    layerOf(pigman) === "frontier" &&
    layerOf(deltaforce) === "frontier" &&
    layerOf(sniper) === "frontier" &&
    layerOf(mouldy) === "frontier";

  if (!legacyState) {
    throw new Error("WARGRAPH_FOUNDING_CORRECTION_V2_STATE_UNEXPECTED");
  }

  const [
    contestCount,
    advanceCount,
    pairingCount,
    actionCount,
    rewardCount,
    competitiveMovementCount,
  ] = await Promise.all([
    tx.warGraphContest.count({ where: { graphId: graph.id } }),
    tx.warGraphAdvanceRequest.count({ where: { graphId: graph.id } }),
    tx.warGraphPairing.count({ where: { graphId: graph.id } }),
    tx.warGraphAction.count({ where: { graphId: graph.id } }),
    tx.warGraphReward.count({ where: { graphId: graph.id } }),
    tx.warGraphMovement.count({
      where: {
        graphId: graph.id,
        movementType: {
          notIn: ["INITIAL_ASSIGNMENT", "FOUNDING_CORRECTION"],
        },
      },
    }),
  ]);

  if (
    contestCount !== 0 ||
    advanceCount !== 0 ||
    pairingCount !== 0 ||
    actionCount !== 0 ||
    rewardCount !== 0 ||
    competitiveMovementCount !== 0
  ) {
    throw new Error("WARGRAPH_FOUNDING_CORRECTION_V2_WINDOW_CLOSED");
  }

  const frontierLayer = await tx.warGraphLayer.findUnique({
    where: {
      graphId_key: {
        graphId: graph.id,
        key: "frontier",
      },
    },
  });
  if (!frontierLayer) {
    throw new Error("WARGRAPH_FOUNDING_CORRECTION_V2_FRONTIER_MISSING");
  }

  const latestFrontier = await tx.warGraphNode.findFirst({
    where: { graphId: graph.id, layerId: frontierLayer.id },
    orderBy: { ordinal: "desc" },
    select: { ordinal: true },
  });
  const tempOrdinal = (latestFrontier?.ordinal ?? -1) + 1;
  const tempNode = await tx.warGraphNode.create({
    data: {
      graphId: graph.id,
      layerId: frontierLayer.id,
      seatKey: `frontier:founding-correction-v2-${tempOrdinal}`,
      ordinal: tempOrdinal,
      angularSeed: tempOrdinal,
      presentation: {},
    },
  });

  const cycles = [
    [zodiac, somniosator, pigman],
    [deltaforce, c0lorz],
    [julio, sniper, mouldy],
    [emaren, ra],
  ] as const;

  const changes = cycles.flatMap((cycle) =>
    cycle.map((membership, index) => {
      const destination =
        cycle[(index + 1) % cycle.length]!;

      return {
        key: normalizeWarGraphIdentity(
          membership.displayNameSnapshot,
        ),
        membership,
        fromNode: membership.occupancy!.node,
        toNode: destination.occupancy!.node,
      };
    }),
  );

  for (const cycle of cycles) {
    const first = cycle[0];

    await tx.warGraphOccupancy.update({
      where: { id: first.occupancy!.id },
      data: { nodeId: tempNode.id },
    });

    for (
      let index = cycle.length - 1;
      index >= 1;
      index -= 1
    ) {
      const membership = cycle[index]!;
      const destination =
        cycle[(index + 1) % cycle.length]!;

      await tx.warGraphOccupancy.update({
        where: { id: membership.occupancy!.id },
        data: {
          nodeId: destination.occupancy!.node.id,
          occupiedAt: now,
          version: { increment: 1 },
        },
      });
    }

    const firstDestination = cycle[1];

    await tx.warGraphOccupancy.update({
      where: { id: first.occupancy!.id },
      data: {
        nodeId: firstDestination.occupancy!.node.id,
        occupiedAt: now,
        version: { increment: 1 },
      },
    });
  }

  await tx.warGraphNode.delete({ where: { id: tempNode.id } });

  for (const change of changes) {
    const sourceKey = `${FOUNDING_CORRECTION_V2.sourcePrefix}:${change.key}`;
    const versionBefore = change.membership.version;
    const updated = await tx.warGraphMembership.update({
      where: { id: change.membership.id },
      data: { version: { increment: 1 } },
      select: { version: true },
    });

    await tx.warGraphMovement.create({
      data: {
        graphId: graph.id,
        membershipId: change.membership.id,
        fromNodeId: change.fromNode.id,
        toNodeId: change.toNode.id,
        fromLayerOrdinal: change.fromNode.layer.ordinal,
        toLayerOrdinal: change.toNode.layer.ordinal,
        movementType: FOUNDING_CORRECTION_V2.movementType,
        reasonCode: FOUNDING_CORRECTION_V2.reasonCode,
        sourceKey,
        idempotencyKey: sourceKey,
        membershipVersionBefore: versionBefore,
        membershipVersionAfter: updated.version,
        movedAt: now,
      },
    });

    await appendWarGraphEvent(tx, {
      graphId: graph.id,
      membershipId: change.membership.id,
      actorUserId: change.membership.userId,
      aggregateType: "membership",
      aggregateId: change.membership.publicId,
      eventType: "WARGRAPH_FOUNDING_SEAT_CORRECTED",
      idempotencyKey: `${sourceKey}:event`,
      priorVersion: versionBefore,
      newVersion: updated.version,
      payload: {
        movementType: FOUNDING_CORRECTION_V2.movementType,
        reasonCode: FOUNDING_CORRECTION_V2.reasonCode,
        fromSeatKey: change.fromNode.seatKey,
        toSeatKey: change.toNode.seatKey,
      },
      occurredAt: now,
    });
  }

  await appendWarGraphEvent(tx, {
    graphId: graph.id,
    aggregateType: "graph",
    aggregateId: graph.publicId,
    eventType: "WARGRAPH_FOUNDING_BOARD_CORRECTION_V2",
    idempotencyKey: completionKey,
    payload: {
      applied: true,
      reason: FOUNDING_CORRECTION_V2.reasonCode,
      movements: changes.map((change) => ({
        playerKey: change.membership.playerKey,
        fromSeatKey: change.fromNode.seatKey,
        toSeatKey: change.toNode.seatKey,
      })),
      actionsConsumed: 0,
      rewardsCreated: 0,
    },
    occurredAt: now,
  });

  return true;
}

async function ensureNight(
  tx: TransactionClient,
  graphId: number,
  rulesetId: number,
  now: Date,
) {
  const nightKey = getWarGraphNightKey(now);
  if (!nightKey) throw new Error("WARGRAPH_CLOCK_INVALID");
  const primeOpensAt = warGraphBoundaryInstant(
    nightKey,
    WARGRAPH_PRIME_START_MINUTE,
  );
  const lastCallAt = warGraphBoundaryInstant(
    nightKey,
    WARGRAPH_PRIME_END_MINUTE,
  );
  const localDate = new Date(`${nightKey}T00:00:00.000Z`);

  // A legally commenced game owns its clock and may outlive the night that
  // created it. Close stale Prime projections before opening the next night,
  // but retain Afterburn for any still-live constitutional contract.
  const olderLiveNights = await tx.warGraphNight.findMany({
    where: {
      graphId,
      localDate: { not: localDate },
      status: { in: ["prime", "afterburn"] },
    },
    select: {
      id: true,
      localDate: true,
      lastCallAt: true,
      status: true,
      staticAt: true,
    },
  });
  for (const olderNight of olderLiveNights) {
    const hasContracts = await hasOpenNightContracts(tx, olderNight.id, now);
    if (hasContracts && olderNight.status === "afterburn" && !olderNight.staticAt) {
      continue;
    }
    const reconciledOlderNight = await tx.warGraphNight.update({
      where: { id: olderNight.id },
      data: hasContracts
        ? { status: "afterburn", staticAt: null, version: { increment: 1 } }
        : {
            status: "static",
            staticAt:
              now > olderNight.lastCallAt ? now : olderNight.lastCallAt,
            version: { increment: 1 },
          },
    });
    await ensureFossilizationJob(tx, graphId, reconciledOlderNight);
  }

  const night = await tx.warGraphNight.upsert({
    where: {
      graphId_localDate: {
        graphId,
        localDate,
      },
    },
    update: {},
    create: {
      graphId,
      rulesetId,
      localDate: new Date(`${nightKey}T00:00:00.000Z`),
      timezone: WARGRAPH_TIME_ZONE,
      primeOpensAt,
      lastCallAt,
      status: "scheduled",
      staticAt: null,
    },
  });
  if (night.status === "settled" || night.status === "system_void") {
    return { night, nightKey };
  }

  const hasContracts = await hasOpenNightContracts(tx, night.id, now);
  const status =
    now < primeOpensAt
      ? "scheduled"
      : now < lastCallAt
        ? "prime"
        : hasContracts
          ? "afterburn"
          : "static";
  const staticAt =
    status === "static"
      ? night.staticAt ?? (now > lastCallAt ? now : lastCallAt)
      : null;
  if (night.status === status && night.staticAt?.getTime() === staticAt?.getTime()) {
    await ensureFossilizationJob(tx, graphId, night);
    return { night, nightKey };
  }
  const reconciled = await tx.warGraphNight.update({
    where: { id: night.id },
    data: {
      status,
      staticAt,
      version: { increment: 1 },
    },
  });
  await ensureFossilizationJob(tx, graphId, reconciled);
  return { night: reconciled, nightKey };
}

function nextWarGraphDateKey(localDate: Date): string {
  if (!Number.isFinite(localDate.getTime())) {
    throw new Error("WARGRAPH_NIGHT_DATE_INVALID");
  }
  const next = new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate() + 1,
    ),
  );
  return next.toISOString().slice(0, 10);
}

async function ensureFossilizationJob(
  tx: TransactionClient,
  graphId: number,
  night: {
    id: number;
    localDate: Date;
    status: string;
  },
): Promise<void> {
  if (night.status !== "static") return;
  const nextPrimeOpensAt = warGraphBoundaryInstant(
    nextWarGraphDateKey(night.localDate),
    WARGRAPH_PRIME_START_MINUTE,
  );
  const dedupeKey = `wargraph:fossilization:${night.id}`;
  const payload = {
    schema: WARGRAPH_FOSSILIZATION_JOB_SCHEMA,
    nightId: night.id,
    nextPrimeOpensAt: nextPrimeOpensAt.toISOString(),
  } as const;
  const existing = await tx.warGraphJob.findUnique({
    where: { dedupeKey },
  });
  if (existing) {
    if (
      existing.graphId !== graphId ||
      existing.jobType !== "advance_fossilization" ||
      stableWarGraphJson(existing.payload) !== stableWarGraphJson(payload)
    ) {
      throw new Error("WARGRAPH_FOSSILIZATION_JOB_IDENTITY_COLLISION");
    }
    return;
  }
  await tx.warGraphJob.create({
    data: {
      graphId,
      jobType: "advance_fossilization",
      dedupeKey,
      payload,
      status: "queued",
      availableAt: nextPrimeOpensAt,
    },
  });
}

async function hasOpenNightContracts(
  tx: TransactionClient,
  nightId: number,
  now: Date,
): Promise<boolean> {
  const [advance, pairing] = await Promise.all([
    tx.warGraphAdvanceRequest.findFirst({
      where: {
        nightId,
        status: "open",
        responseDeadlineAt: { gt: now },
      },
      select: { id: true },
    }),
    tx.warGraphPairing.findFirst({
      where: {
        nightId,
        OR: [
          { status: "live" },
          {
            status: { in: ["accepted", "engaged"] },
            launchDeadlineAt: { gt: now },
          },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(advance || pairing);
}

async function createFoundationOnce(
  prisma: PrismaClient,
  now: Date,
): Promise<WarGraphFoundation> {
  return prisma.$transaction(
    async (tx) => {
      // Resolve the stable database identity first, then serialize every board
      // projection writer on the canonical graph-scoped advisory lock.
      const graphIdentity = await ensureGraph(tx);
      await lockWarGraphTransaction(tx, graphIdentity.id);
      const { graph, ruleset } = await ensureGraphAndRuleset(
        tx,
        now,
        graphIdentity,
      );
      const layers = await ensureTopology(tx, graph.id);
      const assignmentsCreated = await ensureMembershipsAndSeats(
        tx,
        graph.id,
        layers,
        now,
      );
      const foundingCorrectionV1Applied =
        await applyFoundingBoardCorrectionV1(
          tx,
          graph,
          now,
        );
      const foundingCorrectionV2Applied =
        await applyFoundingBoardCorrectionV2(
          tx,
          graph,
          now,
        );
      const { night, nightKey } = await ensureNight(
        tx,
        graph.id,
        ruleset.id,
        now,
      );
      const currentGraph =
        graph.projectionVersion === 0 ||
        assignmentsCreated > 0 ||
        foundingCorrectionV1Applied ||
        foundingCorrectionV2Applied
          ? await tx.warGraph.update({
              where: { id: graph.id },
              data: { projectionVersion: { increment: 1 } },
              select: { projectionVersion: true },
            })
          : { projectionVersion: graph.projectionVersion };
      return {
        graphId: graph.id,
        rulesetId: ruleset.id,
        nightId: night.id,
        nightKey,
        projectionVersion: currentGraph.projectionVersion,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 25_000,
    },
  );
}

async function createFoundation(
  prisma: PrismaClient,
  now: Date,
): Promise<WarGraphFoundation> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await createFoundationOnce(prisma, now);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "P2034" || attempt === maxAttempts) throw error;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, attempt * 15);
      });
    }
  }
  throw new Error("WARGRAPH_FOUNDATION_RETRY_EXHAUSTED");
}

export async function ensureWarGraphFoundation(options?: {
  prisma?: PrismaClient;
  now?: Date;
  force?: boolean;
}): Promise<WarGraphFoundation> {
  const prisma = options?.prisma ?? getPrisma();
  const now = options?.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("WARGRAPH_CLOCK_INVALID");
  }
  if (!options?.prisma && !options?.force) {
    const current = foundationCache;
    if (current && current.expiresAt > Date.now()) return current.promise;
    const promise = createFoundation(prisma, now).catch((error) => {
      if (foundationCache?.promise === promise) foundationCache = null;
      throw error;
    });
    foundationCache = {
      expiresAt: Date.now() + FOUNDATION_CACHE_MS,
      promise,
    };
    return promise;
  }
  return createFoundation(prisma, now);
}

export const warGraphFoundationInternals = {
  normalizeIdentity: normalizeWarGraphIdentity,
  stableJson: stableWarGraphJson,
};
