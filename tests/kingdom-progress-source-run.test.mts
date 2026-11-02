import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as projection from "../lib/kingdomProgressProjection.ts";

const ts = createRequire(import.meta.url)("typescript");
const catalog = JSON.parse(readFileSync(new URL("../config/kingdom-progress-projects.json", import.meta.url), "utf8"));
// Sanitized actual authenticated GitHub REST read, 2026-11-02. This historical
// source run is a test fixture, never a production or financial receipt.
const observedRun = {
  id: 41263388091, head_sha: "5f4530253e4c62f70f4e1dc938a4e3723d066fba",
  path: ".github/workflows/ci.yml", status: "completed", conclusion: "success",
  event: "pull_request", repository: { full_name: "Emaren/app-prodn" },
  created_at: "2026-11-01T02:00:33Z",
};
const source = readFileSync(new URL("../app/api/kingdom-progress/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function routeResponse(overrides: Record<string, unknown> = {}, status = 200) {
  const run = { ...observedRun, ...overrides };
  const scope = {
    id: "Q12", label: "Kingdom Progress", category: "experience", href: "/kingdom-progress",
    repo: "Emaren/app-prodn", scopeVersion: "v1-20261029", approved: true,
    lastCodeSha: observedRun.head_sha,
    milestones: [
      { id: "source-tests", label: "Source Tests", gate: "source",
        proof: { kind: "github-actions", sha: observedRun.head_sha, runId: observedRun.id } },
      { id: "live-deployed", label: "Live Deployed", gate: "runtime", proof: null },
    ],
  };
  const body = "<!-- AOE2WAR_PUBLIC_PRIORITY_V1 -->\n" +
    JSON.stringify({ schema: 1, publication: "OWNER_APPROVED_PUBLIC", items: [scope] }) +
    "\n<!-- END_AOE2WAR_PUBLIC_PRIORITY_V1 -->";
  const requests: Array<{ url: string; method: string; cache: string }> = [];
  const exports: { GET?: () => Promise<Response> } = {};
  vm.runInNewContext(compiled, {
    exports, process: { env: {} }, AbortController, setTimeout, clearTimeout,
    async fetch(url: string, options: { method: string; cache: string }) {
      requests.push({ url, method: options.method, cache: options.cache });
      if (url === "https://api.github.com/repos/Emaren/app-prodn/issues/984") {
        return Response.json({ number: 984, body });
      }
      if (url === "https://api.github.com/repos/Emaren/app-prodn/actions/runs/" + observedRun.id) {
        return Response.json(run, { status });
      }
      if (url === "https://api.github.com/repos/Emaren/app-prodn/commits/" + observedRun.head_sha) {
        return Response.json({ sha: observedRun.head_sha,
          commit: { committer: { date: "2026-11-01T01:59:00Z" } } });
      }
      throw new Error("Unexpected source request: " + url);
    },
    require(name: string) {
      if (name === "next/server") return { NextResponse: { json: Response.json.bind(Response) } };
      if (name === "@/config/kingdom-progress-projects.json") return { default: catalog };
      if (name === "@/lib/kingdomProgressProjection") return projection;
      throw new Error("Unexpected route import: " + name);
    },
  }, { filename: "app/api/kingdom-progress/route.ts" });
  assert.ok(exports.GET);
  const response = await exports.GET();
  const result = await response.json();
  return { result, response, requests };
}

test("actual Actions REST path accepts its exact source proof without certifying runtime", async () => {
  const { result, response, requests } = await routeResponse();
  assert.equal(result.status, "FRESH");
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].verifiedCount, 1);
  assert.equal(result.entries[0].percent, 50);
  assert.equal(result.entries[0].milestones[0].verified, true);
  assert.equal(result.entries[0].milestones[1].verified, false);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.ok(requests.length >= 3);
  assert.ok(requests.every(request => request.method === "GET" && request.cache === "no-store"));
});

test("only the four exact known source workflow paths can supply source evidence", async () => {
  for (const name of ["ci", "kingdom-index-source-census", "renaissance-88-factory", "renaissance-88-a11y-preview"]) {
    const { result } = await routeResponse({ path: ".github/workflows/" + name + ".yml" });
    assert.equal(result.entries[0].verifiedCount, 1, name);
  }
  for (const path of [".github/workflows/financial.yml", "prefix/.github/workflows/ci.yml",
    ".github/workflows/ci.yml@refs/heads/main", ".github/workflows/ci.yml.evil",
    ".github/workflows/ci.yml?ref=main", ".github/workflows/ci.yml\n", "https://example.com/.github/workflows/ci.yml"]) {
    const { result } = await routeResponse({ path });
    assert.equal(result.entries[0].verifiedCount, null, path);
    assert.equal(result.entries[0].evidenceStatus, "UNKNOWN", path);
  }
});

test("source identity, successful conclusion, repository, event and date checks remain mandatory", async () => {
  for (const overrides of [
    { head_sha: "0".repeat(40) }, { conclusion: "failure" }, { status: "in_progress" },
    { repository: { full_name: "Other/app-prodn" } }, { event: "workflow_dispatch" },
    { created_at: "2099-11-01T02:00:33Z" },
  ]) {
    const { result } = await routeResponse(overrides);
    assert.equal(result.entries[0].verifiedCount, null, JSON.stringify(overrides));
    assert.equal(result.entries[0].percent, null);
  }
});

test("GitHub denial keeps unavailable source evidence UNKNOWN", async () => {
  const { result } = await routeResponse({}, 403);
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.entries, []);
});
