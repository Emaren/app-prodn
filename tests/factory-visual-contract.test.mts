import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FACTORY_SERVICES, FACTORY_STAGES, FACTORY_TEST_GROUPS,
  readFactoryPublicStatus, unknownFactoryStatus,
} from "../lib/factoryPublicStatus.ts";

const root = new URL("../", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), "utf8");
const template = JSON.parse(read("public/factory/status.json"));
const now = Date.parse("2026-11-12T22:00:00.000Z");
const copy = () => structuredClone(template);

test("public Factory V1 contract has exactly seven stages and fail-closed initial publication", () => {
  assert.deepEqual(FACTORY_STAGES, [
    "develop", "test", "build", "approve", "deploy", "verify", "rollback",
  ]);
  assert.equal(FACTORY_SERVICES.length, 5);
  assert.equal(FACTORY_TEST_GROUPS.length, 6);
  assert.deepEqual(template, unknownFactoryStatus());
  assert.deepEqual(readFactoryPublicStatus(template, now), {
    authority: "unavailable", value: unknownFactoryStatus(),
  });
  assert.equal(template.recentActivity.length, 0);
  assert.equal(Object.keys(template).sort().join(","), [
    "candidateRelease", "generatedAt", "liveRelease", "pipelineStage",
    "previousRelease", "recentActivity", "schema", "serviceHealth", "testGroups",
  ].sort().join(","));
});

test("a fresh source-bound snapshot lights exact stages, groups and beacons with real counts", () => {
  const source = copy();
  const stamp = "2026-11-12T21:59:59.000Z";
  source.generatedAt = stamp;
  source.liveRelease = { id: "9f7b56f536ba51b4678ac43baebfae140ada6479", status: "pass", verifiedAt: stamp };
  source.candidateRelease = { id: "source-candidate-abc", status: "hold", verifiedAt: stamp };
  source.previousRelease = { id: "source-rollback-abc", status: "pass", verifiedAt: stamp };
  source.pipelineStage.active = "test";
  source.pipelineStage.stages.test = "running";
  source.serviceHealth[0].state = "pass";
  source.testGroups[0] = { id: "source", state: "pass", passed: 147, total: 147 };
  source.recentActivity = [{ id: "event-1", label: "Source qualification recorded", state: "pass", at: stamp }];
  const result = readFactoryPublicStatus(source, now);
  assert.equal(result.authority, "fresh");
  assert.equal(result.value.liveRelease.id, source.liveRelease.id);
  assert.equal(result.value.pipelineStage.stages.test, "running");
  assert.equal(result.value.testGroups[0].passed, 147);
  assert.equal(result.value.serviceHealth[0].state, "pass");
  assert.equal(result.value.recentActivity.length, 1);
});

