#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
CONTRACT=ROOT/"config/aoe2war-operations.json"
STATES={"PLANNED","BUILDING","TESTING","READY","PAUSED","BLOCKED","CONFLICT","REVIEW_REQUIRED","RECONCILING","INTEGRATING","CERTIFYING","RELEASED","ABANDONED"}
CRITICAL={"database-schema","financial-truth","replay-finality","battle-identity","watcher-reconciliation","release-engineering","wolo-boundary"}
RULES=(
("database-schema",("prisma/schema.prisma","prisma/migrations/")),
("financial-truth",("lib/bets","lib/scheduledMatchSettlement","lib/challengeFinancial","app/api/bets/","app/api/staking/","app/api/challenges/")),
("battle-identity",("lib/battleIdentity","lib/liveGames","lib/liveSession","app/api/live-games/")),
("watcher-reconciliation",("lib/watch","lib/liveGames","lib/liveSession","tests/watcher","tests/live-")),
("replay-finality",("lib/replay","app/api/replay","tests/hd-replay","tests/replay")),
("wargraph",("lib/wargraph/","app/wargraph/","app/api/wargraph/")),
("release-engineering",("bin/aoe2war","scripts/aoe2_","config/aoe2war-operations.json","docs/RELEASE_ENGINEERING.md","DEPLOY.md")),
("wolo-boundary",("lib/wolo","app/api/wolo","scripts/wolo")),
)
class Err(RuntimeError): pass

def sh(args,cwd=ROOT):
 p=subprocess.run(args,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,check=False)
 return p.returncode,p.stdout.strip()
def git(*args,cwd=ROOT):
 rc,out=sh(["git",*args],cwd)
 if rc: raise Err(f"git {' '.join(args)} failed in {cwd}: {out}")
 return out
def contract(): return json.loads(CONTRACT.read_text()).get("parallel_development",{})
def common(repo=ROOT):
 p=Path(git("rev-parse","--git-common-dir",cwd=repo)); return (p if p.is_absolute() else repo/p).resolve()
def store(repo=ROOT):
 p=common(repo)/(contract().get("state_store_relative_to_git_common_dir") or "aoe2war-dev/lanes"); p.mkdir(parents=True,exist_ok=True); return p
def branch(repo): return git("branch","--show-current",cwd=repo)
def mp(branch_name,repo=ROOT): return store(repo)/(hashlib.sha256(branch_name.encode()).hexdigest()[:16]+".json")
def load(branch_name,repo=ROOT):
 p=mp(branch_name,repo)
 if not p.is_file(): return None
 x=json.loads(p.read_text());
 if x.get("branch")!=branch_name: raise Err(f"manifest mismatch: {p}")
 return x
def manifests(repo=ROOT):
 out=[]
 for p in store(repo).glob("*.json"):
  try: x=json.loads(p.read_text())
  except Exception: continue
  if isinstance(x,dict) and x.get("branch"): out.append(x)
 return out
def atomic(path,payload):
 t=path.with_suffix(".tmp"); t.write_text(json.dumps(payload,indent=2,sort_keys=True)+"\n"); t.replace(path)
def slug(s): return re.sub(r"[^a-z0-9]+","_",s.lower().replace("feature/","",1)).strip("_") or "lane"
def dbname(b):
 pre=contract().get("shadow_database_prefix") or "aoe2hdbets_shadow_lane_"; h=hashlib.sha256(b.encode()).hexdigest()[:6]; s=slug(b); n=max(1,63-len(pre)-len(h)-1); return f"{pre}{s[:n]}_{h}"
def ports(b):
 c=contract(); start=int(c.get("dev_port_start",3100)); end=int(c.get("dev_port_end",3198)); stride=int(c.get("dev_port_stride",2)); vals=list(range(start,end+1,stride)); off=int(hashlib.sha256(b.encode()).hexdigest()[:8],16)%len(vals); return vals[off:]+vals[:off]
def alloc(b,repo=ROOT):
 old=load(b,repo)
 if old and old.get("dev_port"): return int(old["dev_port"])
 used={int(x["dev_port"]) for x in manifests(repo) if x.get("branch")!=b and x.get("dev_port")}
 for p in ports(b):
  if p not in used and p+1 not in used: return p
 raise Err("parallel dev port pool exhausted")
def normalize_state(s):
 s=s.strip().upper().replace("-","_")
 if s not in STATES: raise Err("invalid state: "+s)
 return s
