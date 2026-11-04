#!/usr/bin/env python3
"""R25 F: original owner Mac → source-pinned root-SSH → G before/after → rollback.

No original web restart, financial write, custody key or Wolo service mutation.
Missing B/C/D/E/F/G verified scope = HOLD before owner consent or cutover.
"""
from __future__ import annotations
import argparse
import base64
from datetime import datetime, timezone
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
H40 = re.compile(r"[a-f0-9]{40}\Z")
OWNER_ID = 15059910
OWNER_GRANT_PREFIX = "R25_F_OWNER_TRANSACTION_GRANT"
OWNER_GRANT_SCHEMA = "aoe2war.r25.f.owner-transaction-grant.v1"
OWNER_GRANT_SCOPE = "A05_NGINX_ONLY_PUBLIC_CUTOVER"
BEFORE_WITNESS_SHA256 = "6de56e39c813069ebcebf0674ae6142f78bd7b839e6ad2fea5c8c4c99e8d12b7"
CONSUMED_NONCE = "3cadeb4aac1f217783effc0c25f49fac"
SOURCE_PATHS = {
    "engine": "scripts/aoe2_r24_f_parallel_nginx_cutover.py",
    "owner": "scripts/aoe2_r24_f_parallel_nginx_mac.py",
    "g": "scripts/aoe2_r25_f_g_parallel_observer.py",
}

class Hold(RuntimeError):
    pass

def need(ok, why):
    if not ok:
        raise Hold(why)

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def strict_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            need(key not in result, "DUPLICATE_OWNER_AUTHORIZATION_FIELD")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_OWNER_AUTHORIZATION")))

def private_bytes(path, maximum=524288):
    p = pathlib.Path(path).expanduser()
    before = p.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
         and not before.st_mode & 0o077 and before.st_nlink == 1
         and 0 < before.st_size <= maximum, "PRIVATE_OWNER_EVIDENCE_REQUIRED")
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        raw = os.read(fd, maximum + 1)
        after = os.fstat(fd)
        identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns)
        need(identity(before) == identity(opened) == identity(after)
             and len(raw) == before.st_size, "OWNER_EVIDENCE_CHANGED_DURING_READ")
        return p, raw
    finally:
        os.close(fd)

def utc_timestamp(value):
    need(type(value) is str and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z", value),
        "OWNER_AUTHORIZATION_UTC_TIMESTAMP_REQUIRED")
    return datetime.fromisoformat(value[:-1] + "+00:00")

def github_read(endpoint):
    gh = next((p for p in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh")
               if pathlib.Path(p).is_file()), None)
    need(gh is not None, "EXISTING_AUTHENTICATED_GITHUB_CLI_REQUIRED")
    result = subprocess.run([gh, "api", "repos/Emaren/app-prodn/" + endpoint],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, check=False)
    need(result.returncode == 0 and 0 < len(result.stdout) <= 262144,
         "LATEST_AUTHENTICATED_OWNER_RECORD_UNAVAILABLE")
    return strict_json(result.stdout)

def qualified_ci(manifest):
    source = manifest.get("source_sha", "")
    ci = manifest.get("exact_head_ci", {})
    need(type(source) is str and H40.fullmatch(source) and type(ci) is dict
         and type(ci.get("run_id")) is int and ci["run_id"] > 0
         and ci.get("head_sha") == source and ci.get("conclusion") == "success"
         and ci.get("all_three_jobs_success") is True, "OWNER_GRANT_EXACT_HEAD_CI_REQUIRED")
    actual = github_read("actions/runs/" + str(ci["run_id"]))
    jobs = github_read("actions/runs/" + str(ci["run_id"]) + "/jobs?filter=latest&per_page=100")
    expected = {"Release and documentation control plane", "Type, contract, and production build",
                "Isolated Steam-rating PostgreSQL chronology"}
    need(actual.get("head_sha") == source and actual.get("name") == "AoE2WAR CI"
         and actual.get("status") == "completed" and actual.get("conclusion") == "success"
         and jobs.get("total_count") == 3 and len(jobs.get("jobs", [])) == 3
         and {j.get("name") for j in jobs["jobs"]} == expected
         and all(j.get("status") == "completed" and j.get("conclusion") == "success"
                 for j in jobs["jobs"]), "OWNER_GRANT_ACTUAL_THREE_JOB_CI_NOT_PASS")

def qualified_sources(manifest, files):
    source = manifest["source_sha"]
    for name, path in SOURCE_PATHS.items():
        expected = files[name]
        record = github_read("contents/" + path + "?ref=" + source)
        need(type(record) is dict and record.get("type") == "file"
             and record.get("encoding") == "base64" and record.get("path") == path
             and record.get("size") == len(expected) and type(record.get("content")) is str,
             "OWNER_GRANT_SOURCE_COMMIT_FILE_REQUIRED:" + name)
        try:
            raw = base64.b64decode("".join(record["content"].split()), validate=True)
        except ValueError as error:
            raise Hold("OWNER_GRANT_SOURCE_COMMIT_ENCODING_INVALID:" + name) from error
        need(raw == expected and manifest.get(name + "_source_sha256") ==
             hashlib.sha256(expected).hexdigest(), "OWNER_GRANT_SOURCE_COMMIT_BYTES_MISMATCH:" + name)

