import assert from "node:assert/strict";
import test from "node:test";
import {createRequire,Module} from "node:module";
import {readFileSync,mkdtempSync,mkdirSync,rmSync,existsSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {generateKeyPairSync,sign} from "node:crypto";
import path from "node:path";
import pg from "pg";
import ts from "typescript";
import {hdFinancialPermitMessage} from "../lib/hdFinancialMaintenanceFence.ts";

const require=createRequire(import.meta.url),corePath=path.resolve("lib/hdFinancialMaintenanceFence.ts");
const source=readFileSync(corePath,"utf8");
function kernel(build:unknown=null){
 const original='const BUILD=typeof __AOE2WAR_HD_FINANCIAL_BUILD__ === "undefined" ? null : __AOE2WAR_HD_FINANCIAL_BUILD__;';
 assert.ok(source.includes(original),"private isolated fixture must preserve compiled identity rule");
 const fixture=source.replace(original,`const BUILD=${JSON.stringify(build)};`)+"\nexport {withConfiguredLease,assertRuntime,authorize};";
 const m=new Module(corePath);m.filename=corePath;
 // @ts-expect-error Test-only private Node loader.
 m.paths=Module._nodeModulePaths(path.dirname(corePath));
 // @ts-expect-error Test-only private Node loader.
 m._compile(ts.transpileModule(fixture,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,corePath);
 return m.exports;
}
const key=generateKeyPairSync("ed25519");
const identity={source:"a".repeat(40),deployment:"b".repeat(64)};
const authority={...identity,readerRole:"fence_reader",databaseUrl:"fixture-unused",databaseCA:"fixture",publicKey:key.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex")};
const input={scope:"hd-legacy" as const,producer:"settlement-payout",wallet:"wolo1"+"p".repeat(38)};
function permit(generation="2",extra:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000);
 return {protocol:1,...identity,scope:input.scope,generation,producers:[input.producer],wallets:[input.wallet],issued_at:now-1,expires_at:now+45,...extra};
}
function signature(p:ReturnType<typeof permit>){return sign(null,hdFinancialPermitMessage(p),key.privateKey).toString("base64");}
test("source/build identity cannot be substituted by an authority rotation",()=>{
 const k=kernel(identity);k.assertRuntime(authority);
 assert.throws(()=>k.assertRuntime({...authority,source:"c".repeat(40)}),/runtime_identity_mismatch/);
 assert.throws(()=>k.assertRuntime({...authority,deployment:"d".repeat(64)}),/runtime_identity_mismatch/);
 assert.throws(()=>kernel().assertRuntime(authority),/compiled_runtime_identity_missing/);
});
test("permit binds exact scope, generation, source, wallet, producer and 60s expiry",()=>{
 const k=kernel(),p=permit(),policy={generation:"2",closed:false,permit:p,signature:signature(p),now:new Date()};
 k.authorize(policy,authority,input);
 for(const change of [{closed:true},{generation:"3"},{signature:Buffer.alloc(64).toString("base64")},{now:new Date(p.expires_at*1000)}])
   assert.throws(()=>k.authorize({...policy,...change},authority,input),/HD_FINANCIAL_FENCE_HELD/);
 for(const change of [{scope:"hd-satchel"},{source:"c".repeat(40)},{wallets:["wolo1"+"q".repeat(38)]},{producers:["foreign"]},{issued_at:Math.floor(Date.now()/1000)+10}]){
   const changed=permit("2",change);
   assert.throws(()=>k.authorize({...policy,permit:changed,signature:signature(changed)},authority,input),/HD_FINANCIAL_FENCE_HELD/);
 }
 for(const change of [{extra:true},{expires_at:p.issued_at+61},{producers:[input.producer,input.producer]},{generation:"0"}])
   assert.throws(()=>hdFinancialPermitMessage({...p,...change}));
});
test("compiled seal rejects dirty executable source and fake build generation",()=>{
 const root=mkdtempSync("/tmp/hd-source-seal-");
 const git=(...args:string[])=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
 const measure=require("../scripts/hd-financial-build-identity.cjs");
 try{
   git("init");git("config","user.name","Test");git("config","user.email","test@example.invalid");
   writeFileSync(path.join(root,".gitignore"),".aoe2war-build-version\n");
   writeFileSync(path.join(root,"entry.ts"),"const identity='original';\n");
   writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next/types/routes.d.ts" />\n');
   git("add",".");git("commit","-m","seal fixture");
   assert.equal(measure(root),null);
   writeFileSync(path.join(root,".aoe2war-build-version"),"20261021220000-a1b2c3d4e5\n");
   const original=measure(root);assert.ok(original);
   writeFileSync(path.join(root,"next-env.d.ts"),'/// <reference path="./.next-release/types/routes.d.ts" />\n');
   assert.deepEqual(measure(root),original);
   writeFileSync(path.join(root,"entry.ts"),"tampered\n");assert.equal(measure(root),null);
   writeFileSync(path.join(root,"entry.ts"),"const identity='original';\n");
   writeFileSync(path.join(root,"injected.ts"),"injected\n");assert.equal(measure(root),null);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("durable closed lease, signed open lease, reversal and policy generations in isolated PG",{skip:process.env.RUN_HD_FINANCIAL_FENCE_PG_TESTS!=="1"},async()=>{
 const bin=process.env.AOE2WAR_TEST_PG_BIN||"/usr/lib/postgresql/16/bin";
 assert.ok(existsSync(path.join(bin,"initdb")),"PostgreSQL16 binaries must be installed");
 const root=mkdtempSync("/tmp/hd-finance-pg-"),data=path.join(root,"data"),socket=path.join(root,"socket");
 mkdirSync(socket,{mode:0o700});let started=false;let owner:pg.Client|undefined;
 const k=kernel(identity);
 const db=()=>new pg.Client({host:socket,user:"fence_reader",database:"postgres"});
 let sends=0,generation=1;
 const run=()=>k.withConfiguredLease(db(),authority,input,async()=>++sends);
 try{
   execFileSync(path.join(bin,"initdb"),["-D",data,"-U","operator_fixture","--auth-local=trust","--auth-host=reject"],{stdio:"pipe"});
   execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-l",path.join(root,"server.log"),"-o",`-h '' -k ${socket}`,"-w","start"],{stdio:"pipe"});
   started=true;owner=new pg.Client({host:socket,user:"operator_fixture",database:"postgres"});await owner.connect();
   await owner.query(readFileSync("prisma/migrations/20261021_220000_hd_financial_maintenance_fence/migration.sql","utf8"));
   await owner.query("CREATE ROLE fence_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO fence_reader; GRANT SELECT ON hd_financial_maintenance_policy TO fence_reader");
   const set=async(open:boolean,change:Record<string,unknown>={})=>{
     const p=permit(String(++generation),change);
     await owner!.query("UPDATE hd_financial_maintenance_policy SET generation=$1,closed=$2,permit=$3,signature=$4 WHERE scope='hd-legacy'",[generation,!open,p,signature(p)]);
   };
   await assert.rejects(run(),/closed_or_unavailable/);assert.equal(sends,0);
   await set(true);await run();assert.equal(sends,1);
   await set(false);await assert.rejects(run(),/closed_or_unavailable/);
   await set(true,{source:"c".repeat(40)});await assert.rejects(run(),/HD_FINANCIAL_FENCE_HELD/);
   await set(true);await owner.query("ALTER TABLE hd_financial_maintenance_policy ENABLE ROW LEVEL SECURITY");
   await assert.rejects(run(),/reader_role/);
   await owner.query("ALTER TABLE hd_financial_maintenance_policy DISABLE ROW LEVEL SECURITY");
   await owner.query("GRANT UPDATE(closed) ON hd_financial_maintenance_policy TO fence_reader");
   await assert.rejects(run(),/reader_role/);
   await owner.query("REVOKE UPDATE(closed) ON hd_financial_maintenance_policy FROM fence_reader");
   await assert.rejects(owner.query("UPDATE hd_financial_maintenance_policy SET closed=false"),/generation must advance/);
   await assert.rejects(owner.query("DELETE FROM hd_financial_maintenance_policy"),/cannot be deleted/);
   await assert.rejects(owner.query("TRUNCATE hd_financial_maintenance_policy"),/cannot be deleted/);
   assert.equal(sends,1);
 }finally{
   await owner?.end();
   if(started)execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-m","immediate","-w","stop"],{stdio:"pipe"});
   rmSync(root,{recursive:true,force:true});
 }
});
