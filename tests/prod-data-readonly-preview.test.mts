import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Prisma production preview defaults every connection read-only", () => {
  const prisma = source("lib/prisma.ts");

  assert.match(prisma, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(prisma, /default_transaction_read_only=on/);
  assert.match(prisma, /statement_timeout=20000/);
  assert.match(prisma, /lock_timeout=2000/);
});

test("preview identity can resolve the real production user UID", () => {
  const preview = source("lib/previewDataSource.ts");
  const session = source("lib/session.ts");

  assert.match(preview, /AOE2WAR_PREVIEW_USER_UID/);
  assert.match(session, /getPreviewIdentity/);
  assert.match(session, /return \{ uid: previewIdentity\.uid \}/);
});

test("launcher tunnels production DB and proves read-only before Next starts", () => {
  const launcher = source("scripts/dev-prod-readonly.py");

  assert.match(launcher, /ExitOnForwardFailure=yes/);
  assert.match(launcher, /transaction_read_only/);
  assert.match(launcher, /default_transaction_read_only=on/);
  assert.match(launcher, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(launcher, /AOE2_BACKEND_UPSTREAM/);
  assert.match(launcher, /env\.pop\("INTERNAL_API_KEY"/);
  assert.match(launcher, /env\.pop\("ADMIN_TOKEN"/);
  assert.doesNotMatch(launcher, /write_text\(prod_database_url/);
});

test("missing local managed media falls through to public production", () => {
  const route = source(
    "app/uploads/managed-assets/[kind]/[file]/route.ts",
  );

  assert.match(route, /getPreviewDataOrigin/);
  assert.match(route, /production-managed-media/);
  assert.match(route, /cache: "no-store"/);
});

test("dev:prod is the read-only production parity launcher", () => {
  const pkg = JSON.parse(source("package.json")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    pkg.scripts?.["dev:prod"],
    "npm run kill-ports && npm run cert && python3 scripts/dev-prod-readonly.py",
  );
});
