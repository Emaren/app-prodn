#!/usr/bin/env python3
"""Operator-only Sentinel: authenticated receipts -> SQLite journal -> private inbox outbox."""
from __future__ import annotations
import argparse,datetime as dt,hashlib,json,os,sqlite3,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PLANES=("mac","hel1-root","hel1-volume-105319120")
UTC=dt.timezone.utc; GIB=1024**3; HREF="/aoe2war-os/storage-atlas"
STALE_SECONDS=900
RULES={
"storage_pressure":("INSPECT_ORDINARY_HEADROOM","Inspect available blocks and protected consumers."),
"storage_regression":("SIGNED_FREE_SPACE_REGRESSION","Compare actual same-volume receipts."),
"snapshot_admission_hold":("SNAPSHOT_88_PERCENT_HOLD","Qualify backup and volume snapshot with Session E."),
"collector_stale":("SIGNED_OBSERVER_MISSING","Inspect observer schedule, machine sleep and collector identity."),
"backup_failed":("ATTESTED_BACKUP_FAILURE","Inspect backup provider receipts; preserve originals."),
"scan_incomplete":("CONSUMER_CENSUS_INCOMPLETE","Run a bounded census; do not treat unknown as reclaimable."),
"cleanup_candidate_review":("GENERATED_ARTIFACT_REVIEW","Use existing artifact review; deletion not authorized."),
"build_generation_expired":("EXPIRED_BUILD_REVIEW","Prove rollback and reference independence before action."),
}
class Hold(RuntimeError):pass
def now():return dt.datetime.now(UTC)
def stamp(x):return x.isoformat(timespec="seconds").replace("+00:00","Z")
def parse(s):
 if not isinstance(s,str) or not s.endswith("Z"):raise Hold("UTC_REQUIRED")
 try:r=dt.datetime.fromisoformat(s.replace("Z","+00:00"))
 except ValueError as e:raise Hold("BAD_UTC") from e
 if r.utcoffset()!=dt.timedelta(0):raise Hold("BAD_UTC_OFFSET")
 return r
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(",",":")).encode()).hexdigest()
def private(p,limit=1024*1024):
 if not p.is_absolute() or p.is_symlink():raise Hold("PRIVATE_ABSOLUTE_PATH_REQUIRED")
 for d in p.parents:
  if d.exists() and (d.is_symlink() or d.stat().st_mode&0o022):raise Hold("UNSAFE_ANCESTOR")
 s=p.stat()
 if not p.is_file() or s.st_nlink!=1 or s.st_mode&0o077 or s.st_size<1 or s.st_size>limit:raise Hold("UNSAFE_FILE")
 if hasattr(os,"getuid") and s.st_uid!=os.getuid():raise Hold("UNSAFE_OWNER")
 return p
def read(p,limit=1024*1024):return json.loads(private(p,limit).read_text())
def open_db(path):
 if not path.is_absolute() or path.is_symlink():raise Hold("INVALID_DB_PATH")
 path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 if path.parent.stat().st_mode&0o077:raise Hold("STATE_DIRECTORY_PERMISSIONS")
 if path.exists():private(path,100*1024*1024)
 old=os.umask(0o077)
 try:db=sqlite3.connect(str(path),timeout=15,isolation_level=None)
 finally:os.umask(old)
 os.chmod(path,0o600)
 for sql in ("PRAGMA journal_mode=WAL","PRAGMA synchronous=FULL","PRAGMA foreign_keys=ON","PRAGMA busy_timeout=15000"):db.execute(sql)
 db.executescript("""
 CREATE TABLE IF NOT EXISTS enrollment (key TEXT PRIMARY KEY,val TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS witness (plane TEXT PRIMARY KEY,seq INTEGER NOT NULL,digest TEXT NOT NULL,source_sha TEXT NOT NULL,collector TEXT NOT NULL,observed TEXT,ordinary INTEGER,used REAL);
 CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,plane TEXT,rule TEXT,band TEXT,severity TEXT,reason TEXT,body TEXT,observed TEXT,coverage TEXT,source_sha TEXT,seq INTEGER,receipt TEXT,active INTEGER,first_seen TEXT,last_seen TEXT,ack_at TEXT,ack_actor TEXT);
 CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY,event_id TEXT,body TEXT,status TEXT,attempts INTEGER DEFAULT 0,next_attempt TEXT,delivered_at TEXT);
 """)
 return db
