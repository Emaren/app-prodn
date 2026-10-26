import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("OS page computes one inspection source, shares it with agent roster and scores", () => {
  const os = source("lib/aoe2warOsPublic.ts");
  assert.equal((os.match(/buildGeneralInspectionsSnapshot\(\)/g) ?? []).length, 1);
  assert.match(os, /const inspectionSource = Promise\.resolve\(\)\.then\(\(\) => buildGeneralInspectionsSnapshot\(\)\)/);
  assert.match(os, /\[inspectionR, agentsR, controlR, commitsR, pullsR, workflowR\] = await Promise\.allSettled\(\[/);
  assert.match(os, /\n    inspectionSource,\n    buildKingdomAgentsPublicSnapshot\(\{ inspectionSource \}\), releaseControl\(\)/);
  assert.match(os, /const inspection = inspectionR\.status === "fulfilled" \? inspectionR\.value : null/);
  assert.match(os, /score: inspection\?\.overallScore \?\? null/);
  assert.doesNotMatch(os, /buildKingdomAgentsPublicSnapshot\(\)/);
});

test("agents reuse already observed evidence when provided but keep standalone behavior", () => {
  const agents = source("lib/kingdomAgentsPublic.ts");
  assert.match(agents, /inspectionSource\?: PromiseLike<GeneralInspectionsSnapshot \| null> \| GeneralInspectionsSnapshot \| null/);
  assert.match(agents, /Object\.prototype\.hasOwnProperty\.call\(options, "inspectionSource"\)/);
  assert.match(agents, /\? Promise\.resolve\(options\.inspectionSource \?\? null\)/);
  assert.match(agents, /: Promise\.resolve\(\)\.then\(\(\) => buildGeneralInspectionsSnapshot\(\)\)/);
  assert.match(agents, /const \[inspectionResult, intelligenceResult\] = await Promise\.allSettled\(\[/);
  assert.match(agents, /const inspection = inspectionResult\.status === "fulfilled" \? inspectionResult\.value : null/);
  assert.match(agents, /readinessScore: inspection\?\.overallScore \?\? null/);
  assert.match(agents, /agents\.push\(\.\.\.projectInspectionWatchposts\(inspection, Date\.now\(\)\)\)/);
  assert.doesNotMatch(agents, /state: inspectionAgentState\(check\.state, fraction\)/);
});

test("shared inspection failure keeps public score unknown; no synthetic success or retry", () => {
  const os = source("lib/aoe2warOsPublic.ts");
  const agents = source("lib/kingdomAgentsPublic.ts");
  assert.match(os, /inspectionR\.status === "fulfilled" \? inspectionR\.value : null/);
  assert.match(os, /score: inspection\?\.overallScore \?\? null/);
  assert.match(agents, /inspectionResult\.status === "fulfilled" \? inspectionResult\.value : null/);
  assert.match(agents, /const inspectionSource = Object\.prototype\.hasOwnProperty\.call/);
  assert.doesNotMatch(agents, /if \(!inspection\)\s*\{\s*return buildGeneralInspectionsSnapshot/);
});

test("shared source changes nothing about public-only read/GET security boundaries", () => {
  const api = source("app/api/aoe2war-os/route.ts");
  const os = source("lib/aoe2warOsPublic.ts");
  assert.match(api, /export async function GET\(/);
  assert.doesNotMatch(api, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.match(api, /Cache-Control": "no-store, max-age=0, must-revalidate"/);
  assert.match(os, /includeGithub \? github\("actions\/runs\?per_page=8"\)/);
});
