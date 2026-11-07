#!/usr/bin/env python3
"""Non-authoritative, bounded guest Flight/RSC production drift observer.

Read-only loopback HTTP. This is a diagnostic health signal, never Steam/browser
acceptance, financial authorization, or a production cutover authority.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

ROUTES = {
    "/players": "Player Registry",
    "/war-chest": "WAR CHEST",
    "/game-stats": "Parser Observatory",
    "/rivalries": "Rivalry Hall",
    "/battle-archive": "The War Vault",
    "/bounties": "Bounty Board",
    "/champions": "Championship Belts",
    "/radio": "Published rotation",
}
PORTS = {"public": 3030, "isolated": 3032}
RSC_ERROR = re.compile(r"[0-9a-f]+:E[\\]*\{", re.IGNORECASE)
MAX_BYTES = 3_000_000
MIN_BYTES = 35_000
TIMEOUT = 5
STATE_SCHEMA = "aoe2war.release-readiness-observer.v1"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def http_read(port: int, path: str) -> tuple[int, bytes, bool]:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        headers={"Host": "aoe2war.com",
                 "Accept": "text/html" if path != "/api/deployment-version" else "application/json",
                 "User-Agent": "AoE2WAR-Release-Readiness-Observer/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        data = response.read(MAX_BYTES + 1)
        return response.status, data[:MAX_BYTES], len(data) > MAX_BYTES


def probe_route(port: int, path: str, expected_content: str) -> dict:
    try:
        status, body, truncated = http_read(port, path)
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as error:
        # Never include raw URL details (or any auth/session headers) in output.
        return {"status": "HOLD_REACHABILITY", "error_class": type(error).__name__}
    result = {"http_status": status, "bytes": len(body),
              "body_sha256": hashlib.sha256(body).hexdigest()}
    if truncated:
        return {"status": "HOLD_TRUNCATED", **result}
    if status != 200:
        return {"status": "HOLD_HTTP", **result}
    decoded = body.decode("utf-8", "replace")
    errors = RSC_ERROR.findall(decoded)
    if errors or "Application error: a server-side exception" in decoded:
        return {"status": "HOLD_RSC_ERROR", "rsc_error_records": len(errors), **result}
    if len(body) < MIN_BYTES or "<main" not in decoded or expected_content not in decoded:
        return {"status": "HOLD_CONTENT_INCOMPLETE", "main_present": "<main" in decoded,
                "expected_content_present": expected_content in decoded, **result}
    return {"status": "PASS_GUEST_HTML_AND_FLIGHT_DIAGNOSTIC_ONLY", **result}


def probe_version(port: int) -> dict:
    try:
        status, body, truncated = http_read(port, "/api/deployment-version")
        if truncated or status != 200:
            return {"status": "HOLD_VERSION_HTTP"}
        version = json.loads(body)
        value = version.get("buildVersion")
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]{14}-[0-9a-f]{10,16}", value):
            return {"status": "HOLD_VERSION_FORMAT"}
        return {"status": "PASS_VERSION", "buildVersion": value}
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as error:
        return {"status": "HOLD_REACHABILITY", "error_class": type(error).__name__}
    except (ValueError, TypeError):
        return {"status": "HOLD_VERSION_JSON"}


def observe() -> dict:
    surfaces = {}
    for name, port in PORTS.items():
        version = probe_version(port)
        if version["status"] == "HOLD_REACHABILITY":
            surfaces[name] = {"port": port, "status": "STOPPED_OR_UNREACHABLE",
                              "version": version, "routes": {}}
            continue
        routes = {route: probe_route(port, route, marker) for route, marker in ROUTES.items()}
        passed = sum(value["status"] == "PASS_GUEST_HTML_AND_FLIGHT_DIAGNOSTIC_ONLY"
                     for value in routes.values())
        surfaces[name] = {"port": port, "status": "GUEST_PROBES_PASS" if passed == len(ROUTES)
                          else "HOLD_GUEST_PROBES",
                          "passed": passed, "total": len(ROUTES), "version": version,
                          "routes": routes}
    return {
        "schema": STATE_SCHEMA, "collected_at_utc": utc_now(),
        "status": ("PUBLIC_DIAGNOSTIC_PASS" if surfaces["public"]["status"] == "GUEST_PROBES_PASS"
                   else "PUBLIC_DIAGNOSTIC_HOLD"),
        "purpose": "NON_AUTHORITATIVE_READ_ONLY_GUEST_CONTENT_DRIFT",
        "public_cutover_authorized": False, "financial_authorized": False,
        "steam_authenticated": False, "admin_verified": False,
        "source_full_site_acceptance": False,
        "surfaces": surfaces,
    }


def persist(report: dict, output: Path) -> str:
    data = (json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n").encode()
    # Only bounded, metadata-only JSON; no HTML, tokens or credentials.
    if len(data) > 32_000:
        raise ValueError("HOLD_REPORT_EXCEEDS_SIZE_BOUND")
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = output.with_name("." + output.name + "." + str(os.getpid()) + ".tmp")
    descriptor = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, output)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = observe()
    if args.output is not None:
        digest = persist(report, args.output)
        report = {"schema": STATE_SCHEMA, "status": report["status"],
                  "isolated": report["surfaces"]["isolated"]["status"],
                  "public": report["surfaces"]["public"]["status"],
                  "report_sha256": digest}
    print(json.dumps(report, sort_keys=True))
    return 0  # Diagnostic HOLD is data, never a service crash or release permission.


if __name__ == "__main__":
    sys.exit(main())
