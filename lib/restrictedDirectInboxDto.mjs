import {createHash} from "node:crypto";
// Adapter for the fixed HD reader contract. Never forward raw storage references.
const uid=x=>typeof x==="string"&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x);
const id=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const iso=x=>x===null?null:new Date(x).toISOString();
const identity=x=>x&&uid(x.uid)&&typeof x.displayName==="string"&&typeof x.isAdmin==="boolean";
const identityDto=x=>({uid:x.uid,displayName:x.displayName,isAdmin:x.isAdmin});
const counterpart=x=>({...identityDto(x),threadKind:"direct",badges:[],giftedWolo:0});
export function selectRestrictedTarget(summary,explicit){
 if(!identity(summary?.viewer)||!Array.isArray(summary?.summary?.threads))throw Error("DIRECT_SUMMARY_INVALID");
 if(explicit!==null&&explicit!==undefined){
  if(!uid(explicit)||explicit===summary.viewer.uid)throw Error("DIRECT_TARGET_INVALID");
  return explicit;
 }
 const selected=summary.viewer.isAdmin?(summary.summary.threads[0]?.targetUid??null):(summary.defaultContact??summary.summary.threads[0]?.targetUid??null);
 if(selected!==null&&(!uid(selected)||selected===summary.viewer.uid))throw Error("DIRECT_TARGET_INVALID");
 return selected;
}
export function restrictedSyncMarker(conversationId,rows){
 if(!id(conversationId)||!Array.isArray(rows)||rows.length>80||rows.some(r=>!id(r.id)))throw Error("DIRECT_SYNC_INVALID");
 return createHash("sha256").update(JSON.stringify([conversationId,rows.slice().sort((a,b)=>b.id-a.id).map(r=>[r.id,iso(r.deliveredAt),iso(r.editedAt)])])).digest("hex");
}
export function mapRestrictedInbox(summary,history,{actor,targetUid,summaryOnly=false,before=null}){
 if(!identity(summary?.viewer)||summary.viewer.uid!==actor||!Array.isArray(summary.summary?.threads)||summary.summary.threads.length>100)throw Error("DIRECT_SUMMARY_INVALID");
 const summaries=summary.summary.threads.map(t=>({targetUid:t.targetUid,displayName:t.displayName,threadKind:"direct",isAdmin:t.isAdmin,unreadCount:t.unreadCount,lastMessageAt:iso(t.lastMessageAt),lastMessageSnippet:t.lastMessageSnippet,badges:[],giftedWolo:0}));
 const payload={legacyMutations:false,viewer:identityDto(summary.viewer),summaries,totalUnreadCount:summaries.reduce((n,t)=>n+t.unreadCount,0),summaryTruncated:summary.summary.hasMore===true,activeTargetUid:targetUid,activeCounterpart:null,activeChallenges:[],activeChallenge:null,messages:[],messagePage:{hasMore:false,beforeMessageId:null},draft:null,pinnedMessages:[],unavailableReason:targetUid||summary.viewer.isAdmin?null:"Emaren contact is not configured yet.",conversation:null};
 if(summaryOnly||targetUid===null)return payload;
 if(!history||!identity(history.counterpart)||history.counterpart.uid!==targetUid||!Array.isArray(history.messages)||history.messages.length>80)throw Error("DIRECT_HISTORY_INVALID");
 const rows=history.messages;
 if(rows.some(m=>!id(m.messageId)||![actor,targetUid].includes(m.senderUid))||new Set(rows.map(m=>m.messageId)).size!==rows.length)throw Error("DIRECT_HISTORY_INVALID");
 const media=m=>m.attachment?{kind:"image",name:m.attachment.name,mimeType:m.attachment.mimeType,url:"/api/contact-emaren?attachmentMessageId="+m.messageId,durationSeconds:null}:null;
 const text=m=>(m.body||"")+(m.bodyTruncated?"\n[Message truncated]":"")+(m.unsupportedAttachment?"\n[Legacy attachment unavailable]":"");
 const byId=new Map(rows.map(m=>[m.messageId,m]));
 payload.messages=rows.map(m=>{
  const reply=byId.get(m.replyToMessageId);
  const outgoing=m.senderUid===actor;
  return {id:"message-"+m.messageId,messageId:m.messageId,kind:"text",createdAt:iso(m.createdAt),sender:{uid:m.senderUid,displayName:m.senderName,isAdmin:m.senderIsAdmin,badges:[]},body:text(m),attachment:media(m),reactions:[],sharedLobbyMessageId:null,replyTo:reply?{messageId:reply.messageId,senderName:reply.senderName,body:text(reply)||"Attachment",attachment:media(reply)}:null,isPinned:false,editedAt:iso(m.editedAt),transcription:null,transcriptionStatus:null,translations:[],replayCard:null,...(!outgoing&&!m.deliveredAt?{deliveryPending:true}:{}),receipt:outgoing?{status:m.deliveredAt?"delivered":"sent",deliveredAt:iso(m.deliveredAt),readAt:null}:null};
 });
 payload.activeCounterpart=counterpart(history.counterpart);
 payload.messagePage={hasMore:history.hasMore,beforeMessageId:history.beforeMessageId};
 payload.conversation={counterpartLastReadAt:null,counterpartTyping:false};
 if(before===null&&history.conversationId!==null)payload.syncMarker=restrictedSyncMarker(history.conversationId,rows.map(m=>({id:m.messageId,deliveredAt:m.deliveredAt,editedAt:m.editedAt})));
 return payload;
}
