#!/usr/bin/env python3
"""Reversible custody of independently verified historical PRODUCT archives.

Runs as HEL1 B/tony. Owner-root supplies a fresh exact-hash pin/reference/open-FD
attestation and coordinates with the existing release lock. No runtime directory,
financial file, service, root controller or independent proof is modified.
"""
import argparse
import ctypes
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

OWNER = 1000
ROOT_UID = 0
STAGE = Path("/home/tony")
VOLUME = Path("/mnt/HC_Volume_105319120/aoe2war/product-runtime-artifact-retention-v1")
CONTROLLER_SHA = "771ebd5bc1164f75f4466cdc0a05a608ffc25671fccb12e05ebf321c56e30452"
GIB = 1024 ** 3
RESERVE = 6 * GIB
PINS_SCHEMA = "aoe2war.product.retention-pins.v1"
PLAN_SCHEMA = "aoe2war.product.artifact-retention-plan.v1"
RECEIPT_SCHEMA = "aoe2war.product.artifact-retention-receipt.v1"
PLAN_FIELDS = {
    "schema", "pins_sha256", "created_at", "destination", "storage_identity", "items",
    "root_free_bytes_before", "volume_free_bytes_before",
    "estimated_exclusive_allocated_bytes", "actual_reclaimed_bytes",
    "incoming_artifact_bytes", "extraction_bytes", "unchanged_v3_minimum_bytes",
    "required_root_free_before_receipt", "projected_pre_stage_free_bytes",
    "projected_post_extract_free_bytes", "pre_stage_capacity_expected_pass",
    "financial_authorized", "runtime_mutation",
}


def need(ok, reason):
    if not ok:
        raise ValueError("HOLD_PRODUCT_RETENTION_" + reason)


def raw(obj):
    return (json.dumps(obj, sort_keys=True, indent=2) + "\n").encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def utc():
    return dt.datetime.now(dt.timezone.utc)


def integer(value):
    return type(value) is int


def sha(value):
    return type(value) is str and re.fullmatch("[0-9a-f]{64}", value) is not None


def exact(path):
    path = Path(path)
    need(path.is_absolute() and path.resolve(strict=True) == path,
         "PATH_SYMLINK_OR_MISSING")
    return path


def snapshot_stat(s):
    return {"device": s.st_dev, "inode": s.st_ino, "bytes": s.st_size,
            "mtime_ns": s.st_mtime_ns, "allocated_bytes": s.st_blocks * 512}


def regular(path, uid, mode=None):
    s = exact(path).lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid == uid and s.st_nlink == 1
         and not s.st_mode & 0o022, "FILE_OWNER_MODE_OR_HARDLINK")
    if mode is not None:
        need(stat.S_IMODE(s.st_mode) == mode, "FILE_MODE")
    return snapshot_stat(s)


def directory(path):
    path = exact(path)
    s = path.lstat()
    need(stat.S_ISDIR(s.st_mode) and s.st_uid == OWNER
         and stat.S_IMODE(s.st_mode) == 0o700, "DIRECTORY_OWNER_MODE")
    return path


def hashfile(path, expected=None):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode), "HASH_NOT_REGULAR")
        if expected is not None:
            need(snapshot_stat(before) == expected, "HASH_INODE_DRIFT")
        h = hashlib.sha256()
        with os.fdopen(fd, "rb", closefd=False) as f:
            for part in iter(lambda: f.read(4 * 1024 ** 2), b""):
                h.update(part)
        need(snapshot_stat(os.fstat(fd)) == snapshot_stat(before), "HASH_FILE_CHANGED")
        return h.hexdigest()
    finally:
        os.close(fd)


def read_json(path, uid, expected_sha=None, mode=None):
    before = regular(path, uid, mode)
    need(before["bytes"] < 1024 * 1024, "JSON_SIZE")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        need(snapshot_stat(os.fstat(fd)) == before, "JSON_INODE_DRIFT")
        with os.fdopen(fd, "rb", closefd=False) as f:
            data = f.read(1024 * 1024)
        need(snapshot_stat(os.fstat(fd)) == before, "JSON_FILE_CHANGED")
    finally:
        os.close(fd)
    if expected_sha is not None:
        need(sha(expected_sha) and digest(data) == expected_sha, "JSON_SHA")
    obj = json.loads(data)
    need(type(obj) is dict, "JSON_OBJECT")
    return obj


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def seal(path, obj):
    data = raw(obj)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as f:
            f.write(data)
            f.flush()
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)
    return digest(data)


