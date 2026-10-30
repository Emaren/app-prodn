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


def fresh_challenge():
    """Only use uniquely present, fresh, root-owned journaled issue.

    An absent/ambiguous phase remains UNKNOWN; never synthesize a challenge.
    """
    if not STATE.is_dir() or STATE.is_symlink():
        return {}
    try:
        items = []
        for idx, file in enumerate(STATE.iterdir()):
            if idx >= MAX_CHALLENGE_FILES:
                return {}
            if not file.name.endswith("-issue.json") or file.is_symlink():
                continue
            st = file.stat()
            if st.st_uid != 0 or st.st_mode & 0o077 or st.st_size > 16384:
                return {}
            with file.open() as handle:
                payload = json.load(handle)
            if (type(payload) is not dict or payload.get("policy") != POLICY or
                    payload.get("phase") not in ("PRE_STAGE", "PRE_ACTIVATE")):
                continue
            try:
                when = datetime.fromisoformat(
                    payload["expires_at"].replace("Z", "+00:00"))
            except (ValueError, KeyError, AttributeError):
                continue
            if when >= datetime.now(timezone.utc):
                items.append(payload)
        return items[0] if len(items) == 1 else {}
    except (OSError, ValueError, TypeError):
        return {}


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
    output({"schema": 1, "observation": obs, "challenge": fresh_challenge()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
