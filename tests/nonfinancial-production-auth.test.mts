import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import test from "node:test";

// Execute the real TypeScript handlers and real JOSE signatures with isolated
// fixture identities. These cookies and provider responses are never live proof.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const jose = await import(pathToFileURL(require.resolve("jose")).href);
const root = process.cwd();
const profile = "nonfinancial-production-v1";
const state = "A".repeat(43);
const steamId = "76561198000000001";
const cookieName = "__Host-aoe2war_steam_state";

class Reply {
  body: unknown;
  status: number;
  headers: Headers;
  savedCookies = new Map<string, Record<string, unknown>>();
  cookies = { set: (...args: unknown[]) => {
    const item = typeof args[0] === "object" ? args[0] as Record<string, unknown> :
      { name: args[0], value: args[1], ...args[2] as Record<string, unknown> };
    this.savedCookies.set(String(item.name), item);
  } };
  constructor(body: unknown, options: { status?: number; headers?: HeadersInit } = {}) {
    this.body = body; this.status = options.status ?? 200; this.headers = new Headers(options.headers);
  }
  static json(body: unknown, options = {}) { return new Reply(body, options); }
  static redirect(url: string | URL) { return new Reply(null, { status: 307, headers: { location: String(url) } }); }
}

function source(file: string) { return readFileSync(path.join(root, file), "utf8"); }
function load(file: string, deps: Record<string, unknown>, env: Record<string, string>, extra: Record<string, unknown> = {}) {
  // Dynamic exports are the boundary of the real TypeScript VM harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadedModule = { exports: {} as Record<string, any> };
  const javascript = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(javascript, { module: loadedModule, exports: loadedModule.exports,
    require: (name: string) => {
      if (name in deps) return deps[name];
      if (name === "@/lib/userDto") return load("lib/userDto.ts", {}, env);
      if (name === "node:crypto" || name === "crypto") return require(name);
      throw new Error("Unexpected fixture import: " + name);
    }, process: { env }, URL, URLSearchParams, Buffer, TextDecoder, TextEncoder, Uint8Array,
    Headers, Response, AbortSignal, console, ...extra,
  }, { filename: file });
  return loadedModule.exports;
}
function environment() {
  return { NODE_ENV: "production", AOE2WAR_RUNTIME_PROFILE: profile,
    SESSION_SECRET: "test-fixture-session-identity-not-a-production-secret" };
}
function request(url: string, cookies: Record<string, string> = {}, body: unknown = {}, origin = "https://aoe2war.com") {
  return { nextUrl: new URL(url), headers: new Headers({ host: "aoe2war.com", origin }),
    cookies: { get: (name: string) => cookies[name] ? { value: cookies[name] } : undefined },
    json: async () => body,
  };
}
function callback(overrides: Record<string, string> = {}, browserState = state) {
  const callbackUrl = new URL("https://aoe2war.com/api/auth/steam");
  callbackUrl.searchParams.set("returnTo", "/players"); callbackUrl.searchParams.set("state", state);
  const nonce = new Date().toISOString().replace(/\.\d{3}Z$/, "Z") + "FixtureNonce" + require("node:crypto").randomUUID();
  const fields = {
    "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": "https://steamcommunity.com/openid/id/" + steamId,
    "openid.identity": "https://steamcommunity.com/openid/id/" + steamId,
    "openid.return_to": callbackUrl.toString(), "openid.response_nonce": nonce,
    "openid.assoc_handle": "fixture-association", "openid.sig": "fixture-provider-signature",
    "openid.signed": "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) callbackUrl.searchParams.set(key, value);
  return request(callbackUrl.toString(), { [cookieName]: browserState });
}
function steamModule(env = environment(), response = "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n") {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const auth = load("lib/productionAuth.ts", {}, env);
  const steam = load("lib/steamAuth.ts", { "@/lib/productionAuth": auth }, env, {
    fetch: async (url: string | URL, options: RequestInit) => {
      calls.push({ url: String(url), options });
      return new Response(String(url).includes("/profiles/") ? "<profile><steamID>Fixture Warrior</steamID></profile>" : response);
    },
  });
  return { steam, calls, auth };
}
function sessionModule(env = environment()) {
  return load("lib/session.ts", { jose, "@/lib/previewDataSource": { getPreviewIdentity: () => null } }, env);
}

test("Steam initiation pins production origin and binds an unpredictable secure browser state", async () => {
  const { steam } = steamModule();
  const a = steam.newSteamAuthState(); const b = steam.newSteamAuthState();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a, b);
  const req = request("https://aoe2war.com/api/auth/steam");
  req.headers.set("x-forwarded-host", "attacker.invalid"); req.headers.set("x-forwarded-proto", "http");
  const url = new URL(steam.buildSteamAuthUrl(req, "/players", a));
  assert.equal(url.origin, "https://steamcommunity.com");
  assert.equal(url.searchParams.get("openid.realm"), "https://aoe2war.com/");
  assert.equal(new URL(url.searchParams.get("openid.return_to")!).searchParams.get("state"), a);
  for (const bad of ["//attacker.invalid", "/\\attacker.invalid", "/%5cattacker.invalid", "/%0dfoo", "/x\nheader"]) {
    assert.equal(steam.sanitizeReturnTo(bad), "/");
  }
  assert.equal(steam.sanitizeReturnTo("/players?sort=rating"), "/players?sort=rating");
});

