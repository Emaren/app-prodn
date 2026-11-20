#!/usr/bin/env python3
"""WE2 Factory PLAYER reconciliation: no mutations; fail closed on real live evidence.

Run immediately before a release, after T7 activation, T8 rollback and T9 reactivation.
This script never installs the website, grants PostgreSQL rights or creates browser proof.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

REMOTE = r'''
import hashlib, http.client, json, os, re, socket, subprocess
from html.parser import HTMLParser
from urllib.parse import urlsplit
def sh(*cmd):
    try:
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=8)
        return p.stdout.strip() if p.returncode==0 else ""
    except Exception:return ""
def get(path, maxbytes=1600000):
    try:
        c=http.client.HTTPConnection("127.0.0.1",3032,timeout=8)
        c.request("GET",path,headers={"Host":"aoe2war.com","User-Agent":"AoE2WAR-Product-Reconciliation/1.0"})
        r=c.getresponse();body=r.read(maxbytes+1);code=r.status
        info={"http":code,"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest(),
              "contentType":r.getheader("content-type","").split(";")[0],
              "buildHeader":r.getheader("x-aoe2war-build-id")}
        c.close()
        return info,body[:maxbytes]
    except Exception as e:return {"http":None,"error":type(e).__name__},b""
def open_port(port):
    s=socket.socket();s.settimeout(1)
    try:s.connect(("127.0.0.1",port));return True
    except Exception:return False
    finally:s.close()
def free(path):
    x=os.statvfs(path);return x.f_bavail*x.f_frsize
class Images(HTMLParser):
    def __init__(self):super().__init__();self.images=[]
    def handle_starttag(self,tag,attrs):
        if tag=="img":
            a=dict(attrs);src=a.get("src","")
            if src.startswith("/") and len(src)<2500:self.images.append(src)
def json_count(body,key):
    try:
        d=json.loads(body)
        if type(d) is dict:
            v=d.get(key)
            if type(v) is list:return len(v),d
    except Exception:pass
    return None,None
probe={}
for key,path,k in [
 ("root","/",None),("lobby","/lobby",None),
 ("archive","/api/game_stats?archive=1&limit=3","matches"),
 ("lobbyChat","/api/lobby/chat?limit=3","messages"),
 ("libraryGames","/api/library/games?limit=3","items"),
 ("traffic","/api/traffic/public","points"),
 ("anonymousSession","/api/auth/session",None),
 ("socialChat","/api/social/clan-text",None)]:
    info,body=get(path);n,d=json_count(body,k) if k else (None,None)
    if k:info["listCount"]=n
    if key=="archive" and d is not None:
        info["reportedTotal"]=d.get("total") or d.get("count")
        info["sampleBattleId"]=(d.get("matches") or [{}])[0].get("id")
    if key=="libraryGames" and d is not None:info["reportedTotal"]=d.get("total")
    if key=="traffic" and d is not None:
        info["latestDate"]=(d.get("points") or [{}])[-1].get("date")
        info["coverageEndedAt"]=d.get("coverageEndedAt")
    if key=="lobby":
        parser=Images()
        try:parser.feed(body.decode("utf-8","replace"))
        except Exception:pass
        candidates=[s for s in parser.images if "avatar" in s or "_next/image" in s]
        target=next(iter(candidates),next(iter(parser.images),""))
        info["imageCandidates"]=len(parser.images)
        if target:
            image,raw=get(target,maxbytes=150000)
            info["criticalImage"]={"pathSha256":hashlib.sha256(target.encode()).hexdigest(),
                                  "http":image["http"],"contentType":image.get("contentType"),
                                  "bytesSampled":len(raw)}
        # Audit every actual featured portrait in the first view, not just the
        # first visible image; no optimized URL may silently fail HTTP 400.
        info["portraitSamples"]=[]
        selected=[s for s in parser.images if "-featured" in s or s.startswith("/_next/image?")][:8]
        for s in selected:
            si,_=get(s,maxbytes=4096)
            info["portraitSamples"].append({"pathSha256":hashlib.sha256(s.encode()).hexdigest(),
                 "http":si.get("http"),"contentType":si.get("contentType")})
    probe[key]=info
working=sh("systemctl","show","-p","WorkingDirectory","--value","aoe2hdbets-web-prod.service")
units={}
for name in ("aoe2hdbets-web-prod","aoe2war-social-writer","traffic-v2-forward-ledger-aoe2hdbets.timer","traffic-public-audience-aoe2hdbets.timer"):
    units[name]=sh("systemctl","is-active",name)
ports={str(p):open_port(p) for p in (3030,3032,3033,9447,8092,8093,8094,8095)}
print(json.dumps({"observedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "workingDirectory":working,"http":probe,"ports":ports,"units":units,
    "rootAvailableBytes":free("/"),"dataAvailableBytes":free("/mnt/HC_Volume_105319120")},sort_keys=True))
'''
def need(ok, name, checks, detail=None):
    checks.append({"name":name,"state":"PASS" if ok else "HOLD","detail":detail})
def canon(v):
    return (json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=True)+"\n").encode()
def main():
    a=argparse.ArgumentParser()
    a.add_argument("--expect-source",required=True)
    a.add_argument("--expect-build",required=True)
    a.add_argument("--phase",choices=("pre","activate","rollback","reactivate","audit"),default="audit")
    a.add_argument("--profile",choices=("lobby","player"),default="player")
    a.add_argument("--out-dir",default=str(Path.home()/".aoe2war-product-releases"/"reconciliation-v1"))
    args=a.parse_args()
    assert re.fullmatch(r"[0-9a-f]{40}",args.expect_source)
    assert re.fullmatch(r"[A-Za-z0-9_-]{8,64}",args.expect_build)
    command=["/usr/bin/ssh","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8","hel1",
             "python3 -I -B -c "+shlex.quote(REMOTE)]
    p=subprocess.run(command,text=True,capture_output=True,timeout=125)
    if p.returncode or not p.stdout.strip():
        actual={"transport":"HOLD","sshExit":p.returncode,"stderrSha256":hashlib.sha256(p.stderr.encode()).hexdigest()}
    else:
        try:actual=json.loads(p.stdout.strip().splitlines()[-1])
        except Exception:actual={"transport":"INVALID_JSON","responseSha256":hashlib.sha256(p.stdout.encode()).hexdigest()}
    checks=[]
    wd=actual.get("workingDirectory","")
    h=actual.get("http",{})
    root=h.get("root",{})
    need(wd.rstrip("/").endswith("/aoe2war-web-prod-"+args.expect_source[:12]),"deployed_source",checks,wd)
    need(root.get("http")==200 and root.get("buildHeader")==args.expect_build,"deployed_build",checks,root.get("buildHeader"))
    need(h.get("archive",{}).get("http")==200 and (h.get("archive",{}).get("listCount") or 0)>0,
         "real_nonempty_recent_battles",checks,h.get("archive",{}).get("reportedTotal"))
    need(h.get("libraryGames",{}).get("http")==200 and (h.get("libraryGames",{}).get("listCount") or 0)>0,
         "library_data_nonempty",checks,h.get("libraryGames",{}).get("reportedTotal"))
    need(h.get("lobbyChat",{}).get("http")==200,"lobby_chat_no_42501",checks,h.get("lobbyChat",{}).get("http"))
    pic=h.get("lobby",{}).get("criticalImage",{})
    samples=h.get("lobby",{}).get("portraitSamples",[])
    image_ok=(pic.get("http")==200 and str(pic.get("contentType","")).startswith("image/")
              and len(samples)>0 and all(s.get("http")==200 and
                  str(s.get("contentType","")).startswith("image/") for s in samples))
    need(h.get("lobby",{}).get("http")==200 and image_ok,"critical_lobby_image_http",checks,
         {"primary":pic,"sampled":len(samples),"bad":sum(s.get("http")!=200 for s in samples)})
    need(h.get("anonymousSession",{}).get("http") in (401,403),"anonymous_auth_denied",checks,h.get("anonymousSession",{}).get("http"))
    pts=actual.get("ports",{})
    need(all(pts.get(str(x)) is True for x in (3030,3032,3033,9447)) and
         all(pts.get(str(x)) is False for x in (8092,8093,8094,8095)),"runtime_ports_and_finance_isolation",checks,pts)
    need(actual.get("units",{}).get("aoe2hdbets-web-prod")=="active","single_live_web_service",checks,actual.get("units"))
    need((actual.get("rootAvailableBytes") or 0)>=12*1024**3,"factory_root_headroom_12gib",checks,actual.get("rootAvailableBytes"))
    traffic=h.get("traffic",{})
    need(traffic.get("http")==200 and (traffic.get("listCount") or 0)>0 and
         actual.get("units",{}).get("traffic-v2-forward-ledger-aoe2hdbets.timer")=="active",
         "traffic_archive_and_ingest_timer",checks,{"last":traffic.get("latestDate"),"publicationTimer":actual.get("units",{}).get("traffic-public-audience-aoe2hdbets.timer")})
    need(actual.get("units",{}).get("traffic-public-audience-aoe2hdbets.timer")=="active" and
         traffic.get("coverageEndedAt") is not None and traffic.get("coverageEndedAt")>="2026-11-19",
         "traffic_current_certified_publication",checks,traffic.get("coverageEndedAt"))
    if args.profile=="player":
        need(h.get("socialChat",{}).get("http") in (401,403) and
             actual.get("units",{}).get("aoe2war-social-writer")=="active",
             "social_signed_session_service",checks,h.get("socialChat",{}).get("http"))
        # A noninteractive probe cannot independently prove Chrome session identities,
        # recipient visibility, duplicate prevention or persisted messages.
        need(False,"real_Emaren_Scribe_persisted_messages_not_yet_supplied",checks,
             "Requires WE3 two genuine authenticated Chrome sessions and DB readback")
    # Traffic freshness remains visible as a HOLD, but is not allowed to
    # silently prevent a separately qualified, nonfinancial Lobby read repair.
    lobby_required={"deployed_source","deployed_build","real_nonempty_recent_battles",
       "library_data_nonempty","lobby_chat_no_42501","critical_lobby_image_http",
       "anonymous_auth_denied","runtime_ports_and_finance_isolation",
       "single_live_web_service","factory_root_headroom_12gib"}
    lobby_ok=all(x["state"]=="PASS" for x in checks if x["name"] in lobby_required)
    player_ok=all(x["state"]=="PASS" for x in checks) and args.profile=="player"
    result={"schema":"aoe2war.we2.production-reconciliation.v1","at":datetime.now(timezone.utc).isoformat(),
            "expected":{"sourceSha":args.expect_source,"buildId":args.expect_build,
                        "phase":args.phase,"profile":args.profile},
            "observed":actual,"checks":checks,
            "lobbyAcceptance":"PASS" if lobby_ok else "HOLD",
            "playerAcceptance":"PASS" if player_ok else "HOLD",
            "scope":"M1 nonroot read-only HEL1 over existing SSH, no DB credential/cookie export"}
    raw=canon(result)
    digest=hashlib.sha256(raw).hexdigest()
    out=Path(args.out_dir);out.mkdir(mode=0o700,parents=True,exist_ok=True)
    assert out.is_dir() and not out.is_symlink() and (out.stat().st_mode&0o777)==0o700
    name=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"-"+args.phase+"-"+digest[:12]
    jsonpath=out/(name+".json")
    with os.fdopen(os.open(jsonpath,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    mdpath=out/(name+".md")
    with os.fdopen(os.open(mdpath,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"w") as f:
        f.write("# WE2 Production Reconciliation V1\n\n")
        f.write("Phase: "+args.phase+" · Profile: "+args.profile+"\n\n")
        f.write("Expected: "+args.expect_source+" / "+args.expect_build+"\n\n")
        for row in checks:f.write("- **"+row["state"]+"** "+row["name"]+": "+str(row["detail"])+"\n")
        f.write("\nAcceptance: **"+result["playerAcceptance"]+"**\n")
        f.write("JSON SHA256: "+digest+"\n")
        f.flush();os.fsync(f.fileno())
    gate=result["lobbyAcceptance"] if args.profile=="lobby" else result["playerAcceptance"]
    print(json.dumps({"status":gate,"lobbyAcceptance":result["lobbyAcceptance"],
                      "playerAcceptance":result["playerAcceptance"],"json":str(jsonpath),
                      "report":str(mdpath),"sha256":digest,
                      "passed":sum(x["state"]=="PASS" for x in checks),"total":len(checks)}))
    return 0 if gate=="PASS" else 2
if __name__=="__main__":sys.exit(main())
