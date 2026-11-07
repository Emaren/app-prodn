#!/usr/bin/env python3
"""Exact one-use recovery of the consumed 464a A05 nonfinancial transaction.

The old public 3030 and WOLO services are invariant. This tool cannot deploy,
authorize public cutover, transfer funds, retry a nonce, or start 3032.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import socket
import stat
import sys

NONCE="464a942c053aabf57166eb8e372be677"
JOURNAL=pathlib.Path("/var/lib/aoe2war-app-production-v1/profile-upgrades")/("upgrade-"+NONCE)
SOURCE=pathlib.Path("/var/lib/aoe2war-app-production-v1/tools/scoped-upgrade-8ba0be8a.py")
SOURCE_SHA="1869a0b4e6aedfadf36148e63b1f4acc0df8216ab833ec696a425ef2e451a036"
ENTERED_SHA="912f7c209310758f5e553588c944fca2a74bbb35d9ee0cdb9e4f8826219349ca"
HOLD_SHA="e2922ba6504c6c26146fe6f1135477f7a60a7173ee5f8ed8ad17d1a7fda4b2f8"
RELEASE_SHA="0c62a3262c982a4dfd0fd4da03243f460e31654a"
PLAN_SHA="d36ee2ca8c9ed2f6611bee9a2c21277e8151ed1fbf0d8b3d658247b232f053d8"
EXPECTED_REASON=("Hold:NATIVE_COMMAND_FAILED:/usr/bin/systemctl:"
 "Failed to reset failed state of unit aoe2hdbets-web-prod.service: "
 "Unit aoe2hdbets-web-prod.service not loaded.\n")

def need(ok,why):
    if not ok: raise RuntimeError(why)

def sha(b):
    return hashlib.sha256(b).hexdigest()

def load_original_module():
    st=SOURCE.lstat()
    need(st.st_uid==0 and stat.S_ISREG(st.st_mode) and st.st_nlink==1
         and not st.st_mode & 0o022 and not SOURCE.is_symlink(),
         "SOURCE_NOT_ROOT_SEALED")
    need(sha(SOURCE.read_bytes())==SOURCE_SHA,"ORIGINAL_QUALIFIED_SOURCE_DRIFT")
    spec=importlib.util.spec_from_file_location("a05_qualified",str(SOURCE))
    need(spec is not None and spec.loader is not None,"SOURCE_IMPORT_FAILED")
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

def preflight(m):
    need(os.geteuid()==0 and socket.gethostname().split(".")[0]=="ubuntu-4gb-hel1-11",
         "EXACT_ROOT_HOST_REQUIRED")
    entered=m.safe_bytes(JOURNAL/"entered.json")
    hold=m.safe_bytes(JOURNAL/"rollback_hold.json")
    need(sha(entered)==ENTERED_SHA and sha(hold)==HOLD_SHA,
         "CONSUMED_JOURNAL_DIGEST_DRIFT")
    event=json.loads(entered)
    failed=json.loads(hold)
    need(failed=={
         "status":"CRITICAL_ROLLBACK_INCOMPLETE",
         "reason":EXPECTED_REASON,
         "financial_authorized":False,"public_cutover_authorized":False},
         "EXACT_FAILED_RESET_REASON_REQUIRED")
    plan=event.get("plan",{})
    grant=event.get("owner_grant",{})
    need(event.get("nonce")==NONCE and event.get("one_use") is True
         and event.get("financial_authorized") is False
         and event.get("public_cutover_authorized") is False
         and plan.get("nonce")==NONCE and plan.get("release_ref")==RELEASE_SHA
         and plan.get("upgrade_controller_sha256")==SOURCE_SHA
         and grant.get("grant",{}).get("nonce")==NONCE
         and grant.get("grant",{}).get("rollback_authorized") is True
         and plan.get("protected_sha256")==
             "5b2d42fbde3dd086987e3c2175eb03178dbe3f9a61629b264537db18d782ff69"
         and sha(m.canonical(plan))==PLAN_SHA,
         "EXACT_ONE_USE_RECOVERY_PLAN_INVALID")
    expected_before=plan["before_policy_bytes"]
    need(set(expected_before)==set(m.FILES),"ORIGINAL_PREIMAGE_SET_DRIFT")
    backups={}
    for key in m.FILES:
        raw=m.safe_bytes(JOURNAL/(key+".before"))
        need(sha(raw)==expected_before[key],"ORIGINAL_PREIMAGE_BYTES_CHANGED:"+key)
        backups[key]=raw
    expected_current={
        "controller":plan["source_bytes_sha256"]["controller"],
        "guard":plan["source_bytes_sha256"]["guard"],
        "auth_sql":plan["source_bytes_sha256"]["auth_sql"],
        "proxy":plan["new_proxy_sha256"],
        "unit":plan["new_unit_sha256"],
        "policy":expected_before["policy"],
    }
    for key,(path,_,_) in m.FILES.items():
        need(sha(m.safe_bytes(path))==expected_current[key],
             "POST_FAILURE_PROFILE_DRIFT:"+key)
    need(sha(m.safe_bytes(m.PUBLIC_NGINX))==plan["public_nginx_sha256"]
         and m.safe_bytes(m.PUBLIC_NGINX).count(b"proxy_pass http://127.0.0.1:3030;")==6,
         "PUBLIC_NGINX_NOT_PROTECTED")
    m.stopped_candidate(m.FILES["unit"][0].name)
    original=m.controller_module(backups["controller"],str(m.OLD_CONTROLLER),"recover_original")
    current=m.controller_module(m.safe_bytes(m.OLD_CONTROLLER),str(m.OLD_CONTROLLER),"recover_current")
    need(original.PROD_UNIT==current.PROD_UNIT==m.FILES["unit"][0].name,
         "ISOLATED_UNIT_IDENTITY_DRIFT")
    m.assert_protected(current,plan)
    return plan,backups,original,current

def recover(m,plan,backups,old,new):
    # Verify stopped state; a missing transient systemd unit is not reason to
    # abort rollback if the exact unit file exists and no process/listener exists.
    m.invoke("/usr/bin/systemctl","stop",m.TIMER,m.REFRESH,new.PROD_UNIT,timeout=55)
    state=m.unit_properties(new.PROD_UNIT,"ActiveState,MainPID")
    need(state.get("MainPID")=="0" and state.get("ActiveState") in ("inactive","failed"),
         "RECOVERY_CANDIDATE_PROCESS_STILL_RUNNING")
    if state["ActiveState"]=="failed":
        m.invoke("/usr/bin/systemctl","daemon-reload",timeout=20)
        m.invoke("/usr/bin/systemctl","reset-failed",new.PROD_UNIT,timeout=20)
    m.stopped_candidate(new.PROD_UNIT)
    m.native_sql(m.acl_delta(False))
    for key,(target,_,mode) in m.FILES.items():
        m.atomic(target,backups[key],mode)
    m.invoke("/usr/bin/systemctl","daemon-reload",timeout=20)
    m.invoke("/usr/sbin/nginx","-t",timeout=15)
    m.invoke("/usr/bin/systemctl","reload","nginx",timeout=20)
    need(old.production_nft_shape()==plan["nft_shape_sha256"],
         "PROTECTED_NFT_SHAPE_CHANGED")
    m.invoke("/usr/sbin/nft","-f","-",input=(
      b"flush set inet aoe2war_web_prod steam4\n"
      b"flush set inet aoe2war_web_prod steam6\n"))
    _,database,password=old.production_runtime_environment()
    catalog=old.production_database_witness(database,password)
    need(catalog["read_acl_sha256"]==plan["before_read_acl_sha256"]
         and catalog["definer_identity_sha256"]==plan["before_definer_sha256"]
         and all(sha(m.safe_bytes(p))==plan["before_policy_bytes"][key]
                 for key,(p,_,_) in m.FILES.items())
         and old.production_nft_shape()==plan["nft_shape_sha256"]
         and not m.steam_elements(),
         "POST_RECOVERY_NATIVE_PREIMAGE_NOT_EXACT")
    m.stopped_candidate(old.PROD_UNIT)
    m.assert_protected(old,plan)
    receipt={"schema":"aoe2war.a05.stopped-recovery.v1",
      "status":"PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED_AFTER_TLS_HOLD",
      "nonce":NONCE,"entered_sha256":ENTERED_SHA,
      "original_rollback_hold_sha256":HOLD_SHA,
      "recovery_source_sha256":sha(pathlib.Path(__file__).read_bytes()),
      "old_public_3030_preserved":True,"original_read_acl_sha256":catalog["read_acl_sha256"],
      "financial_authorized":False,"public_cutover_authorized":False,
      "original_nonce_consumed":True}
    m.seal(JOURNAL/"rollback-recovered.json",receipt)
    return receipt

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--phase",choices=("plan","recover"),required=True)
    args=p.parse_args()
    m=load_original_module()
    lock=m.LOCK.lstat()
    need((lock.st_dev,lock.st_ino,lock.st_uid,stat.S_IMODE(lock.st_mode))==m.LOCK_ID,
         "EXACT_RELEASE_LOCK_REQUIRED")
    fd=os.open(m.LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        need(not (JOURNAL/"rollback-recovered.json").exists(),"ALREADY_RECOVERED")
        plan,backups,old,new=preflight(m)
        if args.phase=="plan":
            print(json.dumps({"status":"PASS_EXACT_CONSUMED_A05_RECOVERY_PLAN_READ_ONLY",
              "nonce":NONCE,"entry_sha256":ENTERED_SHA,
              "rollback_hold_sha256":HOLD_SHA,"public_cutover_authorized":False,
              "financial_authorized":False},sort_keys=True))
        else:
            print(json.dumps(recover(m,plan,backups,old,new),sort_keys=True))
    finally:os.close(fd)

if __name__=="__main__":
    try:main()
    except BaseException as exc:
        print(json.dumps({"status":"HOLD","reason":type(exc).__name__+":"+str(exc)[:200],
          "no_blind_retry":True,"public_cutover_authorized":False,"financial_authorized":False},sort_keys=True))
        sys.exit(2)
