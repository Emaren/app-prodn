#!/usr/bin/env python3
"""Read-only GitHub Actions CI evidence -> tiny private candidate feed.
Never treats GitHub CI as independently signed production certification.
No website/network mutation. Only replaces this service-owned feed JSON.
"""
import argparse
import hashlib
import io
import json
import os
import re
import stat
import sys
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

API = "https://api.github.com/repos/Emaren/app-prodn"
WORKFLOW = "renaissance-88-factory.yml"
MAX_ARCHIVE = 150 * 1024 * 1024
MAX_JSON = 2 * 1024 * 1024
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
BUILD = re.compile(r"^[A-Za-z0-9_-]{5,128}$")
STATES = ("PASS", "FAIL", "UNKNOWN", "UNMEASURED")


def stop(why):
    raise ValueError("KINGDOM LIVE COLLECTOR HOLD: " + why)


class NarrowRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        parsed = urlparse(url)
        if parsed.scheme != "https":
            stop("Refuse non-HTTPS redirect")
        new = super().redirect_request(req, fp, code, msg, headers, url)
        if parsed.hostname != urlparse(req.full_url).hostname:
            new.remove_header("Authorization")
        return new


def client():
    return urllib.request.build_opener(NarrowRedirect)


def headers():
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    result = {"User-Agent": "aoe2war-candidate-feed-1",
              "Accept": "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        result["Authorization"] = "Bearer " + token
    return result


def get_json(opener, url):
    if not url.startswith(API + "/"):
        stop("Only fixed app-prodn GitHub API paths allowed")
    request = urllib.request.Request(url, headers=headers())
    with opener.open(request, timeout=15) as response:
        raw = response.read(MAX_JSON + 1)
    if len(raw) > MAX_JSON:
        stop("Oversized metadata response")
    return json.loads(raw)


def get_zip(opener, url):
    if not url.startswith(API + "/"):
        stop("Only fixed GitHub artifact download API allowed")
    payload = io.BytesIO()
    size = 0
    request = urllib.request.Request(url, headers=headers())
    with opener.open(request, timeout=25) as response:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_ARCHIVE:
                stop("Excessive Chrome evidence artifact")
            payload.write(chunk)
    return payload.getvalue()


def extract_coverage(archive):
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        entries = z.infolist()
        if not 2 <= len(entries) <= 600:
            stop("Unbounded/empty archive")
        match = [i for i in entries if i.filename.endswith("/coverage.json")
                 or i.filename == "coverage.json"]
        if len(match) != 1 or match[0].file_size > MAX_JSON:
            stop("Missing/duplicate/oversized original coverage")
        raw = z.read(match[0])
        coverage = json.loads(raw)
        axe = None
        measured = set()
        affected = set()
        original = coverage.get("route_digest_sha256")
        if not isinstance(original, dict) or len(original) != coverage.get("routes_observed"):
            stop("Original route digest index inconsistent")
        observed_raw = set()
        for entry in entries:
            if not re.search(r"(^|/)route-[A-Za-z0-9_-]+\.json$", entry.filename):
                continue
            if entry.file_size > 600000:
                stop("Oversized route evidence receipt")
            bytes_row = z.read(entry)
            data = json.loads(bytes_row)
            if not isinstance(data, dict) or not isinstance(data.get("route"), str):
                stop("Unrecognized route evidence")
            route = data["route"]
            if route in observed_raw or route not in original or not SHA256.fullmatch(original[route]):
                stop("Duplicate or unindexed original route receipt")
            if (hashlib.sha256(bytes_row).hexdigest() != original[route] or
                    data.get("source_sha") != coverage.get("source_sha") or
                    data.get("build_id") != coverage.get("build_id") or
                    data.get("certified") is True or data.get("quality_score") is not None):
                stop("Route receipt SHA or source identity disagrees with manifest")
            if data.get("status") != next((r.get("status") for r in coverage.get("routes", []) if r.get("route")==route), None):
                stop("Route receipt status disagrees with coverage")
            observed_raw.add(route)
            views = data.get("views")
            if not isinstance(views, list):
                stop("Missing viewport evidence")
            scans = [v.get("accessibilityScan", {}) for v in views if isinstance(v, dict)]
            if len(scans) >= 2 and all(a.get("status") == "MEASURED" for a in scans):
                measured.add(data["route"])
                if any(a.get("seriousOrCritical", 0) > 0 for a in scans):
                    affected.add(data["route"])
        if observed_raw != set(original):
            stop("Missing original route receipt, cannot trust aggregate")
        if measured:
            axe = {"scannedRoutes": len(measured), "affectedRoutes": len(affected)}
        return coverage, hashlib.sha256(raw).hexdigest(), axe


def normalize(coverage, run, archive_digest, coverage_digest, axe):
    if (not isinstance(coverage, dict) or
            coverage.get("schema") != "aoe2war.renaissance.public88.candidate-coverage.v1" or
            coverage.get("candidate_only") is not True or
            coverage.get("certified") is not False or coverage.get("score") is not None or
            coverage.get("production_release_authority") != "NOT_PROVIDED"):
        stop("Untrusted candidate coverage schema/authority")
    if run.get("conclusion") != "success" or run.get("status") != "completed":
        stop("CI run not successfully completed")
    run_id = run.get("id")
    source = coverage.get("source_sha")
    build = coverage.get("build_id")
    if (type(run_id) is not int or run_id < 1 or
            not isinstance(source, str) or not SHA40.fullmatch(source) or
            run.get("head_sha") != source or
            not isinstance(build, str) or not BUILD.fullmatch(build)):
        stop("Source/build/run SHA identity mismatch")
    routes = coverage.get("routes")
    if not isinstance(routes, list) or len(routes) != 88:
        stop("Missing exact 88-route observations")
    statuses = {}
    counts = dict.fromkeys(STATES, 0)
    for item in routes:
        if (not isinstance(item, dict) or not isinstance(item.get("route"), str) or
                not item["route"].startswith("/") or
                item["route"] in statuses or item.get("status") not in STATES or
                item.get("score") is not None or item.get("certified") is not False):
            stop("Invalid or duplicate route observation")
        statuses[item["route"]] = item["status"]
        counts[item["status"]] += 1
    if counts != coverage.get("statuses"):
        stop("Route counts contradict candidate manifest")
    stamp = run.get("updated_at")
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if parsed.utcoffset() is None or (parsed - datetime.now(timezone.utc)).total_seconds() > 120:
            stop("Invalid or future CI completion time")
    except (TypeError, AttributeError, ValueError):
        stop("Missing reliable CI run completion timestamp")
    return {
        "schema": 1, "kind": "aoe2war.kingdom-index.candidate-browser-feed.v1",
        "authority": "CI_CANDIDATE_ONLY", "certified": False, "score": None,
        "runId": run_id,
        "runUrl": "https://github.com/Emaren/app-prodn/actions/runs/" + str(run_id),
        "sourceSha": source, "buildId": build,
        "observedAt": parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "artifactSha256": archive_digest, "coverageSha256": coverage_digest,
        "counts": counts, "routes": statuses, "accessibility": axe
    }


def safe_output(path):
    target = Path(path)
    if not target.is_absolute():
        stop("Require absolute approved private path")
    folder = target.parent
    st = folder.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
        stop("Feed parent must be current-UID-owned 0700 directory")
    if target.exists() or target.is_symlink():
        st = target.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            stop("Existing feed is not an owner-private regular file")
    return target


def write_atomic(target, obj):
    target = safe_output(target)
    previous = None
    if target.exists():
        try:
            previous = json.loads(target.read_text("utf8"))
        except (ValueError, OSError, UnicodeError):
            stop("Existing feed unreadable, refuse overwrite")
    if previous:
        if previous.get("runId") > obj["runId"]:
            stop("Refuse older CI evidence over newer captured run")
        if (previous.get("runId") == obj["runId"] and
                previous.get("artifactSha256") == obj["artifactSha256"]):
            return "UNCHANGED"
    encoded = (json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(encoded) > 48000:
        stop("Unbounded public feed")
    fd, temporary = tempfile.mkstemp(prefix=".candidate-", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        dirfd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dirfd)
        finally:
            os.close(dirfd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return "UPDATED"


def collect(output):
    opener = client()
    runs = get_json(opener, API + "/actions/workflows/" + WORKFLOW +
                    "/runs?status=completed&per_page=30").get("workflow_runs", [])
    runs = [r for r in runs if r.get("conclusion") == "success" and
            r.get("repository", {}).get("full_name") == "Emaren/app-prodn"]
    if not runs:
        stop("No completed successful 88-route CI run available")
    runs.sort(key=lambda r: r["id"], reverse=True)
    run = runs[0]
    listing = get_json(opener, API + "/actions/runs/" + str(run["id"]) + "/artifacts")
    artifacts = [a for a in listing.get("artifacts", []) if
                 a.get("name", "").startswith("renaissance-88-chrome-" + str(run["id"]) + "-")
                 and not a.get("expired")]
    if len(artifacts) != 1:
        stop("No unique unexpired original Chrome artifact")
    artifact = artifacts[0]
    digest = artifact.get("digest")
    if not isinstance(digest, str) or not digest.startswith("sha256:") or not SHA256.fullmatch(digest[7:]):
        stop("GitHub artifact has no verifiable SHA-256")
    target = safe_output(output)
    if target.exists():
        try:
            prior = json.loads(target.read_text("utf8"))
            if (prior.get("runId") == run["id"] and
                    prior.get("artifactSha256") == digest[7:]):
                return "UNCHANGED"
        except (ValueError, OSError, UnicodeError):
            stop("Existing feed unreadable")
    raw = get_zip(opener, API + "/actions/artifacts/" + str(artifact["id"]) + "/zip")
    if hashlib.sha256(raw).hexdigest() != digest[7:]:
        stop("Actual downloaded archive SHA-256 mismatch")
    coverage, coverage_digest, axe = extract_coverage(raw)
    row = normalize(coverage, run, digest[7:], coverage_digest, axe)
    return write_atomic(output, row)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, help="Absolute service-owned 0700 directory file")
    args = parser.parse_args()
    try:
        result = collect(args.output)
    except Exception as err:
        print("KINGDOM LIVE COLLECTOR HOLD: " + str(err), file=sys.stderr)
        return 2
    print("KINGDOM LIVE CANDIDATE: " + result + " (not a certified score)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