test("a provider-validated callback uses only bounded fixed-origin TLS POST", async () => {
  const { steam, calls } = steamModule();
  assert.equal(await steam.verifySteamCallback(callback()), steamId);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "https://steamcommunity.com/openid/login");
  assert.equal(calls[0].options.method, "POST"); assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.cache, "no-store"); assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(new URLSearchParams(String(calls[0].options.body)).get("openid.mode"), "check_authentication");
});

test("callback transplant, wrong identity/endpoint/return URL/unsigned fields and old nonce fail before network", async () => {
  const bad = [
    callback({}, "B".repeat(43)), callback({ "openid.identity": "https://steamcommunity.com/openid/id/76561198000000002" }),
    callback({ "openid.op_endpoint": "https://attacker.invalid/openid/login" }),
    callback({ "openid.return_to": "https://attacker.invalid/api/auth/steam" }),
    callback({ "openid.signed": "op_endpoint,identity,return_to,response_nonce,assoc_handle" }),
    callback({ "openid.response_nonce": "2000-01-01T00:00:00ZOldNonce" }),
  ];
  for (const req of bad) {
    const { steam, calls } = steamModule();
    await assert.rejects(steam.verifySteamCallback(req)); assert.equal(calls.length, 0);
  }
  const { steam, calls } = steamModule(); const duplicate = callback();
  duplicate.nextUrl.searchParams.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000002");
  await assert.rejects(steam.verifySteamCallback(duplicate)); assert.equal(calls.length, 0);
});

test("ambiguous, false or oversized Steam validation response cannot authenticate", async () => {
  for (const body of ["is_valid:false\n", "is_valid:true\nis_valid:false\n", "junk is_valid:true\n", "x".repeat(8193)]) {
    const { steam } = steamModule(environment(), body);
    await assert.rejects(steam.verifySteamCallback(callback()));
  }
});

test("production persona lookup stays on Steam Community even if an unrelated API key exists", async () => {
  const env = { ...environment(), STEAM_API_KEY: "test-unused-key" };
  const { steam, calls } = steamModule(env);
  const result = await steam.fetchSteamProfile(steamId);
  assert.equal(result.personaName, "Fixture Warrior");
  assert.equal(calls.length, 1); assert.equal(new URL(calls[0].url).hostname, "steamcommunity.com");
  assert.equal(calls[0].options.redirect, "error"); assert.ok(!calls[0].url.includes("test-unused-key"));
});

