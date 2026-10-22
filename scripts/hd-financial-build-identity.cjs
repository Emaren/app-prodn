// Build-time source measurement only. Never a live financial certification.
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {createHash} = require("node:crypto");
module.exports = function hdFinancialBuildIdentity(root) {
  try {
    const git = args => execFileSync("git", args, {cwd:root,encoding:"utf8",timeout:3000,stdio:["ignore","pipe","ignore"]}).trim();
    const source = git(["rev-parse","HEAD"]);
    const version = fs.readFileSync(path.join(root,".aoe2war-build-version"),"utf8").trim();
    if (!/^[a-f0-9]{40}$/.test(source) || !/^[0-9]{14}-[a-f0-9]{10}$/.test(version) ||
        git(["status","--porcelain","--untracked-files=normal"]) !== "") return null;
    return Object.freeze({source,deployment:createHash("sha256")
      .update("aoe2war/hd-financial-build/v1\0"+source+"\0"+version).digest("hex")});
  } catch { return null; }
};
