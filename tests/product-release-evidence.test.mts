import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProductDeploymentClocks } from "../lib/productReleaseEvidence.ts";

const SOURCE = "9c5fb786b06636a813235bc13cb2cdffaf51ffc4";
const BUILD = "tODeDszM3vE1kOKcQUQjZ";
const accepted = {
  schema: "aoe2war.product.deployment-invocation.v1",
  sourceSha: SOURCE,
  buildId: BUILD,
  coverage: "full",
  kind: "warm",
  firstVerifiedLiveMs: 86996.33125,
  durableAcceptanceMs: 154417.827625,
};

test("real public Factory invocation clocks bind to identical release source and build", () => {
  assert.deepEqual(parseProductDeploymentClocks(accepted, SOURCE, BUILD), {
    state: "MATCHED_PUBLIC_RECEIPT",
    firstVerifiedLiveMs: 86996.33125,
    durableAcceptanceMs: 154417.827625,
    deploymentKind: "warm",
  });
});

test("a different release, source, build or partial acceptance cannot lend its T10 stopwatch", () => {
  for (const malformed of [
    { ...accepted, schema: "aoe2war.product.release-summary.v1" },
    { ...accepted, sourceSha: "a".repeat(40) },
    { ...accepted, buildId: "otherBuildID_123" },
    { ...accepted, coverage: "partial" },
    { ...accepted, kind: "unverified" },
    { ...accepted, durableAcceptanceMs: 13000 },
    { ...accepted, firstVerifiedLiveMs: 13000, durableAcceptanceMs: 12000 },
    { ...accepted, firstVerifiedLiveMs: -1 },
    { ...accepted, durableAcceptanceMs: Number.NaN },
    { ...accepted, durableAcceptanceMs: Number.POSITIVE_INFINITY },
    { ...accepted, firstVerifiedLiveMs: 86400001 },
    null, {}, [], "not a receipt",
  ]) {
    const result = parseProductDeploymentClocks(malformed, SOURCE, BUILD);
    assert.equal(result.state, "UNKNOWN", JSON.stringify(malformed));
    assert.equal(result.firstVerifiedLiveMs, null);
    assert.equal(result.durableAcceptanceMs, null);
  }
  assert.equal(parseProductDeploymentClocks(accepted, "malformed", BUILD).state, "UNKNOWN");
  assert.equal(parseProductDeploymentClocks(accepted, SOURCE, "bad").state, "UNKNOWN");
});

test("equal source and full coverage can have independently recorded cold deployment", () => {
  assert.equal(parseProductDeploymentClocks({ ...accepted, kind: "cold" }, SOURCE, BUILD).deploymentKind, "cold");
});

test("Factory presentation requires fresh PASS source and only source-matched stopwatch", () => {
  const source = readFileSync("components/admin/work-environments/FactoryLiveReceipt.tsx", "utf8");
  assert.match(source, /body\.liveRelease\.status !== "pass"/);
  assert.match(source, /parseProductDeploymentClocks\(/);
  assert.match(source, /Command start → first verified live/);
  assert.match(source, /Command start → durable acceptance/);
  assert.match(source, /proof\.firstLiveMs !== null/);
  assert.match(source, /proof\.acceptedMs !== null/);
  assert.match(source, /STALE — no current production claim/);
  assert.match(source, /UNKNOWN — no verified live source/);
  assert.match(source, /not a signed root permit/);
});

test("visible WE3 review queue links to exact source PRs, not stale Storage OS work", () => {
  const source = readFileSync("components/admin/work-environments/WorkEnvironmentObservatory.tsx", "utf8");
  for (const suffix of ["/pull/1362", "/pull/1363", "/pull/1364", "/issues/787"]) {
    assert.ok(source.includes("https://github.com/Emaren/app-prodn" + suffix), suffix);
  }
  assert.match(source, /live CI, merge approval, session or deployment-status claims/);
  assert.match(source, /href="https:\/\/github\.com\/Emaren\/VPSSentry"/);
  assert.doesNotMatch(source, /VPSSentry\/pull\/76/);
});
