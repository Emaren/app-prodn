import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import {
  replayEngineSha256,
  stableReplayEngineJson,
  type ReplayEngineJson,
} from "./replayEngineRoom.ts";
import {
  normalizeReplayPlayers,
  type CanonicalReplayPlayer,
} from "./teamResolution.ts";

export const REPLAY_STATS_SCHEMA_VERSION = "replay-stats/v1";
export const REPLAY_METRIC_DICTIONARY_VERSION = "aoe2hd/2026-07-25.1";
export const REPLAY_STAT_PROJECTION_POLICY_VERSION = "exact-stats/v1";
export const REPLAY_PLAYER_AGGREGATE_VERSION = "career/v1";
export const REPLAY_STATS_APPEND_ONLY_TABLES = [
  "replay_stat_projections",
  "replay_player_snapshots",
  "replay_player_metrics",
  "replay_game_metrics",
  "replay_player_metric_aggregates",
] as const;

export type ReplayMetricValueType = "number" | "text" | "boolean";
export type ReplayMetricResultDependency = "none" | "resolved_only";
export type ReplayMetricAggregationMethod =
  | "sum"
  | "average"
  | "maximum"
  | "minimum"
  | "latest";
export type ReplayStatProjectionStatus = "candidate" | "accepted";
export type ReplayStatEligibility = "eligible" | "partial" | "ineligible";
export type ReplayResultEligibility =
  | "resolved"
  | "unresolved"
  | "not_applicable";
export type ReplayPlayerResultStatus =
  | "win"
  | "loss"
  | "unresolved"
  | "not_applicable";

export type ReplayMetricDefinition = {
  key: string;
  group: string;
  unit: string;
  valueType: ReplayMetricValueType;
  aggregationMethod: ReplayMetricAggregationMethod;
  resultDependency: ReplayMetricResultDependency;
  bestDirection: "maximum" | "minimum";
  sourcePaths: readonly string[];
};

function metric(
  key: string,
  group: string,
  unit: string,
  aggregationMethod: ReplayMetricAggregationMethod,
  sourcePaths: readonly string[],
  options: Partial<
    Pick<
      ReplayMetricDefinition,
      "valueType" | "resultDependency" | "bestDirection"
    >
  > = {}
): ReplayMetricDefinition {
  return {
    key,
    group,
    unit,
    aggregationMethod,
    sourcePaths,
    valueType: options.valueType ?? "number",
    resultDependency: options.resultDependency ?? "none",
    bestDirection: options.bestDirection ?? "maximum",
  };
}

const PLAYER_METRIC_DEFINITIONS: readonly ReplayMetricDefinition[] = [
  metric("score.total", "score", "score", "average", ["player.postgame.score"]),
  metric("military.score", "military", "score", "average", [
    "player.postgame.military.score",
  ]),
  metric("military.units_killed", "military", "count", "sum", [
    "player.postgame.military.units_killed",
  ]),
  metric("military.hit_points_killed", "military", "hit_points", "sum", [
    "player.postgame.military.hit_points_killed",
  ]),
  metric("military.units_lost", "military", "count", "sum", [
    "player.postgame.military.units_lost",
  ]),
  metric("military.buildings_razed", "military", "count", "sum", [
    "player.postgame.military.buildings_razed",
  ]),
  metric("military.hit_points_razed", "military", "hit_points", "sum", [
    "player.postgame.military.hit_points_razed",
  ]),
  metric("military.buildings_lost", "military", "count", "sum", [
    "player.postgame.military.buildings_lost",
  ]),
  metric("military.units_converted", "military", "count", "sum", [
    "player.postgame.military.units_converted",
  ]),
  metric("economy.score", "economy", "score", "average", [
    "player.postgame.economy.score",
  ]),
  metric("economy.food_collected", "economy", "resources", "sum", [
    "player.postgame.economy.food_collected",
  ]),
  metric("economy.wood_collected", "economy", "resources", "sum", [
    "player.postgame.economy.wood_collected",
  ]),
  metric("economy.stone_collected", "economy", "resources", "sum", [
    "player.postgame.economy.stone_collected",
  ]),
  metric("economy.gold_collected", "economy", "resources", "sum", [
    "player.postgame.economy.gold_collected",
  ]),
  metric("economy.tribute_sent", "economy", "resources", "sum", [
    "player.postgame.economy.tribute_sent",
  ]),
  metric("economy.tribute_received", "economy", "resources", "sum", [
    "player.postgame.economy.tribute_received",
  ]),
  metric("economy.trade_gold", "economy", "resources", "sum", [
    "player.postgame.economy.trade_gold",
  ]),
  metric("economy.relic_gold", "economy", "resources", "sum", [
    "player.postgame.economy.relic_gold",
  ]),
  metric("technology.score", "technology", "score", "average", [
    "player.postgame.technology.score",
  ]),
  metric(
    "technology.feudal_time",
    "technology",
    "seconds",
    "average",
    ["player.postgame.technology.feudal_time"],
    { bestDirection: "minimum" }
  ),
  metric(
    "technology.castle_time",
    "technology",
    "seconds",
    "average",
    ["player.postgame.technology.castle_time"],
    { bestDirection: "minimum" }
  ),
  metric(
    "technology.imperial_time",
    "technology",
    "seconds",
    "average",
    ["player.postgame.technology.imperial_time"],
    { bestDirection: "minimum" }
  ),
  metric("technology.explored_percent", "technology", "percent", "average", [
    "player.postgame.technology.explored_percent",
  ]),
  metric("technology.research_count", "technology", "count", "sum", [
    "player.postgame.technology.research_count",
  ]),
  metric(
    "technology.research_percent",
    "technology",
    "percent",
    "average",
    ["player.postgame.technology.research_percent"]
  ),
  metric("society.score", "society", "score", "average", [
    "player.postgame.society.score",
  ]),
  metric("society.total_wonders", "society", "count", "sum", [
    "player.postgame.society.total_wonders",
  ]),
  metric("society.total_castles", "society", "count", "sum", [
    "player.postgame.society.total_castles",
  ]),
  metric("society.total_relics", "society", "count", "sum", [
    "player.postgame.society.total_relics",
  ]),
  metric("society.villager_high", "society", "count", "maximum", [
    "player.postgame.society.villager_high",
  ]),
  metric("actions.recorded_packet_count", "actions", "packets", "sum", [
    "player.actions.recorded_packet_count",
  ]),
  metric(
    "actions.first_recorded_command_ms",
    "actions",
    "milliseconds",
    "average",
    ["player.actions.first_recorded_command_ms"],
    { bestDirection: "minimum" }
  ),
  metric(
    "actions.last_recorded_command_ms",
    "actions",
    "milliseconds",
    "average",
    ["player.actions.last_recorded_command_ms"]
  ),
  metric(
    "actions.active_recorded_minute_count",
    "actions",
    "minutes",
    "sum",
    ["player.actions.active_recorded_minute_count"]
  ),
  metric(
    "actions.peak_recorded_packets_in_minute",
    "actions",
    "packets",
    "maximum",
    ["player.actions.peak_recorded_packets_in_minute"]
  ),
  metric(
    "actions.largest_recorded_command_gap_ms",
    "actions",
    "milliseconds",
    "average",
    ["player.actions.largest_recorded_command_gap_ms"],
    { bestDirection: "minimum" }
  ),
  metric(
    "actions.age_up_research_command_count",
    "actions",
    "count",
    "sum",
    ["player.actions.age_up_research_command_count"]
  ),
  metric("actions.market_command_count", "actions", "count", "sum", [
    "player.actions.market_command_count",
  ]),
  metric("actions.tribute_command_count", "actions", "count", "sum", [
    "player.actions.tribute_command_count",
  ]),
] as const;

