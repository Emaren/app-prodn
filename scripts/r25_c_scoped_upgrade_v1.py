#!/usr/bin/env python3
"""One-use 3032-only production profile migration. Never selects public Nginx.

Exact signed artifact, source-pinned policy, typed ACL delta, durable preimages,
new native process/DB admission and fail-closed rollback. No funding privileges.
"""
from __future__ import annotations
import argparse, fcntl, hashlib, http.client, importlib.util, json, os
from pathlib import Path
import re, shutil, subprocess, sys, time, urllib.error, urllib.request, uuid
from html.parser import HTMLParser

SOURCE = "175e896c59bf48eda44c15d664d940f5ac40b436"
OLD_SOURCE = "886dac221e73167621d6bbfa89cd30edf6b632a3"
ROOT = Path("/var/lib/aoe2war-app-production-v1")
SOURCES = ROOT / ("upgrade-sources-" + SOURCE[:12])
ARTIFACT = Path("/var/lib/aoe2war-runtime-artifacts") / SOURCE / "runtime.zip"
STAGE = Path("/var/lib/aoe2war-web-prod-" + SOURCE[:12])
JOURNALS = ROOT / "profile-upgrades"
POLICY = Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
LIB = Path("/usr/local/lib/aoe2war-web-prod")
PROXY = Path("/etc/nginx/conf.d/aoe2war-web-prod-readonly-api.conf")
OLD_CONTROLLER = LIB / "r25_c_start_root.py"
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
TABLES = ("event_tiles","hero_playlists","hero_playlist_items",
          "hero_playlist_publications","hero_screens","chat_rooms")
COLUMNS = {
    "trophies": ("id","display_name"),
    "forum_threads": ("id","slug","channel","tag","title","excerpt",
                      "author_label","author_role","created_at","updated_at"),
    "managed_media_assets": ("id","kind","target","label","url","alt",
                             "mime_type","size_bytes","active","updated_at"),
}
FILES = {
    "controller": (LIB/"r25_c_start_root.py",SOURCES/"scripts/r25_c_start_root.py",0o644),
    "guard": (LIB/"r25_b_guard_production_v1.cjs",SOURCES/"scripts/r25_b_guard_production_v1.cjs",0o644),
    "auth_sql": (LIB/"nonfinancial-production-auth.sql",SOURCES/"config/nonfinancial-production-auth.sql",0o400),
    "proxy": (PROXY,None,0o644),
    "unit": (UNIT,None,0o644),
    "policy": (POLICY,None,0o400),
}
ARTIFACT_ID = 13275067671
RUN_ID = 41726585039

class Hold(RuntimeError):
    pass

def need(condition, reason):
    if not condition: raise Hold(reason)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()

def invoke(*args,timeout=35,input=None):
    p=subprocess.run(args,input=input,capture_output=True,timeout=timeout,check=False)
    need(p.returncode==0,"NATIVE_COMMAND_FAILED:"+args[0]+":"+p.stderr[-180:].decode(errors="replace"))
    return p.stdout

def module(path,name):
    need(path.is_file() and not path.is_symlink(),"CONTROLLER_SOURCE_ABSENT")
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

def safe_bytes(path):
    st=path.lstat()
    need(path.is_file() and not path.is_symlink() and st.st_uid==0 and
         not st.st_mode & 0o022 and st.st_nlink==1,"ROOT_SOURCE_FILE_NOT_SEALED")
    need(st.st_size<=67108864,"SOURCE_SIZE")
    return path.read_bytes()

def atomic(path,data,mode):
    tmp=path.with_name(path.name+".staging-"+uuid.uuid4().hex)
    fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(tmp,mode)
        os.replace(tmp,path)
        directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if tmp.exists():tmp.unlink()

def seal(path,obj):
    need(not path.exists(),"ONE_USE_JOURNAL_OVERWRITE")
    raw=canonical(obj)+b"\n"
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    return digest(raw)

def native_sql(sql):
    return invoke("/usr/sbin/runuser","-u","postgres","--",
        "/usr/bin/psql","-X","-A","-t","-v","ON_ERROR_STOP=1",
        "-d","aoe2hd_db",timeout=20,input=sql.encode()).decode().strip()

