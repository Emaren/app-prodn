#!/usr/bin/env python3
"""R23 candidate-only owner root-SSH trust recovery v6.

REVIEW-ONLY until F supplies its independently reviewed C source SHA below.
Never modifies owner-v4, the frozen controller, release.lock, helpers, SSH
access, finances, or production release state. Input is public-key material
and a new-key possession signature; the new PRIVATE key stays on owner Mac.
"""
import base64
from datetime import datetime, timezone, timedelta
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile

HOST = "ubuntu-4gb-hel1-11"
V4 = Path("/etc/aoe2war/website-owner-v4/owner.pem")
ORIGINAL_RSA_FP = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID = (2064, 6185747, 1000, 0o644)
CONFIG = Path("/etc/aoe2war/solo-owner-website-v1")
OLD_APPROVAL = CONFIG / "root-helper-install-v2-approval.json"
OLD_RECEIPT = CONFIG / "root-helper-install-v2-receipt.json"
AUDIT = Path("/var/lib/aoe2war-owner-rotations")
NEW = Path("/etc/aoe2war/website-owner-v6")
ORIGINAL_CONTROLLER = "18052e01a191b15525664c1a058de80d7a8bc150"
ORIGINAL_WEBSITE = "0cee3c836c4b0760478280c145e02e81e470ce0e"
DOMAIN = b"AOE2WAR.OWNER_ROOTSSH_TRUST_RECOVERY.V6\n"
# Fail closed until F independently reviews C code and publishes a new
# F-governed implementation commit binding this exact reviewed C SHA.
F_REVIEWED_C_SOURCE_SHA = ""
SCHEMA = "aoe2war.owner-rootssh-trust-recovery.v6"
HEX = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")

class Hold(Exception):
    pass

def need(condition, why):
    if not condition:
        raise Hold(why)

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")

def no_dupes(pairs):
    d = {}
    for k, v in pairs:
        need(k not in d, "DUPLICATE_JSON_KEY")
        d[k] = v
    return d

def parse(raw):
    return json.loads(raw, object_pairs_hook=no_dupes,
                      parse_constant=lambda _: (_ for _ in ()).throw(Hold("JSON_NONFINITE")))

def digest(data):
    return hashlib.sha256(data).hexdigest()

def utc(value):
    need(type(value) is str and value.endswith("Z"), "NON_UTC_TIME")
    try:
        when = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise Hold("BAD_TIME") from exc
    return when

def verify_new_key_proof(envelope, now=None):
    """Pure intent verification: new-key possession is NOT original RSA consent."""
    need(type(envelope) is dict and set(envelope) ==
         {"schema", "intent", "new_public_pem_base64", "signature_base64"}, "ENVELOPE_FIELDS")
    need(envelope["schema"] == SCHEMA and type(envelope["intent"]) is dict, "ENVELOPE_SCHEMA")
    b = envelope["intent"]
    need(set(b) == {"operation", "version", "nonce", "issued_at", "expires_at",
                    "original_rsa_spki_sha256", "new_rsa_spki_sha256",
                    "original_controller", "original_website", "f_reviewed_c_source_sha",
                    "scope"}, "INTENT_FIELDS")
    need(b["operation"] == "candidate_enroll" and b["version"] == 6 and
         b["scope"] == "PUBLIC_CANDIDATE_ONLY_NO_CONTROLLER_SWITCH", "NO_RELEASE_AUTHORITY")
    need(b["original_rsa_spki_sha256"] == ORIGINAL_RSA_FP and
         b["original_controller"] == ORIGINAL_CONTROLLER and
         b["original_website"] == ORIGINAL_WEBSITE, "ORIGINAL_SOURCE_DRIFT")
    need(type(b["nonce"]) is str and re.fullmatch(r"[0-9a-f]{32}", b["nonce"]) is not None,
         "NONCE_FORMAT")
    need(type(b["new_rsa_spki_sha256"]) is str and HEX.fullmatch(b["new_rsa_spki_sha256"]) is not None
         and b["new_rsa_spki_sha256"] != ORIGINAL_RSA_FP, "NEW_RSA_PIN")
    need(type(b["f_reviewed_c_source_sha"]) is str and
         b["f_reviewed_c_source_sha"] == F_REVIEWED_C_SOURCE_SHA and
         HEX40.fullmatch(F_REVIEWED_C_SOURCE_SHA) is not None, "INDEPENDENT_F_SOURCE_APPROVAL_NOT_ENROLLED")
    start, end = utc(b["issued_at"]), utc(b["expires_at"])
    now = now or datetime.now(timezone.utc)
    need(start <= now <= end and timedelta(0) < end - start <= timedelta(minutes=10),
         "OWNER_INTENT_EXPIRED_OR_INVALID")
    try:
        pub = base64.b64decode(envelope["new_public_pem_base64"], validate=True)
        sig = base64.b64decode(envelope["signature_base64"], validate=True)
    except (ValueError, TypeError) as exc:
        raise Hold("INVALID_BASE64") from exc
    need(200 <= len(pub) <= 4096 and pub.startswith(b"-----BEGIN PUBLIC KEY-----\n")
         and pub.rstrip().endswith(b"-----END PUBLIC KEY-----"), "NEW_PUBLIC_KEY_PEM")
    need(256 <= len(sig) <= 1024, "RSA_SIGNATURE_LENGTH")
    with tempfile.TemporaryDirectory(prefix="r23-v6-newpub-") as temp:
        d = Path(temp)
        key, message, signed = d / "new.pem", d / "intent", d / "signature"
        key.write_bytes(pub)
        message.write_bytes(DOMAIN + canonical(b))
        signed.write_bytes(sig)
        details = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-in", str(key),
                                  "-text_pub", "-noout"], capture_output=True, timeout=8)
        need(details.returncode == 0 and b"Public-Key: (3072 bit)" in details.stdout
             and b"Modulus:" in details.stdout, "NEW_KEY_MUST_BE_RSA_3072")
        der = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-in", str(key),
                              "-outform", "DER"], capture_output=True, timeout=8)
        need(der.returncode == 0 and digest(der.stdout) == b["new_rsa_spki_sha256"],
             "NEW_PUBLIC_KEY_SPKI_MISMATCH")
        verified = subprocess.run(["/usr/bin/openssl", "dgst", "-sha256", "-verify",
                                   str(key), "-signature", str(signed), str(message)],
                                  capture_output=True, timeout=8)
        need(verified.returncode == 0, "NEW_PRIVATE_KEY_POSSESSION_NOT_VERIFIED")
    return b, pub

