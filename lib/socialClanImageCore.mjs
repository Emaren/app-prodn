// HD member-only Clan Hall image writer. Separate root and fixed ledger-backed SQL.
// The reviewed SQL leaf and private shared storage root must be admitted before activation.
import { createHash, randomUUID } from "node:crypto";
import { open, lstat, realpath, unlink } from "node:fs/promises";
import path from "node:path";

export const MAX_IMAGE_BYTES = 10_000_000;
export const MAX_IMAGE_RPC_BYTES = 13_400_000;
const IMAGE_TYPES = Object.freeze({"image/png":"png","image/jpeg":"jpg","image/webp":"webp"});
const IMAGE_CALL = "SELECT aoe2war_clan_image_hd_v1.post_image($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::integer) AS decision";
const READ_CALL = "SELECT aoe2war_clan_image_hd_v1.read_image($1::text,$2::text,$3::integer) AS decision";
const slug = v=>typeof v==="string"&&/^[a-z0-9][a-z0-9_-]{0,79}$/.test(v);
const id=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const validName=v=>typeof v==="string"&&v.length>=1&&v.length<=160&&!/[\u0000-\u001f\u007f/\\]/.test(v);
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail = (status, detail) => ({status,body:{detail}});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const uid = (v) => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
function parse(input) {
  const allowed = ["slug","requestKey","name","mimeType","imageBase64"];
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== allowed.length ||
      Object.keys(input).some(k => !allowed.includes(k))) return null;
  const {slug:clanSlug,requestKey,name,mimeType,imageBase64}=input;
  if (!slug(clanSlug) ||
      typeof requestKey !== "string" || !/^[0-9a-f]{32}$/.test(requestKey) ||
      !validName(name) ||
      typeof mimeType !== "string" || !Object.hasOwn(IMAGE_TYPES,mimeType) ||
      typeof imageBase64 !== "string" || imageBase64.length > 4*Math.ceil(MAX_IMAGE_BYTES/3) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return null;
  const bytes=Buffer.from(imageBase64,"base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== imageBase64) return null;
  const digest=hash(JSON.stringify([clanSlug,name,mimeType,hash(bytes)]));
  return {clanSlug,requestKey,name,mimeType,bytes,digest};
}
async function syncDir(root) {
  const dir=await open(root,"r");
  try { await dir.sync(); } finally { await dir.close(); }
}
async function privateRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root) || path.resolve(root)!==root) throw Error("MEDIA_ROOT_REQUIRED");
  const stat=await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(root)!==root ||
      stat.uid!==process.getuid() || (stat.mode & 0o777)!==0o750) throw Error("MEDIA_ROOT_NOT_ADMITTED");
  return root;
}
async function store(root, action) {
  const filename="clan-"+randomUUID().replaceAll("-","")+"."+IMAGE_TYPES[action.mimeType];
  const file=path.join(root,filename);
  let handle,created=false;
  try {
    handle=await open(file,"wx",0o640); created=true;
    await handle.chmod(0o640);
    const [fileStat,rootStat]=await Promise.all([handle.stat(),lstat(root)]);
    if(fileStat.gid!==rootStat.gid || fileStat.uid!==rootStat.uid || fileStat.nlink!==1) throw Error("MEDIA_FILE_CUSTODY");
    await handle.writeFile(action.bytes);
    await handle.sync();
    await handle.close(); handle=null;
    await syncDir(root);
    return {file,reference:"file:v1:"+filename};
  } catch(error) {
    if (handle) await handle.close().catch(()=>{});
    if (created) await unlink(file).catch(()=>{});
    throw error;
  }
}
async function discard(root, stored) {
  if (!stored) return;
  await unlink(stored.file);
  await syncDir(root);
}
function decision(result) {
  const d=result?.rows?.[0]?.decision;
  if (exact(d,["status","messageId","attachmentId","replayed"])&&d.status===201&&id(d.messageId)&&id(d.attachmentId)&&typeof d.replayed==="boolean")
    return {status:201,body:{messageId:d.messageId,attachmentId:d.attachmentId,replayed:d.replayed}};
  if (exact(d,["status","detail"])&&[400,401,403,404,409,429,503].includes(d.status)&&typeof d.detail==="string"&&/^[A-Z0-9_]{2,80}$/.test(d.detail))
    return fail(d.status,d.detail);
  throw Error("MEDIA_DB_RESULT_INVALID");
}
export async function executeSocialClanImageWrite({pool,verifySession,verifyImage,sessionToken,input,root,onError}) {
  const action=parse(input);
  if (!action) return fail(400,"INVALID_CLAN_IMAGE_REQUEST");
  if (typeof sessionToken!=="string" || sessionToken.length<32 || sessionToken.length>4096)
    return fail(401,"SIGNED_SESSION_REQUIRED");
  let actor;
  try { actor=await verifySession(sessionToken); if (!uid(actor)) throw Error(); }
  catch { return fail(401,"INVALID_SIGNED_SESSION"); }
  try { if (!await verifyImage(action.bytes,action.mimeType)) return fail(415,"INVALID_IMAGE_BYTES"); }
  catch { return fail(415,"INVALID_IMAGE_BYTES"); }
  let db,stored,began=false,commitAttempted=false,discardSafe=false;
  try {
    root=await privateRoot(root);
    db=await pool.connect();
    stored=await store(root,action);
    discardSafe=true; // No database mutation until the transaction call.
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE"); began=true;
    await db.query("SET LOCAL statement_timeout = '1500ms'");
    await db.query("SET LOCAL lock_timeout = '350ms'");
    discardSafe=false;
    const reply=decision(await db.query(IMAGE_CALL,[actor,action.clanSlug,action.requestKey,action.digest,stored.reference,action.name,action.mimeType,action.bytes.length]));
    if (reply.status===201) {
      commitAttempted=true;
      await db.query("COMMIT"); began=false;
      discardSafe=reply.body.replayed; // Existing committed ID, not this attempt's file.
      if (discardSafe) { await discard(root,stored).catch(()=>onError?.("MEDIA_ORPHAN_RECONCILE_REQUIRED")); stored=null; }
      return reply;
    }
    await db.query("ROLLBACK"); began=false; discardSafe=true;
    await discard(root,stored).catch(()=>onError?.("MEDIA_ORPHAN_RECONCILE_REQUIRED")); stored=null;
    return reply;
  } catch(error) {
    if (began) {
      try { await db.query("ROLLBACK"); if (!commitAttempted) discardSafe=true; }
      catch { discardSafe=false; }
    }
    // Never remove a potentially referenced file after an uncertain COMMIT.
    if (stored && discardSafe && !commitAttempted)
      await discard(root,stored).catch(()=>onError?.("MEDIA_ORPHAN_RECONCILE_REQUIRED"));
    else if (stored) onError?.("MEDIA_ORPHAN_RECONCILE_REQUIRED");
    if (!commitAttempted && (error?.code==="40001" || error?.code==="55P03"))
      return fail(409,"SOCIAL_RETRY_SAFELY");
    onError?.("SOCIAL_IMAGE_WRITE_UNAVAILABLE");
    return fail(503,"SOCIAL_IMAGE_STATUS_UNKNOWN_RETRY_SAME_KEY");
  } finally { db?.release(); }
}

