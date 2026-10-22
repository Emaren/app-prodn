#!/usr/bin/env python3
"""Source-pinned *real Next.js* Kingdom Brain acceptance. No production endpoints.
CI prereqs: Python playwright==1.57.0, existing system Chrome, frozen Yarn/Prisma
dependencies, complete checked-out PR HEAD and a built .next/BUILD_ID.

Two distinctly labelled cohorts:
  REAL_NEXT_UNMOCKED_API: actual loopback Next APIs, no injected responses.
  REAL_NEXT_CONTROLLED_API_FIXTURE: real Next route/React hydration, intercepted
  read-only API responses. Fixtures are never independent health proof.
"""
import argparse
import asyncio
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright

API = ("index", "agents", "patrol", "route-census")
ENDPOINTS = tuple("/api/kingdom-" + x for x in API)
NOW = datetime.now(timezone.utc)
def stamp(t):
    return t.isoformat(timespec="milliseconds").replace("+00:00", "Z")
def pctl(values, q):
    if not values: return None
    s=sorted(values); point=(len(s)-1)*q; lo=math.floor(point); hi=math.ceil(point)
    return round(s[lo]+(s[hi]-s[lo])*(point-lo), 2)
def check(condition, label, checks):
    checks[label]=bool(condition)
def status_map(page):
    return page.locator('section[aria-label^="Source-specific signal status"] > div')
async def statuses(page):
    rows=status_map(page)
    result={}
    for i in range(await rows.count()):
        row=rows.nth(i)
        label=(await row.locator("small").first.inner_text()).strip()
        result[label]=(await row.locator("strong").first.inner_text()).strip()
    return result
def fixtures(now, index_age_ms=0, bad_agents=False, unavailable_agents=False):
    when=lambda age:stamp(now-timedelta(milliseconds=age))
    return {
        "index": {"schema":1, "source":"file", "generatedAt":when(index_age_ms),
                  "pages":[], "observed":0, "certified":0},
        "agents": {"schema":1, "observedAt":when(0), "releaseSha":"a"*12, "agents":[],
                   "sources":{"intelligence":True, "inspections":True,
                              "intelligenceStale":False,
                              "releaseAlignment":"mismatch" if bad_agents else "aligned"}},
        "patrol":{"schema":1, "generatedAt":when(0), "policyVersion":"fixture-policy",
                  "agentsRunning":None,"registered":1,"assigned":1,
                  "entries":[{"status":"POLICY_ONLY"}]},
        "route-census":{"schema":1,"status":"verified",
                  "source":"deployed-next-app-paths-manifest",
                  "capturedAt":when(0), "buildVersion":"FIXTURE_NOT_BUILD_ID",
                  "counts":{"totalPages":14,"apiHandlers":20}},
        "_agents_unavailable":unavailable_agents,
    }
def preflight(args):
    parsed=urlparse(args.url)
    if parsed.scheme!="http" or parsed.hostname not in ("127.0.0.1","localhost") or parsed.port is None:
        raise ValueError("only explicit loopback http://127.0.0.1:PORT permitted")
    if not re.fullmatch(r"[a-f0-9]{40}", args.sha):raise ValueError("invalid full source SHA")
    repo=Path(args.repo).resolve()
    if not (repo/".git").exists():raise ValueError("missing real Git checkout")
    def git(*argv):
        return subprocess.check_output(["git","-C",str(repo),*argv],text=True).strip()
    if git("rev-parse","HEAD")!=args.sha:raise ValueError("checkout is not requested exact commit")
    if git("status","--porcelain","--untracked-files=no"):
        raise ValueError("tracked source dirty at start; abort")
    if not (repo/"node_modules"/"next"/"dist"/"bin"/"next").is_file():
        raise ValueError("installed frozen Next package unavailable")
    build=repo/".next"/"BUILD_ID"
    if not build.is_file() or not build.read_text().strip():
        raise ValueError("no emitted .next/BUILD_ID")
    chrome=Path(args.chrome)
    if not chrome.exists():raise ValueError("no system Chrome executable: "+str(chrome))
    return repo, build.read_text().strip(),git("rev-parse","HEAD:app/kingdom-brain/KingdomBrainClient.tsx")
