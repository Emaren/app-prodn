import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const root="app/api/admin/living-kingdom/";
const main=read(root+"route.ts");
const detail=read(root+"[uid]/route.ts");
const reader=read("lib/adminLivingKingdom/read.ts");
const summary=read("lib/adminJourneyIntelligence.ts");
const projection=read("lib/adminLivingKingdom/projection.ts");
const shell=read("app/admin/layout.tsx");
const pages=[read("app/admin/living-kingdom/page.tsx"),read("app/admin/living-kingdom/[uid]/page.tsx")];

test("each HTTP endpoint authenticates before accessing any source and fails closed",()=>{
 for(const code of [main,detail]){
  assert.match(code,/await requireAdmin\(request\)/);
  assert.match(code,/if\("error" in gate\)return NextResponse.json/);
  assert.ok(code.indexOf('if("error" in gate)')<code.indexOf("await load"));
  assert.match(code,/private, no-store/);
  assert.match(code,/revalidate=0/);
  assert.doesNotMatch(code,/post\(|create\(|update\(|delete\(|upsert\(/i);
 }
 assert.match(shell,/requireServerAdmin/);
 for(const code of pages)assert.match(code,/await requireServerAdmin\(\)/);
});
test("UID lookup precedes user-scoped history and not a global event stream",()=>{
 assert.match(reader,/findUnique\(\{where:\{uid:opts\.uid\}/);
 assert.match(reader,/where:\{userId:user\.id,createdAt/);
 assert.match(reader,/take:HISTORY_PAGE\+1/);
 assert.match(reader,/id:\{lt:opts\.cursor\}/);
 assert.match(detail,/encodeURIComponent|uid\.length>100/);
});
test("the fair selector never takes newest events globally before assigning users",()=>{
 assert.match(reader,/selected\.map\(user=>prisma\.userActivityEvent\.findMany/);
 assert.match(reader,/userId:user\.id/);
 assert.match(reader,/take:PER_USER_LIMIT\+1/);
 assert.match(reader,/COHORT_SIZE=20/);
 assert.match(reader,/PER_USER_LIMIT=120/);
 assert.match(reader,/type:\{in:\["page_view","click"\]\}/);
 assert.match(summary,/take: uniqueUserIds\.length \* limitPerUser/);
});
test("only authorized, safe current presence joins: never a guessed offline label",()=>{
 assert.match(reader,/livingKingdomHub\.publicProjectionForUid\(uid\)/);
 assert.match(reader,/livingKingdomHub\.stats\(\)/);
 assert.match(reader,/buildJourneySummary\(scrubbed\)/);
 assert.doesNotMatch(reader,/prisma\.userActivityEvent\.(create|update|upsert|delete)/);
});
test("click text, full URLs and metadata never leave the projection",()=>{
 assert.match(projection,/publicEvent\(event: SafeEvent\)/);
 assert.doesNotMatch(projection,/metadata:\s*input\.metadata/);
 assert.doesNotMatch(projection,/label:\s*input\.label/);
 assert.match(reader,/events:safe\.map\(publicEvent\)/);
 assert.match(reader,/scrollHistory:\{status:"NOT_RECORDED"/);
});
