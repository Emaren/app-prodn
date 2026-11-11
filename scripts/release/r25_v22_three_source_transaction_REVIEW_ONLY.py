#!/usr/bin/env python3
"""Session B source-only three-file V22 source reconciliation transaction.

No production entry point: invoking the file ALWAYS HOLDs. The file transaction
is injectable for isolated fixture tests. A distinct Central-reviewed root
executor must bind exact host/PID/timer/lock/nonce/lease/financial preflight,
verify self SHA, and own the existing Steam flock for its ENTIRE execution.
Never substitute this module for approval or call it on HEL1 without review.

The durable on-disk intent is written before the first destination replacement.
After crash at any swap boundary, inverse only overwrites exact known OLD/NEW
hashes. A competing writer's unknown bytes cause HOLD, not forced overwrite.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import sys

class Hold(RuntimeError):
    pass

PINNED = {
    "v22": (
        "c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc",
        "cd6ec295573329e26227109707b2a33104453f76ca57b5ee4d027906fd3d54df",
    ),
    "controller": (
        "dbbaab81dc964352670b24b23eea482f1af52d319015969ebb2d48cd59d171b8",
        "9e2262b0d1f1e428cdd18e2f1d7b1aab84247aadd01b88dbcfbc430aa3f85350",
    ),
    "guard": (
        "70e5331d9920e5675f815ceb333f19236956f940adae4d106b0864fef60bd17c",
        "87314320dd4aee0730d619a512d3625ac45a67d2030d6a0930d22ecbb4396de2",
    ),
}
ORDER = tuple(PINNED)
PRODUCTION_TARGETS = {
    "v22": "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py",
    "controller": "/usr/local/lib/aoe2war-web-prod/r25_public_player_one_use_cutover_v1.py",
    "guard": "/usr/local/lib/aoe2war-web-prod/r25_public_player_same_slot_preflight_v1.py",
}

def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()

def canonical(obj: object) -> bytes:
    return (json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n").encode()

def fsync_dir(path: Path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def strict_file(path: Path, *, require_uid: int | None = None,
                require_mode: int | None = None, max_size: int = 500_000) -> bytes:
    st = path.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_size <= 0 or st.st_size > max_size or
            (require_uid is not None and st.st_uid != require_uid) or
            (require_mode is not None and stat.S_IMODE(st.st_mode) != require_mode)):
        raise Hold("FILE_PROVENANCE_" + path.name)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        st2 = os.fstat(fd)
        if (st2.st_ino, st2.st_dev, st2.st_size) != (st.st_ino, st.st_dev, st.st_size):
            raise Hold("FILE_RACE_" + path.name)
        raw = b""
        while len(raw) <= max_size:
            buf = os.read(fd, min(65536, max_size + 1 - len(raw)))
            if not buf:
                break
            raw += buf
        if len(raw) != st.st_size:
            raise Hold("FILE_READ_DRIFT_" + path.name)
        return raw
    finally:
        os.close(fd)

def create_once(path: Path, blob: bytes, *, mode: int = 0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb", closefd=False) as out:
            out.write(blob)
            out.flush()
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)

class Transaction:
    """No public CLI. The caller MUST supply a separate approved locked executor."""
    def __init__(self, targets: dict[str, Path], candidates: dict[str, Path],
                 state_dir: Path, *, trusted_uid: int):
        if set(targets) != set(ORDER) or set(candidates) != set(ORDER):
            raise Hold("EXACT_THREE_TARGETS_REQUIRED")
        self.targets = {k: Path(targets[k]) for k in ORDER}
        self.candidates = {k: Path(candidates[k]) for k in ORDER}
        self.state = Path(state_dir)
        self.uid = trusted_uid
        st = self.state.lstat()
        if (not stat.S_ISDIR(st.st_mode) or st.st_uid != trusted_uid or
                stat.S_IMODE(st.st_mode) != 0o700):
            raise Hold("ROOT_STATE_PARENT_NOT_TRUSTED")
        if len({str(x) for x in self.targets.values()}) != 3:
            raise Hold("TARGET_PATH_COLLISION")

    def event(self, name: str):
        if not name.isascii() or not name.replace("_", "").isalnum():
            raise Hold("INVALID_EVENT")
        create_once(self.state / (name + ".json"), canonical({"event": name}))

    def manifest(self):
        body = {"schema": "aoe2war.b.v22.exact-three-file-transaction.review.v1",
                "order": list(ORDER),
                "pins": {k: {"old": PINNED[k][0], "new": PINNED[k][1]}
                         for k in ORDER}}
        return canonical(body)

    def prepare(self):
        # O_EXCL transaction marker first. A replay/partial transaction cannot
        # overwrite previous root-owned inverse bytes.
        if any(self.state.iterdir()):
            raise Hold("STATE_ALREADY_CONSUMED")
        old_data = {}
        new_data = {}
        for key in ORDER:
            old = strict_file(self.targets[key], require_uid=self.uid)
            new = strict_file(self.candidates[key], require_uid=self.uid, require_mode=0o400)
            if sha(old) != PINNED[key][0]:
                raise Hold("OLD_SOURCE_SHA_" + key)
            if sha(new) != PINNED[key][1]:
                raise Hold("NEW_SOURCE_SHA_" + key)
            old_data[key], new_data[key] = old, new
        self.event("PREPARE_INTENT")
        for key in ORDER:
            create_once(self.state / (key + ".inverse"), old_data[key], mode=0o400)
            # A same-directory staging path gives atomic os.replace even when
            # source reviews reside on another filesystem.
            stage = self.targets[key].with_name(self.targets[key].name + ".b-v22-new-stage")
            create_once(stage, new_data[key], mode=stat.S_IMODE(self.targets[key].stat().st_mode))
        create_once(self.state / "manifest.json", self.manifest(), mode=0o400)
        self.event("PREPARED")

    def verify_provenance(self):
        manifest = strict_file(self.state / "manifest.json", require_uid=self.uid,
                               require_mode=0o400)
        if manifest != self.manifest():
            raise Hold("MANIFEST_TAMPER")
        for key in ORDER:
            inverse = strict_file(self.state / (key + ".inverse"),
                                  require_uid=self.uid, require_mode=0o400)
            if sha(inverse) != PINNED[key][0]:
                raise Hold("INVERSE_TAMPER_" + key)

    def apply(self, *, after_swap=None):
        if not (self.state / "PREPARED.json").is_file():
            raise Hold("NOT_PREPARED")
        if (self.state / "COMPLETED.json").exists():
            raise Hold("TRANSACTION_ALREADY_COMPLETED")
        self.verify_provenance()
        for key in ORDER:
            stage = self.targets[key].with_name(self.targets[key].name + ".b-v22-new-stage")
            if sha(strict_file(self.targets[key], require_uid=self.uid)) != PINNED[key][0]:
                raise Hold("PRE_SWAP_TARGET_DRIFT_" + key)
            if sha(strict_file(stage, require_uid=self.uid)) != PINNED[key][1]:
                raise Hold("PRE_SWAP_STAGE_DRIFT_" + key)
            self.event("SWAP_INTENT_" + key)
            os.replace(stage, self.targets[key])
            fsync_dir(self.targets[key].parent)
            if sha(strict_file(self.targets[key], require_uid=self.uid)) != PINNED[key][1]:
                raise Hold("POST_SWAP_TARGET_DRIFT_" + key)
            self.event("SWAPPED_" + key)
            if after_swap is not None:
                after_swap(key)
        self.event("APPLIED_UNVERIFIED")

    def inverse(self):
        """Idempotent crash recovery of exact OLD/NEW bytes only.

        A crash after creating an inverse-stage file but before renaming it
        must NOT strand future recovery on a benign existing staging name.
        Existing stages are reused only if their exact trusted old hash and
        metadata match. No unknown source overwrite is ever authorized.
        """
        if not (self.state / "PREPARED.json").is_file():
            raise Hold("INVERSE_WITHOUT_PREPARED_ROOT_RECEIPT")
        self.verify_provenance()
        if (self.state / "COMPLETED.json").exists():
            raise Hold("COMPLETED_REQUIRES_NEW_ROLLBACK_AUTHORITY")
        for key in reversed(ORDER):
            dest = self.targets[key]
            actual = sha(strict_file(dest, require_uid=self.uid))
            if actual not in PINNED[key]:
                raise Hold("UNKNOWN_TARGET_COMPETING_WRITER_" + key)
            payload = strict_file(self.state / (key + ".inverse"),
                                  require_uid=self.uid, require_mode=0o400)
            if sha(payload) != PINNED[key][0]:
                raise Hold("INVERSE_TAMPER_" + key)
            stage = dest.with_name(dest.name + ".b-v22-inverse-stage")
            if stage.exists() or stage.is_symlink():
                previous = strict_file(stage, require_uid=self.uid)
                if sha(previous) != PINNED[key][0] or (
                    stat.S_IMODE(stage.lstat().st_mode) !=
                    stat.S_IMODE(dest.lstat().st_mode)):
                    raise Hold("INVERSE_STAGE_COMPETING_WRITER_" + key)
            elif actual == PINNED[key][1]:
                create_once(stage, payload,
                            mode=stat.S_IMODE(dest.stat().st_mode))
            if actual == PINNED[key][1]:
                os.replace(stage, dest)
                fsync_dir(dest.parent)
                if sha(strict_file(dest, require_uid=self.uid)) != PINNED[key][0]:
                    raise Hold("INVERSE_FAILED_" + key)
            elif stage.exists():
                # Exact benign leftover stage from an interrupted earlier
                # inverse. Clean only the pinned byte-equivalent path.
                stage.unlink()
                fsync_dir(dest.parent)
        if not (self.state / "INVERSE_COMPLETE.json").exists():
            self.event("INVERSE_COMPLETE")
        for key in ORDER:
            if sha(strict_file(self.targets[key], require_uid=self.uid)) != PINNED[key][0]:
                raise Hold("POST_INVERSE_OLD_SOURCE_DRIFT_" + key)

    def complete_after_external_proof(self):
        # This review primitive cannot validate independent Central approval,
        # seven protected PIDs, current Steam lease or physical TLS/HTTP.
        # Do not allow a caller to turn a source-hash match into a false
        # production "COMPLETED" receipt. A separately reviewed root executor
        # must own the final source-/host-/permit-bound acceptance.
        raise Hold("EXTERNAL_HOST_ATTESTATION_NOT_IMPLEMENTED_REVIEW_ONLY")

if __name__ == "__main__":
    print("HOLD:REVIEW_ONLY_NO_PRODUCTION_INSTALL_ENTRYPOINT")
    sys.exit(3)