test("expired, future, malformed or partial public feeds cannot produce false green", () => {
  for (const stamp of [
    "2026-11-12T21:49:00.000Z", "2026-11-12T22:02:00.000Z",
  ]) {
    const x = copy();
    x.generatedAt = stamp;
    x.liveRelease = { id: "fake-success", status: "pass", verifiedAt: stamp };
    assert.equal(readFactoryPublicStatus(x, now).value.liveRelease.status, "unknown");
    assert.equal(readFactoryPublicStatus(x, now).authority, "stale");
  }
  type RecordValue = Record<string, unknown>;
  const rec = (x: RecordValue, key: string) => x[key] as RecordValue;
  const group = (x: RecordValue) => x.testGroups as RecordValue[];
  const service = (x: RecordValue) => x.serviceHealth as RecordValue[];
  const invalid: Array<(x: RecordValue) => void> = [
    (x) => { x.schema = "wrong"; },
    (x) => { x.generatedAt = "fake"; },
    (x) => { rec(x, "pipelineStage").active = "pay"; },
    (x) => { rec(rec(x, "pipelineStage"), "stages").deploy = "true"; },
    (x) => { rec(rec(x, "pipelineStage"), "stages").verify = true; },
    (x) => { x.liveRelease = { id: null, status: "pass", verifiedAt: null }; },
    (x) => { rec(x, "candidateRelease").id = "../../financial"; },
    (x) => { service(x)[0].id = "financial"; },
    (x) => { service(x).push(service(x)[0]); },
    (x) => { group(x)[0] = { id: "source", state: "pass", passed: 8, total: 9 }; },
    (x) => { group(x)[0] = { id: "source", state: "pass", passed: 0, total: 0 }; },
    (x) => { group(x)[0] = { id: "source", state: "unknown", passed: -1, total: 12 }; },
    (x) => { x.recentActivity = [{ id: "x", label: "<script>", state: "pass", at: x.generatedAt }]; },
    (x) => { x.recentActivity = [{ id: "x", label: "Old activity", state: "pass", at: "2026-10-01T00:00:00.000Z" }]; },
  ];
  for (const alter of invalid) {
    const x = copy();
    x.generatedAt = "2026-11-12T21:59:59.000Z";
    alter(x);
    const result = readFactoryPublicStatus(x, now);
    assert.equal(result.authority, "unavailable");
    assert.deepEqual(result.value, unknownFactoryStatus());
  }
});

test("route is an actual public Next page without new financial or deployment APIs", () => {
  const page = read("app/factory/page.tsx");
  const ui = read("app/factory/FactoryConsole.tsx");
  const css = read("app/factory/factory.module.css");
  assert.match(page, /alternates: \{ canonical: "\/factory" \}/);
  assert.match(page, /FactoryConsole/);
  for (const name of ["DEVELOP", "TEST", "BUILD", "APPROVE", "DEPLOY", "VERIFY", "ROLLBACK",
    "LIVE RELEASE", "NEXT CANDIDATE", "ROLLBACK TARGET", "THE LIGHT BOARD", "SYSTEM PULSE",
    "RECENT ACTIVITY", "READ-ONLY"]) assert.ok(ui.includes(name), name);
  assert.match(ui, /fetch\("\/factory\/status\.json"/);
  assert.match(ui, /fetch\("\/", \{ method: "HEAD", cache: "no-store"/);
  assert.match(ui, /credentials: "omit"/);
  assert.match(ui, /readFactoryPublicStatus\(JSON\.parse\(body\)\)/);
  assert.doesNotMatch(ui, /method: "POST"|method: "PUT"|method: "DELETE"|\/api\/admin|\/api\/bets|execute-shell/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.stage \{\s*--signal: #55667f/);
  assert.match(css, /\.testCard \{\s*--signal: #52647a/);
  assert.match(css, /factoryOrbit/);
  assert.ok(css.length > 12000);
});

test("the original 88 historical pages remain distinct; Factory is independently unverified", () => {
  const inventory = JSON.parse(read("config/kingdom-index-inventory.json"));
  const campaign = JSON.parse(read("config/renaissance-campaign.json"));
  const history = JSON.parse(read("config/kingdom-index-routes.json"));
  assert.equal(inventory.counts.pageTemplates, 159);
  assert.equal(inventory.counts.excludedStaticTemplates, 13);
  assert.equal(inventory.counts.publicIndexTemplates, 88);
  assert.equal(history.length, 88);
  assert.equal(history.some((x: {href: string}) => x.href === "/factory"), false);
  const found = inventory.pages.filter((p: {href: string}) => p.href === "/factory");
  assert.deepEqual(found, [{ href: "/factory", entrypoint: "app/factory/page.tsx",
    scope: "excluded-static", assurance: "unverified" }]);
  const occurrences = campaign.phases.flatMap((p: {routes: string[]}) => p.routes)
    .filter((path: string) => path === "/factory");
  assert.equal(occurrences.length, 1);
  assert.ok(read("docs/audits/performance-route-cohort-v2.txt").includes("\n/factory\n"));
});
