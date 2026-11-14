#!/usr/bin/env python3
"""Thin B-owner coordinator around the installed source-pinned V3 release family."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request

import aoe2_product_release_ledger as ledger
import aoe2_product_release_transport as transport

CONTROLLER = "/root/aoe2war_product_release_controller_v3.py"
PREPARE = "/root/aoe2war_prepare_product_manifest_v2.py"
CONTROLLER_SHA = "771ebd5bc1164f75f4466cdc0a05a608ffc25671fccb12e05ebf321c56e30452"
PREPARE_SHA = "17f2ee180d69fae4f4b4c7e01f282e6e11db87a0c2d74a129d2eb7d63fbb6d20"
INSPECTOR = "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py"
INSPECTOR_SHA = "2695a5b5fb4adf9e17afbb30c535158260608b8ba60e13fea4b2e4da29e974ca"
SSH = ["/usr/bin/ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8"]
# Public HTTPS blocks the Python-urllib default UA. This observer is read-only.
PUBLIC_OBSERVER_UA = "Mozilla/5.0 (compatible; AoE2WAR-Release-Observer/1.0)"
# Only exact known optional/manual/preview checks may be SKIPPED. Required
# checks, other skipped checks, failures, missing or incomplete checks HOLD.
# The two Chromium jobs are conditional *candidate previews*, not the required
# full App CI or source-bound Linux acceptance. Never whitelist their failures.
OPTIONAL_SKIPPED_CHECKS = frozenset({
    "Nightly/manual source-bound Next census",
    "Chromium — six Kingdom instrument pages, isolated exact source",
    "Chromium — exact candidate, no production data or operator mutations",
})
FIELDS = {
    "schema", "sourceSha", "pr", "runId", "artifactId", "artifactBytes",
    "artifactSha256", "proofArtifactId", "proofArtifactBytes",
    "proofArtifactSha256", "proofSha256", "buildId", "expiresAt", "approvedBy",
    "permittedPhases", "requiredChecks", "financialAuthorized",
    "requestStartedAt", "requestClockSource", "requestPrecisionMs",
    "requestUncertaintyMs", "startKind",
}


def need(ok, reason):
    if not ok:
        raise RuntimeError("HOLD_PRODUCT_RELEASE_" + reason)


def load_approval(path, phase, now=None):
    path = Path(path)
    info = transport.checked_file(path)
    need(info.st_size < 16384, "APPROVAL_SIZE")
    value = json.loads(path.read_text())
    need(type(value) is dict and set(value) == FIELDS and
         value["schema"] == "aoe2war.product.owner-approval.v1" and
         value["approvedBy"] == "Emaren" and value["financialAuthorized"] is False,
         "APPROVAL_FIELDS")
    need(type(value["sourceSha"]) is str and
         re.fullmatch("[0-9a-f]{40}", value["sourceSha"]), "APPROVED_SOURCE")
    need(type(value["buildId"]) is str and
         re.fullmatch("[A-Za-z0-9_-]{8,64}", value["buildId"]), "APPROVED_BUILD")
    for key in ("pr", "runId", "artifactId", "artifactBytes",
                "proofArtifactId", "proofArtifactBytes"):
        need(type(value[key]) is int and value[key] > 0, "APPROVED_NUMERIC_ID")
    for key in ("artifactSha256", "proofArtifactSha256", "proofSha256"):
        need(type(value[key]) is str and re.fullmatch("[0-9a-f]{64}", value[key])
             and value[key] != "0" * 64, "APPROVED_DIGEST")
    phases = value["permittedPhases"]
    need(type(phases) is list and set(phases) <= {"plan", "transport", "release"}
         and phase in phases, "PHASE_NOT_APPROVED")
    checks = value["requiredChecks"]
    need(type(checks) is list and 1 <= len(checks) <= 100
         and len(checks) == len(set(checks))
         and all(type(x) is str and 0 < len(x) <= 150 for x in checks),
         "EXPLICIT_REQUIRED_CHECKS")
    current = now or dt.datetime.now(dt.timezone.utc)
    expiry = ledger.stamp(value["expiresAt"])
    need(current < expiry <= current + dt.timedelta(hours=24), "APPROVAL_EXPIRED_OR_UNBOUNDED")
    ledger.stamp(value["requestStartedAt"])
    need(value["requestClockSource"] in ledger.CLOCKS, "REQUEST_CLOCK")
    need(value["startKind"] in ("observed-engineering", "declared-request", "unknown"),
         "REQUEST_START_KIND")
    ledger.clean_evidence({
        "precisionMs": value["requestPrecisionMs"],
        "uncertaintyMs": value["requestUncertaintyMs"],
    })
    return value




FAILURE_LOG_LIMIT = 1024 * 1024

def private_failure_log(raw):
    """Bound stored logs and omit receipt bodies, credentials and URLs.

    Custody: existing B-owner 0700 release directory, individual 0600 files.
    These diagnostics are never Factory/public evidence or receipt storage.
    The diagnostic metadata retains the exact hash of all captured bytes;
    stored text may be truncated, redacted, or omitted as explicitly recorded.
    """
    limited = raw[:FAILURE_LOG_LIMIT]
    receipt = re.search(
        rb"aoe2war\.product\.(?:release-|public-identity-witness|"
        rb"github-qualification|pr-provenance|owner-approval|web-release-manifest)"
        rb'|"active_unit_sha256"|"active_runtime"',
        raw,
    )
    if receipt:
        stored = b"[Protected PRODUCT receipt/journal body omitted; inspect its original evidence and diagnostic digest.]\n"
        content_state = "receipt-omitted"
    else:
        stored = re.sub(
            rb"(?im)^.*(?:authorization|set-cookie|cookies?|bearer\s+\S+|"
            rb"gh[pousr]_[A-Za-z0-9_]*|github_pat_[A-Za-z0-9_]*|"
            rb"(?:password|secret|token|api[_-]?key|database_url)\s*[\"']?\s*[:=]).*$",
            b"[Credential-bearing line redacted]",
            limited,
        )
        stored = re.sub(
            rb"https?://[^\s<>\"']+",
            b"[URL redacted]",
            stored,
            flags=re.IGNORECASE,
        )
        stored = re.sub(
            rb"https?:\\/\\/[^\s<>\"']+",
            b"[URL redacted]",
            stored,
            flags=re.IGNORECASE,
        )
        content_state = "redacted" if stored != limited else "as-captured"
        stored = stored[:FAILURE_LOG_LIMIT]
    return stored, {
        "captureState": "full" if len(raw) <= FAILURE_LOG_LIMIT else "truncated",
        "contentState": content_state,
        "storedBytes": len(stored),
        "storedSha256": hashlib.sha256(stored).hexdigest(),
    }


def command(parts, timeout=60, data=None):
    try:
        result = subprocess.run(parts, input=data, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        result = None
        stdout, stderr = error.stdout or b"", error.stderr or b""
        code = "HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_" + Path(parts[0]).name.upper()
    else:
        if result.returncode == 0:
            return result.stdout.decode()
        stdout, stderr = result.stdout, result.stderr
        matches = re.findall(rb"HOLD_PRODUCT_[A-Z0-9_]{1,120}", stdout + b"\n" + stderr)
        code = matches[-1].decode() if matches else (
            "HOLD_PRODUCT_RELEASE_COMMAND_FAILED_" + Path(parts[0]).name.upper()
        )
    reference = None
    if DIAGNOSTIC_DIR is not None:
        # Existing restricted B custody only. Never print output/arguments or
        # publish these logs; protected receipts retain their original custody.
        stem = "command-failure-" + str(time.monotonic_ns())
        name = stem + ".json"
        report = {
            "schema": "aoe2war.product.command-failure.v1",
            "observedAt": ledger.utcnow(), "predicate": code,
            "executable": Path(parts[0]).name,
            "returnCode": result.returncode if result is not None else None,
            "stdoutBytes": len(stdout), "stderrBytes": len(stderr),
            "stdoutSha256": hashlib.sha256(stdout).hexdigest(),
            "stderrSha256": hashlib.sha256(stderr).hexdigest(),
            "custody": "restricted-B-owner-private-not-public",
            "storedLimitBytesPerStream": FAILURE_LOG_LIMIT,
            "redactionPolicy": "receipt-bodies-credential-lines-and-urls-v1",
        }
        try:
            for label, raw in (("stdout", stdout), ("stderr", stderr)):
                stored, details = private_failure_log(raw)
                relative = stem + "." + label + ".log"
                seal_once(Path(DIAGNOSTIC_DIR) / relative, stored)
                report[label + "Log"] = relative
                report[label + "Capture"] = details
            seal_once(Path(DIAGNOSTIC_DIR) / name,
                      (json.dumps(report, sort_keys=True, indent=2) + "\n").encode())
            reference = name
        except Exception:
            # Logging failure must not conceal or replace the original HOLD.
            pass
    raise RuntimeError(code + (" DIAGNOSTIC=" + reference if reference else ""))


def gh_json(endpoint):
    return json.loads(command([transport.GH, "api", endpoint], timeout=50))


def qualify(approval, fetch=gh_json):
    source = approval["sourceSha"]
    base = "repos/Emaren/app-prodn/"
    pr = fetch(base + "pulls/" + str(approval["pr"]))
    need(pr["head"]["sha"] == source and pr["base"]["ref"] == "main"
         and pr["base"]["repo"]["full_name"] == "Emaren/app-prodn"
         and pr["head"]["repo"]["full_name"] == "Emaren/app-prodn",
         "PR_SOURCE_OR_REPOSITORY_MISMATCH")
    ancestry = canonical_main_ancestry(source, fetch)
    run = fetch(base + "actions/runs/" + str(approval["runId"]))
    need(run["head_sha"] == source and run["status"] == "completed"
         and run["conclusion"] == "success"
         and run["path"] == ".github/workflows/r25-b-source-pinned-linux-release-build-v2.yml",
         "LINUX_WORKFLOW_NOT_EXACT_SUCCESS")
    checks = fetch(base + "commits/" + source + "/check-runs?per_page=100")
    observed = checks["check_runs"]
    need(0 < checks["total_count"] <= 100 and
         type(observed) is list and len(observed) == checks["total_count"],
         "CHECK_CENSUS_UNBOUNDED_OR_INCOMPLETE")
    latest = {}
    for item in observed:
        need(type(item.get("name")) is str and
             type(item.get("id")) is int and item["id"] > 0,
             "CHECK_IDENTITY")
        if item["name"] not in latest or item["id"] > latest[item["name"]]["id"]:
            latest[item["name"]] = item
    need(set(approval["requiredChecks"]) <= set(latest), "REQUIRED_CHECK_MISSING")
    need(all(item["status"] == "completed" and
             (item["conclusion"] == "success" or
              (item["name"] in OPTIONAL_SKIPPED_CHECKS and
               item["name"] not in approval["requiredChecks"] and
               item["conclusion"] == "skipped"))
             for item in observed), "CI_OR_SECURITY_NOT_COMPLETE")
    need(all(latest[name]["status"] == "completed" and
             latest[name]["conclusion"] == "success"
             for name in approval["requiredChecks"]), "REQUIRED_CHECK_NOT_SUCCESS")
    for prefix in ("artifact", "proofArtifact"):
        item = fetch(base + "actions/artifacts/" + str(approval[prefix + "Id"]))
        need(item["id"] == approval[prefix + "Id"] and not item["expired"]
             and item["size_in_bytes"] == approval[prefix + "Bytes"]
             and item.get("digest") == "sha256:" + approval[prefix + "Sha256"]
             and item["workflow_run"]["id"] == approval["runId"]
             and item["workflow_run"]["head_sha"] == source,
             "ARTIFACT_METADATA_SOURCE_OR_DIGEST")
    qualified = {
        **ancestry,
        "schema": "aoe2war.product.github-qualification.v1",
        "sourceSha": source, "buildId": approval["buildId"],
        "pr": approval["pr"], "prUrl": pr["html_url"],
        "prCreatedAt": pr["created_at"], "prHeadSha": pr["head"]["sha"],
        "runId": run["id"], "runHeadSha": run["head_sha"],
        "workflowPath": run["path"], "runConclusion": run["conclusion"],
        "requiredChecks": sorted(approval["requiredChecks"]),
        "latestChecks": [{"id": item["id"], "name": name,
                           "status": item["status"], "conclusion": item["conclusion"]}
                          for name, item in sorted(latest.items())],
        # Full raw check evidence prevents a later green duplicate name
        # from concealing an older FAILED run.
        "allChecks": [
            {"id": item["id"], "name": item["name"],
             "status": item["status"], "conclusion": item["conclusion"]}
            for item in sorted(observed, key=lambda x: x["id"])
        ],
    }
    return pr, run, qualified


def ssh(command_text, root=False, data=None, timeout=180):
    args = SSH + (["-l", "root"] if root else []) + ["hel1", command_text]
    return command(args, timeout=timeout, data=data)


def root_pins():
    actual = ssh("sha256sum " + CONTROLLER + " " + PREPARE + " " + INSPECTOR,
                 root=True).splitlines()
    need([line.split()[0] for line in actual] ==
         [CONTROLLER_SHA, PREPARE_SHA, INSPECTOR_SHA], "INSTALLED_ROOT_SOURCE_DRIFT")


def event(path, approval, name, state="pass", extra=None, at="NOW"):
    evidence = {"buildId": approval["buildId"], "runId": approval["runId"]}
    evidence.update(extra or {})
    return ledger.append(path, approval["sourceSha"], name, state, evidence,
                         at=at, historical=(at != "NOW"))


def prepare_artifacts(approval, work, log):
    cache = transport.private_dir(work / "cache")
    stage = transport.private_dir(work / approval["sourceSha"][:12])
    event(log, approval, "download", "running",
          {"artifactId": approval["artifactId"], "expectedSha256": approval["artifactSha256"]})
    runtime_zip = transport.download(
        cache, approval["artifactId"], approval["artifactBytes"], approval["artifactSha256"]
    )
    proof_zip = transport.download(
        cache, approval["proofArtifactId"], approval["proofArtifactBytes"],
        approval["proofArtifactSha256"]
    )
    proof_path = transport.member(
        proof_zip, "b-linux-independent-review-v2.json",
        stage / "b-linux-independent-review-v2.json", approval["proofSha256"], limit=16384
    )
    proof = json.loads(proof_path.read_text())
    need(proof.get("source_commit") == approval["sourceSha"] and
         proof.get("build_id") == approval["buildId"] and
         proof.get("run_id") == approval["runId"], "PROOF_SOURCE_MISMATCH")
    archive = transport.member(
        runtime_zip, "runtime.tar.gz", stage / "runtime.tar.gz",
        proof.get("runtime_archive_sha256")
    )
    proof = transport.validate_proof(
        proof_path, approval["sourceSha"], approval["buildId"], approval["runId"], archive
    )
    event(log, approval, "T4", extra={"proofSha256": approval["proofSha256"]})
    return stage, proof


def deliver(approval, stage, proof, log):
    remote = "/home/tony/.aoe2war-b-os-" + approval["sourceSha"][:12] + "-run-" + str(approval["runId"])
    extracted = 0
    with tarfile.open(stage / "runtime.tar.gz", "r:gz") as archive:
        for member in archive:
            extracted += member.size
            need(extracted <= 5 * 1024 ** 3, "EXTRACTION_BUDGET")
    available = int(ssh("df -B1 --output=avail / | tail -1").strip())
    incoming = proof["runtime_archive_bytes"]
    required = max(6 * 1024 ** 3 + incoming, incoming + extracted + 1024 ** 3)
    # An exact existing archive needs no second incoming allocation.
    existing = ssh("if test -f " + remote + "/runtime.tar.gz; then sha256sum " +
                   remote + "/runtime.tar.gz; fi").strip()
    if existing:
        need(existing.split()[0] == proof["runtime_archive_sha256"],
             "REMOTE_EXISTING_RUNTIME_MISMATCH")
        required = max(6 * 1024 ** 3, extracted + 1024 ** 3)
    print(json.dumps({
        "phase": "disk-preflight", "rootFreeBytes": available, "requiredBytes": required,
        "incomingBytes": 0 if existing else incoming, "extractionBytes": extracted,
        "state": "pass" if available >= required else "hold",
    }), flush=True)
    need(available >= required, "ROOT_HEADROOM_INCOMING_AND_EXTRACTION")
    need(ssh(
        "umask 077; mkdir -p -m 700 " + remote + "; test ! -L " + remote +
        "; stat -c '%u:%g:%a' " + remote
    ).strip() == "1000:1000:700", "REMOTE_STAGE_AUTHORITY")
    event(log, approval, "transport", "running")
    started = time.monotonic()
    for name, expected in (
        ("runtime.tar.gz", proof["runtime_archive_sha256"]),
        ("b-linux-independent-review-v2.json", approval["proofSha256"]),
    ):
        target = remote + "/" + name
        prior = ssh("if test -e " + target + "; then stat -c '%u:%a:%h' " +
                    target + "; sha256sum " + target + "; fi").splitlines()
        if prior:
            need(len(prior) == 2 and prior[0] == "1000:600:1"
                 and prior[1].split()[0] == expected, "REMOTE_EXISTING_MEMBER_MISMATCH")
            print(json.dumps({"phase": "host-transport", "file": name, "state": "cached",
                              "expectedSha256": expected, "verification": "pass"}), flush=True)
            continue
        # macOS /usr/bin/rsync is openrsync protocol-29 (2.6.9-compatible).
        # It rejects --chmod=F600,D700; do not assume GNU rsync behavior.
        # Keep strict SSH host keys, resumable partials, and visible progress.
        process = subprocess.run([
            "/usr/bin/rsync", "-t", "--partial-dir=.rsync-partial", "--progress",
            "-e", "/usr/bin/ssh -o BatchMode=yes "
                  "-o StrictHostKeyChecking=yes -o ConnectTimeout=8",
            str(stage / name), "hel1:" + remote + "/",
        ], timeout=1800)
        need(process.returncode == 0, "RSYNC_INTERRUPTED_RESUME_AVAILABLE")
        # The isolated tony-owned 0700 stage already passed its authority
        # check. Post-transfer normalize ONLY this exact file to 0600 after
        # rejecting symlinks, wrong owner, extra hardlinks and wrong bytes.
        observed = ssh(
            "set -e; test ! -L " + target +
            "; test \"$(stat -c '%u:%h' " + target + ")\" = '1000:1'" +
            "; test \"$(sha256sum " + target + " | cut -d ' ' -f1)\" = " + expected +
            "; chmod 600 " + target +
            "; stat -c '%u:%a:%h' " + target + "; sha256sum " + target,
        ).splitlines()
        need(len(observed) == 2 and observed[0] == "1000:600:1"
             and observed[1].split()[0] == expected, "HEL1_MEMBER_VERIFICATION")
    elapsed = round((time.monotonic() - started) * 1000)
    event(log, approval, "T5", extra={
        "proofSha256": proof["runtime_archive_sha256"], "elapsedMs": elapsed,
        "bytes": incoming, "verification": "pass",
    })
    return remote


def public_and_root(source, build):
    runtime = "/var/lib/aoe2war-web-prod-" + source[:12]
    actual = ssh(
        "systemctl show aoe2hdbets-web-prod.service -p WorkingDirectory --value; "
        "printf '%s\\n' $(cat " + runtime + "/.aoe2war-source-sha); "
        "printf '%s\\n' $(cat " + runtime + "/.next/BUILD_ID); "
        "systemctl show aoe2hdbets-web-prod.service -p ActiveState --value; "
        "systemctl show aoe2hdbets-web-prod.service -p NRestarts --value",
        root=True,
    ).splitlines()
    need(actual == [runtime, source, build, "active", "0"], "ACTIVE_SOURCE_BUILD_OR_SERVICE")
    observed_routes = []
    for route in ("/factory", "/wolo"):
        request = urllib.request.Request(
            "https://aoe2war.com" + route + "?product_release_probe=" + source[:12],
            headers={"Cache-Control": "no-cache", "User-Agent": PUBLIC_OBSERVER_UA},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(4 * 1024 * 1024)
            response_source = response.headers.get("X-AoE2WAR-Source")
            response_build = response.headers.get("X-AoE2WAR-Build-ID")
            need(response.status == 200 and response_source == source and
                 response_build == build and build.encode() in body,
                 "PUBLIC_HTTPS_SOURCE_AND_BUILD")
            observed_routes.append({
                "route": route, "status": response.status,
                "sourceSha": response_source, "buildId": response_build,
                "bodySha256": hashlib.sha256(body).hexdigest(),
            })
    request = urllib.request.Request("https://aoe2war.com/api/bets",
                                     headers={"Cache-Control": "no-cache",
                                              "User-Agent": PUBLIC_OBSERVER_UA})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            status = response.status
    except Exception as error:
        status = getattr(error, "code", None)
    need(status == 503, "FINANCIAL_HTTP_DENIAL")
    return {
        "schema": "aoe2war.product.public-identity-witness.v1",
        "sourceSha": source, "buildId": build,
        "observedAt": ledger.utcnow(), "routes": observed_routes,
        "activeWeb": True, "restarts": 0,
        "financialHttpStatus": status, "financialAuthorized": False,
    }


def stage_witness(work, event_id, source, build):
    need(event_id in ("T7", "T8", "T9"), "WITNESS_EVENT")
    # Recheck current root and public source/build, even when resuming.
    observation = public_and_root(source, build)
    need(observation.get("schema") == "aoe2war.product.public-identity-witness.v1"
         and observation.get("sourceSha") == source
         and observation.get("buildId") == build
         and observation.get("financialAuthorized") is False
         and observation.get("financialHttpStatus") == 503,
         "WITNESS_RESUME_IDENTITY")
    path = work / ("public-evidence-" + event_id + "-v1.json")
    if path.exists():
        transport.checked_file(path)
        old = json.loads(path.read_bytes())
        need(old.get("schema") == observation["schema"] and
             old.get("sourceSha") == source and old.get("buildId") == build and
             old.get("financialHttpStatus") == 503 and
             old.get("financialAuthorized") is False,
             "WITNESS_RESUME_IDENTITY")
        return hashlib.sha256(path.read_bytes()).hexdigest()
    raw = (json.dumps(observation, sort_keys=True, indent=2) + "\n").encode()
    seal_once(path, raw)
    return hashlib.sha256(raw).hexdigest()


def controller(action, manifest):
    need(action in ("stage", "activate", "rollback", "reactivate", "status"),
         "CONTROLLER_ACTION")
    root_pins()
    started = time.monotonic()
    print(json.dumps({"phase": action, "state": "running",
                      "controllerSha256": CONTROLLER_SHA}), flush=True)
    ssh("python3 -I -B " + CONTROLLER + " " + action + " --manifest " + manifest,
        root=True)
    print(json.dumps({"phase": action, "state": "pass",
                      "elapsedMs": round((time.monotonic() - started) * 1000)}), flush=True)



def seal_once(path, raw):
    path = Path(path)
    need(path.parent.is_dir() and not path.parent.is_symlink(), "LOCAL_RECEIPT_PARENT")
    if path.exists():
        transport.checked_file(path)
        need(path.read_bytes() == raw, "LOCAL_RECEIPT_COLLISION")
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:])
            need(written > 0, "RECEIPT_SHORT_WRITE")
            offset += written
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)



def root_receipt(path, raw, verify_only=False):
    source12, name = receipt_location(path)
    digest = hashlib.sha256(raw).hexdigest()
    mode = "verify" if verify_only else "write"
    text = (
        "python3 -I -B -c " + shlex.quote(ROOT_RECEIPT_CODE) + " " +
        " ".join(shlex.quote(value) for value in (mode, source12, name, digest))
    )
    result = json.loads(ssh(text, root=True, data=raw if not verify_only else None))
    need(result.get("status") == "PASS_ROOT_PRODUCT_RECEIPT"
         and result.get("sourceSha", "")[:12] == source12
         and result.get("name") == name and result.get("sha256") == digest
         and result.get("bytes") == len(raw) and result.get("mode") == mode,
         "ROOT_RECEIPT_READBACK")


def release(approval, remote, proof, log, work):
    root_pins()
    source = approval["sourceSha"]
    already_sealed = any(row["event"] == "T10" and row["state"] == "pass"
                         for row in ledger.read(log, source))
    if not already_sealed:
        canonical_main_ancestry(source)
    manifest = "/root/aoe2war-product-release-manifests/" + source[:12] + "-run-" + str(approval["runId"]) + ".json"
    existing = ssh("if test -f " + manifest + "; then cat " + manifest + "; fi", root=True)
    if not existing:
        ssh("python3 -I -B " + PREPARE + " --proof " +
            remote + "/b-linux-independent-review-v2.json", root=True)
        existing = ssh("cat " + manifest, root=True)
    selected = json.loads(existing)
    need(selected["source"] == source and selected["build"] == approval["buildId"]
         and selected["github_run_id"] == approval["runId"]
         and selected["archive_path"] == remote + "/runtime.tar.gz"
         and selected["archive_sha256"] == proof["runtime_archive_sha256"]
         and selected["independent_proof_sha256"] == approval["proofSha256"]
         and selected["financial_authorized"] is False, "ROOT_MANIFEST_IDENTITY")
    journal = "/var/lib/aoe2war-product-release-v1/" + source[:12]
    raw_state = ssh("if test -f " + journal + "/state.json; then cat " +
                    journal + "/state.json; fi", root=True)
    phase = json.loads(raw_state)["phase"] if raw_state else None
    need(phase in (None, "prepared", "live", "rolled_back"),
         "CONTROLLER_INTERRUPTED_REQUIRES_REVIEWED_RECOVERY")
    accepted = {x["event"] for x in ledger.read(log, source) if x["state"] == "pass"}
    if "T10" in accepted:
        public_and_root(source, approval["buildId"])
        root_pins()
        seal_acceptance(approval, log, work, journal)
        print("PASS_ALREADY_SEALED_EXACT_SOURCE_ROOT_RECEIPT_CHECKED")
        return
    if phase is None:
        approved_controller("stage", manifest, approval)
        phase = "prepared"
    if "T6" not in accepted:
        event(log, approval, "T6", extra={"proofSha256": hashlib.sha256(existing.encode()).hexdigest()})
    if phase == "prepared":
        approved_controller("activate", manifest, approval)
        phase = "live"
    if phase == "live" and "T7" not in accepted:
        digest = stage_witness(work, "T7", source, approval["buildId"])
        event(log, approval, "T7", extra={"proofSha256": digest})
    if phase == "live" and "T9" not in accepted:
        event(log, approval, "rollback", "running")
        approved_controller("rollback", manifest, approval)
        phase = "rolled_back"
    if phase == "rolled_back":
        digest = stage_witness(work, "T8",
                               selected["previous_source"], selected["previous_build"])
        if "T8" not in accepted:
            event(log, approval, "T8", extra={"proofSha256": digest})
        event(log, approval, "reactivate", "running")
        approved_controller("reactivate", manifest, approval)
    digest = stage_witness(work, "T9", source, approval["buildId"])
    if "T9" not in accepted:
        event(log, approval, "T9", extra={"proofSha256": digest})
    root_pins()
    # Existing source-pinned observer validates protected processes and finance denial.
    ssh("python3 -I -B " + INSPECTOR + " --phase inspect", root=True)
    approved_controller("status", manifest, approval)
    before = hashlib.sha256(log.read_bytes()).hexdigest()
    event(log, approval, "T10", extra={"proofSha256": before})
    seal_acceptance(approval, log, work, journal)


def seal_acceptance(approval, log, work, journal):
    """Finish/repair a local T10 seal, including missing exact root copies."""
    source = approval["sourceSha"]
    build = approval["buildId"]
    events = ledger.read(log, source)
    need(any(row["event"] == "T10" and row["state"] == "pass" for row in events),
         "FINAL_ACCEPTANCE_EVENT_MISSING")
    events_raw = log.read_bytes()
    summary_path = work / "release-summary-v1.json"
    if summary_path.exists():
        transport.checked_file(summary_path)
        summary_raw = summary_path.read_bytes()
        summary = json.loads(summary_raw)
        need(summary.get("schema") == "aoe2war.product.release-summary.v1" and
             summary.get("sourceSha") == source and summary.get("buildId") == build,
             "LOCAL_SUMMARY_IDENTITY")
    else:
        summary = ledger.summary(events, build)
        summary_raw = (json.dumps(summary, sort_keys=True, indent=2) + "\n").encode()
        seal_once(summary_path, summary_raw)
    receipt = {
        "schema": "aoe2war.product.release-seal.v1",
        "sourceSha": source, "buildId": build,
        "ledgerSha256": hashlib.sha256(events_raw).hexdigest(),
        "summarySha256": hashlib.sha256(summary_raw).hexdigest(),
        "lastEventHash": events[-1]["eventHash"],
        "financialAuthorized": False,
    }
    receipt_raw = (json.dumps(receipt, sort_keys=True, indent=2) + "\n").encode()
    seal_once(work / "release-events-v1.jsonl", events_raw)
    seal_once(work / "release-seal-v1.json", receipt_raw)
    # Every green milestone must have an inspectable private receipt.
    for name in ("public-evidence-T7-v1.json", "public-evidence-T8-v1.json",
                 "public-evidence-T9-v1.json", "source-qualification-v1.json",
                 "pr-provenance-v1.json"):
        path = work / name
        need(path.is_file(), "REQUIRED_WITNESS_MISSING")
        transport.checked_file(path)
    acceptance_payloads(approval, log, work)
    # Repeated exact bytes are idempotent; different bytes HOLD at root.
    for name in ("release-events-v1.jsonl", "release-summary-v1.json",
                 "release-seal-v1.json", "public-evidence-T7-v1.json",
                 "public-evidence-T8-v1.json", "public-evidence-T9-v1.json",
                 "source-qualification-v1.json", "pr-provenance-v1.json"):
        path = work / name
        root_receipt(journal + "/" + name, path.read_bytes())
    print(json.dumps({
        "state": "pass", "sourceSha": source, "buildId": build,
        "receipt": receipt,
        "firstVerifiedProductionMs": summary.get("firstVerifiedProductionMs"),
        "finalAcceptedMs": summary.get("finalAcceptedMs"),
    }), flush=True)



# FACTORY_FINAL_CERTIFICATION_V1
DIAGNOSTIC_DIR = None
RECEIPT_NAMES = (
    "release-events-v1.jsonl", "release-summary-v1.json", "release-seal-v1.json",
    "public-evidence-T7-v1.json", "public-evidence-T8-v1.json",
    "public-evidence-T9-v1.json", "source-qualification-v1.json",
    "pr-provenance-v1.json",
)

# This literal executes through the already-authorized owner-root SSH channel.
# It accepts only one existing PRODUCT journal and eight exact receipt names.
# It never loads code from the website or accepts a command/path from JSON.
ROOT_RECEIPT_CODE = r"""
import fcntl, hashlib, json, os, re, stat, subprocess, sys
from pathlib import Path

