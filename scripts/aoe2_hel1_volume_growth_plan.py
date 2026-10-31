#!/usr/bin/env python3
"""HEL1 R18 exact mounted-volume growth PRE/POST read-only identity gate.

This script NEVER calls a cloud API, increases a volume, grows a filesystem,
reads live databases, signs evidence, or grants any release authorization.
The provider quote is owner-transcribed and deliberately classified UNSIGNED.
"""
from __future__ import annotations
import argparse
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone

MOUNT = Path('/mnt/HC_Volume_105319120')
SOURCE = '/dev/sdb'
ID = '105319120'
HOST = 'ubuntu-4gb-hel1-11'
GIB = 1024 ** 3
GB = 10 ** 9
CHANGE_GB = 25

class Hold(RuntimeError):
    pass

def require(condition, code):
    if not condition:
        raise Hold(code)

def run_read(argv):
    p = subprocess.run(argv, stdin=subprocess.DEVNULL, capture_output=True,
                       text=True, timeout=8, check=False)
    require(p.returncode == 0 and len(p.stdout) <= 16384,
            'NATIVE_READ_FAILED_'+Path(argv[0]).name)
    return p.stdout

def ceildiv(a, b):
    return -(-a // b)

def capacity(total, used, available):
    require(all(type(n) is int and n >= 0 for n in (total, used, available))
            and total > 0 and used + available > 0 and used <= total,
            'INVALID_ATTACHED_FS_GEOMETRY')
    return {'total_bytes': total, 'used_bytes': used,
            'available_bytes': available,
            'available_gib': round(available / GIB, 6),
            'effective_used_pct': round(100 * used / (used + available), 6),
            'finish_used_pct': round(100 * (total - available) / total, 6)}

def capacity_pass(cap):
    return (cap['available_bytes'] >= 30 * GIB and
            100 * cap['used_bytes'] <= 88 * (cap['used_bytes'] + cap['available_bytes']) and
            100 * (cap['total_bytes'] - cap['available_bytes']) < 92 * cap['total_bytes'])

def required_extra_usable(total, used, available):
    # The proposed additional usable capacity x adds x to both T and F.
    # For strict finish: 100*(T-F) < 92*(T+x), x integer.
    floor = max(0, 30 * GIB - available)
    effective = max(0, ceildiv(3 * used, 22) - available)
    finish = max(0, ((100 * (total - available) - 92 * total) // 92) + 1)
    return max(floor, effective, finish)

def validate_identity(host, uid, ismount, mount_dev, root_dev,
                      mount_source, fstype, target, disk, model, serial, disk_bytes):
    require(host == HOST and uid == 1000 and sys.platform == 'linux',
            'WRONG_HEL1_UID_HOST_OR_OS')
    require(ismount is True and mount_dev != root_dev,
            'ATTACHED_MOUNT_NOT_DISTINCT')
    require(mount_source == SOURCE and fstype == 'ext4' and target == str(MOUNT),
            'UNEXPECTED_VOLUME_MOUNT_OR_FILESYSTEM')
    require(disk == 'sdb' and serial == ID and
            model.strip().lower() in ('volume', 'hetzner volume') and disk_bytes > 0,
            'HETZNER_VOLUME_SERIAL_IDENTITY_MISMATCH')

def get_live():
    require(sys.platform == 'linux' and os.geteuid() == 1000 and
            socket.gethostname().split('.')[0] == HOST,
            'WRONG_HEL1_UID_HOST_OR_OS')
    require(os.path.ismount(MOUNT), 'ATTACHED_MOUNT_NOT_MOUNTED')
    mount_stat = MOUNT.stat()
    require(mount_stat.st_dev != Path('/').stat().st_dev,
            'ATTACHED_MOUNT_NOT_DISTINCT')
    found = json.loads(run_read(['/usr/bin/findmnt', '-J', '-T', str(MOUNT),
                                 '-o', 'SOURCE,FSTYPE,TARGET']))
    rows = found.get('filesystems')
    require(type(rows) is list and len(rows) == 1 and type(rows[0]) is dict,
            'AMBIGUOUS_FINDMNT_TARGET')
    fs = rows[0]
    block = json.loads(run_read(['/usr/bin/lsblk', '-J', '-b', '-d',
                                '-o', 'NAME,TYPE,SIZE,MODEL,SERIAL', SOURCE]))
    disks = block.get('blockdevices')
    require(type(disks) is list and len(disks) == 1 and type(disks[0]) is dict,
            'AMBIGUOUS_BLOCK_DEVICE')
    drive = disks[0]
    require(drive.get('type') == 'disk' and
            type(drive.get('size')) is int, 'BLOCK_DISK_TYPE_OR_SIZE_UNKNOWN')
    validate_identity(socket.gethostname().split('.')[0], os.geteuid(), True,
                      mount_stat.st_dev, Path('/').stat().st_dev,
                      fs.get('source'), fs.get('fstype'), fs.get('target'),
                      drive.get('name'), drive.get('model') or '',
                      str(drive.get('serial') or ''), drive['size'])
    v = os.statvfs(MOUNT)
    total = v.f_blocks * v.f_frsize
    used = (v.f_blocks - v.f_bfree) * v.f_frsize
    available = v.f_bavail * v.f_frsize
    require(drive['size'] >= total and drive['size'] <= 10 * 10**12,
            'BLOCK_DEVICE_SMALLER_THAN_MOUNTED_FS_OR_OVERSIZE')
    return capacity(total, used, available), drive['size'], mount_stat.st_dev

def check_quote(current, after, quoted, disk_bytes, phase):
    require(type(current) is int and 10 <= current <= 10000 and
            type(after) is int and after == current + CHANGE_GB and
            after <= 10000, 'EXACT_25GB_CONSOLE_SIZE_CHANGE_REQUIRED')
    try:
        money = Decimal(quoted)
    except InvalidOperation as exc:
        raise Hold('UNPARSEABLE_PRICE_QUOTE') from exc
    require(money.is_finite() and Decimal('0') < money < Decimal('10000'),
            'OWNER_CONSOLE_QUOTE_REQUIRED')
    # Device bytes can vary modestly from provider-declared decimal GB.
    expected = (current if phase == 'plan' else after) * GB
    require(abs(disk_bytes - expected) <= 1 * GB,
            'PROVIDER_GB_DOES_NOT_MATCH_PHYSICAL_BLOCK_DEVICE')
    return str(money)

def report(cap, disk_bytes, dev, args):
    price = check_quote(args.console_current_gb, args.console_target_gb,
                        args.console_incremental_eur_month, disk_bytes, args.phase)
    required = required_extra_usable(cap['total_bytes'], cap['used_bytes'],
                                     cap['available_bytes'])
    # 92% is a conservative forecast, not an ext4 guarantee.
    conservative_usable = (CHANGE_GB * GB * 92) // 100
    verdict = ('PASS_READ_ONLY_CAPACITY' if capacity_pass(cap) else
               'HOLD_CAPACITY_BELOW_ADMISSION')
    if args.phase == 'plan':
        require(conservative_usable > required + 3 * GIB,
                'EXACT_25GB_CHANGE_INSUFFICIENT_MARGIN')
    if args.phase == 'post-fs':
        require(capacity_pass(cap), 'POST_FS_CAPACITY_GATE_HOLD')
    return {
        'schema': 'aoe2war.e.hel1.volume-change-read-only.v1',
        'phase': args.phase,
        'observed_at_utc': datetime.now(timezone.utc).isoformat(),
        'origin': 'OWNER_NATIVE_UNSIGNED_NOT_SIGNED_ADMISSION',
        'host': HOST, 'operator_uid': 1000,
        'attached_mount': str(MOUNT), 'mount_device_id': dev,
        'block_device': SOURCE, 'filesystem': 'ext4',
        'hetzner_volume_id_from_native_serial': ID,
        'hetzner_console_volume_id_owner_typed': args.console_volume_id,
        'block_device_bytes': disk_bytes,
        'provider_size_before_gb_owner_typed': args.console_current_gb,
        'provider_size_after_gb_owner_typed': args.console_target_gb,
        'provider_incremental_eur_month_owner_typed': price,
        'provider_price_proof': 'OWNER_TYPED_UNVERIFIED_BY_PROVIDER_API',
        'proposed_grow_decimal_gb': CHANGE_GB,
        'conservative_added_usable_bytes_FORECAST_NOT_CERTIFIED': conservative_usable,
        'current_required_added_usable_bytes': required,
        'capacity': cap,
        'capacity_verdict': verdict,
        'restored_classes_physically_accepted': 'NOT_OBSERVED_BY_THIS_TOOL',
        'finance_mutations': False,
        'cloud_action_or_fs_resize_performed': False,
        'release_authorization': 'NONE'
    }

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('phase', choices=['plan', 'post-provider', 'post-fs'])
    p.add_argument('--console-volume-id', required=True)
    p.add_argument('--console-current-gb', type=int, required=True)
    p.add_argument('--console-target-gb', type=int, required=True)
    p.add_argument('--console-incremental-eur-month', required=True)
    a = p.parse_args(argv)
    try:
        require(re.fullmatch(r'[0-9]{6,12}', a.console_volume_id) and
                a.console_volume_id == ID, 'CONSOLE_VOLUME_ID_MUST_MATCH_NATIVE')
        c, disk_bytes, dev = get_live()
        print(json.dumps(report(c, disk_bytes, dev, a), sort_keys=True))
        return 0
    except (Hold, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as exc:
        print('HOLD:', str(exc), file=sys.stderr)
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
