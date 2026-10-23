// Build-time source measurement only. Never a live financial certification.
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {createHash} = require("node:crypto");
module.exports = function hdFinancialBuildIdentity(root) {
  try {
    const git = args => execFileSync("git", args, {cwd:root,encoding:"utf8",timeout:3000,stdio:["ignore","pipe","ignore"]});
    const source = git(["rev-parse","HEAD"]).trim();
    const version = fs.readFileSync(path.join(root,".aoe2war-build-version"),"utf8").trim();
    if (!/^[a-f0-9]{40}$/.test(source) || !/^[0-9]{14}-[a-f0-9]{10}$/.test(version)) return null;
    const dirty=git(["status","--porcelain=v1","-z","--untracked-files=normal"]).split("\0").filter(Boolean);
    if(dirty.length){
      // Next rewrites ONLY this type declaration when switching the protected
      // output directory. It is not executable source. Compare every other
      // byte with HEAD; no runtime/importable source or mode drift is allowed.
      if(dirty.length!==1||dirty[0].slice(3)!=="next-env.d.ts"||!dirty[0].startsWith(" M ")||
          git(["diff","--summary","HEAD","--","next-env.d.ts"]).trim())return null;
      if(git(["diff","--cached","--name-only","HEAD","--","next-env.d.ts"]).trim()||
          !fs.lstatSync(path.join(root,"next-env.d.ts")).isFile())return null;
      const original=git(["show","HEAD:next-env.d.ts"]);
      const actual=fs.readFileSync(path.join(root,"next-env.d.ts"),"utf8");
      const declaration=/^\/\/\/ <reference path="\.\/\.next(?:-release)?\/types\/routes\.d\.ts" \/>$/gm;
      if([...original.matchAll(declaration)].length!==1||[...actual.matchAll(declaration)].length!==1||
          original.replace(declaration,"NEXT_GENERATED_TYPE_REFERENCE")!==actual.replace(declaration,"NEXT_GENERATED_TYPE_REFERENCE"))return null;
    }
    return Object.freeze({source,deployment:createHash("sha256")
      .update("aoe2war/hd-financial-build/v1\0"+source+"\0"+version).digest("hex")});
  } catch { return null; }
};