OWNER_UID = 0
BASE = Path("/var/lib/aoe2war-product-release-v1")
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
LOCK = Path("/run/lock/aoe2war-product-release-v1.lock")
NAMES = {
    "release-events-v1.jsonl", "release-summary-v1.json", "release-seal-v1.json",
    "public-evidence-T7-v1.json", "public-evidence-T8-v1.json",
    "public-evidence-T9-v1.json", "source-qualification-v1.json",
    "pr-provenance-v1.json",
}

def need(ok, reason):
    if not ok:
        raise RuntimeError("HOLD_PRODUCT_RECEIPT_" + reason)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def trusted(path, mode=None, directory=False):
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == OWNER_UID, "OWNER_OR_SYMLINK")
    need(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode),
         "INODE_TYPE")
    need(not stat.S_IMODE(info.st_mode) & 0o022, "WRITABLE_AUTHORITY")
    if mode is not None:
        need(stat.S_IMODE(info.st_mode) == mode, "MODE")
    if not directory:
        need(info.st_nlink == 1, "HARDLINK")
    return info

def contents(name, directory_fd, expected):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == OWNER_UID
             and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600,
             "FILE_AUTHORITY")
        need(info.st_size <= 8 * 1024 * 1024, "FILE_SIZE")
        blocks = []
        while True:
            part = os.read(fd, 65536)
            if not part:
                break
            blocks.append(part)
        raw = b"".join(blocks)
        need(digest(raw) == expected, "IMMUTABLE_DIGEST_COLLISION")
        return raw
    finally:
        os.close(fd)

