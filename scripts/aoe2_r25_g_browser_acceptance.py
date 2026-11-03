#!/usr/bin/env python3
"""R25 G: owner-browser-only read-only HTTP GET/HEAD viewport acceptance.

No SSH, shell/root, service changes, Nginx actions, write HTTP requests,
credentials collection, or source/build mutation. Uses Playwright + Chromium.
The browser only visits the public aoe2war.com origin. Admin requires an
already-authorized, owner-local Playwright storage-state file. Never share it.
This is supplementary to, NOT a substitute for, native G BEFORE/AFTER or F.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
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
                        row=site_probe(context,path,viewport,"anonymous-public",campaign,role=="guest","NOT_APPLICABLE",capture_any=(role=="guest" or opts.capture_private_admin_screenshots))
                        row["session"]=role+"-public";rows.append(row)
                for path in ADMIN:
                    for viewport in VIEWPORTS:
                        proof="AUTHENTICATED_ADMIN_API_200" if role=="admin" else ("NONADMIN_403" if role=="nonadmin" else "ANONYMOUS_401")
                        row=site_probe(context,path,viewport,"authorized-admin" if role=="admin" else ("nonadmin-admin-negative" if role=="nonadmin" else "anonymous-admin-negative"),
                                       campaign,opts.capture_private_admin_screenshots,proof,
                                       capture_any=(role=="guest" or opts.capture_private_admin_screenshots))
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
    if "--production-g-after" in sys.argv:sys.exit(production_main())
    main()
