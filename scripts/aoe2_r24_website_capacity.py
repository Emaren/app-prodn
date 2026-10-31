#!/usr/bin/env python3
"""R24 E: read-only two-filesystem website storage and content-verified rollback witness.

Not an RSA signature, release permit, service control, live rollback exercise or
financial authority. F/C approve and execute separate exact cutover policy.
"""
from __future__ import annotations
import argparse, hashlib, json, os, socket, stat, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

HOST="ubuntu-4gb-hel1-11"
WEB=Path("/var/www/AoE2HDBets/app-prodn")
VOLUME=Path("/mnt/HC_Volume_105319120")
DURABLE=VOLUME/"aoe2war/rollbacks"
W1_SAFE="0cee3c836c4b0760478280c145e02e81e470ce0e"
GIB=1024**3
ROOT_RESERVE=4*GIB
VOLUME_RESERVE=4*GIB
MAX_CANDIDATE_BYTES=8*GIB
MAX_FILES=160000
MAX_VERIFY_BYTES=16*GIB
MAX_VERIFY_SECONDS=180

class Hold(Exception): pass
def require(condition, reason):
    if not condition: raise Hold(reason)

def check_host():
    require(sys.platform=="linux" and socket.gethostname().split(".")[0]==HOST
            and os.geteuid()==1000,"EXPECTED_HEL1_TONY_UID1000")
    require(os.path.ismount(VOLUME) and not VOLUME.is_symlink(),
            "ATTACHED_VOLUME_NOT_MOUNTED")
    require(VOLUME.stat().st_dev!=Path("/").stat().st_dev,
            "ATTACHED_VOLUME_EQUALS_ROOT")
    require(WEB.is_dir() and not WEB.is_symlink(),
            "WEB_CHECKOUT_MISSING_OR_SYMLINK")
    require(WEB.stat().st_dev==Path("/").stat().st_dev,
            "WEB_NOT_ON_ROOT_FILESYSTEM")
    return WEB.stat().st_dev,VOLUME.stat().st_dev

def guard_directory(p,ancestor,dev):
    require(p.is_absolute() and p!=ancestor and p.is_relative_to(ancestor)
            and ".." not in p.parts,
            "PATH_OUTSIDE_APPROVED_ROOT")
    cur=ancestor
    require(stat.S_ISDIR(os.lstat(cur).st_mode),
            "APPROVED_ROOT_NOT_DIRECTORY")
    for part in p.relative_to(ancestor).parts:
        cur=cur/part
        raw=os.lstat(cur)
        require(stat.S_ISDIR(raw.st_mode) and raw.st_dev==dev,
                "DIRECTORY_SYMLINK_OR_DEVICE_MISMATCH")
    return p

def allocated_bytes(path):
    r=subprocess.run(["/usr/bin/du","-s","-B1","--",str(path)],
       capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=25,
       check=False)
    require(r.returncode==0,"DU_FAILED_OR_UNREADABLE")
    left,sep,_=r.stdout.partition("\t")
    require(sep and left.isdecimal(),"DU_RESULT_INVALID")
    return int(left)

def durable_copy_bytes(path):
    """Bound the copy even if sparse files/hardlinks expand on the target."""
    r=subprocess.run(["/usr/bin/du","-s","-B1","--apparent-size","--count-links",
                      "--",str(path)],capture_output=True,text=True,
                     stdin=subprocess.DEVNULL,timeout=25,check=False)
    require(r.returncode==0,"DU_APPARENT_FAILED")
    raw,sep,_=r.stdout.partition("\t")
    require(sep and raw.isdecimal(),"DU_APPARENT_INVALID")
    size=max(allocated_bytes(path),int(raw))
    return size+size//10+512*1024**2

def free_bytes(path):
    v=os.statvfs(path)
    require(v.f_blocks>0 and v.f_bavail>=0,"FS_INVALID")
    return v.f_bavail*v.f_frsize

def build_id(path):
    f=path/"BUILD_ID"
    require(f.is_file() and not f.is_symlink() and f.stat().st_size<=256,
            "NEXT_BUILD_ID_MISSING_OR_UNTRUSTED")
    value=f.read_text().strip()
    require(5<=len(value)<=128 and
            all(c.isalnum() or c in "_-" for c in value),
            "NEXT_BUILD_ID_INVALID")
    return value

