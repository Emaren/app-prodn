/** Six bounded private dispatch lanes. GitHub metadata is NOT host proof. */
import registry from "@/config/central-command-lanes.json";
export const CENTRAL_SCHEMA="aoe2war.central-command.private.v1" as const;
export const R0_AUDIT_SHA="650f72e0f46de295d240f5477620b8b9dc66dfa4" as const;
export const GATES=["ASSIGNED","SOURCE_REVIEWED","HEAD_CI_PASSED","MERGED","NATIVE_ACCEPTED","LIVE_VERIFIED"] as const;
export type Gate=typeof GATES[number];
export type GateValue="ASSIGNED"|"UNKNOWN";
export type LaneId="D"|"G"|"C"|"E"|"F"|"B";
export type PrivateLane={
 id:LaneId;label:string;owner:string;mission:string;issueUrl:string;
 prUrl:string|null;prHead:string|null;prBase:string|null;
 githubObservedAt:string|null;githubIssueState:string|null;
 gateStates:Record<Gate,GateValue>;verifiedNumerator:number;denominator:6;
 nextBlocker:string;sourceAuthority:"GITHUB_METADATA_ONLY"|"GITHUB_UNAVAILABLE";
};
const PR_BY_LANE:Partial<Record<LaneId,{repo:string;number:number}>>={
 D:{repo:"Emaren/app-prodn",number:978},
 G:{repo:"Emaren/app-prodn",number:977},
 C:{repo:"Emaren/VPSSentry",number:50},
 E:{repo:"Emaren/VPSSentry",number:49},
 B:{repo:"Emaren/wolochain",number:115},
};
const BLOCKERS:Record<LaneId,string>={
 D:"Native 8-gate Mac L1 policy denominator and independently verified physical gain are unproven",
 G:"Private browser security, authenticated candidate publisher and Finder capacity admission pending",
 C:"Authenticated bridge ACK plus two genuine observer cycles not yet witnessed",
 E:"Off-provider isolated restore and separately approved E1/E2 capacity gates not accepted",
 F:"Candidate-bound financial noninterference, Doctor, rollback and owner stage/activate permits unproven",
 B:"Real custody, solvency, bank proofs and funded authorization remain excluded from W1",
};
type Issue={state?:unknown;updated_at?:unknown;number?:unknown};
type Pr={number?:unknown;head?:{sha?:unknown};base?:{sha?:unknown};updated_at?:unknown};
function issuePath(repo:string,id:number){return "repos/"+repo+"/issues/"+id;}
function prPath(repo:string,id:number){return "repos/"+repo+"/pulls/"+id;}
const safeSha=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{40}$/.test(s)?s:null;
const safeTime=(s:unknown)=>typeof s==="string"&&/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T/.test(s)&&Number.isFinite(Date.parse(s))?s:null;
function trustedName(s:unknown){return typeof s==="string"&&/^[A-Za-z][A-Za-z0-9 _&-]{2,64}$/.test(s)?s:"Unnamed lane";}
async function github(path:string):Promise<Record<string,unknown>|null>{
 // Fixed repository/endpoint set from the source-owned six-lane manifest only.
 if(!/^repos\/Emaren\/(app-prodn|VPSSentry|wolochain)\/(issues|pulls)\/[1-9][0-9]{0,4}$/.test(path))return null;
 try{
  const token=process.env.GITHUB_TOKEN?.trim();
  const response=await fetch("https://api.github.com/"+path,{
   cache:"no-store",signal:AbortSignal.timeout(2500),
   headers:{"Accept":"application/vnd.github+json","User-Agent":"aoe2war-private-central-command",
    ...(token?{"Authorization":"Bearer "+token}:{})}
  });
  if(!response.ok||Number(response.headers.get("content-length")||0)>200_000)return null;
  const payload:unknown=await response.json();
  return payload&&typeof payload==="object"&&!Array.isArray(payload)?payload as Record<string,unknown>:null;
 }catch{return null;}
}
export async function readPrivateCentralCommand(){
 const lanes=(registry.lanes as Array<Record<string,unknown>>).slice(0,6);
 // Three bounded GitHub calls at a time, at most two passes of issue reads
 // and one PR metadata pass; no arbitrary issue content or external URLs.
 const jobs=lanes.map(lane=>{
  const id=lane.id as LaneId,issue=lane.issue as {repository:string;number:number};
  const pr=PR_BY_LANE[id];
  return {id,lane,issue,pr,issuePath:issuePath(issue.repository,issue.number),
   prPath:pr?prPath(pr.repo,pr.number):null};
 });
 const readings=new Map<string,Record<string,unknown>|null>();
 const paths=jobs.flatMap(j=>[j.issuePath,...(j.prPath?[j.prPath]:[])]);
 for(let offset=0;offset<paths.length;offset+=3){
  const chunk=paths.slice(offset,offset+3);
  const results=await Promise.all(chunk.map(p=>github(p)));
  chunk.forEach((p,i)=>readings.set(p,results[i]));
 }
 const timeline: {id:string;at:string;kind:string;laneId:LaneId;url:string;provenance:string}[]=[];
 for(const j of jobs){
  const i=readings.get(j.issuePath),at=safeTime(i?.updated_at);
  if(i?.number===j.issue.number&&at)timeline.push({id:j.id+"-issue",at,kind:"Issue last updated",laneId:j.id,url:"https://github.com/"+j.issue.repository+"/issues/"+j.issue.number,provenance:"GITHUB_METADATA_NOT_EVENT_WITNESS"});
  if(j.pr&&j.prPath){
   const r=readings.get(j.prPath),when=safeTime(r?.updated_at);
   if(r?.number===j.pr.number&&when)timeline.push({id:j.id+"-pr",at:when,kind:"PR metadata updated",laneId:j.id,url:"https://github.com/"+j.pr.repo+"/pull/"+j.pr.number,provenance:"GITHUB_METADATA_NOT_CI_PROOF"});
  }
 }
 timeline.sort((a,b)=>b.at.localeCompare(a.at));
 const out:PrivateLane[]=jobs.map(({id,lane,issue,pr,issuePath,prPath})=>{
  const issueRecord=readings.get(issuePath) as Issue|null;
  const prRecord=prPath?(readings.get(prPath) as Pr|null):null;
  const issueVerified=issueRecord?.number===issue.number;
  const prVerified=pr&&prRecord?.number===pr.number;
  const gateStates=Object.fromEntries(GATES.map(g=>[g,g==="ASSIGNED"?"ASSIGNED":"UNKNOWN"])) as Record<Gate,GateValue>;
  return {
   id,label:trustedName(lane.label),owner:trustedName(lane.owner),
   mission:typeof lane.mission==="string"?lane.mission.slice(0,180):"UNKNOWN",
   issueUrl:"https://github.com/"+issue.repository+"/issues/"+issue.number,
   prUrl:pr?"https://github.com/"+pr.repo+"/pull/"+pr.number:null,
   prHead:prVerified?safeSha(prRecord?.head?.sha):null,
   prBase:prVerified?safeSha(prRecord?.base?.sha):null,
   githubObservedAt:issueVerified?safeTime(issueRecord?.updated_at):null,
   githubIssueState:issueVerified&&(issueRecord?.state==="open"||issueRecord?.state==="closed")?issueRecord.state:null,
   gateStates,verifiedNumerator:1,denominator:6,
   nextBlocker:BLOCKERS[id],
   sourceAuthority:issueVerified?"GITHUB_METADATA_ONLY":"GITHUB_UNAVAILABLE",
  };
 });
 return {
  schema:CENTRAL_SCHEMA,authority:"PRIVATE_DISPATCH_NOT_RELEASE_AUTHORITY",
  generatedAt:new Date().toISOString(),registrySchema:registry.schema,
  originIssueUrl:"https://github.com/Emaren/app-prodn/issues/934",
  r0:{referenceSha:R0_AUDIT_SHA,proof:"IMMUTABLE_SOURCE_AUDIT_REFERENCE_NOT_CURRENT_LIVE"},
  w1:{sourceSha:null,buildId:null,stage:null,activation:null,status:"NO_ACCEPTED_RUNTIME_RECEIPT"},
  releaseGates:[{name:"Capacity and independent restore",state:"UNKNOWN"},{name:"Doctor and DocsV2",state:"UNKNOWN"},{name:"Website-only finance noninterference",state:"UNKNOWN"},{name:"Stage receipt and real BUILD_ID",state:"UNKNOWN"},{name:"Owner PRE_STAGE / PRE_ACTIVATE",state:"UNKNOWN"}],
  lanes:out,timeline:timeline.slice(0,12),unverifiedGates:GATES.slice(1),
  caveat:"GitHub issue/PR metadata proves only a source was observed; not CI, merge, host health, cleanup or production. A separate ChatGPT session does not run because this board updates.",
 };
}