const GAME_METRIC_DEFINITIONS: readonly ReplayMetricDefinition[] = [
  metric("game.duration_seconds", "game", "seconds", "average", [
    "game.duration_seconds",
  ]),
  metric("actions.raw_count", "actions", "packets", "sum", [
    "actions.raw_count",
  ]),
  metric(
    "actions.unique_packet_identity_count",
    "actions",
    "packets",
    "sum",
    ["actions.unique_packet_identity_count"]
  ),
  metric(
    "actions.exact_duplicate_packet_excess",
    "actions",
    "packets",
    "sum",
    ["actions.exact_duplicate_packet_excess"]
  ),
  metric("chat.message_count", "chat", "count", "sum", [
    "chat.message_count",
  ]),
  metric("map.tile_count", "map", "tiles", "average", ["map.tile_count"]),
] as const;

export const REPLAY_PLAYER_METRIC_DICTIONARY = Object.freeze(
  Object.fromEntries(
    PLAYER_METRIC_DEFINITIONS.map((definition) => [
      definition.key,
      definition,
    ])
  ) as Record<string, ReplayMetricDefinition>
);

export const REPLAY_GAME_METRIC_DICTIONARY = Object.freeze(
  Object.fromEntries(
    GAME_METRIC_DEFINITIONS.map((definition) => [
      definition.key,
      definition,
    ])
  ) as Record<string, ReplayMetricDefinition>
);

const PLAYER_SOURCE_PATHS = new Map(
  PLAYER_METRIC_DEFINITIONS.flatMap((definition) =>
    definition.sourcePaths.map((path) => [path, definition] as const)
  )
);
const GAME_SOURCE_PATHS = new Map(
  GAME_METRIC_DEFINITIONS.flatMap((definition) =>
    definition.sourcePaths.map((path) => [path, definition] as const)
  )
);

const EXPERIMENTAL_OR_DIAGNOSTIC_FIELDS = new Set([
  "player.recorded_eapm",
  "player.actions.recorded_packet_rate_per_minute",
  "player.actions.first_resignation_ms",
  "actions.identity_normalized_activity_by_player",
]);

const DYNAMIC_ACTION_COUNT_FIELDS = new Map([
  [
    "player.actions.recorded_type_counts",
    "actions.recorded_type_count",
  ],
  [
    "player.actions.recorded_command_family_counts",
    "actions.recorded_command_family_count",
  ],
]);

const RAW_ACTIVITY_FIELDS: ReadonlyArray<{
  source: string;
  metricKey: string;
}> = [
  { source: "action_packet_count", metricKey: "actions.recorded_packet_count" },
  {
    source: "first_action_ms",
    metricKey: "actions.first_recorded_command_ms",
  },
  {
    source: "last_action_ms",
    metricKey: "actions.last_recorded_command_ms",
  },
  {
    source: "active_minute_count",
    metricKey: "actions.active_recorded_minute_count",
  },
  {
    source: "peak_actions_in_one_minute",
    metricKey: "actions.peak_recorded_packets_in_minute",
  },
  {
    source: "largest_recorded_action_gap_ms",
    metricKey: "actions.largest_recorded_command_gap_ms",
  },
];

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return record(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is UnknownRecord =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    );
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return records(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function cleanText(value: unknown, maximum: number) {
  const cleaned =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return cleaned && cleaned.length <= maximum ? cleaned : null;
}

function requiredText(value: unknown, field: string, maximum: number) {
  const cleaned = cleanText(value, maximum);
  if (!cleaned) {
    throw new ReplayNormalizedStatsError(
      `invalid_${field}`,
      `${field} is required and must be ${maximum} characters or fewer.`
    );
  }
  return cleaned;
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function confidence(value: unknown) {
  const parsed = integer(value);
  return parsed !== null && parsed >= 0 && parsed <= 10_000 ? parsed : null;
}

function materialValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "boolean") return true;
  return Array.isArray(value) || typeof value === "object";
}

function numericText(value: unknown): string | null {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function metricKeySegment(value: unknown) {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .toLocaleLowerCase("en-US")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
      : "";
  return normalized.slice(0, 80);
}

export function replayPlayerMetricDefinition(metricKey: string) {
  const known = REPLAY_PLAYER_METRIC_DICTIONARY[metricKey];
  if (known) return known;
  if (
    metricKey.startsWith("actions.recorded_type_count.") ||
    metricKey.startsWith("actions.recorded_command_family_count.")
  ) {
    return metric(metricKey, "actions", "count", "sum", []);
  }
  return null;
}

function sha256Text(value: unknown, field: string) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new ReplayNormalizedStatsError(
      `invalid_${field}`,
      `${field} must be a lowercase SHA-256 digest.`
    );
  }
  return normalized;
}

function optionalJsonObject(value: unknown): ReplayEngineJson {
  const normalized = stableReplayEngineJson(value ?? {});
  if (
    !normalized ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    throw new ReplayNormalizedStatsError(
      "invalid_provenance",
      "Replay statistics provenance must be a JSON object."
    );
  }
  return normalized;
}

function resultEligibility(value: unknown): ReplayResultEligibility {
  return value === "resolved" ||
    value === "unresolved" ||
    value === "not_applicable"
    ? value
    : "unresolved";
}

function statEligibility(value: unknown): ReplayStatEligibility {
  return value === "eligible" || value === "partial" || value === "ineligible"
    ? value
    : "eligible";
}

function projectionStatus(value: unknown): ReplayStatProjectionStatus {
  return value === "accepted" ? "accepted" : "candidate";
}

export class ReplayNormalizedStatsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReplayNormalizedStatsError";
    this.code = code;
  }
}

