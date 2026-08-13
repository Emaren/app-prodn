import { unstable_cache } from "next/cache";
import {
  readdir,
  stat,
} from "node:fs/promises";
import {
  extname,
  join,
  resolve,
} from "node:path";

import { displayPlayerName, parsePlayers, readMapName } from "@/lib/gameStatsView";
import { isPublicBattleArchiveRow } from "@/lib/publicBattleArchiveEligibility";
import { getPrisma } from "@/lib/prisma";
import {
  cleanPublicGameRows,
  publicReplayWinnerTruth,
} from "@/lib/publicReplayTruth";
import { publicReplayRosterV2DisplayState } from "@/lib/publicReplayRosterV2";
import { resolveReplayOwnerDisplay } from "@/lib/replayOwnerDisplay";
import { buildReplayEvidenceLanes } from "@/lib/replayEvidenceLanes";
import {
  applyReplayAdjudicationsToGameStatsRows,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import { resolveReplayWinnerTruth } from "@/lib/unresolvedWatcherResult";

type GameRow = Awaited<ReturnType<typeof loadCorpusRows>>[number];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = "Unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function teamTruth(row: GameRow) {
  const keyEvents = record(row.key_events);
  const resolution = record(keyEvents.team_resolution);
  const teams = Array.isArray(resolution.teams) ? resolution.teams : [];
  const status = text(resolution.status, "incomplete").toLowerCase();
  const confidence = text(resolution.confidence, status === "resolved" ? "high" : "low").toLowerCase();
  return {
    resolved: status === "resolved" && teams.length === 2,
    status,
    confidence,
    provenance: text(resolution.provenance, "unresolved"),
    format: text(resolution.format, "unknown"),
  };
}

