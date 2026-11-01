#!/usr/bin/env python3
"""Finite R25 evidence capture / separately authorized one-use approval write.

Never changes Nginx, services, PostgreSQL, nftables, C/E artifacts or keys.
Native B POSTSTART and actual independent review records precede admission.
Authenticated owner SSH transports reviewed bytes; no signature is invented.
The existing B POSTSTART includes its reviewed 15-byte private-cache DAC probe
(exclusive temporary write/fsync/unlink); all other capture operations inspect.
"""
from __future__ import annotations
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys
import types

TARGET = "0cee3c836c4b0760478280c145e02e81e470ce0e"
HOST = "ubuntu-4gb-hel1-11"
BASE = Path("/etc/aoe2war/r24-parallel-web")
JOURNAL = Path("/var/lib/aoe2war-r25-f-evidence-admission-v1")
C_START = Path("/var/lib/aoe2war-r25-c-additive/start-3031-v1")
B_WITNESS = Path("/etc/aoe2war/r24-parallel-web/approved-runtime-prestart.py")
B_SHA = "a72f96668bc6beeaacc90d089cbd7b3a3815caca7b69d4ef7e7be68da6c6ef90"
GUARD_SHA = "dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
SOURCE_SCOPE = "F_SOURCE_AND_EVIDENCE_ADMISSION"
RUNTIME_SCOPE = "C_RUNTIME_SECURITY_ACCEPT"
FILE_NAMES = {"engine": "scripts/aoe2_r24_f_parallel_nginx_cutover.py",
    "owner": "scripts/aoe2_r24_f_parallel_nginx_mac.py",
    "g": "scripts/aoe2_r25_f_g_parallel_observer.py",
    "admission_root": "scripts/r25_f_evidence_admission_root.py",
    "admission_mac": "scripts/r25_f_evidence_admission_mac.py",
    "c_helper": "scripts/r25_c_start_root.py"}
H40 = re.compile(r"[a-f0-9]{40}\Z")
H64 = re.compile(r"[a-f0-9]{64}\Z")

class Hold(RuntimeError):
    pass

def need(ok, why):
    if not ok:
        raise Hold(why)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def parse(raw):
    def unique(pairs):
        out = {}
        for k, v in pairs:
            need(k not in out, "DUPLICATE_JSON")
            out[k] = v
        return out
    return json.loads(raw, object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))

def reviewed(envelope, scope):
    need(envelope.get("author") == "Emaren"
         and envelope.get("issue_url") == "https://api.github.com/repos/Emaren/app-prodn/issues/1083"
         and re.fullmatch(r"https://github.com/Emaren/app-prodn/pull/1083#issuecomment-[0-9]+", envelope.get("url", "")),
         "AUTHENTICATED_FIXED_REPOSITORY_REVIEW_REQUIRED")
    body = envelope.get("body", "")
    need(isinstance(body, str) and len(body.encode()) <= 65536
         and sha(body.encode()) == envelope.get("body_sha256"), "REVIEW_BODY_PIN")
    match = re.fullmatch(r"R25_F_INDEPENDENT_REVIEW\n```json\n(.+)\n```\n?", body, re.S)
    need(match is not None, "REAL_REVIEW_MANIFEST_REQUIRED")
    review = parse(match[1])
    need(review.get("schema") == "aoe2war.r25.f.evidence-review.v1"
         and review.get("decision") == "ACCEPT" and review.get("scope") == scope
         and review.get("independent_review") is True
         and review.get("publisher_is_reviewer_identity") is False
         and review.get("reviewer") in ("/root/security_review", "/root/start_fix_review"),
         "ACTUAL_INDEPENDENT_REVIEW_REQUIRED")
    return review