def protected(path, directory=True):
    """Root-owned non-writable ancestry, no symlinks; never traverses /home/tony."""
    need(path.is_absolute(), "RELATIVE_PATH")
    for part in (path, *path.parents):
        st = part.lstat()
        need(not stat.S_ISLNK(st.st_mode) and st.st_uid == 0 and
             not st.st_mode & 0o022, "UNPROTECTED_ANCESTRY")
    st = path.lstat()
    need(stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode),
         "PROTECTED_OBJECT_TYPE")
    if directory:
        need(stat.S_IMODE(st.st_mode) == 0o700, "ROOT_DIR_NOT_0700")

def secure_read(path, maximum=16384):
    protected(path, directory=False)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        a = os.fstat(fd)
        need(0 < a.st_size <= maximum, "INPUT_BOUNDS")
        raw = os.read(fd, maximum + 1)
        z = os.fstat(fd)
        need(len(raw) == a.st_size and
             (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) ==
             (z.st_dev, z.st_ino, z.st_size, z.st_mtime_ns), "INPUT_RACE")
        return raw
    finally:
        os.close(fd)

def original_state():
    need(sys.platform == "linux" and socket.gethostname() == HOST and os.geteuid() == 0,
         "EXACT_HEL1_ROOT_REQUIRED")
    protected(V4.parent)
    protected(CONFIG)
    protected(AUDIT)
    pub = secure_read(V4)
    with tempfile.TemporaryDirectory(prefix="r23-v6-oldpub-") as t:
        p = Path(t) / "old.pem"
        p.write_bytes(pub)
        r = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-in", str(p),
                            "-outform", "DER"], capture_output=True, timeout=8)
        need(r.returncode == 0 and digest(r.stdout) == ORIGINAL_RSA_FP,
             "ORIGINAL_OWNER_RSA_PUBLIC_CHANGED")
    st = LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and
         (st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) == LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_CHANGED")
    need(not OLD_APPROVAL.exists() and not OLD_APPROVAL.is_symlink() and
         not OLD_RECEIPT.exists() and not OLD_RECEIPT.is_symlink(),
         "ORIGINAL_INSTALL_ALREADY_AUTHORIZED_OR_RECEIPTED")
    for p in (LOCK.parent, LOCK.parent.parent):
        s = p.lstat()
        need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and
             s.st_uid == 1000 and not s.st_mode & 0o022, "ORIGINAL_LOCK_PARENTS_CHANGED")
    return pub

def write_once(path, data):
    protected(path.parent)
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.chown(path, 0, 0)
    os.chmod(path, 0o600)
    os.fsync(os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC))

def require_absent(p):
    need(not p.exists() and not p.is_symlink(), "EXISTING_OR_PARTIAL_RECOVERY_HOLD")

