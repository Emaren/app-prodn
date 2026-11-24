// Separate HD-only image operation. No raw table/sequence authority.
// The reviewed SQL leaf and private shared storage root must be admitted before activation.
import { createHash, randomUUID } from "node:crypto";
import { open, lstat, realpath, unlink } from "node:fs/promises";
import path from "node:path";

export const MAX_IMAGE_BYTES = 10_000_000;
export const MAX_IMAGE_RPC_BYTES = 13_400_000;
const IMAGE_TYPES = Object.freeze({"image/png":"png","image/jpeg":"jpg","image/webp":"webp"});
const IMAGE_CALL = "SELECT aoe2war_social_hd_v2.direct_image($1::text,$2::text,$3::text,$4::integer,$5::text,$6::text,$7::text,$8::text,$9::text,$10::integer) AS decision";
const fail = (status, detail) => ({status,body:{detail}});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const uid = (v) => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
function parse(input) {
  const allowed = ["targetUid","body","replyToMessageId","requestKey","name","mimeType","imageBase64"];
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== allowed.length ||
      Object.keys(input).some(k => !allowed.includes(k))) return null;
  const {targetUid, body, replyToMessageId, requestKey, name, mimeType, imageBase64} = input;
  if ((targetUid !== null && !uid(targetUid)) ||
      typeof body !== "string" || body.length > 1000 ||
      (replyToMessageId !== null && (!Number.isSafeInteger(replyToMessageId) || replyToMessageId < 1 || replyToMessageId > 2147483647)) ||
      typeof requestKey !== "string" || !/^[0-9a-f]{32}$/.test(requestKey) ||
      typeof name !== "string" || name.length > 160 || /[\u0000-\u001f\u007f/\\]/.test(name) ||
      typeof mimeType !== "string" || !Object.hasOwn(IMAGE_TYPES,mimeType) ||
      typeof imageBase64 !== "string" || imageBase64.length > 4*Math.ceil(MAX_IMAGE_BYTES/3) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return null;
  const bytes=Buffer.from(imageBase64,"base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== imageBase64) return null;
  const caption=body.replace(/\r\n?/g,"\n").trim();
  if (Buffer.byteLength(caption,"utf8") > 4000) return null;
  const digest=hash(JSON.stringify([targetUid,caption,replyToMessageId,name,mimeType,hash(bytes)]));
  return {targetUid,caption,replyToMessageId,requestKey,name,mimeType,bytes,digest};
}
async function syncDir(root) {
  const dir=await open(root,"r");
  try { await dir.sync(); } finally { await dir.close(); }
}
async function privateRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root) || path.resolve(root)!==root) throw Error("MEDIA_ROOT_REQUIRED");
  const stat=await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(root)!==root ||
      stat.uid!==process.getuid() || (stat.mode & 0o777)!==0o750 ||
      (!(stat.mode & 0o2000) && stat.gid!==process.getgid())) throw Error("MEDIA_ROOT_NOT_ADMITTED");
  return root;
}
async function store(root, action) {
  const filename="dm-"+randomUUID()+"."+IMAGE_TYPES[action.mimeType];
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
  if (d?.status===201 && d.body?.ok===true && uid(d.body.targetUid) &&
      Number.isSafeInteger(d.body.messageId) && d.body.messageId>0 &&
      typeof d.body.replayed==="boolean")
    return {status:201,body:{ok:true,messageId:d.body.messageId,targetUid:d.body.targetUid,replayed:d.body.replayed}};
  if ([400,401,403,404,409,429,503].includes(d?.status) &&
      typeof d.body?.detail==="string" && /^[A-Z0-9_]{2,80}$/.test(d.body.detail))
    return fail(d.status,d.body.detail);
  throw Error("MEDIA_DB_RESULT_INVALID");
}
export async function executeSocialImageWrite({pool,verifySession,verifyImage,sessionToken,input,root,onError}) {
  const action=parse(input);
  if (!action) return fail(400,"INVALID_DIRECT_IMAGE_REQUEST");
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
    const reply=decision(await db.query(IMAGE_CALL,[actor,action.targetUid,action.caption,
      action.replyToMessageId,action.requestKey,action.digest,stored.reference,action.name,
      action.mimeType,action.bytes.length]));
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