def cutover_plan(path, root_sha, g_sha, owner_sha):
    _, raw = private_bytes(path)
    envelope = strict_json(raw)
    need(type(envelope) is dict and envelope.get("schema") == "aoe2war.r25.f.cutover-plan-envelope.v1"
         and envelope.get("status") == "PASS_READ_ONLY_CUTOVER_PLAN_NOT_AUTHORITY"
         and type(envelope.get("plan")) is dict, "AUTHENTIC_NATIVE_CUTOVER_PLAN_REQUIRED")
    plan = envelope["plan"]
    need(envelope.get("plan_sha256") == hashlib.sha256(canonical(plan)).hexdigest(),
         "NATIVE_CUTOVER_PLAN_DIGEST_MISMATCH")
    need(plan.get("schema") == "aoe2war.r25.f.cutover-plan.v1"
         and type(plan.get("source_sha")) is str and H40.fullmatch(plan["source_sha"])
         and plan.get("candidate_sha") == TARGET
         and plan.get("candidate_build_id") == "-dJl5VyecHu5BKNvfErJe"
         and plan.get("candidate_build_version") == "20261031171526-148d3df911"
         and plan.get("engine_source_sha256") == root_sha and plan.get("g_source_sha256") == g_sha
         and plan.get("owner_source_sha256") == owner_sha
         and type(plan.get("nonce")) is str and NONCE.fullmatch(plan["nonce"])
         and plan["nonce"] != CONSUMED_NONCE
         and plan.get("before_witness_sha256") == BEFORE_WITNESS_SHA256
         and plan.get("old_web_pid") == 2625090 and type(plan.get("candidate_pid")) is int
         and plan["candidate_pid"] > 1 and plan["candidate_pid"] != 2625090
         and all(type(plan.get(k)) is int and plan[k] > 0
                 for k in ("old_web_start_ticks", "candidate_start_ticks"))
         and plan.get("public_cutover_authorized") is False
         and plan.get("financial_authorized") is False, "NATIVE_CUTOVER_PLAN_SCOPE_DRIFT")
    for key in ("base_approved_sha256", "nginx_before_sha256", "nginx_after_sha256", "protected_snapshot_sha256"):
        need(type(plan.get(key)) is str and H64.fullmatch(plan[key]), "NATIVE_CUTOVER_PLAN_HASH_REQUIRED")
    if plan.get("runtime_requalification_path") is not None or plan.get("runtime_requalification_sha256") is not None:
        need(type(plan.get("runtime_requalification_path")) is str
             and re.fullmatch(r"/var/lib/aoe2war-r25-c-additive/(?:session-repair|session-guard-v3)-[0-9a-f]{32}/complete\.json",
                              plan["runtime_requalification_path"])
             and type(plan.get("runtime_requalification_sha256")) is str
             and H64.fullmatch(plan["runtime_requalification_sha256"]), "EXACT_NATIVE_RUNTIME_REQUALIFICATION_REQUIRED")
    previous = plan.get("consumed_previous_transaction", {})
    need(type(previous) is dict and previous.get("nonce") == CONSUMED_NONCE
         and previous.get("no_commit") is True and previous.get("current_exact_original_config") is True
         and all(type(previous.get(k)) is str and H64.fullmatch(previous[k])
                 for k in ("intent_sha256", "before_nginx_sha256"))
         and previous["before_nginx_sha256"] == plan["nginx_before_sha256"],
         "CONSUMED_PREVIOUS_TRANSACTION_NOT_BOUND")
    return envelope

