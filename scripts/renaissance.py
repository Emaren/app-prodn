#!/usr/bin/env python3
"""Renaissance read-only engineering campaign CLI. Never creates commits, certifies or deploys."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from kingdom_index_dependency_evidence import route_evidence,known_sources,DependencyEvidenceError
CATALOG=ROOT/"config/renaissance-campaign.json"
def load():
  doc=json.loads(CATALOG.read_text())
  routes=[r for p in doc["phases"] for r in p["routes"]]
  if len(routes)!=132 or len(set(routes))!=132: raise ValueError("expected 132 unique baseline routes")
  return doc,routes
def main():
  p=argparse.ArgumentParser(description=__doc__)
  p.add_argument("action",choices=("verify","map","next","doctor","impact"))
  p.add_argument("subject",nargs="?",help="exact route for doctor, repository-relative filename for impact")
  p.add_argument("--json",action="store_true")
  args=p.parse_args()
  try:
    catalog,routes=load()
    if args.action=="verify":
      instrument_routes=[m["href"] for m in catalog["modules"]]
      expected=set(routes)|set(instrument_routes)
      discovered={("/"+p.relative_to(ROOT/"app").parent.as_posix()).replace("/.","/") for p in (ROOT/"app").rglob("page.tsx")}
      missing=sorted(expected-discovered)
      uncatalogued=sorted(discovered-expected)
      out={"status":"SOURCE_ONLY","baseline":catalog["sourceBaselineSha"],"campaign_targets":len(routes),"renaissance_instruments":len(instrument_routes),"source_template_count":len(discovered),"phases":len(catalog["phases"]),"missing":missing,"uncatalogued":uncatalogued,"index_score_authority":"none","note":"Source inventory only; scores, CI, production, ownership and release are separate."}
      code=2 if missing or uncatalogued else 0
    elif args.action=="map":
      out={"status":"PLANNING_ORDER_ONLY","phases":[{"id":p["id"],"name":p["name"],"count":len(p["routes"]),"routes":p["routes"]} for p in catalog["phases"]]}
      code=0
    elif args.action=="next":
      out={"route":routes[0],"rank":1,"status":"QUEUE_HEAD_ONLY","warning":"Not a GitHub ownership, current score, dependency readiness or release claim; inspect live PRs."}
      code=0
    elif args.action=="doctor":
      if not args.subject or args.subject not in routes: raise ValueError("doctor requires one canonical baseline route")
      known=known_sources(ROOT)
      d=route_evidence(ROOT,args.subject,known)
      phase=next(p["id"] for p in catalog["phases"] if args.subject in p["routes"])
      out={"campaignRank":routes.index(args.subject)+1,"phase":phase,"dependency":d,"status":"SOURCE_ONLY_UNCERTIFIED","instructions":"Check GitHub PR collisions, source authority, CI and real browser/production independently."}
      code=0
    else:
      if not args.subject or args.subject.startswith("/") or ".." in Path(args.subject).parts: raise ValueError("impact requires a safe repo-relative source path")
      target=Path(args.subject).as_posix()
      known=known_sources(ROOT)
      affected=[]; incomplete=[]
      for route in routes:
        d=route_evidence(ROOT,route,known)
        if target in d["files"]: affected.append(route)
        if d["status"]!="STATIC_LEXICAL_CENSUS_ONLY": incomplete.append(route)
      out={"file":target,"affectedRoutes":affected,"unknownClosureRoutes":incomplete,"status":"CONSERVATIVE_LEXICAL_SOURCE_ONLY","warning":"Unlisted routes are NOT proven unaffected. No build/runtime attestation."}
      code=0
    print(json.dumps(out,indent=2,sort_keys=True) if args.json else json.dumps(out,indent=2))
    return code
  except (ValueError,OSError,DependencyEvidenceError) as exc:
    print("RENAISSANCE STOP: "+str(exc),file=sys.stderr);return 2
if __name__=="__main__":raise SystemExit(main())
