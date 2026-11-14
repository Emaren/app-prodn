import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FACTORY_SERVICES, FACTORY_STAGES, FACTORY_TEST_GROUPS,
  readFactoryPublicStatus, unknownFactoryStatus, factoryHeadroomEvidence,
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

test("a fresh host envelope cannot substitute for source-linked pipeline evidence", () => {
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
  assert.equal(result.value.pipelineStage.stages.test, "unknown");
  assert.equal(result.value.testGroups[0].passed, null);
  assert.equal(result.value.testGroups[0].state, "unknown");
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
  for (const name of ["SOURCE / BRANCH", "CI / SECURITY", "LINUX BUILD", "INDEPENDENT VERIFY", "TRANSPORT / STAGING", "ACTIVATION / HTTPS", "ROLLBACK / REACTIVATION",
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


const releaseOsNow = Date.parse("2026-11-13T23:00:00.000Z");
function releaseOsFeed() {
  const value = unknownFactoryStatus();
  value.generatedAt = new Date(releaseOsNow).toISOString();
  value.liveRelease = {id:"f".repeat(40),buildId:"build",status:"pass",verifiedAt:value.generatedAt};
  return {...value,releaseOs:{
    schema:"aoe2war.product.release-summary.v1",sourceSha:"f".repeat(40),buildId:"build",
    generatedAt:value.generatedAt,startKind:"observed-engineering",
    firstVerifiedProductionMs:null,finalAcceptedMs:4000,clocksUncertaintyMs:null,
    provenanceUrl:"https://github.com/Emaren/app-prodn/pull/1350",
    stages:[{event:"T4",state:"pass",at:value.generatedAt,durationMs:42,proofSha256:"a".repeat(64)}],
  }};
}
test("optional release ledger binds source and BUILD_ID",()=>{
  const good=readFactoryPublicStatus(releaseOsFeed(),releaseOsNow);
  assert.equal(good.value.pipelineStage.stages.build,"pass");
  assert.equal(good.value.pipelineStage.stages.approve,"pass");
  assert.equal(good.value.releaseOs?.firstVerifiedProductionMs,null);
  assert.equal(good.value.releaseOs?.finalAcceptedMs,null);
  const source=releaseOsFeed();source.releaseOs.sourceSha="b".repeat(40);
  assert.equal(readFactoryPublicStatus(source,releaseOsNow).value.releaseOs,undefined);
  const build=releaseOsFeed();build.releaseOs.buildId="wrong_build";
  assert.equal(readFactoryPublicStatus(build,releaseOsNow).value.releaseOs,undefined);
});
test("receipt-free and future positive evidence never produces a green stage",()=>{
  const missing=releaseOsFeed();missing.releaseOs.stages[0].proofSha256="";
  assert.equal(readFactoryPublicStatus(missing,releaseOsNow).value.pipelineStage.stages.build,"unknown");
  const future=releaseOsFeed();future.releaseOs.stages[0].at="2026-11-13T23:02:00.000Z";
  assert.equal(readFactoryPublicStatus(future,releaseOsNow).value.pipelineStage.stages.build,"unknown");
});
test("fresh publication cannot freshen expired source evidence",()=>{
  const stage=releaseOsFeed();stage.releaseOs.stages[0].at="2026-11-11T23:00:00.000Z";
  assert.equal(readFactoryPublicStatus(stage,releaseOsNow).value.pipelineStage.stages.build,"stale");
  const summary=releaseOsFeed();summary.releaseOs.generatedAt="2026-11-11T23:00:00.000Z";
  assert.equal(readFactoryPublicStatus(summary,releaseOsNow).value.pipelineStage.stages.build,"stale");
});
test("rollback acceptance requires T8 T9 and T10 proof independently",()=>{
  const value=releaseOsFeed();
  value.releaseOs.stages=["T8","T9"].map(event=>({
    event,state:"pass",at:value.generatedAt,durationMs:10,proofSha256:"a".repeat(64),
  }));
  assert.equal(readFactoryPublicStatus(value,releaseOsNow).value.pipelineStage.stages.rollback,"unknown");
  value.releaseOs.stages.push({event:"T10",state:"pass",at:value.generatedAt,durationMs:10,proofSha256:"b".repeat(64)});
  assert.equal(readFactoryPublicStatus(value,releaseOsNow).value.pipelineStage.stages.rollback,"pass");
  assert.equal(readFactoryPublicStatus(value,releaseOsNow).value.releaseOs?.finalAcceptedMs,4000);
  value.releaseOs.stages[1].proofSha256="";
  assert.equal(readFactoryPublicStatus(value,releaseOsNow).value.pipelineStage.stages.rollback,"unknown");
  assert.equal(readFactoryPublicStatus(value,releaseOsNow).value.releaseOs?.finalAcceptedMs,null);
});
test("empty ledger and private provenance cannot imply completion",()=>{
  const value=releaseOsFeed();value.releaseOs.stages=[];
  value.releaseOs.provenanceUrl="https://other.invalid/root/private";
  const result=readFactoryPublicStatus(value,releaseOsNow);
  assert.ok(FACTORY_STAGES.every(stage=>result.value.pipelineStage.stages[stage]==="unknown"));
  assert.equal(result.value.releaseOs?.provenanceUrl,null);
  assert.ok(read("app/factory/FactoryConsole.tsx").includes("const hasLedger = !!cycle?.stages.length"));
});


const headroomNow = Date.parse("2026-11-14T10:00:00.000Z");
const headroomMinimum = 6 * 1024 ** 3;
const headroomSample = (freeBytes = 7 * 1024 ** 3, ageMs = 30_000) => ({
  rootFreeBytes: freeBytes, requiredBytes: headroomMinimum,
  observedAt: new Date(headroomNow - ageMs).toISOString(),
});

test("headroom reports the actual margin without certifying artifact readiness", () => {
  const above = factoryHeadroomEvidence(headroomSample(), headroomNow);
  assert.equal(above.state, "pass");
  assert.equal(above.freeBytes, 7 * 1024 ** 3);
  assert.equal(above.marginBytes, 1024 ** 3);
  assert.equal(above.ageMs, 30_000);
  const equal = factoryHeadroomEvidence(headroomSample(headroomMinimum), headroomNow);
  assert.equal(equal.state, "pass");
  assert.equal(equal.marginBytes, 0);
  const below = factoryHeadroomEvidence(headroomSample(headroomMinimum - 1), headroomNow);
  assert.equal(below.state, "hold");
  assert.equal(below.marginBytes, -1);
});

test("headroom preserves the ten-minute TTL and future-clock tolerance", () => {
  assert.equal(factoryHeadroomEvidence(headroomSample(undefined, 600_000), headroomNow).state, "pass");
  const expired = factoryHeadroomEvidence(headroomSample(undefined, 600_001), headroomNow);
  assert.equal(expired.state, "stale");
  assert.equal(expired.observedAt, headroomSample(undefined, 600_001).observedAt);
  assert.equal(factoryHeadroomEvidence(headroomSample(undefined, -60_000), headroomNow).state, "pass");
  assert.equal(factoryHeadroomEvidence(headroomSample(undefined, -60_001), headroomNow).state, "unknown");
});

test("malformed capacity or a changed minimum cannot produce a green headroom tile", () => {
  for (const value of [
    undefined, null, {},
    {...headroomSample(), rootFreeBytes: -1},
    {...headroomSample(), rootFreeBytes: 1.5},
    {...headroomSample(), rootFreeBytes: Number.MAX_SAFE_INTEGER + 1},
    {...headroomSample(), requiredBytes: 0},
    {...headroomSample(), requiredBytes: headroomMinimum - 1},
    {...headroomSample(), observedAt: "invalid"},
  ]) assert.equal(factoryHeadroomEvidence(value, headroomNow).state, "unknown");
});

test("fresh host capacity remains distinct from expired historical release evidence", () => {
  const source = releaseOsFeed();
  const value = {
    ...source,
    generatedAt: new Date(headroomNow).toISOString(),
    releaseOs: {
      ...source.releaseOs,
      generatedAt: "2026-11-12T10:00:00.000Z",
      disk: headroomSample(),
    },
  };
  const result = readFactoryPublicStatus(value, headroomNow);
  assert.equal(result.authority, "fresh");
  assert.equal(result.value.pipelineStage.stages.build, "stale");
  assert.equal(factoryHeadroomEvidence(result.value.releaseOs?.disk, headroomNow).state, "pass");
  value.releaseOs.disk = headroomSample(undefined, 600_001);
  assert.equal(factoryHeadroomEvidence(
    readFactoryPublicStatus(value, headroomNow).value.releaseOs?.disk, headroomNow,
  ).state, "stale");
});

test("capacity presentation names its scope and retains inspectable observation provenance", () => {
  const ui = read("app/factory/FactoryConsole.tsx");
  assert.ok(ui.includes("LIVE ROOT HEADROOM"));
  assert.ok(ui.includes("Capacity only · release readiness unverified"));
  assert.ok(ui.includes('dateTime={headroom.observedAt}'));
  assert.ok(ui.includes("Incoming artifact and extraction readiness are UNKNOWN."));
  assert.ok(ui.includes("factoryHeadroomEvidence(cycle?.disk)"));
});
