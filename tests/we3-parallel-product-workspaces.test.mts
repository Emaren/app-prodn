import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORK_ENVIRONMENTS, WORK_ENVIRONMENT_SCHEMA, parseObservedBranch,
} from "../lib/workEnvironmentEvidence.ts";

const page = readFileSync("app/admin/central-command/workspaces/page.tsx", "utf8");
const client = readFileSync("components/admin/work-environments/FactoryLiveReceipt.tsx", "utf8");
const source = readFileSync("lib/workEnvironmentEvidence.ts", "utf8");
const nav = readFileSync("lib/navigationAtlas.ts", "utf8");
const central = readFileSync("components/central-command/CentralCommandView.tsx", "utf8");

test("two configured PRODUCT benches have disjoint namespaces and separate ownership", () => {
  assert.equal(WORK_ENVIRONMENT_SCHEMA, "aoe2war.product.work-environments.v1");
  assert.deepEqual(WORK_ENVIRONMENTS.map(x => x.id), ["WE2", "WE3"]);
  assert.notEqual(WORK_ENVIRONMENTS[0].branch, WORK_ENVIRONMENTS[1].branch);
  assert.notEqual(WORK_ENVIRONMENTS[0].namespace, WORK_ENVIRONMENTS[1].namespace);
  assert.equal(WORK_ENVIRONMENTS[1].isolation, "INDEPENDENT_GIT_AND_DEPENDENCIES_UID650");
  assert.match(WORK_ENVIRONMENTS[1].branch, /^we3\//);
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
  assert.match(page, /await requireServerAdmin\(\)/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /readWorkEnvironmentEvidence\(\)/);
  assert.match(page, /Session heartbeat: UNKNOWN/);
  assert.match(page, /FINANCIAL authorization remains denied/);
  assert.match(page, /VPSSentry/);
  assert.match(page, /FactoryLiveReceipt/);
  assert.equal((nav.match(/href:"\/admin\/central-command\/workspaces"/g) || []).length, 1);
  assert.match(central, /href="\/admin\/central-command\/workspaces"/);
});

test("production and branch proofs cannot be confused with agent presence", () => {
  assert.match(source, /sessionPresence: "UNKNOWN"/);
  assert.match(source, /localDirtyState: "UNKNOWN"/);
  assert.match(source, /AbortSignal\.timeout\(3000\)/);
  assert.match(source, /process\.env\.GITHUB_TOKEN/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /SOURCE_OBSERVED/);
  assert.match(client, /fetch\("\/factory\/status\.json"/);
  assert.match(client, /15 \* 60_000/);
  assert.match(client, /STALE — no current production claim/);
  assert.match(client, /UNKNOWN — no verified live source/);
  assert.doesNotMatch(page + client + source, /child_process|execFile|shell_exec|unlink|rmSync/);
});
