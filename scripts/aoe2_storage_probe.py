#!/usr/bin/env python3
"""Read-only local ONE-filesystem probe; no remote agent, no deletion, no source claim.

Run once on the owning host (Mac or HEL1). An unsigned single-plane sample
is always PARTIAL until joined with an authenticated consumer census and
operator attestation by the private three-plane Storage Atlas normalizer.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import plistlib
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from scripts.aoe2_storage_atlas import PLANES, AtlasHold
except ModuleNotFoundError:
    from aoe2_storage_atlas import PLANES, AtlasHold

VOLUME = "/mnt/HC_Volume_105319120"
VOLUME_UUID = "a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42"

def command(argv: list[str], *, timeout: int = 8) -> bytes:
    p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                       check=False, timeout=timeout)
    if p.returncode != 0 or not p.stdout or len(p.stdout) > 128 * 1024:
        raise AtlasHold("read-only filesystem identity command unavailable")
    return p.stdout

def read_identity(plane: str, target: Path) -> dict[str, Any]:
    if plane == "mac":
        if sys.platform != "darwin":
            raise AtlasHold("Mac APFS probe must run on the Mac, never HEL1")
        try:
            info = plistlib.loads(command(["diskutil", "info", "-plist", str(target)]))
        except (ValueError, plistlib.InvalidFileException, OSError, subprocess.TimeoutExpired) as e:
            raise AtlasHold("Mac diskutil identity unavailable") from e
        if not isinstance(info, dict):
            raise AtlasHold("invalid diskutil response")
        fs = str(info.get("FilesystemType") or info.get("FileSystemPersonality") or "").lower()
        uuid = info.get("VolumeUUID") or info.get("APFSVolumeUUID")
        source = info.get("DeviceIdentifier")
        mount = info.get("MountPoint")
        if "apfs" not in fs or not all(isinstance(x, str) and x for x in (uuid,source,mount)):
            raise AtlasHold("Mac APFS Data identity unavailable")
        return {"fs_type": "apfs", "uuid": uuid, "mount_source": "/dev/" + source,
                "mountpoint": mount}
    if sys.platform != "linux":
        raise AtlasHold("HEL1 ext4 probe must run on Linux host")
    try:
        data=json.loads(command(["findmnt", "-J", "-T", str(target),
                                 "-o", "TARGET,SOURCE,FSTYPE,UUID"]))
        rows=data["filesystems"]
        if not isinstance(rows,list) or len(rows)!=1:
            raise AtlasHold("ambiguous mount identity")
        row=rows[0]
    except (KeyError,TypeError,ValueError,OSError,subprocess.TimeoutExpired) as e:
        raise AtlasHold("HEL1 findmnt identity unavailable") from e
    if str(row.get("fstype","")).lower()!="ext4":
        raise AtlasHold("HEL1 filesystem is not ext4")
    uuid,source,mount=row.get("uuid"),row.get("source"),row.get("target")
    if not all(isinstance(x,str) and x for x in (uuid,source,mount)):
        raise AtlasHold("HEL1 mount UUID/source missing")
    if plane=="hel1-root" and mount!="/":
        raise AtlasHold("root source did not mount at /")
    if plane=="hel1-volume-105319120" and (mount!=VOLUME or uuid!=VOLUME_UUID):
        raise AtlasHold("wrong protected volume or UUID")
    if not source.startswith("/dev/"):
        raise AtlasHold("source is not expected block device")
    return {"fs_type":"ext4","uuid":uuid,"mount_source":source,"mountpoint":mount}

def collect_local(plane: str, *, root: Path|None=None,
                  st: Any=None, identity: dict[str,Any]|None=None,
                  source_sha: str|None=None) -> dict[str, Any]:
    if plane not in PLANES:
        raise AtlasHold("unknown storage plane")
    if root is None:
        root=Path.home() if plane=="mac" else Path("/") if plane=="hel1-root" else Path(VOLUME)
    # These injected arguments are TEST ONLY. No public route exists.
    if st is None:
        st=os.statvfs(root)
    if identity is None:
        identity=read_identity(plane,root)
    if source_sha is None:
        source_sha=command(["git","-C",str(Path(__file__).resolve().parents[1]),
                            "rev-parse","HEAD"],timeout=5).decode().strip()
    if len(source_sha)!=40 or any(c not in "0123456789abcdef" for c in source_sha):
        raise AtlasHold("unqualified collector source SHA")
    block=st.f_frsize or st.f_bsize
    if type(block) is not int or block<=0 or any(type(v) is not int or v<0 for v in (st.f_blocks,st.f_bfree,st.f_bavail)):
        raise AtlasHold("statvfs counters unavailable")
    total=st.f_blocks*block;free=st.f_bfree*block;ordinary=st.f_bavail*block
    if total<=0 or free>total or ordinary>free:
        raise AtlasHold("incoherent statvfs accounting")
    return {
        "plane":plane,"coverage":"partial","census_complete":False,
        "mount_verified":True,"filesystem":identity,
        "source":{"collector":"aoe2war-storage-atlas-local-statvfs-v1","source_sha":source_sha},
        "observed_at":dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z"),
        "ttl_seconds":300,
        "capacity":{"total_bytes":total,"free_blocks_bytes":free,"ordinary_free_bytes":ordinary},
        "consumers":[],"issues":["NAMED_CONSUMER_CENSUS_NOT_ATTACHED",
                                "SOURCE_AUTHENTICATION_NOT_VERIFIED"],
        "proposed_reclaim_bytes":0,
        "measured_reclaimed_bytes":0,
    }

def main() -> int:
    ap=argparse.ArgumentParser(description="Read-only single-host Storage OS capacity sample")
    ap.add_argument("--plane",required=True,choices=PLANES)
    args=ap.parse_args()
    try:
        print(json.dumps(collect_local(args.plane),sort_keys=True,indent=2))
        return 0
    except (AtlasHold,OSError,subprocess.TimeoutExpired) as e:
        print(json.dumps({"status":"HOLD","plane":args.plane,"error":str(e)}))
        return 2

if __name__=="__main__":
    raise SystemExit(main())
