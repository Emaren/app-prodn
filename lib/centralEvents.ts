/** Q09-A1: private GitHub facts. Never a chat-session heartbeat or host attestation. */
import lanesRegistry from "../config/central-command-lanes.json" with {type:"json"};
export const EVENT_SCHEMA = "aoe2war.central-source-events.v1" as const;
export type EventKind = "COMMENT_PUBLISHED"|"DISPATCH_PUBLISHED"|"SOURCE_COMMIT_OBSERVED"|"PR_OPENED"|"PR_UPDATED"|"MERGE_ACCEPTED"|"REVIEW_SUBMITTED"|"HEAD_CI_CONCLUDED";
export type SourceEvent = {id:string;kind:EventKind;laneId:string|null;at:string;repo:string;sourceUrl:string;sha:string|null;state:string|null;authority:"GITHUB_SOURCE";};
export type EventFeed={schema:typeof EVENT_SCHEMA;status:"FRESH"|"PARTIAL"|"STALE"|"UNKNOWN";observedAt:string|null;readAt:string;sourceCoverage:{accepted:number;expected:number};errorCode:string|null;history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE";events:SourceEvent[]};
const REPO=/^Emaren\/(?:app-prodn|VPSSentry|wolochain)$/;
const SHA=/^[0-9a-f]{40}$/;
const LANES=(lanesRegistry.lanes as Array<{id:string;issue:{repository:string;number:number}}>).map(l=>({id:l.id,repo:l.issue.repository,issue:l.issue.number}));
const PULLS=[{repo:"Emaren/app-prodn",number:1003,lane:"G"},{repo:"Emaren/app-prodn",number:999,lane:"G"},{repo:"Emaren/app-prodn",number:1001,lane:"G"},{repo:"Emaren/app-prodn",number:988,lane:"G"},{repo:"Emaren/app-prodn",number:993,lane:"D"},{repo:"Emaren/app-prodn",number:992,lane:"F"},{repo:"Emaren/VPSSentry",number:53,lane:"C"},{repo:"Emaren/VPSSentry",number:51,lane:"E"},{repo:"Emaren/wolochain",number:119,lane:"B"}] as const;
const ghBase="https://api.github.com/";
const toObj=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
const arr=(x:unknown):unknown[]=>Array.isArray(x)?x:[];
export const validSha=(x:unknown):string|null=>typeof x==="string"&&SHA.test(x)?x:null;
export function validAt(x:unknown,now=Date.now()):string|null{
 if(typeof x!=="string"||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x))return null;
 const t=Date.parse(x);return Number.isFinite(t)&&t>946684800000&&t<=now+60_000?new Date(t).toISOString():null;
}
const numberId=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>0&&Number(x)<=Number.MAX_SAFE_INTEGER?Number(x):null;
function evt(id:string,kind:EventKind,at:unknown,repo:string,sourceUrl:string,laneId:string|null,sha:unknown=null,state:string|null=null,now=Date.now()):SourceEvent|null{
 const ts=validAt(at,now);
 if(!ts||!REPO.test(repo)||!/^[BCDEFG]$/.test(laneId||"")&&laneId!==null)return null;
 if(!/^https:\/\/github\.com\/Emaren\/(?:app-prodn|VPSSentry|wolochain)\/(?:issues|pull|commit|actions\/runs)\/[A-Za-z0-9/#-]+$/.test(sourceUrl))return null;
 return {id:"github:"+repo+":"+id,kind,at:ts,repo,sourceUrl,laneId,sha:validSha(sha),state,authority:"GITHUB_SOURCE"};
}
export function parseComments(repo:string,issue:number,lane:string|null,input:unknown,now=Date.now()):SourceEvent[]{
 const out:SourceEvent[]=[];
 for(const raw of arr(input).slice(0,12)){
  const v=toObj(raw);if(!v)continue;
  const id=numberId(v.id),user=toObj(v.user);
  if(!id||typeof user?.login!=="string")continue;
  // Dispatch means the owner actually PUBLISHED a command on an allowlisted issue.
  // It NEVER means a ChatGPT session woke or followed it.
  const publishedByOwner=["Emaren","Arduous"].includes(user.login);
  const body=typeof v.body==="string"?v.body.slice(0,4000):"";
  const isDispatch=publishedByOwner&&/(CENTRAL[^\n]{0,220}(?:WORK ORDER|EXECUTION ORDER|OWNER-AUTHORIZED WAKE|IMPLEMENT IMMEDIATELY|NOW EXECUTE)|CC-2026[^\n]{0,160}R2)/i.test(body)&&body.length<4000;
  const e=evt("comment:"+id,isDispatch?"DISPATCH_PUBLISHED":"COMMENT_PUBLISHED",v.created_at,repo,
   "https://github.com/"+repo+"/issues/"+issue+"#issuecomment-"+id,lane,null,null,now);
  if(e)out.push(e);
 }
 return out;
}
export function parsePr(repo:string,num:number,lane:string,input:unknown,now=Date.now()):SourceEvent[]{
 const v=toObj(input);if(!v||v.number!==num)return[];
 const head=toObj(v.head),base=toObj(v.base),hs=validSha(head?.sha),bs=validSha(base?.sha);
 if(!hs||!bs)return[];
 const url="https://github.com/"+repo+"/pull/"+num;
 const e=evt("pr:"+num+":opened","PR_OPENED",v.created_at,repo,url,lane,hs,"OPENED",now);
 const changed=evt("pr:"+num+":updated:"+hs,"PR_UPDATED",v.updated_at,repo,url,lane,hs,"HEAD_OBSERVED",now);
 const merge=validSha(v.merge_commit_sha)&&v.merged_at?evt("pr:"+num+":merge:"+v.merge_commit_sha,"MERGE_ACCEPTED",v.merged_at,repo,url,lane,v.merge_commit_sha,"MERGED_SOURCE_NOT_LIVE",now):null;
 return [e,changed,merge].filter((x):x is SourceEvent=>!!x);
}
export function parseCommits(repo:string,lane:string,input:unknown,now=Date.now()):SourceEvent[]{
 const out:SourceEvent[]=[];
 for(const raw of arr(input).slice(0,5)){
  const x=toObj(raw),c=toObj(x?.commit),author=toObj(c?.author),committer=toObj(c?.committer),sha=validSha(x?.sha);if(!sha)continue;
  // Prefer the actual committed_at, never the PR updated_at or GitHub fetch time.
  const at=committer?.date??author?.date;
  const e=evt("commit:"+sha,"SOURCE_COMMIT_OBSERVED",at,repo,"https://github.com/"+repo+"/commit/"+sha,lane,sha,null,now);
  if(e)out.push(e);
 }
 return out;
}
export function parseReviews(repo:string,num:number,lane:string,input:unknown,now=Date.now()):SourceEvent[]{
 const out:SourceEvent[]=[];
 for(const raw of arr(input).slice(0,8)){
  const v=toObj(raw),id=numberId(v?.id),user=toObj(v?.user),sha=validSha(v?.commit_id);
  if(!id||!user?.login||typeof user.login!=="string")continue;
  const state=["APPROVED","CHANGES_REQUESTED","COMMENTED","DISMISSED"].includes(String(v?.state))?String(v?.state):"UNVERIFIED";
  const e=evt("review:"+id,"REVIEW_SUBMITTED",v?.submitted_at,repo,"https://github.com/"+repo+"/pull/"+num+"#pullrequestreview-"+id,lane,sha,state,now);
  if(e)out.push(e);
 }
 return out;
}
const WORKFLOW_PATHS:Record<string,string>={
 "AoE2WAR CI":".github/workflows/ci.yml",
 "Q09 A3 Work Board and six-lane real Chrome":".github/workflows/central-work-ledger-browser.yml",
 "Q09 verified GitHub events authenticated Chrome":".github/workflows/central-events-browser.yml",
 "Q09 Kingdom Job Exchange genuine Chrome":".github/workflows/job-exchange-browser.yml",
 "Private Central Command genuine admin Chrome":".github/workflows/central-command-private-browser.yml",
 "Kingdom Progress Q12 real Chrome acceptance (post-W1)":".github/workflows/kingdom-progress-browser.yml",
 "Renaissance 88 candidate Chrome factory":".github/workflows/renaissance-88-factory.yml",
 "Renaissance 88 unsealed a11y preview (not Index admission)":".github/workflows/renaissance-88-a11y-preview.yml",
 "Kingdom Index source census":".github/workflows/kingdom-index-source-census.yml",
 "Renaissance source integrity":".github/workflows/renaissance-source-integrity.yml",
 "Renaissance Tab D candidate census (not certified)":".github/workflows/renaissance-tabd-forge.yml"
};
export function parseRuns(repo:string,input:unknown,now=Date.now()):SourceEvent[]{
 const top=toObj(input),out:SourceEvent[]=[];
 for(const raw of arr(top?.workflow_runs).slice(0,18)){
  const r=toObj(raw),id=numberId(r?.id),sha=validSha(r?.head_sha);
  const name=typeof r?.name==="string"?r.name:"";
  const path=typeof r?.path==="string"?r.path:"";
  const sourcePath=path.split("@")[0];
  const suffix=path.slice(sourcePath.length);
  // Exact allowlisted name+workflow pair, never a user-supplied CI badge.
  if(!id||!sha||WORKFLOW_PATHS[name]!==sourcePath||(suffix&&!/^@[A-Za-z0-9_./-]{1,100}$/.test(suffix)))continue;
  if(r?.status!=="completed"||!["success","failure","cancelled","timed_out","skipped","action_required"].includes(String(r.conclusion)))continue;
  const e=evt("run:"+id,"HEAD_CI_CONCLUDED",r.updated_at,repo,"https://github.com/"+repo+"/actions/runs/"+id,null,sha,String(r.conclusion).toUpperCase(),now);
  if(e)out.push(e);
 }
 return out;
}
export function dedupeEvents(events:SourceEvent[],limit=60):SourceEvent[]{
 return [...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id)).slice(0,limit);
}
type ResponseRead={ok:boolean;data:unknown;reason:string|null;lastPage?:number};
let lastGood:EventFeed|null=null,cache:Promise<EventFeed>|null=null,until=0,backoffUntil=0;
const TTL=55_000,STALE_MS=300_000;
async function github(path:string,now:number):Promise<ResponseRead>{
 if(!/^repos\/Emaren\/(?:app-prodn|VPSSentry|wolochain)\/(?:issues\/[1-9]\d{0,4}\/comments|pulls\/[1-9]\d{0,4}(?:\/commits|\/reviews)?|actions\/runs)\?per_page=(?:12|5|8|18)&page=[1-9]\d{0,4}$/.test(path))return{ok:false,data:null,reason:"DISALLOWED_ENDPOINT"};
 if(now<backoffUntil)return{ok:false,data:null,reason:"RATE_LIMIT_BACKOFF"};
 try{
  const token=process.env.GITHUB_TOKEN?.trim();
  const res=await fetch(ghBase+path,{cache:"no-store",signal:AbortSignal.timeout(2400),headers:{"Accept":"application/vnd.github+json","User-Agent":"aoe2war-q09-private-events",...(token?{"Authorization":"Bearer "+token}:{})}});
  if(res.status===403||res.status===429){backoffUntil=Date.now()+90_000;return{ok:false,data:null,reason:"GITHUB_RATE_LIMIT_OR_FORBIDDEN"};}
  if(!res.ok)return{ok:false,data:null,reason:"GITHUB_"+res.status};
  if(Number(res.headers.get("content-length")||0)>240_000)return{ok:false,data:null,reason:"OVERSIZE"};
  const text=await res.text();if(text.length>240_000)return{ok:false,data:null,reason:"OVERSIZE"};
  const lastLink=(res.headers.get("link")||"").split(",").find(x=>x.includes('rel="last"'))||"";
  const pageMatch=/[?&]page=(\d{1,5})/.exec(lastLink);
  const lastPage=pageMatch?Math.min(99999,Number(pageMatch[1])):1;
  return{ok:true,data:JSON.parse(text),reason:null,lastPage};
 }catch{return{ok:false,data:null,reason:"SOURCE_UNAVAILABLE"};}
}
export async function readCentralEvents():Promise<EventFeed>{
 const now=Date.now();if(cache&&now<until)return cache;
 const work=async():Promise<EventFeed>=>{
  const starts=[...LANES.map(x=>({path:"repos/"+x.repo+"/issues/"+x.issue+"/comments?per_page=12&page=1",kind:"comments" as const,...x})),
    ...[{repo:"Emaren/app-prodn",issue:934,id:null},{repo:"Emaren/app-prodn",issue:984,id:null},{repo:"Emaren/app-prodn",issue:1002,id:"G"}].map(x=>({path:"repos/"+x.repo+"/issues/"+x.issue+"/comments?per_page=12&page=1",kind:"comments" as const,...x})),
    ...PULLS.flatMap(x=>[{path:"repos/"+x.repo+"/pulls/"+x.number+"?per_page=8&page=1",kind:"pr" as const,...x},{path:"repos/"+x.repo+"/pulls/"+x.number+"/commits?per_page=5&page=1",kind:"commits" as const,...x},{path:"repos/"+x.repo+"/pulls/"+x.number+"/reviews?per_page=8&page=1",kind:"reviews" as const,...x}]),
    {path:"repos/Emaren/app-prodn/actions/runs?per_page=18&page=1",kind:"runs" as const,repo:"Emaren/app-prodn"}];
  const rows:SourceEvent[]=[];let accepted=0;let reason:string|null=null;
  for(let i=0;i<starts.length;i+=7){
   const batch=starts.slice(i,i+7),results=await Promise.all(batch.map(x=>github(x.path,now)));
   const newest=await Promise.all(results.map((r,j)=>{
    const row=batch[j];
    if(!r.ok||row.kind!=="comments"||!r.lastPage||r.lastPage<=1)return Promise.resolve(r);
    return github(row.path.replace("page=1","page="+r.lastPage),now);
   }));
   newest.forEach((r,j)=>{
    const s=batch[j];if(!r.ok){reason??=r.reason;return;}accepted++;
    if(s.kind==="comments")rows.push(...parseComments(s.repo,s.issue,("id" in s?s.id:null)??null,r.data,now));
    else if(s.kind==="runs")rows.push(...parseRuns(s.repo,r.data,now));
    else if(s.kind==="pr")rows.push(...parsePr(s.repo,s.number,s.lane,r.data,now));
    else if(s.kind==="commits")rows.push(...parseCommits(s.repo,s.lane,r.data,now));
    else if(s.kind==="reviews")rows.push(...parseReviews(s.repo,s.number,s.lane,r.data,now));
   });
  }
  const readAt=new Date().toISOString();
  const status=accepted===starts.length?"FRESH":accepted>0?"PARTIAL":"UNKNOWN";
  if(accepted===0&&lastGood&&now-Date.parse(lastGood.readAt)<STALE_MS)
   return {...lastGood,status:"STALE",readAt,sourceCoverage:{accepted:0,expected:starts.length},errorCode:reason??"SOURCE_UNAVAILABLE"};
  const events=dedupeEvents(rows);
  const out:EventFeed={schema:EVENT_SCHEMA,status,observedAt:events[0]?.at??null,readAt,
   sourceCoverage:{accepted,expected:starts.length},errorCode:reason,
   history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE",events};
  if(accepted>0)lastGood=out;
  return out;
 };
 cache=work().catch(()=>({schema:EVENT_SCHEMA,status:"UNKNOWN",observedAt:null,readAt:new Date().toISOString(),sourceCoverage:{accepted:0,expected:37},errorCode:"SOURCE_UNAVAILABLE",history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE",events:[]} as EventFeed));
 until=now+TTL;return cache;
}
