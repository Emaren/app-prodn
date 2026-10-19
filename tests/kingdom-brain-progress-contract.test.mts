import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const atlas = read("config/kingdom-brain-authorities.json");
const patrol = read("config/kingdom-patrol-disciplines.json");
const projects = read("config/kingdom-progress-projects.json");
const routes = read("config/kingdom-index-routes.json");
const assurance = read("config/kingdom-index-assurance-profiles.json");
const cohort = readFileSync(new URL("docs/audits/performance-route-cohort-v2.txt", root), "utf8").split(/\r?\n/).filter(v => v.startsWith("/"));

test("Brain atlas has one owner and stable local public path per authority", () => {
  assert.equal(atlas.schema, 1);
  assert.equal(atlas.kind, "aoe2war-authority-map");
  const keys = new Set<string>();
  const publicRoutes = new Set(routes.map((r: { href: string }) => r.href));
  for (const node of atlas.nodes) {
    assert.match(node.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(!keys.has(node.id), "duplicate authority " + node.id);
    keys.add(node.id);
    assert.ok(node.owner && node.authority && node.evidence, "undeclared authority " + node.id);
    assert.ok(publicRoutes.has(node.publicPath), "missing destination " + node.publicPath);
    assert.ok(!node.authority.includes("CERTIFIED"), "no synthetic certification claims");
  }
  assert.ok(keys.has("intelligence") && keys.has("replay") && keys.has("finance"));
  assert.ok(atlas.edges.length > 0);
  const edges = new Set<string>();
  for (const e of atlas.edges) {
    assert.ok(keys.has(e.from) && keys.has(e.to) && e.from !== e.to);
    assert.ok(e.relation);
    const id = e.from + "/" + e.to;
    assert.ok(!edges.has(id), "duplicate edge " + id);
    edges.add(id);
  }
});

test("Eight patrols are explicit policies, not fictional active agents", () => {
  assert.equal(patrol.schema, 1);
  assert.equal(patrol.disciplines.length, 8);
  const ids = new Set<string>();
  for (const p of patrol.disciplines) {
    assert.ok(!ids.has(p.id), "duplicate patrol");
    ids.add(p.id);
    assert.ok(p.triggers.length > 0 && p.evidence.length > 10);
  }
  assert.equal(patrol.rule.statusDefault, "unverified");
  assert.equal(patrol.rule.maxAutomaticFinancialActions, 0);
  const source = readFileSync(new URL("lib/kingdomPatrolCoverage.ts", root), "utf8");
  assert.match(source, /POLICY_ONLY/);
  assert.match(source, /agentsRunning: null/);
});

test("All registered routes, including new instruments, have explicit profiles", () => {
  const hrefs = routes.map((r: { href: string }) => r.href);
  assert.equal(hrefs.length, new Set(hrefs).size);
  for (const href of ["/kingdom-brain", "/kingdom-progress"]) {
    assert.ok(hrefs.includes(href));
    assert.ok(cohort.includes(href));
    assert.ok(assurance.routeProfiles[href]);
    const page = readFileSync(new URL("app" + href + "/page.tsx", root), "utf8");
    assert.match(page, /export default function/);
  }
  for (const row of routes) assert.ok(assurance.routeProfiles[row.href], "missing assurance profile: " + row.href);
});

test("Project scope cannot claim unearned percent or fabricated engineering hours", () => {
  assert.equal(projects.schema, 1);
  const ids = new Set<string>();
  const hrefs = new Set(routes.map((r: { href: string }) => r.href));
  for (const p of projects.projects) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(hrefs.has(p.href));
    assert.ok(p.milestones.length > 1);
    assert.equal(new Set(p.milestones).size, p.milestones.length);
    for (const field of ["percent", "hours", "commits", "startAt", "completed"]) assert.ok(!(field in p), "unverified field: " + field);
  }
  assert.ok(ids.has("auto-satchel") && ids.has("parser-engine") && ids.has("replay-truth"));
});

test("Brain and Progress client code remain display-only with bounded polling", () => {
  for (const path of ["app/kingdom-brain/KingdomBrainClient.tsx", "app/kingdom-progress/KingdomProgressClient.tsx"]) {
    const source = readFileSync(new URL(path, root), "utf8");
    assert.match(source, /visibilitychange/);
    assert.match(source, /AbortController/);
    assert.match(source, /cache: "no-store"/);
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  }
});
