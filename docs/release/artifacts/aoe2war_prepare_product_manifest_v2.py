#!/usr/bin/python3
"""Prepare a one-use PRODUCT-only release manifest from independent GitHub evidence.

Runs on HEL1 as the already authorized owner-root deployment account.
NO service changes, SQL, nft writes, finance, HTTP callback or token access.
"""
import argparse
import contextlib
import hashlib
import json
import os
import runpy
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
DATA_HELPER=Path("/root/aoe2war_factory_data_stage_v1.py")
DATA_HELPER_SHA="96e9c5a693e55ba5475a44eba15aef3db9fd5d2b5fb2f296b7ca3eb89656c87d"

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

def load_data_helper():
    st=DATA_HELPER.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
         and stat.S_IMODE(st.st_mode)==0o555 and
         sha(DATA_HELPER)==DATA_HELPER_SHA,"ROOT_DATA_HELPER_PIN")
    return runpy.run_path(str(DATA_HELPER),run_name="__factory_data_source__")

def _stage_stat_tuple(st):
    return (st.st_dev,st.st_ino,st.st_uid,st.st_gid,st.st_mode,
            st.st_nlink,st.st_size,st.st_mtime_ns,st.st_ctime_ns)

@contextlib.contextmanager
def opened_stage_member(stage, prior_stage, name, prior_file):
    """Pin the original directory and member before opening untrusted bytes.

    The source sender owns the DATA handoff directory until root promotes
    it, so path.lstat() followed by Path.open() is NOT a no-follow contract.
    """
    need(name in ("runtime.tar.gz","b-linux-independent-review-v2.json"),
         "UNTRUSTED_MEMBER_SCOPE")
    dfd=os.open(stage,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        directory=os.fstat(dfd)
        need(_stage_stat_tuple(directory)==_stage_stat_tuple(prior_stage),
             "STAGE_DIRECTORY_SWAPPED")
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=dfd)
        with os.fdopen(fd,"rb") as member:
            original=os.fstat(member.fileno())
            need(_stage_stat_tuple(original)==_stage_stat_tuple(prior_file),
                 "STAGE_MEMBER_INODE_CHANGED")
            try:
                yield member
            finally:
                after=os.fstat(member.fileno())
                need(_stage_stat_tuple(after)==_stage_stat_tuple(original),
                     "STAGE_MEMBER_CHANGED_DURING_INSPECT")
        need(_stage_stat_tuple(os.fstat(dfd))==
             _stage_stat_tuple(prior_stage),
             "STAGE_DIRECTORY_CHANGED_DURING_INSPECT")
        need(_stage_stat_tuple(stage.lstat())==
             _stage_stat_tuple(prior_stage),
             "STAGE_PATH_REPLACED")
    finally:
        os.close(dfd)

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
    helper=load_data_helper()
    is_data=stage.parent==helper["DATA_STAGE_ROOT"]
    legacy=(re.fullmatch(r"/home/tony/\.aoe2war-b-[A-Za-z0-9._-]+",
                        str(stage)) is not None)
    need(proof_path.name=="b-linux-independent-review-v2.json"
         and (is_data or legacy) and not stage.is_symlink(),"STAGE_SCOPE")
    sd=stage.lstat()
    is_frozen=is_data and sd.st_uid==0
    need(stat.S_ISDIR(sd.st_mode) and
         sd.st_uid==(0 if is_frozen else 1000) and
         stat.S_IMODE(sd.st_mode)==0o700,"STAGE_OWNER")
    ps=proof_path.lstat()
    proof_allowed=(
        {(0,0,0o400),(0,0,0o600),(1000,1000,0o600)}
        if is_frozen else {(1000,1000,0o600)})
    need(stat.S_ISREG(ps.st_mode) and ps.st_nlink==1
         and not proof_path.is_symlink()
         and (ps.st_uid,ps.st_gid,stat.S_IMODE(ps.st_mode)) in proof_allowed,
         "PROOF_OWNER")
    need(ps.st_size<=16_384,"PROOF_SIZE_LIMIT")
    with opened_stage_member(stage,sd,proof_path.name,ps) as proof_stream:
        proof_bytes=proof_stream.read(16_385)
    need(len(proof_bytes)==ps.st_size and len(proof_bytes)<=16_384,
         "PROOF_SHORT_OR_OVERSIZE")
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
    if is_data:
        helper["layout"](stage,source,proof.get("run_id"),frozen=is_frozen)
        need(sd.st_dev==helper["DATA_DEV"],"DATA_STAGE_DEVICE")
    archive=stage/"runtime.tar.gz"
    st=archive.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_nlink==1
         and not archive.is_symlink()
         and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode)) in proof_allowed,
         "ARCHIVE_OWNER")
    need(type(proof.get("runtime_archive_bytes")) is int and
         0<st.st_size<=5*1024**3 and
         st.st_size==proof["runtime_archive_bytes"],"ARCHIVE_BYTES")
    need(type(proof.get("runtime_archive_sha256")) is str and
         re.fullmatch(r"[0-9a-f]{64}",proof["runtime_archive_sha256"]),
         "ARCHIVE_PROOF_SHA_FORMAT")
    need(type(proof.get("runtime_entries_verified")) is int and
         1000<proof["runtime_entries_verified"]<200000,
         "RUNTIME_ENTRY_COUNT")
    with opened_stage_member(stage,sd,"runtime.tar.gz",st) as archive_stream:
        h=hashlib.sha256()
        for chunk in iter(lambda:archive_stream.read(4*1024*1024),b""):
            h.update(chunk)
        need(h.hexdigest()==proof["runtime_archive_sha256"],
             "ARCHIVE_BYTES_OR_SHA")
        archive_stream.seek(0)
        with tarfile.open(fileobj=archive_stream,mode="r:gz") as tar:
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
    manifest={
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
    # The owner may still replace an initially user-owned DATA stage while
    # service preflights run. Never promote a different directory inode.
    need(stage.lstat().st_ino==sd.st_ino and
         stage.lstat().st_dev==sd.st_dev and
         not stage.is_symlink(),"STAGE_ORIGINAL_INODE_CHANGED_BEFORE_PROMOTION")
    if is_data:
        # Full proof, tar, old runtime, finance and service guards passed.
        # Promote the identical inode on DATA, never copy it to ROOT.
        if is_frozen:
            # Previous native root invocation may have durably sealed the
            # DATA directory before its exact manifest could be written.
            # Resume only if ALL immutable owner/inode/SHA pins still pass.
            inode=helper["resume_checked_stage"](
                stage,source,proof["run_id"],
                archive_sha=proof["runtime_archive_sha256"],
                archive_bytes=proof["runtime_archive_bytes"],
                proof_sha=hashlib.sha256(proof_bytes).hexdigest())
        else:
            inode=helper["freeze_checked_stage"](
                stage,source,proof["run_id"],
                archive_sha=proof["runtime_archive_sha256"],
                archive_bytes=proof["runtime_archive_bytes"],
                proof_sha=hashlib.sha256(proof_bytes).hexdigest())
        manifest.update({
          "schema":"aoe2war.product.web-release-manifest.v3",
          "transport_mode":"data-archive-v1",
          "archive_dev":helper["DATA_DEV"],
          "archive_inode":inode,
        })
    if not TARGET_DIR.exists():TARGET_DIR.mkdir(mode=0o700)
    sd=TARGET_DIR.lstat()
    need(sd.st_uid==0 and stat.S_IMODE(sd.st_mode)==0o700
         and stat.S_ISDIR(sd.st_mode) and not TARGET_DIR.is_symlink(),
         "MANIFEST_OWNER")
    dest=TARGET_DIR/(source[:12]+"-run-"+str(proof["run_id"])+".json")
    raw=(json.dumps(manifest,sort_keys=True,indent=2)+"\n").encode()
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
    # A manifest is NOT a release permit. Do not print a runnable root
    # controller command; the reviewed M1 publisher enforces the T7/T8/T9/T10
    # sequence and exact owner WEBSITE one-use authorization.
    print("MANIFEST_RELEASE_HOLD",
          "USE_REVIEWED_M1_FACTORY_PUBLISHER_NO_DIRECT_CONTROLLER_COMMAND",
          str(dest))

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--proof",required=True)
    options=ap.parse_args()
    try:prepare(options.proof)
    except Exception as e:
        print("HOLD_PRODUCT_MANIFEST",type(e).__name__,str(e))
        sys.exit(3)
