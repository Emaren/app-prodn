#!/usr/bin/env python3
"""Private read-only source/build campaign census. NOT a scorer or certification authority."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from kingdom_index_dependency_evidence import known_sources,route_evidence,DependencyEvidenceError
PAGE=re.compile(r"page\.(tsx|jsx|ts|js)$")
HANDLER=re.compile(r"route\.(tsx|jsx|ts|js)$")
VALID_KEY=re.compile(r"^/(?:[A-Za-z0-9_@.\-()[\]]+/)*(?:page|route)$")
HEX40=re.compile(r"^[0-9a-f]{40}$")
BUILD_ID=re.compile(r"^[A-Za-z0-9_-]{5,128}$")

def read_json(path,limit=4000000):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>limit:
        raise ValueError("Missing, symlinked or oversized JSON: "+str(path))
    return json.loads(path.read_text(encoding="utf-8"))

def normalize(parts):
    return "/"+"/".join(p for p in parts if p and not (p.startswith("(") and p.endswith(")")) and not p.startswith("@"))

def source_paths(root):
    pages,handlers={},{}
    app=root/"app"
    if app.is_symlink() or not app.is_dir(): raise ValueError("Missing app directory")
    for p in sorted(app.rglob("*")):
        if not p.is_file() or p.is_symlink(): continue
        dest=pages if PAGE.fullmatch(p.name) else handlers if HANDLER.fullmatch(p.name) else None
        if dest is None: continue
        href=normalize(p.relative_to(app).parts[:-1])
        if href in dest: raise ValueError("Duplicate source route "+href)
        dest[href]=p.relative_to(root).as_posix()
    return pages,handlers

def git_state(root):
    try:
        sha=subprocess.run(["git","rev-parse","HEAD"],cwd=root,capture_output=True,text=True,check=True,timeout=8).stdout.strip()
        dirty=subprocess.run(["git","status","--porcelain","--untracked-files=no"],cwd=root,capture_output=True,text=True,check=True,timeout=8).stdout.strip()
        return sha if HEX40.fullmatch(sha) else None,not bool(dirty)
    except (OSError,subprocess.CalledProcessError,subprocess.TimeoutExpired):
        return None,False

def build_paths(directory,expected_id):
    if directory is None: return {"status":"NOT_PROVIDED"},None
    raw=read_json(directory/"server"/"app-paths-manifest.json")
    if not isinstance(raw,dict) or not 0<len(raw)<=15000: raise ValueError("Invalid build manifest object")
    stamp=directory/"BUILD_ID"
    if stamp.is_symlink() or not stamp.is_file() or stamp.stat().st_size>256: raise ValueError("Missing BUILD_ID")
    build=stamp.read_text(encoding="ascii").strip()
    if not BUILD_ID.fullmatch(build) or (expected_id is not None and build!=expected_id):
        raise ValueError("BUILD_ID invalid or does not match expected")
    pages,handlers={},{}
    for key,target in sorted(raw.items()):
        if not isinstance(key,str) or not VALID_KEY.fullmatch(key) or not isinstance(target,str) or not target.startswith("app/") or len(target)>512:
            raise ValueError("Unrecognized emitted route key or target")
        suffix=key.rsplit("/",1)[-1]
        href=normalize(key.strip("/").split("/")[:-1])
        (pages if suffix=="page" else handlers).setdefault(href,[]).append(key)
    digest=hashlib.sha256((directory/"server"/"app-paths-manifest.json").read_bytes()).hexdigest()
    return {"status":"CANDIDATE_BUILD_ONLY","build_id":build,"manifest_sha256":digest,
            "raw_count":len(raw),"page_count":len(pages),"handler_count":len(handlers)},(pages,handlers)

def source_dependency(root,route,known,fast):
    if fast:
        return {"state":"NOT_MEASURED_FAST_MODE","files":[],"compiled_closure":False,
                "runtime_edges":"UNKNOWN"}
    try:
        d=route_evidence(root,route,known)
        return {"state":d["status"],"lexical_source_digest":d["source_closure"],
                "files":d["files"],"file_count":d["file_count"],
                "possible_api_refs":d["referenced_api_routes"],
                "unresolved_imports":d["unresolved_local_imports"],
                "generated_prisma_unverified":d["generated_declarations_unverified"],
                "dynamic_import_modules":d["nonliteral_import_modules"],
                "compiled_closure":False,"runtime_edges":"UNKNOWN"}
    except (OSError,ValueError,DependencyEvidenceError) as e:
        return {"state":"UNRESOLVED", "reason":str(e),
                "files":[],"compiled_closure":False,"runtime_edges":"UNKNOWN"}

def run_census(root,build_dir=None,expected_sha=None,expected_build_id=None,fast=False):
    if expected_sha is not None and not HEX40.fullmatch(expected_sha): raise ValueError("Invalid expected SHA")
    registry=read_json(root/"config"/"renaissance-campaign.json")
    old=read_json(root/"config"/"kingdom-index-inventory.json")
    rows=[(href,phase["id"],phase["code"]) for phase in registry["phases"] for href in phase["routes"]]
    planned=[r[0] for r in rows]
    if not planned or len(planned)!=len(set(planned)): raise ValueError("Invalid or duplicate campaign route")
    pages,handlers=source_paths(root)
    inventory={p["href"]:p for p in old["pages"]}
    head,clean=git_state(root)
    build,build_rows=build_paths(build_dir,expected_build_id)
    build["clean_exact_head"]=bool(expected_sha and expected_sha==head and clean)
    lexical=known_sources(root) if not fast else None
    dossiers=[]
    for rank,(href,phase,code) in enumerate(rows,1):
        hint=inventory.get(href,{}).get("scope","HISTORICAL_SCOPE_UNKNOWN")
        category=("admin" if href=="/admin" or href.startswith("/admin/") else
                  "dynamic" if "[" in href else "private_utility" if hint=="excluded-static" else "public_static")
        owner=("CENTRAL_SCORE_AUTHORITY" if href=="/kingdom-index" else
               "FINANCIAL_LANE_HELD" if phase=="V" else "UNASSIGNED_CENTRAL_REVIEW")
        dep=(source_dependency(root,href,lexical,fast) if href in pages else
             {"state":"SOURCE_MISSING","files":[],"compiled_closure":False,"runtime_edges":"UNKNOWN"})
        dossiers.append({"route":href,"entrypoint":pages.get(href),"rank":rank,"phase":phase,
                         "phase_code":code,"kind":category,"scope_hint":hint,"owner":owner,
                         "dependency":dep,"browser":"UNEXECUTED","accessibility":"UNEXECUTED",
                         "api_smoke":"UNEXECUTED","domain_pg_replay":"UNEXECUTED",
                         "p75_p95_heap":"UNEXECUTED","public_get_nonmutation":"UNPROVEN",
                         "score":None,"certified":False})
    diffs={"planned_missing_in_source":sorted(set(planned)-set(pages)),
           "source_unplanned":sorted(set(pages)-set(planned)),
           "historical_pages_delta":len(pages)-old["counts"]["pageTemplates"],
           "historical_handlers_delta":len(handlers)-old["counts"]["routeHandlerTemplates"]}
    if build_rows:
        bp,bh=build_rows
        diffs["emitted"]={
            "source_pages_not_emitted":sorted(set(pages)-set(bp)),
            "emitted_pages_not_source":{r:bp[r] for r in sorted(set(bp)-set(pages))},
            "source_handlers_not_emitted":sorted(set(handlers)-set(bh)),
            "emitted_handlers_not_source":{r:bh[r] for r in sorted(set(bh)-set(handlers))},
            "note":"Generated Next metadata/404 or other artifacts must be classified; not automatic missing source"}
    else: diffs["emitted"]={"state":"UNKNOWN_MANIFEST_ABSENT"}
    return {"schema":"aoe2war.renaissance.tabd.private-candidate.v1",
            "read_only":True,"private_operator_only":True,"public_api_publishable":False,
            "quality_score":None,"certified":False,"production_attested":False,
            "source_sha":head,"tracked_clean":clean,"expected_sha":expected_sha,
            "build":build,"campaign_000":"/kingdom-index",
            "phase_order":[p["id"] for p in registry["phases"]],
            "planning_count":len(planned),"source_counts":{
                "pages":len(pages),"handlers":len(handlers),
                "api_handlers":sum(h.startswith("/api/") for h in handlers),
                "other_handlers":sum(not h.startswith("/api/") for h in handlers),
                "historical_handler_baseline":old["counts"]["routeHandlerTemplates"],
                "public_index_baseline":old["counts"]["publicIndexTemplates"]},
            "mismatch_queue":diffs,"matrix":{
                "templates":len(dossiers),
                "by_kind":{kind:sum(r["kind"]==kind for r in dossiers)
                           for kind in ("public_static","admin","private_utility","dynamic")},
                "browser_completed":0,"a11y_completed":0,"domain_completed":0,
                "get_nonmutation_proven":0},
            "unresolved":["compiled transitive import/Next module closure",
                          "Prisma generated artifact attestation",
                          "dynamic imports and runtime-only database/API edges",
                          "authenticated production build parity",
                          "browser, a11y, PG/replay, P75/P95, heap and GET write proof"],
            "dossiers":dossiers}

def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument("action",choices=("inventory","verify","doctor","impact","map","next","matrix"))
    a.add_argument("subject",nargs="?")
    a.add_argument("--root",type=Path,default=ROOT)
    a.add_argument("--build-dir",type=Path)
    a.add_argument("--expected-sha")
    a.add_argument("--expected-build-id")
    a.add_argument("--fast",action="store_true",help="Report dependencies unmeasured; skip lexical walk")
    args=a.parse_args()
    try:
        report=run_census(args.root.resolve(),args.build_dir,args.expected_sha,args.expected_build_id,args.fast)
        dossiers=report["dossiers"]
        status=0
        if args.action=="verify":
            report.pop("dossiers")
            queue=report["mismatch_queue"]
            bad=bool(queue["planned_missing_in_source"] or queue["source_unplanned"])
            emitted=queue["emitted"]
            if "state" not in emitted:
                bad=bad or any(emitted[k] for k in ("source_pages_not_emitted",
                    "emitted_pages_not_source","source_handlers_not_emitted","emitted_handlers_not_source"))
            report["source_and_provided_build_match"]=not bad
            status=2 if bad else 0
        elif args.action=="doctor":
            row=next((r for r in dossiers if r["route"]==args.subject),None)
            if row is None: raise ValueError("Unknown campaign route")
            report={"status":"PRIVATE_UNCERTIFIED_DOSSIER","source_sha":report["source_sha"],
                    "dossier":row,"build":report["build"]}
        elif args.action=="impact":
            target=args.subject or ""
            if not target or target.startswith("/") or ".." in Path(target).parts:
                raise ValueError("impact requires repo-relative non-traversing file")
            report={"file":target,"lexical_routes":[r["route"] for r in dossiers
                       if target in r["dependency"]["files"]],
                    "not_proven_unaffected":[r["route"] for r in dossiers
                       if r["dependency"]["state"]!="STATIC_LEXICAL_CENSUS_ONLY"],
                    "warning":"Unlisted routes are NOT proved unaffected by lexical census"}
        elif args.action=="next":
            report={"route":"/kingdom-index","gate":"CAMPAIGN_000",
                    "status":"NO_CERTIFICATION_ASSUMED","phase_one_head":dossiers[0]["route"]}
        elif args.action=="map":
            report={"phase_order":report["phase_order"],"campaign_000":"/kingdom-index",
                    "phases":{p:[r["route"] for r in dossiers if r["phase"]==p]
                              for p in report["phase_order"]}}
        elif args.action=="matrix":
            report={"source_sha":report["source_sha"],"coverage":report["matrix"],
                    "unresolved":report["unresolved"],"phase_order":report["phase_order"]}
        print(json.dumps(report,indent=2,sort_keys=True))
        return status
    except (ValueError,OSError,KeyError,TypeError,UnicodeError) as exc:
        print("TAB D STOP: "+str(exc),file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