def start_next(repo, url):
    parsed=urlparse(url)
    safe={k:os.environ[k] for k in ("PATH","HOME","TMPDIR") if k in os.environ}
    safe.update(NODE_ENV="production", DATABASE_URL="postgresql://ci:ci@127.0.0.1:5432/aoe2war_ci",
                SESSION_SECRET="isolated-acceptance-only", NEXTAUTH_SECRET="isolated-acceptance-only",
                NEXTAUTH_URL=url)
    log=open("/tmp/kingdom-brain-next-acceptance.log","w")
    process=subprocess.Popen(["node",str(repo/"node_modules"/"next"/"dist"/"bin"/"next"),
                              "start","--hostname","127.0.0.1","--port",str(parsed.port)],
                             cwd=repo,env=safe,stdout=log,stderr=subprocess.STDOUT)
    try:
        for _ in range(90):
            if process.poll() is not None:raise RuntimeError("next exited: "+str(process.returncode))
            try:
                with urllib.request.urlopen(url+"/kingdom-brain",timeout=1) as resp:
                    if resp.status==200:return process,log
            except Exception:pass
            time.sleep(.4)
        raise RuntimeError("Next route failed loopback readiness")
    except:
        process.terminate();process.wait(timeout=8);log.close();raise
def close_next(proc,log):
    if proc.poll() is None:
        proc.terminate()
        try:proc.wait(timeout=8)
        except subprocess.TimeoutExpired:proc.kill()
    log.close()
async def new_page(browser, viewport):
    ctx=await browser.new_context(viewport=viewport, reduced_motion="reduce",
                service_workers="block", ignore_https_errors=False)
    return ctx,await ctx.new_page()
async def guard(page,counts):
    async def handler(route):
        request=route.request
        url=urlparse(request.url)
        if url.hostname not in ("127.0.0.1","localhost") or request.method not in ("GET","HEAD"):
            counts["blocked"]+=1
            await route.abort()
        else:await route.continue_()
    await page.route("**/*",handler)
    def on_req(req):
        path=urlparse(req.url).path
        if path in ENDPOINTS:counts["api"][path]=counts["api"].get(path,0)+1
    page.on("request",on_req)
async def mount(page,url,counts):
    start=time.perf_counter()
    response=await page.goto(url+"/kingdom-brain",wait_until="domcontentloaded",timeout=45000)
    await page.locator("h1").wait_for(timeout=18000)
    try:
        await page.wait_for_function(
            "() => document.querySelector('section[aria-label^=\"Source-specific signal status\"]')?.querySelectorAll('strong').length===4",
            timeout=12000)
    except Exception:pass
    await page.wait_for_timeout(350)
    return response,round((time.perf_counter()-start)*1000,2)
