import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import test from "node:test";

// Cryptographic fixtures only. These tokens, users and keys never authorize or
// certify a production browser. Exercise the exact frozen deployed auth code.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const jose = await import(pathToFileURL(require.resolve("jose")).href);
const frozen = "0cee3c836c4b0760478280c145e02e81e470ce0e";
const source = (path: string) => execFileSync("git", ["show", frozen + ":" + path], { encoding: "utf8" });
const raw = {
  preview: source("lib/previewDataSource.ts"), session: source("lib/session.ts"),
  admin: source("lib/adminSession.ts"),
};
const fixtureKey = "fixture-only-symmetric-session-key-abcdefghijklmnopqrstuvwxyz0123456789";

function compiledModule(code: string, env: Record<string, string>, imported: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, process: { env }, TextEncoder, URL, URLSearchParams,
    require(name: string) {
      if (Object.hasOwn(imported, name)) return imported[name];
      throw new Error("Unexpected frozen auth dependency: " + name);
    },
  });
  return exports;
}

function fixtureAuth(secret: Record<string, string> = { SESSION_SECRET: fixtureKey }) {
  const env = { NODE_ENV: "production", ...secret };
  const preview = compiledModule(raw.preview, env, {});
  const session = compiledModule(raw.session, env, {
    crypto: require("node:crypto"), jose,
    "@/lib/previewDataSource": preview,
  });
  let cookie: string | undefined;
  const reads: unknown[] = [];
  const users: Record<string, { id: number; uid: string; isAdmin: boolean }> = {
    "fixture-admin": { id: 1, uid: "fixture-admin", isAdmin: true },
    "fixture-scout": { id: 2, uid: "fixture-scout", isAdmin: false },
  };
  const prisma = { user: { async findUnique(query: { where: { uid: string } }) {
    reads.push(query);
    return users[query.where.uid] ?? null;
  } } };
  const admin = compiledModule(raw.admin, env, {
    "next/headers": { async cookies() { return { get: () => cookie ? { value: cookie } : undefined }; } },
    "next/navigation": { redirect(path: string) { throw new Error("AUTH_REDIRECT:" + path); } },
    "next/server": { NextResponse: { json: Response.json.bind(Response) } },
    "@/lib/prisma": { getPrisma: () => prisma }, "@/lib/session": session,
  });
  const request = (value?: string) => ({ cookies: { get: () => value ? { value } : undefined } });
  return { session, admin, reads, request, setCookie(value?: string) { cookie = value; } };
}

test("production without a key never accepts a signed fixture or falls back to development auth", async () => {
  const valid = fixtureAuth();
  const token = await valid.session.signSession("fixture-admin");
  const missing = fixtureAuth({});
  assert.equal(await missing.session.verifySession(token), null);
  await assert.rejects(missing.session.signSession("fixture-admin"), /required in production/);
  const denied = await missing.admin.requireAdmin(missing.request(token));
  assert.equal(denied.error.status, 401);
  assert.equal(missing.reads.length, 0);
});

test("only the exact untrimmed shared key verifies the preexisting signed fixture", async () => {
  const original = fixtureAuth();
  const token = await original.session.signSession("fixture-admin");
  const candidate = fixtureAuth();
  assert.equal((await candidate.session.verifySession(token))?.uid, "fixture-admin");
  for (const key of [fixtureKey + "-changed", " " + fixtureKey, fixtureKey + " "]) {
    assert.equal(await fixtureAuth({ SESSION_SECRET: key }).session.verifySession(token), null);
  }
  assert.equal((await fixtureAuth({ NEXTAUTH_SECRET: fixtureKey }).session.verifySession(token))?.uid, "fixture-admin");
  assert.equal(await fixtureAuth({ SESSION_SECRET: "different-fixture-primary-key", NEXTAUTH_SECRET: fixtureKey }).session.verifySession(token), null);
});

test("anonymous guest gets 401 and signed nonadmin gets 403 using the actual DB role lookup", async () => {
  const runtime = fixtureAuth();
  const guest = await runtime.admin.requireAdmin(runtime.request());
  assert.equal(guest.error.status, 401);
  assert.equal(runtime.reads.length, 0);
  const scout = await runtime.session.signSession("fixture-scout");
  const denied = await runtime.admin.requireAdmin(runtime.request(scout));
  assert.equal(denied.error.status, 403);
  assert.equal(runtime.reads.length, 1);
  const query = runtime.reads[0] as { where: { uid: string }; select: Record<string, boolean> };
  assert.equal(query.where.uid, "fixture-scout");
  assert.equal(JSON.stringify(query.select), JSON.stringify({ id: true, uid: true, isAdmin: true }));
});

test("valid signed fixture admin is authorized by DB while cookie role claims grant nothing", async () => {
  const runtime = fixtureAuth();
  const adminToken = await runtime.session.signSession("fixture-admin");
  const accepted = await runtime.admin.requireAdmin(runtime.request(adminToken));
  assert.equal(accepted.user.uid, "fixture-admin");
  assert.equal(accepted.user.isAdmin, true);
  const forgedRoleClaim = await new jose.SignJWT({ uid: "fixture-scout", isAdmin: true })
    .setProtectedHeader({ alg: "HS256" }).setIssuer("aoe2hdbets")
    .setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(fixtureKey));
  assert.equal((await runtime.admin.requireAdmin(runtime.request(forgedRoleClaim))).error.status, 403);
});

test("server admin pages redirect guest and nonadmin while admitting the same DB-backed admin fixture", async () => {
  const runtime = fixtureAuth();
  await assert.rejects(runtime.admin.requireServerAdmin(), /AUTH_REDIRECT:\//);
  runtime.setCookie(await runtime.session.signSession("fixture-scout"));
  await assert.rejects(runtime.admin.requireServerAdmin(), /AUTH_REDIRECT:\//);
  runtime.setCookie(await runtime.session.signSession("fixture-admin"));
  assert.equal((await runtime.admin.requireServerAdmin()).user.uid, "fixture-admin");
});

test("expired, wrong-issuer and malformed signed fixtures remain anonymous", async () => {
  const runtime = fixtureAuth();
  const key = new TextEncoder().encode(fixtureKey);
  const expired = await new jose.SignJWT({ uid: "fixture-admin" }).setProtectedHeader({ alg: "HS256" })
    .setIssuer("aoe2hdbets").setExpirationTime(1).sign(key);
  const wrongIssuer = await new jose.SignJWT({ uid: "fixture-admin" }).setProtectedHeader({ alg: "HS256" })
    .setIssuer("untrusted-fixture").setExpirationTime("5m").sign(key);
  for (const token of [expired, wrongIssuer, "not-a-signed-session"]) {
    assert.equal((await runtime.admin.requireAdmin(runtime.request(token))).error.status, 401);
  }
  assert.equal(runtime.reads.length, 0);
});
