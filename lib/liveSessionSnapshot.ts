import path from "node:path";

import type { PrismaClient } from "@/lib/generated/prisma";
import type { ReplayReviewMarketSummary } from "@/lib/replayReviewQueue";
import {
  mergeReplayPlayerIterations,
  resolveReplayTeams,
  type CanonicalReplayPlayer,
  type ReplayTeamResolution,
} from "@/lib/teamResolution";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  resolveReliableReplayWinner,
  resolveReplayWinnerTruth,
  type UnresolvedWatcherResult,
} from "@/lib/unresolvedWatcherResult";
import {
  classifyReplaySessionDisposition,
  type ReplaySessionDisposition,
} from "@/lib/replaySessionDisposition";
import {
  shouldKeepFinalProofVisible,
} from "@/lib/liveFinalProofVisibility";
import {
  compareLiveSessionOrder,
  earliestLiveObservationMs,
  earliestLivePlayedOnMs,
} from "@/lib/liveSessionOrdering";

export type LiveGameSession = {
  id: number;
  sessionKey: string;
  /**
   * Exact earlier public session identities that this snapshot promoted into
   * `sessionKey`. These aliases come from the same replay/watcher/uploader
   * proof used by the grouping index; consumers must never infer extra aliases
   * from player names, map names, timestamps, or stream metadata.
   */
  identityAliases: string[];
  replayFile: string | null;
  replayHash: string;
  parseIteration: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  playedOn: string | null;
  mapName: string | null;
  durationSeconds: number | null;
  originalFilename: string | null;
  disconnectDetected: boolean;
  winner: string | null;
  bettingEligible: boolean;
  parseReason: string | null;
  parseSource: string | null;
  unresolvedResult: UnresolvedWatcherResult | null;
  state: "live" | "completed";
  finalProofPending: boolean;
  players: CanonicalReplayPlayer[];
  teamResolution: ReplayTeamResolution;
  uploaders: Array<{
    uid: string;
    displayName: string;
    parseRows: number;
    lastSeenAt: string;
  }>;
  watcherCount: number;
  watcherIds: string[];
  watcherSessionIds: string[];
  replayFingerprints: string[];
  watcherVersions: string[];
  parseRows: number;
  coverageLevel: "unknown" | "single" | "dual" | "stacked";
  disposition: ReplaySessionDisposition;
  uploader:
    | {
        uid: string;
        displayName: string;
      }
    | null;
  reviewMarket?: ReplayReviewMarketSummary | null;
};

const LIVE_SESSION_FRESHNESS_MS = 12 * 60 * 1000;
export const LIVE_SESSION_LINGER_MS = 15 * 60 * 1000;
export const LIVE_FINAL_PROOF_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
export const LIVE_IDENTITY_PROMOTION_WINDOW_MS = LIVE_SESSION_FRESHNESS_MS;
const SUPERSEDED_PARSE_REASON = "superseded_by_later_upload";
const UNPARSED_FINAL_PARSE_REASON = "watcher_final_unparsed";

type SessionRow = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  createdAt: Date;
  timestamp: Date | null;
  played_on: Date | null;
  map: unknown;
  game_duration: number | null;
  winner: string | null;
  players: unknown;
  event_types?: unknown;
  key_events?: unknown;
  disconnect_detected: boolean;
  parse_reason?: string | null;
  parse_source?: string | null;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
};

export function normalizeSessionKey(row: {
  original_filename?: string | null;
  replay_file?: string | null;
  key_events?: unknown;
}) {
  const keyEvents = readKeyEvents(row.key_events);
  const platformMatchId = normalizePublicReplayText(
    typeof keyEvents.platform_match_id === "string"
      ? keyEvents.platform_match_id
      : null
  );
  if (platformMatchId) {
    /* Match the public archive's trimmed, case-insensitive platform identity. */
    return `platform:${platformMatchId.toLowerCase()}`;
  }

  const rawName = row.original_filename?.trim() || path.basename(row.replay_file || "").trim();
  return rawName || row.replay_file || "";
}

function readKeyEvents(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function isCompletedLiveCompatRow(
  row: Pick<SessionRow, "parse_source" | "parse_reason" | "key_events" | "winner">
) {
  if (row.parse_source !== "watcher_live") {
    return false;
  }

  const keyEvents = readKeyEvents(row.key_events);
  const parseReason = String(row.parse_reason || "").toLowerCase();
  const completionSource =
    typeof keyEvents.completion_source === "string"
      ? keyEvents.completion_source.trim()
      : "";

  return (
    keyEvents.completed === true ||
    Boolean(completionSource) ||
    parseReason.includes("final") ||
    parseReason.includes("resignation") ||
    Boolean(
      resolveReliableReplayWinner({
        winner: row.winner,
        parseReason: row.parse_reason,
        keyEvents: row.key_events,
      })
    )
  );
}

function parseMapName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const name = "name" in value ? value.name : null;
  return normalizePublicReplayText(name);
}

