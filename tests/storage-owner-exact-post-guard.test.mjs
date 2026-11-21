import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync("scripts/r25_b_guard_production_v1.cjs","utf8");
const nginx=readFileSync("deploy/aoe2war-storage-owner-exact-post.nginx.inc","utf8");
const dryRun=readFileSync("app/api/admin/storage-os/dry-run/route.ts","utf8");
const tip="/run/aoe2war-storage-independent-tip/witness.sock";
const envBase={
 NODE_ENV:"production",WARGRAPH_RUNTIME_DISABLED:"true",
 AOE2WAR_RUNTIME_PROFILE:"nonfinancial-production-v1",AOE2WAR_R25_ISOLATED_WEB:"true",
 AOE2WAR_PROD_DB_PREVIEW:"false",
 NODE_OPTIONS:"--require=/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs",
 HOSTNAME:"127.0.0.1",PORT:"3032",USER:"aoe2war-web-prod",LOGNAME:"aoe2war-web-prod",
 AOE2_BACKEND_UPSTREAM:"http://127.0.0.1:3331",TRAFFIC_API_BASE:"http://127.0.0.1:3331",
 MANAGED_MEDIA_UPLOAD_DIR:"/run/aoe2war-public-media",
 SESSION_SECRET:"A".repeat(64),
 DATABASE_URL:"postgresql://aoe2war_web_prod:"+ "t".repeat(32)+"@127.0.0.1:5432/test",
};
const bridge={
 AOE2WAR_OS_STORE_DIR:"/var/lib/aoe2war-storage-visual-web-v1",
 AOE2WAR_OS_BRIDGE_TOKEN:"B".repeat(64),
 AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:"a".repeat(64),
 AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY:"b".repeat(64),
 AOE2WAR_STORAGE_VISUAL_HMAC_KEY:"c".repeat(64),
 AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY:"d".repeat(64),
};
const owner={
 AOE2WAR_STORAGE_TEACHING_OWNER_UID:"76561198000000000",
 AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:"e".repeat(64),
 AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET:tip,
 AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM:"-----BEGIN PUBLIC KEY-----\n"+"A".repeat(120)+"\n-----END PUBLIC KEY-----\n",
 AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM_SHA256:"f".repeat(64),
 AOE2WAR_STORAGE_TEACHING_TIP_PATH:"/var/lib/aoe2war-storage-independent-tip/teaching-tip.json",
};
function harness(extra={}){
 class Server{emit(){return "passed";} listen(){return "listening";}}
 class Socket{connect(){return "connected";}}
 class TLSSocket extends Socket{}
 const http={Server,globalAgent:{},request(){return {end(){},once(){return this;}}}};
 const https={globalAgent:{},request(){return {end(){}}},createServer(){}};
 const net={Socket},tls={TLSSocket,connect(){return "tls";},checkServerIdentity(){}};
 const dns={promises:{}};
 for(const k of ["lookup","resolve","resolve4","resolve6","reverse"])dns[k]=dns.promises[k]=()=> "dns";
 const g="/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs";
 const modules={
  "node:http":http,"node:https":https,"node:net":net,"node:tls":tls,"node:dns":dns,
  "node:http2":{createServer(){},createSecureServer(){}},
  "node:fs":{lstatSync:()=>({isFile:()=>true,uid:0,nlink:1,mode:0o100444,size:41}),
   readFileSync:p=>p.endsWith("source-sha")?"a".repeat(40):"testBuildId12"},
 };
 const req=n=>modules[n];req.resolve=()=>g;
 const scope={
  require:req,module:{exports:{}},__filename:g,URL,URLSearchParams,Buffer,
  process:{platform:"linux",getuid:()=>990,geteuid:()=>990,pid:42,
   cwd:()=>"/var/lib/aoe2war-web-prod-"+"a".repeat(12),
   env:{...envBase,...extra},stderr:{write(){}}},
  fetch:(input,init)=>({input,init}),
 };
 scope.globalThis=scope;
 vm.runInNewContext(source,scope,{filename:g});
 let status=null;
 const response={
  setHeader(){},writeHead(code){status=code;},end(){},
 };
 const invoke=(changes={})=>{
  status=null;
  const request={method:"POST",url:"/api/admin/storage-os/teaching",
   socket:{remoteAddress:"127.0.0.1"},
   headers:{host:"aoe2war.com","x-forwarded-proto":"https",
    origin:"https://aoe2war.com","sec-fetch-site":"same-origin",
    cookie:"session=opaque","content-type":"application/json","content-length":"208"},
   ...changes};
  const result=new http.Server().emit("request",request,response);
  return {result,status};
 };
 return {http,net,invoke};
}
test("owner write and witness remain closed until independent six-field admission",()=>{
 const normal=harness(bridge);
 assert.equal(normal.invoke().status,405);
 assert.equal(normal.invoke({url:"/api/admin/storage-os/dry-run"}).status,405);
 assert.throws(()=>harness({...bridge,AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:"e".repeat(64)}),
   /TEACHING_PARTIAL_OR_UNOBSERVED_SOURCE_DENIED/);
 assert.throws(()=>harness({...bridge,...owner,
   AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:"c".repeat(64)}),
   /TEACHING_SEGREGATED_HMAC_REQUIRED/);
 assert.throws(()=>harness({...bridge,...owner,
   AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET:"/tmp/other.sock"}),
   /TEACHING_EXACT_WITNESS_AND_ROOT_TIP_REQUIRED/);
 assert.throws(()=>harness({...owner}),/TEACHING_PARTIAL_OR_UNOBSERVED_SOURCE_DENIED/);
});
test("only exact same-origin owner JSON routes pass guard for original account auth",()=>{
 const a=harness({...bridge,...owner});
 assert.equal(a.invoke().result,"passed");
 assert.equal(a.invoke({url:"/api/admin/storage-os/dry-run",
  headers:{host:"aoe2war.com","x-forwarded-proto":"https",origin:"https://aoe2war.com",
  "sec-fetch-site":"same-origin",cookie:"session=opaque",
  "content-type":"application/json","content-length":"480"}}).result,"passed");
 for(const bad of [
  {url:"/api/admin/storage-os/teaching?override=1"},
  {url:"/api/admin/storage-os/teaching/execute"},
  {url:"/api/admin/storage-os/delete"},
  {url:"/api/admin/storage-os/archive-preference"},
  {url:"/api/bets"},
  {method:"DELETE"},
  {method:"PUT"},
  {socket:{remoteAddress:"192.0.2.5"}},
  {headers:{host:"aoe2war.com","x-forwarded-proto":"https",origin:"https://evil.example",
   "sec-fetch-site":"cross-site",cookie:"session=opaque",
   "content-type":"application/json","content-length":"208"}},
  {headers:{host:"aoe2war.com","x-forwarded-proto":"https",origin:"https://aoe2war.com",
   "sec-fetch-site":"same-origin",cookie:"session=opaque",
   "content-type":"application/json","content-length":"1601"}},
  {headers:{host:"aoe2war.com","x-forwarded-proto":"https",origin:"https://aoe2war.com",
   "sec-fetch-site":"same-origin",cookie:"session=opaque",
   "content-type":"application/json","content-length":"208","transfer-encoding":"chunked"}},
 ]){
  assert.equal(a.invoke(bad).status,405,JSON.stringify(bad));
 }
});
test("one witness socket and exact v1 path only; no arbitrary AF_UNIX egress",()=>{
 const a=harness({...bridge,...owner});
 const headers={"Content-Type":"application/json","Content-Length":175};
 assert.equal(typeof a.http.request({socketPath:tip,path:"/v1/witness",method:"POST",
  headers,timeout:4000}).end,"function");
 assert.equal(new a.net.Socket().connect([{
  path:tip,socketPath:tip,host:"localhost",port:80,method:"POST",
  timeout:4000,headers},()=>{}]),"connected");
 for(const change of [
  {path:"/v1/delete"},{socketPath:"/tmp/unsafe.sock"},
  {method:"DELETE"},{timeout:30000},{headers:{...headers,"X-Signer":"fake"}},
 ]){
  assert.throws(()=>a.http.request({socketPath:tip,path:"/v1/witness",method:"POST",
   headers,timeout:4000,...change}),/AOE2WAR_PRODUCTION_HOLD/);
 }
 assert.throws(()=>new a.net.Socket().connect({path:tip}),/NODE_EGRESS_DENIED/);
 assert.throws(()=>harness(bridge).http.request({socketPath:tip,path:"/v1/witness",
  method:"POST",timeout:4000,headers}),/CUSTOM_NETWORK_AGENT_DENIED/);
});
test("exact nginx preserves original owner cookies and does not open generic API POST",()=>{
 assert.equal((nginx.match(/location = \/api\/admin\/storage-os\//g)||[]).length,2);
 assert.match(nginx,/location = \/api\/admin\/storage-os\/teaching/);
 assert.match(nginx,/location = \/api\/admin\/storage-os\/dry-run/);
 assert.equal((nginx.match(/proxy_set_header Cookie \$http_cookie;/g)||[]).length,2);
 assert.equal((nginx.match(/proxy_set_header X-Forwarded-Proto https;/g)||[]).length,2);
 assert.doesNotMatch(nginx,/^\\s*location \\^~ \\/api\\//m);
 assert.doesNotMatch(nginx,/proxy_pass http:\/\/127\.0\.0\.1:(?!3032)/);
 assert.match(dryRun,/const owner=teachingOwnerAccess\(admin\.user\.uid\)/);
 assert.match(dryRun,/if\(!owner\.mayRecord\)return hold\(403/);
 assert.match(dryRun,/INDIVIDUAL_TRANSPORT_ADOPTED/);
 assert.doesNotMatch(dryRun,/unlink|rmSync|deleteExecuted\s*:\s*true/);
});
