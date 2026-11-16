import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { APPEARANCE_CAMPAIGN as NOV, parseAppearanceAction, executeAppearanceAction }
  from "../lib/appearanceWriterCore.mjs";

const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const now = new Date("2026-11-19T12:00:00Z");
function fixture() {
  const admin = { id: 11, uid: "admin_uid", is_admin: true };
  const scribe = { id: 23, uid: "scribe_uid", is_admin: false };
  const db = {
    users: [admin, scribe],
    campaign: { campaign_key: NOV.previousKey, label: "October", theme_key:"black",
      enabled:true, starts_at: new Date("2026-10-01T06:00:00Z"),
      ends_at:new Date("2026-11-01T06:00:00Z"), updated_at:now },
    overrides: new Map<string,{theme_key:string}>(), events: [] as Array<{actor:unknown;label:unknown;metadata:unknown}>,
    auditFailure:false, concurrencyFailure:false, commits:0, rollbacks:0, statements:[] as string[],
  };
  const pool = { async connect() {
    let campaign=structuredClone(db.campaign);
    const overrides=new Map(db.overrides);
    const events=[...db.events];
    return {
      release() {},
      async query(sql: string, args: unknown[] = []) {
        db.statements.push(sql);
        if(sql.startsWith("BEGIN")) {
          if(db.concurrencyFailure) throw Object.assign(new Error("retry"),{code:"40001"});
          return {rowCount:0,rows:[]};
        }
        if(sql==="COMMIT") {db.campaign=campaign;db.overrides=overrides;db.events=events;db.commits++;return {rowCount:0,rows:[]};}
        if(sql==="ROLLBACK") {db.rollbacks++;return {rowCount:0,rows:[]};}
        if(sql.startsWith("SELECT id, uid, is_admin FROM public.users")) {
          const u=db.users.find(x=>x.uid===args[0]);return {rowCount:u?1:0,rows:u?[u]:[]};
        }
        if(sql.includes("FROM public.site_theme_campaign WHERE slot = 1 FOR UPDATE"))
          return {rowCount:1,rows:[campaign]};
        if(sql.startsWith("UPDATE public.site_theme_campaign")) {
          if(sql.includes("campaign_key = $1")) {
            assert.equal(args[6],campaign.campaign_key);
            campaign={...campaign,campaign_key:String(args[0]),label:String(args[1]),theme_key:String(args[2]),
              enabled:true,starts_at:new Date(String(args[3])),ends_at:new Date(String(args[4])),updated_at:now};
          } else {
            assert.equal(args[2],campaign.campaign_key);
            campaign={...campaign,enabled:args[0] as boolean,updated_at:now};
          }
          return {rowCount:1,rows:[campaign]};
        }
        if(sql.startsWith("INSERT INTO public.user_theme_campaign_overrides")) {
          const row={campaign_key:String(args[0]),user_id:args[1],theme_key:String(args[2]),updated_at:now};
          overrides.set(String(args[0])+"/"+String(args[1]),row);
          return {rowCount:1,rows:[row]};
        }
        if(sql.startsWith("INSERT INTO public.user_activity_events")) {
          if(db.auditFailure) throw Object.assign(new Error("sequence denied"),{code:"42501"});
          events.push({actor:args[0],label:args[1],metadata:args[2]});
          return {rowCount:1,rows:[]};
        }
        throw Error("UNEXPECTED_SQL: "+sql);
      },
    };
  }};
  const call=(uid:string,action:Record<string,unknown>,token="signed".repeat(12))=>
    executeAppearanceAction({pool,action,token,verifySignedSession:async()=>uid,now:()=>now});
  const switchToNovember=()=>{db.campaign={...db.campaign,campaign_key:NOV.campaignKey,
    label:NOV.label,theme_key:"crimson",enabled:true,
    starts_at:new Date(NOV.startsAt),ends_at:new Date(NOV.endsAt)};};
  return {db,admin,scribe,call,switchToNovember};
}
const override=(themeKey="midnight")=>({action:"setPersonalOverride",campaignKey:NOV.campaignKey,themeKey});
test("admin-only singleton October-to-November CAS with immutable window",async()=>{
  const f=fixture();
  assert.equal((await f.call(f.admin.uid,{action:"activateNovember"})).status,200);
  assert.equal(f.db.campaign.campaign_key,NOV.campaignKey);
  assert.equal(f.db.campaign.starts_at.toISOString(),NOV.startsAt);
  assert.equal(f.db.campaign.ends_at.toISOString(),NOV.endsAt);
  assert.equal(f.db.commits,1);
  assert.equal(f.db.events.length,0);
});
test("ordinary user cannot activate or toggle; DB is_admin drives access",async()=>{
  const f=fixture();
  assert.equal((await f.call(f.scribe.uid,{action:"activateNovember"})).status,403);
  f.switchToNovember();
  assert.equal((await f.call(f.scribe.uid,{action:"setNovemberEnabled",enabled:false})).status,403);
  assert.equal(f.db.commits,0);
});
test("authenticated own override and mandatory activity commit in one transaction",async()=>{
  const f=fixture();f.switchToNovember();
  const res=await f.call(f.scribe.uid,override());
  assert.equal(res.status,200);
  assert.equal(res.body.themeKey,"midnight");
  assert.equal(f.db.overrides.size,1);
  assert.equal(f.db.events.length,1);
  assert.equal(f.db.events[0].actor,f.scribe.id);
  assert.equal(f.db.commits,1);
  assert.ok(f.db.statements.some(s=>s.includes("ON CONFLICT (campaign_key, user_id)")));
});
test("audit failure rolls back new override and preserves older preference",async()=>{
  const f=fixture();f.switchToNovember();
  f.db.overrides.set(NOV.campaignKey+"/"+f.scribe.id,{theme_key:"grey"});
  f.db.auditFailure=true;
  const res=await f.call(f.scribe.uid,override("black"));
  assert.equal(res.status,503);
  assert.equal(f.db.commits,0);assert.equal(f.db.rollbacks,1);
  assert.equal(f.db.overrides.get(NOV.campaignKey+"/"+f.scribe.id).theme_key,"grey");
  assert.equal(f.db.events.length,0);
});
test("invalid signature, unknown user, forged actor/admin and SQL fields are denied",async()=>{
  const f=fixture();f.switchToNovember();
  assert.equal((await f.call("unknown",override())).status,403);
  assert.equal((await f.call(f.scribe.uid,override(),"")).status,401);
  assert.equal((await executeAppearanceAction({pool:{connect:async()=>{throw Error("DATABASE_NOT_CALLED");}},action:override(),token:"a".repeat(64),verifySignedSession:async()=>{throw Error("JWT_REJECTED");}})).status,401);
  for(const bad of [
    {...override(),userId:11},{...override(),isAdmin:true},
    {action:"activateNovember",updatedByUserId:11},
    {action:"setPersonalOverride",campaignKey:NOV.previousKey,themeKey:"black"},
    {action:"setPersonalOverride",campaignKey:NOV.campaignKey,themeKey:"drop tables"},
    {action:"setNovemberEnabled",enabled:"true"},
    {action:"sql",sql:"DELETE FROM users"}
  ])assert.equal(parseAppearanceAction(bad),null);
  assert.equal(f.db.commits,0);
});
test("inactive campaign, invalid transition, race, and toggling before November fail closed",async()=>{
  const f=fixture();
  assert.equal((await f.call(f.scribe.uid,override())).status,409);
  assert.equal((await f.call(f.admin.uid,{action:"setNovemberEnabled",enabled:false})).status,409);
  f.switchToNovember();f.db.campaign.enabled=false;
  assert.equal((await f.call(f.scribe.uid,override())).status,409);
  f.db.campaign.enabled=true;f.db.concurrencyFailure=true;
  assert.equal((await f.call(f.scribe.uid,override())).status,409);
  assert.equal(f.db.commits,0);
});
test("actual Next app POST routes cannot access direct Prisma or user activity writes",()=>{
  const admin=source("app/api/admin/site-theme-campaign/route.ts");
  const player=source("app/api/user/theme-campaign-override/route.ts");
  assert.match(admin,/export async function GET/);
  assert.match(admin,/export async function POST/);
  assert.match(player,/export async function POST/);
  assert.match(admin,/await requireAdmin\(request\)/);
  assert.match(player,/await getSessionUid\(request\)/);
  assert.match(admin,/callAppearanceWriter\("admin"/);
  assert.match(player,/callAppearanceWriter\("personal"/);
  for(const text of [admin,player]) {
    assert.doesNotMatch(text,/\.siteThemeCampaign\.(update|upsert|create|delete)\(/);
    assert.doesNotMatch(text,/\.userThemeCampaignOverride\.(update|upsert|create|delete)\(/);
    assert.doesNotMatch(text,/recordUserActivity\(/);
    assert.match(text,/validateAppearanceWriteOrigin\(request\)/);
    assert.match(text,/readBoundedAppearanceJson\(request\)/);
  }
  const transport=source("lib/appearanceWriterClient.ts");
  assert.match(transport,/socketPath: APPEARANCE_WRITER_SOCKET/);
  assert.doesNotMatch(transport,/APPEARANCE_WRITER_DATABASE_URL/);
  assert.doesNotMatch(source("lib/siteThemeCampaign.ts"),
    /\.userThemeCampaignOverride\.upsert\(/);
  const runtime=source("bin/appearance-writer.mjs");
  assert.match(runtime,/APPEARANCE_WRITER_DATABASE_URL/);
  assert.match(runtime,/jwtVerify\(/);
  assert.match(runtime,/server.listen\(SOCKET/);
  assert.doesNotMatch(runtime,/0\.0\.0\.0/);
});