def examine(args):
    rootdev,voldev=check_host()
    old=guard_directory(WEB/".next",WEB,rootdev)
    old_id=build_id(old)
    old_bytes=allocated_bytes(old)
    require(0<old_bytes<=16*GIB,"OLD_NEXT_ALLOCATION_UNBOUNDED")
    budget=args.candidate_max_bytes
    require(type(budget) is int and 0<budget<=MAX_CANDIDATE_BYTES,
            "EXACT_CANDIDATE_PEAK_BUDGET_REQUIRED")
    rf=free_bytes(WEB);vf=free_bytes(VOLUME)
    # Old live web stays running, possibly as a financial producer.
    # Budget TWO new candidate footprints and 4GiB root reserve.
    root_needed=2*budget+ROOT_RESERVE
    # New durable old-runtime twin is a physically separate device.
    volume_copy_budget=durable_copy_bytes(old)
    volume_needed=volume_copy_budget+VOLUME_RESERVE
    stage=None
    if args.stage=="post-stage":
        # B R24: old web may host WarGraph settlement. Do not replace it.
        # New runtime must be a separate direct child of WEB.parent.
        candidate=Path(args.parallel_dir)
        require(candidate.is_absolute() and candidate.parent==WEB.parent and
                candidate.name.startswith("app-prodn-r24-w1safe-") and
                candidate!=WEB,"PARALLEL_CANDIDATE_PATH_REQUIRED")
        guard_directory(candidate,WEB.parent,rootdev)
        candidate_next=guard_directory(candidate/".next",WEB.parent,rootdev)
        candidate_bytes=allocated_bytes(candidate)
        require(candidate_bytes<=budget,"PARALLEL_RUNTIME_EXCEEDS_PINNED_BUDGET")
        stage=dict(path=str(candidate),allocated_bytes=candidate_bytes,
                   next_path=str(candidate_next),
                   next_build_id=build_id(candidate_next),
                   legacy_website_must_remain_running=True)
        # Candidate is already allocated at this boundary.
        root_needed=ROOT_RESERVE
    good=(rf>=root_needed and vf>=volume_needed)
    return dict(schema="aoe2war.e.r24.website.storage.v1",phase=args.stage,
      observed_utc=datetime.now(timezone.utc).isoformat(),
      host=HOST,operator_uid=1000,website_candidate_sha_expected=W1_SAFE,
      source_authenticity="NOT_CHECKED_BY_STORAGE_TOOL",
      web_path=str(WEB),root_dev=rootdev,volume_path=str(VOLUME),
      volume_dev=voldev,old_next_build_id=old_id,
      old_next_allocated_bytes=old_bytes,
      prior_next_durable_copy_budget_bytes=volume_copy_budget,
      candidate_build_peak_budget_bytes_owner_or_F_approved=budget,
      root_available_bytes=rf,root_min_needed_bytes=root_needed,
      volume_available_bytes=vf,volume_min_needed_bytes=volume_needed,
      root_reserve_bytes=ROOT_RESERVE,volume_reserve_bytes=VOLUME_RESERVE,
      durable_rollback_parent=str(DURABLE),staged_candidate=stage,
      legacy_web_mainpid_continuity="NOT_VERIFIED_BY_STORAGE_TOOL",
      parallel_financial_worker_disabled="NOT_VERIFIED_BY_STORAGE_TOOL",
      storage_verdict=("PASS_STORAGE_FEASIBILITY_NOT_RELEASE_AUTHORIZATION"
                       if good else "HOLD_STORAGE_FEASIBILITY"),
      rollback_content_verified=False,release_authorized=False,
      release_lock_touched=False,financial_state_touched=False,
      files_modified=False)