export type ReplayMetricObservationInput = {
  id?: unknown;
  parseRunId?: unknown;
  field?: unknown;
  fieldPath?: unknown;
  value?: unknown;
  confidenceBps?: unknown;
  confidence_bps?: unknown;
  provenance?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

type MaterialObservation = {
  id: number | null;
  parseRunId: number | null;
  fieldPath: string;
  value: unknown;
  exact: boolean;
  confidenceBps: number | null;
  subject: UnknownRecord;
  evidenceSource: string | null;
  provenanceClass: string | null;
  provenance: ReplayEngineJson;
  createdAtMs: number;
};

function observationRank(observation: MaterialObservation) {
  return [
    observation.parseRunId ?? -1,
    observation.createdAtMs,
    observation.id ?? -1,
  ] as const;
}

function laterObservation(
  left: MaterialObservation,
  right: MaterialObservation
) {
  const leftRank = observationRank(left);
  const rightRank = observationRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) {
      return rightRank[index] > leftRank[index] ? right : left;
    }
  }
  return right;
}

function materialObservation(
  input: ReplayMetricObservationInput
): MaterialObservation | null {
  const fieldPath = cleanText(input.fieldPath ?? input.field, 255);
  if (!fieldPath || !materialValue(input.value)) return null;
  const provenanceRecord = record(input.provenance);
  const subject = record(provenanceRecord.subject);
  const exact = provenanceRecord.exact === true;
  const evidenceSource = cleanText(provenanceRecord.evidence_source, 255);
  const provenanceClass = cleanText(provenanceRecord.class, 64);
  const createdAtValue = input.createdAt ?? input.created_at;
  const createdAtMs =
    createdAtValue instanceof Date
      ? createdAtValue.getTime()
      : typeof createdAtValue === "string"
        ? Date.parse(createdAtValue)
        : 0;

  return {
    id: integer(input.id),
    parseRunId: integer(input.parseRunId),
    fieldPath,
    value: input.value,
    exact,
    confidenceBps: confidence(input.confidenceBps ?? input.confidence_bps),
    subject,
    evidenceSource,
    provenanceClass,
    provenance: optionalJsonObject(input.provenance),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
  };
}

function observationSubjectKey(observation: MaterialObservation) {
  return replayEngineSha256({
    fieldPath: observation.fieldPath,
    subject: observation.subject,
  });
}

export function selectLatestMaterialReplayObservations(
  input: readonly ReplayMetricObservationInput[]
) {
  const latest = new Map<string, MaterialObservation>();
  for (const raw of input) {
    const observation = materialObservation(raw);
    if (!observation) continue;
    const key = observationSubjectKey(observation);
    const existing = latest.get(key);
    latest.set(
      key,
      existing ? laterObservation(existing, observation) : observation
    );
  }
  return [...latest.values()].sort((left, right) =>
    observationSubjectKey(left).localeCompare(observationSubjectKey(right))
  );
}

export type NormalizedReplayMetric = {
  idempotencyKey: string;
  metricKey: string;
  metricGroup: string;
  valueType: ReplayMetricValueType;
  numericValue: string | null;
  textValue: string | null;
  booleanValue: boolean | null;
  unit: string;
  aggregationMethod: ReplayMetricAggregationMethod;
  resultDependency: ReplayMetricResultDependency;
  statEligible: boolean;
  exact: boolean;
  confidenceBps: number | null;
  sourceKind: string;
  sourcePath: string;
  provenance: ReplayEngineJson;
};

export type NormalizedReplayPlayerSnapshot = {
  idempotencyKey: string;
  userId: number | null;
  playerKey: string;
  displayName: string;
  normalizedName: string;
  steamId: string | null;
  playerSlot: number | null;
  teamKey: string | null;
  civilizationId: number | null;
  civilizationName: string | null;
  statEligible: boolean;
  resultEligible: boolean;
  resultStatus: ReplayPlayerResultStatus;
  eligibilityReason: ReplayEngineJson | null;
  exact: boolean;
  confidenceBps: number | null;
  provenance: ReplayEngineJson;
  metrics: NormalizedReplayMetric[];
};

export type NormalizedReplayGameMetric = Omit<
  NormalizedReplayMetric,
  "resultDependency"
>;

export type ReplayNormalizedStatProjection = {
  receipt: {
    gameStatsId: number;
    parseRunId: number | null;
    supersedesId: number | null;
    projectedByUserId: number | null;
    projectedByUidSnapshot: string | null;
    idempotencyKey: string;
    projectionIdentityHash: string;
    inputHash: string;
    projectionHash: string;
    sourceKind: string;
    sourceIdentity: string;
    sourceHash: string;
    parserName: string | null;
    parserVersion: string | null;
    passName: string | null;
    passVersion: string | null;
    schemaVersion: string;
    metricDictionaryVersion: string;
    projectionPolicyVersion: string;
    projectionStatus: ReplayStatProjectionStatus;
    statEligibility: ReplayStatEligibility;
    statEligibilityReason: string | null;
    resultEligibility: ReplayResultEligibility;
    resultEligibilityReason: string | null;
    playerCount: number;
    playerMetricCount: number;
    gameMetricCount: number;
    provenance: ReplayEngineJson;
    affectsPublicAggregates: boolean;
    affectsResults: false;
    affectsBets: false;
    settlementAuthority: false;
  };
  players: NormalizedReplayPlayerSnapshot[];
  gameMetrics: NormalizedReplayGameMetric[];
};

type MetricCandidate = Omit<NormalizedReplayMetric, "idempotencyKey"> & {
  definition: ReplayMetricDefinition;
  sourceRank: number;
};

function typedMetricValue(
  definition: ReplayMetricDefinition,
  value: unknown
): Pick<
  NormalizedReplayMetric,
  "numericValue" | "textValue" | "booleanValue"
> | null {
  if (definition.valueType === "number") {
    const numericValue = numericText(value);
    return numericValue === null
      ? null
      : { numericValue, textValue: null, booleanValue: null };
  }
  if (definition.valueType === "boolean") {
    return typeof value === "boolean"
      ? { numericValue: null, textValue: null, booleanValue: value }
      : null;
  }
  const textValue = cleanText(value, 500);
  return textValue
    ? { numericValue: null, textValue, booleanValue: null }
    : null;
}

function candidateMetric(input: {
  definition: ReplayMetricDefinition;
  value: unknown;
  exact: boolean;
  confidenceBps: number | null;
  sourceKind: string;
  sourcePath: string;
  provenance: ReplayEngineJson;
  sourceRank: number;
  statEligible?: boolean;
}): MetricCandidate | null {
  const typed = typedMetricValue(input.definition, input.value);
  if (!typed) return null;
  return {
    definition: input.definition,
    metricKey: input.definition.key,
    metricGroup: input.definition.group,
    valueType: input.definition.valueType,
    ...typed,
    unit: input.definition.unit,
    aggregationMethod: input.definition.aggregationMethod,
    resultDependency: input.definition.resultDependency,
    statEligible: input.statEligible ?? input.exact,
    exact: input.exact,
    confidenceBps: input.confidenceBps,
    sourceKind: input.sourceKind,
    sourcePath: input.sourcePath,
    provenance: input.provenance,
    sourceRank: input.sourceRank,
  };
}