test("actual JOSE sessions require original identity and admin authority comes from DB", async () => {
  const env = environment(); const session = sessionModule(env); const token = await session.signSession("fixture-user");
  assert.equal((await session.verifySession(token)).uid, "fixture-user");
  const missing = { ...env }; delete (missing as Partial<typeof missing>).SESSION_SECRET;
  assert.equal(await sessionModule(missing).verifySession(token), null);
  assert.equal(await sessionModule({ ...env, SESSION_SECRET: "different-fixture-identity" }).verifySession(token), null);
  const forgedRoleToken = await new jose.SignJWT({ uid: "fixture-user", isAdmin: true }).setProtectedHeader({ alg: "HS256" })
    .setIssuer("aoe2hdbets").setExpirationTime("1h").sign(new TextEncoder().encode(env.SESSION_SECRET));
  let isAdmin = false;
  const admin = load("lib/adminSession.ts", {
    "next/headers": { cookies: async () => ({ get: () => ({ value: token }) }) },
    "next/navigation": { redirect: () => { throw new Error("fixture-redirect"); } },
    "next/server": { NextResponse: Reply }, "@/lib/session": session,
    "@/lib/productionAuth": { usesNonfinancialProductionAuth: () => true,
      readProductionUser: async () => ({ id: 1, uid: "fixture-user", isAdmin }) },
    "@/lib/prisma": { getPrisma: () => ({ user: { findUnique: async () => { throw new Error("NO_DIRECT_USER_SELECT"); } } }) },
  }, env);
  const anonymous = await admin.requireAdmin(request("https://aoe2war.com/api/admin/central-command"));
  assert.equal(anonymous.error.status, 401);
  const nonadmin = await admin.requireAdmin(request("https://aoe2war.com/api/admin/central-command", { aoe2hdbets_session: forgedRoleToken }));
  assert.equal(nonadmin.error.status, 403);
  isAdmin = true;
  assert.equal((await admin.requireAdmin(request("https://aoe2war.com/api/admin/central-command", { aoe2hdbets_session: token }))).user.isAdmin, true);
});

test("real session GET is SELECT-only and explicit authenticated POST cannot select another UID", async () => {
  const env = environment(); const session = sessionModule(env); const token = await session.signSession("fixture-user");
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const user = { id: 1, uid: "fixture-user", createdAt: new Date(), lastSeen: null, isAdmin: false };
  const prisma = { user: {
    findUnique: async () => { throw new Error("NO_DIRECT_USER_SELECT"); },
    update: async () => { throw new Error("GET_MUST_NOT_WRITE"); },
    create: async () => { throw new Error("PRODUCTION_MUST_NOT_CREATE_GUEST"); },
  }, $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?"); calls.push({ sql, values });
    return sql.includes("touch_session") ? [{ touched: true }] : [{ ...user, steamId, steamPersonaName: "Fixture Warrior", verificationLevel: 1, verificationMethod: "steam", verifiedAt: null }];
  } };
  const auth = load("lib/productionAuth.ts", {}, env);
  const route = load("app/api/auth/session/route.ts", {
    "next/server": { NextResponse: Reply }, "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/userDto": load("lib/userDto.ts", {}, env), "@/lib/previewDataSource": { getPreviewIdentity: () => null },
    "@/lib/session": session, "@/lib/productionAuth": auth,
    "@/lib/userOnlinePresence": { allowUserOnlineSession() {}, forceUserOnlineOffline() {} },
    "@/lib/livingKingdom/hub": { livingKingdomHub: { removeUser() {} } },
  }, env);
  const result = await route.GET(request("https://aoe2war.com/api/auth/session", { aoe2hdbets_session: token }));
  assert.equal(result.status, 200); assert.equal(result.body.user.uid, "fixture-user");
  assert.ok(calls.every((x) => /^\s*SELECT/.test(x.sql) && !x.sql.includes("touch_session")));
  assert.match(result.headers.get("cache-control")!, /private, no-store/);
  calls.length = 0;
  const foreign = await route.POST(request("https://aoe2war.com/api/auth/session", { aoe2hdbets_session: token }, {}, "https://attacker.invalid"));
  assert.equal(foreign.status, 403); assert.equal(calls.length, 0);
  const guest = await route.POST(request("https://aoe2war.com/api/auth/session"));
  assert.equal(guest.status, 401); assert.equal(calls.length, 0);
  const touched = await route.POST(request("https://aoe2war.com/api/auth/session", { aoe2hdbets_session: token }, { uid: "other-admin", isAdmin: true, email: "fixture@example.invalid" }));
  assert.equal(touched.status, 200);
  assert.deepEqual(calls.find((x) => x.sql.includes("touch_session"))!.values, ["fixture-user", "fixture@example.invalid"]);
});

