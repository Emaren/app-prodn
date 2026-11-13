#!/usr/bin/python3
"""Prepare a one-use PRODUCT-only release manifest from independent GitHub evidence.

Runs on HEL1 as the already authorized owner-root deployment account.
NO service changes, SQL, nft writes, finance, HTTP callback or token access.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tarfile
import urllib.request

TARGET_DIR=Path("/root/aoe2war-product-release-manifests")
WEB_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
FIN_MASKS=("aoe2hdbets-bet-stake-reconcile.service",
 "aoe2hdbets-bet-stake-reconcile.timer","aoe2hdbets-staking-rewards.service",
 "aoe2hdbets-staking-rewards.timer","wolochain-mainnet-settlement.service",
 "wolochain-founder-rewards-settlement.service")
STEAM_INSPECT="/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py"

def need(ok,reason):
    if not ok:raise RuntimeError("HOLD_PRODUCT_MANIFEST_"+reason)

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(4194304),b""):h.update(part)
    return h.hexdigest()

def root_file(path,mode=None):
    st=path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
         and not path.is_symlink() and not(stat.S_IMODE(st.st_mode)&0o022),
         "ROOT_SOURCE_OWNER_OR_MODE")
    if mode is not None:need(stat.S_IMODE(st.st_mode)==mode,"ROOT_SOURCE_MODE")
    return path.read_bytes()

def run(*args):
    p=subprocess.run(args,text=True,capture_output=True,timeout=20)
    need(p.returncode==0,"INSPECTION_FAILED_"+Path(args[0]).name)
    return p.stdout.strip()

def unit_field(name):
    return run("systemctl","show","aoe2hdbets-web-prod.service","-p",name,"--value")

def prepare(proof_path):
    need(os.geteuid()==0,"ROOT_ACCOUNT_REQUIRED")
    proof_path=Path(proof_path)
    stage=proof_path.parent
    need(proof_path.name=="b-linux-independent-review-v2.json" and
         re.fullmatch(r"/home/tony/\.aoe2war-b-[A-Za-z0-9._-]+",
                      str(stage)) is not None and not stage.is_symlink(),
         "STAGE_SCOPE")
    sd=stage.lstat()
    need(stat.S_ISDIR(sd.st_mode) and sd.st_uid==1000 and
         stat.S_IMODE(sd.st_mode)==0o700,"STAGE_OWNER")
    ps=proof_path.lstat()
    need(stat.S_ISREG(ps.st_mode) and ps.st_uid==1000 and
         ps.st_nlink==1 and not proof_path.is_symlink() and
         not(stat.S_IMODE(ps.st_mode)&0o022),"PROOF_OWNER")
    proof_bytes=proof_path.read_bytes()
    proof=json.loads(proof_bytes)
    need(type(proof) is dict and
         proof.get("status")=="PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER"
         and proof.get("financial_authorized") is False
         and proof.get("public_3032_activation_authorized") is False
         and proof.get("root_stage_authorized") is False
         and proof.get("node")=="v22.22.0"
         and proof.get("os")=="linux" and proof.get("arch")=="x86_64",
         "INDEPENDENT_RECEIPT_SHAPE")
    source=proof.get("source_commit")
    build=proof.get("build_id")
    need(type(source) is str and re.fullmatch("[a-f0-9]{40}",source) and
         type(build) is str and re.fullmatch("[A-Za-z0-9_-]{8,64}",build),
         "SOURCE_BUILD_ID")
    archive=stage/"runtime.tar.gz"
    st=archive.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==1000 and st.st_nlink==1
         and not archive.is_symlink() and not(stat.S_IMODE(st.st_mode)&0o022),
         "ARCHIVE_OWNER")
    need(type(proof.get("runtime_archive_bytes")) is int and
         st.st_size==proof["runtime_archive_bytes"] and
         sha(archive)==proof["runtime_archive_sha256"],
         "ARCHIVE_BYTES_OR_SHA")
    need(type(proof.get("runtime_entries_verified")) is int and
         1000<proof["runtime_entries_verified"]<200000,
         "RUNTIME_ENTRY_COUNT")
    with tarfile.open(archive,"r:gz") as tar:
        count=0
        version=None
        for member in tar:
            count+=1
            if member.name in (".aoe2war-source-sha",".next/BUILD_ID",".aoe2war-build-version"):
                need(member.isfile() and member.size<256,"RUNTIME_MARKER_TYPE")
                data=tar.extractfile(member).read(256).decode("utf-8").strip()
                if member.name==".aoe2war-source-sha":need(data==source,"SOURCE_MARKER_CHANGED")
                elif member.name==".next/BUILD_ID":need(data==build,"BUILD_MARKER_CHANGED")
                else:version=data
        need(count==proof["runtime_entries_verified"]+2 and version is not None
             and re.fullmatch("[A-Za-z0-9_.-]{12,80}",version),
             "RUNTIME_COUNT_OR_BUILD_VERSION")
    need(unit_field("User")=="aoe2war-web-prod" and
         unit_field("ActiveState")=="active" and
         unit_field("NeedDaemonReload")=="no",
         "PREVIOUS_WEB_SERVICE_NOT_HEALTHY")
    prev=unit_field("WorkingDirectory")
    need(re.fullmatch(r"/var/lib/aoe2war-web-prod-[0-9a-f]{12}",prev) is not None,
         "PREVIOUS_ROOT_UNTRUSTED")
    prev_path=Path(prev)
    s=prev_path.lstat()
    need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and
         not prev_path.is_symlink() and not(stat.S_IMODE(s.st_mode)&0o022),
         "PREVIOUS_ROOT_OWNER")
    prior_source=root_file(prev_path/".aoe2war-source-sha").decode().strip()
    prior_build=root_file(prev_path/".next/BUILD_ID").decode().strip()
    need(re.fullmatch("[a-f0-9]{40}",prior_source) and
         prior_source[:12]==prev_path.name[-12:] and
         re.fullmatch("[A-Za-z0-9_-]{8,64}",prior_build) and
         prior_source!=source,"NOT_A_NEW_RELEASE")
    run("/usr/bin/python3","-I","-B",STEAM_INSPECT,"--phase","inspect")
    ports=run("/usr/bin/ss","-H","-ltn")
    need(not any(re.search(r":(?:8092|8093|8094|8095)\s",x+" ") for x in ports.splitlines()),
         "FINANCIAL_PORT_OPEN")
    for unit in FIN_MASKS:
        p=subprocess.run(["systemctl","is-enabled",unit],
             capture_output=True,text=True,timeout=10)
        need(p.stdout.strip()=="masked","FINANCIAL_MASK_CHANGED")
    with urllib.request.urlopen("http://127.0.0.1:3030/",timeout=5) as resp:
        need(resp.status==200,"3030_FALLBACK_UNHEALTHY")
    data={
      "schema":"aoe2war.product.web-release-manifest.v2",
      "source":source,"build":build,"version":version,
      "archive_path":str(archive),
      "archive_sha256":proof["runtime_archive_sha256"],
      "archive_bytes":proof["runtime_archive_bytes"],
      "runtime_member_count":count,
      "previous_source":prior_source,"previous_build":prior_build,
      "previous_root":prev,
      "previous_unit_sha256":sha(WEB_UNIT),
      "independent_proof_sha256":hashlib.sha256(proof_bytes).hexdigest(),
      "github_run_id":proof["run_id"],
      "financial_authorized":False,
    }
    if not TARGET_DIR.exists():TARGET_DIR.mkdir(mode=0o700)
    sd=TARGET_DIR.lstat()
    need(sd.st_uid==0 and stat.S_IMODE(sd.st_mode)==0o700
         and stat.S_ISDIR(sd.st_mode) and not TARGET_DIR.is_symlink(),
         "MANIFEST_OWNER")
    dest=TARGET_DIR/(source[:12]+"-run-"+str(proof["run_id"])+".json")
    raw=(json.dumps(data,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        os.fchmod(fd,0o600)
        need(os.write(fd,raw)==len(raw),"MANIFEST_WRITE")
        os.fsync(fd)
    finally:os.close(fd)
    dfd=os.open(TARGET_DIR,os.O_DIRECTORY|os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(dfd)
    finally:os.close(dfd)
    print("PASS_SOURCE_BOUND_PRODUCT_MANIFEST",str(dest),
          hashlib.sha256(raw).hexdigest(),"NO_FINANCIAL_AUTHORITY")
    print("DEPLOY_COMMAND","python3 -I -B /root/aoe2war_product_release_controller_v2.py release --manifest "+str(dest))

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--proof",required=True)
    options=ap.parse_args()
    try:prepare(options.proof)
    except Exception as e:
        print("HOLD_PRODUCT_MANIFEST",type(e).__name__,str(e))
        sys.exit(3)