def owner_grant(comment_id, expected_sha, envelope, root_sha, g_sha, owner_sha, now=None):
    need(type(comment_id) is str and re.fullmatch(r"[0-9]{1,20}", comment_id)
         and int(comment_id) > 0 and type(expected_sha) is str and H64.fullmatch(expected_sha),
         "OWNER_GRANT_COMMENT_PIN_REQUIRED")
    cid = str(int(comment_id))
    obj = github_read("issues/comments/" + cid)
    need(type(obj) is dict and obj.get("id") == int(cid)
         and obj.get("html_url") == "https://github.com/Emaren/app-prodn/issues/1108#issuecomment-" + cid
         and obj.get("issue_url") == "https://api.github.com/repos/Emaren/app-prodn/issues/1108"
         and obj.get("user", {}).get("login") == "Emaren"
         and obj.get("user", {}).get("id") == OWNER_ID,
         "OWNER_GRANT_REPOSITORY_COMMENT_OR_ACCOUNT_DRIFT")
    body = obj.get("body", "")
    need(type(body) is str and hashlib.sha256(body.encode()).hexdigest() == expected_sha,
         "OWNER_GRANT_LATEST_BODY_CHANGED")
    need(type(obj.get("created_at")) is str and obj.get("created_at") == obj.get("updated_at"),
         "OWNER_GRANT_MUST_BE_UNMODIFIED")
    block = re.fullmatch(OWNER_GRANT_PREFIX + r"\n```json\n(.+)\n```\n?", body, re.S)
    need(block is not None, "OWNER_GRANT_MANIFEST_REQUIRED")
    grant = strict_json(block[1])
    need(type(grant) is dict and grant.get("schema") == OWNER_GRANT_SCHEMA
         and grant.get("decision") == "AUTHORIZE" and grant.get("scope") == OWNER_GRANT_SCOPE
         and grant.get("owner_login") == "Emaren"
         and grant.get("release_authority") == "OWNER_ONLY_NONFINANCIAL"
         and grant.get("owner_delegated_decisions") is True
         and grant.get("delegated_ai_authorship_disclosed") is True
         and grant.get("independent_review") is False
         and grant.get("financial_authorized") is False and grant.get("public_cutover_authorized") is True
         and grant.get("rollback_authorized") is True
         and type(grant.get("max_uses")) is int and grant["max_uses"] == 1,
         "EXACT_OWNER_DELEGATED_NONFINANCIAL_GRANT_REQUIRED")
    instant = now or datetime.now(timezone.utc)
    issued, expires = utc_timestamp(grant.get("issued_at")), utc_timestamp(grant.get("expires_at"))
    created = utc_timestamp(obj["created_at"])
    need(0 < (expires - issued).total_seconds() <= 600 and issued <= created <= instant <= expires,
         "OWNER_GRANT_EXPIRED_FUTURE_OR_TTL_TOO_LONG")
    plan = envelope["plan"]
    need(grant.get("plan_sha256") == envelope["plan_sha256"]
         and grant.get("engine_source_sha256") == root_sha and grant.get("g_source_sha256") == g_sha
         and grant.get("owner_source_sha256") == owner_sha,
         "OWNER_GRANT_PLAN_OR_SOURCE_DRIFT")
    for key in ("source_sha", "nonce", "base_approved_sha256", "before_witness_sha256", "candidate_sha",
                "candidate_build_id", "candidate_build_version", "nginx_before_sha256", "nginx_after_sha256"):
        need(grant.get(key) == plan[key], "OWNER_GRANT_TRANSACTION_DRIFT:" + key)
    for key in ("runtime_requalification_path", "runtime_requalification_sha256"):
        need(grant.get(key) == plan.get(key), "OWNER_GRANT_RUNTIME_REQUALIFICATION_DRIFT:" + key)
    return obj, grant

def pinned_file(path, expected, maximum=65536):
    need(type(expected) is str and H64.fullmatch(expected),
         "IMMUTABLE_REVIEWED_SOURCE_SHA256_REQUIRED")
    p = pathlib.Path(path).expanduser()
    st = p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid() and
         not st.st_mode & 0o022 and 0 < st.st_size <= maximum,
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
    message="R25 Nginx-only public website transaction. Original PID2625090/3030 remains running.\n"
    message+="No Wolo, custody, original source, release.lock or old service changes.\n"
    if not rollback:
        message+="Includes automatic Nginx-only rollback if G AFTER fails.\n"
    message+="Reviewed root SHA256: "+root_hash+"\n\nType the exact owner phrase:\n"+phrase
    script=('set answerRecord to display dialog '+json.dumps(message)+
            ' default answer "" buttons {"Cancel", "Authorize"} default button "Cancel"\n'
            'return text returned of answerRecord')
    answer=subprocess.run(["/usr/bin/osascript","-e",script],capture_output=True,
                          text=True,timeout=180,check=False)
    need(answer.returncode==0 and answer.stdout.rstrip("\r\n")==phrase,
         "OWNER_TYPED_CONSENT_DENIED")

def g_witness(source_path, phase, before=None, transaction_nonce=None):
    args = [sys.executable, "-B", str(source_path),
            "--phase", phase, "--ssh-target", "root@hel1"]
    if before is not None:
        args += ["--before", str(before),
                 "--before-sha256", hashlib.sha256(before.read_bytes()).hexdigest()]
    if transaction_nonce is not None:
        need(type(transaction_nonce) is str and NONCE.fullmatch(transaction_nonce),
             "NEW_G_TRANSACTION_NONCE_REQUIRED")
        args += ["--transaction-nonce", transaction_nonce]
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
             result.get("new_candidate_source_build_identity_3031_unchanged") is True and
             result.get("accepted_dependency_manifest_sha256") ==
                  "5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d" and
             result.get("dependency_bytes_rehashed_in_this_witness") is False,
             "G_REAL_LIVE_PUBLIC_SOURCE_STATIC_FINANCE_WITNESS_NOT_ACCEPTED")
    return p.stdout