function bestKnownPlayers(rows: SessionRow[], fallback: SessionRow) {
  return mergeLiveSessionPlayerIterations([
    fallback,
    ...rows
      .filter((row) => row.id !== fallback.id)
      .sort((left, right) => left.parse_iteration - right.parse_iteration),
  ]);
}

const METADATA_ONLY_RECOVERY_REASONS = new Set([
  "hd_metadata_fragment_only_recovery",
]);

export function mergeLiveSessionPlayerIterations(
  rows: Array<
    Pick<
      SessionRow,
      "parse_reason" | "players"
    >
  >
) {
  const substantiveRows = rows.filter(
    (row) =>
      !METADATA_ONLY_RECOVERY_REASONS.has(
        String(row.parse_reason ?? "")
          .trim()
          .toLowerCase()
      )
  );

  /*
   * The first HD watcher pass can recover only a metadata fragment. It is
   * useful until a real replay iteration arrives, but its partial roster/team
   * assignment must not poison every later coherent iteration for the full
   * live-session freshness window.
   */
  const mergeRows =
    substantiveRows.length > 0
      ? substantiveRows
      : rows;

  return mergeReplayPlayerIterations(
    mergeRows.map((row) => row.players)
  );
}

function bestKnownMapName(rows: SessionRow[], fallback: SessionRow) {
  for (const row of [fallback, ...rows]) {
    const mapName = parseMapName(row.map);
    if (mapName) return mapName;
  }
  return null;
}

function bestKnownDuration(rows: SessionRow[], fallback: SessionRow) {
  let duration: number | null = null;

  for (const row of [fallback, ...rows]) {
    if (
      typeof row.game_duration === "number" &&
      Number.isFinite(row.game_duration) &&
      row.game_duration > 0
    ) {
      duration = Math.max(duration ?? 0, row.game_duration);
    }
  }

  return duration;
}

function getRowActivityTime(row: Pick<SessionRow, "timestamp" | "createdAt">) {
  return row.timestamp ?? row.createdAt;
}

function collectUploaders(rows: SessionRow[]) {
  const uploaders = new Map<
    string,
    {
      uid: string;
      displayName: string;
      parseRows: number;
      lastSeenAt: Date;
    }
  >();

  for (const row of rows) {
    if (!row.user) continue;

    const activityTime = getRowActivityTime(row);
    const existing = uploaders.get(row.user.uid);
    if (!existing) {
      uploaders.set(row.user.uid, {
        uid: row.user.uid,
        displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
        parseRows: 1,
        lastSeenAt: activityTime,
      });
      continue;
    }

    existing.parseRows += 1;
    if (activityTime > existing.lastSeenAt) {
      existing.lastSeenAt = activityTime;
    }
  }

  return Array.from(uploaders.values())
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .map((uploader) => ({
      uid: uploader.uid,
      displayName: uploader.displayName,
      parseRows: uploader.parseRows,
      lastSeenAt: uploader.lastSeenAt.toISOString(),
    }));
}

export function readWatcherUploadMetadata(keyEventsValue: unknown) {
  const keyEvents = readKeyEvents(keyEventsValue);
  const rawUpload = keyEvents.watcher_upload;
  if (!rawUpload || typeof rawUpload !== "object" || Array.isArray(rawUpload)) {
    return null;
  }

  const upload = rawUpload as Record<string, unknown>;
  const read = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  return {
    watcherId: read(upload.watcher_id),
    watcherSessionId: read(upload.watcher_session_id),
    replayFingerprint: read(upload.replay_fingerprint),
    watcherVersion: read(upload.watcher_version),
  };
}