function resultTruth(row: GameRow) {
  return resolveReplayWinnerTruth({
    winner: row.winner,
    players: parsePlayers(row.players),
    parseReason: row.parse_reason,
    parseSource: row.parse_source,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
  });
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function ranked(map: Map<string, number>, limit = 20) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function failureSizeBucket(value: bigint) {
  const bytes = Number(value);
  if (bytes < 64 * 1024) return "Under 64 KB";
  if (bytes < 256 * 1024) return "64–256 KB";
  if (bytes < 1024 * 1024) return "256 KB–1 MB";
  if (bytes < 4 * 1024 * 1024) return "1–4 MB";
  return "4 MB+";
}

function failureRecoveryLane(input: { signature: string; extension: string }) {
  if (input.extension === ".aoe2mpgame") {
    return {
      key: "playback_required",
      label: "Saved-game container · playback required",
      disposition: "Format-specific or controlled playback lane",
    };
  }
  if (input.signature.includes("parser_exception:range_error")) {
    return {
      key: "alternate_parser",
      label: "Header range compatibility",
      disposition: "Alternate parser / version-specific recovery",
    };
  }
  if (input.signature.includes("terminated_error")) {
    return {
      key: "legacy_model_compat",
      label: "HD body-stream compatibility",
      disposition: "Isolated legacy-model candidate lane; never automatic promotion",
    };
  }
  if (input.signature.includes("truncated_or_incomplete")) {
    return {
      key: "corrupt_or_partial",
      label: "End-of-stream / incomplete evidence",
      disposition: "Corruption review before any recovery claim",
    };
  }
  return {
    key: "manual_review",
    label: "Unclassified parser failure",
    disposition: "Operator classification required",
  };
}

function candidateModeLabel(mode: string) {
  const labels: Record<string, string> = {
    mgz_full_summary: "Full recorded-game summary",
    mgz_hd_fragment_header_body_fallback: "Header fragment recovery",
    mgz_hd_metadata_fragment_body_fallback: "Metadata fragment recovery",
    mgz_hd_trailing_header_body_fallback: "Trailing body recovery",
    mgz_hd_saved_game_snapshot: "Saved checkpoint decoded",
    mgz_hd_saved_game_initial_prefix: "Saved checkpoint initial-state prefix",
    mgz_hd_saved_game_map_prefix: "Saved checkpoint map/roster prefix",
    mgz_parse_match_fallback: "Live parse-match recovery",
    mgz_header_only_fallback: "Header-only evidence",
  };
  return labels[mode] || mode.replaceAll("_", " ");
}

const EXACT_STEAM_ID_64 = /^\d{17}$/;
const DEFAULT_REPLAY_ARCHIVE_DIR =
  "/mnt/HC_Volume_105319120/aoe2-replay-archive";
const PHYSICAL_ARCHIVE_SCAN_BUDGET_MS =
  20_000;
const REPLAY_ARCHIVE_SUFFIXES =
  new Set([
    ".aoe2record",
    ".aoe2mpgame",
  ]);

async function loadPhysicalReplayArchiveSnapshot() {
  const scanStartedAt = Date.now();
  const root = resolve(
    process.env.REPLAY_ARCHIVE_DIR?.trim() ||
      DEFAULT_REPLAY_ARCHIVE_DIR
  );

  try {
    const entries = await readdir(
      root,
      {
        recursive: true,
        withFileTypes: true,
      }
    );
    const files: string[] = [];
    const extensionCounts =
      new Map<string, number>();

    if (
      Date.now() - scanStartedAt >
      PHYSICAL_ARCHIVE_SCAN_BUDGET_MS
    ) {
      throw new Error(
        `physical archive scan exceeded its ${PHYSICAL_ARCHIVE_SCAN_BUDGET_MS / 1_000}-second budget`
      );
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const extension =
        extname(entry.name)
          .toLowerCase();

      if (
        !REPLAY_ARCHIVE_SUFFIXES.has(
          extension
        )
      ) {
        continue;
      }

      files.push(
        join(
          entry.parentPath,
          entry.name
        )
      );
      bump(
        extensionCounts,
        extension
      );
    }

    let byteSize = 0;

    for (
      let index = 0;
      index < files.length;
      index += 256
    ) {
      if (
        Date.now() - scanStartedAt >
        PHYSICAL_ARCHIVE_SCAN_BUDGET_MS
      ) {
        throw new Error(
          `physical archive scan exceeded its ${PHYSICAL_ARCHIVE_SCAN_BUDGET_MS / 1_000}-second budget`
        );
      }

      const sizes =
        await Promise.all(
          files
            .slice(index, index + 256)
            .map(async (path) =>
              (await stat(path)).size
            )
        );

      byteSize += sizes.reduce(
        (sum, size) => sum + size,
        0
      );
    }

    return {
      available: true,
      scannedAt:
        new Date().toISOString(),
      root,
      files,
      objectCount: files.length,
      byteSize,
      recordedObjectCount:
        extensionCounts.get(
          ".aoe2record"
        ) ?? 0,
      savedCheckpointObjectCount:
        extensionCounts.get(
          ".aoe2mpgame"
        ) ?? 0,
    };
  } catch (error) {
    console.warn(
      "Physical replay archive telemetry unavailable:",
      error
    );

    return {
      available: false,
      scannedAt:
        new Date().toISOString(),
      root,
      files: [] as string[],
      objectCount: null,
      byteSize: null,
      recordedObjectCount: null,
      savedCheckpointObjectCount: null,
    };
  }
}

const loadCachedPhysicalReplayArchiveSnapshot =
  unstable_cache(
    loadPhysicalReplayArchiveSnapshot,
    [
      "physical-replay-archive-snapshot-v2",
    ],
    {
      revalidate: 3_600,
      tags: [
        "physical-replay-archive",
      ],
    }
  );

function explicitArtifactDisposition(metrics: unknown) {
  const source = record(metrics);

  for (const key of [
    "artifact_disposition",
    "terminal_disposition",
    "operator_disposition",
  ]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().toLowerCase();
    }
  }

  return "";
}

function isExplicitlyIrrecoverableArtifact(metrics: unknown) {
  return new Set([
    "confirmed_irrecoverable",
    "irrecoverable",
    "irrecoverable_junk",
  ]).has(explicitArtifactDisposition(metrics));
}

async function loadCorpusRows() {
  // This is final watcher/upload-record grain, not deduplicated logical-game
  // grain and not the frozen Engine Room artifact cohort. Adjudications are
  // overlaid below before resolveReplayWinnerTruth decides stats eligibility.
  return getPrisma().gameStats.findMany({
    where: { is_final: true },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { id: "desc" }],
    select: {
      id: true,
      is_final: true,
      userUid: true,
      replay_file: true,
      original_filename: true,
      replayHash: true,
      game_type: true,
      game_version: true,
      map: true,
      winner: true,
      players: true,
      event_types: true,
      key_events: true,
      parse_source: true,
      parse_reason: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      user: {
        select: { inGameName: true, steamPersonaName: true },
      },
    },
  });
}