def owner_receipt(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    parent = path.parent.lstat()
    need(stat.S_ISDIR(parent.st_mode) and parent.st_uid == os.getuid()
         and not parent.st_mode & 0o077, "PRIVATE_OWNER_RECEIPT_DIRECTORY_REQUIRED")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(canonical(obj) + b"\n")
        f.flush()
        os.fsync(f.fileno())
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)

def apply_owner_grant(opts, root, g_path, g_source):
    """Use the actual expiring owner record; do not impersonate GUI consent."""
    need(not opts.rollback and opts.owner_grant_sha256 and opts.owner_grant_plan
         and opts.existing_before and opts.existing_before_sha256 == BEFORE_WITNESS_SHA256,
         "COMPLETE_EXACT_OWNER_GRANT_INPUTS_REQUIRED")
    _, owner_source = pinned_file(__file__, opts.owner_source_sha256)
    envelope = cutover_plan(opts.owner_grant_plan, opts.root_source_sha256,
                            opts.g_source_sha256, opts.owner_source_sha256)
    plan = envelope["plan"]
    before, before_raw = private_bytes(opts.existing_before)
    need(hashlib.sha256(before_raw).hexdigest() == BEFORE_WITNESS_SHA256,
         "ACCEPTED_G_BEFORE_BYTES_CHANGED")
    before_obj = strict_json(before_raw)
    need(type(before_obj) is dict and before_obj.get("schema") == "aoe2war.g.r25.parallel-host.v1"
         and before_obj.get("phase") == "before"
         and before_obj.get("candidate", {}).get("next_build_id") == plan["candidate_build_id"],
         "ACTUAL_ACCEPTED_G_BEFORE_REQUIRED")
    comment, grant = owner_grant(opts.owner_grant_comment, opts.owner_grant_sha256,
                                 envelope, opts.root_source_sha256, opts.g_source_sha256,
                                 opts.owner_source_sha256)
    qualified_ci(grant)
    qualified_sources(grant, {"engine": root, "owner": owner_source, "g": g_source})
    nonce = plan["nonce"]
    binding = (" --new-nonce " + nonce + " --source-sha " + grant["source_sha"]
               + " --engine-source-sha256 " + opts.root_source_sha256
               + " --owner-source-sha256 " + opts.owner_source_sha256
               + " --g-source-sha256 " + opts.g_source_sha256
               + " --before-witness-sha256 " + BEFORE_WITNESS_SHA256)
    if plan.get("runtime_requalification_path") is not None:
        binding += (" --runtime-requalification-receipt " + plan["runtime_requalification_path"]
                    + " --runtime-requalification-sha256 " + plan["runtime_requalification_sha256"])
    fresh = ssh_source(root, "--root-cutover-plan" + binding, timeout=450)
    need(fresh.returncode == 0 and 0 < len(fresh.stdout) <= 16384,
         "FRESH_ROOT_CUTOVER_PLAN_UNAVAILABLE")
    fresh_plan = strict_json(fresh.stdout)
    need(fresh_plan == envelope, "OWNER_APPROVED_NATIVE_PLAN_CHANGED")
    # Re-fetch the pinned owner record after the native read-only check and
    # immediately before submission. The root engine independently re-fetches
    # it again at its locked mutation seam. No cached JSON authorizes a write.
    comment, grant = owner_grant(opts.owner_grant_comment, opts.owner_grant_sha256,
                                 envelope, opts.root_source_sha256, opts.g_source_sha256,
                                 opts.owner_source_sha256)
    qualified_ci(grant)
    receipts = pathlib.Path.home() / ".config/aoe2war/r25-f-owner-receipts"
    owner_receipt(receipts / ("r25-f-" + nonce + "-owner-grant-submitted.json"), {
        "schema": "aoe2war.r25.f.owner-grant-local-submission.v1",
        "status": "SUBMITTED_NOT_PROOF_OF_ROOT_EXECUTION", "owner_record": comment,
        "plan_sha256": envelope["plan_sha256"], "before_witness_sha256": BEFORE_WITNESS_SHA256,
        "before_observer_reexecuted": False})
    operation = ("--root-apply-owner-grant" + binding + " --grant-comment " + str(comment["id"])
                 + " --grant-sha256 " + opts.owner_grant_sha256
                 + " --plan-sha256 " + envelope["plan_sha256"])
    result = ssh_source(root, operation, timeout=450)
    root_result = {
        "returncode": result.returncode, "stdout": result.stdout.decode(errors="replace"),
        "stderr": result.stderr.decode(errors="replace")}
    if result.returncode != 0 or b"PASS:R24_PARALLEL_PUBLIC_WEBSITE_CUTOVER" not in result.stdout:
        owner_receipt(receipts / ("r25-f-" + nonce + "-root-result.json"), root_result)
        raise Hold("ROOT_CUTOVER_UNCERTAIN_NO_BLIND_RETRY")
    try:
        owner_receipt(receipts / ("r25-f-" + nonce + "-root-result.json"), root_result)
        # The accepted BEFORE remains immutable. Only the separately selected
        # new transaction AFTER observer executes in this continuation.
        _, after_source = pinned_file(g_path, opts.g_source_sha256)
        need(after_source == g_source, "G_SOURCE_CHANGED_BEFORE_AFTER")
        after_bytes = g_witness(g_path, "after", before=before, transaction_nonce=nonce)
        report = strict_json(after_bytes)
        need(report["next_build_id_measured_on_HOST_not_public"] == plan["candidate_build_id"],
             "G_ACTUAL_NEXT_BUILD_ID_MISMATCH")
        owner_receipt(receipts / ("r25-f-" + nonce + "-after.json"), report)
        owner_receipt(receipts / ("r25-f-" + nonce + "-before-reference.json"), {
            "schema": "aoe2war.r25.f.accepted-before-reference.v1", "path": str(before),
            "sha256": BEFORE_WITNESS_SHA256, "observer_reexecuted": False,
            "owner_grant_comment": comment["id"]})
        print("PASS:R25_F_OWNER_GITHUB_GRANT_PUBLIC_STATIC_AND_FINANCE_VERIFIED", flush=True)
    except BaseException:
        print("HOLD:G_AFTER_FAILED; ATTEMPTING_AUTHORIZED_TRANSACTION_NGINX_ONLY_ROLLBACK",
              file=sys.stderr, flush=True)
        # Expiry/revocation blocks a new forward cutover, never the protective
        # restoration already included in the consumed transaction authority.
        rollback = ssh_source(root, "--root-rollback-transaction --nonce " + nonce, timeout=450)
        owner_receipt(receipts / ("r25-f-" + nonce + "-rollback-result.json"), {
            "returncode": rollback.returncode, "stdout": rollback.stdout.decode(errors="replace"),
            "stderr": rollback.stderr.decode(errors="replace")})
        need(rollback.returncode == 0 and b"PASS:R24_OLD_WEB_PROXY_RESTORED" in rollback.stdout,
             "AUTOMATIC_TRANSACTION_ROLLBACK_UNCERTAIN")
        print("PASS:ORIGINAL_PUBLIC_3030_NGINX_RESTORED", flush=True)
        raise