async def one_real(browser,args,viewport,label,n,output):
    ctx,page=await new_page(browser,viewport)
    cnt={"api":{},"blocked":0};errors=[];asset_count=[0];payload=[]
    await guard(page,cnt)
    page.on("pageerror",lambda error:errors.append(str(error)[:250]))
    async def response_hook(resp):
        path=urlparse(resp.url).path
        if "/_next/static/" in path and resp.ok:asset_count[0]+=1
        if path in ENDPOINTS:
            reported=resp.headers.get("content-length")
            info={"path":path,"status":resp.status,"contentLength":reported,"bodyBytes":None}
            try:
                if reported is None or int(reported)<=262_144:
                    info["bodyBytes"]=len(await resp.body())
            except Exception:
                pass
            payload.append(info)
    page.on("response",lambda r:asyncio.create_task(response_hook(r)))
    response,latency=await mount(page,args.url,cnt)
    # Wait for actual useEffect fetches rather than inferring hydration from HTML.
    for _ in range(40):
        if all(cnt["api"].get(path,0)>=1 for path in ENDPOINTS):break
        await page.wait_for_timeout(200)
    graph=page.locator('button[aria-pressed]')
    checks={}
    check(bool(response and response.status==200),"http_200",checks)
    check(await graph.count()==14,"fourteen_graph_nodes",checks)
    expected_nodes=json.loads((Path(args.repo)/"config"/"kingdom-brain-authorities.json").read_text())["nodes"]
    expected_labels={node["label"] for node in expected_nodes}
    actual_labels=set(await page.locator('button[aria-pressed] > span:nth-of-type(2)').all_inner_texts())
    check(len(expected_nodes)==14 and actual_labels==expected_labels,
          "all_14_exact_authority_labels",checks)
    check(await page.locator('[aria-live="polite"]').count()>=1,"status_announced",checks)
    check(asset_count[0]>0,"next_static_assets_loaded",checks)
    check(cnt["blocked"]==0,"no_blocked_external_or_mutation",checks)
    check(all(cnt["api"].get(path,0)==1 for path in ENDPOINTS),"exactly_four_initial_gets",checks)
    width=await page.evaluate("({w:document.documentElement.scrollWidth,v:innerWidth})")
    check(width["w"]<=width["v"]+2,"no_document_horizontal_overflow",checks)
    check(await page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),
          "reduced_motion_requested",checks)
    if await graph.count()>=2:
        button=graph.nth(1)
        await page.keyboard.press("Tab")  # keyboard modality before focus-visible assertion
        await button.focus();await button.press("Enter")
        check(await button.get_attribute("aria-pressed")=="true","keyboard_select_node",checks)
        check(await button.evaluate("(e)=>document.activeElement===e"),"focus_retained",checks)
        check(await button.evaluate("(e)=>e.matches(':focus-visible') && getComputedStyle(e).borderStyle!=='none'"),"visible_focus_treatment",checks)
    else:
        check(False,"keyboard_select_node",checks)
    status=await statuses(page)
    cdp=await ctx.new_cdp_session(page);await cdp.send("Performance.enable")
    metrics=await cdp.send("Performance.getMetrics")
    heap=next((x["value"] for x in metrics.get("metrics",[]) if x["name"]=="JSHeapUsedSize"),None)
    if n==0:
        await page.screenshot(path=str(output/f"real-{label}.png"),full_page=True)
        # One user-triggered refresh, 4 more read-only API requests, no timer loop.
        before=dict(cnt["api"])
        try:
            refresh=page.get_by_role("button",name="Refresh authority signals")
            await refresh.wait_for(state="visible",timeout=12000)
            await refresh.click(timeout=12000)
            for _ in range(40):
                if all(cnt["api"].get(path,0)>=before.get(path,0)+1 for path in ENDPOINTS):break
                await page.wait_for_timeout(200)
            check(all(cnt["api"].get(path,0)==before.get(path,0)+1 for path in ENDPOINTS),
                  "one_manual_refresh_adds_exactly_four_gets",checks)
        except Exception as error:
            checks["one_manual_refresh_adds_exactly_four_gets"]=False
            errors.append("Manual refresh: "+str(error)[:200])
    await ctx.close()
    return {"n":n+1,"navigationMs":latency,"checks":checks,"states":status,"heapBytes":heap,
            "requests":cnt,"apiResponses":payload,"width":width,"pageErrors":errors}
