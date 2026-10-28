#!/usr/bin/env python3
"""Signed RETIRE_STAGE_ONLY: non-destructively park an old HEL1 stage.

Standalone operator-plane tool. It never calls Ship, Finish, migrations, HTTP
finance routes, systemctl mutation, or removes artifact bytes. A root-owned
owner-v4 Ed25519 key, single-use nonce and canonical global lease are required.
Install/pin this exact reviewed source separately before using --apply.
"""
from __future__ import annotations

import argparse
import base64
import binascii
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

APP = Path("/var/www/AoE2HDBets/app-prodn")
ARCHIVE = Path("/var/www/AoE2HDBets/.aoe2war-preserved-stages")
RECEIPTS = Path("/mnt/HC_Volume_105319120/aoe2war/deploy-receipts")
STATE = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/stage-park-v1")
GLOBAL_LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
OWNER_KEY = Path("/etc/aoe2war/website-owner-v4/owner-public.pem")
OWNER_SPKI_PIN = Path("/etc/aoe2war/website-owner-v4/owner-public.spki.sha256")
APPROVED_TARGET_SHA = "ade91ac70bbab9866012a1a05b6a842bb5c0b515"
SOURCE_SHA = "14ce71045150fcad4a25f0e3c3858c1c3cc7aab6"
OLD_BUILD = "u842UVpDjLRLz-paxPv2U"
DOMAIN = b"AOE2WAR.RETIRE_STAGE_ONLY.V1\n"
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
NONCE = re.compile(r"[A-Za-z0-9_-]{32,96}\Z")


class Hold(Exception):
    pass


def require(ok, reason):
    if not ok:
        raise Hold(reason)


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def no_link_directory(path, *, root_owned=False):
    path = Path(path)
    require(path.is_absolute(), "relative protected directory")
    current = path
    while True:
        s = os.lstat(current)
        require(stat.S_ISDIR(s.st_mode), "non-directory or linked ancestor")
        if root_owned:
            require(s.st_uid == 0 and not (s.st_mode & 0o022),
                    "protected directory not owned by root")
        if current == Path("/"):
            break
        current = current.parent
    return os.lstat(path)


def protected_file(path):
    # Trust anchor and signed permit must not sit in writable parent directories.
    no_link_directory(path.parent, root_owned=True)
    st = os.lstat(path)
    require(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and not (st.st_mode & 0o022),
            "missing/untrusted protected file")
    return st


def read_json(path, *, max_bytes=131072):
    st = os.lstat(path)
    require(stat.S_ISREG(st.st_mode) and not (st.st_mode & 0o022)
            and 0 < st.st_size <= max_bytes, "untrusted evidence file")
    with path.open("rb") as handle:
        pairs = lambda xs: unique_pairs(xs)
        return json.load(handle, object_pairs_hook=pairs)


def unique_pairs(pairs):
    result = {}
    for k, v in pairs:
        require(k not in result, "duplicate JSON field")
        result[k] = v
    return result


def kv(path):
    result = {}
    for line in path.read_text().splitlines():
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        require(key not in result, "duplicate stage-status field")
        result[key] = val
    return result


def command(*argv):
    p = subprocess.run(argv, text=True, capture_output=True, timeout=18, check=False)
    require(p.returncode == 0, "read-only host check failed: " + argv[0])
    return p.stdout.strip()


def tar_sha(path, *, exclude_cache=False):
    args = ["tar", "--sort=name", "--mtime=UTC 1970-01-01",
            "--owner=0", "--group=0", "--numeric-owner"]
    if exclude_cache:
        args += ["--exclude=./.cache", "--exclude=./.cache/*"]
    args += ["-C", str(path), "-cf", "-", "."]
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    h = hashlib.sha256()
    assert process.stdout is not None
    for chunk in iter(lambda: process.stdout.read(1048576), b""):
        h.update(chunk)
    _, err = process.communicate(timeout=120)
    require(process.returncode == 0, "canonical artifact tar failed: " + err.decode(errors="replace")[-200:])
    return h.hexdigest()