def sources(payload):
    review = reviewed(payload["source_review"], SOURCE_SCOPE)
    source_sha = review.get("source_sha", "")
    need(H40.fullmatch(source_sha) is not None, "SOURCE_SHA_REQUIRED")
    ci = review.get("exact_head_ci", {})
    need(type(ci.get("run_id")) is int and ci["run_id"] > 0
         and ci.get("head_sha") == source_sha and ci.get("conclusion") == "success"
         and ci.get("all_three_jobs_success") is True, "EXACT_HEAD_FULL_CI_REQUIRED")
    pins = review.get("files", {})
    need(set(pins) == set(FILE_NAMES) and set(payload["files_b64"]) == set(FILE_NAMES),
         "COMPLETE_EXECUTABLE_SOURCE_PINS_REQUIRED")
    files = {}
    for name, path in FILE_NAMES.items():
        pin = pins[name]
        data = base64.b64decode(payload["files_b64"][name], validate=True)
        need(pin.get("path") == path and 0 < len(data) <= 65536
             and len(data) == pin.get("size") and sha(data) == pin.get("sha256")
             and hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == pin.get("blob")
             and H40.fullmatch(pin.get("ref", "")) is not None,
             "IMMUTABLE_SOURCE_SIZE_SHA_BLOB_DRIFT")
        if name != "c_helper":
            need(pin["ref"] == source_sha, "F_SOURCE_COMMIT_DRIFT")
        files[name] = data
    lanes = review.get("lane_sources", {})
    need(set(lanes) == set("BCDEFG") and all(H40.fullmatch(v or "") for v in lanes.values())
         and lanes["B"] == "10cb604e4743e9c3ee6b5e6e4bbe8a495614c934"
         and lanes["D"] == source_sha
         and lanes["E"] == "d40ec0a55fda7f1484c4f9fa37f7168d56bb19e2"
         and lanes["C"] == pins["c_helper"]["ref"] and lanes["F"] == lanes["G"] == source_sha,
         "REAL_REVIEWED_LANE_SOURCES_REQUIRED")
    need(review.get("role_decisions") == dict.fromkeys("BCDEFG", "ACCEPT"),
         "ACTUAL_WEBSITE_REVIEW_ROLE_DECISIONS_REQUIRED")
    def module(name):
        m = types.ModuleType("reviewed_f_" + name)
        exec(compile(files[name], "reviewed-" + name, "exec"), m.__dict__)
        return m
    helper, engine = module("c_helper"), module("engine")
    # Capture uses the same reviewed reader before its exclusive installation.
    # Existing apply/rollback never use this in-memory capture override.
    engine.native_state_reader = lambda: helper
    return review, files, helper, engine

def native_poststart(helper):
    source = helper.root_file(B_WITNESS, 32768, 0o644)
    need(len(source) == 22310 and sha(source) == B_SHA, "INSTALLED_B_WITNESS_PIN_REQUIRED")
    raw = helper.run(["/usr/bin/python3", "-I", "-B", str(B_WITNESS), "--phase", "poststart",
                      "--expected-guard-sha256", GUARD_SHA], timeout=40, maximum=32768)
    b = parse(raw)
    h = dict(b)
    report_sha = h.pop("report_sha256", None)
    need(report_sha == sha(canonical(h))
         and b.get("schema") == "aoe2war.r25.b.hel1.positive-isolation-witness.v1"
         and b.get("status") == "POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and b.get("target_sha") == b.get("source_sha") == TARGET
         and b.get("old_web_pid") == 2625090 and b.get("candidate_uid") == 993
         and b.get("build_id") == helper.BUILD_ID and b.get("guard_sha256") == GUARD_SHA
         and b.get("guard_local_http") is True and b.get("guard_wargraph_disabled_before_node") is True
         and b.get("no_financial_operation_executed") is True and b.get("public_cutover_authorized") is False,
         "GENUINE_NATIVE_B_POSTSTART_REQUIRED")
    db = b.get("candidate_readonly_pg", {})
    need(db.get("role") == "aoe2war_r25_web_ro" and db.get("server_transaction_ro") is True,
         "NATIVE_SELECT_ONLY_ROLE_REQUIRED")
    stable = {k: v for k, v in b.items() if k not in ("at", "report_sha256")}
    return b, sha(canonical(stable))