async def fixture_case(browser,args,name,mapping,clock=None):
    ctx,page=await new_page(browser,{"width":1280,"height":800})
    cnt={"api":{},"blocked":0};await guard(page,cnt)
    if clock is not None:await page.clock.install(time=clock)
    async def respond(route):
        key=urlparse(route.request.url).path.removeprefix("/api/kingdom-")
        if key=="agents" and mapping.get("_agents_unavailable"):
            await route.fulfill(status=503,content_type="application/json",body='{"error":"fixtures:denied"}')
            return
        await route.fulfill(status=200,content_type="application/json",
                            body=json.dumps(mapping[key],separators=(",",":")))
    for path in ENDPOINTS:await page.route("**"+path,respond)
    response,ms=await mount(page,args.url,cnt)
    await page.wait_for_timeout(200)
    initial=await statuses(page)
    result={"name":name,"mode":"REAL_NEXT_CONTROLLED_API_FIXTURE",
            "httpStatus":response.status if response else None,
            "initial":initial,"navigationMs":ms,"apiRequestCountsBefore":dict(cnt["api"])}
    if name=="fresh":
        result["passed"]=initial=={"INDEX":"OBSERVED","AGENTS":"OBSERVED",
                                    "PATROL":"POLICY-ONLY","CENSUS":"OBSERVED"}
    elif name=="stale":
        result["passed"]=initial.get("INDEX")=="STALE" and initial.get("PATROL")=="POLICY-ONLY"
    elif name=="denied":
        result["passed"]=initial.get("AGENTS")=="UNVERIFIED" and initial.get("CENSUS")=="OBSERVED"
    elif name=="partial":
        result["passed"]=initial.get("AGENTS")=="UNAVAILABLE" and initial.get("INDEX")=="OBSERVED"
    elif name=="malformed":
        result["passed"]=initial.get("INDEX")=="UNVERIFIED" and initial.get("CENSUS")=="UNVERIFIED" and initial.get("PATROL")=="POLICY-ONLY"
    elif name=="future":
        result["passed"]=initial.get("INDEX")=="UNVERIFIED" and initial.get("AGENTS")=="OBSERVED"
    elif name=="expiry":
        # API source initially only 1100ms from expiration; run the actual
        # app's one-shot timer ahead in real Chromium, not a helper mock.
        result["initialOkay"]=initial.get("INDEX")=="OBSERVED"
        await page.clock.run_for(5000)
        updated=await statuses(page)
        result["final"]=updated
        result["apiRequestCountsAfter"]=dict(cnt["api"])
        result["passed"]=result["initialOkay"] and updated.get("INDEX")=="STALE" and updated.get("PATROL")=="POLICY-ONLY" and cnt["api"]==result["apiRequestCountsBefore"]
    else:result["passed"]=False
    await ctx.close()
    return result
async def lifecycle_race_case(browser,args):
    """Real Next page with controlled delayed GETs; independent of mocked React."""
    ctx,page=await new_page(browser,{"width":1280,"height":800})
    counts={"api":{},"blocked":0};await guard(page,counts)
    started=asyncio.Event();release_old=asyncio.Event()
    third_started=asyncio.Event();release_third=asyncio.Event()
    number=[0];errors=[];page.on("pageerror",lambda e:errors.append(str(e)[:250]))
    source=fixtures(datetime.now(timezone.utc))
    old=fixtures(datetime.now(timezone.utc),index_age_ms=360_000)["index"]
    async def serve(route):
        key=urlparse(route.request.url).path.removeprefix("/api/kingdom-")
        if key=="index":
            number[0]+=1
            i=number[0]
            if i==1:
                started.set();await release_old.wait()
            if i==3:
                third_started.set();await release_third.wait()
            payload=old if i==1 else source["index"]
        else:payload=source[key]
        try:
            await route.fulfill(status=200,content_type="application/json",
                                body=json.dumps(payload,separators=(",",":")))
        except Exception:
            # Browser AbortController may cancel the request before fixture
            # fulfillment. This does not count as a healthy response.
            pass
    for path in ENDPOINTS:await page.route("**"+path,serve)
    report={"name":"race_visibility_unmount","mode":"REAL_NEXT_CONTROLLED_API_FIXTURE",
            "passed":False,"source":"real Next page, delayed read-only endpoints"}
    spare=None
    try:
        await mount(page,args.url,counts)
        await asyncio.wait_for(started.wait(),timeout=12)
        spare=await ctx.new_page();await spare.bring_to_front()
        await page.wait_for_function("document.visibilityState==='hidden'",timeout=6000)
        report["hidden"]=True
        await page.bring_to_front()
        await page.wait_for_function("document.visibilityState==='visible'",timeout=6000)
        report["returnedVisible"]=True
        for _ in range(50):
            if (await statuses(page)).get("INDEX")=="OBSERVED":break
            await page.wait_for_timeout(200)
        report["latestBeforeOld"]=(await statuses(page)).get("INDEX")
        release_old.set()
        await page.wait_for_timeout(500)
        report["latestAfterOld"]=(await statuses(page)).get("INDEX")
        # An additional in-flight refresh must be aborted on unmount.
        refresh=page.get_by_role("button",name="Refresh authority signals")
        await refresh.click(timeout=12000)
        await asyncio.wait_for(third_started.wait(),timeout=12)
        await page.goto(args.url+"/kingdom-index",wait_until="domcontentloaded",timeout=20000)
        release_third.set()
        await page.wait_for_timeout(500)
        report["unmounted"]=not page.url.endswith("/kingdom-brain")
        report["indexRequests"]=number[0]
        report["allApiRequests"]=dict(counts["api"])
        report["pageErrors"]=errors
        report["passed"]=all((report["latestBeforeOld"]=="OBSERVED",
                              report["latestAfterOld"]=="OBSERVED",
                              report["hidden"],report["returnedVisible"],
                              report["unmounted"],number[0]==3,
                              not errors,counts["blocked"]==0))
    except Exception as error:
        report["error"]=str(error)[:300]
    finally:
        release_old.set();release_third.set()
        if spare is not None:await spare.close()
        await ctx.close()
    return report

