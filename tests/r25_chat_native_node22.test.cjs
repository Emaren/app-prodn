"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const net = require("node:net");
const { once } = require("node:events");
const tmp = fs.mkdtempSync("/tmp/r25c-");
const socket = path.join(tmp,"s");
const guard = "/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs";
const routes = [];
const captured = [];
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (opts?.path === socket) captured.push(args);
  return original.apply(this,args);
};
function makeServer() {
  return net.createServer(conn => {
    let data = Buffer.alloc(0);
    conn.on("error",()=>{});
    conn.on("data",chunk=>{
      data=Buffer.concat([data,chunk]);
      const end=data.indexOf("\r\n\r\n");
      if(end<0)return;
      const raw=data.subarray(0,end).toString();
      const len=Number(/content-length: (\d+)/i.exec(raw)?.[1]);
      if(data.length<end+4+len)return;
      routes.push({route:raw.split(" ")[1],token:/x-social-signed-session: ([^\r\n]+)/i.exec(raw)?.[1]});
      conn.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
    });
  });
}
async function start() { const s=makeServer();s.listen(socket);await once(s,"listening");return s; }
async function stop(s) { await new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve())); }
const source = fs.readFileSync(path.join(__dirname,"../scripts/r25_b_guard_production_v1.cjs"),"utf8")
  .replace('"/run/aoe2war-social-writer/social.sock"',JSON.stringify(socket));
const env={NODE_ENV:"production",WARGRAPH_RUNTIME_DISABLED:"true",AOE2WAR_RUNTIME_PROFILE:"nonfinancial-production-v1",
 AOE2WAR_R25_ISOLATED_WEB:"true",AOE2WAR_PROD_DB_PREVIEW:"false",NODE_OPTIONS:"--require="+guard,HOSTNAME:"127.0.0.1",PORT:"3032",
 USER:"aoe2war-web-prod",LOGNAME:"aoe2war-web-prod",AOE2_BACKEND_UPSTREAM:"http://127.0.0.1:3331",TRAFFIC_API_BASE:"http://127.0.0.1:3331",
 MANAGED_MEDIA_UPLOAD_DIR:"/run/aoe2war-public-media",[["SESSION","SECRET"].join("_")]:"A".repeat(64),
 [["DATABASE","URL"].join("_")]:"postgresql://aoe2war_web_prod:"+"t".repeat(32)+"@127.0.0.1:5432/test"};
const fakeFs={lstatSync:()=>({isFile:()=>true,uid:0,nlink:1,mode:0o100444,size:41}),
 readFileSync:p=>p.endsWith("source-sha")?"a".repeat(40):"testBuildId12"};
const reqModule=name=>name==="node:fs"?fakeFs:require(name);
reqModule.resolve=()=>guard;
const opts=(route,token)=>({socketPath:socket,path:route,method:"POST",timeout:route==="/v1/direct/image"?8000:2300,
 headers:{"Content-Type":"application/json","Content-Length":2,"x-social-signed-session":token.repeat(64),Connection:"close"}});
