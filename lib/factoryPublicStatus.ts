/**
 * AoE2WAR Factory V1 — public read-only signal contract.
 *
 * No internal hostnames, ports, token material, financial state or commands.
 * Every status must originate in a fresh, explicitly published snapshot.
 * Missing, malformed or expired receipts render UNKNOWN rather than green.
 */
export const FACTORY_STAGES = [
  "develop", "test", "build", "approve", "deploy", "verify", "rollback",
] as const;
export type FactoryStage = (typeof FACTORY_STAGES)[number];
export type FactorySignal = "pass" | "running" | "hold" | "fail" | "unknown" | "pending" | "stale";
export type FactoryRelease = {
  buildId?: string | null;
  id: string | null;
  status: FactorySignal;
  verifiedAt: string | null;
};
export type FactoryHealth = { id: string; state: FactorySignal };
export type FactoryTestGroup = {
  id: string;
  state: FactorySignal;
  passed: number | null;
  total: number | null;
};
export type FactoryActivity = {
  id: string;
  label: string;
  state: FactorySignal;
  at: string;
};
export type FactoryReleaseOs = {
  schema: "aoe2war.product.release-summary.v1";
  sourceSha: string;
  buildId: string;
  generatedAt: string;
  startKind: "observed-engineering" | "declared-request" | "unknown";
  firstVerifiedProductionMs: number | null;
  finalAcceptedMs: number | null;
  clocksUncertaintyMs: number | null;
  provenanceUrl: string | null;
  stages: Array<{
    event: string; label: string; state: FactorySignal;
    at: string | null; durationMs: number | null; proofSha256: string | null;
  }>;
  disk?: { rootFreeBytes: number; requiredBytes: number; observedAt: string };
  transfer?: {
    state: FactorySignal; bytes: number; totalBytes: number | null;
    throughputBps: number | null; elapsedMs: number | null;
    expectedSha256: string | null; verification: "pass" | "fail" | "unknown";
    retryCount: number; resumedBytes: number;
  };
};
export type FactoryPublicStatus = {
  releaseOs?: FactoryReleaseOs;
  schema: "aoe2war.factory.public.v1";
  generatedAt: string | null;
  liveRelease: FactoryRelease;
  candidateRelease: FactoryRelease;
  previousRelease: FactoryRelease;
  pipelineStage: {
    active: FactoryStage | null;
    stages: Record<FactoryStage, FactorySignal>;
  };
  serviceHealth: FactoryHealth[];
  testGroups: FactoryTestGroup[];
  recentActivity: FactoryActivity[];
};
export type FactoryFeed = {
  authority: "fresh" | "stale" | "unavailable";
  value: FactoryPublicStatus;
};

export const FACTORY_SERVICES = [
  { id: "website", name: "WEB EDGE" },
  { id: "identity", name: "IDENTITY" },
  { id: "media", name: "MEDIA" },
  { id: "public-api", name: "PUBLIC API" },
  { id: "release", name: "RELEASE" },
] as const;

export const FACTORY_TEST_GROUPS = [
  { id: "source", name: "SOURCE" },
  { id: "security", name: "SECURITY" },
  { id: "browser", name: "BROWSER" },
  { id: "artifact", name: "ARTIFACT" },
  { id: "release", name: "HOST CHECKS" },
  { id: "rollback", name: "ROLLBACK" },
] as const;

const signals = new Set<FactorySignal>(["pass", "running", "hold", "fail", "unknown", "pending", "stale"]);
const stages = new Set<string>(FACTORY_STAGES);
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isSignal = (x: unknown): x is FactorySignal => signals.has(x as FactorySignal);
const safeId = (x: unknown, max = 80): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= max &&
  /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(x) && !x.includes("..") && !x.includes("//");
const isTimestamp = (x: unknown): x is string =>
  typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x) &&
  Number.isFinite(Date.parse(x));

const releaseUnknown = (): FactoryRelease => ({ id: null, status: "unknown", verifiedAt: null });

