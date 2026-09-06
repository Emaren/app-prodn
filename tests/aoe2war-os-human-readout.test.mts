import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/admin/aoe2war-os/page.tsx", "utf8");
const os = fs.readFileSync("lib/aoe2Os.ts", "utf8");

test("AoE2WAR OS leads with a human operator verdict and next action", () => {
  assert.match(page, /Operator verdict/);
  assert.match(page, /Next best action/);
  assert.match(page, /EVIDENCE STALE/);
  assert.match(page, /Go to controls/);
  assert.match(page, /Reload dashboard/);
  assert.match(page, /productionControlBlocked/);
  assert.match(page, /Production controls locked because audit evidence is/);
});

test("AoE2WAR OS exposes the exact system truth behind release decisions", () => {
  for (const label of [
    "System truth",
    "Source chain",
    "Runtime identity",
    "Protected WOLO",
    "Capacity",
    "Evidence",
    "Findings & notes",
  ]) {
    assert.ok(page.includes(label), label);
  }
  assert.match(page, /P0 \{dashboard\.snapshot\.p0\} · P1 \{dashboard\.snapshot\.p1\}/);
  assert.match(page, /sourcePublished/);
  assert.match(page, /sourceInProduction/);
  assert.match(page, /runtimeVersionParity/);
  assert.match(page, /protectedWoloHealthy/);
});

test("operator controls explain protected migration behavior instead of hiding it", () => {
  assert.match(page, /additive Prisma migrations/);
  assert.match(page, /durable pre-migration database backup/);
  assert.match(page, /DB backup\+verify when migrations exist/);
  assert.match(os, /backup-first additive Prisma migrations/);
  assert.match(os, /backup and apply approved additive Prisma migrations/);
});


test("AoE2WAR OS presents Kingdom Intelligence as the operator Brain", () => {
  assert.match(page, /Kingdom Intelligence · The Brain/);
  assert.match(page, /Deterministic Council directive/);
  assert.match(page, /Active long-running mission/);
  assert.match(page, /Open public Kingdom Intelligence/);
  assert.match(page, /brainSnapshot/);
  assert.match(os, /Refresh Kingdom Intelligence/);
  assert.match(os, /kingdomIntelligence/);
});