def validate_classification(row):
    need(type(row) is dict and set(row) == {
        "path", "source", "build", "archive_sha256", "archive_bytes",
        "proof_sha256", "references"}, "CLASSIFICATION_FIELDS")
    path = Path(row["path"])
    need(path.name == "runtime.tar.gz" and path.parent.parent == STAGE
         and re.fullmatch(r"\.aoe2war-b-[A-Za-z0-9._-]+", path.parent.name),
         "ARCHIVE_SCOPE")
    need(type(row["source"]) is str
         and re.fullmatch("[0-9a-f]{40}", row["source"])
         and type(row["build"]) is str
         and re.fullmatch("[A-Za-z0-9_-]{8,64}", row["build"]),
         "SOURCE_BUILD")
    need(sha(row["archive_sha256"]) and sha(row["proof_sha256"])
         and integer(row["archive_bytes"])
         and 1000000 < row["archive_bytes"] < 1000000000, "ARCHIVE_BOUNDS")
    refs = row["references"]
    need(type(refs) is list and len(refs) <= 32, "REFERENCE_BOUND")
    for ref in refs:
        need(type(ref) is dict and set(ref) == {"path", "sha256"}
             and type(ref["path"]) is str
             and ref["path"].startswith((
                 "/root/aoe2war-product-release-manifests/",
                 "/var/lib/aoe2war-product-release-v1/"))
             and ".." not in Path(ref["path"]).parts
             and sha(ref["sha256"]), "REFERENCE_IDENTITY")
    return path


def load_pins(path, expected_sha):
    p = read_json(path, ROOT_UID, expected_sha)
    need(p.get("schema") == PINS_SCHEMA, "PINS_SCHEMA")
    observed = dt.datetime.fromisoformat(p["observed_at"].replace("Z", "+00:00"))
    expiry = dt.datetime.fromisoformat(p["expires_at"].replace("Z", "+00:00"))
    need(observed.tzinfo is not None and expiry.tzinfo is not None,
         "NAIVE_CLOCK")
    need(observed <= utc() <= expiry
         and 0 < (expiry - observed).total_seconds() <= 900,
         "PINS_EXPIRED_OR_CLOCK")
    need(p.get("open_files_verified") is True, "ROOT_OPEN_FILE_ATTESTATION_REQUIRED")
    need(p.get("controller_sha256") == CONTROLLER_SHA, "CONTROLLER_SHA")
    need(sha(p.get("manifest_sha256")) and sha(p.get("journal_sha256")),
         "ROOT_EVIDENCE_DIGEST")
    for key in ("active", "previous"):
        r = p[key]
        need(type(r) is dict and set(r) == {"source", "build", "runtime"}
             and re.fullmatch("[0-9a-f]{40}", r["source"])
             and re.fullmatch("[A-Za-z0-9_-]{8,64}", r["build"])
             and r["runtime"] == "/var/lib/aoe2war-web-prod-" + r["source"][:12],
             "PIN_IDENTITY")
    need(p["active"]["source"] != p["previous"]["source"], "DUPLICATE_PIN")
    need(type(p.get("candidates")) is list and 0 < len(p["candidates"]) <= 16,
         "CANDIDATE_BOUND")
    for row in p["candidates"]:
        validate_classification(row)
    need(len({r["path"] for r in p["candidates"]}) == len(p["candidates"]),
         "DUPLICATE_CANDIDATE")
    return p


def live_identity(p):
    r = subprocess.run(
        ["systemctl", "show", "aoe2hdbets-web-prod.service",
         "-p", "WorkingDirectory", "--value"],
        capture_output=True, text=True, timeout=10)
    active = p["active"]
    root = Path(active["runtime"])
    need(r.returncode == 0 and r.stdout.strip() == str(root), "ACTIVE_RUNTIME_CHANGED")
    need((root / ".aoe2war-source-sha").read_text().strip() == active["source"]
         and (root / ".next/BUILD_ID").read_text().strip() == active["build"],
         "ACTIVE_IDENTITY_CHANGED")