export async function executeSocialClanImageRead({pool,verifySession,sessionToken,input,onError}) {
 if(!exact(input,["slug","attachmentId"])||!slug(input.slug)||!id(input.attachmentId))return fail(400,"INVALID_CLAN_IMAGE_READ");
 let actor;
 try{if(typeof sessionToken!=="string"||sessionToken.length<32||sessionToken.length>4096)throw Error();actor=await verifySession(sessionToken);if(!uid(actor))throw Error();}catch{return fail(401,"INVALID_SIGNED_SESSION");}
 let db,began=false,discard=false;
 try{
  db=await pool.connect();
  // The fixed SQL leaf takes a membership FOR SHARE lock; PostgreSQL disallows it in READ ONLY.
  // No mutation or arbitrary query is exposed. Commit releases that lock.
  await db.query("BEGIN");began=true;
  await db.query("SET LOCAL statement_timeout = '1500ms'");
  await db.query("SET LOCAL lock_timeout = '350ms'");
  const r=await db.query(READ_CALL,[actor,input.slug,input.attachmentId]);
  if(r?.rows?.length!==1)throw Error();
  const x=r.rows[0].decision;
  if(x===null){await db.query("ROLLBACK");began=false;return fail(404,"CLAN_IMAGE_NOT_FOUND");}
  if(!exact(x,["storageRef","mimeType","name","sizeBytes"])||!Object.hasOwn(IMAGE_TYPES,x.mimeType)||typeof x.storageRef!=="string"||!/^file:v1:clan-[0-9a-f]{32}\.(png|jpg|webp)$/.test(x.storageRef)||!x.storageRef.endsWith("."+IMAGE_TYPES[x.mimeType])||!validName(x.name)||!id(x.sizeBytes)||x.sizeBytes>MAX_IMAGE_BYTES)throw Error();
  await db.query("COMMIT");began=false;return {status:200,body:x};
 }catch{if(began)try{await db.query("ROLLBACK");}catch{discard=true;}else discard=true;onError?.("CLAN_IMAGE_READ_UNAVAILABLE");return fail(503,"CLAN_IMAGE_READ_UNAVAILABLE");}finally{db?.release(discard);}
}
