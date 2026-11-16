#!/usr/bin/env node
/**
 * WE1/C03: isolated NONFINANCIAL appearance-writer sidecar. NOT INSTALLED.
 * Needs independent B OS/auth review, root-owned JWT verification material,
 * dedicated writer DB credentials unavailable to the Next.js UID, and owner
 * exact-source one-use stage / activation permits.
 */
import { createServer } from "node:net";
import { lstat, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jwtVerify } from "jose";
import pg from "pg";
const { Pool } = pg;
const NOV_KEY = "november-crimson-2026";
const OCT_KEY = "october-black-2026";
const ORIGIN = "https://aoe2war.com";
const LIVE_SOCKET = "/run/aoe2war-appearance/appearance.sock";
const THEMES = new Set(["black","grey","white","sepia","walnut","crimson","midnight"]);
const MAX_FRAME = 8192;
const MAX_AGE = 30 * 24 * 60 * 60;

export class Denied extends Error {
  constructor(code,status=403) {super(code);this.code=code;this.status=status;}
}
function need(v,code,status=403) {if(!v)throw new Denied(code,status);}
function responseError(e) {return e instanceof Denied ?
  {ok:false,status:e.status,code:e.code} :
  {ok:false,status:503,code:"HOLD_APPEARANCE_BACKEND"};}