export function unknownFactoryStatus(): FactoryPublicStatus {
  return {
    schema: "aoe2war.factory.public.v1",
    generatedAt: null,
    liveRelease: releaseUnknown(),
    candidateRelease: releaseUnknown(),
    previousRelease: releaseUnknown(),
    pipelineStage: {
      active: null,
      stages: Object.fromEntries(FACTORY_STAGES.map((id) => [id, "unknown"])) as Record<FactoryStage, FactorySignal>,
    },
    serviceHealth: FACTORY_SERVICES.map(({ id }) => ({ id, state: "unknown" })),
    testGroups: FACTORY_TEST_GROUPS.map(({ id }) => ({
      id, state: "unknown", passed: null, total: null,
    })),
    recentActivity: [],
  };
}

function readRelease(value: unknown): FactoryRelease | null {
  if (!isRecord(value) || !isSignal(value.status)) return null;
  const id = value.id === null ? null : safeId(value.id) ? value.id : undefined;
  const verifiedAt = value.verifiedAt === null ? null
    : isTimestamp(value.verifiedAt) ? value.verifiedAt : undefined;
  if (id === undefined || verifiedAt === undefined) return null;
  // A green candidate or rollback target must have a traceable identifier.
  if (value.status === "pass" && (!id || !verifiedAt)) return null;
  if (value.buildId !== undefined && value.buildId !== null &&
    (typeof value.buildId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value.buildId))) return null;
  return { id, verifiedAt, status: value.status,
    ...(value.buildId !== undefined ? { buildId: value.buildId as string | null } : {}) };
}

function readGroups(raw: unknown): FactoryTestGroup[] | null {
  if (!Array.isArray(raw) || raw.length !== FACTORY_TEST_GROUPS.length) return null;
  const entries = new Map<string, FactoryTestGroup>();
  for (const value of raw) {
    if (!isRecord(value) || !safeId(value.id, 40) || !isSignal(value.state) ||
      !FACTORY_TEST_GROUPS.some((g) => g.id === value.id) || entries.has(value.id)) return null;
    const n = value.total === null ? null : value.total;
    const p = value.passed === null ? null : value.passed;
    if ((n === null) !== (p === null) ||
      (n !== null && (!Number.isSafeInteger(n) || (n as number) < 0 || (n as number) > 20000)) ||
      (p !== null && (!Number.isSafeInteger(p) || (p as number) < 0 || (p as number) > (n as number)))) return null;
    if (value.state === "pass" && (n === null || (n as number) === 0 || p !== n)) return null;
    entries.set(value.id, { id: value.id, state: value.state, passed: p as number | null, total: n as number | null });
  }
  return FACTORY_TEST_GROUPS.map(({ id }) => entries.get(id)!);
}

function readServices(raw: unknown): FactoryHealth[] | null {
  if (!Array.isArray(raw) || raw.length !== FACTORY_SERVICES.length) return null;
  const entries = new Map<string, FactoryHealth>();
  for (const item of raw) {
    if (!isRecord(item) || !safeId(item.id, 40) || !isSignal(item.state) ||
      !FACTORY_SERVICES.some((s) => s.id === item.id) || entries.has(item.id)) return null;
    entries.set(item.id, { id: item.id, state: item.state });
  }
  return FACTORY_SERVICES.map(({ id }) => entries.get(id)!);
}

function readActivity(raw: unknown, nowMs: number): FactoryActivity[] | null {
  if (!Array.isArray(raw) || raw.length > 6) return null;
  const ids = new Set<string>();
  const result: FactoryActivity[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !safeId(item.id, 60) || ids.has(item.id) ||
      !isSignal(item.state) || !isTimestamp(item.at) ||
      typeof item.label !== "string" || item.label.length < 1 || item.label.length > 96 ||
      /[\u0000-\u001f<>]/.test(item.label) ||
      Math.abs(nowMs - Date.parse(item.at)) > 72 * 60 * 60 * 1000) return null;
    ids.add(item.id);
    result.push({ id: item.id, label: item.label, state: item.state, at: item.at });
  }
  return result.sort((a, b) => b.at.localeCompare(a.at));
}