async function buildPublicParserObservatory() {
  const prisma = getPrisma();
  const [
    rawRows,
    allGameRows,
    artifacts,
    runStatus,
    parserVersions,
    fieldCoverage,
    observations,
    jobs,
    candidateFailures,
    latestArtifactRuns,
    effectiveProjectionReceipts,
    acceptedIdentitySnapshots,
    artifactStorageKeys,
    physicalArchive,
    identityFoundation,
  ] = await Promise.all([
    loadCorpusRows(),
    prisma.gameStats.count(),
    prisma.replayArtifact.aggregate({ _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.replayParseRun.groupBy({ by: ["status"], _count: { _all: true }, _sum: { actionCount: true } }),
    prisma.replayParseRun.groupBy({
      by: ["parserName", "parserVersion", "passName", "passVersion", "schemaVersion", "status"],
      _count: { _all: true },
      _max: { completedAt: true },
      orderBy: { _max: { completedAt: "desc" } },
      take: 16,
    }),
    prisma.replayObservation.groupBy({
      by: ["fieldPath"],
      _count: { _all: true, confidenceBps: true },
      _min: { confidenceBps: true },
      _max: { confidenceBps: true },
      orderBy: { _count: { fieldPath: "desc" } },
      take: 80,
    }),
    prisma.replayObservation.count(),
    prisma.replayReprocessJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        scopeKind: true,
        maxArtifacts: true,
        parserName: true,
        parserVersion: true,
        passName: true,
        passVersion: true,
        candidateOnly: true,
        affectsPublicAggregates: true,
        createdAt: true,
        events: {
          orderBy: { sequence: "desc" },
          take: 1,
          select: {
            eventType: true,
            processedCount: true,
            succeededCount: true,
            failedCount: true,
            skippedCount: true,
            detail: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.replayParseRun.groupBy({
      by: ["failureSignature"],
      where: { status: "failed" },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { failureSignature: "desc" } },
      take: 16,
    }),
    prisma.replayParseRun.findMany({
      distinct: ["artifactId"],
      orderBy: [{ artifactId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        artifactId: true,
        status: true,
        metrics: true,
        failureSignature: true,
        artifact: {
          select: {
            originalExtension: true,
            byteSize: true,
          },
        },
      },
    }),
    prisma.replayEvidenceArtifact.count({
      where: { evidenceKind: "effective_projection_receipt" },
    }),
    prisma.replayPlayerSnapshot.findMany({
      where: {
        projection: {
          projectionStatus: "accepted",
          affectsPublicAggregates: true,
          supersededBy: null,
        },
      },
      select: {
        displayName: true,
        normalizedName: true,
        steamId: true,
      },
    }),
    prisma.replayArtifact.findMany({
      select: {
        storageKey: true,
      },
    }),
    loadCachedPhysicalReplayArchiveSnapshot(),
    (async () => {
      const [
        provisionalWarriors,
        replayBackedPlatformAccounts,
        profileOnlyPlatformAccounts,
        openProvisionalIdentities,
        proposedPlatformLinks,
        activePlatformLinks,
        proposedClaims,
        activeClaims,
        publications,
      ] = await Promise.all([
        prisma.warrior.count({
          where: {
            status: "provisional",
            mergedIntoWarriorId: null,
          },
        }),
        prisma.platformAccount.count({
          where: {
            createdFrom:
              "replay_backfill_v2",
          },
        }),
        prisma.platformAccount.count({
          where: {
            createdFrom:
              "site_account_profile_v2",
          },
        }),
        prisma.provisionalIdentity.count({
          where: { status: "open" },
        }),
        prisma.warriorPlatformLink.count({
          where: { status: "proposed" },
        }),
        prisma.warriorPlatformLink.count({
          where: { status: "active" },
        }),
        prisma.warriorClaim.count({
          where: { status: "proposed" },
        }),
        prisma.warriorClaim.count({
          where: { status: "active" },
        }),
        prisma.identityProjectionPublication.count(),
      ]);

      return {
        provisionalWarriors,
        replayBackedPlatformAccounts,
        profileOnlyPlatformAccounts,
        openProvisionalIdentities,
        proposedPlatformLinks,
        activePlatformLinks,
        proposedClaims,
        activeClaims,
        publications,
      };
    })(),
  ]);

  const rows = applyReplayAdjudicationsToGameStatsRows(rawRows);
  const physicalArchivePaths =
    new Set(
      physicalArchive.files
    );
  const indexedArchivePaths =
    new Set(
      artifactStorageKeys
        .map((artifact) =>
          resolve(
            physicalArchive.root,
            artifact.storageKey
          )
        )
    );
  const indexedStorageKeysPresent =
    physicalArchive.available
      ? Array.from(
          indexedArchivePaths
        ).filter((path) =>
          physicalArchivePaths.has(
            path
          )
        ).length
      : null;
  const missingIndexedStorageKeys =
    physicalArchive.available
      ? Math.max(
          0,
          indexedArchivePaths.size -
            (indexedStorageKeysPresent ??
              0)
        )
      : null;
  const unindexedOrUnclassifiedObjects =
    physicalArchive.available
      ? Array.from(
          physicalArchivePaths
        ).filter(
          (path) =>
            !indexedArchivePaths.has(
              path
            )
        ).length
      : null;
  const unknownOwner = new Map<string, number>();
  const unknownRoster = new Map<string, number>();
  const unknownFormat = new Map<string, number>();
  const unknownReason = new Map<string, number>();
  const confidence = new Map<string, number>();
  const playerNames = new Set<string>();
  const latestUnknown: Array<{
    id: number;
    players: string[];
    owner: string;
    mapName: string;
    gameType: string;
    parseReason: string;
    neededEvidence: string[];
  }> = [];
  const recentDecodes: Array<{
    id: number;
    players: string[];
    mapName: string;
    winner: string | null;
    resultConfidence: string;
    teamsResolved: boolean;
    teamConfidence: string;
    teamProvenance: string;
    parseReason: string;
    playedAt: string | null;
  }> = [];
  let resolvedResults = 0;
  let resolvedTeams = 0;
  let unresolvedResults = 0;
  let unresolvedTeams = 0;
  let reviewRequired = 0;

  const recoveryLaneCounts = new Map<string, number>();
  const recoveryLaneMeta = new Map<string, { label: string; disposition: string }>();
  const failureExtensions = new Map<string, number>();
  const failureSizes = new Map<string, number>();
  const failedRuns = latestArtifactRuns.filter((run) => run.status === "failed");
  const completedRuns = latestArtifactRuns.filter((run) => run.status === "completed");
  const confirmedIrrecoverableArtifacts = latestArtifactRuns.filter((run) =>
    isExplicitlyIrrecoverableArtifact(run.metrics)
  ).length;
  const publicBattleRows = rows.filter(isPublicBattleArchiveRow);
  const publicBattleRecords = publicBattleRows.length;
  const logicalBattleRows = cleanPublicGameRows(
    publicBattleRows,
    {
      includeReview: true,
      includeLive: false,
    }
  );
  const uniqueLogicalBattles = logicalBattleRows.length;
  const excludedFinalRecords = Math.max(0, rows.length - publicBattleRecords);
  const normalizedNamesBySteamId = new Map<string, Set<string>>();
  const steamIdsByNormalizedName = new Map<string, Set<string>>();
  const nameOnlyIdentityBuckets = new Set<string>();
  let steamBackedIdentitySnapshots = 0;

  for (const snapshot of acceptedIdentitySnapshots) {
    const normalizedName = snapshot.normalizedName.trim().toLowerCase();
    const steamId = snapshot.steamId?.trim() ?? "";

    if (EXACT_STEAM_ID_64.test(steamId)) {
      steamBackedIdentitySnapshots += 1;

      const accountNames =
        normalizedNamesBySteamId.get(steamId) ??
        new Set<string>();

      if (normalizedName) {
        accountNames.add(normalizedName);
      }

      normalizedNamesBySteamId.set(
        steamId,
        accountNames
      );

      if (normalizedName) {
        const nameAccounts =
          steamIdsByNormalizedName.get(
            normalizedName
          ) ?? new Set<string>();

        nameAccounts.add(steamId);

        steamIdsByNormalizedName.set(
          normalizedName,
          nameAccounts
        );
      }

      continue;
    }

    if (normalizedName) {
      nameOnlyIdentityBuckets.add(
        normalizedName
      );
    }
  }

  const steamAccountsWithMultipleNames =
    Array.from(
      normalizedNamesBySteamId.values()
    ).filter((names) => names.size > 1)
      .length;

  const namesUsedByMultipleSteamAccounts =
    Array.from(
      steamIdsByNormalizedName.values()
    ).filter((steamIds) => steamIds.size > 1)
      .length;

  const candidateModes = new Map<string, number>();
  for (const run of completedRuns) {
    bump(candidateModes, text(record(run.metrics).parse_mode, "unspecified"));
  }
  const savedSnapshots = completedRuns.filter((run) =>
    text(record(run.metrics).parse_mode, "").startsWith("mgz_hd_saved_game_")
  ).length;
  for (const run of failedRuns) {
    const signature = run.failureSignature || "missing_signature";
    const extension = (run.artifact.originalExtension || "unknown").toLowerCase();
    const lane = failureRecoveryLane({ signature, extension });
    bump(recoveryLaneCounts, lane.key);
    recoveryLaneMeta.set(lane.key, { label: lane.label, disposition: lane.disposition });
    bump(failureExtensions, extension);
    bump(failureSizes, failureSizeBucket(run.artifact.byteSize));
  }

  for (const row of rows) {
    const players = parsePlayers(row.players);
    const names = players.map(displayPlayerName).filter(Boolean);
    names.forEach((name) => playerNames.add(name));
    const result = resultTruth(row);
    const teams = teamTruth(row);
    bump(confidence, result.confidence);
    if (result.statsEligible) resolvedResults += 1;
    else unresolvedResults += 1;
    if (teams.resolved) resolvedTeams += 1;
    else unresolvedTeams += 1;
    if (!result.statsEligible || !teams.resolved) reviewRequired += 1;

    if (recentDecodes.length < 16) {
      recentDecodes.push({
        id: row.id,
        players: names,
        mapName: readMapName(row.map),
        winner: result.winner,
        resultConfidence: result.confidence,
        teamsResolved: teams.resolved,
        teamConfidence: teams.confidence,
        teamProvenance: teams.provenance,
        parseReason: row.parse_reason,
        playedAt: (row.played_on || row.timestamp || row.createdAt)?.toISOString() ?? null,
      });
    }

    if (!result.statsEligible) {
      const owner = resolveReplayOwnerDisplay(row).ownerDisplayName || row.user?.inGameName || row.user?.steamPersonaName || "Owner not captured";
      bump(unknownOwner, owner);
      names.forEach((name) => bump(unknownRoster, name));
      bump(unknownFormat, text(row.game_type));
      bump(unknownReason, text(row.parse_reason, "unspecified"));
      if (latestUnknown.length < 24) {
        latestUnknown.push({
          id: row.id,
          players: names,
          owner,
          mapName: readMapName(row.map),
          gameType: text(row.game_type),
          parseReason: row.parse_reason,
          neededEvidence: result.neededEvidence,
        });
      }
    }
  }


  /*
   * Canonical public logical-battle grain.
   *
   * These counters answer the product question a visitor actually asks:
   * does one deduplicated public battle have a defensible result and a
   * complete display roster/team composition?
   *
   * They intentionally do NOT use the legacy key_events.team_resolution
   * counter as roster authority. Public roster truth is the same display
   * contract used by the repaired V2 roster lane.
   */
  let logicalResultResolved = 0;
  let logicalRosterComplete = 0;
  let logicalBattleTruthComplete = 0;
  let logicalNeedsResultOnly = 0;
  let logicalNeedsRosterOnly = 0;
  let logicalNeedsBoth = 0;

  for (const row of logicalBattleRows) {
    const result = publicReplayWinnerTruth(row);
    const roster = publicReplayRosterV2DisplayState(row.players);

    if (result.statsEligible) {
      logicalResultResolved += 1;
    }

    if (roster.complete) {
      logicalRosterComplete += 1;
    }

    if (result.statsEligible && roster.complete) {
      logicalBattleTruthComplete += 1;
    } else if (!result.statsEligible && roster.complete) {
      logicalNeedsResultOnly += 1;
    } else if (result.statsEligible && !roster.complete) {
      logicalNeedsRosterOnly += 1;
    } else {
      logicalNeedsBoth += 1;
    }
  }

  const logicalResultUnresolved =
    uniqueLogicalBattles - logicalResultResolved;
  const logicalRosterIncomplete =
    uniqueLogicalBattles - logicalRosterComplete;
  const logicalBattleTruthIncomplete =
    uniqueLogicalBattles - logicalBattleTruthComplete;

  const logicalResultCoverageBps = uniqueLogicalBattles
    ? Math.round((logicalResultResolved / uniqueLogicalBattles) * 10_000)
    : 0;
  const logicalRosterCoverageBps = uniqueLogicalBattles
    ? Math.round((logicalRosterComplete / uniqueLogicalBattles) * 10_000)
    : 0;
  const logicalBattleTruthCoverageBps = uniqueLogicalBattles
    ? Math.round((logicalBattleTruthComplete / uniqueLogicalBattles) * 10_000)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    corpus: {
      finalReplayRecords: rows.length,
      publicBattleRecords,
      uniqueLogicalBattles,
      duplicateBattleRecords:
        Math.max(
          0,
          publicBattleRecords -
            uniqueLogicalBattles
        ),
      logicalResultResolved,
      logicalResultUnresolved,
      logicalRosterComplete,
      logicalRosterIncomplete,
      logicalBattleTruthComplete,
      logicalBattleTruthIncomplete,
      logicalNeedsResultOnly,
      logicalNeedsRosterOnly,
      logicalNeedsBoth,
      logicalResultCoverageBps,
      logicalRosterCoverageBps,
      logicalBattleTruthCoverageBps,
      excludedFinalRecords,
      allDatabaseRows: allGameRows,
      archivedArtifacts: artifacts._count._all,
      archivedBytes: Number(artifacts._sum.byteSize || 0),
      physicalArchiveAvailable:
        physicalArchive.available,
      physicalArchiveScannedAt:
        physicalArchive.scannedAt,
      physicalArchiveObjects:
        physicalArchive.objectCount,
      physicalArchiveBytes:
        physicalArchive.byteSize,
      physicalRecordedObjects:
        physicalArchive.recordedObjectCount,
      physicalSavedCheckpointObjects:
        physicalArchive.savedCheckpointObjectCount,
      indexedStorageKeysPresent,
      missingIndexedStorageKeys,
      unindexedOrUnclassifiedObjects,
      observedDisplayNames: playerNames.size,
      playersRepresented: playerNames.size,
      acceptedIdentitySnapshots:
        acceptedIdentitySnapshots.length,
      steamBackedIdentitySnapshots,
      replayBackedSteamAccounts:
        normalizedNamesBySteamId.size,
      provisionalWarriors:
        identityFoundation.provisionalWarriors,
      replayBackedPlatformAccounts:
        identityFoundation.replayBackedPlatformAccounts,
      profileOnlyPlatformAccounts:
        identityFoundation.profileOnlyPlatformAccounts,
      openProvisionalIdentities:
        identityFoundation.openProvisionalIdentities,
      proposedPlatformLinks:
        identityFoundation.proposedPlatformLinks,
      activePlatformLinks:
        identityFoundation.activePlatformLinks,
      proposedWarriorClaims:
        identityFoundation.proposedClaims,
      activeWarriorClaims:
        identityFoundation.activeClaims,
      identityPublications:
        identityFoundation.publications,
      steamAccountsWithMultipleNames,
      nameOnlyIdentityBuckets:
        nameOnlyIdentityBuckets.size,
      namesUsedByMultipleSteamAccounts,
      parseableAtAnyLevelArtifacts:
        completedRuns.length,
      recoveryQueueArtifacts:
        Math.max(
          0,
          failedRuns.length -
            confirmedIrrecoverableArtifacts
        ),
      confirmedIrrecoverableArtifacts,
      resolvedResults,
      unresolvedResults,
      resolvedTeams,
      unresolvedTeams,
      reviewRequired,
      resultCoverageBps: rows.length ? Math.round((resolvedResults / rows.length) * 10_000) : 0,
      teamCoverageBps: rows.length ? Math.round((resolvedTeams / rows.length) * 10_000) : 0,
    },
    unknowns: {
      byOwner: ranked(unknownOwner),
      byRosterPlayer: ranked(unknownRoster),
      byGameType: ranked(unknownFormat),
      byReason: ranked(unknownReason),
      latest: latestUnknown,
    },
    confidence: ranked(confidence, 12),
    parser: {
      totalRuns: runStatus.reduce((sum, row) => sum + row._count._all, 0),
      totalActions: runStatus.reduce((sum, row) => sum + Number(row._sum.actionCount || 0), 0),
      observations,
      distinctFields: fieldCoverage.length,
      runStatus: runStatus.map((row) => ({ status: row.status, count: row._count._all })),
      versions: parserVersions.map((row) => ({
        parserName: row.parserName,
        parserVersion: row.parserVersion,
        passName: row.passName,
        passVersion: row.passVersion,
        schemaVersion: row.schemaVersion,
        status: row.status,
        count: row._count._all,
        latestAt: row._max.completedAt?.toISOString() ?? null,
      })),
      fields: fieldCoverage.map((row) => ({
        fieldPath: row.fieldPath,
        observations: row._count._all,
        scoredObservations: row._count.confidenceBps,
        minConfidenceBps: row._min.confidenceBps,
        maxConfidenceBps: row._max.confidenceBps,
      })),
      frontier: {
        artifacts: latestArtifactRuns.length,
        completed: completedRuns.length,
        failed: failedRuns.length,
        savedSnapshots,
        recordedGameCandidates: completedRuns.length - savedSnapshots,
        effectiveResultCorrections: effectiveProjectionReceipts,
        modes: ranked(candidateModes, 16).map((row) => ({
          key: row.key,
          count: row.count,
          label: candidateModeLabel(row.key),
        })),
      },
      advancedLanes: buildReplayEvidenceLanes(
        fieldCoverage.map((row) => ({
          fieldPath: row.fieldPath,
          observations: row._count._all,
          scoredObservations: row._count.confidenceBps,
        }))
      ),
      failures: candidateFailures.map((row) => ({
        signature: row.failureSignature || "missing_signature",
        count: row._count._all,
        latestAt: row._max.createdAt?.toISOString() ?? null,
      })),
      failureRecovery: {
        total: failedRuns.length,
        classified: failedRuns.length - (recoveryLaneCounts.get("manual_review") || 0),
        lanes: ranked(recoveryLaneCounts, 12).map((row) => ({
          key: row.key,
          count: row.count,
          label: recoveryLaneMeta.get(row.key)?.label || row.key,
          disposition: recoveryLaneMeta.get(row.key)?.disposition || "Operator review",
        })),
        extensions: ranked(failureExtensions, 12),
        sizes: ranked(failureSizes, 12),
      },
      jobs: jobs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        latestEvent: job.events[0]
          ? { ...job.events[0], createdAt: job.events[0].createdAt.toISOString() }
          : null,
        events: undefined,
      })),
    },
    recentDecodes,
  };
}