def acl_delta(add):
    queries=["BEGIN;","SET LOCAL lock_timeout='1500ms';",
             "SET LOCAL statement_timeout='15000ms';"]
    action="GRANT" if add else "REVOKE"
    t=", ".join("public."+v for v in TABLES)
    queries.append(action+" SELECT ON "+t+(" TO " if add else " FROM ")+"aoe2war_web_prod;")
    for table,cols in COLUMNS.items():
        queries.append(action+" SELECT ("+",".join(cols)+") ON public."+table+
            (" TO " if add else " FROM ")+"aoe2war_web_prod;")
    queries.append("COMMIT;")
    return "\n".join(queries)

def visible(html):
    class Reader(HTMLParser):
        def __init__(self):
            super().__init__();self.depth=0;self.parts=[]
        def handle_starttag(self,t,a):
            if t in ("script","style","noscript","template"): self.depth+=1
        def handle_endtag(self,t):
            if t in ("script","style","noscript","template") and self.depth:self.depth-=1
        def handle_data(self,t):
            if not self.depth:self.parts.append(t.strip())
    parser=Reader();parser.feed(html)
    return " ".join(parser.parts)

def page(port,path):
    c=http.client.HTTPConnection("127.0.0.1",port,timeout=13)
    try:
        c.request("GET",path,headers={"Host":"aoe2war.com","Accept":"text/html"})
        r=c.getresponse();body=r.read(4*1024*1024+1)
        need(r.status==200 and len(body)<=4*1024*1024 and
             "text/html" in (r.getheader("content-type") or ""),"CANDIDATE_HTTP_PAGE_NOT_READY")
        return visible(body.decode("utf-8","replace"))
    finally:c.close()

def candidate_content():
    event=native_sql("BEGIN READ ONLY;SELECT title FROM public.event_tiles "
       "WHERE is_published AND is_active AND status<>'archived' "
       "ORDER BY priority DESC,published_at DESC NULLS LAST LIMIT 1;ROLLBACK;")
    title=next((line for line in event.splitlines() if line not in ("BEGIN","ROLLBACK")),None)
    need(bool(title) and title in page(3030,"/"),"ORIGINAL_PUBLISHED_EVENT_NOT_VERIFIED")
    home=page(3032,"/")
    need(title in home,"CANDIDATE_PUBLISHED_EVENT_MISSING")
    traffic=page(3032,"/traffic")
    need("2026-10-19" in traffic and
         "Observed" in traffic and "Provisional" in traffic and
         "No published completed-day Traffic report is available" not in traffic,
         "CANDIDATE_CERTIFIED_AND_OBSERVED_TRAFFIC_MISSING")
    with urllib.request.urlopen("http://127.0.0.1:3032/api/deployment-version",timeout=5) as r:
        version=json.load(r)["buildVersion"]
    return {"event_title_sha256":digest(title.encode()),
            "candidate_build_version":version,"certified_and_provisional_traffic_visible":True}