def stage_evidence(*, app=APP, receipts=RECEIPTS):
    no_link_directory(app)
    no_link_directory(receipts)
    next_stage = app / ".next-release"
    deps_stage = app / ".node_modules-release"
    s_next = no_link_directory(next_stage)
    s_deps = no_link_directory(deps_stage)
    require((next_stage / "BUILD_ID").read_text().strip() == OLD_BUILD,
            "wrong old stage BUILD_ID")
    found = []
    for path in receipts.iterdir():
        if not path.name.startswith("stage-"):
            continue
        no_link_directory(path)
        status = path / "stage-status.txt"
        if status.is_file():
            rows = kv(status)
            if rows.get("staged_build_id") == OLD_BUILD:
                found.append((path, status, rows))
        require(len(found) <= 1, "multiple matching canonical stage statuses")
    require(len(found) == 1, "missing/duplicate stage status")
    directory, status, rows = found[0]
    require(rows.get("release_sha") == SOURCE_SHA and
            rows.get("previous_sha") and rows.get("active_build_id"),
            "invalid stage ancestry")
    manifest = directory / "release-manifest.json"
    gate = directory / "gate-receipt.json"
    receipt = directory / "stage-receipt.json"
    for path in (status, manifest, gate, receipt):
        read_json(path) if path.suffix == ".json" else protected_file_shape(path)
    m = read_json(manifest)
    r = read_json(receipt)
    require(m.get("release_sha") == SOURCE_SHA and
            r.get("release_sha") == SOURCE_SHA and
            r.get("staged_build_id") == OLD_BUILD, "conflicting immutable stage receipt")
    next_hash = tar_sha(next_stage)
    dep_hash = tar_sha(deps_stage, exclude_cache=True)
    require(rows.get("artifact_sha256") == next_hash and
            rows.get("candidate_node_modules_sha256") == dep_hash,
            "staged bytes disagree with canonical stage-status")
    live_source = command("git", "-C", str(app), "rev-parse", "HEAD")
    live_build = (app / ".next" / "BUILD_ID").read_text().strip()
    require(command("systemctl", "is-active", "aoe2hdbets-web.service") == "active",
            "website service inactive")
    socket_lines = command("ss", "-ltn").splitlines()
    counts = {port: sum(bool(re.search(r":" + port + r"\s", line))
                        for line in socket_lines) for port in ("8092", "8093")}
    require(counts == {"8092": 1, "8093": 1}, "Wolo listener count drift")
    require(live_build == rows["active_build_id"] and
            live_source == rows["previous_sha"], "old stage/live identity mismatch")
    evidence = {
        "old_source_sha": SOURCE_SHA, "old_build_id": OLD_BUILD,
        "old_artifact_sha256": next_hash, "old_dependency_sha256": dep_hash,
        "stage_status_sha256": digest(status), "manifest_sha256": digest(manifest),
        "gate_sha256": digest(gate), "stage_receipt_sha256": digest(receipt),
        "stage_receipt_dir": str(directory), "live_source_sha": live_source,
        "live_build_id": live_build, "machine_id_sha256": digest(Path("/etc/machine-id")),
    }
    return evidence, {".next-release": s_next, ".node_modules-release": s_deps}


def protected_file_shape(path):
    st = os.lstat(path)
    require(stat.S_ISREG(st.st_mode) and not (st.st_mode & 0o022),
            "linked/mutable evidence path")


def owner_spki_sha256(key=OWNER_KEY, *, pin=OWNER_SPKI_PIN):
    """Verify the separately enrolled public-key identity as canonical DER SPKI."""
    protected_file(key)
    protected_file(pin)
    expected = pin.read_text(encoding="ascii").strip()
    require(HEX64.fullmatch(expected) is not None, "invalid owner-v4 pin")
    result = subprocess.run(
        ["openssl", "pkey", "-pubin", "-in", str(key), "-pubout", "-outform", "DER"],
        capture_output=True, timeout=15, check=False,
    )
    require(result.returncode == 0 and result.stdout,
            "invalid owner-v4 public key")
    actual = hashlib.sha256(result.stdout).hexdigest()
    require(actual == expected, "OWNER_V4_PUBLIC_KEY_PIN_MISMATCH")
    return actual


def verify_owner(packet, evidence, *, key=OWNER_KEY, key_pin=OWNER_SPKI_PIN,
                 source_path=None, now=None):
    require(type(packet) is dict and set(packet) == {"payload", "signature_base64"},
            "signed permit structure invalid")
    payload = packet["payload"]
    require(type(payload) is dict, "missing permit payload")
    require(payload.get("kind") == "aoe2war.retire-stage-only.v1"
            and payload.get("action") == "PARK_ONLY"
            and payload.get("no_publish_stage_activate") is True
            and payload.get("funded_wolo_authorized") is False, "wrong authority scope")
    require(type(payload.get("nonce")) is str and NONCE.fullmatch(payload["nonce"]),
            "missing/invalid nonce")
    source_path = Path(source_path or __file__)
    require(HEX64.fullmatch(str(payload.get("controller_sha256") or "")) and
            payload["controller_sha256"] == digest(source_path),
            "unreviewed executable controller")
    require(payload.get("intended_release_sha") == APPROVED_TARGET_SHA,
            "intended release SHA is not independently accepted canonical website source")
    require(payload.get("source_stage_path") == str(APP / ".next-release") and
            payload.get("dependency_stage_path") == str(APP / ".node_modules-release") and
            payload.get("archive_root") == str(ARCHIVE) and
            payload.get("global_lock_path") == str(GLOBAL_LOCK),
            "permit does not bind canonical move/lease paths")
    for key_name, expected in evidence.items():
        require(payload.get(key_name) == expected, "signed stage evidence drift: " + key_name)
    issued = datetime.fromisoformat(payload["issued_at"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00"))
    now = now or datetime.now(timezone.utc)
    require(issued.tzinfo is not None and expires.tzinfo is not None and
            issued.utcoffset().total_seconds() == 0 and
            expires.utcoffset().total_seconds() == 0 and issued <= now < expires
            and 0 < (expires - issued).total_seconds() <= 1800
            and (now - issued).total_seconds() <= 1800, "expired/future owner permit")
    owner_spki_sha256(key, pin=key_pin)
    sig = base64.b64decode(packet["signature_base64"], validate=True)
    require(len(sig) == 64, "wrong Ed25519 signature length")
    with tempfile.TemporaryDirectory(prefix="aoe2war-stage-verify-") as directory:
        message = Path(directory) / "message"
        signature = Path(directory) / "signature"
        message.write_bytes(DOMAIN + canonical(payload))
        signature.write_bytes(sig)
        p = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin",
                            "-inkey", str(key), "-rawin", "-in", str(message),
                            "-sigfile", str(signature)], capture_output=True, timeout=15)
        require(p.returncode == 0, "wrong owner-v4 signer/signature")
    return payload