export const loadPublicParserObservatory = unstable_cache(
  buildPublicParserObservatory,
  ["public-parser-observatory-v2"],
  { revalidate: 300, tags: ["parser-observatory"] }
);

export async function loadViewerParserVault(uid: string | null) {
  if (!uid) return null;
  const rawRows = await getPrisma().gameStats.findMany({
    where: {
      is_final: true,
      OR: [
        { userUid: uid },
        { replayParseAttempts: { some: { userUid: uid } } },
      ],
    },
    select: {
      id: true,
      is_final: true,
      userUid: true,
      replay_file: true,
      original_filename: true,
      replayHash: true,
      game_type: true,
      game_version: true,
      map: true,
      winner: true,
      players: true,
      event_types: true,
      key_events: true,
      parse_source: true,
      parse_reason: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      user: { select: { inGameName: true, steamPersonaName: true } },
    },
  });
  const rows = applyReplayAdjudicationsToGameStatsRows(rawRows);
  const resolved = rows.filter((row) => resultTruth(row).statsEligible).length;
  const teamsResolved = rows.filter((row) => teamTruth(row).resolved).length;
  return {
    total: rows.length,
    resolved,
    unknown: rows.length - resolved,
    teamsResolved,
    resultCoverageBps: rows.length ? Math.round((resolved / rows.length) * 10_000) : 0,
  };
}

export type PublicParserObservatory = Awaited<ReturnType<typeof buildPublicParserObservatory>>;