def bound_body(name, raw, state, journal):
    if name.endswith(".jsonl"):
        rows = [json.loads(line) for line in raw.splitlines()]
        need(rows and all(row.get("sourceSha") == state["source"] for row in rows),
             "LEDGER_SOURCE")
        return
    body = json.loads(raw)
    expected_source, expected_build = state["source"], state["build"]
    if name == "public-evidence-T8-v1.json":
        original = journal / "original-web-unit.service"
        trusted(original, 0o600)
        match = re.search(
            r"(?m)^WorkingDirectory=(/var/lib/aoe2war-web-prod-[0-9a-f]{12})$",
            original.read_text(),
        )
        need(match is not None, "PREVIOUS_UNIT")
        previous = Path(match.group(1))
        trusted(previous, directory=True)
        for marker in (previous / ".aoe2war-source-sha", previous / ".next/BUILD_ID"):
            trusted(marker)
        expected_source = (previous / ".aoe2war-source-sha").read_text().strip()
        expected_build = (previous / ".next/BUILD_ID").read_text().strip()
    need(body.get("sourceSha") == expected_source, "BODY_SOURCE")
    if name.startswith("public-evidence-") or name in (
        "release-summary-v1.json", "release-seal-v1.json", "source-qualification-v1.json"
    ):
        need(body.get("buildId") == expected_build, "BODY_BUILD")

