// Source-only candidate. Invoke only for a rendered, active foreground thread.
const entries=new Map();
const validId=id=>Number.isSafeInteger(id)&&id>0&&id<=2147483647;
export async function acknowledgeVisibleRead({payload,viewerUid,isActive,send=fetch,now=Date.now}){
 const target=payload?.activeTargetUid;
 if(!target||!viewerUid||payload.viewer?.uid!==viewerUid||target===viewerUid||payload.activeCounterpart?.threadKind!=="direct"||payload.legacyMutations!==false||!isActive())return false;
 // Only message IDs explicitly presented by the active rendered history.
 const ids=[...new Set(payload.messages.flatMap(m=>m.kind==="text"&&m.sender.uid===target&&validId(m.messageId)?[m.messageId]:[]))];
 if(!ids.length)return false;
 const key=JSON.stringify([viewerUid,target]);
 let e=entries.get(key);
 if(!e){if(entries.size>=32){const evict=[...entries].find(([,v])=>!v.busy);if(!evict)return false;entries.delete(evict[0]);}e={busy:false,retryAfter:0,acked:new Set()};entries.set(key,e);}
 if(e.busy||now()<e.retryAfter)return false;
 const pending=ids.filter(id=>!e.acked.has(id)).slice(0,100);
 if(!pending.length)return false;
 e.busy=true;let committed=false;
 try{
  for(let start=0;start<pending.length;start+=50){
   if(!isActive())break;
   const messageIds=pending.slice(start,start+50);
   const response=await send("/api/contact-emaren",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"ack_read",targetUid:target,messageIds})});
   const result=await response.json().catch(()=>null);
   if(!response.ok||result?.ok!==true||!Number.isInteger(result.updatedCount)||result.updatedCount<0||result.updatedCount>messageIds.length){e.retryAfter=now()+30000;break;}
   for(const id of messageIds)e.acked.add(id);
   // Even idempotent success warrants one authoritative summary refresh.
   committed=true;
   while(e.acked.size>256)e.acked.delete(e.acked.values().next().value);
  }
 }catch{e.retryAfter=now()+30000;}finally{e.busy=false;}
 return committed;
}
