import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("Workshop is registered in the shared B/A/E preferences with Advanced as default", async () => {
  const preferences = await source("lib/tileViewPreferences.ts");

  assert.match(preferences, /"workshop",/);
  assert.match(preferences, /workshop:\s*"advanced"/);
});

test("Workshop server page publishes a bounded serializable diagnostic projection", async () => {
  const page = await source("app/workshop/page.tsx");

  assert.match(page, /WorkshopExperience/);
  assert.match(page, /const diagnostics: WorkshopDiagnostics/);
  assert.match(page, /resultCoverageBps: observatory\.corpus\.resultCoverageBps/);
  assert.match(page, /provisionalWarriors: observatory\.corpus\.provisionalWarriors/);
  assert.match(page, /effectiveResultCorrections:/);
  assert.match(page, /watcherVersion: WATCHER_RELEASE\.version/);
});

test("Workshop exposes distinct Basic, Advanced, and Extreme experiences", async () => {
  const experience = await source("components/workshop/WorkshopExperience.tsx");

  assert.match(experience, /useTileViewPreference\("workshop"\)/);
  assert.match(experience, /<BasicView/);
  assert.match(experience, /<AdvancedView/);
  assert.match(experience, /<ExtremeView/);
  assert.match(experience, /aria-label="Workshop view"/);
  assert.match(experience, /Current front ·/);
});

test("Advanced is progress-first and Extreme adds real observatory displays", async () => {
  const experience = await source("components/workshop/WorkshopExperience.tsx");

  for (const label of [
    "Replay truth progress",
    "The machine at a glance",
    "Five gates. No magic leaps.",
    "Truth funnel",
    "Confidence radar",
    "Authority map",
    "Evidence can travel. Authority cannot teleport.",
  ]) {
    assert.match(experience, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.ok(
    experience.match(/<WorkshopChronicle/g)?.length === 3,
    "all three Workshop views must preserve the Chronicle",
  );
  assert.ok(
    experience.match(/<WorkshopAsk/g)?.length === 3,
    "all three Workshop views must preserve the public Workshop question surface",
  );
});
