// Restricted member-only Clan Hall read; no arbitrary SQL or client actor.
const CALL="SELECT aoe2war_clan_read_hd_v1.read_hall($1::text,$2::text,$3::integer,$4::integer) AS decision";
const id=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const slug=x=>typeof x==="string"&&/^[a-z0-9][a-z0-9_-]{0,79}$/.test(x);
const uid=x=>typeof x==="string"&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x);
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const text=(x,n)=>typeof x==="string"&&x.length<=n;
const nullable=(x,f)=>x===null||f(x);
const audience=x=>["clan","users","public"].includes(x);
const date=x=>text(x,40)&&/(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const mime=x=>["image/png","image/jpeg","image/webp"].includes(x);
const identity=x=>exact(x,["uid","displayName","role"])&&uid(x.uid)&&text(x.displayName,1024)&&nullable(x.role,r=>text(r,20));
const fail=(status,detail)=>({status,body:{detail}});
function valid(a,actor,x){
 return exact(x,["clan","viewer","messages","hasMore","beforeMessageId"])&&
 exact(x.clan,["id","slug","name","tagline","description","crestUrl","chatAudiencePolicy","memberCount"])&&id(x.clan.id)&&x.clan.slug===a.slug&&text(x.clan.name,120)&&nullable(x.clan.tagline,v=>text(v,180))&&nullable(x.clan.description,v=>text(v,8000))&&nullable(x.clan.crestUrl,v=>text(v,500))&&audience(x.clan.chatAudiencePolicy)&&Number.isSafeInteger(x.clan.memberCount)&&x.clan.memberCount>0&&
 identity(x.viewer)&&x.viewer.uid===actor&&x.viewer.role!==null&&
 typeof x.hasMore==="boolean"&&nullable(x.beforeMessageId,id)&&Array.isArray(x.messages)&&x.messages.length<=80&&
 (x.messages.length===0?x.beforeMessageId===null:x.beforeMessageId===x.messages[0].id)&&
 (!x.hasMore||x.messages.length===80)&&
 (a.focus===null||(!x.hasMore&&x.messages.length===1&&x.messages[0].id===a.focus))&&
 new Set(x.messages.map(m=>m?.id)).size===x.messages.length&&
 x.messages.every(m=>exact(m,["id","body","audience","createdAt","updatedAt","author","attachments","unsupportedAttachment"])&&id(m.id)&&text(m.body,2400)&&audience(m.audience)&&date(m.createdAt)&&date(m.updatedAt)&&identity(m.author)&&typeof m.unsupportedAttachment==="boolean"&&Array.isArray(m.attachments)&&m.attachments.length<=1&&m.attachments.every(t=>m.audience==="clan"&&exact(t,["id","name","mimeType","sizeBytes"])&&id(t.id)&&text(t.name,320)&&mime(t.mimeType)&&id(t.sizeBytes)&&t.sizeBytes<=10000000));
}
export async function executeSocialClanRead({pool,verifySession,sessionToken,input,onError}){
 if(!obj(input)||!Object.keys(input).every(k=>["slug","before","focus"].includes(k))||!slug(input.slug)||(input.before!=null&&!id(input.before))||(input.focus!=null&&!id(input.focus))||(input.before!=null&&input.focus!=null))return fail(400,"INVALID_CLAN_READ");
 const a={slug:input.slug,before:input.before??null,focus:input.focus??null};
 let actor;
 try{if(typeof sessionToken!=="string"||sessionToken.length<32||sessionToken.length>4096)throw Error();actor=await verifySession(sessionToken);if(!uid(actor))throw Error();}catch{return fail(401,"INVALID_SIGNED_SESSION");}
 let db,began=false,discard=false;
 try{
  db=await pool.connect();await db.query("BEGIN READ ONLY");began=true;
  await db.query("SET LOCAL statement_timeout = '1500ms'");await db.query("SET LOCAL lock_timeout = '350ms'");
  const r=await db.query(CALL,[actor,a.slug,a.before,a.focus]);
  if(r?.rows?.length!==1)throw Error();
  const x=r.rows[0].decision;
  if(x===null){await db.query("ROLLBACK");began=false;return fail(404,"CLAN_HALL_NOT_FOUND");}
  if(!valid(a,actor,x)||Buffer.byteLength(JSON.stringify(x))>2*1024*1024)throw Error();
  await db.query("COMMIT");began=false;return {status:200,body:x};
 }catch{if(began)try{await db.query("ROLLBACK");}catch{discard=true;}else discard=true;onError?.("CLAN_READ_UNAVAILABLE");return fail(503,"CLAN_READ_UNAVAILABLE");}finally{db?.release(discard);}
}
export function mapClanHall(x,{actor,slug,before=null,focus=null}){
 if(x?.viewer?.uid!==actor||x?.clan?.slug!==slug)throw Error("CLAN_HALL_IDENTITY_DRIFT");
 return {clan:{...x.clan,defaultChatView:"v1"},viewer:{authenticated:true,uid:actor,displayName:x.viewer.displayName,isMember:true,role:x.viewer.role,canManage:false},allowedAudiences:["clan"],messages:x.messages.map(m=>({id:m.id,body:m.body+(m.unsupportedAttachment?"\n[Legacy media unavailable]":""),audience:m.audience,createdAt:new Date(m.createdAt).toISOString(),updatedAt:new Date(m.updatedAt).toISOString(),edited:Date.parse(m.updatedAt)>Date.parse(m.createdAt),canEdit:false,canDelete:false,author:{...m.author,isClanMember:m.author.role!==null},attachments:m.attachments.map(t=>({id:t.id,name:t.name,mimeType:t.mimeType,sizeBytes:t.sizeBytes,kind:"image",url:"/api/social/clan-image?slug="+encodeURIComponent(slug)+"&attachmentId="+t.id})),reactions:[]})),messagePage:{kind:focus!==null?"focus":before!==null?"older":"latest",hasMore:x.hasMore,beforeMessageId:x.beforeMessageId},roster:[],access:{canReadChat:true,canPost:true,hallScribeRepliesAvailable:false,restrictedMemberHall:true,notice:"Active members only. Text and admitted local images; roster, reactions and management are not available in this release."}};
}
