#!/usr/bin/env node
/**
 * Preserve legacy ESLint tool API while keeping patched minimatch 11.0.3.
 * Only module export adapters are appended; matching algorithm is unchanged.
 * No security scanner waiver, replacement identity or downgrade.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, "..");
const base = path.join(root, "node_modules", "minimatch");
const pkg = JSON.parse(fs.readFileSync(path.join(base, "package.json"), "utf8"));
if (pkg.name !== "minimatch" || pkg.version !== "11.0.3") {
  throw new Error("MINIMATCH_COMPAT_HOLD: expected security-fixed minimatch@11.0.3");
}
const marker = "// AoE2WAR R16: preserve legacy callers with patched minimatch 11 exports";
const entries = [
  {
    file: "dist/esm/index.js",
    patch: "\n" + marker + "\nexport { minimatch as default };\n",
    verify: /\b(?:export\s+(?:const|function)\s+minimatch|export\s*\{[^}]*minimatch)/,
  },
  {
    file: "dist/commonjs/index.js",
    patch: "\n" + marker + "\nmodule.exports = Object.assign(exports.minimatch, module.exports);\n",
    verify: /exports\.minimatch/,
  },
];
for (const { file, patch, verify } of entries) {
  const dest = path.join(base, file);
  const data = fs.readFileSync(dest, "utf8");
  if (data.includes(marker)) {
    if (!data.endsWith(patch)) {
      throw new Error("MINIMATCH_COMPAT_HOLD: noncanonical existing patch " + file);
    }
    continue;
  }
  if (!verify.test(data)) {
    throw new Error("MINIMATCH_COMPAT_HOLD: unknown upstream export layout " + file);
  }
  fs.writeFileSync(dest, data + patch, "utf8");
}
const esm = await import("minimatch");
const cjs = createRequire(import.meta.url)("minimatch");
if (typeof esm.default !== "function" || typeof esm.minimatch !== "function" ||
    typeof cjs !== "function" || typeof cjs.minimatch !== "function" ||
    esm.default("arena/one", "arena/*") !== true ||
    cjs("arena/one", "arena/*") !== true) {
  throw new Error("MINIMATCH_COMPAT_HOLD: patched callable/default API test failed");
}
console.log("PASS: minimatch@11.0.3 security algorithm retained; ESM/CJS legacy API bridged");