def check_pins(pins):
 keys=set(); fields=("collector_id","public_key_pem","filesystem_uuid","mount_source","mountpoint","source_sha")
 if not isinstance(pins,dict) or set(pins)!=set(PLANES):raise Hold("THREE_INDEPENDENT_PINS_REQUIRED")
 for name in PLANES:
  p=pins[name]
  if not isinstance(p,dict) or any(not isinstance(p.get(k),str) or not p[k] for k in fields):raise Hold("BAD_COLLECTOR_PIN")
  if p["public_key_pem"] in keys:raise Hold("SHARED_KEY")
  keys.add(p["public_key_pem"])
  if len(p["source_sha"])!=40 or any(c not in "0123456789abcdef" for c in p["source_sha"]):raise Hold("BAD_SOURCE_SHA")
  if name=="hel1-root" and p["mountpoint"]!="/":raise Hold("ROOT_ID_DRIFT")
  if name=="hel1-volume-105319120" and (p["mountpoint"]!="/mnt/HC_Volume_105319120" or p["filesystem_uuid"]!="a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42"):raise Hold("VOLUME_ID_DRIFT")
 return {name:{k:pins[name][k] for k in fields} for name in PLANES}
def enroll(db,pins,actor):
 if not actor or len(actor)>80:raise Hold("NAMED_OPERATOR_REQUIRED")
 db.execute("BEGIN IMMEDIATE")
 try:
  if db.execute("SELECT count(*) FROM enrollment").fetchone()[0]:raise Hold("ALREADY_ENROLLED")
  for k,v in (("pins",digest(pins)),("created",stamp(now())),("actor",actor)):db.execute("INSERT INTO enrollment VALUES (?,?)",(k,v))
  for plane in PLANES:
   db.execute("INSERT INTO witness VALUES (?,?,?,?,?,NULL,NULL,NULL)",(plane,0,"0"*64,pins[plane]["source_sha"],pins[plane]["collector_id"]))
  db.execute("COMMIT")
 except:db.execute("ROLLBACK");raise
def emit(db,plane,rule,band,severity,observed,coverage,source,seq,receipt,t):
 if rule not in RULES or severity not in ("WATCH","CRITICAL","HOLD"):raise Hold("UNKNOWN_RULE")
 ident=digest([plane,rule,band,source]) # fixed across repeats; new severity band escalates
 reason,action=RULES[rule]
 msg=(f"STORAGE SENTINEL {severity} [{ident[:16]}]\n{plane}: {reason}.\n"
      f"Observed {observed} · coverage {coverage} · signed sequence {seq} · receipt {receipt[:16]}\n"
      f"Next: {action}\nApproval: REVIEW/NOT REQUIRED FOR OBSERVATION. No cleanup authorized.\n{HREF}")
 previous=db.execute("SELECT id FROM events WHERE id=?",(ident,)).fetchone()
 if previous:
  db.execute("UPDATE events SET active=1,last_seen=? WHERE id=?",(stamp(t),ident))
 else:
  db.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
    (ident,plane,rule,band,severity,reason,msg,observed,coverage,source,seq,receipt,1,stamp(t),stamp(t)))
  db.execute("INSERT OR IGNORE INTO outbox(id,event_id,body,status) VALUES (?,?,?,'pending')",(ident,ident,msg))
 return ident
