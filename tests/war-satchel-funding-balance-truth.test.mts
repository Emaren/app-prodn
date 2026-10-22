import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import Module,{createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
// Execute the actual component and mount effects with controlled hook storage.
// The only remote observation is a private fixture GET; no wallet/signing path.
async function renderBalance(payload:unknown,status=200){
 const states:unknown[]=[],effects:Array<()=>void|(()=>void)>=[],cache=new Map<string,Record<string,unknown>>();
 let cursor=0;const calls:string[]=[],original=globalThis.fetch;
 const load=(relative:string):Record<string,unknown>=>{
  const filename=path.resolve(ROOT,relative);if(cache.has(filename))return cache.get(filename)!;
  const output=ts.transpileModule(readFileSync(filename,"utf8"),{fileName:filename,compilerOptions:{
   module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,
  }}).outputText;
  const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  const native=createRequire(filename);
  mod.require=(specifier:string):unknown=>{
   if(specifier==="react")return {...React,useEffect:(effect:()=>void|(()=>void))=>effects.push(effect),
    useState:(initial:unknown)=>{const i=cursor++;if(!(i in states))states[i]=initial;
     return [states[i],(v:unknown)=>{states[i]=typeof v==="function"?(v as (old:unknown)=>unknown)(states[i]):v;}];}};
   if(specifier.startsWith("@/lib/"))return load("lib/"+specifier.slice(6)+".ts");
   if(specifier.startsWith(".")&&specifier.endsWith(".ts"))return load(path.relative(ROOT,path.resolve(path.dirname(filename),specifier)));
   return native(specifier);
  };
  cache.set(filename,mod.exports as Record<string,unknown>);mod._compile(output,filename);return mod.exports as Record<string,unknown>;
 };
 globalThis.fetch=(async input=>{calls.push(String(input));return Response.json(payload,{status});}) as typeof fetch;
 const cleanups:Array<()=>void>=[];
 try{
  const Component=load("components/profile/WarSatchelFundingAction.tsx").default as (props:{walletAddress:string;depositAmount:string})=>React.ReactNode;
  Component({walletAddress:"",depositAmount:"100"});
  for(const effect of [...effects]){const cleanup=effect();if(cleanup)cleanups.push(cleanup);}
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  cursor=0;const html=renderToStaticMarkup(Component({walletAddress:"",depositAmount:"100"}));
  assert.deepEqual(calls,["/api/user/war-satchel/balance"]);
  return html;
 }finally{for(const cleanup of cleanups)cleanup();globalThis.fetch=original;}
}
const balance={available:true,depositEnabled:false,chainId:"wolo-1",denom:"uwolo",wageringEnabled:false,
 availableUwolo:"10000000",reservedUwolo:"2000000",withdrawalPendingUwolo:"3000000",committedHistoricalUwolo:"0",version:"1"};

test("incomplete or wrong-chain owner JSON never invents a verified zero Satchel balance",async()=>{
 for(const payload of [{available:true,depositEnabled:true},{...balance,chainId:"other-chain"},{...balance,denom:"other"},
  {...balance,availableUwolo:"9223372036854775808"},{...balance,reservedUwolo:null}]){
  const html=await renderBalance(payload);
  assert.doesNotMatch(html,/Verified War Satchel:/);
  assert.match(html,/FUNDING AWAITING VAULT CERTIFICATION/);
 }
});
test("an HTTP error cannot promote even complete-looking balance JSON",async()=>{
 assert.doesNotMatch(await renderBalance({...balance,depositEnabled:true},503),/Verified War Satchel:/);
});
test("complete current owner-ledger values display exactly and cannot enable held funding",async()=>{
 const html=await renderBalance(balance);
 assert.match(html,/Verified War Satchel:.*10 WOLO available/);
 assert.match(html,/2 reserved/);assert.match(html,/3 pending withdrawal/);
 assert.match(html,/FUNDING AWAITING VAULT CERTIFICATION/);
 const zero=await renderBalance({...balance,availableUwolo:"0"});
 assert.match(zero,/Verified War Satchel:.*0 WOLO available/);
});
