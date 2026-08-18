import assert from "node:assert/strict";
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

  assert.equal(config.experimental?.webpackBuildWorker, true);
  assert.equal(config.experimental?.webpackMemoryOptimizations, true);
  assert.equal(config.experimental?.cpus, 2);

  assert.equal(config.eslint?.ignoreDuringBuilds, true);
  assert.equal(config.typescript?.ignoreBuildErrors, true);

  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );

  const prebuild = String(pkg.scripts?.prebuild || "");
  assert.match(prebuild, /\bnext lint\b/);
  assert.match(prebuild, /\btsc --noEmit\b/);

  assert.ok(
    prebuild.indexOf("next lint") < prebuild.indexOf("tsc --noEmit"),
    "lint and typecheck should run sequentially before next build"
  );
});

test("ordinary builds keep Next built-in validation enabled", () => {
  const configPath = path.join(root, "next.config.js");
  const prior = process.env.NEXT_DIST_DIR;

  delete process.env.NEXT_DIST_DIR;
  delete require.cache[require.resolve(configPath)];

  try {
    const config = require(configPath);
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
