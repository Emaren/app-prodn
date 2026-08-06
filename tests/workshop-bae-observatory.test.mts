import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("Workshop is registered in the shared B/A/E preferences with Extreme as default", async () => {
  const preferences = await source("lib/tileViewPreferences.ts");

  assert.match(preferences, /"workshop",/);
  assert.match(preferences, /workshop:\s*"extreme"/);
});

test("Workshop server page publishes diagnostics and loads view-specific polish", async () => {
  const page = await source("app/workshop/page.tsx");

  assert.match(page, /WorkshopExperience/);
  assert.match(page, /const diagnostics: WorkshopDiagnostics/);
  assert.match(page, /resultCoverageBps: observatory\.corpus\.resultCoverageBps/);
  assert.match(page, /provisionalWarriors: observatory\.corpus\.provisionalWarriors/);
  assert.match(page, /effectiveResultCorrections:/);
  assert.match(page, /watcherVersion: WATCHER_RELEASE\.version/);
  assert.match(page, /\.\/workshop-polish\.css/);
});

test("Workshop preserves distinct Basic, Advanced, and Extreme experiences", async () => {
  const experience = await source("components/workshop/WorkshopExperience.tsx");

  assert.match(experience, /useTileViewPreference\("workshop"\)/);
  assert.match(experience, /<BasicView/);
  assert.match(experience, /<AdvancedView/);
  assert.match(experience, /<ExtremeView/);
  assert.match(experience, /aria-label="Workshop view"/);

  assert.ok(
    experience.match(/<WorkshopChronicle/g)?.length === 3,
    "all three Workshop views must preserve the Chronicle",
  );
  assert.ok(
    experience.match(/<WorkshopAsk/g)?.length === 3,
    "all three Workshop views must preserve the public question surface",
  );
});

test("Basic alone restores the side-by-side Chronicle", async () => {
  const polish = await source("app/workshop/workshop-polish.css");

  assert.match(
    polish,
    /main\[data-workshop-view="basic"\] #chronicle[\s\S]*article:nth-child\(odd\)/,
  );
  assert.match(polish, /article:nth-child\(even\)[\s\S]*margin-left:\s*50%/);
  assert.doesNotMatch(
    polish,
    /main\[data-workshop-view="advanced"\] #chronicle[\s\S]*article:nth-child/,
  );
  assert.doesNotMatch(
    polish,
    /main\[data-workshop-view="extreme"\] #chronicle[\s\S]*article:nth-child/,
  );
});

test("Advanced and Extreme receive scoped polish while requested Extreme copy is hidden", async () => {
  const polish = await source("app/workshop/workshop-polish.css");

  assert.match(polish, /main\[data-workshop-view="advanced"\]/);
  assert.match(polish, /main\[data-workshop-view="extreme"\]/);
  assert.match(
    polish,
    /Remove the requested hero copy and current-front line\.[\s\S]*display:\s*none/,
  );
  assert.match(
    polish,
    /Remove the three requested explanatory headings[\s\S]*display:\s*none/,
  );
  assert.match(polish, /0 46px 150px/);
  assert.match(polish, /translateY\(-3px\)/);
});

test("Workshop patronage is presented as Buy a Feature", async () => {
  const sponsor = await source("components/workshop/WorkshopSponsor.tsx");

  assert.match(sponsor, />\s*Buy a Feature\s*</);
  assert.doesNotMatch(sponsor, />\s*Sponsor a Feature\s*</);
});
