import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("only bounded gateway operations remain in PRODUCT's SQL writer",()=>{
 const core=read("lib/socialWriterCore.mjs");
 assert.doesNotMatch(core,/\bpublic\.(?:users|clans|clan_members|clan_messages|direct_)/);
 for(const name of ["append_clan_message","ensure_direct_pair","send_direct_text"]){
  assert.match(core,new RegExp("social_gateway_v1\\."+name+"\\("));
 }
 for(const name of ["users","clans","clan_members","clan_messages","direct_messages"]){
  assert.match(core,new RegExp("social_gateway_v1\\."+name+"\\b"));
 }
 assert.doesNotMatch(core,/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+social_gateway_v1/i);
});

test("source SQL creates a new-only gateway; old five NULL-ACL objects get no new grants",()=>{
 const s=read("docs/WE3_SOCIAL_GATEWAY_V1_REVIEW_20261119.md");
 const blocks=[...s.matchAll(/~~~sql\n([\s\S]*?)\n~~~/g)].map(m=>m[1]);
 assert.equal(blocks.length,2);
 const [install,inverse]=blocks;
 assert.match(s,/NOT AN INSTALLER/);
 assert.match(s,/raw ACL/);
 assert.match(install,/CREATE SCHEMA social_gateway_v1;/);
 assert.match(install,/CREATE ROLE aoe2war_social_writer/);
 for(const name of ["append_clan_message","ensure_direct_pair","send_direct_text"]){
  assert.match(install,new RegExp("CREATE FUNCTION social_gateway_v1\\."+name+"\\("));
  assert.match(inverse,new RegExp("social_gateway_v1\\."+name+"\\("));
 }
 assert.match(install,/SECURITY DEFINER\s+SET search_path=pg_catalog,pg_temp/g);
 assert.match(install,/REVOKE ALL ON FUNCTION/);
 assert.match(inverse,/DROP SCHEMA social_gateway_v1 RESTRICT/);
 assert.match(inverse,/DROP ROLE aoe2war_social_writer/);
 assert.doesNotMatch(install,/\bGRANT\s+(?:USAGE|SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:SEQUENCE|TABLE)\s+public\./i);
 assert.doesNotMatch(inverse,/\bREVOKE\s+(?:USAGE|SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:SEQUENCE|TABLE)\s+public\./i);
 for(const a of ["public.clan_messages_id_seq","public.direct_conversations_id_seq",
  "public.direct_conversation_participants_id_seq","public.direct_messages_id_seq"]){
  assert.doesNotMatch(install,new RegExp("GRANT[^;]*"+a.replace(".","\\.")));
 }
});

test("source boundary keeps original protected dynamic Clan handler, and a static new POST",()=>{
 const staticRoute=read("app/api/social/clan-text/route.ts");
 const client=read("components/clans/ClanHallClient.tsx");
 const legacy=read("docs/WE3_SOCIAL_TEXT_SQL_REVIEW_20261118.md");
 assert.match(staticRoute,/export async function POST/);
 assert.match(staticRoute,/validateSocialWriteOrigin/);
 assert.match(staticRoute,/signedSocialCookie/);
 assert.match(client,/fetch\("\/api\/social\/clan-text"/);
 assert.match(legacy,/HISTORICAL \/ REJECTED SQL INSTALLATION/);
});
