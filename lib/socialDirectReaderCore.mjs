// HD read-only Direct Chat boundary. Actor is derived only from the signed session.
export const DIRECT_READ_MAX_REPLY_BYTES=2*1024*1024;
const CALL="SELECT aoe2war_direct_read_hd_v1.read_direct($1::text,$2::text,$3::text,$4::integer,$5::text,$6::integer) AS decision";
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const uid=x=>typeof x==="string"&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x);
const id=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
const fail=(status,detail)=>({status,body:{detail}});
const str=(x,n)=>typeof x==="string"&&x.length<=n;
const nullable=(x,f)=>x===null||f(x);
const date=x=>typeof x==="string"&&x.length<=40&&/(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const mime=x=>["image/png","image/jpeg","image/webp"].includes(x);
const ref=x=>typeof x==="string"&&/^file:v1:dm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(x);
const identity=x=>exact(x,["uid","displayName","isAdmin"])&&uid(x.uid)&&str(x.displayName,1024)&&typeof x.isAdmin==="boolean";
function validateInput(input){
 if(!obj(input)||typeof input.op!=="string")return null;
 const op=input.op;
 const a={op,targetUid:null,before:null,query:null,messageId:null};
 if(op==="summary")return exact(input,["op"])?a:null;
 if(op==="attachment")return exact(input,["op","messageId"])&&id(input.messageId)?{...a,messageId:input.messageId}:null;
 if(!uid(input.targetUid))return null;
 a.targetUid=input.targetUid;
 if(op==="sync")return exact(input,["op","targetUid"])?a:null;
 if(op==="history")return exact(input,["op","targetUid","before"])&&(input.before==null||id(input.before))?{...a,before:input.before??null}:null;
 if(op==="search")return exact(input,["op","targetUid","query"])&&typeof input.query==="string"&&input.query.length>=2&&input.query.length<=120&&input.query.trim()===input.query&&!input.query.includes("\0")?{...a,query:input.query}:null;
 return null;
}
function validResult(a,actor,x){
 if(!obj(x))return false;
 if(a.op==="summary")return exact(x,["viewer","summary","defaultContact"])&&identity(x.viewer)&&x.viewer.uid===actor&&nullable(x.defaultContact,uid)&&exact(x.summary,["threads","hasMore"])&&typeof x.summary.hasMore==="boolean"&&Array.isArray(x.summary.threads)&&x.summary.threads.length<=100&&x.summary.threads.every(t=>exact(t,["targetUid","displayName","isAdmin","lastMessageAt","lastMessageSnippet","unreadCount"])&&uid(t.targetUid)&&t.targetUid!==actor&&str(t.displayName,1024)&&typeof t.isAdmin==="boolean"&&nullable(t.lastMessageAt,date)&&nullable(t.lastMessageSnippet,v=>str(v,320))&&Number.isSafeInteger(t.unreadCount)&&t.unreadCount>=0);
 if(a.op==="attachment")return exact(x,["messageId","storageRef","mimeType","name"])&&x.messageId===a.messageId&&ref(x.storageRef)&&mime(x.mimeType)&&x.storageRef.endsWith({"image/png":".png","image/jpeg":".jpg","image/webp":".webp"}[x.mimeType])&&nullable(x.name,v=>str(v,510));
 if(a.op==="sync")return exact(x,["conversationId","rows"])&&id(x.conversationId)&&Array.isArray(x.rows)&&x.rows.length<=80&&x.rows.every(r=>exact(r,["id","deliveredAt","editedAt"])&&id(r.id)&&nullable(r.deliveredAt,date)&&nullable(r.editedAt,date));
 if(a.op==="search")return exact(x,["results"])&&Array.isArray(x.results)&&x.results.length<=40&&x.results.every(r=>exact(r,["messageId","body","createdAt","senderName"])&&id(r.messageId)&&str(r.body,8000)&&date(r.createdAt)&&str(r.senderName,1024));
 if(a.op==="history")return exact(x,["conversationId","counterpart","messages","hasMore","beforeMessageId"])&&nullable(x.conversationId,id)&&identity(x.counterpart)&&x.counterpart.uid===a.targetUid&&typeof x.hasMore==="boolean"&&nullable(x.beforeMessageId,id)&&x.hasMore===(x.beforeMessageId!==null)&&Array.isArray(x.messages)&&x.messages.length<=80&&(x.conversationId!==null||x.messages.length===0)&&x.messages.every(m=>exact(m,["messageId","senderUid","senderName","senderIsAdmin","body","bodyTruncated","createdAt","deliveredAt","editedAt","replyToMessageId","attachment","unsupportedAttachment"])&&id(m.messageId)&&[actor,a.targetUid].includes(m.senderUid)&&str(m.senderName,1024)&&typeof m.senderIsAdmin==="boolean"&&str(m.body,8000)&&typeof m.bodyTruncated==="boolean"&&date(m.createdAt)&&nullable(m.deliveredAt,date)&&nullable(m.editedAt,date)&&nullable(m.replyToMessageId,id)&&typeof m.unsupportedAttachment==="boolean"&&nullable(m.attachment,t=>exact(t,["kind","name","mimeType"])&&t.kind==="image"&&nullable(t.name,v=>str(v,510))&&mime(t.mimeType)));
 return false;
}
export async function executeSocialDirectRead({pool,verifySession,sessionToken,input,onError}){
 const a=validateInput(input);
 if(!a)return fail(400,"INVALID_DIRECT_READ_REQUEST");
 if(typeof sessionToken!=="string"||sessionToken.length<32||sessionToken.length>4096)return fail(401,"SIGNED_SESSION_REQUIRED");
 let actor;
 try{actor=await verifySession(sessionToken);if(!uid(actor))throw Error();}catch{return fail(401,"INVALID_SIGNED_SESSION");}
 if(a.targetUid===actor)return fail(404,"DIRECT_READ_NOT_FOUND");
 let db,began=false,discard=false;
 try{
  db=await pool.connect();
  await db.query("BEGIN READ ONLY");began=true;
  await db.query("SET LOCAL statement_timeout = '1500ms'");
  await db.query("SET LOCAL lock_timeout = '350ms'");
  const result=await db.query(CALL,[actor,a.op,a.targetUid,a.before,a.query,a.messageId]);
  if(result?.rows?.length!==1)throw Error("INVALID_DIRECT_READ_RESULT");
  const x=result.rows[0].decision;
  if(x===null){await db.query("ROLLBACK");began=false;return fail(404,"DIRECT_READ_NOT_FOUND");}
  if(!validResult(a,actor,x)||Buffer.byteLength(JSON.stringify(x),"utf8")>DIRECT_READ_MAX_REPLY_BYTES)throw Error("INVALID_DIRECT_READ_RESULT");
  await db.query("COMMIT");began=false;
  return {status:200,body:x};
 }catch{
  if(began)try{await db.query("ROLLBACK");}catch{discard=true;}
  else discard=true;
  onError?.("DIRECT_READ_UNAVAILABLE");
  return fail(503,"DIRECT_READ_UNAVAILABLE");
 }finally{db?.release(discard);}
}