def prepare():
    need(os.geteuid()==0,"ROOT_REQUIRED")
    old=module(OLD_CONTROLLER,"original_r25")
    new=module(SOURCES/"scripts/r25_c_start_root.py","upgraded_r25")
    need(new.PROD_READ_TABLES[-6:]==TABLES,"SOURCE_SCOPED_TABLES_DRIFT")
    need({t:tuple(new.PROD_COLUMN_READS[t]) for t in COLUMNS}==COLUMNS,
         "SOURCE_SCOPED_COLUMNS_DRIFT")
    need(new.PROD_DB_ROLE==old.PROD_DB_ROLE=="aoe2war_web_prod" and
         new.PROD_UNIT==old.PROD_UNIT,"UNEXPECTED_PROD_ROLE_OR_SERVICE")
    policy=json.loads(safe_bytes(POLICY))
    need(policy["source_sha"]==OLD_SOURCE and policy["stage"]=="/var/lib/aoe2war-web-prod-"+OLD_SOURCE[:12],
         "OLD_PROFILE_IDENTITY_CHANGED")
    # The original sealed protected digest predates the independently recorded
    # Traffic API R60 deployment. Requalify the original PID, bytes, ACL and
    # protected services from real host state; never claim the old seal passed.
    traffic_receipt=json.loads(safe_bytes(Path("/var/lib/aoe2war-traffic-r60-20261103/commit.json")))
    need(traffic_receipt["result"]=="PASS_TRAFFIC_PROVISIONAL_API_LIVE" and
         traffic_receipt["new_sha"]=="4d0e6196f5b4f5653d4062e3494619360ef77de6" and
         traffic_receipt["certified_archive_unchanged_sha256"]==
             "5dd2fdee1a1ddc14503ed5ba157120f46a4281a26f104b5ccc39986f10c07807" and
         traffic_receipt["financial_authorized"] is False,"TRAFFIC_CHANGE_NOT_INDEPENDENTLY_RECORDED")
    need(invoke("/usr/bin/git","-C","/var/www/Traffic/traffic-api","rev-parse","HEAD").strip().decode()==
         traffic_receipt["new_sha"],"TRAFFIC_SOURCE_NOT_PINNED")
    need(invoke("/usr/bin/systemctl","is-active",new.PROD_UNIT).strip()==b"active","OLD_CANDIDATE_ABSENT")
    oldpid,oldticks=old.production_wait(policy,seconds=15)
    prior={"candidate_pid":oldpid,"candidate_start_ticks":oldticks}
    need(digest(safe_bytes(UNIT))==policy["unit_sha256"] and
         digest(safe_bytes(OLD_CONTROLLER))==policy["controller_sha256"] and
         digest(safe_bytes(PROXY))==policy["private_proxy_sha256"] and
         digest(safe_bytes(LIB/"r25_b_guard_production_v1.cjs"))==policy["guard_sha256"] and
         digest(safe_bytes(LIB/"nonfinancial-production-auth.sql"))==policy["sql_sha256"],
         "OLD_PROFILE_SOURCE_POLICY_NOT_INTACT")
    old_admission=safe_bytes(Path(policy["journal_path"])/"runtime-admission.json")
    native_old=json.loads(old_admission)
    need(digest(old_admission)==policy["admission_sha256"] and
         native_old["candidate_pid"]==oldpid and
         native_old["candidate_start_ticks"]==oldticks and
         native_old["source_sha"]==OLD_SOURCE and
         native_old["status"]=="NATIVE_PRODUCTION_ADMISSION_PASS",
         "OLD_NATIVE_ADMISSION_NOT_INTACT")
    old_service=invoke("/usr/bin/systemctl","show",new.PROD_UNIT,"--property=WorkingDirectory","--value").strip().decode()
    need(old_service==policy["stage"],"OLD_RUNNING_STAGE_CHANGED")
    original_version=json.loads(urllib.request.urlopen("http://127.0.0.1:3030/api/deployment-version",timeout=5).read())["buildVersion"]
    need(original_version=="20261028134227-6c0f6d7531","PUBLIC_3030_VERSION_DRIFT")
    public=safe_bytes(Path("/etc/nginx/sites-available/aoe2war.com"))
    need(public.count(b"proxy_pass http://127.0.0.1:3030;")==6,"PUBLIC_PROXY_NOT_ALL_3030")
    need(new.production_protected()==old.production_protected(),"PROTECTED_SNAPSHOT_DIVERGENCE")
    artifact=json.loads(__import__("zipfile").ZipFile(ARTIFACT).read("artifact.json"))
    need(artifact["source_sha"]==SOURCE and artifact["build_id"]==(STAGE/".next/BUILD_ID").read_text().strip() and
         artifact["build_version"]==(STAGE/".aoe2war-build-version").read_text().strip() and
         digest(safe_bytes(STAGE/".aoe2war-runtime-manifest.json"))==artifact["manifest_sha256"],
         "STAGED_ARTIFACT_MISMATCH")
    need(new.production_ci_zip({"source_sha":SOURCE,"artifact":artifact,
         "ci_artifact":{"id":ARTIFACT_ID,"run_id":RUN_ID,"archive_path":str(ARTIFACT)}},
         ARTIFACT)["id"]==ARTIFACT_ID,"ARTIFACT_GITHUB_PROVENANCE_HOLD")
    actual={key:digest(safe_bytes(path)) for key,(path,_,_) in FILES.items()}
    source={key:digest(safe_bytes(path)) for key,(_,path,_) in FILES.items() if path}
    new_guard=source["guard"]
    new_sql=source["auth_sql"]
    proxy=digest(new.production_proxy_bytes())
    unit=digest(new.production_unit_bytes(STAGE))
    need(all(source[k]!=actual[k] for k in ("controller","guard","auth_sql")),"SOURCE_ALREADY_MIGRATED")
    need(all((STAGE/p).is_file() for p in ("package.json",".next/BUILD_ID")),"NEW_RUNTIME_INCOMPLETE")
    env,database,password=new.production_runtime_environment()
    old_db=old.production_database_witness(database,password)
    old_read=old_db["read_acl_sha256"]
    need(old_read==native_old["catalog"]["read_acl_sha256"] and
         old_db["definer_identity_sha256"]==native_old["catalog"]["definer_identity_sha256"],
         "OLD_ROLE_CATALOG_NOT_NATIVE_ATTESTED")
    need(old_db["no_unreviewed_table_select"] and old_db["no_direct_table_mutation"] and
         old_db["no_users_secret_select"],"BEFORE_DB_SCOPE_INCORRECT")
    evidence={"schema":"aoe2war.a05.3032-scoped-upgrade-plan.v1",
      "old_source_sha":OLD_SOURCE,"new_source_sha":SOURCE,
      "old_process_pid":prior["candidate_pid"],"old_process_ticks":prior["candidate_start_ticks"],
      "old_profile_sha256":digest(safe_bytes(POLICY)),
      "historical_seal_superseded_by_pinned_traffic_r60":True,
      "historical_protected_sha256":policy["protected_snapshot_sha256"],
      "requalified_current_protected_sha256":digest(canonical(new.production_protected())),
      "before_read_acl_sha256":old_read,"before_policy_bytes":actual,
      "source_bytes_sha256":source,
      "new_guard_sha256":new_guard,"new_sql_sha256":new_sql,
      "new_proxy_sha256":proxy,"new_unit_sha256":unit,
      "new_manifest_sha256":artifact["manifest_sha256"],
      "public_nginx_sha256":digest(public),
      "protected_sha256":digest(canonical(new.production_protected())),
      "no_public_cutover":True,"financial_authorized":False}
    return old,new,policy,evidence

