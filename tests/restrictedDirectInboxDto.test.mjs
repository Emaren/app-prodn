import test from "node:test";
import assert from "node:assert/strict";
import {mapRestrictedInbox,selectRestrictedTarget,restrictedSyncMarker} from "../lib/restrictedDirectInboxDto.mjs";
const person=(uid,isAdmin=false)=>({uid,displayName:uid,isAdmin});
const summary={viewer:person("alice"),summary:{threads:[{targetUid:"bob",displayName:"Bob",isAdmin:false,unreadCount:2,lastMessageAt:"2026-11-26T00:00:00+00:00",lastMessageSnippet:"hello"}],hasMore:false},defaultContact:"bob"};
const msg={messageId:10,senderUid:"bob",senderName:"Bob",senderIsAdmin:false,body:"hi",bodyTruncated:false,createdAt:"2026-11-26T00:00:00+00:00",deliveredAt:null,editedAt:null,replyToMessageId:null,attachment:{kind:"image",name:"x.png",mimeType:"image/png",storageRef:"must-not-leak"},unsupportedAttachment:false};
const history={conversationId:2,counterpart:person("bob"),messages:[msg],hasMore:false,beforeMessageId:null};
const opts={actor:"alice",targetUid:"bob"};
test("default and explicit target selection",()=>{assert.equal(selectRestrictedTarget(summary,null),"bob");assert.equal(selectRestrictedTarget(summary,"carol"),"carol");assert.throws(()=>selectRestrictedTarget(summary,"alice"));});
test("summary preserves counts and does not need history",()=>{const x=mapRestrictedInbox(summary,null,{...opts,summaryOnly:true});assert.equal(x.totalUnreadCount,2);assert.equal(x.activeCounterpart,null);assert.deepEqual(x.messages,[]);});
test("recipient attachment URL uses ID only; delivery pending",()=>{const x=mapRestrictedInbox(summary,history,opts);assert.equal(x.messages[0].attachment.url,"/api/contact-emaren?attachmentMessageId=10");assert.equal(x.messages[0].deliveryPending,true);assert.equal(x.messages[0].receipt,null);assert(!JSON.stringify(x).includes("must-not-leak"));});
test("outgoing receipt does not invent read status",()=>{const x=mapRestrictedInbox(summary,{...history,messages:[{...msg,senderUid:"alice",deliveredAt:"2026-11-26T00:00:01+00:00"}]},opts);assert.equal(x.messages[0].receipt.status,"delivered");assert.equal(x.messages[0].receipt.readAt,null);});
test("sync matches full snapshot and changes after delivery",()=>{const x=mapRestrictedInbox(summary,history,opts);assert.equal(x.syncMarker,restrictedSyncMarker(2,[{id:10,deliveredAt:null,editedAt:null}]));assert.notEqual(x.syncMarker,restrictedSyncMarker(2,[{id:10,deliveredAt:"2026-11-26T00:00:01Z",editedAt:null}]));});
test("older page does not advertise current sync",()=>{assert.equal(mapRestrictedInbox(summary,history,{...opts,before:20}).syncMarker,undefined);});
test("unrelated actor, mismatched counterpart, cross-pair sender rejected",()=>{assert.throws(()=>mapRestrictedInbox(summary,history,{...opts,actor:"carol"}));assert.throws(()=>mapRestrictedInbox(summary,{...history,counterpart:person("carol")},opts));assert.throws(()=>mapRestrictedInbox(summary,{...history,messages:[{...msg,senderUid:"carol"}]},opts));});
test("new empty thread; no invented marker",()=>{const x=mapRestrictedInbox(summary,{...history,conversationId:null,messages:[]},opts);assert.equal(x.activeCounterpart.uid,"bob");assert.equal(x.syncMarker,undefined);});
test("unsupported history is explicit; no raw reference",()=>{const x=mapRestrictedInbox(summary,{...history,messages:[{...msg,attachment:null,unsupportedAttachment:true,bodyTruncated:true}]},opts);assert.match(x.messages[0].body,/Legacy attachment unavailable/);assert.match(x.messages[0].body,/Message truncated/);});

test("restricted summary and history explicitly deny legacy mutations",()=>{for(const [h,o] of [[null,{...opts,summaryOnly:true}],[history,opts]]){const x=mapRestrictedInbox(summary,h,o);assert.equal(x.legacyMutations,false);assert.equal(x.draft,null);}});
