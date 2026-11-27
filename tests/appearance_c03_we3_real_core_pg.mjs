#!/usr/bin/env node
// WE1/C03 actual WE3 source verification against UID650 isolated PG14 only.
// NEVER run against HEL1; refuse any other UID, host, port, database or source.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import { SignJWT, jwtVerify } from "jose";

const EXPECTED_HEAD="6a9c89a040fc05edc99ef1e85d9ecb5273534683";
const EXPECTED_CORE_BLOB="75b6f2e1d436a9fc31acb97a3b4fb5d6150f26f4";
const EXPECTED_BIN_BLOB="ef0dfbc5f0fc65802e73be4b9f0b885f328c3897";
const EXPECTED_SESSION_BLOB="05b0656b99b873639ff4c5a256c78da01163b868";
const SECRET="this-is-an-isolated-synthetic-only-test-secret-123";
const WRITER_PASSWORD="synthetic-only-UID650-SCRAM-case-20261116";
const T=[];
function assert(ok,name) {if (!ok) throw Error("FAIL_"+name);T.push(name);}
function exactSource() {
  const dir=process.env.WE3_EMBER_SOURCE_DIR;
  assert(process.getuid?.()===650,"UID650_restricted");
  assert(typeof dir==="string"&&dir.startsWith(process.env.HOME+"/we1-c03-we3-exact-source-"),
    "isolated_WE3_source_directory");
  const full=resolve(dir);
  function git(...args) {
    return execFileSync("git",["-C",full,...args],{encoding:"utf8",timeout:8000}).trim();
  }
  assert(git("rev-parse","HEAD")===EXPECTED_HEAD,"exact_WE3_source_HEAD");
  assert(git("hash-object","lib/appearanceWriterCore.mjs")===EXPECTED_CORE_BLOB,
    "actual_WE3_core_Git_blob");
  assert(git("hash-object","bin/appearance-writer.mjs")===EXPECTED_BIN_BLOB,
    "actual_WE3_bin_Git_blob");
  assert(git("hash-object","lib/session.ts")===EXPECTED_SESSION_BLOB,
    "actual_session_source_Git_blob");
  assert(!git("status","--porcelain"),"untouched_WE3_tree");
  return full;
}
async function run() {
  assert(process.env.NODE_ENV==="test","NODE_TEST_ONLY");
  const source=exactSource();
  const url=process.env.WE1_SYNTHETIC_WRITER_DB_URL;
  assert(url===
    "postgresql://aoe2war_appearance_writer:"+WRITER_PASSWORD+
    "@127.0.0.1:55491/aoe2hd_db","isolated_WRITER_DB_URL_only");
  const { Pool }=pg;
  const writer=new Pool({connectionString:url,max:8,
    connectionTimeoutMillis:2000,query_timeout:2500});
  const postgres=new Pool({connectionString:
    "postgresql://postgres@127.0.0.1:55491/aoe2hd_db",max:2,
    connectionTimeoutMillis:2000,query_timeout:2500});
  const {executeAppearanceAction,parseAppearanceAction}=
    await import(pathToFileURL(source+"/lib/appearanceWriterCore.mjs").href);
  const key=new TextEncoder().encode(SECRET);
  async function sign(uid,age=0,duration=240,secret=key){
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({uid}).setProtectedHeader({alg:"HS256"})
      .setIssuer("aoe2hdbets").setIssuedAt(now+age)
      .setExpirationTime(now+age+duration).sign(secret);
  }
  async function verifySignedSession(token){
    const {payload,protectedHeader}=await jwtVerify(token,key,
      {algorithms:["HS256"],issuer:"aoe2hdbets",clockTolerance:0});
    const now=Math.floor(Date.now()/1000);
    if(protectedHeader.alg!=="HS256"||typeof payload.uid!=="string"||
      !payload.uid.trim()||payload.uid.length>100||
      typeof payload.iat!=="number"||typeof payload.exp!=="number"||
      payload.iat>now+1||payload.exp>payload.iat+30*86400||
      payload.exp<=now) throw Error("JWT_REJECT");
    return payload.uid;
  }
  async function call(token,action,now){
    return executeAppearanceAction({pool:writer,verifySignedSession,
      token,action,...(now?{now}: {})});
  }
  const campaign="november-crimson-2026";
  const personal=(theme)=>({action:"setPersonalOverride",campaignKey:campaign,themeKey:theme});
  const activate={action:"activateNovember"};
  const admin=await sign("u_admin");
  const scribe=await sign("u_ordinary");
  const other=await sign("u_other");
  const count=async sql=>Number((await postgres.query(sql)).rows[0].n);
  try {
    assert((await writer.query("SELECT current_user")).rows[0].current_user===
      "aoe2war_appearance_writer","real_SCRAM_separate_writer_DB_role");
    const webDb=new Pool({connectionString:
      "postgresql://aoe2war_web_prod@127.0.0.1:55491/aoe2hd_db",max:1});
    try{
      let denied=false;
      try{await webDb.query("UPDATE public.site_theme_campaign SET enabled=false WHERE slot=1");}
      catch(e){denied=e.code==="42501";}
      assert(denied,"real_web_SQLSTATE42501_update_denial");
    }finally{await webDb.end();}
    assert(parseAppearanceAction({action:"setPersonalOverride",campaignKey:campaign,
      themeKey:"midnight",userId:1})===null,"cross_user_argument_rejected");
    assert(parseAppearanceAction({action:"activateNovember",isAdmin:true})===null,
      "admin_claim_argument_rejected");
    assert((await call("",activate)).status===401,"unsigned_denied");
    assert((await call(await sign("u_admin",0,200,new TextEncoder().encode(
      "synthetic_wrong_key_forged")),activate)).status===401,"forged_denied");
    assert((await call(await sign("u_admin",-600,120),activate)).status===401,
      "expired_denied");
    assert((await call(await sign("u_admin",300,120),activate)).status===401,
      "future_denied");
    assert((await call(await sign("missing_user"),activate)).status===403,
      "unknown_identity_denied");
    assert((await call(scribe,activate)).status===403,
      "ordinary_admin_denied");
    assert((await call(scribe,personal("midnight"))).status===409,
      "inactive_October_campaign_denied");
    assert((await call(admin,{action:"activateNovember",userId:2})).status===400,
      "cross_user_admin_denied");
    assert((await call(admin,{action:"setNovemberEnabled",enabled:false})).status===409,
      "cannot_disable_October");
    assert((await call(admin,activate)).status===200,"admin_November_transition");
    assert((await postgres.query("SELECT campaign_key FROM public.site_theme_campaign WHERE slot=1")).rows[0].campaign_key===campaign,
      "authoritative_November_singleton");
    assert((await call(admin,activate)).status===200,
      "idempotent_November_transition");
    assert(await count("SELECT count(*) AS n FROM public.user_theme_campaign_overrides WHERE campaign_key='october-black-2026'")===1,
      "October_override_history_preserved");
    assert((await call(admin,{action:"setNovemberEnabled",enabled:false})).status===200,
      "admin_disable_only_November");
    assert((await call(scribe,personal("midnight"))).status===409,
      "disabled_November_denied");
    assert((await call(admin,{action:"setNovemberEnabled",enabled:true})).status===200,
      "admin_reenable_November");
    assert((await call(scribe,personal("not-a-theme"))).status===400,
      "invalid_theme_denied");
    assert((await call(scribe,{action:"setPersonalOverride",
      campaignKey:"october-black-2026",themeKey:"black"})).status===400,
      "invalid_campaign_denied");
    assert((await call(scribe,personal("grey"),
      ()=>new Date("2027-01-01T12:00:00Z"))).status===409,"past_window_denied");
    const first=await call(scribe,personal("midnight"));
    assert(first.status===200&&first.body.themeKey==="midnight",
      "persistent_Scribe_override_accepted");
    assert(await count("SELECT count(*) AS n FROM public.user_theme_campaign_overrides WHERE campaign_key='november-crimson-2026' AND user_id=2")===1,
      "single_Scribe_override_row");
    const before=await count("SELECT count(*) AS n FROM public.user_activity_events WHERE type='theme_campaign_override' AND user_id=2");
    const many=await Promise.all(Array.from({length:8},()=>call(scribe,personal("midnight"))));
    assert(many.every(x=>x.status===200||x.status===409),
      "8_concurrent_serializable_safe_200_or_409");
    const committed=many.filter(x=>x.status===200).length;
    assert(committed>=1,"concurrent_at_least_one_success");
    assert(await count("SELECT count(*) AS n FROM public.user_theme_campaign_overrides WHERE campaign_key='november-crimson-2026' AND user_id=2")===1,
      "concurrent_one_override_record");
    const after=await count("SELECT count(*) AS n FROM public.user_activity_events WHERE type='theme_campaign_override' AND user_id=2");
    assert(after-before===committed,"each_success_has_exactly_one_audit");
    assert((await call(other,personal("black"))).status===200,
      "other_personal_identity_scoped");
    const mine=await postgres.query("SELECT user_id,theme_key FROM public.user_theme_campaign_overrides WHERE campaign_key=$1 ORDER BY user_id",[campaign]);
    assert(mine.rows.length===2 && mine.rows[0].user_id===2 &&
      mine.rows[1].user_id===3,"subjects_not_cross_written");
    const previous=(await postgres.query("SELECT theme_key FROM public.user_theme_campaign_overrides WHERE user_id=2 AND campaign_key=$1",[campaign])).rows[0].theme_key;
    await postgres.query("REVOKE INSERT (created_at) ON public.user_activity_events FROM aoe2war_appearance_writer");
    try {
      assert((await call(scribe,personal("grey"))).status===503,
        "audit_denial_produces_HOLD");
      const unchanged=(await postgres.query("SELECT theme_key FROM public.user_theme_campaign_overrides WHERE user_id=2 AND campaign_key=$1",[campaign])).rows[0].theme_key;
      assert(unchanged===previous,"audit_error_atomic_override_rollback");
    } finally {
      await postgres.query("GRANT INSERT (created_at) ON public.user_activity_events TO aoe2war_appearance_writer");
    }
    assert((await call(scribe,personal("grey"))).status===200,
      "audit_recovered_and_override_committed");
    let financialDenied=false;
    try{await writer.query("SELECT * FROM public.bet_wagers");}
    catch(e){financialDenied=e.code==="42501";}
    assert(financialDenied,"real_writer_financial_SQLSTATE42501");
    let userUpdateDenied=false;
    try{await writer.query("UPDATE public.users SET is_admin=true WHERE uid='u_ordinary'");}
    catch(e){userUpdateDenied=e.code==="42501";}
    assert(userUpdateDenied,"real_writer_users_UPDATE_SQLSTATE42501");
    let usersSeqDenied=false;
    try{await writer.query("SELECT nextval('public.users_id_seq')");}
    catch(e){usersSeqDenied=e.code==="42501";}
    assert(usersSeqDenied,"real_writer_users_sequence_SQLSTATE42501");
    console.log(JSON.stringify({
      verdict:"PASS_ACTUAL_WE3_CORE_ISOLATED_PG14_NOT_PRODUCTION",
      we3Head:EXPECTED_HEAD,we3CoreBlob:EXPECTED_CORE_BLOB,
      we3BinSourceBlob:EXPECTED_BIN_BLOB,testCount:T.length,
      tests:T,postgresBackend:"UID650 synthetic PostgreSQL14; real SCRAM",
      independentBinRuntimeTested:false,
      productionDbChanged:false,ownerPermit:false
    }));
  } finally {await writer.end();await postgres.end();}
}
run().catch(e=>{
  console.error(JSON.stringify({verdict:"HOLD_ACTUAL_WE3_CORE_ISOLATED",
    passed:T.length,error:String(e.message).slice(0,300)}));
  process.exitCode=1;
});