def candidate(row, p):
    path = validate_classification(row)
    directory(path.parent)
    need(row["source"] not in (p["active"]["source"], p["previous"]["source"]),
         "PINNED_SOURCE")
    snap = regular(path, OWNER)
    need(snap["bytes"] == row["archive_bytes"]
         and hashfile(path, snap) == row["archive_sha256"], "ARCHIVE_SHA")
    proof = read_json(path.parent / "b-linux-independent-review-v2.json",
                      OWNER, row["proof_sha256"])
    need(proof.get("status") ==
         "PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER"
         and proof.get("financial_authorized") is False
         and proof.get("source_commit") == row["source"]
         and proof.get("build_id") == row["build"]
         and proof.get("runtime_archive_sha256") == row["archive_sha256"]
         and proof.get("runtime_archive_bytes") == row["archive_bytes"],
         "INDEPENDENT_PROOF")
    return {"classification": dict(row), "snapshot": snap}


def storage_identity(dest):
    a, b = STAGE.stat(), dest.stat()
    need(a.st_dev != b.st_dev, "DESTINATION_NOT_SEPARATE_VOLUME")
    return {"stage_device": a.st_dev, "volume_device": b.st_dev,
            "volume_inode": b.st_ino}


def free(path):
    return shutil.disk_usage(path).free


def capacity(root_free, reclaim, incoming, extraction):
    required = incoming + max(RESERVE, extraction + GIB)
    return {"required_root_free_before_receipt": required,
            "projected_pre_stage_free_bytes": root_free + reclaim - incoming,
            "projected_post_extract_free_bytes": root_free + reclaim - incoming - extraction,
            "pre_stage_capacity_expected_pass": root_free + reclaim >= required}


def plan(p, pinsha, dest, incoming, extraction):
    need(directory(dest) == VOLUME, "DESTINATION_SCOPE")
    need(integer(incoming) and integer(extraction)
         and 0 <= incoming <= GIB and 0 <= extraction <= 4 * GIB,
         "CAPACITY_BOUNDS")
    live_identity(p)
    identity = storage_identity(dest)
    rows = [candidate(row, p) for row in p["candidates"]]
    total = sum(r["classification"]["archive_bytes"] for r in rows)
    reclaim = sum(r["snapshot"]["allocated_bytes"] for r in rows)
    root_free, volume_free = free(STAGE), free(dest)
    need(volume_free >= total + GIB, "VOLUME_HEADROOM")
    return {"schema": PLAN_SCHEMA, "pins_sha256": pinsha,
            "created_at": utc().isoformat(), "destination": str(dest),
            "storage_identity": identity, "items": rows,
            "root_free_bytes_before": root_free,
            "volume_free_bytes_before": volume_free,
            "estimated_exclusive_allocated_bytes": reclaim,
            "actual_reclaimed_bytes": None,
            "incoming_artifact_bytes": incoming, "extraction_bytes": extraction,
            "unchanged_v3_minimum_bytes": RESERVE,
            **capacity(root_free, reclaim, incoming, extraction),
            "financial_authorized": False, "runtime_mutation": False}


def copy_verified(source, dest, expected, source_snapshot=None):
    need(not dest.exists() and not dest.is_symlink(), "COPY_COLLISION")
    temp = dest.with_name(dest.name + ".partial")
    outfd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        infd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            before = snapshot_stat(os.fstat(infd))
            if source_snapshot is not None:
                need(before == source_snapshot, "COPY_SOURCE_INODE_DRIFT")
            h = hashlib.sha256()
            with os.fdopen(infd, "rb", closefd=False) as a, \
                    os.fdopen(outfd, "wb", closefd=False) as b:
                for block in iter(lambda: a.read(4 * 1024 ** 2), b""):
                    h.update(block)
                    b.write(block)
                b.flush()
            need(snapshot_stat(os.fstat(infd)) == before, "COPY_SOURCE_CHANGED")
            os.fsync(outfd)
        finally:
            os.close(infd)
        need(h.hexdigest() == expected, "COPY_STREAM_SHA")
    finally:
        os.close(outfd)
    need(hashfile(temp) == expected, "COPY_READBACK_SHA")
    # Hard-link publication is atomic and never replaces an existing destination.
    os.link(temp, dest, follow_symlinks=False)
    temp.unlink()
    fsync_dir(dest.parent)
    regular(dest, OWNER, 0o600)


def rename_no_replace(source, dest):
    # HEL1 Linux only: no unsafe overwrite fallback. Tests mock this boundary.
    libc = ctypes.CDLL(None, use_errno=True)
    fn = getattr(libc, "renameat2", None)
    need(fn is not None, "ATOMIC_RETIRE_RENAME_UNAVAILABLE")
    result = fn(-100, os.fsencode(source), -100, os.fsencode(dest), 1)
    if result:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), str(dest))