def merge_base(repo): return git("merge-base","main","HEAD",cwd=repo)
def register(repo,owner=None,state=None,contracts=None,depends=None,paths=None,note=None):
 b=branch(repo)
 if not b or b=="main": raise Err("claim requires a named non-main worktree")
 x=load(b,repo) or {"schema":1,"branch":b,"base_sha":merge_base(repo),"created_at":datetime.now(timezone.utc).isoformat()}
 x.update({"branch":b,"worktree":str(repo.resolve()),"head_sha":git("rev-parse","HEAD",cwd=repo),"updated_at":datetime.now(timezone.utc).isoformat()})
 x["owner"]=owner if owner is not None else x.get("owner") or os.getenv("AOE2WAR_AI_OWNER") or "unclaimed"
 x["state"]=normalize_state(state or x.get("state") or "BUILDING")
 x.setdefault("dev_port",alloc(b,repo)); x.setdefault("shadow_database",dbname(b))
 if contracts is not None: x["contracts"]=sorted(set(filter(None,map(str.strip,contracts))))
 else: x.setdefault("contracts",[])
 if depends is not None: x["depends_on"]=sorted(set(filter(None,map(str.strip,depends))))
 else: x.setdefault("depends_on",[])
 if paths is not None: x["planned_paths"]=sorted(set(filter(None,map(str.strip,paths))))
 else: x.setdefault("planned_paths",[])
 if note is not None: x["note"]=note
 atomic(mp(b,repo),x); return x
def changed(repo,base):
 out=set()
 for a in (("diff","--name-only",f"{base}...HEAD"),("diff","--name-only"),("diff","--cached","--name-only"),("ls-files","--others","--exclude-standard")):
  rc,s=sh(["git",*a],repo)
  if not rc: out.update(x.strip() for x in s.splitlines() if x.strip())
 return sorted(out)
def infer(paths):
 out=set()
 for p in paths:
  for name,needles in RULES:
   if any(p==n or p.startswith(n) for n in needles): out.add(name)
 return sorted(out)
def dbfront(paths): return any(p=="prisma/schema.prisma" or p.startswith("prisma/migrations/") for p in paths)
def count(repo,spec):
 rc,out=sh(["git","rev-list","--count",spec],repo)
 try: return int(out) if not rc else 0
 except: return 0
def dirty(repo):
 rc,out=sh(["git","status","--porcelain","--untracked-files=all"],repo)
 if rc: return ["<status-error>"]
 return sorted(set((x[3:].split(" -> ",1)[-1]) for x in out.splitlines() if len(x)>=4))
def lane(repo,main):
 b=branch(repo); h=git("rev-parse","HEAD",cwd=repo); m=load(b,repo) or {}; base=m.get("base_sha") or merge_base(repo); paths=changed(repo,base); d=dirty(repo); rc,_=sh(["git","merge-base","--is-ancestor",main,h],repo); desc=rc==0
 return {"branch":b,"head":h,"base_sha":base,"path":str(repo.resolve()),"owner":m.get("owner","unclaimed"),"state":m.get("state","UNCLAIMED"),"changed_paths":paths,"dirty_paths":d,"dirty":bool(d),"contracts":sorted(set(infer(paths))|set(m.get("contracts",[]))),"depends_on":m.get("depends_on",[]),"database_frontier":dbfront(paths),"dev_port":m.get("dev_port"),"shadow_database":m.get("shadow_database"),"main_drift":count(repo,f"HEAD..{main}"),"feature_ahead":count(repo,f"{main}..HEAD"),"descendant":desc,"next_step":m.get("next_step"),"tests":m.get("tests",{})}
def severity(a,b):
 files=sorted(set(a["changed_paths"])&set(b["changed_paths"])); sem=sorted(set(a["contracts"])&set(b["contracts"]))
 if a["database_frontier"] and b["database_frontier"]: return "HIGH",files,sorted(set(sem)|{"database-schema"})
 if set(sem)&CRITICAL: return "HIGH",files,sem
 if files or sem: return "MEDIUM",files,sem
 return "LOW",files,sem
def worktrees():
 raw=git("worktree","list","--porcelain"); out=[]
 for block in [x for x in raw.split("\n\n") if x.strip()]:
  f={}
  for line in block.splitlines():
   if " " in line: k,v=line.split(" ",1); f[k]=v
  out.append((Path(f["worktree"]),f.get("branch","").replace("refs/heads/","")))
 return out
def snapshot():
 main=git("rev-parse","main"); origin=git("rev-parse","origin/main"); lanes=[]
 for p,b in worktrees():
  if b and b!="main":
   try: lanes.append(lane(p,main))
   except Exception as e: lanes.append({"branch":b,"path":str(p),"state":"ERROR","owner":"?","error":str(e),"changed_paths":[],"contracts":[],"database_frontier":False,"dirty":True,"main_drift":0,"feature_ahead":0,"descendant":False,"dev_port":None,"shadow_database":None,"depends_on":[]})
 conflicts=[]
 for i,a in enumerate(lanes):
  for b in lanes[i+1:]:
   sev,files,sem=severity(a,b)
   if sev!="LOW": conflicts.append({"severity":sev,"left":a["branch"],"right":b["branch"],"files":files,"contracts":sem})
 return {"main":main,"origin_main":origin,"exact":main==origin,"lanes":lanes,"conflicts":conflicts}