function normalizeGroupingComponent(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizedReplayBasename(row: {
  original_filename?: string | null;
  replay_file?: string | null;
}) {
  return normalizeGroupingComponent(
    row.original_filename || path.basename(row.replay_file || "")
  );
}

export function strongLiveReplayAlias(row: {
  original_filename?: string | null;
  replay_file?: string | null;
}) {
  const basename = normalizedReplayBasename(row);
  if (!basename) return "";

  const stem = basename.replace(/\.(aoe2record|aoe2mpgame|mgx2|mgz|zip)$/i, "");
  const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(stem);
  const hasLongHash = /(?:^|[^0-9a-f])[0-9a-f]{24,}(?:$|[^0-9a-f])/i.test(stem);
  const hasTimestamp = /(?:^|[^0-9])(?:19|20)\d{2}[^a-z0-9]?\d{2}[^a-z0-9]?\d{2}[^0-9]{0,8}\d{6}(?:[^0-9]|$)/i.test(stem);

  /*
   * A filename is a cross-watcher identity only when it carries enough
   * game-specific entropy to survive independent watcher processes. Generic
   * names such as "MP Replay.aoe2record" or "battle.mgx2" are deliberately
   * excluded; merging those globally would be worse than showing a duplicate.
   */
  return hasUuid || hasLongHash || hasTimestamp ? basename : "";
}

export function liveSessionRowGroupingKey(row: {
  id?: number | null;
  replayHash?: string | null;
  original_filename?: string | null;
  replay_file?: string | null;
  players?: unknown;
  map?: unknown;
  key_events?: unknown;
  user?: { uid?: string | null } | null;
}) {
  const canonicalKey = normalizeSessionKey(row);
  if (canonicalKey.toLowerCase().startsWith("platform:")) {
    return canonicalKey.toLowerCase();
  }

  const replayAlias = strongLiveReplayAlias(row);
  if (replayAlias) {
    return `replay:${replayAlias}`;
  }

  const weakReplayAlias = normalizedReplayBasename(row) || "unnamed-replay";
  const upload = readWatcherUploadMetadata(row.key_events);
  const watcherSession = normalizeGroupingComponent(upload?.watcherSessionId);
  const uploaderUid = normalizeGroupingComponent(row.user?.uid);

  if (watcherSession) {
    return [
      "legacy",
      encodeURIComponent(weakReplayAlias),
      "watcher",
      encodeURIComponent(watcherSession),
    ].join(":");
  }

  if (uploaderUid) {
    return [
      "legacy",
      encodeURIComponent(weakReplayAlias),
      "uploader",
      encodeURIComponent(uploaderUid),
    ].join(":");
  }

  /*
   * A generic filename alone is not a game identity. Keep an under-specified
   * observation isolated until platform, replay, watcher-session, or uploader
   * evidence exists so unrelated games cannot collapse.
   */
  const rowIdentity = Number.isSafeInteger(row.id) && Number(row.id) > 0
    ? `id:${row.id}`
    : `hash:${normalizeGroupingComponent(row.replayHash) || "unknown"}`;
  return `observation:${rowIdentity}`;
}

type LiveSessionGroupingRow = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  createdAt: Date;
  key_events?: unknown;
  user: { uid: string | null } | null;
};

type LiveSessionPromotionContext = {
  key: string;
  rank: 1 | 2 | 3;
};

function liveSessionPromotionContexts(
  row: LiveSessionGroupingRow
): LiveSessionPromotionContext[] {
  const contexts = new Map<string, LiveSessionPromotionContext>();
  const addContext = (context: LiveSessionPromotionContext) => {
    const existing = contexts.get(context.key);
    if (!existing || context.rank > existing.rank) {
      contexts.set(context.key, context);
    }
  };
  const strongReplay = strongLiveReplayAlias(row);
  if (strongReplay) {
    addContext({ key: `replay:${strongReplay}`, rank: 3 });
  }

  const replayAlias = normalizedReplayBasename(row) || "unnamed-replay";
  const upload = readWatcherUploadMetadata(row.key_events);
  const watcherSession = normalizeGroupingComponent(upload?.watcherSessionId);
  const uploaderUid = normalizeGroupingComponent(row.user?.uid);

  if (watcherSession) {
    addContext({
      key: [
        "legacy",
        encodeURIComponent(replayAlias),
        "watcher",
        encodeURIComponent(watcherSession),
      ].join(":"),
      rank: 2,
    });
  }

  if (uploaderUid) {
    /*
     * Keep uploader context even after watcher metadata appears so an early
     * uploader-scoped cohort can acquire its later exact platform ID. The
     * promotion selector below admits this weak bridge only for cohorts that
     * never had a stronger watcher/replay context of their own.
     */
    addContext({
      key: [
        "legacy",
        encodeURIComponent(replayAlias),
        "uploader",
        encodeURIComponent(uploaderUid),
      ].join(":"),
      rank: 1,
    });
  }

  return [...contexts.values()];
}

const LEGACY_BOUNDARY_WITHOUT_HASH_MS = 2 * 60 * 1000;

/**
 * Add an explicit per-battle epoch to weak legacy identities.
 *
 * Watcher session IDs are process identities, not game identities. A watcher
 * can run for days while the game repeatedly overwrites `MP Replay`. Modern
 * rows use platform IDs and never enter this path. For legacy rows, parse
 * iteration 1 plus a new replay hash is the durable reset marker; an extended
 * hash-less reset is isolated as well. The reset row ID is persisted DB truth,
 * so the key stays stable across refreshes and server restarts.
 */
export type LiveSessionGroupingProjection = {
  index: Map<number, string>;
  promotionAliasesBySessionKey: Map<string, string[]>;
};

