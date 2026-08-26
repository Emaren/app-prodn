import { isWarGraphWatcherHeartbeatFresh } from "./watcherHealthContract";
import { cookies } from "next/headers";

import type { PrismaClient } from "../generated/prisma";
import { getPrisma } from "../prisma";
import { loadPublicPlayerDirectory } from "../publicPlayerDirectory";
import {
  SESSION_COOKIE_NAME,
  verifySession,
} from "../session";

import {
  DEFAULT_WARGRAPH_REWARD_CONFIG,
  WARGRAPH_MAX_RESOLVED_CONTESTS,
  WARGRAPH_PRIME_START_MINUTE,
} from "./constants";
import {
  ensureWarGraphFoundation,
  warGraphBoundaryInstant,
} from "./foundation";
import type {
  WarGraphFossilizationStage,
  WarGraphHistoryReasonCode,
  WarGraphPublicEngagement,
  WarGraphPublicHistoryEvent,
  WarGraphPublicNode,
  WarGraphPublicSnapshot,
  WarGraphPublicWatcher,
} from "./publicTypes";
import { WARGRAPH_PUBLIC_SCHEMA_VERSION } from "./publicTypes";
import {
  getEdmontonLocalDateTime,
  getWarGraphOperationalPhase,
} from "./time";

const ACTIVE_PAIRING_STATUSES = [
  "accepted",
  "engaged",
  "live",
] as const;
const REALM_FRESH_MS = 15 * 60 * 1000;
const HISTORY_LIMIT = 18;

type LoadSnapshotOptions = {
  uid?: string | null;
  now?: Date;
  prisma?: PrismaClient;
  bootstrap?: boolean;
};

function addLocalDays(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("WARGRAPH_NIGHT_KEY_INVALID");
  const cursor = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
}

function nightLabel(dateKey: string): string {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  const label = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
  return `WarGraph Night · ${label}`;
}

function publicWatcher(
  presence:
    | {
        watcherSeenAt: Date | null;
        watcherHealthy: boolean;
      }
    | null
    | undefined,
  now: Date,
  applicable = true,
): WarGraphPublicWatcher {
  if (!applicable) {
    return {
      state: "not_applicable",
      label: "Sign in to inspect",
      connected: false,
      monitorAttached: false,
      folderReady: false,
      lastSeenAt: null,
    };
  }
  const fresh = isWarGraphWatcherHeartbeatFresh(
    presence?.watcherSeenAt,
    now,
  );
  const monitorAttached = fresh && presence?.watcherHealthy === true;
  return {
    state: monitorAttached ? "healthy" : fresh ? "connected" : "offline",
    label: monitorAttached
      ? "Watcher monitor live"
      : fresh
        ? "Watcher connected"
        : "Watcher offline",
    connected: fresh,
    monitorAttached,
    folderReady: monitorAttached,
    lastSeenAt: presence?.watcherSeenAt?.toISOString() ?? null,
  };
}

function fossilization(stage: number, dormantNights: number) {
  const stages: readonly WarGraphFossilizationStage[] = [
    "living",
    "weathered",
    "stone_touched",
    "stone_spreading",
    "mostly_statue",
    "full_statue",
    "cobwebbed",
  ];
  const normalized = Math.max(0, Math.min(stages.length - 1, Math.floor(stage)));
  const value = stages[normalized];
  const labels: Record<WarGraphFossilizationStage, string> = {
    living: "Living",
    weathered: "Weathered",
    stone_touched: "Stone-touched",
    stone_spreading: "Stone spreading",
    mostly_statue: "Mostly statue",
    full_statue: "Full statue",
    cobwebbed: "Cobwebbed",
  };
  return {
    stage: value,
    dormantNights: Math.max(0, dormantNights),
    label: labels[value],
  };
}

