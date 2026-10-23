#!/usr/bin/env python3
"""REAL Next.js/Chrome candidate acceptance for Kingdom Intelligence.

Exact committed PR-head + .next/BUILD_ID required. Runs compiled Next on
127.0.0.1 with fictional local OS snapshot and controlled read-only Recovery
GETs. The resulting browser receipts are NOT live API/deployment certificates.
Do not execute against public production hosts or with production credentials.
"""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlparse
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROUTE = "/kingdom-intelligence"
API = "/api/kingdom-intelligence/live-recovery"
SPEED_POST = "/api/speed/sample"
# The shared SpeedOS SpeedSample TS contract. Never accept arbitrary POST fields.
SPEED_FIELDS = frozenset("""
sample_id occurred_at route traffic_visitor_id traffic_session_id
journey_session_id navigation_kind navigation_start_source ready_source ready_ms
ttfb_ms fcp_ms lcp_ms inp_ms cls dom_content_loaded_ms load_event_ms
resource_count transfer_bytes api_request_count slowest_api_path slowest_api_ms
long_task_count long_task_max_ms long_task_total_ms viewport_width viewport_height
effective_connection_type connection_rtt_ms downlink_mbps save_data
valid_for_aggregation invalid_reason visibility_tainted details
""".split())

def classify_blocked_write(request, host_port):
    """Conservatively classify an attempt. ALL writes remain aborted by the guard."""
    u = urlparse(request.url)
    fields = None
    try:
        fields = json.loads(request.post_data or "")
    except (ValueError, TypeError):
        pass
    keys = set(fields) if isinstance(fields, dict) else set()
    unexpected = sorted(keys - SPEED_FIELDS)
    speed_contract = (
        request.method == "POST" and u.scheme == "http" and
        u.hostname == "127.0.0.1" and u.port == host_port and
        u.path == SPEED_POST and not u.query and
        request.headers.get("content-type", "").split(";")[0].strip() == "application/json" and
        isinstance(fields, dict) and not unexpected and
        isinstance(fields.get("sample_id"), str) and
        re.fullmatch(r"SPD_[A-Za-z0-9_-]{8,100}", fields["sample_id"]) is not None and
        fields.get("route") == ROUTE and
        isinstance(fields.get("valid_for_aggregation"), bool) and
        isinstance(fields.get("visibility_tainted"), bool)
    )
    return {
        "method": request.method, "path": u.path[:180],
        "classification": "shared_speedos_blocked" if speed_contract else "UNEXPECTED_WRITE_BLOCKED",
        "unexpected_field_names": unexpected,
        "submitted_field_names": sorted(keys),  # Names only, NO identifier values.
        "pseudonymous_id_fields_present": sorted(keys.intersection({
            "traffic_visitor_id", "traffic_session_id", "journey_session_id"
        })),
        "details_present": "details" in keys,
        "sensitive_payload_values_logged": False,
        "transmitted": False,
    }
SOURCES = (
    "app/kingdom-intelligence/WarPulsePanel.tsx",
    "app/kingdom-intelligence/AgentConstellationPanel.tsx",
    "app/kingdom-intelligence/liveRecoveryPolicy.ts",
    "app/kingdom-intelligence/useLiveRecoveryProgress.ts",
    "tests/kingdom-intelligence-recovery-poll.test.mts",
    "tests/kingdom-intelligence-recovery-runtime.test.mts",
    "tests/kingdom-intelligence-recovery-ui.test.mts",
    "tests/oracle-kingdom-intelligence-view-modes.test.mts",
)

def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()

def stamp(offset_ms=0):
    value = datetime.now(timezone.utc) + timedelta(milliseconds=offset_ms)
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")

def preflight(args):
    repo = Path(args.repo).resolve()
    endpoint = urlparse(args.origin)
    if endpoint.scheme != "http" or endpoint.hostname != "127.0.0.1" or not endpoint.port:
        raise ValueError("real acceptance requires explicit 127.0.0.1-only HTTP origin")
    if not re.fullmatch("[0-9a-f]{40}", args.sha):
        raise ValueError("must identify full 40-character candidate source SHA")
    if not (repo / ".git").exists() or git(repo, "rev-parse", "HEAD") != args.sha:
        raise ValueError("wrong repository HEAD; do not test another candidate")
    if git(repo, "status", "--porcelain", "--untracked-files=no"):
        raise ValueError("tracked source dirty before acceptance")
    if not (repo / "node_modules/next/dist/bin/next").is_file():
        raise ValueError("Next dependencies absent; use frozen install")
    build = repo / ".next/BUILD_ID"
    if not build.is_file() or not build.read_text().strip():
        raise ValueError("actual emitted Next BUILD_ID missing")
    if not Path(args.chrome).is_file():
        raise ValueError("real Chrome executable missing")
    return repo, build.read_text().strip(), {name: git(repo, "rev-parse", "HEAD:" + name) for name in SOURCES}

