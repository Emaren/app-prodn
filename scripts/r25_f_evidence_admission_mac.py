#!/usr/bin/env python3
"""Original Mac: actual native capture, independent review, separate evidence write.

Owner authorization text is entered only in native GUI; never print it or nonce.
This prepares evidence for F's separate cutover authorization. No cutover here.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import stat
import subprocess
import sys
import urllib.request

SOURCE_SCOPE = "F_SOURCE_AND_EVIDENCE_ADMISSION"
RUNTIME_SCOPE = "C_RUNTIME_SECURITY_ACCEPT"
H40 = re.compile(r"[a-f0-9]{40}\Z")
H64 = re.compile(r"[a-f0-9]{64}\Z")
NAMES = {"engine": "scripts/aoe2_r24_f_parallel_nginx_cutover.py",
    "owner": "scripts/aoe2_r24_f_parallel_nginx_mac.py", "g": "scripts/aoe2_r25_f_g_parallel_observer.py",
    "admission_root": "scripts/r25_f_evidence_admission_root.py",
    "admission_mac": "scripts/r25_f_evidence_admission_mac.py", "c_helper": "scripts/r25_c_start_recovery_v8_root.py"}

def need(ok, why):
    if not ok:
        raise RuntimeError("R25_F_ADMISSION_OWNER:" + why)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def github(endpoint):
    gh = next((p for p in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh") if Path(p).is_file()), None)
    need(gh is not None, "EXISTING_AUTHENTICATED_GITHUB_CLI_REQUIRED")
    p = subprocess.run([gh, "api", "repos/Emaren/app-prodn/" + endpoint],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, check=False)
    need(p.returncode == 0 and 0 < len(p.stdout) <= 262144, "AUTHENTICATED_GITHUB_READ_FAILED")
    return json.loads(p.stdout)

def review(comment_id, expected_sha, scope):
    need(str(comment_id).isdecimal() and H64.fullmatch(expected_sha) is not None, "REVIEW_PIN_FORMAT")
    obj = github("issues/comments/" + str(comment_id))
    url = "https://github.com/Emaren/app-prodn/pull/1083#issuecomment-" + str(comment_id)
    issue = "https://api.github.com/repos/Emaren/app-prodn/issues/1083"
    need(obj.get("id") == int(comment_id) and obj.get("html_url") == url
         and obj.get("issue_url") == issue and obj.get("user", {}).get("login") == "Emaren",
         "REVIEW_ID_REPOSITORY_AUTHOR_DRIFT")
    body = obj.get("body", "")
    need(isinstance(body, str) and sha(body.encode()) == expected_sha, "ACTUAL_REVIEW_BODY_PIN_DRIFT")
    marker="\n" + chr(96)*3 + "json\n"
    suffix="\n" + chr(96)*3
    owner_mode=body.startswith("R25_F_OWNER_NONFINANCIAL_ACCEPT"+marker)
    need(body.startswith(("R25_F_OWNER_NONFINANCIAL_ACCEPT"+marker,
                          "R25_F_INDEPENDENT_REVIEW"+marker))
         and body.rstrip().endswith(suffix), "REAL_REVIEW_MANIFEST_REQUIRED")
    review_text=body.split(marker,1)[1].rsplit(suffix,1)[0]
    manifest=json.loads(review_text)
    if owner_mode:
        need(manifest.get("schema")=="aoe2war.r25.f.owner-nonfinancial-review.v1"
             and manifest.get("decision")=="ACCEPT" and manifest.get("scope")==scope
             and manifest.get("owner_login")=="Emaren"
             and manifest.get("release_authority")=="OWNER_ONLY_NONFINANCIAL"
             and manifest.get("owner_accepts_no_independent_review") is True
             and manifest.get("independent_review") is False
             and manifest.get("financial_authorized") is False
             and manifest.get("public_cutover_authorized") is False,
             "AUTHENTIC_OWNER_ONLY_NONFINANCIAL_ACCEPTANCE_REQUIRED")
    else:
        need(manifest.get("schema")=="aoe2war.r25.f.evidence-review.v1"
             and manifest.get("decision")=="ACCEPT" and manifest.get("scope")==scope
             and manifest.get("independent_review") is True
             and manifest.get("publisher_is_reviewer_identity") is False
             and manifest.get("reviewer") in ("/root/security_review","/root/start_fix_review"),
             "GENUINE_INDEPENDENT_REVIEW_REQUIRED")
    return {"body": body, "body_sha256": expected_sha, "author": "Emaren", "url": url, "issue_url": issue}, manifest

def source_files(manifest):
    commit = manifest.get("source_sha", "")
    need(H40.fullmatch(commit) is not None and set(manifest.get("files", {})) == set(NAMES),
         "COMPLETE_IMMUTABLE_SOURCE_MANIFEST_REQUIRED")
    need(manifest.get("role_decisions") == dict.fromkeys("BCDEFG", "ACCEPT"),
         "ACTUAL_WEBSITE_REVIEW_ROLE_DECISIONS_REQUIRED")
    ci = manifest.get("exact_head_ci", {})
    need(type(ci.get("run_id")) is int and ci["run_id"] > 0 and ci.get("head_sha") == commit
         and ci.get("conclusion") == "success" and ci.get("all_three_jobs_success") is True,
         "REVIEWED_EXACT_HEAD_CI_REQUIRED")
    actual = github("actions/runs/" + str(ci["run_id"]))
    jobs = github("actions/runs/" + str(ci["run_id"]) + "/jobs?filter=latest&per_page=100")
    need(actual.get("head_sha") == commit and actual.get("status") == "completed"
         and actual.get("conclusion") == "success" and actual.get("name") == "AoE2WAR CI"
         and jobs.get("total_count") == 3 and len(jobs.get("jobs", [])) == 3
         and {j.get("name") for j in jobs["jobs"]} == {"Release and documentation control plane",
             "Type, contract, and production build", "Isolated Steam-rating PostgreSQL chronology"}
         and all(j.get("status") == "completed" and j.get("conclusion") == "success" for j in jobs["jobs"]),
         "ACTUAL_EXACT_HEAD_FULL_CI_NOT_PASS")
    files = {}
    for name, path in NAMES.items():
        pin = manifest["files"][name]
        need(pin.get("path") == path and H40.fullmatch(pin.get("ref", "")) is not None
             and type(pin.get("size")) is int and 0 < pin["size"] <= 65536
             and H64.fullmatch(pin.get("sha256", "")) is not None
             and H40.fullmatch(pin.get("blob", "")) is not None
             and (name == "c_helper" or pin["ref"] == commit), "SOURCE_PIN_FORMAT")
        url = "https://raw.githubusercontent.com/Emaren/app-prodn/" + pin["ref"] + "/" + path
        with urllib.request.urlopen(url, timeout=25) as response:
            data = response.read(pin["size"] + 1)
        need(len(data) == pin["size"] and sha(data) == pin["sha256"]
             and hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == pin["blob"],
             "IMMUTABLE_SOURCE_SIZE_SHA_BLOB_DRIFT")
        files[name] = data
    need(files["admission_mac"] == Path(__file__).read_bytes(), "EXECUTING_MAC_BYTES_NOT_REVIEWED")
    return files

def private_json(path):
    p = Path(path).expanduser()
    s = p.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and not s.st_mode & 0o077
         and s.st_nlink == 1 and 0 < s.st_size <= 524288, "PRIVATE_OWNER_JSON_REQUIRED")
    return json.loads(p.read_bytes())

def root_call(source, payload, phase):
    loader = "import base64;exec(compile(base64.b64decode(" + repr(base64.b64encode(source).decode()) + "),'reviewed-r25-f-admission','exec'))"
    remote = " ".join(shlex.quote(s) for s in ("/usr/bin/python3", "-I", "-B", "-c", loader, "--phase", phase))
    p = subprocess.run(["/usr/bin/ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
        "-o", "NumberOfPasswordPrompts=0", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "root@hel1", remote],
        input=canonical(payload), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=300, check=False)
    need(0 < len(p.stdout) <= 524288, "ROOT_REPLY_SIZE")
    result = json.loads(p.stdout)
    need(p.returncode == 0 and result.get("status") != "HOLD", "ROOT_HOLD_NO_BLIND_RETRY:" + str(result.get("reason", "FAILED"))[:120])
    return result

def owner_gui(phrase):
    text = "Type the separate one-use EVIDENCE ADMISSION authorization. This writes only reviewed root evidence/approval files. Nginx cutover requires later authorization.\n\n" + phrase
    script = ("set a to display dialog " + json.dumps(text) + ' default answer "" buttons {"Cancel", "Authorize evidence"} default button "Cancel"\nreturn text returned of a')
    p = subprocess.run(["/usr/bin/osascript", "-e", script], capture_output=True, text=True, timeout=180, check=False)
    need(p.returncode == 0 and p.stdout.rstrip("\r\n") == phrase, "FRESH_NATIVE_GUI_EVIDENCE_AUTHORIZATION_REQUIRED")

def save_private(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(canonical(obj) + b"\n")
        f.flush()
        os.fsync(f.fileno())

def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--capture-only", action="store_true")
    mode.add_argument("--admit", action="store_true")
    ap.add_argument("--source-review-comment", required=True)
    ap.add_argument("--source-review-sha256", required=True)
    ap.add_argument("--runtime-review-comment")
    ap.add_argument("--runtime-review-sha256")
    ap.add_argument("--capture-file", required=True)
    ap.add_argument("--e-certificate", default="~/Downloads/r25-e-recovery-9a4b8b441d87556bd0.json")
    args = ap.parse_args()
    need(sys.platform == "darwin" and os.geteuid() != 0, "ORIGINAL_NONROOT_MAC_REQUIRED")
    fs = os.statvfs(Path.home())
    need(fs.f_bavail * fs.f_frsize >= 25 * 1024 ** 3, "M1_25_GIB_FLOOR")
    source_review, source_manifest = review(args.source_review_comment, args.source_review_sha256, SOURCE_SCOPE)
    files = source_files(source_manifest)
    payload = {"source_review": source_review, "e_certificate": private_json(args.e_certificate),
               "files_b64": {k: base64.b64encode(v).decode() for k, v in files.items()}}
    capture_path = Path(args.capture_file).expanduser()
    if args.capture_only:
        result = root_call(files["admission_root"], payload, "capture")
        need(result.get("schema") == "aoe2war.r25.f.native-admission-capture.v1" and result.get("public_cutover_authorized") is False,
             "NATIVE_CAPTURE_SCOPE")
        save_private(capture_path, result)
        print(json.dumps({"status": "NATIVE_CAPTURE_SAVED_NOT_ADMITTED", "path": str(capture_path),
                          "candidate_pid": result["candidate_pid"], "public_cutover_authorized": False}))
        return
    need(args.runtime_review_comment and args.runtime_review_sha256, "ACTUAL_C_RUNTIME_REVIEW_REQUIRED")
    runtime_review, runtime_manifest = review(args.runtime_review_comment, args.runtime_review_sha256, RUNTIME_SCOPE)
    captured = private_json(capture_path)
    need(runtime_manifest.get("capture_sha256") == captured.get("capture_sha256")
         and runtime_manifest.get("source_sha") == source_manifest.get("source_sha"), "RUNTIME_REVIEW_CAPTURE_SOURCE_DRIFT")
    nonce = secrets.token_hex(16)
    phrase = "ADMIT-R25-EVIDENCE-ONLY " + nonce + " " + captured["capture_sha256"]
    owner_gui(phrase)
    payload.update({"runtime_review": runtime_review, "capture": captured, "nonce": nonce, "owner_consent": phrase})
    result = root_call(files["admission_root"], payload, "admit")
    need(result.get("status") == "APPROVAL_WRITTEN_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and result.get("public_cutover_authorized") is False, "ROOT_ADMISSION_NOT_PROVEN")
    # No nonce, typed phrase, complete approval or raw capture in chat/tool output.
    print(json.dumps(result, sort_keys=True))

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)[:160],
                          "public_cutover_authorized": False, "no_blind_retry": True}, sort_keys=True))
        sys.exit(2)
