// Discovered by the canonical tests/*.test.mts inventory; no quarantine.
import "./socialDirectReaderCore.test.mjs";
import "./restrictedDirectInboxDto.test.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("restricted GET and committed POST readback never take legacy Prisma path",()=>{
 const source=read("app/api/contact-emaren/route.ts");
 const get=source.slice(source.indexOf("export async function GET"),source.indexOf("export async function POST"));
 assert(get.indexOf("return readRestrictedInboxGet")>=0);
 assert(get.indexOf("return readRestrictedInboxGet")<get.indexOf("const prisma = getPrisma()"));
 const post=source.slice(source.indexOf("export async function POST"),source.indexOf("export async function PATCH"));
 assert.match(post,/await readRestrictedInbox\(request,sessionUid/);
 assert.match(post,/COMMITTED_READBACK_NOT_IN_PAGE/);
 assert.match(post,/persisted: true/);
 assert(!post.includes("loadInboxPayload(getPrisma(), sessionUid"));
});
test("private search and image metadata branch before legacy SQL and both URLs share authorization",()=>{
 for(const p of ["app/api/contact-emaren/search/route.ts","lib/directMessageAttachmentResponse.ts"]){
  const s=read(p);
  const branch=s.indexOf("await restrictedDirectRead(request");
  assert(branch>=0&&branch<s.indexOf("const prisma = getPrisma()"),p);
 }
 const legacy=read("app/api/contact-emaren/attachments/[messageId]/route.ts");
 assert(legacy.indexOf("return readPrivateDirectAttachment")<legacy.indexOf("const prisma = getPrisma()"));
 const events=read("app/api/contact-emaren/events/route.ts");
 assert(events.indexOf('await restrictedDirectRead(request,{op:"summary"})')<events.indexOf("const prisma=getPrisma()"));
});