function setMetricCandidate(
  target: Map<string, MetricCandidate>,
  candidate: MetricCandidate | null
) {
  if (!candidate) return;
  const existing = target.get(candidate.metricKey);
  if (
    !existing ||
    candidate.sourceRank > existing.sourceRank ||
    (candidate.sourceRank === existing.sourceRank &&
      candidate.exact &&
      !existing.exact)
  ) {
    target.set(candidate.metricKey, candidate);
  }
}

function playerByObservationSubject(
  observation: MaterialObservation,
  players: CanonicalReplayPlayer[]
) {
  const playerKey = cleanText(
    observation.subject.player_key ?? observation.subject.playerKey,
    160
  );
  if (playerKey) {
    const player = players.find((entry) => entry.stablePlayerKey === playerKey);
    if (player) return player;
  }
  const playerNumber = integer(
    observation.subject.player_number ?? observation.subject.playerNumber
  );
  if (playerNumber !== null) {
    const player = players.find(
      (entry) => entry.playerNumber === playerNumber
    );
    if (player) return player;
  }
  const playerName = cleanText(
    observation.subject.player_name ?? observation.subject.playerName,
    100
  )?.toLocaleLowerCase("en-US");
  return playerName
    ? players.find((entry) => entry.normalizedName === playerName) ?? null
    : null;
}

function rawActivityPlayer(
  row: UnknownRecord,
  players: CanonicalReplayPlayer[]
) {
  const playerNumber = integer(row.player_number ?? row.playerNumber);
  if (playerNumber !== null) {
    const player = players.find(
      (entry) => entry.playerNumber === playerNumber
    );
    if (player) return player;
  }
  const playerName = cleanText(row.player_name ?? row.playerName, 100);
  const normalized = playerName?.toLocaleLowerCase("en-US");
  return normalized
    ? players.find((entry) => entry.normalizedName === normalized) ?? null
    : null;
}

function achievementValue(achievements: unknown, metricKey: string) {
  let current: unknown = achievements;
  for (const part of metricKey.split(".")) {
    current = record(current)[part];
  }
  return current;
}

function gameStatsFallbackPlayerMetrics(
  player: CanonicalReplayPlayer,
  postgameScoreAvailable: boolean
) {
  const target = new Map<string, MetricCandidate>();
  if (!postgameScoreAvailable) return target;
  const provenance = optionalJsonObject({
    source: "game_stats.players",
    exact: true,
  });
  for (const definition of PLAYER_METRIC_DEFINITIONS) {
    if (definition.key.startsWith("actions.")) continue;
    const value =
      definition.key === "score.total"
        ? postgameScoreAvailable
          ? player.totalScore
          : null
        : achievementValue(player.achievements, definition.key);
    setMetricCandidate(
      target,
      candidateMetric({
        definition,
        value,
        exact: true,
        confidenceBps: 10_000,
        sourceKind: "game_stats",
        sourcePath:
          definition.key === "score.total"
            ? "players[].score"
            : `players[].achievements.${definition.key}`,
        provenance,
        sourceRank: 10,
      })
    );
  }
  return target;
}

function projectionMetric(
  candidate: MetricCandidate,
  identity: unknown
): NormalizedReplayMetric {
  const { definition, sourceRank, ...metricValue } =
    candidate;
  void definition;
  void sourceRank;
  return {
    ...metricValue,
    idempotencyKey: `replay-metric:${replayEngineSha256({
      identity,
      metricKey: candidate.metricKey,
      valueType: candidate.valueType,
      numericValue: candidate.numericValue,
      textValue: candidate.textValue,
      booleanValue: candidate.booleanValue,
      exact: candidate.exact,
      sourcePath: candidate.sourcePath,
    })}`,
  };
}

function gameProjectionMetric(
  candidate: MetricCandidate,
  identity: unknown
): NormalizedReplayGameMetric {
  const { resultDependency, ...metricValue } =
    projectionMetric(candidate, identity);
  void resultDependency;
  return metricValue;
}

