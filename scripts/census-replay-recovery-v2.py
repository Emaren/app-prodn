#!/usr/bin/env python3
"""Read-only result-recovery census; every proposed recovery remains candidate-only.

Uses the existing Truth OS production boundary and existing modern receipt
planner. Sends observer code by SSH evaluation, without deploying source or
writing a production row. Full private receipts are immutable and hash-named.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

import aoe2_truth as truth

ROOT = Path(__file__).resolve().parents[1]


def digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def bundle_observer() -> str:
    base = truth.REMOTE_PROGRAM.read_text()
    observer_path = ROOT / "scripts/replay_recovery_census_remote.mjs"
    helper_path = ROOT / "lib/replayRecoveryCensus.ts"
    writer_path = ROOT / "lib/watcherReceiptPromotion.ts"
    helper = helper_path.read_text()
    # A dependency-free helper is compiled locally, then imported from a data
    # URL. Production resolves only its own shared public authority modules.
    compilation = subprocess.run(
        ["node", "-e", "const ts=require('typescript');let s='';"
         "process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);"
         "process.stdin.on('end',()=>process.stdout.write(ts.transpileModule(s,"
         "{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText));"],
        input=helper, text=True, capture_output=True, cwd=ROOT, timeout=30, check=True,
    )
    module_url = "data:text/javascript;base64," + base64.b64encode(compilation.stdout.encode()).decode()
    sql = re.search(r"WATCHER_RECEIPT_SNAPSHOT_SQL = `(.*?)`;", writer_path.read_text(), re.S)
    if sql is None:
        raise ValueError("preserved_receipt_snapshot_contract_missing")
    fingerprints = {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in
                    [truth.REMOTE_PROGRAM, observer_path, helper_path, writer_path, Path(__file__)]}
    observer = observer_path.read_text().replace("__RECOVERY_HELPER_MODULE_URL__", module_url)
    observer = observer.replace("__RECEIPT_SNAPSHOT_SQL__", json.dumps(sql.group(1)))
    observer = observer.replace("__SOURCE_FINGERPRINTS__", json.dumps(fingerprints))
    if "__RECOVERY_" in observer or "__SOURCE_FINGERPRINTS__" in observer:
        raise ValueError("observer_bundle_incomplete")
    return base[:base.rindex("main().catch(")] + observer


def observe() -> dict:
    with tempfile.TemporaryDirectory(prefix="aoe2war-recovery-observer-") as directory:
        program = Path(directory) / "remote.mjs"
        program.write_text(bundle_observer())
        original_program = truth.REMOTE_PROGRAM
        try:
            truth.REMOTE_PROGRAM = program
            shell = truth.remote_shell("census", None)
        finally:
            truth.REMOTE_PROGRAM = original_program
        response = subprocess.run(
            ["ssh", "-T", "-o", "BatchMode=yes", "-o", "LogLevel=ERROR", truth.SSH_TARGET, "bash", "-s"],
            input=shell, text=True, capture_output=True, timeout=600, check=False,
        )
    if response.returncode:
        raise RuntimeError("read_only_observer_failed: " + (response.stderr.strip()[-2000:] or "production source/service continuity guard rejected the observation"))
    report = json.loads(response.stdout)
    if report.get("databaseWrites") != 0 or report.get("authorityGranted") is not False:
        raise ValueError("observer_authority_contract_changed")
    return report


def plan_modern(report: dict, args: argparse.Namespace) -> dict:
    snapshots = report["modernSnapshots"]
    if len(snapshots) > 64:
        raise ValueError("modern_canary_bound_exceeded")
    plans = []
    for row in snapshots:
        result = subprocess.run(
            [str(args.python), str(args.api_root / "scripts/plan_watcher_receipt_promotion.py"),
             "--archive-dir", str(args.archive_dir)],
            input=json.dumps({"snapshot_json": row["snapshotJson"]}), text=True,
            capture_output=True, timeout=100, cwd=args.api_root,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, check=True,
        )
        plan = json.loads(result.stdout)
        if (plan.get("source_snapshot_json") != row["snapshotJson"] or
                plan.get("snapshot_sha256") != digest(row["snapshotJson"].encode()) or
                plan.get("game_stats_id") != row["gameStatsId"] or
                plan.get("candidate_only") is not True or plan.get("authority_granted") is not False or
                any(plan.get(key) is not False for key in
                    ["affects_stats", "affects_bets", "settlement_authorized", "wolo_authority"])):
            raise ValueError("planner_source_or_authority_binding_changed")
        plans.append(plan)
    reasons: dict[str, int] = {}
    for plan in plans:
        reason = plan.get("reason", "missing_planner_reason")
        reasons[reason] = reasons.get(reason, 0) + 1
    return {"casesInspected": len(plans), "eligibleCandidates": sum(p["eligible"] is True for p in plans),
            "rawBlockers": reasons, "plans": plans, "safeYield": 0, "authorityGranted": False,
            "note": "Fresh planner candidates still require the app-owned fenced writer; no apply mode exists here."}


def persist(report: dict, directory: Path) -> dict:
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    if directory.is_symlink():
        raise ValueError("receipt_directory_symlink")
    body = (json.dumps(report, indent=2, sort_keys=True) + "\n").encode()
    sha = digest(body)
    path = directory / f"recovery-v2-{sha}.json"
    with path.open("xb") as handle:
        os.fchmod(handle.fileno(), 0o400)
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())
    return {"path": str(path.resolve()), "sha256": sha, "bytes": len(body)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt-dir", type=Path, default=truth.RECEIPT_DIR)
    parser.add_argument("--api-root", type=Path)
    parser.add_argument("--python", type=Path)
    parser.add_argument("--archive-dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    runtime = [args.api_root, args.python, args.archive_dir]
    if any(runtime) and (not all(runtime) or not all(p.is_absolute() for p in runtime)):
        parser.error("modern planning requires all three absolute runtime paths")
    report = observe()
    if all(runtime):
        report["modernRevalidation"] = plan_modern(report, args)
    report["after"] = truth.run_remote("census")
    report["productionMutatedByThisCommand"] = False
    report["productionSourceChangedAfterObservation"] = report["productionSource"] != report["after"]["productionSource"]
    report["inventoryCountsChangedAfterObservation"] = (report["finalBattles"] != report["after"]["finalGames"] or report["resolved"] != report["after"]["coverage"]["resultResolved"])
    report["appSourceCommit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    report["projectedResultAdditions"] = 0
    report["receipt"] = receipt = persist(report, args.receipt_dir)
    summary = {k: v for k, v in report.items() if k not in ["cases", "modernSnapshots", "modernRevalidation"]}
    if "modernRevalidation" in report:
        summary["modernRevalidation"] = {k: v for k, v in report["modernRevalidation"].items() if k != "plans"}
    print(json.dumps(summary if args.json else {"receipt": receipt, "resolved": report["resolved"],
          "finalBattles": report["finalBattles"], "unresolved": report["unresolved"],
          "resolvedPercent": report["resolvedPercent"], "safeRules": report["safeRules"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
