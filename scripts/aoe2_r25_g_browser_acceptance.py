#!/usr/bin/env python3
"""R25 G: owner-browser-only read-only HTTP GET/HEAD viewport acceptance.

No SSH, shell/root, service changes, Nginx actions, write HTTP requests,
credentials collection, or source/build mutation. Uses Playwright + Chromium.
The browser only visits the public aoe2war.com origin. Admin requires an
already-authorized, owner-local Playwright storage-state file. Never share it.
This is supplementary to, NOT a substitute for, native G BEFORE/AFTER or F.

The explicit candidate-auth mode is different: the owner completes genuine
Steam authentication in a new visible browser. Only the reviewed authentication
HTTP mutations are allowed. Its existing SSH tunnel is supplied by the operator;
this program never opens SSH, starts services, or changes public routing.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import hashlib
import http.client
import json
import os
import pathlib
import re
import sys
import uuid
from urllib.parse import urlsplit, urlunsplit

ORIGIN="https://aoe2war.com"
BUILD_ID="-dJl5VyecHu5BKNvfErJe"
APP_VERSION="20261031171526-148d3df911"
FROZEN="0cee3c836c4b0760478280c145e02e81e470ce0e"
VIEWPORTS=((375,844),(768,1024),(1440,900))
PUBLIC=("/","/lobby","/bets","/live-games","/war-chest", "/players",
        "/wargraph","/download","/kingdom-index","/kingdom-intelligence",
        "/aoe2war-os","/general-inspections","/kingdom","/speed","/traffic",
        "/renaissance","/tournaments","/leaderboard","/watch","/roadmap")
ADMIN=("/admin","/admin/aoe2war-os","/admin/storage-os",
       "/admin/central-command","/admin/traffic","/admin/ai",
       "/admin/market-integrity","/admin/replay-review")
NO_RUN=("/admin/central-command/job-board","/admin/central-command/lanes",
        "/admin/central-command/work-board","/aoe2war-os/engineering",
        "/admin/engineering-os")
SHA64=re.compile(r"[a-f0-9]{64}\Z")

def safe_url(url):
    """Never persist URL query/fragment that may contain session tokens."""
    x=urlsplit(str(url))
    return urlunsplit((x.scheme,x.netloc,x.path,"",""))

def dump_new(path, obj):
    raw=(json.dumps(obj,sort_keys=True,indent=2,ensure_ascii=True)+"\n").encode()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    return hashlib.sha256(raw).hexdigest()

def site_probe(context, route, viewport, session, out, capture_private, auth_proof, capture_any=True):
    from playwright.sync_api import TimeoutError as PWTimeout
    page=context.new_page()
    page.set_viewport_size({"width":viewport[0],"height":viewport[1]})
    denied_methods=[]; third_party=[]; console=[]; failed=[]; assets=[]
    def route_policy(route_obj):
        req=route_obj.request
        if req.method not in ("GET","HEAD"):
            denied_methods.append({"method":req.method,"path":urlsplit(req.url).path})
            return route_obj.abort("blockedbyclient")
        x=urlsplit(req.url)
        if x.scheme not in ("https",) or x.netloc!="aoe2war.com":
            third_party.append((x.scheme,x.netloc))
            return route_obj.abort("blockedbyclient")
        return route_obj.continue_()
    page.route("**/*",route_policy)
    page.on("console", lambda msg: console.append(msg.type) if msg.type=="error" else None)
    page.on("pageerror", lambda ex: console.append("PAGE_ERROR"))
    page.on("requestfailed", lambda req: failed.append({"resource":req.resource_type,"path":urlsplit(req.url).path}))
    def on_response(resp):
        if resp.request.resource_type in ("script","stylesheet","image","font"):
            if resp.status>=400:
                assets.append({"path":urlsplit(resp.url).path,"status":resp.status,
                               "kind":resp.request.resource_type})
    page.on("response",on_response)
    record={"route":route,"viewport_width":viewport[0],"viewport_height":viewport[1],
            "session":session,"status":"HOLD_UNTESTED","redirect":"NOT_MEASURED",
            "http_status":None,"ready_state":None,"loading_complete":None,
            "title_present":None,"nav_links":None,"horizontal_overflow":None,
            "missing_assets":[],"request_failures":[],"console_error_types":[],
            "disallowed_write_requests":[],"third_party_blocked":[],
            "screenshot":"NOT_CAPTURED","screenshot_sha256":None,
            "navigation":"NOT_RUN","authorization":"UNASSESSED",
            "browser_rendered":False,"live_r25_attested":False}
    try:
        response=page.goto(ORIGIN+route,wait_until="domcontentloaded",timeout=25000)
        page.wait_for_timeout(2200)
        # Trigger normal lazy loading without clicking controls or POSTing.
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(550)
        page.evaluate("window.scrollTo(0, 0)")
        info=page.evaluate("""() => ({
            state: document.readyState,
            title: !!document.title.trim(),
            nav: document.querySelectorAll('a[href]').length,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            textLength: (document.querySelector('main')?.innerText || document.body.innerText || '').trim().length,
            loading: !!document.querySelector('[aria-busy="true"], [role="progressbar"]')
        })""")
        record.update(http_status=response.status if response else None,
                      redirect=safe_url(page.url),ready_state=info["state"],
                      title_present=info["title"],nav_links=info["nav"],
                      horizontal_overflow=info["overflow"],
                      loading_complete=not info["loading"] and info["textLength"]>70,
                      missing_assets=assets[:25],request_failures=failed[:25],
                      console_error_types=console[:20],
                      disallowed_write_requests=denied_methods[:25],
                      third_party_blocked=list(sorted(set(third_party)))[:20],
                      browser_rendered=True)
        if session in ("anonymous-admin-negative", "nonadmin-admin-negative"):
            # Frozen `requireServerAdmin()` redirects rejected sessions to `/`.
            # The anonymous API probe must independently return 401; don't
            # mistake a public 200 homepage mentioning "login" for admin denial.
            terminal_path=urlsplit(page.url).path
            refused=response is not None and response.status in (401,403)
            record["authorization"]=("DENIAL_PROVEN_BY_API_AND_PAGE" if
                auth_proof==("NONADMIN_403" if session=="nonadmin-admin-negative" else "ANONYMOUS_401") and
                (refused or terminal_path=="/") else
                "HOLD_AUTH_DENIAL_NOT_PROVEN")
            record["status"]=("PASS_NEGATIVE_AUTH_ONLY" if record["authorization"]==
                              "DENIAL_PROVEN_BY_API_AND_PAGE" else "HOLD_AUTH_BOUNDARY")
        elif session=="authorized-admin":
            # Only a distinct real GET of the protected server-side endpoint
            # proving DB-backed `isAdmin` is an adequate positive auth proof.
            record["authorization"]=auth_proof
            terminal_path=urlsplit(page.url).path
            record["status"]=("PASS_BROWSER_RENDER_ADMIN_NOT_HOST_LIVE_CERT" if
                              auth_proof=="AUTHENTICATED_ADMIN_API_200" and
                              terminal_path==route and response is not None and
                              response.status==200 and info["textLength"]>70 and
                              info["title"] and not info["overflow"] and
                              not info["loading"] and not assets and not console
                              and not denied_methods and not failed and not third_party
                              else "HOLD_ADMIN_RENDER_OR_AUTH")
        else:
            record["status"]=("PASS_PUBLIC_BROWSER_RENDER_NOT_R25_CERT" if
                              response is not None and response.status==200 and
                              info["textLength"]>70 and info["title"] and
                              not info["overflow"] and not info["loading"] and
                              not assets and not console and not denied_methods and
                              not failed and not third_party
                              else "HOLD_PUBLIC_RENDER")
        # Exercise one real internal navigation through the application's UI;
        # only the public homepage is used, and the request blocker denies POST.
        if route=="/" and session=="anonymous-public":
            try:
                player_link=page.locator('a[href="/players"]')
                if player_link.count() and player_link.first.is_visible():
                    player_link.first.click(timeout=5000)
                    page.wait_for_url("**/players",timeout=12000)
                    record["navigation"]="PASS_HOMEPAGE_TO_PLAYERS_CLICK"
                    page.go_back(wait_until="domcontentloaded",timeout=12000)
                else:record["navigation"]="HOLD_PLAYERS_LINK_NOT_VISIBLE"
            except Exception:
                record["navigation"]="HOLD_LINK_NAVIGATION_FAILED"
            if record["navigation"].startswith("HOLD"):
                record["status"]="HOLD_NAVIGATION"
        if capture_any and (session != "authorized-admin" or capture_private) and record["status"].startswith("PASS"):
            # Admin images require independent explicit opt-in, never automatic.
            path=out/("shot-"+session+"-"+str(viewport[0])+"-"+
                       hashlib.sha256(route.encode()).hexdigest()[:12]+".png")
            page.screenshot(path=str(path),full_page=True,animations="disabled",timeout=15000)
            record["screenshot"]=path.name
            record["screenshot_sha256"]=hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception as ex:
        record["status"]="HOLD_BROWSER_EXCEPTION"
        record["error_type"]=type(ex).__name__
        # Do NOT print raw exception string: may contain sensitive redirect URL.
    finally:
        page.close()
    return record

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",type=pathlib.Path,required=True)
    ap.add_argument("--admin-storage-state",type=pathlib.Path)
    ap.add_argument("--capture-private-admin-screenshots",action="store_true")
    ap.add_argument("--expect-r25",action="store_true")
    ap.add_argument("--manifest-sha256",help="Optional additional independent F/G manifest digest")
    ap.add_argument("--g-after-receipt",type=pathlib.Path,
                    help="Owner-local private successful F/G AFTER JSON; mandatory for R25 mode")
    ap.add_argument("--chromium",default=None,help="Optional local Chromium executable path")
    opts=ap.parse_args()
    if opts.capture_private_admin_screenshots and not opts.admin_storage_state:
        ap.error("Private screenshots require an owner-supplied admin state")
    if opts.manifest_sha256 and not SHA64.fullmatch(opts.manifest_sha256):
        ap.error("manifest SHA256 must be exactly 64 lowercase hex characters")
    if opts.expect_r25 and not opts.g_after_receipt:
        ap.error("R25 mode requires actual successful private F/G AFTER receipt")
    g_after_sha=None
    before_sha=None
    independent_manifest=None
    if opts.g_after_receipt:
        receipt_path=opts.g_after_receipt.expanduser()
        st=receipt_path.lstat()
        if (not receipt_path.is_file() or receipt_path.is_symlink() or
            st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>65536 or
            st.st_size<100):
            ap.error("G AFTER receipt must be owner-owned private 0600 regular JSON")
        raw=receipt_path.read_bytes()
        receipt=json.loads(raw)
        if not (receipt.get("schema")=="aoe2war.g.r25.postflight.v1" and
                receipt.get("phase")=="after" and
                receipt.get("status")=="LIVE_PARALLEL_HOST_AND_PUBLIC_MEASURED_REQUIRES_F_STAGE_REVIEW" and
                receipt.get("frozen_candidate_sha")==FROZEN and
                receipt.get("next_build_id_measured_on_HOST_not_public")==BUILD_ID and
                receipt.get("nginx_active_upstream")==3031 and
                receipt.get("old_web_service_pid_unchanged") is True and
                receipt.get("financial_units_and_wolo_8092_8093_unchanged") is True):
            ap.error("G AFTER receipt not accepted; no substitute for F/G positive physical proof")
        independent_manifest=receipt.get("public",{}).get("manifest_sha256")
        if not isinstance(independent_manifest,str) or not SHA64.fullmatch(independent_manifest):
            ap.error("G AFTER receipt lacks exact public manifest digest")
        if opts.manifest_sha256 and independent_manifest!=opts.manifest_sha256:
            ap.error("user-supplied manifest digest conflicts with F/G AFTER receipt")
        # F persists the *paired* root/public BEFORE snapshot and G AFTER
        # report under an identical nonce. Do not accept loose standalone
        # JSON as an independently executable release/baseline assertion.
        match=re.fullmatch(r"r25-f-([0-9a-f]{32})-after\.json",receipt_path.name)
        if not match:
            ap.error("AFTER filename must match real F nonce-bound receipt naming")
        before_path=receipt_path.with_name("r25-f-"+match.group(1)+"-before.json")
        try:
            bst=before_path.lstat()
            if (not before_path.is_file() or before_path.is_symlink() or
                bst.st_uid != os.getuid() or bst.st_mode & 0o077 or
                bst.st_size < 100 or bst.st_size > 10000000):
                ap.error("F companion BEFORE must be owner-owned private regular JSON")
            before_raw=before_path.read_bytes()
            before=json.loads(before_raw)
            if not (before.get("schema")=="aoe2war.g.r25.parallel-host.v1" and
                    before.get("phase")=="before" and
                    before.get("proof")=="ROOT_SSH_MEASURED_NOT_FINANCE_SIGNED" and
                    before.get("nginx",{}).get("upstream_port")==3030 and
                    before.get("candidate",{}).get("next_build_id")==BUILD_ID and
                    isinstance(before.get("units"),dict) and
                    isinstance(before.get("ports"),dict) and
                    all(str(k) in before["ports"] for k in (3030,3031,8092,8093))):
                ap.error("F companion BEFORE was not a valid active-3031 root snapshot")
            before_sha=hashlib.sha256(before_raw).hexdigest()
        except (OSError,ValueError,TypeError) as exc:
            ap.error("F companion BEFORE is absent or malformed: "+type(exc).__name__)
        g_after_sha=hashlib.sha256(raw).hexdigest()
    from playwright.sync_api import sync_playwright
    root=opts.out.expanduser()
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    if root.is_symlink() or os.stat(root).st_mode&0o077:
        raise SystemExit("HOLD:OUTPUT_DIRECTORY_MUST_BE_PRIVATE_0700")
    campaign=root/("g-browser-"+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+
                   "-"+uuid.uuid4().hex[:8]);campaign.mkdir(mode=0o700)
    all_rows=[]; identity={"r25_expected":opts.expect_r25,"candidate_sha":FROZEN,
                          "accepted_g_after_receipt_sha256":g_after_sha,
                          "accepted_f_before_receipt_sha256":before_sha,
                          "independent_g_after_manifest_sha256":independent_manifest,
                          "admin_role_probe":"NOT_RUN","anonymous_admin_probe":"NOT_RUN",
                          "actual_public_app_version":"NOT_MEASURED",
                          "manifest_digest":"NOT_MEASURED",
                          "identity_status":"NOT_CHECKED"}
    with sync_playwright() as pw:
        kw={"headless":True};
        if opts.chromium:kw["executable_path"]=opts.chromium
        browser=pw.chromium.launch(**kw)
        anon=browser.new_context(ignore_https_errors=False)
        def block_write(route):
            if route.request.method not in ("GET","HEAD"):
                route.abort("blockedbyclient")
            else:route.continue_()
        anon.route("**/*",block_write)
        # Distinct read-only credential boundary: frozen endpoint returns 401
        # without a session, 403 for nonadmin, and 200 for a DB-backed admin.
        # Never save endpoint contents, tokens or cookies.
        try:
            negative=anon.request.get(ORIGIN+"/api/admin/central-command",timeout=15000)
            identity["anonymous_admin_probe"]=("ANONYMOUS_401" if negative.status==401
                else "HOLD_UNEXPECTED_ANONYMOUS_STATUS_"+str(negative.status))
        except Exception:
            identity["anonymous_admin_probe"]="HOLD_ANONYMOUS_API_UNREACHABLE"
        for path in PUBLIC:
            for width,height in VIEWPORTS:
                all_rows.append(site_probe(anon,path,(width,height),"anonymous-public",campaign,False,"NOT_APPLICABLE"))
        for path in ADMIN:
            for width,height in VIEWPORTS:
                all_rows.append(site_probe(anon,path,(width,height),"anonymous-admin-negative",campaign,False,identity["anonymous_admin_probe"]))
        if opts.admin_storage_state:
            state=opts.admin_storage_state.expanduser()
            st=state.lstat()
            if not state.is_file() or state.is_symlink() or st.st_mode&0o077 or st.st_uid!=os.getuid():
                raise SystemExit("HOLD:ADMIN_STATE_MUST_BE_PRIVATE_REGULAR_0600")
            auth=browser.new_context(storage_state=str(state),ignore_https_errors=False)
            try:
                positive=auth.request.get(ORIGIN+"/api/admin/central-command",timeout=15000)
                identity["admin_role_probe"]=("AUTHENTICATED_ADMIN_API_200" if positive.status==200
                    else "HOLD_ADMIN_API_STATUS_"+str(positive.status))
            except Exception:
                identity["admin_role_probe"]="HOLD_ADMIN_API_UNREACHABLE"
            for path in ADMIN:
                for width,height in VIEWPORTS:
                    all_rows.append(site_probe(auth,path,(width,height),"authorized-admin",campaign,
                                               opts.capture_private_admin_screenshots,identity["admin_role_probe"]))
            auth.close()
        # R25 identity cannot come from a speculative BUILD_ID HTTP API.
        page=anon.new_page()
        try:
            v=page.request.get(ORIGIN+"/api/deployment-version",timeout=15000)
            if v.status==200:
                identity["actual_public_app_version"]=v.json().get("buildVersion","UNKNOWN")
            asset=page.request.get(ORIGIN+"/_next/static/"+BUILD_ID+"/_buildManifest.js",timeout=15000)
            if asset.status==200:
                identity["manifest_digest"]=hashlib.sha256(asset.body()).hexdigest()
            identity["identity_status"]=("MATCH_INDEPENDENT_R25_PINS" if
                opts.expect_r25 and independent_manifest and
                identity["actual_public_app_version"]==APP_VERSION and
                identity["manifest_digest"]==independent_manifest else "NOT_R25_CERTIFIED")
        except Exception:
            identity["identity_status"]="HOLD_PUBLIC_IDENTITY_FETCH"
        finally:page.close()
        anon.close();browser.close()
    ledger={"schema":"aoe2war.r25.g.browser-evidence.v1",
            "created_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
            "source_sha":FROZEN,"build_id_expected_on_host":BUILD_ID,
            "ci_release_accept":"NOT_ASSERTED_BY_BROWSER",
            "host_poststart_g_before_after":"NOT_ASSERTED_BY_BROWSER",
            "screenshots_sensitive_private_only":True,
            "identity":identity,"rows":all_rows,
            "counts":{"executed":len(all_rows),"holds":sum(x["status"].startswith("HOLD") for x in all_rows)}}
    dest=campaign/"ledger.json";sha=dump_new(dest,ledger)
    print("BROWSER_EVIDENCE_FILE="+str(dest))
    print("BROWSER_EVIDENCE_SHA256="+sha)
    print("HTTP_GET_HEAD_ONLY_NO_SERVICE_OR_FINANCE_MUTATION")
    print("PUBLIC_IDENTITY_STATUS="+identity["identity_status"])
    print("ANONYMOUS_ADMIN_PROBE="+identity["anonymous_admin_probe"])
    print("AUTHENTICATED_ADMIN_PROBE="+identity["admin_role_probe"])
    print("BROWSER_HOLDS="+str(ledger["counts"]["holds"]))
    all_sessions_proven=(identity["identity_status"]=="MATCH_INDEPENDENT_R25_PINS" and
                         identity["anonymous_admin_probe"]=="ANONYMOUS_401" and
                         identity["admin_role_probe"]=="AUTHENTICATED_ADMIN_API_200" and
                         len(all_rows)==(len(PUBLIC)+2*len(ADMIN))*len(VIEWPORTS) and
                         ledger["counts"]["holds"]==0)
    print("PASS:BROWSER_RENDER_AND_ADMIN_ROLE_NEEDS_F_FINAL_ACCEPT" if all_sessions_proven
          else "HOLD:INCOMPLETE_BROWSER_AUTH_R25_IDENTITY_OR_SCREENSHOTS")
    if not all_sessions_proven:
        raise SystemExit(2)


# Recovered original G runner above remains the legacy path. This separate
# production mode binds its measurements to the new candidate's actual F/G
# receipt pair and canonical source census, never old R25 constants.
RECOVERED_RUNNER_SHA256="a053d096b4b8c23b72b822c9069c65e0d5f42416045f2587519a737f5d59adb9"

def private_json(path, maximum=10000000):
    path=path.expanduser()
    st=path.lstat()
    if (not path.is_file() or path.is_symlink() or st.st_uid!=os.getuid()
        or st.st_mode&0o077 or not 2<=st.st_size<=maximum):
        raise ValueError("Owner-local private regular JSON required")
    raw=path.read_bytes()
    return json.loads(raw),hashlib.sha256(raw).hexdigest()

def production_pair(after_path):
    match=re.fullmatch(r"([0-9a-f]{32})-g-after[.]json",after_path.name)
    if not match:raise ValueError("Exact nonce-paired production AFTER filename required")
    after,after_sha=private_json(after_path)
    before,before_sha=private_json(after_path.with_name(match.group(1)+"-g-before.json"))
    for phase,item in (("before",before),("after",after)):
        if (item.get("schema")!="aoe2war.g.app-production.v1" or item.get("phase")!=phase
            or item.get("nonce")!=match.group(1) or item.get("host")!="ubuntu-4gb-hel1-11"
            or item.get("proof")!="SEPARATE_NATIVE_G_OBSERVATION_NOT_HUMAN_REVIEW"
            or item.get("status")!="PRODUCTION_G_"+phase.upper()+"_PASS_PENDING_REAL_AUTHENTICATED_BROWSER"
            or item.get("financial_authorized") is not False
            or item.get("authenticated_browser_roles_verified") is not False
            or item.get("nginx",{}).get("upstream_port")!=(3030 if phase=="before" else 3032)
            or item.get("nginx",{}).get("selectors")!=6):
            raise ValueError("Production native G receipt contract failed")
        for key in ("source_sha","controller_source_sha","build_id","build_version","profile_sha256","manifest_sha256",
                    "native_admission_sha256","candidate_pid","candidate_start_ticks",
                    "protected_units_sha256","ports","release_lock","old_http","candidate_http"):
            if not item.get(key) or item[key]!=before.get(key):
                raise ValueError("Production pair identity/continuity mismatch: "+key)
        if not re.fullmatch(r"[0-9a-f]{40}",str(item["source_sha"])):
            raise ValueError("Production exact source required")
        if not re.fullmatch(r"[0-9a-f]{40}",str(item["controller_source_sha"])):
            raise ValueError("Separately qualified controller source required")
        for key in ("profile_sha256","manifest_sha256","native_admission_sha256","protected_units_sha256"):
            if not SHA64.fullmatch(str(item[key])):raise ValueError("Production receipt digest required")
        if set(map(str,item["ports"]))!={"3030","3031","3032","8092","8093"}:
            raise ValueError("Both web generations and protected finance must be witnessed")
        for port,pid in (("3030",2625090),("3031",1483304),("3032",item["candidate_pid"])):
            if item["ports"][port].get("pid")!=pid:raise ValueError("Protected web PID mismatch")
        if item["ports"]["3032"].get("uid")!=990:raise ValueError("Production UID mismatch")
    asset=after["candidate_http"].get("asset",{})
    if (after["candidate_http"].get("build_version")!=after["build_version"]
        or asset.get("path")!="/_next/static/"+after["build_id"]+"/_buildManifest.js"
        or not SHA64.fullmatch(str(asset.get("sha256"))) or not 1<=asset.get("bytes",0)<=1000000
        or after.get("mac_public")!=after["candidate_http"]):
        raise ValueError("Actual public/static parity missing")
    return before,after,before_sha,after_sha

def production_routes(root):
    public=json.loads((root/"config/kingdom-index-routes.json").read_text())
    inventory=json.loads((root/"config/kingdom-index-inventory.json").read_text())
    routes=tuple(row["href"] for row in public)
    if len(routes)!=88 or len(set(routes))!=88:raise ValueError("Historical 88-route census changed")
    if any(not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]*",p) or p.startswith(("/admin","/api")) for p in routes):
        raise ValueError("Unsafe public route census")
    private=tuple(row["href"] for row in inventory["pages"]
                  if row["href"].startswith("/admin") and "[" not in row["href"])
    if len(private)!=37 or len(set(private))!=37:raise ValueError("Protected Atlas census changed")
    graph=[row for row in inventory["pages"] if row["href"]=="/kingdom-construction"]
    if len(graph)!=1 or graph[0].get("scope")!="excluded-static":
        raise ValueError("Independent B4 route admission missing")
    return routes+("/kingdom-construction",),private

def production_identity(context,after,expected_role):
    # Never persist user payloads, cookie values, request headers or tokens.
    session=context.request.get(ORIGIN+"/api/auth/session",timeout=15000)
    role=context.request.get(ORIGIN+"/api/admin/central-command",timeout=15000)
    profile=context.request.get(ORIGIN+"/api/user/me",timeout=15000)
    if expected_role=="guest":return session.status==401 and profile.status==401 and role.status==401
    if session.status!=200 or profile.status!=200 or role.status!=(200 if expected_role=="admin" else 403):return False
    user=session.json().get("user",{})
    return bool(user.get("uid")) and user.get("isAdmin") is (expected_role=="admin") and "token" not in user

def application_source_equivalent(root,candidate,controller):
    """Controller-only descendants may observe an older exact tested artifact.

    Every application, asset, dependency and runtime configuration path must
    stay identical. A new control tool does not relabel the installed build.
    """
    import subprocess
    if not all(re.fullmatch(r"[0-9a-f]{40}",sha) for sha in (candidate,controller)):
        raise ValueError("Exact artifact and controller commits required")
    subprocess.run(["git","-C",str(root),"merge-base","--is-ancestor",candidate,controller],check=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    changes=subprocess.check_output(["git","-C",str(root),"diff","--no-renames","--name-only",candidate,controller,"--"],text=True).splitlines()
    if any(not path.startswith(("scripts/","tests/","docs/",".github/")) for path in changes):
        raise ValueError("Installed application differs from qualified controller source")
    return True

CANDIDATE_FORWARD_PORT=30332
CANDIDATE_CHROMIUM_ARGS=("--no-proxy-server","--host-resolver-rules=MAP aoe2war.com ~NOTFOUND")

def key_capture_allowed(route,output):
    import shutil
    return route in ("/","/kingdom-construction") and shutil.disk_usage(output).free>=25*1024**3+128*1024**2

def limited_capture_record(row,route,output):
    import shutil
    if row.get("screenshot")=="NOT_CAPTURED":
        row["screenshot"]=("NOT_CAPTURED_CAPACITY_FLOOR" if shutil.disk_usage(output).free<25*1024**3+128*1024**2
                           else "NOT_CAPTURED_KEY_VIEWS_ONLY")
    return row

def candidate_admission(path,expected_sha):
    receipt,observed=private_json(path)
    if not SHA64.fullmatch(expected_sha or "") or observed!=expected_sha:
        raise ValueError("Exact native candidate admission receipt required")
    if not isinstance(receipt,dict) or receipt.get("financial_authorized") is not False or receipt.get("public_cutover_authorized") is not False:
        raise ValueError("Candidate receipt is not a native nonfinancial admission")
    if receipt.get("status")=="PASS_NEW_3032_ADMITTED_NOT_PUBLIC":
        content=receipt.get("content")
        if (receipt.get("browser_roles_verified") is not False or not isinstance(content,dict)
            or not re.fullmatch(r"[0-9a-f]{40}",str(receipt.get("source_sha")))
            or type(receipt.get("pid")) is not int or receipt["pid"]<=1
            or type(receipt.get("ticks")) is not int or receipt["ticks"]<=0
            or not SHA64.fullmatch(str(receipt.get("profile_sha256")))
            or not SHA64.fullmatch(str(receipt.get("read_acl_sha256")))
            or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}",str(content.get("candidate_build_version")))):
            raise ValueError("Scoped upgrade admission identity is incomplete")
        # The flat native upgrade receipt pins this process and profile. G
        # independently measures the artifact and the admitted runtime.
        return receipt,{"source_sha":receipt["source_sha"],"candidate_pid":receipt["pid"],
                        "candidate_start_ticks":receipt["ticks"],"profile_sha256":receipt["profile_sha256"],
                        "build_version":content["candidate_build_version"]}
    if (receipt.get("schema") not in ("aoe2war.app.production-recovery-complete.v1","aoe2war.app.production-started.v1")
        or receipt.get("status")!="PRODUCTION_3032_ADMITTED_NOT_PUBLIC"):
        raise ValueError("Candidate receipt is not a native nonfinancial admission")
    witness=receipt.get("witness",{})
    if (witness.get("schema")!="aoe2war.app.production-witness.v1" or witness.get("status")!="NATIVE_PRODUCTION_PROFILE_PASS"
        or witness.get("source_sha")!=receipt.get("source_sha") or not re.fullmatch(r"[0-9a-f]{40}",str(witness.get("source_sha")))
        or witness.get("uid")!=990 or witness.get("gid")!=984 or witness.get("port")!=3032
        or witness.get("unit")!="aoe2hdbets-web-prod.service" or witness.get("financial_authorized") is not False
        or witness.get("profile")!="nonfinancial-production-v1" or witness.get("original_pid")!=2625090 or witness.get("preview_pid")!=1483304
        or witness.get("stage")!="/var/lib/aoe2war-web-prod-"+witness["source_sha"][:12]
        or witness.get("public_cutover_authorized") is not False or witness.get("read_only_observation") is not True
        or witness.get("candidate_pid")!=receipt.get("candidate_pid") or type(witness.get("candidate_pid")) is not int
        or witness["candidate_pid"]<=1 or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}",str(witness.get("build_id")))
        or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}",str(witness.get("build_version")))):
        raise ValueError("Candidate native identity is incomplete")
    for name in ("profile_sha256","manifest_sha256","admission_sha256"):
        if not SHA64.fullmatch(str(witness.get(name))):raise ValueError("Candidate native evidence digest missing")
    return receipt,witness

def candidate_before(path,expected_sha,witness,controller):
    before,observed=private_json(path)
    if (not SHA64.fullmatch(expected_sha or "") or observed!=expected_sha
        or not isinstance(before,dict)
        or not re.fullmatch(r"[0-9a-f]{32}-g-before[.]json",path.name)
        or before.get("nonce")!=path.name.removesuffix("-g-before.json")
        or before.get("schema")!="aoe2war.g.app-production.v1" or before.get("phase")!="before"
        or before.get("host")!="ubuntu-4gb-hel1-11" or before.get("proof")!="SEPARATE_NATIVE_G_OBSERVATION_NOT_HUMAN_REVIEW"
        or before.get("status")!="PRODUCTION_G_BEFORE_PASS_PENDING_REAL_AUTHENTICATED_BROWSER"
        or before.get("authenticated_browser_roles_verified") is not False
        or before.get("controller_source_sha")!=controller or before.get("financial_authorized") is not False
        or before.get("nginx",{}).get("upstream_port")!=3030 or before.get("nginx",{}).get("selectors")!=6):
        raise ValueError("Single genuine candidate G BEFORE required")
    for name in ("source_sha","build_id","build_version","profile_sha256","manifest_sha256","candidate_pid","candidate_start_ticks"):
        if name in witness and before.get(name)!=witness[name]:raise ValueError("G BEFORE differs from native candidate")
    if (not SHA64.fullmatch(str(before.get("native_admission_sha256")))
        or not SHA64.fullmatch(str(before.get("manifest_sha256")))
        or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}",str(before.get("build_id")))
        or ("admission_sha256" in witness and before["native_admission_sha256"]!=witness["admission_sha256"])):
        raise ValueError("G BEFORE admission digest or artifact identity differs")
    ports=before.get("ports",{})
    if (set(ports)!={"3030","3031","3032","8092","8093"}
        or ports["3030"].get("pid")!=2625090 or ports["3031"].get("pid")!=1483304
        or ports["3032"].get("pid")!=before["candidate_pid"] or ports["3032"].get("uid")!=990):
        raise ValueError("G BEFORE protected listener or candidate UID drift")
    asset=before.get("candidate_http",{}).get("asset",{})
    if (asset.get("path")!="/_next/static/"+before["build_id"]+"/_buildManifest.js" or not SHA64.fullmatch(str(asset.get("sha256")))
        or type(asset.get("bytes")) is not int or not 1<=asset["bytes"]<=1000000):raise ValueError("G BEFORE sealed static bytes missing")
    return before

def candidate_route_policy(url,method):
    try:value=urlsplit(url);port=value.port
    except ValueError:return "DENY"
    if value.username or value.password or value.fragment or value.scheme!="https" or port not in (None,443):
        return "DENY"
    if value.netloc=="aoe2war.com":
        if method in ("GET","HEAD"):return "CANDIDATE"
        if (method,value.path) in (("POST","/api/auth/session"),("DELETE","/api/auth/session"),("POST","/api/user/ping")):
            return "CANDIDATE"
        return "DENY"
    host=value.hostname or ""
    if any(host==domain or host.endswith("."+domain) for domain in ("steamcommunity.com","steampowered.com","steamstatic.com","steamusercontent.com")):
        return "STEAM_OWNER_UI"
    return "DENY"

class CandidateTunnel:
    """Private candidate transport, never a public HTTPS deployment witness."""
    def __init__(self,witness):
        self.witness=witness;self.callback_url=None;self.callbacks=0;self.initiations=0;self.blocked=0
    def attach(self,page):
        # Playwright routing handles only the first URL in a redirect chain.
        # Fetch pauses every hop, including Steam's cross-site callback. DNS
        # for the site is blocked in this browser if interception ever fails.
        session=page.context.new_cdp_session(page)
        session.on("Fetch.requestPaused",lambda event:self.handle(session,event))
        session.send("Fetch.enable",{"patterns":[{"urlPattern":"*","requestStage":"Request"}]})

    def handle(self,session,event):
        request=event["request"]
        request_id={"requestId":event["requestId"]}
        url,method=request["url"],request["method"]
        parsed=urlsplit(url)
        decision=candidate_route_policy(url,method)
        if decision=="STEAM_OWNER_UI":return session.send("Fetch.continueRequest",request_id)
        if (decision!="CANDIDATE" or event.get("resourceType")=="EventSource"
            or parsed.path.startswith(("/downloads/","/download/watcher/","/watch/recordings/"))):
            self.blocked+=1
            return session.send("Fetch.failRequest",{**request_id,"errorReason":"BlockedByClient"})
        from urllib.parse import parse_qs
        if parsed.path=="/api/auth/steam" and method=="GET":
            if parse_qs(parsed.query).get("openid.mode")==["id_res"]:
                # Transient process memory only; never serialized or printed.
                self.callback_url=url;self.callbacks+=1
            else:self.initiations+=1
        try:
            return session.send("Fetch.fulfillRequest",{**request_id,**self.forward(request,parsed)})
        except Exception:
            # No fallback to the old public website; exceptions may contain
            # OpenID signatures or cookie-bearing request details.
            self.blocked+=1
            return session.send("Fetch.failRequest",{**request_id,"errorReason":"Failed"})

    def forward(self,request,parsed):
        excluded={"accept-encoding","connection","content-length","expect","host","keep-alive",
                  "proxy-authorization","proxy-connection","te","trailer","transfer-encoding","upgrade"}
        headers={name:value for name,value in request["headers"].items()
                 if name.lower() not in excluded and not name.lower().startswith("x-forwarded-")}
        headers.update({"Host":"aoe2war.com","X-Forwarded-Host":"aoe2war.com","X-Forwarded-Proto":"https",
                        "Accept-Encoding":"identity"})
        text=request.get("postData")
        if request.get("hasPostData") and not isinstance(text,str):raise ValueError("Missing candidate request body")
        body=text.encode("utf-8") if text is not None else None
        if body is not None and len(body)>65536:raise ValueError("Candidate request body exceeds bound")
        target=(parsed.path or "/")+("?"+parsed.query if parsed.query else "")
        conn=http.client.HTTPConnection("127.0.0.1",CANDIDATE_FORWARD_PORT,timeout=15)
        try:
            conn.request(request["method"],target,body=body,headers=headers)
            response=conn.getresponse()
            if (response.getheader("X-AoE2WAR-Source")!=self.witness["source_sha"]
                or response.getheader("X-AoE2WAR-Build-ID")!=self.witness["build_id"]
                or response.getheader("X-AoE2WAR-Process")!=str(self.witness["candidate_pid"])):
                raise ValueError("Candidate tunnel reached a different source or process")
            limit=16*1024*1024
            raw=response.read(limit+1)
            if len(raw)>limit:raise ValueError("Candidate response exceeds bound")
            # Preserve duplicate Set-Cookie lines and redirect status. Chromium
            # applies its real origin and SameSite policy to the next hop.
            result_headers=[{"name":name,"value":value} for name,value in response.getheaders()
                            if name.lower() not in ("connection","keep-alive","transfer-encoding")]
            return {"responseCode":response.status,"responseHeaders":result_headers,
                    "body":base64.b64encode(raw).decode("ascii")}
        finally:conn.close()

def candidate_browser_probe(page,role):
    # Browser fetches obey its tunnel route. APIRequestContext would bypass
    # browser routing and accidentally probe the old public website instead.
    return page.evaluate("""async role => {
      const read=async path=>{const r=await fetch(path,{credentials:'include',cache:'no-store',redirect:'error'});
        let body=null;try{body=await r.json()}catch{};return {status:r.status,body};};
      const session=await read('/api/auth/session'), profile=await read('/api/user/me'), admin=await read('/api/admin/central-command');
      const user=session.body?.user;
      return {session:session.status,profile:profile.status,admin:admin.status,
        authenticated:session.status===200&&profile.status===200&&typeof user?.uid==='string'&&user.uid===profile.body?.uid,
        expected_role:user?.isAdmin===(role==='admin'),token_absent:!user||!Object.hasOwn(user,'token'),
        subject:typeof user?.uid==='string'?user.uid:null,
        guest_denied:session.status===401&&profile.status===401&&admin.status===401};
    }""",role)

def candidate_static_probe(page,asset):
    return page.evaluate("""async asset => {
      const r=await fetch(asset.path,{cache:'no-store',redirect:'error'});
      const body=await r.arrayBuffer();if(body.byteLength>1000000)return false;
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),b=>b.toString(16).padStart(2,'0')).join('');
      return r.status===200&&body.byteLength===asset.bytes&&digest===asset.sha256;
    }""",asset)

def candidate_session_state(context):
    sessions=[cookie for cookie in context.cookies(ORIGIN) if cookie["name"]=="aoe2hdbets_session"]
    if len(sessions)!=1 or not sessions[0]["secure"] or not sessions[0]["httpOnly"]:
        raise ValueError("Expected one secure purpose-created session")
    return {"cookies":sessions,"origins":[]}

def candidate_auth_main():
    """Keep genuine owner sessions in memory across the separately governed cutover."""
    import subprocess,time,shutil
    ap=argparse.ArgumentParser(description="Owner Steam login against admitted3032; no saved credentials")
    ap.add_argument("--candidate-auth-receipt",type=pathlib.Path,required=True)
    ap.add_argument("--candidate-auth-receipt-sha256",required=True)
    ap.add_argument("--candidate-g-before",type=pathlib.Path,required=True)
    ap.add_argument("--candidate-g-before-sha256",required=True)
    ap.add_argument("--out",type=pathlib.Path,required=True)
    ap.add_argument("--chromium");ap.add_argument("--login-timeout",type=int,default=600)
    opts=ap.parse_args()
    if not 30<=opts.login_timeout<=1800:ap.error("Bounded login timeout30..1800 seconds required")
    _,native=candidate_admission(opts.candidate_auth_receipt,opts.candidate_auth_receipt_sha256)
    root=pathlib.Path(__file__).resolve().parents[1]
    source=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
    if subprocess.check_output(["git","-C",str(root),"status","--porcelain","--untracked-files=no"],text=True):ap.error("Clean qualified source required")
    application_source_equivalent(root,native["source_sha"],source)
    before=candidate_before(opts.candidate_g_before,opts.candidate_g_before_sha256,native,source)
    witness=before
    output=opts.out.expanduser();output.mkdir(mode=0o700,parents=True,exist_ok=True)
    if output.is_symlink() or output.stat().st_mode&0o077:ap.error("Private0700 output required")
    campaign=output/("candidate-auth-"+uuid.uuid4().hex);campaign.mkdir(mode=0o700)
    if shutil.disk_usage(campaign).free<25*1024**3+128*1024**2:
        raise ValueError("M1 capacity floor must be restored before launching a new visible browser")
    from playwright.sync_api import sync_playwright
    results={};contexts={}
    with sync_playwright() as pw:
        launch={"headless":False,"args":["--disk-cache-size=1048576","--media-cache-size=1048576"]}
        if opts.chromium:launch["executable_path"]=opts.chromium
        else:launch["channel"]="chrome"
        candidate_launch={**launch,"args":[*launch["args"],*CANDIDATE_CHROMIUM_ARGS]}
        browser=pw.chromium.launch(**candidate_launch)
        public_browser=None
        try:
            guest=browser.new_context(ignore_https_errors=False,service_workers="block");contexts["guest"]=guest
            page=guest.new_page();CandidateTunnel(witness).attach(page)
            page.goto(ORIGIN+"/__aoe2war_production_guard",wait_until="domcontentloaded")
            guard=page.evaluate("JSON.parse(document.body.innerText)")
            if (guard.get("schema")!="aoe2war.production.process-guard.v1" or guard.get("uid")!=990
                or guard.get("pid")!=witness["candidate_pid"] or guard.get("source_sha")!=witness["source_sha"]
                or guard.get("build_id")!=witness["build_id"] or guard.get("financial_authorized") is not False):raise ValueError("Actual candidate guard identity failed")
            if not candidate_static_probe(page,before["candidate_http"]["asset"]):raise ValueError("Candidate browser static bytes differ")
            if not candidate_browser_probe(page,"guest")["guest_denied"]:raise ValueError("Candidate guest denial failed")
            results["guest"]={"denial_proven":True}
            for role in ("admin","nonadmin"):
                context=browser.new_context(ignore_https_errors=False,service_workers="block");contexts[role]=context
                page=context.new_page();adapter=CandidateTunnel(witness);adapter.attach(page)
                print("OWNER_ACTION: Complete Steam sign-in for the real "+role+" account in the new browser window. Do not send credentials in chat.",flush=True)
                page.goto(ORIGIN+"/api/auth/steam?returnTo=%2Fprofile",wait_until="domcontentloaded",timeout=30000)
                deadline=time.monotonic()+opts.login_timeout;probe=None
                while time.monotonic()<deadline:
                    if urlsplit(page.url).netloc=="aoe2war.com" and urlsplit(page.url).path=="/profile":
                        probe=candidate_browser_probe(page,role)
                        if probe["authenticated"]:break
                    page.wait_for_timeout(500)
                if not probe or not probe["authenticated"] or not probe["expected_role"] or not probe["token_absent"] or probe["admin"]!=(200 if role=="admin" else 403):
                    raise ValueError("Genuine candidate "+role+" authentication not proven")
                if not adapter.initiations or not adapter.callbacks or not adapter.callback_url:raise ValueError("Actual Steam redirect/callback missing")
                page.reload(wait_until="domcontentloaded")
                persisted=candidate_browser_probe(page,role)
                if not persisted["authenticated"] or not persisted["expected_role"] or persisted["subject"]!=probe["subject"]:
                    raise ValueError("Candidate session persistence failed")
                # A real assertion without its browser state must be rejected.
                negative=browser.new_context(ignore_https_errors=False,service_workers="block")
                negative_page=negative.new_page();CandidateTunnel(witness).attach(negative_page)
                negative_page.goto(adapter.callback_url,wait_until="domcontentloaded")
                if not candidate_browser_probe(negative_page,"guest")["guest_denied"]:raise ValueError("Transplanted Steam callback accepted")
                negative.close();adapter.callback_url=None
                # Clone only this purpose-created genuine session in RAM for
                # logout isolation; no state file or existing profile is read.
                logout=browser.new_context(storage_state=candidate_session_state(context),ignore_https_errors=False,service_workers="block")
                logout_page=logout.new_page();CandidateTunnel(witness).attach(logout_page)
                logout_page.goto(ORIGIN+"/__aoe2war_production_guard",wait_until="domcontentloaded")
                status=logout_page.evaluate("async()=> (await fetch('/api/auth/session',{method:'DELETE',credentials:'include',redirect:'error'})).status")
                if status!=200 or not candidate_browser_probe(logout_page,"guest")["guest_denied"]:raise ValueError("Candidate logout failed")
                logout.close()
                results[role]={"actual_steam_callback":True,"role_proven":True,"session_persisted":True,
                               "transplanted_callback_denied":True,"dedicated_browser_logout_proven":True,"global_session_revocation_asserted":False}
            pre={"schema":"aoe2war.g.candidate-auth.v1","status":"CANDIDATE_REAL_STEAM_ROLES_PASS_NOT_PUBLIC",
                 "source_sha":witness["source_sha"],"controller_source_sha":source,"build_id":witness["build_id"],"build_version":witness["build_version"],
                 "candidate_pid":witness["candidate_pid"],"candidate_start_ticks":witness["candidate_start_ticks"],"uid":990,
                 "native_admission_receipt_sha256":opts.candidate_auth_receipt_sha256,"native_admission_sha256":witness["native_admission_sha256"],
                 "g_before_sha256":opts.candidate_g_before_sha256,"candidate_static_parity":True,
                 "profile_sha256":witness["profile_sha256"],"roles":results,"transport":"OWNER_LOCAL_SSH_FORWARD_HTTP_TO_3032",
                 "public_tls_verified":False,"authentication_state_saved":False,"financial_authorized":False}
            pre_sha=dump_new(campaign/"candidate-auth.json",pre)
            print(json.dumps({"status":pre["status"],"receipt":str(campaign/"candidate-auth.json"),"sha256":pre_sha}),flush=True)
            print('WAITING_FOR_GOVERNED_PUBLIC_CUTOVER: send one JSON line {"g_after":"/absolute/nonce-g-after.json","sha256":"exact digest"}; no service or cutover is executed by this runner.',flush=True)
            command=json.loads(sys.stdin.readline(16385))
            if set(command)!={"g_after","sha256"} or not SHA64.fullmatch(str(command["sha256"])):raise ValueError("Exact public witness command required")
            after_path=pathlib.Path(command["g_after"])
            if not after_path.is_absolute():raise ValueError("Absolute public witness path required")
            before,after,before_sha,after_sha=production_pair(after_path)
            if (after_sha!=command["sha256"] or before_sha!=opts.candidate_g_before_sha256 or after["source_sha"]!=witness["source_sha"]
                or after["controller_source_sha"]!=source or after["profile_sha256"]!=witness["profile_sha256"]):
                raise ValueError("Public cutover differs from authenticated candidate")
            rows=[];public,private=production_routes(root)
            # A new unmodified Chromium reaches actual public HTTPS. Only the
            # dedicated session cookie crosses in memory; no profile is saved.
            states={role:candidate_session_state(context) if role!="guest" else None for role,context in contexts.items()}
            browser.close();browser=None
            public_browser=pw.chromium.launch(**launch)
            for role,state in states.items():
                context=public_browser.new_context(storage_state=state,ignore_https_errors=False,service_workers="block")
                context.route("**/*",lambda route:route.continue_() if route.request.method in ("GET","HEAD") else route.abort("blockedbyclient"))
                if not production_identity(context,after,role):raise ValueError("Genuine role did not persist through public cutover")
                if role=="guest":
                    version=context.request.get(ORIGIN+"/api/deployment-version",timeout=15000)
                    static=context.request.get(ORIGIN+after["candidate_http"]["asset"]["path"],timeout=15000)
                    if (version.status!=200 or version.json().get("buildVersion")!=witness["build_version"] or static.status!=200
                        or hashlib.sha256(static.body()).hexdigest()!=after["candidate_http"]["asset"]["sha256"]):
                        raise ValueError("Public browser build/static parity failed")
                for path in public:
                    for viewport in VIEWPORTS:
                        row=site_probe(context,path,viewport,"anonymous-public",campaign,False,"NOT_APPLICABLE",
                                       capture_any=role=="guest" and key_capture_allowed(path,campaign))
                        limited_capture_record(row,path,campaign)
                        row["session"]=role+"-public";rows.append(row)
                for path in private:
                    for viewport in VIEWPORTS:
                        proof="AUTHENTICATED_ADMIN_API_200" if role=="admin" else ("NONADMIN_403" if role=="nonadmin" else "ANONYMOUS_401")
                        session="authorized-admin" if role=="admin" else ("nonadmin-admin-negative" if role=="nonadmin" else "anonymous-admin-negative")
                        row=site_probe(context,path,viewport,session,campaign,False,proof,capture_any=False)
                        limited_capture_record(row,path,campaign)
                        row["session"]=role+"-protected";rows.append(row)
                context.close()
            expected=(len(public)+len(private))*3*len(VIEWPORTS);holds=sum(not row["status"].startswith("PASS") for row in rows)
            result={"schema":"aoe2war.g.app-production.browser.v1","source_sha":witness["source_sha"],"controller_source_sha":source,
                    "build_id":witness["build_id"],"build_version":witness["build_version"],"nonce":after["nonce"],
                    "candidate_auth_sha256":pre_sha,"g_before_sha256":before_sha,"g_after_sha256":after_sha,"real_role_probes":{role:True for role in contexts},
                    "historical_public_routes":88,"independent_public_routes":1,"protected_routes":37,"viewports":[v[0] for v in VIEWPORTS],
                    "expected_cases":expected,"executed_cases":len(rows),"holds":holds,"rows":rows,"financial_authorized":False,
                    "real_steam_login_asserted_by_census":True,"authentication_state_saved":False,
                    "public_static_parity":True,"valid_expired_jwt_runtime_verified":False,
                    "status":"BROWSER_CENSUS_PASS_REQUIRES_F_FINAL_ACCEPT" if len(rows)==expected and holds==0 else "HOLD_BROWSER_CENSUS"}
            digest=dump_new(campaign/"ledger.json",result)
            print(json.dumps({"status":result["status"],"receipt":str(campaign/"ledger.json"),"sha256":digest,"holds":holds}),flush=True)
            return 0 if holds==0 and len(rows)==expected else 2
        except Exception as error:
            hold={"schema":"aoe2war.g.candidate-auth.v1","status":"HOLD_CANDIDATE_OR_PUBLIC_BROWSER","failure_type":type(error).__name__,
                  "roles_completed":results,"source_sha":witness["source_sha"],"candidate_pid":witness["candidate_pid"],
                  "public_deployment_asserted":False,"financial_authorized":False,"authentication_state_saved":False}
            digest=dump_new(campaign/"hold.json",hold)
            print(json.dumps({"status":hold["status"],"receipt":str(campaign/"hold.json"),"sha256":digest}),flush=True)
            return 2
        finally:
            if browser is not None:browser.close()
            if public_browser is not None:public_browser.close()

def production_main():
    global BUILD_ID,APP_VERSION,FROZEN,PUBLIC,ADMIN
    import subprocess
    ap=argparse.ArgumentParser(description="G production acceptance using genuine owner-local sessions")
    ap.add_argument("--production-g-after",type=pathlib.Path,required=True)
    ap.add_argument("--out",type=pathlib.Path,required=True)
    ap.add_argument("--admin-storage-state",type=pathlib.Path,required=True)
    ap.add_argument("--nonadmin-storage-state",type=pathlib.Path,required=True)
    ap.add_argument("--chromium")
    ap.add_argument("--capture-private-admin-screenshots",action="store_true")
    opts=ap.parse_args()
    before,after,before_sha,after_sha=production_pair(opts.production_g_after)
    root=pathlib.Path(__file__).resolve().parents[1]
    source=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
    dirty=subprocess.check_output(["git","-C",str(root),"status","--porcelain","--untracked-files=no"],text=True)
    if source!=after["controller_source_sha"] or dirty:ap.error("Exact clean CI-qualified controller source required")
    application_source_equivalent(root,after["source_sha"],source)
    PUBLIC,ADMIN=production_routes(root)
    BUILD_ID=after["build_id"];APP_VERSION=after["build_version"];FROZEN=after["source_sha"]
    for state in (opts.admin_storage_state,opts.nonadmin_storage_state):private_json(state)
    output=opts.out.expanduser();output.mkdir(mode=0o700,parents=True,exist_ok=True)
    if output.is_symlink() or output.stat().st_mode&0o077:ap.error("Private0700 output required")
    campaign=output/("g-production-"+after["nonce"]+"-"+uuid.uuid4().hex[:8]);campaign.mkdir(mode=0o700)
    from playwright.sync_api import sync_playwright
    rows=[];roles={};identity=False
    with sync_playwright() as pw:
        kw={"headless":True}
        if opts.chromium:kw["executable_path"]=opts.chromium
        browser=pw.chromium.launch(**kw)
        try:
            for role,state in (("guest",None),("admin",opts.admin_storage_state),("nonadmin",opts.nonadmin_storage_state)):
                context=browser.new_context(storage_state=str(state) if state else None,ignore_https_errors=False,service_workers="block")
                context.route("**/*",lambda route:route.continue_() if route.request.method in ("GET","HEAD") else route.abort("blockedbyclient"))
                roles[role]=production_identity(context,after,role)
                if not roles[role]:
                    context.close();continue
                if role=="guest":
                    v=context.request.get(ORIGIN+"/api/deployment-version",timeout=15000)
                    asset=context.request.get(ORIGIN+after["candidate_http"]["asset"]["path"],timeout=15000)
                    identity=(v.status==200 and v.json().get("buildVersion")==APP_VERSION and asset.status==200
                              and hashlib.sha256(asset.body()).hexdigest()==after["candidate_http"]["asset"]["sha256"])
                for path in PUBLIC:
                    for viewport in VIEWPORTS:
                        row=site_probe(context,path,viewport,"anonymous-public",campaign,role=="guest","NOT_APPLICABLE",
                                       capture_any=(role=="guest" or opts.capture_private_admin_screenshots) and key_capture_allowed(path,campaign))
                        limited_capture_record(row,path,campaign)
                        row["session"]=role+"-public";rows.append(row)
                for path in ADMIN:
                    for viewport in VIEWPORTS:
                        proof="AUTHENTICATED_ADMIN_API_200" if role=="admin" else ("NONADMIN_403" if role=="nonadmin" else "ANONYMOUS_401")
                        row=site_probe(context,path,viewport,"authorized-admin" if role=="admin" else ("nonadmin-admin-negative" if role=="nonadmin" else "anonymous-admin-negative"),
                                       campaign,opts.capture_private_admin_screenshots,proof,
                                       capture_any=False)
                        limited_capture_record(row,path,campaign)
                        row["session"]=role+"-protected";rows.append(row)
                context.close()
        finally:browser.close()
    expected=(len(PUBLIC)+len(ADMIN))*len(VIEWPORTS)*3
    holds=sum(not row["status"].startswith("PASS") for row in rows)
    passed=identity and all(roles.values()) and len(roles)==3 and len(rows)==expected and holds==0
    result={"schema":"aoe2war.g.app-production.browser.v1","source_sha":FROZEN,"controller_source_sha":source,
            "application_source_unchanged":True,"build_id":BUILD_ID,
            "build_version":APP_VERSION,"nonce":after["nonce"],"g_before_sha256":before_sha,"g_after_sha256":after_sha,
            "real_role_probes":roles,"public_static_parity":identity,"historical_public_routes":88,
            "independent_public_routes":1,"protected_routes":37,"viewports":[v[0] for v in VIEWPORTS],
            "expected_cases":expected,"executed_cases":len(rows),"holds":holds,"rows":rows,
            "financial_authorized":False,"real_steam_login_asserted_by_census":False,
            "status":"BROWSER_CENSUS_PASS_REQUIRES_SEPARATE_REAL_STEAM_AND_F_FINAL_ACCEPT" if passed else "HOLD_BROWSER_CENSUS"}
    digest=dump_new(campaign/"ledger.json",result)
    print(json.dumps({"status":result["status"],"receipt":str(campaign/"ledger.json"),"sha256":digest,"executed":len(rows),"holds":holds}))
    return 0 if passed else 2

if __name__=="__main__":
    if "--candidate-auth-receipt" in sys.argv:sys.exit(candidate_auth_main())
    if "--production-g-after" in sys.argv:sys.exit(production_main())
    main()
