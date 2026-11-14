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
# Explicitly optional *manual-only* PR check. Any other skipped, failed,
# missing or in-progress check remains a hard HOLD. This does not skip security.
OPTIONAL_SKIPPED_CHECKS = frozenset({"Nightly/manual source-bound Next census"})
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


def command(parts, timeout=60, data=None):
    result = subprocess.run(parts, input=data, capture_output=True, timeout=timeout)
    need(result.returncode == 0, "COMMAND_FAILED_" + Path(parts[0]).name.upper())
    return result.stdout.decode()


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
    if path.exists():
        transport.checked_file(path)
        need(path.read_bytes() == raw, "LOCAL_RECEIPT_COLLISION")
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        need(os.write(fd, raw) == len(raw), "RECEIPT_SHORT_WRITE")
        os.fsync(fd)
    finally:
        os.close(fd)


def root_receipt(path, raw):
    digest = hashlib.sha256(raw).hexdigest()
    # Paths are fixed below, source12 is a validated hex identifier. Input is JSON data.
    text = (
        "umask 077; if test -e " + path +
        "; then test \"$(sha256sum " + path + " | cut -d ' ' -f1)\" = " + digest +
        "; else set -C; cat > " + path + "; fi"
    )
    ssh(text, root=True, data=raw)


def release(approval, remote, proof, log, work):
    root_pins()
    source = approval["sourceSha"]
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
    need(phase in (None, "staged", "live", "rolled_back"),
         "CONTROLLER_INTERRUPTED_REQUIRES_REVIEWED_RECOVERY")
    accepted = {x["event"] for x in ledger.read(log, source) if x["state"] == "pass"}
    if "T10" in accepted:
        public_and_root(source, approval["buildId"])
        root_pins()
        seal_acceptance(approval, log, work, journal)
        print("PASS_ALREADY_SEALED_EXACT_SOURCE_ROOT_RECEIPT_CHECKED")
        return
    if phase is None:
        controller("stage", manifest)
        phase = "staged"
    if "T6" not in accepted:
        event(log, approval, "T6", extra={"proofSha256": hashlib.sha256(existing.encode()).hexdigest()})
    if phase == "staged":
        controller("activate", manifest)
        phase = "live"
    if phase == "live" and "T7" not in accepted:
        digest = stage_witness(work, "T7", source, approval["buildId"])
        event(log, approval, "T7", extra={"proofSha256": digest})
    if phase == "live" and "T9" not in accepted:
        event(log, approval, "rollback", "running")
        controller("rollback", manifest)
        phase = "rolled_back"
    if phase == "rolled_back":
        digest = stage_witness(work, "T8",
                               selected["previous_source"], selected["previous_build"])
        if "T8" not in accepted:
            event(log, approval, "T8", extra={"proofSha256": digest})
        event(log, approval, "reactivate", "running")
        controller("reactivate", manifest)
    digest = stage_witness(work, "T9", source, approval["buildId"])
    if "T9" not in accepted:
        event(log, approval, "T9", extra={"proofSha256": digest})
    root_pins()
    # Existing source-pinned observer validates protected processes and finance denial.
    ssh("python3 -I -B " + INSPECTOR + " --phase inspect", root=True)
    controller("status", manifest)
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval", required=True)
    parser.add_argument("--phase", choices=("plan", "transport", "release"), default="plan")
    parser.add_argument("--work-dir", default=str(Path.home() / ".aoe2war-product-releases"))
    args = parser.parse_args()
    # Source authors are UID650; only the existing Mac B-owner transports/uses root SSH.
    need(sys.platform == "darwin" and os.getuid() == 501, "EXISTING_MAC_B_OWNER_REQUIRED")
    approval = load_approval(args.approval, args.phase)
    pr, run, qualified = qualify(approval)
    print(json.dumps({"phase": "source-qualification", "state": "pass",
                      "sourceSha": approval["sourceSha"], "pr": approval["pr"],
                      "runId": approval["runId"], "nextPermittedAction": args.phase}), flush=True)
    if args.phase == "plan":
        return
    work = transport.private_dir(args.work_dir)
    release_work = transport.private_dir(work / ("run-" + str(approval["runId"])))
    pr_provenance = {
        "schema": "aoe2war.product.pr-provenance.v1",
        "sourceSha": approval["sourceSha"], "pr": approval["pr"],
        "createdAt": pr["created_at"], "url": pr["html_url"],
    }
    pr_raw = (json.dumps(pr_provenance, sort_keys=True, indent=2) + "\n").encode()
    qualified_raw = (json.dumps(qualified, sort_keys=True, indent=2) + "\n").encode()
    log = release_work / "release-events-v1.jsonl"
    prior = ledger.read(log, approval["sourceSha"])
    if any(x["event"] == "T10" and x["state"] == "pass" for x in prior):
        public_and_root(approval["sourceSha"], approval["buildId"])
        if args.phase == "release":
            root_pins()
            seal_acceptance(approval, log, release_work,
                            "/var/lib/aoe2war-product-release-v1/" +
                            approval["sourceSha"][:12])
        print("PASS_ALREADY_ACCEPTED_EXACT_SOURCE_ROOT_SEAL_CHECKED_IF_AUTHORIZED")
        return
    # A completed immutable release must not be restamped by a later CI rerun.
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
        event(log, approval, "T2", at=pr["created_at"],
              extra={"clockSource": "github-actions", "precisionMs": 1000,
                     "proofSha256": hashlib.sha256(pr_raw).hexdigest()})
    event(log, approval, "T3", extra={
        "proofSha256": hashlib.sha256(qualified_raw).hexdigest()})
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
