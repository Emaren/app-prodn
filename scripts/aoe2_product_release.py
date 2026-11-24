#!/usr/bin/env python3
"""Thin B-owner coordinator around the installed source-pinned V3 release family."""
import time
import datetime as dt
# Normal CLI S0 includes coordinator imports and every later operation.
_SCRIPT_INVOCATION_START = (
    time.monotonic_ns(),
    dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
) if __name__ == "__main__" else None

import argparse
import fcntl
import math
import uuid
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
import urllib.request

import aoe2_product_release_ledger as ledger
import aoe2_product_release_transport as transport

CONTROLLER = "/root/aoe2war_product_release_controller_v3.py"
PREPARE = "/root/aoe2war_prepare_product_manifest_v2.py"
CONTROLLER_SHA = "fb31b5a8d9a95f67502f894bb88e27113d333c0f7da955c4e930cb7e0eaa748f"
PREPARE_SHA = "063e944565cf5ce8033844aef869dc90f3b64b75ceb975ca86ec9c9dbe6e1051"
INSPECTOR = "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py"
INSPECTOR_SHA = "2695a5b5fb4adf9e17afbb30c535158260608b8ba60e13fea4b2e4da29e974ca"
DATA_HELPER = "/root/aoe2war_factory_data_stage_v1.py"
DATA_HELPER_SHA = "96e9c5a693e55ba5475a44eba15aef3db9fd5d2b5fb2f296b7ca3eb89656c87d"
DATA_STAGE_ROOT = "/mnt/HC_Volume_105319120/aoe2war/we2-factory-artifact-stage-v1"
ROOT_PREFERRED_FLOOR = 7_598_334_817
ROOT_OBSERVED_TRANSIENT = 1_497_374_720
DATA_STAGING_DEV = 2064
HOST_DATA_PRECHECK = """
import os,stat
from pathlib import Path
m=Path("/mnt/HC_Volume_105319120")
p=m/"aoe2war"
root=p/"we2-factory-artifact-stage-v1"
need=lambda cond: (_ for _ in ()).throw(SystemExit(3)) if not cond else None
need(os.path.ismount(m))
for x,uid,gid,mode in ((m,0,0,0o755),(p,0,0,0o755),(root,0,1000,0o1770)):
 st=x.lstat()
 need(stat.S_ISDIR(st.st_mode) and st.st_dev==2064 and
      st.st_uid==uid and st.st_gid==gid and
      stat.S_IMODE(st.st_mode)==mode and not x.is_symlink())
print("PASS_BOUND_DATA_SOURCE_MOUNT_OWNER_STICKY_DIR")
"""
HOST_DATA_SYNC = """
import os,sys,stat
from pathlib import Path
p=Path(sys.argv[1])
fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
try:
 for name in ("runtime.tar.gz","b-linux-independent-review-v2.json"):
  f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  try:
   s=os.fstat(f)
   if not(stat.S_ISREG(s.st_mode) and s.st_uid==1000 and
          s.st_nlink==1 and s.st_dev==2064):
    raise SystemExit(3)
   os.fsync(f)
  finally:os.close(f)
 os.fsync(fd)
finally:os.close(fd)
print("PASS_DATA_STAGE_FILES_AND_DIRECTORY_FSYNCED")
"""
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



INVOCATION_RECEIPT_NAME = "deployment-invocation-v1.json"


