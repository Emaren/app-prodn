#!/usr/bin/env python3
"""One-use 3032-only production profile migration. Never selects public Nginx.

Exact signed artifact, source-pinned policy, typed ACL delta, durable preimages,
new native process/DB admission and fail-closed rollback. No funding privileges.
"""
from __future__ import annotations
import argparse, base64, fcntl, hashlib, http.client, json, os, socket, stat, types
from pathlib import Path
import re, subprocess, sys, time, urllib.request, uuid
from datetime import date
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
FAILED_NONCE = "1536a06e035ced3e2ed60e4f522570ab"
FAILED_ENTERED = "e72d21eccc3ac025d8381b346056105ed18fff0a26ca7187e96113a94a36a163"
FAILED_ROLLBACK = "2c3f7713540e27d269ae649ff0b86dcbb95778655eafc688db5998d3f009190b"
LATEST_FAILED_NONCE = "94451e92ea7b9f3d97d8239ec50b8753"
LATEST_FAILED_ENTERED = "c5cfdc899afe62192c5ab67e266eb29ac94a6788c23f6538348c1f4d76bf5ef2"
LATEST_VERIFIED_ROLLBACK = "ceaf905dc130981465d3a9442f4a8015f4a2149ab8d91539340632b523cfa72c"
THIRD_NONCE = "7e92328a777c5e4442137b29dd8781c1"
THIRD_ENTERED = "849b35646b995090a0ce72de9307b1164c4b06972f549c658c94a40ea484e284"
THIRD_ROLLBACK_HOLD = "c1ab78b2a8ba1f9922a62bce7e7ca3154cab97c671851e5e48b6e05b5f093916"
THIRD_ROLLBACK_RECOVERED = "1429e489d1f27c8025c6d314366c1c30d7995675a2f99df08483b02166dafc6d"
THIRD_CONTROLLER_SHA = "90d8361083b8a268c419c44c6d22eba68e3b24fa00bd11916cc5fb73a54e8692"
TRAFFIC_ROOT = Path("/var/lib/aoe2war-traffic-r60-20261103")
TRAFFIC_RECEIPTS = {
    "before.json": "299598514158a8c0b9e689eb754b5ba18dbaf39f33bfb0362ad7b9d171584f63",
    "commit.json": "e4e11e78599652cbf06685982714df1ebe6b235f9a5a4cb70f23bc75af2acd5a",
}
TRAFFIC_R60_SHA = "4d0e6196f5b4f5653d4062e3494619360ef77de6"
TRAFFIC_SHA = "60cf4da5962b4ba65f546d2bea68c3cdc03e8479"
TRAFFIC_R61_ALLOWED_FILES = (
    "docs/PUBLIC_AUDIENCE_V2.md",
    "docs/TRAFFIC_V2_INGESTION_RECEIPTS_OPERATOR.md",
    "scripts/public_audience_v2_ingestion_receipts_health.py",
    "tests/test_public_audience_v2_ingestion_receipts_health.py",
)
REFRESH = "aoe2war-steam-egress-refresh.service"
TIMER = "aoe2war-steam-egress-refresh.timer"
PUBLIC_NGINX = Path("/etc/nginx/sites-available/aoe2war.com")
SCOPE = "UPGRADE_STOPPED_NONFINANCIAL_3032_ONLY"
SOURCE_PATH = "scripts/r25_c_scoped_upgrade_v1.py"
LOCK_ID = (2064, 6185747, 1000, 0o644)
REVIEWED_RUNTIME_SOURCES = {
    "controller": ("scripts/r25_c_start_root.py", 115060,
                  "f7fa39d97f6c82282a1b1beac940606c71f07e9f0fdea42e4935e023df161479"),
    "guard": ("scripts/r25_b_guard_production_v1.cjs", 11273,
                  "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"),
}


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

def module(path, name, expected):
    raw = safe_bytes(path)
    need(digest(raw) == expected, "CONTROLLER_SOURCE_BYTES_CHANGED")
    return controller_module(raw, str(path), name)


def controller_module(raw, path, name):
    result = types.ModuleType(name)
    result.__file__ = path
    exec(compile(raw, path, "exec"), result.__dict__)
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
    fsync_directory(path.parent)
    return digest(raw)

def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

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
    c=http.client.HTTPConnection("127.0.0.1",port,timeout=20)
    try:
        c.request("GET",path,headers={"Host":"aoe2war.com","Accept":"text/html"})
        r=c.getresponse();body=r.read(4*1024*1024+1)
        need(r.status==200 and len(body)<=4*1024*1024 and
             "text/html" in (r.getheader("content-type") or ""),"CANDIDATE_HTTP_PAGE_NOT_READY")
        return visible(body.decode("utf-8","replace"))
    finally:c.close()

def candidate_media_response(path):
    need(re.fullmatch(r"/uploads/managed-assets/background/[A-Za-z0-9][A-Za-z0-9._-]{0,220}", path)
         is not None, "CANDIDATE_MEDIA_UNEXPECTED_PATH")
    conn=http.client.HTTPConnection("127.0.0.1",3032,timeout=10)
    try:
        conn.request("GET",path,headers={"Host":"aoe2war.com","Accept":"image/png,image/webp,image/jpeg"})
        result=conn.getresponse()
        status,kind=result.status,(result.getheader("content-type") or "").lower().split(";")[0]
        prefix=result.read(12)
        return status,kind,prefix
    finally:
        conn.close()