export function buildLiveSessionGroupingProjection(
  rows: LiveSessionGroupingRow[],
  boundaryRowIds?: ReadonlySet<number>
): LiveSessionGroupingProjection {
  const uniqueRows = new Map<number, LiveSessionGroupingRow>();
  for (const row of rows) {
    uniqueRows.set(row.id, row);
  }

  const index = new Map<number, string>();
  const legacyRowsByBase = new Map<string, LiveSessionGroupingRow[]>();

  for (const row of uniqueRows.values()) {
    const baseKey = liveSessionRowGroupingKey(row);
    if (!baseKey.startsWith("legacy:")) {
      index.set(row.id, baseKey);
      continue;
    }

    const groupedRows = legacyRowsByBase.get(baseKey) ?? [];
    groupedRows.push(row);
    legacyRowsByBase.set(baseKey, groupedRows);
  }

  for (const [baseKey, groupedRows] of legacyRowsByBase.entries()) {
    const orderedRows = [...groupedRows].sort((left, right) => {
      const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();
      return timeDiff || left.id - right.id;
    });

    let epochAnchorId = orderedRows[0]?.id ?? 0;
    let epochLastSeenAt = orderedRows[0]?.createdAt.getTime() ?? 0;
    let epochRowCount = 0;
    const epochReplayHashes = new Set<string>();

    for (const row of orderedRows) {
      const replayHash = normalizeGroupingComponent(row.replayHash);
      const observedAt = row.createdAt.getTime();
      const isReset =
        row.parse_iteration === 1 &&
        (!boundaryRowIds || boundaryRowIds.has(row.id));
      const resetHasNewHash =
        isReset &&
        epochRowCount > 0 &&
        Boolean(replayHash) &&
        !epochReplayHashes.has(replayHash);
      const resetWithoutHashAfterGap =
        isReset &&
        epochRowCount > 0 &&
        !replayHash &&
        observedAt - epochLastSeenAt >= LEGACY_BOUNDARY_WITHOUT_HASH_MS;

      if (resetHasNewHash || resetWithoutHashAfterGap) {
        epochAnchorId = row.id;
        epochReplayHashes.clear();
        epochRowCount = 0;
      }

      index.set(row.id, `${baseKey}:battle:${epochAnchorId}`);
      if (replayHash) epochReplayHashes.add(replayHash);
      epochLastSeenAt = Math.max(epochLastSeenAt, observedAt);
      epochRowCount += 1;
    }
  }

  /*
   * A platform ID may appear only after several rolling observations. Bridge
   * an earlier fallback cohort to that exact identity using the strongest
   * available context: high-entropy replay name, watcher process, then
   * uploader. The per-context epoch selection is deliberately many-to-one at
   * the platform layer: Jim and Zodiac may each have an early generic cohort
   * that must converge on the same battle. Within one watcher context, only
   * the latest eligible battle epoch may receive a later platform identity.
   */
  const fallbackRowsByGroup = new Map<string, LiveSessionGroupingRow[]>();
  for (const row of uniqueRows.values()) {
    const groupingKey = index.get(row.id) ?? "";
    if (!groupingKey || groupingKey.startsWith("platform:")) continue;
    const groupedRows = fallbackRowsByGroup.get(groupingKey) ?? [];
    groupedRows.push(row);
    fallbackRowsByGroup.set(groupingKey, groupedRows);
  }

  type FallbackPromotionGroup = {
    fallbackKey: string;
    firstObservedAtMs: number;
    lastObservedAtMs: number;
    contextRanks: Map<string, LiveSessionPromotionContext["rank"]>;
  };
  const fallbackGroupsByContext = new Map<
    string,
    FallbackPromotionGroup[]
  >();

  for (const [fallbackKey, groupedRows] of fallbackRowsByGroup.entries()) {
    const observedAtValues = groupedRows.map((row) => row.createdAt.getTime());
    const contextRanks = new Map<
      string,
      LiveSessionPromotionContext["rank"]
    >();
    for (const row of groupedRows) {
      for (const context of liveSessionPromotionContexts(row)) {
        const currentRank = contextRanks.get(context.key) ?? 0;
        if (context.rank > currentRank) {
          contextRanks.set(context.key, context.rank);
        }
      }
    }

    const group: FallbackPromotionGroup = {
      fallbackKey,
      firstObservedAtMs: Math.min(...observedAtValues),
      lastObservedAtMs: Math.max(...observedAtValues),
      contextRanks,
    };
    for (const contextKey of contextRanks.keys()) {
      const groups = fallbackGroupsByContext.get(contextKey) ?? [];
      groups.push(group);
      fallbackGroupsByContext.set(contextKey, groups);
    }
  }

  const platformCandidatesByFallback = new Map<
    string,
    Map<LiveSessionPromotionContext["rank"], Set<string>>
  >();
  for (const row of uniqueRows.values()) {
    const platformKey = index.get(row.id) ?? "";
    if (!platformKey.startsWith("platform:")) continue;
    const observedAtMs = row.createdAt.getTime();

    for (const context of liveSessionPromotionContexts(row)) {
      const eligibleGroups = (fallbackGroupsByContext.get(context.key) ?? [])
        .filter(
          (group) =>
            group.firstObservedAtMs <= observedAtMs &&
            observedAtMs - group.lastObservedAtMs <=
              LIVE_IDENTITY_PROMOTION_WINDOW_MS &&
            (
              context.rank > 1 ||
              ![...group.contextRanks.values()].some((rank) => rank > 1)
            )
        )
        .sort(
          (left, right) =>
            right.firstObservedAtMs - left.firstObservedAtMs ||
            right.lastObservedAtMs - left.lastObservedAtMs ||
            left.fallbackKey.localeCompare(right.fallbackKey)
        );
      const selectedGroup = eligibleGroups[0];
      if (!selectedGroup) continue;

      /* Equal epoch bounds are ambiguous; do not choose by an arbitrary key. */
      const runnerUp = eligibleGroups[1];
      if (
        runnerUp &&
        runnerUp.firstObservedAtMs === selectedGroup.firstObservedAtMs &&
        runnerUp.lastObservedAtMs === selectedGroup.lastObservedAtMs
      ) {
        continue;
      }

      const effectiveRank = Math.min(
        context.rank,
        selectedGroup.contextRanks.get(context.key) ?? context.rank
      ) as LiveSessionPromotionContext["rank"];
      const candidatesByRank =
        platformCandidatesByFallback.get(selectedGroup.fallbackKey) ?? new Map();
      const candidates = candidatesByRank.get(effectiveRank) ?? new Set<string>();
      candidates.add(platformKey);
      candidatesByRank.set(effectiveRank, candidates);
      platformCandidatesByFallback.set(
        selectedGroup.fallbackKey,
        candidatesByRank
      );
    }
  }

  const proposedPlatformByFallback = new Map<string, string>();
  for (const [fallbackKey, candidatesByRank] of platformCandidatesByFallback.entries()) {
    const strongestRank = [...candidatesByRank.keys()].sort((left, right) => right - left)[0];
    const candidates = strongestRank
      ? candidatesByRank.get(strongestRank) ?? new Set<string>()
      : new Set<string>();
    if (candidates.size === 1) {
      proposedPlatformByFallback.set(fallbackKey, [...candidates][0]);
    }
  }

  const promotionAliasesBySessionKey = new Map<string, string[]>();
  for (const [fallbackKey, platformKey] of proposedPlatformByFallback.entries()) {
    const representativeRow = fallbackRowsByGroup.get(fallbackKey)?.[0];
    if (!representativeRow) continue;
    const publicAlias = publicSessionKeyForGroup(fallbackKey, representativeRow);
    if (!publicAlias || publicAlias === platformKey) continue;
    const aliases = promotionAliasesBySessionKey.get(platformKey) ?? [];
    aliases.push(publicAlias);
    promotionAliasesBySessionKey.set(platformKey, aliases);
  }

  for (const [platformKey, aliases] of promotionAliasesBySessionKey.entries()) {
    promotionAliasesBySessionKey.set(
      platformKey,
      [...new Set(aliases)].sort((left, right) => left.localeCompare(right))
    );
  }

  for (const row of uniqueRows.values()) {
    const fallbackKey = index.get(row.id) ?? "";
    const platformKey = proposedPlatformByFallback.get(fallbackKey);
    if (platformKey) {
      index.set(row.id, platformKey);
    }
  }

  return {
    index,
    promotionAliasesBySessionKey,
  };
}