def retained_rows(q, qsha, dest):
    rows = []
    for item in q["items"]:
        c = item["classification"]
        rows.append({
            "original": c["path"],
            "retained": str(dest / "objects" /
                            (c["source"] + "-" + c["archive_sha256"] + ".tar.gz")),
            "retiring": str(Path(c["path"]).with_name("runtime.tar.gz.retiring-" + qsha)),
            "classification": c, "snapshot": item["snapshot"]})
    return rows


def apply(q, qsha, p, pinsha):
    need(set(q) == PLAN_FIELDS and q["schema"] == PLAN_SCHEMA
         and digest(raw(q)) == qsha and q["pins_sha256"] == pinsha
         and q["financial_authorized"] is False and q["runtime_mutation"] is False
         and q["unchanged_v3_minimum_bytes"] == RESERVE, "PLAN_IDENTITY_OR_FIELDS")
    need(type(q["items"]) is list and 0 < len(q["items"]) <= 16,
         "PLAN_ITEM_BOUND")
    need(len({i["classification"]["path"] for i in q["items"]}) == len(q["items"]),
         "DUPLICATE_CANDIDATE")
    dest = directory(q["destination"])
    need(dest == VOLUME and storage_identity(dest) == q["storage_identity"],
         "STORAGE_IDENTITY_CHANGED")
    incoming, extraction = q["incoming_artifact_bytes"], q["extraction_bytes"]
    need(integer(incoming) and integer(extraction)
         and 0 <= incoming <= GIB and 0 <= extraction <= 4 * GIB,
         "CAPACITY_BOUNDS")
    live_identity(p)
    objects, receipts = dest / "objects", dest / "receipts"
    for path in (objects, receipts):
        if not path.exists():
            path.mkdir(mode=0o700)
            fsync_dir(dest)
        directory(path)
    receipt_path = receipts / (qsha + ".json")
    rows = retained_rows(q, qsha, dest)
    prior = read_json(receipt_path, OWNER, mode=0o600) if receipt_path.exists() else None
    if prior is not None:
        need(prior.get("schema") == RECEIPT_SCHEMA
             and prior.get("plan_sha256") == qsha
             and prior.get("pins_sha256") == pinsha
             and prior.get("items") == rows
             and prior.get("financial_authorized") is False
             and prior.get("runtime_mutation") is False, "RECEIPT_IDENTITY")
    remaining = total = 0
    for entry, row in zip(q["items"], rows):
        c = entry["classification"]
        need(c in p["candidates"], "UNATTESTED_CANDIDATE")
        source, target, retiring = map(Path, (row["original"], row["retained"], row["retiring"]))
        if source.exists():
            need(candidate(c, p) == entry, "SOURCE_OR_PROOF_DRIFT")
            remaining += entry["snapshot"]["allocated_bytes"]
        elif retiring.exists():
            need(prior is not None and regular(retiring, OWNER) == entry["snapshot"],
                 "RETIRING_SOURCE_DRIFT")
            remaining += entry["snapshot"]["allocated_bytes"]
        else:
            need(prior is not None, "SOURCE_MISSING_WITHOUT_RECEIPT")
        if target.exists():
            regular(target, OWNER, 0o600)
            need(hashfile(target) == c["archive_sha256"], "RETAINED_SHA")
        else:
            need(source.exists(), "BOTH_COPIES_MISSING")
            total += c["archive_bytes"]
    before = free(STAGE)
    need(capacity(before, remaining, incoming, extraction)
         ["pre_stage_capacity_expected_pass"], "PROJECTED_RELEASE_CAPACITY")
    need(free(dest) >= total + GIB, "VOLUME_HEADROOM")
    for entry, row in zip(q["items"], rows):
        source, target = Path(row["original"]), Path(row["retained"])
        if not target.exists():
            copy_verified(source, target, row["classification"]["archive_sha256"],
                          entry["snapshot"])
    if prior is None:
        seal(receipt_path, {
            "schema": RECEIPT_SCHEMA, "plan_sha256": qsha, "pins_sha256": pinsha,
            "sealed_at": utc().isoformat(),
            "state": "VERIFIED_RETAINED_COPIES_BEFORE_ORIGINAL_UNLINK",
            "items": rows, "financial_authorized": False, "runtime_mutation": False})
    live_identity(p)
    for row in rows:
        source, target, retiring = map(Path, (row["original"], row["retained"], row["retiring"]))
        expected = row["classification"]["archive_sha256"]
        need(hashfile(target) == expected, "PRE_UNLINK_RETAINED_SHA")
        if source.exists():
            need(regular(source, OWNER) == row["snapshot"]
                 and hashfile(source, row["snapshot"]) == expected, "PRE_RETIRE_DRIFT")
            rename_no_replace(source, retiring)
            fsync_dir(source.parent)
        if retiring.exists():
            # A raced replacement is preserved under its retirement name on HOLD.
            need(regular(retiring, OWNER) == row["snapshot"]
                 and hashfile(retiring, row["snapshot"]) == expected,
                 "RETIRING_SOURCE_DRIFT_" + str(retiring))
            retiring.unlink()
            fsync_dir(retiring.parent)
    after = free(STAGE)
    return {"status": "PASS_RETAINED_PRODUCT_ARTIFACTS",
            "receipt": str(receipt_path), "receipt_sha256": hashfile(receipt_path),
            "root_free_bytes_before": before, "root_free_bytes_after": after,
            "actual_free_space_delta_bytes": after - before,
            "unchanged_v3_headroom_pass": after >= RESERVE,
            "runtime_mutation": False}


