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
// The approved appearance writer is a separate nonfinancial SCRAM-only
// daemon on one group-gated Unix socket. Never accept an arbitrary socket path.
const APPEARANCE_SOCKET = "/run/aoe2war-appearance-writer/appearance.sock";
// Separate, source-pinned nonfinancial signed-session text writer.
const SOCIAL_SOCKET = "/run/aoe2war-social-writer/social.sock";
// A separate root-owned monotonic witness. A Bridge source ACK never grants
// this private owner feedback socket or any destructive operation.
const TEACHING_WITNESS_SOCKET = "/run/aoe2war-storage-independent-tip/witness.sock";
const SOCIAL_ROUTES = new Set([
  "/api/social/clan-text", "/api/contact-emaren", "/api/lobby/chat",
]);
const SOCIAL_SERVICE_PATHS = new Set([
  "/v1/clan/text", "/v1/direct/text", "/v1/lobby/text",
]);
const APPEARANCE_ROUTES = new Set([
  "/api/admin/site-theme-campaign", "/api/user/theme-campaign-override",
]);
const APPEARANCE_SERVICE_PATHS = new Set(["/v1/admin", "/v1/personal"]);
function approvedAppearanceHeaders(h) {
  return h && typeof h === "object" && Object.keys(h).length === 4 &&
    h["Content-Type"] === "application/json" && h.Connection === "close" &&
    Number.isInteger(h["Content-Length"]) && h["Content-Length"] >= 2 &&
    h["Content-Length"] <= 4096 &&
    typeof h["x-appearance-signed-session"] === "string" &&
    h["x-appearance-signed-session"].length >= 32 &&
    h["x-appearance-signed-session"].length <= 4096;
}
function approvedAppearanceRequest(opts) {
  if (!opts || typeof opts !== "object") return false;
  return opts.socketPath === APPEARANCE_SOCKET &&
    APPEARANCE_SERVICE_PATHS.has(opts.path) && opts.method === "POST" &&
    opts.timeout === 2300 && !opts.host && !opts.hostname && !opts.port &&
    !opts.protocol && !opts.auth && approvedAppearanceHeaders(opts.headers);
}
function approvedSocialHeaders(h) {
  return h && typeof h === "object" && Object.keys(h).length === 4 &&
    h["Content-Type"] === "application/json" && h.Connection === "close" &&
    Number.isInteger(h["Content-Length"]) && h["Content-Length"] >= 2 &&
    h["Content-Length"] <= 4096 &&
    typeof h["x-social-signed-session"] === "string" &&
    h["x-social-signed-session"].length >= 32 &&
    h["x-social-signed-session"].length <= 4096;
}
function approvedSocialRequest(opts) {
  if (!opts || typeof opts !== "object") return false;
  return opts.socketPath === SOCIAL_SOCKET &&
    SOCIAL_SERVICE_PATHS.has(opts.path) && opts.method === "POST" &&
    opts.timeout === 2300 && !opts.host && !opts.hostname && !opts.port &&
    !opts.protocol && !opts.auth && approvedSocialHeaders(opts.headers);
}
function approvedTeachingWitnessHeaders(h) {
  return h && typeof h === "object" && Object.keys(h).length === 2 &&
    h["Content-Type"] === "application/json" &&
    Number.isInteger(h["Content-Length"]) && h["Content-Length"] >= 2 &&
    h["Content-Length"] <= 1024;
}
function approvedTeachingWitnessRequest(opts) {
  return teachingEnabled && opts && typeof opts === "object" &&
    opts.socketPath === TEACHING_WITNESS_SOCKET && opts.path === "/v1/witness" &&
    opts.method === "POST" && opts.timeout === 4000 &&
    !opts.host && !opts.hostname && !opts.port && !opts.protocol &&
    !opts.auth && approvedTeachingWitnessHeaders(opts.headers);
}
function hold(reason) { throw new Error("AOE2WAR_PRODUCTION_HOLD:" + reason); }
function need(ok, reason) { if (!ok) hold(reason); }
const required = Object.freeze({
  NODE_ENV: "production", WARGRAPH_RUNTIME_DISABLED: "true",
  AOE2WAR_RUNTIME_PROFILE: PROFILE, AOE2WAR_R25_ISOLATED_WEB: "true", AOE2WAR_PROD_DB_PREVIEW: "false",
  NODE_OPTIONS: "--require=" + GUARD, HOSTNAME: "127.0.0.1", PORT: "3032",
  USER: "aoe2war-web-prod", LOGNAME: "aoe2war-web-prod",
  AOE2_BACKEND_UPSTREAM: "http://127.0.0.1:3331",
  TRAFFIC_API_BASE: "http://127.0.0.1:3331",
  MANAGED_MEDIA_UPLOAD_DIR: "/run/aoe2war-public-media",
});
const allowed = new Set([...Object.keys(required), "DATABASE_URL", "SESSION_SECRET",
  "PATH", "HOME", "LANG", "LC_ALL", "TZ", "PWD", "SHELL", "TERM",
  "INVOCATION_ID", "JOURNAL_STREAM", "SYSTEMD_EXEC_PID", "NOTIFY_SOCKET",
  "WATCHDOG_PID", "WATCHDOG_USEC", "TMPDIR", "NEXT_TELEMETRY_DISABLED",
  "CACHE_DIRECTORY",
  // Source-pinned, nonfinancial Storage OS receipt reader only. No teaching
  // owner key, deletion signer, custody authority or arbitrary env suffix.
  "AOE2WAR_OS_STORE_DIR", "AOE2WAR_OS_BRIDGE_TOKEN",
  "AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HMAC_KEY",
  "AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY",
  // Independent owner teaching is OFF unless all six separately reviewed
  // settings are atomically enrolled. Never inherit Bridge approval.
  "AOE2WAR_STORAGE_TEACHING_OWNER_UID",
  "AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY",
  "AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET",
  "AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM",
  "AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM_SHA256",
  "AOE2WAR_STORAGE_TEACHING_TIP_PATH"]);