lock_fd = directory_fd = None
try:
    need(os.geteuid() == OWNER_UID, "ROOT_OWNER_REQUIRED")
    mode, source12, name, expected = sys.argv[1:]
    need(mode in ("write", "verify") and name in NAMES
         and re.fullmatch("[0-9a-f]{12}", source12)
         and re.fullmatch("[0-9a-f]{64}", expected), "ARGUMENT_SCOPE")
    trusted(BASE, directory=True)
    journal = BASE / source12
    trusted(journal, 0o700, directory=True)
    trusted(LOCK, 0o600)
    lock_fd = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW)
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    state_file = journal / "state.json"
    trusted(state_file, 0o600)
    state = json.loads(state_file.read_bytes())
    need(state.get("phase") == "live"
         and re.fullmatch("[0-9a-f]{40}", state.get("source", ""))
         and state["source"][:12] == source12, "JOURNAL_SOURCE_OR_PHASE")
    trusted(UNIT)
    need(digest(UNIT.read_bytes()) == state.get("active_unit_sha256"), "ACTIVE_UNIT")
    runtime = "/var/lib/aoe2war-web-prod-" + source12
    active = subprocess.check_output([
        "systemctl", "show", "aoe2hdbets-web-prod.service",
        "-p", "WorkingDirectory", "--value"
    ], timeout=10).decode().strip()
    need(active == runtime == state.get("active_runtime"), "ACTIVE_RUNTIME")
    directory_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    temporary = ".receipt-" + name + "-" + expected + ".tmp"
    final_path, temporary_path = journal / name, journal / temporary
    if mode == "write":
        raw = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
        need(raw and len(raw) <= 8 * 1024 * 1024 and digest(raw) == expected,
             "INPUT_DIGEST_OR_SIZE")
        bound_body(name, raw, state, journal)
        # Recover only our exact interrupted atomic-link transition.
        if final_path.exists() and temporary_path.exists():
            a, b = final_path.lstat(), temporary_path.lstat()
            if (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino):
                need(a.st_uid == OWNER_UID and a.st_nlink == 2
                     and stat.S_ISREG(a.st_mode) and stat.S_IMODE(a.st_mode) == 0o600
                     and not final_path.is_symlink() and not temporary_path.is_symlink()
                     and digest(final_path.read_bytes()) == expected,
                     "INTERRUPTED_LINK_AUTHORITY")
                os.unlink(temporary, dir_fd=directory_fd)
                os.fsync(directory_fd)
        if not final_path.exists():
            try:
                fd = os.open(
                    temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600, dir_fd=directory_fd
                )
            except FileExistsError:
                # Complete temp files can resume; incomplete temp evidence HOLDS.
                contents(temporary, directory_fd, expected)
            else:
                try:
                    offset = 0
                    while offset < len(raw):
                        written = os.write(fd, raw[offset:])
                        need(written > 0, "SHORT_WRITE")
                        offset += written
                    os.fsync(fd)
                finally:
                    os.close(fd)
            os.link(
                temporary, name, src_dir_fd=directory_fd,
                dst_dir_fd=directory_fd, follow_symlinks=False
            )
            os.unlink(temporary, dir_fd=directory_fd)
            os.fsync(directory_fd)
    # A successful write always includes a fresh full final-file readback.
    # Verify mode never creates, removes, chmods or rewrites any root file.
    actual = contents(name, directory_fd, expected)
    bound_body(name, actual, state, journal)
    print(json.dumps({
        "status": "PASS_ROOT_PRODUCT_RECEIPT",
        "sourceSha": state["source"], "name": name,
        "sha256": digest(actual), "bytes": len(actual), "mode": mode,
    }, sort_keys=True))