def candidate_media_witness():
    # Server-rendered background URLs are untrusted data. Only the narrow
    # public managed-background route can be probed; no outbound or private
    # storage URL can be reached by this evidence check.
    conn=http.client.HTTPConnection("127.0.0.1",3032,timeout=12)
    try:
        conn.request("GET","/",headers={"Host":"aoe2war.com","Accept":"text/html"})
        response=conn.getresponse()
        raw=response.read(4*1024*1024+1)
        need(response.status==200 and len(raw)<=4*1024*1024,
             "CANDIDATE_MEDIA_HTML_UNAVAILABLE")
    finally:
        conn.close()
    class PublicBackgrounds(HTMLParser):
        def __init__(self):
            super().__init__();self.paths=[]
        def handle_starttag(self, tag, attrs):
            if tag != "img": return
            path=dict(attrs).get("src","")
            if path.startswith("/uploads/managed-assets/background/"):
                need(re.fullmatch(r"/uploads/managed-assets/background/[A-Za-z0-9][A-Za-z0-9._-]{0,220}",path)
                     is not None, "CANDIDATE_MEDIA_UNEXPECTED_PATH")
                self.paths.append(path)
    parser=PublicBackgrounds()
    parser.feed(raw.decode("utf-8","replace"))
    paths=sorted(set(parser.paths))
    need(1<=len(paths)<=24,"CANDIDATE_MANAGED_MEDIA_DECLARATIONS")
    for path in paths[:8]:
        status,kind,prefix=candidate_media_response(path)
        valid=(kind=="image/png" and prefix.startswith(b"\x89PNG\r\n\x1a\n") or
               kind=="image/webp" and prefix[:4]==b"RIFF" and prefix[8:12]==b"WEBP" or
               kind=="image/jpeg" and prefix[:3]==b"\xff\xd8\xff")
        need(status==200 and valid,"CANDIDATE_MANAGED_MEDIA_BROKEN")
    return {"checked_public_backgrounds":min(len(paths),8),
            "paths_sha256":digest(canonical(paths)),
            "no_private_media_read":True}


def candidate_content():
    event=native_sql("BEGIN READ ONLY;SELECT title FROM public.event_tiles "
       "WHERE is_published AND is_active AND status<>'archived' "
       "ORDER BY priority DESC,published_at DESC NULLS LAST LIMIT 1;ROLLBACK;")
    title=next((line for line in event.splitlines() if line not in ("BEGIN","ROLLBACK")),None)
    # The protected October-28 public build carries the event in its streamed
    # page data but does not render it as visible SSR text. It is not the
    # source of current event truth: immutable 3030 build identity was checked
    # in prepare(), and the current published title is read from PostgreSQL.
    old_home = page(3030, "/")
    need(bool(title) and len(old_home) >= 200, "ORIGINAL_PUBLIC_HOME_NOT_HEALTHY")
    home=page(3032,"/")
    need(title in home,"CANDIDATE_PUBLISHED_EVENT_MISSING")
    old_traffic = page(3030, "/traffic")
    traffic = page(3032, "/traffic")
    def last_published(value):
        match = re.search(r"LAST PUBLISHED UTC DAY:\s*(\d{4}-\d{2}-\d{2})", value)
        need(match is not None and
             "No published completed-day Traffic report is available" not in value,
             "CANDIDATE_CERTIFIED_AND_OBSERVED_TRAFFIC_MISSING")
        return date.fromisoformat(match[1])
    need("BROWSER OBSERVED" in traffic, "CANDIDATE_OBSERVED_BROWSER_INSIGHTS_MISSING")
    certified = last_published(traffic)
    observed = re.search(r"Latest observed UTC day\s+(\d{4}-\d{2}-\d{2})", traffic)
    need(certified >= last_published(old_traffic) and observed is not None and
         date.fromisoformat(observed[1]) > certified and "Provisional · unverified" in traffic and
         "Qualifying IPs · not people" in traffic and "Filtered page GETs · not sessions" in traffic,
         "CANDIDATE_CERTIFIED_AND_OBSERVED_TRAFFIC_MISSING")
    with urllib.request.urlopen("http://127.0.0.1:3032/api/deployment-version",timeout=5) as r:
        version=json.load(r)["buildVersion"]
    media = candidate_media_witness()
    return {"event_title_sha256":digest(title.encode()),
            "managed_media":media,
            "candidate_build_version":version,"certified_and_provisional_traffic_visible":True,
            "last_certified_utc_day": certified.isoformat(), "last_observed_utc_day": observed[1]}

def unit_properties(unit, fields):
    raw = invoke("/usr/bin/systemctl", "show", unit, "--property=" + fields, timeout=12)
    return dict(line.split("=", 1) for line in raw.decode().splitlines())


