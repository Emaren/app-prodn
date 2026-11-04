#!/usr/bin/env python3
"""Owner-authorized, root-only second one-use Steam refresh repair for HEL1.

Updates only the source-locked C controller, its timer-driven Steam service,
and its pinned nonfinancial profile. Exact old file preimages, release lock,
public Nginx and 3030/3031/3032 PIDs are attested. The failed earlier owner
cutover grant is not reused. All mutations are backed up to a new durable
journal; a failed transaction restores every affected file byte-for-byte.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import types

HOST = 'ubuntu-4gb-hel1-11'
OLD_CONTROLLER_SHA = '8161731de2af7261dbdc201796fbcdb015d7a9f82facd301f44fb1d57582fec9'
NEW_CONTROLLER_SHA = '93bcfe36b1baefadfec3513a803d9f1afeaf31500df4c0ada6b6eb7c2e74f4cb'
OLD_SERVICE_SHA = 'd57b45a0a4e09b452df115be1245ef8fa7628b269b05bd9270153d801b0f704c'
TIMER_SHA = 'd3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc'
OLD_PROFILE_SHA = 'a73b9ca5823e2bde4999849867cb013b99212098d59d10c0122239c86192b75e'
NGINX_SHA = 'd8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8'
OLD_PID = 2625090
PREVIEW_PID = 1483304
CANDIDATE_PID = 3248760
SOURCE = Path('/var/lib/aoe2war-runtime-artifacts/5869b4ab08702be4b33860f7dda7d97b5de79424/source-qualified-extractor-93bcfe36.py')
CONTROLLER = Path('/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py')
SERVICE = Path('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
TIMER = Path('/etc/systemd/system/aoe2war-steam-egress-refresh.timer')
PROFILE = Path('/etc/aoe2war/web-prod-v1/approved-profile.json')
NGINX = Path('/etc/nginx/sites-available/aoe2war.com')
JOURNAL = Path('/var/lib/aoe2war-app-production-v1/steam-dns-retry-repair-20261104-93bcfe36')
FAILED_JOURNAL = Path('/var/lib/aoe2war-app-production-v1/steam-capability-repair-20261104-65492fd4')
FAILED_ENTERED_SHA = '0f700797e3482abd0d6639a193ab45d4d0788d333b5dd041ea5b7942d100d4a6'
FAILED_HOLD_SHA = '414741a61bba6abf2f5b31124ebf641ef5a7ad27da7956e876a36f325833f618'
SECOND_FAILED_JOURNAL = Path('/var/lib/aoe2war-app-production-v1/steam-setpriv-repair-20261104-f527a379')
SECOND_FAILED_ENTERED_SHA = '5ea5f31800bfa138fe16830147cd4f5c0b946ea3701fe22d11551d1fd8ff3ae4'
SECOND_FAILED_HOLD_SHA = '414741a61bba6abf2f5b31124ebf641ef5a7ad27da7956e876a36f325833f618'

UNITS = (('aoe2hdbets-web.service', OLD_PID), ('aoe2hdbets-web-r24.service', PREVIEW_PID),
         ('aoe2hdbets-web-prod.service', CANDIDATE_PID))


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def need(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def command(*args, timeout=80, input_bytes=None):
    r = subprocess.run(args, input=input_bytes, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, timeout=timeout)
    if r.returncode:
        raise RuntimeError('COMMAND_FAILED:' + args[0] + ':' + r.stderr.decode(errors='replace')[-250:])
    return r.stdout


def properties(name):
    pairs = {}
    for line in command('/usr/bin/systemctl', 'show', name, '--no-pager',
                        '--property=Id,ActiveState,MainPID,Result,NeedDaemonReload').decode().splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            pairs[k] = v
    need(pairs.get('Id') == name, 'SYSTEMD_ID_DRIFT:' + name)
    return pairs


def controlled_files():
    return {CONTROLLER: (OLD_CONTROLLER_SHA, 0o644),
            SERVICE: (OLD_SERVICE_SHA, 0o644),
            TIMER: (TIMER_SHA, 0o644),
            PROFILE: (OLD_PROFILE_SHA, 0o400)}


def check_file(path, expected, mode, owner=0):
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid == owner and st.st_nlink == 1
         and stat.S_IMODE(st.st_mode) == mode, 'FILE_IDENTITY_CHANGED:' + str(path))
    raw = path.read_bytes()
    need(sha(raw) == expected, 'FILE_BYTES_CHANGED:' + str(path))
    return raw


def atomically_replace(path, raw, mode, tag):
    temp = path.with_name('.' + path.name + '.a05-' + tag)
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(temp, mode)
    os.replace(temp, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    need(path.read_bytes() == raw, 'ATOMIC_REPLACEMENT_CHANGED:' + str(path))


def journal_write(name, raw):
    path = JOURNAL / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    fd = os.open(JOURNAL, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def json_bytes(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), allow_nan=False).encode() + b'\n'


def host_unchanged():
    check_file(NGINX, NGINX_SHA, 0o644)
    for name, pid in UNITS:
        p = properties(name)
        need(p['ActiveState'] == 'active' and p['MainPID'] == str(pid),
             'WEB_SERVICE_PID_DRIFT:' + name)
    state = properties('aoe2war-steam-egress-refresh.timer')
    need(state['ActiveState'] == 'active', 'STEAM_TIMER_NOT_ACTIVE')
    for port, version in ((3030, '20261028134227-6c0f6d7531'),
                          (3032, '20261104171049-8504ea08e5')):
        raw = command('/usr/bin/curl', '-fsS', '-m', '5',
                      'http://127.0.0.1:%d/api/deployment-version' % port, timeout=9)
        need(json.loads(raw).get('buildVersion') == version, 'VERSION_DRIFT:' + str(port))


def load_new(raw):
    m = types.ModuleType('source_reviewed_a05_c_capabilities')
    m.__file__ = str(SOURCE)
    exec(compile(raw, str(SOURCE), 'exec'), m.__dict__)
    return m


def requalify_first_failed_maintenance():
    """Pin consumed attempt and byte-for-byte original file restoration.

    This intentionally never edits the failed journal or retries its nonce.
    """
    check_file(FAILED_JOURNAL / 'entered.json', FAILED_ENTERED_SHA, 0o600)
    hold = json.loads(check_file(FAILED_JOURNAL / 'hold.json', FAILED_HOLD_SHA, 0o600))
    need(hold.get('schema') == 'aoe2war.app.a05.steam-capability-maintenance.v1'
         and hold.get('status') == 'HOLD_ORIGINAL_FILES_RESTORED'
         and hold.get('nonce_consumed') is True
         and hold.get('financial_authorized') is False
         and hold.get('public_cutover_authorized') is False
         and 'COMMAND_FAILED:/usr/bin/systemctl' in hold.get('reason','')
         and not (FAILED_JOURNAL / 'commit.json').exists(),
         'PREVIOUS_CONSUMED_MAINTENANCE_NOT_REQUALIFIED')
    for path, name in (
        (CONTROLLER, 'controller.before'),
        (SERVICE, 'service.before'),
        (TIMER, 'timer.before'),
        (PROFILE, 'profile.before'),
    ):
        mode = controlled_files()[path][1]
        expected = controlled_files()[path][0]
        need(check_file(FAILED_JOURNAL / name, expected, 0o600) ==
             check_file(path, expected, mode),
             'PREVIOUS_MAINTENANCE_ORIGINAL_BYTES_CHANGED:' + name)


def requalify_second_failed_maintenance():
    """The consumed second owner maintenance remains immutable and rolled back."""
    check_file(SECOND_FAILED_JOURNAL / 'entered.json',
               SECOND_FAILED_ENTERED_SHA, 0o600)
    hold = json.loads(check_file(SECOND_FAILED_JOURNAL / 'hold.json',
                                 SECOND_FAILED_HOLD_SHA, 0o600))
    need(hold.get('schema') == 'aoe2war.app.a05.steam-capability-maintenance.v1'
         and hold.get('status') == 'HOLD_ORIGINAL_FILES_RESTORED'
         and hold.get('nonce_consumed') is True
         and hold.get('financial_authorized') is False
         and hold.get('public_cutover_authorized') is False
         and 'COMMAND_FAILED:/usr/bin/systemctl' in hold.get('reason','')
         and not (SECOND_FAILED_JOURNAL / 'commit.json').exists(),
         'SECOND_CONSUMED_MAINTENANCE_NOT_REQUALIFIED')
    for path, name in (
        (CONTROLLER, 'controller.before'),
        (SERVICE, 'service.before'),
        (TIMER, 'timer.before'),
        (PROFILE, 'profile.before'),
    ):
        mode = controlled_files()[path][1]
        expected = controlled_files()[path][0]
        need(check_file(SECOND_FAILED_JOURNAL / name, expected, 0o600) ==
             check_file(path, expected, mode),
             'SECOND_MAINTENANCE_ORIGINAL_BYTES_CHANGED:' + name)


def preflight():
    need(os.geteuid() == 0 and socket.gethostname().split('.')[0] == HOST,
         'EXACT_HEL1_ROOT_REQUIRED')
    requalify_first_failed_maintenance()
    requalify_second_failed_maintenance()
    new_source = check_file(SOURCE, NEW_CONTROLLER_SHA, 0o600)
    old = {p: check_file(p, digest, mode)
           for p, (digest, mode) in controlled_files().items()}
    host_unchanged()
    c = load_new(new_source)
    lock = c.LOCK.lstat()
    need((lock.st_dev, lock.st_ino, lock.st_uid, stat.S_IMODE(lock.st_mode)) == c.LOCK_ID,
         'RELEASE_LOCK_IDENTITY_DRIFT')
    policy = json.loads(old[PROFILE])
    need(policy.get('schema') == 'aoe2war.app.approved-production-profile.v1'
         and policy.get('profile') == 'nonfinancial-production-v1'
         and policy.get('source_sha') == '5869b4ab08702be4b33860f7dda7d97b5de79424'
         and policy.get('controller_sha256') == OLD_CONTROLLER_SHA
         and policy.get('port') == 3032, 'PINNED_NONFINANCIAL_PROFILE_DRIFT')
    # Recalculate the replacement service from the exact new C source, and
    # verify the selected DNS resolver now uses PAM-free confined setpriv.
    need('"/usr/bin/setpriv"' in new_source.decode('utf-8') and
         '"--clear-groups","--no-new-privs"' in new_source.decode('utf-8')
         and "STEAM_UID_DNS_CHILD_FAILED_AFTER_3_ATTEMPTS" in new_source.decode('utf-8'),
         'BOUNDED_STEAM_UID_DNS_RETRY_MISSING')
    service, timer = c.production_refresh_units()
    need(timer == old[TIMER] and sha(timer) == TIMER_SHA
         and service != old[SERVICE]
         and b'CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID\n' in service,
         'REVIEWED_SERVICE_SHAPE_MISMATCH')
    refresh = policy.get('refresh_units', {})
    need(refresh.get('service_sha256') == OLD_SERVICE_SHA
         and refresh.get('timer_sha256') == TIMER_SHA
         and isinstance(refresh.get('effective_command_sha256'), str)
         and len(refresh['effective_command_sha256']) == 64,
         'PINNED_REFRESH_IDENTITY_DRIFT')
    modified = json.loads(json.dumps(policy))
    modified['controller_sha256'] = NEW_CONTROLLER_SHA
    modified['refresh_units']['service_sha256'] = sha(service)
    new_profile = json_bytes(modified)
    return c, old, {CONTROLLER: new_source, SERVICE: service, PROFILE: new_profile}, lock


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=('audit', 'apply'), required=True)
    args = parser.parse_args()
    c, old, new, lock_stat = preflight()
    fd = os.open(c.LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        need((st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) == c.LOCK_ID,
             'RELEASE_LOCK_FD_CHANGED')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('RELEASE_LOCK_BUSY')
        # Repeat preflight while holding the release lock.
        c, old, new, _ = preflight()
        need(not JOURNAL.exists() and not JOURNAL.is_symlink(), 'ONE_USE_REPAIR_JOURNAL_ALREADY_PRESENT')
        print('PASS: exact reviewed controller, prior files, original web PIDs and Nginx', flush=True)
        print('EXPECTED_NEW_CONTROLLER_SHA:', NEW_CONTROLLER_SHA, flush=True)
        print('EXPECTED_NEW_SERVICE_SHA:', sha(new[SERVICE]), flush=True)
        print('EXPECTED_NEW_PROFILE_SHA:', sha(new[PROFILE]), flush=True)
        if args.phase == 'audit':
            print('PASS_READONLY_STEAM_CAPABILITY_REPAIR_PREIMAGE', flush=True)
            return
        JOURNAL.mkdir(mode=0o700)
        # Save complete original files before any mutation, preserving modes.
        for path, data in old.items():
            journal_write(('controller' if path == CONTROLLER else
                           'service' if path == SERVICE else
                           'timer' if path == TIMER else 'profile') + '.before', data)
        journal_write('entered.json', json_bytes({
            'schema': 'aoe2war.app.a05.steam-capability-maintenance.v1',
            'status': 'CONSUMED_DO_NOT_REPLAY',
            'source_sha256': NEW_CONTROLLER_SHA,
            'old_profile_sha256': OLD_PROFILE_SHA,
            'old_nginx_sha256': NGINX_SHA,
            'financial_authorized': False,
            'public_cutover_authorized': False,
        }))
        try:
            command('/usr/bin/systemctl', 'stop', 'aoe2war-steam-egress-refresh.timer')
            command('/usr/bin/systemctl', 'stop', 'aoe2war-steam-egress-refresh.service')
            for path, data in new.items():
                atomically_replace(path, data, controlled_files()[path][1], 'setpriv-new')
            command('/usr/bin/systemctl', 'daemon-reload', timeout=45)
            expected_refresh = json.loads(new[PROFILE])['refresh_units']
            need(c.production_refresh_unit_identity() == expected_refresh,
                 'NEW_EFFECTIVE_REFRESH_IDENTITY_NOT_EXACT')
            need(sha(c.canonical(c.production_protected())) ==
                 json.loads(new[PROFILE])['protected_snapshot_sha256'],
                 'PROTECTED_HOST_CHANGED_DURING_MAINTENANCE')
            command('/usr/bin/systemctl', 'reset-failed', 'aoe2war-steam-egress-refresh.service')
            command('/usr/bin/systemctl', 'start', 'aoe2war-steam-egress-refresh.service', timeout=80)
            need(properties('aoe2war-steam-egress-refresh.service').get('Result') == 'success',
                 'REFRESH_ONESHOT_RESULT_FAILED')
            c.production_current_steam_tls()
            command('/usr/bin/systemctl', 'start', 'aoe2war-steam-egress-refresh.timer')
            host_unchanged()
            need(c.production_refresh_unit_identity() == expected_refresh,
                 'REFRESH_EFFECTIVE_IDENTITY_CHANGED_AFTER_START')
            witness = subprocess.run(['/usr/bin/python3', '-I', '-B', str(CONTROLLER),
                                      '--phase', 'production-witness'],
                                     input=json_bytes({'profile_path': str(PROFILE)}),
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=95)
            need(witness.returncode == 0 and
                 json.loads(witness.stdout).get('status') == 'NATIVE_PRODUCTION_PROFILE_PASS',
                 'POST_REPAIR_NATIVE_C_WITNESS_FAILED:' + witness.stdout.decode(errors='replace')[-350:])
            journal_write('commit.json', json_bytes({
                'schema': 'aoe2war.app.a05.steam-capability-maintenance.v1',
                'status': 'PASS_NEW_REFRESH_SERVICE_AND_NATIVE_C_WITNESS',
                'controller_sha256': NEW_CONTROLLER_SHA,
                'service_sha256': sha(new[SERVICE]),
                'profile_sha256': sha(new[PROFILE]),
                'public_nginx_sha256': NGINX_SHA,
                'original_pids_preserved': True,
                'financial_authorized': False,
                'public_cutover_authorized': False,
                'journal': str(JOURNAL)
            }))
            print('PASS_STEAM_REFRESH_SERVICE_AND_NATIVE_C_WITNESS', flush=True)
            print('PASS: timer active; public Nginx and original web PIDs unchanged', flush=True)
            print('JOURNAL:', JOURNAL, flush=True)
        except BaseException as exc:
            restored = True
            try:
                # Restore all three original files (and verify), not just
                # service. The timer's prior contents are unchanged throughout.
                for path in (CONTROLLER, SERVICE, PROFILE):
                    atomically_replace(path, old[path], controlled_files()[path][1], 'setpriv-rollback')
                command('/usr/bin/systemctl', 'daemon-reload', timeout=45)
                command('/usr/bin/systemctl', 'start', 'aoe2war-steam-egress-refresh.timer')
                for path, (digest, mode) in controlled_files().items():
                    check_file(path, digest, mode)
                host_unchanged()
            except BaseException as e:
                restored = False
                print('CRITICAL_ROLLBACK_UNCERTAIN:', type(e).__name__, str(e)[:250], file=sys.stderr)
            journal_write('hold.json', json_bytes({
                'schema': 'aoe2war.app.a05.steam-capability-maintenance.v1',
                'status': 'HOLD_ORIGINAL_FILES_RESTORED' if restored else 'CRITICAL_ROLLBACK_INCOMPLETE',
                'reason_type': type(exc).__name__,
                'reason': str(exc)[:250],
                'nonce_consumed': True,
                'financial_authorized': False,
                'public_cutover_authorized': False
            }))
            raise
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        run()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print('HOLD:STEAM_REFRESH_MAINTENANCE:' + str(error)[:350], file=sys.stderr)
        sys.exit(2)