def production_g_witness(g_path,phase,nonce,before=None,before_sha=None,controller_source_sha=None):
    need(H40.fullmatch(controller_source_sha or ''),'PRODUCTION_G_QUALIFIED_CONTROLLER_SOURCE_REQUIRED')
    command=['/usr/bin/python3','-I','-B',str(g_path),'--production-phase',phase,'--nonce',nonce,'--ssh-target','root@hel1',
             '--controller-source-sha',controller_source_sha]
    if before is not None:command+=['--before',str(before),'--before-sha256',before_sha]
    result=subprocess.run(command,capture_output=True,timeout=480,check=False)
    need(result.returncode==0 and 0<len(result.stdout)<=65536,'PRODUCTION_G_'+phase.upper()+'_NATIVE_HOLD')
    reply=strict_json(result.stdout)
    need(reply.get('schema')=='aoe2war.g.app-production.v1' and reply.get('nonce')==nonce and reply.get('phase')==phase and
         reply.get('status')=='PRODUCTION_G_'+phase.upper()+'_PASS_PENDING_REAL_AUTHENTICATED_BROWSER','PRODUCTION_G_EXACT_PHASE_RECEIPT')
    return reply

def production_comment(comment_id,expected_sha,envelope):
    need(re.fullmatch(r'[0-9]{1,20}',comment_id or '') and H64.fullmatch(expected_sha or ''),'PRODUCTION_OWNER_COMMENT_PIN')
    obj=github_read('issues/comments/'+str(int(comment_id)))
    need(obj.get('id')==int(comment_id) and obj.get('html_url')=='https://github.com/Emaren/app-prodn/issues/1108#issuecomment-'+str(int(comment_id)) and
         obj.get('issue_url')=='https://api.github.com/repos/Emaren/app-prodn/issues/1108' and obj.get('user',{}).get('login')=='Emaren' and
         obj.get('user',{}).get('id')==15059910 and obj.get('created_at')==obj.get('updated_at'),'PRODUCTION_ACTUAL_UNEDITED_EMAREN_AUTHORITY')
    body=obj.get('body','');need(type(body)is str and hashlib.sha256(body.encode()).hexdigest()==expected_sha,'PRODUCTION_OWNER_COMMENT_CHANGED')
    match=re.fullmatch(r'APP_PRODUCTION_CUTOVER_GRANT\n```json\n(.+)\n```\n?',body,re.S);need(match is not None,'PRODUCTION_OWNER_GRANT_FORMAT')
    grant=strict_json(match[1].encode());plan=envelope['plan']
    need(grant.get('schema')=='aoe2war.app.production-cutover-grant.v1' and grant.get('scope')=='A05_NGINX_ONLY_PRODUCTION_3032' and
         grant.get('decision')=='AUTHORIZE' and grant.get('owner_login')=='Emaren' and grant.get('release_authority')=='OWNER_ONLY_NONFINANCIAL' and
         grant.get('owner_delegated_decisions') is True and grant.get('delegated_ai_authorship_disclosed') is True and
         grant.get('independent_review') is False and grant.get('financial_authorized') is False and grant.get('public_cutover_authorized') is True and
         grant.get('rollback_authorized') is True and type(grant.get('max_uses'))is int and grant['max_uses']==1,'PRODUCTION_OWNER_SCOPE')
    issued=utc_timestamp(grant.get('issued_at'));expires=utc_timestamp(grant.get('expires_at'));created=utc_timestamp(obj.get('created_at'))
    need(0<(expires-issued).total_seconds()<=600 and issued<=created<=datetime.now(timezone.utc)<=expires,'PRODUCTION_OWNER_GRANT_EXPIRED_OR_INVALID')
    need(grant.get('plan_sha256')==envelope['plan_sha256'],'PRODUCTION_OWNER_EXACT_PLAN')
    for key,value in plan.items():
        if key not in ('schema','public_cutover_authorized'):need(grant.get(key)==value,'PRODUCTION_OWNER_TRANSACTION_DRIFT:'+key)
    return obj,grant