def apply(envelope):
    b, pub = verify_new_key_proof(envelope)  # before any root write
    old = original_state()
    txn = AUDIT / ("r23-v6-" + b["nonce"])
    require_absent(txn)
    require_absent(NEW)
    fd = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        need((st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) == LOCK_ID,
             "LOCK_DESCRIPTOR_DRIFT")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Hold("RELEASE_LOCK_BUSY") from exc
        need(original_state() == old, "ORIGINAL_STATE_DRIFT_UNDER_LOCK")
        require_absent(txn)
        require_absent(NEW)
        os.mkdir(txn, 0o700)
        protected(txn)
        write_once(txn / "intent.json", canonical(envelope) + b"\n")
        write_once(txn / "original-owner-v4-public.pem", old)
        write_once(txn / "new-owner-v6-public.pem", pub)
        os.mkdir(NEW, 0o700)
        protected(NEW)
        write_once(NEW / "owner-public.pem", pub)
        receipt = {"schema": SCHEMA + ".receipt", "nonce": b["nonce"],
                   "new_rsa_spki_sha256": b["new_rsa_spki_sha256"],
                   "original_rsa_spki_sha256": ORIGINAL_RSA_FP,
                   "f_reviewed_c_source_sha": F_REVIEWED_C_SOURCE_SHA,
                   "candidate_only": True, "original_controller_unchanged": True,
                   "finance_authorized": False, "helpers_installed": False}
        write_once(NEW / "candidate-receipt.json", canonical(receipt) + b"\n")
        write_once(txn / "commit.json", canonical(receipt) + b"\n")
        need(secure_read(NEW / "owner-public.pem") == pub and
             secure_read(txn / "commit.json") == secure_read(NEW / "candidate-receipt.json")
             and original_state() == old, "POST_COMMIT_VERIFICATION_FAILED")
        print("PASS:R23_V6_PUBLIC_CANDIDATE_ENROLLED; NO_CONTROLLER_SWITCH_NO_INSTALL_NO_FINANCE")
        print("RECOVERY_NONCE=" + b["nonce"])
    finally:
        os.close(fd)

def rollback(nonce, consent):
    need(type(nonce) is str and re.fullmatch(r"[0-9a-f]{32}", nonce), "ROLLBACK_NONCE")
    need(consent == "ROLLBACK R23 V6 PUBLIC CANDIDATE " + nonce,
         "SEPARATE_ROLLBACK_CONSENT")
    old = original_state()
    txn = AUDIT / ("r23-v6-" + nonce)
    protected(txn)
    receipt = parse(secure_read(txn / "commit.json"))
    need(receipt.get("schema") == SCHEMA + ".receipt" and
         receipt.get("nonce") == nonce and receipt.get("candidate_only") is True,
         "ROLLBACK_COMMIT_NOT_VERIFIED")
    need(not (txn / "rollback.json").exists(), "ROLLBACK_ALREADY_RECORDED")
    protected(NEW)
    need({p.name for p in NEW.iterdir()} == {"owner-public.pem", "candidate-receipt.json"},
         "NEW_TRUST_DIR_HAS_UNREVIEWED_STATE")
    need(secure_read(NEW / "candidate-receipt.json") == canonical(receipt) + b"\n" and
         secure_read(NEW / "owner-public.pem") == secure_read(txn / "new-owner-v6-public.pem"),
         "CANDIDATE_BYTES_CHANGED")
    # The candidate is not an active controller trust anchor. Deleting its
    # exact bytes restores the original no-v6-candidate state; audit retained.
    fd = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        need(original_state() == old, "ORIGINAL_STATE_DRIFT_UNDER_LOCK")
        (NEW / "candidate-receipt.json").unlink()
        (NEW / "owner-public.pem").unlink()
        NEW.rmdir()
        write_once(txn / "rollback.json", canonical({
            "schema": SCHEMA + ".rollback", "nonce": nonce,
            "original_v4_unchanged": True, "candidate_only": True}) + b"\n")
        print("PASS:R23_V6_PUBLIC_CANDIDATE_ROLLED_BACK; AUDIT_PRESERVED")
    finally:
        os.close(fd)

def main():
    need(len(sys.argv) in (3, 4), "USAGE: apply ENVELOPE_BASE64 | rollback NONCE EXACT_CONSENT_BASE64")
    mode = sys.argv[1]
    if mode == "apply":
        need(len(sys.argv) == 3 and len(sys.argv[2]) <= 16000, "ENVELOPE_BOUND")
        raw = base64.b64decode(sys.argv[2], validate=True)
        need(len(raw) <= 12000, "ENVELOPE_LENGTH")
        apply(parse(raw))
    elif mode == "rollback":
        need(len(sys.argv) == 4, "ROLLBACK_ARGUMENTS")
        consent = base64.b64decode(sys.argv[3], validate=True).decode("ascii")
        rollback(sys.argv[2], consent)
    else:
        raise Hold("UNKNOWN_MODE")

if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError) as exc:
        print("HOLD:R23_V6:" + str(exc), file=sys.stderr)
        sys.exit(2)