def receive(db,pins,envelope,t=None):
 t=t or now()
 db.execute("BEGIN IMMEDIATE")
 try:
  enrolled=db.execute("SELECT val FROM enrollment WHERE key='pins'").fetchone()
  if not enrolled or enrolled[0]!=digest(pins):raise Hold("PIN_ENROLLMENT_DRIFT")
  witness={}
  policy={}
  for plane in PLANES:
   row=db.execute("SELECT seq,digest,source_sha,collector,observed,ordinary,used FROM witness WHERE plane=?",(plane,)).fetchone()
   if not row:raise Hold("MISSING_WITNESS")
   witness[plane]=row
   policy[plane]={**pins[plane],"minimum_sequence":row[0],"previous_receipt_sha256":row[1]}
  proc=subprocess.run(["node","--experimental-strip-types","--experimental-loader","./scripts/aoe2-alias-loader.mjs",
      "scripts/aoe2_storage_sentinel_verify.mts"],cwd=ROOT,input=json.dumps({"envelope":envelope,"policy":policy}),
      text=True,capture_output=True,timeout=30,check=False)
  if proc.returncode or len(proc.stdout)>32768:raise Hold("SIGNED_RECEIPT_NOT_VERIFIED")
  verified=json.loads(proc.stdout)
  if verified.get("schema")!="aoe2war.storage-sentinel.verified-input.v1" or len(verified.get("planes",[]))!=3:raise Hold("BAD_VERIFIER")
  for p in verified["planes"]:
   plane=p["plane"]
   prior=witness[plane]
   observed=parse(p["observed_at"])
   if observed>t+dt.timedelta(seconds=30) or (t-observed).total_seconds()>min(p["ttl_seconds"],300):raise Hold("OBSERVATION_TIME_DRIFT")
   if p["source_sha"]!=prior[2] or p["collector_id"]!=prior[3] or p["sequence"]!=prior[0]+1:raise Hold("WITNESS_IDENTITY_DRIFT")
   if prior[4] and observed<=parse(prior[4]):raise Hold("NONMONOTONIC_HOST_CLOCK")
   metric=p["capacity"]; free=metric["ordinary_free_bytes"]; used=metric["effective_used_percent"]
   if not isinstance(free,int) or free<0 or not isinstance(used,(float,int)) or not 0<=used<=100:raise Hold("BAD_CAPACITY")
   current=set()
   def notice(rule,band,sev):
    current.add(emit(db,plane,rule,band,sev,p["observed_at"],p["coverage"],p["source_sha"],p["sequence"],p["receipt_sha256"],t))
   if plane=="mac" and free<15*GIB:notice("storage_pressure","mac-below-15GiB","CRITICAL" if free<8*GIB else "WATCH")
   elif used>=97:notice("storage_pressure","used-97","CRITICAL")
   elif used>=90:notice("storage_pressure","used-90","WATCH")
   if plane=="hel1-volume-105319120" and used>88:notice("snapshot_admission_hold","snapshot-above-88","CRITICAL")
   if p["coverage"]!="complete":notice("scan_incomplete","census-"+p["coverage"],"HOLD")
   if p["backup_status"]=="failed":notice("backup_failed","backup-attested-fail","HOLD")
   if p["expired_generations"] is not None and p["expired_generations"]>0:notice("build_generation_expired","expired-reviewed","WATCH")
   if p.get("candidate_inventory") is not None:
    from scripts.aoe2_storage_artifacts import review_inventory,ArtifactHold
    try:
     candidate_plan=review_inventory(p["candidate_inventory"])
    except (ArtifactHold,KeyError,TypeError) as e:raise Hold("ARTIFACT_REVIEW_FAILED") from e
    if any(row["candidate_quality"]=="REVIEWABLE" for row in candidate_plan["items"]):
     notice("cleanup_candidate_review","qualified-review-only","WATCH")

   if prior[4] and free<prior[5] and prior[5]-free>=2*GIB and (observed-parse(prior[4])).total_seconds()<=86400:notice("storage_regression","loss-over-2GiB","WATCH")
   # Close superseded conditions, but never silently clear unacknowledged history.
   active=db.execute("SELECT id FROM events WHERE plane=? AND active=1",(plane,)).fetchall()
   for (event_id,) in active:
    if event_id not in current:db.execute("UPDATE events SET active=0,last_seen=? WHERE id=?",(stamp(t),event_id))
   db.execute("UPDATE witness SET seq=?,digest=?,observed=?,ordinary=?,used=? WHERE plane=?",
    (p["sequence"],p["receipt_sha256"],p["observed_at"],free,used,plane))
  db.execute("COMMIT")
 except:
  db.execute("ROLLBACK");raise
def heartbeat(db,t=None):
 t=t or now()
 db.execute("BEGIN IMMEDIATE")
 try:
  enroll_at=db.execute("SELECT val FROM enrollment WHERE key='created'").fetchone()
  if not enroll_at:raise Hold("NOT_ENROLLED")
  for plane in PLANES:
   seq,obs,source=db.execute("SELECT seq,observed,source_sha FROM witness WHERE plane=?",(plane,)).fetchone()
   since=(t-parse(obs or enroll_at[0])).total_seconds()
   existing=db.execute("SELECT id FROM events WHERE plane=? AND rule='collector_stale' AND active=1",(plane,)).fetchall()
   if since>STALE_SECONDS:
    emit(db,plane,"collector_stale","missing-15m","HOLD",obs or enroll_at[0],"inaccessible",source,seq,"0"*64,t)
   else:
    for (ident,) in existing:db.execute("UPDATE events SET active=0,last_seen=? WHERE id=?",(stamp(t),ident))
  # Once/day reminder for unresolved + unacknowledged only, never a new event.
  for ident,body in db.execute("SELECT id,body FROM events WHERE active=1 AND ack_at IS NULL"):
   day=t.strftime("%Y%m%d")
   reminder=ident+":daily:"+day
   db.execute("INSERT OR IGNORE INTO outbox (id,event_id,body,status) VALUES (?,?,?,'pending')",
              (reminder,ident,body+"\nUnresolved daily reminder."))
  db.execute("COMMIT")
 except:db.execute("ROLLBACK");raise
