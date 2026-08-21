import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("writable shadow session inherits imported admin authority", () => {
  const route = read(
    "app/api/auth/session/route.ts",
  );

  assert.match(
    route,
    /AOE2WAR_SHADOW_MODE/,
  );

  assert.match(
    route,
    /shadowUser[\s\S]*prisma\.user\.findUnique/,
  );

  assert.match(
    route,
    /toUserApi\([\s\S]*shadowUser/,
  );

  assert.match(
    route,
    /shadow: true/,
  );
});

test("readonly generic preview still cannot become admin", () => {
  const route = read(
    "app/api/auth/session/route.ts",
  );

  assert.match(
    route,
    /isAdmin: false/,
  );
});
