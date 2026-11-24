import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  buildUmbrellaTree, verifyLight, UMBRELLA_GRAPH_SCHEMA, WORKSPACE_LAYOUT_SLOTS,
} from "../lib/umbrellaTreeModel.ts";

const raw = JSON.parse(readFileSync("config/aoe2war-os-registry.v1.json", "utf8"));
const graph = buildUmbrellaTree(raw);
const page = readFileSync("app/admin/aoe2war-os/umbrella-tree/page.tsx", "utf8");
const component = readFileSync("components/umbrella-tree/UmbrellaTreeClient.tsx", "utf8");
const style = readFileSync("components/umbrella-tree/UmbrellaTree.module.css", "utf8");
const nav = readFileSync("lib/navigationAtlas.ts", "utf8");

test("complete canonical OS catalog is read from existing registry, not duplicated", () => {
  assert.equal(graph.schema, UMBRELLA_GRAPH_SCHEMA);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.nodes.filter(n => n.kind === "umbrella").length, 1);
  assert.equal(graph.nodes.filter(n => n.kind === "os").length, raw.subordinate_os.length);
  assert.equal(graph.nodes.filter(n => n.kind === "role").length, raw.supervisory_roles.length);
  assert.equal(graph.sourceBaseline, raw.source_baseline_main);
  for (const entry of raw.subordinate_os) {
    const node = graph.nodes.find(n => n.id === entry.canonical_id);
    assert.equal(node?.name, entry.name);
    assert.equal(node?.parentId, entry.parent_os_id ?? "aoe2war.os.umbrella");
    assert.equal(node?.liveStatus, "UNKNOWN");
    assert.equal(node?.evidenceAt, null);
  }
});

test("sessions are namespaced by workspace: WE1/A differs from WE2/A and WE3/A", () => {
  for (const key of ["we1", "we2", "we3"]) {
    const we = graph.nodes.find(n => n.id === "aoe2war.workspace." + key);
    assert.equal(we?.parentId, "aoe2war.os.workspace");
    assert.equal(we?.catalogState, "DECLARED_ONLY");
    assert.equal(we?.liveStatus, "UNKNOWN");
  }
  const sessions = graph.nodes.filter(n => n.kind === "session");
  assert.equal(sessions.length, WORKSPACE_LAYOUT_SLOTS.reduce((sum, slot) => sum + slot.sessionSlots.length, 0));
  const a = sessions.filter(n => n.name === "Session A");
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map(s => s.id)).size, 3);
  assert.equal(new Set(a.map(s => s.parentId)).size, 3);
  for (const s of sessions) {
    assert.equal(s.isIllustrative, true);
    assert.equal(s.catalogState, "DECLARED_ONLY");
    assert.equal(s.authority, "NO_ROLE_ASSIGNED");
    assert.equal(s.liveStatus, "UNKNOWN");
  }
});

test("roles and aliases grant no OS count or physical signing privilege", () => {
  const roles = graph.nodes.filter(n => n.kind === "role");
  assert.equal(roles.length, 3);
  assert.ok(roles.every(n => n.id.startsWith("aoe2war.role.")));
  assert.ok(roles.every(n => n.authority !== "protected-release-executor"));
  assert.ok(!graph.nodes.some(n => n.name === "Performance OS" && n.id !== "aoe2war.os.speed"));
  assert.ok(!graph.nodes.some(n => n.id === "aoe2war.os.system-composer"));
  assert.ok(graph.edges.every(e => e.assertion === "CATALOG_ONLY"));
  assert.ok(graph.edges.filter(e => e.kind === "architectural-handoff").length > 0);
});

test("invalid and malicious registry fails closed, not as partial healthy graph", () => {
  type Fixture = {
    subordinate_os: Array<{ canonical_id: string; immutable_id: boolean }>;
    supervisory_roles: Array<{ not_subordinate_os: boolean }>;
    umbrella: { id: string };
  };
  const mutate = (edit: (x: Fixture) => void) => {
    const x = structuredClone(raw) as Fixture;
    edit(x);
    return buildUmbrellaTree(x);
  };
  for (const bad of [
    null, [], {}, { ...raw, schema: "unknown" },
  ]) assert.ok(buildUmbrellaTree(bad).errors.length > 0);
  assert.equal(mutate(x => { x.subordinate_os[1].canonical_id = x.subordinate_os[0].canonical_id; }).nodes.length, 0);
  assert.equal(mutate(x => { x.subordinate_os[0].canonical_id = "aoe2war.os.bad<script>"; }).nodes.length, 0);
  assert.equal(mutate(x => { x.subordinate_os[0].immutable_id = false; }).nodes.length, 0);
  assert.equal(mutate(x => { x.supervisory_roles[0].not_subordinate_os = false; }).nodes.length, 0);
  assert.equal(mutate(x => { x.umbrella.id = "fake"; }).nodes.length, 0);
});