test("Steam route HEAD cannot mutate; real GET initiation and verified callback use only scoped persistence", async () => {
  const env = environment(); const { steam, auth } = steamModule(env); const session = sessionModule(env);
  const persisted: unknown[][] = [];
  const route = load("app/api/auth/steam/route.ts", {
    "next/server": { NextResponse: Reply }, "@/lib/steamAuth": steam, "@/lib/session": session,
    "@/lib/productionAuth": auth, "@/lib/userOnlinePresence": { allowUserOnlineSession() {} },
    "@/lib/steamIdentity": { hydrateSteamIdentity: async () => { throw new Error("PRODUCTION_MUST_NOT_HYDRATE_WRITES"); } },
    "@/lib/prisma": { getPrisma: () => ({ $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(strings.join("?"), /aoe2war_auth_v1\.complete_steam_login/); persisted.push(values); return [{ uid: "fixture-user" }];
    } }) },
  }, env);
  assert.equal((await route.HEAD()).status, 405); assert.equal(persisted.length, 0);
  const initiation = await route.GET(request("https://aoe2war.com/api/auth/steam?returnTo=%2Fplayers"));
  const browserState = initiation.savedCookies.get(cookieName)!;
  assert.equal(browserState.httpOnly, true); assert.equal(browserState.secure, true);
  assert.equal(browserState.sameSite, "lax"); assert.equal(browserState.maxAge, 300);
  const accepted = await route.GET(callback());
  assert.equal(accepted.status, 307); assert.equal(accepted.headers.get("location"), "https://aoe2war.com/players");
  assert.equal(persisted.length, 1); assert.equal(persisted[0][0], steamId);
  const issued = accepted.savedCookies.get("aoe2hdbets_session")!;
  assert.equal((await session.verifySession(issued.value)).uid, "fixture-user");
  assert.equal(accepted.savedCookies.get(cookieName)!.maxAge, 0);
});


test("physical Steam OpenID failure logs only an allowlisted stage without identities or assertions", async () => {
  const env = environment(); const auth = load("lib/productionAuth.ts", {}, env);
  const warnings: string[] = [];
  const privateMessage = "PRIVATE_OPENID_ASSERTION_AND_STEAM_ID_" + steamId;
  const steam = load("lib/steamAuth.ts", { "@/lib/productionAuth": auth }, env, {
    console: { warn: (line: string) => warnings.push(line) },
    fetch: async () => { throw new Error(privateMessage); },
  });
  await assert.rejects(steam.verifySteamCallback(callback()), /PRIVATE_OPENID_ASSERTION/);
  assert.deepEqual(warnings, [
    "AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:provider_post",
    "AOE2WAR_NONFINANCIAL_OPENID_HOLD_CLASS:FETCH_UNCLASSIFIED",
  ]);
  assert.ok(!warnings.join("").includes(privateMessage));
  assert.ok(!warnings.join("").includes(steamId));
  warnings.length = 0;
  await assert.rejects(steam.verifySteamCallback(callback({}, "B".repeat(43))));
  assert.deepEqual(warnings, ["AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:assertion"]);
});

test("OpenID provider failures are classified with only finite labels, including nested guard and transport causes", () => {
  const env = environment(); const auth = load("lib/productionAuth.ts", {}, env);
  const steam = load("lib/steamAuth.ts", { "@/lib/productionAuth": auth }, env);
  const classifier = steam.classifySteamVerificationTransportFailure;
  assert.equal(classifier({ name: "TypeError", message: "fetch failed", cause: {
    name: "Error", message: "AOE2WAR_PRODUCTION_HOLD:NODE_EGRESS_DENIED; PRIVATE " + steamId,
    code: "EPERM", } }), "GUARD_NODE_EGRESS_DENIED");
  assert.equal(classifier({ name: "TypeError", message: "private", cause: {
    code: "ETIMEDOUT", message: "leak: " + steamId } }), "TRANSPORT_ETIMEDOUT");
  assert.equal(classifier({ name: "TypeError", message: "private", cause: {
    code: "EAI_AGAIN" } }), "TRANSPORT_EAI_AGAIN");
  assert.equal(classifier({ name: "TimeoutError", message: steamId }), "FETCH_TIMEOUT");
  assert.equal(classifier({ name: "TypeError", message: steamId }), "FETCH_TYPEERROR");
  assert.equal(classifier({ name: "Error", message: "AOE2WAR_PRODUCTION_HOLD:SECRET_" + steamId }), "GUARD_OTHER");
  assert.equal(classifier({ message: "PRIVATE: " + steamId, code: "sensitive-" + steamId }), "FETCH_UNCLASSIFIED");
  const warnings: string[] = [];
  const guarded = load("lib/steamAuth.ts", { "@/lib/productionAuth": auth }, env, {
    console: { warn: (line: string) => warnings.push(line) },
    fetch: async () => { throw Object.assign(new TypeError("PRIVATE provider token"), {
      cause: new Error("AOE2WAR_PRODUCTION_HOLD:STEAM_VERIFICATION_FORM_ONLY:" + steamId),
    }); },
  });
  return assert.rejects(guarded.verifySteamCallback(callback())).then(() => {
    assert.deepEqual(warnings, ["AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:provider_post",
      "AOE2WAR_NONFINANCIAL_OPENID_HOLD_CLASS:GUARD_STEAM_VERIFICATION_FORM_ONLY"]);
    assert.ok(!warnings.join("").includes(steamId));
    assert.ok(!warnings.join("").includes("PRIVATE"));
  });
});

