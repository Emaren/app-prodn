#!/usr/bin/env python3
"""Read-only, exact-C04 masked listener admission for a byte-pinned V1 snapshot.

This is NOT a substitute for the original C03 observer guard. It operates
*after* V9's exact source/command/ACL attestation, in a fresh V10 release.
The only two admitted historical expectation changes are 8092 and 8093
being CLOSED after the formally accepted C04 unit masks.
"""
from __future__ import annotations

import pathlib
import re
import stat
import hashlib
import subprocess

P = pathlib.Path
QUARANTINE = P('/root/aoe2war-c04-legacy-settlement-quarantine-20261109')
UNIT_DIR = P('/etc/systemd/system')
APPROVED_MASKS = {
    'wolochain-mainnet-settlement.service': '571812b3a13a2e887e434f1e97251a0b87f229859cd245c6ce032db1f317d85b',
    'wolochain-founder-rewards-settlement.service': 'ad5020bb527ae09e389fd2f185779b50146e6ed1085809a2a87eaeb0f29b3392',
}
REQUIRED_CLOSED_PORTS = (8092, 8093, 8094, 8095)
STRICT_OPEN_PORTS = (3030, 3032)
VALIDATOR_UNIT = 'wolochaind-mainnet.service'
VALIDATOR_PID = '1009'
ORIGINAL_LEGACY_PID = '2625090'
MASKED_POLICY_ID = 'C04_PR227_b250461c45b3d74d5202e14d74df8a345e484add'


class C04Hold(RuntimeError):
    pass


def require(value: bool, code: str):
    if not value:
        raise C04Hold('HOLD:' + code)


def command(argv: list[str]):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=12)
    require(p.returncode == 0, 'C04_PROTECTED_COMMAND_FAILED')
    return p.stdout


def state(unit: str):
    # Query each explicitly named property: never infer from socket absence.
    properties = {}
    for name in ('LoadState', 'UnitFileState', 'ActiveState', 'MainPID', 'NeedDaemonReload'):
        properties[name] = command(
            ['/usr/bin/systemctl', 'show', unit, '-p', name, '--value']
        ).strip()
    return properties


def listeners():
    raw = command(['/usr/bin/ss', '-H', '-ltnpe'])
    result = {}
    for port in (*STRICT_OPEN_PORTS, *REQUIRED_CLOSED_PORTS, 5432):
        result[port] = [
            row for row in raw.splitlines()
            if re.search(r':' + str(port) + r'\s', row)
        ]
    return result


def attest():
    require(QUARANTINE.is_dir() and not QUARANTINE.is_symlink()
            and QUARANTINE.stat().st_uid == 0
            and stat.S_IMODE(QUARANTINE.stat().st_mode) == 0o700,
            'C04_ORIGINAL_SOURCE_ARCHIVE_ROOT_ACL')
    for unit, expected in APPROVED_MASKS.items():
        mask = UNIT_DIR / unit
        st = mask.lstat()
        require(stat.S_ISLNK(st.st_mode) and st.st_uid == 0
                and mask.readlink() == P('/dev/null'),
                'C04_MASK_SOURCE_TAMPERED')
        saved = QUARANTINE / (unit + '.preserved-original-before-persistent-mask')
        s = saved.lstat()
        require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1
                and stat.S_IMODE(s.st_mode) == 0o644,
                'C04_ORIGINAL_UNIT_ARCHIVE_ACL')
        require(hashlib.sha256(saved.read_bytes()).hexdigest() == expected,
                'C04_ORIGINAL_UNIT_ARCHIVE_SHA')
        props = state(unit)
        require(props == {
            'LoadState': 'masked', 'UnitFileState': 'masked',
            'ActiveState': 'inactive', 'MainPID': '0',
            'NeedDaemonReload': 'no',
        }, 'C04_MASKED_UNIT_RUNTIME_STATE_DRIFT')
    require(command(['/usr/bin/systemctl', 'show', VALIDATOR_UNIT,
                     '-p', 'MainPID', '--value']).strip() == VALIDATOR_PID,
            'C04_VALIDATOR_PID_DRIFT')
    require(command(['/usr/bin/systemctl', 'show', 'aoe2hdbets-web.service',
                     '-p', 'MainPID', '--value']).strip() == ORIGINAL_LEGACY_PID,
            'C04_LEGACY_WEB_PID_DRIFT')
    found = listeners()
    for port in REQUIRED_CLOSED_PORTS:
        require(len(found[port]) == 0, 'C04_PROTECTED_FINANCIAL_LISTENER_REOPENED')
    for port in STRICT_OPEN_PORTS:
        require(len(found[port]) == 1, 'C04_ORIGINAL_WEB_LISTENER_DRIFT')
    require(1 <= len(found[5432]) <= 2
            and any('127.0.0.1:5432' in row for row in found[5432]),
            'C04_PROTECTED_DATABASE_LISTENER_DRIFT')
    return found


def guarded_snapshot(original_v1_module, original_factory):
    """Call full immutable original guard, allowing precisely TWO proven-closed ports.

    Never patch the real V1 source or C03 guard. The V1 need() override applies
    only during this call, with its original function restored even on exception.
    A changed 3030 or another guard cannot be admitted by the override because
    strict socket counts/port identities were already checked by attest().
    """
    before = attest()
    need = original_v1_module.need
    bypasses = []

    def exact_two_closed_listener_expectations(ok, code):
        if code == 'PROTECTED_LISTENER_NOT_UNIQUE' and ok is False:
            bypasses.append(code)
            require(len(bypasses) <= 2, 'C04_UNEXPECTED_THIRD_LISTENER_EXCEPTION')
            return None
        return need(ok, code)

    original_v1_module.need = exact_two_closed_listener_expectations
    try:
        snapshot = original_factory()
    finally:
        original_v1_module.need = need
    require(len(bypasses) == 2, 'C04_MASKED_V1_EXPECTATION_COUNT_DRIFT')
    sockets = snapshot.get('protected_sockets', {})
    require(sockets.get('8092') == [] and sockets.get('8093') == []
            and len(sockets.get('3030', [])) == 1
            and 1 <= len(sockets.get('5432', [])) <= 2,
            'C04_SNAPSHOT_MASKED_LISTENER_CONTENT_DRIFT')
    after = attest()
    require(before == after, 'C04_PROTECTED_SOCKET_TOCTOU_DRIFT')
    return snapshot
