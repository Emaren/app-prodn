import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL(
    "../app/api/admin/replay-auto-recovery/route.ts",
    import.meta.url
  ),
  "utf8"
);

test("automatic replay recovery dispatches by exact current final hash", () => {
  assert.match(routeSource, /prisma\.\$queryRaw/);
  assert.match(routeSource, /NOT EXISTS\s*\(/);
  assert.match(
    routeSource,
    /lower\(run\.input_hash\)\s*=\s*lower\(game\.replay_hash\)/
  );
  assert.match(routeSource, /run\.parser_name/);
  assert.match(routeSource, /run\.parser_version/);
  assert.match(routeSource, /run\.pass_name/);
  assert.match(routeSource, /run\.pass_version/);
  assert.match(routeSource, /run\.schema_version/);
  assert.match(routeSource, /run\.candidate_only\s*=\s*TRUE/);
  assert.match(
    routeSource,
    /run\.affects_public_aggregates\s*=\s*FALSE/
  );
  assert.match(
    routeSource,
    /anyExactContractRunSuppressesRedispatch:\s*true/
  );
  assert.doesNotMatch(
    routeSource,
    /replayParseRuns:\s*\{\s*none:/
  );
});