async def run(args,repo,build,blob):
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    report={"status":"RUNNING","sourceSha":args.sha,"clientBlobSha":blob,"emittedBuildId":build,
            "mode":"REAL_NEXT_APPLICATION","environment":"GitHub Actions Ubuntu Chrome/loopback",
            "sampleCountPerViewport":args.samples,"realApi":[],"controlledFixtures":[],
            "metrics":{},"allowedNetwork":"loopback read-only GET/HEAD","productionAttested":False}
    proc,log=start_next(repo,args.url)
    try:
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(executable_path=args.chrome,headless=True,
                              args=["--no-sandbox","--disable-dev-shm-usage"])
            for label,vp in (("desktop",{"width":1440,"height":900}),("mobile",{"width":375,"height":812})):
                timings=[]
                for n in range(args.samples):
                    result=await one_real(browser,args,vp,label,n,output)
                    report["realApi"].append({"viewport":label,**result})
                    timings.append(result["navigationMs"])
                report["metrics"][label]={"n":len(timings),"p75Ms":pctl(timings,.75),"p95Ms":pctl(timings,.95),
                                          "rawMs":timings}
            moment=datetime.now(timezone.utc)
            data=[
                ("fresh",fixtures(moment)),
                ("stale",fixtures(moment,index_age_ms=360_000)),
                ("denied",fixtures(moment,bad_agents=True)),
                ("partial",fixtures(moment,unavailable_agents=True)),
                ("malformed",dict(fixtures(moment),index=dict(fixtures(moment)["index"],generatedAt="NOT_A_DATE"),
                                  **{"route-census":dict(fixtures(moment)["route-census"],capturedAt=None)})),
                ("future",fixtures(moment,index_age_ms=-60_000)),
                ("expiry",fixtures(moment,index_age_ms=296_000)),
            ]
            for name,mapping in data:
                report["controlledFixtures"].append(await fixture_case(browser,args,name,mapping,
                    clock=moment if name=="expiry" else None))
            report["controlledFixtures"].append(await lifecycle_race_case(browser,args))
            await browser.close()
        report["status"]="PASS" if all(all(x["checks"].values()) and not x["pageErrors"] for x in report["realApi"]) and all(x["passed"] for x in report["controlledFixtures"]) else "FAIL"
    finally:
        close_next(proc,log)
    return report
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",required=True)
    ap.add_argument("--sha",required=True)
    ap.add_argument("--url",default="http://127.0.0.1:3108")
    ap.add_argument("--chrome",required=True)
    ap.add_argument("--samples",type=int,default=6)
    ap.add_argument("--output",required=True)
    args=ap.parse_args()
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    report={"status":"BLOCKED","sourceSha":args.sha,"productionAttested":False}
    try:
        if args.samples<3 or args.samples>20:raise ValueError("samples must be 3..20")
        repo,build,blob=preflight(args)
        report=asyncio.run(run(args,repo,build,blob))
    except Exception as error:
        report.update({"status":"BLOCKED","errorType":type(error).__name__,"error":str(error)[:500]})
    (out/"brain-next-app-receipt.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"status":report["status"],"sha":args.sha,
         "buildId":report.get("emittedBuildId"),
         "desktop":report.get("metrics",{}).get("desktop"),
         "mobile":report.get("metrics",{}).get("mobile"),
         "fixtures":report.get("controlledFixtures"),
         "error":report.get("error")},indent=2))
    return 0 if report["status"]=="PASS" else 2
if __name__=="__main__":sys.exit(main())
