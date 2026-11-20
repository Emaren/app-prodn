/** Deterministic owner-bound *review* queue, never an executor or item permit.
 * Accept only the already HMAC-verified category projection and owner ledger.
 */
import type {VisualHog} from "./storageVisualPrivate.ts";
import type {TeachingEvent} from "./storageHogTeachingLedger.ts";
import type {TeachingPlane} from "./storageHogTeachingPolicy.ts";
import {recommendLevel2Category} from "./storageLevel2CandidateEngine.ts";

export function buildStorageReviewQueue(input:{
  plane:TeachingPlane; observedAt:string|null; signedCurrent:boolean;
  hogs:readonly VisualHog[]; events:readonly TeachingEvent[];
  ownerBinding:string|null; now?:number;
}){
  if(!input.signedCurrent||!input.observedAt||!input.ownerBinding)
    return {admitted:false as const,items:[]};
  const items=input.hogs.map(hog=>({
    hog,sourceObservedAt:input.observedAt!,
    suggestion:recommendLevel2Category(input.events,{
      plane:input.plane,category:hog.key,observedAt:input.observedAt!,
      sourceFloor:hog.level,overlaps:hog.overlaps,sourceSigned:true,
    },input.ownerBinding,input.now),
  })).sort((a,b)=>{
    const score=(s:string)=>s==="REVIEW_SUGGESTED"?0:s==="NEEDS_EXAMPLES"?1:
      s==="ALREADY_REVIEWED"?2:s==="PROTECTED"?3:4;
    return score(a.suggestion.finding)-score(b.suggestion.finding)
      ||b.hog.grossBytes-a.hog.grossBytes;
  });
  return {admitted:true as const,items};
}
