"use strict";
/*
 * R25 B source-compatible 3031 financial-isolation preloader.
 * Root-installed and SHA-pinned by C, loaded via NODE_OPTIONS before Next.
 * Does not grant DB/egress authority by itself. Root witness verifies PG+nft.
 */
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const GUARD_PATH = "/usr/local/lib/aoe2war-r25/r25_b_guard.cjs";
const EXPECTED_OPTIONS = "--require=" + GUARD_PATH;
const DB_USER = "aoe2war_r25_web_ro";
const REQUIRED = Object.freeze({
  NODE_ENV: "production",
  WARGRAPH_RUNTIME_DISABLED: "true",
  AOE2WAR_PROD_DB_PREVIEW: "true",
  AOE2WAR_R25_ISOLATED_WEB: "true",
  NODE_OPTIONS: EXPECTED_OPTIONS,
});
function hold(reason) {
  throw new Error("R25_B_STARTUP_HOLD:" + reason);
}
if (process.platform !== "linux" || typeof process.getuid !== "function" ||
    process.getuid() === 0 || process.geteuid() === 0) {
  hold("DEDICATED_LINUX_NONROOT_UID_REQUIRED");
}
for (const [key, expected] of Object.entries(REQUIRED)) {
  if (process.env[key] !== expected) hold("REQUIRED_ENV_" + key);
}
const ALLOWED_ENV = new Set([
  ...Object.keys(REQUIRED), "DATABASE_URL", "PATH", "HOME", "USER",
  "LOGNAME", "PWD", "SHELL", "LANG", "LC_ALL", "TZ", "TERM",
  "HOSTNAME", "PORT", "NEXT_TELEMETRY_DISABLED", "INVOCATION_ID",
  "JOURNAL_STREAM", "SYSTEMD_EXEC_PID", "NOTIFY_SOCKET", "WATCHDOG_PID",
  "WATCHDOG_USEC", "TMPDIR", "NPM_CONFIG_CACHE",
]);
const unexpected = Object.keys(process.env).filter((k) => !ALLOWED_ENV.has(k));
if (unexpected.length) hold("UNEXPECTED_ENV_KEY_NAMES:" + unexpected.sort().join(","));
if (process.env.PORT !== "3031" || process.env.HOSTNAME !== "127.0.0.1") {
  hold("ONLY_LOOPBACK_PORT_3031");
}
let db;
try { db = new URL(process.env.DATABASE_URL || ""); }
catch { hold("DB_URL_INVALID"); }
if (!["postgres:", "postgresql:"].includes(db.protocol) ||
    decodeURIComponent(db.username) !== DB_USER ||
    db.hostname !== "127.0.0.1" ||
    (db.port && db.port !== "5432") ||
    !db.password ||
    db.search !== "" || db.hash !== "" ||
    !db.pathname || db.pathname === "/") hold("DEDICATED_DB_URL_REQUIRED");
if (process.env.USER !== "aoe2war-r24-web" ||
    process.env.LOGNAME !== "aoe2war-r24-web") hold("DEDICATED_OS_USER_DECLARATION");
if (require.resolve(__filename) !== GUARD_PATH) hold("GUARD_CANONICAL_PATH_DRIFT");

/*
 * Deny unsafe methods at Node HTTP request dispatcher including localhost,
 * Next Server Actions, and backend rewrites. Not prependListener: that
 * would allow Next's other registered listener to execute on denied requests.
 */
const originalEmit = http.Server.prototype.emit;
const SAFE = new Set(["GET", "HEAD"]);
const HEALTH = "/__aoe2war_r25_b_isolation";
http.Server.prototype.emit = function (event, ...args) {
  if (event === "upgrade" || event === "connect") {
    const socket = args[1];
    if (socket && typeof socket.destroy === "function") socket.destroy();
    return true;
  }
  if (event === "request") {
    const [req, res] = args;
    if (!SAFE.has(req.method)) {
      res.writeHead(405, {
        "Allow": "GET, HEAD",
        "Cache-Control": "no-store",
        "X-AoE2WAR-R25-B-Guard": "denied",
        "Content-Length": "0",
      });
      res.end();
      return true;
    }
    if (req.url === HEALTH) {
      const payload = JSON.stringify({
        schema: "aoe2war.r25.b.process-guard.v1",
        pid: process.pid, uid: process.getuid(),
        wargraph_disabled: true,
        readonly_pg_pool: true,
        unsafe_http_denied: true,
        upgrade_denied: true,
        server_enforced_db_and_kernel_egress_proven: false,
      });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(payload),
      });
      if (req.method === "HEAD") res.end();
      else res.end(payload);
      return true;
    }
  }
  return originalEmit.call(this, event, ...args);
};

/*
 * Defense-in-depth: block Node net.connect except direct local PostgreSQL.
 * Native subprocesses and internal bindings can bypass JS. Kernel nft is
 * mandatory in addition to this guard.
 */
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = args[0];
  let host = "", port = 0;
  if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
    host = opts.host || opts.hostname || "localhost";
    port = Number(opts.port);
  } else if (typeof opts === "number") {
    port = opts;
    host = typeof args[1] === "string" ? args[1] : "localhost";
  } else if (typeof opts === "string") {
    hold("UNIX_OR_ARBITRARY_EGRESS_DENIED");
  }
  if (!(port === 5432 && host === "127.0.0.1")) {
    hold("NODE_OUTBOUND_EGRESS_DENIED");
  }
  return originalConnect.apply(this, args);
};
for (const api of [https, require("node:http2")]) {
  for (const name of ["createServer", "createSecureServer"]) {
    if (typeof api[name] === "function") {
      api[name] = () => hold("UNREVIEWED_ALT_HTTP_LISTENER");
    }
  }
}
process.stderr.write("R25_B_3031_GUARD_ACTIVE pid=" + process.pid + "\n");
