#!/usr/bin/env python3
"""Read-only REAL Next.js/Chromium acceptance for Kingdom Tests.

Requires exact PR #807 Git SHA, clean tracked source and emitted .next/BUILD_ID.
Loopback-only proxy forwards actual Next HTML, RSC and assets. The controlled
inspection endpoint emits real HTTP chunked responses, NOT Playwright route.fulfill.
This is an isolated CI fixture and NEVER proof of production or certification.
"""
import argparse
import asyncio
import datetime as dt
import http.client
import json
import math
import os
import re
import pathlib
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from playwright.async_api import async_playwright

SHA = os.environ.get("EXPECTED_CANDIDATE_SHA", "")
NOW = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
HOP = {"connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer"}

def payload(age=NOW, duplicate=False, empty=False, hostile=False, bad_sha=False):
    check = {"id": "node-tests",
             "label": "<img src=x onerror=alert(1)>" if hostile else "Node contracts",
             "detail": "<script>window.__owned=1</script>" if hostile else "Source claims PASS",
             "state": "green", "earned": 100, "evidenceAt": age}
    return {"schema": 1, "generatedAt": NOW, "releaseSha": "FAKE" if bad_sha else "a"*40,
            "buildVersion": "fixture-not-attested", "overallScore": 100,
            "passed": 99999, "executed": 99999, "certified": True,
            "categories": [{"id": "tests", "state": "green", "score": 100,
                            "checks": [] if empty else [check, dict(check)] if duplicate else [check]}]}

class Proxy(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, upstream_port):
        super().__init__(("127.0.0.1", 0), Handler)
        self.upstream_port, self.mode, self.events = upstream_port, "passthrough", []
        self.lock = threading.Lock()
    def record(self, **entry):
        with self.lock:
            self.events.append({"timestamp": time.time(), **entry})

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *_): pass
    def do_POST(self): self.send_error(405, "Read-only acceptance")
    do_DELETE = do_PUT = do_PATCH = do_POST
    def do_GET(self):
        if urlparse(self.path).path != "/api/general-inspections" or self.server.mode == "passthrough":
            return self.forward()
        mode = self.server.mode
        if mode in ("timeout", "late"): time.sleep(14 if mode == "timeout" else 2)
        if mode == "http_503":
            self.send_response(503); self.send_header("Content-Length", "0"); self.end_headers()
            self.server.record(mode=mode, status=503); return
        age = "2020-01-01T00:00:00.000Z" if mode == "stale" else (
            "2099-01-01T00:00:00.000Z" if mode == "future" else NOW)
        data = (b"{broken" if mode == "malformed" else json.dumps(
            payload(age=age, duplicate=mode == "duplicate", empty=mode == "empty",
                    hostile=mode == "hostile", bad_sha=mode == "bad_sha")).encode())
        if mode == "oversize_declared":
            self.send_response(200); self.send_header("Content-Length", "270000")
            self.end_headers(); self.server.record(mode=mode, declared=270000, sent=0)
            self.close_connection = True; return
        if mode == "interrupted":
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "12345"); self.end_headers()
            try: self.wfile.write(data[:25]); self.wfile.flush()
            except OSError: pass
            self.server.record(mode=mode, declared=12345, sent=25, interrupted=True)
            self.close_connection = True; return
        if mode == "oversize_chunked": data += b" " * 330000
        # Actual wire-level chunks; no Content-Length, 16 KiB per write.
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        sent, chunks, disconnected = 0, 0, False
        try:
            for i in range(0, len(data), 16384):
                block = data[i:i+16384]
                self.wfile.write(("%x\r\n" % len(block)).encode() + block + b"\r\n")
                self.wfile.flush(); sent += len(block); chunks += 1
                if mode == "oversize_chunked": time.sleep(.035)
            self.wfile.write(b"0\r\n\r\n"); self.wfile.flush()
        except (OSError, ConnectionError):
            disconnected = True; self.close_connection = True
        self.server.record(mode=mode, planned=len(data), bytes_sent=sent,
                           chunks_sent=chunks, disconnected=disconnected)

    def forward(self):
        c = http.client.HTTPConnection("127.0.0.1", self.server.upstream_port, timeout=25)
        try:
            headers = {k:v for k,v in self.headers.items()
                       if k.lower() not in HOP and k.lower() != "host"}
            c.request("GET", self.path, headers=headers)
            upstream = c.getresponse()
            body = upstream.read()
            self.send_response(upstream.status)
            for key,val in upstream.getheaders():
                if key.lower() not in HOP and key.lower() != "content-length":
                    self.send_header(key, val)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
        except (OSError, http.client.HTTPException) as exc:
            self.server.record(forward_error=str(exc)[:180], path=self.path)
            try: self.send_error(502, "Next upstream failed")
            except OSError: pass
        finally: c.close()

