import "server-only";

import { constants } from "node:fs";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { buildGeneralInspectionsSnapshot } from "@/lib/generalInspections/serverSnapshot";
import { buildKingdomAgentsPublicSnapshot } from "@/lib/kingdomAgentsPublic";
import type { KingdomAgentPublic } from "@/lib/kingdomAgentsPublic";

const OWNER = "Emaren";
const REPOSITORY = "app-prodn";
const REFRESH_SECONDS = 45;
const RELEASE_ACTIONS = new Set(["deploy", "finish", "rollback"]);
const RUNNING = new Set(["queued", "claimed", "running"]);

export type OsEvent = {
  id: string;
  kind: "commit" | "pull_request" | "ci" | "release_control";
  title: string;
  detail: string;
  at: string;
  url: string | null;
  state: "success" | "working" | "failed" | "neutral";
};
export type OsPublicSnapshot = {
  schema: 1;
  observedAt: string;
  sourceBaseline: {
    capturedAt: string;
    sourceSha: string;
    sourceRun: string;
    sourceFiles: number;
    sourceLines: number;
    modules: number;
    dependencies: number;
    runtimeEdges: number;
    typeEdges: number;
    runtimeCycles: number;
    typeCycles: number;
    apiRoutes: number;
    handlers: number;
    mutatingRoutes: number;
    prismaModels: number;
    prismaMigrations: number;
    pythonPassed: number;
    pythonSkipped: number;
    watcherPassed: number;
    documents: number;
    largeModules: number;
    giantModules: number;
    duplicateGroups: number;
    clientServerViolations: number;
  };
  release: {
    sha: string | null;
    buildVersion: string | null;
    inspectionAt: string | null;
    lastDeployAt: string | null;
    deploying: boolean;
    releaseAction: string | null;
    releaseStatus: string | null;
    evidence: "verified" | "unavailable";
  };
  github: {
    connected: boolean;
    workflow: { name: string; status: string; conclusion: string | null; at: string; url: string } | null;
    openPrCount: number | null;
    latestCommitSha: string | null;
  };
  inspections: { score: number | null; categories: { name: string; score: number; state: string }[] };
  agentCounts: { healthy: number; working: number; watch: number; blocked: number; unknown: number };
  agents: Pick<KingdomAgentPublic, "id" | "name" | "lane" | "state" | "evidenceAt">[];
  events: OsEvent[];
};

const baseline: OsPublicSnapshot["sourceBaseline"] = {
  capturedAt: "2026-10-15T22:55:26Z",
  sourceSha: "37c3d4c6c860a6039a39af622ef62e6895c46a96",
  sourceRun: "https://github.com/Emaren/app-prodn/actions/runs/38820549197",
  sourceFiles: 1802,
  sourceLines: 653651,
  modules: 1175,
  dependencies: 3121,
  runtimeEdges: 2874,
  typeEdges: 247,
  runtimeCycles: 2,
  typeCycles: 1,
  apiRoutes: 262,
  handlers: 356,
  mutatingRoutes: 154,
  prismaModels: 193,
  prismaMigrations: 118,
  pythonPassed: 1177,
  pythonSkipped: 11,
  watcherPassed: 115,
  documents: 92,
  largeModules: 84,
  giantModules: 25,
  duplicateGroups: 0,
  clientServerViolations: 0,
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function stamp(value: unknown): string | null {
  const text = string(value);
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;
}
function safeUrl(value: unknown): string | null {
  const candidate = string(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" && parsed.hostname === "github.com"
      && parsed.pathname.startsWith("/Emaren/app-prodn/")) return candidate;
  } catch { /* unknown link */ }
  return null;
}
async function github(relative: string): Promise<unknown> {
  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPOSITORY}/${relative}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "AoE2WAR-OS-ReadOnly" },
      next: { revalidate: REFRESH_SECONDS },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}
async function safeJson(file: string): Promise<Record<string, unknown> | null> {
  // Open without following a symlink and bind the size check to the SAME
  // descriptor we read. Checking lstat then using readFile leaves a race.
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const entry = await handle.stat();
    if (!entry.isFile() || entry.size < 1 || entry.size > 128_000) return null;
    const bytes = Buffer.alloc(entry.size);
    let position = 0;
    while (position < bytes.length) {
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      if (bytesRead <= 0) return null;
      position += bytesRead;
    }
    return object(JSON.parse(bytes.toString("utf8")));
  } catch { return null; }
  finally { await handle?.close().catch(() => {}); }
}

