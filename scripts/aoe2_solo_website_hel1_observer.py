#!/usr/bin/env python3
"""Q19 owner-only release root HEL1 observer, no mutations.

Install only after independent review and root-owned SHA pin. This file
does not sign, attest independently, repair, allocate, read private keys,
checkpoint a live SQLite DB or issue a root nonce. Unknown remains UNKNOWN.
The SSH client uses --read-only-json only.
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

HOST = "ubuntu-4gb-hel1-11"
VOL = "/mnt/HC_Volume_105319120"
REPO = Path("/var/www/AoE2HDBets/app-prodn")
POLICY = "aoe2war.solo-owner.website.admission.v1"
STATE = Path("/var/lib/aoe2war-solo-website-v1")
MAX_CHALLENGE_FILES = 32


def output(obj):
    print(json.dumps(obj, sort_keys=True, separators=(",", ":")))


def command(argv, seconds=5):
    try:
        p = subprocess.run(argv, capture_output=True, timeout=seconds,
                           text=True, check=False)
        return p.stdout.strip() if p.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def source():
    if not REPO.is_dir():
        return None
    value = command(["git", "-C", str(REPO), "rev-parse", "HEAD"])
    return value if value and len(value) == 40 else None


def service():
    return command(["systemctl", "is-active", "aoe2hdbets-web.service"])


def disk():
    if not os.path.ismount(VOL):
        return {"mounted": False, "free_bytes": None,
                "effective_used_pct": None, "finish_used_pct": None}
    s = os.statvfs(VOL)
    total = s.f_blocks * s.f_frsize
    used = (s.f_blocks-s.f_bfree)*s.f_frsize
    free = s.f_bavail*s.f_frsize
    return {
        "mounted": True,
        "free_bytes": free,
        "effective_used_pct": round(100*used/(used+free), 6) if used+free else None,
        "finish_used_pct": round(100*(total-free)/total, 6) if total else None,
    }


def active_build():
    p = REPO / ".next/BUILD_ID"
    try:
        if p.is_symlink() or not p.is_file() or p.stat().st_size > 256:
            return None
        return p.read_text().strip()
    except OSError:
        return None


def fresh_challenge(*, test_expected_uid=None):
    """Only ONE fresh, independently audited and UNCONSUMED root challenge.

    Historical journal entries are immutable and never count against an
    arbitrary directory-entry cap. Consumed PRE_STAGE is not a second
    candidate when its same-attempt PRE_ACTIVATE is issued.
    """
    import re, stat
    if not STATE.is_dir() or STATE.is_symlink():
        return {}
    try:
        expected_uid=0 if test_expected_uid is None else test_expected_uid
        root=STATE.lstat()
        if root.st_uid!=expected_uid or root.st_mode&0o022:
            return {}
        active=[]
        now=datetime.now(timezone.utc)
        for entry in STATE.iterdir():
            if not re.fullmatch(
                r"[0-9a-f]{64}-(PRE_STAGE|PRE_ACTIVATE)-issue[.]json",
                entry.name):
                continue
            meta=entry.lstat()
            if (not stat.S_ISREG(meta.st_mode) or meta.st_uid!=expected_uid or
                    meta.st_mode&0o077 or not 0<meta.st_size<=16384):
                return {}
            with entry.open("rb") as stream:
                raw=stream.read(16385)
            def unique(pairs):
                result={}
                for key,val in pairs:
                    if key in result:raise ValueError("duplicate root challenge")
                    result[key]=val
                return result
            payload=json.loads(raw,object_pairs_hook=unique)
            if (type(payload) is not dict or
                payload.get("policy")!=POLICY or
                payload.get("phase") not in ("PRE_STAGE","PRE_ACTIVATE") or
                payload.get("attempt_id")+"-"+payload.get("phase")+"-issue.json"
                    != entry.name):
                return {}
            expiry=datetime.fromisoformat(
                payload["expires_at"].replace("Z","+00:00"))
            if expiry.tzinfo is None or expiry<=now:
                continue
            used=STATE/(payload["attempt_id"]+"-"+payload["phase"]+"-used.json")
            if used.is_symlink():return {}
            if used.exists():
                used_meta=used.lstat()
                if (not stat.S_ISREG(used_meta.st_mode) or
                    used_meta.st_uid!=expected_uid or used_meta.st_mode&0o077):
                    return {}
                continue
            active.append(payload)
            if len(active)>1:
                return {}  # ambiguous outstanding owner intents: HOLD
        return active[0] if len(active)==1 else {}
    except (OSError,ValueError,TypeError,KeyError,AttributeError):
        return {}

def issued_root_snapshot(challenge):
    """Only exact owner-bound native snapshot written by root issuer counts."""
    if not challenge:
        return None
    a=challenge.get("attempt_id");phase=challenge.get("phase")
    if (type(a) is not str or not __import__("re").fullmatch("[a-f0-9]{64}",a) or
            phase not in ("PRE_STAGE","PRE_ACTIVATE")):
        return None
    path=STATE/(a+"-"+phase+"-observation.json")
    try:
        info=path.lstat()
        if path.is_symlink() or not __import__("stat").S_ISREG(info.st_mode) or (
                info.st_uid!=0 or info.st_mode&0o077 or info.st_size>262144):
            return None
        snap=json.loads(path.read_bytes())
        h=snap["observation"]
        dt=datetime.fromisoformat(h["observed_at"].replace("Z","+00:00"))
        age=(datetime.now(timezone.utc)-dt).total_seconds()
        if not 0<=age<=120:
            return None
        d=disk()
        if (not d["mounted"] or
                type(h.get("free_bytes")) is not int or
                type(d["free_bytes"]) is not int or
                d["free_bytes"] < 30 * 2**30 or
                h["free_bytes"] < 30 * 2**30 or
                # Bounded natural writes are normal; excess drift triggers
                # a new root-issued challenge, never synthetic sameness.
                # Match native issuer reconcile_live: 16 MiB, not the
                # historical permissive 64 MiB observer tolerance.
                abs(d["free_bytes"]-h["free_bytes"]) > 16*2**20 or
                d["effective_used_pct"] > 88 or
                d["finish_used_pct"] >= 92 or
                abs(h.get("effective_used_pct",float("inf"))-
                    d["effective_used_pct"])>0.05 or
                abs(h.get("finish_used_pct",float("inf"))-
                    d["finish_used_pct"])>0.05):
            # The signed snapshot is meaningful only at the issued physical
            # instant. Any drift before signing requires a NEW challenge.
            return None
        if (h.get("source_sha")!=source() or
                h.get("build_id")!=active_build() or
                h.get("web_service")!=service()):
            return None
        return h
    except (OSError,TypeError,KeyError,ValueError,OverflowError):
        return None

def main():
    if sys.argv[1:] != ["--read-only-json"]:
        print("HOLD: ONLY_READ_ONLY_JSON_SUPPORTED", file=sys.stderr)
        return 2
    if (sys.platform != "linux" or os.geteuid() != 0 or
            socket.gethostname() != HOST):
        print("HOLD: WRONG_ROOT_HEL1_HOST", file=sys.stderr)
        return 2
    capacity = disk()
    obs = {
        "origin": "AUTHENTICATED_HEL1_ROOT_SSH",
        "host": HOST,
        "observed_at": datetime.now(timezone.utc).isoformat(
            timespec="seconds").replace("+00:00", "Z"),
        "source_sha": source(),
        "build_id": active_build(),
        "web_service": service(),
        **{k: capacity[k] for k in
           ("free_bytes", "effective_used_pct", "finish_used_pct")},
        "mounted": capacity["mounted"],
        "rollback_available": None,
        "rollback_build_id": None,
        "doctor_p0": None,
        "doctor_p1": None,
        "doctor_signed": False,
        "recovery_verified_classes": [],
        "independent_restore_verdict": "UNKNOWN",
        "wolo_finance_p1": "UNKNOWN",
        "financial_movement_authorized": False,
        "finance_fingerprint_sha256": None,
        "protected_8092_pid": None,
        "protected_8093_pid": None,
        "protected": None,
        "stage_receipt_origin": "UNKNOWN",
        "durable_stage_receipt": None,
        "durable_stage_receipt_sha256": None,
        "staged_artifact_sha256": None,
        "staged_node_modules_sha256": None,
        "staged_build_id": None,
    }
    challenge=fresh_challenge()
    saved=issued_root_snapshot(challenge)
    if saved is not None:
        obs=saved
    else:
        # A challenge with missing/stale native root-issued snapshot MUST
        # NOT be paired with synthetic read-only data.
        challenge={}
    output({"schema": 1, "observation": obs, "challenge": challenge})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
