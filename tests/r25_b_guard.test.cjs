"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const GUARD_PATH = "/usr/local/lib/aoe2war-r25/r25_b_guard.cjs";
const raw = fs.readFileSync(path.join(__dirname, "../scripts/r25_b_guard.cjs"), "utf8");

function fixture(overrides = {}, uid = 17251) {
  const env = {
    NODE_ENV: "production",
    WARGRAPH_RUNTIME_DISABLED: "true",
    AOE2WAR_PROD_DB_PREVIEW: "true",
    AOE2WAR_R25_ISOLATED_WEB: "true",
    NODE_OPTIONS: "--require=" + GUARD_PATH,
    PORT: "3031", HOSTNAME: "127.0.0.1", USER: "aoe2war-r24-web",
    LOGNAME: "aoe2war-r24-web",
    DATABASE_URL: "postgresql://aoe2war_r25_web_ro:dummy@127.0.0.1:5432/aoe2war_test",
  };
  Object.assign(env, overrides);
  class Server extends EventEmitter {
    emit(event, ...args) {
      this.emitted = [...(this.emitted || []), event];
      return super.emit(event, ...args);
    }
  }
  class Socket {
    connect(...args) {
      this.connected = args;
      return this;
    }
  }
  const http = { Server };
  const https = { createServer: () => ({}) };
  const http2 = { createServer: () => ({}), createSecureServer: () => ({}) };
  const net = { Socket };
  const requireStub = name => {
    if (name === "node:http") return http;
    if (name === "node:https") return https;
    if (name === "node:http2") return http2;
    if (name === "node:net") return net;
    throw new Error("unexpected " + name);
  };
  requireStub.resolve = () => GUARD_PATH;
  const proc = { platform:"linux", getuid:()=>uid, geteuid:()=>uid, pid:42,
    env, stderr:{write() {}} };
  vm.runInNewContext(raw, {
    __filename:GUARD_PATH, require:requireStub, process:proc, URL, Buffer,
    Error, Set, Object, Number, JSON, String,
  }, {filename:GUARD_PATH, timeout:2000});
  return {http,https,http2,net,proc};
}
function req(f, method, url = "/api/challenges/reconcile") {
  let state={status:0,headers:{},body:null,passed:false};
  const response={
    writeHead(status, headers){state.status=status;state.headers=headers;},
    end(body){state.body=body||null;},
  };
  const server=new f.http.Server();
  server.on("request",()=>{state.passed=true;});
  server.emit("request",{method,url},response);
  return state;
}
test("positive: exact 3031 dedicated UID/URL/no secrets starts",()=>{
  const f=fixture();assert.equal(f.proc.env.NODE_OPTIONS,"--require="+GUARD_PATH);
});
test("startup denied when WarGraph tick not explicitly disabled",()=>{
  assert.throws(()=>fixture({WARGRAPH_RUNTIME_DISABLED:"false"}),/REQUIRED_ENV_WARGRAPH/);
});
test("startup denied when readonly preview not enabled",()=>{
  assert.throws(()=>fixture({AOE2WAR_PROD_DB_PREVIEW:"false"}),/REQUIRED_ENV_AOE2WAR_PROD_DB/);
});
test("startup denied when NODE_OPTIONS preloader altered",()=>{
  assert.throws(()=>fixture({NODE_OPTIONS:"--require=/tmp/fake.cjs"}),/REQUIRED_ENV_NODE_OPTIONS/);
});
test("startup denied for root",()=>{
  assert.throws(()=>fixture({},0),/DEDICATED_LINUX_NONROOT_UID_REQUIRED/);
});
test("startup denied for extra settlement/cron custody secret",()=>{
  assert.throws(()=>fixture({WOLO_SETTLEMENT_SIGNER_KEY:"not_a_real_key"}),/UNEXPECTED_ENV_KEY_NAMES/);
});
test("startup denied for writer-privileged DB principal",()=>{
  assert.throws(()=>fixture({DATABASE_URL:"postgresql://postgres:dummy@127.0.0.1:5432/db"}),/DEDICATED_DB_URL/);
});
test("startup denied for DB host outside loopback",()=>{
  assert.throws(()=>fixture({DATABASE_URL:"postgresql://aoe2war_r25_web_ro:dummy@10.0.0.1:5432/db"}),/DEDICATED_DB_URL/);
});
test("startup denied for arbitrary connection options",()=>{
  assert.throws(()=>fixture({DATABASE_URL:"postgresql://aoe2war_r25_web_ro:dummy@127.0.0.1:5432/db?options=-c"}),/DEDICATED_DB_URL/);
});
test("POST including Next Server Actions and localhost never reaches listener",()=>{
  const f=fixture();const r=req(f,"POST","/api/bets/stake-intents");
  assert.equal(r.status,405);assert.equal(r.passed,false);assert.equal(r.headers["X-AoE2WAR-R25-B-Guard"],"denied");
});
test("PUT/PATCH/DELETE/CONNECT/TRACE refused at dispatcher",()=>{
  const f=fixture();
  for(const verb of ["PUT","PATCH","DELETE","CONNECT","TRACE"]){
    const r=req(f,verb);assert.equal(r.status,405);assert.equal(r.passed,false);
  }
});
test("GET and HEAD reach Next listener with no extra method allow",()=>{
  const f=fixture();
  for(const verb of ["GET","HEAD"]){
    const r=req(f,verb,"/api/live-games");assert.equal(r.passed,true);
  }
});
test("native guard health is real Node PID and explicitly not DB proof",()=>{
  const f=fixture();const r=req(f,"GET","/__aoe2war_r25_b_isolation");
  const j=JSON.parse(r.body);
  assert.equal(r.status,200);assert.equal(j.pid,42);
  assert.equal(j.server_enforced_db_and_kernel_egress_proven,false);
});
test("guard health POST cannot reach health or Next",()=>{
  const r=req(fixture(),"POST","/__aoe2war_r25_b_isolation");
  assert.equal(r.status,405);assert.equal(r.passed,false);
});
test("WebSocket/HTTP upgrade and CONNECT socket forcibly destroyed",()=>{
  const f=fixture();const s=new f.http.Server();
  for(const verb of ["upgrade","connect"]){
    const socket={destroyed:false,destroy(){this.destroyed=true;}};
    s.emit(verb,{url:"/api/internal/"},socket);
    assert.equal(socket.destroyed,true);
  }
});
test("outbound 8092/8093 and backend 3330 refused even on localhost",()=>{
  const f=fixture();for(const port of [8092,8093,3330,3345]){
    assert.throws(()=>new f.net.Socket().connect(port,"127.0.0.1"),/NODE_OUTBOUND_EGRESS_DENIED/);
  }
});
test("PostgreSQL localhost egress allowed, all other host denied",()=>{
  const f=fixture(),s=new f.net.Socket();
  assert.equal(s.connect({port:5432,host:"127.0.0.1"}),s);
  assert.throws(()=>s.connect({port:5432,host:"evil.example"}),/NODE_OUTBOUND_EGRESS_DENIED/);
});
test("HTTPS/HTTP2 listener creation fails closed",()=>{
  const f=fixture();
  assert.throws(()=>f.https.createServer(),/UNREVIEWED_ALT_HTTP_LISTENER/);
  assert.throws(()=>f.http2.createServer(),/UNREVIEWED_ALT_HTTP_LISTENER/);
});
