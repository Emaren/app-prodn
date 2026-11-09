#!/usr/bin/env python3
"""One-shot exact V9->C04-masked V10 STEAM ONLY transition, with fail-shut restore."""
from __future__ import annotations

import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import time

P = pathlib.Path
ROOT = P('/root/aoe2war-app-c04-steam-v10-inert-20261109')
V10 = ROOT / 'r25_steam_refresh_traffic_v10.py'
HELPER = ROOT / 'r25_c04_masked_listener_guard_v10.py'
SRC_DIR = P('/usr/local/lib/aoe2war-web-prod')
MAIN_INSTALL = SRC_DIR / V10.name
HELPER_INSTALL = SRC_DIR / HELPER.name
UNIT = P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
TIMER = P('/etc/systemd/system/aoe2war-steam-egress-refresh.timer')
BACKUP = ROOT / 'steam-v9-original-unit-pre-c04-v10.service'
RECEIPT = ROOT / 'exact-c04-steam-v10-live-admission-receipt.json'
OLD_UNIT_SHA = '0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557'
NEW_UNIT_SHA = 'f5d08beebca0912e8271fddf891983ac80b60d148e7e2242cd34832bb0a55176'
TIMER_SHA = 'd3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc'
MAIN_SHA = '19f19b81139a77b8c03c1011efef6d99640d9b133c5c5c630ff9b982f922ce0e'
HELPER_SHA = '6f236e35878f069b5190cc7a9abbfc2cd312a8aaf4c352752208550406d82e9e'
PROTECTED_C04_SHA = '064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c'
LEGACY_WEB_UNIT_SHA = '42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
STEAM_UNIT_NAME = 'aoe2war-steam-egress-refresh.service'
STEAM_TIMER_NAME = 'aoe2war-steam-egress-refresh.timer'
OLD = b'r25_steam_refresh_traffic_v9.py'
NEW = b'r25_steam_refresh_traffic_v10.py'


class ReleaseHold(Exception):
    pass


def require(ok, reason):
    if not ok:
        raise ReleaseHold('HOLD_' + reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def file(source, mode=None):
    st = source.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1,
            'INSTALL_FILE_ROOT_OR_LINK_DRIFT_' + source.name)
    if mode is not None:
        require(stat.S_IMODE(st.st_mode) == mode, 'INSTALL_MODE_DRIFT_' + source.name)
    return source.read_bytes()


def run(args, timeout=45):
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       text=True, timeout=timeout)
    require(p.returncode == 0, 'COMMAND_FAILED_' + args[0].split('/')[-1])
    return p.stdout.strip()


def unit_prop(unit, prop):
    return run(['systemctl', 'show', unit, '-p', prop, '--value'], 12)


def load():
    spec = importlib.util.spec_from_file_location('c04_reviewed_v10', str(V10))
    require(spec is not None and spec.loader is not None, 'V10_MODULE_UNAVAILABLE')
    v = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v)
    v.C04_HELPER = HELPER
    return v


def source_preflight():
    require(os.geteuid() == 0, 'ROOT_REQUIRED')
    require(ROOT.is_dir() and ROOT.stat().st_uid == 0 and
            stat.S_IMODE(ROOT.stat().st_mode) == 0o700, 'ROOT_ONLY_STAGE_IDENTITY')
    require(sha(file(V10, 0o644)) == MAIN_SHA, 'V10_INERT_SOURCE_SHA')
    require(sha(file(HELPER, 0o644)) == HELPER_SHA, 'C04_INERT_GUARD_SHA')
    require(sha(file(TIMER, 0o644)) == TIMER_SHA, 'STEAM_ORIGINAL_TIMER_SHA')
    require(sha(file(P('/etc/systemd/system/aoe2hdbets-web-prod.service'),0o644)) ==
            LEGACY_WEB_UNIT_SHA,'R25_RESTRICTED_PRODUCTION_UNIT_SHA')
    require(sha(file(UNIT, 0o644)) == OLD_UNIT_SHA, 'V9_STEAM_UNIT_SHA')
    require(unit_prop(STEAM_TIMER_NAME, 'ActiveState') == 'active',
            'V9_TIMER_NOT_ACTIVE')
    require(unit_prop(STEAM_UNIT_NAME, 'MainPID') == '0',
            'STEAM_ONESHOT_CURRENTLY_ACTIVE')
    require(unit_prop(STEAM_UNIT_NAME, 'NeedDaemonReload') == 'no',
            'STEAM_DAEMON_RELOAD_PENDING')
    require(unit_prop(STEAM_UNIT_NAME, 'DropInPaths') == '',
            'STEAM_UNIT_SHADOW_DROPIN')
    require(unit_prop('aoe2hdbets-web-prod.service','MainPID') == '3750280',
            'WEB_R25_PID_CHANGED')
    require(unit_prop('wolochaind-mainnet.service','MainPID') == '1009',
            'CHAIN_VALIDATOR_PID_CHANGED')
    source = file(UNIT)
    require(source.count(OLD) == 1 and source.count(NEW) == 0,
            'V9_COMMAND_NOT_EXACTLY_ONCE')
    future = source.replace(OLD,NEW)
    require(sha(future) == NEW_UNIT_SHA, 'V10_UNIT_NOT_EXACT_SINGLE_REPLACEMENT')
    v = load()
    for attempt in range(4):
        try:
            _,m,f = v.native_snapshot()
            require(f == PROTECTED_C04_SHA, 'C04_MASKED_V1_FINGERPRINT_BEFORE_SWITCH')
            break
        except Exception:
            if attempt == 3: raise
            time.sleep(2)
    print('PASS_PREPARED_OLD_UNIT_EXACT_SOURCE_C03_MASKED_V1_PROTECTED_GUARD',
          flush=True)
    return v, source, future


