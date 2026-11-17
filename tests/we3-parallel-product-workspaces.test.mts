import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORK_ENVIRONMENTS, WORK_ENVIRONMENT_SCHEMA, parseObservedBranch,
  assessWorkEnvironment, readWorkEnvironmentEvidence,
  type VerifiedHostReceipt,
} from "../lib/workEnvironmentEvidence.ts";

const page = readFileSync("components/admin/work-environments/WorkEnvironmentObservatory.tsx", "utf8");
const lanes = readFileSync("app/admin/central-command/lanes/page.tsx", "utf8");
const client = readFileSync("components/admin/work-environments/FactoryLiveReceipt.tsx", "utf8");
const source = readFileSync("lib/workEnvironmentEvidence.ts", "utf8");
const boundedRead = readFileSync("lib/githubBoundedPublicRead.ts", "utf8");
const nav = readFileSync("lib/navigationAtlas.ts", "utf8");
const central = readFileSync("components/central-command/CentralCommandView.tsx", "utf8");

test("three logical environments preserve FINANCIAL, WEBSITE and private Traders ownership", () => {
  assert.equal(WORK_ENVIRONMENT_SCHEMA, "aoe2war.product.work-environments.v2");
  assert.deepEqual(WORK_ENVIRONMENTS.map(x => x.id), ["WE1", "WE2", "WE3"]);
  assert.equal(WORK_ENVIRONMENTS[0].isolation, "FINANCIAL_QUARANTINE");
  assert.equal(WORK_ENVIRONMENTS[0].repo, "NOT_ATTESTED");
  assert.equal(WORK_ENVIRONMENTS[1].repo, "Emaren/app-prodn");
  assert.equal(WORK_ENVIRONMENTS[1].branch, "main");
  assert.equal(WORK_ENVIRONMENTS[2].repo, "Emaren/kingdom-traders");
  assert.equal(WORK_ENVIRONMENTS[2].sourceOwner, "WE3_TRADERS");
  assert.notEqual(WORK_ENVIRONMENTS[1].namespace, WORK_ENVIRONMENTS[2].namespace);
  assert.ok(WORK_ENVIRONMENTS.every(x => x.sourceOwner.length > 0));
  assert.doesNotMatch(WORK_ENVIRONMENTS[2].branch, /we3-website-observatory/);
});

test("public SHA evidence requires correct branch and actual timestamp", () => {
  const id = "a".repeat(40), at = "2026-11-17T00:37:00.000Z";
  assert.deepEqual(parseObservedBranch({name: "main", commit: {sha: id}}, "main", at),
    {state:"GITHUB_REF_OBSERVED",headSha:id,observedAt:at,reason:"SOURCE_OBSERVED"});
  for (const bad of [
    {}, null, [], {name:"session-c/we3-website-observatory-20261115",commit:{sha:id}},
    {name:"main",commit:{sha:"not-a-sha"}}, {name:"main",commit:{}},
  ]) {
    assert.deepEqual(parseObservedBranch(bad,"main",at),
      {state:"UNKNOWN",headSha:null,observedAt:null,reason:"NOT_OBSERVED"});
  }
  assert.equal(parseObservedBranch({name:"main",commit:{sha:id}},"main","not-a-time").state,"UNKNOWN");
});

test("only authenticated, fresh, exact repo+owner+branch host attestations may be ALIGNED", () => {
  const now = Date.parse("2026-11-17T00:40:00Z");
  const lane=WORK_ENVIRONMENTS[1], sha="a".repeat(40), tree="b".repeat(40);
  const remote={state:"GITHUB_REF_OBSERVED" as const,headSha:sha,
    observedAt:"2026-11-17T00:39:00Z",reason:"SOURCE_OBSERVED" as const};
  const receipt: VerifiedHostReceipt={
    authority:"AUTHORIZED_READONLY_HOST_WITNESS",repo:lane.repo,branch:lane.branch,
    headSha:sha,treeSha:tree,owner:lane.sourceOwner,
    observedAt:"2026-11-17T00:39:00Z",clean:true,plannedWip:false,
  };
  assert.equal(assessWorkEnvironment(lane,remote,receipt,now),"ALIGNED");
  assert.equal(assessWorkEnvironment(lane,remote,null,now),"UNKNOWN");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,observedAt:"2026-11-16T21:00:00Z"},now),"UNKNOWN");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,repo:"Emaren/kingdom-traders"},now),"BLOCKED");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,owner:"WE3_TRADERS"},now),"BLOCKED");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,branch:"session-c/we3-website-observatory-20261115"},now),"BLOCKED");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,headSha:tree},now),"ACTION_REQUIRED");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,headSha:tree,plannedWip:true},now),"INTENTIONAL_DIVERGENCE");
  assert.equal(assessWorkEnvironment(lane,remote,{...receipt,clean:false},now),"ACTION_REQUIRED");
  assert.equal(assessWorkEnvironment(WORK_ENVIRONMENTS[0],remote,receipt,now),"BLOCKED");
  assert.equal(assessWorkEnvironment(WORK_ENVIRONMENTS[2],remote,receipt,now),"BLOCKED");
});