def seed_snapshot(store):
    state = store / "state"
    state.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "bridgeId": "fixture-only", "runId": None, "sourceAction": "ci_fixture",
        "generatedAt": stamp(), "receivedAt": stamp(), "warDate": None,
        "operatingState": "UNKNOWN",
        "payload": {"generated_at": stamp(), "operating_state": "UNKNOWN", "source": {},
            "system_agents": [{
                "key": "recovery", "label": "Recovery OS", "state": "RUNNING",
                "summary": "Synthetic fixture, not operational evidence",
                "active_process": True, "active_since": stamp(-30000),
                "progress_percent": 42.1, "progress_label": "fixture historical bytes",
                "expected_bytes": 1000, "observed_bytes": 421, "sealed_chunks": 1,
                "progress_basis": "sealed + active encrypted chunk bytes",
                "current_step": "Fixture only"
            }],
            "recent_source_activity": [], "activity_24h": {}, "invariants": []}}
    (state / "kingdom-intelligence.json").write_text(json.dumps(snapshot), encoding="utf-8")

def start_next(repo, origin, store, out):
    env = {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR") if key in os.environ}
    env.update(NODE_ENV="production", AOE2WAR_OS_STORE_DIR=str(store),
        DATABASE_URL="postgresql://ci:ci@127.0.0.1:5432/fixture",
        SESSION_SECRET="ci-not-production", NEXTAUTH_SECRET="ci-not-production",
        NEXTAUTH_URL=origin)
    logfile = open(out / "next.log", "w", encoding="utf-8")
    p = subprocess.Popen(["node", str(repo / "node_modules/next/dist/bin/next"),
        "start", "--hostname", "127.0.0.1", "--port", str(urlparse(origin).port)],
        cwd=repo, env=env, stdout=logfile, stderr=subprocess.STDOUT)
    try:
        for _ in range(90):
            if p.poll() is not None:
                raise RuntimeError("Next exited; see next.log")
            try:
                with urlopen(origin + ROUTE, timeout=3) as response:
                    if response.status == 200:
                        return p, logfile
            except Exception:
                pass
            time.sleep(1)
        raise RuntimeError("compiled Next route failed startup")
    except Exception:
        p.terminate()
        logfile.close()
        raise

def recovery_payload(mode):
    if mode == "terminal":
        return {"available": False, "reason": "operator_preview_only"}
    if mode == "unavailable":
        return {"available": False, "reason": "no_running_recovery_campaign"}
    return {"available": True, "status": "RUNNING",
        "sampledAt": stamp(-100000 if mode == "stale" else 100000 if mode == "future" else -1000),
        "completedClasses": 5 if mode == "impossible" else 1, "totalClasses": 2,
        "sealedChunks": 1, "observedBytes": 550, "expectedBytes": 1100,
        "classPercent": 50, "overallPercent": 50, "currentClass": "fixture",
        "denominatorSource": "campaign_state",
        "progressBasis": "sealed + active encrypted chunk bytes"}

async def case(browser, args, mode, width, output):
    ctx = await browser.new_context(viewport={"width": width, "height": 844 if width < 500 else 900},
                                    reduced_motion="reduce")
    page = await ctx.new_page()
    counts = {"recovery": 0, "blocked_external": 0, "blocked_write": 0,
              "classified_shared_speedos": 0, "unexpected_writes": 0,
              "times": [], "blocked_nonread_paths": [], "blocked_external_paths": []}
    errors, checks = [], {}
    page.on("pageerror", lambda e: errors.append(str(e)[:240]))
    async def guard(route):
        url = urlparse(route.request.url)
        if url.hostname not in ("127.0.0.1", "localhost") or url.scheme not in ("http", "https"):
            counts["blocked_external"] += 1
            counts["blocked_external_paths"].append(url.path[:180])
            return await route.abort()
        if route.request.method not in ("GET", "HEAD"):
            counts["blocked_write"] += 1
            attempt = classify_blocked_write(route.request, urlparse(args.origin).port)
            counts["blocked_nonread_paths"].append(attempt)
            if attempt["classification"] == "shared_speedos_blocked":
                counts["classified_shared_speedos"] += 1
            else:
                counts["unexpected_writes"] += 1
            return await route.abort()  # Never fulfill or forward even a classified SpeedOS POST.
        await route.continue_()
    async def recovery(route):
        counts["recovery"] += 1
        counts["times"].append(time.perf_counter())
        if mode == "http503":
            return await route.fulfill(status=503, content_type="application/json", body="{}")
        if mode == "malformed":
            return await route.fulfill(status=200, content_type="application/json", body="{broken")
        return await route.fulfill(status=200, content_type="application/json",
                                   headers={"Cache-Control": "no-store"},
                                   body=json.dumps(recovery_payload(mode)))
    await page.route("**/*", guard)
    await page.route("**" + API, recovery)  # specific last = highest precedence
    result = {"mode": mode, "viewport_width": width, "checks": checks, "errors": errors}
    def check(name, value):
        checks[name] = bool(value)
    try:
        t0 = time.perf_counter()
        response = await page.goto(args.origin + ROUTE, wait_until="domcontentloaded", timeout=60000)
        check("server_http_200", response is not None and response.status == 200)
        war = page.locator('section[aria-label="War Pulse"]:visible')
        agent = page.locator('section[aria-label="Agent constellation"]:visible')
        await war.wait_for(timeout=30000)
        await agent.wait_for(timeout=30000)
        check("two_real_app_panels", await war.count() == 1 and await agent.count() == 1)
        check("next_static_scripts", await page.locator('script[src*="/_next/"]').count() > 0)
        button_a = agent.get_by_role("button", name=re.compile("^Change Agent constellation display theme"))
        button_w = war.get_by_role("button", name=re.compile("^Change War Pulse display theme"))
        await button_a.wait_for(timeout=30000)
        check("named_native_theme_controls", await button_a.evaluate("e=>e.tagName==='BUTTON'") and
              await button_w.evaluate("e=>e.tagName==='BUTTON'"))
        check("no_nested_buttons", await war.locator("button button,[role=button] button").count() == 0
              and await agent.locator("button button,[role=button] button").count() == 0)
        theme = await agent.get_attribute("data-agent-constellation-theme")
        await button_a.press("Enter")
        await page.wait_for_function("""previous => [...document.querySelectorAll(
          'section[aria-label="Agent constellation"]')]
          .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
          .some(e => e.dataset.agentConstellationTheme !== previous)""",
                                     arg=theme, timeout=10000)
        check("real_React_Enter_hydration", await agent.get_attribute("data-agent-constellation-theme") != theme)
        await button_w.press("Space")
        check("real_React_Space_theme", await war.get_attribute("data-war-pulse-theme") != "plain")
        check("keyboard_focus_retained", await button_w.evaluate("e=>document.activeElement===e"))
        check("focus_visible", await button_w.evaluate("e=>e.matches(':focus-visible')"))
        details_a = agent.get_by_role("button", name="Show Recovery OS details")
        details_w = war.get_by_role("button", name="Show Recovery OS details")
        check("two_recovery_rows", await details_a.count() == 1 and await details_w.count() == 1)
        if await details_a.count() == 1:
            await details_a.press("Enter")
            check("detail_expanded_Enter", await agent.get_by_role("button", name="Hide Recovery OS details")
                  .get_attribute("aria-expanded") == "true")
            await agent.get_by_role("button", name="Hide Recovery OS details").press("Space")
            check("detail_collapsed_Space", await details_a.get_attribute("aria-expanded") == "false")
        if await details_w.count() == 1:
            await details_w.press("Space")
            check("War_detail_Space", await war.get_by_role("button", name="Hide Recovery OS details")
                  .get_attribute("aria-expanded") == "true")
        for _ in range(60):
            if counts["recovery"] >= 1:
                break
            await page.wait_for_timeout(100)
        check("one_hydrated_initial_GET_shared", counts["recovery"] == 1)
        expected = ("Live Recovery preview unavailable" if mode == "terminal" else
            "Current Recovery sample unavailable" if mode != "fresh" else None)
        if expected:
            await agent.get_by_text(expected, exact=False).first.wait_for(timeout=15000)
            agent_text = (await agent.inner_text()).casefold()
            war_text = (await war.inner_text()).casefold()
            result["rendered_text_evidence"] = {
                "agent_expected_visible": expected.casefold() in agent_text,
                "war_expected_visible": expected.casefold() in war_text,
                "agent_snapshot_visible": "snapshot ·" in agent_text,
                "war_snapshot_visible": "snapshot ·" in war_text,
            }
            check("truthful_status_both_panels", expected.casefold() in agent_text
                  and expected.casefold() in war_text)
            check("historic_progress_labeled_snapshot", "snapshot ·" in agent_text
                  and "snapshot ·" in war_text)
            check("no_false_syncing", "live signal syncing" not in agent_text
                  and "live signal syncing" not in war_text)
        else:
            await agent.get_by_text("1/2 classes", exact=False).first.wait_for(timeout=15000)
            check("fresh_Recovery_visible", "1/2 classes" in (await agent.inner_text()).casefold())
            check("no_false_unavailable_on_fresh",
                  "current recovery sample unavailable" not in (await agent.inner_text()).casefold())
        if mode in ("terminal", "fresh"):
            await page.wait_for_timeout(5500)
            check("correct_shared_poll_budget", counts["recovery"] == (1 if mode == "terminal" else 2))
        if mode == "fresh" and width > 500:
            # Headless foreground APIs do NOT guarantee native visibility transitions.
            # Observe separately; never present controlled API injection as native OS suspension.
            result["visibility_evidence"] = {
                "native_background": "UNVERIFIED",
                "controlled_visibility": "NOT_RUN",
                "controlled_not_os_suspend": True,
            }
            other = await ctx.new_page()
            await other.bring_to_front()
            native_hidden = await page.evaluate("document.visibilityState==='hidden'")
            result["visibility_evidence"]["native_background"] = (
                "OBSERVED" if native_hidden else "NOT_OBSERVED_IN_HEADLESS")
            if native_hidden:
                native_before = counts["recovery"]
                await page.wait_for_timeout(5200)
                result["visibility_evidence"]["native_no_poll"] = (
                    counts["recovery"] == native_before)
            await other.close()
            await page.bring_to_front()
            await page.wait_for_function("document.visibilityState==='visible'", timeout=6000)

            # Deterministic Page Visibility API event: tests app handling, NOT native tab OS state.
            try:
                controlled = await page.evaluate("""() => {
                  if (Object.prototype.hasOwnProperty.call(document, 'visibilityState'))
                    throw Error('Cannot safely inject visibility over existing document override');
                  Object.defineProperty(document, 'visibilityState',
                    { configurable:true, get:()=>'hidden' });
                  document.dispatchEvent(new Event('visibilitychange'));
                  return document.visibilityState==='hidden';
                }""")
                result["visibility_evidence"]["controlled_visibility"] = "INJECTED_PAGE_API"
                check("controlled_visibility_event_hidden", controlled)
                paused = "Live Recovery sampling paused"
                await agent.get_by_text(paused, exact=False).first.wait_for(timeout=4000)
                check("controlled_paused_status_both_panels",
                      paused.casefold() in (await agent.inner_text()).casefold()
                      and paused.casefold() in (await war.inner_text()).casefold())
                before = counts["recovery"]
                await page.wait_for_timeout(5200)
                check("controlled_hidden_no_new_recovery_GET", counts["recovery"] == before)
            finally:
                restored = await page.evaluate("""() => {
                  const removed = delete document.visibilityState;
                  document.dispatchEvent(new Event('visibilitychange'));
                  return removed && document.visibilityState === 'visible';
                }""")
            check("controlled_visibility_restored", restored)
            before_resume = before
            for _ in range(40):
                if counts["recovery"] > before_resume:
                    break
                await page.wait_for_timeout(100)
            check("controlled_visible_single_fresh_resume", counts["recovery"] == before_resume + 1)
            check("controlled_fresh_sample_restored",
                  "1/2 classes" in (await agent.inner_text()).casefold())
            result["visibility_evidence"]["native_os_suspension_certified"] = False
        layout = await page.evaluate("({view:innerWidth,scroll:document.documentElement.scrollWidth})")
        result["layout"] = layout
        check("no_mobile_horizontal_overflow", layout["scroll"] <= layout["view"] + 2)
        check("reduced_motion_media", await page.evaluate(
              "matchMedia('(prefers-reduced-motion: reduce)').matches"))
        check("no_browser_exceptions", not errors)
        # Preserve the literal original write check as a FALSE diagnostic when shared
        # SpeedOS attempts occur; do NOT rebrand those attempts as zero writes.
        result["write_guard_evidence"] = {
            "no_attempted_write_requests": counts["blocked_write"] == 0,
            "all_attempts_blocked_from_transmission": True,
            "classification_scope": "POST /api/speed/sample with strict SpeedSample schema and route only",
            "shared_speedos_attempts": counts["classified_shared_speedos"],
            "unexpected_attempts": counts["unexpected_writes"],
            "written_to_backend": 0,
            "safety_contract": "ZERO_UNEXPECTED_ATTEMPTS; ALL_ATTEMPTS_ABORTED",
        }
        check("no_unexpected_or_intelligence_owned_write_attempts",
              counts["unexpected_writes"] == 0)
        check("shared_speedos_attempts_explicitly_accounted",
              counts["classified_shared_speedos"] + counts["unexpected_writes"] == counts["blocked_write"])

        result["navigation_plus_assertions_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        if mode == "terminal":
            await page.screenshot(path=str(output / ("intelligence-" + str(width) + "-terminal.png")),
                                  full_page=True)
    except Exception as error:
        result["error"] = type(error).__name__ + ": " + str(error)[:1000]
    finally:
        result["requests"] = counts
        result["pass"] = bool(checks) and all(checks.values()) and "error" not in result
        if not result["pass"]:
            try:
                await page.screenshot(path=str(output / ("intelligence-" + str(width) + "-" + mode + "-failure.png")),
                                      full_page=True)
            except Exception as shot_error:
                result["screenshot_error"] = str(shot_error)[:250]
        await ctx.close()
    return result

async def execute(args, build, source_blobs, output):
    report = {"source_sha": args.sha, "build_id": build, "source_blobs": source_blobs,
        "cohort": "REAL_NEXT_CONTROLLED_RECOVERY_API_FIXTURE", "production_attested": False,
        "certified": False, "cases": [], "status": "RUNNING"}
    with tempfile.TemporaryDirectory(prefix="kingdom-intelligence-fixture-") as root:
        seed_snapshot(Path(root))
        proc, logfile = start_next(Path(args.repo), args.origin, Path(root), output)
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(executable_path=args.chrome, headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"])
                report["chrome_version"] = browser.version
                for mode in ("terminal", "fresh", "stale", "future", "impossible", "http503",
                             "malformed", "unavailable"):
                    report["cases"].append(await case(browser, args, mode, 1440, output))
                for mode in ("terminal", "fresh"):
                    report["cases"].append(await case(browser, args, mode, 390, output))
                await browser.close()
            times = [x["navigation_plus_assertions_ms"] for x in report["cases"]
                     if "navigation_plus_assertions_ms" in x]
            sorted_times = sorted(times)
            def pct(frac):
                if not sorted_times:
                    return None
                pos = (len(sorted_times)-1)*frac
                lo,hi=math.floor(pos),math.ceil(pos)
                return round(sorted_times[lo]+(sorted_times[hi]-sorted_times[lo])*(pos-lo),2)
            report["timing_fixture_only"] = {"n": len(times), "p75_ms": pct(.75),
                                            "p95_ms": pct(.95), "raw_ms": times}
            report["status"] = "PASS" if all(x["pass"] for x in report["cases"]) else "FAIL"
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=12)
            except subprocess.TimeoutExpired:
                proc.kill()
            logfile.close()
    return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--origin", default="http://127.0.0.1:3138")
    parser.add_argument("--chrome", required=True)
    parser.add_argument("--output", default="renaissance-page-evidence")
    args = parser.parse_args()
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    result = {"status": "ERROR", "source_sha": args.sha, "production_attested": False}
    try:
        repo, build, source_blobs = preflight(args)
        (out / "BUILD_ID").write_text(build + "\n")
        result = asyncio.run(execute(args, build, source_blobs, out))
        if git(repo, "rev-parse", "HEAD") != args.sha or git(repo, "status", "--porcelain", "--untracked-files=no"):
            raise RuntimeError("source HEAD changed or tracked source became dirty")
    except Exception as error:
        result["status"] = "ERROR"
        result["error"] = type(error).__name__ + ": " + str(error)[:1000]
    finally:
        receipt = out / "kingdom-intelligence-next-receipt.json"
        receipt.write_text(json.dumps(result, indent=2, default=str) + "\n")
        print(json.dumps({"status": result["status"], "source_sha": args.sha,
                          "build_id": result.get("build_id"),
                          "cases": len(result.get("cases", [])),
                          "receipt": str(receipt)}, indent=2), flush=True)
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
