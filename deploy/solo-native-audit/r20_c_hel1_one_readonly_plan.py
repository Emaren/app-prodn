#!/usr/bin/env python3
"""R20 C: owner-run, one-time HEL1 root-helper READ-ONLY PLAN.

Run as HEL1 tony UID1000. Fetches the exact frozen controller PR commit into
an unprivileged temporary checkout, regenerates F's byte-identical 12-module /
14-target bundle, and invokes ONLY mode=plan through a hash-verified root
memory loader. No persistent root helper/launcher/SSH key is installed.
No INSTALL, ROLLBACK, financial write, stage, activation, delete or spending.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import tempfile

HOST = "ubuntu-4gb-hel1-11"
CONTROLLER = "18052e01a191b15525664c1a058de80d7a8bc150"
WEBSITE = "0cee3c836c4b0760478280c145e02e81e470ce0e"
INSTALLER = "9569b449f6905d49ab0cd19e36b5b18dad527d3681b668ee598236c79b794040"
MANIFEST = "874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc"
BUNDLE = "dc316868e684fb7ea430d80c1fedca0a28d3e42b238eafb22cab67aceefc7c74"
INSTALLER_BLOB = "ae10ed7c42202cf572f0ceb41324b91b4c253f31"

# This code runs only as root via sudo and only after the unprivileged source
# archive and manifest have reproduced the independently reviewed hashes.
# It holds a stable O_NOFOLLOW FD, validates SHA-256, and executes verified
# installer bytes via the isolated /usr/bin/python3 -I -B interpreter.
ROOT = r'''
import hashlib, os, pathlib, socket, stat, sys, json
def hold(s):
    print("HOLD:R20C_ROOT:"+s, file=sys.stderr)
    sys.exit(2)
if socket.gethostname()!="ubuntu-4gb-hel1-11" or not sys.platform.startswith("linux"):
    hold("WRONG_HOST")
if os.geteuid()!=0 or os.environ.get("SUDO_UID")!="1000" or os.environ.get("SUDO_USER")!="tony":
    hold("EXPECTED_SUDO_FROM_TONY")
if len(sys.argv)!=4:
    hold("EXPECTED_EXACT_THREE_FILES")
expected=(
    "9569b449f6905d49ab0cd19e36b5b18dad527d3681b668ee598236c79b794040",
    "874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc",
    "dc316868e684fb7ea430d80c1fedca0a28d3e42b238eafb22cab67aceefc7c74")
read=[]
for filename,hashpin,maxlen in zip(sys.argv[1:],expected,(524288,65536,12582912)):
    p=pathlib.Path(filename)
    if not p.is_absolute() or p.is_symlink():hold("INPUT_PATH")
    try:fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    except OSError:hold("INPUT_OPEN")
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0<before.st_size<=maxlen:
            hold("INPUT_TYPE_SIZE")
        raw=os.read(fd,maxlen+1)
        after=os.fstat(fd)
        if len(raw)!=before.st_size or (
            before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(
            after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
            hold("INPUT_CHANGED")
        if hashlib.sha256(raw).hexdigest()!=hashpin:hold("INPUT_SHA256")
        read.append(raw)
    finally:os.close(fd)
try:manifest=json.loads(read[1])
except ValueError:hold("MANIFEST_JSON")
if manifest.get("controller_commit")!="18052e01a191b15525664c1a058de80d7a8bc150":
    hold("CONTROLLER")
if manifest.get("w1_safe_candidate")!="0cee3c836c4b0760478280c145e02e81e470ce0e":
    hold("WEBSITE")
if manifest.get("root_install_authorized") is not False or manifest.get("financial_release_authorized") is not False:
    hold("UNAPPROVED_AUTHORITY")
print("PASS:EXACT_ROOT_LOADER_HASHES; HARD_CODED_PLAN_ONLY",flush=True)
sys.argv=[sys.argv[1],"plan","--manifest",sys.argv[2],"--bundle",sys.argv[3],
          "--controller-sha","18052e01a191b15525664c1a058de80d7a8bc150",
          "--approved-manifest-sha256","874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc"]
exec(compile(read[0],"<R20C_PINNED_PLAN_INSTALLER>","exec"),
     {"__name__":"__main__","__file__":"<R20C_PINNED_PLAN_INSTALLER>"})
'''

def sha(data):
    return hashlib.sha256(data).hexdigest()

def hold(reason):
    print("HOLD:R20C:"+reason, file=sys.stderr, flush=True)
    return 2

def run_cmd(args, seconds=90):
    return subprocess.run(args, capture_output=True, text=True, timeout=seconds,
                          env={k:v for k,v in os.environ.items() if
                               k not in ("PYTHONPATH","PYTHONHOME",
                                         "GIT_CONFIG_GLOBAL","GIT_CONFIG_SYSTEM")})

def main():
    if (not sys.platform.startswith("linux") or socket.gethostname()!=HOST):
        return hold("EXPECTED_EXACT_HEL1_HOST")
    if os.getuid()!=1000 or os.geteuid()!=1000 or os.environ.get("USER")!="tony":
        return hold("EXPECTED_NONROOT_TONY_UID1000")
    if len(sys.argv)!=1:return hold("PLAN_TAKES_NO_ARGUMENTS")
    print("PASS:HOST_UID; REPRODUCING_FINAL_UNPRIVILEGED_ARTIFACT",flush=True)
    with tempfile.TemporaryDirectory(prefix="aoe2war-r20c-plan-only-") as tmp:
        repo=Path(tmp)/"repo";repo.mkdir(mode=0o700)
        out=Path(tmp)/"bundle";out.mkdir(mode=0o700)
        git="/usr/bin/git"
        commands=(
            [git,"init","--quiet",str(repo)],
            [git,"-C",str(repo),"remote","add","origin",
             "https://github.com/Emaren/app-prodn.git"],
            [git,"-C",str(repo),"-c","credential.interactive=never",
             "-c","core.hooksPath=/dev/null","fetch","--quiet","--depth=1",
             "origin","refs/pull/1063/head"],
            [git,"-C",str(repo),"-c","core.hooksPath=/dev/null",
             "checkout","--quiet","--detach","FETCH_HEAD"])
        for args in commands:
            if run_cmd(args).returncode:return hold("GIT_FETCH_OR_CHECKOUT_FAILED")
        head=run_cmd([git,"-C",str(repo),"rev-parse","HEAD"])
        if head.returncode or head.stdout.strip()!=CONTROLLER:
            return hold("FROZEN_CONTROLLER_SHA_MOVED")
        installer=repo/"scripts/aoe2_solo_root_install_v2.py"
        src=installer.read_bytes()
        blob=hashlib.sha1(b"blob "+str(len(src)).encode()+b"\0"+src).hexdigest()
        if sha(src)!=INSTALLER or blob!=INSTALLER_BLOB:
            return hold("INSTALLER_SOURCE_CHANGED")
        b=run_cmd(["/usr/bin/python3","-I","-B",str(installer),"build",
                   "--repo",str(repo),"--controller-sha",CONTROLLER,
                   "--output-dir",str(out)])
        if b.returncode:return hold("NONROOT_SOURCE_BUNDLE_BUILD_FAILED")
        mf=out/"root-helpers-v2.manifest.json"
        bd=out/"root-helpers-v2.tar.gz"
        if sha(mf.read_bytes())!=MANIFEST or sha(bd.read_bytes())!=BUNDLE:
            return hold("F_C_APPROVED_ARCHIVE_MANIFEST_SHA_MISMATCH")
        obj=json.loads(mf.read_bytes())
        if (obj.get("w1_safe_candidate")!=WEBSITE or
            obj.get("controller_commit")!=CONTROLLER or
            obj.get("root_install_authorized") is not False or
            obj.get("financial_release_authorized") is not False or
            len(obj.get("source_git_blobs",{}))!=12 or
            len(obj.get("targets_sha256",{}))!=14):
            return hold("MANIFEST_AUTHORITY_OR_SCOPE_DRIFT")
        print("PASS:12_MODULE_14_TARGET_EXACT_F_C_SOURCE_ONLY_ARTIFACT",flush=True)
        print("ROOT_INLINE_LOADER_SHA256="+sha(ROOT.encode()),flush=True)
        cmd=["/usr/bin/sudo","-n","/usr/bin/python3","-I","-B","-c",ROOT,
             str(installer),str(mf),str(bd)]
        try:r=run_cmd(cmd,seconds=50)
        except FileNotFoundError:return hold("SUDO_UNAVAILABLE")
        except subprocess.TimeoutExpired:return hold("ROOT_PLAN_TIMED_OUT")
        if r.stdout:print(r.stdout.rstrip(),flush=True)
        if r.stderr:print(r.stderr.rstrip(),file=sys.stderr,flush=True)
        if r.returncode:return hold("READONLY_ROOT_PLAN_DENIED_OR_FAILED")
        if "REVIEWED_SOURCE_ONLY_PLAN_NOT_AUTHORIZED" not in r.stdout:
            return hold("NO_NATIVE_PLAN_PROOF")
        print("PASS:NATIVE_READONLY_ROOT_PLAN; NO_INSTALL_OR_PHASE_AUTHORITY",
              flush=True)
        return 0

if __name__=="__main__":
    try:sys.exit(main())
    except (OSError,ValueError,subprocess.SubprocessError) as e:
        sys.exit(hold(type(e).__name__+":"+str(e)[:160]))
