export type DirectSyncBaseline={viewerUid:string;targetUid:string;marker:string;fullAt:number};
const validMarker=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export function directSyncBaseline(payload:{viewer:{uid:string};activeTargetUid:string|null;syncMarker?:string},now=Date.now()):DirectSyncBaseline|null{
  if(!payload.activeTargetUid||!validMarker(payload.syncMarker))return null;
  return {viewerUid:payload.viewer.uid,targetUid:payload.activeTargetUid,marker:payload.syncMarker,fullAt:now};
}
export async function directInboxUnchanged(baseline:DirectSyncBaseline|null,viewerUid:string,targetUid:string|null|undefined,signal:AbortSignal,send:typeof fetch=fetch,now=Date.now()){
  if(!baseline||!targetUid||baseline.viewerUid!==viewerUid||baseline.targetUid!==targetUid||
     now-baseline.fullAt>=30_000||signal.aborted)return false;
  try{
    const params=new URLSearchParams({user:targetUid,sync:"1"});
    const response=await send("/api/contact-emaren?"+params,{cache:"no-store",credentials:"same-origin",signal});
    if(!response.ok)return false;
    const data=await response.json();
    return !signal.aborted&&validMarker(data?.syncMarker)&&data.syncMarker===baseline.marker;
  }catch(error){if(signal.aborted)throw error;return false;}
}
