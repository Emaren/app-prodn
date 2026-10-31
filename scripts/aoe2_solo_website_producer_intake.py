#!/usr/bin/python3 -I
"""R16 native receipt intake: root-seal externally signed evidence, never sign it.

This is NOT a release controller, signer, source-census substitute or issuer.
Only separately reviewed C root installation may enable --seal. F's original
native issuer performs the final source/finance/host/recovery admission.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys
from datetime import datetime, timedelta, timezone

HOST = "ubuntu-4gb-hel1-11"
W1_SAFE = "ac2443b15e0c9475c34e10b5f0acc60cb9c7295e"
FROZEN_W1 = "b46a51f1592c9f296839924ae55e722618b10d35"
CLASSES = ("doctor", "recovery", "finance", "host", "source", "stage")
PHASES = ("PRE_STAGE", "PRE_ACTIVATE", "POST_ACTIVATE", "POST_ROLLBACK")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
INBOX = Path("/var/lib/aoe2war-solo-website-v1/native-producer-inbox")
OUT = Path("/var/lib/aoe2war-solo-website-v1/native-admission")
EXECUTABLE = Path("/usr/local/libexec/aoe2war/solo-v1-producer-intake")
LIMIT = 262144

class Hold(RuntimeError):
    pass

def need(ok, code):
    if not ok:
        raise Hold("PRODUCER_INTAKE_HOLD:" + code)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def unique(pairs):
    result = {}
    for k, v in pairs:
        need(k not in result, "DUPLICATE_JSON_PROPERTY")
        result[k] = v
    return result

def root_directory(path):
    need(path.is_absolute(), "RELATIVE_TRUST_PATH")
    for node in (path, *path.parents):
        st = node.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid == 0 and
             not st.st_mode & 0o022, "UNTRUSTED_DIRECTORY_ANCESTOR")

def sealed_file(path):
    root_directory(path.parent)
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and
         not st.st_mode & 0o077 and 0 < st.st_size <= LIMIT,
         "UNTRUSTED_PRODUCER_BYTES")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        fst = os.fstat(fd)
        need((fst.st_dev, fst.st_ino, fst.st_size, fst.st_mtime_ns,
              fst.st_ctime_ns) == (st.st_dev, st.st_ino, st.st_size,
                                   st.st_mtime_ns, st.st_ctime_ns),
             "RECEIPT_REPLACED_BEFORE_READ")
        raw = os.read(fd, LIMIT + 1)
        end, visible = os.fstat(fd), path.lstat()
        def ident(x):
            return (x.st_dev, x.st_ino, x.st_size, x.st_mtime_ns, x.st_ctime_ns)
        need(len(raw) == st.st_size and ident(st) == ident(end) == ident(visible),
             "RECEIPT_REPLACED_DURING_READ")
        return raw
    finally:
        os.close(fd)

def parse(raw):
    need(type(raw) is bytes and 0 < len(raw) <= LIMIT, "INPUT_SIZE")
    try:
        obj = json.loads(raw, object_pairs_hook=unique,
                         parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
    except (ValueError, UnicodeError) as exc:
        raise Hold("INVALID_INPUT_JSON") from exc
    need(type(obj) is dict, "INPUT_NOT_OBJECT")
    return obj

def stamp(value, now):
    need(type(value) is str and value.endswith("Z"), "UTC_TIME_REQUIRED")
    try:
        t = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise Hold("BAD_UTC_TIME") from exc
    need(t.utcoffset() == timedelta(0) and
         timedelta(0) <= now - t <= timedelta(seconds=120), "STALE_OR_FUTURE_PRODUCER")
    return t

def verify_six(candidate, phase, attempt, *, source=INBOX, verifier=None, now=None):
    """Read six immutable raw inputs and invoke F's REAL six-key verifier.

    Returns exact original bytes; never re-serializes signed producer files.
    No filesystem write and no private-key use here.
    """
    need(candidate == W1_SAFE and candidate != FROZEN_W1,
         "NOT_EXACT_APPROVED_W1_SAFE_SOURCE")
    need(phase in PHASES and type(attempt) is str and HEX64.fullmatch(attempt),
         "INVALID_ATTEMPT_OR_PHASE")
    now = now or datetime.now(timezone.utc)
    folder = source / attempt / phase
    root_directory(folder)
    sections, signatures, raw_files = {}, {}, {}
    observed = None
    for name in CLASSES:
        raw = sealed_file(folder / (name + ".json"))
        obj = parse(raw)
        need(set(obj) == {"schema", "class", "section", "receipt"} and
             obj["schema"] == "aoe2war.solo.native-issuer-input.v1" and
             obj["class"] == name and type(obj["section"]) is dict and
             type(obj["receipt"]) is dict, "INVALID_PRODUCER_ENVELOPE")
        claim = obj["receipt"]
        need(set(claim) == {"payload", "signature_base64"} and
             type(claim["payload"]) is dict, "UNSIGNED_PRODUCER_CLAIM")
        p = claim["payload"]
        section = obj["section"]
        content = section.get("mount") if name == "host" else section
        need(type(content) is dict and
             set(p) == {"producer", "candidate_sha", "attempt_id", "phase",
                        "host", "observed_at", "content_sha256"} and
             p["producer"] == name and p["candidate_sha"] == candidate and
             p["attempt_id"] == attempt and p["phase"] == phase and
             p["host"] == HOST and p["content_sha256"] == digest(canonical(content)),
             "PRODUCER_SECTION_SCOPE_OR_HASH")
        t = stamp(p["observed_at"], now)
        if observed is None:
            observed = t
        need(t == observed, "INDEPENDENT_PRODUCER_TIME_SKEW")
        if name == "host":
            need(set(section) == {"mount", "rollback"} and
                 type(section["rollback"]) is dict and
                 section["mount"].get("rollback_sha256") ==
                 digest(canonical(section["rollback"])), "UNBOUND_ROOT_ROLLBACK")
        sections[name], signatures[name], raw_files[name] = section, claim, raw
    if verifier is None:
        # The canonical installed F verifier authenticates real Ed25519 SPKIs,
        # six unique root-enrolled identities and all six signed payloads.
        try:
            from aoe2_solo_website_producer_receipts import verify_all as verifier
        except ImportError as exc:
            raise Hold("CANONICAL_F_VERIFIER_NOT_INSTALLED") from exc
    report = {
        "candidate_sha": candidate, "phase": phase, "attempt_id": attempt,
        "doctor": sections["doctor"], "recovery": sections["recovery"],
        "finance": sections["finance"], "mount": sections["host"]["mount"],
        "source_scope": sections["source"], "stage": sections["stage"],
        "receipt_provenance": {"signed_producers": signatures},
    }
    try:
        valid = verifier(report)
    except Exception as exc:
        raise Hold("CANONICAL_F_SIGNATURE_VERIFIER_REFUSED") from exc
    need(valid is True, "SIX_REAL_SIGNATURES_NOT_VERIFIED")
    return raw_files

def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def seal_once(raw_files, attempt, phase, *, output=OUT):
    """Commit one immutable receipt slot. Partial interruption stays HOLD."""
    root_directory(output)
    target_root = output / attempt
    try:
        os.mkdir(target_root, 0o700)
        fsync_dir(output)
    except FileExistsError:
        root_directory(target_root)
    slot = target_root / phase
    # mkdir is O_EXCL for directories: no replay, replacement or overwrite.
    os.mkdir(slot, 0o700)
    try:
        for name in CLASSES:
            raw = raw_files[name]
            fd = os.open(slot / (name + ".json"),
                         os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                         os.O_CLOEXEC, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
        fsync_dir(slot)
        fsync_dir(target_root)
    except BaseException:
        # No deletion or retry fabrication. Incomplete immutable slot HOLDS.
        raise
    return {"status": "SIGNED_PRODUCER_INPUTS_SEALED_NOT_ADMITTED",
            "attempt_id": attempt, "phase": phase, "source_sha": W1_SAFE,
            "receipt_classes": list(CLASSES), "release_authorized": False,
            "financial_movement_authorized": False}

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("verify", "seal"))
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--phase", required=True)
    parser.add_argument("--attempt", required=True)
    args = parser.parse_args(argv)
    try:
        need(sys.platform == "linux" and os.geteuid() == 0 and
             socket.gethostname() == HOST, "EXPECTED_HEL1_ROOT")
        need(os.path.realpath(__file__) == str(EXECUTABLE),
             "UNREVIEWED_OR_UNINSTALLED_BINARY")
        need(not any(k in os.environ for k in ("PYTHONPATH", "PYTHONHOME")),
             "PYTHON_IMPORT_INJECTION")
        raw = verify_six(args.candidate, args.phase, args.attempt)
        if args.action == "verify":
            result = {"status": "SIX_SIGNATURES_VERIFIED_NOT_ADMITTED",
                      "release_authorized": False, "receipt_classes": list(CLASSES)}
        else:
            result = seal_once(raw, args.attempt, args.phase)
        print(canonical(result).decode("ascii"))
        return 0
    except (Hold, OSError, ValueError, KeyError, TypeError) as exc:
        print("HOLD:" + (str(exc) if isinstance(exc, Hold) else type(exc).__name__),
              file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
