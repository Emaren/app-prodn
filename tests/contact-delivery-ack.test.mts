import assert from "node:assert/strict";
import test from "node:test";
import {acknowledgeReceivedInbox} from "../components/contact/acknowledgeReceivedInbox.ts";
import type {ContactInboxPayload} from "../components/contact/types.ts";
const payload=(viewer:string,n=81)=>({viewer:{uid:viewer},activeTargetUid:"bob",activeCounterpart:{threadKind:"direct"},messages:[...Array.from({length:n},(_,i)=>({kind:"text",deliveryPending:true,sender:{uid:"bob"},messageId:i+1})),{kind:"text",deliveryPending:true,sender:{uid:viewer},messageId:200},{kind:"text",deliveryPending:false,sender:{uid:"bob"},messageId:201}]} as unknown as ContactInboxPayload);
test("acks only inbound pending metadata, bounded batches, dedup and no summary/background requests",async()=>{
 const calls:unknown[]=[];
 const send=async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));calls.push(body);return new Response(JSON.stringify({ok:true,updatedCount:body.messageIds.length}));};
 await acknowledgeReceivedInbox(payload("a"),true,true,send as typeof fetch);
 await acknowledgeReceivedInbox(payload("a"),false,false,send as typeof fetch);
 assert.equal(calls.length,0);
 await acknowledgeReceivedInbox(payload("a"),false,true,send as typeof fetch);
 assert.deepEqual(calls,[{action:"ack_delivery",targetUid:"bob",messageIds:Array.from({length:50},(_,i)=>i+1)},{action:"ack_delivery",targetUid:"bob",messageIds:Array.from({length:31},(_,i)=>i+51)}]);
 await acknowledgeReceivedInbox(payload("a"),false,true,send as typeof fetch);assert.equal(calls.length,2);
});
test("failed ack backs off, concurrent readback does not duplicate, retry after 30 seconds",async()=>{
 let calls=0,time=1000;let resolve!:()=>void;
 const wait=new Promise<void>(r=>{resolve=r});
 const send=async()=>{calls++;await wait;return new Response("{}",{status:503});};
 const a=acknowledgeReceivedInbox(payload("c",1),false,true,send as typeof fetch,()=>time);
 await acknowledgeReceivedInbox(payload("c",1),false,true,send as typeof fetch,()=>time);
 assert.equal(calls,1);resolve();await a;
 await acknowledgeReceivedInbox(payload("c",1),false,true,send as typeof fetch,()=>time);assert.equal(calls,1);
 time+=30_001;await acknowledgeReceivedInbox(payload("c",1),false,true,send as typeof fetch,()=>time);assert.equal(calls,2);
});