def stopped_candidate(unit):
    need(unit_properties(unit, "ActiveState,MainPID") ==
         {"ActiveState": "inactive", "MainPID": "0"}, "CANDIDATE_NOT_STOPPED")
    need(unit_properties(TIMER, "ActiveState") == {"ActiveState": "inactive"},
         "STEAM_TIMER_NOT_STOPPED")
    need(unit_properties(REFRESH, "ActiveState").get("ActiveState") in ("inactive", "failed"),
         "STEAM_REFRESH_IN_FLIGHT")
    need(not invoke("/usr/bin/ss", "-H", "-ltn", "sport = :3032").strip(),
         "ISOLATED_3032_LISTENER_STILL_PRESENT")


def steam_elements():
    rows = json.loads(invoke("/usr/sbin/nft", "-j", "list", "table", "inet",
                             "aoe2war_web_prod"))["nftables"]
    sets = {row["set"]["name"]: row["set"] for row in rows if "set" in row}
    need(set(sets) == {"steam4", "steam6"} and
         all(row.get("timeout") == 300 for row in sets.values()), "STEAM_SET_TTL_DRIFT")
    return [entry for row in sets.values() for entry in row.get("elem", [])]


def recovered_third_failure(actual):
    """Trust only an exact, consumed, subsequently witnessed stopped-profile recovery."""
    journal=JOURNALS/("upgrade-"+THIRD_NONCE)
    entered=safe_bytes(journal/"entered.json")
    hold=safe_bytes(journal/"rollback_hold.json")
    recovered=safe_bytes(journal/"rollback-recovered.json")
    need(digest(entered)==THIRD_ENTERED and
         digest(hold)==THIRD_ROLLBACK_HOLD and
         digest(recovered)==THIRD_ROLLBACK_RECOVERED,
         "THIRD_CONSUMED_JOURNAL_DRIFT")
    start=json.loads(entered)
    failed=json.loads(hold)
    restored=json.loads(recovered)
    need(start.get("nonce")==THIRD_NONCE and start.get("one_use") is True and
         start.get("financial_authorized") is False and
         start.get("public_cutover_authorized") is False and
         start.get("plan",{}).get("new_source_sha")==SOURCE and
         start["plan"].get("before_policy_bytes")==actual and
         failed=={"status":"CRITICAL_ROLLBACK_INCOMPLETE",
                  "reason":"Hold:CANDIDATE_NOT_STOPPED",
                  "financial_authorized":False,"public_cutover_authorized":False} and
         restored.get("status")==
             "PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED_AFTER_FAILED_SYSTEMD_RESET" and
         restored.get("nonce")==THIRD_NONCE and
         restored.get("entered_sha256")==THIRD_ENTERED and
         restored.get("original_rollback_hold_sha256")==THIRD_ROLLBACK_HOLD and
         restored.get("source_controller_sha256")==THIRD_CONTROLLER_SHA and
         restored.get("preexisting_public_3030_preserved") is True and
         restored.get("financial_authorized") is False and
         restored.get("public_cutover_authorized") is False,
         "THIRD_CONSUMED_ROLLBACK_RECOVERY_NOT_WITNESSED")


def prior_failure(actual):
    journal = JOURNALS / ("upgrade-" + FAILED_NONCE)
    entered = safe_bytes(journal / "entered.json")
    rollback = safe_bytes(journal / "rollback_hold.json")
    need(digest(entered) == FAILED_ENTERED and digest(rollback) == FAILED_ROLLBACK,
         "CONSUMED_UPGRADE_JOURNAL_DRIFT")
    failed = json.loads(entered)
    need(failed["nonce"] == FAILED_NONCE and failed["one_use"] is True and
         failed["financial_authorized"] is False and failed["public_cutover_authorized"] is False and
         json.loads(rollback)["status"] == "CRITICAL_ROLLBACK_INCOMPLETE",
         "UNEXPECTED_PRIOR_UPGRADE_STATE")
    need(actual == failed["plan"]["before_policy_bytes"] and
         all(digest(safe_bytes(journal / (key + ".before"))) == value
             for key, value in actual.items()), "FAILED_UPGRADE_PREIMAGES_NOT_RESTORED")
    # The later real 3032 admission ran through the Steam TTL soak and then
    # safely restored this exact stopped profile after a false old-home event
    # witness. Preserve and verify that consumed transaction as well.
    latest=JOURNALS/("upgrade-"+LATEST_FAILED_NONCE)
    latest_entered=safe_bytes(latest/"entered.json")
    latest_rollback=safe_bytes(latest/"rollback.json")
    latest_plan=json.loads(latest_entered)
    need(digest(latest_entered)==LATEST_FAILED_ENTERED and
         digest(latest_rollback)==LATEST_VERIFIED_ROLLBACK and
         latest_plan.get("nonce")==LATEST_FAILED_NONCE and
         latest_plan.get("plan",{}).get("before_policy_bytes")==actual and
         latest_plan.get("plan",{}).get("new_source_sha")==SOURCE and
         json.loads(latest_rollback).get("status")=="PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED" and
         json.loads(latest_rollback).get("reason")=="ORIGINAL_PUBLISHED_EVENT_NOT_VERIFIED",
         "LATEST_CONSUMED_UPGRADE_ROLLBACK_DRIFT")
    recovered_third_failure(actual)
    return failed["plan"]