export function buildReplayNormalizedStatProjection(input: {
  gameStatsId: unknown;
  replayHash: unknown;
  parseRunId?: unknown;
  supersedesId?: unknown;
  projectedByUserId?: unknown;
  projectedByUidSnapshot?: unknown;
  sourceKind?: unknown;
  sourceIdentity: unknown;
  sourceHash?: unknown;
  parserName?: unknown;
  parserVersion?: unknown;
  passName?: unknown;
  passVersion?: unknown;
  schemaVersion?: unknown;
  metricDictionaryVersion?: unknown;
  projectionPolicyVersion?: unknown;
  projectionStatus?: unknown;
  affectsPublicAggregates?: unknown;
  statEligibility?: unknown;
  statEligibilityReason?: unknown;
  resultEligibility?: unknown;
  resultEligibilityReason?: unknown;
  winningPlayerKeys?: unknown;
  players: unknown;
  keyEvents?: unknown;
  durationSeconds?: unknown;
  observations?: readonly ReplayMetricObservationInput[];
  userIdByPlayerKey?: Readonly<Record<string, number | null>>;
  statEligiblePlayerKeys?: readonly string[];
  allowInexactMetrics?: boolean;
  provenance?: unknown;
}): ReplayNormalizedStatProjection {
  const gameStatsId = integer(input.gameStatsId);
  if (gameStatsId === null || gameStatsId < 1) {
    throw new ReplayNormalizedStatsError(
      "invalid_game_stats_id",
      "gameStatsId must be a positive integer."
    );
  }
  const replayHash = sha256Text(input.replayHash, "replay_hash");
  const sourceHash = sha256Text(
    input.sourceHash ?? replayHash,
    "source_hash"
  );
  const parseRunId = integer(input.parseRunId);
  const supersedesId = integer(input.supersedesId);
  const projectedByUserId = integer(input.projectedByUserId);
  const projectedByUidSnapshot = cleanText(
    input.projectedByUidSnapshot,
    100
  );
  const sourceKind =
    cleanText(input.sourceKind, 32) ?? (parseRunId ? "parse_run" : "game_stats");
  const sourceIdentity = requiredText(
    input.sourceIdentity,
    "source_identity",
    160
  );
  const schemaVersion =
    cleanText(input.schemaVersion, 64) ?? REPLAY_STATS_SCHEMA_VERSION;
  const metricDictionaryVersion =
    cleanText(input.metricDictionaryVersion, 64) ??
    REPLAY_METRIC_DICTIONARY_VERSION;
  const projectionPolicyVersion =
    cleanText(input.projectionPolicyVersion, 64) ??
    REPLAY_STAT_PROJECTION_POLICY_VERSION;
  const status = projectionStatus(input.projectionStatus);
  const affectsPublicAggregates =
    input.affectsPublicAggregates === true && status === "accepted";
  if (
    input.affectsPublicAggregates === true &&
    status !== "accepted"
  ) {
    throw new ReplayNormalizedStatsError(
      "candidate_cannot_be_public",
      "A candidate replay stat projection cannot affect public aggregates."
    );
  }
  if (affectsPublicAggregates && !projectedByUidSnapshot) {
    throw new ReplayNormalizedStatsError(
      "public_projection_actor_required",
      "An accepted public replay stat projection requires an actor UID snapshot."
    );
  }
  const overallStatEligibility = statEligibility(input.statEligibility);
  const overallResultEligibility = resultEligibility(input.resultEligibility);
  const players = normalizeReplayPlayers(input.players);
  if (players.length === 0) {
    throw new ReplayNormalizedStatsError(
      "empty_roster",
      "At least one canonical replay player is required."
    );
  }
  if (
    new Set(players.map((player) => player.stablePlayerKey)).size !==
    players.length
  ) {
    throw new ReplayNormalizedStatsError(
      "ambiguous_roster",
      "Replay statistics require unique canonical player keys."
    );
  }

  const winningPlayerKeys = new Set(
    Array.isArray(input.winningPlayerKeys)
      ? input.winningPlayerKeys
          .map((value) => cleanText(value, 160))
          .filter((value): value is string => Boolean(value))
      : []
  );
  if (
    overallResultEligibility === "resolved" &&
    (winningPlayerKeys.size === 0 ||
      [...winningPlayerKeys].some(
        (key) => !players.some((player) => player.stablePlayerKey === key)
      ))
  ) {
    throw new ReplayNormalizedStatsError(
      "invalid_resolved_result",
      "A resolved result requires at least one canonical winning player key."
    );
  }

  const statEligiblePlayerKeys = input.statEligiblePlayerKeys
    ? new Set(input.statEligiblePlayerKeys)
    : null;
  const keyEvents = record(input.keyEvents);
  const hasObservationSource =
    parseRunId !== null && parseRunId > 0;
  const postgameScoreAvailable =
    !hasObservationSource &&
    keyEvents.postgame_available === true;
  const metricsByPlayer = new Map(
    players.map((player) => [
      player.stablePlayerKey,
      gameStatsFallbackPlayerMetrics(player, postgameScoreAvailable),
    ])
  );
  const gameMetricCandidates = new Map<string, MetricCandidate>();
  const durationSeconds = numericText(input.durationSeconds);
  if (durationSeconds !== null && Number(durationSeconds) > 0) {
    const definition = REPLAY_GAME_METRIC_DICTIONARY["game.duration_seconds"];
    setMetricCandidate(
      gameMetricCandidates,
      candidateMetric({
        definition,
        value: durationSeconds,
        exact: true,
        confidenceBps: 10_000,
        sourceKind: "game_stats",
        sourcePath: "duration",
        provenance: optionalJsonObject({
          source: "game_stats.duration",
          exact: true,
        }),
        sourceRank: 10,
      })
    );
  }

  const materialObservations = selectLatestMaterialReplayObservations(
    input.observations ?? []
  );
  for (const observation of materialObservations) {
    if (EXPERIMENTAL_OR_DIAGNOSTIC_FIELDS.has(observation.fieldPath)) {
      continue;
    }
    if (observation.provenanceClass === "inferred_review_only") continue;
    if (
      observation.evidenceSource
        ?.toLocaleLowerCase("en-US")
        .includes("experimental_exact_packet_identity_normalization")
    ) {
      continue;
    }

    if (
      observation.fieldPath === "actions.raw_activity_by_player" ||
      observation.fieldPath ===
        "actions.identity_normalized_activity_by_player"
    ) {
      const isRaw =
        observation.fieldPath === "actions.raw_activity_by_player";
      for (const activity of records(observation.value)) {
        const player = rawActivityPlayer(activity, players);
        if (!player) continue;
        const target = metricsByPlayer.get(player.stablePlayerKey);
        if (!target) continue;
        for (const mapping of RAW_ACTIVITY_FIELDS) {
          const definition = REPLAY_PLAYER_METRIC_DICTIONARY[mapping.metricKey];
          setMetricCandidate(
            target,
            candidateMetric({
              definition,
              value: activity[mapping.source],
              exact: isRaw,
              confidenceBps: isRaw ? 10_000 : null,
              sourceKind: isRaw
                ? "exact_observation"
                : "experimental_observation",
              sourcePath: `${observation.fieldPath}[].${mapping.source}`,
              provenance: optionalJsonObject({
                ...record(observation.provenance),
                decomposed_from_activity_summary: true,
                exact_component_policy:
                  "raw_packet_counts_and_timestamps_only",
              }),
              sourceRank: isRaw ? 20 : 5,
              statEligible: isRaw,
            })
          );
        }
      }
      continue;
    }

    const playerDefinition = PLAYER_SOURCE_PATHS.get(observation.fieldPath);
    if (playerDefinition) {
      const player = playerByObservationSubject(observation, players);
      if (!player) continue;
      const exact = observation.exact;
      if (!exact && !input.allowInexactMetrics) continue;
      const target = metricsByPlayer.get(player.stablePlayerKey);
      if (!target) continue;
      setMetricCandidate(
        target,
        candidateMetric({
          definition: playerDefinition,
          value: observation.value,
          exact,
          confidenceBps: observation.confidenceBps,
          sourceKind: "replay_observation",
          sourcePath: observation.fieldPath,
          provenance: observation.provenance,
          sourceRank: exact ? 30 : 15,
          statEligible: exact,
        })
      );
      continue;
    }

    const dynamicPrefix = DYNAMIC_ACTION_COUNT_FIELDS.get(
      observation.fieldPath
    );
    if (dynamicPrefix && observation.exact) {
      const player = playerByObservationSubject(observation, players);
      if (!player) continue;
      const target = metricsByPlayer.get(player.stablePlayerKey);
      if (!target) continue;
      for (const [rawKey, value] of Object.entries(
        record(observation.value)
      )) {
        const segment = metricKeySegment(rawKey);
        if (!segment) continue;
        const definition = metric(
          `${dynamicPrefix}.${segment}`,
          "actions",
          "count",
          "sum",
          [observation.fieldPath]
        );
        setMetricCandidate(
          target,
          candidateMetric({
            definition,
            value,
            exact: true,
            confidenceBps: observation.confidenceBps,
            sourceKind: "replay_observation",
            sourcePath: `${observation.fieldPath}.${rawKey}`,
            provenance: observation.provenance,
            sourceRank: 30,
            statEligible: true,
          })
        );
      }
      continue;
    }

    const gameDefinition = GAME_SOURCE_PATHS.get(observation.fieldPath);
    if (gameDefinition) {
      const exact = observation.exact;
      if (!exact && !input.allowInexactMetrics) continue;
      setMetricCandidate(
        gameMetricCandidates,
        candidateMetric({
          definition: gameDefinition,
          value: observation.value,
          exact,
          confidenceBps: observation.confidenceBps,
          sourceKind: "replay_observation",
          sourcePath: observation.fieldPath,
          provenance: observation.provenance,
          sourceRank: exact ? 30 : 15,
          statEligible: exact,
        })
      );
    }
  }

  const statEligibilityReason = cleanText(
    input.statEligibilityReason,
    160
  );
  const resultEligibilityReason = cleanText(
    input.resultEligibilityReason,
    160
  );
  const projectionProvenance = optionalJsonObject(input.provenance);
  const canonicalPlayers = [...players]
    .sort((left, right) =>
      left.stablePlayerKey.localeCompare(right.stablePlayerKey)
    )
    .map((player) => ({
      ...player,
      aliases: [...player.aliases].sort(),
      userId:
        input.userIdByPlayerKey?.[player.stablePlayerKey] ?? null,
    }));
  const projectionInput = {
    gameStatsId,
    replayHash,
    parseRunId,
    sourceKind,
    sourceIdentity,
    sourceHash,
    parserName: cleanText(input.parserName, 64),
    parserVersion: cleanText(input.parserVersion, 64),
    passName: cleanText(input.passName, 64),
    passVersion: cleanText(input.passVersion, 64),
    schemaVersion,
    metricDictionaryVersion,
    projectionPolicyVersion,
    projectionStatus: status,
    affectsPublicAggregates,
    statEligibility: overallStatEligibility,
    statEligibilityReason,
    resultEligibility: overallResultEligibility,
    resultEligibilityReason,
    winningPlayerKeys: [...winningPlayerKeys].sort(),
    statEligiblePlayerKeys: statEligiblePlayerKeys
      ? [...statEligiblePlayerKeys].sort()
      : null,
    allowInexactMetrics: input.allowInexactMetrics === true,
    durationSeconds,
    keyEvents,
    players: canonicalPlayers,
    observations: materialObservations.map((observation) => ({
      fieldPath: observation.fieldPath,
      value: observation.value,
      exact: observation.exact,
      confidenceBps: observation.confidenceBps,
      subject: observation.subject,
      provenance: observation.provenance,
    })),
    provenance: projectionProvenance,
  };
  const inputHash = replayEngineSha256(projectionInput);
  const projectionIdentityHash = replayEngineSha256({
    gameStatsId,
    sourceIdentity,
    sourceHash,
    schemaVersion,
    metricDictionaryVersion,
    projectionPolicyVersion,
    inputHash,
  });

  const normalizedPlayers = players
    .map((player) => {
      const playerStatEligible =
        overallStatEligibility !== "ineligible" &&
        (!statEligiblePlayerKeys ||
          statEligiblePlayerKeys.has(player.stablePlayerKey));
      const playerResultEligible =
        overallResultEligibility === "resolved";
      const resultStatus: ReplayPlayerResultStatus =
        overallResultEligibility === "resolved"
          ? winningPlayerKeys.has(player.stablePlayerKey)
            ? "win"
            : "loss"
          : overallResultEligibility === "not_applicable"
            ? "not_applicable"
            : "unresolved";
      const identity = {
        projectionIdentityHash,
        playerKey: player.stablePlayerKey,
      };
      const playerMetrics = [
        ...(metricsByPlayer.get(player.stablePlayerKey)?.values() ?? []),
      ]
        .filter(
          (candidate) =>
            playerStatEligible &&
            (candidate.exact || input.allowInexactMetrics === true)
        )
        .map((candidate) => ({
          ...projectionMetric(candidate, identity),
          statEligible:
            playerStatEligible &&
            candidate.statEligible &&
            (candidate.resultDependency === "none" ||
              playerResultEligible),
        }))
        .sort((left, right) => left.metricKey.localeCompare(right.metricKey));
      const snapshotProvenance = optionalJsonObject({
        source_kind: sourceKind,
        source_identity: sourceIdentity,
        replay_hash: replayHash,
        parser_version: cleanText(input.parserVersion, 64),
      });
      return {
        idempotencyKey: `replay-player:${replayEngineSha256(identity)}`,
        userId:
          input.userIdByPlayerKey?.[player.stablePlayerKey] ?? null,
        playerKey: player.stablePlayerKey,
        displayName: player.name,
        normalizedName: player.normalizedName,
        steamId: player.steamId,
        playerSlot: player.playerNumber,
        teamKey: player.teamId,
        civilizationId: player.civilizationId,
        civilizationName: player.civilizationName,
        statEligible: playerStatEligible,
        resultEligible: playerResultEligible,
        resultStatus,
        eligibilityReason: optionalJsonObject({
          stat: playerStatEligible
            ? overallStatEligibility
            : "player_ineligible",
          result: overallResultEligibility,
        }),
        exact: true,
        confidenceBps: 10_000,
        provenance: snapshotProvenance,
        metrics: playerMetrics,
      } satisfies NormalizedReplayPlayerSnapshot;
    })
    .sort((left, right) => left.playerKey.localeCompare(right.playerKey));

  const gameMetrics = [...gameMetricCandidates.values()]
    .filter(
      (candidate) =>
        overallStatEligibility !== "ineligible" &&
        (candidate.exact || input.allowInexactMetrics === true)
    )
    .map((candidate) =>
      gameProjectionMetric(candidate, {
        projectionIdentityHash,
        gameStatsId,
      })
    )
    .sort((left, right) => left.metricKey.localeCompare(right.metricKey));

  const projectionHash = replayEngineSha256({
    projectionIdentityHash,
    players: normalizedPlayers,
    gameMetrics,
  });
  const playerMetricCount = normalizedPlayers.reduce(
    (total, player) => total + player.metrics.length,
    0
  );

  return {
    receipt: {
      gameStatsId,
      parseRunId: parseRunId && parseRunId > 0 ? parseRunId : null,
      supersedesId:
        supersedesId && supersedesId > 0 ? supersedesId : null,
      projectedByUserId:
        projectedByUserId && projectedByUserId > 0
          ? projectedByUserId
          : null,
      projectedByUidSnapshot,
      idempotencyKey: `replay-stats:${projectionIdentityHash}`,
      projectionIdentityHash,
      inputHash,
      projectionHash,
      sourceKind,
      sourceIdentity,
      sourceHash,
      parserName: cleanText(input.parserName, 64),
      parserVersion: cleanText(input.parserVersion, 64),
      passName: cleanText(input.passName, 64),
      passVersion: cleanText(input.passVersion, 64),
      schemaVersion,
      metricDictionaryVersion,
      projectionPolicyVersion,
      projectionStatus: status,
      statEligibility: overallStatEligibility,
      statEligibilityReason,
      resultEligibility: overallResultEligibility,
      resultEligibilityReason,
      playerCount: normalizedPlayers.length,
      playerMetricCount,
      gameMetricCount: gameMetrics.length,
      provenance: projectionProvenance,
      affectsPublicAggregates,
      affectsResults: false,
      affectsBets: false,
      settlementAuthority: false,
    },
    players: normalizedPlayers,
    gameMetrics,
  };
}

