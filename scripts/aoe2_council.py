#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "aoe2war"


def command_json(*args: str, timeout: int = 120) -> dict[str, Any]:
    proc = subprocess.run(
        [str(CLI), *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    try:
        payload = json.loads(proc.stdout)
    except Exception as exc:
        raise RuntimeError(
            f"{' '.join(args)} did not return JSON rc={proc.returncode}: "
            f"{proc.stdout[-3000:]}"
        ) from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"{' '.join(args)} returned non-object JSON")
    return payload


def docs_due() -> int | None:
    proc = subprocess.run(
        [str(CLI), "docs", "status"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=90,
        check=False,
    )
    match = re.search(r"Review due ≤7 days:\s+(\d+)", proc.stdout)
    return int(match.group(1)) if match else None


def latest_pulse() -> dict[str, Any] | None:
    root = ROOT / ".aoe2war-release" / "site-pulse-receipts"
    if not root.is_dir():
        return None
    for path in sorted(root.glob("*.json"), reverse=True):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
    return None


def ready_coverage() -> dict[str, Any]:
    try:
        import aoe2_speed

        ready = aoe2_speed.ready_coverage()
        baseline = aoe2_speed.baseline_zero_summary() or {}
        return {
            "ready_routes": int(ready.get("ready_route_count") or 0),
            "marker_mounts": int(ready.get("ready_marker_usages") or 0),
            "baseline_routes": int(
                baseline.get("route_count")
                or (baseline.get("cohort") or {}).get("route_count")
                or 66
            ),
        }
    except Exception:
        return {
            "ready_routes": 0,
            "marker_mounts": 0,
            "baseline_routes": 66,
        }


def architecture_opportunities() -> list[str]:
    path = ROOT / "ARCHITECTURE.md"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    marker = (
        "signed-but-unrecorded stake recovery "
        "is not yet reconciled automatically"
    )
    return [marker] if marker in text else []


def add(
    items: list[dict[str, Any]],
    *,
    rank: int,
    level: str,
    key: str,
    title: str,
    reason: str,
    action: str,
) -> None:
    if any(item["key"] == key for item in items):
        return
    items.append(
        {
            "rank": rank,
            "level": level,
            "key": key,
            "title": title,
            "reason": reason,
            "action": action,
        }
    )


def build_recommendations(
    *,
    audit: dict[str, Any],
    doctor: dict[str, Any],
    storage: dict[str, Any],
    host: dict[str, Any],
    recovery: dict[str, Any],
    workspace: dict[str, Any],
    pulse: dict[str, Any] | None,
    due_docs: int | None,
    ready: dict[str, Any],
    architecture: list[str],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    if int(audit.get("p0") or 0):
        add(
            items,
            rank=0,
            level="BLOCKER",
            key="estate-p0",
            title="Estate has P0 findings",
            reason=f"P0={audit.get('p0')}",
            action="aoe2war audit",
        )
    if int(audit.get("p1") or 0):
        add(
            items,
            rank=5,
            level="MUST FIX",
            key="estate-p1",
            title="Estate has P1 findings",
            reason=f"P1={audit.get('p1')}",
            action="aoe2war audit",
        )

    if recovery.get("status") != "VERIFIED":
        add(
            items,
            rank=10,
            level="MUST FIX",
            key="offsite-evidence",
            title="Complete off-host recovery proof",
            reason=(
                "VPS root and mounted evidence volume still share one "
                "failure domain."
            ),
            action="aoe2war recovery plan",
        )

    storage_health = str(
        storage.get("health") or storage.get("status") or ""
    ).upper()
    used = (
        storage.get("volume_used_percent")
        or storage.get("used_percent")
        or (storage.get("volume") or {}).get("used_percent")
    )
    if storage_health not in {"HEALTHY", "PASS"}:
        add(
            items,
            rank=20,
            level="DO NOW",
            key="storage-health",
            title="Return Storage OS to healthy band",
            reason=(
                f"Storage health={storage_health or 'ATTENTION'} "
                f"used={used if used is not None else 'unknown'}"
            ),
            action=(
                "aoe2war storage maintain --apply "
                "--until-target --max-generations 25"
            ),
        )

    if int(host.get("failed_transient") or 0):
        add(
            items,
            rank=22,
            level="AUTO HYGIENE",
            key="failed-transients",
            title="Clear recorded failed release transients",
            reason=(
                f"{host.get('failed_transient')} old AoE2WAR build/deps "
                "units remain failed."
            ),
            action="aoe2war host tidy --apply --transients-only",
        )

    if (
        host.get("traffic_timer_enabled") == "enabled"
        and host.get("traffic_timer_active") != "active"
    ):
        add(
            items,
            rank=23,
            level="FIX NOW",
            key="traffic-rollup-timer",
            title="Rearm Traffic daily-rollup timer",
            reason=(
                "Timer is enabled but inactive after unit files "
                "changed on disk."
            ),
            action="aoe2war host tidy --apply",
        )

    if host.get("reboot_required"):
        waiting = recovery.get("status") != "VERIFIED"
        add(
            items,
            rank=30 if waiting else 15,
            level="WAITING ON RECOVERY" if waiting else "DO NOW",
            key="reboot-required",
            title="Perform protected host patch/reboot",
            reason=(
                f"{host.get('updates', 0)} package updates pending; "
                "reboot required."
            ),
            action="aoe2war host maintenance-plan",
        )

    if pulse is None:
        add(
            items,
            rank=40,
            level="SYSTEMIZE",
            key="site-pulse-missing",
            title="Establish post-release site-speed pulse",
            reason="No persisted critical-route pulse exists yet.",
            action="aoe2war speed pulse",
        )
    elif pulse.get("status") in {"WARN", "FAIL"}:
        add(
            items,
            rank=25,
            level="PERFORMANCE",
            key="site-pulse-regression",
            title="Investigate site-speed pulse",
            reason=f"Latest pulse status={pulse.get('status')}.",
            action="aoe2war speed pulse",
        )

    cleanup_count = len(workspace.get("cleanup_candidates") or [])
    if cleanup_count:
        add(
            items,
            rank=45,
            level="HOUSEKEEPING",
            key="workspace-clean",
            title="Remove clean merged worktrees",
            reason=(
                f"{cleanup_count} registered worktrees are clean and "
                "already merged into main."
            ),
            action="aoe2war workspace clean --apply",
        )

    if workspace.get("orphans"):
        add(
            items,
            rank=55,
            level="REVIEW",
            key="workspace-orphans",
            title="Classify unregistered project directories",
            reason=(
                f"{len(workspace['orphans'])} app-prodn-* sibling(s) "
                "are not registered worktrees."
            ),
            action="aoe2war workspace status",
        )

    if due_docs:
        add(
            items,
            rank=60,
            level="UPCOMING",
            key="docs-review",
            title="Documentation reviews approaching",
            reason=f"{due_docs} document review(s) due within seven days.",
            action="aoe2war docs status",
        )

    if architecture:
        add(
            items,
            rank=65,
            level="HIGH PRODUCT PRIORITY",
            key="stake-recovery",
            title="Close signed-but-unrecorded stake recovery",
            reason=architecture[0],
            action=(
                "Review ARCHITECTURE.md financial recovery seam "
                "before scaling money activity."
            ),
        )

    if ready.get("ready_routes", 0) < ready.get("baseline_routes", 66):
        add(
            items,
            rank=70,
            level="BACKLOG",
            key="ready-coverage",
            title="Grow route-level readiness coverage",
            reason=(
                f"{ready.get('ready_routes', 0)}/"
                f"{ready.get('baseline_routes', 66)} public routes "
                "have explicit readiness markers."
            ),
            action="aoe2war speed diagnose",
        )

    return sorted(items, key=lambda item: (item["rank"], item["key"]))


def collect() -> dict[str, Any]:
    doctor = command_json("doctor", "--json", timeout=180)
    audit = ((doctor.get("info") or {}).get("estate") or {})
    if not isinstance(audit, dict) or "p0" not in audit:
        audit = command_json("audit", "--json", timeout=180)
    storage = command_json("storage", "status", "--json", timeout=90)
    host = command_json("host", "status", "--json", timeout=90)
    recovery = command_json("recovery", "status", "--json", timeout=30)
    workspace = command_json(
        "workspace",
        "status",
        "--json",
        timeout=60,
    )
    pulse = latest_pulse()
    due = docs_due()
    ready = ready_coverage()
    architecture = architecture_opportunities()

    recs = build_recommendations(
        audit=audit,
        doctor=doctor,
        storage=storage,
        host=host,
        recovery=recovery,
        workspace=workspace,
        pulse=pulse,
        due_docs=due,
        ready=ready,
        architecture=architecture,
    )
    return {
        "schema": 1,
        "kind": "aoe2war-council",
        "estate": audit.get("estate"),
        "p0": int(audit.get("p0") or 0),
        "p1": int(audit.get("p1") or 0),
        "doctor_score": doctor.get("score"),
        "doctor_status": doctor.get("status"),
        "recommendations": recs,
        "best_next_action": recs[0] if recs else None,
        "storage": storage,
        "host": host,
        "recovery": recovery,
        "workspace": {
            "cleanup_candidates": len(
                workspace.get("cleanup_candidates") or []
            ),
            "dirty_count": workspace.get("dirty_count"),
            "unmerged_count": workspace.get("unmerged_count"),
            "orphans": workspace.get("orphans"),
        },
        "performance_pulse": pulse,
        "ready_coverage": ready,
        "docs_due_7d": due,
        "architecture_opportunities": architecture,
    }


def print_payload(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR COUNCIL")
    print()
    print(f"Estate:          {payload.get('estate')}")
    print(
        f"Doctor:          {payload.get('doctor_score')}/100 · "
        f"{payload.get('doctor_status')}"
    )
    print(f"Recommendations: {len(payload['recommendations'])}")
    print()
    if not payload["recommendations"]:
        print("COUNCIL: NOTHING URGENT — build.")
        return
    for index, item in enumerate(payload["recommendations"], 1):
        print(f"{index:>2}. [{item['level']}] {item['title']}")
        print(f"    Why:    {item['reason']}")
        print(f"    Action: {item['action']}")
    best = payload.get("best_next_action")
    if best:
        print()
        print(f"BEST NEXT ACTION: {best['title']}")
        print(f"→ {best['action']}")


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war council")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    payload = collect()
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_payload(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