def capture(payload):
    need(sys.platform == "linux" and os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "EXACT_HEL1_ROOT_REQUIRED")
    review, files, helper, engine = sources(payload)
    helper.c_build()
    helper.e_rollback(payload["e_certificate"])
    running_raw = helper.root_file(C_START / "running.json", 32768, 0o600)
    started = parse(helper.root_file(C_START / "started.json", 131072, 0o600))
    running = parse(running_raw)
    need(running.get("status") == "STARTED_3031_PENDING_B_POSTSTART_C_RUNTIME_ACCEPT"
         and running.get("candidate_sha") == TARGET and running.get("candidate_uid") == 993
         and running.get("build_id") == helper.BUILD_ID and running.get("public_cutover_authorized") is False
         and started.get("plan", {}).get("source_sha") == review["lane_sources"]["C"],
         "REAL_C_STARTED_JOURNAL_REQUIRED")
    b, stable = native_poststart(helper)
    need(b.get("candidate_pid") == running.get("candidate_pid")
         and b.get("candidate_start_ticks") == running.get("candidate_start_ticks"),
         "B_POSTSTART_C_STARTED_PROCESS_DRIFT")
    protected = helper.protected_snapshot()
    units = sorted(set(protected["unit_names"]) - {helper.OLD_UNIT, helper.NEW_UNIT})
    snapshot = engine.snapshots(units)
    engine.enforce_candidate_runtime(snapshot["candidate_web"])
    config = engine.root_file(engine.VHOST, 131072)
    engine.nginx_loaded_vhost(config, engine.VHOST, old_count=6)
    proposed = engine.safe_replace_site(config, engine.NEW_UPSTREAM)
    # Root source, manifests and accepted E receipt are consumed, never recopied
    # or fully rehashed. No G BEFORE witness is taken by this capture.
    c_hashes = {key: sha(helper.root_file(helper.C_AUDIT / name, limit, 0o600)) for name, key, limit in (
        ("SOURCE_STAGED.json", "C_source_staged_sha256", 65536),
        ("BUILD_STAGED.json", "C_build_staged_sha256", 65536),
        ("SOURCE_FILES.json", "C_source_files_sha256", 33554432),
        ("BUILD_FILES.json", "C_build_files_sha256", 128 * 1024 * 1024))}
    old_sha = engine.cmd(["/usr/sbin/runuser", "-u", "tony", "--", "/usr/bin/git", "-C", str(engine.OLD_APP), "rev-parse", "HEAD"], 15).decode().strip()
    need(H40.fullmatch(old_sha) is not None, "OLD_SOURCE_SHA_UNKNOWN")
    need(engine.http_version(3031) == helper.VERSION and engine.public_version() == engine.http_version(3030),
         "OLD_PUBLIC_AND_NEW_INTERNAL_IDENTITY_REQUIRED")
    report = {"schema": "aoe2war.r25.f.native-admission-capture.v1", "candidate_sha": TARGET,
        "source_sha": review["source_sha"], "source_review_body_sha256": payload["source_review"]["body_sha256"],
        "candidate_pid": b["candidate_pid"], "candidate_start_ticks": b["candidate_start_ticks"],
        "B_native": b, "B_stable_sha256": stable, "C_running_file_sha256": sha(running_raw),
        "C_receipt_hashes": c_hashes, "E_certificate_sha256": helper.E_CERT_SHA,
        "E_copy_sha256": helper.E_COPY_SHA, "protected": protected, "snapshot": snapshot,
        "finance_units": units, "old_source_sha": old_sha, "old_build_id": helper.OLD_BUILD_ID,
        "candidate_build_id": helper.BUILD_ID, "candidate_build_version": helper.VERSION,
        "nginx_config": str(engine.VHOST), "nginx_before_sha256": sha(config),
        "nginx_after_sha256": sha(proposed), "public_cutover_authorized": False,
        "financial_authorized": False, "G_before_performed": False}
    report["capture_sha256"] = sha(canonical(report))
    return report, files, helper, engine, review

