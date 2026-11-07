#!/usr/bin/env python3
"""HEL1-only synthetic, deliberately INVALID OpenID transport smoke test.

No real Steam ID, assertion, signature, owner cookie or financial action. Sends
one fake callback only to localhost:3032, never follows the redirect, never
logs callback URLs, headers or secrets. The required success condition is
Steam rejecting the fake assertion *after* the outbound provider POST.
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

STATE = "A" * 43
FAKE_CLAIMED_ID = "https://steamcommunity.com/openid/id/76561198000000001"
FIXED_PREFIXES = (
    "AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:",
    "AOE2WAR_NONFINANCIAL_STEAM_CALLBACK_HOLD_STAGE:",
    "AOE2WAR_NONFINANCIAL_OPENID_HOLD_CLASS:",
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--require-provider-body", action="store_true")
    args = ap.parse_args()
    now = datetime.datetime.now(datetime.timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    callback = "https://aoe2war.com/api/auth/steam?" + urllib.parse.urlencode({
        "returnTo": "/", "state": STATE,
    })
    params = {
        "returnTo": "/", "state": STATE,
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "id_res",
        "openid.op_endpoint": "https://steamcommunity.com/openid/login",
        "openid.claimed_id": FAKE_CLAIMED_ID,
        "openid.identity": FAKE_CLAIMED_ID,
        "openid.return_to": callback,
        "openid.response_nonce": ts + "synthetic-invalid-nonce-sig",
        "openid.assoc_handle": "synthetic-invalid-association",
        "openid.sig": "invalid-synthetic-signature",
        "openid.signed": "op_endpoint,return_to,response_nonce,assoc_handle,claimed_id,identity",
    }
    url = "http://127.0.0.1:3032/api/auth/steam?" + urllib.parse.urlencode(params)
    headers = {
        "Host": "aoe2war.com", "X-Forwarded-Host": "aoe2war.com",
        "X-Forwarded-Proto": "https",
        "Cookie": "__Host-aoe2war_steam_state=" + STATE,
        "User-Agent": "AoE2WAR-synthetic-invalid-OpenID-local-probe/1",
    }

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *unused, **kw):
            return None

    start = time.monotonic()
    try:
        response = urllib.request.build_opener(NoRedirect()).open(
            urllib.request.Request(url, headers=headers), timeout=15,
        )
        status, loc = response.status, response.headers.get("Location", "")
    except urllib.error.HTTPError as error:
        status, loc = error.code, error.headers.get("Location", "")
    except (TimeoutError, OSError) as error:
        print("HOLD:LOCAL_3032_UNREACHABLE:" + type(error).__name__, flush=True)
        return 2
    time.sleep(0.3)
    logs = subprocess.run([
        "/usr/bin/journalctl", "-u", "aoe2hdbets-web-prod.service",
        "--since", now.isoformat(), "--no-pager", "-o", "cat",
    ], capture_output=True, text=True, timeout=8, check=True).stdout
    markers = [line.strip() for line in logs.splitlines()
               if any(line.startswith(prefix) for prefix in FIXED_PREFIXES)]
    detail = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query).get("detail", [""])[0]
    ok = (status == 307 and detail == "STEAM_SIGN_IN_FAILED"
          and "AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:provider_body" in markers)
    result = {
        "schema": "aoe2war.a05.synthetic-openid-transport.v1",
        "status": "PASS_FAKE_SIGNATURE_REJECTED_AFTER_REAL_STEAM_POST" if ok
                  else "HOLD_SYNTHETIC_CALLBACK_PROVIDER_TRANSPORT",
        "http_status": status, "elapsed_ms": round((time.monotonic() - start) * 1000),
        "fake_assertion_only": True, "real_steam_login_verified": False,
        "financial_authorized": False, "public_cutover_authorized": False,
        "fixed_stage_markers": markers,
    }
    print(json.dumps(result, sort_keys=True), flush=True)
    return 2 if args.require_provider_body and not ok else 0


if __name__ == "__main__":
    sys.exit(main())