function jsonInput(value: ReplayEngineJson): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function verifyExistingProjection(
  prisma: PrismaClient,
  projection: ReplayNormalizedStatProjection
) {
  const existing = await prisma.replayStatProjection.findUnique({
    where: { idempotencyKey: projection.receipt.idempotencyKey },
    select: {
      id: true,
      projectionHash: true,
      playerCount: true,
      playerMetricCount: true,
      gameMetricCount: true,
    },
  });
  if (!existing) return null;
  if (
    existing.projectionHash !== projection.receipt.projectionHash ||
    existing.playerCount !== projection.receipt.playerCount ||
    existing.playerMetricCount !== projection.receipt.playerMetricCount ||
    existing.gameMetricCount !== projection.receipt.gameMetricCount
  ) {
    throw new ReplayNormalizedStatsError(
      "projection_idempotency_conflict",
      "The replay statistics idempotency key already names different normalized output."
    );
  }
  return existing;
}

export async function persistReplayNormalizedStatProjection(
  prisma: PrismaClient,
  projection: ReplayNormalizedStatProjection
) {
  const existing = await verifyExistingProjection(prisma, projection);
  if (existing) {
    return { outcome: "existing" as const, projectionId: existing.id };
  }

  try {
    const projectionId = await prisma.$transaction(async (tx) => {
      const receipt = projection.receipt;
      const created = await tx.replayStatProjection.create({
        data: {
          ...receipt,
          provenance: jsonInput(receipt.provenance),
        },
        select: { id: true },
      });

      for (const player of projection.players) {
        const { metrics, ...snapshot } = player;
        const createdSnapshot = await tx.replayPlayerSnapshot.create({
          data: {
            ...snapshot,
            projectionId: created.id,
            gameStatsId: receipt.gameStatsId,
            eligibilityReason: snapshot.eligibilityReason
              ? jsonInput(snapshot.eligibilityReason)
              : undefined,
            provenance: jsonInput(snapshot.provenance),
          },
          select: { id: true },
        });
        if (metrics.length > 0) {
          await tx.replayPlayerMetric.createMany({
            data: metrics.map((entry) => ({
              ...entry,
              projectionId: created.id,
              playerSnapshotId: createdSnapshot.id,
              gameStatsId: receipt.gameStatsId,
              provenance: jsonInput(entry.provenance),
            })),
          });
        }
      }
      if (projection.gameMetrics.length > 0) {
        await tx.replayGameMetric.createMany({
          data: projection.gameMetrics.map((entry) => ({
            ...entry,
            projectionId: created.id,
            gameStatsId: receipt.gameStatsId,
            provenance: jsonInput(entry.provenance),
          })),
        });
      }
      return created.id;
    });
    return { outcome: "created" as const, projectionId };
  } catch (error) {
    const raced = await verifyExistingProjection(prisma, projection);
    if (raced) {
      return { outcome: "existing" as const, projectionId: raced.id };
    }
    throw error;
  }
}

