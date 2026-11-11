#!/usr/bin/env python3
"""Independent B consumer for GitHub-produced Linux runtime artifact.

Read-only verification in a distinct GitHub runner with exact source checkout.
Does NOT create a privileged root stage, sign an owner permit, or prove UID650.
Requires provenance from the GitHub API and fresh downloaded original bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import platform
import posixpath
import re
import stat
import subprocess
import sys
import tarfile

SCHEMA="aoe2war.b.independent-linux-runtime-byte-review.v2"
SOURCE_SCHEMA="aoe2war.b.linux-x86_64-node22-release-build.v2"
RUNTIME_SCHEMA="aoe2war.runtime-artifact.v1"
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
FILES=("artifact.json","b-linux-release-receipt-v2.json","runtime.tar.gz")
MAX_MANIFEST=32*1024*1024

class Hold(ValueError):pass
def need(value, label):
    if not value:raise Hold("HOLD:B_LINUX_INDEPENDENT_"+label)
def sha(blob):return hashlib.sha256(blob).hexdigest()
def digest(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()
def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),
                      ensure_ascii=True,allow_nan=False).encode()
def read_json(path,limit=128*1024):
    need(path.stat().st_size<=limit,"JSON_OVERSIZED")
    return json.loads(path.read_bytes())
def row_from_tar(member,tf):
    name=member.name
    path=pathlib.PurePosixPath(name)
    need(name and not path.is_absolute() and
         ".." not in path.parts and not name.startswith("./"),
         "ARCHIVE_PATH_ESCAPE")
    need(".git" not in path.parts and
         (not path.name.startswith(".env") or name==".env.production.example"),
         "PRIVATE_SOURCE_OR_ENV_FILE_IN_RUNTIME")
    row={"path":name,"mode":member.mode & 0o7777}
    need(member.uid==0 and member.gid==0,"ARCHIVE_EXPECTED_ROOT_METADATA")
    if member.isfile():
        h=hashlib.sha256()
        stream=tf.extractfile(member)
        need(stream is not None,"ARCHIVE_UNREADABLE_MEMBER")
        total=0
        with stream:
            for chunk in iter(lambda:stream.read(1024*1024),b""):
                total+=len(chunk);h.update(chunk)
        need(total==member.size,"ARCHIVE_MEMBER_SIZE")
        row.update(type="file",size=total,sha256=h.hexdigest())
    elif member.issym():
        link=member.linkname
        need(not posixpath.isabs(link) and
             not posixpath.normpath(posixpath.join(posixpath.dirname(name),link)).startswith("../"),
             "ARCHIVE_SYMLINK_ESCAPE")
        row.update(type="symlink",target=link)
    else:
        raise Hold("HOLD:B_LINUX_INDEPENDENT_SPECIAL_ARCHIVE_MEMBER")
    return row

def verify(directory, *, head_sha, git_tree, lockfile_sha, run_id,
           artifact_api, os_name, arch):
    need(type(head_sha) is str and HEX40.fullmatch(head_sha)
         and type(git_tree) is str and HEX40.fullmatch(git_tree)
         and type(lockfile_sha) is str and HEX64.fullmatch(lockfile_sha)
         and type(run_id) is int and run_id>0,
         "SOURCE_PIN")
    need(os_name=="Linux" and arch=="X64","REVIEWER_NOT_NATIVE_LINUX_X64")
    root=pathlib.Path(directory)
    st=root.lstat()
    need(stat.S_ISDIR(st.st_mode) and not root.is_symlink(),"DOWNLOAD_DIRECTORY")
    for name in FILES:
        path=root/name
        st=path.lstat()
        need(stat.S_ISREG(st.st_mode) and st.st_nlink==1
             and not st.st_mode&0o022,"DOWNLOADED_FILE_NOT_REGULAR")
    a=read_json(root/"artifact.json")
    b=read_json(root/"b-linux-release-receipt-v2.json")
    need(type(artifact_api) is dict and
         type(artifact_api.get("artifacts")) is list,
         "GITHUB_API_ARTIFACT_LIST")
    expected_name=f"b-linux-source-pinned-release-{run_id}"
    found=[item for item in artifact_api["artifacts"]
           if type(item) is dict and item.get("name")==expected_name]
    need(len(found)==1,"GITHUB_API_ARTIFACT_EXACT_NAME")
    meta=found[0];ref=meta.get("workflow_run")
    need(meta.get("expired") is False and
         type(meta.get("id")) is int and meta["id"]>0 and
         type(meta.get("size_in_bytes")) is int and meta["size_in_bytes"]>0
         and type(ref) is dict and ref.get("id")==run_id and
         ref.get("head_sha")==head_sha and
         type(meta.get("digest")) is str and
         re.fullmatch("sha256:[0-9a-f]{64}",meta["digest"]),
         "GITHUB_API_ZIP_DIGEST_RUN_SOURCE")
    need(a.get("schema")==RUNTIME_SCHEMA
         and b.get("schema")==SOURCE_SCHEMA
         and b.get("repo")=="Emaren/app-prodn"
         and a.get("source_sha")==b.get("source_commit")==head_sha
         and b.get("source_tree")==git_tree
         and b.get("lockfile_sha256")==lockfile_sha
         and b.get("run_id")==run_id,
         "SOURCE_TREE_LOCK_RUN_DRIFT")
    need(a.get("node_version")==b.get("node")=="v22.22.0"
         and a.get("machine")==b.get("arch")=="x86_64"
         and b.get("os")=="linux"
         and b.get("builder")=="github-actions-ubuntu-24.04"
         and b.get("locked_dependency_install")=="yarn-frozen-lockfile"
         and b.get("lockfile_name")=="yarn.lock"
         and b.get("production_build") is True,
         "RELEASE_LINUX_ABI_BUILDER")
    archv=b.get("runtime_archive")
    path=root/"runtime.tar.gz"
    real_size=path.stat().st_size
    real_hash=digest(path)
    need(type(archv) is dict and archv.get("name")=="runtime.tar.gz"
         and archv.get("bytes")==a.get("bytes")==real_size
         and archv.get("sha256")==a.get("sha256")==real_hash,
         "STREAMED_INNER_RUNTIME_SHA_SIZE")
    need(a.get("build_id")==b.get("build_id")
         and type(b.get("build_id")) is str
         and re.fullmatch(r"[a-zA-Z0-9_-]{8,64}",b["build_id"])
         and a.get("manifest_sha256")==b.get("runtime_manifest_sha256")
         and a.get("readonly_backend_upstream")=="http://127.0.0.1:3331"
         and b.get("target_3032") is True
         and b.get("release_install_authorized") is False
         and b.get("financial_write_capability") is False
         and b.get("finance_db_credentials_present") is False
         and b.get("private_keys_embedded") is False
         and b.get("c_dev_uid650_receipt_not_inferred") is True,
         "RUNTIME_BUILD_CLAIMS_SCOPE")
    observed=[];manifest_raw=None;sha_source=None
    with tarfile.open(path,"r:gz") as tf:
        for member in tf:
            if member.name in (".aoe2war-runtime-manifest.json",
                               ".aoe2war-source-sha"):
                need(member.isfile() and 0<=member.size<=MAX_MANIFEST,
                     "ARCHIVE_CONTROL_FILE")
                stream=tf.extractfile(member)
                need(stream is not None,"ARCHIVE_CONTROL_READ")
                with stream: raw=stream.read(MAX_MANIFEST+1)
                need(len(raw)==member.size,"ARCHIVE_CONTROL_EXACT_SIZE")
                if member.name==".aoe2war-runtime-manifest.json":
                    need(manifest_raw is None,"DUPLICATE_RUNTIME_MANIFEST")
                    manifest_raw=raw
                else:
                    need(sha_source is None,"DUPLICATE_SOURCE_SHA")
                    sha_source=raw
                continue
            observed.append(row_from_tar(member,tf))
    need(manifest_raw is not None and sha_source==(head_sha+"\n").encode(),
         "INNER_SOURCE_SHA")
    need(sha(manifest_raw)==a["manifest_sha256"],"INNER_MANIFEST_SHA")
    manifest=json.loads(manifest_raw)
    need(manifest.get("schema")==RUNTIME_SCHEMA
         and manifest.get("source_sha")==head_sha
         and manifest.get("build_id")==a["build_id"]
         and manifest.get("build_version")==a.get("build_version")
         and manifest.get("node_version")==a["node_version"]
         and manifest.get("machine")==a["machine"]
         and manifest.get("readonly_backend_upstream")==a["readonly_backend_upstream"]
         and type(manifest.get("rows")) is list
         and observed==manifest["rows"]
         and manifest.get("files")==a.get("files")==len(observed)
         and manifest.get("tree_sha256")==a.get("tree_sha256")==
              sha(canonical(observed)),
         "INNER_RUNTIME_CONTENT_MANIFEST_DRIFT")
    return {
        "schema":SCHEMA,
        "status":"PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER",
        "source_commit":head_sha,"source_tree":git_tree,
        "lockfile_sha256":lockfile_sha,"run_id":run_id,
        "github_artifact_id":meta["id"],
        "github_artifact_zip_sha256":meta["digest"][7:],
        "github_artifact_zip_bytes":meta["size_in_bytes"],
        "zip_attestation_method":"GitHub API digest plus actions/download-artifact verification",
        "runtime_archive_sha256":real_hash,"runtime_archive_bytes":real_size,
        "runtime_manifest_sha256":a["manifest_sha256"],
        "runtime_tree_sha256":a["tree_sha256"],
        "build_id":a["build_id"],"runtime_entries_verified":len(observed),
        "os":"linux","arch":"x86_64","node":"v22.22.0",
        "root_stage_authorized":False,"c_uid650_physically_attested":False,
        "public_3032_activation_authorized":False,
        "financial_authorized":False,
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--artifact-dir",required=True)
    p.add_argument("--github-api-artifacts-json",required=True)
    p.add_argument("--output",required=True)
    args=p.parse_args()
    need(os.environ.get("GITHUB_ACTIONS")=="true" and
         os.environ.get("CI")=="true"
         and os.environ.get("RUNNER_OS")=="Linux"
         and os.environ.get("RUNNER_ARCH")=="X64"
         and platform.system()=="Linux" and platform.machine()=="x86_64",
         "NOT_REAL_GITHUB_LINUX_X64_RUNNER")
    source=subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()
    tree=subprocess.check_output(["git","rev-parse","HEAD^{tree}"],text=True).strip()
    need(source==os.environ.get("AOE2WAR_ARTIFACT_SOURCE_SHA"),
         "HEAD_NOT_EXACT_SOURCE")
    h=hashlib.sha256()
    with open("yarn.lock","rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
    result=verify(args.artifact_dir,head_sha=source,git_tree=tree,
                  lockfile_sha=h.hexdigest(),run_id=int(os.environ.get("GITHUB_RUN_ID","0")),
                  artifact_api=read_json(pathlib.Path(args.github_api_artifacts_json),limit=2*1024*1024),
                  os_name=os.environ.get("RUNNER_OS"),arch=os.environ.get("RUNNER_ARCH"))
    dest=pathlib.Path(args.output)
    fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as output:
        output.write(canonical(result)+b"\n");output.flush();os.fsync(output.fileno())
    print(json.dumps(result,sort_keys=True))
    return 0
if __name__=="__main__":
    try:sys.exit(main())
    except Exception as err:
        print("HOLD:INDEPENDENT_LINUX_RUNTIME_VERIFICATION:"+type(err).__name__,file=sys.stderr)
        sys.exit(3)