export function buildLiveSessionGroupingIndex(
  rows: LiveSessionGroupingRow[],
  boundaryRowIds?: ReadonlySet<number>
) {
  return buildLiveSessionGroupingProjection(rows, boundaryRowIds).index;
}

function publicSessionKeyForGroup(
  groupingKey: string,
  row: Pick<
    SessionRow,
    "original_filename" | "replay_file" | "key_events"
  >
) {
  if (groupingKey.startsWith("platform:")) return groupingKey;
  if (groupingKey.startsWith("replay:")) return normalizeSessionKey(row);
  return groupingKey;
}

function collectWatcherCoverage(rows: SessionRow[]) {
  const watcherIds = new Set<string>();
  const watcherSessionIds = new Set<string>();
  const replayFingerprints = new Set<string>();
  const watcherVersions = new Set<string>();

  for (const row of rows) {
    const upload = readWatcherUploadMetadata(row.key_events);
    if (!upload) continue;
    const add = (target: Set<string>, value: unknown) => {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (normalized) target.add(normalized);
    };

    add(watcherIds, upload.watcherId);
    add(watcherSessionIds, upload.watcherSessionId);
    add(replayFingerprints, upload.replayFingerprint);
    add(watcherVersions, upload.watcherVersion);
  }

  return {
    watcherIds: [...watcherIds].sort(),
    watcherSessionIds: [...watcherSessionIds].sort(),
    replayFingerprints: [...replayFingerprints].sort(),
    watcherVersions: [...watcherVersions].sort(),
  };
}