test("same-label sessions across 150+ workspace slots remain unique, bounded and unverified", () => {
  const workspaces = Array.from({ length: 120 }, (_, i) => ({
    id: "WE" + (i + 1), label: "Work Environment " + (i + 1), sessionSlots: ["A", "B", "C"],
  }));
  const start = performance.now();
  const large = buildUmbrellaTree(raw, workspaces);
  const elapsed = performance.now() - start;
  assert.deepEqual(large.errors, []);
  assert.ok(large.nodes.length > 350);
  assert.equal(new Set(large.nodes.map(n => n.id)).size, large.nodes.length);
  assert.equal(large.nodes.filter(n => n.kind === "session").length, 360);
  assert.ok(elapsed < 500, "pure 100+ model must not require a heavy layout or remote collector");
  assert.equal(large.nodes.filter(n => n.liveStatus !== "UNKNOWN").length, 0);
  assert.equal(buildUmbrellaTree(raw, [...workspaces, ...workspaces]).errors[0], "INVALID_REGISTRY_BOUNDARY");
});

test("fresh, source-specific evidence only; malformed, stale and swapped receipts are UNKNOWN", () => {
  const id = "aoe2war.os.release", now = Date.parse("2026-11-15T16:00:00Z");
  const valid = {
    schema: "aoe2war.umbrella.light.v1", nodeId: id,
    state: "OBSERVED", observedAt: "2026-11-15T15:59:00Z",
    provenance: "https://github.com/Emaren/app-prodn/actions/runs/1234567",
    sourceSha: "a".repeat(40),
  };
  assert.equal(verifyLight(valid, id, now).state, "OBSERVED");
  for (const patch of [
    { observedAt: "2026-11-15T14:59:00Z" },
    { observedAt: "2026-11-15T16:15:00Z" },
    { nodeId: "aoe2war.os.workspace" },
    { provenance: "javascript:alert(1)" },
    { provenance: "https://evil.example/green" },
    { state: "VERIFIED_BY_MAGIC" },
    { sourceSha: "short" },
    { schema: "untrusted" },
  ]) assert.deepEqual(verifyLight({ ...valid, ...patch }, id, now),
    { state: "UNKNOWN", observedAt: null, provenance: null });
  assert.equal(verifyLight(null, id, now).state, "UNKNOWN");
});

test("private route and UI do not grant credentials or invent agent/financial authority", () => {
  assert.match(page, /await requireServerAdmin\(\)/);
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
  assert.match(nav, /href:"\/admin\/aoe2war-os\/umbrella-tree"/);
  assert.match(component, /\/factory\/status\.json/);
  assert.match(component, /readFactoryPublicStatus/);
  assert.match(component, /UNKNOWN — never inferred from this registry/);
  assert.match(component, /MODEL \/ NOT OBSERVED/);
  assert.match(component, /Illustrative hierarchy slot only/);
  assert.match(component, /No continuous agent or host sensor/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /event\.key !== "Tab"/);
  assert.match(component, /role="group" aria-label="Evidence overlay"/);
  assert.match(component, /max\(85, zoom - 10\)/);
  assert.match(component, /slice\(0, limit\)/);
  assert.match(component, /slice\(0, weLimit\)/);
  assert.match(component, /Show .* more work environments/);
  assert.match(component, /131072/);
  assert.match(component, /controller\.abort\(\)/);
  assert.doesNotMatch(component + page,
    /(?:setInterval|setTimeout|WebSocket|EventSource|child_process|execSync|systemctl|POST|PUT|DELETE|process\.env|GITHUB_TOKEN)/);
});

test("visual design includes touch, responsive, high contrast and static reduced-motion fallback", () => {
  assert.match(style, /@media \(max-width: 540px\)/);
  assert.match(style, /@media \(max-width: 850px\)/);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(style, /focus-visible/);
  assert.match(style, /animation: none !important/);
  assert.match(style, /\.osGrid/);
  assert.match(style, /\.drawer/);
  assert.match(component, /ARCHITECTURAL ORBIT · DECORATIVE/);
  assert.match(component, /Motion in this room is ambient art, not telemetry/);
});


test("Progress catalog parent and handoff remain source-only; unresolved estate is not a live count", () => {
  const progress = raw.subordinate_os.find((x: { id: string }) => x.id === "progress");
  assert.equal(progress.parent_os_id, "aoe2war.os.central-command");
  assert.equal(graph.nodes.find(n => n.id === progress.canonical_id)?.liveStatus, "UNKNOWN");
  assert.equal(graph.nodes.find(n => n.id === progress.canonical_id)?.parentId, progress.parent_os_id);
  assert.equal(raw.lifecycle_extension_proposal.progress.execution_authorized, false);
  assert.ok(raw.lifecycle_extension_proposal.progress.required.includes("next_eligible_action"));
  assert.ok(raw.lifecycle_extension_proposal.progress.required.includes("do_not_repeat"));
  assert.equal(raw.census_reconciliation_proposal.live_operational_count, null);
  assert.equal(raw.census_reconciliation_proposal.execution_authorized, false);
  assert.equal(raw.counts.planned_subordinate_os_total, raw.subordinate_os.length);
  for (const parent of ["aoe2war.os.progress", "aoe2war.os.missing", "aoe2war.role.doctor", "bad"]) {
    const fixture = structuredClone(raw);
    fixture.subordinate_os.find((x: { id: string }) => x.id === "progress").parent_os_id = parent;
    assert.equal(buildUmbrellaTree(fixture).errors[0], "INVALID_OR_UNORDERED_OS_PARENT");
  }
});
