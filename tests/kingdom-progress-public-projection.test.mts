import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  readPublicPriorityScopes, progressFromVerifiedScope, safeCodeDate, sortProgressEntries
} from "../lib/kingdomProgressProjection.ts";

const catalog = JSON.parse(readFileSync(new URL("../config/kingdom-progress-projects.json", import.meta.url), "utf8"));
const SHA = "563993ab14c699f716da6f4a81c8fc3f0c4cc123";
const approved = (items: unknown[]) =>
  "Private #984 capacity plan; do not publish.\n<!-- AOE2WAR_PUBLIC_PRIORITY_V1 -->\n" +
  JSON.stringify({ schema: 1, publication: "OWNER_APPROVED_PUBLIC", items }) +
  "\n<!-- END_AOE2WAR_PUBLIC_PRIORITY_V1 -->";
const item = () => ({
  id: "Q12", label: "Kingdom Progress", category: "experience",
  href: "/kingdom-progress", repo: "Emaren/app-prodn",
  scopeVersion: "v1-20261029", lastCodeSha: SHA, approved: true,
  milestones: [
    { id: "public-ui", label: "Public UI", gate: "source", proof: { kind: "github-actions", sha: SHA, runId: 40924138779 } },
    { id: "source-tests", label: "Source Tests", gate: "source", proof: { kind: "github-actions", sha: SHA, runId: 40924138779 } },
    { id: "live-deployed", label: "Live Deployed", gate: "runtime", proof: null }
  ]
});

test("private queue remains invisible without an explicit approved JSON island", () => {
  assert.deepEqual(readPublicPriorityScopes("Q01 root backup private signer IP 1.2.3.4", catalog.projects), []);
  assert.deepEqual(readPublicPriorityScopes(approved([]), catalog.projects), []);
  assert.deepEqual(readPublicPriorityScopes(approved([ { ...item(), approved: false } ]), catalog.projects), []);
  assert.deepEqual(readPublicPriorityScopes(approved([ { ...item(), label: "Private backup token" } ]), catalog.projects), []);
});

test("schema rejects malformed, oversized, duplicate, illicit fields, markup and offsite link", () => {
  for (const bad of [
    { ...item(), href: "https://private.example.com" },
    { ...item(), href: "//example.com" },
    { ...item(), label: "<script>alert(1)</script>" },
    { ...item(), label: "Admin SSH" },
    { ...item(), repo: "evil/project" },
    { ...item(), privateNote: "top secret" },
    { ...item(), milestones: [{ id: "only-one", label: "One", gate: "source", proof: null }] },
    { ...item(), milestones: [{ ...item().milestones[0], proof: { kind: "github-actions", sha: "bad", runId: 1 } }, ...item().milestones.slice(1) ] },
    { ...item(), milestones: [{ ...item().milestones[0], id: "x" }, { ...item().milestones[1], id: "x" }, item().milestones[2]] },
    { ...item(), milestones: [{ ...item().milestones[0], gate: "economic" }, ...item().milestones.slice(1)] },
    { ...item(), lastCodeSha: "fake" },
    { ...item(), id: "Q9999" }
  ]) assert.equal(readPublicPriorityScopes(approved([bad]), catalog.projects).length, 0);
  assert.deepEqual(readPublicPriorityScopes(approved([item(), item()]), catalog.projects).map(x => x.id), ["Q12"]);
  assert.deepEqual(readPublicPriorityScopes(approved(Array(9).fill(item())), catalog.projects), []);
  assert.deepEqual(readPublicPriorityScopes(approved([item()]) + approved([item()]), catalog.projects), []);
});

test("public queue items appear from newly edited source data without rebuilding a static catalog", () => {
  const before = readPublicPriorityScopes(approved([]), catalog.projects);
  const after = readPublicPriorityScopes(approved([item()]), catalog.projects);
  assert.equal(before.length, 0);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, "Q12");
  assert.equal(catalog.projects.length, 5);
  assert.equal(after[0].lastCodeSha, SHA);
});

test("zero verified is UNKNOWN, finite certified release scope can reach 100", () => {
  const scope = readPublicPriorityScopes(approved([item()]), catalog.projects)[0];
  const noProof = progressFromVerifiedScope(scope, new Set(), null);
  assert.equal(noProof.percent, null);
  assert.equal(noProof.verifiedCount, null);
  const oneGate = progressFromVerifiedScope(scope, new Set(["public-ui"]), "2026-10-29T17:07:38Z");
  assert.equal(oneGate.verifiedCount, 1);
  assert.equal(oneGate.percent, 33);
  const twoGates = progressFromVerifiedScope(scope, new Set(["public-ui", "source-tests"]), null);
  assert.equal(twoGates.percent, 67);
  // A runtime gate is intentionally impossible to certify with source CI.
  const sourceOnly = { ...scope, milestones: scope.milestones.slice(0, 2) };
  const completed = progressFromVerifiedScope(sourceOnly, new Set(["public-ui", "source-tests"]), null);
  assert.equal(completed.percent, 100);
  assert.equal(completed.verifiedCount, 2);
});

test("sort most/least/recent: unknown is last, same-value ties keep stable original ID", () => {
  const original = ["watcher-166", "auto-satchel", "tv-wolo", "parser-engine", "replay-truth"];
  const input = [
    { id: original[1], percent: 80, lastWorkedAt: "2026-10-20T12:00:00Z" },
    { id: original[2], percent: null, lastWorkedAt: null },
    { id: original[0], percent: 80, lastWorkedAt: "2026-10-21T12:00:00Z" },
    { id: "Q12", percent: 10, lastWorkedAt: "2026-10-22T12:00:00Z" },
    { id: original[3], percent: null, lastWorkedAt: null }
  ];
  assert.deepEqual(sortProgressEntries(input, "most", original).map(v => v.id), [original[0], original[1], "Q12", original[2], original[3]]);
  assert.deepEqual(sortProgressEntries(input, "least", original).map(v => v.id), ["Q12", original[0], original[1], original[2], original[3]]);
  assert.deepEqual(sortProgressEntries(input, "recent", original).map(v => v.id), ["Q12", original[0], original[1], original[2], original[3]]);
  assert.equal(input[0].id, original[1], "sort never mutates original array");
});

test("work date must be a SHA-backed commit observation, not issue update/fetch or future clocks", () => {
  assert.equal(safeCodeDate("2026-10-29T17:07:38Z", Date.parse("2026-10-29T18:00:00Z")), "2026-10-29T17:07:38.000Z");
  assert.equal(safeCodeDate("2027-10-29T17:07:38Z", Date.parse("2026-10-29T18:00:00Z")), null);
  assert.equal(safeCodeDate("2026-10-29T17:07:38-06:00"), null);
  assert.equal(safeCodeDate("2026-99-29T17:07:38Z"), null);
});
