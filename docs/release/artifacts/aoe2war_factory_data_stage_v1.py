#!/usr/bin/python3
"""Source-pinned DATA-only artifact handoff for the original PRODUCT Factory.

No web, database, approval, or retirement authority. The root manifest
preparer promotes one fully checked user-delivered DATA directory into a
root-owned immutable DATA directory without copying bytes onto ROOT.
An ext4 ROOT runtime is still extracted and renamed exclusively on ROOT.
"""
import contextlib
import hashlib
import os
from pathlib import Path
import re
import stat

DATA_MOUNT = Path("/mnt/HC_Volume_105319120")
DATA_PARENT = DATA_MOUNT / "aoe2war"
DATA_STAGE_ROOT = DATA_PARENT / "we2-factory-artifact-stage-v1"
DATA_DEV = 2064
ROOT_UID = 0
SENDER_UID = 1000
SENDER_GID = 1000
ARCHIVE_NAME = "runtime.tar.gz"
PROOF_NAME = "b-linux-independent-review-v2.json"
NOFOLLOW = os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
DIRECTORY = NOFOLLOW | os.O_DIRECTORY

def require(condition, label):
    if not condition:
        raise RuntimeError("HOLD_FACTORY_DATA_" + label)

def stage_path(source, run_id, *, parent=DATA_STAGE_ROOT):
    require(type(source) is str and re.fullmatch(r"[0-9a-f]{40}", source) is not None,
            "SOURCE_ID")
    require(type(run_id) is int and run_id > 0, "RUN_ID")
    return parent / (".aoe2war-b-os-" + source[:12] + "-run-" + str(run_id))

def _dir(path, owner, group, mode, device=None):
    st = path.lstat()
    require(stat.S_ISDIR(st.st_mode) and not path.is_symlink()
            and st.st_uid == owner and st.st_gid == group
            and stat.S_IMODE(st.st_mode) == mode
            and (device is None or st.st_dev == device),
            "DIRECTORY_IDENTITY_" + path.name)
    return st

def layout(stage, source, run_id, *, frozen=False,
           mount=DATA_MOUNT, parent=DATA_PARENT, root=DATA_STAGE_ROOT,
           device=DATA_DEV, root_uid=ROOT_UID, sender_uid=SENDER_UID,
           sender_gid=SENDER_GID, root_gid=0, require_mount=True):
    """Pin every parent, DATA device and sticky-root handoff namespace."""
    require(stage == stage_path(source, run_id, parent=root), "STAGE_NAME_SCOPE")
    if require_mount:
        # Explicitly pin ancestors on ROOT too: never follow a substituted
        # /mnt symlink or silently use the DATA mountpoint on ext4 ROOT.
        _dir(Path("/"), root_uid, root_gid, 0o755, 2049)
        _dir(Path("/mnt"), root_uid, root_gid, 0o755, 2049)
        require(os.path.ismount(mount), "DATA_MOUNT_NOT_MOUNTED")
    _dir(mount, root_uid, root_gid, 0o755, device)
    _dir(parent, root_uid, root_gid, 0o755, device)
    _dir(root, root_uid, sender_gid, 0o1770, device)
    expected_uid = root_uid if frozen else sender_uid
    expected_gid = root_gid if frozen else sender_gid
    st = _dir(stage, expected_uid, expected_gid, 0o700, device)
    return st

def _opened_stage(stage, expected_stat):
    fd = os.open(stage, DIRECTORY)
    st = os.fstat(fd)
    require((st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) ==
            (expected_stat.st_dev, expected_stat.st_ino, expected_stat.st_uid,
             stat.S_IMODE(expected_stat.st_mode)), "STAGE_SWAPPED")
    return fd

def _hash_fd(fd):
    h = hashlib.sha256()
    os.lseek(fd, 0, os.SEEK_SET)
    for chunk in iter(lambda: os.read(fd, 1 << 20), b""):
        h.update(chunk)
    os.lseek(fd, 0, os.SEEK_SET)
    return h.hexdigest()

def _file_fd(directory_fd, name, *, owner, mode, device, expected_sha,
             expected_size=None, inode=None):
    require(name in (ARCHIVE_NAME, PROOF_NAME), "FILE_NAME_SCOPE")
    require(type(expected_sha) is str and
            re.fullmatch(r"[a-f0-9]{64}", expected_sha) is not None, "EXPECTED_SHA")
    fd = os.open(name, NOFOLLOW, dir_fd=directory_fd)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == owner
                and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == mode
                and before.st_dev == device
                and (expected_size is None or before.st_size == expected_size)
                and (inode is None or before.st_ino == inode), "FILE_IDENTITY_" + name)
        require(_hash_fd(fd) == expected_sha, "FILE_SHA_" + name)
        after = os.fstat(fd)
        require((before.st_dev, before.st_ino, before.st_size,
                 before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_size,
                 after.st_mtime_ns, after.st_ctime_ns), "FILE_CHANGED_" + name)
        return fd, after
    except BaseException:
        os.close(fd)
        raise

