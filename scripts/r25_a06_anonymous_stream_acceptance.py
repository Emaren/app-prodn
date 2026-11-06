#!/usr/bin/env python3
"""A06 read-only live negative acceptance: no anonymous admin HTML or RSC data.

No cookies, bearer tokens, writes, or body logging. Requires explicit target
and expected runtime version; designed for an isolated candidate before cutover.
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

PROTECTED={
    "documents-os":("Documents OS · Source Registry",),
    "kingdom-bettors":("Kingdom Bettors Command",),
    "marketplace":("Kingdom Business Command",),
    "parser-lab":("HD Replay Engine Room","Legacy evidence → immutable receipts",
                  "Commissioner ledger pressure"),
}
MAX_BYTES=512_000
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None

OPENER=urllib.request.build_opener(NoRedirect())
def fetch(url,headers):
    req=urllib.request.Request(url,headers=headers,method="GET")
    try:
        response=OPENER.open(req,timeout=10)
    except urllib.error.HTTPError as error:
        response=error
    with response:
        payload=response.read(MAX_BYTES+1)
        status=response.status
    if len(payload)>MAX_BYTES:
        raise RuntimeError("RESPONSE_EXCEEDS_BOUND")
    return status,payload.decode("utf-8","replace")
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--base-url",required=True)
    ap.add_argument("--expect-build-version",required=True)
    args=ap.parse_args()
    base=args.base_url.rstrip("/")
    url=urllib.parse.urlsplit(base)
    if not ((url.scheme=="http" and url.hostname in ("127.0.0.1","localhost") and url.port in (3030,3031,3032,3033,3034))
        or (url.scheme=="https" and url.hostname=="aoe2war.com" and not url.port)):
        raise RuntimeError("REQUIRE_PINNED_APP_OR_LOOPBACK_TARGET")
    status,body=fetch(base+"/api/deployment-version",{"Accept":"application/json"})
    if status!=200 or json.loads(body).get("buildVersion")!=args.expect_build_version:
        raise RuntimeError("EXPECTED_RUNTIME_BUILD_MISMATCH")
    failed=0
    passed=0
    for route,markers in PROTECTED.items():
        for format in ("html","rsc"):
            urlpath=f"/admin/{route}"
            headers={"User-Agent":"AoE2WAR-A06-Anonymous-NoCookie-ReadOnly/1",
                     "Accept":"text/html" if format=="html" else "text/x-component"}
            if format=="rsc":
                urlpath+="?_rsc=a06-anonymous-negative"
                headers["RSC"]="1"
                headers["Next-Router-Prefetch"]="1"
            try:
                result,content=fetch(base+urlpath,headers)
                leak=any(marker in content for marker in markers)
                denial=result in (301,302,303,307,308,401,403) or "NEXT_REDIRECT" in content
                safe=result<500 and not leak and denial
                if safe:
                    print(f"PASS:A06_ANON_{format.upper()}:{route}:HTTP_{result}")
                    passed+=1
                else:
                    print(f"HOLD:A06_ANON_{format.upper()}:{route}:HTTP_{result}:LEAK={leak}:DENIAL={denial}")
                    failed+=1
            except Exception as exc:
                print(f"HOLD:A06_ANON_{format.upper()}:{route}:{type(exc).__name__}")
                failed+=1
    print(f"A06_ANONYMOUS_STREAM_SUMMARY:PASS={passed}:HOLD={failed}:BUILD_VERIFIED")
    return 0 if failed==0 else 2
if __name__=="__main__":
    try:
        sys.exit(main())
    except (ValueError,RuntimeError,KeyError,urllib.error.URLError) as err:
        print(f"HOLD:A06_ANONYMOUS_ACCEPTANCE:{type(err).__name__}:{str(err)[:100]}")
        sys.exit(2)