def production_protective_rollback(root,nonce,receipt_path):
    # Local evidence storage is secondary to the already-authorized protective
    # restoration. Disk-full must never prevent either SSH or proof validation.
    result=ssh_source(root,'--root-production-rollback --nonce '+nonce,timeout=450)
    proven=(result.returncode==0 and b'PASS:APP_PRODUCTION_ORIGINAL_3030_PROXY_RESTORED_NO_SERVICE_RESTART' in result.stdout)
    try:
        owner_receipt(receipt_path,{'returncode':result.returncode,'stdout':result.stdout.decode(errors='replace'),'stderr':result.stderr.decode(errors='replace'),
             'original_public_restoration_proven':proven})
    except (OSError,Hold):
        print('HOLD:PRODUCTION_LOCAL_ROLLBACK_RECEIPT_UNAVAILABLE_NATIVE_RESULT_CHECKED',file=sys.stderr,flush=True)
    need(proven,'PRODUCTION_G_AFTER_FAILED_ROLLBACK_UNCERTAIN')
    return result

def production_original_nginx_unchanged(expected_sha):
    need(H64.fullmatch(expected_sha or ''),'PRODUCTION_ORIGINAL_NGINX_SHA_REQUIRED')
    check=subprocess.run(['/usr/bin/ssh','-T','-o','BatchMode=yes',
        '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
        'root@hel1','/usr/bin/sha256sum','/etc/nginx/sites-available/aoe2war.com'],
        capture_output=True,timeout=35,check=False)
    return check.returncode==0 and check.stdout.split(b' ',1)[0].decode('ascii','replace')==expected_sha


