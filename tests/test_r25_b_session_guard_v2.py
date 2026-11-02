"""Original B preloader remains immutable; versioned session guard adds one key."""
import hashlib
import json
import pathlib
import subprocess
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
ORIGINAL=ROOT/"tests/fixtures/r25_b_guard_original_sealed.cjs"
GUARD=ROOT/"scripts/r25_b_guard_session_v2.cjs"
OLD="/usr/local/lib/aoe2war-r25/r25_b_guard.cjs"
NEW="/usr/local/lib/aoe2war-r25/r25_b_guard_session_v2.cjs"
KEY="fixture-session-key-abcdefghijklmnopqrstuvwxyz0123456789"
RUNNER=r"""
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.argv[1],'utf8'),filepath=process.argv[2];
const env=JSON.parse(process.argv[3]);
let originalCalls=0, deniedStatus=0, forwarded=0, blockedEgress=0;
const http={Server:function(){}};
http.Server.prototype.emit=function(){forwarded++;return false};
const net={Socket:function(){}};
net.Socket.prototype.connect=function(){originalCalls++;return true};
const https={createServer:function(){}};
const http2={createSecureServer:function(){}};
const fakeRequire=(name)=>({'node:http':http,'node:https':https,'node:net':net,'node:http2':http2})[name];
fakeRequire.resolve=(name)=>name;
const fake={platform:'linux',getuid:()=>993,geteuid:()=>993,env,pid:1234,stderr:{write:()=>{}}};
try{
 vm.runInNewContext(source,{process:fake,require:fakeRequire,__filename:filepath,Buffer,URL});
 const server=new http.Server();
 server.emit('request',{method:'POST',url:'/bet'},{writeHead:(n)=>{deniedStatus=n},end:()=>{}});
 server.emit('request',{method:'GET',url:'/other'},{end:()=>{}});
 try{new net.Socket().connect({host:'198.51.100.1',port:443})}catch(e){
   if(String(e).includes('NODE_OUTBOUND_EGRESS_DENIED'))blockedEgress++;
 }
 new net.Socket().connect({host:'127.0.0.1',port:5432});
 if(deniedStatus!==405||forwarded!==1||blockedEgress!==1||originalCalls!==1)
    throw Error('SECURITY_BEHAVIOUR_CHANGED');
 process.stdout.write('PASS');
}catch(e){process.stdout.write(String(e).replace(env.SESSION_SECRET||'', '[redacted]'));process.exitCode=2}
"""
BASE={
    "NODE_ENV":"production","WARGRAPH_RUNTIME_DISABLED":"true",
    "AOE2WAR_PROD_DB_PREVIEW":"true","AOE2WAR_R25_ISOLATED_WEB":"true",
    "DATABASE_URL":"postgresql://aoe2war_r25_web_ro:fixture@127.0.0.1:5432/aoe2war",
    "PORT":"3031","HOSTNAME":"127.0.0.1",
    "USER":"aoe2war-r24-web","LOGNAME":"aoe2war-r24-web",
    "PATH":"/usr/bin","HOME":"/var/lib/aoe2war",
}

class StartupGuard(unittest.TestCase):
    def run_guard(self,file,path,changes=None):
        env=dict(BASE,SESSION_SECRET=KEY,NODE_OPTIONS="--require="+path)
        for name,value in (changes or {}).items():
            if value is None:env.pop(name,None)
            else:env[name]=value
        return subprocess.run(["node","-e",RUNNER,str(file),path,json.dumps(env)],
                              text=True,capture_output=True,timeout=8)
    def test_original_guard_is_bit_identical_and_denies_session_key(self):
        self.assertEqual(hashlib.sha256(ORIGINAL.read_bytes()).hexdigest(),
                         "dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d")
        r=self.run_guard(ORIGINAL,OLD)
        self.assertEqual(r.returncode,2)
        self.assertIn("UNEXPECTED_ENV_KEY_NAMES:SESSION_SECRET",r.stdout)
    def test_candidate_guard_preserves_http_and_egress_wall(self):
        r=self.run_guard(GUARD,NEW)
        self.assertEqual(r.returncode,0,(r.stdout,r.stderr))
        self.assertEqual(r.stdout,"PASS")
    def test_candidate_fails_closed_for_invalid_session_key(self):
        for value in (None,"short","value with spaces",KEY+"!"):
            with self.subTest(value=value):
                r=self.run_guard(GUARD,NEW,{"SESSION_SECRET":value})
                self.assertEqual(r.returncode,2)
                self.assertIn("CANDIDATE_ORIGINAL_SIGNING_IDENTITY_REQUIRED",r.stdout)
    def test_candidate_fails_closed_for_finance_credentials(self):
        for name in ("WAR_SATCHEL_SIGNER_AUTH_TOKEN","WOLO_SETTLEMENT_PRIVATE_KEY","NEXTAUTH_SECRET"):
            with self.subTest(name=name):
                r=self.run_guard(GUARD,NEW,{name:"forbidden"})
                self.assertEqual(r.returncode,2)
                self.assertIn("UNEXPECTED_ENV_KEY_NAMES",r.stdout)
    def test_candidate_fails_closed_for_wrong_url_preload_or_port(self):
        for key,value,reason in (
            ("NODE_OPTIONS","--require=/tmp/evil.cjs","REQUIRED_ENV_NODE_OPTIONS"),
            ("DATABASE_URL","postgresql://postgres:x@127.0.0.1:5432/app","DEDICATED_DB_URL_REQUIRED"),
            ("PORT","3030","ONLY_LOOPBACK_PORT_3031")):
            with self.subTest(key=key):
                r=self.run_guard(GUARD,NEW,{key:value})
                self.assertEqual(r.returncode,2)
                self.assertIn(reason,r.stdout)

if __name__=="__main__":unittest.main()
