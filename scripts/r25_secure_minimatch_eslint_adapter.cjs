#!/usr/bin/env node
"use strict";
/**
 * Strict, narrowly scoped compatibility adjustment for two upstream ESLint
 * importers which require minimatch's removed default export. NEVER modifies
 * a lockfile, a production source route, a financial handler or the advisory
 * policy. Abort on any unexpected installed source or dependency version.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url");
const root=path.resolve(__dirname,"..");
const specs=[
 {path:"@eslint/eslintrc/lib/config-array/override-tester.js",
  before:'import minimatch from "minimatch";',
  after:'import { Minimatch } from "minimatch";',
  extraBefore:/const\s*\{\s*Minimatch\s*\}\s*=\s*minimatch\s*;/,
  extraAfter:""},
 {path:"@eslint/config-array/dist/esm/index.js",
  before:"import minimatch from 'minimatch';",
  after:"import { minimatch } from 'minimatch';"}
];
function occurrences(source,phrase){return source.split(phrase).length-1;}
function rewrite(source,spec){
 if(typeof source!=="string"||source.length<100||source.length>1500000)
  throw Error("UNEXPECTED_ESLINT_SOURCE_SIZE");
 if(source.includes(spec.after)&&occurrences(source,spec.before)===0){
  if(spec.extraBefore&&spec.extraBefore.test(source))throw Error("PARTIAL_ESLINT_PATCH");
  if(occurrences(source,spec.after)!==1)throw Error("DUPLICATE_ESLINT_PATCH");
  return {content:source,changed:false};
 }
 if(occurrences(source,spec.before)!==1||source.includes(spec.after))
  throw Error("ESLINT_UPSTREAM_IMPORT_CONTRACT_CHANGED");
 let updated=source.replace(spec.before,spec.after);
 if(spec.extraBefore){
  if(!spec.extraBefore.test(updated))throw Error("ESLINT_MINIMATCH_DESTRUCTURE_CHANGED");
  updated=updated.replace(spec.extraBefore,spec.extraAfter);
 }
 if(updated===source||occurrences(updated,spec.after)!==1)
  throw Error("ESLINT_COMPAT_REWRITE_INCOMPLETE");
 return {content:updated,changed:true};
}
function strictFile(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1500000||stat.size<100)
  throw Error("UNSAFE_ESLINT_IMPORTER_FILE");
 return stat;
}
function packageVersion(name){
 const p=path.join(root,"node_modules",name,"package.json");
 strictFile(p);
 return JSON.parse(fs.readFileSync(p,"utf8")).version;
}
async function main(){
 if(packageVersion("minimatch")!=="11.0.1"||packageVersion("glob")!=="14.0.2")
  throw Error("SECURE_DEPENDENCY_VERSIONS_NOT_EXACT");
 const mm=await import(pathToFileURL(path.join(root,"node_modules/minimatch/dist/esm/index.js")).href);
 if(typeof mm.minimatch!=="function"||typeof mm.Minimatch!=="function"||"default" in mm)
  throw Error("SECURE_MINIMATCH_NAMED_EXPORTS_CHANGED");
 assert.equal(mm.minimatch("lib/code.ts","**/*.ts",{dot:true,matchBase:true}),true);
 assert.equal(mm.minimatch(".secret.txt","*.txt",{dot:true}),true);
 assert.equal(mm.minimatch("tests/a.js","src/*.js",{dot:true}),false);
 assert.equal(new mm.Minimatch("**/*.tsx",{dot:true}).match("app/test.tsx"),true);
 const updates=[];
 // Validate BOTH paths and shapes first; abort without writes on any mismatch.
 for(const spec of specs){
  const filename=path.join(root,"node_modules",spec.path);
  const st=strictFile(filename);
  const old=fs.readFileSync(filename,"utf8");
  const next=rewrite(old,spec);
  updates.push({filename,st,...next});
 }
 for(const item of updates){
  if(!item.changed)continue;
  const tmp=item.filename+".r25-compat-"+process.pid;
  const fd=fs.openSync(tmp,"wx",item.st.mode&0o777);
  try{fs.writeFileSync(fd,item.content,"utf8");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,item.filename);
  const dir=fs.openSync(path.dirname(item.filename),"r");
  try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 }
 for(const spec of specs){
  const now=fs.readFileSync(path.join(root,"node_modules",spec.path),"utf8");
  if(rewrite(now,spec).changed)throw Error("ESLINT_COMPAT_NOT_DURABLE");
 }
 console.log("PASS:R25_MINIMATCH_11_0_1_TWO_IMPORTER_COMPAT",updates.map(u=>({path:path.relative(root,u.filename),changed:u.changed})));
}
if(require.main===module)main().catch(e=>{console.error("HOLD:R25_ESLINT_MINIMATCH_COMPAT",e.stack||e);process.exitCode=2;});
module.exports={rewrite,specs};