export async function loadAcceptedReplayPlayerMetricSeries(
  prisma: PrismaClient,
  input: {
    playerKey?: string;
    userId?: number;
    metricKeys?: readonly string[];
    exactOnly?: boolean;
    minimumConfidenceBps?: number;
    resultScope?: "all_stat_eligible" | "resolved_only";
    take?: number;
  }
) {
  if (!input.playerKey && !input.userId) {
    throw new ReplayNormalizedStatsError(
      "player_identity_required",
      "A playerKey or userId is required."
    );
  }
  const minimumConfidenceBps = confidence(input.minimumConfidenceBps);
  const take = Math.min(Math.max(input.take ?? 500, 1), 5_000);
  return prisma.replayPlayerMetric.findMany({
    where: {
      metricKey:
        input.metricKeys && input.metricKeys.length > 0
          ? { in: [...input.metricKeys] }
          : undefined,
      exact: input.exactOnly === false ? undefined : true,
      confidenceBps:
        minimumConfidenceBps === null
          ? undefined
          : { gte: minimumConfidenceBps },
      statEligible: true,
      playerSnapshot: {
        playerKey: input.playerKey,
        userId: input.userId,
        statEligible: true,
        resultEligible:
          input.resultScope === "resolved_only" ? true : undefined,
      },
      projection: {
        projectionStatus: "accepted",
        affectsPublicAggregates: true,
        supersededBy: null,
      },
    },
    select: {
      metricKey: true,
      metricGroup: true,
      numericValue: true,
      textValue: true,
      booleanValue: true,
      unit: true,
      exact: true,
      confidenceBps: true,
      sourceKind: true,
      sourcePath: true,
      provenance: true,
      playerSnapshot: {
        select: {
          playerKey: true,
          displayName: true,
          resultEligible: true,
          resultStatus: true,
        },
      },
      projection: {
        select: {
          id: true,
          schemaVersion: true,
          metricDictionaryVersion: true,
          parserName: true,
          parserVersion: true,
          passName: true,
          passVersion: true,
          sourceKind: true,
          sourceIdentity: true,
        },
      },
      gameStats: {
        select: {
          id: true,
          replayHash: true,
          played_on: true,
          timestamp: true,
        },
      },
    },
    orderBy: [
      { gameStats: { played_on: "desc" } },
      { gameStatsId: "desc" },
      { metricKey: "asc" },
    ],
    take,
  });
}

export type ReplayPlayerMetricAggregateRow = {
  idempotencyKey: string;
  buildKey: string;
  inputHash: string;
  userId: number | null;
  bestGameStatsId: number | null;
  playerKey: string;
  metricKey: string;
  metricGroup: string;
  unit: string;
  schemaVersion: string;
  metricDictionaryVersion: string;
  aggregateVersion: string;
  scopeKey: string;
  dimension: ReplayEngineJson;
  dimensionHash: string;
  resultScope: "all_stat_eligible" | "resolved_only";
  sourceProjectionCount: number;
  totalGameCount: number;
  statEligibleGameCount: number;
  resultEligibleGameCount: number;
  metricGameCount: number;
  coverageBps: number;
  numericSum: string;
  numericAverage: string;
  numericMinimum: string;
  numericMaximum: string;
};