@contextlib.contextmanager
def opened_verified(stage, source, run_id, *,
                    archive_sha, archive_bytes, archive_inode, proof_sha,
                    mount=DATA_MOUNT, parent=DATA_PARENT, root=DATA_STAGE_ROOT,
                    device=DATA_DEV, root_uid=ROOT_UID, sender_uid=SENDER_UID,
                    sender_gid=SENDER_GID, root_gid=0, require_mount=True):
    """Give root's tar reader the *same locked file descriptor* that was hashed."""
    st = layout(stage, source, run_id, frozen=True, mount=mount, parent=parent,
                root=root, device=device, root_uid=root_uid,
                sender_uid=sender_uid, sender_gid=sender_gid,
                root_gid=root_gid, require_mount=require_mount)
    dfd = _opened_stage(stage, st)
    fd = None
    try:
        fd, meta = _file_fd(dfd, ARCHIVE_NAME, owner=root_uid, mode=0o400,
                            device=device, expected_sha=archive_sha,
                            expected_size=archive_bytes, inode=archive_inode)
        pfd, _ = _file_fd(dfd, PROOF_NAME, owner=root_uid, mode=0o400,
                          device=device, expected_sha=proof_sha)
        os.close(pfd)
        require(stage.lstat().st_ino == st.st_ino, "STAGE_REPLACED")
        with os.fdopen(fd, "rb", closefd=True) as archive:
            fd = None
            yield archive, meta
            after = os.fstat(archive.fileno())
            require((after.st_dev, after.st_ino, after.st_size,
                     after.st_mtime_ns, after.st_ctime_ns) ==
                    (meta.st_dev, meta.st_ino, meta.st_size,
                     meta.st_mtime_ns, meta.st_ctime_ns), "ARCHIVE_MUTATED")
        require(stage.lstat().st_ino == st.st_ino, "STAGE_POST_REPLACED")
    finally:
        if fd is not None:
            os.close(fd)
        os.close(dfd)

def _promotable_file_fd(dfd, name, *, expected_sha, expected_size,
                        device, root_uid, root_gid, sender_uid, sender_gid):
    """Accept only exact verified sender or interrupted-root file states."""
    require(name in (ARCHIVE_NAME, PROOF_NAME), "FILE_NAME_SCOPE")
    fd=os.open(name,NOFOLLOW,dir_fd=dfd)
    try:
        before=os.fstat(fd)
        allowed={(sender_uid,sender_gid,0o600),
                 (root_uid,root_gid,0o600),(root_uid,root_gid,0o400)}
        require(stat.S_ISREG(before.st_mode) and before.st_nlink==1
                and before.st_dev==device
                and (before.st_uid,before.st_gid,
                     stat.S_IMODE(before.st_mode)) in allowed
                and (expected_size is None or before.st_size==expected_size),
                "PROMOTION_FILE_IDENTITY_"+name)
        require(_hash_fd(fd)==expected_sha,"PROMOTION_FILE_SHA_"+name)
        after=os.fstat(fd)
        require((before.st_dev,before.st_ino,before.st_size,
                 before.st_mtime_ns,before.st_ctime_ns)==
                (after.st_dev,after.st_ino,after.st_size,
                 after.st_mtime_ns,after.st_ctime_ns),
                "PROMOTION_FILE_CHANGED_"+name)
        return fd,after
    except BaseException:
        os.close(fd)
        raise