test("production callback reports only exact Steam/DB stages with the public error unchanged", async () => {
  const env = environment(); const { steam, auth } = steamModule(env); const session = sessionModule(env);
  const warnings: string[] = [];
  const privateMessage = "SENSITIVE_DB_QUERY_AND_NONCE_" + steamId;
  const route = load("app/api/auth/steam/route.ts", {
    "next/server": { NextResponse: Reply }, "@/lib/steamAuth": steam,
    "@/lib/session": session, "@/lib/productionAuth": auth,
    "@/lib/userOnlinePresence": { allowUserOnlineSession() {} },
    "@/lib/steamIdentity": { hydrateSteamIdentity: async () => {} },
    "@/lib/prisma": { getPrisma: () => ({
      $queryRaw: async () => { throw new Error(privateMessage); },
    }) },
  }, env, { console: { warn: (line: string) => warnings.push(line) } });
  const response = await route.GET(callback());
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location")!, /auth=steam-error/);
  assert.match(response.headers.get("location")!, /detail=STEAM_SIGN_IN_FAILED/);
  assert.deepEqual(warnings, ["AOE2WAR_NONFINANCIAL_STEAM_CALLBACK_HOLD_STAGE:scoped_db_login"]);
  assert.ok(!warnings.join("").includes(privateMessage));
  assert.ok(!warnings.join("").includes(steamId));
  assert.equal(response.savedCookies.get(cookieName)!.maxAge, 0);
});

test("production Steam callback never echoes raw error details in its logs or redirect", () => {
  const route = source("app/api/auth/steam/route.ts");
  const steam = source("lib/steamAuth.ts");
  assert.ok(route.includes('console.warn("AOE2WAR_NONFINANCIAL_STEAM_CALLBACK_HOLD_STAGE:" + callbackStage)'));
  assert.ok(steam.includes('console.warn("AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:" + stage)'));
  assert.ok(steam.includes('console.warn("AOE2WAR_NONFINANCIAL_OPENID_HOLD_CLASS:" + classifySteamVerificationTransportFailure(error))'));
  assert.ok(!route.includes("console.warn(error)"));
  assert.ok(!steam.includes("console.warn(error)"));
  assert.ok(!route.includes("console.error(error)"));
  assert.ok(!steam.includes("console.error(error)"));
});


