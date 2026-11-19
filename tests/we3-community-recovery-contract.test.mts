import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const src=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Library failed first load does not represent historical counts as zero",()=>{
  const s=src("components/library/LibraryActivityBoard.tsx");
  assert.match(s,/const \[historyCertified, setHistoryCertified\] = useState\(false\)/);
  assert.match(s,/Archive totals unavailable/);
  assert.match(s,/Replay history unavailable/);
  assert.match(s,/failed \? "Historical index unavailable"/);
  assert.match(s,/Archive query unavailable · preserved data is not zero/);
  assert.match(s,/setOperationsCertified\(false\)/);
  assert.match(s,/historyCertified && !failed \? compactCount\(total\) : "—"/);
  assert.match(s,/setHistoryCertified\(true\)/);
});
test("Library failure returns unavailable not fake zero telemetry",()=>{
  const s=src("app/api/library/activity/route.ts");
  assert.match(s,/Library activity temporarily unavailable/);
  assert.match(s,/status: 503/);
  assert.match(s,/SQLSTATE/);
  const ui=src("components/library/LibraryActivityBoard.tsx");
  assert.match(ui,/operationsCertified \? compactCount\(ops\.summary\.activeBatches\) : "—"/);
  assert.match(ui,/Intake telemetry unavailable; no zero-count claim/);
});
test("Zodiac training and Academy use full uncropped managed avatar silhouettes",()=>{
  const training=src("components/zodiac/ZodiacTrainingPage.tsx");
  const academy=src("app/academy/page.tsx");
  assert.match(training,/data-zodiac-training-portrait="contained"/);
  assert.match(training,/object-contain object-top/);
  assert.doesNotMatch(training,/object-cover object-center opacity-90/);
  assert.match(academy,/data-academy-advisor-portrait="true"/);
  assert.match(academy,/object-contain object-top/);
  assert.match(src("app/zodiac/page.tsx"),/avatarUrlForUser/);
});
test("WOLO public feed has absolute cap, no signer/daemon mutations or off-origin host",()=>{
  const s=src("components/wolo/WoloChainTerminalTile.tsx");
  assert.match(s,/fetch\("\/rpc\/blockchain"/);
  assert.match(s,/BLOCK_FEED_MAX_BYTES = 131072/);
  assert.match(s,/getReader\(\)/);
  assert.match(s,/readBoundedBlockFeedJson/);
  assert.match(s,/data-wolo-public-block-feed/);
  assert.doesNotMatch(s,/broadcast_tx|walletPassword|privateKey/);
  const p=src("lib/woloBrowserBlockFeed.ts");
  assert.match(p,/rows.length<8/);
  assert.match(p,/wolo-1/);
  assert.match(p,/WOLO_BLOCK_FEED_REGRESSION/);
});
test("social grants/inverse must remain source-reviewed docs and not execute in PRODUCT",()=>{
  const doc=src("docs/WE3_SOCIAL_TEXT_SQL_REVIEW_20261118.md");
  for(const name of [
    "public.users","public.clans","public.clan_members","public.clan_messages",
    "public.direct_conversations","public.direct_conversation_participants",
    "public.direct_messages","public.direct_message_drafts",
    "clan_messages_id_seq","direct_conversations_id_seq",
    "direct_conversation_participants_id_seq","direct_messages_id_seq",
  ]) assert.ok(doc.includes(name),name);
  assert.match(doc,/CREATE ROLE aoe2war_social_writer LOGIN NOINHERIT/);
  assert.match(doc,/DROP ROLE aoe2war_social_writer/);
  assert.match(doc,/pg_trigger/);
  assert.match(doc,/SECURITY DEFINER/);
  assert.match(doc,/PUBLIC EXECUTE/);
  assert.match(doc,/Never treat this document as an owner-signed C03 or Factory permit/i);
  assert.doesNotMatch(doc,/GRANT ALL ON ALL TABLES|GRANT ALL ON SCHEMA/);
});
