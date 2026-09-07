import { loadAoe2OsDashboard, readAoe2OsKingdomIntelligence } from "@/lib/aoe2Os";

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

const PUBLIC_SYSTEM_LABELS = new Set([
  "Release OS",
  "Documentation OS",
  "Storage OS",
  "Host OS",
  "Recovery OS",
  "Workspace OS",
  "Speed OS",
  "Replay Truth OS",
  "System Doctor",
]);

function safeSystemAgent(value: unknown) {
  const row = record(value);
  const label = stringValue(row.label);
  if (!label || !PUBLIC_SYSTEM_LABELS.has(label)) return null;
  return {
    key: stringValue(row.key) ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    state: stringValue(row.state) ?? "UNKNOWN",
    summary: stringValue(row.summary) ?? "Awaiting evidence.",
    progressPercent: numberValue(row.progress_percent),
    progressLabel: stringValue(row.progress_label),
  };
}

function safeSourceActivity(value: unknown) {
  const row = record(value);
  const sha = shortSha(row.sha);
  const title = stringValue(row.title);
  const createdAt = stringValue(row.created_at);
  if (!sha || !title || !createdAt) return null;
  return {
    sha,
    title: title.slice(0, 150),
    createdAt,
    system: stringValue(row.system) ?? "Kingdom Intelligence",
    status: "SUCCEEDED",
  };
}

function safeMemorySeal(value: unknown) {
  const row = record(value);
  const sha = shortSha(row.sha);
  const title = stringValue(row.title);
  const createdAt = stringValue(row.created_at);
  if (!sha || !title || !createdAt) return null;
  return {
    sha,
    title: title.slice(0, 150),
    createdAt,
    status: "SEALED",
  };
}

function systemForAction(action: string) {
  if (["status", "deploy_plan", "deploy", "finish", "rollback_preview", "rollback"].includes(action)) return "Release OS";
  if (["control_refresh", "update_plan", "update_apply"].includes(action)) return "Documentation OS";
  if (["storage_status", "storage_plan", "storage_campaign_status"].includes(action)) return "Storage OS";
  if (action === "doctor" || action === "audit") return "System Doctor";
  if (action === "brain") return "Kingdom Intelligence";
  return "AoE2WAR OS";
}

function safeRunActivity(value: unknown) {
  const row = record(value);
  const action = stringValue(row.action);
  const label = stringValue(row.label);
  const status = stringValue(row.status);
  const requestedAt = stringValue(row.requestedAt);
  if (!action || !label || !status || !requestedAt) return null;
  return {
    id: stringValue(row.id)?.slice(0, 40) ?? null,
    system: systemForAction(action),
    label: label.slice(0, 120),
    status: status.toUpperCase(),
    requestedAt,
    completedAt: stringValue(row.completedAt),
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
  const [snapshot, dashboard] = await Promise.all([
    readAoe2OsKingdomIntelligence(),
    loadAoe2OsDashboard().catch(() => null),
  ]);
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
      systemAgents: [],
      liveActivity: [],
      recentSourceActivity: [],
      memorySeals: [],
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
  const systemAgents = Array.isArray(payload.system_agents)
    ? payload.system_agents
        .map(safeSystemAgent)
        .filter((item): item is NonNullable<ReturnType<typeof safeSystemAgent>> => Boolean(item))
    : [];
  const recentSourceActivity = Array.isArray(payload.recent_source_activity)
    ? payload.recent_source_activity
        .map(safeSourceActivity)
        .filter((item): item is NonNullable<ReturnType<typeof safeSourceActivity>> => Boolean(item))
    : [];
  const memorySeals = Array.isArray(payload.memory_seals)
    ? payload.memory_seals
        .map(safeMemorySeal)
        .filter((item): item is NonNullable<ReturnType<typeof safeMemorySeal>> => Boolean(item))
    : [];

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

  const liveActivity = [
    ...(dashboard?.activeRun ? [safeRunActivity(dashboard.activeRun)] : []),
    ...(dashboard?.recentRuns ?? []).map(safeRunActivity),
  ]
    .filter((item): item is NonNullable<ReturnType<typeof safeRunActivity>> => Boolean(item))
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .slice(0, 12);

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
    systemAgents,
    liveActivity,
    recentSourceActivity,
    memorySeals,
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
