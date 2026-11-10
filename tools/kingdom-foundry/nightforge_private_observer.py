"""F11 one-shot PRODUCT-only observe -> F1 HOLD -> F9 0600 dashboard.

Explicit manual call only. This is NOT a daemon, service, agent queue,
market feed, system health certificate or release authorization.
The source CODE checkout may be locally Git-pinned, but observation
AUTHORITY stays unknown even if the SHA and clock look valid.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import argparse
import json
import os
import re
import subprocess
import sqlite3
import sys

from foundry import Rejected
from foundry_secure import SecureJournal, TrustedRepo, PROTECTED_PARTS
from foundry_dashboard import write_private_export
from foundry_hold_only import preview_untrusted_observations
from nightforge_collectors import canonical, LOCAL_MODE
from nightforge_host_probes import (
    HOST_SYSTEMD, probe_systemd_local, probe_local_storage,
    evaluate_untrusted_local_probe,
)

MAX_SOURCE_BYTES=4096
ID = re.compile(r"[a-z0-9_-]{3,60}\Z")
SHA40 = re.compile(r"[0-9a-f]{40}\Z")
ALLOWED_ORIGINS = frozenset((
    "git@github.com:Emaren/app-prodn.git",
    "https://github.com/Emaren/app-prodn.git",
    "https://github.com/Emaren/app-prodn",
))
JOURNAL_NAME="foundry-f11-local-hold.sqlite"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _private_scope(*, product_root: Path, repo_checkout: Path, private_dir: Path):
    try:
        product=Path(product_root).expanduser().resolve(strict=True)
        checkout=Path(repo_checkout).expanduser().resolve(strict=True)
        private=Path(private_dir).expanduser().absolute()
        real=private.resolve(strict=True)
    except (OSError,RuntimeError):
        raise Rejected("HOLD_F11_PRIVATE_ROOT_MISSING") from None
    if (not product.is_dir() or not checkout.is_dir() or
        checkout != Path(__file__).resolve().parents[2] or
        checkout == product or not checkout.is_relative_to(product) or
        not real.is_dir() or real != private or
        not real.is_relative_to(product) or
        real == product or real.is_relative_to(checkout) or
        any(x.lower() in PROTECTED_PARTS for x in real.parts) or
        any(x.lower() in PROTECTED_PARTS for x in checkout.parts) or
        real.stat().st_mode & 0o077):
        raise Rejected("HOLD_F11_OWNER_PRIVATE_PRODUCT_ONLY")
    # F9 refuses database hardlinks. Do not write into one first.
    journal=real/JOURNAL_NAME
    if (journal.is_symlink() or
        journal.exists() and (
            not journal.is_file() or journal.stat().st_nlink != 1 or
            journal.stat().st_mode & 0o077)):
        raise Rejected("HOLD_F11_PREEXISTING_JOURNAL_UNSAFE")
    return product,checkout,real,journal


def _exact_clean_source(product: Path, checkout: Path, source_sha: str):
    """Local CODE fingerprint, not an observation or remote attestation."""
    def git(*args):
        try:
            r = subprocess.run(
                ["git", "-c", "core.hooksPath=/dev/null", "-C",
                 str(checkout), *args],
                shell=False, capture_output=True, text=True, timeout=5,
                env={"PATH":os.environ.get("PATH","/usr/bin:/bin"),
                     "HOME":str(product),"GIT_CONFIG_NOSYSTEM":"1",
                     "GIT_CONFIG_GLOBAL":os.devnull,
                     "GIT_TERMINAL_PROMPT":"0"},
            )
        except (OSError,subprocess.TimeoutExpired):
            raise Rejected("HOLD_F11_SOURCE_GIT_UNAVAILABLE") from None
        if r.returncode or r.stderr or len(r.stdout)>2048:
            raise Rejected("HOLD_F11_SOURCE_GIT_UNAVAILABLE")
        return r.stdout.strip()
    origin=git("remote","get-url","origin")
    if origin not in ALLOWED_ORIGINS:
        raise Rejected("HOLD_F11_ORIGIN_NOT_APP_SOURCE")
    repo=TrustedRepo("app-prodn",checkout,source_sha,origin)
    repo.verify(product,source_sha)
    if git("status","--porcelain=v1","--untracked-files=normal"):
        raise Rejected("HOLD_F11_DIRTY_CODE_CHECKOUT")
    return repo


def record_one_untrusted_local_observation(
    raw: bytes, *,
    product_root: Path, repo_checkout: Path, private_dir: Path,
    approved_source_sha: str, receipt_id: str,
    owner_now_utc: str | None = None,
) -> dict:
    """One observation: durable source-UNKNOWN F1 HOLD, then private F9 HTML.

    A journal commit is durable before HTML export. If export fails/crashes,
    repeat with a different receipt_id: identical observation is idempotent.
    A missing HTML file is never claimed as successful; no F2 job is made.
    """
    if type(receipt_id) is not str or not ID.fullmatch(receipt_id):
        raise Rejected("HOLD_F11_RECEIPT_ID_INVALID")
    if type(approved_source_sha) is not str or not SHA40.fullmatch(approved_source_sha):
        raise Rejected("HOLD_F11_SOURCE_PIN_MISSING")
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_SOURCE_BYTES:
        raise Rejected("HOLD_F11_RAW_OBSERVATION_BOUNDS")
    product,checkout,private,journal_path=_private_scope(
        product_root=product_root,repo_checkout=repo_checkout,
        private_dir=private_dir)
    report=evaluate_untrusted_local_probe(raw,owner_now_utc=(
        _utc_now() if owner_now_utc is None else owner_now_utc))
    if (report["sourceAttribution"] != "UNATTESTED_LOCAL_READONLY_PROBE" or
        report["kind"] not in ("storage","systemd") or
        report["sourceGitSHA"] != "unknown" or
        report["event"]["source_sha"] != "unknown" or
        report["dispatchAllowed"] is not False or
        report["executionEnabled"] is not False):
        raise Rejected("HOLD_F11_COLLECTOR_AUTHORITY")
    # Verify only the exact code checkout using the ORIGINAL F1 local Git
    # guard. A valid source SHA does NOT authenticate the status report.
    repo=_exact_clean_source(product,checkout,approved_source_sha)
    observation=report["event"]
    binding={(observation["lane"],observation["source"]):repo}
    db=SecureJournal(journal_path,product,binding)
    try:
        stored=db.ingest(canonical(observation),report["evidence_bytes"])
        if stored["status"] not in ("HOLD","DUPLICATE","DUPLICATE_TASK"):
            raise Rejected("HOLD_F11_EVENT_PROMOTED_UNEXPECTEDLY")
    finally:
        db.close()
    # Use a fresh SQLite mode=ro connection to check EVERY row, not
    # just the visible most-recent page. Any different trusted record
    # or scheduler audit aborts the export.
    state=preview_untrusted_observations(journal_path,product_root=product)
    destination=private/("foundry-private-"+receipt_id+".html")
    output=write_private_export(state,destination,private_root=private)
    return {
        "schema":"kingdom.foundry.f11-one-shot-source-hold.v1",
        "status":"PASS_OWNER_PRIVATE_UNATTESTED_HOLD_ONLY",
        "locallyPinnedCodeSHA":approved_source_sha,
        "locallyPinnedCodeNotRemoteAttestation":True,
        "observationSourceSha":"unknown",
        "untrustedObservationSHA256":report["observationSHA256"],
        "sourceAuthenticated":False,
        "observationExternallyAttested":False,
        "journalResult":stored["status"],
        "journalSeq":stored["sequence"],
        "journalRecordsShown":state["entriesShown"],
        "hasVerifiedSchedulerAudit":False,
        "htmlSha256":output["sha256"],
        "htmlBytes":output["bytes"],
        "htmlModeOctal":"0600",
        "networkCalls":0,
        "webRoutesCreated":0,
        "tasksDispatched":0,
        "agentExecutions":0,
        "financialMutations":0,
        "newPaperOrders":0,
        "realOrders":0,
        "fundingOrWoloMoves":0,
    }


def _observation(kind: str, *, unit: str | None, linux_pin: str | None,
                 lane: str, observed_utc: str):
    if kind=="mac-storage":
        if unit is not None or linux_pin is not None:
            raise Rejected("HOLD_F11_MAC_SCOPE")
        return probe_local_storage("M1_MAC_LOCAL",lane=lane,
                                   observed_utc=observed_utc)
    if kind=="hel1-root":
        if unit is not None:
            raise Rejected("HOLD_F11_LINUX_SCOPE")
        return probe_local_storage(
            "HEL1_ROOT_LOCAL",lane=lane,observed_utc=observed_utc,
            approved_linux_machine_id_sha256=linux_pin)
    if kind=="systemd":
        if linux_pin is not None or unit not in HOST_SYSTEMD:
            raise Rejected("HOLD_F11_SYSTEMD_SCOPE")
        return probe_systemd_local(unit,lane=lane,
                                   observed_utc=observed_utc)
    raise Rejected("HOLD_F11_UNSUPPORTED_KIND")


def main(argv=None):
    parser=argparse.ArgumentParser(
        description="Manual one-shot: untrusted PRODUCT status -> 0600 HOLD HTML")
    choice=parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--mac-storage",action="store_true")
    choice.add_argument("--hel1-root",action="store_true")
    choice.add_argument("--systemd-unit",choices=sorted(HOST_SYSTEMD))
    parser.add_argument("--approved-linux-machine-id-sha256")
    parser.add_argument("--product-root",required=True,type=Path)
    parser.add_argument("--private-dir",required=True,type=Path)
    parser.add_argument("--approved-source-sha",required=True)
    parser.add_argument("--receipt-id",required=True)
    args=parser.parse_args(argv)
    kind=("mac-storage" if args.mac_storage else
          "hel1-root" if args.hel1_root else "systemd")
    try:
        observed=_utc_now()
        raw=_observation(kind,unit=args.systemd_unit,
                         linux_pin=args.approved_linux_machine_id_sha256,
                         lane="PRODUCT_C",observed_utc=observed)
        receipt=record_one_untrusted_local_observation(
            raw,product_root=args.product_root,
            repo_checkout=Path(__file__).resolve().parents[2],
            private_dir=args.private_dir,
            approved_source_sha=args.approved_source_sha,
            receipt_id=args.receipt_id,
            owner_now_utc=_utc_now())
    except (Rejected,OSError,ValueError,sqlite3.Error):
        # Do not echo private receipt paths, source content or host logs.
        print("HOLD_F11_ONE_SHOT_SOURCE_OR_PRIVATE_RECEIPT",file=sys.stderr)
        return 2
    print(json.dumps(receipt,sort_keys=True,separators=(",",":")))
    return 0


if __name__=="__main__":
    sys.exit(main())
