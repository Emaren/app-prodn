import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORK_ENVIRONMENTS, WORK_ENVIRONMENT_SCHEMA, parseObservedBranch,
  readWorkEnvironmentEvidence,
} from "../lib/workEnvironmentEvidence.ts";

const page = readFileSync("components/admin/work-environments/WorkEnvironmentObservatory.tsx", "utf8");
const lanes = readFileSync("app/admin/central-command/lanes/page.tsx", "utf8");
const client = readFileSync("components/admin/work-environments/FactoryLiveReceipt.tsx", "utf8");
const source = readFileSync("lib/workEnvironmentEvidence.ts", "utf8");
const boundedRead = readFileSync("lib/githubBoundedPublicRead.ts", "utf8");
const nav = readFileSync("lib/navigationAtlas.ts", "utf8");
const central = readFileSync("components/central-command/CentralCommandView.tsx", "utf8");

test("two configured PRODUCT benches have disjoint namespaces and separate ownership", () => {
  assert.equal(WORK_ENVIRONMENT_SCHEMA, "aoe2war.product.work-environments.v1");
  assert.deepEqual(WORK_ENVIRONMENTS.map(x => x.id), ["WE2", "WE3"]);
  assert.notEqual(WORK_ENVIRONMENTS[0].branch, WORK_ENVIRONMENTS[1].branch);
  assert.notEqual(WORK_ENVIRONMENTS[0].namespace, WORK_ENVIRONMENTS[1].namespace);
  assert.equal(WORK_ENVIRONMENTS[1].isolation, "INDEPENDENT_GIT_AND_DEPENDENCIES_UID650");
  assert.match(WORK_ENVIRONMENTS[1].branch, /^session-c\/we3-/);
  assert.match(WORK_ENVIRONMENTS[0].branch, /^session-c\//);
});

test("GitHub branch proof is only an exact-name full-SHA source observation", () => {
  const id = "a".repeat(40);
  const branch = WORK_ENVIRONMENTS[1].branch;
  const at = "2026-11-15T00:37:00.000Z";
  assert.deepEqual(parseObservedBranch({ name: branch, commit: { sha: id } }, branch, at),
    { state: "GITHUB_REF_OBSERVED", headSha: id, observedAt: at, reason: "SOURCE_OBSERVED" });
  for (const bad of [
    {}, null, { name: "main", commit: { sha: id } },
    { name: branch, commit: { sha: "stale" } },
    { name: branch, commit: {} }, [branch],
  ]) {
    assert.deepEqual(parseObservedBranch(bad, branch, at),
      { state: "UNKNOWN", headSha: null, observedAt: null, reason: "NOT_OBSERVED" });
  }
});

test("admin workspaces are authenticated, read-only and in the navigation atlas", () => {
  assert.match(lanes, /await requireServerAdmin\(\)/);
  assert.match(lanes, /export const dynamic="force-dynamic"/);
  assert.match(page, /readWorkEnvironmentEvidence\(\)/);
  assert.match(page, /Session heartbeat: UNKNOWN/);
  assert.match(page, /FINANCIAL authorization remains denied/);
  assert.match(page, /VPSSentry/);
  assert.match(page, /FactoryLiveReceipt/);
  assert.doesNotMatch(page, /text-slate-500/, "low-contrast source observation text");
  assert.match(page, /mt-1 text-slate-300/, "observed GitHub timestamp is high contrast");
  assert.match(lanes, /WorkEnvironmentObservatory/);
  assert.equal((nav.match(/href:"\/admin\/central-command\/lanes"/g) || []).length, 1);
  assert.match(central, /href="\/admin\/central-command\/lanes#work-environments"/);
});

test("production and branch proofs cannot be confused with agent presence", () => {
  assert.match(source, /sessionPresence: "UNKNOWN"/);
  assert.match(source, /localDirtyState: "UNKNOWN"/);
  assert.match(boundedRead, /AbortSignal\.timeout\(3000\)/);
  assert.match(boundedRead, /process\.env\.GITHUB_TOKEN/);
  assert.doesNotMatch(source, /if \(!token\) return unknown/, "public repo cannot require a secret");
  assert.match(boundedRead, /token \? \{ Authorization:/, "send auth only if available");
  assert.match(boundedRead, /cache: "no-store"/);
  assert.match(source, /SOURCE_OBSERVED/);
  assert.match(client, /fetch\("\/factory\/status\.json"/);
  assert.match(client, /15 \* 60_000/);
  assert.match(client, /STALE — no current production claim/);
  assert.match(client, /UNKNOWN — no verified live source/);
  assert.doesNotMatch(page + client + source, /child_process|execFile|shell_exec|unlink|rmSync/);
});

// The repo is publicly observable. A missing production token is NOT
// absence of branch evidence, and no synthetic online agent is implied.
test("known public GitHub branches are read without an API secret", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.GITHUB_TOKEN;
  const observed: { url: string; authorization: string | null }[] = [];
  try {
    delete process.env.GITHUB_TOKEN;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      const headers = new Headers(init?.headers);
      observed.push({ url: target, authorization: headers.get("authorization") });
      const match = WORK_ENVIRONMENTS.find(lane => target.endsWith(encodeURIComponent(lane.branch)));
      assert.ok(match, "only explicitly configured lanes may be queried");
      return new Response(JSON.stringify({
        name: match.branch, commit: { sha: "a".repeat(40) },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await readWorkEnvironmentEvidence();
    assert.equal(observed.length, 2);
    assert.ok(observed.every(row => row.authorization === null));
    assert.ok(result.lanes.every(lane => lane.remote.state === "GITHUB_REF_OBSERVED"));
    assert.equal(result.sessionPresence, "UNKNOWN");
    assert.equal(result.localDirtyState, "UNKNOWN");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = oldToken;
  }
});

test("public GitHub failures must show UNKNOWN, never fake branch activity", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.GITHUB_TOKEN;
  try {
    delete process.env.GITHUB_TOKEN;
    globalThis.fetch = async () => new Response("Not found", { status: 404 });
    const result = await readWorkEnvironmentEvidence();
    assert.ok(result.lanes.every(lane => lane.remote.state === "UNKNOWN"));
    assert.ok(result.lanes.every(lane => lane.remote.headSha === null));
    assert.equal(result.sessionPresence, "UNKNOWN");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = oldToken;
  }
});