class DeploymentInvocation:
    """One process's deployment clock; never changes engineering T0."""
    def __init__(self, monotonic=None, utc=None, invocation_id=None, script_start=None):
        self.monotonic = monotonic or time.monotonic_ns
        self.utc = utc or ledger.utcnow
        self.origin_ns = script_start[0] if script_start is not None else self.monotonic()
        self.start_boundary = "script-entry-before-coordinator-imports" if script_start is not None else "main-entry-before-argument-parse"
        self.last_sample_ns = self.origin_ns
        self.live_ns = self.accepted_ns = None
        self.resolution_ns = max(1, math.ceil(time.get_clock_info("monotonic").resolution * 1e9))
        self.started_at = script_start[1] if script_start is not None else self.utc()
        self.invocation_id = invocation_id or str(uuid.uuid4())
        self.path = None
        self.rows = []
        self.previous_hash = "0" * 64
        self.source = self.build = self.provenance = None
        self.github_run_id = None
        self.kind, self.coverage = "unknown", "none"
        self.live_ms = self.accepted_ms = self.completed_at = None
        self.previous_source = self.previous_build = None
        self.artifact_sha = self.runtime_bytes = self.extracted_bytes = None
        self.local_cache = self.remote_state = "unknown"
        self.remote_cache_bytes = self.remote_transferred_bytes = None
        self.transport_elapsed_ms = self.artifact_goodput_bps = None
        # S0 is memory-only until the owner permit supplies verified identity.
        self.rows.append({"phase": "START", "state": "running",
                          "at": self.started_at, "elapsedMs": 0.0,
                          "proofSha256": None})

    def sample(self):
        now = self.monotonic()
        need(type(now) is int and now >= self.origin_ns and now >= self.last_sample_ns,
             "INVOCATION_MONOTONIC_REVERSAL")
        self.last_sample_ns = now
        return self.utc(), (now - self.origin_ns) / 1e6

    def persist(self, row):
        body = {
            "schema": "aoe2war.product.deployment-invocation-event.v1",
            "invocationId": self.invocation_id,
            "sourceSha": self.source, "buildId": self.build,
            "previousHash": self.previous_hash, "entry": row,
            "clock": {"source": "python.time.monotonic_ns",
                      "utcSource": "python.datetime.now(UTC)",
                      "originNs": self.origin_ns, "resolutionNs": self.resolution_ns,
                      "uncertaintyMs": None},
        }
        body["eventHash"] = hashlib.sha256(ledger.canonical(body)).hexdigest()
        raw = ledger.canonical(body) + b"\n"
        fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
        try:
            info, current = os.fstat(fd), self.path.lstat()
            need(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
                 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600
                 and (info.st_dev, info.st_ino) == (current.st_dev, current.st_ino),
                 "INVOCATION_TIMELINE_AUTHORITY")
            fcntl.flock(fd, fcntl.LOCK_EX)
            offset = 0
            while offset < len(raw):
                written = os.write(fd, raw[offset:])
                need(written > 0, "INVOCATION_TIMELINE_SHORT_WRITE")
                offset += written
            os.fsync(fd)
        finally:
            os.close(fd)
        self.previous_hash = body["eventHash"]

    def bind(self, work):
        need(type(self.source) is str and re.fullmatch("[0-9a-f]{40}", self.source)
             and type(self.build) is str
             and re.fullmatch("[A-Za-z0-9_-]{8,64}", self.build),
             "INVOCATION_IDENTITY_BEFORE_PERSIST")
        self.path = Path(work) / ("deployment-invocation-" + self.invocation_id + ".jsonl")
        seal_once(self.path, b"")
        for row in self.rows:
            self.persist(row)

    def record(self, phase, state="pass", proof=None, sample=None):
        at, elapsed = sample if sample is not None else self.sample()
        row = {"phase": phase, "state": state, "at": at,
               "elapsedMs": elapsed, "proofSha256": proof}
        self.rows.append(row)
        if self.path is not None:
            self.persist(row)
        print(json.dumps({
            **row, "invocationId": self.invocation_id,
            "sourceSha": self.source, "buildId": self.build,
            "kind": self.kind, "coverage": self.coverage,
        }), flush=True)
        return row

    def identify(self, approval):
        self.source, self.build = approval["sourceSha"], approval["buildId"]
        self.provenance = "https://github.com/Emaren/app-prodn/pull/" + str(approval["pr"])
        self.github_run_id = approval["runId"]

    def announce(self, phase):
        if phase == "plan":
            label = "READ-ONLY PLAN"
        elif self.kind == "no-op":
            label = "NO-OP"
        elif phase == "transport":
            label = "TRANSPORT"
        elif self.kind == "resume":
            label = "RECOVERY"
        else:
            label = "DEPLOYMENT STARTED"
        self.record(label, "running")

    def classify(self, prior, warm=None):
        passed = {row["event"] for row in prior if row["state"] == "pass"}
        if "T10" in passed:
            self.kind, self.coverage = "no-op", "none"
        elif passed.intersection({"T6", "T7", "T8", "T9"}):
            self.kind, self.coverage = "resume", "partial"
        else:
            self.kind, self.coverage = (("unknown", "none") if warm is None else
                                        (("warm" if warm else "cold"), "full"))

    def manifest(self, selected, prior_phase):
        self.previous_source = selected["previous_source"]
        self.previous_build = selected["previous_build"]
        self.artifact_sha = selected["archive_sha256"]
        self.runtime_bytes = selected.get("archive_bytes", self.runtime_bytes)
        if prior_phase is not None and self.kind != "no-op":
            self.kind, self.coverage = "resume", "partial"
            self.record("RECOVERY", "running")

    def first_live(self):
        # Called only by fresh T7's first /factory HTTPS identity success.
        if self.live_ms is None:
            at, elapsed = self.sample()
            self.live_ms = elapsed
            self.live_ns = self.last_sample_ns
            self.record("LIVE HTTPS VERIFIED", sample=(at, elapsed))

    def accepted(self, seal_sha):
        # The caller invokes this immediately after the eighth root readback.
        if self.kind == "no-op":
            return
        at, elapsed = self.sample()
        self.accepted_ms, self.completed_at = elapsed, at
        self.accepted_ns = self.last_sample_ns
        self.record("T10 DURABLY SEALED", proof=seal_sha, sample=(at, elapsed))

    def headlines(self):
        complete = (self.coverage == "full" and self.kind in ("cold", "warm"))
        return {
            "firstVerifiedLiveMs": self.live_ms if complete else None,
            "durableAcceptanceMs": self.accepted_ms if complete else None,
        }

    def payload(self, seal_sha):
        need(self.accepted_ms is not None and self.completed_at is not None
             and self.kind != "no-op", "INVOCATION_NOT_DURABLY_ACCEPTED")
        if self.coverage == "full":
            need(self.live_ms is not None and self.live_ms <= self.accepted_ms,
                 "INVOCATION_FIRST_LIVE_MISSING")
        return {
            "schema": "aoe2war.product.deployment-invocation.v1",
            "invocationId": self.invocation_id,
            "sourceSha": self.source, "buildId": self.build,
            "githubRunId": self.github_run_id,
            "kind": self.kind, "coverage": self.coverage,
            "startedAt": self.started_at, "completedAt": self.completed_at,
            "clockSource": "python.time.monotonic_ns",
            "startBoundary": self.start_boundary,
            "utcClockSource": "python.datetime.now(UTC)",
            "clockPrecisionMs": 1, "uncertaintyMs": None,
            "monotonicOriginNs": self.origin_ns,
            "firstLiveMonotonicNs": self.live_ns,
            "acceptedMonotonicNs": self.accepted_ns,
            "monotonicResolutionNs": self.resolution_ns,
            **self.headlines(),
            "previousSourceSha": self.previous_source,
            "previousBuildId": self.previous_build,
            "artifactSha256": self.artifact_sha,
            "runtimeArchiveBytes": self.runtime_bytes,
            "extractedBytes": self.extracted_bytes,
            "rootSealSha256": seal_sha, "provenanceUrl": self.provenance,
            "localArtifactCache": self.local_cache,
            "remoteArtifactState": self.remote_state,
            "remoteCacheBytes": self.remote_cache_bytes,
            "remoteTransferredBytes": self.remote_transferred_bytes,
            "transportElapsedMs": self.transport_elapsed_ms,
            "artifactGoodputBps": self.artifact_goodput_bps,
            "transportRateKind": "verified-artifact-goodput-not-wire-rate",
            "observedInvocationMs": self.accepted_ms,
            "acceptanceBoundary": "eight-root-T10-final-readbacks",
            "metricPublicationIncluded": False,
            "timeline": list(self.rows), "financialAuthorized": False,
        }


def verified_local_cache(approval, work):
    """Classify only complete approved ZIPs; partial downloads are not warm."""
    cache = Path(work) / "cache"
    if not cache.exists():
        return False
    transport.private_dir(cache)
    complete = True
    for prefix in ("artifact", "proofArtifact"):
        path = cache / (approval[prefix + "Sha256"] + ".zip")
        if path.exists() or path.is_symlink():
            need(transport.checked_file(path).st_size == approval[prefix + "Bytes"]
                 and transport.sha(path) == approval[prefix + "Sha256"],
                 "INVOCATION_CACHE_IDENTITY")
        else:
            complete = False
    return complete



FACTORY_PUBLISHER = "/usr/local/sbin/aoe2war_factory_public_status_v2.py"
# Owner replaces this fail-closed placeholder after final reviewed publisher freeze.
FACTORY_PUBLISHER_SHA = "e1ba18b10824a00b3d942d94b7748a2d66fc20d6b100b402130ea89552c050af"
FACTORY_STATUS_MAX_BYTES = 2 * 1024 * 1024