def production_owner_main(argv):
    a=argparse.ArgumentParser();a.add_argument('--production-mode',choices=('before','plan','apply','rollback'),required=True)
    a.add_argument('--nonce',required=True);a.add_argument('--source-sha');a.add_argument('--candidate-source-sha');a.add_argument('--reviewed-root-file',required=True);a.add_argument('--root-source-sha256',required=True)
    a.add_argument('--reviewed-g-file');a.add_argument('--g-source-sha256');a.add_argument('--owner-source-sha256');a.add_argument('--existing-before');a.add_argument('--existing-before-sha256')
    a.add_argument('--production-plan');a.add_argument('--owner-grant-comment');a.add_argument('--owner-grant-sha256')
    opts=a.parse_args(argv)
    need(sys.platform=='darwin' and os.geteuid()!=0,'PRODUCTION_ORIGINAL_OWNER_MAC_NONROOT_REQUIRED')
    need(NONCE.fullmatch(opts.nonce or ''),'PRODUCTION_EXACT_NONCE_REQUIRED')
    _,root=pinned_file(opts.reviewed_root_file,opts.root_source_sha256,maximum=196608)
    need(b'def production_apply(' in root and b'def production_rollback(' in root,'PRODUCTION_REVIEWED_F_MODES_REQUIRED')
    receipts=pathlib.Path.home()/'.config/aoe2war/app-production-f'
    if opts.production_mode=='rollback':
        result=ssh_source(root,'--root-production-rollback --nonce '+opts.nonce,timeout=450)
        owner_receipt(receipts/(opts.nonce+'-rollback-result.json'),{'returncode':result.returncode,'stdout':result.stdout.decode(errors='replace'),'stderr':result.stderr.decode(errors='replace')})
        need(result.returncode==0 and b'PASS:APP_PRODUCTION_ORIGINAL_3030_PROXY_RESTORED_NO_SERVICE_RESTART' in result.stdout,'PRODUCTION_NATIVE_ROLLBACK_UNCERTAIN')
        print('PASS:APP_PRODUCTION_ORIGINAL_3030_PUBLIC_RESTORED');return
    need(opts.reviewed_g_file and H64.fullmatch(opts.g_source_sha256 or ''),'PRODUCTION_REVIEWED_G_REQUIRED')
    g_path,g_source=pinned_file(opts.reviewed_g_file,opts.g_source_sha256,maximum=196608)
    need(H40.fullmatch(opts.source_sha or '') and H40.fullmatch(opts.candidate_source_sha or ''),
         'PRODUCTION_SEPARATE_CONTROLLER_AND_ARTIFACT_SOURCES_REQUIRED')
    if opts.production_mode=='before':
        path=receipts/(opts.nonce+'-g-before.json');need(not path.exists() and not path.is_symlink(),'PRODUCTION_BEFORE_ALREADY_RECORDED_NO_REPLAY')
        witness=production_g_witness(g_path,'before',opts.nonce,controller_source_sha=opts.source_sha)
        need(witness.get('source_sha')==opts.candidate_source_sha and witness.get('controller_source_sha')==opts.source_sha,
             'PRODUCTION_BEFORE_ARTIFACT_CONTROLLER_BINDING')
        owner_receipt(path,witness)
        print(canonical({'status':'PRODUCTION_G_BEFORE_SAVED','path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}).decode());return
    need(H40.fullmatch(opts.source_sha or '') and H64.fullmatch(opts.owner_source_sha256 or '') and opts.existing_before and H64.fullmatch(opts.existing_before_sha256 or ''),
         'PRODUCTION_COMPLETE_PLAN_BINDINGS_REQUIRED')
    _,owner_source=pinned_file(__file__,opts.owner_source_sha256,maximum=196608)
    before_path,before_raw=private_bytes(opts.existing_before,maximum=65536)
    need(hashlib.sha256(before_raw).hexdigest()==opts.existing_before_sha256,'PRODUCTION_BEFORE_PRIVATE_FILE_PIN')
    before=strict_json(before_raw)
    need(before.get('schema')=='aoe2war.g.app-production.v1' and before.get('phase')=='before' and before.get('nonce')==opts.nonce and
         before.get('source_sha')==opts.candidate_source_sha and before.get('controller_source_sha')==opts.source_sha and
         before.get('status')=='PRODUCTION_G_BEFORE_PASS_PENDING_REAL_AUTHENTICATED_BROWSER',
         'PRODUCTION_ACTUAL_G_BEFORE_REQUIRED')
    encoded=base64.b64encode(before_raw).decode();need(len(encoded)<=90000,'PRODUCTION_BEFORE_BOUND')
    binding=(' --new-nonce '+opts.nonce+' --source-sha '+opts.source_sha+' --candidate-source-sha '+opts.candidate_source_sha+' --engine-source-sha256 '+opts.root_source_sha256+
             ' --owner-source-sha256 '+opts.owner_source_sha256+' --g-source-sha256 '+opts.g_source_sha256+
             ' --before-witness-sha256 '+opts.existing_before_sha256+' --before-witness-b64 '+encoded)
    fresh=ssh_source(root,'--root-production-plan'+binding,timeout=450)
    need(fresh.returncode==0 and 0<len(fresh.stdout)<=32768,'PRODUCTION_NATIVE_READ_ONLY_PLAN_HOLD')
    envelope=strict_json(fresh.stdout)
    need(envelope.get('schema')=='aoe2war.app.production-cutover-plan-envelope.v1' and envelope.get('status')=='PASS_READ_ONLY_PRODUCTION_CUTOVER_PLAN_NOT_AUTHORITY' and
         hashlib.sha256(canonical(envelope.get('plan'))).hexdigest()==envelope.get('plan_sha256'),'PRODUCTION_NATIVE_PLAN_SCHEMA')
    if opts.production_mode=='plan':
        path=receipts/(opts.nonce+'-plan.json');owner_receipt(path,envelope)
        print(canonical({'status':'PRODUCTION_READ_ONLY_PLAN_SAVED_NOT_AUTHORITY','path':str(path),'plan_sha256':envelope['plan_sha256']}).decode());return
    need(opts.production_plan,'PRODUCTION_REVIEWED_NATIVE_PLAN_REQUIRED')
    _,approved_raw=private_bytes(opts.production_plan,maximum=32768);approved=strict_json(approved_raw)
    need(approved==envelope,'PRODUCTION_OWNER_APPROVED_NATIVE_PLAN_DRIFT')
    _,grant=production_comment(opts.owner_grant_comment,opts.owner_grant_sha256,envelope)
    qualified_ci(grant);qualified_sources(grant,{'engine':root,'owner':owner_source,'g':g_source})
    submission=receipts/(opts.nonce+'-owner-submission.json')
    need(not submission.exists() and not submission.is_symlink(),'PRODUCTION_OWNER_SUBMISSION_ALREADY_CONSUMED_NO_REPLAY')
    production_comment(opts.owner_grant_comment,opts.owner_grant_sha256,envelope)
    owner_receipt(submission,{'schema':'aoe2war.app.production-cutover-submission.v1','status':'SUBMITTED_NOT_PROOF_OF_HOST_EXECUTION',
        'comment_id':opts.owner_grant_comment,'body_sha256':opts.owner_grant_sha256,'plan_sha256':envelope['plan_sha256']})
    try:
        result=ssh_source(root,'--root-production-apply'+binding+' --grant-comment '+opts.owner_grant_comment+' --grant-sha256 '+opts.owner_grant_sha256+
                          ' --plan-sha256 '+envelope['plan_sha256'],timeout=600)
        need(len(result.stdout)<=131072 and len(result.stderr)<=131072,'PRODUCTION_ROOT_OUTPUT_BOUND')
        owner_receipt(receipts/(opts.nonce+'-root-result.json'),{'returncode':result.returncode,'stdout':result.stdout.decode(errors='replace'),'stderr':result.stderr.decode(errors='replace')})
        need(result.returncode==0,'PRODUCTION_CUTOVER_UNCERTAIN_INSPECT_JOURNAL_NO_BLIND_RETRY')
        reply=strict_json(result.stdout)
        need(reply.get('status')=='PRODUCTION_PUBLIC_CUTOVER_PENDING_G_AFTER_AND_REAL_AUTHENTICATED_BROWSER','PRODUCTION_NATIVE_CUTOVER_RECEIPT_REQUIRED')
        _,recheck=pinned_file(g_path,opts.g_source_sha256,maximum=196608);need(recheck==g_source,'PRODUCTION_G_SOURCE_CHANGED')
        after=production_g_witness(g_path,'after',opts.nonce,before_path,opts.existing_before_sha256,controller_source_sha=opts.source_sha)
        owner_receipt(receipts/(opts.nonce+'-g-after.json'),after)
        print(canonical({'status':'PRODUCTION_G_AFTER_PASS_STEAM_AND_AUTHENTICATED_BROWSER_STILL_PENDING',
                         'source_sha':opts.candidate_source_sha,'controller_source_sha':opts.source_sha,
                         'build_id':after['build_id'],'build_version':after['build_version'],'receipt':str(receipts/(opts.nonce+'-g-after.json'))}).decode())
    except BaseException:
        # A failed native preflight may never have entered its atomic host
        # journal; calling rollback in that state masks the real failure.
        # Inspect the exact public Nginx bytes before deciding whether a
        # protective restoration is required.
        original_sha=envelope.get('plan',{}).get('nginx_before_sha256')
        if original_sha and production_original_nginx_unchanged(original_sha):
            print('PASS:PRODUCTION_ORIGINAL_NGINX_UNCHANGED_NO_ROLLBACK_NEEDED',file=sys.stderr,flush=True)
        else:
            production_protective_rollback(root,opts.nonce,receipts/(opts.nonce+'-automatic-rollback-result.json'))
        raise


def main():
    if "--production-mode" in sys.argv[1:]:return production_owner_main(sys.argv[1:])
    a = argparse.ArgumentParser()
    a.add_argument("--reviewed-root-file", required=True)
    a.add_argument("--root-source-sha256", required=True)
    a.add_argument("--reviewed-g-file")
    a.add_argument("--g-source-sha256")
    a.add_argument("--root-approved-intent", action="store_true")
    a.add_argument("--rollback", action="store_true")
    a.add_argument("--owner-grant-comment")
    a.add_argument("--owner-source-sha256")
    a.add_argument("--owner-grant-sha256")
    a.add_argument("--owner-grant-plan")
    a.add_argument("--existing-before")
    a.add_argument("--existing-before-sha256")
    opts = a.parse_args()
    need(sys.platform == "darwin" and os.geteuid() != 0,
         "ORIGINAL_OWNER_MAC_NONROOT_REQUIRED")
    _, root = pinned_file(opts.reviewed_root_file, opts.root_source_sha256, maximum=131072)
    need(("TARGET=\"" + TARGET + "\"").encode() in root,
         "IMMUTABLE_FROZEN_WEBSITE_SOURCE_NOT_PINNED")
    need(opts.root_approved_intent or opts.owner_grant_comment,
         "ROOT_PROTECTED_NONCE_AND_BUILD_INTENT_REQUIRED")

    g_path = None
    g_source = None
    if not opts.rollback:
        need(opts.reviewed_g_file is not None,
             "INDEPENDENT_G_VERIFIER_SOURCE_REQUIRED")
        g_path, g_source = pinned_file(opts.reviewed_g_file, opts.g_source_sha256)

    if opts.owner_grant_comment:
        apply_owner_grant(opts, root, g_path, g_source)
        return
    need(not any((opts.owner_source_sha256, opts.owner_grant_sha256, opts.owner_grant_plan, opts.existing_before,
                  opts.existing_before_sha256)), "OWNER_GRANT_MODE_REQUIRED_FOR_GRANT_INPUTS")

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
    need(approved.get("engine_source_sha256")==opts.root_source_sha256,
         "ROOT_APPROVED_ENGINE_SOURCE_DRIFT")
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
