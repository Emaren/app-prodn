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
export type FactorySignal = "pass" | "running" | "hold" | "fail" | "unknown";
export type FactoryRelease = {
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
export type FactoryPublicStatus = {
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
  { id: "release", name: "RELEASE" },
  { id: "rollback", name: "ROLLBACK" },
] as const;

const signals = new Set<FactorySignal>(["pass", "running", "hold", "fail", "unknown"]);
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
  return { id, verifiedAt, status: value.status };
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
  return {
    authority: "fresh",
    value: {
      schema: fallback.schema,
      generatedAt: raw.generatedAt,
      liveRelease,
      candidateRelease,
      previousRelease,
      pipelineStage: {
        active: pipeline.active as FactoryStage | null,
        stages: Object.fromEntries(FACTORY_STAGES.map((id) => [id, stageSignals[id]])) as Record<FactoryStage, FactorySignal>,
      },
      serviceHealth: services,
      testGroups: groups,
      recentActivity: activity,
    },
  };
}