def traffic_receipts():
    for name, expected in TRAFFIC_RECEIPTS.items():
        need(digest(safe_bytes(TRAFFIC_ROOT / name)) == expected, "TRAFFIC_R60_RECEIPT_DRIFT")
    git = ("/usr/bin/git", "-C", "/var/www/Traffic/traffic-api")
    # R60 was independently committed and certified first. The later R61
    # source-only audit adds no runtime API, ingest writer, scheduler or
    # certified audience publication changes. Accept that narrow linear
    # fast-forward, not arbitrary source drift or an unsigned checkout.
    need(invoke(*git, "rev-parse", "HEAD").strip().decode() == TRAFFIC_SHA and
         not invoke(*git, "status", "--porcelain", "--untracked-files=no").strip(),
         "TRAFFIC_R61_CHECKOUT_NOT_EXACT")
    need(invoke(*git, "merge-base", TRAFFIC_R60_SHA, TRAFFIC_SHA).strip().decode()
         == TRAFFIC_R60_SHA and
         tuple(sorted(invoke(*git, "diff", "--name-only",
                             TRAFFIC_R60_SHA, TRAFFIC_SHA).decode().splitlines()))
         == TRAFFIC_R61_ALLOWED_FILES,
         "TRAFFIC_R61_SCOPE_NOT_EXACT_READ_ONLY_AUDITOR")


def upgrade_sources(old, release_ref, failed):
    inputs = {key: safe_bytes(path) for key, (_, path, _) in FILES.items() if path}
    need({key: digest(raw) for key, raw in inputs.items()} == failed["source_bytes_sha256"],
         "PRIOR_QUALIFIED_UPGRADE_BYTES_DRIFT")
    for key, (path, size, sha) in REVIEWED_RUNTIME_SOURCES.items():
        inputs[key] = old.production_source({"source_sha": release_ref,
            "source_sizes": {path: size}, "source_hashes": {path: sha}}, path)
    return inputs


def approved_media_unit(new, legacy_sha):
    value=new.production_unit_bytes(STAGE)
    expected=b" MANAGED_MEDIA_UPLOAD_DIR=/run/aoe2war-public-media"
    need(value.count(expected)==1,"PUBLIC_MEDIA_ENVIRONMENT_BOUNDARY_CHANGED")
    baseline=value.replace(expected,b"")
    need(tuple(new.PROD_PUBLIC_MEDIA_KINDS)==(
         "artifact","avatar","background","belt","crest","hero","logo","other"),
         "PUBLIC_MEDIA_KINDS_SCOPE_CHANGED")
    need(str(new.PROD_PUBLIC_MEDIA_ROOT)==
         "/mnt/HC_Volume_105319120/aoe2-managed-assets" and
         str(new.PROD_PUBLIC_MEDIA_MOUNT)=="/run/aoe2war-public-media",
         "PUBLIC_MEDIA_MOUNT_ROOT_CHANGED")
    for kind in new.PROD_PUBLIC_MEDIA_KINDS:
        marker=("\nBindReadOnlyPaths="+str(new.PROD_PUBLIC_MEDIA_ROOT/kind)+":"+
                str(new.PROD_PUBLIC_MEDIA_MOUNT/kind)).encode()
        need(baseline.count(marker)==1,"PUBLIC_MEDIA_KIND_MOUNT_CHANGED")
        baseline=baseline.replace(marker,b"")
    need(digest(baseline)==legacy_sha,
         "EXACT_PUBLIC_READONLY_MEDIA_UNIT_DELTA_REQUIRED")
    need(b"direct-message-attachments" not in value and
         b"BindPaths=/mnt/HC_Volume_105319120" not in value and
         b"MANAGED_MEDIA_UPLOAD_DIR=/mnt/" not in value,
         "PROTECTED_PRIVATE_MEDIA_OR_WRITE_MOUNT")
    return value


def public_media_source_witness(new):
    for kind in new.PROD_PUBLIC_MEDIA_KINDS:
        source=new.PROD_PUBLIC_MEDIA_ROOT/kind
        metadata=source.lstat()
        need(stat.S_ISDIR(metadata.st_mode) and not source.is_symlink() and
             metadata.st_uid in (0,1000) and not metadata.st_mode & 0o002,
             "PUBLIC_MEDIA_SOURCE_DIRECTORY_NOT_QUALIFIED")
    return True


