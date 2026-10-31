#!/usr/bin/env python3
"""R25 B owner Mac: reviewed GUI consent for ONE witness-only repair.

--repair requires typed native GUI consent before any SSH. --prestart-only
is read-only and requires the original root repair receipt to be positive.
Pinned code downloaded at exact immutable Git commits; NO B installer replay.
"""
import argparse
import base64
import hashlib
import json
import os
import shlex
import subprocess
import sys
import urllib.request

ROOT_REF = "79f74e65df99ba7def4a9f529a2ad666c887f89b"
ROOT_SIZE = 14001
ROOT_SHA = "da0205653ad0f1fb6a39ea8f3973caaa7442c2ce47e9a73491dbe4e49ec7c82b"
ROOT_BLOB = "65c1148fddae15450809a128a8c4ed71e34cb5c8"
WITNESS_REF = "d92965fc881e404b57c347ab96d18562ced48f06"
WITNESS_SIZE = 22062
WITNESS_SHA = "edf1b42ea7cc8001da83d7076d8aa08f924860fd9a40f97431e60ad8528a30dc"
WITNESS_BLOB = "4df1cfcfa517129358ae47836481d90abd7e7054"
AUTH = "REPAIR-R25-B-WITNESS-ONLY-87d340314e46"


def hold(reason):
    raise SystemExit("HOLD:R25_B_OWNER_REPAIR:" + reason)


def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\x00" + data).hexdigest()


def fetch(ref, path, size, digest, gitblob):
    url = "https://raw.githubusercontent.com/Emaren/app-prodn/" + ref + "/" + path
    try:
        with urllib.request.urlopen(url, timeout=25) as resp:
            raw = resp.read(size + 1)
    except Exception as exc:
        hold("FETCH_" + type(exc).__name__)
    if (len(raw) != size or hashlib.sha256(raw).hexdigest() != digest
        or blob(raw) != gitblob):
        hold("IMMUTABLE_SOURCE_SIZE_SHA256_OR_GIT_BLOB_DRIFT")
    return raw


def owner_approval():
    # Nothing remote has been contacted at this point.
    script = (
        'set answerRecord to display dialog '
        '"Type the separate ONE-USE R25 B WITNESS-ONLY repair authorization:" '
        'default answer "" buttons {"Cancel", "Authorize"} default button "Cancel"\n'
        'return text returned of answerRecord'
    )
    try:
        answer = subprocess.run(["/usr/bin/osascript", "-e", script], text=True,
                                capture_output=True, timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        hold("GUI_UNAVAILABLE_" + type(exc).__name__)
    if answer.returncode != 0 or answer.stdout.rstrip("\r\n") != AUTH:
        hold("EXACT_NEW_GUI_REPAIR_CONSENT_NOT_GRANTED")
    print("PASS:R25_B_DISTINCT_TYPED_GUI_REPAIR_CONSENT", flush=True)


def root_call(root, witness, phase, *, approved=False):
    loader = ("import base64;exec(compile(base64.b64decode(" +
              repr(base64.b64encode(root).decode("ascii")) +
              "), 'reviewed-root-b-repair', 'exec'))")
    cmd = ["/usr/bin/python3", "-I", "-B", "-c", loader, "--phase", phase]
    if phase == "repair" and approved:
        cmd += ["--consent", AUTH]
    remote = " ".join(shlex.quote(part) for part in cmd)
    ssh = ["/usr/bin/ssh", "-T", "-o", "BatchMode=yes",
           "-o", "StrictHostKeyChecking=yes",
           "-o", "NumberOfPasswordPrompts=0",
           "-o", "ConnectTimeout=10", "root@hel1", remote]
    payload = json.dumps({"witness_b64": base64.b64encode(witness).decode()}).encode()
    try:
        result = subprocess.run(ssh, input=payload, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=85, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        hold("SSH_" + type(exc).__name__ + "_NO_BLIND_RETRY")
    if len(result.stdout) > 22000:
        hold("UNBOUNDED_ROOT_REPLY")
    try:
        reply = json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError):
        hold("ROOT_REPLY_INVALID_NO_BLIND_RETRY")
    if result.returncode or reply.get("status") == "HOLD":
        print(json.dumps(reply, sort_keys=True), flush=True)
        hold("ROOT_" + str(reply.get("reason", "EXECUTION_FAILED"))[:110] + "_NO_BLIND_RETRY")
    return reply


def main():
    ap = argparse.ArgumentParser()
    modes = ap.add_mutually_exclusive_group(required=True)
    modes.add_argument("--repair", action="store_true")
    modes.add_argument("--prestart-only", action="store_true")
    args = ap.parse_args()
    if sys.platform != "darwin" or os.geteuid() == 0:
        hold("ORIGINAL_NONROOT_MAC_REQUIRED")
    root = fetch(ROOT_REF, "scripts/r25_b_one_use_witness_repair_root.py",
                 ROOT_SIZE, ROOT_SHA, ROOT_BLOB)
    witness = fetch(WITNESS_REF, "scripts/r25_b_host_witness.py",
                    WITNESS_SIZE, WITNESS_SHA, WITNESS_BLOB)
    print("PASS:B_REPAIR_ROOT_AND_REPAIRED_WITNESS_IMMUTABLE_PINS", flush=True)
    if args.prestart_only:
        native = root_call(root, witness, "prestart")
        if native.get("status") != "PASS_B_REPAIRED_WITNESS_NATIVE_PRESTART_READ_ONLY":
            hold("PRESTART_PHYSICAL_NOT_ADMITTED")
        print(json.dumps(native, sort_keys=True), flush=True)
        print("PASS:R25_B_REPAIRED_WITNESS_PRESTART_READ_ONLY_NO_3031_START_OR_CUTOVER")
        return 0
    owner_approval()
    planned = root_call(root, witness, "plan")
    if planned.get("status") != "PASS_B_WITNESS_REPAIR_PLAN_READ_ONLY":
        hold("FRESH_ROOT_REPAIR_PLAN_NOT_PASS")
    print("PASS:B_WITNESS_ONLY_REPAIR_FRESH_ROOT_PLAN", flush=True)
    done = root_call(root, witness, "repair", approved=True)
    if done.get("status") != "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY":
        hold("NO_POSITIVE_REPAIR_RECEIPT_DO_NOT_RETRY")
    if (done.get("installed_witness_sha256") != WITNESS_SHA
        or done.get("original_install_report_sha256")
            != "41be908123b5f13e349b3ad093ebea7a7908149c9c646041969556d3e0cc1cd2"
        or done.get("new_service_started") is not False
        or done.get("public_cutover_authorized") is not False):
        hold("REPAIR_ROOT_RECEIPT_MISMATCH_DO_NOT_RETRY")
    print(json.dumps(done, sort_keys=True), flush=True)
    print("PASS:R25_B_WITNESS_ONLY_REPAIR_INSTALLED_NOT_PRESTART_NOT_3031_RUNNING")
    return 0


if __name__ == "__main__":
    sys.exit(main())