def _promote_verified_stage(stage, source, run_id, *,
                            archive_sha, archive_bytes, proof_sha, resume,
                            mount=DATA_MOUNT, parent=DATA_PARENT, root=DATA_STAGE_ROOT,
                            device=DATA_DEV, root_uid=ROOT_UID, sender_uid=SENDER_UID,
                            sender_gid=SENDER_GID, root_gid=0, require_mount=True):
    require(os.geteuid()==root_uid,"ROOT_PROMOTION_REQUIRED")
    st=layout(stage,source,run_id,frozen=resume,mount=mount,parent=parent,
              root=root,device=device,root_uid=root_uid,sender_uid=sender_uid,
              sender_gid=sender_gid,root_gid=root_gid,require_mount=require_mount)
    dfd=_opened_stage(stage,st)
    opened=[]
    try:
        extras=set(os.listdir(dfd))-{ARCHIVE_NAME,PROOF_NAME}
        if extras=={".rsync-partial"} and not resume:
            partial=os.stat(".rsync-partial",dir_fd=dfd,follow_symlinks=False)
            require(stat.S_ISDIR(partial.st_mode) and partial.st_uid==sender_uid
                    and partial.st_dev==device,"UNEXPECTED_PARTIAL_DIRECTORY")
            pfd=os.open(".rsync-partial",DIRECTORY,dir_fd=dfd)
            try:
                require(not os.listdir(pfd),"UNEXPECTED_PARTIAL_CONTENTS")
            finally:os.close(pfd)
            os.rmdir(".rsync-partial",dir_fd=dfd)
            extras=set()
        require(not extras,"UNEXPECTED_STAGE_ENTRIES")
        for name,digest,nbytes in ((ARCHIVE_NAME,archive_sha,archive_bytes),
                                   (PROOF_NAME,proof_sha,None)):
            if resume:
                fd,meta=_promotable_file_fd(
                    dfd,name,expected_sha=digest,expected_size=nbytes,
                    device=device,root_uid=root_uid,root_gid=root_gid,
                    sender_uid=sender_uid,sender_gid=sender_gid)
            else:
                fd,meta=_file_fd(dfd,name,owner=sender_uid,mode=0o600,
                                  device=device,expected_sha=digest,
                                  expected_size=nbytes)
                require(meta.st_gid==sender_gid,"SENDER_FILE_GROUP_"+name)
            opened.append((fd,meta))
        # Seal the directory FIRST, before mutating file ownership. On
        # interruption before this point, sender-owned 0600 files may be
        # transferred/resumed. After this point, tony cannot rename/remove
        # root-owned stage members; the root-only resume path can finish any
        # mixed file ownership (sender600,root600,root400).
        if not resume:
            os.fchown(dfd,root_uid,root_gid)
            os.fchmod(dfd,0o700)
            os.fsync(dfd)
            parentfd=os.open(root,DIRECTORY)
            try:os.fsync(parentfd)
            finally:os.close(parentfd)
        for fd,meta in opened:
            os.fchown(fd,root_uid,root_gid)
            os.fchmod(fd,0o400)
            os.fsync(fd)
        os.fsync(dfd)
    finally:
        for fd,_ in opened:os.close(fd)
        os.close(dfd)
    with opened_verified(stage,source,run_id,
                         archive_sha=archive_sha,archive_bytes=archive_bytes,
                         archive_inode=opened[0][1].st_ino,proof_sha=proof_sha,
                         mount=mount,parent=parent,root=root,device=device,
                         root_uid=root_uid,sender_uid=sender_uid,
                         sender_gid=sender_gid,root_gid=root_gid,
                         require_mount=require_mount):
        pass
    return opened[0][1].st_ino

def freeze_checked_stage(stage, source, run_id, *,
                         archive_sha, archive_bytes, proof_sha,
                         mount=DATA_MOUNT,parent=DATA_PARENT,root=DATA_STAGE_ROOT,
                         device=DATA_DEV,root_uid=ROOT_UID,sender_uid=SENDER_UID,
                         sender_gid=SENDER_GID,root_gid=0,require_mount=True):
    """First verified DATA-only handoff. Directory ownership seals first."""
    return _promote_verified_stage(
        stage,source,run_id,archive_sha=archive_sha,
        archive_bytes=archive_bytes,proof_sha=proof_sha,resume=False,
        mount=mount,parent=parent,root=root,device=device,root_uid=root_uid,
        sender_uid=sender_uid,sender_gid=sender_gid,root_gid=root_gid,
        require_mount=require_mount)

def resume_checked_stage(stage, source, run_id, *,
                         archive_sha, archive_bytes, proof_sha,
                         mount=DATA_MOUNT,parent=DATA_PARENT,root=DATA_STAGE_ROOT,
                         device=DATA_DEV,root_uid=ROOT_UID,sender_uid=SENDER_UID,
                         sender_gid=SENDER_GID,root_gid=0,require_mount=True):
    """Resume only an ALREADY root-sealed directory with complete exact bytes.

    Never lets a sender-owned stage bypass initial verification, and never
    calls chown before checking each candidate file digest and inode.
    """
    return _promote_verified_stage(
        stage,source,run_id,archive_sha=archive_sha,
        archive_bytes=archive_bytes,proof_sha=proof_sha,resume=True,
        mount=mount,parent=parent,root=root,device=device,root_uid=root_uid,
        sender_uid=sender_uid,sender_gid=sender_gid,root_gid=root_gid,
        require_mount=require_mount)
