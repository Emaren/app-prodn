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
 ("lobbyRecent","/api/lobby/recent-matches?limit=12","matches"),
 ("lobbySnapshot","/api/lobby","recentMatches"),
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
    if key in ("lobbyRecent","lobbySnapshot") and d is not None:
        values=d.get("matches" if key=="lobbyRecent" else "recentMatches") or []
        info["sampleBattleId"]=values[0].get("id") if values and isinstance(values[0],dict) else None
        info["truthFlag"]=d.get("ok") if key=="lobbyRecent" else "snapshot"
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
    a.add_argument("--profile",choices=("baseline","lobby","player","rollback"),default="player")
    a.add_argument("--out-dir",default=str(Path.home()/".aoe2war-product-releases"/"reconciliation-v1"))
    a.add_argument("--verified-runtime-proof",default=None)
    a.add_argument("--runtime-proof-sha256",default=None)
    args=a.parse_args()
    if args.profile=="rollback" and args.phase!="rollback":
        a.error("rollback profile is only valid with rollback phase")
    if args.profile=="baseline" and args.phase not in ("pre","audit"):
        a.error("baseline cannot certify activated player source")
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
    archive=h.get("archive",{})
    recent=h.get("lobbyRecent",{})
    snapshot=h.get("lobbySnapshot",{})
    need(archive.get("http")==200 and (archive.get("listCount") or 0)>0
         and (archive.get("reportedTotal") or 0)>0,
         "real_nonempty_archive",checks,archive.get("reportedTotal"))
    # The tile's rendered data source MUST be independently nonempty when
    # the canonical public archive has thousands of fresh real battles.
    # A successful HTTP 200 with [] is a hard fail, not "no games."
    need(recent.get("http")==200 and recent.get("truthFlag") is True
         and (recent.get("listCount") or 0)>0,
         "lobby_recent_matches_not_false_empty",checks,
         {"http":recent.get("http"),"count":recent.get("listCount"),
          "archiveTotal":archive.get("reportedTotal"),"sampleId":recent.get("sampleBattleId")})
    need(snapshot.get("http")==200 and (snapshot.get("listCount") or 0)>0,
         "lobby_snapshot_recent_matches_not_false_empty",checks,
         {"http":snapshot.get("http"),"count":snapshot.get("listCount")})
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
    # Match accepted Factory coordinator's exact preflight:
    # max(6 GiB + incoming, incoming + extracted + 1 GiB), where extracted
    # source has a hard 5 GiB ceiling. Therefore for a new uncached runtime
    # the conservative threshold is precisely 6 GiB + incoming archive.
    proof_error=None
    archive_bytes=0
    if args.verified_runtime_proof or args.runtime_proof_sha256:
        try:
            pp=Path(args.verified_runtime_proof or "")
            info=pp.lstat()
            expected=args.runtime_proof_sha256 or ""
            if (not re.fullmatch(r"[0-9a-f]{64}",expected)
                    or not pp.is_file() or pp.is_symlink()
                    or info.st_uid!=os.geteuid() or info.st_nlink!=1
                    or (info.st_mode&0o777)!=0o600 or not 0<info.st_size<16384):
                raise ValueError("PROOF_LOCAL_CUSTODY_OR_DIGEST")
            raw=pp.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=expected:
                raise ValueError("PROOF_MEMBER_SHA256")
            q=json.loads(raw)
            if (q.get("status")!="PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER"
                or q.get("source_commit")!=args.expect_source
                or q.get("build_id")!=args.expect_build
                or type(q.get("runtime_archive_bytes")) is not int
                or not 0<q["runtime_archive_bytes"]<=5*1024**3):
                raise ValueError("PROOF_EXACT_SOURCE_BUILD_AND_SIZE")
            archive_bytes=q["runtime_archive_bytes"]
        except (OSError,ValueError,TypeError) as exc:
            proof_error=type(exc).__name__+":"+str(exc)[:90]
    needs_proof=args.phase=="pre" and args.profile in ("lobby","player")
    proof_valid=archive_bytes>0 and proof_error is None
    if needs_proof:
        need(proof_valid,"exact_factory_runtime_proof_required",checks,proof_error)
    if args.phase=="pre":
        min_root=6*1024**3 + (archive_bytes if needs_proof else 0)
    else:
        # Existing live/rollback source needs no new archive extraction.
        min_root=2*1024**3
    need((actual.get("rootAvailableBytes") or 0)>=min_root and
         (not needs_proof or proof_valid),"root_headroom_for_phase",checks,
         {"availableBytes":actual.get("rootAvailableBytes"),"minimumBytes":min_root,
          "proofArchiveBytes":archive_bytes,"proofHold":proof_error})
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
    lobby_required={"deployed_source","deployed_build","real_nonempty_archive",
       "lobby_recent_matches_not_false_empty",
       "lobby_snapshot_recent_matches_not_false_empty",
       "library_data_nonempty","lobby_chat_no_42501","critical_lobby_image_http",
       "anonymous_auth_denied","runtime_ports_and_finance_isolation",
       "single_live_web_service","root_headroom_for_phase"}
    base_required={"deployed_source","deployed_build","library_data_nonempty",
                   "anonymous_auth_denied","runtime_ports_and_finance_isolation",
                   "single_live_web_service","root_headroom_for_phase"}
    check_by_name={x["name"]:x["state"] for x in checks}
    def passed(required):
        return all(check_by_name.get(name)=="PASS" for name in required)
    lobby_ok=passed(lobby_required)
    rollback_ok=passed(base_required)
    baseline_ok=passed(base_required | {"real_nonempty_archive"})
    player_ok=all(x["state"]=="PASS" for x in checks) and args.profile=="player"
    verdicts={"baseline":"PASS" if baseline_ok else "HOLD",
              "lobby":"PASS" if lobby_ok else "HOLD",
              "rollback":"PASS" if rollback_ok else "HOLD",
              "player":"PASS" if player_ok else "HOLD"}
    result={"schema":"aoe2war.we2.production-reconciliation.v1","at":datetime.now(timezone.utc).isoformat(),
            "expected":{"sourceSha":args.expect_source,"buildId":args.expect_build,
                        "phase":args.phase,"profile":args.profile},
            "observed":actual,"checks":checks,
            "lobbyAcceptance":"PASS" if lobby_ok else "HOLD",
            "playerAcceptance":"PASS" if player_ok else "HOLD",
            "acceptance":verdicts[args.profile],
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
        f.write("\nProfile acceptance: **"+result["acceptance"]+"**\n")
        f.write("Lobby acceptance: **"+result["lobbyAcceptance"]+"**\n")
        f.write("Full player acceptance: **"+result["playerAcceptance"]+"**\n")
        f.write("JSON SHA256: "+digest+"\n")
        f.flush();os.fsync(f.fileno())
    gate=result["acceptance"]
    print(json.dumps({"status":gate,"lobbyAcceptance":result["lobbyAcceptance"],
                      "playerAcceptance":result["playerAcceptance"],"json":str(jsonpath),
                      "report":str(mdpath),"sha256":digest,
                      "passed":sum(x["state"]=="PASS" for x in checks),"total":len(checks)}))
    return 0 if gate=="PASS" else 2
if __name__=="__main__":sys.exit(main())
