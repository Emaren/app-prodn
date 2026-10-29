import { NextResponse } from "next/server";
import catalog from "@/config/kingdom-progress-projects.json";
import {
  readPublicPriorityScopes, progressFromVerifiedScope, safeCodeDate,
  type ApprovedScope, type PublicProgressEntry
} from "@/lib/kingdomProgressProjection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicEnvelope = {
  schema: 1; status: "FRESH" | "STALE" | "UNKNOWN";
  observedAt: string | null; readAt: string; entries: PublicProgressEntry[];
};
const CACHE_MS = 120_000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const COMMIT_API = "https://api.github.com/repos/";
let cached: { deadline: number; envelope: PublicEnvelope } | null = null;
let lastGood: { at: number; envelope: PublicEnvelope } | null = null;
let pending: Promise<PublicEnvelope> | null = null;
const scopeRegistry = new Map<string, string>();

const response = (body: PublicEnvelope) => NextResponse.json(body, {
  headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" }
});

async function githubJson(path: string, signal: AbortSignal): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const request = await fetch(COMMIT_API + path, {
    method: "GET", cache: "no-store", signal,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: "Bearer " + token } : {})
    }
  });
  if (request.status === 429 || request.status >= 500 || request.status === 401 || request.status === 403) throw new Error("GitHub transport unavailable");
  if (!request.ok) throw new Error("GitHub source unavailable");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 180_000) throw new Error("Unbounded source");
  const raw = await request.text();
  if (raw.length > 180_000) throw new Error("Unbounded source");
  return JSON.parse(raw) as unknown;
}

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

async function verifiedCodeDate(scope: ApprovedScope, signal: AbortSignal, now: number): Promise<string | null> {
  if (!scope.lastCodeSha) return null;
  try {
    const [owner, repo] = scope.repo.split("/");
    const item = await githubJson(owner + "/" + repo + "/commits/" + scope.lastCodeSha, signal);
    if (!object(item) || item.sha !== scope.lastCodeSha || !object(item.commit) ||
        !object(item.commit.committer)) return null;
    return safeCodeDate(item.commit.committer.date, now);
  } catch (e) { if (String(e).includes("transport unavailable")) throw e; return null; }
}

async function acceptedSourceGates(scope: ApprovedScope, signal: AbortSignal, now: number): Promise<Set<string>> {
  const verified = new Set<string>();
  // Only source CI. Runtime, deployment, finance and custody cannot be attested by GitHub Actions.
  const pendingGates = scope.milestones.filter(m => m.gate === "source" && m.proof);
  await Promise.all(pendingGates.map(async gate => {
    const proof = gate.proof!;
    try {
      const [owner, repo] = scope.repo.split("/");
      const run = await githubJson(owner + "/" + repo + "/actions/runs/" + proof.runId, signal);
      if (!object(run) || run.head_sha !== proof.sha ||
          run.status !== "completed" || run.conclusion !== "success" ||
          !object(run.repository) || run.repository.full_name !== scope.repo ||
          !["pull_request", "push"].includes(String(run.event)) ||
          typeof run.path !== "string" ||
          !/\.github\/workflows\/(?:ci|kingdom-index-source-census|renaissance-88-factory|renaissance-88-a11y-preview)\.yml@/.test(run.path) ||
          !safeCodeDate(run.created_at, now)) return;
      // The owner-approved versioned gate is backed by a successful, SHA-matched
      // source CI receipt. A code CI never certifies live/financial milestones.
      verified.add(gate.id);
    } catch (e) {
      if (String(e).includes("transport unavailable")) throw e;
      // Missing/malformed run is unverified; a rate limit invalidates the whole projection.
    }
  }));
  return verified;
}

async function freshProjection(now: number): Promise<PublicEnvelope> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const issue = await githubJson("Emaren/app-prodn/issues/984", controller.signal);
    if (!object(issue) || issue.number !== 984 || typeof issue.body !== "string") throw new Error("Invalid publication source");
    const scopes = readPublicPriorityScopes(issue.body, catalog.projects);
    const entries: PublicProgressEntry[] = [];
    for (const scope of scopes) {
      // Process-local collision detection only. A restart forgets this map:
      // immutable completion history requires an independently reviewed durable
      // ledger (Q15), not an in-memory claim of permanent certification.
      const key = scope.id + ":" + scope.scopeVersion;
      const shape = JSON.stringify({
        id: scope.id, label: scope.label, href: scope.href, category: scope.category,
        repo: scope.repo, milestones: scope.milestones.map(m => [m.id, m.label, m.gate])
      });
      if (scopeRegistry.has(key) && scopeRegistry.get(key) !== shape) continue;
      const [gates, lastWorkedAt] = await Promise.all([
        acceptedSourceGates(scope, controller.signal, now),
        verifiedCodeDate(scope, controller.signal, now)
      ]);
      const projected = progressFromVerifiedScope(scope, gates, lastWorkedAt);
      // Never relabel an old process-local percentage FRESH after receipts
      // disappear. Stale last-good is reserved for actual source outages.
      entries.push(projected);
      scopeRegistry.set(key, shape);
    }
    const envelope: PublicEnvelope = {
      schema: 1, status: "FRESH", observedAt: new Date(now).toISOString(),
      readAt: new Date(now).toISOString(), entries
    };
    lastGood = { at: now, envelope };
    return envelope;
  } finally { clearTimeout(timeout); }
}

async function getProjection(): Promise<PublicEnvelope> {
  const now = Date.now();
  if (cached && cached.deadline > now) return { ...cached.envelope, readAt: new Date(now).toISOString() };
  if (!pending) {
    pending = freshProjection(now).catch((): PublicEnvelope => {
      const previous = lastGood && now - lastGood.at <= MAX_STALE_MS ? lastGood.envelope : null;
      return {
        schema: 1, status: previous ? "STALE" : "UNKNOWN",
        observedAt: previous?.observedAt ?? null,
        readAt: new Date(now).toISOString(), entries: previous?.entries ?? []
      };
    }).finally(() => { pending = null; });
  }
  const envelope = await pending;
  cached = { deadline: now + CACHE_MS, envelope };
  return envelope;
}

export async function GET() {
  return response(await getProjection());
}
