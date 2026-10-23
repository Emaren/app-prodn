// Verify the actual compiled server code, not a newly read runtime sidecar.
import fs from "node:fs";
import path from "node:path";
import identityFor from "./hd-financial-build-identity.cjs";
const identity=identityFor(process.cwd());
if(!identity)throw Error("HD financial bundle identity unavailable: require clean exact source and generated build version");
const root=path.resolve(process.env.NEXT_DIST_DIR||".next","server");
let found=0,visited=0;
function visit(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(++visited>20000)throw Error("HD financial build census limit");
    const file=path.join(directory,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory())visit(file);
    else if(entry.isFile()&&entry.name.endsWith(".js")){
      const size=fs.statSync(file).size;if(size>25*1024*1024)throw Error("HD financial build chunk limit");
      const text=fs.readFileSync(file,"utf8");
      if(!text.includes("HD_FINANCIAL_FENCE_OUTCOME_UNKNOWN"))continue;
      if(text.includes("__AOE2WAR_HD_FINANCIAL_BUILD__")||!text.includes(identity.source)||!text.includes(identity.deployment))
        throw Error("HD financial server bundle is missing its exact immutable build identity: "+path.relative(root,file));
      found++;
    }
  }
}
visit(root);if(!found)throw Error("HD financial gate not found in compiled server source");
console.log(JSON.stringify({protocol:1,...identity,verified_server_chunks:found,financial_activation_authorized:false}));
