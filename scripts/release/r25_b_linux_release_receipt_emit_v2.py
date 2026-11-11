#!/usr/bin/env python3
"""Emit Linux-only CI build receipt from inspected real runtime.tar.gz bytes.

Never builds, deploys, reads credentials, or starts a listener. Only writes an
additional receipt next to the EXISTING genuine Python CI artifact exporter.
Not a self-signed authorization; B independently verifies the GitHub run/job.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import stat
import subprocess
import sys

HEX40=re.compile(r"[a-f0-9]{40}\Z")
HEX64=re.compile(r"[a-f0-9]{64}\Z")
FEATURES=sorted({
 "kingdom_menu_original_order","managed_portrait_bytes",
 "canonical_traffic_131_points","featured_warriors_rotation",
 "authenticated_admin","authenticated_nonadmin","api_failclosed",
 "steam_session_no_new_registration",
})
class Hold(ValueError):pass
def need(x,t):
    if not x: raise Hold("HOLD:LINUX_RELEASE_RECEIPT_"+t)
def cmd(*argv):
    p=subprocess.run(argv,capture_output=True,text=True,timeout=8,check=True)
    return p.stdout.strip()
def filehash(path:Path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for buf in iter(lambda:f.read(1024*1024),b""):h.update(buf)
    return h.hexdigest()
def canonical(obj):
    return (json.dumps(obj,sort_keys=True,separators=(",",":"))+"\n").encode()

def generate(export_dir:Path, *, evidence:dict, source_commit:str,
             source_tree:str, lockfile_sha:str,
             archive_sha:str, archive_bytes:int):
    need(type(evidence) is dict and evidence.get("GITHUB_ACTIONS")=="true"
         and evidence.get("CI")=="true"
         and evidence.get("RUNNER_OS")=="Linux"
         and evidence.get("RUNNER_ARCH")=="X64"
         and evidence.get("AOE2WAR_CI_INSTALL_PASSED")=="true"
         and evidence.get("AOE2WAR_CI_BUILD_PASSED")=="true",
         "NO_TRUSTED_CI_BUILD_PROVENANCE")
    need(platform.system()=="Linux" and platform.machine()=="x86_64",
         "NOT_PHYSICAL_LINUX_X86_64")
    need(cmd("node","--version")=="v22.22.0","NOT_PINNED_NODE22")
    need(type(source_commit) is str and HEX40.fullmatch(source_commit)
         and type(source_tree) is str and HEX40.fullmatch(source_tree)
         and type(lockfile_sha) is str and HEX64.fullmatch(lockfile_sha)
         and source_commit==evidence.get("AOE2WAR_ARTIFACT_SOURCE_SHA"),
         "SOURCE_NOT_PR_EXACT_HEAD")
    receipt_path=export_dir/"artifact.json"
    archive_path=export_dir/"runtime.tar.gz"
    need(export_dir.is_dir() and not export_dir.is_symlink(),
         "NO_EXPORTED_ARTIFACT")
    for path in (receipt_path,archive_path):
        st=path.lstat()
        need(stat.S_ISREG(st.st_mode) and st.st_nlink==1
             and not st.st_mode & 0o022,"EXPORTED_FILE_UNTRUSTED")
    receipt=json.loads(receipt_path.read_bytes())
    need(receipt.get("schema")=="aoe2war.runtime-artifact.v1"
         and receipt.get("source_sha")==source_commit
         and receipt.get("node_version")=="v22.22.0"
         and receipt.get("machine")=="x86_64"
         and receipt.get("readonly_backend_upstream")=="http://127.0.0.1:3331",
         "EXPORTED_RUNTIME_META")
    need(receipt.get("sha256")==archive_sha and filehash(archive_path)==archive_sha
         and receipt.get("bytes")==archive_bytes
         and archive_path.stat().st_size==archive_bytes
         and archive_bytes>0,"ARCHIVE_STREAM_DRIFT")
    run=evidence.get("GITHUB_RUN_ID")
    need(type(run) is str and run.isdecimal() and int(run)>0,
         "RUN_ID_REQUIRED")
    manifest=receipt.get("manifest_sha256")
    need(type(manifest) is str and HEX64.fullmatch(manifest),
         "MANIFEST_PIN")
    return {
      "schema":"aoe2war.b.linux-x86_64-node22-release-build.v2",
      "repo":"Emaren/app-prodn",
      "source_commit":source_commit,
      "source_tree":source_tree,
      "lockfile_sha256":lockfile_sha,
      "builder":"github-actions-ubuntu-24.04",
      "os":"linux","arch":"x86_64","node":"v22.22.0",
      "npm_ci":True,"production_build":True,
      "run_id":int(run),
      "runtime_archive":{"name":"runtime.tar.gz",
                         "sha256":archive_sha,"bytes":archive_bytes},
      "runtime_manifest_sha256":manifest,
      "build_id":receipt["build_id"],
      "acceptance_features":FEATURES,
      "private_keys_embedded":False,
      "finance_db_credentials_present":False,
      "financial_write_capability":False,
      "target_3032":True,
      "release_install_authorized":False,
      "c_dev_uid650_receipt_not_inferred":True,
    }

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--ci-export-dir",required=True)
    args=p.parse_args(argv)
    path=Path(args.ci_export_dir).resolve()
    evidence=dict(os.environ)
    need(evidence.get("AOE2_BACKEND_UPSTREAM")=="http://127.0.0.1:3331",
         "READONLY_UPSTREAM_NOT_PINNED")
    source=cmd("git","rev-parse","HEAD")
    tree=cmd("git","rev-parse","HEAD^{tree}")
    need(source==evidence.get("AOE2WAR_ARTIFACT_SOURCE_SHA"),
         "GIT_REF_NOT_EXACT_PR_HEAD")
    lock=Path("package-lock.json")
    need(lock.is_file(),"LOCKFILE_REQUIRED")
    archive=path/"runtime.tar.gz"
    result=generate(
        path,evidence=evidence,source_commit=source,source_tree=tree,
        lockfile_sha=filehash(lock),archive_sha=filehash(archive),
        archive_bytes=archive.stat().st_size)
    dest=path/"b-linux-release-receipt-v2.json"
    fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(canonical(result));f.flush();os.fsync(f.fileno())
    finally:
        pass
    print(json.dumps({k:result[k] for k in ("source_commit","source_tree",
        "build_id","run_id")},sort_keys=True))
    return 0
if __name__=="__main__":
    try:sys.exit(main())
    except Exception as ex:
        print("HOLD:LINUX_RECEIPT_REFUSED:"+type(ex).__name__,file=sys.stderr)
        sys.exit(3)
