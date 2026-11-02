#!/usr/bin/env python3
"""Original Mac: authenticated read-only plan, distinct GUI consent, one START.

Requires an authenticated owner-only nonfinancial release acceptance on exact bytes.
Optional future independent reviews need separately appointed real contributors.
No placeholder approval is supplied; source CI and native B repair/PRESTART must
already pass. C/E sealed artifacts are consumed, never rebuilt or recopied.
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
import subprocess
import sys
import urllib.request

B_ROOT_REF = "4c9d2ec8029bd97f4307823fa1971ef326527adc"
B_ROOT_SIZE = 14001
B_ROOT_SHA = "c4301d6faa0d3b9f763168f3883473425c8f2ca6f9b3e6ea03bdfbc079f6e749"
B_ROOT_BLOB = "5f66cdb87ee44fd91ba2c9e5c1c3e362e46d4f5c"
B_WITNESS_REF = "73635d328ee7c9c96a5c2e447cc08df8eae2a085"
B_WITNESS_SIZE = 22310
B_WITNESS_SHA = "a72f96668bc6beeaacc90d089cbd7b3a3815caca7b69d4ef7e7be68da6c6ef90"
B_WITNESS_BLOB = "01cb34dcd23a1793fef62d1e49ba6e6f600e8b44"
V2_WITNESS_SIZE = 23853
V2_WITNESS_SHA = "8f6a30172a089aca7de4b5941791c1d1301a40486e872cc8b6efadc386acccda"
V2_WITNESS_BLOB = "a294247bfda007858e1a0a56eb1ad13a11b7d1f9"
V2_DROPIN_SIZE = 1182
V2_DROPIN_SHA = "f24656b3120484327e17c59f449ad0125f7014869fa8018fe1c4c05d26f65f74"
V2_DROPIN_BLOB = "f8fdb2afd416022e44dc3e3db26829c1eeb30588"
V3_DROPIN_SIZE = 783
V3_DROPIN_SHA = "84cbb2e8563bb3355a4304b3feab563617b1164a8f1caf1608f592af1ef8aaac"
V3_DROPIN_BLOB = "99e084d3f9dcbd201942e238eb1bc27c243c995f"
V4_WITNESS_SIZE = 23869
V4_WITNESS_SHA = "437e87fbd91073d157fc1ca15f58a4e9d5aa4f144b7c8d04ae1549132ac3c522"
V4_WITNESS_BLOB = "8b28b59cf9992d6275b4068aff080418e485e373"
V7_DROPIN_SIZE = 318
V7_DROPIN_SHA = "3d67fc109138040c527b529ef16dc03642f75b4eb0312fce7cfff2fb39c578f9"
V7_DROPIN_BLOB = "22e53919ea3a807c6fce2f25884696d2e52e58af"
E_CERT_SHA = "9a4b8b441d87556bd0ed8b9fb50916aff91da7c6975096ae7e1edc6f84290b2d"
REVIEWERS = ("/root/security_review", "/root/start_fix_review")
OWNER_LOGIN = "Emaren"
OWNER_SCHEMA = "aoe2war.r25.c.owner-nonfinancial-release.v1"
OWNER_HEADER = "R25_START_V8_OWNER_NONFINANCIAL_ACCEPT"
REVIEW_VERDICT_SCHEMA = "aoe2war.r25.c.independent-github-verdict.v8"
H40 = re.compile(r"[a-f0-9]{40}\Z")
H64 = re.compile(r"[a-f0-9]{64}\Z")

def hold(why):
    raise RuntimeError("R25_C_OWNER_RECOVER_V3:" + why)

def need(ok, why):
    if not ok:
        hold(why)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def fetch(ref, path, size, digest, gitblob):
    need(bool(H40.fullmatch(ref)) and bool(H64.fullmatch(digest))
         and bool(H40.fullmatch(gitblob)) and 0 < size < 65536, "SOURCE_PIN_FORMAT")
    url = "https://raw.githubusercontent.com/Emaren/app-prodn/" + ref + "/" + path
    with urllib.request.urlopen(url, timeout=25) as response:
        data = response.read(size + 1)
    need(len(data) == size and sha(data) == digest and blob(data) == gitblob,
         "IMMUTABLE_SOURCE_SIZE_SHA256_BLOB_DRIFT")
    return data

def review_comment(comment_id, expected_sha, source_sha, root, mac):
    need(comment_id.isdecimal() and bool(H64.fullmatch(expected_sha)), "REVIEW_COMMENT_PIN_FORMAT")
    gh = next((p for p in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh") if Path(p).is_file()), None)
    need(gh is not None, "EXISTING_AUTHENTICATED_GITHUB_CLI_REQUIRED")
    result = subprocess.run([gh, "api", "repos/Emaren/app-prodn/issues/comments/" + comment_id],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25, check=False)
    need(result.returncode == 0 and len(result.stdout) <= 65536, "AUTHENTICATED_REVIEW_FETCH_FAILED")
    comment = json.loads(result.stdout)
    url = "https://github.com/Emaren/app-prodn/pull/1120#issuecomment-" + comment_id
    need(comment.get("id") == int(comment_id) and comment.get("html_url") == url
         and comment.get("issue_url") == "https://api.github.com/repos/Emaren/app-prodn/issues/1120"
         and comment.get("user", {}).get("login") == "Emaren", "REVIEW_AUTHOR_REPOSITORY_OR_COMMENT_DRIFT")
    body = comment.get("body", "")
    need(isinstance(body, str) and sha(body.encode()) == expected_sha, "REVIEW_BODY_PIN_DRIFT")
    owner_mode = body.startswith(OWNER_HEADER + "\n")
    header = OWNER_HEADER if owner_mode else "R25_START_V8_INDEPENDENT_REVIEW"
    block = re.fullmatch(re.escape(header) + r"\n" + re.escape('```') +
                         r"json\n(.+)\n" + re.escape('```') + r"\n?", body, re.S)
    need(bool(block), "OWNER_OR_OPTIONAL_REVIEW_MANIFEST_FORMAT")
    record = json.loads(block[1])
    need(record.get("decision") == "ACCEPT"
         and record.get("scope") == "RECOVERY_START_3031_V8_ONLY"
         and record.get("source_sha") == source_sha, "EXACT_RELEASE_SOURCE_SCOPE_REQUIRED")
    if owner_mode:
        need(record.get("schema") == OWNER_SCHEMA
             and record.get("owner_login") == OWNER_LOGIN
             and record.get("release_authority") == "OWNER_ONLY_NONFINANCIAL"
             and record.get("independent_review") is False
             and record.get("owner_accepts_no_independent_review") is True
             and record.get("nonfinancial_only") is True
             and record.get("public_cutover_authorized") is False
             and record.get("financial_authorized") is False
             and "github_review_provenance" not in record
             and "reviewer" not in record, "AUTHENTIC_OWNER_NONFINANCIAL_RELEASE_REQUIRED")
    else:
        need(record.get("schema") == "aoe2war.r25.c.start-source-review.v8"
             and record.get("independent_review") is True
             and record.get("reviewer") in REVIEWERS
             and record.get("publisher_is_reviewer_identity") is False,
             "OPTIONAL_INDEPENDENT_REVIEW_REQUIRED")
    for prefix, data in (("operator", root), ("mac", mac)):
        need(record.get(prefix + "_size") == len(data)
             and record.get(prefix + "_sha256") == sha(data)
             and record.get(prefix + "_blob") == blob(data), "REVIEW_SOURCE_BYTES_MISMATCH")
    if owner_mode:
        # The owner-only path NEVER purports to be an independent review.
        proof = {"mode": "OWNER_ONLY_NONFINANCIAL",
                 "owner_login": OWNER_LOGIN,
                 "owner_comment_sha256": sha(body.encode()),
                 "review_commit": source_sha}
    else:
        # Optional future contributors: an appointed reviewer must be real,
        # distinct from the owner and the authentic exact-head GitHub approver.
        pin = record.get("github_review_provenance", {})
        designated = pin.get("reviewer_login") if isinstance(pin, dict) else None
        need(isinstance(designated, str)
             and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}", designated))
             and designated != OWNER_LOGIN
             and type(pin.get("review_id")) is int and pin["review_id"] > 0
             and bool(H64.fullmatch(str(pin.get("review_body_sha256", "")))),
             "REAL_APPOINTED_INDEPENDENT_REVIEW_REFERENCE_REQUIRED")
        review_reply = subprocess.run(
            [gh, "api", "repos/Emaren/app-prodn/pulls/1120/reviews/" + str(pin["review_id"])],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25, check=False)
        need(review_reply.returncode == 0 and len(review_reply.stdout) <= 65536,
             "AUTHENTIC_INDEPENDENT_GITHUB_REVIEW_FETCH_FAILED")
        review = json.loads(review_reply.stdout)
        need(review.get("id") == pin["review_id"] and review.get("state") == "APPROVED"
             and review.get("commit_id") == source_sha
             and review.get("user", {}).get("login") == designated
             and review.get("user", {}).get("login") != comment.get("user", {}).get("login")
             and review.get("html_url", "").startswith("https://github.com/Emaren/app-prodn/pull/1120#pullrequestreview-")
             and isinstance(review.get("submitted_at"), str) and len(review["submitted_at"]) >= 20
             and review["submitted_at"] <= str(comment.get("created_at", ""))
             and review.get("author_association") in ("COLLABORATOR", "MEMBER", "OWNER"),
             "ACTUAL_INDEPENDENT_EXACT_HEAD_APPROVAL_REQUIRED")
        review_body = review.get("body")
        need(isinstance(review_body, str) and len(review_body.encode()) <= 32768
             and sha(review_body.encode()) == pin["review_body_sha256"],
             "INDEPENDENT_REVIEW_BODY_PIN_DRIFT")
        marker = "R25_START_V8_SOURCE_REVIEW_ACCEPT\n" + '```' + "json\n"
        need(review_body.startswith(marker) and review_body.rstrip().endswith('```'),
             "INDEPENDENT_REVIEW_VERDICT_FORMAT")
        verdict = json.loads(review_body[len(marker):review_body.rfind("\n"+'```')])
        need(verdict.get("schema") == REVIEW_VERDICT_SCHEMA and verdict.get("decision") == "ACCEPT"
             and verdict.get("scope") == "RECOVERY_START_3031_V8_ONLY"
             and verdict.get("source_sha") == source_sha,
             "INDEPENDENT_VERDICT_SOURCE_SCOPE_DRIFT")
        for prefix, data in (("operator", root), ("mac", mac)):
            need(verdict.get(prefix + "_size") == len(data)
                 and verdict.get(prefix + "_sha256") == sha(data)
                 and verdict.get(prefix + "_blob") == blob(data),
                 "INDEPENDENT_VERDICT_SOURCE_BYTES_DRIFT")
        proof = {"mode": "OPTIONAL_INDEPENDENT_REVIEW",
                 "review_id": review["id"], "reviewer_login": designated,
                 "review_body_sha256": sha(review_body.encode()),
                 "review_commit": source_sha,
                 "review_submitted_at": review["submitted_at"]}
    ci = record.get("exact_head_ci", {})
    need(type(ci.get("run_id")) is int and ci["run_id"] > 0 and ci.get("head_sha") == source_sha
         and ci.get("conclusion") == "success" and ci.get("all_three_jobs_success") is True,
         "REVIEW_EXACT_HEAD_CI_REQUIRED")
    run_id = str(ci["run_id"])
    def github(endpoint):
        result = subprocess.run([gh, "api", "repos/Emaren/app-prodn/" + endpoint],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25, check=False)
        need(result.returncode == 0 and len(result.stdout) <= 262144, "EXACT_HEAD_CI_READ_FAILED")
        return json.loads(result.stdout)
    actual = github("actions/runs/" + run_id)
    jobs = github("actions/runs/" + run_id + "/jobs?filter=latest&per_page=100")
    expected_names = {"Release and documentation control plane", "Type, contract, and production build",
                      "Isolated Steam-rating PostgreSQL chronology"}
    need(actual.get("head_sha") == source_sha and actual.get("status") == "completed"
         and actual.get("conclusion") == "success" and actual.get("name") == "AoE2WAR CI"
         and jobs.get("total_count") == 3 and len(jobs.get("jobs", [])) == 3
         and {j.get("name") for j in jobs["jobs"]} == expected_names
         and all(j.get("status") == "completed" and j.get("conclusion") == "success" for j in jobs["jobs"]),
         "EXACT_HEAD_FULL_THREE_JOB_CI_NOT_PASS")
    return body, url, proof

def root_call(root, payload, phase):
    loader = "import base64;exec(compile(base64.b64decode(" + repr(base64.b64encode(root).decode()) + "),'reviewed-r25-c-recovery-v8','exec'))"
    remote = " ".join(shlex.quote(x) for x in ["/usr/bin/python3", "-I", "-B", "-c", loader, "--phase", phase])
    ssh = ["/usr/bin/ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "NumberOfPasswordPrompts=0", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "root@hel1", remote]
    result = subprocess.run(ssh, input=canonical(payload), stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, timeout=240, check=False)
    need(len(result.stdout) <= 131072, "ROOT_REPLY_UNBOUNDED")
    reply = json.loads(result.stdout)
    need(result.returncode == 0 and reply.get("status") != "HOLD",
         "ROOT_HOLD_NO_BLIND_RETRY:" + str(reply.get("reason", "NATIVE_FAILURE"))[:140])
    return reply

def owner_approval(phrase):
    # The earlier SSH plan was read-only. No mutating SSH until this exact phrase.
    script = ('set answerRecord to display dialog ' +
        json.dumps("Type the new separately reviewed V8 recovery authorization. Previous v1 journal remains sealed; only candidate 3031 and its candidate-only sandbox are changed. Public cutover stays gated.\n\n" + phrase) +
        ' default answer "" buttons {"Cancel", "Authorize START"} default button "Cancel"\n'
        'return text returned of answerRecord')
    result = subprocess.run(["/usr/bin/osascript", "-e", script], capture_output=True,
                            text=True, timeout=180, check=False)
    need(result.returncode == 0 and result.stdout.rstrip("\r\n") == phrase,
         "FRESH_EXACT_START_ONLY_GUI_CONSENT_NOT_GRANTED")

def session_auth_main():
    """Exact owner-delegated repair; existing START GUI contract is unchanged."""
    ap=argparse.ArgumentParser()
    ap.add_argument('operation',choices=('session-auth-plan','session-auth-repair'))
    ap.add_argument('--review-commit',required=True)
    for name in ('operator-sha256','witness-sha256','g-sha256','nonce','plan-file'):
        ap.add_argument('--'+name,required=True)
    ap.add_argument('--grant-comment');ap.add_argument('--grant-sha256')
    args=ap.parse_args(sys.argv[2:])
    need(sys.platform=='darwin' and os.geteuid()!=0,'ORIGINAL_NONROOT_OWNER_MAC_REQUIRED')
    need(H40.fullmatch(args.review_commit) and re.fullmatch('[a-f0-9]{32}',args.nonce),'SESSION_SOURCE_NONCE_REQUIRED')
    sources={}
    for name,path,digest in (('operator','scripts/r25_c_start_recovery_v8_root.py',args.operator_sha256),
                             ('witness','scripts/r25_b_session_continuity_witness_v1.py',args.witness_sha256),
                             ('g','scripts/aoe2_r25_f_g_parallel_observer.py',args.g_sha256)):
        need(H64.fullmatch(digest),'SESSION_SOURCE_HASH_REQUIRED')
        with urllib.request.urlopen('https://raw.githubusercontent.com/Emaren/app-prodn/'+args.review_commit+'/'+path,timeout=25) as response:
            raw=response.read(131073)
        need(0<len(raw)<=131072 and sha(raw)==digest,'SESSION_IMMUTABLE_SOURCE_BYTES_MISMATCH')
        sources[name]=raw
    mac=Path(__file__).read_bytes()
    with urllib.request.urlopen('https://raw.githubusercontent.com/Emaren/app-prodn/'+args.review_commit+'/scripts/r25_c_start_recovery_v8_mac.py',timeout=25) as response:
        need(response.read(len(mac)+1)==mac,'SESSION_MAC_SOURCE_COMMIT_MISMATCH')
    payload={'source_sha':args.review_commit,'nonce':args.nonce,'operator_sha256':sha(sources['operator']),
             'mac_sha256':sha(mac),'witness_sha256':sha(sources['witness']),'g_sha256':sha(sources['g']),
             'session_witness_b64':base64.b64encode(sources['witness']).decode()}
    plan_path=Path(args.plan_file).expanduser()
    if args.operation=='session-auth-plan':
        result=root_call(sources['operator'],payload,'session-auth-plan')
        need(result.get('status')=='PASS_SESSION_CONTINUITY_PLAN_READ_ONLY_NOT_AUTHORITY'
             and result.get('plan_sha256')==sha(canonical(result.get('plan'))),'SESSION_NATIVE_PLAN_NOT_PROVEN')
        fd=os.open(plan_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as handle:
            handle.write(canonical(result)+b'\n');handle.flush();os.fsync(handle.fileno())
        print(json.dumps(result,sort_keys=True));return 0
    need(args.grant_comment and args.grant_comment.isdecimal() and args.grant_sha256 and H64.fullmatch(args.grant_sha256),
         'SESSION_EXACT_OWNER_GRANT_REQUIRED')
    st=plan_path.lstat()
    need(st.st_uid==os.getuid() and not st.st_mode&0o077 and not plan_path.is_symlink() and 0<st.st_size<=131072,'SESSION_PRIVATE_PLAN_REQUIRED')
    envelope=json.loads(plan_path.read_bytes())
    need(envelope.get('plan',{}).get('nonce')==args.nonce and envelope.get('plan',{}).get('source_sha')==args.review_commit
         and envelope.get('plan_sha256')==sha(canonical(envelope.get('plan'))),'SESSION_LOCAL_PLAN_DRIFT')
    gh=next((p for p in ('/opt/homebrew/bin/gh','/usr/local/bin/gh') if Path(p).is_file()),None)
    need(gh is not None,'EXISTING_AUTHENTICATED_GITHUB_CLI_REQUIRED')
    got=subprocess.run([gh,'api','repos/Emaren/app-prodn/issues/comments/'+args.grant_comment],capture_output=True,timeout=25,check=False)
    need(got.returncode==0 and 0<len(got.stdout)<=131072,'SESSION_AUTHENTICATED_OWNER_GRANT_UNAVAILABLE')
    owner=json.loads(got.stdout)
    need(owner.get('user',{}).get('login')=='Emaren' and owner.get('user',{}).get('id')==15059910
         and sha(owner.get('body','').encode())==args.grant_sha256 and owner.get('created_at')==owner.get('updated_at'),
         'SESSION_ACTUAL_OWNER_GRANT_DRIFT')
    # Root independently re-fetches exact owner identity, complete plan, expiry,
    # full CI and all four immutable sources while holding the release lock.
    payload.update({'plan_sha256':envelope['plan_sha256'],'grant_comment':args.grant_comment,'grant_sha256':args.grant_sha256})
    result=root_call(sources['operator'],payload,'session-auth-repair')
    need(result.get('status')=='SESSION_CONTINUITY_REPAIRED_AND_REQUALIFIED','SESSION_REPAIR_NOT_PHYSICALLY_PROVEN')
    print(json.dumps(result,sort_keys=True));return 0

def main():
    if len(sys.argv)>1 and sys.argv[1]=='--session-auth':return session_auth_main()
    ap = argparse.ArgumentParser()
    ap.add_argument("--review-commit", required=True)
    ap.add_argument("--operator-size", type=int, required=True)
    ap.add_argument("--operator-sha256", required=True)
    ap.add_argument("--operator-blob", required=True)
    ap.add_argument("--review-comment", required=True)
    ap.add_argument("--review-comment-sha256", required=True)
    ap.add_argument("--e-certificate", default="~/Downloads/r25-e-recovery-9a4b8b441d87556bd0.json")
    modes = ap.add_mutually_exclusive_group(required=True)
    modes.add_argument("--plan-only", action="store_true")
    modes.add_argument("--start", action="store_true")
    args = ap.parse_args()
    need(sys.platform == "darwin" and os.geteuid() != 0, "ORIGINAL_NONROOT_MAC_REQUIRED")
    fs = os.statvfs(Path.home())
    need(fs.f_bavail * fs.f_frsize >= 25 * 1024 ** 3, "M1_25_GIB_FLOOR")
    root = fetch(args.review_commit, "scripts/r25_c_start_recovery_v8_root.py", args.operator_size,
                 args.operator_sha256, args.operator_blob)
    mac = Path(__file__).read_bytes()
    body, url, review_proof = review_comment(args.review_comment, args.review_comment_sha256, args.review_commit, root, mac)
    # Prove this source commit also contains these exact reviewed Mac bytes.
    fetch(args.review_commit, "scripts/r25_c_start_recovery_v8_mac.py", len(mac), sha(mac), blob(mac))
    epath = Path(args.e_certificate).expanduser()
    es = epath.lstat()
    need(es.st_uid == os.geteuid() and es.st_mode & 0o077 == 0 and not epath.is_symlink()
         and 0 < es.st_size <= 65536, "ORIGINAL_PRIVATE_E_CERTIFICATE_REQUIRED")
    certificate = json.loads(epath.read_bytes())
    ebase = dict(certificate)
    need(ebase.pop("certificate_sha256", None) == E_CERT_SHA and sha(canonical(ebase)) == E_CERT_SHA,
         "ACCEPTED_E_FINAL_CERTIFICATE_DRIFT")
    broot = fetch(B_ROOT_REF, "scripts/r25_b_one_use_witness_repair_root.py", B_ROOT_SIZE, B_ROOT_SHA, B_ROOT_BLOB)
    bwitness = fetch(B_WITNESS_REF, "scripts/r25_b_host_witness.py", B_WITNESS_SIZE, B_WITNESS_SHA, B_WITNESS_BLOB)
    v2w = fetch(args.review_commit, "scripts/r25_b_namespace_recovery_witness.py",
        V2_WITNESS_SIZE, V2_WITNESS_SHA, V2_WITNESS_BLOB)
    v2d = fetch(args.review_commit, "deploy/r25-b-3031.namespace-recovery.dropin.conf",
        V2_DROPIN_SIZE, V2_DROPIN_SHA, V2_DROPIN_BLOB)
    v3d = fetch(args.review_commit, "deploy/r25-b-3031.prestart-host-mount-v3.dropin.conf",
        V3_DROPIN_SIZE, V3_DROPIN_SHA, V3_DROPIN_BLOB)
    v4w = fetch(args.review_commit, "scripts/r25_b_namespace_recovery_witness_v4.py",
                V4_WITNESS_SIZE, V4_WITNESS_SHA, V4_WITNESS_BLOB)
    v7d = fetch(args.review_commit,"deploy/r25-b-3031.systemd-env-v7.dropin.conf",
                 V7_DROPIN_SIZE,V7_DROPIN_SHA,V7_DROPIN_BLOB)
    payload = {"v7_dropin_b64": base64.b64encode(v7d).decode(),
        "v4_witness_b64": base64.b64encode(v4w).decode(),
        "v3_dropin_b64": base64.b64encode(v3d).decode(),
        "v2_witness_b64": base64.b64encode(v2w).decode(),
        "v2_dropin_b64": base64.b64encode(v2d).decode(),
        "source_sha": args.review_commit, "operator_size": len(root),
        "operator_sha256": sha(root), "operator_blob": blob(root),
        "review_body": body, "review_body_sha256": args.review_comment_sha256,
        "review_url": url, "github_review_proof": review_proof, "e_certificate": certificate,
        "review_author": "Emaren", "review_issue_url": "https://api.github.com/repos/Emaren/app-prodn/issues/1120",
        "b_repair_b64": base64.b64encode(broot).decode(),
        "b_witness_b64": base64.b64encode(bwitness).decode()}
    # This is an actual, distinct, authenticated native B PRESTART/read-only plan.
    planned = root_call(root, payload, "plan")
    need(planned.get("status") == "PASS_START_PLAN_READ_ONLY_NOT_START_AUTHORITY"
         and planned.get("plan_sha256") == sha(canonical(planned.get("plan"))),
         "REAL_NATIVE_PRESTART_AND_PLAN_REQUIRED")
    print(json.dumps({"status":planned.get("status"),
        "plan_sha256":planned.get("plan_sha256"),"public_cutover_authorized":False},
        sort_keys=True), flush=True)
    if args.plan_only:
        return 0
    nonce = secrets.token_hex(16)
    phrase = "RECOVER-START-R25-3031-V8 " + nonce + " " + planned["plan_sha256"]
    owner_approval(phrase)
    # An independent review can be dismissed between PLAN and GUI consent.
    # Live recheck BEFORE any mutating root call; a revoked review cannot
    # authorize the one-use journal simply because it was approved earlier.
    latest_body, latest_url, latest_proof = review_comment(
        args.review_comment, args.review_comment_sha256, args.review_commit, root, mac)
    need(latest_body == body and latest_url == url and latest_proof == review_proof,
         "OWNER_OR_OPTIONAL_REVIEW_REVOKED_AFTER_GUI_CONSENT")
    payload.update({"plan_sha256": planned["plan_sha256"], "nonce": nonce, "owner_consent": phrase})
    result = root_call(root, payload, "start")
    need(result.get("status") == "STARTED_3031_PENDING_B_POSTSTART_C_RUNTIME_ACCEPT"
         and result.get("plan_sha256") == planned["plan_sha256"]
         and result.get("nonce") == nonce and result.get("candidate_uid") == 993
         and result.get("public_cutover_authorized") is False,
         "START_RECEIPT_NOT_ADMITTED_NO_BLIND_RETRY")
    print(json.dumps({k:result.get(k) for k in
        ("status","candidate_pid","candidate_uid","public_cutover_authorized")},
        sort_keys=True), flush=True)
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)[:180],
                          "no_blind_retry": True, "public_cutover_authorized": False}, sort_keys=True))
        sys.exit(2)