/**
 * A real last-deployment timestamp is emitted ONLY from an exact-source
 * Finish receipt recording production_deployed=true and certified outcome.
 * Never use GitHub commit time, build completion, mtimes or inspection time.
 * This is a bounded local receipt read, NOT a new operator command.
 */
let certifiedCache: { sha: string; checkedAt: number; at: string | null } | null = null;
async function certifiedDeployTime(releaseSha: string | null): Promise<string | null> {
  if (!releaseSha || !/^[a-f0-9]{40}$/i.test(releaseSha)) return null;
  if (certifiedCache?.sha === releaseSha && Date.now() - certifiedCache.checkedAt < 60_000)
    return certifiedCache.at;
  const directory = path.join(process.cwd(), ".aoe2war-release", "finish-receipts");
  let candidates: string[] = [];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    candidates = entries.filter(item => item.isFile() && /^20\d{6}T[A-Za-z0-9-]+\.json$/.test(item.name))
      .map(item => item.name).sort().reverse().slice(0, 28);
  } catch { /* source receipts may live on the operator machine, not VPS */ }
  let found: string | null = null;
  for (const name of candidates) {
    const file = path.join(directory, name);
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > 750_000) continue;
      const receipt = object(JSON.parse(await readFile(file, "utf8")));
      const outcome = string(receipt.release_outcome);
      const source = string(object(object(receipt.certified_release).production).source_sha);
      const at = stamp(receipt.release_certified_at);
      if (receipt.production_deployed === true && source === releaseSha &&
          (outcome === "CERTIFIED" || outcome === "CERTIFIED_WORKSHOP_INCOMPLETE") && at) {
        found = at;
        break;
      }
    } catch { /* invalid or unreadable receipt has no timestamp authority */ }
  }
  certifiedCache = { sha: releaseSha, checkedAt: Date.now(), at: found };
  return found;
}

/** Public RELEASE CONTROL indication only. Never projects usernames, hostnames, logs, parameters or secrets. */
async function releaseControl(): Promise<{
  deploying: boolean; releaseAction: string | null; releaseStatus: string | null;
  event: OsEvent | null;
}> {
  const root = process.env.AOE2WAR_OS_STORE_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "/mnt/HC_Volume_105319120/aoe2war/os-control"
      : path.join(process.cwd(), "storage", "aoe2war-os"));
  const bridge = await safeJson(path.join(root, "state", "bridge.json"));
  const runId = string(bridge?.currentRunId);
  const beat = stamp(bridge?.lastSeenAt);
  if (!runId || !/^[a-zA-Z0-9-]{8,72}$/.test(runId) || !beat
      || Math.abs(Date.now() - Date.parse(beat)) > 90_000) {
    return { deploying: false, releaseAction: null, releaseStatus: null, event: null };
  }
  const run = await safeJson(path.join(root, "runs", runId + ".json"));
  const action = string(run?.action);
  const status = string(run?.status);
  if (!action || !status || !RELEASE_ACTIONS.has(action) || !RUNNING.has(status)) {
    return { deploying: false, releaseAction: null, releaseStatus: null, event: null };
  }
  const at = stamp(run?.startedAt) ?? stamp(run?.requestedAt) ?? beat;
  return {
    deploying: true, releaseAction: action, releaseStatus: status,
    event: { id: "control/" + runId, kind: "release_control",
      title: "RELEASE CONTROL · " + action.toUpperCase(),
      detail: status.toUpperCase() + " · certified deployment not yet proven",
      at, url: null, state: "working" },
  };
}

function githubEvents(commits: unknown, pulls: unknown, workflows: unknown): OsEvent[] {
  const events: OsEvent[] = [];
  for (const raw of Array.isArray(commits) ? commits.slice(0, 7) : []) {
    const item = object(raw), commit = object(item.commit), author = object(commit.author);
    const at = stamp(author.date);
    const sha = string(item.sha);
    if (!sha || !at) continue;
    events.push({ id: "commit/" + sha, kind: "commit",
      title: (string(commit.message)?.split("\n")[0] ?? "Commit").slice(0, 130),
      detail: "COMMIT · " + sha.slice(0, 10), at, url: safeUrl(item.html_url), state: "neutral" });
  }
  for (const raw of Array.isArray(pulls) ? pulls.slice(0, 8) : []) {
    const p = object(raw), number = Number(p.number);
    const at = stamp(p.updated_at);
    if (!at || !Number.isInteger(number)) continue;
    events.push({ id: "pr/" + number + "/" + at, kind: "pull_request",
      title: (string(p.title) ?? "Pull request").slice(0, 130),
      detail: "PR #" + number + " · " + (p.merged_at ? "MERGED" : string(p.state)?.toUpperCase() ?? "UNKNOWN"),
      at, url: safeUrl(p.html_url), state: p.merged_at ? "success" : "neutral" });
  }
  const workflowRows = object(workflows).workflow_runs;
  for (const raw of Array.isArray(workflowRows) ? workflowRows.slice(0, 8) : []) {
    const w = object(raw), id = Number(w.id), at = stamp(w.updated_at);
    if (!Number.isInteger(id) || !at) continue;
    const status = string(w.status), conclusion = string(w.conclusion);
    const working = status === "queued" || status === "in_progress" || status === "waiting";
    events.push({ id: "ci/" + id, kind: "ci",
      title: (string(w.name) ?? "GitHub Actions").slice(0, 130),
      detail: "GITHUB CI · " + (working ? status?.toUpperCase() : conclusion?.toUpperCase() ?? "UNKNOWN"),
      at, url: safeUrl(w.html_url),
      state: working ? "working" : conclusion === "success" ? "success" : conclusion === "failure" ? "failed" : "neutral" });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 18);
}