def prepare(args):
    need(sys.platform == "linux" and os.geteuid() == 0 and
         socket.gethostname().split(".")[0] == "ubuntu-4gb-hel1-11", "EXACT_HEL1_ROOT_REQUIRED")
    actual={key:digest(safe_bytes(path)) for key,(path,_,_) in FILES.items()}
    failed = prior_failure(actual)
    old=module(OLD_CONTROLLER,"original_r25",actual["controller"])
    inputs = upgrade_sources(old, args.release_ref, failed)
    new = controller_module(inputs["controller"], str(OLD_CONTROLLER), "upgraded_r25")
    need(new.PROD_READ_TABLES[-6:]==TABLES,"SOURCE_SCOPED_TABLES_DRIFT")
    need({t:tuple(new.PROD_COLUMN_READS[t]) for t in COLUMNS}==COLUMNS,
         "SOURCE_SCOPED_COLUMNS_DRIFT")
    need(new.PROD_DB_ROLE==old.PROD_DB_ROLE=="aoe2war_web_prod" and
         new.PROD_UNIT==old.PROD_UNIT,"UNEXPECTED_PROD_ROLE_OR_SERVICE")
    policy=json.loads(safe_bytes(POLICY))
    need(policy["source_sha"]==OLD_SOURCE and policy["stage"]=="/var/lib/aoe2war-web-prod-"+OLD_SOURCE[:12],
         "OLD_PROFILE_IDENTITY_CHANGED")
    traffic_receipts()
    stopped_candidate(new.PROD_UNIT)
    need(not steam_elements(), "STEAM_PREIMAGE_NOT_EMPTY")
    need(old.production_nft_shape()==new.production_nft_shape()==policy["nft_shape_sha256"] and
         old.production_refresh_unit_identity()==new.production_refresh_unit_identity()==policy["refresh_units"],
         "SEALED_NFT_OR_REFRESH_UNITS_CHANGED")
    need(digest(safe_bytes(UNIT))==policy["unit_sha256"] and
         digest(safe_bytes(OLD_CONTROLLER))==policy["controller_sha256"] and
         digest(safe_bytes(PROXY))==policy["private_proxy_sha256"] and
         digest(safe_bytes(LIB/"r25_b_guard_production_v1.cjs"))==policy["guard_sha256"] and
         digest(safe_bytes(LIB/"nonfinancial-production-auth.sql"))==policy["sql_sha256"],
         "OLD_PROFILE_SOURCE_POLICY_NOT_INTACT")
    old_admission=safe_bytes(Path(policy["journal_path"])/"runtime-admission.json")
    native_old=json.loads(old_admission)
    need(digest(old_admission)==policy["admission_sha256"] and
         native_old["candidate_pid"]==failed["old_process_pid"] and
         native_old["candidate_start_ticks"]==failed["old_process_ticks"] and
         native_old["source_sha"]==OLD_SOURCE and
         native_old["status"]=="NATIVE_PRODUCTION_ADMISSION_PASS",
         "HISTORICAL_NATIVE_ADMISSION_NOT_INTACT")
    old_service=unit_properties(new.PROD_UNIT, "WorkingDirectory")["WorkingDirectory"]
    need(old_service==policy["stage"],"STOPPED_STAGE_CHANGED")
    original_version=json.loads(urllib.request.urlopen("http://127.0.0.1:3030/api/deployment-version",timeout=5).read())["buildVersion"]
    need(original_version=="20261028134227-6c0f6d7531","PUBLIC_3030_VERSION_DRIFT")
    public=safe_bytes(PUBLIC_NGINX)
    need(digest(public)==failed["public_nginx_sha256"] and
         public.count(b"proxy_pass http://127.0.0.1:3030;")==6,"PUBLIC_PROXY_NOT_ALL_3030")
    before = new.production_protected()
    need(digest(canonical(before)) == args.protected_sha256 and old.production_protected() == before,
         "EXACT_REVIEWED_PROTECTED_SNAPSHOT_REQUIRED")
    artifact=json.loads(__import__("zipfile").ZipFile(ARTIFACT).read("artifact.json"))
    need(artifact["source_sha"]==SOURCE and artifact["build_id"]==(STAGE/".next/BUILD_ID").read_text().strip() and
         artifact["build_version"]==(STAGE/".aoe2war-build-version").read_text().strip() and
         digest(safe_bytes(STAGE/".aoe2war-runtime-manifest.json"))==artifact["manifest_sha256"],
         "STAGED_ARTIFACT_MISMATCH")
    need(new.production_ci_zip({"source_sha":SOURCE,"artifact":artifact,
         "ci_artifact":{"id":ARTIFACT_ID,"run_id":RUN_ID,"archive_path":str(ARTIFACT)}},
         ARTIFACT)["id"]==ARTIFACT_ID,"ARTIFACT_GITHUB_PROVENANCE_HOLD")
    source = {key: digest(raw) for key, raw in inputs.items()}
    need(artifact["manifest_sha256"] == failed["new_manifest_sha256"], "QUALIFIED_UPGRADE_MANIFEST_DRIFT")
    new_guard=source["guard"]
    new_sql=source["auth_sql"]
    proxy=digest(new.production_proxy_bytes())
    updated_unit=approved_media_unit(new,failed["new_unit_sha256"])
    public_media_source_witness(new)
    unit=digest(updated_unit)
    need(all(source[k]!=actual[k] for k in ("controller","guard","auth_sql")),"SOURCE_ALREADY_MIGRATED")
    need(all((STAGE/p).is_file() for p in ("package.json",".next/BUILD_ID")),"NEW_RUNTIME_INCOMPLETE")
    _,database,password=new.production_runtime_environment()
    old_db=old.production_database_witness(database,password)
    old_read=old_db["read_acl_sha256"]
    need(old_read==native_old["catalog"]["read_acl_sha256"]==failed["before_read_acl_sha256"] and
         old_db["definer_identity_sha256"]==native_old["catalog"]["definer_identity_sha256"],
         "OLD_ROLE_CATALOG_NOT_NATIVE_ATTESTED")
    need(old_db["no_unreviewed_table_select"] and old_db["no_direct_table_mutation"] and
         old_db["no_users_secret_select"],"BEFORE_DB_SCOPE_INCORRECT")
    evidence={"schema":"aoe2war.a05.3032-stopped-upgrade-plan.v2",
      "old_source_sha":OLD_SOURCE,"new_source_sha":SOURCE,
      "old_process_running":False,"old_profile_sha256":actual["policy"],
      "historical_protected_sha256":policy["protected_snapshot_sha256"],
      "failed_upgrade_protected_sha256":failed["protected_sha256"],
      "prior_entered_sha256":FAILED_ENTERED,"prior_rollback_hold_sha256":FAILED_ROLLBACK,
      "traffic_r60_receipts":TRAFFIC_RECEIPTS,"steam_set_preimage_empty":True,
      "before_read_acl_sha256":old_read,"before_definer_sha256":old_db["definer_identity_sha256"],
      "nft_shape_sha256":policy["nft_shape_sha256"],"before_policy_bytes":actual,
      "source_bytes_sha256":source,
      "new_guard_sha256":new_guard,"new_sql_sha256":new_sql,
      "new_proxy_sha256":proxy,"new_unit_sha256":unit,
      "new_manifest_sha256":artifact["manifest_sha256"],
      "public_nginx_sha256":digest(public),
      "protected_sha256":args.protected_sha256,
      "no_public_cutover":True,"financial_authorized":False}
    return old,new,policy,evidence,inputs

