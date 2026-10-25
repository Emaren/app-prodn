#!/usr/bin/env python3
"""Read-only, source-aligned public Index browser plan. Never a scoring authority."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from renaissance_tabd_forge import (read_json,source_paths,git_state,build_paths,
    source_dependency)
from kingdom_index_dependency_evidence import known_sources

SOURCE_POLICY="SOURCE_ONLY_NOT_RUNTIME_PROOF"
UNKNOWN="UNMEASURED"
PRIVATE_PATHS=("/admin","/api","/auth","/wallet","/profile","/settings","/connect-wallet")
THEME_EXCLUSIONS=("/academy","/statistics","/traffic","/speed")
ROOT_IMPACT=("package.json","yarn.lock","tsconfig.json","next.config.ts",
             "prisma/schema.prisma","app/layout.tsx","app/AppShell.tsx",
             "lib/livingKingdom/realms.ts","lib/pageChangeManifest.generated.ts",
             "components/speed/SpeedProof.tsx")
SENSITIVE_TOKENS=("cookie","token","secret","wallet","private","signature")
def sha(path:Path)->str:
    if not path.is_file() or path.is_symlink() or path.stat().st_size>4_000_000:
        raise ValueError("Missing or unsafe source policy input: "+str(path))
    return hashlib.sha256(path.read_bytes()).hexdigest()
def speed_authority(root):
    file=root/"components/speed/SpeedProof.tsx"
    raw=file.read_text("utf8")
    match=re.search(r"const AUTHORITATIVE_ROUTES = new Set\(\[([\s\S]*?)\]\);",raw)
    if match is None:raise ValueError("Speed Proof policy moved; re-review required")
    return set(re.findall(r'"(/[^"]*)"',match.group(1)))
def gray_eligibility(root):
    raw=(root/"lib/pageChangeManifest.generated.ts").read_text("utf8")
    matches=re.findall(r'href:\s*"(/[^"]*)"',raw)
    if not matches: raise ValueError("Gray Dot manifest unavailable")
    return set(matches)
def realm_policy(root,routes):
    # Execute the existing canonical predicate, not an invented route matcher.
    # Node 22.22+ strips the local TS types; the module has no side effects.
    import subprocess
    code=("import {livingKingdomRealmForPath} from './lib/livingKingdom/realms.ts';"
          "const routes=JSON.parse(process.argv[1]);"
          "console.log(JSON.stringify(routes.map(path=>livingKingdomRealmForPath(path))));")
    try:
        p=subprocess.run(["node","--experimental-strip-types","--input-type=module","-e",
           code,json.dumps(routes)],cwd=root,capture_output=True,text=True,timeout=15,check=True)
        values=json.loads(p.stdout.strip())
        if not isinstance(values,list) or len(values)!=len(routes) or any(
           v is not None and not isinstance(v,str) for v in values):
            raise ValueError("Invalid canonical realm policy projection")
        return values,None
    except (OSError,ValueError,subprocess.CalledProcessError,subprocess.TimeoutExpired) as err:
        return [None]*len(routes),"CANONICAL_REALM_PREDICATE_UNAVAILABLE: "+type(err).__name__
def make_plan(root:Path,build:Path|None=None,expected_sha:str|None=None,
              expected_build_id:str|None=None,deep:bool=False):
    index=read_json(root/"config/kingdom-index-routes.json")
    inventory=read_json(root/"config/kingdom-index-inventory.json")
    phases=read_json(root/"config/renaissance-campaign.json")
    profiles=read_json(root/"config/kingdom-index-assurance-profiles.json")
    rubric=read_json(root/"config/kingdom-index-quality-rubric.json")
    if not isinstance(index,list) or len(index)!=88:raise ValueError("Expected exact 88 public Index routes")
    routes=[r["href"] for r in index]
    if len(set(routes))!=88 or any(not isinstance(r,str) or not r.startswith("/") or
          r=="/admin" or r.startswith(PRIVATE_PATHS) or "[" in r for r in routes):
        raise ValueError("Unsafe or duplicated Index public route")
    scope={r["href"]:r["scope"] for r in inventory["pages"]}
    if any(scope.get(r)!="public-index" for r in routes):
        raise ValueError("Public scope diverges from inventory")
    phase_map={r:p["id"] for p in phases["phases"] for r in p["routes"]}
    if len(phases["phases"])!=7 or any(r not in phase_map for r in routes):
        raise ValueError("Seven-phase planning and Index mismatch")
    route_profiles=profiles["routeProfiles"]
    profile_data=profiles["profiles"]
    if any(route_profiles.get(r) not in profile_data for r in routes):
        raise ValueError("Missing specialized assurance profile")
    pages,handlers=source_paths(root)
    if any(r not in pages for r in routes):raise ValueError("Uncompiled public entrypoint absent")
    head,clean=git_state(root)
    if not head or not clean or (expected_sha and head!=expected_sha):
        raise ValueError("Cannot bind census to clean exact Git head")
    build_data,emitted=build_paths(build,expected_build_id)
    if build is not None:
        if not expected_build_id:raise ValueError("Require independently passed expected BUILD_ID")
        if not emitted:raise ValueError("Unrecognized emitted build")
        absent=sorted(set(routes)-set(emitted[0]))
        if absent:raise ValueError("Public pages absent from compiled manifest: "+str(absent[:8]))
    speed=speed_authority(root); gray=gray_eligibility(root)
    realms,realm_error=realm_policy(root,routes)
    known=known_sources(root) if deep else None
    policies={p:sha(root/p) for p in ["components/speed/SpeedProof.tsx",
            "lib/livingKingdom/realms.ts","lib/pageChangeManifest.generated.ts",
            "docs/SITE_THEME_CAMPAIGN.md","config/kingdom-index-routes.json",
            "config/kingdom-index-assurance-profiles.json",
            "config/kingdom-index-quality-rubric.json"]}
    documents=[]
    for i,(record,realm) in enumerate(zip(index,realms)):
        route=record["href"]; profile=route_profiles[route]
        dependency=source_dependency(root,route,known,fast=not deep)
        excluded=any(route==prefix or route.startswith(prefix+"/") for prefix in THEME_EXCLUSIONS)
        live=(None if realm_error else realm)
        documents.append({
            "route":route,"label":record["label"],"district":record["district"],
            "category":"public_index_static","phase":phase_map[route],
            "entrypoint":pages[route],"owner":"CENTRAL_DOMAIN_OWNER_UNASSIGNED",
            "profile":profile,"specialty_gates":profile_data[profile]["gates"],
            "dependency":dependency,"source_closure_complete":False,
            "overlay_source_policy":{
               "speed_explicit_route": route in speed,
               "speed_readiness":UNKNOWN,
               "gray_enrolled":route in gray,
               "gray_revision":"SOURCE_ENROLLED_ONLY" if route in gray else "NOT_ENROLLED",
               "living_realm":live,
               "living_eligibility":"UNKNOWN" if realm_error else ("YES_BY_POLICY" if live else "NO_BY_POLICY"),
               "theme":"EXCLUDED_BY_POLICY" if excluded else "CAMPAIGN_DEPENDENT_UNVERIFIED",
               "assurance":SOURCE_POLICY
            },
            "evidence":{"desktop":UNKNOWN,"mobile":UNKNOWN,"keyboard":UNKNOWN,
              "accessibility":UNKNOWN,"api_read":UNKNOWN,"api_failure":UNKNOWN,
              "readiness":UNKNOWN,"p75_p95":UNKNOWN,"heap":UNKNOWN,
              "auth":UNKNOWN,"postgre_replay":UNKNOWN,"production":UNKNOWN},
            "missing_criteria":["EXACT_BUILD_BROWSER","DOMAIN_ASSERTIONS","INDEPENDENT_LIVE_CERTIFICATION"],
            "quality_score":None,"certified":False,
        })
    return {
      "schema":"aoe2war.renaissance.public88.factory-plan.v1",
      "source_sha":head,"source_clean":True,"build":build_data,
      "candidate_only":True,"production_certified":False,"score":None,
      "planned_public":88,"actual_templates":len(pages),
      "actual_handlers":len(handlers),"historical_baseline":{"pages":144,"handlers":273},
      "next_candidate_note":"Central #892 separately proposes 146 templates/275 handlers; never infer from this branch",
      "phase_order":[p["id"] for p in phases["phases"]],
      "policy_digests":policies,
      "rubric_dimensions":list(rubric.get("dimensions",{})) if isinstance(rubric.get("dimensions"),dict) else "SEE_SOURCE",
      "known_limitations":[
        "Lexical dependency traversal is NOT compiled full closure",
        "Dynamic import, generated Prisma, DB, runtime and API edges may be absent",
        "BUILD_ID is a local candidate artifact, not an authenticated deployed identity",
        "No browser verdict until Chrome receipts exist",
        "No live production, independent signer, scorer point awards or custody operations"],
      "realm_policy_error":realm_error,"routes":documents
    }

def impact(plan,paths):
    routes=plan["routes"]
    changed=sorted(set(paths))
    for p in changed:
        if p.startswith("/") or "\\" in p or ".." in p.split("/") or not p:
            raise ValueError("Invalid relative changed file")
    # Any incomplete transitive closure => inability to safely exclude routes.
    closure_incomplete=any(not r.get("source_closure_complete",False) for r in routes)
    directly=[r["route"] for r in routes if any(p==r["entrypoint"] or
          p in r["dependency"].get("files",[]) for p in changed)]
    all_routes=[r["route"] for r in routes]
    if changed and closure_incomplete:
        affected=all_routes
        reason="FAIL_CLOSED_UNPROVEN_COMPILED_CLOSURE"
    elif any(p in ROOT_IMPACT or p.startswith(("lib/","components/","app/api/","config/")) for p in changed):
        affected=all_routes
        reason="SHARED_OR_GLOBAL_SOURCE"
    else:
        affected=directly
        reason="COMPLETE_CLOSURE_PROVED"
    return {"source_sha":plan["source_sha"],"changed_files":changed,
       "direct_lexical_hits":directly,"invalidated_routes":affected,"reason":reason,
       "certified_unaffected_routes":[] if closure_incomplete else
        sorted(set(all_routes)-set(affected)),
       "note":"Conservative invalidation is NOT proof of a defect."}

def main():
    a=argparse.ArgumentParser()
    a.add_argument("action",choices=["plan","impact","matrix"])
    a.add_argument("paths",nargs="*")
    a.add_argument("--expected-sha")
    a.add_argument("--build-dir",type=Path)
    a.add_argument("--expected-build-id")
    a.add_argument("--deep",action="store_true")
    a.add_argument("--output",type=Path)
    a.add_argument("--root",type=Path,default=ROOT)
    o=a.parse_args()
    try:
        plan=make_plan(o.root.resolve(),o.build_dir,o.expected_sha,o.expected_build_id,o.deep)
        if o.action=="impact":report=impact(plan,o.paths)
        elif o.action=="matrix":report={"source_sha":plan["source_sha"],
            "build":plan["build"],"routes":[{"route":r["route"],"phase":r["phase"],
            "profile":r["profile"],"overlay_source_policy":r["overlay_source_policy"],
            "evidence":r["evidence"]} for r in plan["routes"]]}
        else:report=plan
        output=json.dumps(report,indent=2,sort_keys=True)+"\n"
        if o.output:
            if o.output.is_symlink():raise ValueError("Unsafe output symlink")
            o.output.write_text(output,"utf8")
        else:sys.stdout.write(output)
    except (OSError,ValueError,KeyError,TypeError) as err:
        print("RENAISSANCE 88 FACTORY HOLD: "+str(err),file=sys.stderr)
        return 2
    return 0
if __name__=="__main__":raise SystemExit(main())