def restore(receipt_path, receipt_sha):
    receipt_path = Path(receipt_path)
    need(receipt_path.parent == VOLUME / "receipts", "RESTORE_RECEIPT_SCOPE")
    r = read_json(receipt_path, OWNER, receipt_sha, 0o600)
    need(r.get("schema") == RECEIPT_SCHEMA and sha(r.get("plan_sha256"))
         and r.get("financial_authorized") is False
         and r.get("runtime_mutation") is False
         and type(r.get("items")) is list and 0 < len(r["items"]) <= 16,
         "RESTORE_SCHEMA_OR_BOUND")
    need(len({x["original"] for x in r["items"]}) == len(r["items"]),
         "RESTORE_DUPLICATE")
    for row in r["items"]:
        c = row["classification"]
        original = validate_classification(c)
        retained = VOLUME / "objects" / (c["source"] + "-" + c["archive_sha256"] + ".tar.gz")
        need(row["original"] == c["path"] and row["retained"] == str(retained),
             "RESTORE_CLASSIFICATION_PATH")
        directory(original.parent)
        directory(retained.parent)
        regular(retained, OWNER, 0o600)
        need(hashfile(retained) == c["archive_sha256"], "RESTORE_SHA")
        if original.exists() or original.is_symlink():
            regular(original, OWNER)
            need(hashfile(original) == c["archive_sha256"], "RESTORE_COLLISION")
        else:
            need(free(STAGE) >= c["archive_bytes"] + GIB, "RESTORE_HEADROOM")
            copy_verified(retained, original, c["archive_sha256"])
    return {"status": "PASS_RESTORED_PRODUCT_ARTIFACTS",
            "retained_evidence_preserved": True}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="action", required=True)
    for name in ("plan", "apply"):
        s = sub.add_parser(name)
        s.add_argument("--pins", required=True)
        s.add_argument("--pins-sha", required=True)
        if name == "plan":
            s.add_argument("--destination", required=True)
            s.add_argument("--incoming-bytes", type=int, required=True)
            s.add_argument("--extract-bytes", type=int, required=True)
            s.add_argument("--output", required=True)
        else:
            s.add_argument("--plan", required=True)
            s.add_argument("--plan-sha", required=True)
    s = sub.add_parser("restore")
    s.add_argument("--receipt", required=True)
    s.add_argument("--receipt-sha", required=True)
    a = ap.parse_args()
    need(os.geteuid() == OWNER, "B_OWNER_UID_REQUIRED")
    if a.action == "restore":
        result = restore(a.receipt, a.receipt_sha)
    else:
        p = load_pins(a.pins, a.pins_sha)
        if a.action == "plan":
            q = plan(p, a.pins_sha, Path(a.destination), a.incoming_bytes, a.extract_bytes)
            result = {"status": "PASS_RETENTION_PLAN",
                      "plan_sha256": seal(Path(a.output), q), "output": a.output,
                      "release_capacity_ready": q["pre_stage_capacity_expected_pass"]}
        else:
            q = read_json(a.plan, OWNER, a.plan_sha, 0o600)
            result = apply(q, a.plan_sha, p, a.pins_sha)
    print(json.dumps(result, sort_keys=True, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)}))
        sys.exit(3)
