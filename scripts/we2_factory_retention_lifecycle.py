#!/usr/bin/env python3
"""Read-only post-T10 Factory inventory and fail-closed disposable-cache policy.

Installed protected runtime, rollback, emergency, signed receipts, security logs,
database, custody and financial files are NEVER deletion candidates. This tool
does not replace the existing Factory; automatic operation requires separately
reviewed source, root enrollment and explicit nonprotected-cache enrollment.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
import re
import stat
from pathlib import Path

SCHEMA = "aoe2war.we2.factory-retention-inventory.v1"
DISPOSABLE = "rebuildable-part-cache-v1"
HEX = re.compile(r"^[a-f0-9]{64}$")
SHA40 = re.compile(r"^[a-f0-9]{40}$")
BUILD = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
STATES = {"ACTIVE", "ROLLBACK", "EMERGENCY", "RETAINED", "RETIRABLE"}
GIB = 1024 ** 3
MARGIN = 512 * 1024 ** 2


class RetentionHold(RuntimeError):
    pass


def need(condition: bool, reason: str) -> None:
    if not condition:
        raise RetentionHold("HOLD_FACTORY_RETENTION_" + reason)


def canon(data: object) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def checked(path: Path, max_bytes: int, owner: int | None = None) -> bytes:
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and
         1 <= st.st_size <= max_bytes and not stat.S_ISLNK(st.st_mode),
         "FILE_TYPE_OR_SIZE")
    if owner is not None:
        need(st.st_uid == owner, "FILE_OWNER")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        a = os.fstat(fd)
        content = b""
        while len(content) < a.st_size:
            block = os.read(fd, min(4 * 1024 * 1024, a.st_size - len(content)))
            need(block, "UNEXPECTED_EOF")
            content += block
        b = os.fstat(fd)
        need((a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) ==
             (b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns), "FILE_CHANGED")
        return content
    finally:
        os.close(fd)


def seal_identity(directory: Path, owner: int | None = 0) -> dict:
    """Parse actual immutable T10 evidence; never infer a seal from a name."""
    st = directory.lstat()
    need(st.st_uid == owner if owner is not None else True, "SEAL_DIR_OWNER")
    need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode),
         "SEAL_DIR_TYPE")
    raw = checked(directory / "release-seal-v1.json", 8192, owner)
    j = json.loads(raw)
    need(j.get("schema") == "aoe2war.product.release-seal.v1" and
         j.get("financialAuthorized") is False and
         isinstance(j.get("sourceSha"), str) and SHA40.fullmatch(j["sourceSha"]) and
         isinstance(j.get("buildId"), str) and BUILD.fullmatch(j["buildId"]) and
         all(isinstance(j.get(k), str) and HEX.fullmatch(j[k]) for k in
             ("ledgerSha256", "summarySha256", "lastEventHash")),
         "SEAL_SCHEMA_OR_AUTHORITY")
    events = checked(directory / "release-events-v1.jsonl", 2 * 1024 * 1024, owner)
    summary = checked(directory / "release-summary-v1.json", 65536, owner)
    need(sha(events) == j["ledgerSha256"] and
         sha(summary) == j["summarySha256"], "SEAL_LEDGER_HASH")
    summary_json = json.loads(summary)
    need(summary_json.get("sourceSha") == j["sourceSha"] and
         summary_json.get("buildId") == j["buildId"] and
         any(x.get("event") == "T10" and x.get("state") == "pass"
             for x in summary_json.get("stages", [])), "T10_NOT_ACCEPTED")
    return {"sourceSha": j["sourceSha"], "buildId": j["buildId"],
            "receiptSha256": sha(raw), "ledgerSha256": j["ledgerSha256"],
            "sealDirectory": str(directory)}


def classify(releases: list[dict], *, active: str, rollback: str,
             emergency: str, explicitly_recoverable: set[str] | None = None) -> list[dict]:
    need(len({x["sourceSha"] for x in releases}) == len(releases),
         "DUPLICATE_RELEASE_SOURCE")
    need(all(SHA40.fullmatch(x) for x in (active, rollback, emergency)),
         "PROTECTED_SOURCE_UNKNOWN")
    need(len({active, rollback, emergency}) == 3, "PROTECTED_SOURCES_NOT_DISTINCT")
    out = []
    for item in releases:
        source = item["sourceSha"]
        status = ("ACTIVE" if source == active else
                  "ROLLBACK" if source == rollback else
                  "EMERGENCY" if source == emergency else
                  "RETIRABLE" if source in (explicitly_recoverable or set())
                  else "RETAINED")
        out.append({**item, "retentionState": status,
                    "automaticDeletePermitted": False,
                    "requiresExactRecoveryPermit": status == "RETIRABLE"})
    return out


def disk_admission(available: int, incoming: int, extracted: int,
                   archive_cached: bool) -> dict:
    need(all(type(x) is int and 0 <= x <= 10 * GIB for x in
             (available, incoming, extracted)), "CAPACITY_VALUES")
    required = (max(6 * GIB, extracted + GIB) if archive_cached else
                max(6 * GIB + incoming, incoming + extracted + GIB))
    return {"availableBytes": available, "factoryMinimumBytes": required,
            "reserveMarginBytes": MARGIN, "admission":
            "PASS" if available >= required + MARGIN else "HOLD",
            "shortfallWithMarginBytes": max(0, required + MARGIN - available)}


def verify_disposable_cache(plan: dict, key: bytes, *, now: dt.datetime,
                            approved_dir: Path) -> list[dict]:
    """No protected releases, stage archives or arbitrary paths accepted."""
    need(type(plan) is dict and set(plan) ==
         {"payload", "hmac_sha256"}, "CLEANUP_PLAN_FIELDS")
    p = plan["payload"]
    need(type(p) is dict and set(p) ==
         {"schema", "class", "issuedAt", "expiresAt", "items",
          "financialAuthorized", "protectedArtifactAuthorized",
          "ownerApprovedCacheClass"}, "CLEANUP_PAYLOAD_FIELDS")
    need(p["schema"] == "aoe2war.we2.factory-disposable-cache.v1" and
         p["class"] == DISPOSABLE and
         p["financialAuthorized"] is False and
         p["protectedArtifactAuthorized"] is False and
         p["ownerApprovedCacheClass"] is True, "CLEANUP_AUTHORITY")
    need(type(key) is bytes and len(key) == 32 and
         type(plan["hmac_sha256"]) is str and HEX.fullmatch(plan["hmac_sha256"]),
         "CLEANUP_SIGNER")
    expected = hmac.new(key, b"AOE2WAR_FACTORY_DISPOSABLE_V1\0" + canon(p),
                        hashlib.sha256).hexdigest()
    need(hmac.compare_digest(expected, plan["hmac_sha256"]), "CLEANUP_SIGNATURE")
    try:
        issued = dt.datetime.fromisoformat(p["issuedAt"].replace("Z", "+00:00"))
        expires = dt.datetime.fromisoformat(p["expiresAt"].replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise RetentionHold("HOLD_FACTORY_RETENTION_CLEANUP_CLOCK") from None
    need(now.tzinfo is not None and issued <= now < expires and
         expires <= issued + dt.timedelta(minutes=10), "CLEANUP_EXPIRY")
    st = approved_dir.lstat()
    need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode) and
         st.st_uid == os.geteuid() and stat.S_IMODE(st.st_mode) == 0o700,
         "CLEANUP_CACHE_ROOT")
    items = p["items"]
    need(type(items) is list and 1 <= len(items) <= 32, "CLEANUP_ITEM_COUNT")
    names = set()
    for item in items:
        need(type(item) is dict and set(item) ==
             {"name", "sha256", "bytes", "inode", "mtimeNs"}, "CLEANUP_ITEM_FIELDS")
        name = item["name"]
        need(type(name) is str and re.fullmatch(r"[a-zA-Z0-9_-]{16,64}\.part", name)
             and name not in names, "CLEANUP_FILENAME")
        names.add(name)
        path = approved_dir / name
        s = path.lstat()
        need(stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and
             s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600 and
             s.st_ino == item["inode"] and s.st_size == item["bytes"] and
             s.st_mtime_ns == item["mtimeNs"] and
             s.st_mtime < now.timestamp() - 7 * 86400 and
             type(item["sha256"]) is str and HEX.fullmatch(item["sha256"]),
             "CLEANUP_SOURCE_PREIMAGE")
        need(sha(checked(path, 2 * GIB, os.geteuid())) == item["sha256"],
             "CLEANUP_CONTENT_SHA")
    return items


def cleanup_only_disposable(plan: dict, key: bytes, *, now: dt.datetime,
                            approved_dir: Path, commit: bool = False) -> dict:
    items = verify_disposable_cache(plan, key, now=now,
                                    approved_dir=approved_dir)
    if not commit:
        return {"state": "PREVIEW", "files": len(items),
                "bytes": sum(x["bytes"] for x in items),
                "deleted": 0, "protectedDeleted": 0}
    # A dedicated UID-owned 0700 cache directory prevents untrusted swaps.
    # A root-owned installation must provide durable, audited manifest custody.
    # No automatic inventory class other than this exact one ever reaches unlink.
    for item in items:
        os.unlink(approved_dir / item["name"])
    fd = os.open(approved_dir, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return {"state": "NONPROTECTED_CACHE_RETIRED", "files": len(items),
            "bytes": sum(x["bytes"] for x in items),
            "deleted": len(items), "protectedDeleted": 0}