const storageKeys = [
  "AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HMAC_KEY",
  "AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY",
];
const storageEnv = ["AOE2WAR_OS_STORE_DIR", "AOE2WAR_OS_BRIDGE_TOKEN", ...storageKeys];
const storagePresent = storageEnv.filter(k => Object.prototype.hasOwnProperty.call(process.env, k));
if (storagePresent.length) {
  need(storagePresent.length === storageEnv.length, "STORAGE_PARTIAL_ENROLLMENT_DENIED");
  need(process.env.AOE2WAR_OS_STORE_DIR ===
    "/var/lib/aoe2war-storage-visual-web-v1",
    "STORAGE_STORE_EXACT_ROOT_REQUIRED");
  const token = process.env.AOE2WAR_OS_BRIDGE_TOKEN;
  need(typeof token === "string" && /^[A-Za-z0-9_+=/-]{32,256}$/.test(token),
    "STORAGE_BRIDGE_TOKEN_INVALID");
  const keys = storageKeys.map(k => process.env[k]);
  need(keys.every(k => typeof k === "string" && /^[a-f0-9]{64}$/.test(k)) &&
    new Set(keys).size === keys.length &&
    keys.every(k => k !== token), "STORAGE_SOURCE_KEY_SEGREGATION_REQUIRED");
}
const teachingEnv = [
  "AOE2WAR_STORAGE_TEACHING_OWNER_UID",
  "AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY",
  "AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET",
  "AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM",
  "AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM_SHA256",
  "AOE2WAR_STORAGE_TEACHING_TIP_PATH",
];
const teachingPresent = teachingEnv.filter(k => Object.prototype.hasOwnProperty.call(process.env,k));
if (teachingPresent.length) {
  need(teachingPresent.length === teachingEnv.length && storagePresent.length === storageEnv.length,
    "TEACHING_PARTIAL_OR_UNOBSERVED_SOURCE_DENIED");
  const ownerUid = process.env.AOE2WAR_STORAGE_TEACHING_OWNER_UID;
  need(typeof ownerUid === "string" && /^[A-Za-z0-9:_-]{1,100}$/.test(ownerUid),
    "TEACHING_OWNER_UID_INVALID");
  const hmac = process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY;
  need(typeof hmac === "string" && /^[a-f0-9]{64}$/.test(hmac) &&
       !storageKeys.some(k => process.env[k] === hmac) &&
       process.env.AOE2WAR_OS_BRIDGE_TOKEN !== hmac,
    "TEACHING_SEGREGATED_HMAC_REQUIRED");
  need(process.env.AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET === TEACHING_WITNESS_SOCKET &&
       process.env.AOE2WAR_STORAGE_TEACHING_TIP_PATH ===
          "/var/lib/aoe2war-storage-independent-tip/teaching-tip.json",
    "TEACHING_EXACT_WITNESS_AND_ROOT_TIP_REQUIRED");
  const pem = process.env.AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM;
  need(typeof pem === "string" && pem.startsWith("-----BEGIN PUBLIC KEY-----") &&
       pem.length >= 100 && pem.length <= 2048 &&
       /^[a-f0-9]{64}$/.test(process.env.AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM_SHA256 || ""),
    "TEACHING_PINNED_PUBLIC_WITNESS_REQUIRED");
}
const teachingEnabled = teachingPresent.length === teachingEnv.length;
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
    (["/api/health", "/api/chain-id"].includes(url.pathname) ||
      (method === "GET" && !init.body && !init.headers &&
        ["/api/projects/aoe2hdbets/public-audience-series",
         "/api/projects/aoe2hdbets/observed-daily-series",
         "/api/projects/aoe2hdbets/observed-browser-insights"].includes(url.pathname)));
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
  // Native Node22 http.request({socketPath}) supplies a nested connect
  // options array with host=localhost and port=80. These are *internal*
  // defaults, not a TCP destination. Permit only the exact signed-writer
  // request shape already constrained by the outer HTTP transport guard.
  // Node replaces the HTTP route path with the Unix socket path at connect.
  // Retain the exact socket, signed-session headers and bounded POST shape;
  // the outer HTTP request checks /v1/admin or /v1/personal separately.
  const nodeWriterConnect = opts.path === APPEARANCE_SOCKET &&
    opts.socketPath === APPEARANCE_SOCKET &&
    opts.host === "localhost" && opts.port === 80 && !opts.hostname &&
    !opts.protocol && !opts.auth && opts.method === "POST" &&
    opts.timeout === 2300 && approvedAppearanceHeaders(opts.headers);
  const nodeSocialConnect = opts.path === SOCIAL_SOCKET &&
    opts.socketPath === SOCIAL_SOCKET &&
    opts.host === "localhost" && opts.port === 80 && !opts.hostname &&
    !opts.protocol && !opts.auth && opts.method === "POST" &&
    opts.timeout === 2300 && approvedSocialHeaders(opts.headers);
  const nodeTeachingConnect = teachingEnabled &&
    opts.path === TEACHING_WITNESS_SOCKET && opts.socketPath === TEACHING_WITNESS_SOCKET &&
    opts.host === "localhost" && opts.port === 80 && !opts.hostname &&
    !opts.protocol && !opts.auth && opts.method === "POST" &&
    opts.timeout === 4000 && approvedTeachingWitnessHeaders(opts.headers);
  const exactWriterSocket = (opts.path === APPEARANCE_SOCKET &&
    !opts.host && !opts.hostname && !opts.port) || nodeWriterConnect ||
    nodeSocialConnect || nodeTeachingConnect;
  // Deliberately do not permit a bare {path:SOCIAL_SOCKET} connect:
  // the new Social lane requires the exact signed-session Node22 envelope.
  need(exactWriterSocket || (!opts.path &&
    ((host === "127.0.0.1" && [5432, 3331].includes(port)) ||
     (host === STEAM && port === 443 && this instanceof tls.TLSSocket))),
    "NODE_EGRESS_DENIED");
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
    const exactAppearance = api === http && approvedAppearanceRequest(opts);
    const exactSocial = api === http && approvedSocialRequest(opts);
    const exactTeachingTip = api === http && approvedTeachingWitnessRequest(opts);
    need(opts && (!opts.socketPath || exactAppearance || exactSocial || exactTeachingTip) &&
      !opts.auth && !opts.createConnection &&
      (!opts.agent || opts.agent === api.globalAgent), "CUSTOM_NETWORK_AGENT_DENIED");
    if (exactAppearance || exactSocial || exactTeachingTip) return original.apply(this, args);
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
    const appearanceWrite = request.method === "POST" &&
      APPEARANCE_ROUTES.has(path) &&
      typeof request.headers?.["content-type"] === "string" &&
      request.headers["content-type"].split(";", 1)[0].trim() === "application/json";
    const socialWrite = request.method === "POST" &&
      SOCIAL_ROUTES.has(path) &&
      typeof request.headers?.["content-type"] === "string" &&
      request.headers["content-type"].split(";", 1)[0].trim() === "application/json";
    // Storage ingest is the ONLY additionally permitted nonfinancial write.
    // Nginx MUST replace an external x-aoe2war-bridge-scope header with its
    // own storage_visual scope in an exact-route, POST-only proxy location.
    // This guard is not the signer: the route still authenticates the bridge
    // bearer and per-plane HMAC receipts, then emits a signed durable ACK.
    const bridgeLength = request.headers?.["content-length"];
    const bridgeToken = request.headers?.["x-aoe2war-os-key"];
    const storageVisualOnlyWrite =
      request.method === "POST" &&
      request.url === "/api/internal/aoe2war-os/bridge" &&
      request.socket?.remoteAddress === "127.0.0.1" &&
      request.headers?.host === "aoe2war.com" &&
      request.headers?.["x-forwarded-proto"] === "https" &&
      request.headers?.["x-aoe2war-bridge-scope"] === "storage_visual" &&
      typeof bridgeToken === "string" &&
      bridgeToken.length >= 32 && bridgeToken.length <= 256 &&
      typeof bridgeLength === "string" &&
      /^[1-9][0-9]{0,4}$/.test(bridgeLength) &&
      Number(bridgeLength) <= 49152 &&
      request.headers?.["transfer-encoding"] === undefined &&
      request.headers?.["content-type"] === "application/json";
    // Separate trusted Nginx path preserves the existing operator commands
    // and heartbeat without weakening storage_visual's signed-submission lane.
    // Nginx MUST overwrite the client-supplied scope on the exact control
    // endpoint; downstream route independently checks the bearer credential.
    const operatorBridgeWrite =
      request.method === "POST" &&
      request.url === "/api/internal/aoe2war-os/bridge" &&
      request.socket?.remoteAddress === "127.0.0.1" &&
      request.headers?.host === "aoe2war.com" &&
      request.headers?.["x-forwarded-proto"] === "https" &&
      request.headers?.["x-aoe2war-bridge-scope"] === "operator_control" &&
      typeof bridgeToken === "string" &&
      bridgeToken.length >= 32 && bridgeToken.length <= 256 &&
      typeof bridgeLength === "string" &&
      /^[1-9][0-9]{0,6}$/.test(bridgeLength) &&
      Number(bridgeLength) <= 262144 &&
      request.headers?.["transfer-encoding"] === undefined &&
      request.headers?.["content-type"] === "application/json";
    // Browser sessions remain authoritative in the original Next.js routes:
    // this guard only permits two exact, bounded, same-origin owner operations.
    // A Source/Bridge ACK is not a teaching-write or deletion permit.
    const ownerPostLimit = request.url === "/api/admin/storage-os/teaching" ? 1600 :
      request.url === "/api/admin/storage-os/dry-run" ? 512 : 0;
    const ownerLength = request.headers?.["content-length"];
    const ownerCookie = request.headers?.cookie;
    const ownerOnlyWrite = teachingEnabled && request.method === "POST" &&
      ownerPostLimit > 0 &&
      request.socket?.remoteAddress === "127.0.0.1" &&
      request.headers?.host === "aoe2war.com" &&
      request.headers?.["x-forwarded-proto"] === "https" &&
      request.headers?.origin === "https://aoe2war.com" &&
      request.headers?.["sec-fetch-site"] === "same-origin" &&
      typeof ownerCookie === "string" && ownerCookie.length > 0 &&
      ownerCookie.length <= 8192 &&
      typeof ownerLength === "string" && /^[1-9][0-9]{0,3}$/.test(ownerLength) &&
      Number(ownerLength) <= ownerPostLimit &&
      request.headers?.["transfer-encoding"] === undefined &&
      typeof request.headers?.["content-type"] === "string" &&
      request.headers["content-type"].split(";", 1)[0].trim() === "application/json";
    const safe = ["GET", "HEAD"].includes(request.method) ||
      (path === "/api/auth/session" && ["POST", "DELETE"].includes(request.method)) ||
      (path === "/api/user/ping" && request.method === "POST") ||
      appearanceWrite || socialWrite || storageVisualOnlyWrite ||
      operatorBridgeWrite || ownerOnlyWrite;
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
