import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const projection = source("lib/libraryPublicProjection.ts");
const history = source("lib/libraryHistoricalIndex.ts");
const activity = source("app/api/library/activity/route.ts");
const games = source("app/api/library/games/route.ts");

test("all Library events read new WE1-filtered views, never legacy raw event models",()=>{
  for (const s of [history,activity,projection]) {
    assert.doesNotMatch(s,/\bprisma\.(?:userActivityEvent|watcherClientEvent)\b/);
    assert.doesNotMatch(s,/\b(?:FROM|JOIN)\s+(?:public\.)?(?:user_activity_events|watcher_client_events)\b/i);
  }
  assert.match(projection,/FROM aoe2war_library_activity_public\.replay_uploads/);
  assert.match(projection,/FROM aoe2war_library_watcher_public\.batch_receipts/);
  assert.doesNotMatch(projection,/\$queryRawUnsafe|\$executeRaw|\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
});
test("narrow view contract selects only approved public columns and fixed event types",()=>{
  assert.match(projection,/SELECT id,user_id,type,label,metadata,created_at/);
  assert.match(projection,/WHERE metadata->>'packageUpload' = 'true'/);
  assert.match(projection,/WHERE event_type='batch_upload_file_succeeded' AND replay_hash IS NOT NULL/);
  assert.match(projection,/WHERE created_at >= \$\{since\}/);
  assert.match(projection,/LIMIT 64/);
  assert.match(projection,/LIMIT 512/);
  assert.doesNotMatch(projection,/\b(?:ip_address|user_agent|request_headers|financial|wallet|secret|email)\b/i);
});
test("Activity readout never exposes event metadata or private user columns",()=>{
  assert.match(activity,/loadLibraryActivityUploads\(prisma\)/);
  assert.match(activity,/loadLibraryActivityBatches\(prisma, batchCutoff\)/);
  assert.match(activity,/uid: event\.user\?\.uid \?\? null/);
  assert.match(activity,/select: \{ id: true, uid: true, inGameName: true, steamPersonaName: true \}/);
  assert.doesNotMatch(activity,/\b(?:ipAddress|rawMetadata|requestHeaders|email|passwordHash|walletBalance)\s*:/);
  assert.match(activity,/status: 503/);
  assert.doesNotMatch(activity,/\{\s*ok:\s*true,\s*summary:\s*\{\s*activeBatches:\s*0/);
});
test("history preserves pagination, filter accuracy and unknown provenance on 42501",()=>{
  assert.match(history,/loadLibraryPackageReceipts\(prisma\)/);
  assert.match(history,/loadLibraryBatchProvenance\(prisma\)/);
  assert.match(history,/isLibraryProvenanceAccessDenied/);
  assert.match(history,/const provenanceComplete = missingProvenanceSources\.length === 0/);
  assert.match(history,/selectLibraryHistoryPage/);
  assert.match(games,/!history\.provenanceComplete && filter !== "all"/);
  assert.match(games,/status: 503/);
  assert.match(games,/filterTotal: page\.filterTotal/);
  assert.match(games,/hasMore: page\.hasMore/);
});
test("projection is source-only, no new schema installer or unauthorized grants in app",()=>{
  assert.doesNotMatch(projection,/\b(?:CREATE ROLE|GRANT SELECT|ALTER DEFAULT PRIVILEGES|SECURITY DEFINER)\b/i);
  assert.doesNotMatch(activity,/\b(?:CREATE ROLE|GRANT SELECT|ALTER DEFAULT PRIVILEGES)\b/i);
});