def active_consumers(app=APP):
    """Privileged /proc scan; unexpected inaccessible PID is a hard HOLD."""
    prefixes = [str(app / ".next-release"), str(app / ".node_modules-release")]
    require(os.geteuid() == 0, "consumer inspection requires root")
    for pid in Path("/proc").iterdir():
        if not pid.name.isdigit():
            continue
        for name in ("cwd", "root", "exe"):
            check_proc_link(pid / name, prefixes)
        fd = pid / "fd"
        try:
            entries = list(fd.iterdir())
        except FileNotFoundError:
            continue
        except PermissionError as exc:
            raise Hold("incomplete privileged process scan") from exc
        for entry in entries:
            check_proc_link(entry, prefixes)
    return True


def check_proc_link(path, prefixes):
    try:
        dest = os.readlink(path)
    except FileNotFoundError:
        return
    except PermissionError as exc:
        raise Hold("inaccessible protected process reference") from exc
    require(not any(dest == p or dest.startswith(p + "/") for p in prefixes),
            "active staged inode consumer")


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def durable_json(path, payload):
    data = canonical(payload) + b"\n"
    with open(path, "xb") as f:
        os.chmod(path, 0o600)
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    fsync_dir(path.parent)


def apply(packet, *, app=APP, receipts=RECEIPTS, archive=ARCHIVE,
          state=STATE, lock=GLOBAL_LOCK, key=OWNER_KEY, key_pin=OWNER_SPKI_PIN,
          source_path=None):
    require(os.geteuid() == 0, "APPLY requires authorized root operator")
    for parent in (archive, state, state / "nonces", state / "receipts"):
        st = no_link_directory(parent)
        require(st.st_uid == 0 and (st.st_mode & 0o077) == 0,
                "protected operator state not root-owned private")
    require(os.lstat(app).st_dev == os.lstat(archive).st_dev,
            "archive and stage must be on same root filesystem")
    lock_stat = os.lstat(lock)
    require(stat.S_ISREG(lock_stat.st_mode) and not (lock_stat.st_mode & 0o022),
            "unsafe canonical shared release lock")
    with lock.open("r+b", buffering=0) as guard:
        require((os.fstat(guard.fileno()).st_dev, os.fstat(guard.fileno()).st_ino) ==
                (lock_stat.st_dev, lock_stat.st_ino), "release-lock inode changed")
        fcntl.flock(guard.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        evidence, original = stage_evidence(app=app, receipts=receipts)
        permit = verify_owner(packet, evidence, key=key, key_pin=key_pin,
                              source_path=source_path)
        active_consumers(app)
        nonce = permit["nonce"]
        nonce_path = state / "nonces" / (nonce + ".json")
        receipt_dir = state / "receipts" / nonce
        destination = archive / nonce
        require(not nonce_path.exists() and not receipt_dir.exists()
                and not destination.exists(), "retirement nonce already consumed")
        receipt_dir.mkdir(mode=0o700)
        fsync_dir(receipt_dir.parent)
        durable_json(receipt_dir / "prestate.json", {
            "status": "PREPARED", "permit_sha256": hashlib.sha256(canonical(packet)).hexdigest(),
            "evidence": evidence, "inodes": {k: [v.st_dev, v.st_ino] for k, v in original.items()},
            "destination": str(destination)})
        # Exclusive creation is the durable, fail-closed consumption boundary.
        durable_json(nonce_path, {"status": "CONSUMED", "nonce": nonce})
        try:
            destination.mkdir(mode=0o700)
            fsync_dir(archive)
            # Anchor both parent directories with O_NOFOLLOW directory descriptors.
            # Linux rename is NOT conditional on the source inode; the writable
            # source parent can be adversarially raced. Post-move identity mismatch
            # always becomes UNKNOWN_NO_REPLAY, not a successful stage clearance.
            dirflags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
            app_fd = os.open(app, dirflags)
            archive_fd = os.open(destination, dirflags)
            try:
                app_dir = os.fstat(app_fd)
                parked_dir = os.fstat(archive_fd)
                require((app_dir.st_dev, app_dir.st_ino) ==
                        (os.lstat(app).st_dev, os.lstat(app).st_ino),
                        "app directory anchor changed")
                require((parked_dir.st_dev, parked_dir.st_ino) ==
                        (os.lstat(destination).st_dev, os.lstat(destination).st_ino),
                        "archive directory anchor changed")
                for name, old_stat in original.items():
                    current = os.stat(name, dir_fd=app_fd, follow_symlinks=False)
                    require(stat.S_ISDIR(current.st_mode) and
                            (current.st_dev, current.st_ino) ==
                            (old_stat.st_dev, old_stat.st_ino),
                            "staged inode swapped before move")
                    active_consumers(app)
                    os.rename(name, name, src_dir_fd=app_fd, dst_dir_fd=archive_fd)
                    moved = os.stat(name, dir_fd=archive_fd, follow_symlinks=False)
                    require(stat.S_ISDIR(moved.st_mode) and
                            (moved.st_dev, moved.st_ino) ==
                            (old_stat.st_dev, old_stat.st_ino),
                            "PATH_SWAP_UNKNOWN_NO_REPLAY: destination inode differs")
                    require(not os.path.lexists(app / name),
                            "source pathname reappeared during move")
                    os.fsync(app_fd)
                    os.fsync(archive_fd)
                    durable_json(receipt_dir / (name.lstrip(".") + ".json"), {
                        "status": "PARKED", "name": name,
                        "device": old_stat.st_dev, "inode": old_stat.st_ino})
            finally:
                os.close(archive_fd)
                os.close(app_fd)
            require(not (app / ".next-release").exists() and
                    not (app / ".node_modules-release").exists(), "stage collision remains")
            for name, old_stat in original.items():
                parked = os.lstat(destination / name)
                require((parked.st_dev, parked.st_ino) ==
                        (old_stat.st_dev, old_stat.st_ino), "parked inode drift")
            require(command("git", "-C", str(app), "rev-parse", "HEAD") ==
                    evidence["live_source_sha"], "live Git source changed")
            require((app / ".next" / "BUILD_ID").read_text().strip() ==
                    evidence["live_build_id"], "live BUILD_ID changed")
            require(command("systemctl", "is-active", "aoe2hdbets-web.service") ==
                    "active", "website service drift")
            listeners = command("ss", "-ltn").splitlines()
            for port in ("8092", "8093"):
                require(sum(bool(re.search(r":" + port + r"\s", line))
                            for line in listeners) == 1, "Wolo listener drift after park")
            durable_json(receipt_dir / "complete.json", {
                "status": "PARKED_NO_DELETE", "nonce": nonce,
                "evidence": evidence, "destination": str(destination),
                "finance_mutated": False, "published": False,
                "staged": False, "activated": False})
            return {"status": "PARKED_NO_DELETE", "nonce": nonce,
                    "destination": str(destination), "stage_collision_cleared": True}
        except BaseException as exc:
            # Nonce remains consumed, even if no rename completed.
            try:
                durable_json(receipt_dir / "unknown.json", {
                    "status": "UNKNOWN_NO_REPLAY", "error_type": type(exc).__name__})
            except OSError:
                pass
            raise Hold("UNKNOWN_NO_REPLAY: inspect durable state; never retry") from exc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preview", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--permit", type=Path)
    args = parser.parse_args()
    try:
        if args.preview:
            require(os.geteuid() == 0, "privileged root preview required")
            evidence, _ = stage_evidence()
            identity = owner_spki_sha256()
            print(json.dumps({"status": "PREVIEW_ONLY", "evidence": evidence,
                              "controller_sha256": digest(Path(__file__)),
                              "owner_spki_sha256": identity,
                              "approved_target_sha": APPROVED_TARGET_SHA,
                              "authorization": "HOLD_NOT_CONSUMED"}, sort_keys=True))
            return 0
        require(args.permit is not None, "--permit required for APPLY")
        protected_file(args.permit)
        packet = read_json(args.permit)
        print(json.dumps(apply(packet), sort_keys=True))
        return 0
    except (Hold, OSError, ValueError, KeyError, TypeError,
            subprocess.SubprocessError, binascii.Error) as exc:
        print("HOLD: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
