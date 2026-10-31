#!/usr/bin/env python3
"""R25 E P0: one-use, owner-consented, append-only old .next durable copy.

--plan is read-only. --copy requires the previously reviewed plan SHA256 and a
new unique campaign name. ROOT ONLY, exact HEL1. Never stops 3030 or edits old
source, previous rollbacks, Wolo, finance, C artifact, Nginx or release lock.
Run via owner Mac strict pinned SSH and an explicit full typed challenge.
SUCCESS IS NOT RECOVERY_READY: the independent E witness must be run separately.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import time

HOST = 'ubuntu-4gb-hel1-11'
OLD_PID = 2625090
OLD_BUILD_ID = 'DQ2jMprNQ_Njq6QM8GHju'
C_SOURCE_SHA = '0cee3c836c4b0760478280c145e02e81e470ce0e'
C_BUILD_ID = '-dJl5VyecHu5BKNvfErJe'
C_TREE_SHA = '5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d'
OLD_NEXT = Path('/var/www/AoE2HDBets/app-prodn/.next')
VOLUME = Path('/mnt/HC_Volume_105319120')
ROLLBACKS = VOLUME/'aoe2war/rollbacks'
C_STAGE = Path('/var/lib/aoe2war-r25-web-0cee3c836c4b')
C_RECEIPT = Path('/var/lib/aoe2war-r25-c-additive/BUILD_STAGED.json')
GIB = 1024**3
RESERVE = 4*GIB
MAX_TREE_ENTRIES = 160000
MAX_TREE_BYTES = 16*GIB
MAX_SINGLE_FILE_BYTES = 8*GIB
MAX_DEPTH = 48
MAX_SCAN_SECONDS = 360
CAMPAIGN_PATTERN = re.compile(r'r25-e-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{20}\Z')
REGULAR_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | getattr(os, 'O_NOATIME', 0)
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC | getattr(os, 'O_NOATIME', 0)

class Hold(Exception): pass

def need(ok, why):
    if not ok: raise Hold(why)

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode()

def digest(obj): return hashlib.sha256(canonical(obj)).hexdigest()

def run(argv, timeout=30):
    p = subprocess.run(argv, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=timeout)
    need(p.returncode == 0, 'NATIVE_READONLY_COMMAND_FAILED:'+Path(argv[0]).name)
    return p.stdout

def guarded_directory(path, device, owner=None):
    """Walk from / with O_NOFOLLOW directory FDs; no lexical or mount escape."""
    need(path.is_absolute() and '..' not in path.parts, 'DIRECTORY_PATH_INVALID')
    fd = os.open('/', DIR_FLAGS)
    prefix = Path('/')
    try:
        for name in path.parts[1:]:
            prefix = prefix / name
            child = os.open(name, DIR_FLAGS, dir_fd=fd)
            os.close(fd); fd = child
            s = os.fstat(fd)
            on_target_fs = not path.is_relative_to(VOLUME) or prefix == VOLUME or prefix.is_relative_to(VOLUME)
            need(stat.S_ISDIR(s.st_mode) and (not on_target_fs or s.st_dev == device),
                 'DIRECTORY_DEVICE_OR_TYPE_CHANGED')
            if owner == 0:
                need(s.st_uid == 0 and not s.st_mode & 0o022,
                     'NEW_DESTINATION_ANCESTRY_NOT_ROOT_PROTECTED')
        return fd
    except BaseException:
        os.close(fd)
        raise

def root_file(path, limit=65536):
    s = os.lstat(path)
    need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == 0
         and not s.st_mode & 0o022 and 0 < s.st_size <= limit,
         'C_BUILD_RECEIPT_NOT_SEALED')
    fd = os.open(path, REGULAR_FLAGS)
    try:
        q = os.fstat(fd)
        need((q.st_ino,q.st_size,q.st_mtime_ns)==(s.st_ino,s.st_size,s.st_mtime_ns),
             'C_BUILD_RECEIPT_CHANGED')
        raw = os.read(fd,limit+1)
        need(len(raw)==s.st_size, 'C_BUILD_RECEIPT_LENGTH')
        q2 = os.fstat(fd)
        need((q2.st_ino,q2.st_size,q2.st_mtime_ns,q2.st_ctime_ns)==
             (q.st_ino,q.st_size,q.st_mtime_ns,q.st_ctime_ns),
             'C_BUILD_RECEIPT_CHANGED_DURING_READ')
        return json.loads(raw)
    finally: os.close(fd)

def old_identity():
    p = run(['/usr/bin/systemctl','show','aoe2hdbets-web.service',
             '-p','MainPID','-p','ActiveState'])
    fields = dict(z.split('=',1) for z in p.splitlines() if '=' in z)
    need(fields.get('MainPID') == str(OLD_PID) and fields.get('ActiveState')=='active',
         'ORIGINAL_WEB_PID_OR_ACTIVITY_DRIFT')
    raw = Path('/proc/%d/stat'%OLD_PID).read_text()
    need(') ' in raw, 'ORIGINAL_PID_STAT_INVALID')
    proc = raw.rsplit(') ',1)[1].split()
    need(len(proc)>19 and proc[19].isdecimal(),'ORIGINAL_START_TICKS_MISSING')
    listeners = run(['/usr/bin/ss','-H','-ltn'],timeout=15)
    for port in (3030,8092,8093):
        need(any(re.search(':'+str(port)+r'\s',z) for z in listeners.splitlines()),
             'ORIGINAL_OR_WOLO_LISTENER_ABSENT:'+str(port))
    return {'pid':OLD_PID,'start_ticks':int(proc[19]),'3030':True,
            'wolo_8092_8093':True}

def src_stat_tuple(s):
    return (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,
            s.st_size,s.st_mtime_ns,s.st_ctime_ns)

def file_reader(dirfd,name,expected,deadline):
    fd = os.open(name, REGULAR_FLAGS, dir_fd=dirfd)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1,
             'SOURCE_SYMLINK_HARDLINK_OR_SPECIAL')
        need(src_stat_tuple(before) == src_stat_tuple(expected),
             'SOURCE_FILE_IDENTITY_RACE')
        need(before.st_size <= MAX_SINGLE_FILE_BYTES, 'SOURCE_SINGLE_FILE_TOO_LARGE')
        def chunks():
            n = 0
            while True:
                need(time.monotonic() <= deadline, 'SOURCE_SCAN_DEADLINE')
                chunk = os.read(fd,1048576)
                if not chunk: break
                n += len(chunk)
                need(n <= before.st_size, 'SOURCE_FILE_GREW')
                yield chunk
            need(n == before.st_size,'SOURCE_FILE_SHRANK')
            need(src_stat_tuple(os.fstat(fd)) == src_stat_tuple(before),
                 'SOURCE_FILE_CHANGED_DURING_READ')
        return before, chunks, fd
    except BaseException:
        os.close(fd); raise

def tree_scan(root, expected_device, with_metadata):
    """Entire old tree via no-follow directory FDs, streaming hashes + inode metadata."""
    deadline = time.monotonic()+MAX_SCAN_SECONDS
    rootfd = guarded_directory(root, expected_device)
    rows = []; total = [0]; entries = [0]
    def walk(fd, rel, depth):
        need(depth <= MAX_DEPTH, 'TREE_DEPTH_LIMIT')
        start=os.fstat(fd)
        need(start.st_dev==expected_device,'TREE_MOUNT_ESCAPE')
        with os.scandir(fd) as it: children=sorted(it,key=lambda e:e.name)
        for child in children:
            need(time.monotonic()<=deadline,'TREE_SCAN_TIMEOUT')
            name=child.name
            need(name not in ('','.','..') and '\n' not in name and '\r' not in name,
                 'UNSAFE_TREE_NAME')
            relname=rel+'/'+name if rel else name
            entries[0]+=1
            need(entries[0]<=MAX_TREE_ENTRIES, 'TREE_ENTRY_LIMIT')
            st=os.stat(name,dir_fd=fd,follow_symlinks=False)
            need(st.st_dev==expected_device, 'TREE_MOUNT_ESCAPE')
            meta={'mode':stat.S_IMODE(st.st_mode),'uid':st.st_uid,'gid':st.st_gid,
                  'mtime_ns':st.st_mtime_ns,'ctime_ns':st.st_ctime_ns,
                  'ino':st.st_ino,'dev':st.st_dev,'nlink':st.st_nlink}
            if stat.S_ISDIR(st.st_mode):
                need(depth<MAX_DEPTH,'TREE_DEPTH_LIMIT')
                cfd=os.open(name,DIR_FLAGS,dir_fd=fd)
                try:
                    need(src_stat_tuple(os.fstat(cfd))==src_stat_tuple(st),
                         'TREE_DIRECTORY_REPLACED')
                    rows.append({'path':relname,'type':'dir', 'metadata':meta if with_metadata else None})
                    walk(cfd,relname,depth+1)
                    need(src_stat_tuple(os.fstat(cfd))==src_stat_tuple(st),
                         'TREE_DIRECTORY_CHANGED_DURING_SCAN')
                finally: os.close(cfd)
            else:
                need(stat.S_ISREG(st.st_mode) and st.st_nlink == 1,
                     'TREE_SYMLINK_HARDLINK_OR_SPECIAL')
                total[0]+=st.st_size
                need(total[0]<=MAX_TREE_BYTES,'TREE_LOGICAL_BYTES_LIMIT')
                h=hashlib.sha256()
                before,chunks,fid=file_reader(fd,name,st,deadline)
                try:
                    for chunk in chunks():h.update(chunk)
                finally:os.close(fid)
                rows.append({'path':relname,'type':'file','bytes':st.st_size,
                             'sha256':h.hexdigest(),
                             'metadata':meta if with_metadata else None})
        need(src_stat_tuple(os.fstat(fd))==src_stat_tuple(start),
             'TREE_DIRECTORY_CHANGED_DURING_SCAN')
    try: walk(rootfd,'',0)
    finally:os.close(rootfd)
    content=[{k:v for k,v in row.items() if k!='metadata'} for row in rows]
    return {'entries':entries[0],'logical_bytes':total[0],
            'content_sha256':digest(content),'metadata_sha256':digest(rows) if with_metadata else None,
            'rows':rows}

def capacity(source, volume_device, root_device):
    need(os.path.ismount(VOLUME) and VOLUME.stat().st_dev==volume_device and
         volume_device!=root_device, 'INDEPENDENT_ATTACHED_MOUNT_REQUIRED')
    def du(apparent=False):
        args=['/usr/bin/du','-sx','-B1']
        if apparent: args+=['--apparent-size','--count-links']
        txt=run(args+['--',str(OLD_NEXT)],timeout=120)
        value=txt.split('\t',1)[0].strip()
        need(value.isdecimal(),'OLD_NEXT_DU_INVALID')
        return int(value)
    allocated=du(); apparent=du(True)
    need(0<allocated<=MAX_TREE_BYTES and 0<apparent<=MAX_TREE_BYTES,
         'OLD_NEXT_ALLOCATION_UNBOUNDED')
    physical=max(allocated,apparent)
    budget=physical+physical//10+512*1024**2
    volstat=os.statvfs(VOLUME);rootstat=os.statvfs(Path('/'))
    vfree=volstat.f_bavail*volstat.f_frsize
    rfree=rootstat.f_bavail*rootstat.f_frsize
    need(rfree>=RESERVE, 'ROOT_FREE_BELOW_4G')
    need(vfree>=budget+RESERVE, 'ATTACHED_COPY_BUDGET_PLUS_4G_INSUFFICIENT')
    return {'old_next_allocated_bytes':allocated,'old_next_apparent_bytes':apparent,
            'copy_budget_bytes':budget,'attached_free_before_bytes':vfree,
            'root_free_before_bytes':rfree,'reserve_bytes':RESERVE}

def prerequisites():
    need(sys.platform=='linux' and socket.gethostname().split('.')[0]==HOST and
         os.geteuid()==0,'EXACT_HEL1_ROOT_ONLY')
    rootdev=Path('/').stat().st_dev
    voldev=VOLUME.stat().st_dev
    need(os.path.ismount(VOLUME) and rootdev!=voldev, 'DIFFERENT_ATTACHED_DEVICE_REQUIRED')
    srcfd=guarded_directory(OLD_NEXT,rootdev)
    os.close(srcfd)
    dstfd=guarded_directory(ROLLBACKS,voldev,owner=0)
    os.close(dstfd)
    # Root C manifest must match immutable independent physical verification.
    built=root_file(C_RECEIPT)
    need(built.get('status')=='BUILD_STAGED' and
         built.get('candidate_sha')==C_SOURCE_SHA and
         built.get('build_id')==C_BUILD_ID and
         built.get('tree_sha256')==C_TREE_SHA and
         built.get('old_web_pid_untouched')==OLD_PID,
         'FROZEN_C_BUILD_RECEIPT_DRIFT')
    stagefd=guarded_directory(C_STAGE/'.next',rootdev,owner=0)
    try:
        q=os.stat('BUILD_ID',dir_fd=stagefd,follow_symlinks=False)
        need(stat.S_ISREG(q.st_mode) and q.st_nlink==1 and q.st_uid==0 and q.st_size<=256,
             'C_NEXT_ID_NOT_ROOT_SEALED')
        fd=os.open('BUILD_ID',REGULAR_FLAGS,dir_fd=stagefd)
        try: actual=os.read(fd,257).decode('ascii').strip()
        finally:os.close(fd)
        need(actual==C_BUILD_ID, 'C_REAL_BUILD_ID_DRIFT')
    finally:os.close(stagefd)
    return rootdev,voldev

def old_build_id():
    fd=guarded_directory(OLD_NEXT,Path('/').stat().st_dev)
    try:
        s=os.stat('BUILD_ID',dir_fd=fd,follow_symlinks=False)
        before,chunks,reader=file_reader(fd,'BUILD_ID',s,time.monotonic()+30)
        try: data=b''.join(chunks())
        finally:os.close(reader)
        need(5<=len(data)<=128 and data.strip().decode('ascii')==OLD_BUILD_ID,
             'OLD_NEXT_BUILD_ID_DRIFT')
        return OLD_BUILD_ID
    finally:os.close(fd)

def plan_authorization_sha(plan):
    # Filesystem free bytes can move between plan and consent. The copy worker
    # separately rechecks the real free/reserve, while source identity and
    # exact allocation/budget remain explicitly bound to the authorization.
    stable=dict(plan)
    cap=dict(stable['capacity'])
    cap.pop('attached_free_before_bytes',None)
    cap.pop('root_free_before_bytes',None)
    stable['capacity']=cap
    return digest(stable)

def create_plan():
    rootdev,voldev=prerequisites()
    process=old_identity()
    old_build_id()
    scan=tree_scan(OLD_NEXT,rootdev,True)
    cap=capacity(OLD_NEXT,voldev,rootdev)
    need(old_identity()==process and old_build_id()==OLD_BUILD_ID,
         'OLD_WEB_DRIFT_DURING_PLAN')
    return {'schema':'aoe2war.r25.e.old-next-copy-plan.v1',
            'host':HOST,'original_pid':OLD_PID,'original_pid_start_ticks':process['start_ticks'],
            'old_build_id':OLD_BUILD_ID,'c_build_id':C_BUILD_ID,'c_tree_sha256':C_TREE_SHA,
            'source':str(OLD_NEXT),'destination_root':str(ROLLBACKS),
            'root_device':rootdev,'volume_device':voldev,'source_entries':scan['entries'],
            'source_logical_bytes':scan['logical_bytes'],
            'source_content_sha256':scan['content_sha256'],
            'source_metadata_sha256':scan['metadata_sha256'],
            'capacity':cap,'mutations_authorized':False}

def fsync_dir(fd): os.fsync(fd)

def write_once(dirfd,name,obj):
    fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=dirfd)
    try:
        raw=canonical(obj)+b'\n'
        off=0
        while off<len(raw): off+=os.write(fd,raw[off:])
        os.fsync(fd)
    finally:os.close(fd)
    fsync_dir(dirfd)

def copy_tree(source, destination, device, expected_plan):
    srcfd=guarded_directory(source,expected_plan['root_device'])
    dstfd=guarded_directory(destination,device,owner=0)
    deadline=time.monotonic()+MAX_SCAN_SECONDS
    count=0; logical=0
    def walk(sfd,dfd,rel,depth):
        nonlocal count,logical
        need(depth<=MAX_DEPTH,'COPY_DEPTH_LIMIT')
        initial=os.fstat(sfd)
        with os.scandir(sfd) as it:children=sorted(it,key=lambda e:e.name)
        for child in children:
            need(time.monotonic()<deadline,'COPY_DEADLINE')
            name=child.name; r=rel+'/'+name if rel else name
            need(name not in ('','.','..') and '\r' not in name and '\n' not in name,
                 'UNSAFE_COPY_FILE_NAME')
            count+=1;need(count<=MAX_TREE_ENTRIES,'COPY_ENTRY_LIMIT')
            s=os.stat(name,dir_fd=sfd,follow_symlinks=False)
            need(s.st_dev==expected_plan['root_device'],'SOURCE_DEVICE_ESCAPE')
            if stat.S_ISDIR(s.st_mode):
                os.mkdir(name,0o700,dir_fd=dfd)
                nsrc=os.open(name,DIR_FLAGS,dir_fd=sfd)
                ndst=os.open(name,DIR_FLAGS,dir_fd=dfd)
                try:
                    need(src_stat_tuple(os.fstat(nsrc))==src_stat_tuple(s),
                         'SOURCE_DIR_REPLACED_DURING_COPY')
                    walk(nsrc,ndst,r,depth+1)
                    need(src_stat_tuple(os.fstat(nsrc))==src_stat_tuple(s),
                         'SOURCE_DIR_CHANGED_DURING_COPY')
                    fsync_dir(ndst)
                finally:os.close(nsrc);os.close(ndst)
                fsync_dir(dfd)
            else:
                need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,
                     'SOURCE_SPECIAL_SYMLINK_HARDLINK_COPY_DENIED')
                logical+=s.st_size
                need(logical<=MAX_TREE_BYTES,'COPY_BYTES_BOUNDED')
                before,chunks,reader=file_reader(sfd,name,s,deadline)
                fd=-1
                try:
                    fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,
                               0o600,dir_fd=dfd)
                    h=hashlib.sha256()
                    for chunk in chunks():
                        h.update(chunk)
                        offset=0
                        while offset<len(chunk):offset+=os.write(fd,chunk[offset:])
                    os.fsync(fd)
                    destst=os.fstat(fd)
                    need(destst.st_size==before.st_size and destst.st_nlink==1 and
                         destst.st_uid==0 and destst.st_dev==device,
                         'DESTINATION_FILE_SIZE_OR_ROOT_SEAL_CHANGED')
                finally:
                    os.close(reader)
                    if fd>=0:os.close(fd)
                fsync_dir(dfd)
        need(src_stat_tuple(os.fstat(sfd))==src_stat_tuple(initial),
             'SOURCE_DIRECTORY_CHANGED_DURING_COPY')
    try:
        walk(srcfd,dstfd,'',0)
        fsync_dir(dstfd)
    finally:os.close(srcfd);os.close(dstfd)
    need(count==expected_plan['source_entries'] and logical==expected_plan['source_logical_bytes'],
         'COPY_ENTRY_OR_LOGICAL_SIZE_CHANGED')
    return {'entries':count,'logical_file_bytes':logical}

def perform_copy(campaign,expected_sha):
    need(bool(CAMPAIGN_PATTERN.fullmatch(campaign)),'NEW_CAMPAIGN_NAME_INVALID')
    need(bool(re.fullmatch('[0-9a-f]{64}',expected_sha)),'EXACT_PLAN_SHA256_REQUIRED')
    plan=create_plan()
    need(plan_authorization_sha(plan)==expected_sha,'OWNER_APPROVED_PLAN_DRIFT_BEFORE_WRITE')
    original=old_identity()
    rootdev=plan['root_device'];voldev=plan['volume_device']
    parentfd=guarded_directory(ROLLBACKS,voldev,owner=0)
    # THIS is the first mutation. Exclusive mkdir; never reuse any old campaign.
    try:
        os.mkdir(campaign,0o700,dir_fd=parentfd)
        fsync_dir(parentfd)
        campfd=os.open(campaign,DIR_FLAGS,dir_fd=parentfd)
    finally:os.close(parentfd)
    dest=ROLLBACKS/campaign/'prior-next'
    try:
        write_once(campfd,'COPY_ENTERED.json',{
            'schema':'aoe2war.r25.e.copy-entered.v1',
            'source':str(OLD_NEXT),'destination':str(dest),
            'plan_sha256':expected_sha,'old_build_id':OLD_BUILD_ID,
            'original_pid':OLD_PID,'original_pid_start_ticks':original['start_ticks'],
            'status':'COPY_ENTERED_NOT_RECOVERY_READY'})
        os.mkdir('prior-next',0o700,dir_fd=campfd)
        fsync_dir(campfd)
        copied=copy_tree(OLD_NEXT,dest,voldev,plan)
        post=tree_scan(OLD_NEXT,rootdev,True)
        need(post['content_sha256']==plan['source_content_sha256'] and
             post['metadata_sha256']==plan['source_metadata_sha256'] and
             post['entries']==plan['source_entries'],
             'OLD_NEXT_CHANGED_DURING_COPY_NO_PASS')
        readback=tree_scan(dest,voldev,False)
        need(readback['content_sha256']==plan['source_content_sha256'] and
             readback['logical_bytes']==plan['source_logical_bytes'] and
             readback['entries']==plan['source_entries'],
             'FULL_DESTINATION_READBACK_MISMATCH_NO_PASS')
        need(old_identity()==original and old_build_id()==OLD_BUILD_ID,
             'ORIGINAL_WEB_DRIFT_DURING_COPY')
        now=os.statvfs(VOLUME).f_bavail*os.statvfs(VOLUME).f_frsize
        rootfree=os.statvfs(Path('/')).f_bavail*os.statvfs(Path('/')).f_frsize
        need(now>=RESERVE and rootfree>=RESERVE,'AFTER_COPY_4G_RESERVE_VIOLATED')
        # Root-only source restore metadata: the copy is intentionally private
        # root:root 0600/0700, but original UID/GID/mode/mtime and each file's
        # content SHA are retained for an independently authorized restore.
        metadata={'schema':'aoe2war.r25.e.old-next-restore-metadata.v1',
                  'old_source':str(OLD_NEXT),
                  'entries':post['rows'],
                  'source_content_sha256':post['content_sha256'],
                  'source_metadata_sha256':post['metadata_sha256'],
                  'not_a_restore_authorization':True}
        write_once(campfd,'COPY_SOURCE_METADATA.json',metadata)
        receipt={'schema':'aoe2war.r25.e.durable-old-next-copy.v1',
                 'status':'COPY_VERIFIED_NOT_RECOVERY_READY',
                 'campaign':campaign,'destination':str(dest),
                 'plan_sha256':expected_sha,
                 'original_pid':OLD_PID,'original_start_ticks':original['start_ticks'],
                 'old_build_id':OLD_BUILD_ID,
                 'c_build_id':C_BUILD_ID,'c_tree_sha256':C_TREE_SHA,
                 'source_content_sha256':plan['source_content_sha256'],
                 'source_metadata_sha256':plan['source_metadata_sha256'],
                 'source_restore_metadata_receipt_sha256':digest(metadata),
                 'source_entries':post['entries'],
                 'logical_bytes':post['logical_bytes'],
                 'copy_stream':copied,
                 'readback_content_sha256':readback['content_sha256'],
                 'readback_entries':readback['entries'],
                 'root_free_after_bytes':rootfree,
                 'volume_free_after_bytes':now,
                 'separate_volume_devices':[rootdev,voldev],
                 'rollback_exercised':False,
                 'release_authorized':False,
                 'independent_E_readonly_witness_required':True}
        receipt['receipt_sha256']=digest(receipt)
        write_once(campfd,'COPY_VERIFIED.json',receipt)
        fsync_dir(campfd)
        return receipt
    except BaseException as exc:
        # Preserve incomplete campaign and original sources. No cleanup or rerun.
        try:
            write_once(campfd,'COPY_HOLD.json',{'status':'HOLD_PARTIAL_PRESERVED',
                'reason':str(exc)[:140] if isinstance(exc,Hold) else type(exc).__name__,
                'never_retry_this_campaign':True})
        except BaseException: pass
        raise
    finally:os.close(campfd)

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase',required=True,choices=('plan','copy'))
    p.add_argument('--campaign',default='')
    p.add_argument('--approved-plan-sha256',default='')
    a=p.parse_args(argv)
    try:
        if a.phase=='plan':
            need(not a.campaign and not a.approved_plan_sha256,
                 'PLAN_MUST_NOT_ACCEPT_MUTATION_ARGUMENTS')
            plan=create_plan()
            report=dict(plan,plan_sha256=plan_authorization_sha(plan))
            print(json.dumps(report,sort_keys=True))
            return 0
        need(a.campaign and a.approved_plan_sha256,
             'OWNER_APPROVED_CAMPAIGN_AND_PLAN_REQUIRED')
        report=perform_copy(a.campaign,a.approved_plan_sha256)
        print(json.dumps(report,sort_keys=True))
        return 0
    except (Hold,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as e:
        print('HOLD:R25_E_DURABLE_COPY:'+(str(e) if isinstance(e,Hold) else type(e).__name__),
              file=sys.stderr)
        return 2

if __name__=='__main__':
    sys.exit(main())