def qualify(old, args, plan):
    raw = safe_bytes(Path(__file__))
    item = old.production_github("contents/" + SOURCE_PATH + "?ref=" + args.release_ref)
    need(item.get("type") == "file" and item.get("encoding") == "base64" and
         base64.b64decode(item["content"].replace("\n", ""), validate=True) == raw,
         "EXACT_UPGRADE_CONTROLLER_SOURCE_REQUIRED")
    checks = old.production_github("commits/" + args.release_ref + "/check-runs?filter=latest&per_page=100")
    security = [row for row in checks["check_runs"] if row["name"] == "GitGuardian Security Checks"
                and row["app"]["slug"] == "gitguardian"]
    need(len(security) == 1 and security[0]["status"] == "completed" and
         security[0]["conclusion"] == "success", "EXACT_UPGRADE_SOURCE_SECURITY_REQUIRED")
    # Reuse the native owner grant contract with a distinct, narrower scope.
    old.PROD_SCOPE = SCOPE
    grant_plan = {**plan, "ci_artifact": {"run_id": args.ci_run}}
    return old.production_grant({"source_sha": args.release_ref, "nonce": args.nonce,
        "owner_comment_id": args.comment_id, "owner_comment_sha256": args.comment_sha256}, grant_plan)


def assert_protected(new, plan):
    need(digest(canonical(new.production_protected())) == plan["protected_sha256"] and
         digest(safe_bytes(PUBLIC_NGINX)) == plan["public_nginx_sha256"],
         "PROTECTED_SERVICES_OR_PUBLIC_SELECTORS_CHANGED")


def refresh_invocation():
    return unit_properties(REFRESH, "InvocationID,ExecMainExitTimestampMonotonic,Result,ExecMainStatus,ActiveState")


def check_refresh_success(before):
    current = refresh_invocation()
    invocation = current["InvocationID"]
    if (invocation == before or not re.fullmatch(r"[a-f0-9]{32}", invocation) or
            current["ActiveState"] not in ("inactive", "failed")):
        return None
    log = invoke("/usr/bin/journalctl", "--no-pager", "-o", "cat", "_SYSTEMD_INVOCATION_ID=" + invocation)
    reports = [json.loads(line) for line in log.decode().splitlines() if line.startswith("{")]
    # Known in-flight monitoring can hold a single refresh. The existing
    # validated allowlist must stay nonempty and later timer cycles must PASS.
    if (current["Result"] == "exit-code" and current["ExecMainStatus"] == "2" and
            any(row.get("status") == "HOLD" and
                row.get("reason") == "MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT" for row in reports)):
        return invocation, False
    need(current["Result"] == "success" and current["ExecMainStatus"] == "0",
         "SANDBOXED_STEAM_REFRESH_FAILED")
    need(any(row.get("status") == "VALIDATED_STEAM_IP_SETS_REFRESHED" and
             row.get("timeout_seconds") == 300 and row.get("addresses", 0) > 0 and
             row.get("financial_authorized") is False for row in reports), "SANDBOXED_STEAM_REFRESH_RECEIPT_ABSENT")
    return invocation, True