function movementHistoryReason(
  movementType: string,
  reasonCode: string,
): {
  reasonCode: WarGraphHistoryReasonCode;
  reasonLabel: string;
  kind: WarGraphPublicHistoryEvent["kind"];
} {
  if (movementType === "FOUNDING_CORRECTION") {
    return {
      reasonCode: "SEAT_CLAIMED",
      reasonLabel: "Founding board correction",
      kind: "movement",
    };
  }
  if (movementType === "GRAVITY_MOVE") {
    return {
      reasonCode: "GRAVITY_MOVE",
      reasonLabel: "Gravity fill",
      kind: "gravity",
    };
  }
  if (
    movementType === "SEAT_CLAIM" ||
    movementType.includes("DEFAULT") ||
    reasonCode.includes("DEFAULT")
  ) {
    return {
      reasonCode: "DEFENSE_DEFAULT",
      reasonLabel: "Defense default",
      kind: "default",
    };
  }
  if (movementType === "CATASTROPHIC_FALL") {
    return {
      reasonCode: "CATASTROPHIC_FALL",
      reasonLabel: "Catastrophic fall",
      kind: "battle",
    };
  }
  if (reasonCode === "CROWN_CAPTURED") {
    return {
      reasonCode: "CROWN_CAPTURED",
      reasonLabel: "Crown captured",
      kind: "battle",
    };
  }
  if (movementType === "INITIAL_ASSIGNMENT") {
    return {
      reasonCode: "SEAT_CLAIMED",
      reasonLabel: "Founding board assignment",
      kind: "movement",
    };
  }
  return {
    reasonCode: "VERIFIED_BATTLE",
    reasonLabel: "Verified battle movement",
    kind: "movement",
  };
}

function staticRules() {
  return {
    summary:
      "Adjacent rings fight. Verified winners move inward; interior losers fall to the Frontier.",
    winMovement: "Take the challenged seat one ring inward.",
    lossMovement:
      "An interior loser falls to the Frontier; a Frontier loser remains there.",
    inactivity:
      "Inactivity fossilizes a table visually and may make it eligible for Gravity.",
    proofRequirement:
      "Two exact participant Watchers plus trusted final replay proof.",
    rewardNotice:
      "Verified battle rewards become pending WOLO entitlements; chain settlement remains separate truth.",
    entries: [
      {
        id: "adjacent-only",
        label: "Adjacent only",
        detail: "The outer warrior is Aggressor; the inner warrior is Defender.",
      },
      {
        id: "two-actions",
        label: "Two resolved contests",
        detail: "Every warrior has at most two resolved WarGraph contests per night.",
      },
      {
        id: "prime-window",
        label: "Prime Window",
        detail: "New advances and organic battles begin only from 5–11 PM Edmonton.",
      },
      {
        id: "fails-closed",
        label: "Proof before movement",
        detail: "Uncertain identity, Watcher, timing, roster, or result truth cannot move the board.",
      },
    ],
  } as const;
}

function maintenanceSnapshot(
  now: Date,
  authenticated: boolean,
): WarGraphPublicSnapshot {
  const local = getEdmontonLocalDateTime(now);
  const dayKey = local?.dateKey ?? now.toISOString().slice(0, 10);
  return {
    schemaVersion: WARGRAPH_PUBLIC_SCHEMA_VERSION,
    revision: "guarded",
    generatedAt: now.toISOString(),
    phase: "maintenance",
    phaseLabel: "Board guarded",
    phaseDetail: "WarGraph truth is temporarily unavailable; no movement is permitted.",
    night: {
      dayKey,
      label: nightLabel(dayKey),
      primeHoursLabel: "5–11 PM",
      timeZone: "America/Edmonton",
      opensAt: null,
      closesAt: null,
      nextTransitionAt: null,
      nextTransitionLabel: "Schedule guarded",
      actionLimit: WARGRAPH_MAX_RESOLVED_CONTESTS,
    },
    transition: null,
    health: {
      state: "maintenance",
      label: "Truth unavailable",
      detail: "Competitive actions are disabled until the authoritative projection returns.",
      checkedAt: now.toISOString(),
    },
    spectatorCount: 0,
    crown: {
      title: "The Crown",
      holderNodeId: null,
      battleRewardWolo: DEFAULT_WARGRAPH_REWARD_CONFIG.crownBattleWinner,
      firstBloodBonusWolo: DEFAULT_WARGRAPH_REWARD_CONFIG.firstBlood,
      firstBloodAvailable: true,
      defensesTonight: 0,
      actionLimit: WARGRAPH_MAX_RESOLVED_CONTESTS,
      subtitle: "The authoritative holder is temporarily guarded.",
    },
    rules: staticRules(),
    rings: [
      {
        id: "crown",
        kind: "crown",
        label: "The Crown",
        shortLabel: "Crown",
        order: 0,
        capacity: 1,
        movementSummary: "The summit",
        nodeIds: [],
      },
      {
        id: "ring-i",
        kind: "inner",
        label: "Ring I",
        shortLabel: "Ring I",
        order: 1,
        capacity: 2,
        movementSummary: "One victory from the Crown",
        nodeIds: [],
      },
      {
        id: "ring-ii",
        kind: "middle",
        label: "Ring II",
        shortLabel: "Ring II",
        order: 2,
        capacity: 6,
        movementSummary: "The inner campaign",
        nodeIds: [],
      },
      {
        id: "frontier",
        kind: "frontier",
        label: "The Frontier",
        shortLabel: "Frontier",
        order: 3,
        capacity: 0,
        movementSummary: "The elastic outer ring",
        nodeIds: [],
      },
    ],
    nodes: [],
    viewer: {
      authenticated,
      participating: false,
      nodeId: null,
      actionsUsed: 0,
      actionLimit: WARGRAPH_MAX_RESOLVED_CONTESTS,
      canAdvance: false,
      advanceDisabledReason: "Board truth is temporarily guarded.",
      canTakeFight: false,
      takeFightDisabledReason: "Board truth is temporarily guarded.",
      eligibleAdvanceIds: [],
      activeEngagementId: null,
      watcher: publicWatcher(null, now, authenticated),
    },
    openAdvances: [],
    engagements: [],
    recentHistory: [],
  };
}