export function buildReplayPlayerMetricAggregateRows(input: {
  buildKey: unknown;
  projections: readonly ReplayNormalizedStatProjection[];
  resultScope?: "all_stat_eligible" | "resolved_only";
  scopeKey?: unknown;
  dimension?: unknown;
  schemaVersion?: unknown;
  metricDictionaryVersion?: unknown;
  aggregateVersion?: unknown;
}) {
  const buildKey = requiredText(input.buildKey, "build_key", 128);
  const resultScope = input.resultScope ?? "all_stat_eligible";
  const scopeKey = cleanText(input.scopeKey, 64) ?? "career";
  const dimension = optionalJsonObject(input.dimension);
  const dimensionHash = replayEngineSha256(dimension);
  const schemaVersion =
    cleanText(input.schemaVersion, 64) ?? REPLAY_STATS_SCHEMA_VERSION;
  const metricDictionaryVersion =
    cleanText(input.metricDictionaryVersion, 64) ??
    REPLAY_METRIC_DICTIONARY_VERSION;
  const aggregateVersion =
    cleanText(input.aggregateVersion, 64) ??
    REPLAY_PLAYER_AGGREGATE_VERSION;
  const accepted = input.projections.filter(
    (projection) =>
      projection.receipt.projectionStatus === "accepted" &&
      projection.receipt.affectsPublicAggregates
  );
  const acceptedGameIds = accepted.map(
    (projection) => projection.receipt.gameStatsId
  );
  if (new Set(acceptedGameIds).size !== acceptedGameIds.length) {
    throw new ReplayNormalizedStatsError(
      "non_current_projection_set",
      "Aggregate input must contain only one current accepted projection per game."
    );
  }

  type PlayerAccumulator = {
    userId: number | null;
    games: Set<number>;
    statEligibleGames: Set<number>;
    resultEligibleGames: Set<number>;
    projectionIds: Set<string>;
    metrics: Map<
      string,
      {
        definition: ReplayMetricDefinition;
        values: Array<{ gameStatsId: number; value: number }>;
      }
    >;
  };
  const players = new Map<string, PlayerAccumulator>();
  for (const projection of accepted) {
    for (const player of projection.players) {
      const accumulator = players.get(player.playerKey) ?? {
        userId: player.userId,
        games: new Set<number>(),
        statEligibleGames: new Set<number>(),
        resultEligibleGames: new Set<number>(),
        projectionIds: new Set<string>(),
        metrics: new Map(),
      };
      accumulator.userId ??= player.userId;
      accumulator.games.add(projection.receipt.gameStatsId);
      accumulator.projectionIds.add(
        projection.receipt.projectionIdentityHash
      );
      if (player.statEligible) {
        accumulator.statEligibleGames.add(projection.receipt.gameStatsId);
      }
      if (player.resultEligible) {
        accumulator.resultEligibleGames.add(projection.receipt.gameStatsId);
      }
      for (const playerMetric of player.metrics) {
        if (
          !playerMetric.statEligible ||
          !playerMetric.exact ||
          playerMetric.numericValue === null ||
          (resultScope === "resolved_only" && !player.resultEligible)
        ) {
          continue;
        }
        const definition = replayPlayerMetricDefinition(
          playerMetric.metricKey
        );
        if (!definition) continue;
        const numeric = Number(playerMetric.numericValue);
        if (!Number.isFinite(numeric)) continue;
        const metricAccumulator = accumulator.metrics.get(
          playerMetric.metricKey
        ) ?? {
          definition,
          values: [],
        };
        metricAccumulator.values.push({
          gameStatsId: projection.receipt.gameStatsId,
          value: numeric,
        });
        accumulator.metrics.set(playerMetric.metricKey, metricAccumulator);
      }
      players.set(player.playerKey, accumulator);
    }
  }

  const output: ReplayPlayerMetricAggregateRow[] = [];
  for (const [playerKey, player] of players) {
    const denominator =
      resultScope === "resolved_only"
        ? player.resultEligibleGames.size
        : player.statEligibleGames.size;
    if (denominator === 0) continue;
    for (const [metricKey, metricAccumulator] of player.metrics) {
      if (metricAccumulator.values.length === 0) continue;
      const values = metricAccumulator.values.map((entry) => entry.value);
      const numericSum = values.reduce((sum, value) => sum + value, 0);
      const numericMinimum = Math.min(...values);
      const numericMaximum = Math.max(...values);
      const bestValue =
        metricAccumulator.definition.bestDirection === "minimum"
          ? numericMinimum
          : numericMaximum;
      const bestGameStatsId =
        metricAccumulator.values.find((entry) => entry.value === bestValue)
          ?.gameStatsId ?? null;
      const metricGameCount = new Set(
        metricAccumulator.values.map((entry) => entry.gameStatsId)
      ).size;
      const rowIdentity = {
        buildKey,
        playerKey,
        metricKey,
        scopeKey,
        dimensionHash,
        resultScope,
        sourceProjections: [...player.projectionIds].sort(),
        values: [...metricAccumulator.values].sort(
          (left, right) => left.gameStatsId - right.gameStatsId
        ),
      };
      const inputHash = replayEngineSha256(rowIdentity);
      output.push({
        idempotencyKey: `replay-aggregate:${inputHash}`,
        buildKey,
        inputHash,
        userId: player.userId,
        bestGameStatsId,
        playerKey,
        metricKey,
        metricGroup: metricAccumulator.definition.group,
        unit: metricAccumulator.definition.unit,
        schemaVersion,
        metricDictionaryVersion,
        aggregateVersion,
        scopeKey,
        dimension,
        dimensionHash,
        resultScope,
        sourceProjectionCount: player.projectionIds.size,
        totalGameCount: player.games.size,
        statEligibleGameCount: player.statEligibleGames.size,
        resultEligibleGameCount: player.resultEligibleGames.size,
        metricGameCount,
        coverageBps: Math.round((metricGameCount / denominator) * 10_000),
        numericSum: String(numericSum),
        numericAverage: String(numericSum / metricAccumulator.values.length),
        numericMinimum: String(numericMinimum),
        numericMaximum: String(numericMaximum),
      });
    }
  }
  return output.sort(
    (left, right) =>
      left.playerKey.localeCompare(right.playerKey) ||
      left.metricKey.localeCompare(right.metricKey)
  );
}

export async function persistReplayPlayerMetricAggregateRows(
  prisma: PrismaClient,
  rows: readonly ReplayPlayerMetricAggregateRow[]
) {
  if (rows.length === 0) return { createdCount: 0 };
  const result = await prisma.replayPlayerMetricAggregate.createMany({
    data: rows.map((row) => ({
      ...row,
      dimension: jsonInput(row.dimension),
    })),
    skipDuplicates: true,
  });
  return { createdCount: result.count };
}

export async function loadLatestReplayPlayerMetricAggregates(
  prisma: PrismaClient,
  input: {
    playerKey?: string;
    userId?: number;
    metricKeys?: readonly string[];
    resultScope?: "all_stat_eligible" | "resolved_only";
    take?: number;
  }
) {
  if (!input.playerKey && !input.userId) {
    throw new ReplayNormalizedStatsError(
      "player_identity_required",
      "A playerKey or userId is required."
    );
  }
  return prisma.replayPlayerMetricAggregate.findMany({
    where: {
      playerKey: input.playerKey,
      userId: input.userId,
      metricKey:
        input.metricKeys && input.metricKeys.length > 0
          ? { in: [...input.metricKeys] }
          : undefined,
      resultScope: input.resultScope,
    },
    distinct: [
      "metricKey",
      "scopeKey",
      "dimensionHash",
      "resultScope",
    ],
    orderBy: [{ createdAt: "desc" }, { metricKey: "asc" }],
    take: Math.min(Math.max(input.take ?? 200, 1), 1_000),
  });
}
