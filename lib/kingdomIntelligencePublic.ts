import { readAoe2OsKingdomIntelligence } from "@/lib/aoe2Os";

type JsonRecord = Record<string, unknown>;

const PUBLIC_INVARIANT_LABELS: Record<string, string> = {
  "source-authority-exact": "One source of truth",
  "estate-p0-zero": "No blocking P0 findings",
  "estate-p1-zero": "No P1 debt",
  "wolo-listener-boundary": "WOLO boundary intact",
  "offhost-recovery-verified": "Off-host recovery proven",
  "replay-certainty-accounted": "Replay certainty accounted",
  "finish-closure-complete": "Release closure complete",
  "control-state-current": "Control state current",
  "speed-baseline-current-release": "Speed evidence current",
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function shortSha(value: unknown) {
  const text = stringValue(value);
  return text && /^[0-9a-f]{10,40}$/i.test(text) ? text.slice(0, 12) : null;
}

function publicInvariant(value: unknown) {
  const row = record(value);
  const key = stringValue(row.key);
  const status = stringValue(row.status) ?? "UNKNOWN";
  if (!key || !(key in PUBLIC_INVARIANT_LABELS)) return null;
  return {
    key,
    label: PUBLIC_INVARIANT_LABELS[key],
    status,
  };
}

function safeCampaign(payload: JsonRecord) {
  const status = stringValue(payload.status) ?? "NONE";
  const completed = numberValue(payload.completed_generations) ?? 0;
  const maximum = numberValue(payload.max_generations);
  const current = stringValue(payload.current_generation);
  return {
    status,
    completedGenerations: completed,
    maxGenerations: maximum,
    currentGeneration: current ? current.replace(/^activate-/, "").slice(0, 32) : null,
    completionReason: stringValue(payload.completion_reason),
    active:
      status === "RUNNING" ||
      status === "RUNNING_TRANSACTION" ||
      status === "RESUME_REQUESTED",
  };
}

export async function loadPublicKingdomIntelligence() {
  const snapshot = await readAoe2OsKingdomIntelligence();
  if (!snapshot) {
    return {
      available: false as const,
      generatedAt: null,
      receivedAt: null,
      warDate: null,
      stale: true,
      ageSeconds: null,
      operatingState: "UNKNOWN",
      source: null,
      health: null,
      storage: null,
      storageCampaign: null,
      replayTruth: null,
      performance: null,
      workspace: null,
      activity24h: null,
      invariants: [],
      directive: null,
    };
  }

  const payload = record(snapshot.payload);
  const source = record(payload.source);
  const production = record(source.production);
  const certification = record(source.certification);
  const health = record(payload.health);
  const storage = record(payload.storage);
  const campaign = record(payload.storage_campaign);
  const replay = record(payload.replay_truth);
  const performance = record(payload.performance);
  const baseline = record(performance.baseline);
  const workspace = record(payload.workspace);
  const activity = record(payload.activity_24h);
  const best = record(payload.best_next_action);

  const receivedMs = new Date(snapshot.receivedAt).getTime();
  const ageSeconds = Number.isFinite(receivedMs)
    ? Math.max(0, Math.floor((Date.now() - receivedMs) / 1000))
    : null;
  const stale = ageSeconds === null || ageSeconds > 15 * 60;

  const invariants = Array.isArray(payload.invariants)
    ? payload.invariants
        .map(publicInvariant)
        .filter(
          (
            item
          ): item is NonNullable<ReturnType<typeof publicInvariant>> =>
            Boolean(item)
        )
    : [];

  const resolved = numberValue(replay.resolved);
  const finalGames = numberValue(replay.final_games);
  const resultCoveragePercent =
    resolved !== null && finalGames && finalGames > 0
      ? Math.round((resolved / finalGames) * 10_000) / 100
      : null;

  return {
    available: true as const,
    generatedAt: snapshot.generatedAt,
    receivedAt: snapshot.receivedAt,
    warDate: snapshot.warDate,
    stale,
    ageSeconds,
    operatingState: snapshot.operatingState,
    source: {
      exact: booleanValue(source.exact),
      certificationStatus: stringValue(certification.status) ?? "UNKNOWN",
      productionRelease: shortSha(production.source_sha),
    },
    health: {
      estate: stringValue(health.estate) ?? "UNKNOWN",
      doctorScore: numberValue(health.doctor_score),
      doctorStatus: stringValue(health.doctor_status) ?? "UNKNOWN",
      p0: numberValue(health.p0) ?? 0,
      p1: numberValue(health.p1) ?? 0,
    },
    storage: {
      health: stringValue(storage.health) ?? "UNKNOWN",
      usedPercent: numberValue(storage.volume_used_percent),
      healthyTargetPercent: numberValue(storage.healthy_target_percent) ?? 78,
    },
    storageCampaign: safeCampaign(campaign),
    replayTruth: {
      available: replay.available === true,
      resolved,
      finalGames,
      resultCoveragePercent,
      accountedPercent: numberValue(replay.accounted_percent),
      parserWorkCandidates: numberValue(replay.parser_work_candidates),
      current: replay.matches_current_release === true,
    },
    performance: {
      available: performance.available === true,
      status: stringValue(performance.status) ?? "UNKNOWN",
      routeCount: numberValue(performance.route_count),
      ttfbP50Ms: numberValue(baseline.ttfb_p50_ms),
      totalP50Ms: numberValue(baseline.total_p50_ms),
      current: performance.matches_current_release === true,
    },
    workspace: {
      canonicalDriftCount: numberValue(workspace.canonical_drift_count) ?? 0,
      activeAgentCount: numberValue(workspace.active_agent_count) ?? 0,
      dirtyAgentCount: numberValue(workspace.dirty_agent_count) ?? 0,
      unmergedCount: numberValue(workspace.unmerged_count) ?? 0,
      cleanupCandidates: numberValue(workspace.cleanup_candidates) ?? 0,
    },
    activity24h: {
      sourceCommits: numberValue(activity.source_commits),
      finishRuns: numberValue(activity.finish_runs) ?? 0,
      certifiedFinishes: numberValue(activity.certified_finishes) ?? 0,
    },
    invariants,
    directive: stringValue(best.title)
      ? {
          title: stringValue(best.title)!,
          level: stringValue(best.level) ?? "NEXT",
          key: stringValue(best.key),
        }
      : null,
  };
}

export type PublicKingdomIntelligence = Awaited<
  ReturnType<typeof loadPublicKingdomIntelligence>
>;
