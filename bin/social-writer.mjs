#!/usr/bin/env node
// Source-only P0 writer candidate. WE2 root/WE1 PG privilege review mandatory.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { verifySocialSignedSession } from "../lib/socialWriterSession.mjs";
import { executeSocialTextWrite } from "../lib/socialWriterCore.mjs";

const SOCKET = "/run/aoe2war-social-writer/social.sock";
const ROLE = "aoe2war_social_writer";
const MAX_BYTES = 4096;
const SESSION_MAX_BYTES = 4096;
function requireEnvironment() {
  if (process.env.NODE_ENV !== "production") throw new Error("SOCIAL_PRODUCTION_ONLY");
  const identity = os.userInfo();
  if (process.getuid() === 0 || process.getuid() === 990 ||
      identity.uid !== process.getuid() ||
      identity.username !== "aoe2war-social-writer")
    throw new Error("EXACT_DEDICATED_SOCIAL_OS_USER_REQUIRED");
  if (process.env.SOCIAL_WRITER_SOCKET && process.env.SOCIAL_WRITER_SOCKET !== SOCKET)
    throw new Error("EXACT_SOCIAL_SOCKET_REQUIRED");
  const raw = process.env.SOCIAL_WRITER_DATABASE_URL;
  if (!raw || raw === process.env.DATABASE_URL) throw new Error("SEPARATE_SOCIAL_DB_ROLE_REQUIRED");
  let url;
  try { url = new URL(raw); } catch { throw new Error("SOCIAL_DB_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || (url.port && url.port !== "5432") ||
      decodeURIComponent(url.username) !== ROLE ||
      url.pathname !== "/aoe2hd_db" || !url.password ||
      url.search || url.hash) throw new Error("SOCIAL_DATABASE_SCOPE_DENIED");
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SIGNED_SESSION_VERIFIER_REQUIRED");
  const dir = path.dirname(SOCKET);
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() ||
      (stat.mode & 0o022) !== 0) throw new Error("SOCIAL_SOCKET_PARENT_UNTRUSTED");
  if (fs.existsSync(SOCKET)) throw new Error("SOCIAL_SOCKET_ALREADY_EXISTS");
  return {raw, secret};
}
async function readBoundedJson(req) {
  const length = req.headers["content-length"];
  if (typeof length !== "string" || !/^\d+$/.test(length) ||
      Number(length) < 2 || Number(length) > MAX_BYTES) throw new Error("INVALID_LENGTH");
  const chunks=[];let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if (bytes>MAX_BYTES) throw new Error("OVERSIZE_SOCIAL_REQUEST");
    chunks.push(chunk);
  }
  if (bytes!==Number(length)) throw new Error("LENGTH_MISMATCH");
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
}
const {raw,secret} = requireEnvironment();
const pool = new pg.Pool({connectionString:raw,max:2,idleTimeoutMillis:1000,
  connectionTimeoutMillis:1400,query_timeout:1750,statement_timeout:1750,
  application_name:"aoe2war_social_text_writer"});
pool.on("error",()=>{});
const server = http.createServer(async(req,res)=>{
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options","nosniff");
  const finish=(status,body)=>{if(!res.writableEnded){res.writeHead(status);res.end(JSON.stringify(body));}};
  const scope=req.url==="/v1/clan/text"?"clan":req.url==="/v1/direct/text"?"direct":null;
  if(req.method!=="POST"||!scope){finish(404,{detail:"SOCIAL_ACTION_NOT_FOUND"});return;}
  if(req.headers["content-type"]!=="application/json"){finish(415,{detail:"JSON_ONLY"});return;}
  const token=req.headers["x-social-signed-session"];
  if(typeof token!=="string"||token.length<32||token.length>SESSION_MAX_BYTES){
    finish(401,{detail:"SIGNED_SESSION_REQUIRED"});return;
  }
  let input;
  try{input=await readBoundedJson(req);}catch{finish(400,{detail:"INVALID_SOCIAL_JSON"});return;}
  const result=await executeSocialTextWrite({
    pool,sessionToken:token,scope,input,
    verifySession:(t)=>verifySocialSignedSession(t,secret),
    onError:(code)=>process.stderr.write("SOCIAL_WRITER_FAIL_CLOSED code="+code+"\n"),
  });
  finish(result.status,result.body);
});
server.requestTimeout=5000;
server.headersTimeout=2500;
server.keepAliveTimeout=750;
server.maxRequestsPerSocket=20;
server.maxConnections=8;
process.umask(0o117);
server.listen(SOCKET,()=>{
  const stat=fs.lstatSync(SOCKET);
  if(!stat.isSocket()||(stat.mode&0o777)!==0o660){
    server.close();throw new Error("SOCIAL_SOCKET_NOT_RESTRICTED");
  }
  process.stdout.write("SOCIAL_TEXT_WRITER_READY\n");
});
let stopping=false;
const stop=()=>{
  if(stopping)return;stopping=true;
  server.close(async()=>{
    await pool.end();
    try{fs.unlinkSync(SOCKET);}catch{}
  });
};
process.once("SIGTERM",stop);process.once("SIGINT",stop);