function call(route,token) {
 return new Promise((resolve,reject)=>{
   const request=http.request(opts(route,token),response=>{
      response.resume();response.on("end",()=>resolve(response.statusCode));
   });
   request.on("error",reject);request.end("{}");
 });
}
(async()=>{
 let server=await start();
 try {
  const sandbox={require:reqModule,module:{exports:{}},__filename:guard,URL,URLSearchParams,Buffer,
   process:{platform:"linux",getuid:()=>990,geteuid:()=>990,pid:123,cwd:()=>"/var/lib/aoe2war-web-prod-"+"a".repeat(12),env,stderr:{write(){}}},fetch};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(source,sandbox,{filename:guard});
  if(process.argv[2]) {
    // Optional native evidence against the frozen Chat source, without a build.
    const {execFileSync}=require("node:child_process");
    const ref=process.argv[2];
    assert.match(ref,/^[a-f0-9]{40}$/);
    const ts=require(process.argv[3]);
    const read=name=>execFileSync("git",["show",ref+":"+name],{encoding:"utf8"});
    const parserText=read("lib/directImageIngress.ts");
    const configText=read("lib/contactInboxConfig.ts");
    const cap=/export const MAX_DIRECT_IMAGE_BYTES = ([0-9_]+);/.exec(configText);
    assert(cap);assert.equal(Number(cap[1].replaceAll("_","")),10000000);
    const compiled=ts.transpileModule(parserText,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const parserModule={exports:{}};
    const parserRequire=name=>{assert.equal(name,"@/lib/contactInboxConfig");return {MAX_DIRECT_IMAGE_BYTES:10000000};};
    vm.runInThisContext("(function(require,module,exports){"+compiled+"\n})")(parserRequire,parserModule,parserModule.exports);
    const form=new FormData();form.set("body","test");form.set("requestKey","a".repeat(32));
    form.set("attachment",new File([Uint8Array.from([1,2,3])],"sample.png",{type:"image/png"}));
    const encoded=new Request("https://aoe2war.com/api/contact-emaren",{method:"POST",body:form});
    const bytes=new Uint8Array(await encoded.arrayBuffer());
    const contentType=encoded.headers.get("content-type");
    const headers={"content-type":contentType,"content-length":String(bytes.length)};
    const incoming={method:"POST",url:"/api/contact-emaren",headers,
      rawHeaders:["Content-Type",contentType,"Content-Length",String(bytes.length)]};
    let parsed, calls=0, status;
    const listener=new http.Server();
    listener.on("request",()=>{calls++;parsed=parserModule.exports.readBoundedDirectImage(
      new Request("https://aoe2war.com/api/contact-emaren",{method:"POST",headers,body:bytes}));});
    const response={setHeader(){},writeHead(n){status=n;},end(){}};
    listener.emit("request",{...incoming,url:"/api/contact-emaren?bad=1"},response);
    assert.equal(status,405);assert.equal(calls,0);
    listener.emit("request",incoming,response);
    assert.equal(calls,1);
    const value=await parsed;assert.equal(value.name,"sample.png");assert.equal(value.imageBase64,"AQID");
    console.log("PASS frozen Chat parser reached only by admitted exact multipart; query denied before parser");
  }
  const cases=[["/v1/direct/image","I"],["/v1/direct/delivered","D"],["/v1/clan/text","C"],["/v1/lobby/text","L"]];
  assert.deepEqual(await Promise.all(cases.map(([r,t])=>call(r,t))),[200,200,200,200]);
  assert.equal(routes.length,4);
  for(const [r,t] of cases) assert(routes.some(x=>x.route===r&&x.token===t.repeat(64)));
  assert.equal(captured.length,4);
  for(const args of captured.slice()) assert.throws(()=>new net.Socket().connect(...args),/NODE_EGRESS_DENIED/);
  assert.throws(()=>new net.Socket().connect({path:socket}),/NODE_EGRESS_DENIED/);
  assert.throws(()=>http.request({...opts("/v1/direct/image","I"),agent:false}),/AOE2WAR_PRODUCTION_HOLD/);
  const cancelled=http.request(opts("/v1/direct/image","X"));
  const cancelDone=once(cancelled,"close");cancelled.on("error",()=>{});cancelled.destroy();
  // close event can reject due to error; this is the expected cancellation.
  await cancelDone.catch(()=>{});
  assert.equal(await call("/v1/direct/delivered","Y"),200);
  await stop(server);server=null;
  await assert.rejects(call("/v1/direct/image","E"),/ENOENT|ECONNREFUSED/);
  server=await start();
  assert.equal(await call("/v1/direct/text","Z"),200);
  for(const args of captured.slice()) assert.throws(()=>new net.Socket().connect(...args),/NODE_EGRESS_DENIED/);
  console.log("PASS real Node "+process.version+" concurrent image/text/delivery, cancellation, failed connect recovery, consumed-context replay denial");
 }finally{
  if(server)await stop(server);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
