"""Native Node evaluates the actual preloader against isolated transport doubles."""
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class ProductionGuard(unittest.TestCase):
    def test_actual_preloader_transport_and_http_boundaries(self):
        script = r'''
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const guard='/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs';
const source=fs.readFileSync(process.argv[1],'utf8');
const env={NODE_ENV:'production',WARGRAPH_RUNTIME_DISABLED:'true',AOE2WAR_RUNTIME_PROFILE:'nonfinancial-production-v1',
 AOE2WAR_R25_ISOLATED_WEB:'true',AOE2WAR_PROD_DB_PREVIEW:'false',NODE_OPTIONS:'--require='+guard,HOSTNAME:'127.0.0.1',PORT:'3032',
 USER:'aoe2war-web-prod',LOGNAME:'aoe2war-web-prod',AOE2_BACKEND_UPSTREAM:'http://127.0.0.1:3331',TRAFFIC_API_BASE:'http://127.0.0.1:3331',
 MANAGED_MEDIA_UPLOAD_DIR:'/run/aoe2war-public-media',
 [['SESSION','SECRET'].join('_')]:'A'.repeat(64),[['DATABASE','URL'].join('_')]:('postgresql://' + 'aoe2war_web_prod:' + 't'.repeat(32) + '@127.0.0.1:5432/test')};
function setup(changes={}) {
 class Server {emit(){return 'passed';} listen(){return 'listening';}}
 class Socket {connect(){return 'connected';}}
 class TLSSocket extends Socket {}
 const http={Server,request(){return{end(){},once(){return this;}}},globalAgent:{}};
 const https={request(){return{end(){}}},globalAgent:{},createServer(){}};
 const tls={TLSSocket,connect(){return 'tls';},checkServerIdentity(){}};
 const net={Socket};const dns={promises:{}};
 for(const name of ['lookup','resolve','resolve4','resolve6','reverse']){dns[name]=dns.promises[name]=()=> 'dns';}
 const modules={'node:http':http,'node:https':https,'node:tls':tls,'node:net':net,'node:dns':dns,'node:http2':{createServer(){},createSecureServer(){}},'node:fs':{lstatSync:()=>({isFile:()=>true,uid:0,nlink:1,mode:0o100444,size:41}),readFileSync:(path)=>path.endsWith('source-sha')?'a'.repeat(40):'testBuildId12'}};
 const req=(name)=>modules[name];req.resolve=()=>guard;
 const scope={require:req,module:{exports:{}},__filename:guard,URL,URLSearchParams,Buffer,
  process:{platform:'linux',getuid:()=>990,geteuid:()=>990,pid:123,cwd:()=>'/var/lib/aoe2war-web-prod-'+ 'a'.repeat(12),env:{...env,...changes},stderr:{write(){}}},
  fetch:(input,init)=>({input,init})};scope.globalThis=scope;
 vm.runInNewContext(source,scope,{filename:guard});return{scope,http,https,tls,net,dns};
}
const {scope,http,https,tls,net,dns}=setup();
assert.equal(scope.fetch('https://steamcommunity.com/openid/login',{method:'POST',body:'openid.mode=check_authentication'}).init.redirect,'error');
assert.equal(scope.fetch('https://steamcommunity.com/profiles/76561198000000000?xml=1').init.redirect,'error');
assert.equal(scope.fetch('http://127.0.0.1:3331/api/health').init.redirect,'error');
assert.equal(scope.fetch('http://127.0.0.1:3331/api/projects/aoe2hdbets/public-audience-series').init.redirect,'error');
for (const [url,init] of [
 ['https://example.com/',{}],['https://steamcommunity.com/openid/login',{}],
 ['https://steamcommunity.com/openid/login',{method:'POST',body:'openid.mode=check_authentication&evil=1'}],
 ['https://steamcommunity.com/openid/login',{method:'POST',body:'openid.mode=check_authentication',redirect:'follow'}],
 ['http://127.0.0.1:3330/api/health',{}],['http://127.0.0.1:3331/api/parse_replay',{}],
 ['http://127.0.0.1:3345/api/projects/aoe2hdbets/public-audience-series',{}],
 ['http://127.0.0.1:3331/api/projects/aoe2hdbets/public-audience-series',{method:'POST'}],
 ['http://127.0.0.1:3331/api/health',{method:'POST'}],['https://steamcommunity.com/profiles/76561198000000000?xml=1',{dispatcher:{}}]
])assert.throws(()=>scope.fetch(url,init),/AOE2WAR_PRODUCTION_HOLD/);
assert.equal(new http.Server().listen({port:3032,host:'127.0.0.1'}),'listening');
for (const opts of [{port:3032,host:'0.0.0.0'},{port:3030,host:'127.0.0.1'},{path:'/tmp/bypass'}])
 assert.throws(()=>new http.Server().listen(opts),/EXACT_LOOPBACK_LISTENER/);
assert.equal(new net.Socket().connect({host:'127.0.0.1',port:5432}),'connected');
assert.throws(()=>new net.Socket().connect({host:'127.0.0.1',port:8092}),/NODE_EGRESS_DENIED/);
assert.throws(()=>new net.Socket().connect({path:'/run/postgresql/.s.PGSQL.5432'}),/NODE_EGRESS_DENIED/);
assert.equal(tls.connect({host:'steamcommunity.com',port:443,servername:'steamcommunity.com'}),'tls');
assert.throws(()=>tls.connect({host:'steamcommunity.com',port:443,servername:'wrong.example'}),/SNI_REQUIRED/);
assert.throws(()=>tls.connect({host:'steamcommunity.com',port:443,servername:'steamcommunity.com',rejectUnauthorized:false}),/SNI_REQUIRED/);
assert.equal(dns.lookup('steamcommunity.com'),'dns');assert.throws(()=>dns.lookup('evil.example'),/DNS_HOST/);
let status;const response={headers:{},setHeader(name,value){this.headers[name]=value;},writeHead(s){status=s;},end(){}};
assert.equal(new http.Server().emit('request',{method:'POST',url:'/api/bets'},response),true);assert.equal(status,405);assert.equal(response.headers['X-AoE2WAR-Source'],'a'.repeat(40));assert.equal(response.headers['X-AoE2WAR-Build-ID'],'testBuildId12');assert.equal(response.headers['X-AoE2WAR-Process'],'123');
assert.equal(new http.Server().emit('request',{method:'POST',url:'/api/auth/session'},response),'passed');
assert.equal(new http.Server().emit('request',{method:'DELETE',url:'/api/auth/session'},response),'passed');
assert.equal(new http.Server().emit('request',{method:'POST',url:'/api/user/ping'},response),'passed');

// WE2 STORAGE ONLY: exact trusted proxy shape, never a general write bypass.
const storageOnly={
 method:'POST',url:'/api/internal/aoe2war-os/bridge',
 socket:{remoteAddress:'127.0.0.1'},
 headers:{host:'aoe2war.com','x-forwarded-proto':'https',
  'x-aoe2war-bridge-scope':'storage_visual','x-aoe2war-os-key':'t'.repeat(64),
  'content-type':'application/json','content-length':'258'}
};
assert.equal(new http.Server().emit('request',storageOnly,response),'passed');
for(const changes of [
 {url:'/api/internal/aoe2war-os/bridge?op=queue_finish'},
 {url:'/api/internal/aoe2war-os/bridge/claim'},
 {url:'/api/admin/storage-os/teaching'},
 {url:'/api/wolo/settle'},
 {method:'PUT'},
 {socket:{remoteAddress:'10.0.0.7'}},
 {headers:{...storageOnly.headers,'x-aoe2war-bridge-scope':'queue_finish'}},
 {headers:{...storageOnly.headers,'x-aoe2war-os-key':''}},
 {headers:{...storageOnly.headers,'content-type':'text/plain'}},
 {headers:{...storageOnly.headers,'content-length':'49153'}},
 {headers:{...storageOnly.headers,'content-length':'NaN'}},
 {headers:{...storageOnly.headers,'transfer-encoding':'chunked'}},
 {headers:{...storageOnly.headers,host:'other.example'}},
 {headers:{...storageOnly.headers,'x-forwarded-proto':'http'}},
]) {
 assert.equal(new http.Server().emit('request',{...storageOnly,...changes},response),true);
 assert.equal(status,405);
}
// The live #1424 Social guard MUST survive the scoped Storage addition.
for (const path of ['/api/social/clan-text','/api/contact-emaren','/api/lobby/chat']) {
 assert.equal(new http.Server().emit('request',{
  method:'POST',url:path,headers:{'content-type':'application/json'}
 },response),'passed');
 for (const bad of [
  {method:'POST',url:path+'?op=complete',headers:{'content-type':'text/plain'}},
  {method:'POST',url:path+'/unapproved',headers:{'content-type':'application/json'}},
  {method:'PUT',url:path,headers:{'content-type':'application/json'}}
 ]) {
  assert.equal(new http.Server().emit('request',bad,response),true);
  assert.equal(status,405);
 }
}
const socialSocket='/run/aoe2war-social-writer/social.sock';
const socialHeaders={
 'Content-Type':'application/json','Content-Length':23,
 'x-social-signed-session':'S'.repeat(64),'Connection':'close'
};
assert.equal(typeof http.request({
 socketPath:socialSocket,path:'/v1/lobby/text',method:'POST',
 timeout:2300,headers:socialHeaders
}).end,'function');
assert.equal(typeof http.request({
 socketPath:socialSocket,path:'/v1/direct/text',method:'POST',
 timeout:2300,headers:socialHeaders
}).end,'function');
assert.throws(()=>http.request({
 socketPath:socialSocket,path:'/v1/custody',method:'POST',
 timeout:2300,headers:socialHeaders
}),/AOE2WAR_PRODUCTION_HOLD/);
// Owner teaching POST requires separate independent tip-anchor admission.
assert.equal(new http.Server().emit('request',{
 method:'POST',url:'/api/admin/storage-os/teaching',
 headers:{'content-type':'application/json'}
},response),true);
assert.equal(status,405);

// Ember appearance writer remains separately constrained.
for (const url of ['/api/admin/site-theme-campaign','/api/user/theme-campaign-override']) {
 assert.equal(new http.Server().emit('request',{method:'POST',url,
   headers:{'content-type':'application/json'}},response),'passed');
 for (const bad of [
  {method:'POST',url,headers:{'content-type':'text/plain'}},
  {method:'PUT',url,headers:{'content-type':'application/json'}},
  {method:'DELETE',url,headers:{'content-type':'application/json'}}
 ]) {
  assert.equal(new http.Server().emit('request',bad,response),true);
  assert.equal(status,405);
 }
}
for (const url of ['/api/admin/site-theme-campaign/extra','/api/bets','/api/wolo/transfer',
 '/api/admin/ai-agents','/api/user/theme-campaign-override/extra']) {
 assert.equal(new http.Server().emit('request',{method:'POST',url,
  headers:{'content-type':'application/json'}},response),true);
 assert.equal(status,405);
}
const socket='/run/aoe2war-appearance-writer/appearance.sock';
const valid={
 socketPath:socket,path:'/v1/admin',method:'POST',timeout:2300,
 headers:{'Content-Type':'application/json','Content-Length':23,
  'x-appearance-signed-session':'S'.repeat(64),'Connection':'close'}
};
assert.equal(typeof http.request(valid).end,'function');
assert.equal(typeof http.request({...valid,path:'/v1/personal'}).end,'function');
assert.equal(new net.Socket().connect({path:socket}),'connected');
// Regression: genuine Node v22 http.request(socketPath) invokes net.connect
// with an Array-wrapped object containing localhost:80 internal defaults.
const node22Internal={
 ...valid, path:socket, host:'localhost', port:80,
 keepAlive:true, scheduling:'lifo', noDelay:true,
};
assert.equal(scope.approvedAppearanceHeaders(node22Internal.headers),true);
assert.equal(new net.Socket().connect([node22Internal,()=>{}]),'connected');
for (const changes of [
 {path:'/tmp/evil'}, {socketPath:'/tmp/evil'}, {method:'GET'},
 {host:'evil.example'}, {port:8092}, {timeout:0},
 {headers:{...valid.headers,'x-extra':'forbidden'}},
 {headers:{...valid.headers,'x-appearance-signed-session':''}},
]) assert.throws(()=>new net.Socket().connect([{...node22Internal,...changes},()=>{}]),/NODE_EGRESS_DENIED/);
for (const changes of [
 {path:'/api/bets'}, {path:'/v1/admin?xx=1'}, {socketPath:'/tmp/appearance.sock'},
 {method:'GET'}, {timeout:90000}, {host:'127.0.0.1'}, {port:5432},
 {agent:{}}, {auth:'user:pass'},
 {headers:{...valid.headers,'x-extra':'anything'}},
 {headers:{...valid.headers,'Content-Length':8192}},
 {headers:{...valid.headers,'x-appearance-signed-session':''}},
 {headers:{...valid.headers,'Content-Type':'text/plain'}}
]) {
 assert.throws(()=>http.request({...valid,...changes}),/AOE2WAR_PRODUCTION_HOLD/);
}
for (const candidate of [
 {path:'/run/postgresql/.s.PGSQL.5432'}, {path:'/tmp/other'},
 {path:socket,port:5432},{path:socket,host:'localhost'},
 {host:'127.0.0.1',port:8092}
]) assert.throws(()=>new net.Socket().connect(candidate),/NODE_EGRESS_DENIED/);
assert.throws(()=>https.request(valid),/CUSTOM_NETWORK_AGENT_DENIED/);
assert.throws(()=>http.request({hostname:'127.0.0.1',port:8092,
 path:'/api/bets',method:'POST'}),/ONLY_READONLY_BACKEND_HTTP/);

assert.throws(()=>setup({AOE2WAR_R25_ISOLATED_WEB:undefined}),/ENV_AOE2WAR_R25_ISOLATED_WEB/);
assert.throws(()=>setup({MANAGED_MEDIA_UPLOAD_DIR:undefined}),/ENV_MANAGED_MEDIA_UPLOAD_DIR/);
assert.throws(()=>setup({MANAGED_MEDIA_UPLOAD_DIR:'/mnt/private'}),/ENV_MANAGED_MEDIA_UPLOAD_DIR/);
assert.throws(()=>setup({WOLO_SIGNER_KEY:'never-imported'}),/UNREVIEWED_ENVIRONMENT/);
// Storage source signer material is accepted only as a complete, isolated,
// exact root enrollment. Never add teaching/custody/delete privileges.
const storageVars={
 AOE2WAR_OS_STORE_DIR:'/var/lib/aoe2war-storage-visual-web-v1',
 AOE2WAR_OS_BRIDGE_TOKEN:'B'.repeat(64),
 AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:'a'.repeat(64),
 AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY:'b'.repeat(64),
 AOE2WAR_STORAGE_VISUAL_HMAC_KEY:'c'.repeat(64),
 AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY:'d'.repeat(64)
};
assert.equal(typeof setup(storageVars).http.Server,'function');
for(const changes of [
 {AOE2WAR_OS_STORE_DIR:undefined},
 {AOE2WAR_OS_STORE_DIR:'/tmp/alternate'},
 {AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:undefined},
 {AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:'SHORT'},
 {AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:'b'.repeat(64)},
 {AOE2WAR_STORAGE_VISUAL_HMAC_KEY:'d'.repeat(64)},
 {AOE2WAR_OS_BRIDGE_TOKEN:'a'.repeat(64)},
 {AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:'f'.repeat(64)},
 {FINANCIAL_SIGNER_KEY:'f'.repeat(64)}
])assert.throws(()=>setup({...storageVars,...changes}),/AOE2WAR_PRODUCTION_HOLD/);
assert.throws(()=>setup({
 AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:'a'.repeat(64)
}),/STORAGE_PARTIAL_ENROLLMENT_DENIED/);
console.log('PASS:actual_preloader_transport_and_http_boundaries');
'''
        result=subprocess.run(["node","-e",script,str(ROOT/"scripts/r25_b_guard_production_v1.cjs")],capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("PASS:actual_preloader",result.stdout)

if __name__ == '__main__': unittest.main()