function config() {
  const isolated=process.env.NODE_ENV==="test" &&
    process.env.AOE2WAR_APPEARANCE_TEST_ONLY==="1";
  const live=process.env.NODE_ENV==="production" &&
    process.env.AOE2WAR_APPEARANCE_ADMITTED==="v1";
  need(isolated||live,"HOLD_WRITER_PROFILE",503);
  const url=process.env.APPEARANCE_DATABASE_URL;
  const secret=process.env.SESSION_SECRET;
  need(typeof url==="string"&&url.length<=600 &&
    typeof secret==="string"&&secret.length>=32,
    "HOLD_WRITER_CREDENTIALS",503);
  let db;
  try {db=new URL(url);} catch {throw new Denied("HOLD_DB_URL",503);}
  need(["postgres:","postgresql:"].includes(db.protocol) &&
    decodeURIComponent(db.username)==="aoe2war_appearance_writer" &&
    db.pathname==="/aoe2hd_db" &&
    db.hostname==="127.0.0.1" &&
    (live?db.port==="5432":Number(db.port)>=1024&&Number(db.port)<=65535) &&
    !db.searchParams.has("host"),"HOLD_WRITER_DATASOURCE",503);
  const socket=isolated?process.env.APPEARANCE_TEST_SOCKET:LIVE_SOCKET;
  need(typeof socket==="string"&&socket.startsWith("/")&&
    socket.length<105&&(live?socket===LIVE_SOCKET:!socket.startsWith("/run/aoe2war")),
    "HOLD_WRITER_SOCKET",503);
  return {url,secret:new TextEncoder().encode(secret),socket};
}
export async function verifySignedSession(token,secret,now=Math.floor(Date.now()/1000)) {
  need(typeof token==="string"&&token.length>=32&&token.length<=4096,
    "SIGNED_SESSION_REQUIRED",401);
  let claims;
  try {
    ({payload:claims}=await jwtVerify(token,secret,{
      issuer:"aoe2hdbets",algorithms:["HS256"],clockTolerance:0
    }));
  } catch {throw new Denied("SIGNED_SESSION_INVALID",401);}
  need(typeof claims.uid==="string"&&claims.uid.length>0&&
    claims.uid.length<=100&&/^[A-Za-z0-9_:-]+$/.test(claims.uid)&&
    Number.isInteger(claims.iat)&&Number.isInteger(claims.exp)&&
    claims.iat<=now&&claims.iat>=now-MAX_AGE&&
    claims.exp>now&&claims.exp<=claims.iat+MAX_AGE,
    "SIGNED_SESSION_EXPIRED_OR_MALFORMED",401);
  return claims.uid;
}
async function record(client,id,type,path,label,metadata) {
  return client.query(
    "INSERT INTO public.user_activity_events "+
    "(user_id,type,path,label,metadata) VALUES "+
    "($1::integer,$2::text,$3::text,$4::text,$5::jsonb)",
    [id,type,path,label,JSON.stringify(metadata)]);
}
export async function executeAppearance(pool,request,uid) {
  need(request&&typeof request==="object"&&!Array.isArray(request),
    "BAD_REQUEST",400);
  need(request.origin===ORIGIN,"ORIGIN_DENIED",403);
  need(!Object.hasOwn(request,"userId")&&!Object.hasOwn(request,"isAdmin")&&
    !Object.hasOwn(request,"sql"),"CLAIMED_AUTHORITY_DENIED",403);
  need(request.op==="activate-november"||request.op==="save-override",
    "OPERATION_DENIED",403);
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL statement_timeout='3500ms'");
    await c.query("SET LOCAL lock_timeout='1500ms'");
    const users=await c.query(
      "SELECT id,is_admin FROM public.users WHERE uid=$1::text LIMIT 1",[uid]);
    need(users.rowCount===1&&Number.isInteger(users.rows[0].id),
      "NO_SIGNED_ACCOUNT",403);
    const actor=users.rows[0];
    let result;
    if(request.op==="activate-november") {
      need(actor.is_admin===true,"ADMIN_ONLY",403);
      need(request.campaignKey===NOV_KEY&&
        request.themeKey===undefined&&request.label===undefined&&
        request.startsAt===undefined&&request.endsAt===undefined,
        "NOVEMBER_TRANSITION_ONLY",400);
      const old=await c.query(
        "SELECT campaign_key FROM public.site_theme_campaign "+
        "WHERE slot=1 FOR UPDATE");
      need(old.rowCount===1,"SINGLETON_MISSING",409);
      need(old.rows[0].campaign_key===OCT_KEY||
        old.rows[0].campaign_key===NOV_KEY,
        "CAMPAIGN_TRANSITION_NOT_APPROVED",409);
      if(old.rows[0].campaign_key===OCT_KEY) {
        const update=await c.query(
          "UPDATE public.site_theme_campaign SET "+
          "campaign_key=$1::text,label=$2::text,theme_key='crimson',"+
          "enabled=true,starts_at=TIMESTAMP '2026-11-01 06:00:00',"+
          "ends_at=TIMESTAMP '2026-12-01 07:00:00',"+
          "updated_by_user_id=$3::integer,updated_at=CURRENT_TIMESTAMP "+
          "WHERE slot=1 AND campaign_key=$4::text RETURNING campaign_key",
          [NOV_KEY,"November Ember Reign 2026",actor.id,OCT_KEY]);
        need(update.rowCount===1,"CAMPAIGN_CAS_FAILED",409);
        await record(c,actor.id,"site_theme_campaign_activate",
          "/api/admin/site-theme-campaign",NOV_KEY,{campaignKey:NOV_KEY});
      }
      result={ok:true,status:200,campaignKey:NOV_KEY,
        alreadyActive:old.rows[0].campaign_key===NOV_KEY};
    } else {
      need(request.campaignKey===NOV_KEY&&THEMES.has(request.themeKey),
        "UNKNOWN_CAMPAIGN_OR_THEME",400);
      // Integer-pair transaction lock: per-account concurrency and dedup.
      await c.query("SELECT pg_catalog.pg_advisory_xact_lock(190071,$1::integer)",
        [actor.id]);
      const check=await c.query(
        "SELECT campaign_key,enabled,"+
        "(starts_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND "+
        "ends_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) AS in_window "+
        "FROM public.site_theme_campaign WHERE slot=1 FOR SHARE");
      need(check.rowCount===1&&check.rows[0].campaign_key===NOV_KEY&&
        check.rows[0].enabled===true&&check.rows[0].in_window===true,
        "CAMPAIGN_NOT_ACTIVE",409);
      const saved=await c.query(
        "INSERT INTO public.user_theme_campaign_overrides "+
        "(campaign_key,user_id,theme_key) VALUES "+
        "($1::text,$2::integer,$3::text) "+
        "ON CONFLICT (campaign_key,user_id) DO UPDATE SET "+
        "theme_key=EXCLUDED.theme_key,updated_at=CURRENT_TIMESTAMP "+
        "RETURNING campaign_key,user_id,theme_key,updated_at",
        [NOV_KEY,actor.id,request.themeKey]);
      need(saved.rowCount===1&&saved.rows[0].user_id===actor.id,
        "OVERRIDE_NOT_SAVED",503);
      const label=NOV_KEY+"/"+request.themeKey;
      const recent=await c.query(
        "SELECT id FROM public.user_activity_events "+
        "WHERE user_id=$1::integer AND type='theme_campaign_override' "+
        "AND path='/api/user/theme-campaign-override' "+
        "AND label=$2::text "+
        "AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 seconds') LIMIT 1",
        [actor.id,label]);
      if(recent.rowCount===0) {
        await record(c,actor.id,"theme_campaign_override",
          "/api/user/theme-campaign-override",label,
          {campaignKey:NOV_KEY,themeKey:request.themeKey,campaignThemeKey:"crimson"});
      }
      result={ok:true,status:200,campaignKey:NOV_KEY,
        themeKey:saved.rows[0].theme_key,
        updatedAt:new Date(saved.rows[0].updated_at).toISOString()};
    }
    await c.query("COMMIT");
    return result;
  } catch(e) {
    try{await c.query("ROLLBACK");}catch{/* remain failed */}
    throw e;
  } finally {c.release();}
}
export async function handleFrame(pool,frame,secret) {
  try {
    need(typeof frame==="string"&&Buffer.byteLength(frame,"utf8")<=MAX_FRAME,
      "FRAME_TOO_LARGE",400);
    const req=JSON.parse(frame);
    need(req&&typeof req==="object"&&!Array.isArray(req),
      "MALFORMED_FRAME",400);
    const uid=await verifySignedSession(req.token,secret);
    return await executeAppearance(pool,req,uid);
  } catch(e) {return responseError(e);}
}
export async function main() {
  const cfg=config();
  const pool=new Pool({connectionString:cfg.url,max:4,
    connectionTimeoutMillis:1500,idleTimeoutMillis:7000});
  const server=createServer(socket=>{
    socket.setTimeout(4500);socket.setEncoding("utf8");
    let message="";let consumed=false;
    socket.on("data",async chunk=>{
      if(consumed)return;
      message+=chunk;
      if(Buffer.byteLength(message,"utf8")>MAX_FRAME) {
        consumed=true;
        socket.end('{"ok":false,"status":400,"code":"FRAME_TOO_LARGE"}\n');
        return;
      }
      const i=message.indexOf("\n");
      if(i<0)return;
      consumed=true;
      const res=await handleFrame(pool,message.slice(0,i),cfg.secret);
      const body=JSON.stringify(res);
      socket.end((body.length<=1500?body:
        '{"ok":false,"status":503,"code":"HOLD_RESPONSE_SIZE"}')+"\n");
    });
    socket.on("timeout",()=>socket.destroy());
    socket.on("error",()=>socket.destroy());
  });
  const old=await lstat(cfg.socket).catch(e=>{
    if(e?.code==="ENOENT")return null;
    throw e;
  });
  need(!old,"HOLD_EXISTING_SOCKET_NO_UNLINK",503);
  await new Promise((ok,no)=>{
    server.once("error",no);server.listen(cfg.socket,ok);
  });
  await chmod(cfg.socket,0o660);
  process.stdout.write("APPEARANCE_WRITER_SOCKET_ACTIVE_NOT_A_PRODUCTION_PERMIT\n");
  for(const signal of ["SIGTERM","SIGINT"]) {
    process.on(signal,()=>server.close(()=>pool.end().then(()=>process.exit(0))));
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{
    process.stderr.write("HOLD_APPEARANCE_WRITER_STARTUP\n");
    process.exitCode=75;
  });
}