export const FACTORY_STAGE_MILESTONES: Record<FactoryStage, readonly string[]> = {
  develop: ["T2"], test: ["T3"], build: ["T4"], approve: ["T4"],
  deploy: ["T6"], verify: ["T7"], rollback: ["T8", "T9", "T10"],
};

export function factoryStageEvidence(summary: FactoryReleaseOs | undefined, stage: FactoryStage) {
  const events = FACTORY_STAGE_MILESTONES[stage];
  const rows = events.map(event => summary?.stages.find(row => row.event === event));
  const states = rows.map(row => row?.state || "unknown");
  let state: FactorySignal = "unknown";
  if (states.every(value => value === "pass")) state = "pass";
  else {
    for (const candidate of ["fail", "hold", "stale", "running", "pending", "unknown"] as const) {
      if (states.includes(candidate)) { state = candidate; break; }
    }
  }
  const last = rows.filter((row): row is NonNullable<typeof row> => !!row).at(-1);
  return { state, events, at: last?.at || null, proofSha256: last?.proofSha256 || null };
}

function readReleaseOs(
  raw: unknown, source: string | null, expectedBuild: string | null | undefined, nowMs: number,
): FactoryReleaseOs | undefined {
  if (!isRecord(raw) || raw.schema !== "aoe2war.product.release-summary.v1" ||
    typeof raw.sourceSha !== "string" || !/^[a-f0-9]{40}$/.test(raw.sourceSha) || raw.sourceSha !== source ||
    typeof expectedBuild !== "string" || raw.buildId !== expectedBuild ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(expectedBuild) ||
    !isTimestamp(raw.generatedAt) || !Array.isArray(raw.stages) || raw.stages.length > 24) return;
  const age = nowMs - Date.parse(raw.generatedAt);
  if (age < -60_000) return;
  const number = (x: unknown): number | null =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e15 ? x : null;
  const rows: FactoryReleaseOs["stages"] = [];
  const seen = new Set<string>();
  const proved = new Set<string>();
  for (const item of raw.stages) {
    if (!isRecord(item) || typeof item.event !== "string" ||
      !/^[A-Za-z0-9_.-]{1,48}$/.test(item.event) || seen.has(item.event) || !isSignal(item.state)) return;
    seen.add(item.event);
    const at = isTimestamp(item.at) ? item.at : null;
    const proof = typeof item.proofSha256 === "string" && /^[a-f0-9]{64}$/.test(item.proofSha256)
      ? item.proofSha256 : null;
    let state = item.state;
    if (state === "pass" && (!at || !proof)) state = "unknown";
    if (at && Date.parse(at) > nowMs + 60_000) state = "unknown";
    if (state === "pass") proved.add(item.event);
    if (age > 86_400_000 || (at && nowMs - Date.parse(at) > 86_400_000) ||
      (state === "running" && at && nowMs - Date.parse(at) > 600_000)) state = "stale";
    rows.push({ event: item.event, label: item.event, state, at,
      durationMs: number(item.durationMs), proofSha256: proof });
  }
  const startKind = raw.startKind === "declared-request" || raw.startKind === "observed-engineering"
    ? raw.startKind : "unknown";
  const url = typeof raw.provenanceUrl === "string" &&
    /^https:\/\/github\.com\/Emaren\/app-prodn\/(?:pull\/\d+|issues\/\d+|actions\/runs\/\d+)(?:#[A-Za-z0-9_-]+)?$/.test(raw.provenanceUrl)
    ? raw.provenanceUrl : null;
  let disk: FactoryReleaseOs["disk"];
  if (isRecord(raw.disk) && number(raw.disk.rootFreeBytes) !== null &&
    number(raw.disk.requiredBytes) !== null && isTimestamp(raw.disk.observedAt)) {
    disk = { rootFreeBytes: raw.disk.rootFreeBytes as number,
      requiredBytes: raw.disk.requiredBytes as number, observedAt: raw.disk.observedAt };
  }
  let transfer: FactoryReleaseOs["transfer"];
  if (age <= 600_000 && isRecord(raw.transfer) && isSignal(raw.transfer.state) &&
    number(raw.transfer.bytes) !== null && number(raw.transfer.retryCount) !== null &&
    number(raw.transfer.resumedBytes) !== null) {
    const total = number(raw.transfer.totalBytes);
    const bytes = raw.transfer.bytes as number;
    if (total === null || (total > 0 && bytes <= total)) {
      transfer = {
        state: raw.transfer.state, bytes, totalBytes: total,
        throughputBps: number(raw.transfer.throughputBps), elapsedMs: number(raw.transfer.elapsedMs),
        expectedSha256: typeof raw.transfer.expectedSha256 === "string" &&
          /^[a-f0-9]{64}$/.test(raw.transfer.expectedSha256) ? raw.transfer.expectedSha256 : null,
        verification: raw.transfer.verification === "pass" || raw.transfer.verification === "fail"
          ? raw.transfer.verification : "unknown",
        retryCount: raw.transfer.retryCount as number, resumedBytes: raw.transfer.resumedBytes as number,
      };
    }
  }
  return { schema: "aoe2war.product.release-summary.v1", sourceSha: raw.sourceSha,
    buildId: expectedBuild, generatedAt: raw.generatedAt, startKind,
    firstVerifiedProductionMs: startKind !== "unknown" && proved.has("T7")
      ? number(raw.firstVerifiedProductionMs) : null,
    finalAcceptedMs: startKind !== "unknown" && ["T8", "T9", "T10"].every(event => proved.has(event))
      ? number(raw.finalAcceptedMs) : null,
    clocksUncertaintyMs: number(raw.clocksUncertaintyMs), provenanceUrl: url, stages: rows,
    ...(disk ? { disk } : {}), ...(transfer ? { transfer } : {}) };
}

/** A release feed is only current for ten minutes. Never promote stale pass. */
export function readFactoryPublicStatus(raw: unknown, nowMs = Date.now()): FactoryFeed {
  const fallback = unknownFactoryStatus();
  if (!isRecord(raw) || raw.schema !== fallback.schema) {
    return { authority: "unavailable", value: fallback };
  }
  if (!isTimestamp(raw.generatedAt)) {
    return { authority: "unavailable", value: fallback };
  }
  const age = nowMs - Date.parse(raw.generatedAt);
  if (!Number.isFinite(age) || age > 600_000 || age < -60_000) {
    return { authority: "stale", value: fallback };
  }
  const liveRelease = readRelease(raw.liveRelease);
  const candidateRelease = readRelease(raw.candidateRelease);
  const previousRelease = readRelease(raw.previousRelease);
  const pipeline = raw.pipelineStage;
  const stageSignals = isRecord(pipeline) && isRecord(pipeline.stages)
    ? pipeline.stages : null;
  const services = readServices(raw.serviceHealth);
  const groups = readGroups(raw.testGroups);
  const activity = readActivity(raw.recentActivity, nowMs);
  if (!liveRelease || !candidateRelease || !previousRelease ||
    !isRecord(pipeline) || (pipeline.active !== null && !stages.has(pipeline.active as string)) ||
    !stageSignals || !FACTORY_STAGES.every((id) => isSignal(stageSignals[id])) ||
    !services || !groups || !activity) {
    return { authority: "unavailable", value: fallback };
  }
  const releaseOs = readReleaseOs(raw.releaseOs, liveRelease.id, liveRelease.buildId, nowMs);
  const qualifiedStages = Object.fromEntries(FACTORY_STAGES.map(id =>
    [id, factoryStageEvidence(releaseOs, id).state])) as Record<FactoryStage, FactorySignal>;
  return {
    authority: "fresh",
    value: {
      schema: fallback.schema,
      generatedAt: raw.generatedAt,
      ...(releaseOs ? { releaseOs } : {}),
      liveRelease,
      candidateRelease,
      previousRelease,
      pipelineStage: {
        active: FACTORY_STAGES.find(id => qualifiedStages[id] === "running") || null,
        stages: qualifiedStages,
      },
      serviceHealth: services,
      testGroups: groups.map(group => group.id !== "release" && group.state === "pass"
        ? { ...group, state: "unknown" as const, passed: null, total: null } : group),
      recentActivity: activity,
    },
  };
}
