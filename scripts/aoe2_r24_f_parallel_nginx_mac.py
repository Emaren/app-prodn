#!/usr/bin/env python3
"""R25 F: original owner Mac → source-pinned root-SSH → G before/after → rollback.

No original web restart, financial write, custody key or Wolo service mutation.
Missing B/C/D/E/F/G verified scope = HOLD before owner consent or cutover.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

TARGET = "0cee3c836c4b0760478280c145e02e81e470ce0e"
H64 = re.compile(r"[a-f0-9]{64}\Z")
NONCE = re.compile(r"[a-f0-9]{32}\Z")
BUILD = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")

class Hold(RuntimeError):
    pass

def need(ok, why):
    if not ok:
        raise Hold(why)

def pinned_file(path, expected):
    need(type(expected) is str and H64.fullmatch(expected),
         "IMMUTABLE_REVIEWED_SOURCE_SHA256_REQUIRED")
    p = pathlib.Path(path).expanduser()
    st = p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid() and
         not st.st_mode & 0o022 and 0 < st.st_size <= 65536,
         "OWNER_LOCAL_SOURCE_NOT_PRIVATE_REGULAR_FILE")
    raw = p.read_bytes()
    need(hashlib.sha256(raw).hexdigest() == expected,
         "REVIEWED_SOURCE_BYTES_MISMATCH")
    return p, raw

def ssh_source(source, operation, timeout=450):
    cmd = ["/usr/bin/ssh", "-T", "-o", "BatchMode=yes",
           "-o", "StrictHostKeyChecking=yes",
           "-o", "NumberOfPasswordPrompts=0",
           "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1",
           "root@hel1", "/usr/bin/python3 -I -B - " + operation]
    return subprocess.run(cmd, input=source, capture_output=True,
                          timeout=timeout, check=False)

def owner_consent(phrase, root_hash, rollback):
    with open("/dev/tty", "w") as out:
        out.write("R25 parallel website ONLY. Original PID 2625090 on 3030 remains running.\n")
        out.write("No Wolo, custody, original source, release.lock or old web service changes.\n")
        if not rollback:
            out.write("Consent includes automatic Nginx-only rollback if G AFTER fails.\n")
        out.write("Reviewed root SHA256: " + root_hash + "\n")
        out.write("Type exactly " + phrase + ": ")
        out.flush()
    with open("/dev/tty", "r") as inp:
        need(inp.readline().rstrip("\r\n") == phrase, "OWNER_TYPED_CONSENT_DENIED")

def g_witness(source_path, phase, before=None):
    args = [sys.executable, "-B", str(source_path),
            "--phase", phase, "--ssh-target", "root@hel1"]
    if before is not None:
        args += ["--before", str(before),
                 "--before-sha256", hashlib.sha256(before.read_bytes()).hexdigest()]
    p = subprocess.run(args, capture_output=True, timeout=850, check=False)
    if p.returncode:
        sys.stderr.buffer.write(p.stderr[-4000:])
        raise Hold("G_INDEPENDENT_" + phase.upper() + "_WITNESS_FAILED")
    try:
        result = json.loads(p.stdout)
    except ValueError as e:
        raise Hold("G_RESULT_MALFORMED_JSON") from e
    need(type(result) is dict and result.get("phase") == phase,
         "G_RESULT_WRONG_PHASE")
    if phase == "after":
        need(result.get("schema") == "aoe2war.g.r25.postflight.v1" and
             result.get("status") ==
                  "LIVE_PARALLEL_HOST_AND_PUBLIC_MEASURED_REQUIRES_F_STAGE_REVIEW" and
             result.get("frozen_candidate_sha") == TARGET and
             result.get("nginx_active_upstream") == 3031 and
             result.get("old_web_service_pid_unchanged") is True and
             result.get("financial_units_and_wolo_8092_8093_unchanged") is True and
             result.get("original_release_lock_unchanged") is True and
             result.get("new_candidate_source_build_dependency_3031_unchanged") is True,
             "G_REAL_LIVE_PUBLIC_SOURCE_STATIC_FINANCE_WITNESS_NOT_ACCEPTED")
    return p.stdout

def main():
    a = argparse.ArgumentParser()
    a.add_argument("--reviewed-root-file", required=True)
    a.add_argument("--root-source-sha256", required=True)
    a.add_argument("--reviewed-g-file")
    a.add_argument("--g-source-sha256")
    a.add_argument("--root-approved-intent", action="store_true")
    a.add_argument("--rollback", action="store_true")
    opts = a.parse_args()
    need(sys.platform == "darwin" and os.geteuid() != 0,
         "ORIGINAL_OWNER_MAC_NONROOT_REQUIRED")
    _, root = pinned_file(opts.reviewed_root_file, opts.root_source_sha256)
    need(("TARGET=\"" + TARGET + "\"").encode() in root,
         "IMMUTABLE_FROZEN_WEBSITE_SOURCE_NOT_PINNED")
    need(opts.root_approved_intent,
         "ROOT_PROTECTED_NONCE_AND_BUILD_INTENT_REQUIRED")

    g_path = None
    if not opts.rollback:
        need(opts.reviewed_g_file is not None,
             "INDEPENDENT_G_VERIFIER_SOURCE_REQUIRED")
        g_path, _ = pinned_file(opts.reviewed_g_file, opts.g_source_sha256)

    intent_phase = "--root-rollback-intent" if opts.rollback else "--root-owner-intent"
    intent = ssh_source(root, intent_phase, timeout=450)
    need(intent.returncode == 0 and 0 < len(intent.stdout) < 4096,
         "ROOT_APPROVED_PHYSICAL_RELEASE_INTENT_UNAVAILABLE")
    try:
        approved = json.loads(intent.stdout)
    except ValueError as e:
        raise Hold("ROOT_APPROVED_INTENT_NOT_JSON") from e
    need(type(approved) is dict and
         approved.get("schema") == "aoe2war.r25.f.owner-intent.v1" and
         approved.get("candidate_sha") == TARGET and
         approved.get("operation") == ("ROLLBACK" if opts.rollback else "APPLY") and
         approved.get("files_modified") is False,
         "ROOT_APPROVED_INTENT_SCOPE_DRIFT")
    bid = approved.get("candidate_build_id")
    nonce = approved.get("nonce")
    need(type(bid) is str and BUILD.fullmatch(bid) and
         type(nonce) is str and NONCE.fullmatch(nonce),
         "ROOT_APPROVED_BUILD_ID_OR_NONCE_MISSING")
    print("PASS:ROOT_APPROVED_REAL_BUILD_ID_AND_NONCE", flush=True)

    with tempfile.TemporaryDirectory(prefix="r25-f-owner-g-evidence-") as temp:
        before = pathlib.Path(temp) / "before.json"
        if not opts.rollback:
            before.write_bytes(g_witness(g_path, "before"))
            print("PASS:G_ROOT_SSH_BEFORE_PUBLIC_FINANCE_STATIC", flush=True)

        verb = ("ROLLBACK R24 PARALLEL WEBSITE " if opts.rollback else
                "AUTHORIZE R24 PARALLEL WEBSITE ")
        owner_consent(verb + TARGET + " " + bid + " " + nonce,
                      opts.root_source_sha256, opts.rollback)
        command = ("--root-rollback --nonce " + nonce
                   if opts.rollback else "--root-apply")
        result = ssh_source(root, command, timeout=450)
        if result.stdout:
            sys.stdout.buffer.write(result.stdout)
            sys.stdout.buffer.flush()
        if result.stderr:
            sys.stderr.buffer.write(result.stderr)
            sys.stderr.buffer.flush()
        passed = (b"PASS:R24_OLD_WEB_PROXY_RESTORED" if opts.rollback
                  else b"PASS:R24_PARALLEL_PUBLIC_WEBSITE_CUTOVER")
        need(result.returncode == 0 and passed in result.stdout,
             "ROOT_CUTOVER_UNCERTAIN_NO_BLIND_RETRY")
        if opts.rollback:
            print("PASS:R25_NGINX_ONLY_OWNER_CONSENTED_ROLLBACK", flush=True)
            return
        try:
            after_bytes = g_witness(g_path, "after", before=before)
            report = json.loads(after_bytes)
            need(report["next_build_id_measured_on_HOST_not_public"] == bid,
                 "G_ACTUAL_NEXT_BUILD_ID_MISMATCH")
            home = pathlib.Path.home() / ".config/aoe2war/r25-f-owner-receipts"
            home.mkdir(parents=True, exist_ok=True, mode=0o700)
            for phase, data in (("before", before.read_bytes()),
                                ("after", after_bytes)):
                dest = home / ("r25-f-" + nonce + "-" + phase + ".json")
                fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                             os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, "wb") as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
            print("PASS:R25_F_G_LIVE_PARALLEL_PUBLIC_STATIC_AND_FINANCE_VERIFIED",
                  flush=True)
            print("OWNER_EVIDENCE_DIR:", str(home), flush=True)
        except BaseException:
            print("HOLD:G_AFTER_FAILED; ATTEMPTING_APPROVED_AUTOMATIC_NGINX_ONLY_ROLLBACK",
                  file=sys.stderr, flush=True)
            try:
                rollback = ssh_source(root, "--root-rollback --nonce " + nonce,
                                      timeout=450)
                if rollback.stdout:
                    sys.stdout.buffer.write(rollback.stdout)
                if rollback.stderr:
                    sys.stderr.buffer.write(rollback.stderr)
                need(rollback.returncode == 0 and
                     b"PASS:R24_OLD_WEB_PROXY_RESTORED" in rollback.stdout,
                     "AUTOMATIC_ROLLBACK_NOT_PROVEN")
                print("PASS:ORIGINAL_PUBLIC_3030_NGINX_RESTORED", flush=True)
            except BaseException as exc:
                print("HOLD:AUTO_ROLLBACK_UNCERTAIN:" + type(exc).__name__,
                      file=sys.stderr, flush=True)
            raise

if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, subprocess.SubprocessError) as exc:
        print("HOLD:R25_F_OWNER:" + str(exc), file=sys.stderr)
        sys.exit(2)
