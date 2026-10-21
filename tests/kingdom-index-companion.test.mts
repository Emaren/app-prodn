import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
import companions from "../config/kingdom-index-companions.json" with {type:"json"};
import {readFileSync} from "node:fs";

test("Watcher companion cannot masquerade as a public route or a certified score",()=>{
  assert.equal(companions.schema,1);
  assert.equal(companions.companions.length,1);
  const [watcher]=companions.companions;
  assert.equal(watcher.id,"aoe2-watcher");
  assert.match(watcher.releaseSourceSha,/^[a-f0-9]{40}$/);
  assert.ok(!catalog.some(route=>route.href===watcher.downloadHref&&route.label===watcher.label));
  assert.ok(!("score" in watcher) && !("status" in watcher));
  assert.ok(watcher.gates.length>=8);
  assert.ok(watcher.gates.some(gate=>gate.id==="source-and-release-drift"));
  assert.ok(watcher.gates.some(gate=>gate.id==="idle-cpu-memory-wakeups"));
  assert.ok(watcher.gates.some(gate=>gate.id==="replay-upload-integrity"));
});

test("companion is independently projected and never counted as route quality or certification",()=>{
  const server=readFileSync(new URL("../lib/kingdomIndex.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../components/kingdom-index/KingdomIndex.tsx",import.meta.url),"utf8");
  assert.match(server,/companions: companionCatalog\.companions\.map/);
  assert.match(server,/status:"unmeasured" as const,score:null/);
  assert.match(server,/observed:pages\.filter/);
  assert.match(server,/certified:pages\.filter/);
  assert.match(ui,/COMPANION APPLICATIONS/);
  assert.match(ui,/snapshot\.companions/);
  assert.match(ui,/INSPECTION GATES/);
  assert.match(ui,/No independently certified desktop quality score/);
});