def restart(unit):
    invoke("/usr/bin/systemctl","daemon-reload",timeout=20)
    invoke("/usr/bin/systemctl","start",unit,timeout=90)

def upgrade(nonce,expected):
    need(re.fullmatch(r"[0-9a-f]{32}",nonce) is not None,"EXACT_NONCE_REQUIRED")
    old,new,old_policy,plan=prepare()
    need(digest(canonical(plan))==expected,"EXACT_APPROVED_PLAN_HASH_CHANGED")
    journal=JOURNALS/("upgrade-"+nonce)
    need(not journal.exists(),"NONCE_ALREADY_USED")
    JOURNALS.mkdir(mode=0o700,parents=True,exist_ok=True)
    journal.mkdir(mode=0o700)
    seal(journal/"entered.json",{"nonce":nonce,"plan":plan,"financial_authorized":False,
             "public_cutover_authorized":False,"one_use":True})
    backups={}
    for key,(path,_,_) in FILES.items():
        backups[key]=safe_bytes(path)
        atomic(journal/(key+".before"),backups[key],0o600)
    changed=False
    try:
        need(digest(safe_bytes(POLICY))==plan["old_profile_sha256"],"PRESTART_POLICY_DRIFT")
        need(digest(canonical(new.production_protected()))==plan["protected_sha256"],"PROTECTED_PRESTART_CHANGED")
        changed=True  # Any partial stop requires full transactional restoration.
        invoke("/usr/bin/systemctl","stop",new.PROD_UNIT,timeout=55)
        need(invoke("/usr/bin/systemctl","show",new.PROD_UNIT,"-p","ActiveState","--value").strip()==b"inactive",
             "OLD_3032_STILL_ACTIVE")
        native_sql(acl_delta(True))
        env,db,password=new.production_runtime_environment()
        native=new.production_database_witness(db,password)
        need(native["read_acl_sha256"]!=plan["before_read_acl_sha256"],"NEW_ACL_NOT_ADMITTED")
        for key in ("controller","guard","auth_sql"):
            target,source,mode=FILES[key]
            atomic(target,safe_bytes(source),mode)
        atomic(PROXY,new.production_proxy_bytes(),0o644)
        atomic(UNIT,new.production_unit_bytes(STAGE),0o644)
        invoke("/usr/sbin/nginx","-t",timeout=15)
        need(digest(safe_bytes(Path("/etc/nginx/sites-available/aoe2war.com")))==plan["public_nginx_sha256"],
             "PUBLIC_SELECTORS_CHANGED")
        invoke("/usr/bin/systemctl","reload","nginx",timeout=20)
        restart(new.PROD_UNIT)
        profile={"schema":"aoe2war.app.approved-production-profile.v1",
            "profile":new.PROD_PROFILE,"source_sha":SOURCE,
            "build_id":(STAGE/".next/BUILD_ID").read_text().strip(),
            "build_version":(STAGE/".aoe2war-build-version").read_text().strip(),
            "stage":str(STAGE),"uid":new.PROD_UID,"gid":new.PROD_GID,
            "unit":new.PROD_UNIT,"port":3032,
            "artifact":json.loads(__import__("zipfile").ZipFile(ARTIFACT).read("artifact.json")),
            "ci_artifact":{"id":ARTIFACT_ID,"run_id":RUN_ID,"archive_path":str(ARTIFACT)},
            "manifest_sha256":plan["new_manifest_sha256"],"guard_sha256":plan["new_guard_sha256"],
            "unit_sha256":plan["new_unit_sha256"],
            "nft_shape_sha256":new.production_nft_shape(),
            "private_proxy_sha256":plan["new_proxy_sha256"],
            "sql_sha256":plan["new_sql_sha256"],
            "protected_snapshot_sha256":plan["protected_sha256"],
            "native_plan_sha256":digest(canonical(plan)),"journal_path":str(journal),
            "controller_sha256":plan["source_bytes_sha256"]["controller"],
            "steam_addresses":old_policy["steam_addresses"],
            "refresh_units":new.production_refresh_unit_identity(),
            "critical_runtime":new.production_critical_runtime(STAGE),
            "published_assets":old_policy["published_assets"],
            "assets_source_sha256":old_policy["assets_source_sha256"]}
        pid,ticks=new.production_wait(profile,seconds=65)
        admission={"schema":"aoe2war.app.production-admission.v1",
          "status":"NATIVE_PRODUCTION_ADMISSION_PASS","source_sha":SOURCE,
          "candidate_pid":pid,"candidate_start_ticks":ticks,
          "postgres":new.production_database_admission(db,password),
          "catalog":new.production_database_witness(db,password),
          "kernel":new.production_kernel_probe(profile["steam_addresses"]),
          "steam":new.production_steam_probe(env,STAGE),
          "financial_authorized":False,"public_cutover_authorized":False}
        seal(journal/"runtime-admission.json",admission)
        profile["admission_sha256"]=digest(safe_bytes(journal/"runtime-admission.json"))
        atomic(POLICY,canonical(profile)+b"\n",0o400)
        witness=new.production_witness({"profile_path":str(POLICY)})
        contents=candidate_content()
        need(contents["candidate_build_version"]==profile["build_version"],"BUILT_VERSION_DRIFT")
        need(digest(canonical(new.production_protected()))==plan["protected_sha256"],
             "ORIGINAL_SITE_OR_WOLO_CHANGED")
        seal(journal/"complete.json",{"status":"PASS_NEW_3032_ADMITTED_NOT_PUBLIC",
          "source_sha":SOURCE,"pid":pid,"ticks":ticks,
          "profile_sha256":witness["profile_sha256"],"read_acl_sha256":admission["catalog"]["read_acl_sha256"],
          "content":contents,"financial_authorized":False,
          "public_cutover_authorized":False,"browser_roles_verified":False})
        return {"status":"PASS_NEW_3032_ADMITTED_NOT_PUBLIC","pid":pid,"content":contents}
    except BaseException as err:
        if changed:
            try:
                subprocess.run(["/usr/bin/systemctl","stop",new.PROD_UNIT],
                               stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
                native_sql(acl_delta(False))
                for key,(path,_,mode) in FILES.items():
                    if key!="policy":atomic(path,backups[key],mode)
                invoke("/usr/sbin/nginx","-t",timeout=15)
                invoke("/usr/bin/systemctl","reload","nginx",timeout=20)
                restart(old.PROD_UNIT)
                prior=dict(old_policy)
                prior["protected_snapshot_sha256"]=plan["protected_sha256"]
                oldpid,oldticks=old.production_wait(prior,seconds=65)
                env,db,password=old.production_runtime_environment()
                restore_admission={"schema":"aoe2war.app.production-admission.v1",
                  "status":"NATIVE_PRODUCTION_ADMISSION_PASS","source_sha":OLD_SOURCE,
                  "candidate_pid":oldpid,"candidate_start_ticks":oldticks,
                  "postgres":old.production_database_admission(db,password),
                  "catalog":old.production_database_witness(db,password),
                  "kernel":old.production_kernel_probe(prior["steam_addresses"]),
                  "steam":old.production_steam_probe(env,Path(prior["stage"])),
                  "financial_authorized":False,"public_cutover_authorized":False}
                # Never overwrite a partially completed forward admission.
                # The rolled-back candidate has a NEW PID and requires an
                # independent native admission in its own immutable namespace.
                rollback_witness_dir=journal/"rollback-requalification"
                rollback_witness_dir.mkdir(mode=0o700)
                seal(rollback_witness_dir/"runtime-admission.json",restore_admission)
                prior["journal_path"]=str(rollback_witness_dir)
                prior["admission_sha256"]=digest(safe_bytes(rollback_witness_dir/"runtime-admission.json"))
                atomic(POLICY,canonical(prior)+b"\n",0o400)
                restored=old.production_witness({"profile_path":str(POLICY)})
                seal(journal/"rollback.json",{"status":"PASS_OLD_3032_RESTORED_NOT_PUBLIC",
                  "reason":str(err)[:160],"pid":oldpid,
                  "profile_sha256":restored["profile_sha256"],
                  "financial_authorized":False,"public_cutover_authorized":False})
            except BaseException as rollback:
                seal(journal/"rollback_hold.json",{"status":"CRITICAL_ROLLBACK_INCOMPLETE",
                  "reason":type(rollback).__name__+":"+str(rollback)[:160],
                  "financial_authorized":False,"public_cutover_authorized":False})
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--phase",choices=("plan","execute"),required=True)
    ap.add_argument("--nonce")
    ap.add_argument("--plan-hash")
    args=ap.parse_args()
    st=LOCK.lstat()
    need(st.st_uid==1000 and st.st_mode & 0o777==0o644,"ORIGINAL_RELEASE_LOCK_CHANGED")
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.phase=="plan":
            need(args.nonce is None and args.plan_hash is None,"PLAN_MUST_NOT_AUTHORIZE_EXECUTION")
            _,_,_,plan=prepare()
            print(json.dumps({"status":"PASS_SCOPED_PROFILE_PLAN_READ_ONLY",
                "plan":plan,"plan_sha256":digest(canonical(plan)),
                "public_cutover_authorized":False},sort_keys=True))
        else:
            need(args.nonce and args.plan_hash,"EXACT_ONE_USE_APPROVAL_REQUIRED")
            print(json.dumps(upgrade(args.nonce,args.plan_hash),sort_keys=True))
    finally:
        os.close(fd)

if __name__=="__main__":
    try:main()
    except BaseException as error:
        print(json.dumps({"status":"HOLD","reason":type(error).__name__+":"+str(error)[:170],
            "no_blind_retry":True,"financial_authorized":False,
            "public_cutover_authorized":False},sort_keys=True))
        sys.exit(2)