def stable_capture(report):
    result = dict(report)
    result.pop("capture_sha256", None)
    result.pop("B_native", None)  # Real fresh B timestamp changes; all B proof fields stay bound by stable digest.
    return result

def seal(helper, path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    helper.fsync_directory(path.parent)

def admit(payload):
    need(not JOURNAL.exists() and not JOURNAL.is_symlink(), "EVIDENCE_ADMISSION_ALREADY_ATTEMPTED_NO_REPLAY")
    fresh, files, helper, engine, source_review = capture(payload)
    original = payload["capture"]
    base = dict(original)
    original_sha = base.pop("capture_sha256", None)
    need(original_sha == sha(canonical(base)) and stable_capture(original) == stable_capture(fresh),
         "REVIEWED_NATIVE_CAPTURE_DRIFT")
    runtime = reviewed(payload["runtime_review"], RUNTIME_SCOPE)
    need(runtime.get("capture_sha256") == original_sha
         and runtime.get("B_stable_sha256") == fresh["B_stable_sha256"]
         and runtime.get("candidate_pid") == fresh["candidate_pid"]
         and runtime.get("candidate_start_ticks") == fresh["candidate_start_ticks"]
         and runtime.get("source_sha") == fresh["source_sha"], "ACTUAL_C_RUNTIME_ACCEPT_NOT_BOUND")
    nonce = payload.get("nonce", "")
    need(re.fullmatch(r"[a-f0-9]{32}", nonce) is not None
         and payload.get("owner_consent") == "ADMIT-R25-EVIDENCE-ONLY " + nonce + " " + original_sha,
         "DISTINCT_OWNER_EVIDENCE_WRITE_CONSENT_REQUIRED")
    helper.directory(BASE)
    need(stat.S_IMODE(BASE.stat().st_mode) == 0o700, "APPROVAL_ROOT_NOT_PRIVATE")
    targets = ("b-poststart-positive.json", "e-recovery-ready.json", "runtime-state-reader.py", "f-admission.json", "approved.json")
    need(not JOURNAL.exists() and not JOURNAL.is_symlink()
         and all(not (BASE / name).exists() and not (BASE / name).is_symlink() for name in targets),
         "EVIDENCE_ADMISSION_ALREADY_ATTEMPTED_NO_REPLAY")
    b_raw = canonical(fresh["B_native"]) + b"\n"
    e_raw = canonical(payload["e_certificate"]) + b"\n"
    s = fresh["snapshot"]
    approval = {"schema": engine.SCHEMA, "nonce": nonce, "candidate_sha": TARGET,
        "previous_sha": fresh["old_source_sha"], "previous_build_id": fresh["old_build_id"],
        "candidate_build_id": fresh["candidate_build_id"], "candidate_build_version": fresh["candidate_build_version"],
        "nginx_config": fresh["nginx_config"], "nginx_before_sha256": fresh["nginx_before_sha256"],
        "finance_units": fresh["finance_units"], "finance_snapshot_sha256": sha(canonical(s["finance"])),
        "native_protected_sha256": sha(canonical(s["native_protected"])),
        "wolo_snapshot_sha256": sha(canonical(engine.listener_lines(s["wolo"]))),
        "old_web_snapshot_sha256": sha(s["original_web"].encode()),
        "candidate_web_snapshot_sha256": sha(s["candidate_web"].encode()),
        "C_stage_artifact_sha256": fresh["C_receipt_hashes"]["C_build_staged_sha256"],
        "E_durable_rollback_sha256": sha(e_raw), "E_durable_receipt_path": str(engine.E_ROOT_RECOVERY),
        "B_poststart_sha256": sha(b_raw), "E_r25_recovery_sha256": sha(e_raw),
        "lane_reviews": source_review["lane_sources"], **fresh["C_receipt_hashes"]}
    approved_raw = canonical(approval) + b"\n"
    record = {"schema": "aoe2war.r25.f.admitted-evidence.v1",
        "status": "APPROVAL_WRITTEN_NOT_PUBLIC_DEPLOYMENT_AUTHORITY", "nonce": nonce,
        "source_review": payload["source_review"], "runtime_review": payload["runtime_review"],
        "reviewed_capture_sha256": original_sha, "B_stable_sha256": fresh["B_stable_sha256"],
        "candidate_pid": fresh["candidate_pid"], "candidate_start_ticks": fresh["candidate_start_ticks"],
        "reader_sha256": sha(files["c_helper"]), "engine_sha256": sha(files["engine"]),
        "approved_json_sha256": sha(approved_raw), "lane_reviews": source_review["lane_sources"],
        "public_cutover_authorized": False, "financial_authorized": False}
    record["report_sha256"] = sha(canonical(record))
    # First mutation is an exclusive durable no-replay journal. No existing
    # evidence is overwritten. Approval is published LAST after all evidence.
    os.mkdir(JOURNAL, 0o700)
    helper.fsync_directory(JOURNAL.parent)
    seal(helper, JOURNAL / "started.json", canonical({"status": "ADMISSION_ENTERED_DO_NOT_RETRY",
        "capture_sha256": original_sha, "source_review_sha256": payload["source_review"]["body_sha256"],
        "runtime_review_sha256": payload["runtime_review"]["body_sha256"]}) + b"\n")
    try:
        for name, data in ((targets[0], b_raw), (targets[1], e_raw), (targets[2], files["c_helper"]),
                           (targets[3], canonical(record) + b"\n")):
            seal(helper, BASE / name, data)
        engine.verified_b_poststart(approval, engine.snapshots(approval["finance_units"]))
        engine.verified_durable_e_rollback(approval)
        if not engine.AUDIT_BASE.exists():
            os.mkdir(engine.AUDIT_BASE, 0o700)
            helper.fsync_directory(engine.AUDIT_BASE.parent)
        helper.directory(engine.AUDIT_BASE)
        seal(helper, JOURNAL / "complete.json", canonical({"status": record["status"],
            "approved_json_sha256": sha(approved_raw), "public_cutover_authorized": False}) + b"\n")
        seal(helper, BASE / "approved.json", approved_raw)
        # Validate exact published bytes while the unchanged release lock is
        # still held; any failure seals HOLD and the engine refuses cutover.
        engine.approval(helper.root_file(BASE / "approved.json", 16384, 0o600))
    except BaseException as exc:
        seal(helper, JOURNAL / "hold.json", canonical({"status": "HOLD_PRESERVE_PARTIAL_NO_REPLAY",
            "reason_type": type(exc).__name__, "public_cutover_authorized": False}) + b"\n")
        raise
    return {"status": record["status"], "candidate_pid": fresh["candidate_pid"],
            "candidate_uid": 993, "build_id": fresh["candidate_build_id"],
            "public_cutover_authorized": False, "financial_authorized": False}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("capture", "admit"), required=True)
    args = ap.parse_args()
    raw = sys.stdin.buffer.read(1048577)
    need(0 < len(raw) <= 1048576, "BOUNDED_INPUT_REQUIRED")
    payload = parse(raw)
    # Source authentication precedes trusted helper execution and lock access.
    _, _, helper, _ = sources(payload)
    ls = helper.LOCK.lstat()
    need((ls.st_dev, ls.st_ino, ls.st_uid, stat.S_IMODE(ls.st_mode)) == helper.LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_CHANGED")
    fd = os.open(helper.LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        need(os.fstat(fd).st_ino == ls.st_ino, "LOCK_OPEN_RACE")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.phase == "capture":
            result = capture(payload)[0]
        else:
            result = admit(payload)
        print(json.dumps(result, sort_keys=True))
    finally:
        os.close(fd)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)[:160],
                          "public_cutover_authorized": False, "no_blind_retry": True}, sort_keys=True))
        sys.exit(2)
