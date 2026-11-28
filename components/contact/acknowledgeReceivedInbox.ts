import type {ContactInboxPayload} from "./types";

type Entry={busy:boolean;retryAfter:number;acked:Set<number>};
const entries=new Map<string,Entry>();
const limit=50;
const maxEntries=32;
const validId=(id:number)=>Number.isSafeInteger(id)&&id>0&&id<=2147483647;

// Delivery means the authenticated client received message metadata in a
// successful history response, NOT that an image was opened or text was read.
export async function acknowledgeReceivedInbox(payload:ContactInboxPayload,summaryOnly:boolean,visible:boolean,send:typeof fetch=fetch,now=Date.now){
  const target=payload.activeTargetUid,viewer=payload.viewer?.uid;
  if(summaryOnly||!visible||!target||!viewer||target===viewer||payload.activeCounterpart?.threadKind!=="direct")return;
  const ids=[...new Set(payload.messages.flatMap(m=>m.kind==="text"&&m.deliveryPending===true&&
    m.sender.uid===target&&validId(m.messageId)?[m.messageId]:[]))];
  if(!ids.length)return;
  const key=JSON.stringify([viewer,target]);
  let entry=entries.get(key);
  if(!entry){
    if(entries.size>=maxEntries){
      const evict=[...entries].find(([,value])=>!value.busy);
      if(!evict)return;
      entries.delete(evict[0]);
    }
    entry={busy:false,retryAfter:0,acked:new Set()};
    entries.set(key,entry);
  }
  if(entry.busy||now()<entry.retryAfter)return;
  const pending=ids.filter(id=>!entry.acked.has(id)).slice(0,limit*2);
  if(!pending.length)return;
  entry.busy=true;
  try{
    for(let start=0;start<pending.length;start+=limit){
      const messageIds=pending.slice(start,start+limit);
      const response=await send("/api/contact-emaren",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"ack_delivery",targetUid:target,messageIds}),
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||result?.ok!==true||!Number.isInteger(result.updatedCount)||
         result.updatedCount<0||result.updatedCount>messageIds.length){
        entry.retryAfter=now()+30_000;return;
      }
      for(const id of messageIds)entry.acked.add(id);
      while(entry.acked.size>256)entry.acked.delete(entry.acked.values().next().value!);
    }
  }catch{entry.retryAfter=now()+30_000;}
  finally{entry.busy=false;}
}
