/** Q09-A3: source-only bounded work ledger. No claims of agent runtime or live deployment. */
import registry from "../config/central-command-lanes.json" with {type:"json"};
import {readCentralEvents,type EventFeed,type SourceEvent,validSha,validAt} from "./centralEvents.ts";
export const WORK_SCHEMA="aoe2war.central-work-ledger.v1" as const;
export type LaneId="B"|"C"|"D"|"E"|"F"|"G";
export type LedgerStatus="FRESH"|"PARTIAL"|"STALE"|"UNKNOWN";
export type EvidenceStage="DISPATCH_PUBLISHED"|"SOURCE_COMMIT_OBSERVED"|"PR_OPENED"|"PR_UPDATED"|"HEAD_CI_CONCLUDED"|"REVIEW_SUBMITTED"|"MERGE_ACCEPTED";
export type LedgerEvent={id:string;kind:EvidenceStage|"COMMENT_PUBLISHED";at:string;repo:string;sourceUrl:string;sha:string|null;state:string|null;laneId:LaneId|null;};
export type LaneReceipt={id:LaneId;label:string;owner:string;issueUrl:string;lastEvent:LedgerEvent|null;events:LedgerEvent[];prCount:number;proof:"GITHUB_SOURCE_ONLY";agentPresence:"UNKNOWN";nativeWitness:"UNKNOWN";deployedBuildId:null;};
export type WorkItem={id:string;laneId:LaneId;repo:string;number:number;sourceUrl:string;headSha:string|null;lastEvidenceAt:string;milestones:Partial<Record<EvidenceStage,LedgerEvent>>;ci:"SUCCESS"|"FAILURE"|"OTHER"|"UNKNOWN";review:"APPROVED"|"CHANGES_REQUESTED"|"COMMENTED"|"UNKNOWN";merge:"MERGED_SOURCE_NOT_LIVE"|"UNKNOWN";deployment:"UNKNOWN";sourceDepth:"BOUNDED_NOT_DURABLE";};
export type WorkLedger={schema:typeof WORK_SCHEMA;status:LedgerStatus;readAt:string;observedAt:string|null;sourceCoverage:{accepted:number;expected:number};errorCode:string|null;history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE";queueAuthority:{url:"https://github.com/Emaren/app-prodn/issues/984";eligibility:"UNKNOWN";writeAccess:false};host:{deployedBuildId:null;state:"UNKNOWN";w1:"HELD_UNVERIFIED";postW1:"SOURCE_ONLY";fundedWolo:"SEPARATE_HELD"};events:LedgerEvent[];lanes:LaneReceipt[];items:WorkItem[];counts:{observedEvents:number;observedPRs:number;observedMerges:number;successfulConcludedCI:number;sourceDepth:"BOUNDED_ONLY"}};
const ALLOWED_IDS=new Set(["B","C","D","E","F","G"]);
const URL=/^https:\/\/github\.com\/Emaren\/(?:app-prodn|VPSSentry|wolochain)\/(?:pull|issues|commit|actions\/runs)\/[A-Za-z0-9/#-]+$/;
const PRURL=/^https:\/\/github\.com\/(Emaren\/(?:app-prodn|VPSSentry|wolochain))\/pull\/([1-9]\d{0,5})(?:#pullrequestreview-\d+)?$/;
const sha=(x:string|null)=>x!==null?validSha(x):null;
export function projectWorkLedger(feed:EventFeed,now=Date.now()):WorkLedger{
 const safeStatus=["FRESH","PARTIAL","STALE","UNKNOWN"].includes(feed.status)?feed.status:"UNKNOWN";
 // The source reader's already-deduplicated bounded feed is the *only* network read.
 // Reject forged URLs/IDs/future times even if a caller supplies a malformed fixture.
 const rows=new Map<string,LedgerEvent>();
 for(const raw of (Array.isArray(feed.events)?feed.events:[]).slice(0,120)){
  if(!raw||typeof raw.id!=="string"||raw.id.length>190||!raw.id.startsWith("github:")||!URL.test(raw.sourceUrl)||!validAt(raw.at,now))continue;
  if(!["COMMENT_PUBLISHED","DISPATCH_PUBLISHED","SOURCE_COMMIT_OBSERVED","PR_OPENED","PR_UPDATED","MERGE_ACCEPTED","REVIEW_SUBMITTED","HEAD_CI_CONCLUDED"].includes(raw.kind))continue;
  const lane=typeof raw.laneId==="string"&&ALLOWED_IDS.has(raw.laneId)?raw.laneId as LaneId:null;
  // A provider's repo is not implied by an arbitrary href.
  if(!raw.sourceUrl.startsWith("https://github.com/"+raw.repo+"/"))continue;
  const row:LedgerEvent={id:raw.id,kind:raw.kind,at:validAt(raw.at,now)!,repo:raw.repo,sourceUrl:raw.sourceUrl,sha:sha(raw.sha),state:typeof raw.state==="string"?raw.state.slice(0,35):null,laneId:lane};
  if(!rows.has(row.id))rows.set(row.id,row);
 }
 const events=[...rows.values()].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id)).slice(0,60);
 const lanes=(registry.lanes as Array<{id:string;label:string;owner:string;issue:{repository:string;number:number}}>).filter(x=>ALLOWED_IDS.has(x.id)).map(x=>{
  const laneEvents=events.filter(e=>e.laneId===x.id);
  return{id:x.id as LaneId,label:x.label,owner:x.owner,issueUrl:"https://github.com/"+x.issue.repository+"/issues/"+x.issue.number,
   lastEvent:laneEvents[0]??null,events:laneEvents.slice(0,12),prCount:new Set(laneEvents.filter(e=>e.kind==="PR_OPENED"||e.kind==="PR_UPDATED").map(e=>e.sourceUrl)).size,
   proof:"GITHUB_SOURCE_ONLY" as const,agentPresence:"UNKNOWN" as const,nativeWitness:"UNKNOWN" as const,deployedBuildId:null};
 });
 // A PR identity is created ONLY from an observed trusted PR URL, never from a random comment.
 const items:WorkItem[]=[];
 for(const lane of lanes){
  const prs=new Map<string,LedgerEvent[]>();
  for(const e of lane.events){
   if(!["PR_OPENED","PR_UPDATED","MERGE_ACCEPTED","REVIEW_SUBMITTED"].includes(e.kind))continue;
   const m=PRURL.exec(e.sourceUrl);if(!m)continue;
   const key=m[1]+"/"+m[2];prs.set(key,[...(prs.get(key)||[]),e]);
  }
  for(const [key,rs] of prs){
   const [repo,number]=key.split(/\/(?=\d+$)/);const id=Number(number);
   if(!Number.isSafeInteger(id)||id<=0)continue;
   const milestones:WorkItem["milestones"]={};
   for(const e of rs){const stage=e.kind as EvidenceStage;if(!milestones[stage]||e.at>milestones[stage]!.at)milestones[stage]=e;}
   const pr=milestones.PR_UPDATED??milestones.PR_OPENED??milestones.MERGE_ACCEPTED;
   const exactHead=milestones.PR_UPDATED?.sha??milestones.PR_OPENED?.sha??null;
   // GitHub global CI may belong to another lane. Correlate only by exact full head SHA.
   const ci=exactHead?events.find(e=>e.kind==="HEAD_CI_CONCLUDED"&&e.sha===exactHead):undefined;
   if(ci)milestones.HEAD_CI_CONCLUDED=ci;
   const review=milestones.REVIEW_SUBMITTED;
   const merge=milestones.MERGE_ACCEPTED;
   items.push({id:"github:"+key,laneId:lane.id,repo,number:id,sourceUrl:"https://github.com/"+key,headSha:exactHead,
    lastEvidenceAt:rs[0]?.at??pr?.at??"",milestones,ci:ci?.state==="SUCCESS"?"SUCCESS":ci?.state==="FAILURE"?"FAILURE":ci?"OTHER":"UNKNOWN",
    review:review?.state==="APPROVED"?"APPROVED":review?.state==="CHANGES_REQUESTED"?"CHANGES_REQUESTED":review?.state==="COMMENTED"?"COMMENTED":"UNKNOWN",
    merge:merge?"MERGED_SOURCE_NOT_LIVE":"UNKNOWN",deployment:"UNKNOWN",sourceDepth:"BOUNDED_NOT_DURABLE"});
  }
 }
 items.sort((a,b)=>b.lastEvidenceAt.localeCompare(a.lastEvidenceAt)||a.id.localeCompare(b.id));
 const readAt=validAt(feed.readAt,now)??new Date(now).toISOString();
 return{schema:WORK_SCHEMA,status:safeStatus,readAt,observedAt:events[0]?.at??null,
  sourceCoverage:{accepted:Number.isInteger(feed.sourceCoverage?.accepted)?Math.max(0,feed.sourceCoverage.accepted):0,expected:Number.isInteger(feed.sourceCoverage?.expected)?Math.max(0,feed.sourceCoverage.expected):0},
  errorCode:typeof feed.errorCode==="string"?feed.errorCode.slice(0,60):null,history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE",
  queueAuthority:{url:"https://github.com/Emaren/app-prodn/issues/984",eligibility:"UNKNOWN",writeAccess:false},
  host:{deployedBuildId:null,state:"UNKNOWN",w1:"HELD_UNVERIFIED",postW1:"SOURCE_ONLY",fundedWolo:"SEPARATE_HELD"},
  events,lanes,items:items.slice(0,20),
  counts:{observedEvents:events.length,observedPRs:items.length,observedMerges:events.filter(e=>e.kind==="MERGE_ACCEPTED").length,
   successfulConcludedCI:events.filter(e=>e.kind==="HEAD_CI_CONCLUDED"&&e.state==="SUCCESS").length,sourceDepth:"BOUNDED_ONLY"}};
}
export async function readWorkLedger(){return projectWorkLedger(await readCentralEvents());}
