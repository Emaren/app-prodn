import { randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const AOE2_OS_ACTIONS = {
  status: {
    label: "Refresh Status",
    description: "Read the release/deployment state without changing anything.",
    risk: "read",
    confirmation: null,
    requiresSourceSha: false,
  },
  audit: {
    label: "Run Full Audit",
    description: "Run the exhaustive read-only AoE2WAR estate audit.",
    risk: "read",
    confirmation: null,
    requiresSourceSha: false,
  },
  update_plan: {
    label: "Plan Update",
    description: "Show documentation/context maintenance that would be performed.",
    risk: "read",
    confirmation: null,
    requiresSourceSha: false,
  },
  update_apply: {
    label: "Apply Update",
    description: "Reconcile documentation, federation state and stale context archives.",
    risk: "docs_write",
    confirmation: "UPDATE",
    requiresSourceSha: false,
  },
  deploy_plan: {
    label: "Deploy Dry Run",
    description: "Preview the protected production release without activating it.",
    risk: "read",
    confirmation: null,
    requiresSourceSha: false,
  },
  deploy: {
    label: "Deploy Production",
    description: "Ship the current reviewed source through the protected release pipeline.",
    risk: "production_write",
    confirmation: "DEPLOY",
    requiresSourceSha: true,
  },
  rollback_preview: {
    label: "Rollback Preview",
    description: "Preview the receipt-driven rollback target without changing production.",
    risk: "read",
    confirmation: null,
    requiresSourceSha: false,
  },
  rollback: {
    label: "Rollback Production",
    description: "Activate the previous protected certified production generation.",
    risk: "production_write",
    confirmation: "ROLLBACK",
    requiresSourceSha: false,
  },
} as const;

export type Aoe2OsAction = keyof typeof AOE2_OS_ACTIONS;
export type Aoe2OsRisk = (typeof AOE2_OS_ACTIONS)[Aoe2OsAction]["risk"];
export type Aoe2OsRunStatus =
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type Aoe2OsRun = {
  id: string;
  action: Aoe2OsAction;
  risk: Aoe2OsRisk;
  label: string;
  description: string;
  status: Aoe2OsRunStatus;
  requestedByUserId: number;
  requestedByUid: string;
  expectedSourceSha: string | null;
  expectedTargetSha: string | null;
  bridgeId: string | null;
  requestedAt: string;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  result: unknown;
  error: string | null;
  stdoutTail: string | null;
};

export type Aoe2OsRunEvent = {
  id: string;
  runId: string;
  kind: "info" | "stdout" | "stderr" | "system";
  message: string;
  createdAt: string;
};

export type Aoe2OsBridgeHeartbeat = {
  bridgeId: string;
  hostname: string;
  platform: string;
  version: string;
  capabilities: Aoe2OsAction[];
  currentRunId: string | null;
  lastSeenAt: string;
};

export type Aoe2OsSnapshot = {
  bridgeId: string;
  runId: string | null;
  sourceAction: string;
  generatedAt: string;
  receivedAt: string;
  estate: string;
  p0: number;
  p1: number;
  payload: Record<string, unknown>;
};

export type Aoe2OsDashboard = {
  storeDir: string;
  bridge: (Aoe2OsBridgeHeartbeat & { online: boolean }) | null;
  snapshot: Aoe2OsSnapshot | null;
  activeRun: (Aoe2OsRun & { events: Aoe2OsRunEvent[] }) | null;
  recentRuns: Aoe2OsRun[];
  actions: Array<
    (typeof AOE2_OS_ACTIONS)[Aoe2OsAction] & {
      action: Aoe2OsAction;
    }
  >;
};

const RUN_STATUSES_ACTIVE = new Set<Aoe2OsRunStatus>([
  "queued",
  "claimed",
  "running",
]);

let mutationTail: Promise<void> = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function storeRoot() {
  const configured = process.env.AOE2WAR_OS_STORE_DIR?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    return "/mnt/HC_Volume_105319120/aoe2war/os-control";
  }

  return path.join(process.cwd(), "storage", "aoe2war-os");
}

function stateDir() {
  return path.join(storeRoot(), "state");
}

function runsDir() {
  return path.join(storeRoot(), "runs");
}

function eventsDir() {
  return path.join(storeRoot(), "events");
}

function runPath(runId: string) {
  return path.join(runsDir(), `${runId}.json`);
}

function eventsPath(runId: string) {
  return path.join(eventsDir(), `${runId}.jsonl`);
}

function bridgePath() {
  return path.join(stateDir(), "bridge.json");
}

function snapshotPath() {
  return path.join(stateDir(), "snapshot.json");
}