async function requestViewerUid(): Promise<string | null> {
  const cookieStore = await cookies();
  const claims = await verifySession(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  return claims?.uid ?? null;
}

export async function loadWarGraphPublicSnapshot(
  options: LoadSnapshotOptions = {},
): Promise<WarGraphPublicSnapshot> {
  const now = options.now ?? new Date();
  const uid =
    Object.prototype.hasOwnProperty.call(options, "uid")
      ? options.uid ?? null
      : await requestViewerUid();
  if (!Number.isFinite(now.getTime())) {
    return maintenanceSnapshot(new Date(), Boolean(uid));
  }
  const prisma = options.prisma ?? getPrisma();

  try {
    const foundation =
      options.bootstrap === false
        ? await prisma.warGraph
            .findUnique({
              where: { slug: "living-wargraph" },
              include: {
                rulesets: {
                  where: { version: 1 },
                  take: 1,
                },
                nights: {
                  orderBy: { localDate: "desc" },
                  take: 1,
                },
              },
            })
            .then((graph) => {
              const ruleset = graph?.rulesets[0];
              const night = graph?.nights[0];
              if (!graph || !ruleset || !night) {
                throw new Error("WARGRAPH_FOUNDATION_MISSING");
              }
              return {
                graphId: graph.id,
                rulesetId: ruleset.id,
                nightId: night.id,
                nightKey: night.localDate.toISOString().slice(0, 10),
                projectionVersion: graph.projectionVersion,
              };
            })
        : await ensureWarGraphFoundation({
            prisma: options.prisma,
            now,
            force: Boolean(options.prisma),
          });

    const [
      graph,
      ruleset,
      night,
      openAdvances,
      pairings,
      actions,
      settledContests,
      movements,
      spectatorCount,
      viewerUser,
      firstBloodRewardCount,
    ] = await Promise.all([
      prisma.warGraph.findUniqueOrThrow({
        where: { id: foundation.graphId },
        include: {
          layers: {
            orderBy: { ordinal: "asc" },
            include: {
              nodes: {
                orderBy: { ordinal: "asc" },
                include: {
                  occupancy: {
                    include: {
                      membership: { include: { presence: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.warGraphRuleset.findUniqueOrThrow({
        where: { id: foundation.rulesetId },
      }),
      prisma.warGraphNight.findUniqueOrThrow({
        where: { id: foundation.nightId },
      }),
      prisma.warGraphAdvanceRequest.findMany({
        where: {
          graphId: foundation.graphId,
          status: "open",
          responseDeadlineAt: { gt: now },
        },
        orderBy: { requestedAt: "asc" },
        include: {
          challenger: true,
          sourceNode: true,
          targetLayer: true,
          defenseObligation: {
            select: {
              defenderMembershipId: true,
              status: true,
            },
          },
        },
      }),
      prisma.warGraphPairing.findMany({
        where: {
          graphId: foundation.graphId,
          status: { in: [...ACTIVE_PAIRING_STATUSES] },
        },
        orderBy: { acceptedAt: "asc" },
        include: {
          aggressorStartNode: true,
          defenderStartNode: true,
          contest: {
            include: {
              attestations: { include: { attestation: true } },
            },
          },
        },
      }),
      prisma.warGraphAction.findMany({
        where: { graphId: foundation.graphId, nightId: foundation.nightId },
        select: { membershipId: true, slot: true },
      }),
      prisma.warGraphContest.findMany({
        where: { graphId: foundation.graphId, status: "settled" },
        orderBy: [{ commencedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          nightId: true,
          winnerMembershipId: true,
          loserMembershipId: true,
          defenderMembershipId: true,
        },
      }),
      prisma.warGraphMovement.findMany({
        where: { graphId: foundation.graphId },
        orderBy: [{ movedAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT,
        include: {
          membership: true,
          fromNode: true,
          toNode: true,
          contest: { include: { rewards: true } },
        },
      }),
      prisma.warGraphSpectatorSession.count({
        where: {
          graphId: foundation.graphId,
          closedAt: null,
          expiresAt: { gt: now },
        },
      }),
      uid
        ? prisma.user.findUnique({
            where: { uid },
            select: { id: true, steamId: true },
          })
        : Promise.resolve(null),
      prisma.warGraphReward.count({
        where: {
          graphId: foundation.graphId,
          nightId: foundation.nightId,
          rewardKind: "FIRST_BLOOD",
        },
      }),
    ]);

    const boardMemberships = graph.layers.flatMap(
      (layer) =>
        layer.nodes.flatMap((node) =>
          node.occupancy
            ? [node.occupancy.membership]
            : [],
        ),
    );

    /*
     * WarGraph and the public leaderboards share one player-name authority.
     *
     * Membership.playerKey is already the durable identity grain
     * ("steam:<SteamID>" for Steam warriors). The public player directory
     * uses that same key and promotes the newest accepted replay observation
     * to latestObservedName.
     *
     * WarGraph therefore never invents a second rename policy.
     */
    const playerDirectory =
      await loadPublicPlayerDirectory(prisma);

    const latestObservedNameByPlayerKey =
      new Map(
        playerDirectory.allEntries.map((entry) => [
          entry.key,
          entry.latestObservedName,
        ]),
      );

    const currentDisplayNameByMembershipId =
      new Map(
        boardMemberships.map((membership) => [
          membership.id,
          latestObservedNameByPlayerKey
            .get(membership.playerKey)
            ?.trim() ||
            membership.displayNameSnapshot,
        ]),
      );

    const nodeIdByDatabaseId = new Map<number, string>();
    const nodeByMembershipId = new Map<
      number,
      {
        publicId: string;
        layerId: number;
        layerKey: string;
        layerOrdinal: number;
      }
    >();
    for (const layer of graph.layers) {
      for (const node of layer.nodes) {
        nodeIdByDatabaseId.set(node.id, node.publicId);
        if (node.occupancy) {
          nodeByMembershipId.set(node.occupancy.membershipId, {
            publicId: node.publicId,
            layerId: layer.id,
            layerKey: layer.key,
            layerOrdinal: layer.ordinal,
          });
        }
      }
    }

    const actionsUsed = new Map<number, number>();
    for (const action of actions) {
      actionsUsed.set(
        action.membershipId,
        Math.max(actionsUsed.get(action.membershipId) ?? 0, action.slot),
      );
    }

    const wins = new Map<number, number>();
    const losses = new Map<number, number>();
    const defenses = new Map<number, number>();
    for (const contest of settledContests) {
      if (contest.winnerMembershipId) {
        wins.set(
          contest.winnerMembershipId,
          (wins.get(contest.winnerMembershipId) ?? 0) + 1,
        );
        if (contest.winnerMembershipId === contest.defenderMembershipId) {
          defenses.set(
            contest.winnerMembershipId,
            (defenses.get(contest.winnerMembershipId) ?? 0) + 1,
          );
        }
      }
      if (contest.loserMembershipId) {
        losses.set(
          contest.loserMembershipId,
          (losses.get(contest.loserMembershipId) ?? 0) + 1,
        );
      }
    }

    const activeMembershipIds = new Set<number>();
    for (const pairing of pairings) {
      activeMembershipIds.add(pairing.aggressorMembershipId);
      activeMembershipIds.add(pairing.defenderMembershipId);
    }
    const underSiegeLayerIds = new Set(
      openAdvances.map((advance) => advance.targetLayerId),
    );
    const viewerMembershipId = viewerUser
      ? graph.layers
          .flatMap((layer) => layer.nodes)
          .map((node) => node.occupancy?.membership)
          .find((membership) => membership?.userId === viewerUser.id)?.id ?? null
      : null;

    const nodes: WarGraphPublicNode[] = [];
    for (const layer of graph.layers) {
      let frontierPresentationSeat = 0;
      for (const node of layer.nodes) {
        const occupancy = node.occupancy;
        if (!occupancy) continue;
        const membership = occupancy.membership;
        const presence = membership.presence;
        const used = actionsUsed.get(membership.id) ?? 0;
        const realmActive = Boolean(
          presence?.realmSeenAt &&
            now.getTime() - presence.realmSeenAt.getTime() <= REALM_FRESH_MS,
        );
        const warGraphToday = Boolean(
          presence?.graphSeenAt && presence.graphSeenAt >= night.primeOpensAt,
        );
        const readyNow = Boolean(presence?.readyUntil && presence.readyUntil > now);
        const underSiege = underSiegeLayerIds.has(layer.id);
        const engaged = activeMembershipIds.has(membership.id);
        const nightComplete = used >= ruleset.maxResolvedActions;
        const watcher = publicWatcher(presence, now);
        const displayName =
          currentDisplayNameByMembershipId.get(
            membership.id,
          ) ??
          membership.displayNameSnapshot;
        const state = engaged
          ? "engaged"
          : underSiege
            ? "under_siege"
            : nightComplete
              ? "night_complete"
              : readyNow
                ? "ready_now"
                : warGraphToday
                  ? "wargraph_today"
                  : realmActive
                    ? "realm_active"
                    : "dormant";
        const labels = {
          engaged: "Battle bound",
          under_siege: "Under siege",
          night_complete: `Night complete ${used}/${ruleset.maxResolvedActions}`,
          ready_now: "Ready now",
          wargraph_today: "WarGraph today",
          realm_active: "Realm active",
          dormant: "At rest",
        } as const;

        nodes.push({
          id: node.publicId,
          ringId: layer.key,
          seat:
            layer.kind === "frontier"
              ? frontierPresentationSeat++
              : node.ordinal,
          displayName,
          avatarUrl: membership.avatarUrlSnapshot,
          avatarAlt: `${displayName}'s WarGraph table`,
          subtitle: null,
          mapLabel: null,
          state,
          stateLabel: labels[state],
          isViewer: membership.id === viewerMembershipId,
          isCrownHolder: layer.ordinal === 0,
          actionsUsed: used,
          actionLimit: ruleset.maxResolvedActions,
          presence: {
            realmActive,
            warGraphToday,
            readyNow,
            watcherLive: watcher.monitorAttached,
            underSiege,
            nightComplete,
          },
          fossilization: fossilization(
            membership.fossilizationStage,
            membership.dormantNights,
          ),
          record: {
            wins: wins.get(membership.id) ?? 0,
            losses: losses.get(membership.id) ?? 0,
            defenses: defenses.get(membership.id) ?? 0,
            streak: 0,
          },
          watcher,
        });
      }
    }

    const ringKind = {
      crown: "crown",
      inner: "inner",
      middle: "middle",
      frontier: "frontier",
    } as const;
    const rings = graph.layers.map((layer) => {
      const nodeIds = nodes
        .filter((node) => node.ringId === layer.key)
        .map((node) => node.id);
      const summaries = [
        "Hold the Crown against every adjacent challenger.",
        "One verified victory from the Crown.",
        "Fight inward or fall beyond the walls.",
        "The elastic proving ground for every eligible warrior.",
      ];
      return {
        id: layer.key,
        kind: ringKind[layer.kind as keyof typeof ringKind] ?? "frontier",
        label: layer.displayName,
        shortLabel: layer.key === "crown" ? "Crown" : layer.displayName,
        order: layer.ordinal,
        capacity: layer.fixedCapacity ?? nodeIds.length,
        movementSummary: summaries[layer.ordinal] ?? summaries[3],
        nodeIds,
      };
    });

    const viewerOpenAdvance = viewerMembershipId
      ? openAdvances.find(
          (advance) => advance.challengerMembershipId === viewerMembershipId,
        ) ?? null
      : null;
    const viewerPendingDutyAdvanceId = viewerMembershipId
      ? openAdvances.find(
          (advance) =>
            advance.defenseObligation?.status === "pending" &&
            advance.defenseObligation.defenderMembershipId === viewerMembershipId,
        )?.id ?? null
      : null;
    const eligibleAdvanceIds: string[] = [];
    if (
      viewerMembershipId &&
      !activeMembershipIds.has(viewerMembershipId) &&
      !viewerOpenAdvance
    ) {
      const viewerPosition = nodeByMembershipId.get(viewerMembershipId);
      if (viewerPosition) {
        for (const advance of openAdvances) {
          if (
            advance.targetLayerId === viewerPosition.layerId &&
            advance.challengerMembershipId !== viewerMembershipId &&
            (viewerPendingDutyAdvanceId === null ||
              viewerPendingDutyAdvanceId === advance.id) &&
            (actionsUsed.get(viewerMembershipId) ?? 0) < ruleset.maxResolvedActions
          ) {
            eligibleAdvanceIds.push(advance.publicId);
          }
        }
      }
    }

    const publicAdvances = openAdvances.map((advance) => {
      const eligibleResponderNodeIds = nodes
        .filter((node) => node.ringId === advance.targetLayer.key)
        .map((node) => node.id);
      const winnerRewardWolo =
        advance.sourceLayerOrdinal === 3
          ? Number(ruleset.frontierAdvanceWolo)
          : advance.targetLayerOrdinal === 0
            ? Number(ruleset.crownVictoryWolo)
            : Number(ruleset.ringTwoAdvanceWolo);
      return {
        id: advance.publicId,
        requesterNodeId:
          nodeIdByDatabaseId.get(advance.sourceNodeId) ??
          advance.sourceNode.publicId,
        fromRingId:
          graph.layers.find((layer) => layer.ordinal === advance.sourceLayerOrdinal)
            ?.key ?? "frontier",
        targetRingId: advance.targetLayer.key,
        createdAt: advance.requestedAt.toISOString(),
        expiresAt: advance.responseDeadlineAt.toISOString(),
        eligibleResponderNodeIds,
        winnerRewardWolo,
        firstBloodBonusWolo:
          advance.targetLayerOrdinal === 0
            ? Number(ruleset.firstCrownBloodWolo)
            : 0,
        label: `Calls ${advance.targetLayer.displayName} to battle`,
      };
    });

    const publicEngagements: WarGraphPublicEngagement[] = pairings.map((pairing) => {
      const isAggressor = pairing.aggressorMembershipId === viewerMembershipId;
      const isDefender = pairing.defenderMembershipId === viewerMembershipId;
      const claims = pairing.contest?.attestations ?? [];
      const watcherProof =
        claims.length >= 2
          ? "verified"
          : pairing.commencedAt
            ? "awaiting_final"
            : claims.length === 1
              ? "collecting"
              : "not_started";
      const aggressorReady = Boolean(pairing.aggressorReadyAt);
      const defenderReady = Boolean(pairing.defenderReadyAt);
      const state = pairing.commencedAt
        ? "watching"
        : aggressorReady && defenderReady
          ? "locked"
          : "offered";
      const viewerReady = isAggressor
        ? aggressorReady
        : isDefender
          ? defenderReady
          : false;
      const sourceLayer = pairing.aggressorStartLayerOrdinal;
      return {
        id: pairing.publicId,
        aggressorNodeId: pairing.aggressorStartNode.publicId,
        defenderNodeId: pairing.defenderStartNode.publicId,
        state,
        watcherProof,
        label: pairing.commencedAt ? "Battle under proof" : "Battle contract",
        detail: pairing.commencedAt
          ? "The exact live game is awaiting trusted final replay proof."
          : "Both warriors have thirty minutes from acceptance to launch.",
        createdAt: pairing.acceptedAt.toISOString(),
        expiresAt: pairing.launchDeadlineAt.toISOString(),
        isViewerParticipant: isAggressor || isDefender,
        viewerRole: isAggressor ? "aggressor" : isDefender ? "defender" : null,
        aggressorReady,
        defenderReady,
        viewerReady,
        viewerCanReady:
          (isAggressor || isDefender) && !viewerReady && !pairing.commencedAt,
        readyDisabledReason:
          isAggressor || isDefender
            ? viewerReady
              ? "You are ready."
              : pairing.commencedAt
                ? "This battle has already commenced."
                : null
            : "Only the bound warriors can mark ready.",
        winnerRewardWolo:
          sourceLayer === 3
            ? Number(ruleset.frontierAdvanceWolo)
            : pairing.defenderStartLayerOrdinal === 0
              ? Number(ruleset.crownVictoryWolo)
              : Number(ruleset.ringTwoAdvanceWolo),
        firstBloodBonusWolo:
          pairing.defenderStartLayerOrdinal === 0
            ? Number(ruleset.firstCrownBloodWolo)
            : 0,
        roomHref: pairing.contest?.gameStatsId
          ? `/game-stats/${pairing.contest.gameStatsId}`
          : null,
      };
    });

    const history: WarGraphPublicHistoryEvent[] = movements.map((movement) => {
      const reason = movementHistoryReason(
        movement.movementType,
        movement.reasonCode,
      );
      const from = movement.fromNode
        ? nodeIdByDatabaseId.get(movement.fromNode.id) ?? movement.fromNode.publicId
        : null;
      const to = nodeIdByDatabaseId.get(movement.toNode.id) ?? movement.toNode.publicId;
      const reward = movement.contest?.rewards.reduce(
        (sum, item) => sum + Number(item.amountWolo),
        0,
      );
      const displayName =
        currentDisplayNameByMembershipId.get(
          movement.membership.id,
        ) ??
        movement.membership.displayNameSnapshot;
      return {
        id: movement.id.toString(),
        at: movement.movedAt.toISOString(),
        kind: reason.kind,
        reasonCode: reason.reasonCode,
        reasonLabel: reason.reasonLabel,
        headline:
          movement.movementType === "INITIAL_ASSIGNMENT"
            ? `${displayName} joined the living board`
            : `${displayName} moved`,
        detail:
          movement.movementType === "INITIAL_ASSIGNMENT"
            ? `Placed by the founding ${reason.reasonLabel.toLowerCase()} contract.`
            : `${reason.reasonLabel}: ring ${movement.fromLayerOrdinal ?? "—"} → ${movement.toLayerOrdinal}.`,
        nodeIds: from ? [from, to] : [to],
        woloDelta: reward && reward > 0 ? reward : null,
      };
    });

    const hasOpenContracts =
      openAdvances.length > 0 ||
      pairings.some(
        (pairing) =>
          Boolean(pairing.commencedAt) || pairing.launchDeadlineAt > now,
      );
    const operationalPhase =
      getWarGraphOperationalPhase(now, hasOpenContracts) ?? "STATIC";
    const phase = operationalPhase.toLowerCase() as
      | "prime"
      | "afterburn"
      | "static";
    const local = getEdmontonLocalDateTime(now);
    const staticBeforePrime =
      phase === "static" &&
      local !== null &&
      local.minuteOfDay < WARGRAPH_PRIME_START_MINUTE;
    const phaseLabels = {
      prime: "Prime Live",
      afterburn: "Afterburn",
      static: staticBeforePrime ? "Board Locked" : "Night Complete",
    } as const;
    const phaseDetails = {
      prime:
        "Eligible organic double-Watcher games and ring advances may bind the board now.",
      afterburn:
        "No new advances; already-bound contracts retain their full response and launch windows.",
      static: staticBeforePrime
        ? "The board is locked until tonight's Prime Window."
        : "Tonight's board is complete. The next Prime Window opens tomorrow.",
    } as const;
    let nextTransitionAt: Date | null = null;
    let nextTransitionLabel = "Awaiting authoritative final proof";
    if (phase === "prime") {
      nextTransitionAt = night.lastCallAt;
      nextTransitionLabel = "Last Call";
    } else if (phase === "afterburn") {
      const deadlines = [
        ...openAdvances.map((advance) => advance.responseDeadlineAt),
        ...pairings
          .filter((pairing) => !pairing.commencedAt)
          .map((pairing) => pairing.launchDeadlineAt),
      ].filter((deadline) => deadline > now);
      nextTransitionAt = deadlines.sort(
        (left, right) => left.getTime() - right.getTime(),
      )[0] ?? null;
      nextTransitionLabel = nextTransitionAt
        ? "Next contract deadline"
        : "Final proof pending";
    } else if (local) {
      const nextKey =
        local.minuteOfDay < WARGRAPH_PRIME_START_MINUTE
          ? local.dateKey
          : addLocalDays(local.dateKey, 1);
      nextTransitionAt = warGraphBoundaryInstant(
        nextKey,
        WARGRAPH_PRIME_START_MINUTE,
      );
      nextTransitionLabel = "Prime Window opens";
    }

    const viewerNode = viewerMembershipId
      ? nodes.find((node) => node.isViewer) ?? null
      : null;
    const viewerMembership = viewerMembershipId
      ? graph.layers
          .flatMap((layer) => layer.nodes)
          .map((node) => node.occupancy?.membership)
          .find((membership) => membership?.id === viewerMembershipId) ?? null
      : null;
    const viewerPosition = viewerMembershipId
      ? nodeByMembershipId.get(viewerMembershipId) ?? null
      : null;
    const viewerActionCount = viewerMembershipId
      ? actionsUsed.get(viewerMembershipId) ?? 0
      : 0;
    const viewerPairing = viewerMembershipId
      ? pairings.find(
          (pairing) =>
            pairing.aggressorMembershipId === viewerMembershipId ||
            pairing.defenderMembershipId === viewerMembershipId,
        )
      : null;
    const canAdvance = Boolean(
      viewerMembership &&
        viewerPosition &&
        viewerPosition.layerOrdinal > 0 &&
        phase === "prime" &&
        viewerActionCount < ruleset.maxResolvedActions &&
        !viewerOpenAdvance &&
        !viewerPairing,
    );
    const advanceDisabledReason = canAdvance
      ? null
      : !uid
        ? "Sign in to command your position."
        : !viewerMembership
          ? viewerUser?.steamId
            ? "Your eligible Steam identity is waiting for the next membership sync."
            : "Link a Steam identity to join automatically."
          : viewerPosition?.layerOrdinal === 0
            ? "The Crown defends; it does not advance."
            : phase !== "prime"
              ? "New advances open only from 5–11 PM Edmonton."
              : viewerActionCount >= ruleset.maxResolvedActions
                ? `Night complete ${viewerActionCount}/${ruleset.maxResolvedActions}.`
                : viewerPairing
                  ? "Finish your current battle contract first."
                  : viewerOpenAdvance
                    ? "Your advance is already open."
                    : "The board cannot bind that advance right now.";

    const crownNode = nodes.find((node) => node.isCrownHolder) ?? null;
    const firstBloodClaimed = firstBloodRewardCount > 0;
    const crownMembershipId = crownNode
      ? [...nodeByMembershipId.entries()].find(
          ([, position]) => position.publicId === crownNode.id,
        )?.[0] ?? null
      : null;
    const crownDefensesTonight = crownMembershipId
      ? settledContests.filter(
          (contest) =>
            contest.nightId === foundation.nightId &&
            contest.winnerMembershipId === crownMembershipId &&
            contest.defenderMembershipId === crownMembershipId,
        ).length
      : 0;

    return {
      schemaVersion: WARGRAPH_PUBLIC_SCHEMA_VERSION,
      revision: [
        `g${graph.projectionVersion}`,
        `n${night.version}`,
        `p${phase}`,
        `a${openAdvances.map((item) => item.publicId).join(".") || "none"}`,
        `e${pairings.map((item) => `${item.publicId}.${item.version}`).join(".") || "none"}`,
      ].join(":"),
      generatedAt: now.toISOString(),
      phase,
      phaseLabel: phaseLabels[phase],
      phaseDetail: phaseDetails[phase],
      night: {
        dayKey: foundation.nightKey,
        label: nightLabel(foundation.nightKey),
        primeHoursLabel: "5–11 PM",
        timeZone: "America/Edmonton",
        opensAt: night.primeOpensAt.toISOString(),
        closesAt: night.lastCallAt.toISOString(),
        nextTransitionAt: nextTransitionAt?.toISOString() ?? null,
        nextTransitionLabel,
        actionLimit: ruleset.maxResolvedActions,
      },
      transition:
        phase === "afterburn"
          ? {
              stage: "resolving",
              label: "Afterburn contracts resolving",
              detail:
                "Existing contracts keep their full constitutional windows; no new challenge may enter.",
              startedAt: night.lastCallAt.toISOString(),
              endsAt: nextTransitionAt?.toISOString() ?? null,
            }
          : null,
      health: {
        state: "healthy",
        label: "Living board online",
        detail: `Projection ${graph.projectionVersion} · ruleset ${ruleset.version}`,
        checkedAt: now.toISOString(),
      },
      spectatorCount,
      crown: {
        title: "The Crown",
        holderNodeId: crownNode?.id ?? null,
        battleRewardWolo: Number(ruleset.crownVictoryWolo),
        firstBloodBonusWolo: Number(ruleset.firstCrownBloodWolo),
        firstBloodAvailable: !firstBloodClaimed,
        defensesTonight: crownDefensesTonight,
        actionLimit: ruleset.maxResolvedActions,
        subtitle: crownNode
          ? "Defeat the holder in a verified adjacent battle to take their seat."
          : "The summit is vacant; only constitutional Gravity may fill below the Crown.",
      },
      rules: staticRules(),
      rings,
      nodes,
      viewer: {
        authenticated: Boolean(uid),
        participating: Boolean(viewerMembership && viewerNode),
        nodeId: viewerNode?.id ?? null,
        actionsUsed: viewerActionCount,
        actionLimit: ruleset.maxResolvedActions,
        canAdvance,
        advanceDisabledReason,
        canTakeFight: eligibleAdvanceIds.length > 0,
        takeFightDisabledReason:
          eligibleAdvanceIds.length > 0
            ? null
            : "No eligible adjacent-ring advance is calling you now.",
        eligibleAdvanceIds,
        activeEngagementId: viewerPairing?.publicId ?? null,
        watcher: publicWatcher(viewerMembership?.presence, now, Boolean(uid)),
      },
      openAdvances: publicAdvances,
      engagements: publicEngagements,
      recentHistory: history,
    };
  } catch (error) {
    console.error("WarGraph snapshot guarded", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return maintenanceSnapshot(now, Boolean(uid));
  }
}
