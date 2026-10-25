import type { PrismaClient } from "@/lib/generated/prisma";
import { avatarThumbUrlForName } from "@/lib/avatarAssets";
import { buildJourneySummary } from "@/lib/adminJourneyIntelligence";
import { livingKingdomHub } from "@/lib/livingKingdom/hub";
import { livingKingdomFeatureMode } from "@/lib/livingKingdom/identity";
import { aggregateCohort, publicEvent, safeEvent, summarizeUser, type SafeEvent, type EventInput } from "./projection";

export const COHORT_SIZE=20;
export const PER_USER_LIMIT=120;
export const HISTORY_PAGE=40;
type WindowDays=7|30;
export function parseWindow(value:string|null):WindowDays{return value==="30"?30:7;}
export function parseCursor(value:string|null):number|null{
 if(!value||!/^[1-9]\d{0,9}$/.test(value))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;
}
export function parseSearch(value:string|null){
 return typeof value==="string"?value.replace(/[^a-zA-Z0-9 _.\-]/g,"").trim().slice(0,48):"";
}
export function sinceFor(days:WindowDays,now:Date){return new Date(now.getTime()-days*86400000);}
type Row={id:number;type:string;path:string|null;label:string|null;metadata:unknown;createdAt:Date};
function safeRows(rows:Row[]):SafeEvent[]{
 return rows.map(row=>safeEvent(row as EventInput)).filter((value):value is SafeEvent=>value!==null);
}
function confidenceFor(rows:SafeEvent[]){
 const scrubbed=rows.map(row=>({id:row.id,type:row.type,path:row.destination,label:row.label,createdAt:row.at,
  metadata:row.session?{journeySessionId:row.session}:null}));
 const value=buildJourneySummary(scrubbed);
 return {label:value?.confidenceLabel??"Low",engagement:value?.engagementLabel??"Unknown",
         provenance:"HEURISTIC_BOUNDED_SAMPLE"};
}
function presenceFor(uid:string){
 const actor=livingKingdomHub.publicProjectionForUid(uid);
 return actor?{status:"present_this_process" as const,realm:actor.realmId,
  avatar:actor.avatarUrl,observedAt:new Date().toISOString()}:
  {status:"unobserved_this_process" as const,realm:null,avatar:null,observedAt:null};
}
export async function loadObservatory(prisma:PrismaClient,opts:{days:WindowDays;cursor:number|null;search:string;now?:Date}){
 const now=opts.now??new Date();
 const since=sinceFor(opts.days,now);
 const where={
   ...(opts.cursor?{id:{lt:opts.cursor}}:{}),
   ...(opts.search?{OR:[
     {inGameName:{contains:opts.search,mode:"insensitive" as const}},
     {steamPersonaName:{contains:opts.search,mode:"insensitive" as const}},
     {uid:{contains:opts.search,mode:"insensitive" as const}}
   ]}:{})
 };
 const users=await prisma.user.findMany({where,orderBy:{id:"desc"},take:COHORT_SIZE+1,
  select:{id:true,uid:true,inGameName:true,steamPersonaName:true,lastSeen:true,createdAt:true}});
 const selected=users.slice(0,COHORT_SIZE);
 // No global newest-N cap: each user receives an equally bounded indexed query.
 const rows=await Promise.all(selected.map(user=>prisma.userActivityEvent.findMany({
  where:{userId:user.id,createdAt:{gte:since},type:{in:["page_view","click"]}},
  orderBy:[{createdAt:"desc"},{id:"desc"}],take:PER_USER_LIMIT+1,
  select:{id:true,type:true,path:true,label:true,metadata:true,createdAt:true}
 })));
 const cohorts=selected.map((user,i)=>({
  uid:user.uid,events:safeRows(rows[i].slice(0,PER_USER_LIMIT)),
  truncated:rows[i].length>PER_USER_LIMIT
 }));
 const cards=selected.map((user,i)=>{
  const cohort=cohorts[i];const name=(user.inGameName?.trim()||user.steamPersonaName?.trim()||"Unnamed warrior").slice(0,60);
  const presence=presenceFor(user.uid);
  return {uid:user.uid,name,avatar:presence.avatar??avatarThumbUrlForName(name),
   joinedAt:user.createdAt.toISOString(),accountLastSeenAt:user.lastSeen?.toISOString()??null,
   presence,journey:summarizeUser(cohort.events,cohort.truncated),
   signals:confidenceFor(cohort.events)};
 });
 return {generatedAt:now.toISOString(),days:opts.days,search:opts.search,cursor:opts.cursor,
  hasMore:users.length>COHORT_SIZE,nextCursor:users.length>COHORT_SIZE?selected.at(-1)?.id??null:null,
  cards,aggregates:aggregateCohort(cohorts,now,opts.days),
  presence:{mode:livingKingdomFeatureMode(),...livingKingdomHub.stats(),
   semantics:"PROCESS_LOCAL_EPHEMERAL_NOT_CLUSTER_WIDE"},
  scrollHistory:{status:"NOT_RECORDED",count:null},
  authority:{historical:"SIGNED_IN_USER_ACTIVITY_EVENT",live:"LOCAL_LIVING_KINGDOM_HUB",
   sampling:"20_USERS_PER_PAGE_120_EVENTS_EACH",createdNewTracker:false}};
}
export async function loadWarriorHistory(prisma:PrismaClient,opts:{uid:string;days:WindowDays;cursor:number|null;now?:Date}){
 const user=await prisma.user.findUnique({where:{uid:opts.uid},
  select:{id:true,uid:true,inGameName:true,steamPersonaName:true,lastSeen:true,createdAt:true}});
 if(!user)return null;
 const rows=await prisma.userActivityEvent.findMany({
  where:{userId:user.id,createdAt:{gte:sinceFor(opts.days,opts.now??new Date())},
   type:{in:["page_view","click"]},...(opts.cursor?{id:{lt:opts.cursor}}:{})},
  orderBy:[{createdAt:"desc"},{id:"desc"}],take:HISTORY_PAGE+1,
  select:{id:true,type:true,path:true,label:true,metadata:true,createdAt:true}
 });
 const sample=rows.slice(0,HISTORY_PAGE);
 const safe=safeRows(sample);
 const name=(user.inGameName?.trim()||user.steamPersonaName?.trim()||"Unnamed warrior").slice(0,60);
 const presence=presenceFor(user.uid);
 return {user:{uid:user.uid,name,avatar:presence.avatar??avatarThumbUrlForName(name),
   joinedAt:user.createdAt.toISOString(),accountLastSeenAt:user.lastSeen?.toISOString()??null,presence},
   days:opts.days,hasMore:rows.length>HISTORY_PAGE,
   nextCursor:rows.length>HISTORY_PAGE?sample.at(-1)?.id??null:null,
   events:safe.map(publicEvent),slice:summarizeUser(safe,rows.length>HISTORY_PAGE||opts.cursor!==null),
   limitations:["Paginated window only; not an account lifetime census",
    "No historical scroll positions persisted",
    "Generic click labels and sanitized route groups only",
    "Dwell is a capped event-gap estimate, not foreground reading time"]};
}