function coverageLevel(watcherCount: number): LiveGameSession["coverageLevel"] {
  if (watcherCount >= 3) return "stacked";
  if (watcherCount === 2) return "dual";
  if (watcherCount === 1) return "single";
  return "unknown";
}

function buildSessionFromRow(
  row: SessionRow,
  sessionKey: string,
  state: LiveGameSession["state"],
  sourceRows: SessionRow[] = [row],
  options: {
    finalProofPending?: boolean;
    identityAliases?: readonly string[];
  } = {}
): LiveGameSession {
  const activityTime = getRowActivityTime(row);
  const observedAtMs = earliestLiveObservationMs(sourceRows, row.createdAt);
  const playedOnMs = earliestLivePlayedOnMs(sourceRows, row.played_on);
  const durationSeconds = bestKnownDuration(sourceRows, row);
  const durationDerivedStartMs =
    durationSeconds && durationSeconds > 0
      ? activityTime.getTime() - durationSeconds * 1000
      : 0;
  const stableStartedAtMs =
    durationDerivedStartMs > 0
      ? Math.min(observedAtMs || durationDerivedStartMs, durationDerivedStartMs)
      : observedAtMs;
  const finalEvidence = state === "completed" || options.finalProofPending === true;
  const uploaders = collectUploaders(sourceRows);
  const watcherCoverage = collectWatcherCoverage(sourceRows);
  const watcherCount = Math.max(watcherCoverage.watcherIds.length, uploaders.length);
  const primaryUploader = uploaders[0] ?? null;
  const mergedPlayers = bestKnownPlayers(sourceRows, row);
  const parsedPlayers = mergedPlayers.players;
  const teamResolution = resolveReplayTeams(parsedPlayers, {
    final: finalEvidence,
    conflictReasonCodes: mergedPlayers.conflictReasonCodes,
  });
  const mapName = bestKnownMapName(sourceRows, row);
  const winnerTruth = resolveReplayWinnerTruth({
    winner: row.winner,
    players: parsedPlayers,
    parseReason: row.parse_reason,
    parseSource: row.parse_source,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
    isFinal: finalEvidence,
    disconnectDetected:
      row.disconnect_detected,
  });
  const winner = winnerTruth.winner;
  const hasExplicitWinnerFlags = parsedPlayers.some((player) => player.winner !== null);
  const players = winnerTruth.statsEligible
    ? parsedPlayers.map((player) => ({
        ...player,
        winner:
          hasExplicitWinnerFlags || teamResolution.format !== "1v1"
            ? player.winner
            : winner
              ? player.normalizedName === winner.toLowerCase()
              : player.winner,
      }))
    : parsedPlayers.map((player) => ({ ...player, winner: null }));
  const unresolvedResult = classifyUnresolvedWatcherResult({
    winner: row.winner,
    players: parsedPlayers,
    mapName,
    state: finalEvidence ? "completed" : "live",
    parseReason: row.parse_reason,
    parseSource: row.parse_source,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
    isFinal: finalEvidence,
    disconnectDetected:
      row.disconnect_detected,
    watcherCount,
  });
  const disposition = classifyReplaySessionDisposition({
    state: finalEvidence ? "completed" : "live",
    winner,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
  });
  return {
    id: row.id,
    sessionKey,
    identityAliases: [...new Set(options.identityAliases ?? [])].filter(
      (alias) => alias && alias !== sessionKey
    ),
    replayFile: row.replay_file ?? null,
    replayHash: row.replayHash,
    parseIteration: row.parse_iteration,
    createdAt: new Date(stableStartedAtMs || row.createdAt.getTime()).toISOString(),
    updatedAt: activityTime.toISOString(),
    completedAt: finalEvidence ? activityTime.toISOString() : null,
    playedOn: playedOnMs > 0 ? new Date(playedOnMs).toISOString() : null,
    mapName,
    durationSeconds,
    originalFilename: row.original_filename ?? null,
    disconnectDetected: row.disconnect_detected,
    winner,
    bettingEligible: winnerTruth.bettingEligible,
    parseReason: row.parse_reason ?? null,
    parseSource: row.parse_source ?? null,
    unresolvedResult,
    state,
    finalProofPending: options.finalProofPending === true,
    players,
    teamResolution,
    uploaders,
    watcherCount,
    watcherIds: watcherCoverage.watcherIds,
    watcherSessionIds: watcherCoverage.watcherSessionIds,
    replayFingerprints: watcherCoverage.replayFingerprints,
    watcherVersions: watcherCoverage.watcherVersions,
    parseRows: sourceRows.length,
    coverageLevel: coverageLevel(watcherCount),
    disposition,
    uploader: primaryUploader
      ? {
          uid: primaryUploader.uid,
          displayName: primaryUploader.displayName,
        }
      : row.user
      ? {
          uid: row.user.uid,
          displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
        }
      : null,
  };
}

