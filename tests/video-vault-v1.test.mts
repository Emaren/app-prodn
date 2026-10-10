import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const route=read("app/api/admin/video-vault/route.ts");
const page=read("app/admin/video-vault/page.tsx");
const dash=read("components/admin/VideoVaultDashboard.tsx");

test("vault endpoints and page require admin authorization",()=>{
  assert.match(page,/await requireServerAdmin\(\)/);
  assert.equal((route.match(/await requireAdmin\(request\)/g)??[]).length,2);
  assert.match(route,/request.headers.get\("origin"\) !== request.nextUrl.origin/);
});
test("operator inventory only includes server-recorded first-party streams",()=>{
  assert.match(route,/provider:"aoe2war"/);
  assert.match(route,/getStreamStorageUsage\(row.id\)/);
  assert.match(route,/exactCandidates = records.filter\(stream => stream.chunkCount <= 5_000\).slice\(0, 8\)/);
  assert.match(route,/exactCandidates.slice\(i, i \+ 2\)/);
  assert.match(route,/measuredRows/);
  assert.match(route,/MAX_ROWS = 60/);
  assert.match(route,/complete:rows.length===totalCount/);
  assert.match(route,/Longer, older, and orphaned video files are explicitly excluded/);
  assert.match(dash,/Physical video byte totals verified/);
  assert.doesNotMatch(route,/prisma\.\$executeRaw|DELETE FROM/i);
});
test("video deletion is limited to ended nonretained streams and preserves registry on storage error",()=>{
  assert.match(route,/stream.retainedDemo \|\| !\["ended","failed"\]\.includes\(stream.status\)/);
  assert.match(route,/await removeStreamChunks\(streamId\)/);
  assert.match(route,/File deletion failed; recording registry preserved/);
  assert.match(route,/status:"removed",isPrimary:false/);
  assert.match(dash,/Permanently delete only video chunks/);
  assert.match(dash,/window.confirm/);
});
test("vault is visible in admin and has no WOLO or replay mutations",()=>{
  assert.match(read("app/admin/page.tsx"),/href="\/admin\/video-vault"/);
  assert.match(dash,/No replay/);
  assert.doesNotMatch(route,/betWager|gameStats.update|transferWolo|walletAddress/);
});
