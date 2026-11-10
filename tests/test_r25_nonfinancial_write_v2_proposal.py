"""Node contract tests for V2 nonfinancial write source proposal; NEVER deploy."""
from pathlib import Path
import subprocess
import unittest

MODULE=Path(__file__).resolve().parents[1]/"scripts/release/r25_nonfinancial_write_v2_proposal.cjs"

class NonfinancialV2Proposal(unittest.TestCase):
    def test_exact_scopes_and_all_fail_closed_boundary(self):
        test=r'''
"use strict";
const assert=require("node:assert/strict");
const {proposeV2Write,BUDGETS,V1_SHA256,R25_SOURCE}=require(process.argv[1]);
const now=1794275000;
const good=Object.freeze({
 method:"POST",path:"/api/user/appearance",remoteAddress:"127.0.0.1",
 headers:{"host":"aoe2war.com","origin":"https://aoe2war.com",
   "x-forwarded-proto":"https","sec-fetch-site":"same-origin",
   "content-length":"234","content-type":"application/json"}
});
const goodSession={kind:"trusted_signed_session",uid:"u_0123456789abcdef",
 role:"user",expiresEpoch:now+3500};
const goodFence={role:"aoe2war_web_nonfinancial_writer_v2",
 financeWritesDenied:true,financeReadsDenied:true,
 grantsAreScopedToSessionOwner:true,
 allowedGrants:["appearance_self_write","managed_avatar_self_write","page_notice_self_write"],
 recheckedAtEpoch:now};
const dependencies={
 verifySession:async()=>({...goodSession}),
 verifyCsrf:async()=>true,
 checkGrantFence:async()=>({...goodFence}),
};
const go=(req=good, dep=dependencies)=>
 proposeV2Write(req,dep,now);
const change=(o={})=>({...good,...o,headers:{...good.headers,...(o.headers||{})}});
const dep=(patch={})=>({...dependencies,...patch});
const hold=async(req, deps=dependencies, phrase="HOLD:")=>
 assert.match((await go(req,deps)).status,new RegExp(phrase));
(async()=>{
 assert.equal(Object.keys(BUDGETS).length,4);
 assert.equal(V1_SHA256,"5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3");
 assert.equal(R25_SOURCE,"b1ef050b954be734c9f34147361e0d02d7c89b19");
 for(const role of ["user","admin"]) {
   const r=await go(good,dep({verifySession:async()=>({...goodSession,role})}));
   assert.equal(r.status,"SOURCE_ONLY_ALLOWLIST_MATCH_NOT_ADMITTED");
   assert.equal(r.deploymentAuthorized,false);
   assert.equal(r.financialAuthorized,false);
   assert.equal(r.verifiedRole,role);
   assert.equal(r.ownerUid,goodSession.uid);
 }
 await hold(good,dep({verifySession:async()=>null}),"ANONYMOUS");
 await hold(good,dep({verifySession:async()=>({...goodSession,role:"guest"})}),"ANONYMOUS");
 await hold(good,dep({verifySession:async()=>({...goodSession,expiresEpoch:now})}),"ANONYMOUS");
 await hold(good,dep({verifySession:async()=>({...goodSession,expiresEpoch:now+40*86400})}),"ANONYMOUS");
 await hold(good,dep({verifySession:async()=>({...goodSession,kind:"cookie_unverified"})}),"ANONYMOUS");
 await hold(good,dep({verifySession:async()=>{throw Error("bad");}}),"SESSION_VERIFICATION_FAILED");
 await hold(good,dep({verifyCsrf:async()=>false}),"CSRF");
 await hold(good,dep({verifyCsrf:async()=>{throw Error("CSRF");}}),"CSRF");
 await hold(good,dep({verifySession:null}),"UNTRUSTED");
 const forged=change({headers:{"x-user-role":"admin","x-user-id":"forged"}});
 await hold(forged,dep({verifySession:async()=>null}),"ANONYMOUS");
 for(const [key,value] of [
  ["origin","https://evil.example"],["origin","http://aoe2war.com"],
  ["host","evil.example"],["x-forwarded-proto","http"],
  ["sec-fetch-site","cross-site"]]) {
  await hold(change({headers:{[key]:value}}),dependencies,"ORIGIN_HOST");
 }
 await hold(change({headers:{"sec-fetch-site":"none"}}),dependencies,"BROWSER_CONTEXT");
 await hold(change({remoteAddress:"203.0.113.3"}),dependencies,"NOT_TRUSTED_PROXY");
 await hold(change({method:"GET"}),dependencies,"UNLISTED_METHOD");
 await hold(change({method:"PUT"}),dependencies,"UNLISTED_METHOD");
 await hold(change({method:"post"}),dependencies,"METHOD_OR_PATH");
 await hold(change({path:"/api/user/avatar/"}),dependencies,"UNLISTED_METHOD");
 await hold(change({path:"/api/user/appearance?redirect=1"}),dependencies,"METHOD_OR_PATH");
 await hold(change({path:"/api/user/appearance%2f.."}),dependencies,"METHOD_OR_PATH");
 await hold(change({path:"/api/admin/media-assets"}),dependencies,"FINANCIAL_OR_ADMIN");
 for(const path of ["/api/bets","/api/bets/claim","/api/user/war-satchel/balance",
                   "/api/wallet","/api/payouts","/api/staking","/api/wolo"]) {
  await hold(change({path}),dependencies,"FINANCIAL_OR_ADMIN");
 }
 await hold(change({headers:{"content-type":"text/plain"}}),dependencies,"UNEXPECTED_CONTENT_TYPE");
 await hold(change({headers:{"content-length":"0"}}),dependencies,"BODY_NOT_BOUNDED");
 await hold(change({headers:{"content-length":"32769"}}),dependencies,"BODY_NOT_BOUNDED");
 await hold(change({headers:{"transfer-encoding":"chunked"}}),dependencies,"CHUNKED");
 await hold(change({headers:{"content-length":"-1"}}),dependencies,"BODY_NOT_BOUNDED");
 await hold(change({headers:{"content-type":"application/json\r\nOther: 1"}}),dependencies,"UNEXPECTED_CONTENT_TYPE");
 await hold(good,dep({checkGrantFence:async()=>({...goodFence,
  financeWritesDenied:false})}),"NONFINANCIAL_DB");
 await hold(good,dep({checkGrantFence:async()=>({...goodFence,
  financeReadsDenied:false})}),"NONFINANCIAL_DB");
 await hold(good,dep({checkGrantFence:async()=>({...goodFence,
  grantsAreScopedToSessionOwner:false})}),"NONFINANCIAL_DB");
 await hold(good,dep({checkGrantFence:async()=>({...goodFence,
  allowedGrants:[...goodFence.allowedGrants,"wallet_credit"]})}),"NONFINANCIAL_DB");
 await hold(good,dep({checkGrantFence:async()=>({...goodFence,role:"aoe2war_web_prod"})}),"NONFINANCIAL_DB");
 await hold(good,dep({checkGrantFence:async()=>({...goodFence,
  recheckedAtEpoch:now-80})}),"NONFINANCIAL_DB");
 const avatar=change({path:"/api/user/avatar",headers:{
  "content-type":"multipart/form-data; boundary=BOUNDARY12345","content-length":"2000000"}});
 assert.equal((await go(avatar)).requiredGrant,"managed_avatar_self_write");
 const avatarPatch=change({method:"PATCH",path:"/api/user/avatar"});
 assert.equal((await go(avatarPatch)).requiredGrant,"managed_avatar_self_write");
 await hold(change({path:"/api/user/avatar",headers:{
  "content-type":"multipart/form-data","content-length":"244"}}),dependencies,"UNBOUNDED_MULTIPART");
 const notice=change({path:"/api/page-change-notices"});
 assert.equal((await go(notice)).requiredGrant,"page_notice_self_write");
 await hold(change({path:"/api/user/avatar",headers:{
  "content-type":"multipart/form-data; boundary=BOUNDARY12345","content-length":"8388609"}}),dependencies,"BODY_NOT_BOUNDED");
 await hold(good,dep({checkGrantFence:async()=>{throw Error("no role");}}),"DB_FENCE_UNAVAILABLE");
 console.log("PASS:V2_WRITE_PROPOSAL_46_ADVERSARIAL_AND_POSITIVE_CHECKS");
})().catch(e=>{console.error(e);process.exitCode=1;});
'''
        result=subprocess.run(["node","-e",test,str(MODULE)],text=True,capture_output=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("PASS:V2_WRITE_PROPOSAL",result.stdout)

    def test_v1_live_guard_unchanged_and_v2_not_installed(self):
        source=MODULE.read_text()
        self.assertIn('NOT a preloader',source)
        self.assertIn('CENTRAL_EXACT_V2_RUNTIME_AND_ROLE_REVIEW',source)
        for phrase in ("cookie=", "req.headers['role']", "fs.writeFileSync",
                       "systemctl restart", "0.0.0.0", "8094/satchel"):
            self.assertNotIn(phrase,source)
        self.assertNotIn('createServer(',source)
        self.assertNotIn('listen(',source)

if __name__=="__main__":unittest.main()