export async function buildAoe2warOsPublicSnapshot(options: { includeGithub?: boolean } = {}): Promise<OsPublicSnapshot> {
  const includeGithub = options.includeGithub !== false;
  const [inspectionR, agentsR, controlR, commitsR, pullsR, workflowR] = await Promise.allSettled([
    Promise.resolve().then(() => buildGeneralInspectionsSnapshot()),
    buildKingdomAgentsPublicSnapshot(), releaseControl(),
    includeGithub ? github("commits?per_page=7") : Promise.resolve(null),
    includeGithub ? github("pulls?state=all&sort=updated&direction=desc&per_page=8") : Promise.resolve(null),
    includeGithub ? github("actions/runs?per_page=8") : Promise.resolve(null),
  ]);
  const inspection = inspectionR.status === "fulfilled" ? inspectionR.value : null;
  const agents = agentsR.status === "fulfilled" ? agentsR.value : null;
  const control = controlR.status === "fulfilled" ? controlR.value : null;
  const commits = commitsR.status === "fulfilled" ? commitsR.value : null;
  const pulls = pullsR.status === "fulfilled" ? pullsR.value : null;
  const workflows = workflowR.status === "fulfilled" ? workflowR.value : null;
  const workflowRuns = object(workflows).workflow_runs;
  const latestWorkflow = Array.isArray(workflowRuns) ? object(workflowRuns[0]) : null;
  const publicAgents = agents?.agents.map(item => ({
    id: item.id, name: item.name, lane: item.lane, state: item.state, evidenceAt: item.evidenceAt,
  })) ?? [];
  const agentCounts = { healthy: 0, working: 0, watch: 0, blocked: 0, unknown: 0 };
  publicAgents.forEach(item => { agentCounts[item.state] += 1; });
  const certifiedAt = await certifiedDeployTime(inspection?.releaseSha ?? null);
  const gitEvents = githubEvents(commits, pulls, workflows);
  if (control?.event) gitEvents.unshift(control.event);
  return {
    schema: 1,
    observedAt: new Date().toISOString(),
    sourceBaseline: baseline,
    release: {
      sha: inspection?.releaseSha ?? null,
      buildVersion: inspection?.buildVersion ?? null,
      inspectionAt: inspection?.generatedAt ?? null,
      // Not inferred from CI time, file mtime, build ID, or unverified GitHub deployment.
      lastDeployAt: certifiedAt,
      deploying: control?.deploying ?? false,
      releaseAction: control?.releaseAction ?? null,
      releaseStatus: control?.releaseStatus ?? null,
      evidence: inspection?.releaseSha ? "verified" : "unavailable",
    },
    github: {
      connected: commits !== null || pulls !== null || workflows !== null,
      workflow: latestWorkflow && stamp(latestWorkflow.updated_at) && safeUrl(latestWorkflow.html_url)
        ? { name: string(latestWorkflow.name) ?? "GitHub CI",
          status: string(latestWorkflow.status) ?? "unknown",
          conclusion: string(latestWorkflow.conclusion),
          at: stamp(latestWorkflow.updated_at)!,
          url: safeUrl(latestWorkflow.html_url)! } : null,
      openPrCount: null, // Pull pagination cannot prove the total open PR count.
      latestCommitSha: Array.isArray(commits) ? string(object(commits[0]).sha) : null,
    },
    inspections: {
      score: inspection?.overallScore ?? null,
      categories: inspection?.categories.map(item => ({ name: item.title, score: item.score, state: item.state })) ?? [],
    },
    agentCounts, agents: publicAgents.slice(0, 120), events: gitEvents,
  };
}