def tree_digest(root,dev):
    """Read every real byte with path/type provenance. Refuse symlink rollback."""
    begin=time.monotonic();count=0;logical=0;h=hashlib.sha256()
    pending=[(root,"")]
    while pending:
        require(time.monotonic()-begin<=MAX_VERIFY_SECONDS,
                "VERIFY_TIME_BUDGET")
        directory,rel=pending.pop()
        with os.scandir(directory) as scanned:
            entries=[]
            for entry in scanned:
                require(count+len(entries)<MAX_FILES,"VERIFY_DIRECTORY_ENTRY_BUDGET")
                entries.append(entry)
            entries.sort(key=lambda x:x.name)
        for entry in entries:
            count+=1
            require(count<=MAX_FILES,"VERIFY_FILE_BUDGET")
            raw=entry.stat(follow_symlinks=False)
            require(raw.st_dev==dev,"ROLLBACK_TREE_CROSSES_DEVICE")
            r=(rel+"/"+entry.name).lstrip("/")
            require("\n" not in r and "\0" not in r,
                    "ROLLBACK_PATH_INVALID")
            label=r.encode("utf-8","surrogateescape")
            if stat.S_ISDIR(raw.st_mode):
                h.update(b"D\0"+label+b"\0")
                pending.append((Path(entry.path),r))
            elif stat.S_ISREG(raw.st_mode):
                require(raw.st_nlink==1,
                        "HARDLINKED_ROLLBACK_CONTENT_NOT_SUPPORTED")
                h.update(b"F\0"+label+b"\0"+
                         str(raw.st_size).encode()+b"\0")
                logical+=raw.st_size
                require(logical<=MAX_VERIFY_BYTES,
                        "ROLLBACK_BYTES_BUDGET")
                with open(entry.path,"rb",buffering=0) as f:
                    while True:
                        chunk=f.read(1024*1024)
                        if not chunk:break
                        h.update(chunk)
                after=os.stat(entry.path,follow_symlinks=False)
                require(after.st_size==raw.st_size and
                        after.st_mtime_ns==raw.st_mtime_ns and
                        after.st_ino==raw.st_ino,
                        "ROLLBACK_SOURCE_CHANGED_DURING_READ")
            elif stat.S_ISLNK(raw.st_mode):
                raise Hold("SYMLINK_ROLLBACK_NOT_INDEPENDENT")
            else: raise Hold("SPECIAL_ROLLBACK_FILE_DENIED")
    return dict(sha256=h.hexdigest(),entries=count,
                logical_file_bytes=logical)

def compare_rollback(path_string):
    rootdev,voldev=check_host()
    old=guard_directory(WEB/".next",WEB,rootdev)
    old_id=build_id(old)
    durable=Path(path_string)
    require(durable.is_absolute() and durable!=DURABLE and
            durable.is_relative_to(DURABLE),
            "ROLLBACK_PATH_NOT_UNDER_DURABLE_ROOT")
    guard_directory(durable,VOLUME,voldev)
    require(build_id(durable)==old_id,
            "ROLLBACK_BUILD_ID_MISMATCH")
    a=tree_digest(old,rootdev);b=tree_digest(durable,voldev)
    require(a==b,"ROLLBACK_FULL_CONTENT_MISMATCH")
    return dict(schema="aoe2war.e.r24.website.rollback-content.v1",
      observed_utc=datetime.now(timezone.utc).isoformat(),
      old_live_next=str(old),durable_next=str(durable),
      old_build_id=old_id,old_content=a,durable_content=b,
      status="PASS_DURABLE_COPY_CONTENT_MATCH_NOT_ROLLBACK_EXERCISE",
      web_service_stopped=False,release_lock_touched=False,
      release_authorized=False,finance_touched=False)

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    subs=p.add_subparsers(dest="action",required=True)
    for action in ("plan","post-stage"):
        parser=subs.add_parser(action)
        parser.add_argument("--candidate-max-bytes",type=int,required=True)
        if action=="post-stage":
            parser.add_argument("--parallel-dir",required=True)
    parser=subs.add_parser("verify-durable")
    parser.add_argument("--durable-next",required=True)
    args=p.parse_args(argv)
    try:
        if args.action=="verify-durable":
            result=compare_rollback(args.durable_next)
        else:
            args.stage=args.action
            result=examine(args)
        print(json.dumps(result,sort_keys=True))
        return 0 if result.get("storage_verdict","PASS").startswith("PASS") else 2
    except (Hold,FileNotFoundError,PermissionError,OSError,ValueError,
            subprocess.TimeoutExpired) as exc:
        print("HOLD:R24_E:",exc if isinstance(exc,Hold) else type(exc).__name__,
              file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
