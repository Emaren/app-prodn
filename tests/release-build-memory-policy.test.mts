import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);

function loadReleaseConfig() {
  const configPath = path.join(root, "next.config.js");
  const prior = process.env.NEXT_DIST_DIR;

  process.env.NEXT_DIST_DIR = ".next-release";
  delete require.cache[require.resolve(configPath)];

  try {
    return require(configPath);
  } finally {
    if (prior === undefined) {
      delete process.env.NEXT_DIST_DIR;
    } else {
      process.env.NEXT_DIST_DIR = prior;
    }
    delete require.cache[require.resolve(configPath)];
  }
}

test("release build bounds aggregate Next memory without dropping validation", () => {
  const config = loadReleaseConfig();

  assert.equal(config.outputFileTracingRoot, root);
  assert.equal(config.experimental?.webpackBuildWorker, true);
  assert.equal(config.experimental?.webpackMemoryOptimizations, true);
  assert.equal(config.experimental?.cpus, 2);

  assert.equal(config.eslint?.ignoreDuringBuilds, true);
  assert.equal(config.typescript?.ignoreBuildErrors, true);

  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );

  const prebuild = String(pkg.scripts?.prebuild || "");
  assert.match(prebuild, /aoe2_release_prebuild_validation\.mjs/);

  const helper = path.join(root, "scripts", "aoe2_release_prebuild_validation.mjs");
  const releaseEnv = { ...process.env, NEXT_DIST_DIR: ".next-release" };
  delete releaseEnv.AOE2WAR_RELEASE_GATE_RECEIPT;
  const releasePlan = JSON.parse(
    execFileSync(process.execPath, [helper, "--print-plan"], {
      cwd: root,
      encoding: "utf8",
      env: releaseEnv,
    })
  );
  assert.deepEqual(releasePlan, [["next", ["lint"]], ["tsc", ["--noEmit"]]]);

  const ordinaryEnv = { ...process.env };
  delete ordinaryEnv.NEXT_DIST_DIR;
  const ordinaryPlan = JSON.parse(
    execFileSync(process.execPath, [helper, "--print-plan"], {
      cwd: root,
      encoding: "utf8",
      env: ordinaryEnv,
    })
  );
  assert.deepEqual(ordinaryPlan, [["next", ["lint"]], ["tsc", ["--noEmit"]]]);
});

test("ordinary builds keep Next built-in validation enabled", () => {
  const configPath = path.join(root, "next.config.js");
  const prior = process.env.NEXT_DIST_DIR;

  delete process.env.NEXT_DIST_DIR;
  delete require.cache[require.resolve(configPath)];

  try {
    const config = require(configPath);
    assert.equal(config.outputFileTracingRoot, root);
    assert.equal(config.eslint?.ignoreDuringBuilds, false);
    assert.equal(config.typescript?.ignoreBuildErrors, false);
    assert.equal(config.experimental?.cpus, undefined);
  } finally {
    if (prior === undefined) {
      delete process.env.NEXT_DIST_DIR;
    } else {
      process.env.NEXT_DIST_DIR = prior;
    }
    delete require.cache[require.resolve(configPath)];
  }
});