def ack(db,ident,actor,t=None):
 t=t or now()
 if not actor or len(actor)>80:raise Hold("OPERATOR_ID_REQUIRED")
 db.execute("BEGIN IMMEDIATE")
 try:
  if not db.execute("SELECT 1 FROM events WHERE id=?",(ident,)).fetchone():raise Hold("UNKNOWN_EVENT")
  db.execute("UPDATE events SET ack_at=?,ack_actor=? WHERE id=?",(stamp(t),actor,ident))
  db.execute("COMMIT")
 except:db.execute("ROLLBACK");raise
def deliver(db,limit=10):
 from datetime import timedelta
 for ident,body in db.execute("SELECT id,body FROM outbox WHERE status='pending' AND (next_attempt IS NULL OR next_attempt<=?) ORDER BY rowid LIMIT ?",(stamp(now()),limit)).fetchall():
  try:
   p=subprocess.run(["node","--experimental-strip-types","--experimental-loader","./scripts/aoe2-alias-loader.mjs",
      "scripts/aoe2_storage_sentinel_inbox.mts"],input=json.dumps({"delivery_id":ident,"body":body}),
      cwd=ROOT,text=True,capture_output=True,timeout=25,check=False)
   if p.returncode or "DELIVERED_OR_ALREADY_PRESENT" not in p.stdout:raise Hold("PRIVATE_INBOX_DELIVERY_FAILED")
   db.execute("UPDATE outbox SET status='delivered',delivered_at=?,attempts=attempts+1 WHERE id=?",(stamp(now()),ident))
  except (Hold,subprocess.TimeoutExpired):
   count=db.execute("SELECT attempts FROM outbox WHERE id=?",(ident,)).fetchone()[0]
   delay=min(3600,30*(2**min(count,7)))
   db.execute("UPDATE outbox SET attempts=attempts+1,next_attempt=? WHERE id=?",(stamp(now()+timedelta(seconds=delay)),ident))
def projection(db,t=None):
 t=t or now()
 last=db.execute("SELECT max(observed) FROM witness").fetchone()[0]
 rows=db.execute("SELECT plane,rule,severity,observed,coverage,reason FROM events WHERE active=1 ORDER BY severity,plane LIMIT 32").fetchall()
 return {"schema":"aoe2war.storage-sentinel.private-projection.v1","last_ingested_at":last,
   "live":False,"admission":"HOLD","unresolved":[dict(zip(("plane","rule","severity","observed_at","coverage","reason"),r)) for r in rows]}
def publish_projection(db,path):
 """Optional operator-only private file publisher. Never emits a LIVE claim."""
 if not path.is_absolute() or path.is_symlink():raise Hold("INVALID_OUTPUT_PATH")
 if path.parent.stat().st_mode&0o077 or path.parent.is_symlink():raise Hold("OUTPUT_DIRECTORY_NOT_PRIVATE")
 if path.exists():private(path,64*1024)
 output=json.dumps(projection(db),sort_keys=True,separators=(",",":")).encode()
 if len(output)>32768:raise Hold("OUTPUT_TOO_LARGE")
 import tempfile
 fd,tmp=tempfile.mkstemp(prefix=".sentinel-",dir=str(path.parent))
 try:
  os.fchmod(fd,0o600)
  with os.fdopen(fd,"wb") as f:
   f.write(output);f.flush();os.fsync(f.fileno())
  os.replace(tmp,path)
  directory=os.open(str(path.parent),os.O_RDONLY)
  try:os.fsync(directory)
  finally:os.close(directory)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def main():
 a=argparse.ArgumentParser();a.add_argument("action",choices=("enroll","ingest","tick","deliver","ack","status"))
 a.add_argument("--state",required=True,type=Path);a.add_argument("--trust",type=Path);a.add_argument("--signed",type=Path)
 a.add_argument("--actor");a.add_argument("--id");a.add_argument("--output",type=Path);args=a.parse_args()
 try:
  db=open_db(args.state)
  if args.action in ("enroll","ingest"):
   if not args.trust:raise Hold("TRUST_REQUIRED")
   pins=check_pins(read(args.trust,24576))
   if args.action=="enroll":enroll(db,pins,args.actor)
   else:
    if not args.signed:raise Hold("SIGNED_BUNDLE_REQUIRED")
    receive(db,pins,read(args.signed,512*1024))
  elif args.action=="tick":heartbeat(db)
  elif args.action=="deliver":deliver(db)
  elif args.action=="ack":ack(db,args.id,args.actor)
  elif args.action=="status":
   if args.output:publish_projection(db,args.output)
   else:print(json.dumps(projection(db),sort_keys=True))
  if args.action!="status":print(json.dumps({"status":"PASS","action":args.action}))
  return 0
 except (Hold,OSError,ValueError,sqlite3.Error,subprocess.TimeoutExpired) as e:
  print(json.dumps({"status":"HOLD","reason":str(e)[:120]}),file=sys.stderr);return 2
if __name__=="__main__":raise SystemExit(main())
