import assert from "node:assert/strict";
import {createRequire,Module} from "node:module";
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,rmSync,existsSync} from "node:fs";
import {execFileSync,spawn} from "node:child_process";
import path from "node:path";
import {generateKeyPairSync,sign} from "node:crypto";
import test from "node:test";
import pg from "pg";
import ts from "typescript";
import {hdFinancialPermitMessage,withHdFinancialLease} from "../lib/hdFinancialMaintenanceFence.ts";

const require=createRequire(import.meta.url);
const corePath=path.resolve("lib/hdFinancialMaintenanceFence.ts");
const source=readFileSync(corePath,"utf8");
// Isolated loader exposes private verification kernels only in this test.
// No production API, environment flag or transport can replace the authority.
function kernel(build:unknown=null){
  const fixtureSource=source.replace('const BUILD=typeof __AOE2WAR_HD_FINANCIAL_BUILD__ === "undefined" ? null : __AOE2WAR_HD_FINANCIAL_BUILD__;',`const BUILD=${JSON.stringify(build)};`)+"\nexport {withConfiguredLease,assertRuntime,authorize};";
  const m=new Module(corePath,import.meta as never);m.filename=corePath;
  // @ts-expect-error Node's private loader is used only for a disposable test module.
  m.paths=Module._nodeModulePaths(path.dirname(corePath));
  // @ts-expect-error Same isolated loader; never writes a module or production export.
  m._compile(ts.transpileModule(fixtureSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,corePath);
  return m.exports;
}
const key=generateKeyPairSync("ed25519");
const identity={source:"a".repeat(40),deployment:"b".repeat(64)};
const authority={...identity,readerRole:"fence_reader",databaseUrl:"not-used-by-test-kernel",databaseCA:"fixture",publicKey:key.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex")};
const input={scope:"hd-legacy" as const,producer:"settlement-payout",wallet:"wolo1"+"p".repeat(38)};
function permit(generation="2",extra:Record<string,unknown>={}){
  const now=Math.floor(Date.now()/1000);
  return {protocol:1,...identity,scope:input.scope,generation,producers:[input.producer],wallets:[input.wallet],issued_at:now-1,expires_at:now+45,...extra};
}
function signed(p:ReturnType<typeof permit>){return sign(null,hdFinancialPermitMessage(p),key.privateKey).toString("base64");}

test("raw Node and environment claims cannot open financial admission",async()=>{
  let sends=0;
  process.env.AOE2WAR_HD_FINANCIAL_SOURCE=identity.source;
  process.env.AOE2WAR_HD_FINANCIAL_DEPLOYMENT=identity.deployment;
  try {await assert.rejects(withHdFinancialLease(input,async()=>++sends),/HD_FINANCIAL_FENCE_HELD/);assert.equal(sends,0);}
  finally {delete process.env.AOE2WAR_HD_FINANCIAL_SOURCE;delete process.env.AOE2WAR_HD_FINANCIAL_DEPLOYMENT;}
});
test("old compiled process cannot adopt a newly rotated authority identity",()=>{
  const k=kernel(identity);k.assertRuntime(authority);
  assert.throws(()=>k.assertRuntime({...authority,source:"c".repeat(40)}),/runtime_identity_mismatch/);
  assert.throws(()=>k.assertRuntime({...authority,deployment:"d".repeat(64)}),/runtime_identity_mismatch/);
  assert.throws(()=>kernel().assertRuntime(authority),/compiled_runtime_identity_missing/);
});
test("signed admission binds exact scope generation source wallet producer and database time",()=>{
  const k=kernel(),p=permit(),now=new Date();
  const policy={generation:"2",closed:false,permit:p,signature:signed(p),now};
  k.authorize(policy,authority,input);
  const failures=[{closed:true},{generation:"3"},{signature:Buffer.alloc(64).toString("base64")},{now:new Date(p.expires_at*1000)},
    ...[{source:"c".repeat(40)},{deployment:"d".repeat(64)},{scope:"hd-satchel"},{producers:["other-producer"]},
      {wallets:["wolo1"+"q".repeat(38)]},{generation:"3"},{issued_at:Math.floor(Date.now()/1000)+10}].map(extra=>{
      const replacement=permit("2",extra);return {permit:replacement,signature:signed(replacement)};
    })];
  for(const failure of failures)assert.throws(()=>k.authorize({...policy,...failure},authority,input),/HD_FINANCIAL_FENCE_HELD/);
  for(const extra of [{extra:true},{protocol:2},{expires_at:p.issued_at+61},{producers:[input.producer,input.producer]},
    {producers:["z","a"]},{generation:2},{generation:"0"},{wallets:[]}])assert.throws(()=>hdFinancialPermitMessage({...p,...extra}));
});
test("build measurement refuses dirty source, missing generation and environment substitution",()=>{
  const root=mkdtempSync("/tmp/hd-financial-build-");
  const git=(...args:string[])=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
  const measure=require("../scripts/hd-financial-build-identity.cjs");
  try{
    git("init");git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid");
    writeFileSync(path.join(root,".gitignore"),".aoe2war-build-version\n");writeFileSync(path.join(root,"entry.ts"),"original\n");
    writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next/types/routes.d.ts" />\n');
    git("add",".");git("commit","-m","fixture");assert.equal(measure(root),null);
    writeFileSync(path.join(root,".aoe2war-build-version"),"20261021220000-a1b2c3d4e5\n");
    const a=measure(root);assert.ok(a);assert.equal(a.source,git("rev-parse","HEAD").toString().trim());
    writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next-release/types/routes.d.ts" />\n');assert.deepEqual(measure(root),a);
    writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next-release/types/routes.d.ts" />\ndeclare const injected: true;\n');assert.equal(measure(root),null);
    writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next/types/routes.d.ts" />\n');
    writeFileSync(path.join(root,"entry.ts"),"dirty\n");assert.equal(measure(root),null);writeFileSync(path.join(root,"entry.ts"),"original\n");
    writeFileSync(path.join(root,"injected.ts"),"untracked\n");assert.equal(measure(root),null);rmSync(path.join(root,"injected.ts"));
    writeFileSync(path.join(root,".aoe2war-build-version"),"20261021220001-a1b2c3d4e5\n");assert.notEqual(measure(root).deployment,a.deployment);
    writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next-release/types/routes.d.ts" />\n');git("add","next-env.d.ts");assert.equal(measure(root),null);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("durable independent policy and active admission leases in real private PostgreSQL",{skip:process.env.RUN_HD_FINANCIAL_FENCE_PG_TESTS!=="1"},async t=>{
  const bin=process.env.AOE2WAR_TEST_PG_BIN||"/opt/homebrew/opt/postgresql@16/bin";
  assert.ok(existsSync(path.join(bin,"initdb")));
  const root=mkdtempSync("/tmp/hd-financial-fence-pg-"),data=path.join(root,"data"),socket=path.join(root,"socket");
  mkdirSync(socket,{mode:0o700});let started=false;let owner:pg.Client|undefined;
  const k=kernel(identity);let sends=0;let generation=1;
  const db=()=>new pg.Client({host:socket,user:"fence_reader",database:"postgres"});
  const run=(action:((signal:AbortSignal)=>Promise<unknown>)=async()=>++sends)=>k.withConfiguredLease(db(),authority,input,action);
  const set=async(open:boolean,patch:Record<string,unknown>={},signature?:string)=>{
    const p=permit(String(++generation),patch);
    await owner!.query("UPDATE hd_financial_maintenance_policy SET generation=$1,closed=$2,permit=$3,signature=$4 WHERE scope='hd-legacy'",[generation,!open,p,signature??signed(p)]);
  };
  try{
    execFileSync(path.join(bin,"initdb"),["-D",data,"-U","operator_fixture","--auth-local=trust","--auth-host=reject"],{stdio:"pipe"});
    execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-l",path.join(root,"server.log"),"-o",`-h '' -k ${socket}`,"-w","start"],{stdio:"pipe"});started=true;
    owner=new pg.Client({host:socket,user:"operator_fixture",database:"postgres"});await owner.connect();
    await owner.query(readFileSync("prisma/migrations/20261021_220000_hd_financial_maintenance_fence/migration.sql","utf8"));
    await owner.query("CREATE ROLE fence_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO fence_reader; GRANT SELECT ON hd_financial_maintenance_policy TO fence_reader");
    await t.test("migration starts HOLD and restart/timer callers cannot cache OPEN",async()=>{
      await assert.rejects(run(),/closed_or_unavailable/);assert.equal(sends,0);
      await set(true);await run();assert.equal(sends,1);
      await set(false);await assert.rejects(run(),/closed_or_unavailable/);assert.equal(sends,1);
    });
    await t.test("forgeries expiry wrong-owner scope and source never invoke transport",async()=>{
      for(const patch of [{expires_at:Math.floor(Date.now()/1000)-1,issued_at:Math.floor(Date.now()/1000)-5},{source:"c".repeat(40)},
        {wallets:["wolo1"+"q".repeat(38)]},{producers:["other-producer"]},{scope:"hd-satchel"}]){await set(true,patch);await assert.rejects(run(),/HD_FINANCIAL_FENCE_HELD/);}
      await set(true,{},Buffer.alloc(64).toString("base64"));await assert.rejects(run(),/signature/);assert.equal(sends,1);
    });
    await t.test("CLOSE commits first blocks new admissions and waits for active callbacks",async()=>{
      await set(true);let release!:()=>void;let admitted!:()=>void;
      const entered=new Promise<void>(r=>admitted=r),finish=new Promise<void>(r=>release=r);
      const pending=run(async()=>{admitted();await finish;sends++;});await entered;
      await set(false);await assert.rejects(run(),/closed_or_unavailable/);
      await owner!.query("SET lock_timeout='150ms'");
      await assert.rejects(owner!.query("SELECT pg_advisory_lock(724176,48)"),{code:"55P03"});
      release();await pending;
      await owner!.query("SELECT pg_advisory_lock(724176,48)");await owner!.query("SELECT pg_advisory_unlock(724176,48)");
      await assert.rejects(run(),/closed_or_unavailable/);assert.equal(sends,2);
    });
    await t.test("separate OS producer holds a shared lease and a restarted process reads durable HOLD",async()=>{
      await set(true);
      const child=spawn(process.execPath,["tests/fixtures/hd-financial-fence-child.cjs"],{cwd:process.cwd(),env:{...process.env,
        HD_FENCE_CHILD_FIXTURE:JSON.stringify({socket,authority,input})},stdio:["pipe","pipe","pipe"]});
      let output="",error="";child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>error+=b);
      const exit=new Promise<number|null>(r=>child.once("exit",r));
      try{
        const deadline=Date.now()+5000;while(!output.includes("ADMITTED")&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
        assert.match(output,/ADMITTED/,error);await set(false);
        await assert.rejects(owner!.query("SELECT pg_advisory_lock(724176,48)"),{code:"55P03"});
        child.stdin.write("finish");assert.equal(await exit,0,error);assert.match(output,/ACTION_DONE/);
        const restarted=spawn(process.execPath,["tests/fixtures/hd-financial-fence-child.cjs"],{cwd:process.cwd(),env:{...process.env,
          HD_FENCE_CHILD_FIXTURE:JSON.stringify({socket,authority,input})},stdio:["ignore","pipe","pipe"]});
        let after="";restarted.stdout.on("data",b=>after+=b);assert.equal(await new Promise(r=>restarted.once("exit",r)),2);
        assert.match(after,/HELD_OR_UNKNOWN/);assert.doesNotMatch(after,/ADMITTED|ACTION_DONE/);
      }finally{if(child.exitCode===null)child.kill("SIGKILL");}
    });
    await t.test("expiry cancels queued I/O while retaining the lease until the callback unwinds",async()=>{
      const now=Math.floor(Date.now()/1000);await set(true,{issued_at:now-1,expires_at:now+2});let callbacks=0;
      await assert.rejects(run(async signal=>{
        callbacks++;await new Promise<void>(r=>signal.addEventListener("abort",()=>r(),{once:true}));
        // Cancellation is not a promise race: the lease is still held here.
        await assert.rejects(owner!.query("SELECT pg_advisory_lock(724176,48)"),{code:"55P03"});
        signal.throwIfAborted();sends++;
      }),/financial_admission_expired/);assert.equal(callbacks,1);assert.equal(sends,2);
      await assert.rejects(run(),/scope_or_expiry/);
    });
    await t.test("policy generation cannot be replayed erased or truncated",async()=>{
      await assert.rejects(owner!.query("UPDATE hd_financial_maintenance_policy SET closed=false"),/generation must advance/);
      await assert.rejects(owner!.query("DELETE FROM hd_financial_maintenance_policy"),/cannot be deleted/);
      await assert.rejects(owner!.query("TRUNCATE hd_financial_maintenance_policy"),/cannot be deleted/);
    });
    await t.test("RLS owner role memberships and column-write grants fail closed",async()=>{
      await set(true);await owner!.query("ALTER TABLE hd_financial_maintenance_policy ENABLE ROW LEVEL SECURITY");await assert.rejects(run(),/reader_role/);
      await owner!.query("ALTER TABLE hd_financial_maintenance_policy DISABLE ROW LEVEL SECURITY; GRANT UPDATE(closed) ON hd_financial_maintenance_policy TO fence_reader");await assert.rejects(run(),/reader_role/);
      await owner!.query("REVOKE UPDATE(closed) ON hd_financial_maintenance_policy FROM fence_reader; CREATE ROLE unrelated_fixture; GRANT unrelated_fixture TO fence_reader");await assert.rejects(run(),/reader_role/);
      await owner!.query("REVOKE unrelated_fixture FROM fence_reader");
      const reader=db();await assert.rejects(k.withConfiguredLease(reader,{...authority,readerRole:"wrong_role"},input,async()=>++sends),/reader_role/);
      assert.equal(sends,2);
    });
    await t.test("lost policy connection aborts the active transport without retry",async()=>{
      await set(true);let callbacks=0;let killed=false;
      const client=db();let pid=0;const query=client.query.bind(client);
      client.query=(async(...args:unknown[])=>{
        // Record the actual policy-lease connection; no stub policy results.
        const result=await query(...args as [string]);
        if(String(args[0]).startsWith("BEGIN"))pid=(await query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        return result;
      }) as typeof client.query;
      await assert.rejects(k.withConfiguredLease(client,authority,input,async(signal:AbortSignal)=>{
        callbacks++;await owner!.query("SELECT pg_terminate_backend($1)",[pid]);killed=true;
        await new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener("abort",()=>resolve(),{once:true});});signal.throwIfAborted();
      }));assert.equal(callbacks,1);assert.equal(killed,true);assert.equal(sends,2);
    });
  }finally{
    await owner?.end();if(started)execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-m","immediate","-w","stop"],{stdio:"pipe"});rmSync(root,{recursive:true,force:true});
  }
});
