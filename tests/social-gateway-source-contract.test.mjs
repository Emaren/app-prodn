import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("only restricted HD V2 high-level functions are called from PRODUCT writer",()=>{
 const core=read("lib/socialWriterCore.mjs");
 assert.match(core,/SELECT aoe2war_social_hd_v2\.clan_text\(\$1::text,\$2::text,\$3::text,\$4::text\) AS decision/);
 assert.match(core,/SELECT aoe2war_social_hd_v2\.direct_text\(\$1::text,\$2::text,\$3::text,\$4::integer\) AS decision/);
 assert.match(core,/verifiedUid, action\.slug, action\.message, action\.audience/);
 assert.match(core,/verifiedUid, action\.targetUid, action\.body, action\.replyToMessageId/);
 assert.match(core,/uid\(await verifySession\(sessionToken\)\)/);
 for (const forbidden of [
   /social_gateway_v1/,/\bpublic\.(?:users|clans|clan_members|clan_messages|direct_)/,
   /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM)?\s*\b(?:public|aoe2war_social_hd_v2)\./i,
   /\bFROM\s+aoe2war_social_hd_v2\.v_direct_messages/i,
   /leaf_append_clan\(/,/leaf_send_direct\(/,/leaf_ensure_direct_pair\(/,
 ]) assert.doesNotMatch(core,forbidden);
 assert.match(core,/client\.query\("ROLLBACK"\)/);
});
test("independent WE1 51-check V2 SQL authority pinned by exact HEAD and source blobs",()=>{
 const doc=read("docs/WE3_SOCIAL_HD_V2_SOURCE_CONTRACT_20261119.md");
 assert.match(doc,/51\/51 PASS/);
 assert.match(doc,/f38636b7ea1b7efe178831e1a40a78dad5604749/);
 assert.match(doc,/1c11073a44643e90bd59ae36118432001772b1da/);
 assert.match(doc,/eca1fd003ca90129be6e6a5c4eb3f05bc2e0edfc/);
 assert.match(doc,/aoe2hd_db/);
 assert.match(doc,/NOLOGIN/);
 assert.match(doc,/NOINHERIT/);
 assert.match(doc,/PUBLIC execute is revoked/);
 assert.match(doc,/raw NULL/);
 assert.match(doc,/SOURCE FIXED/);
 assert.doesNotMatch(doc,/~~~sql/);
});
test("rejected former V1 proposal remains historical and must not be installed",()=>{
 const former=read("docs/WE3_SOCIAL_GATEWAY_V1_REVIEW_20261119.md");
 const dynamic=read("app/api/social/clan-text/route.ts");
 assert.match(former,/REJECTED/);
 assert.match(former,/DO NOT INSTALL/);
 assert.match(dynamic,/export async function POST/);
 assert.match(dynamic,/validateSocialWriteOrigin/);
 assert.match(dynamic,/signedSocialCookie/);
 const client=read("components/clans/ClanHallClient.tsx");
 assert.match(client,/fetch\("\/api\/social\/clan-text"/);
});
test("PRODUCT does not carry privileged SQL fixtures or installer scripts",()=>{
 const doc=read("docs/WE3_SOCIAL_HD_V2_SOURCE_CONTRACT_20261119.md");
 assert.match(doc,/WE1 owns database acceptance/);
 assert.doesNotMatch(read("lib/socialWriterCore.mjs"),/\b(?:CREATE ROLE|GRANT SELECT|CREATE FUNCTION)\b/);
});