def percentile(values):
    if not values: return {"n": 0, "p75_ms": None, "p95_ms": None}
    s = sorted(values)
    return {"n":len(s), "p75_ms":s[math.ceil(.75*len(s))-1],
            "p95_ms":s[math.ceil(.95*len(s))-1]}

async def inspect_browser(args, proxy, report):
    async with async_playwright() as engine:
        opt = {"executable_path":args.chrome} if args.chrome else {}
        browser = await engine.chromium.launch(headless=True, **opt)
        report["browser_version"] = browser.version
        for name,size in [("desktop", {"width":1440,"height":900}),
                          ("phone", {"width":390,"height":844})]:
            context = await browser.new_context(viewport=size, reduced_motion="reduce")
            page = await context.new_page()
            browser_errors, observations, navigation = [], [], []
            page.on("pageerror", lambda e: browser_errors.append(str(e)))
            page.on("response", lambda r: observations.append({"url":r.url,"status":r.status})
                    if "/api/general-inspections" in r.url else None)
            url = "http://127.0.0.1:%d/kingdom-tests" % proxy.server_address[1]
            for trial in range(args.samples):
                t0 = time.perf_counter()
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.get_by_role("heading", name="KINGDOM TESTS").wait_for(timeout=20000)
                assert resp and resp.status == 200
                navigation.append(round(1000*(time.perf_counter()-t0),2))
            section = page.locator('section[aria-labelledby="kingdom-test-proof-title"]')
            await section.get_by_text("Optional, on-demand source inspection.",exact=False).wait_for()
            await page.wait_for_timeout(750)
            trigger = section.get_by_role("button",name="Inspect published claims")
            await trigger.focus()
            await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab")
            assert await trigger.evaluate("e=>document.activeElement===e")
            assert await trigger.evaluate("e=>e.matches(':focus-visible')")
            report["checks"].append({"name":name+":tab_and_focus_visible","state":"PASS"})
            cases = [
                ("good", "SOURCE CLAIMS · NOT INDEPENDENTLY CERTIFIED"),
                ("stale", "STALE"), ("future", "FUTURE"),
                ("empty", "0 declared inspection checks"),
                ("duplicate", "EVIDENCE UNAVAILABLE"),
                ("bad_sha", "Reported release: UNKNOWN"),
                ("hostile", "SOURCE CLAIMS · NOT INDEPENDENTLY CERTIFIED"),
                ("oversize_declared", "Inspection evidence could not be read"),
                ("oversize_chunked", "Inspection evidence could not be read"),
                ("interrupted", "Inspection evidence could not be read"),
                ("malformed", "Inspection evidence could not be read"),
                ("http_503", "Inspection evidence could not be read")]
            for mode, expected in cases:
                proxy.mode = mode
                await section.get_by_role("button",name="Inspect published claims").click()
                await section.get_by_text(expected,exact=False).first.wait_for(timeout=12500)
                found = await section.inner_text()
                assert "Independently verified executed/pass/fail totals: 99999" not in found
                assert ("Independently verified executed/pass/fail totals: UNKNOWN" in found
                        or "EVIDENCE UNAVAILABLE" in found
                        or "Inspection evidence could not be read" in found)
                if mode == "hostile":
                    assert await section.locator("img[src=x]").count() == 0
                    assert await page.evaluate("window.__owned===undefined")
                report["checks"].append({"name":name+":"+mode,"state":"PASS"})
            proxy.mode = "timeout"
            t0 = time.perf_counter()
            await section.get_by_role("button",name="Inspect published claims").press("Enter")
            await section.get_by_text("timed out; no prior result was retained.",exact=False).wait_for(timeout=12500)
            report["checks"].append({"name":name+":ten_second_deadline","state":"PASS",
                                     "elapsed_ms":round(1000*(time.perf_counter()-t0),2)})
            proxy.mode = "late"
            await section.get_by_role("button",name="Inspect published claims").press("Enter")
            cancel = section.get_by_role("button",name="Cancel inspection")
            await cancel.wait_for(timeout=2500)
            assert await cancel.evaluate("e=>e===document.activeElement")
            await cancel.press("Space")
            await section.get_by_text("Inspection cancelled; no evidence result was retained.").wait_for()
            await page.wait_for_timeout(2500)
            assert "SOURCE CLAIMS · NOT INDEPENDENTLY CERTIFIED" not in await section.inner_text()
            assert await page.evaluate("document.activeElement.tagName") == "BUTTON"
            report["checks"].append({"name":name+":cancel_late_and_focus","state":"PASS"})
            proxy.mode = "good"
            await section.get_by_role("button",name="Inspect published claims").press("Enter")
            await section.get_by_text("SOURCE CLAIMS · NOT INDEPENDENTLY CERTIFIED").wait_for()
            report["checks"].append({"name":name+":keyboard_retry","state":"PASS"})
            metrics = await page.evaluate("""() => ({
                viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
                reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,
                resources:performance.getEntriesByType('resource').length,
                inspectionResources:performance.getEntriesByType('resource')
                    .filter(x=>x.name.includes('/api/general-inspections'))
                    .map(x=>({name:x.name,transfer:x.transferSize,
                              encoded:x.encodedBodySize,decoded:x.decodedBodySize,duration:x.duration})),
                navigation:performance.getEntriesByType('navigation').map(x=>({
                    duration:x.duration,transfer:x.transferSize,decoded:x.decodedBodySize})),
                heap:performance.memory?.usedJSHeapSize??null})""")
            assert metrics["scrollWidth"] <= metrics["viewport"]+2
            assert metrics["reducedMotion"]
            report["viewports"][name] = {
                "first_fresh_context_navigation_ms":navigation[0],
                "same_context_repeat_navigation_samples_ms":navigation[1:],
                "same_context_repeat_navigation":percentile(navigation[1:]),
                "mixed_navigation_samples_ms":navigation,
                "metrics":metrics, "page_errors":browser_errors, "inspection_responses":observations}
            await page.screenshot(path=str(args.output.parent/("kingdom-tests-next-"+name+".png")),full_page=True)
            # Whole-page inherited claim defect is a FAIL, not part of inspector certificate.
            report["shared_claim_blocker"][name] = "OVERALL VERIFIED SCORE" in await page.locator("body").inner_text()
            await context.close()
        await browser.close()

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo",required=True,type=pathlib.Path)
    ap.add_argument("--origin",default="http://127.0.0.1:3030")
    ap.add_argument("--chrome")
    ap.add_argument("--samples",type=int,default=8)
    ap.add_argument("--output",type=pathlib.Path,default=pathlib.Path("kingdom-tests-next-receipt.json"))
    args=ap.parse_args()
    origin=urlparse(args.origin)
    if origin.scheme!="http" or origin.hostname!="127.0.0.1" or not origin.port or origin.path not in ("","/"):
        raise SystemExit("STOP: upstream must be loopback-only HTTP Next")
    try:
        head=subprocess.check_output(["git","-C",str(args.repo),"rev-parse","HEAD"],text=True,stderr=subprocess.DEVNULL).strip()
        dirty=subprocess.check_output(["git","-C",str(args.repo),"status","--porcelain","--untracked-files=no"],
                                      text=True,stderr=subprocess.DEVNULL).strip()
    except (OSError,subprocess.CalledProcessError):
        raise SystemExit("STOP: no verifiable source-pinned Git checkout")
    if not re.fullmatch(r"[0-9a-f]{40}", SHA) or head!=SHA or dirty:
        raise SystemExit("STOP: authenticated EXPECTED_CANDIDATE_SHA missing/mismatched, or modified tracked source")
    build=args.repo/".next"/"BUILD_ID"
    if not build.is_file() or not build.read_text().strip(): raise SystemExit("STOP: no real .next/BUILD_ID")
    if not 2<=args.samples<=30: raise SystemExit("STOP: bounded sample count required (2..30)")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    report={"schema":"aoe2war-tests-real-next-loopback-v1","source_sha":head,
            "build_id":build.read_text().strip(),"observed_utc":NOW,
            "fixture_scope":"same-origin loopback-only general-inspections; NOT live backend",
            "checks":[],"viewports":{},"stream_events":[],"shared_claim_blocker":{},
            "unverified":["screen reader/assistive technology","deployed production parity",
                          "production P75/P95","authenticated test execution","Kingdom Index certification"]}
    proxy=Proxy(origin.port)
    thread=threading.Thread(target=proxy.serve_forever,daemon=True);thread.start()
    fail=None
    try: await inspect_browser(args,proxy,report)
    except Exception as error: fail={"type":type(error).__name__,"message":str(error)[:1600]}
    finally:
        proxy.shutdown();proxy.server_close();thread.join(timeout=3)
        report["stream_events"]=proxy.events
        report["passed"]=sum(x["state"]=="PASS" for x in report["checks"])
        report["failure"]=fail
        report["status"]="FAIL" if fail or any(report["shared_claim_blocker"].values()) else "PASS_INSPECTOR_ONLY"
        args.output.write_text(json.dumps(report,indent=2))
        print(json.dumps({"status":report["status"],"checks":report["passed"],
                          "source":head,"build_id":report["build_id"],"receipt":str(args.output)}))
    if fail or any(report["shared_claim_blocker"].values()): raise SystemExit(1)

if __name__=="__main__": asyncio.run(main())