async function ensureStore() {
  await Promise.all([
    fs.mkdir(stateDir(), { recursive: true }),
    fs.mkdir(runsDir(), { recursive: true }),
    fs.mkdir(eventsDir(), { recursive: true }),
  ]);
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await ensureStore();
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function serializeMutation<T>(work: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = mutationTail;
  mutationTail = previous.then(() => turn);
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

async function listRuns(limit = 50) {
  await ensureStore();
  const names = (await fs.readdir(runsDir()))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);

  const runs = await Promise.all(
    names.map((name) => readJson<Aoe2OsRun>(path.join(runsDir(), name)))
  );

  return runs
    .filter((run): run is Aoe2OsRun => Boolean(run))
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

export function isAoe2OsAction(value: unknown): value is Aoe2OsAction {
  return typeof value === "string" && value in AOE2_OS_ACTIONS;
}

export function getAoe2OsAction(action: Aoe2OsAction) {
  return AOE2_OS_ACTIONS[action];
}

export function confirmationMatches(
  action: Aoe2OsAction,
  supplied: unknown
) {
  const expected = AOE2_OS_ACTIONS[action].confirmation;
  if (!expected) return true;
  return typeof supplied === "string" && supplied.trim() === expected;
}

export function bridgeIsOnline(
  heartbeat: Aoe2OsBridgeHeartbeat | null,
  now = Date.now(),
  thresholdMs = 45_000
) {
  if (!heartbeat) return false;
  const seen = new Date(heartbeat.lastSeenAt).getTime();
  return Number.isFinite(seen) && now - seen <= thresholdMs;
}

export function bridgeTokenMatches(supplied: string | null) {
  const expected = process.env.AOE2WAR_OS_BRIDGE_TOKEN?.trim();
  const received = supplied?.trim();

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function bridgeTokenConfigured() {
  return Boolean(process.env.AOE2WAR_OS_BRIDGE_TOKEN?.trim());
}

export async function createAoe2OsRun(input: {
  action: Aoe2OsAction;
  requestedByUserId: number;
  requestedByUid: string;
  expectedSourceSha?: string | null;
  expectedTargetSha?: string | null;
}) {
  return serializeMutation(async () => {
    const existing = (await listRuns(100)).find((run) =>
      RUN_STATUSES_ACTIVE.has(run.status)
    );

    if (existing) {
      throw new Error(
        `AoE2WAR OS already has an active ${existing.status} run: ${existing.id}`
      );
    }

    const action = AOE2_OS_ACTIONS[input.action];
    const timestamp = nowIso();
    const id = `${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;

    const run: Aoe2OsRun = {
      id,
      action: input.action,
      risk: action.risk,
      label: action.label,
      description: action.description,
      status: "queued",
      requestedByUserId: input.requestedByUserId,
      requestedByUid: input.requestedByUid,
      expectedSourceSha: input.expectedSourceSha?.trim() || null,
      expectedTargetSha: input.expectedTargetSha?.trim() || null,
      bridgeId: null,
      requestedAt: timestamp,
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      exitCode: null,
      result: null,
      error: null,
      stdoutTail: null,
    };

    await atomicWriteJson(runPath(id), run);
    return run;
  });
}

export async function cancelAoe2OsRun(runId: string) {
  return serializeMutation(async () => {
    const run = await readJson<Aoe2OsRun>(runPath(runId));
    if (!run) return null;
    if (run.status !== "queued") {
      throw new Error(`Only queued runs can be cancelled. Current status: ${run.status}`);
    }
    const next: Aoe2OsRun = {
      ...run,
      status: "cancelled",
      completedAt: nowIso(),
    };
    await atomicWriteJson(runPath(runId), next);
    return next;
  });
}

export async function claimNextAoe2OsRun(bridgeId: string) {
  return serializeMutation(async () => {
    const runs = (await listRuns(200))
      .filter((run) => run.status === "queued")
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));

    const run = runs[0];
    if (!run) return null;

    const claimed: Aoe2OsRun = {
      ...run,
      status: "claimed",
      bridgeId,
      claimedAt: nowIso(),
    };
    await atomicWriteJson(runPath(run.id), claimed);
    return claimed;
  });
}

export async function appendAoe2OsRunEvent(input: {
  runId: string;
  bridgeId: string;
  kind: Aoe2OsRunEvent["kind"];
  message: string;
}) {
  return serializeMutation(async () => {
    const run = await readJson<Aoe2OsRun>(runPath(input.runId));
    if (!run) throw new Error(`Run not found: ${input.runId}`);
    if (run.bridgeId && run.bridgeId !== input.bridgeId) {
      throw new Error(`Run ${input.runId} belongs to another bridge.`);
    }
    if (!["claimed", "running"].includes(run.status)) {
      throw new Error(`Run ${input.runId} is not active.`);
    }

    const event: Aoe2OsRunEvent = {
      id: randomUUID(),
      runId: input.runId,
      kind: input.kind,
      message: input.message.slice(0, 8_000),
      createdAt: nowIso(),
    };

    await ensureStore();
    await fs.appendFile(eventsPath(input.runId), `${JSON.stringify(event)}\n`, "utf8");

    if (run.status === "claimed") {
      await atomicWriteJson(runPath(run.id), {
        ...run,
        status: "running",
        startedAt: run.startedAt ?? event.createdAt,
      } satisfies Aoe2OsRun);
    }

    return event;
  });
}

export async function completeAoe2OsRun(input: {
  runId: string;
  bridgeId: string;
  exitCode: number;
  result?: unknown;
  error?: string | null;
  stdoutTail?: string | null;
}) {
  return serializeMutation(async () => {
    const run = await readJson<Aoe2OsRun>(runPath(input.runId));
    if (!run) throw new Error(`Run not found: ${input.runId}`);
    if (run.bridgeId && run.bridgeId !== input.bridgeId) {
      throw new Error(`Run ${input.runId} belongs to another bridge.`);
    }

    const completedAt = nowIso();
    const next: Aoe2OsRun = {
      ...run,
      bridgeId: input.bridgeId,
      status: input.exitCode === 0 ? "succeeded" : "failed",
      startedAt: run.startedAt ?? run.claimedAt ?? completedAt,
      completedAt,
      exitCode: input.exitCode,
      result: input.result ?? null,
      error: input.error?.slice(0, 20_000) || null,
      stdoutTail: input.stdoutTail?.slice(-40_000) || null,
    };
    await atomicWriteJson(runPath(run.id), next);
    return next;
  });
}

export async function writeAoe2OsBridgeHeartbeat(
  heartbeat: Omit<Aoe2OsBridgeHeartbeat, "lastSeenAt">
) {
  const next: Aoe2OsBridgeHeartbeat = {
    ...heartbeat,
    capabilities: heartbeat.capabilities.filter(isAoe2OsAction),
    lastSeenAt: nowIso(),
  };
  await serializeMutation(() => atomicWriteJson(bridgePath(), next));
  return next;
}

export async function writeAoe2OsSnapshot(input: {
  bridgeId: string;
  runId?: string | null;
  sourceAction: string;
  payload: Record<string, unknown>;
}) {
  const p0 = Number(input.payload.p0 ?? 0);
  const p1 = Number(input.payload.p1 ?? 0);
  const estate =
    typeof input.payload.estate === "string" ? input.payload.estate : "UNKNOWN";
  const generatedAt =
    typeof input.payload.generated_at === "string"
      ? input.payload.generated_at
      : nowIso();

  const snapshot: Aoe2OsSnapshot = {
    bridgeId: input.bridgeId,
    runId: input.runId ?? null,
    sourceAction: input.sourceAction,
    generatedAt,
    receivedAt: nowIso(),
    estate,
    p0: Number.isFinite(p0) ? p0 : 0,
    p1: Number.isFinite(p1) ? p1 : 0,
    payload: input.payload,
  };

  await serializeMutation(() => atomicWriteJson(snapshotPath(), snapshot));
  return snapshot;
}

export async function readAoe2OsRunEvents(runId: string, limit = 240) {
  try {
    const text = await fs.readFile(eventsPath(runId), "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as Aoe2OsRunEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function loadAoe2OsDashboard(): Promise<Aoe2OsDashboard> {
  await ensureStore();
  const [bridge, snapshot, runs] = await Promise.all([
    readJson<Aoe2OsBridgeHeartbeat>(bridgePath()),
    readJson<Aoe2OsSnapshot>(snapshotPath()),
    listRuns(20),
  ]);

  const activeBase = runs.find((run) => RUN_STATUSES_ACTIVE.has(run.status)) ?? null;
  const activeRun = activeBase
    ? {
        ...activeBase,
        events: await readAoe2OsRunEvents(activeBase.id),
      }
    : null;

  return {
    storeDir: storeRoot(),
    bridge: bridge
      ? {
          ...bridge,
          online: bridgeIsOnline(bridge),
        }
      : null,
    snapshot,
    activeRun,
    recentRuns: runs.slice(0, 12),
    actions: (Object.keys(AOE2_OS_ACTIONS) as Aoe2OsAction[]).map((action) => ({
      action,
      ...AOE2_OS_ACTIONS[action],
    })),
  };
}
