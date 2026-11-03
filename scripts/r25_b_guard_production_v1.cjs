"use strict";
/* Explicit production profile. The UID993 preview guard remains immutable. */
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const dns = require("node:dns");
const fs = require("node:fs");
const GUARD = "/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs";
const PROFILE = "nonfinancial-production-v1";
const UID = 990;
const STEAM = "steamcommunity.com";
function hold(reason) { throw new Error("AOE2WAR_PRODUCTION_HOLD:" + reason); }
function need(ok, reason) { if (!ok) hold(reason); }
const required = Object.freeze({
  NODE_ENV: "production", WARGRAPH_RUNTIME_DISABLED: "true",
  AOE2WAR_RUNTIME_PROFILE: PROFILE, AOE2WAR_R25_ISOLATED_WEB: "true", AOE2WAR_PROD_DB_PREVIEW: "false",
  NODE_OPTIONS: "--require=" + GUARD, HOSTNAME: "127.0.0.1", PORT: "3032",
  USER: "aoe2war-web-prod", LOGNAME: "aoe2war-web-prod",
  AOE2_BACKEND_UPSTREAM: "http://127.0.0.1:3331",
});
const allowed = new Set([...Object.keys(required), "DATABASE_URL", "SESSION_SECRET",
  "PATH", "HOME", "LANG", "LC_ALL", "TZ", "PWD", "SHELL", "TERM",
  "INVOCATION_ID", "JOURNAL_STREAM", "SYSTEMD_EXEC_PID", "NOTIFY_SOCKET",
  "WATCHDOG_PID", "WATCHDOG_USEC", "TMPDIR", "NEXT_TELEMETRY_DISABLED",
  "CACHE_DIRECTORY"]);
need(process.platform === "linux" && process.getuid() === UID && process.geteuid() === UID,
  "EXACT_DEDICATED_UID_REQUIRED");
for (const [key, value] of Object.entries(required)) need(process.env[key] === value, "ENV_" + key);
need(Object.keys(process.env).every((key) => allowed.has(key)), "UNREVIEWED_ENVIRONMENT_KEY");
need(/^[A-Za-z0-9_./+=:-]{32,4096}$/.test(process.env.SESSION_SECRET || ""), "ORIGINAL_SESSION_IDENTITY_REQUIRED");
need(!process.env.CACHE_DIRECTORY || process.env.CACHE_DIRECTORY === "/var/cache/aoe2war-web-prod",
  "PRIVATE_CACHE_DIRECTORY_REQUIRED");
need(require.resolve(__filename) === GUARD, "CANONICAL_GUARD_PATH_REQUIRED");
let database;
try { database = new URL(process.env.DATABASE_URL); } catch { hold("DATABASE_URL_INVALID"); }
need(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname === "127.0.0.1" &&
  (!database.port || database.port === "5432") && decodeURIComponent(database.username) === "aoe2war_web_prod" &&
  database.password && database.pathname !== "/" && !database.search && !database.hash,
  "DEDICATED_AUTH_DATABASE_ROLE_REQUIRED");

const stage = process.cwd();
need(/^\/var\/lib\/aoe2war-web-prod-[a-f0-9]{12}$/.test(stage), "ROOT_SEALED_STAGE_REQUIRED");
function sealedIdentity(path, pattern) {
  const item = fs.lstatSync(stage + path);
  need(item.isFile() && item.uid === 0 && item.nlink === 1 && !(item.mode & 0o022) &&
    item.size > 0 && item.size < 256, "ROOT_SEALED_BUILD_IDENTITY_REQUIRED");
  const value = fs.readFileSync(stage + path, "utf8").trim();
  need(pattern.test(value), "BUILD_IDENTITY_FORMAT_REQUIRED");
  return value;
}
const SOURCE = sealedIdentity("/.aoe2war-source-sha", /^[a-f0-9]{40}$/);
const BUILD = sealedIdentity("/.next/BUILD_ID", /^[A-Za-z0-9_-]{8,128}$/);
need(stage.endsWith(SOURCE.slice(0, 12)), "SOURCE_STAGE_IDENTITY_REQUIRED");

function steamRequest(input, init = {}) {
  let url;
  try { url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url); }
  catch { hold("OUTBOUND_URL_INVALID"); }
  const method = String(init.method || input?.method || "GET").toUpperCase();
  need(url.protocol === "https:" && url.hostname === STEAM && (!url.port || url.port === "443") &&
    !url.username && !url.password && !url.hash, "ONLY_VALIDATED_STEAM_HTTPS");
  need(init.redirect === undefined || init.redirect === "error", "STEAM_REDIRECTS_DENIED");
  if (url.pathname === "/openid/login") {
    need(method === "POST" && !url.search, "STEAM_VERIFICATION_POST_ONLY");
    const body = init.body;
    need(typeof body === "string" && Buffer.byteLength(body) <= 32768, "STEAM_FORM_BODY_BOUND");
    const params = new URLSearchParams(body);
    need(params.get("openid.mode") === "check_authentication" &&
      [...params.keys()].every((key) => key.startsWith("openid.")), "STEAM_VERIFICATION_FORM_ONLY");
  } else {
    need(method === "GET" && /^\/profiles\/[0-9]{17}$/.test(url.pathname) && url.search === "?xml=1",
      "STEAM_PROFILE_GET_ONLY");
  }
  return url;
}
function readonlyBackend(input, init = {}) {
  let url;
  try { url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url); }
  catch { return false; }
  const method = String(init.method || input?.method || "GET").toUpperCase();
  return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "3331" &&
    !url.username && !url.password && !url.search && !url.hash && ["GET", "HEAD"].includes(method) &&
    ["/api/health", "/api/chain-id"].includes(url.pathname);
}
const fetchOriginal = globalThis.fetch;
globalThis.fetch = function (input, init = {}) {
  need(!init.dispatcher && !init.agent && !init.createConnection && !init.socketPath &&
    !init.proxy && !init.ca && !init.cert && !init.key && init.rejectUnauthorized !== false,
    "CUSTOM_FETCH_TRANSPORT_DENIED");
  if (!readonlyBackend(input, init)) steamRequest(input, init);
  return fetchOriginal.call(this, input, { ...init, redirect: "error" });
};