def copy_source(src, dest, expected):
    require(not dest.exists() and not dest.is_symlink(),
            'SOURCE_ALREADY_INSTALLED_' + dest.name)
    with dest.open('xb') as fd:
        os.fchmod(fd.fileno(), 0o644)
        fd.write(src.read_bytes())
        fd.flush()
        os.fsync(fd.fileno())
    require(sha(file(dest,0o644)) == expected, 'INSTALLED_SOURCE_IDENTITY')


def persist_unit(data):
    tmp = UNIT.with_name('.' + UNIT.name + '.c04-v10-new')
    require(not tmp.exists(), 'EXISTING_UNIT_TRANSITION_TEMP')
    fd = os.open(tmp, os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW, 0o644)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, UNIT)


def phase_activate():
    v,original,new = source_preflight()
    require(not BACKUP.exists() and not RECEIPT.exists(), 'ALREADY_ATTEMPTED')
    require(not MAIN_INSTALL.exists() and not HELPER_INSTALL.exists(),
            'V10_ALREADY_PARTIALLY_INSTALLED')
    # root-private source backup, before ANY live mutation
    fd = os.open(BACKUP, os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd,'wb') as f:
        f.write(original);f.flush();os.fsync(f.fileno())
    require(sha(file(BACKUP,0o600)) == OLD_UNIT_SHA, 'ROLLBACK_BACKUP_NOT_IDENTICAL')
    copy_source(HELPER, HELPER_INSTALL, HELPER_SHA)
    copy_source(V10, MAIN_INSTALL, MAIN_SHA)
    target = P('/etc/aoe2war/web-prod-v10')
    require(not target.exists(), 'POLICY_ROOT_PREEXISTS')
    target.mkdir(mode=0o500)
    require(target.stat().st_uid == 0 and stat.S_IMODE(target.stat().st_mode)==0o500,
            'NEW_POLICY_ROOT_NOT_PRIVATE')
    switched = False
    try:
        run(['systemctl','stop',STEAM_TIMER_NAME],25)
        run(['systemctl','stop',STEAM_UNIT_NAME],25)
        require(unit_prop(STEAM_UNIT_NAME,'MainPID') == '0','EXISTING_STEAM_PID')
        persist_unit(new)
        switched=True
        require(sha(file(UNIT,0o644)) == NEW_UNIT_SHA,'INSTALLED_NEW_UNIT_DRIFT')
        run(['systemctl','daemon-reload'],30)
        require(unit_prop(STEAM_UNIT_NAME,'NeedDaemonReload') == 'no',
                'NEW_STEAM_UNIT_NOT_RELOADED')
        cmd = unit_prop(STEAM_UNIT_NAME,'ExecStart')
        require(cmd.count('r25_steam_refresh_traffic_v10.py') == 1
                and 'r25_steam_refresh_traffic_v9.py' not in cmd,
                'EFFECTIVE_LOADED_STEAM_COMMAND_DRIFT')
        for phase in ('selftest','inspect'):
            run(['/usr/bin/python3','-I','-B',str(MAIN_INSTALL),'--phase',phase],55)
        # Health checks and protected policy are sourced from actual R25 at 3032.
        enrolled=run(['/usr/bin/python3','-I','-B',str(MAIN_INSTALL),
                      '--phase','enroll','--profile','candidate'],110)
        payload=json.loads(enrolled)
        require(payload['status']=='PASS_EXACT_STEAM_V10_ADMISSION'
                and payload['finance_authorized'] is False,
                'V10_CANDIDATE_ENROLLMENT_FAILED')
        run(['systemctl','reset-failed',STEAM_UNIT_NAME],20)
        run(['systemctl','start',STEAM_UNIT_NAME],70)
        require(unit_prop(STEAM_UNIT_NAME,'Result')=='success'
                and unit_prop(STEAM_UNIT_NAME,'ExecMainStatus')=='0',
                'STEAM_EFFECTIVE_REFRESH_NOT_SUCCESS')
        run(['systemctl','start',STEAM_TIMER_NAME],20)
        require(unit_prop(STEAM_TIMER_NAME,'ActiveState')=='active',
                'STEAM_TIMER_NOT_RESUMED')
        assert v is not None
        final=json.loads(run(['/usr/bin/python3','-I','-B',str(MAIN_INSTALL),
                              '--phase','inspect'],55))
        require(final['status']=='PASS_STEAM_V10_PROTECTED_READONLY'
                and final['protected_snapshot_sha256']==PROTECTED_C04_SHA,
                'V10_FINAL_C03_C04_NFT_PROTECTED_CHECK_FAILED')
        # Repeat finance-safety proof at the physical admission point.
        v.C04_HELPER = HELPER_INSTALL
        require(v.native_snapshot()[2]==PROTECTED_C04_SHA,
                'FINAL_MASKED_V1_C03_TOPOLOGY_DRIFT')
        doc={'schema':'aoe2war.app.C04-masked-steam-v10-live-recovery.v1',
            'status':'PASS_PHYSICAL_STEAM_V10_C03_C04_SOURCE_BOUND_ADMISSION',
            'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'oldSteamUnitSha256':OLD_UNIT_SHA,'newSteamUnitSha256':NEW_UNIT_SHA,
            'newScriptSha256':MAIN_SHA,'newC04GuardSha256':HELPER_SHA,
            'unchangedSteamTimerSha256':TIMER_SHA,
            'actualC04ProtectedFingerprint':PROTECTED_C04_SHA,
            'enrolled':payload,'finalInspect':final,
            'financeAuthorized':False,'financialPortsOpened':False,
            'originalC03ObserverChanged':False,'fundedTransferSigned':False}
        raw=(json.dumps(doc,sort_keys=True,indent=2)+'\n').encode()
        fd=os.open(RECEIPT, os.O_EXCL|os.O_CREAT|os.O_WRONLY, 0o600)
        with os.fdopen(fd,'wb') as f:
            f.write(raw);f.flush();os.fsync(f.fileno())
        print('PASS_LIVE_STEAM_V10_REFRESH_WITH_C04_MASKS',flush=True)
        print('RECEIPT_SHA256',sha(raw),flush=True)
        print('ENROLLED_POLICY_SHA256',payload['policy_sha256'],flush=True)
    except BaseException as exc:
        print('HOLD_V10_ACTIVATION',type(exc).__name__,str(exc),flush=True)
        if switched:
            try:
                run(['systemctl','stop',STEAM_TIMER_NAME],25)
                run(['systemctl','stop',STEAM_UNIT_NAME],25)
                persist_unit(file(BACKUP,0o600))
                run(['systemctl','daemon-reload'],30)
                require(sha(file(UNIT,0o644)) == OLD_UNIT_SHA,
                        'V9_RECOVERY_UNIT_HASH_MISMATCH')
                run(['systemctl','start',STEAM_TIMER_NAME],20)
                print('PASS_ROLLBACK_ORIGINAL_V9_SOURCE_RESTORED_UNDER_C04_HOLD',
                      flush=True)
            except Exception as e:
                print('HOLD_AUTOMATIC_V9_SOURCE_BACKOUT',repr(e),flush=True)
        raise


if __name__=='__main__':
    try:
        require(len(sys.argv) == 2 and sys.argv[1]=='--activate',
                'EXACT_ACTIVATION_FLAG_REQUIRED')
        phase_activate()
    except Exception as ex:
        print(type(ex).__name__,str(ex),flush=True)
        sys.exit(3)
