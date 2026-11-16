#!/usr/bin/env node
// Reviewed source candidate only. This is NOT an installed systemd unit or a
// production DB migration. Root/B must separately admit UID/socket/SQL grants.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { jwtVerify } from "jose";
import { executeAppearanceAction } from "../lib/appearanceWriterCore.mjs";

const SOCKET = "/run/aoe2war-appearance-writer/appearance.sock";
const MAX_JSON_BYTES = 4096;
const MAX_SESSION_BYTES = 4096;
const USER = "aoe2war_appearance_writer";
function requireEnvironment() {
  if (process.env.NODE_ENV !== "production") throw new Error("WRITER_PRODUCTION_ONLY");
  if (process.env.APPEARANCE_WRITER_SOCKET !== undefined &&
      process.env.APPEARANCE_WRITER_SOCKET !== SOCKET) throw new Error("WRITER_SOCKET_PATH_MISMATCH");
  const raw = process.env.APPEARANCE_WRITER_DATABASE_URL;
  if (!raw || process.env.DATABASE_URL === raw) throw new Error("WRITER_DATABASE_CREDENTIAL_NOT_ISOLATED");
  let url;
  try { url = new URL(raw); } catch { throw new Error("WRITER_INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      decodeURIComponent(url.username) !== USER ||
      url.pathname !== "/aoe2hd_db") throw new Error("WRITER_DATABASE_SCOPE_DENIED");
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("WRITER_SIGNED_SESSION_KEY_REQUIRED");
  // Secrets never logged. The web service must not receive the separate writer URL.
  return { raw, secret };
}
async function requireSignedSession(token, secret) {
  const { payload, protectedHeader } = await jwtVerify(
    token, new TextEncoder().encode(secret),
    { issuer: "aoe2hdbets", algorithms: ["HS256"], clockTolerance: 0 }
  );
  const now = Math.floor(Date.now() / 1000);
  if (protectedHeader.alg !== "HS256" ||
      typeof payload.uid !== "string" || !payload.uid.trim() ||
      payload.uid.length > 100 || typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" || payload.iat > now + 1 ||
      payload.exp > payload.iat + 30 * 24 * 60 * 60 ||
      payload.exp <= now) throw new Error("INVALID_SIGNED_SESSION");
  return payload.uid;
}
async function readJson(req) {
  const length = Number(req.headers["content-length"]);
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) throw new Error("BODY_TOO_LARGE");
  let size = 0, text = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error("BODY_TOO_LARGE");
    text += chunk.toString("utf8");
  }
  return JSON.parse(text);
}
const { raw, secret } = requireEnvironment();
const dir = path.dirname(SOCKET);
const st = fs.lstatSync(dir);
// The service UID must own the directory; the web account UID990 must only
// have group-search permission and must never be able to replace the socket.
if (process.getuid?.() === 0 || process.getuid?.() === 990 ||
    !st.isDirectory() || st.isSymbolicLink() ||
    st.uid !== process.getuid?.() || (st.mode & 0o022) !== 0) {
  throw new Error("WRITER_SOCKET_DIRECTORY_NOT_TRUSTED");
}
if (fs.existsSync(SOCKET)) throw new Error("WRITER_SOCKET_ALREADY_EXISTS");
const pool = new pg.Pool({
  connectionString: raw,
  max: 2,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 1400,
  query_timeout: 1750,
  statement_timeout: 1750,
  application_name: "aoe2war_appearance_writer_nonfinancial",
});
pool.on("error", () => { /* Do not crash or log secret-bearing database errors. */ });
const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const finish = (status, body) => {
    if (res.writableEnded) return;
    res.writeHead(status);
    res.end(JSON.stringify(body));
  };
  const resource = req.url === "/v1/admin" ? "admin" :
                   req.url === "/v1/personal" ? "personal" : null;
  if (req.method !== "POST" || !resource) {
    finish(404, { detail: "NOT_FOUND" }); return;
  }
  if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    finish(415, { detail: "JSON_REQUIRED" }); return;
  }
  const token = req.headers["x-appearance-signed-session"];
  if (typeof token !== "string" || token.length > MAX_SESSION_BYTES) {
    finish(401, { detail: "SIGNED_SESSION_REQUIRED" }); return;
  }
  let action;
  try { action = await readJson(req); }
  catch { finish(400, { detail: "INVALID_APPEARANCE_JSON" }); return; }
  // Prevent someone from invoking the administrator action on the personal path.
  if ((resource === "admin") !== (action?.action !== "setPersonalOverride")) {
    finish(403, { detail: "WRONG_ACTION_ENDPOINT" }); return;
  }
  const result = await executeAppearanceAction({
    pool, action, token,
    verifySignedSession: t => requireSignedSession(t, secret),
  });
  finish(result.status, result.body);
});
server.requestTimeout = 5000;
server.headersTimeout = 2500;
server.keepAliveTimeout = 750;
server.maxRequestsPerSocket = 20;
server.maxConnections = 8;
// Root installs separately reviewed service directory and group; never create
// it from web source, chmod it broadly, or expose this process on TCP.
process.umask(0o117);
server.listen(SOCKET, () => {
  const mode = fs.statSync(SOCKET).mode & 0o777;
  if (mode !== 0o660) {
    server.close();
    throw new Error("WRITER_SOCKET_PERMISSIONS_WRONG");
  }
  // Deliberately no token, DB URL, or actual user identity in logs.
  process.stdout.write("APPEARANCE_WRITER_UNIX_SOCKET_READY\n");
});
const stop = () => {
  server.close(async () => {
    await pool.end();
    // The socket can be unlinked by its *owner* at orderly shutdown only.
    try { fs.unlinkSync(SOCKET); } catch { /* Root handles an unclean restart. */ }
  });
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
