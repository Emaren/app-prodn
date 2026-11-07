"""Candidate browser routing contracts; fixtures never attest production login."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("candidate_browser",ROOT/"scripts/aoe2_r25_g_browser_acceptance.py")
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

def admission_fixture():
    witness={"schema":"aoe2war.app.production-witness.v1","status":"NATIVE_PRODUCTION_PROFILE_PASS",
      "profile":"nonfinancial-production-v1","source_sha":"a"*40,"build_id":"fixtureBuild123","build_version":"fixture-version-123",
      "stage":"/var/lib/aoe2war-web-prod-"+"a"*12,"uid":990,"gid":984,"port":3032,"unit":"aoe2hdbets-web-prod.service",
      "candidate_pid":12345,"candidate_start_ticks":123456,"original_pid":2625090,"preview_pid":1483304,
      "financial_authorized":False,"public_cutover_authorized":False,"read_only_observation":True,
      "profile_sha256":"b"*64,"manifest_sha256":"c"*64,"admission_sha256":"d"*64}
    return {"schema":"aoe2war.app.production-recovery-complete.v1","status":"PRODUCTION_3032_ADMITTED_NOT_PUBLIC",
      "source_sha":"a"*40,"candidate_pid":12345,"candidate_start_ticks":123456,
      "financial_authorized":False,"public_cutover_authorized":False,"witness":witness}

class CandidateAdmission(unittest.TestCase):
    def private(self,path,value):
        raw=(json.dumps(value)+"\n").encode();path.write_bytes(raw);path.chmod(0o600)
        return hashlib.sha256(raw).hexdigest()
    def test_exact_native_receipt_required_not_a_source_or_preview_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"complete.json";receipt=admission_fixture();sha=self.private(path,receipt)
            self.assertEqual(g.candidate_admission(path,sha)[1]["candidate_pid"],12345)
            with self.assertRaisesRegex(ValueError,"Exact native"):g.candidate_admission(path,"0"*64)
            for change in (("uid",993),("port",3031),("financial_authorized",True),("read_only_observation",False),
                           ("stage","/var/lib/unsealed"),("candidate_pid",2625090),("profile_sha256",None)):
                changed=copy.deepcopy(receipt);changed["witness"][change[0]]=change[1]
                sha=self.private(path,changed)
                with self.subTest(change=change),self.assertRaises(ValueError):g.candidate_admission(path,sha)
    def test_single_g_before_binds_native_identity_and_sealed_static_bytes(self):
        witness=admission_fixture()["witness"]
        before=self.before_fixture(witness)
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/("e"*32+"-g-before.json");sha=self.private(path,before)
            self.assertEqual(g.candidate_before(path,sha,witness,"f"*40)["nonce"],"e"*32)
            for key,value in (("source_sha","0"*40),("candidate_pid",999),("controller_source_sha","0"*40),
                              ("native_admission_sha256","0"*64),("manifest_sha256","0"*64),("ports",{})):
                changed={**before,key:value};sha=self.private(path,changed)
                with self.subTest(key=key),self.assertRaises(ValueError):g.candidate_before(path,sha,witness,"f"*40)

    def before_fixture(self,witness):
        return {**witness,"schema":"aoe2war.g.app-production.v1","phase":"before","nonce":"e"*32,
          "status":"PRODUCTION_G_BEFORE_PASS_PENDING_REAL_AUTHENTICATED_BROWSER","controller_source_sha":"f"*40,
          "host":"ubuntu-4gb-hel1-11","proof":"SEPARATE_NATIVE_G_OBSERVATION_NOT_HUMAN_REVIEW",
          "authenticated_browser_roles_verified":False,
          "nginx":{"upstream_port":3030,"selectors":6},"native_admission_sha256":witness["admission_sha256"],
          "ports":{"3030":{"pid":2625090},"3031":{"pid":1483304},"3032":{"pid":witness["candidate_pid"],"uid":990},
                   "8092":{"pid":1012},"8093":{"pid":1010}},
          "candidate_http":{"asset":{"path":"/_next/static/fixtureBuild123/_buildManifest.js","sha256":"1"*64,"bytes":123}}}

    def test_scoped_upgrade_flat_receipt_requires_same_live_process_in_g(self):
        witness=admission_fixture()["witness"]
        receipt={"status":"PASS_NEW_3032_ADMITTED_NOT_PUBLIC","source_sha":witness["source_sha"],
                 "pid":witness["candidate_pid"],"ticks":witness["candidate_start_ticks"],"profile_sha256":witness["profile_sha256"],
                 "read_acl_sha256":"1"*64,"content":{"candidate_build_version":witness["build_version"]},
                 "financial_authorized":False,"public_cutover_authorized":False,"browser_roles_verified":False}
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"complete.json";sha=self.private(path,receipt)
            _,native=g.candidate_admission(path,sha)
            g_path=Path(temp)/("e"*32+"-g-before.json");before=self.before_fixture(witness)
            sha=self.private(g_path,before)
            self.assertEqual(g.candidate_before(g_path,sha,native,"f"*40)["build_id"],"fixtureBuild123")
            for key,value in (("candidate_start_ticks",999),("candidate_pid",12346),("profile_sha256","0"*64),
                              ("build_version","wrong-version"),("native_admission_sha256",None)):
                changed={**before,key:value};sha=self.private(g_path,changed)
                with self.subTest(key=key),self.assertRaises(ValueError):g.candidate_before(g_path,sha,native,"f"*40)
            for key,value in (("status","CRITICAL_ROLLBACK_INCOMPLETE"),("financial_authorized",True),
                              ("browser_roles_verified",True),("ticks",True),("pid",0)):
                changed={**receipt,key:value};sha=self.private(path,changed)
                with self.subTest(key=key),self.assertRaises(ValueError):g.candidate_admission(path,sha)

class CandidateTransport(unittest.TestCase):
    def test_only_exact_candidate_auth_mutations_and_https_steam_ui_allowed(self):
        for path,method in (("/api/auth/session","POST"),("/api/auth/session","DELETE"),("/api/user/ping","POST"),("/api/auth/steam","GET")):
            self.assertEqual(g.candidate_route_policy("https://aoe2war.com"+path,method),"CANDIDATE")
        for url,method in (("https://aoe2war.com/api/bets","POST"),("https://aoe2war.com/api/user/me","PATCH"),
                           ("https://aoe2war.com:3032/api/auth/session","POST"),("http://steamcommunity.com/","GET"),
                           ("https://steamcommunity.com.evil.invalid/","POST"),("https://user:pass@aoe2war.com/","GET")):
            self.assertEqual(g.candidate_route_policy(url,method),"DENY")
        self.assertEqual(g.candidate_route_policy("https://login.steampowered.com/jwt/finalizelogin","POST"),"STEAM_OWNER_UI")
    def request(self,url="https://aoe2war.com/api/auth/session",method="GET"):
        return {"requestId":"fixture-id","request":{"url":url,"method":method,"headers":{
            "Cookie":"fixture-only-not-a-live-cookie","Origin":"https://aoe2war.com","X-Forwarded-Host":"invalid.example"}}}

    def test_real_request_headers_forward_without_redirect_or_public_fallback(self):
        adapter=g.CandidateTunnel(admission_fixture()["witness"]);session=mock.Mock()
        actual={"X-AoE2WAR-Source":"a"*40,"X-AoE2WAR-Build-ID":"fixtureBuild123","X-AoE2WAR-Process":"12345"}
        response=mock.Mock(status=302);response.getheader.side_effect=actual.get;response.read.return_value=b""
        response.getheaders.return_value=[("Location","https://steamcommunity.com/openid/login"),
                                          ("Set-Cookie","one=fixture"),("Set-Cookie","two=fixture")]
        with mock.patch.object(g.http.client,"HTTPConnection") as connect:
            connection=connect.return_value;connection.getresponse.return_value=response
            adapter.handle(session,self.request())
            connect.assert_called_once_with("127.0.0.1",30332,timeout=15)
            self.assertEqual(connection.request.call_args.args,("GET","/api/auth/session"))
            headers=connection.request.call_args.kwargs["headers"]
            self.assertEqual(headers["Host"],"aoe2war.com")
            self.assertEqual(headers["X-Forwarded-Host"],"aoe2war.com")
            self.assertEqual(headers["X-Forwarded-Proto"],"https")
            self.assertEqual(headers["Cookie"],"fixture-only-not-a-live-cookie")
            connection.close.assert_called_once()
        method,params=session.send.call_args.args
        self.assertEqual(method,"Fetch.fulfillRequest");self.assertEqual(params["responseCode"],302)
        self.assertEqual(sum(row["name"]=="Set-Cookie" for row in params["responseHeaders"]),2)

    def test_financial_post_never_reaches_forward_and_identity_drift_aborts(self):
        adapter=g.CandidateTunnel(admission_fixture()["witness"]);session=mock.Mock()
        with mock.patch.object(g.http.client,"HTTPConnection") as connect:
            adapter.handle(session,self.request("https://aoe2war.com/api/bets","POST"))
            connect.assert_not_called()
            session.send.assert_called_once_with("Fetch.failRequest",{"requestId":"fixture-id","errorReason":"BlockedByClient"})
            session.reset_mock()
            connect.return_value.getresponse.return_value.getheader.return_value="wrong-source"
            adapter.handle(session,self.request())
            session.send.assert_called_once_with("Fetch.failRequest",{"requestId":"fixture-id","errorReason":"Failed"})

    def test_callback_assertion_is_transient_and_not_part_of_public_receipt_fields(self):
        adapter=g.CandidateTunnel(admission_fixture()["witness"])
        url="https://aoe2war.com/api/auth/steam?openid.mode=id_res&state=fixture-sensitive-callback"
        with mock.patch.object(adapter,"forward",return_value={"responseCode":200}):adapter.handle(mock.Mock(),self.request(url))
        self.assertEqual(adapter.callbacks,1);self.assertEqual(adapter.callback_url,url)
        self.assertEqual(adapter.blocked,0)
    def test_capacity_limit_skips_optional_images_without_failing_dom_result(self):
        with mock.patch("shutil.disk_usage",return_value=mock.Mock(free=24*1024**3)):
            self.assertFalse(g.key_capture_allowed("/","/tmp"))
            row={"status":"PASS_BROWSER_RENDER","screenshot":"NOT_CAPTURED"}
            self.assertEqual(g.limited_capture_record(row,"/","/tmp")["screenshot"],"NOT_CAPTURED_CAPACITY_FLOOR")
            self.assertEqual(row["status"],"PASS_BROWSER_RENDER")
        with mock.patch("shutil.disk_usage",return_value=mock.Mock(free=26*1024**3)):
            self.assertTrue(g.key_capture_allowed("/kingdom-construction","/tmp"))
            self.assertFalse(g.key_capture_allowed("/admin","/tmp"))

@unittest.skipUnless(os.environ.get("RUN_CANDIDATE_BROWSER_TRANSPORT")=="1","Opt-in isolated real Chromium tunnel regression")
class RealBrowserTransport(unittest.TestCase):
    def test_secure_origin_cookie_redirect_and_auth_post_over_actual_forward(self):
        # This is a local HTTP fixture testing the SDK transport only. It has
        # no real Steam, database, valid auth token or production acceptance.
        import http.server,threading
        from playwright.sync_api import sync_playwright
        requests=[]
        home_mode={"count":0,"shuffle":True,"cache_hit":False,"traffic_separate":True}
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.command,self.path))
                locations={"/set-cookie":"https://aoe2war.com/redirect-to-provider",
                           "/redirect-to-provider":"https://steam-browser.invalid/provider",
                           "/provider":"https://aoe2war.com/api/auth/steam?openid.mode=id_res"}
                self.send_response(302 if self.path in locations else 200)
                self.send_header("X-AoE2WAR-Source","a"*40);self.send_header("X-AoE2WAR-Build-ID","fixtureBuild123");self.send_header("X-AoE2WAR-Process","12345")
                if self.path=="/set-cookie":
                    self.send_header("Set-Cookie","aoe2hdbets_session=fixture-only-invalid-auth; Secure; HttpOnly; SameSite=Lax; Path=/")
                    self.send_header("Set-Cookie","__Host-aoe2war_steam_state=fixture-only-state; Secure; HttpOnly; SameSite=Lax; Path=/")
                if self.path in locations:self.send_header("Location",locations[self.path])
                if self.path=="/provider" and self.headers.get("Cookie"):
                    raise AssertionError("cross-site provider received site cookies")
                if self.path=="/":
                    home_mode["count"]+=1
                    start=home_mode["count"] if home_mode["shuffle"] else 0
                    cards="".join(f'<a href="/players/{n}"><div data-featured-warrior-image-buffer="0" style="opacity:1"><img src="/api/media-assets/avatar/{n}?edgev=fixture"></div></a>'
                                  for n in range(start,start+4))
                    body=cards.encode();content_type="text/html"
                    self.send_header("CF-Cache-Status","HIT" if home_mode["cache_hit"] else "DYNAMIC")
                elif self.path.startswith("/api/media-assets/avatar/"):
                    body=b'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>'
                    content_type="image/svg+xml"
                elif self.path=="/traffic":
                    day="2024-10-20" if home_mode["traffic_separate"] else "2024-10-19"
                    body=(f'<p>LAST PUBLISHED UTC DAY: 2024-10-19</p><button>Confirmed Humans</button>'
                          '<section aria-label="Provisional, unverified daily web activity">'
                          '<p>Qualifying IPs · not people</p><p>Filtered page GETs · not sessions</p>'
                          f'<div role="img" style="width:32px;height:32px" aria-label="{day}: 12 qualifying IPs"></div></section>').encode()
                    content_type="text/html; charset=utf-8"
                else:
                    body=json.dumps({"cookie_received":"fixture-only-invalid-auth" in self.headers.get("Cookie","")}).encode()
                    content_type="application/json"
                self.send_header("Content-Type",content_type);self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
            def do_POST(self):self.do_GET()
            def log_message(self,*args):pass
        server=http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            policy=g.candidate_route_policy
            def fixture_policy(url,method):
                return "CANDIDATE" if url=="https://steam-browser.invalid/provider" else policy(url,method)
            with (mock.patch.object(g,"CANDIDATE_FORWARD_PORT",server.server_port),
                  mock.patch.object(g,"candidate_route_policy",fixture_policy),sync_playwright() as pw):
                opts={"headless":True,"args":list(g.CANDIDATE_CHROMIUM_ARGS)}
                if os.environ.get("CHROME_BIN"):opts["executable_path"]=os.environ["CHROME_BIN"]
                browser=pw.chromium.launch(**opts)
                try:
                    context=browser.new_context(ignore_https_errors=False,service_workers="block")
                    page=context.new_page();adapter=g.CandidateTunnel(admission_fixture()["witness"]);adapter.attach(page)
                    page.goto("https://aoe2war.com/set-cookie",wait_until="domcontentloaded")
                    self.assertEqual(page.url,"https://aoe2war.com/api/auth/steam?openid.mode=id_res")
                    self.assertTrue(page.evaluate("JSON.parse(document.body.innerText).cookie_received"))
                    self.assertEqual(adapter.callbacks,1)
                    self.assertEqual(requests[:4],[("GET","/set-cookie"),("GET","/redirect-to-provider"),
                                                   ("GET","/provider"),("GET","/api/auth/steam?openid.mode=id_res")])
                    cookies=context.cookies("https://aoe2war.com")
                    self.assertEqual({c["name"] for c in cookies},{"aoe2hdbets_session","__Host-aoe2war_steam_state"})
                    self.assertTrue(all(c["secure"] and c["httpOnly"] and c["sameSite"]=="Lax" for c in cookies))
                    self.assertTrue(page.evaluate("async()=> (await(await fetch('/api/auth/session',{method:'POST',credentials:'include'})).json()).cookie_received"))
                    self.assertIn(("POST","/api/auth/session"),requests)
                    self.assertEqual(page.evaluate("async()=> {try{await fetch('/api/bets',{method:'POST'});return false}catch{return true}}"),True)
                    self.assertNotIn(("POST","/api/bets"),requests)
                    self.assertEqual(len(g.candidate_session_state(context)["cookies"]),1)
                    # Missing interception must fail closed rather than send
                    # a private callback to the existing public website.
                    from playwright.sync_api import Error
                    unattached=context.new_page()
                    with self.assertRaisesRegex(Error,"ERR_NAME_NOT_RESOLVED"):
                        unattached.goto("https://aoe2war.com/",wait_until="domcontentloaded",timeout=5000)
                    content=g.modern_public_content(page,admission_fixture()["witness"])
                    self.assertEqual(content["distinct_server_openings"],5)
                    self.assertEqual(content["decoded_fallback_portraits"],0)
                    self.assertEqual(content["last_certified_utc_day"],"2024-10-19")
                    self.assertEqual(content["observed_only_utc_days"],["2024-10-20"])
                    home_mode["shuffle"]=False
                    with self.assertRaisesRegex(g.BrowserContentHold,"INSUFFICIENT_SERVER_VARIATION"):
                        g.modern_public_content(page,admission_fixture()["witness"])
                    home_mode["shuffle"]=True;home_mode["cache_hit"]=True
                    with self.assertRaisesRegex(g.BrowserContentHold,"MODERN_CONTENT_SHARED_CACHE"):
                        g.modern_public_content(page,admission_fixture()["witness"])
                    home_mode["cache_hit"]=False;home_mode["traffic_separate"]=False
                    with self.assertRaisesRegex(g.BrowserContentHold,"TRAFFIC_DISTINCT_OBSERVED_DATES"):
                        g.modern_public_content(page,admission_fixture()["witness"])
                finally:browser.close()
        finally:server.shutdown();server.server_close();thread.join(timeout=2)

if __name__=="__main__":unittest.main()