def print_status(s):
 print("⚔️  AOE2WAR DEVELOPMENT CONTROL PLANE\n"); print(f"Main: {s['main'][:12]}  GitHub: {s['origin_main'][:12]}  exact={'YES' if s['exact'] else 'NO'}"); print(f"Active lanes: {len(s['lanes'])}  conflicts: {len(s['conflicts'])}\n")
 print(f"{'STATE':<15} {'OWNER':<12} {'DRIFT':>5} {'Δ':>4} {'PORT':>5} {'BRANCH'}")
 for x in s["lanes"]: print(f"{x['state']:<15} {x['owner'][:11]:<12} {x['main_drift']:>5} {len(x['changed_paths']):>4} {str(x.get('dev_port') or '—'):>5} {x['branch']}")
 if s["conflicts"]:
  print("\nCONFLICT FORECAST")
  for c in s["conflicts"]:
   print(f"{c['severity']:<6} {c['left']} <-> {c['right']}")
   if c['files']: print("       files: "+", ".join(c['files'][:8]))
   if c['contracts']: print("       contracts: "+", ".join(c['contracts']))
 print("\nINTEGRATION READINESS")
 for x in s["lanes"]:
  ready=x["state"]=="READY" and not x["dirty"] and x["main_drift"]==0 and x["descendant"]
  print(("READY  " if ready else "WAIT   ")+x["branch"]+("" if ready else f" — state={x['state']} dirty={int(x['dirty'])} drift={x['main_drift']}"))
def ensure_cert():
 names=("localhost+2.pem","localhost+2-key.pem")
 if all((ROOT/n).is_file() for n in names): return
 canon=Path(json.loads(CONTRACT.read_text())["canonical"]["operator_repo"]).expanduser()
 if all((canon/n).is_file() for n in names):
  for n in names:
   p=ROOT/n
   if not p.exists(): p.symlink_to(canon/n)
  return
 rc,_=sh(["mkcert","-install"],ROOT)
 if rc: raise Err("mkcert -install failed")
 rc,_=sh(["mkcert","localhost","127.0.0.1","::1"],ROOT)
 if rc: raise Err("mkcert certificate generation failed")
def runtime_env():
 x=register(ROOT); return x,{**os.environ,"AOE2WAR_DEV_PORT":str(x["dev_port"]),"AOE2WAR_SHADOW_DB":x["shadow_database"]}
def main():
 p=argparse.ArgumentParser(prog="aoe2war parallel"); sub=p.add_subparsers(dest="cmd")
 for name in ("status","plan"): q=sub.add_parser(name); q.add_argument("--json",action="store_true")
 q=sub.add_parser("claim"); q.add_argument("--owner",required=True); q.add_argument("--state",default="BUILDING",choices=sorted(STATES)); q.add_argument("--contract",action="append",default=[]); q.add_argument("--depends-on",action="append",default=[]); q.add_argument("--path",action="append",default=[]); q.add_argument("--note")
 q=sub.add_parser("handoff"); q.add_argument("--state",required=True,choices=sorted(STATES)); q.add_argument("--next"); q.add_argument("--note"); q.add_argument("--test",action="append",default=[])
 sub.add_parser("runtime"); sub.add_parser("refresh"); sub.add_parser("serve")
 a=p.parse_args(); cmd=a.cmd or "status"
 try:
  if cmd in {"status","plan"}:
   s=snapshot(); print(json.dumps(s,indent=2,sort_keys=True)) if getattr(a,"json",False) else print_status(s)
   if cmd=="plan" and not getattr(a,"json",False): print("\nRULE: develop in parallel; integrate ONE ready lane into main at a time. No auto-merge/rebase.")
   return 0
  if cmd=="claim":
   x=register(ROOT,a.owner,a.state,a.contract,a.depends_on,a.path,a.note); print(json.dumps(x,indent=2,sort_keys=True)); return 0
  if cmd=="handoff":
   tests={}
   for item in a.test:
    if "=" not in item: raise Err("--test expects NAME=RESULT")
    k,v=item.split("=",1); tests[k.strip()]=v.strip()
   x=register(ROOT,state=a.state); x["next_step"]=a.next; x["note"]=a.note if a.note is not None else x.get("note"); x["tests"]=tests; x["updated_at"]=datetime.now(timezone.utc).isoformat(); atomic(mp(x["branch"],ROOT),x); print(json.dumps(x,indent=2,sort_keys=True)); return 0
  if cmd=="runtime":
   x,_=runtime_env(); print(f"Branch: {x['branch']}\nHTTPS: https://localhost:{x['dev_port']}\nRedirect: http://localhost:{int(x['dev_port'])+1}\nShadow DB: {x['shadow_database']}"); return 0
  if cmd in {"refresh","serve"}:
   x,env=runtime_env(); ensure_cert(); action="refresh" if cmd=="refresh" else "serve"; print(f"PASS: lane={x['branch']} port={x['dev_port']} shadow={x['shadow_database']}"); return subprocess.run([sys.executable,"scripts/dev-shadow.py",action],cwd=ROOT,env=env).returncode
 except Err as e: print(f"STOP: {e}",file=sys.stderr); return 2
 return 2
if __name__=="__main__": raise SystemExit(main())
