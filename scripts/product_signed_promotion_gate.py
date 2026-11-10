#!/usr/bin/env python3
"""Owner-controlled PRODUCT promotion verifier. SOURCE ONLY: no deployment code.

Real CLI requires root-owned trust at a pinned, non-PRODUCT path, an owner SSH
signature, unforgeable source/artifact hashes and independent GitHub CI checks.
The separately authorized B release controller must enforce use of this gate.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.request import Request, urlopen

TRUST_DIR = Path("/Library/Application Support/AoE2WAR/ProductPromotion")
SIGNER = "aoe2war-central"
NAMESPACE = "aoe2war-product-release"
SCHEMA = "aoe2war.product.promotion.v1"
HEXSHA = re.compile(r"^[0-9a-f]{40}$")
HEX256 = re.compile(r"^[0-9a-f]{64}$")
NONCE = re.compile(r"^[A-Za-z0-9_-]{24,80}$")
BRANCH = re.compile(r"^session-[bc]/[a-zA-Z0-9._/-]+$")
APPROVAL = re.compile(
    r"^https://github[.]com/Emaren/app-prodn/issues/1280#issuecomment-[0-9]+$"
)
KEYS = {
    "schema", "repo", "pr", "branch", "source_sha", "artifact_sha256",
    "rollback_source_sha", "rollback_sha256", "operation",
    "expires_at", "nonce", "approval_url", "ci_runs",
}
CI_KEYS = {"workflow", "run_id", "attempt", "job"}
REPOS = {"Emaren/app-prodn", "Emaren/kingdom-traders"}
OPERATIONS = {"STAGE_NONFINANCIAL_APP", "STAGE_PAPER_ONLY"}


class Denied(ValueError):
    pass


def forbid(reason: str) -> None:
    raise Denied("HOLD_PROMOTION_" + reason)


def unique_pairs(items):
    value = {}
    for key, item in items:
        if key in value:
            forbid("DUPLICATE_JSON_KEY")
        value[key] = item
    return value


def canonical_json(data: dict) -> bytes:
    return (json.dumps(data, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def read_manifest(raw: bytes, now: datetime) -> dict:
    try:
        data = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise Denied("HOLD_PROMOTION_INVALID_JSON") from exc
    if not isinstance(data, dict) or set(data) != KEYS or canonical_json(data) != raw:
        forbid("NONCANONICAL_MANIFEST_OR_FIELDS")
    if data["schema"] != SCHEMA or data["repo"] not in REPOS:
        forbid("WRONG_SCHEMA_OR_REPOSITORY")
    if type(data["pr"]) is not int or data["pr"] < 1:
        forbid("INVALID_PR")
    for key in ("source_sha", "rollback_source_sha"):
        if not isinstance(data[key], str) or not HEXSHA.fullmatch(data[key]):
            forbid("INVALID_SOURCE_SHA")
    for key in ("artifact_sha256", "rollback_sha256"):
        if not isinstance(data[key], str) or not HEX256.fullmatch(data[key]):
            forbid("INVALID_ARTIFACT_DIGEST")
    if (not isinstance(data["branch"], str) or not BRANCH.fullmatch(data["branch"])
            or any(part in ("", ".", "..") for part in data["branch"].split("/"))):
        forbid("WRONG_SOURCE_BRANCH")
    if data["operation"] not in OPERATIONS:
        forbid("UNAUTHORIZED_OPERATION")
    if (data["repo"] == "Emaren/app-prodn") != (data["operation"] == "STAGE_NONFINANCIAL_APP"):
        forbid("CROSS_REPOSITORY_OPERATION")
    if not isinstance(data["approval_url"], str) or not APPROVAL.fullmatch(data["approval_url"]):
        forbid("MISSING_OWNER_APPROVAL")
    if not isinstance(data["nonce"], str) or not NONCE.fullmatch(data["nonce"]):
        forbid("WEAK_NONCE")
    if now.tzinfo is None:
        forbid("NAIVE_HOST_CLOCK")
    try:
        expiry_text = data["expires_at"]
        if not isinstance(expiry_text, str) or not expiry_text.endswith("Z"):
            forbid("EXPIRY_NOT_UTC")
        expires = datetime.fromisoformat(expiry_text.replace("Z", "+00:00"))
    except (ValueError, TypeError) as exc:
        raise Denied("HOLD_PROMOTION_INVALID_EXPIRY") from exc
    utc = now.astimezone(timezone.utc)
    if not utc < expires <= utc + timedelta(hours=24):
        forbid("EXPIRED_OR_UNBOUNDED_ADMISSION")
    ci = data["ci_runs"]
    if not isinstance(ci, list) or not ci or len(ci) > 32:
        forbid("CI_RUNS_MISSING")
    keys = set()
    for run in ci:
        if not isinstance(run, dict) or set(run) != CI_KEYS:
            forbid("BAD_CI_DESCRIPTOR")
        if (not isinstance(run["workflow"], str)
                or not re.fullmatch(r"[.a-zA-Z0-9_/-]+[.]ya?ml", run["workflow"])
                or not run["workflow"].startswith(".github/workflows/")
                or not isinstance(run["job"], str)
                or not (1 <= len(run["job"]) <= 128)):
            forbid("BAD_CI_WORKFLOW")
        if type(run["run_id"]) is not int or run["run_id"] < 1:
            forbid("BAD_CI_RUN_ID")
        if type(run["attempt"]) is not int or run["attempt"] < 1:
            forbid("BAD_CI_ATTEMPT")
        ident = (run["workflow"], run["job"])
        if ident in keys:
            forbid("DUPLICATE_CI_WORKFLOW")
        keys.add(ident)
    return data


def file_digest(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        forbid("MISSING_OR_SYMLINK_ARTIFACT")
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def verify_signature(raw: bytes, sig: Path, allowed_signers: Path) -> None:
    if sig.is_symlink() or not sig.is_file():
        forbid("SIGNATURE_NOT_REGULAR_FILE")
    result = subprocess.run(
        ["/usr/bin/ssh-keygen", "-Y", "verify", "-f", str(allowed_signers),
         "-I", SIGNER, "-n", NAMESPACE, "-s", str(sig)],
        input=raw, capture_output=True, timeout=15, check=False,
    )
    if result.returncode:
        forbid("OWNER_SIGNATURE_INVALID")


def check_trusted_path(path: Path, *, directory: bool = False) -> None:
    # Controller trust objects are outside PRODUCT and must be owned by root.
    if not path.is_absolute() or path.is_symlink():
        forbid("TRUST_PATH_ESCAPE")
    try:
        st = os.lstat(path)
    except OSError as exc:
        raise Denied("HOLD_PROMOTION_MISSING_TRUST_PATH") from exc
    if st.st_uid != 0 or (st.st_mode & 0o022):
        forbid("TRUST_OBJECT_NOT_ROOT_OWNED_READONLY")
    if directory and not stat.S_ISDIR(st.st_mode):
        forbid("TRUST_DIRECTORY_TYPE")
    if not directory and not stat.S_ISREG(st.st_mode):
        forbid("TRUST_FILE_TYPE")


def validate_trusted_policy(policy: dict, repo: str, ci_runs: list[dict]) -> list[dict]:
    if not isinstance(policy, dict) or set(policy) != {
        "schema", "repository", "required_ci", "external_checks",
        "allowed_artifact_root", "allowed_rollback_root",
    } or policy["schema"] != SCHEMA or policy["repository"] != repo:
        forbid("WRONG_TRUST_POLICY")
    required = policy["required_ci"]
    if not isinstance(required, list) or not required:
        forbid("NO_TRUSTED_REQUIRED_CI")
    def name_pair(value):
        return (value["workflow"], value["job"])
    expected = {name_pair(c) for c in required}
    actual = {name_pair(c) for c in ci_runs}
    if actual != expected or len(actual) != len(required):
        forbid("MISSING_OR_EXTRA_REQUIRED_CI")
    for c in required:
        if not isinstance(c.get("sha256"), str) or not HEX256.fullmatch(c["sha256"]):
            forbid("UNTRUSTED_WORKFLOW_DIGEST")
    if not isinstance(policy["external_checks"], list) or not policy["external_checks"]:
        forbid("MISSING_EXTERNAL_SECURITY_CHECKS")
    for item in policy["external_checks"]:
        if (not isinstance(item, dict) or set(item) != {"name", "app_slug"}
                or not isinstance(item["name"], str) or not item["name"]
                or not isinstance(item["app_slug"], str) or not item["app_slug"]):
            forbid("MALFORMED_EXTERNAL_CHECK")
    for key in ("allowed_artifact_root", "allowed_rollback_root"):
        root = Path(policy[key])
        if not root.is_absolute() or "PRODUCT" in root.parts:
            forbid("ARTIFACT_ROOT_NOT_ISOLATED")
    return required


def verify_under_root(path: Path, root: Path, digest: str) -> None:
    if not path.is_absolute() or not root.is_absolute():
        forbid("RELATIVE_ARTIFACT_LOCATION")
    if not path.resolve(strict=False).is_relative_to(root.resolve(strict=False)):
        forbid("ARTIFACT_OUTSIDE_TRUSTED_ROOT")
    node = path
    while node != root and node != node.parent:
        if node.is_symlink():
            forbid("SYMLINK_IN_ARTIFACT_PATH")
        node = node.parent
    if file_digest(path) != digest:
        forbid("ARTIFACT_DIGEST_MISMATCH")


def inspect_remote(manifest: dict, policy: dict, api) -> dict:
    repo = manifest["repo"]
    sha = manifest["source_sha"]
    root = "/repos/" + repo
    pr = api(root + "/pulls/" + str(manifest["pr"]))
    if (pr.get("head", {}).get("sha") != sha
            or pr.get("head", {}).get("ref") != manifest["branch"]
            or pr.get("base", {}).get("ref") != "main"
            or pr.get("state") != "open"
            or pr.get("draft") is True):
        forbid("PR_NOT_EXACT_HEAD_OR_REVIEW_READY")
    required = validate_trusted_policy(policy, repo, manifest["ci_runs"])
    checks = api(root + "/commits/" + sha + "/check-runs?per_page=100").get("check_runs", [])
    for required_check in policy["external_checks"]:
        if not any(c.get("name") == required_check["name"]
                   and c.get("app", {}).get("slug") == required_check["app_slug"]
                   and c.get("head_sha") == sha and c.get("conclusion") == "success"
                   and c.get("status") == "completed" for c in checks):
            forbid("EXTERNAL_SECURITY_CHECK_NOT_PASS")
    for witness in manifest["ci_runs"]:
        configured = next(x for x in required if x["workflow"] == witness["workflow"]
                          and x["job"] == witness["job"])
        blob = api(root + "/contents/" + configured["workflow"] + "?ref=" + sha)
        if blob.get("encoding") != "base64":
            forbid("SOURCE_WORKFLOW_NOT_BASE64")
        try:
            source = base64.b64decode(blob["content"], validate=False)
        except (TypeError, ValueError) as exc:
            raise Denied("HOLD_PROMOTION_BAD_WORKFLOW_CONTENT") from exc
        if hashlib.sha256(source).hexdigest() != configured["sha256"]:
            forbid("UNTRUSTED_WORKFLOW_SOURCE")
        run = api(root + "/actions/runs/" + str(witness["run_id"]))
        if (run.get("head_sha") != sha or run.get("event") != "pull_request"
                or run.get("status") != "completed"
                or run.get("conclusion") != "success"
                or run.get("run_attempt") != witness["attempt"]
                or run.get("path", "").split("@", 1)[0] != witness["workflow"]):
            forbid("CI_RUN_NOT_EXACT_SUCCESS")
        jobs = api(root + "/actions/runs/" + str(witness["run_id"]) + "/jobs?per_page=100").get("jobs", [])
        matches = [job for job in jobs if job.get("name") == witness["job"]
                   and job.get("status") == "completed" and job.get("conclusion") == "success"
                   and job.get("run_id") == witness["run_id"]]
        if len(matches) != 1:
            forbid("CI_REQUIRED_JOB_NOT_SUCCESS")
        for step in configured.get("required_steps", []):
            if not any(s.get("name") == step and s.get("conclusion") == "success"
                       for s in matches[0].get("steps", [])):
                forbid("CI_NEGATIVE_TEST_STEP_NOT_PASS")
    return {"status": "PASS_VERIFIED_PREPARATION_NOT_DEPLOYMENT",
            "source_sha": sha, "repository": repo,
            "checks": len(manifest["ci_runs"]) + len(policy["external_checks"]),
            "rollback_sha": manifest["rollback_source_sha"]}


def consume_nonce(ledger: Path, nonce: str, receipt: dict) -> None:
    digest = hashlib.sha256(nonce.encode()).hexdigest()
    target = ledger / digest
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(target, flags, 0o600)
    except FileExistsError as exc:
        raise Denied("HOLD_PROMOTION_REPLAY_NONCE") from exc
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(json.dumps(receipt, sort_keys=True) + "\n")
        file.flush()
        os.fsync(file.fileno())
    dirfd = os.open(ledger, os.O_RDONLY)
    try:
        os.fsync(dirfd)
    finally:
        os.close(dirfd)


def github_api(token: str):
    def get(endpoint: str):
        if not endpoint.startswith("/repos/Emaren/") or ".." in endpoint:
            forbid("UNTRUSTED_GITHUB_ENDPOINT")
        request = Request("https://api.github.com" + endpoint,
                          headers={"Authorization": "Bearer " + token,
                                   "Accept": "application/vnd.github+json",
                                   "X-GitHub-Api-Version": "2022-11-28"},
                          method="GET")
        with urlopen(request, timeout=12) as response:
            return json.load(response)
    return get


def cli() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("verify", "authorize"))
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--rollback-artifact", required=True)
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            forbid("HOST_CONTROLLER_MUST_BE_ROOT")
        check_trusted_path(TRUST_DIR, directory=True)
        for parent in [TRUST_DIR.parent, TRUST_DIR.parent.parent]:
            check_trusted_path(parent, directory=True)
        trust = TRUST_DIR / "trusted_policy.json"
        signers = TRUST_DIR / "allowed_signers"
        token_file = TRUST_DIR / "github_readonly_token"
        ledger = TRUST_DIR / "nonce_ledger"
        for p in (trust, signers, token_file):
            check_trusted_path(p)
        check_trusted_path(ledger, directory=True)
        raw = Path(args.manifest).read_bytes()
        manifest = read_manifest(raw, datetime.now(timezone.utc))
        verify_signature(raw, Path(args.signature), signers)
        policy = json.loads(trust.read_text(encoding="utf-8"))
        verify_under_root(Path(args.artifact), Path(policy["allowed_artifact_root"]),
                          manifest["artifact_sha256"])
        verify_under_root(Path(args.rollback_artifact),
                          Path(policy["allowed_rollback_root"]),
                          manifest["rollback_sha256"])
        receipt = inspect_remote(manifest, policy,
                                 github_api(token_file.read_text().strip()))
        if args.action == "authorize":
            consume_nonce(ledger, manifest["nonce"], receipt)
            receipt["status"] = "ADMITTED_FOR_B_CONTROLLER_NOT_DEPLOYED"
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (Denied, OSError, KeyError, ValueError, subprocess.TimeoutExpired,
            json.JSONDecodeError) as exc:
        print("HOLD_PROMOTION: " + str(exc), file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(cli())
