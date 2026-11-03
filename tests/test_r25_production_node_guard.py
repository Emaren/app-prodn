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
 [['SESSION','SECRET'].join('_')]:'A'.repeat(64),[['DATABASE','URL'].join('_')]:('postgresql://' + 'aoe2war_web_prod:' + 't'.repeat(32) + '@127.0.0.1:5432/test')};
function setup(changes={}) {
 class Server {emit(){return 'passed';} listen(){return 'listening';}}
 class Socket {connect(){return 'connected';}}
 class TLSSocket extends Socket {}
 const http={Server,request(){return{end(){}}},globalAgent:{}};
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
assert.throws(()=>setup({AOE2WAR_R25_ISOLATED_WEB:undefined}),/ENV_AOE2WAR_R25_ISOLATED_WEB/);
assert.throws(()=>setup({WOLO_SIGNER_KEY:'never-imported'}),/UNREVIEWED_ENVIRONMENT/);
console.log('PASS:actual_preloader_transport_and_http_boundaries');
'''
        result=subprocess.run(["node","-e",script,str(ROOT/"scripts/r25_b_guard_production_v1.cjs")],capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("PASS:actual_preloader",result.stdout)

if __name__ == '__main__': unittest.main()