test("private observatory is read-only and never promotes source CI to physical release", () => {
  assert.match(lanes,/await requireServerAdmin\(\)/);
  assert.match(lanes,/export const dynamic="force-dynamic"/);
  assert.match(page,/readWorkEnvironmentEvidence\(\)/);
  assert.match(page,/Session heartbeat: UNKNOWN/);
  assert.match(page,/FINANCIAL authorization remains denied/);
  assert.match(page,/WE1 · Financial quarantined/);
  assert.match(page,/WE3 · Private Kingdom Traders/);
  assert.match(page,/private Traders feed not connected/);
  assert.match(page,/VPSSentry/);
  assert.match(page,/FactoryLiveReceipt/);
  assert.doesNotMatch(page,/text-slate-500/);
  assert.match(page,/mt-1 text-slate-300/);
  assert.match(lanes,/WorkEnvironmentObservatory/);
  assert.equal((nav.match(/href:"\/admin\/central-command\/lanes"/g)||[]).length,1);
  assert.match(central,/href="\/admin\/central-command\/lanes#work-environments"/);
  assert.match(source,/sessionPresence: "UNKNOWN"/);
  assert.match(source,/localDirtyState: "UNKNOWN"/);
  assert.match(boundedRead,/AbortSignal\.timeout\(3000\)/);
  assert.doesNotMatch(boundedRead,/process\.env|Authorization:|Bearer/);
  assert.match(boundedRead,/cache: "no-store"/);
  assert.match(client,/fetch\("\/factory\/status\.json"/);
  assert.match(client,/STALE — no current production claim/);
  assert.doesNotMatch(page+client+source,/child_process|execFile|shell_exec|unlink|rmSync/);
});

test("only the allowlisted public WE2 main ref is queried; no WE3 private query or tokens", async () => {
  const previous=globalThis.fetch;
  const token=process.env.GITHUB_TOKEN;
  const observed: Array<{url:string,authorization:string|null}>=[];
  try {
    delete process.env.GITHUB_TOKEN;
    globalThis.fetch=async (url:string|URL|Request,init?:RequestInit)=>{
      const target=String(url),headers=new Headers(init?.headers);
      observed.push({url:target,authorization:headers.get("authorization")});
      assert.equal(target,"https://api.github.com/repos/Emaren/app-prodn/branches/main");
      return new Response(JSON.stringify({name:"main",commit:{sha:"a".repeat(40)}}),
        {status:200,headers:{"Content-Type":"application/json"}});
    };
    const result=await readWorkEnvironmentEvidence();
    assert.equal(observed.length,1);
    assert.equal(observed[0].authorization,null);
    assert.equal(result.lanes[0].status,"BLOCKED");
    assert.equal(result.lanes[0].remote.state,"UNKNOWN");
    assert.equal(result.lanes[1].remote.state,"GITHUB_REF_OBSERVED");
    assert.equal(result.lanes[1].status,"UNKNOWN");
    assert.equal(result.lanes[2].remote.reason,"PRIVATE_SOURCE_NOT_CONNECTED");
    assert.equal(result.lanes[2].remote.headSha,null);
    assert.equal(result.sessionPresence,"UNKNOWN");
    assert.equal(result.localDirtyState,"UNKNOWN");
  }finally{
    globalThis.fetch=previous;
    if(token===undefined)delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN=token;
  }
});

test("public source failure never invents a live WE2 or a private WE3 heartbeat", async () => {
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=async ()=>new Response("Not found",{status:404});
    const result=await readWorkEnvironmentEvidence();
    assert.ok(result.lanes.every(lane=>lane.remote.state==="UNKNOWN"));
    assert.ok(result.lanes.every(lane=>lane.remote.headSha===null));
    assert.equal(result.lanes[0].status,"BLOCKED");
    assert.equal(result.lanes[1].status,"UNKNOWN");
    assert.equal(result.lanes[2].status,"UNKNOWN");
  } finally { globalThis.fetch=previous; }
});