def refresh_factory_publication(approval, expected_raw=None):
    """Refresh the existing publisher; independently verify its public output.

    This runs only after T10 and invocation receipt readback. Its elapsed time
    is publication work, never part of the already-stopped acceptance clock.
    A failure requires publication reconciliation, not physical redeployment.
    """
    started = time.monotonic_ns()
    try:
        need(FACTORY_PUBLISHER ==
             "/usr/local/sbin/aoe2war_factory_public_status_v2.py"
             and re.fullmatch("[0-9a-f]{64}", FACTORY_PUBLISHER_SHA)
             and FACTORY_PUBLISHER_SHA != "f" * 64,
             "PUBLICATION_PUBLISHER_PIN_NOT_QUALIFIED")
        metadata = ssh(
            "set -e; test ! -L " + FACTORY_PUBLISHER +
            "; LC_ALL=C stat -c '%u:%h:%a:%F' " + FACTORY_PUBLISHER +
            "; sha256sum " + FACTORY_PUBLISHER,
            root=True, timeout=20,
        ).splitlines()
        need(len(metadata) == 2, "PUBLICATION_PUBLISHER_METADATA")
        fields = metadata[0].split(":", 3)
        need(len(fields) == 4 and fields[0:2] == ["0", "1"]
             and fields[3] == "regular file"
             and not int(fields[2], 8) & 0o022
             and metadata[1].split() == [FACTORY_PUBLISHER_SHA, FACTORY_PUBLISHER],
             "PUBLICATION_PUBLISHER_SOURCE_OR_AUTHORITY")
        # Existing source-pinned publisher, existing root authority, no new unit.
        ssh("python3 -I -B " + FACTORY_PUBLISHER, root=True, timeout=20)
        request = urllib.request.Request(
            "https://aoe2war.com/factory/status.json?publication_probe=" +
            uuid.uuid4().hex,
            headers={"Cache-Control": "no-cache, no-store",
                     "User-Agent": PUBLIC_OBSERVER_UA},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            need(response.status == 200, "PUBLICATION_HTTPS_STATUS")
            need(response.geturl().startswith(
                "https://aoe2war.com/factory/status.json?"),
                "PUBLICATION_HTTPS_ORIGIN")
            raw = response.read(FACTORY_STATUS_MAX_BYTES + 1)
        need(0 < len(raw) <= FACTORY_STATUS_MAX_BYTES, "PUBLICATION_JSON_SIZE")
        status = json.loads(raw)
        need(type(status) is dict, "PUBLICATION_JSON_OBJECT")
        live = status.get("liveRelease")
        need(type(live) is dict
             and live.get("id") == approval["sourceSha"]
             and live.get("buildId") == approval["buildId"],
             "PUBLICATION_LIVE_SOURCE_BUILD")
        generated = ledger.stamp(status.get("generatedAt"))
        need(generated is not None, "PUBLICATION_GENERATED_AT")
        age = (dt.datetime.now(dt.timezone.utc) - generated).total_seconds()
        need(-60 <= age <= 600, "PUBLICATION_FRESHNESS")
        observed = status.get("deploymentInvocation")
        expected_sha = None
        if expected_raw is not None:
            expected = json.loads(expected_raw)
            need(type(expected) is dict
                 and expected.get("schema") == "aoe2war.product.deployment-invocation.v1"
                 and expected.get("sourceSha") == approval["sourceSha"]
                 and expected.get("buildId") == approval["buildId"]
                 and re.fullmatch("[0-9a-f]{64}", expected.get("rootSealSha256", "")),
                 "PUBLICATION_EXPECTED_INVOCATION")
            expected_sha = hashlib.sha256(expected_raw).hexdigest()
            need(type(observed) is dict
                 and observed.get("schema") == expected["schema"]
                 and observed.get("sourceSha") == approval["sourceSha"]
                 and observed.get("buildId") == approval["buildId"]
                 and observed.get("rootSealSha256") == expected["rootSealSha256"]
                 and observed.get("receiptSha256") == expected_sha
                 and observed.get("invocationId") == expected.get("invocationId")
                 and observed.get("kind") == expected.get("kind")
                 and observed.get("coverage") == expected.get("coverage")
                 and observed.get("firstVerifiedLiveMs") == expected.get("firstVerifiedLiveMs")
                 and observed.get("durableAcceptanceMs") == expected.get("durableAcceptanceMs"),
                 "PUBLICATION_INVOCATION_SOURCE_SEAL_OR_RECEIPT")
        else:
            # Old accepted sources have no instrumented invocation clock.
            need(observed is None or (
                type(observed) is dict
                and observed.get("sourceSha") == approval["sourceSha"]
                and observed.get("buildId") == approval["buildId"]
                and observed.get("coverage") in ("none", "partial")
                and observed.get("firstVerifiedLiveMs") is None
                and observed.get("durableAcceptanceMs") is None),
                "PUBLICATION_LEGACY_CLOCK_MUST_REMAIN_UNKNOWN")
        return {
            "state": "pass", "generatedAt": status["generatedAt"],
            "sourceSha": approval["sourceSha"], "buildId": approval["buildId"],
            "statusSha256": hashlib.sha256(raw).hexdigest(),
            "invocationReceiptSha256": expected_sha,
            "publicationElapsedMs": (time.monotonic_ns() - started) / 1e6,
        }
    except Exception as error:
        matches = re.findall(r"HOLD_[A-Z0-9_]{1,140}", str(error))
        predicate = matches[-1] if matches else "HOLD_PRODUCT_RELEASE_PUBLICATION_IO_OR_JSON"
        diagnostic = re.search(r"DIAGNOSTIC=([A-Za-z0-9._-]{1,200})", str(error))
        print(json.dumps({
            "phase": "FACTORY PUBLICATION", "state": "hold",
            "underlyingPredicate": predicate,
            "diagnostic": diagnostic.group(1) if diagnostic else None,
            "sourceAlreadyAccepted": True,
            "nextPermittedAction": "RETRY_ACCEPTED_SOURCE_PUBLICATION_WITHOUT_REDEPLOY",
        }), flush=True)
        raise RuntimeError(
            "HOLD_PRODUCT_RELEASE_PUBLICATION_RETRY_WITHOUT_REDEPLOY"
        ) from None


def publish_invocation(invocation, approval, work, journal):
    seal_sha = hashlib.sha256((work / "release-seal-v1.json").read_bytes()).hexdigest()
    body = invocation.payload(seal_sha)
    raw = (json.dumps(body, sort_keys=True, indent=2) + "\n").encode()
    # Keep a per-process private copy as well as the one immutable source receipt.
    seal_once(invocation.path.with_suffix(".json"), raw)
    seal_once(work / INVOCATION_RECEIPT_NAME, raw)
    root_receipt(journal + "/" + INVOCATION_RECEIPT_NAME, raw)
    root_receipt(journal + "/" + INVOCATION_RECEIPT_NAME, raw, verify_only=True)
    invocation.record("INVOCATION RECEIPT PUBLISHED", proof=hashlib.sha256(raw).hexdigest())
    publication = refresh_factory_publication(approval, expected_raw=raw)
    invocation.record("FACTORY PUBLICATION VERIFIED",
                      proof=publication["statusSha256"])
    final = invocation.record("FINAL RESULT")
    print(json.dumps({
        "phase": "FINAL RESULT", "state": "pass",
        "sourceSha": approval["sourceSha"], "buildId": approval["buildId"],
        "invocationId": invocation.invocation_id,
        "kind": invocation.kind, "coverage": invocation.coverage,
        **invocation.headlines(),
        "metricPublicationMs": final["elapsedMs"] - invocation.accepted_ms,
        "metricPublicationIncludedInAcceptance": False,
        "factoryPublicationMs": publication["publicationElapsedMs"],
        "factoryStatusSha256": publication["statusSha256"],
        "rootInvocationSha256": hashlib.sha256(raw).hexdigest(),
    }), flush=True)


def reconcile_invocation(invocation, approval, work, journal, permit_write=False):
    """A no-op never manufactures historical invocation timing."""
    invocation.kind, invocation.coverage = "no-op", "none"
    local = work / INVOCATION_RECEIPT_NAME
    root_path = journal + "/" + INVOCATION_RECEIPT_NAME
    remote = ssh("if test -f " + root_path + "; then cat " + root_path + "; fi",
                 root=True)
    raw = remote.encode() if remote else None
    if raw is not None:
        root_receipt(root_path, raw, verify_only=True)
        seal_once(local, raw)
        state = "existing-root-invocation-verified"
    elif local.exists():
        transport.checked_file(local)
        raw = local.read_bytes()
        need(permit_write, "INVOCATION_PUBLICATION_REQUIRES_RELEASE_PERMISSION")
        # This is the original stopped clock, not the retry process's clock.
        root_receipt(root_path, raw)
        root_receipt(root_path, raw, verify_only=True)
        state = "original-invocation-publication-recovered"
    else:
        state = "unknown-legacy-invocation"
    if raw is not None:
        body = json.loads(raw)
        need(body.get("schema") == "aoe2war.product.deployment-invocation.v1"
             and body.get("sourceSha") == approval["sourceSha"]
             and body.get("buildId") == approval["buildId"]
             and body.get("rootSealSha256") ==
                 hashlib.sha256((work / "release-seal-v1.json").read_bytes()).hexdigest(),
             "INVOCATION_RECONCILIATION_IDENTITY")
    publication = None
    if permit_write:
        publication = refresh_factory_publication(approval, expected_raw=raw)
        invocation.record("FACTORY PUBLICATION VERIFIED",
                          proof=publication["statusSha256"])
    invocation.record("NO-OP RECONCILIATION",
                      proof=hashlib.sha256(raw).hexdigest() if raw is not None else None)
    invocation.record("FINAL RESULT")
    print(json.dumps({
        "phase": "FINAL RESULT", "state": "pass", "kind": "no-op",
        "coverage": "none", "firstVerifiedLiveMs": None,
        "durableAcceptanceMs": None, "deploymentClockState": state,
        "factoryPublicationMs": publication["publicationElapsedMs"]
        if publication is not None else None,
        "invocationId": invocation.invocation_id,
    }), flush=True)


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
    actual = ssh("sha256sum " + CONTROLLER + " " + PREPARE + " " +
                 INSPECTOR + " " + DATA_HELPER,root=True).splitlines()
    need([line.split()[0] for line in actual] ==
         [CONTROLLER_SHA, PREPARE_SHA, INSPECTOR_SHA, DATA_HELPER_SHA],
         "INSTALLED_ROOT_SOURCE_DRIFT")


def event(path, approval, name, state="pass", extra=None, at="NOW"):
    evidence = {"buildId": approval["buildId"], "runId": approval["runId"]}
    evidence.update(extra or {})
    return ledger.append(path, approval["sourceSha"], name, state, evidence,
                         at=at, historical=(at != "NOW"))


def prepare_artifacts(approval, work, log, invocation=None):
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
    if invocation is not None:
        invocation.artifact_sha = proof["runtime_archive_sha256"]
        invocation.runtime_bytes = proof["runtime_archive_bytes"]
        invocation.record("ARTIFACT VERIFIED", proof=approval["proofSha256"])
    return stage, proof


def deliver(approval, stage, proof, log, invocation=None):
    # The verified gzip source is transported to the separate DATA filesystem.
    # No symlink, bind-mount or third runtime; ROOT contains only new extract.
    remote=(DATA_STAGE_ROOT+"/.aoe2war-b-os-"+approval["sourceSha"][:12]+
            "-run-"+str(approval["runId"]))
    extracted = 0
    rounded = 0
    symlink_rounded = 0
    directory_names = set()
    with tarfile.open(stage / "runtime.tar.gz", "r:gz") as archive:
        for member in archive:
            extracted += member.size
            need(extracted <= 5 * 1024 ** 3, "EXTRACTION_BUDGET")
            if member.isfile():
                rounded += ((member.size+4095)//4096)*4096
            elif member.issym() and len(member.linkname.encode())>60:
                n=len(member.linkname.encode())
                symlink_rounded += ((n+4095)//4096)*4096
            pp=Path(member.name).parent
            while str(pp)!=".":
                directory_names.add(str(pp))
                pp=pp.parent
    if invocation is not None:
        invocation.extracted_bytes = extracted
    # Stronger than old 6GiB preflight. Reserve measured natural transient
    # separately; this is a PROVISIONAL model, not a Factory T8+PG GO proof.
    modeled = rounded+symlink_rounded+(len(directory_names)+3)*4096
    extract_reserve = (modeled*11+9)//10+128*1024*1024
    available = int(ssh("df -B1 --output=avail / | tail -1").strip())
    data_available = int(ssh("df -B1 --output=avail " +
                             "/mnt/HC_Volume_105319120 | tail -1").strip())
    incoming = proof["runtime_archive_bytes"]
    required = max(6*1024**3,ROOT_PREFERRED_FLOOR+
                   extract_reserve+ROOT_OBSERVED_TRANSIENT)
    required_data = incoming*2+256*1024*1024
    print(json.dumps({"phase":"disk-preflight-data-v1",
       "rootFreeBytes":available,"dataFreeBytes":data_available,
       "rootRequiredBeforeStage":required,
       "dataRequiredBeforeTransfer":required_data,
       "conservativeExtractReserveBytes":extract_reserve,
       "observedUnattributedTransientReserveBytes":ROOT_OBSERVED_TRANSIENT,
       "incomingRootArchiveBytes":0,"incomingDataArchiveBytes":incoming,
       "state":"pass" if available>=required and
                         data_available>=required_data else "hold"}),flush=True)
    need(available>=required,"ROOT_DATA_EXTRACT_AND_TRANSIENT_CAPACITY")
    need(data_available>=required_data,"DATA_ARCHIVE_TRANSFER_CAPACITY")
    need(ssh("python3 -B -c "+shlex.quote(HOST_DATA_PRECHECK)).strip() ==
         "PASS_BOUND_DATA_SOURCE_MOUNT_OWNER_STICKY_DIR",
         "DATA_STAGE_TRUSTED_SOURCE_NOT_INSTALLED")
    # Refuse root-owned/frozen stages: their exact one-use publication must
    # resume through the original source/receipt recovery, never rsync overwrite.
    need(ssh("umask 077; mkdir -m 700 "+remote+" 2>/dev/null || "
             "test -d "+remote+"; test ! -L "+remote+"; "
             "stat -c '%d:%u:%g:%a' "+remote).strip() ==
         "2064:1000:1000:700","DATA_STAGE_UNTRUSTED_OR_ALREADY_FROZEN")
    runtime_copied = False
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
        if name == "runtime.tar.gz":
            runtime_copied = True
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
    # The original root manifest preparer takes over only *after* the
    # complete DATA file and independent proof have durable fsync evidence.
    need(ssh("python3 -B -c "+shlex.quote(HOST_DATA_SYNC)+" "+
             shlex.quote(remote)).strip() ==
         "PASS_DATA_STAGE_FILES_AND_DIRECTORY_FSYNCED","DATA_FSYNC_NOT_DURABLE")
    elapsed = round((time.monotonic() - started) * 1000)
    event(log, approval, "T5", extra={
        "proofSha256": proof["runtime_archive_sha256"], "elapsedMs": elapsed,
        "bytes": incoming, "verification": "pass",
    })
    if invocation is not None:
        invocation.remote_state = "transferred" if runtime_copied else "cached"
        invocation.remote_cache_bytes = 0 if runtime_copied else incoming
        # rsync --partial may send deltas. Final artifact bytes are not wire bytes.
        invocation.remote_transferred_bytes = None if runtime_copied else 0
        invocation.transport_elapsed_ms = elapsed
        invocation.artifact_goodput_bps = round(incoming / max(elapsed / 1000, .001)) if runtime_copied else None
        invocation.record("TRANSPORT COMPLETE", proof=proof["runtime_archive_sha256"])
        print(json.dumps({
            "phase": "TRANSPORT COMPLETE DETAILS", "state": "pass",
            "transportState": invocation.remote_state,
            "verifiedArtifactBytes": incoming,
            "wireBytes": invocation.remote_transferred_bytes,
            "transportElapsedMs": elapsed,
            "artifactGoodputBps": invocation.artifact_goodput_bps,
            "rateKind": "verified-artifact-goodput-not-wire-rate",
        }), flush=True)
    return remote


def public_and_root(source, build, first_verified=None):
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
            # This stop is exactly the first independent /factory HTTPS proof.
            # /wolo and financial denial remain mandatory for the full witness.
            if route == "/factory" and first_verified is not None:
                first_verified()
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


def stage_witness(work, event_id, source, build, invocation=None):
    need(event_id in ("T7", "T8", "T9"), "WITNESS_EVENT")
    # Recheck current root and public source/build, even when resuming.
    observation = (
        public_and_root(source, build, first_verified=invocation.first_live)
        if invocation is not None and event_id == "T7"
        else public_and_root(source, build)
    )
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


def release(approval, remote, proof, log, work, invocation=None):
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
         and selected["schema"]=="aoe2war.product.web-release-manifest.v3"
         and selected["transport_mode"]=="data-archive-v1"
         and selected["archive_dev"]==DATA_STAGING_DEV
         and type(selected["archive_inode"]) is int
         and selected["archive_inode"]>0
         and selected["archive_sha256"] == proof["runtime_archive_sha256"]
         and selected["independent_proof_sha256"] == approval["proofSha256"]
         and selected["financial_authorized"] is False, "ROOT_MANIFEST_IDENTITY")
    journal = "/var/lib/aoe2war-product-release-v1/" + source[:12]
    raw_state = ssh("if test -f " + journal + "/state.json; then cat " +
                    journal + "/state.json; fi", root=True)
    phase = json.loads(raw_state)["phase"] if raw_state else None
    need(phase in (None, "prepared", "live", "rolled_back"),
         "CONTROLLER_INTERRUPTED_REQUIRES_REVIEWED_RECOVERY")
    if invocation is not None:
        invocation.manifest(selected, phase)
    accepted = {x["event"] for x in ledger.read(log, source) if x["state"] == "pass"}
    if "T10" in accepted:
        public_and_root(source, approval["buildId"])
        root_pins()
        seal_acceptance(approval, log, work, journal)
        if invocation is not None:
            reconcile_invocation(invocation, approval, work, journal, permit_write=True)
        print("PASS_ALREADY_SEALED_EXACT_SOURCE_ROOT_RECEIPT_CHECKED")
        return
    if phase is None:
        approved_controller("stage", manifest, approval)
        phase = "prepared"
    if "T6" not in accepted:
        event(log, approval, "T6", extra={"proofSha256": hashlib.sha256(existing.encode()).hexdigest()})
    if invocation is not None:
        invocation.record("STAGED")
    if phase == "prepared":
        approved_controller("activate", manifest, approval)
        phase = "live"
    if phase == "live" and "T7" not in accepted:
        digest = stage_witness(work, "T7", source, approval["buildId"],
                               invocation=invocation)
        event(log, approval, "T7", extra={"proofSha256": digest})
    if phase == "live" and "T9" not in accepted:
        event(log, approval, "rollback", "running")
        approved_controller("rollback", manifest, approval)
        phase = "rolled_back"
    if phase == "rolled_back":
        digest = stage_witness(work, "T8",
                               selected["previous_source"], selected["previous_build"])
        if invocation is not None:
            invocation.record("ROLLBACK VERIFIED", proof=digest)
        if "T8" not in accepted:
            event(log, approval, "T8", extra={"proofSha256": digest})
        event(log, approval, "reactivate", "running")
        approved_controller("reactivate", manifest, approval)
    if invocation is not None and "T8" in accepted and not any(
            row["phase"] == "ROLLBACK VERIFIED" for row in invocation.rows):
        previous_witness = work / "public-evidence-T8-v1.json"
        transport.checked_file(previous_witness)
        invocation.record(
            "ROLLBACK PRIOR EVIDENCE",
            proof=hashlib.sha256(previous_witness.read_bytes()).hexdigest(),
        )
    digest = stage_witness(work, "T9", source, approval["buildId"])
    if invocation is not None:
        invocation.record("REACTIVATED", proof=digest)
    if "T9" not in accepted:
        event(log, approval, "T9", extra={"proofSha256": digest})
    root_pins()
    # Existing source-pinned observer validates protected processes and finance denial.
    ssh("python3 -I -B " + INSPECTOR + " --phase inspect", root=True)
    approved_controller("status", manifest, approval)
    before = hashlib.sha256(log.read_bytes()).hexdigest()
    event(log, approval, "T10", extra={"proofSha256": before})
    seal_acceptance(approval, log, work, journal, invocation=invocation)
    if invocation is not None:
        publish_invocation(invocation, approval, work, journal)


def seal_acceptance(approval, log, work, journal, invocation=None):
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
    if invocation is not None:
        invocation.accepted(hashlib.sha256(receipt_raw).hexdigest())
    print(json.dumps({
        "phase": "engineering-T10-root-receipts",
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
import datetime as dt
import math
import fcntl, hashlib, json, os, re, stat, subprocess, sys
from pathlib import Path

OWNER_UID = 0
BASE = Path("/var/lib/aoe2war-product-release-v1")
MANIFEST_BASE = Path("/root/aoe2war-product-release-manifests")
DATA_STAGE_BASE = Path("/mnt/HC_Volume_105319120/aoe2war/we2-factory-artifact-stage-v1")
DATA_STAGE_DEV = 2064
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
LOCK = Path("/run/lock/aoe2war-product-release-v1.lock")
NAMES = {
    "release-events-v1.jsonl", "release-summary-v1.json", "release-seal-v1.json",
    "public-evidence-T7-v1.json", "public-evidence-T8-v1.json",
    "public-evidence-T9-v1.json", "source-qualification-v1.json",
    "pr-provenance-v1.json",
    "deployment-invocation-v1.json",
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

    if name == "deployment-invocation-v1.json":
        need(body.get("schema") == "aoe2war.product.deployment-invocation.v1"
             and body.get("buildId") == expected_build
             and body.get("financialAuthorized") is False
             and body.get("clockSource") == "python.time.monotonic_ns"
             and body.get("startBoundary") in ("script-entry-before-coordinator-imports", "main-entry-before-argument-parse")
             and body.get("utcClockSource") == "python.datetime.now(UTC)"
             and body.get("uncertaintyMs") is None
             and body.get("acceptanceBoundary") == "eight-root-T10-final-readbacks"
             and body.get("metricPublicationIncluded") is False,
             "INVOCATION_SCHEMA_OR_CLOCK")
        need(re.fullmatch("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                          body.get("invocationId", "")), "INVOCATION_UUID")
        for key in ("startedAt", "completedAt"):
            need(type(body.get(key)) is str and body[key].endswith("Z"),
                 "INVOCATION_UTC")
            dt.datetime.fromisoformat(body[key].replace("Z", "+00:00"))
        kind, coverage = body.get("kind"), body.get("coverage")
        need(kind in ("cold", "warm", "resume", "no-op", "unknown")
             and coverage in ("full", "partial", "none"), "INVOCATION_KIND")
        live, accepted = body.get("firstVerifiedLiveMs"), body.get("durableAcceptanceMs")
        finite = lambda value: type(value) in (int, float) and math.isfinite(value) and value >= 0
        if coverage == "full":
            need(kind in ("cold", "warm") and finite(live) and finite(accepted)
                 and live <= accepted, "INVOCATION_DURATION_COVERAGE")
        else:
            need(live is None and accepted is None
                 and ((kind == "resume" and coverage == "partial")
                      or (kind in ("no-op", "unknown") and coverage == "none")),
                 "INVOCATION_PARTIAL_HEADLINES")
        need(finite(body.get("observedInvocationMs"))
             and finite(body.get("clockPrecisionMs")), "INVOCATION_NUMERIC")
        need(re.fullmatch("[0-9a-f]{40}", body.get("previousSourceSha", ""))
             and body["previousSourceSha"] != state["source"]
             and re.fullmatch("[A-Za-z0-9_-]{8,64}", body.get("previousBuildId", ""))
             and re.fullmatch("[0-9a-f]{64}", body.get("artifactSha256", ""))
             and type(body.get("runtimeArchiveBytes")) is int
             and 1000000 < body["runtimeArchiveBytes"] < 1000000000
             and type(body.get("extractedBytes")) is int
             and 0 < body["extractedBytes"] <= 5 * 1024 ** 3,
             "INVOCATION_RUNTIME_IDENTITY")
        need(re.fullmatch(r"https://github\.com/Emaren/app-prodn/pull/[0-9]+",
                          body.get("provenanceUrl", "")), "INVOCATION_PROVENANCE")
        need(body.get("localArtifactCache") in ("verified", "miss", "unknown")
             and body.get("remoteArtifactState") in ("cached", "transferred", "unknown"),
             "INVOCATION_CACHE_STATE")
        for key in ("remoteCacheBytes", "remoteTransferredBytes"):
            need(body.get(key) is None or
                 (type(body[key]) is int and body[key] >= 0), "INVOCATION_BYTE_COUNT")
        for key in ("transportElapsedMs", "artifactGoodputBps"):
            need(body.get(key) is None or finite(body[key]), "INVOCATION_TRANSPORT_METRIC")
        need(body.get("transportRateKind") == "verified-artifact-goodput-not-wire-rate",
             "INVOCATION_TRANSPORT_RATE_SCOPE")
        rows = body.get("timeline")
        need(type(rows) is list and 1 <= len(rows) <= 200, "INVOCATION_TIMELINE_BOUND")
        prior_elapsed = -1
        for row in rows:
            need(type(row) is dict and set(row) ==
                 {"phase", "state", "at", "elapsedMs", "proofSha256"}
                 and type(row["phase"]) is str
                 and re.fullmatch("[A-Z0-9 _-]{1,80}", row["phase"])
                 and row["state"] in ("running", "pass", "hold", "fail", "unknown")
                 and finite(row["elapsedMs"]) and row["elapsedMs"] >= prior_elapsed
                 and type(row["at"]) is str and row["at"].endswith("Z")
                 and (row["proofSha256"] is None or
                      re.fullmatch("[0-9a-f]{64}", row["proofSha256"])),
                 "INVOCATION_TIMELINE")
            dt.datetime.fromisoformat(row["at"].replace("Z", "+00:00"))
            prior_elapsed = row["elapsedMs"]
        need(rows[0]["phase"] == "START"
             and rows[-1]["phase"] == "T10 DURABLY SEALED"
             and rows[-1]["elapsedMs"] == body["observedInvocationMs"],
             "INVOCATION_ACCEPTANCE_BOUNDARY")

        need(rows[0]["elapsedMs"] == 0 and rows[0]["at"] == body["startedAt"]
             and rows[-1]["at"] == body["completedAt"]
             and rows[-1]["proofSha256"] == body.get("rootSealSha256"),
             "INVOCATION_START_STOP_TIES")
        if coverage == "full":
            need(accepted == body["observedInvocationMs"],
                 "INVOCATION_ACCEPTED_STOP")
        live_rows = [(index, row) for index, row in enumerate(rows)
                     if row["phase"] == "LIVE HTTPS VERIFIED"]
        rollback_rows = [(index, row) for index, row in enumerate(rows)
                         if row["phase"] in ("ROLLBACK VERIFIED",
                                             "ROLLBACK PRIOR EVIDENCE")]
        reactivate_rows = [(index, row) for index, row in enumerate(rows)
                           if row["phase"] == "REACTIVATED"]
        need(len(rollback_rows) == 1 and len(reactivate_rows) == 1
             and rollback_rows[0][1]["state"] == "pass"
             and reactivate_rows[0][1]["state"] == "pass"
             and rollback_rows[0][0] < reactivate_rows[0][0] < len(rows) - 1,
             "INVOCATION_ROLLBACK_REACTIVATION_TIMELINE")
        if coverage == "full":
            need(len(live_rows) == 1 and live_rows[0][1]["state"] == "pass"
                 and live_rows[0][1]["elapsedMs"] == live
                 and live_rows[0][0] < rollback_rows[0][0]
                 and rollback_rows[0][1]["phase"] == "ROLLBACK VERIFIED",
                 "INVOCATION_FIRST_LIVE_TIMELINE")
        origin, stop = body.get("monotonicOriginNs"), body.get("acceptedMonotonicNs")
        first = body.get("firstLiveMonotonicNs")
        need(type(origin) is int and origin >= 0 and type(stop) is int and stop >= origin
             and type(body.get("monotonicResolutionNs")) is int
             and 0 < body["monotonicResolutionNs"] <= 1000000000
             and body["observedInvocationMs"] == (stop - origin) / 1e6,
             "INVOCATION_MONOTONIC_SAMPLES")
        need(first is None or (type(first) is int and origin <= first <= stop),
             "INVOCATION_FIRST_LIVE_SAMPLE")
        if coverage == "full":
            need(first is not None and live == (first - origin) / 1e6
                 and accepted == (stop - origin) / 1e6,
                 "INVOCATION_MONOTONIC_HEADLINES")
        need(type(body.get("githubRunId")) is int and body["githubRunId"] > 0,
             "INVOCATION_RUN_ID")
        manifest_path = MANIFEST_BASE / (
            state["source"][:12] + "-run-" + str(body["githubRunId"]) + ".json")
        trusted(MANIFEST_BASE, 0o700, directory=True)
        trusted(manifest_path, 0o600)
        manifest = json.loads(manifest_path.read_bytes())
        # Historical V2 was ROOT-backed. V3 is the reviewed DATA-backed
        # Factory artifact transport. Never accept V3 identity via a V2
        # schema downgrade or a merely matching archive checksum.
        schema = manifest.get("schema")
        need(schema in ("aoe2war.product.web-release-manifest.v2",
                        "aoe2war.product.web-release-manifest.v3")
             and manifest.get("source") == state["source"]
             and manifest.get("build") == state["build"]
             and manifest.get("github_run_id") == body["githubRunId"]
             and manifest.get("archive_sha256") == body["artifactSha256"]
             and manifest.get("archive_bytes") == body["runtimeArchiveBytes"]
             and manifest.get("previous_source") == body["previousSourceSha"]
             and manifest.get("previous_build") == body["previousBuildId"]
             and manifest.get("financial_authorized") is False,
             "INVOCATION_ROOT_MANIFEST_IDENTITY")
        if schema.endswith(".v2"):
            # A V3 DATA identity cannot be relabeled as historical ROOT V2.
            need(not any(key in manifest for key in
                         ("transport_mode", "archive_dev", "archive_inode")),
                 "INVOCATION_ROOT_MANIFEST_IDENTITY")
        else:
            need(manifest.get("transport_mode") == "data-archive-v1"
                 and type(manifest.get("archive_dev")) is int
                 and manifest["archive_dev"] == DATA_STAGE_DEV
                 and type(manifest.get("archive_inode")) is int
                 and manifest["archive_inode"] > 0,
                 "INVOCATION_ROOT_MANIFEST_DATA_IDENTITY")
            stage = DATA_STAGE_BASE / (".aoe2war-b-os-" + state["source"][:12]
                                 + "-run-" + str(body["githubRunId"]))
            archive = stage / "runtime.tar.gz"
            need(manifest.get("archive_path") == str(archive),
                 "INVOCATION_ROOT_MANIFEST_DATA_PATH")
            trusted(stage, 0o700, directory=True)
            trusted(archive, 0o400)
            # Root has already promoted the immutable DATA member. Check its
            # genuine mounted identity and contents, not just manifest fields.
            fd = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                before = os.fstat(fd)
                need(before.st_dev == manifest["archive_dev"]
                     and before.st_ino == manifest["archive_inode"]
                     and before.st_size == manifest["archive_bytes"]
                     and before.st_uid == OWNER_UID and before.st_nlink == 1
                     and stat.S_ISREG(before.st_mode)
                     and stat.S_IMODE(before.st_mode) == 0o400,
                     "INVOCATION_ROOT_MANIFEST_DATA_INODE")
                archive_hash = hashlib.sha256()
                while True:
                    chunk = os.read(fd, 1024 * 1024)
                    if not chunk:
                        break
                    archive_hash.update(chunk)
                after = os.fstat(fd)
                need((before.st_dev, before.st_ino, before.st_size,
                      before.st_mtime_ns, before.st_ctime_ns) ==
                     (after.st_dev, after.st_ino, after.st_size,
                      after.st_mtime_ns, after.st_ctime_ns)
                     and archive_hash.hexdigest() == body["artifactSha256"],
                     "INVOCATION_ROOT_MANIFEST_DATA_DIGEST_OR_RACE")
            finally:
                os.close(fd)
        evidence_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            for selected_row, filename in (
                (rollback_rows[0][1], "public-evidence-T8-v1.json"),
                (reactivate_rows[0][1], "public-evidence-T9-v1.json"),
            ):
                need(type(selected_row["proofSha256"]) is str
                     and re.fullmatch("[0-9a-f]{64}", selected_row["proofSha256"]),
                     "INVOCATION_WITNESS_SHA")
                contents(filename, evidence_fd, selected_row["proofSha256"])
        finally:
            os.close(evidence_fd)

        for receipt_name in NAMES - {"deployment-invocation-v1.json"}:
            trusted(journal / receipt_name, 0o600)
        need(re.fullmatch("[0-9a-f]{64}", body.get("rootSealSha256", "")),
             "INVOCATION_ROOT_SEAL_SHA")
        read_fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            seal_raw = contents("release-seal-v1.json", read_fd, body["rootSealSha256"])
        finally:
            os.close(read_fd)
        seal = json.loads(seal_raw)
        need(seal.get("schema") == "aoe2war.product.release-seal.v1"
             and seal.get("sourceSha") == state["source"]
             and seal.get("buildId") == state["build"]
             and seal.get("financialAuthorized") is False,
             "INVOCATION_ROOT_SEAL_IDENTITY")
        rollback = json.loads((journal / "public-evidence-T8-v1.json").read_bytes())
        need(rollback.get("sourceSha") == body["previousSourceSha"]
             and rollback.get("buildId") == body["previousBuildId"],
             "INVOCATION_PREVIOUS_IDENTITY")

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
    need(match is not None and
         (match.group(2) in RECEIPT_NAMES or match.group(2) == INVOCATION_RECEIPT_NAME),
         "ROOT_RECEIPT_PATH_SCOPE")
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


def record_post_t10_retention_intent(approval, release_work):
    """Original Factory post-T10 planning only, never a release/retire authority.

    The genuine T10 source/receipt contract wins: the optional retention note
    may fail closed without changing a sealed website or triggering a transfer.
    No new host read, service, signer or worker is introduced here.
    """
    names = ("release-seal-v1.json", "release-events-v1.jsonl",
             "public-evidence-T8-v1.json")
    try:
        from aoe2_factory_retention_post_t10 import (
            plan_only_after_exact_t10, canonical,
        )
        values = {}
        for name in names:
            path = release_work / name
            transport.checked_file(path)
            info = path.lstat()
            need(info.st_size <= 2_000_000, "RETENTION_INPUT_SIZE")
            values[name] = path.read_bytes()
        intent = plan_only_after_exact_t10(
            source_sha=approval["sourceSha"], build_id=approval["buildId"],
            seal_raw=values["release-seal-v1.json"],
            ledger_raw=values["release-events-v1.jsonl"],
            t8_raw=values["public-evidence-T8-v1.json"],
        )
        seal_once(release_work / "post-t10-retention-intent-v1.json",
                  canonical(intent) + b"\\n")
        print(json.dumps({
            "phase": "post-T10-retention", "state": "plan-only",
            "sourceSha": approval["sourceSha"], "buildId": approval["buildId"],
            "intentSha256": intent["canonical_sha256"],
            "copyAuthorized": False, "retirementAuthorized": False,
            "nextAction": intent["next_action"],
        }), flush=True)
    except (OSError, RuntimeError, ValueError, ImportError, KeyError):
        print(json.dumps({
            "phase": "post-T10-retention", "state": "hold",
            "reason": "ORIGINAL_T10_SOURCE_OR_RETENTION_RECEIPT_NOT_ADMITTED",
            "sourceSha": approval.get("sourceSha"),
            "copyAuthorized": False, "retirementAuthorized": False,
        }), flush=True)


def run_main(invocation):
    global DIAGNOSTIC_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval", required=True)
    parser.add_argument("--phase", choices=("plan", "transport", "release"), default="plan")
    parser.add_argument("--work-dir", default=str(Path.home() / ".aoe2war-product-releases"))
    args = parser.parse_args()
    need(sys.platform == "darwin" and os.getuid() == 501, "EXISTING_MAC_B_OWNER_REQUIRED")
    approval = load_approval(args.approval, args.phase)
    invocation.identify(approval)
    work = release_work = log = None
    prior = []
    if args.phase != "plan":
        work = transport.private_dir(args.work_dir)
        release_work = transport.private_dir(work / ("run-" + str(approval["runId"])))
        DIAGNOSTIC_DIR = release_work
        log = release_work / "release-events-v1.jsonl"
        prior = ledger.read(log, approval["sourceSha"])
        invocation.classify(prior)
        invocation.bind(work)
        invocation.announce(args.phase)
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
            reconcile_invocation(
                invocation, approval, release_work, journal,
                permit_write=(args.phase == "release"),
            )
            if args.phase == "release":
                record_post_t10_retention_intent(approval, release_work)
            print("PASS_ALREADY_ACCEPTED_EXACT_SOURCE_ROOT_SEAL_VERIFIED")
            return
    if args.phase == "plan":
        invocation.announce("plan")
    pr, run, qualified = qualify(approval)
    invocation.record("SOURCE VERIFIED")
    invocation.record("CI ACCEPTED")
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
    warm = verified_local_cache(approval, work)
    invocation.classify(prior, warm=warm)
    invocation.local_cache = "verified" if warm else "miss"
    stage, proof = prepare_artifacts(approval, work, log, invocation=invocation)
    remote = deliver(approval, stage, proof, log, invocation=invocation)
    if args.phase == "release":
        release(approval, remote, proof, log, release_work, invocation=invocation)
        record_post_t10_retention_intent(approval, release_work)
    else:
        print(json.dumps(ledger.summary(ledger.read(log), approval["buildId"])), flush=True)


def main():
    # S0 precedes parsing, permit validation, qualification, downloads and SSH.
    invocation = (DeploymentInvocation(script_start=_SCRIPT_INVOCATION_START)
                  if _SCRIPT_INVOCATION_START is not None else DeploymentInvocation())
    try:
        return run_main(invocation)
    except BaseException as error:
        if isinstance(error, SystemExit) and error.code in (None, 0):
            raise
        if isinstance(error, KeyboardInterrupt):
            reason = "HOLD_PRODUCT_RELEASE_INTERRUPTED_RESUME_FROM_VERIFIED_CHECKPOINT"
        elif isinstance(error, SystemExit):
            reason = "HOLD_PRODUCT_RELEASE_ARGUMENTS"
        else:
            matches = re.findall(r"HOLD_[A-Z0-9_]{1,140}", str(error))
            reason = matches[-1] if matches else "HOLD_PRODUCT_RELEASE_IO_NETWORK_OR_EVIDENCE_PARSE"
        try:
            invocation.record("FINAL RESULT", "hold")
            print(json.dumps({
                "phase": "FINAL RESULT", "state": "hold", "reason": reason,
                "invocationId": invocation.invocation_id,
                "sourceSha": invocation.source, "buildId": invocation.build,
            }), flush=True)
        except Exception:
            pass
        raise


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
