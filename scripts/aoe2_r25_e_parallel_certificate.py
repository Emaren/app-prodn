#!/usr/bin/env python3
"""R25 E: read-only, exact-artifact 3031 stage/storage/durable-rollback certificate.

Additive to (does not replace) R24 E's existing capacity/rollback gate. Intended
for the owner-controlled, verified-SSH root *read-only* witness; no installation,
cleanup, release lock, original service restart, database or financial access.
The successful certificate is unsigned E storage evidence, NOT F/B/C approval.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone

SOURCE = "0cee3c836c4b0760478280c145e02e81e470ce0e"
ARCHIVE_SHA256 = "c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101"
ARCHIVE_BYTES = 293550080
# C independently rehashed the immutable 87,038-file built tree on HEL1.
# E checks identity against that separate physical result, not a build replay.
C_BUILD_ID = '-dJl5VyecHu5BKNvfErJe'
C_BUILD_VERSION = '20261031171526-148d3df911'
C_TREE_SHA256 = '5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d'
MAX_ROLLBACK_CAMPAIGNS = 128
HOST = "ubuntu-4gb-hel1-11"
OLD_WEB = Path("/var/www/AoE2HDBets/app-prodn")
VOLUME = Path("/mnt/HC_Volume_105319120")
ARCHIVE = Path("/var/lib/aoe2war-r24-source-bundles") / (SOURCE + ".tar")
STAGED = Path("/var/lib/aoe2war-r25-web-0cee3c836c4b")
C_AUDIT = Path("/var/lib/aoe2war-r25-c-additive")
DURABLE = VOLUME / "aoe2war/rollbacks"
GIB = 1024**3
ROOT_RESERVE = 4 * GIB
VOLUME_RESERVE = 4 * GIB
MAX_BUDGET = 8 * GIB
MAX_TREE_ENTRIES = 160000
MAX_TREE_BYTES = 16 * GIB
MAX_TREE_SECONDS = 180
MAX_ARCHIVE_SECONDS = 90

class Hold(Exception):
    pass

def ensure(ok, why):
    if not ok:
        raise Hold(why)

def secure_path(p, base, device=None, must_exist=True):
    """Deny .., symlinks, non-dir ancestors and filesystem departures."""
    ensure(p.is_absolute() and base.is_absolute() and '..' not in p.parts
           and '..' not in base.parts and p != base and p.is_relative_to(base),
           'UNAPPROVED_PATH')
    chain = [base]
    chain.extend(base / Path(*p.relative_to(base).parts[:i])
                 for i in range(1, len(p.relative_to(base).parts) + 1))
    for j, cur in enumerate(chain):
        try:
            s = os.lstat(cur)
        except FileNotFoundError:
            if not must_exist:
                return False
            raise
        ensure(not stat.S_ISLNK(s.st_mode), 'PATH_SYMLINK')
        if j < len(chain)-1:
            ensure(stat.S_ISDIR(s.st_mode), 'PATH_PARENT_NOT_DIRECTORY')
        if device is not None:
            ensure(s.st_dev == device, 'PATH_CROSSES_DEVICE')
    return True

def no_link_regular(p, device=None):
    s = os.lstat(p)
    ensure(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'NONREGULAR_OR_LINKED_FILE')
    if device is not None:
        ensure(s.st_dev == device, 'FILE_DEVICE_MISMATCH')
    return s

def hash_file(p, maximum, seconds=MAX_ARCHIVE_SECONDS):
    before = no_link_regular(p)
    ensure(before.st_size <= maximum, 'FILE_TOO_LARGE')
    h = hashlib.sha256()
    start = time.monotonic()
    with open(p, 'rb', buffering=0) as f:
        while True:
            ensure(time.monotonic() - start < seconds, 'HASH_DEADLINE')
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    after = no_link_regular(p)
    ensure((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
           (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns),
           'FILE_CHANGED_DURING_HASH')
    return h.hexdigest()

def root_sealed(p):
    s = os.lstat(p)
    return s.st_uid == 0 and not (s.st_mode & 0o022)

def archive_identity():
    ensure(secure_path(ARCHIVE, Path('/var/lib')), 'ARCHIVE_MISSING')
    s = no_link_regular(ARCHIVE)
    ensure(root_sealed(ARCHIVE), 'ARCHIVE_NOT_ROOT_SEALED')
    ensure(s.st_size == ARCHIVE_BYTES, 'ARCHIVE_LENGTH_MISMATCH')
    digest = hash_file(ARCHIVE, ARCHIVE_BYTES)
    ensure(digest == ARCHIVE_SHA256, 'ARCHIVE_SHA256_MISMATCH')
    with open(ARCHIVE, 'rb') as f:
        p = subprocess.run(['/usr/bin/git', 'get-tar-commit-id'], stdin=f,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=20, check=False)
    ensure(p.returncode == 0 and p.stdout.decode('ascii', 'replace').strip() == SOURCE,
           'ARCHIVE_EMBEDDED_COMMIT_MISMATCH')
    return {'path': str(ARCHIVE), 'bytes': s.st_size,
            'sha256': digest, 'embedded_git_commit': SOURCE,
            'root_sealed': True}

def disk_free(p):
    v = os.statvfs(p)
    ensure(v.f_bavail >= 0 and v.f_frsize > 0, 'INVALID_STATVFS')
    return v.f_bavail * v.f_frsize

def du(p, apparent=False):
    a = ['/usr/bin/du', '-sx', '-B1']
    if apparent:
        a += ['--apparent-size', '--count-links']
    p1 = subprocess.run(a + ['--', str(p)], capture_output=True, text=True,
                        timeout=60, check=False, stdin=subprocess.DEVNULL)
    n = p1.stdout.partition('\t')[0]
    ensure(p1.returncode == 0 and n.isdecimal(), 'DU_FAILED')
    return int(n)

def durable_copy_budget(old_next):
    alloc = du(old_next)
    apparent = du(old_next, apparent=True)
    ensure(0 < alloc <= 16*GIB and 0 < apparent <= 16*GIB,
           'OLD_NEXT_UNBOUNDED')
    physical = max(alloc, apparent)
    return alloc, physical + physical//10 + 512*1024**2

def old_process(expected):
    p = subprocess.run(['/usr/bin/systemctl', 'show', 'aoe2hdbets-web.service',
                        '--property=MainPID', '--property=ActiveState',
                        '--no-pager'], capture_output=True, text=True,
                       timeout=10, stdin=subprocess.DEVNULL)
    ensure(p.returncode == 0, 'OLD_SYSTEMD_UNREADABLE')
    pairs = dict(line.split('=', 1) for line in p.stdout.splitlines() if '=' in line)
    ensure(pairs.get('ActiveState') == 'active' and
           pairs.get('MainPID') == str(expected), 'OLD_MAINPID_CHANGED_OR_STOPPED')
    with open('/proc/%d/stat' % expected, encoding='utf-8') as f:
        raw = f.read()
    ensure(') ' in raw, 'PROC_STAT_MALFORMED')
    fields = raw.rsplit(') ', 1)[1].split()
    ensure(len(fields) >= 20 and fields[19].isdecimal(), 'PROC_START_UNKNOWN')
    return {'mainpid': expected, 'active': True,
            'proc_start_ticks': int(fields[19])}

def old_next_id(p):
    s = no_link_regular(p/'BUILD_ID')
    ensure(5 <= s.st_size <= 256, 'NEXT_BUILD_ID_LENGTH')
    v = (p/'BUILD_ID').read_text().strip()
    ensure(5 <= len(v) <= 128 and all(c.isalnum() or c in '-_' for c in v),
           'NEXT_BUILD_ID_INVALID')
    return v

def internal_dependency(path, rootdev):
    """Accept pnpm-style symlinks ONLY when resolved inside isolated stage."""
    ensure(path.is_relative_to(STAGED) and '..' not in path.parts,
           'DEPENDENCY_PATH_OUTSIDE_STAGE')
    target = path.resolve(strict=True)
    ensure(target.is_relative_to(STAGED) and target != STAGED,
           'DEPENDENCY_SYMLINK_ESCAPES_STAGE')
    ensure(secure_path(target, STAGED, rootdev), 'DEPENDENCY_TARGET_MISSING')
    return no_link_regular(target, rootdev)

def stage_evidence(rootdev, maximum):
    base = STAGED.parent
    if not secure_path(STAGED, base, rootdev, must_exist=False):
        return None
    ensure(stat.S_ISDIR(os.lstat(STAGED).st_mode), 'STAGE_NOT_DIRECTORY')
    ensure(STAGED != OLD_WEB and STAGED != OLD_WEB / '.next', 'INPLACE_STAGE_DENIED')
    st = os.lstat(STAGED)
    ensure(root_sealed(STAGED) and root_sealed(base), 'STAGE_NOT_ROOT_CONTROLLED')
    allocated = du(STAGED)
    ensure(0 < allocated <= maximum, 'STAGE_EXCEEDS_APPROVED_PEAK_BUDGET')
    essentials = [STAGED / 'package.json',
                  STAGED / '.next/BUILD_ID', STAGED / '.next/server']
    if not all(secure_path(q, base, rootdev, must_exist=False) for q in essentials):
        return {'stage_path': str(STAGED), 'bytes_allocated': allocated,
                'build_complete': False, 'missing_required_evidence':
                [str(q.relative_to(STAGED)) for q in essentials if not q.exists()]}
    ensure(root_sealed(STAGED/'.next'), 'C_NEXT_NOT_ROOT_SEALED')
    ensure(stat.S_ISDIR(os.lstat(STAGED/'node_modules').st_mode) and
           stat.S_ISDIR(os.lstat(STAGED/'.next/server').st_mode),
           'NEXT_RUNTIME_DIRECTORIES_INVALID')
    no_link_regular(STAGED/'package.json', rootdev)
    internal_dependency(STAGED/'node_modules/next/package.json', rootdev)
    next_id = old_next_id(STAGED/'.next')
    source_marker = STAGED/'r24-source-sha'
    ensure(secure_path(source_marker, base, rootdev), 'C_SOURCE_MARKER_MISSING')
    ensure(root_sealed(source_marker) and
           no_link_regular(source_marker, rootdev).st_size <= 128 and
           source_marker.read_text().strip() == SOURCE,
           'C_SOURCE_MARKER_WRONG')
    build_version_file = STAGED/'.aoe2war-build-version'
    ensure(secure_path(build_version_file, base, rootdev), 'C_BUILD_VERSION_MISSING')
    ensure(root_sealed(build_version_file) and
           no_link_regular(build_version_file, rootdev).st_size <= 256,
           'C_BUILD_VERSION_INVALID')
    version = build_version_file.read_text().strip()
    ensure(8 <= len(version) <= 128 and
           all(c.isalnum() or c in '-_' for c in version),
           'C_BUILD_VERSION_INVALID')
    receipt = c_build_receipt(rootdev, next_id, version)
    return {'stage_path': str(STAGED), 'bytes_allocated': allocated,
            'build_complete': True, 'candidate_next_build_id': next_id,
            'candidate_build_version': version,
            'c_build_receipt': receipt,
            'build_source_binding': 'C_ROOT_SEALED_RECEIPT_CHECKED_E_NOT_INDEPENDENT_BUILD_REPRODUCTION',
            'peak_during_build_bytes': 'NOT_OBSERVED_HISTORICALLY',
            'parallel_service_3031': 'NOT_VERIFIED_BY_E',
            'financial_isolation': 'NOT_VERIFIED_BY_E'}


def read_root_receipt(path, rootdev, limit=65536):
    ensure(secure_path(path, Path('/var/lib'), rootdev), 'C_RECEIPT_PATH_INVALID')
    ensure(root_sealed(path) and root_sealed(path.parent), 'C_RECEIPT_NOT_ROOT_SEALED')
    st = no_link_regular(path, rootdev)
    ensure(0 < st.st_size <= limit, 'C_RECEIPT_SIZE_INVALID')
    raw = path.read_bytes()
    ensure(len(raw) == st.st_size, 'C_RECEIPT_CHANGED_DURING_READ')
    try:
        obj = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise Hold('C_RECEIPT_JSON_INVALID') from exc
    ensure(type(obj) is dict, 'C_RECEIPT_JSON_OBJECT_REQUIRED')
    return obj, hashlib.sha256(raw).hexdigest()

def c_build_receipt(rootdev, build_id, build_version):
    # Exact C #1084 writes SOURCE_STAGED and BUILD_STAGED root-only under C_AUDIT.
    # Do not promote a plausible .next folder to a real C build without its receipt.
    source, source_hash = read_root_receipt(C_AUDIT/'SOURCE_STAGED.json', rootdev)
    built, built_hash = read_root_receipt(C_AUDIT/'BUILD_STAGED.json', rootdev)
    ensure(source.get('status') == 'SOURCE_STAGED' and
           source.get('candidate_sha') == SOURCE and
           source.get('git_archive_sha256') == ARCHIVE_SHA256 and
           source.get('old_web_mainpid') == 2625090 and
           source.get('old_web_untouched') is True and
           source.get('new_candidate_started') is False,
           'C_SOURCE_RECEIPT_WRONG')
    ensure(built.get('schema') == 'aoe2war.r25.c.full-built-artifact.v1' and
           built.get('status') == 'BUILD_STAGED' and
           built.get('candidate_sha') == SOURCE and
           built.get('source_git_archive_sha256') == ARCHIVE_SHA256 and
           built.get('build_id') == build_id == C_BUILD_ID and
           built.get('build_version') == build_version == C_BUILD_VERSION and
           built.get('tree_sha256') == C_TREE_SHA256 and
           built.get('root_sealed') is True and
           built.get('old_web_pid_untouched') == 2625090 and
           built.get('new_service_started') is False and
           built.get('financial_writes_authorized') is False and
           isinstance(built.get('tree_sha256'),str) and
           len(built['tree_sha256']) == 64 and
           all(c in '0123456789abcdef' for c in built['tree_sha256']),
           'C_BUILD_RECEIPT_WRONG')
    return {'source_receipt_sha256': source_hash,
            'build_receipt_sha256': built_hash,
            'c_tree_manifest_sha256_claim': built['tree_sha256'],
            'c_build_manifest_independently_rehashed_by_e': False,
            'c_source_commit': SOURCE, 'c_archive_sha256': ARCHIVE_SHA256,
            'old_web_pid_in_receipts': 2625090}

def tree_digest(root, dev):
    """File-content, type and path SHA; never accept symlinks or hardlinks."""
    ensure(stat.S_ISDIR(os.lstat(root).st_mode), 'TREE_ROOT_NOT_DIRECTORY')
    t0 = time.monotonic()
    h = hashlib.sha256()
    todo = [(root, '')]
    entries_count = 0
    total = 0
    while todo:
        ensure(time.monotonic()-t0 <= MAX_TREE_SECONDS, 'TREE_TIMEOUT')
        directory, rel = todo.pop()
        with os.scandir(directory) as it:
            entries = sorted(it, key=lambda v: v.name)
        for e in entries:
            entries_count += 1
            ensure(entries_count <= MAX_TREE_ENTRIES, 'TREE_ENTRIES_LIMIT')
            s = e.stat(follow_symlinks=False)
            ensure(s.st_dev == dev and '\n' not in e.name, 'TREE_PATH_OR_DEV')
            name = (rel + '/' + e.name).lstrip('/').encode('utf-8', 'surrogateescape')
            if stat.S_ISDIR(s.st_mode):
                h.update(b'D\0' + name + b'\0')
                todo.append((Path(e.path), (rel + '/' + e.name).lstrip('/')))
            elif stat.S_ISREG(s.st_mode):
                ensure(s.st_nlink == 1, 'HARDLINKED_TREE_FILE')
                total += s.st_size
                ensure(total <= MAX_TREE_BYTES, 'TREE_BYTES_LIMIT')
                h.update(b'F\0' + name + b'\0' + str(s.st_size).encode() + b'\0')
                with open(e.path, 'rb', buffering=0) as f:
                    while True:
                        ensure(time.monotonic()-t0 <= MAX_TREE_SECONDS, 'TREE_TIMEOUT')
                        chunk = f.read(1024*1024)
                        if not chunk:
                            break
                        h.update(chunk)
                a = e.stat(follow_symlinks=False)
                ensure((a.st_ino, a.st_size, a.st_mtime_ns) ==
                       (s.st_ino, s.st_size, s.st_mtime_ns),
                       'TREE_CHANGED_DURING_READ')
            else:
                raise Hold('TREE_SYMLINK_OR_SPECIAL_FILE')
    return {'sha256': h.hexdigest(), 'entries': entries_count,
            'logical_file_bytes': total}

def durable_evidence(path, old, rootdev, voldev, old_id):
    ensure(path is not None and secure_path(path, VOLUME, voldev),
           'DURABLE_ROLLBACK_MISSING')
    ensure(path != DURABLE and path.is_relative_to(DURABLE),
           'DURABLE_OUTSIDE_ROLLBACK_ROOT')
    ensure(stat.S_ISDIR(os.lstat(path).st_mode), 'DURABLE_NOT_DIRECTORY')
    ensure(old_next_id(path) == old_id, 'DURABLE_BUILD_ID_MISMATCH')
    original = tree_digest(old, rootdev)
    copy = tree_digest(path, voldev)
    ensure(original == copy, 'DURABLE_BYTES_OR_PATH_MISMATCH')
    return {'path': str(path), 'build_id': old_id,
            'old_and_durable_tree_sha256': original['sha256'],
            'entries': original['entries'],
            'logical_file_bytes': original['logical_file_bytes'],
            'content_matched': True, 'rollback_exercised': False}


def discover_prior_next(old_id, voldev):
    """Bounded direct-child rollback census: BUILD_ID only; no other host scan.

    A BUILD_ID match is a locator, not integrity proof. durable_evidence() later
    content-hashes the entire current old Next tree and the selected snapshot.
    """
    ensure(secure_path(DURABLE, VOLUME, voldev), 'ROLLBACK_ROOT_MISSING_OR_UNTRUSTED')
    ensure(stat.S_ISDIR(os.lstat(DURABLE).st_mode), 'ROLLBACK_ROOT_NOT_DIRECTORY')
    with os.scandir(DURABLE) as it:
        items = sorted(it, key=lambda e: e.name)
    ensure(len(items) <= MAX_ROLLBACK_CAMPAIGNS, 'ROLLBACK_CAMPAIGN_COUNT_EXCEEDS_BOUNDED_CENSUS')
    examined = 0
    matches = []
    for item in items:
        if item.is_symlink():
            raise Hold('ROLLBACK_CAMPAIGN_SYMLINK')
        if not item.is_dir(follow_symlinks=False):
            continue
        campaign = DURABLE / item.name
        ensure(secure_path(campaign, VOLUME, voldev), 'ROLLBACK_CAMPAIGN_TRUST_BOUNDARY')
        child = campaign/'prior-next'
        if not child.exists() and not child.is_symlink():
            continue
        ensure(secure_path(child, VOLUME, voldev), 'ROLLBACK_PRIOR_NEXT_UNTRUSTED')
        ensure(stat.S_ISDIR(os.lstat(child).st_mode), 'ROLLBACK_PRIOR_NEXT_NOT_DIRECTORY')
        examined += 1
        bid = child/'BUILD_ID'
        if not bid.exists() and not bid.is_symlink():
            continue
        ensure(secure_path(bid, VOLUME, voldev), 'ROLLBACK_BUILD_ID_UNTRUSTED')
        if old_next_id(child) == old_id:
            matches.append(child)
    ensure(len(matches) <= 1, 'AMBIGUOUS_MATCHING_ROLLBACKS_REQUIRE_EXPLICIT_REVIEW')
    return (matches[0] if matches else None), {
        'scope':str(DURABLE), 'direct_campaign_entries':len(items),
        'prior_next_dirs_checked':examined,
        'matching_current_old_build_id_count':len(matches),
        'selection_policy':'UNIQUE_OLD_BUILD_ID_ONLY;_FULL_BYTES_VERIFIED_SEPARATELY',
        'status':'UNIQUE_CANDIDATE_FOUND' if matches else 'NO_MATCHING_PRIOR_NEXT',
        'selected_path':str(matches[0]) if matches else None}

def host_devices():
    ensure(sys.platform == 'linux' and socket.gethostname().split('.')[0] == HOST
           and os.geteuid() == 0, 'HEL1_ROOT_READONLY_WITNESS_REQUIRED')
    ensure(os.path.ismount(VOLUME), 'VOLUME_NOT_MOUNTED')
    rootdev = Path('/').stat().st_dev
    voldev = VOLUME.stat().st_dev
    ensure(rootdev != voldev, 'VOLUME_IS_ROOT_DEVICE')
    ensure(OLD_WEB.stat().st_dev == rootdev and not OLD_WEB.is_symlink(),
           'ORIGINAL_WEB_NOT_ROOT_NATIVE')
    return rootdev, voldev

def certify(args):
    ensure(0 < args.candidate_max_bytes <= MAX_BUDGET, 'BUDGET_OUTSIDE_8G_MAX')
    rootdev, voldev = host_devices()
    initial = old_process(args.expected_old_pid)
    old = OLD_WEB/'.next'
    ensure(secure_path(old, OLD_WEB, rootdev), 'ORIGINAL_NEXT_ABSENT')
    old_id = old_next_id(old)
    old_alloc, copy_budget = durable_copy_budget(old)
    full_old_alloc = du(OLD_WEB)
    archive = archive_identity()
    stage = stage_evidence(rootdev, args.candidate_max_bytes)
    state = 'BUILD_STAGED' if stage and stage.get('build_complete') else 'SOURCE_STAGED'
    rollback = None
    discovery = None
    selected = Path(args.durable_next) if args.durable_next else None
    if state == 'BUILD_STAGED' and args.discover_prior_next:
        selected, discovery = discover_prior_next(old_id, voldev)
    if state == 'BUILD_STAGED' and selected is not None:
        rollback = durable_evidence(selected, old, rootdev, voldev, old_id)
        state = 'RECOVERY_READY'
    root_free = disk_free(Path('/'))
    vol_free = disk_free(VOLUME)
    root_need = (ROOT_RESERVE if state != 'SOURCE_STAGED' else
                 2 * args.candidate_max_bytes + ROOT_RESERVE)
    # Durable twin already consumes space only when content verification has passed.
    volume_need = VOLUME_RESERVE if rollback else copy_budget + VOLUME_RESERVE
    enough = root_free >= root_need and vol_free >= volume_need
    final = old_process(args.expected_old_pid)
    ensure(initial == final, 'OLD_PROCESS_RESTARTED_DURING_WITNESS')
    ensure(old_id == old_next_id(old), 'OLD_BUILD_CHANGED_DURING_WITNESS')
    report = {'schema': 'aoe2war.e.r25.parallel-website-certificate.v1',
              'observed_utc': datetime.now(timezone.utc).isoformat(),
              'host': HOST, 'phase': state, 'source_sha': SOURCE,
              'archive': archive, 'old_web': {'path': str(OLD_WEB),
              'allocated_total_bytes': full_old_alloc,
              'next_allocated_bytes': old_alloc, 'next_build_id': old_id,
              'process_pre_and_post': initial, 'must_remain_running': True},
              'candidate': stage, 'approved_candidate_peak_budget_bytes':
              args.candidate_max_bytes, 'source_archive_already_allocated_on_root': True,
              'root': {'device': rootdev, 'free_bytes': root_free,
              'required_free_bytes': root_need, 'reserve_bytes': ROOT_RESERVE},
              'volume': {'device': voldev, 'free_bytes': vol_free,
              'required_free_bytes': volume_need, 'reserve_bytes': VOLUME_RESERVE,
              'old_next_copy_budget_bytes': copy_budget},
              'durable_rollback': rollback, 'durable_discovery': discovery,
              'storage_admission': 'PASS_E_READONLY_CAPACITY' if enough else 'HOLD_E_CAPACITY',
              'historical_build_peak_proved': False,
              'c_receipt_source_to_build_binding_checked': bool(stage and stage.get('c_build_receipt')),
              'source_to_build_binding_proved': False,
              'candidate_financial_isolation_proved': False,
              'nginx_or_public_activation_proved': False,
              'release_authorized': False, 'operations_performed': 'READ_ONLY'}
    canonical = json.dumps(report, sort_keys=True, separators=(',', ':'))
    report['certificate_sha256'] = hashlib.sha256(canonical.encode()).hexdigest()
    return report

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--candidate-max-bytes', type=int, required=True)
    p.add_argument('--expected-old-pid', type=int, required=True)
    p.add_argument('--durable-next', default=None)
    p.add_argument('--discover-prior-next', action='store_true')
    p.add_argument('--require-phase', choices=['SOURCE_STAGED','BUILD_STAGED',
                                              'RECOVERY_READY'],default='RECOVERY_READY')
    a = p.parse_args(argv)
    if a.discover_prior_next and a.durable_next:
        p.error('Use either --discover-prior-next or --durable-next, never both')
    try:
        r = certify(a)
        print(json.dumps(r, sort_keys=True))
        if r['storage_admission'] != 'PASS_E_READONLY_CAPACITY':
            print('HOLD:R25_E:CAPACITY',file=sys.stderr)
            return 2
        phases = ['SOURCE_STAGED', 'BUILD_STAGED', 'RECOVERY_READY']
        if phases.index(r['phase']) < phases.index(a.require_phase):
            reason = (':'+r['durable_discovery']['status'] if r.get('durable_discovery') else '')
            print('HOLD:R25_E:PHASE_IS_' + r['phase'] + reason,file=sys.stderr)
            return 2
        print('PASS:R25_E:' + r['phase'] + ':STORAGE_ONLY_NOT_RELEASE_AUTHORIZATION',
              file=sys.stderr)
        return 0
    except (Hold, OSError, ValueError, subprocess.TimeoutExpired) as e:
        print('HOLD:R25_E:' + (str(e) if isinstance(e,Hold) else type(e).__name__),
              file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())
