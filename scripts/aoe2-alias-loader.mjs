import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".mts",
  ".tsx",
  ".js",
  ".mjs",
  "/index.ts",
  "/index.mts",
  "/index.js",
  "/index.mjs",
];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const relative = specifier.slice(2);
  const base = path.resolve(ROOT, relative);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return {
        url: pathToFileURL(candidate).href,
        shortCircuit: true,
      };
    }
  }

  throw new Error(`Unable to resolve AoE2WAR alias import: ${specifier}`);
}