/* Native TLS and DNS checks supplement (never replace) the UID nft boundary. */
const tlsOriginal = tls.connect;
tls.connect = function (...args) {
  const opts = typeof args[0] === "object" && args[0] !== null ? args[0] :
    { ...(typeof args[2] === "object" ? args[2] : {}), port: args[0], host: args[1] };
  need((opts.host || opts.hostname) === STEAM && Number(opts.port || 443) === 443 &&
    opts.servername === STEAM && opts.rejectUnauthorized !== false &&
    (!opts.checkServerIdentity || opts.checkServerIdentity === tls.checkServerIdentity),
    "STEAM_CERTIFICATE_AND_SNI_REQUIRED");
  return tlsOriginal.apply(this, args);
};
const connectOriginal = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const opts = typeof first === "object" && first !== null ? first :
    { port: first, host: typeof normalized[1] === "string" ? normalized[1] : "localhost" };
  const host = opts.host || opts.hostname || "localhost";
  const port = Number(opts.port);
  need(!opts.path && ((host === "127.0.0.1" && [5432, 3331].includes(port)) ||
    (host === STEAM && port === 443 && this instanceof tls.TLSSocket)), "NODE_EGRESS_DENIED");
  return connectOriginal.apply(this, args);
};
for (const api of [dns, dns.promises]) {
  for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCname",
    "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
    if (typeof api[name] !== "function") continue;
    const original = api[name];
    api[name] = function (host, ...args) {
      need(host === STEAM || host === "127.0.0.1", "DNS_HOST_NOT_ALLOWLISTED");
      return original.call(this, host, ...args);
    };
  }
}
for (const api of [http, https]) {
  const original = api.request;
  api.request = function (...args) {
    const first = args[0];
    const opts = typeof first === "string" || first instanceof URL ?
      { ...(typeof args[1] === "object" ? args[1] : {}),
        hostname: new URL(first).hostname, port: new URL(first).port,
        path: new URL(first).pathname + new URL(first).search, protocol: new URL(first).protocol } : first;
    need(opts && !opts.socketPath && !opts.auth && !opts.createConnection &&
      (!opts.agent || opts.agent === api.globalAgent), "CUSTOM_NETWORK_AGENT_DENIED");
    const protocol = api === https ? "https:" : "http:";
    const host = opts.hostname || opts.host;
    const url = protocol + "//" + host + ":" + (opts.port || (api === https ? 443 : 80)) + (opts.path || "/");
    if (api === http) need(readonlyBackend(url, opts), "ONLY_READONLY_BACKEND_HTTP");
    else {
      /* OpenID uses fetch and a bounded complete form, not a streamed bypass. */
      need((opts.method || "GET").toUpperCase() === "GET", "RAW_HTTPS_POST_DENIED");
      steamRequest(url, opts);
      need(opts.rejectUnauthorized !== false && (!opts.servername || opts.servername === STEAM) &&
        (!opts.checkServerIdentity || opts.checkServerIdentity === tls.checkServerIdentity),
        "STEAM_HTTPS_TLS_OPTIONS_REQUIRED");
    }
    return original.apply(this, args);
  };
  api.get = function (...args) { const request = api.request(...args); request.end(); return request; };
}

const listenOriginal = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  const first = args[0];
  const opts = typeof first === "object" && first !== null ? first : { port: first, host: args[1] };
  need(!opts.path && Number(opts.port) === 3032 && opts.host === "127.0.0.1", "EXACT_LOOPBACK_LISTENER_REQUIRED");
  return listenOriginal.apply(this, args);
};

const emitOriginal = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === "upgrade" || event === "connect") { args[1]?.destroy?.(); return true; }
  if (event === "request") {
    const [request, response] = args;
    response.setHeader("X-AoE2WAR-Source", SOURCE);
    response.setHeader("X-AoE2WAR-Build-ID", BUILD);
    response.setHeader("X-AoE2WAR-Process", String(process.pid));
    const path = String(request.url || "").split("?", 1)[0];
    const safe = ["GET", "HEAD"].includes(request.method) ||
      (path === "/api/auth/session" && ["POST", "DELETE"].includes(request.method)) ||
      (path === "/api/user/ping" && request.method === "POST");
    if (!safe) {
      response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store", "Content-Length": "0" });
      response.end(); return true;
    }
    if (path === "/__aoe2war_production_guard" && ["GET", "HEAD"].includes(request.method)) {
      const body = JSON.stringify({ schema: "aoe2war.production.process-guard.v1", pid: process.pid, uid: UID, source_sha: SOURCE, build_id: BUILD,
        profile: PROFILE, financial_authorized: false, auth_writes_require_db_functions: true,
        kernel_and_postgres_proven: false });
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? "" : body); return true;
    }
  }
  return emitOriginal.call(this, event, ...args);
};
for (const api of [https, require("node:http2")]) {
  for (const name of ["createServer", "createSecureServer"]) {
    if (typeof api[name] === "function") api[name] = () => hold("ALTERNATE_LISTENER_DENIED");
  }
}
module.exports = Object.freeze({ steamRequest, readonlyBackend });
process.stderr.write("AOE2WAR_NONFINANCIAL_PRODUCTION_GUARD_ACTIVE pid=" + process.pid + "\n");