except Exception as error:
    message = str(error)
    print(message if message.startswith("HOLD_PRODUCT_RECEIPT_")
          else "HOLD_PRODUCT_RECEIPT_IO_OR_AUTHORITY")
    sys.exit(3)
finally:
    if directory_fd is not None:
        os.close(directory_fd)
    if lock_fd is not None:
        os.close(lock_fd)
"""


def canonical_main_ancestry(source, fetch=gh_json):
    base = "repos/Emaren/app-prodn/"
    main = fetch(base + "branches/main")["commit"]["sha"]
    need(type(main) is str and re.fullmatch("[0-9a-f]{40}", main),
         "CANONICAL_MAIN_IDENTITY")
    comparison = fetch(base + "compare/" + main + "..." + source)
    need(comparison.get("status") in ("ahead", "identical")
         and comparison.get("behind_by") == 0
         and comparison.get("merge_base_commit", {}).get("sha") == main,
         "SOURCE_DOES_NOT_INCLUDE_CURRENT_CANONICAL_MAIN")
    need(fetch(base + "branches/main")["commit"]["sha"] == main,
         "CANONICAL_MAIN_MOVED_DURING_QUALIFICATION")
    return {
        "canonicalMainSha": main,
        "canonicalComparisonStatus": comparison["status"],
        "canonicalMergeBaseSha": comparison["merge_base_commit"]["sha"],
    }


def receipt_location(path):
    match = re.fullmatch(
        r"/var/lib/aoe2war-product-release-v1/([0-9a-f]{12})/([A-Za-z0-9._-]+)",
        str(path),
    )
    need(match is not None and match.group(2) in RECEIPT_NAMES, "ROOT_RECEIPT_PATH_SCOPE")
    return match.groups()


def acceptance_payloads(approval, log, work):
    """Validate existing local sealed bytes without manufacturing a new acceptance."""
    source, build = approval["sourceSha"], approval["buildId"]
    events = ledger.read(log, source)
    need(events and events[-1]["event"] == "T10"
         and events[-1]["state"] == "pass"
         and events[-1]["evidence"].get("buildId") == build,
         "FINAL_ACCEPTANCE_EVENT_MISSING")
    payloads = {}
    for name in RECEIPT_NAMES:
        path = work / name
        need(path.is_file(), "LOCAL_SEALED_RECEIPT_MISSING")
        transport.checked_file(path)
        payloads[name] = path.read_bytes()
    need(payloads["release-events-v1.jsonl"] == log.read_bytes(), "LOCAL_LEDGER_COLLISION")
    summary = json.loads(payloads["release-summary-v1.json"])
    expected = ledger.summary(events, build)
    need({k:v for k,v in summary.items() if k != "generatedAt"} ==
         {k:v for k,v in expected.items() if k != "generatedAt"},
         "LOCAL_SUMMARY_LEDGER_MISMATCH")
    ledger.stamp(summary.get("generatedAt"))
    seal = json.loads(payloads["release-seal-v1.json"])
    need(seal.get("schema") == "aoe2war.product.release-seal.v1"
         and seal.get("sourceSha") == source and seal.get("buildId") == build
         and seal.get("financialAuthorized") is False
         and seal.get("ledgerSha256") == hashlib.sha256(log.read_bytes()).hexdigest()
         and seal.get("summarySha256") ==
             hashlib.sha256(payloads["release-summary-v1.json"]).hexdigest()
         and seal.get("lastEventHash") == events[-1]["eventHash"],
         "LOCAL_SEAL_PAYLOAD_MISMATCH")
    event_files = {
        "T2": "pr-provenance-v1.json",
        "T3": "source-qualification-v1.json",
        "T7": "public-evidence-T7-v1.json",
        "T8": "public-evidence-T8-v1.json",
        "T9": "public-evidence-T9-v1.json",
    }
    for event_id, name in event_files.items():
        rows = [row for row in events if row["event"] == event_id]
        need(rows and rows[-1]["state"] == "pass"
             and rows[-1]["evidence"].get("proofSha256") ==
                 hashlib.sha256(payloads[name]).hexdigest(), "LOCAL_WITNESS_DIGEST")
        body = json.loads(payloads[name])
        if event_id in ("T7", "T8", "T9"):
            need(body.get("schema") == "aoe2war.product.public-identity-witness.v1"
                 and body.get("financialAuthorized") is False
                 and body.get("financialHttpStatus") == 503
                 and re.fullmatch("[0-9a-f]{40}", body.get("sourceSha", ""))
                 and re.fullmatch("[A-Za-z0-9_-]{8,64}", body.get("buildId", "")),
                 "LOCAL_PUBLIC_WITNESS_IDENTITY")
            if event_id != "T8":
                need(body["sourceSha"] == source and body["buildId"] == build,
                     "LOCAL_CANDIDATE_WITNESS_IDENTITY")
            else:
                need(body["sourceSha"] != source, "LOCAL_ROLLBACK_NOT_SOURCE_DISTINCT")
        else:
            need(body.get("sourceSha") == source and body.get("pr") == approval["pr"],
                 "LOCAL_SOURCE_PROVENANCE_IDENTITY")
    return payloads, summary, seal


def verify_root_acceptance(approval, log, work, journal):
    payloads, summary, seal = acceptance_payloads(approval, log, work)
    for name in RECEIPT_NAMES:
        root_receipt(journal + "/" + name, payloads[name], verify_only=True)
    return summary, seal


def approved_controller(action, manifest, approval):
    need(dt.datetime.now(dt.timezone.utc) < ledger.stamp(approval["expiresAt"]),
         "APPROVAL_EXPIRED_BEFORE_CONTROLLER_PHASE")
    controller(action, manifest)


def main():
    global DIAGNOSTIC_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval", required=True)
    parser.add_argument("--phase", choices=("plan", "transport", "release"), default="plan")
    parser.add_argument("--work-dir", default=str(Path.home() / ".aoe2war-product-releases"))
    args = parser.parse_args()
    need(sys.platform == "darwin" and os.getuid() == 501, "EXISTING_MAC_B_OWNER_REQUIRED")
    approval = load_approval(args.approval, args.phase)
    work = release_work = log = None
    prior = []
    if args.phase != "plan":
        work = transport.private_dir(args.work_dir)
        release_work = transport.private_dir(work / ("run-" + str(approval["runId"])))
        DIAGNOSTIC_DIR = release_work
        log = release_work / "release-events-v1.jsonl"
        prior = ledger.read(log, approval["sourceSha"])
        if any(row["event"] == "T10" and row["state"] == "pass" for row in prior):
            # Reconciliation is not a new release. Do not force an accepted old
            # source through current-main ancestry or expired GitHub artifacts.
            # It also never calls activate/rollback/reactivate.
            public_and_root(approval["sourceSha"], approval["buildId"])
            root_pins()
            journal = "/var/lib/aoe2war-product-release-v1/" + approval["sourceSha"][:12]
            if args.phase == "release":
                seal_acceptance(approval, log, release_work, journal)
            else:
                verify_root_acceptance(approval, log, release_work, journal)
            print("PASS_ALREADY_ACCEPTED_EXACT_SOURCE_ROOT_SEAL_VERIFIED")
            return
    pr, run, qualified = qualify(approval)
    print(json.dumps({
        "phase": "source-qualification", "state": "pass",
        "sourceSha": approval["sourceSha"], "pr": approval["pr"],
        "runId": approval["runId"],
        "canonicalMainSha": qualified["canonicalMainSha"],
        "nextPermittedAction": args.phase,
    }), flush=True)
    if args.phase == "plan":
        return
    pr_provenance = {
        "schema": "aoe2war.product.pr-provenance.v1",
        "sourceSha": approval["sourceSha"], "pr": approval["pr"],
        "createdAt": pr["created_at"], "url": pr["html_url"],
    }
    pr_raw = (json.dumps(pr_provenance, sort_keys=True, indent=2) + "\n").encode()
    qualified_raw = (json.dumps(qualified, sort_keys=True, indent=2) + "\n").encode()
    seal_once(release_work / "pr-provenance-v1.json", pr_raw)
    seal_once(release_work / "source-qualification-v1.json", qualified_raw)
    if not prior:
        when = approval["requestStartedAt"]
        event(log, approval, "T0", "pass" if when is not None else "unknown", {
            "startKind": approval["startKind"],
            "clockSource": approval["requestClockSource"],
            "precisionMs": approval["requestPrecisionMs"],
            "uncertaintyMs": approval["requestUncertaintyMs"],
            "provenanceUrl": pr["html_url"],
        }, at=when)
        event(log, approval, "T2", at=pr["created_at"], extra={
            "clockSource": "github-actions", "precisionMs": 1000,
            "proofSha256": hashlib.sha256(pr_raw).hexdigest(),
        })
    event(log, approval, "T3", extra={
        "proofSha256": hashlib.sha256(qualified_raw).hexdigest(),
    })
    stage, proof = prepare_artifacts(approval, work, log)
    remote = deliver(approval, stage, proof, log)
    if args.phase == "release":
        release(approval, remote, proof, log, release_work)
    else:
        print(json.dumps(ledger.summary(ledger.read(log), approval["buildId"])), flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("HOLD_PRODUCT_RELEASE_INTERRUPTED_RESUME_FROM_VERIFIED_CHECKPOINT", file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        message = str(error)
        # Never dump subprocess output, headers, signed URLs, cookies or credentials.
        print(message if isinstance(error, RuntimeError) and message.startswith("HOLD_")
              else "HOLD_PRODUCT_RELEASE_IO_NETWORK_OR_EVIDENCE_PARSE", file=sys.stderr)
        sys.exit(3)
