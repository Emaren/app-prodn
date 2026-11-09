import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("R25 high-memory historical corpus lanes serialize without losing archival truth", () => {
  const source = read("lib/generationKeyedLoader.ts");
  assert.match(source, /serializeLoads\?: boolean/);
  assert.match(source, /latestLoadCompletionBySource/);
  assert.match(source, /run\.then\(\(\) => undefined, \(\) => undefined\)/);
  assert.match(source, /if \(loads\?\.get\(generation\) === run\)/);
  const raw = read("lib/publicLeaderboardGameCorpus.ts");
  assert.match(raw, />\(1, \{ serializeLoads: true \}\)/);
  assert.match(raw, /const RAW_CORPUS_PAGE_SIZE = 1_000/);
  assert.match(raw, /result\.push\(\.\.\.page\)/);
  assert.match(raw, /page\.length <\s*RAW_CORPUS_PAGE_SIZE/);
  assert.doesNotMatch(raw, /result\.slice\(0,\s*(?:100|500|1000)\)/);
  const profile = read("lib/playerProfile.ts");
  assert.match(profile, /loadPlayerProfileReplayCorpus = createGenerationKeyedLoader<[\s\S]*?>\(1, \{ serializeLoads: true \}\)/);
  assert.match(profile, /loadExactSteamProfileReplayCorpus = createGenerationKeyedLoader<[\s\S]*?>\(8, \{ serializeLoads: true \}\)/);
  const lobby = read("lib/lobbyLeaderboard.ts");
  assert.match(lobby, /loadLeaderboardGameCorpusByGeneration =[\s\S]*?>\(1, \{ serializeLoads: true \}\)/);
  const rivalry = read("lib/publicMatchups.ts");
  assert.match(rivalry, /loadGenerationCachedPublicRivalryBoards =[\s\S]*?>\(2, \{ serializeLoads: true \}\)/);
  assert.match(rivalry, /loadGenerationCachedPublicBattleArchive =[\s\S]*?>\(2, \{ serializeLoads: true \}\)/);
});

test("V8 telemetry remains passive, profile-bounded and free of sensitive request data", () => {
  const source = read("lib/runtimeCrashDiagnostics.ts");
  assert.match(source, /installR25HeapTelemetry/);
  assert.match(source, /process\.memoryUsage\(\)/);
  assert.match(source, /periodMs = 30_000/);
  assert.match(source, /timer\.unref\?\.\(\)/);
  assert.match(source, /OBSERVATION_ONLY_NOT_STABILITY_CERTIFICATE/);
  assert.match(source, /AOE2WAR_RUNTIME_PROFILE/);
  assert.doesNotMatch(source.slice(source.indexOf("export function installR25HeapTelemetry")), /DATABASE_URL|request\.url|cookies\(|Authorization|sendTransaction|systemctl/);
  assert.match(read("instrumentation.node.ts"), /installR25HeapTelemetry\(\)/);
});
