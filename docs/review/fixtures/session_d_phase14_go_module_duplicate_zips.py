#!/usr/bin/env python3
"""Phase 14: exact Go module download ZIP duplicate cleanup, fail closed.

Never removes the module source tree, *.mod, *.info, ziphash, VCS, build cache,
or any other file. A ZIP is eligible only if each archived regular-file byte
matches its already-unpacked $HOME/go/pkg/mod counterpart. Default: dry-run.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import zipfile

HOME = Path.home()
MOD = HOME / "go" / "pkg" / "mod"
DOWNLOAD = MOD / "cache" / "download"
DATA = Path("/System/Volumes/Data")
RECEIPTS = HOME / "projects" / "AoE2HDBets" / "app-prodn" / ".aoe2war-release" / "storage-local-receipts"
MAX_ZIPS = 1500
MAX_BYTES = 3 * 1024**3
MAX_UNCOMPRESSED_PER_ZIP = 2 * 1024**3
MAX_UNCOMPRESSED_TOTAL = 16 * 1024**3
MIN_RECLAIM_KIB = 10240


class Hold(Exception):
    pass


def run(args, timeout=35):
    try:
        return subprocess.run(args, text=True, capture_output=True,
                              check=False, timeout=timeout,
                              env={**os.environ, "PYTHONDONTWRITEBYTECODE":"1",
                                   "GIT_OPTIONAL_LOCKS":"0"})
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Hold("COMMAND_UNAVAILABLE") from e


def checked_stat(p, kind):
    try:
        s = p.lstat()
    except OSError as e:
        raise Hold("MISSING_OR_UNREADABLE_PATH") from e
    if kind == "dir" and not stat.S_ISDIR(s.st_mode):
        raise Hold("NOT_ORDINARY_DIRECTORY")
    if kind == "file" and not stat.S_ISREG(s.st_mode):
        raise Hold("NOT_ORDINARY_FILE")
    return s


def validate_paths():
    for p in (HOME, HOME/"go", HOME/"go/pkg", MOD, MOD/"cache", DOWNLOAD):
        checked_stat(p, "dir")
    if MOD.stat().st_dev != DOWNLOAD.stat().st_dev:
        raise Hold("CROSS_DEVICE_CACHE")
    return MOD.stat().st_dev


def verify_go_env():
    p = run(["go", "env", "-json", "GOMODCACHE", "GOPROXY",
             "GOPRIVATE", "GONOSUMDB", "GONOPROXY"], 25)
    if p.returncode:
        raise Hold("GO_ENV_UNAVAILABLE")
    try:
        env = json.loads(p.stdout)
    except ValueError as e:
        raise Hold("INVALID_GO_ENV") from e
    if env.get("GOMODCACHE") != str(MOD):
        raise Hold("GO_MODULE_CACHE_LOCATION_MISMATCH")
    if any(env.get(k) for k in ("GOPRIVATE", "GONOSUMDB", "GONOPROXY")):
        raise Hold("PRIVATE_MODULE_OR_SUMDB_POLICY")
    proxy = env.get("GOPROXY", "")
    if not proxy.startswith("https://proxy.golang.org"):
        raise Hold("UNQUALIFIED_GO_MODULE_PROXY")
    return {"gomodcache_match": True, "public_go_proxy": True,
            "private_module_policy_empty": True}


def df():
    p = run(["/bin/df", "-k", str(DATA)], 15)
    fields = p.stdout.strip().splitlines()[-1].split() if p.returncode == 0 else []
    if len(fields) < 6 or fields[0] != "/dev/disk3s5" or not fields[3].isdigit():
        raise Hold("APFS_DF_NOT_QUALIFIED")
    return {"device": fields[0], "available_kib": int(fields[3]),
            "used_kib": int(fields[2])}


def no_open_archive_readers():
    p = run(["/usr/sbin/lsof", "-nP", "-Fpn"], 75)
    if p.returncode or p.stderr.strip():
        raise Hold("CANNOT_VERIFY_FILE_CONSUMERS")
    root = str(DOWNLOAD) + os.sep
    if any(line.startswith("n") and line[1:].startswith(root)
           for line in p.stdout.splitlines()):
        raise Hold("GO_DOWNLOAD_CACHE_ACTIVE_OPEN_FILE")
    # The in-flight tools may not have opened archives yet; keep a bounded
    # process-level check as an additional conservative gate.
    q = run(["/bin/ps", "-axo", "comm"], 15)
    if q.returncode:
        raise Hold("PROCESS_CENSUS_UNAVAILABLE")
    names = [Path(line.strip()).name for line in q.stdout.splitlines()[1:]]
    if any(re.fullmatch(r"(go|compile|link|gopls|git|git-remote-https)", n) for n in names):
        raise Hold("ACTIVE_GO_OR_GIT_PROCESS")


def candidates():
    """Never descend symlink directories or touch non-ZIP / unknown structures."""
    eligible = []
    total = 0
    count = 0
    for parent, dirs, files in os.walk(DOWNLOAD, topdown=True, followlinks=False):
        here = Path(parent)
        checked_stat(here, "dir")
        for d in dirs:
            checked_stat(here/d, "dir")
        for name in files:
            path = here/name
            s = checked_stat(path, "file")
            if s.st_dev != MOD.stat().st_dev:
                raise Hold("CROSS_DEVICE_FILE")
            if not name.endswith(".zip"):
                continue
            count += 1
            if count > MAX_ZIPS:
                raise Hold("ZIP_COUNT_LIMIT")
            if s.st_size > MAX_BYTES or total + s.st_size > MAX_BYTES:
                raise Hold("ZIP_BYTES_LIMIT")
            total += s.st_size
            if s.st_size == 0:
                raise Hold("EMPTY_ZIP_FILE")
            eligible.append((path,s))
    return eligible


def zipped_source_duplicate(path, archive_stat):
    """Verify every Zip regular-file body equals the extracted module source."""
    relative = path.relative_to(DOWNLOAD)
    if len(relative.parts) < 3 or relative.parts[-2] != "@v":
        raise Hold("UNEXPECTED_MODULE_ZIP_PATH")
    version = relative.name[:-4]
    if not version or "/" in version or version in (".",".."):
        raise Hold("INVALID_MODULE_VERSION")
    module_parts = relative.parts[:-2]
    root_name = "/".join(module_parts) + "@" + version
    extracted = MOD.joinpath(*module_parts[:-1], module_parts[-1]+"@"+version)
    node=extracted
    while node != MOD:
        checked_stat(node, "dir")
        node=node.parent
    expected_prefix = root_name + "/"
    file_count = 0
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if not infos or len(infos) > 120000:
            raise Hold("ZIP_MEMBER_COUNT_LIMIT")
        decompressed = 0
        for item in infos:
            member = item.filename
            if not member.startswith(expected_prefix):
                raise Hold("ZIP_OUTSIDE_EXPECTED_MODULE")
            leaf = member[len(expected_prefix):]
            if not leaf and item.is_dir():
                continue
            pieces = PurePosixPath(leaf).parts
            if (str(PurePosixPath(leaf)) != leaf.rstrip("/")
                or any(p in (".", "..", "") for p in pieces)):
                raise Hold("NONCANONICAL_ZIP_MEMBER_PATH")
            if not pieces:
                if item.is_dir():
                    continue
                raise Hold("INVALID_ZIP_MEMBER")
            dest = extracted.joinpath(*pieces)
            if dest != extracted and extracted not in dest.parents:
                raise Hold("ZIP_MEMBER_PATH_ESCAPE")
            for ancestor in dest.parents:
                if ancestor == extracted:
                    break
                checked_stat(ancestor, "dir")
            if item.is_dir():
                checked_stat(dest, "dir")
                continue
            mode = (item.external_attr >> 16) & 0o170000
            if mode and mode != stat.S_IFREG:
                raise Hold("SYMLINK_OR_SPECIAL_ZIP_MEMBER")
            actual = checked_stat(dest, "file")
            if actual.st_size != item.file_size:
                raise Hold("EXTRACTED_FILE_SIZE_MISMATCH")
            decompressed += item.file_size
            if decompressed > MAX_UNCOMPRESSED_PER_ZIP:
                raise Hold("ZIP_EXPANSION_BOUND")
            file_count += 1
            with archive.open(item, "r") as a, dest.open("rb") as b:
                while True:
                    chunk = a.read(1024*1024)
                    if chunk != b.read(len(chunk)):
                        raise Hold("ZIP_SOURCE_FILE_BYTES_DIFFER")
                    if not chunk:
                        break
        if file_count == 0:
            raise Hold("ZIP_NO_SOURCE_FILES")
    if path.lstat().st_ino != archive_stat.st_ino or path.lstat().st_size != archive_stat.st_size:
        raise Hold("ZIP_CHANGED_DURING_PROOF")
    return file_count


def hash_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(1024*1024),b""):
            h.update(part)
    return h.hexdigest()


def receipt(data):
    checked_stat(RECEIPTS.parent, "dir")
    if RECEIPTS.is_symlink():
        raise Hold("RECEIPT_ROOT_SYMLINK")
    RECEIPTS.mkdir(parents=False, exist_ok=True, mode=0o700)
    timestamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    file=RECEIPTS/("phase14-go-verified-duplicate-zips-"+timestamp+".json")
    encoded=(json.dumps(data,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
    with os.fdopen(fd,"wb") as w:
        w.write(encoded)
        w.flush()
        os.fsync(w.fileno())
    os.chmod(file,0o444)
    return str(file), hashlib.sha256(encoded).hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    print("TARGET_CLASS: VERIFIED_DUPLICATE_GO_MODULE_DOWNLOAD_ZIPS_ONLY")
    print("PROTECT: unpacked modules, Codex, financial, recovery, worktrees, user media")
    try:
        validate_paths()
        env=verify_go_env()
        all_zips=candidates()
        no_open_archive_readers()
        approved=[]
        disqualified={}
        expanded_total=0
        for path, s in all_zips:
            try:
                with zipfile.ZipFile(path) as archive:
                    members=archive.infolist()
                    if len(members)>120000:
                        raise Hold("ZIP_MEMBER_COUNT_LIMIT")
                    expanded=sum(item.file_size for item in members)
                if (expanded>MAX_UNCOMPRESSED_PER_ZIP or
                    expanded_total+expanded>MAX_UNCOMPRESSED_TOTAL):
                    raise Hold("TOTAL_ZIP_EXPANSION_BOUND")
                source_count=zipped_source_duplicate(path,s)
                expanded_total+=expanded
            except (Hold, zipfile.BadZipFile, OSError) as exc:
                key=(str(exc) if isinstance(exc,Hold)
                     else "BAD_OR_UNREADABLE_MODULE_ZIP")
                disqualified[key]=disqualified.get(key,0)+1
                continue
            approved.append({"path":path,"dev":s.st_dev,"ino":s.st_ino,
                "size":s.st_size,"mtime_ns":s.st_mtime_ns,
                "allocated_bytes":s.st_blocks*512,
                "sha256":hash_file(path),"source_count":source_count})
        total=sum(x["size"] for x in approved)
        before=df()
        print("GO_MODULE_ZIP_COUNT:",len(approved))
        print("NONQUALIFYING_ZIP_COUNTS:",json.dumps(disqualified,sort_keys=True))
        print("DUPLICATE_ZIP_LOGICAL_BYTES:",total)
        print("DUPLICATE_ZIP_ALLOCATED_BYTES:",sum(x["allocated_bytes"] for x in approved))
        print("DF_BEFORE_AVAILABLE_KIB:",before["available_kib"])
        if not args.apply:
            print("PREVIEW_ONLY: no deletion. Apply requires independently reviewed source and exact guards.")
            return 0
        if total//1024 < MIN_RECLAIM_KIB:
            raise Hold("INSUFFICIENT_VERIFIED_DUPLICATE_ZIP_BYTES")
        no_open_archive_readers()
        if candidates() != all_zips:
            raise Hold("ZIP_CANDIDATE_SET_CHANGED")
        for entry in approved:
            p=entry["path"]
            s=checked_stat(p,"file")
            if ((s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns) !=
                (entry["dev"],entry["ino"],entry["size"],entry["mtime_ns"])):
                raise Hold("ZIP_CHANGED_PRE_REMOVE")
            if hash_file(p)!=entry["sha256"]:
                raise Hold("ZIP_DIGEST_CHANGED_PRE_REMOVE")
            zipped_source_duplicate(p,s)
        before=df()
        # Seal the complete intended target list before any unlink. This is
        # an intent witness, never proof that a deletion actually occurred.
        intent, intent_sha=receipt({
            "schema":1,"kind":"phase14-go-zip-pre-delete-intent",
            "status":"INTENT_ONLY_NO_DELETION_CLAIM",
            "source_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "data_before":before,
            "nonqualifying_zip_counts":disqualified,
            "candidate_verified_zip_files":[{
                "relative_to_go_modcache":str(entry["path"].relative_to(MOD)),
                "sha256":entry["sha256"],"logical_bytes":entry["size"],
                "allocated_bytes":entry["allocated_bytes"]
            } for entry in approved],
        })
        print("INTENT_RECEIPT:",intent)
        print("INTENT_SHA256:",intent_sha)
        deleted=[]
        # Exact file unlink only. Never removes any module directory or metadata.
        for entry in approved:
            p=entry["path"]
            s=checked_stat(p,"file")
            if (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)!=(
                entry["dev"],entry["ino"],entry["size"],entry["mtime_ns"]):
                raise Hold("ZIP_CHANGED_DURING_REMOVE")
            fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:
                current=os.stat(p.name,dir_fd=fd,follow_symlinks=False)
                if ((current.st_dev,current.st_ino,current.st_size,current.st_mtime_ns)
                    !=(entry["dev"],entry["ino"],entry["size"],entry["mtime_ns"])):
                    raise Hold("ZIP_CHANGED_AT_UNLINK")
                if not stat.S_ISREG(current.st_mode):
                    raise Hold("ZIP_NOT_ORDINARY_AT_UNLINK")
                os.unlink(p.name,dir_fd=fd)
            finally:
                os.close(fd)
            deleted.append({"relative_to_go_modcache":str(p.relative_to(MOD)),
                "file_size_bytes":entry["size"],
                "allocated_bytes_before":entry["allocated_bytes"],
                "source_file_count":entry["source_count"],
                "zip_sha256":entry["sha256"]})
        after=df()
        record={"schema":1,"kind":"aoe2war-phase14-go-duplicate-zip-cleanup",
          "created_at":datetime.now(timezone.utc).isoformat(),
          "scope":"verified zip duplicates under exact Go download cache only",
          "go_config_guard":env,"source_modcache":str(MOD),
          "source_script_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          "pre_delete_intent_receipt":intent,
          "pre_delete_intent_sha256":intent_sha,
          "not_verified_zip_counts":disqualified,
          "removed_files":deleted,
          "removed_logical_zip_bytes":sum(v["file_size_bytes"] for v in deleted),
          "removed_allocated_zip_bytes_before":sum(v["allocated_bytes_before"] for v in deleted),
          "data_before":before,"data_after":after,
          "net_ordinary_free_delta_kib":after["available_kib"]-before["available_kib"],
          "external_apfs_vm_activity_can_change_net_free":True,
          "unpacked_go_module_source_preserved":True,
          "codex_runtime_and_other_protected_paths_unchanged_by_this_script":True}
        dest,sha=receipt(record)
        print("REMOVED_VERIFIED_ZIP_FILES:",len(deleted))
        print("REMOVED_LOGICAL_BYTES:",record["removed_logical_zip_bytes"])
        print("DF_AFTER_AVAILABLE_KIB:",after["available_kib"])
        print("NET_AVAILABLE_DELTA_KIB:",record["net_ordinary_free_delta_kib"])
        print("RECEIPT:",dest)
        print("RECEIPT_SHA256:",sha)
        return 0
    except (Hold, zipfile.BadZipFile, OSError) as e:
        reason=str(e) if isinstance(e,Hold) else "UNREADABLE_OR_BAD_ZIP"
        print("HOLD:",reason)
        print("NO_FURTHER_REMOVAL_AUTHORIZED")
        return 2


if __name__=="__main__":
    sys.exit(main())
