import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");

test("Admin command exposes one Living Kingdom Observatory link without changing the castle menu",()=>{
 const admin=source("../app/admin/page.tsx");
 assert.equal((admin.match(/href="\/admin\/living-kingdom"/g)||[]).length,1);
 assert.match(admin,/href="\/admin\/user-list"/);
 assert.match(admin,/Living Kingdom Observatory/);
});

test("Observatory page and API keep independent server-side admin authorization",()=>{
 const page=source("../app/admin/living-kingdom/page.tsx");
 const endpoint=source("../app/api/admin/living-kingdom/route.ts");
 assert.match(page,/await requireServerAdmin\(\)/);
 assert.match(endpoint,/await requireAdmin\(request\)/);
 assert.match(endpoint,/private, no-store/);
 assert.doesNotMatch(endpoint,/export async function (?:POST|PUT|DELETE|PATCH)/);
});
