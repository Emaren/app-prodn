#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const DEFAULT_GATE_PROOF = ".aoe2war-release-gate-receipt.json";

function currentHead(cwd) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
}

export function hasBoundReleaseGateProof(env = process.env, cwd = process.cwd()) {
  if (env.NEXT_DIST_DIR !== ".next-release") return false;
  const proofPath = path.resolve(cwd, env.AOE2WAR_RELEASE_GATE_RECEIPT || DEFAULT_GATE_PROOF);
  try {
    const payload = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    return (
      payload.status === "PASS" &&
      payload.target_sha === currentHead(cwd) &&
      /^[0-9a-f]{64}$/.test(String(payload.scope_sha256 || ""))
    );
  } catch {
    return false;
  }
}

export function validationPlan(env = process.env, cwd = process.cwd()) {
  if (hasBoundReleaseGateProof(env, cwd)) return [];
  return [["next", ["lint"]], ["tsc", ["--noEmit"]]];
}

const plan = validationPlan();
if (process.argv.includes("--print-plan")) {
  console.log(JSON.stringify(plan));
  process.exit(0);
}
if (plan.length === 0) {
  console.log("Bound Release Gate PASS owns lint/type validation; skipping duplicate prebuild checks.");
  process.exit(0);
}
if (process.env.NEXT_DIST_DIR === ".next-release") {
  console.warn("Release Gate proof missing or invalid; running full prebuild validation fail-closed.");
}
for (const [command, args] of plan) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