def soak_refresh():
    last = refresh_invocation()["InvocationID"]
    started = time.monotonic()
    invoke("/usr/bin/systemctl", "start", TIMER, timeout=45)
    completed = []
    monitor_holds = []
    while time.monotonic() - started < 390:
        need(unit_properties(TIMER, "ActiveState")["ActiveState"] == "active", "STEAM_TIMER_STOPPED")
        result = check_refresh_success(last)
        if result:
            last, passed = result
            (completed if passed else monitor_holds).append(last)
        need(steam_elements(), "STEAM_DESTINATIONS_EXPIRED_DURING_SOAK")
        if len(completed) >= 3 and time.monotonic() - started > 300:
            return {"invocations": completed, "elapsed_seconds": int(time.monotonic() - started),
                    "monitor_holds": monitor_holds, "element_ttl_seconds": 300,
                    "persistent_start_authorized": False}
        time.sleep(6)
    raise Hold("STEAM_TIMER_TTL_SOAK_TIMEOUT")


def restore_stopped(old, new, plan, backups, changed_steam):
    invoke("/usr/bin/systemctl", "stop", TIMER, REFRESH, new.PROD_UNIT, timeout=55)
    # A failed Node guard leaves ActiveState=failed even after systemctl stop;
    # clear only the exact isolated unit, then verify MainPID=0 and inactive.
    invoke("/usr/bin/systemctl", "reset-failed", new.PROD_UNIT, timeout=20)
    stopped_candidate(old.PROD_UNIT)
    native_sql(acl_delta(False))
    for key, (path, _, mode) in FILES.items():
        atomic(path, backups[key], mode)
    invoke("/usr/bin/systemctl", "daemon-reload", timeout=20)
    invoke("/usr/sbin/nginx", "-t", timeout=15)
    invoke("/usr/bin/systemctl", "reload", "nginx", timeout=20)
    if changed_steam:
        need(old.production_nft_shape() == plan["nft_shape_sha256"], "ROLLBACK_NFT_SHAPE_DRIFT")
        invoke("/usr/sbin/nft", "-f", "-", input=(
            b"flush set inet aoe2war_web_prod steam4\nflush set inet aoe2war_web_prod steam6\n"))
    _, db, password = old.production_runtime_environment()
    catalog = old.production_database_witness(db, password)
    need(catalog["read_acl_sha256"] == plan["before_read_acl_sha256"] and
         catalog["definer_identity_sha256"] == plan["before_definer_sha256"] and
         all(digest(safe_bytes(path)) == plan["before_policy_bytes"][key]
             for key, (path, _, _) in FILES.items()) and
         old.production_nft_shape() == plan["nft_shape_sha256"] and not steam_elements(),
         "ROLLBACK_EXACT_STOPPED_PREIMAGE_NOT_RESTORED")
    stopped_candidate(old.PROD_UNIT)
    assert_protected(old, plan)


