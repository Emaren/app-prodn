#!/usr/bin/env python3
"""M1 actual-owner, offline, exact five HEL1 runtime-retirement signer.

Only signs a fresh real HEL1 --preview and verifies five retained source ZIPs
and the five unique Factory status exceptions on FileVault M1. Does NOT SSH,
install, run root commands, or retire any byte. Local owner TTY required.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timedelta, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile

from we2_exact_five_runtime_retire_v1 import (DOMAIN, SCHEMA, TARGETS,
                                              canonical, exact_inventory,
                                              inventory_digest, need, sha)

M1 = Path("/Users/tonyblum")
RECOVERY = M1 / "AoE2WAR-Recovery"
OUTPUT = RECOVERY / "WE2-approval-tools"
SOURCE_ZIPS = {
    "39a2d8b2eba9": "60011e8fda8ba9aefabae3f32723f6f5fb0a306d963a936851477a52e219d3db",
    "e31e1c053a3b": "80b125279ac61e10a95c16af9fe3cc2227fd1e08615361dd1711432e03d9d535",
    "9c5fb786b066": "d9e8ed8c5ba35bbf026d64422242cdf96626ef8aad9008524bdd45532cf73e2b",
    "8ccf253bd470": "5600ffb0351a40e0368a288943706c590bf54c5c4965a4533ffefe3731daba09",
    "303fdf6d7e53": "d2722c212f3975f8aecbabf23390f2a786740752e76ae7d50a8901f939304e36",
}


def digest_file(path: Path) -> str:
    s = path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid == 501 and s.st_nlink == 1,
         "M1_SOURCE_NOT_OWNER_REGULAR_" + path.name)
    h = hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def offhost_backups() -> None:
    fv = subprocess.run(["/usr/bin/fdesetup", "status"],
                        capture_output=True, text=True, timeout=12)
    need(fv.returncode == 0 and "FileVault is On." in fv.stdout,
         "M1_FILEVAULT_NOT_ON")
    for prefix, _, _, _, _, status_hash in TARGETS:
        original = M1 / ".aoe2war-product-releases" / "cache" / (
            SOURCE_ZIPS[prefix] + ".zip")
        need(digest_file(original) == SOURCE_ZIPS[prefix],
             "M1_ORIGINAL_FACTORY_ZIP_DRIFT_" + prefix)
        if prefix == "39a2d8b2eba9":
            status = RECOVERY / ("WE2-HEL1-39a2-retired-runtime-exception-"
                                 "public-factory-status-SHA1fc4b4.json")
        else:
            status = RECOVERY / ("WE2-HEL1-" + prefix +
                                 "-historic-factory-status-" +
                                 status_hash[:8] + ".json")
        need(digest_file(status) == status_hash,
             "M1_OFFHOST_STATUS_EXCEPTION_DRIFT_" + prefix)


def validate_preview(preview: dict, controller_sha: str) -> None:
    need(preview.get("schema") == SCHEMA and
         preview.get("status") == "PREVIEW_ONLY" and
         preview.get("authority") == "OWNER_SIGNATURE_NOT_CONSUMED",
         "INVALID_REAL_ROOT_PREVIEW")
    need(re.fullmatch(r"[0-9a-f]{64}", controller_sha) is not None and
         preview.get("controller_sha256") == controller_sha,
         "CONTROLLER_SOURCE_SHA_DRIFT")
    need(preview.get("inventory_sha256") == inventory_digest() and
         preview.get("targets") == exact_inventory() and
         preview.get("gross_allocated_bytes") == 7941881856,
         "EXACT_FIVE_PREVIEW_DRIFT")
    need(preview.get("health", {}).get("runtime") == "fcd58f2ac05b"
         and preview["health"].get("https_200") is True
         and preview["health"].get("protected_up") == [3030,3032,3033,9447]
         and preview["health"].get("financial_down") == [8092,8093,8094,8095],
         "LIVE_PROTECTION_GUARDS_NOT_PASS")
    need(preview.get("free_root_before_bytes", 0) > 0,
         "MISSING_REAL_DF_MEASUREMENT")
    need(re.fullmatch(r"[0-9a-f]{64}", preview.get("owner_spki_sha256",""))
         is not None, "MISSING_ROOT_OWNER_SPKI")


def public_spki(key: Path, passphrase: str | None) -> bytes:
    openssl = "/opt/homebrew/opt/openssl@3/bin/openssl"
    args = [openssl, "pkey", "-in", str(key), "-pubout", "-outform", "DER"]
    if passphrase is not None:
        args += ["-passin", "fd:0"]
    p = subprocess.run(args, input=None if passphrase is None
                       else (passphrase + "\n").encode(),
                       capture_output=True, timeout=20)
    need(p.returncode == 0 and len(p.stdout) > 32,
         "LOCAL_OWNER_KEY_UNUSABLE")
    return p.stdout


def sign(packet: dict, key: Path, passphrase: str | None) -> str:
    openssl = "/opt/homebrew/opt/openssl@3/bin/openssl"
    with tempfile.TemporaryDirectory(prefix="we2-local-owner-sign-") as tmp:
        msg = Path(tmp) / "msg"
        msg.write_bytes(DOMAIN + canonical(packet))
        argv = [openssl, "pkeyutl", "-sign", "-rawin",
                "-inkey", str(key), "-in", str(msg)]
        if passphrase is not None:
            argv += ["-passin", "fd:0"]
        p = subprocess.run(argv, input=None if passphrase is None
                           else (passphrase + "\n").encode(),
                           capture_output=True, timeout=20)
    need(p.returncode == 0 and len(p.stdout) == 64,
         "OWNER_ED25519_SIGNATURE_FAILED")
    return base64.b64encode(p.stdout).decode("ascii")


def issue(args: argparse.Namespace) -> None:
    need(sys.platform == "darwin" and os.getuid() in (0, 501)
         and sys.stdin.isatty() and sys.stdout.isatty(),
         "ACTUAL_OWNER_M1_TERMINAL_REQUIRED")
    st = args.private_key.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid in (0, 501)
         and st.st_nlink == 1 and not st.st_mode & 0o077,
         "OWNER_PRIVATE_KEY_CUSTODY")
    preview_st = args.preview.lstat()
    need(stat.S_ISREG(preview_st.st_mode) and preview_st.st_uid in (0, 501)
         and preview_st.st_nlink == 1 and stat.S_IMODE(preview_st.st_mode) == 0o600,
         "PREVIEW_NOT_PRIVATE_OWNER_FILE")
    preview = json.loads(args.preview.read_text())
    validate_preview(preview, args.controller_sha256)
    offhost_backups()
    phrase = ("RETIRE FIVE EXACT HEL1 RUNTIMES " +
              args.controller_sha256 + " " + inventory_digest())
    print("Exact five selected only; expected 7,941,881,856 gross bytes.")
    print("No Factory ZIP, status exception, financial path or rollback target.")
    typed = input("Type exact owner approval [" + phrase + "]: ").strip()
    need(typed == phrase, "OWNER_INTERACTIVE_APPROVAL_NOT_GIVEN")
    passphrase = getpass.getpass("Owner signing-key passphrase (blank if none): ")
    passphrase = passphrase if passphrase else None
    need(sha(public_spki(args.private_key, passphrase)) ==
         preview["owner_spki_sha256"], "OWNER_PUBLIC_KEY_WRONG")
    now = datetime.now(timezone.utc)
    packet = dict(schema=SCHEMA, action="RETIRE_EXACT_FIVE_ONLY",
                  owner="Emaren", financial_authorized=False,
                  live_runtime="fcd58f2ac05b",
                  controller_sha256=args.controller_sha256,
                  owner_spki_sha256=preview["owner_spki_sha256"],
                  inventory_sha256=inventory_digest(),
                  targets=exact_inventory(),
                  nonce=secrets.token_urlsafe(40),
                  issued_utc=now.isoformat().replace("+00:00","Z"),
                  expires_utc=(now + timedelta(minutes=15)).isoformat().replace("+00:00","Z"))
    raw = canonical({"payload": packet,
                     "signature_base64": sign(packet,args.private_key,passphrase)}) + b"\n"
    need(OUTPUT.is_dir() and OUTPUT.stat().st_uid == 501,
         "OWNER_PERMIT_OUTPUT_NOT_ENROLLED")
    out = OUTPUT / ("WE2-HEL1-EXACT-FIVE-RETIRE-" +
                    now.strftime("%Y%m%dT%H%M%SZ") + ".json")
    fd = os.open(out, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    if os.getuid() == 0:
        os.fchown(fd, 501, 501)
    with os.fdopen(fd,"wb") as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    print("OWNER_PERMIT_READY_FOR_SEPARATE_REVIEWED_ROOT_EXECUTOR", out)
    print("SHA256", sha(raw))
    print("Signing only: NO SSH, NO HEL1 write, NO deletion.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--controller-sha256", required=True)
    parser.add_argument("--private-key", type=Path, required=True)
    try:
        issue(parser.parse_args())
    except (ValueError, KeyError, OSError, subprocess.TimeoutExpired) as e:
        print("HOLD_OWNER_EXACT_FIVE_PERMIT", str(e)[:200], file=sys.stderr)
        raise SystemExit(2) from None