test("native PostgreSQL callback -> signed session GET -> token-free profile GET uses only exact SQL grants", {
  skip: !process.env.AOE2WAR_AUTH_PG_SOCKET,
}, async () => {
  const sql = (statement: string) => {
    const result = spawnSync(process.env.AOE2WAR_AUTH_PSQL!, ["-X", "-q", "-At", "-h", process.env.AOE2WAR_AUTH_PG_SOCKET!,
      "-U", "aoe2war_web_prod", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: statement, encoding: "utf8", env: { PATH: process.env.PATH, LC_ALL: "C" }, timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const prisma = {
    user: { findUnique: async () => { throw new Error("NO_DIRECT_USER_SELECT"); } },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      let statement = strings[0];
      values.forEach((value, i) => {
        statement += (value === null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'") + strings[i + 1];
      });
      const output = sql("SELECT row_to_json(t) FROM (" + statement + ") t;");
      return output ? output.split("\n").map((line) => {
        const row = JSON.parse(line);
        for (const key of ["createdAt", "lastSeen", "verifiedAt", "representedCountryUpdatedAt", "genderDivisionUpdatedAt"]) {
          if (row[key]) row[key] = new Date(row[key] + (row[key].endsWith("Z") ? "" : "Z"));
        }
        return row;
      }) : [];
    },
  };
  const env = environment(); const { steam, auth } = steamModule(env); const session = sessionModule(env);
  const common = { "next/server": { NextResponse: Reply }, "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/productionAuth": auth, "@/lib/session": session, "@/lib/userDto": load("lib/userDto.ts", {}, env) };
  const steamRoute = load("app/api/auth/steam/route.ts", { ...common, "@/lib/steamAuth": steam,
    "@/lib/userOnlinePresence": { allowUserOnlineSession() {} },
    "@/lib/steamIdentity": { hydrateSteamIdentity: async () => { throw new Error("NO_HYDRATE_WRITES"); } },
  }, env);
  const providerCallback = callback();
  const accepted = await steamRoute.GET(providerCallback);
  assert.equal(accepted.status, 307);
  const token = accepted.savedCookies.get("aoe2hdbets_session")?.value;
  assert.equal(typeof token, "string", "actual SQL callback must issue a signed fixture session");
  const uid = (await session.verifySession(token)).uid;
  const sessionRoute = load("app/api/auth/session/route.ts", { ...common,
    "@/lib/previewDataSource": { getPreviewIdentity: () => null },
    "@/lib/userOnlinePresence": { allowUserOnlineSession() {}, forceUserOnlineOffline() {} },
    "@/lib/livingKingdom/hub": { livingKingdomHub: { removeUser() {} } },
  }, env);
  const requestWithSession = request("https://aoe2war.com/api/auth/session", { aoe2hdbets_session: token });
  const observed = await sessionRoute.GET(requestWithSession);
  assert.equal(observed.status, 200); assert.equal(observed.body.uid, uid);
  assert.equal(observed.body.user.steamId, steamId);
  const expectedAdmin = process.env.AOE2WAR_AUTH_PG_EXPECT_ADMIN === "1";
  assert.equal(observed.body.user.isAdmin, expectedAdmin);
  assert.equal("token" in observed.body.user, false);
  const disallowed = () => { throw new Error("NO_FINANCE_OR_PRESENTATION_READ"); };
  const profileRoute = load("app/api/user/me/route.ts", { ...common,
    "@/lib/requestIdentity": { resolveRequestUid: session.getSessionUid },
    "@/lib/pendingWoloClaims": { loadPendingWoloClaimSummaryForUser: disallowed },
    "@/lib/woloBetSettlement": {}, "@/lib/champions/titles": { allChampionTitles: [] },
    "@/lib/managedMediaAssets": {}, "@/lib/trophies/service": { loadUserTrophyHoldings: disallowed },
  }, env);
  const profileResult = await profileRoute.GET(requestWithSession);
  assert.equal(profileResult.status, 200); assert.equal(profileResult.body.uid, uid);
  assert.equal(profileResult.body.steamId, steamId); assert.equal("token" in profileResult.body, false);
  assert.equal(profileResult.body.pendingClaimAmountWolo, null);
  assert.equal(profileResult.body.financialStatus, "unavailable");
  const admin = load("lib/adminSession.ts", { ...common,
    "next/headers": {}, "next/navigation": {},
  }, env);
  const gate = await admin.requireAdmin(requestWithSession);
  if (expectedAdmin) {
    assert.equal(gate.user.isAdmin, true);
    assert.equal(profileResult.body.verified, true);
    assert.equal(profileResult.body.walletAddress, "existing-public-wallet");
    assert.equal(profileResult.body.verificationLevel, 3);
    assert.equal(profileResult.body.verificationMethod, "watcher");
  } else {
    assert.equal(gate.error.status, 403);
  }
  assert.equal(sql("SELECT has_table_privilege(current_user,'public.users','SELECT');"), "f");
  const repeated = await steamRoute.GET(providerCallback);
  assert.equal(repeated.savedCookies.has("aoe2hdbets_session"), false, "consumed provider nonce cannot authenticate twice");
});