def upgrade(args):
    nonce = args.nonce
    need(nonce != FAILED_NONCE and not (JOURNALS / ("upgrade-" + nonce)).exists(), "NONCE_ALREADY_USED")
    old,new,old_policy,plan,inputs=prepare(args)
    plan = bind_plan(plan, args)
    grant = qualify(old, args, plan)
    approved = {**plan, "ci_artifact": {"run_id": args.ci_run}}
    expected = digest(canonical(approved))
    need(expected == args.plan_hash,"EXACT_APPROVED_PLAN_HASH_CHANGED")
    journal=JOURNALS/("upgrade-"+nonce)
    need(not journal.exists(),"NONCE_ALREADY_USED")
    JOURNALS.mkdir(mode=0o700,parents=True,exist_ok=True)
    journal.mkdir(mode=0o700)
    fsync_directory(JOURNALS)
    seal(journal/"entered.json",{"nonce":nonce,"plan":approved,"owner_grant":grant,
             "financial_authorized":False,"public_cutover_authorized":False,"one_use":True})
    backups={}
    for key,(path,_,_) in FILES.items():
        backups[key]=safe_bytes(path)
        atomic(journal/(key+".before"),backups[key],0o600)
    changed=False
    changed_steam=False
    try:
        need(all(digest(raw) == plan["before_policy_bytes"][key] for key, raw in backups.items()),
             "PRESTART_PREIMAGE_DRIFT")
        assert_protected(new, plan)
        stopped_candidate(new.PROD_UNIT)
        need(not steam_elements(), "PRESTART_STEAM_SET_DRIFT")
        changed=True
        native_sql(acl_delta(True))
        env,db,password=new.production_runtime_environment()
        native=new.production_database_witness(db,password)
        need(native["read_acl_sha256"]!=plan["before_read_acl_sha256"],"NEW_ACL_NOT_ADMITTED")
        for key in ("controller","guard","auth_sql"):
            target,_,mode=FILES[key]
            raw = inputs[key]
            need(digest(raw) == plan["source_bytes_sha256"][key], "UPGRADE_SOURCE_CHANGED_BEFORE_INSTALL")
            atomic(target,raw,mode)
        atomic(PROXY,new.production_proxy_bytes(),0o644)
        atomic(UNIT,new.production_unit_bytes(STAGE),0o644)
        invoke("/usr/sbin/nginx","-t",timeout=15)
        need(digest(safe_bytes(Path("/etc/nginx/sites-available/aoe2war.com")))==plan["public_nginx_sha256"],
             "PUBLIC_SELECTORS_CHANGED")
        invoke("/usr/bin/systemctl","reload","nginx",timeout=20)
        invoke("/usr/bin/systemctl", "daemon-reload", timeout=20)
        assert_protected(new, plan)
        changed_steam=True
        steam_addresses = new.production_admission_steam_refresh()
        invoke("/usr/bin/systemctl", "start", new.PROD_UNIT, timeout=90)
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
            "native_plan_sha256":expected,"journal_path":str(journal),
            "controller_sha256":plan["source_bytes_sha256"]["controller"],
            "steam_addresses":steam_addresses,
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
        refresh = soak_refresh()
        witness=new.production_witness({"profile_path":str(POLICY)})
        need(new.production_wait(profile, seconds=15) == (pid, ticks), "CANDIDATE_PID_CHANGED_DURING_SOAK")
        new.production_steam_probe(env, STAGE)
        contents=candidate_content()
        need(contents["candidate_build_version"]==profile["build_version"],"BUILT_VERSION_DRIFT")
        assert_protected(new, plan)
        seal(journal/"complete.json",{"status":"PASS_NEW_3032_ADMITTED_NOT_PUBLIC",
          "source_sha":SOURCE,"pid":pid,"ticks":ticks,
          "profile_sha256":witness["profile_sha256"],"read_acl_sha256":admission["catalog"]["read_acl_sha256"],
          "content":contents,"steam_refresh":refresh,"financial_authorized":False,
          "public_cutover_authorized":False,"browser_roles_verified":False})
        return {"status":"PASS_NEW_3032_ADMITTED_NOT_PUBLIC","pid":pid,"content":contents}
    except BaseException as err:
        if changed:
            try:
                restore_stopped(old, new, plan, backups, changed_steam)
                seal(journal/"rollback.json",{
                  "status":"PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED",
                  "reason":str(err)[:160],"old_3032_running":False,
                  "historical_admission_reused":False,
                  "financial_authorized":False,"public_cutover_authorized":False})
            except BaseException as rollback:
                seal(journal/"rollback_hold.json",{"status":"CRITICAL_ROLLBACK_INCOMPLETE",
                  "reason":type(rollback).__name__+":"+str(rollback)[:160],
                  "financial_authorized":False,"public_cutover_authorized":False})
        raise

def bind_plan(plan, args):
    return {**plan, "nonce": args.nonce, "release_ref": args.release_ref,
            "upgrade_controller_sha256": digest(safe_bytes(Path(__file__)))}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--phase",choices=("plan","execute"),required=True)
    ap.add_argument("--nonce")
    ap.add_argument("--plan-hash")
    ap.add_argument("--release-ref", required=True)
    ap.add_argument("--ci-run", type=int, required=True)
    ap.add_argument("--protected-sha256", required=True)
    ap.add_argument("--comment-id", type=int)
    ap.add_argument("--comment-sha256")
    args=ap.parse_args()
    need(re.fullmatch(r"[0-9a-f]{32}", args.nonce or "") and args.nonce != FAILED_NONCE and
         re.fullmatch(r"[0-9a-f]{40}", args.release_ref) and args.ci_run > 0 and
         re.fullmatch(r"[0-9a-f]{64}", args.protected_sha256), "EXACT_FRESH_TRANSACTION_REQUIRED")
    st=LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and (st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) ==
         LOCK_ID, "ORIGINAL_RELEASE_LOCK_CHANGED")
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        opened=os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == LOCK_ID[:2], "ORIGINAL_RELEASE_LOCK_OPEN_RACE")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.phase=="plan":
            need(args.plan_hash is None and args.comment_id is None and args.comment_sha256 is None,
                 "PLAN_MUST_NOT_AUTHORIZE_EXECUTION")
            need(not (JOURNALS / ("upgrade-" + args.nonce)).exists(), "NONCE_ALREADY_USED")
            _,_,_,plan,_=prepare(args)
            plan = {**bind_plan(plan, args), "ci_artifact": {"run_id": args.ci_run}}
            print(json.dumps({"status":"PASS_SCOPED_PROFILE_PLAN_READ_ONLY",
                "plan":plan,"plan_sha256":digest(canonical(plan)),
                "public_cutover_authorized":False},sort_keys=True))
        else:
            need(re.fullmatch(r"[0-9a-f]{64}", args.plan_hash or "") and
                 re.fullmatch(r"[0-9a-f]{64}", args.comment_sha256 or "") and
                 args.comment_id and args.comment_id > 0, "EXACT_ONE_USE_APPROVAL_REQUIRED")
            print(json.dumps(upgrade(args),sort_keys=True))
    finally:
        os.close(fd)

if __name__=="__main__":
    try:main()
    except BaseException as error:
        print(json.dumps({"status":"HOLD","reason":type(error).__name__+":"+str(error)[:170],
            "no_blind_retry":True,"financial_authorized":False,
            "public_cutover_authorized":False},sort_keys=True))
        sys.exit(2)
