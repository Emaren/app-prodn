#!/usr/bin/env python3
"""M1-only explicit owner GitHub review publication; no checkout/worktree/build.

Publishes precisely the five reviewed source/test/contract files from one
pinned archive to a NEW draft PR based on F #1008 exact frozen head.
No production or host installation. Requires owner to execute intentionally.
"""
import argparse
import hashlib
import io
import json
import platform
import subprocess
import sys
import tarfile

REPO = "Emaren/app-prodn"
BASE_PR = 1008
BASE_SHA = "f041f6d073498ba675846b03e73d2e0efe08c08f"
BASE_BRANCH = "review/f-solo-owner-w1-admission-20261029"
BRANCH = "review/d-r10-native-admission-20261030"
PATHS = (
    "scripts/aoe2_solo_website_native_issuer.py",
    "tests/test_solo_native_issuer.py",
    "deploy/solo-native-audit/NATIVE_ADMISSION_INSTALL_CONTRACT.txt",
    "deploy/solo-native-audit/aoe2war-solo-native-observer.service",
    "deploy/solo-native-audit/aoe2war-solo-native-observer.timer",
    "deploy/solo-native-audit/publish_review_pr.py",
)

class Hold(RuntimeError):
    pass


def gh(method, path, data=None, *, allow_404=False):
    args = ["gh", "api", "--method", method, "-H", "Accept: application/vnd.github+json",
            "repos/" + REPO + "/" + path]
    if data is not None:
        args.extend(("--input", "-"))
    p = subprocess.run(args, input=(json.dumps(data, separators=(",", ":")) if data is not None else None),
                       capture_output=True, text=True, timeout=25)
    if p.returncode:
        if allow_404 and ("HTTP 404" in p.stderr or "Not Found" in p.stderr):
            return None
        raise Hold("GITHUB_API_FAILED_" + method + "_" + path.split("/")[0])
    if len(p.stdout) > 500_000:
        raise Hold("GITHUB_RESPONSE_TOO_LARGE")
    try:
        return json.loads(p.stdout)
    except ValueError as exc:
        raise Hold("GITHUB_RESPONSE_NOT_JSON") from exc


def read_bundle(path, expected):
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise Hold("REVIEW_BUNDLE_SHA_MISMATCH")
    files = {}
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as archive:
        entries = archive.getmembers()
        if len(entries) != len(PATHS) or any(not x.isfile() or x.name not in PATHS or
                                             x.size <= 0 or x.size > 100_000 for x in entries):
            raise Hold("UNEXPECTED_ARCHIVE_MEMBERS")
        if len(set(x.name for x in entries)) != len(PATHS):
            raise Hold("REPEATED_ARCHIVE_MEMBER")
        for entry in entries:
            body = archive.extractfile(entry).read()
            if len(body) != entry.size:
                raise Hold("ARCHIVE_MEMBER_TRUNCATED")
            files[entry.name] = body.decode("utf-8", errors="strict")
    if set(files) != set(PATHS):
        raise Hold("MISSING_PUBLISHED_FILE")
    return files


def publish(files):
    pr = gh("GET", "pulls/" + str(BASE_PR))
    if pr["head"]["sha"] != BASE_SHA or pr["head"]["ref"] != BASE_BRANCH or pr["state"] != "open":
        raise Hold("F_REVIEW_HEAD_MOVED_OR_CLOSED")
    if gh("GET", "git/ref/heads/" + BRANCH, allow_404=True) is not None:
        raise Hold("REVIEW_BRANCH_ALREADY_EXISTS_NO_OVERWRITE")
    commit = gh("GET", "git/commits/" + BASE_SHA)
    tree_base = commit["tree"]["sha"]
    if len(tree_base) != 40:
        raise Hold("F_BASE_TREE_NOT_EXACT")
    blobs = []
    for path in PATHS:
        result = gh("POST", "git/blobs", {"content": files[path], "encoding": "utf-8"})
        blob_sha = result.get("sha")
        if not isinstance(blob_sha, str) or len(blob_sha) != 40:
            raise Hold("GITHUB_BLOB_SHA_MISSING")
        blobs.append({"path": path, "mode": "100644", "type": "blob", "sha": blob_sha})
    tree = gh("POST", "git/trees", {"base_tree": tree_base, "tree": blobs})
    created = gh("POST", "git/commits", {"message": "feat(d/r10): native admission issuer and independent receipt contract",
                                          "tree": tree["sha"], "parents": [BASE_SHA]})
    commit_sha = created["sha"]
    if len(commit_sha) != 40:
        raise Hold("GITHUB_COMMIT_SHA_MISSING")
    gh("POST", "git/refs", {"ref": "refs/heads/" + BRANCH, "sha": commit_sha})
    result = gh("POST", "pulls", {
        "title": "D R10: isolated root-native admission issuer, source-only review",
        "head": BRANCH, "base": BASE_BRANCH, "draft": True,
        "body": "R10 D source-only review against F exact f041f6d. Six separately enrolled producer signatures (never minted by issuer), native 25-unit systemd+non-systemd B finance proof, C three-domain real E restore receipts, stage/rollback root journal and FD200 original lock; 15-minute UNKNOWN-only root status timer. 17 local adversarial tests PASS. Independent B/C/E/F approval REQUIRED. F root_phase.issue currently audits BEFORE inherited FD200; cannot integrate until F refactors under protected lease. Current W1 GET/prewarm reaches finance writer; must HOLD. No actual signed producers, current mount capacity policy, 6/6 physical restores, approved root install or live stage/activation. Please do not merge or authorize production from this PR."
    })
    return {"status": "DRAFT_REVIEW_PR_CREATED_NOT_APPROVED", "url": result["html_url"],
            "head_sha": commit_sha, "base_sha": BASE_SHA}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bundle", required=True, type=__import__("pathlib").Path)
    p.add_argument("--expected-sha256", required=True)
    args = p.parse_args()
    if (platform.system(), platform.machine()) != ("Darwin", "arm64"):
        raise Hold("WRONG_OWNER_M1_HOST")
    if not args.bundle.is_file() or args.bundle.is_symlink():
        raise Hold("BUNDLE_MISSING_OR_SYMLINK")
    if len(args.expected_sha256) != 64:
        raise Hold("UNPINNED_BUNDLE_DIGEST")
    files = read_bundle(args.bundle, args.expected_sha256)
    print(json.dumps(publish(files), sort_keys=True))

if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, UnicodeError, ValueError, KeyError, subprocess.TimeoutExpired) as exc:
        print("HOLD:", str(exc) if isinstance(exc, Hold) else type(exc).__name__, file=sys.stderr)
        sys.exit(2)