export async function loadLiveSessionSnapshot(prisma: PrismaClient): Promise<{
  activeSessions: LiveGameSession[];
  recentlyCompletedSessions: LiveGameSession[];
}> {
  const freshnessCutoff = new Date(Date.now() - LIVE_SESSION_FRESHNESS_MS);
  const lingerCutoff = Date.now() - LIVE_SESSION_LINGER_MS;
  const completedCompatCutoff = new Date(lingerCutoff);
  const finalProofCutoff = new Date(Date.now() - LIVE_FINAL_PROOF_LOOKBACK_MS);

  const [activeRows, finalRows, completedLiveRows, legacyBoundaryRows] = await Promise.all([
    prisma.gameStats.findMany({
      where: {
        is_final: false,
        parse_iteration: {
          gt: 0,
        },
        OR: [
          {
            timestamp: {
              gte: freshnessCutoff,
            },
          },
          {
            createdAt: {
              gte: freshnessCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.gameStats.findMany({
      where: {
        is_final: true,
        OR: [
          {
            timestamp: {
              gte: finalProofCutoff,
            },
          },
          {
            createdAt: {
              gte: finalProofCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      /*
       * This query is bounded by LIVE_FINAL_PROOF_LOOKBACK_MS, not a raw-row
       * cap. A row cap lets a burst of rolling observations from a handful of
       * games crowd final proof for every other concurrent game out of view.
       */
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),

    prisma.gameStats.findMany({
      where: {
        is_final: false,
        parse_source: "watcher_live",
        parse_iteration: {
          gt: 0,
        },
        AND: [
          {
            OR: [
              {
                timestamp: {
                  gte: completedCompatCutoff,
                },
              },
              {
                createdAt: {
                  gte: completedCompatCutoff,
                },
              },
            ],
          },
          {
            /*
             * Keep rolling heartbeat rows out of this compatibility lane at
             * the database boundary. This OR is deliberately a superset of
             * isCompletedLiveCompatRow: JavaScript still performs the strict
             * truth check, while Postgres returns only plausible completion
             * evidence instead of every watcher pulse in the lookback.
             */
            OR: [
              {
                winner: {
                  not: null,
                },
              },
              {
                parse_reason: {
                  contains: "final",
                  mode: "insensitive",
                },
              },
              {
                parse_reason: {
                  contains: "resignation",
                  mode: "insensitive",
                },
              },
              {
                key_events: {
                  path: ["completed"],
                  equals: true,
                },
              },
              {
                key_events: {
                  path: ["completion_source"],
                  string_starts_with: "",
                },
              },
              {
                key_events: {
                  path: ["result_resolution", "result_status"],
                  string_starts_with: "",
                },
              },
            ],
          },
        ],
        NOT: {
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      /* UI-compatibility proof is both DB-filtered and presentation-bounded. */
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.gameStats.findMany({
      where: {
        is_final: false,
        parse_source: "watcher_live",
        parse_iteration: 1,
        OR: [
          {
            timestamp: {
              gte: finalProofCutoff,
            },
          },
          {
            createdAt: {
              gte: finalProofCutoff,
            },
          },
        ],
        NOT: [
          {
            parse_reason: {
              in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      /*
       * One reset row per battle is compact boundary evidence. Exact platform
       * rows remain platform-scoped and are harmless here; admitting them lets
       * JavaScript apply the same placeholder-ID normalization as the public
       * archive before deciding whether a row is a legacy reset.
       */
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        winner: true,
        parse_reason: true,
        parse_source: true,
        key_events: true,
        user: {
          select: {
            uid: true,
          },
        },
      },
    }),
  ]);

  const completedRows: SessionRow[] = [
    ...finalRows.map((row) => row as SessionRow),
    ...(completedLiveRows ?? [])
      .filter(isCompletedLiveCompatRow)
      .map((row) => row as SessionRow),
  ];
  const legacyBoundaryRowIds = new Set(
    legacyBoundaryRows
      .filter(
        (row) =>
          !isCompletedLiveCompatRow({
            parse_source: row.parse_source,
            parse_reason: row.parse_reason,
            key_events: row.key_events,
            winner: row.winner,
          })
      )
      .map((row) => row.id)
  );

  const groupingProjection = buildLiveSessionGroupingProjection(
    [
      ...activeRows,
      ...completedRows,
      ...legacyBoundaryRows,
    ],
    legacyBoundaryRowIds
  );
  const groupingIndex = groupingProjection.index;
  const groupingKeyFor = (row: SessionRow) =>
    groupingIndex.get(row.id) ?? liveSessionRowGroupingKey(row);
  const identityAliasesFor = (groupingKey: string) =>
    groupingProjection.promotionAliasesBySessionKey.get(groupingKey) ?? [];

  const latestLiveBySession = new Map<string, (typeof activeRows)[number]>();
  const liveRowsBySession = new Map<string, (typeof activeRows)>();
  for (const row of activeRows) {
    const groupingKey = groupingKeyFor(row as SessionRow);
    const rows = liveRowsBySession.get(groupingKey) ?? [];
    rows.push(row);
    liveRowsBySession.set(groupingKey, rows);

    const existing = latestLiveBySession.get(groupingKey);
    if (
      !existing ||
      getRowActivityTime(row).getTime() > getRowActivityTime(existing).getTime() ||
      (
        getRowActivityTime(row).getTime() === getRowActivityTime(existing).getTime() &&
        row.parse_iteration > existing.parse_iteration
      )
    ) {
      latestLiveBySession.set(groupingKey, row);
    }
  }

  const latestFinalBySession = new Map<string, SessionRow>();
  const finalRowsBySession = new Map<string, SessionRow[]>();
  for (const row of completedRows) {
    const groupingKey = groupingKeyFor(row);
    const rows = finalRowsBySession.get(groupingKey) ?? [];
    rows.push(row);
    finalRowsBySession.set(groupingKey, rows);

    const existing = latestFinalBySession.get(groupingKey);
    if (
      !existing ||
      getRowActivityTime(row).getTime() > getRowActivityTime(existing).getTime() ||
      (
        getRowActivityTime(row).getTime() === getRowActivityTime(existing).getTime() &&
        row.parse_iteration > existing.parse_iteration
      )
    ) {
      latestFinalBySession.set(groupingKey, row);
    }
  }

  const activeSessions: LiveGameSession[] = [];
  const recentlyCompletedSessions: LiveGameSession[] = [];

  for (const [groupingKey, row] of latestLiveBySession.entries()) {
    const sessionKey = publicSessionKeyForGroup(groupingKey, row as SessionRow);
    const finalRow = latestFinalBySession.get(groupingKey);
    const liveActivityAt = getRowActivityTime(row).getTime();

    if (finalRow) {
      const finalActivityAt = getRowActivityTime(finalRow).getTime();
      if (finalActivityAt >= liveActivityAt) {
        const finalSourceRows = finalRowsBySession.get(groupingKey) ?? [finalRow];
        const combinedSourceRows = [
          ...(liveRowsBySession.get(groupingKey) ?? [row]),
          ...finalSourceRows,
        ];
        const completedSession = buildSessionFromRow(
          finalRow,
          sessionKey,
          "completed",
          combinedSourceRows,
          {
            identityAliases: identityAliasesFor(groupingKey),
          }
        );
        const watcherFinal = String(finalRow.parse_source ?? "")
          .trim()
          .toLowerCase()
          .startsWith("watcher_final");
        const keepFinalProofVisible =
          watcherFinal &&
          shouldKeepFinalProofVisible({
            liveActivityAtMs: liveActivityAt,
            finalActivityAtMs: finalActivityAt,
            finalDisposition: completedSession.disposition,
          });

        if (keepFinalProofVisible) {
          activeSessions.push(
            buildSessionFromRow(
              finalRow,
              sessionKey,
              "live",
              combinedSourceRows,
              {
                finalProofPending: true,
                identityAliases: identityAliasesFor(groupingKey),
              }
            )
          );
        } else if (finalActivityAt >= lingerCutoff) {
          recentlyCompletedSessions.push(completedSession);
        }
        continue;
      }
    }

    activeSessions.push(
      buildSessionFromRow(
        row,
        sessionKey,
        "live",
        liveRowsBySession.get(groupingKey) ?? [row],
        {
          identityAliases: identityAliasesFor(groupingKey),
        }
      )
    );
  }

  for (const [groupingKey, row] of latestFinalBySession.entries()) {
    if (latestLiveBySession.has(groupingKey)) {
      continue;
    }
    if (getRowActivityTime(row).getTime() < lingerCutoff) {
      continue;
    }
    const sessionKey = publicSessionKeyForGroup(groupingKey, row);
    recentlyCompletedSessions.push(
      buildSessionFromRow(
        row,
        sessionKey,
        "completed",
        finalRowsBySession.get(groupingKey) ?? [row],
        {
          identityAliases: identityAliasesFor(groupingKey),
        }
      )
    );
  }

  activeSessions.sort(compareLiveSessionOrder);

  recentlyCompletedSessions.sort((left, right) => {
    const activityDiff =
      new Date(right.completedAt || right.createdAt).getTime() -
      new Date(left.completedAt || left.createdAt).getTime();
    if (activityDiff !== 0) return activityDiff;
    return left.sessionKey.localeCompare(right.sessionKey);
  });

  return {
    activeSessions,
    recentlyCompletedSessions,
  };
}
