#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "aoe2war-operations.json"
RECEIPT_DIR = ROOT / ".aoe2war-release" / "host-receipts"
TRAFFIC_TIMER = "traffic-project-daily-rollups-aoe2hdbets.timer"


def load_contract() -> dict[str, Any]:
    value = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if value.get("schema") != 1:
        raise RuntimeError("invalid operations contract")
    return value


def host_name() -> str:
    contract = load_contract()
    configured = str(
        (contract.get("rollback_archive") or {}).get("root_maintenance_host") or ""
    ).strip()
    if configured:
        return configured
    production = str(
        (contract.get("canonical") or {}).get("production_host") or "hel1"
    ).strip()
    return production if "@" in production else f"root@{production}"


def ssh_script(script: str, timeout: int = 120) -> tuple[int, str]:
    proc = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host_name(),
            "bash -s",
        ],
        cwd=ROOT,
        input=script,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    return proc.returncode, proc.stdout


def parse_kv(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        if "\t" not in line:
            continue
        key, value = line.split("\t", 1)
        result[key] = value
    return result


def is_safe_transient_unit(unit: str) -> bool:
    return (
        unit.startswith("aoe2war-build@") or unit.startswith("aoe2war-deps@")
    ) and unit.endswith(".service")


def snapshot() -> dict[str, Any]:
    remote = r'''set -u -o pipefail
count_port() {
  ss -ltn 2>/dev/null | awk -v p=":$1" '$4 ~ p"$" {c++} END {print c+0}'
}
reboot=0
test -f /var/run/reboot-required && reboot=1
updates="$(apt list --upgradable 2>/dev/null | sed '1d' | wc -l | tr -d ' ')"
failed_all="$(systemctl --failed --no-legend --plain 2>/dev/null | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
failed_transient="$(systemctl --failed --no-legend --plain 2>/dev/null | awk '/aoe2war-(build|deps)@/ {c++} END {print c+0}')"
timer_enabled="$(systemctl is-enabled traffic-project-daily-rollups-aoe2hdbets.timer 2>/dev/null || true)"
timer_active="$(systemctl is-active traffic-project-daily-rollups-aoe2hdbets.timer 2>/dev/null || true)"
timer_next="$(systemctl show traffic-project-daily-rollups-aoe2hdbets.timer -p NextElapseUSecRealtime --value 2>/dev/null || true)"
printf 'reboot_required\t%s\n' "$reboot"
printf 'updates\t%s\n' "$updates"
printf 'failed_all\t%s\n' "$failed_all"
printf 'failed_transient\t%s\n' "$failed_transient"
printf 'timer_enabled\t%s\n' "$timer_enabled"
printf 'timer_active\t%s\n' "$timer_active"
printf 'timer_next\t%s\n' "$timer_next"
printf 'web\t%s\n' "$(systemctl is-active aoe2hdbets-web.service 2>/dev/null || true)"
printf 'api\t%s\n' "$(systemctl is-active aoe2hdbets-api.service 2>/dev/null || true)"
printf 'wolo8092\t%s\n' "$(count_port 8092)"
printf 'wolo8093\t%s\n' "$(count_port 8093)"
printf 'node\t%s\n' "$(node --version 2>/dev/null || true)"
printf 'kernel\t%s\n' "$(uname -r)"
'''
    rc, out = ssh_script(remote, timeout=45)
    if rc != 0:
        raise RuntimeError(f"host snapshot failed rc={rc}: {out[-4000:]}")
    data = parse_kv(out)
    return {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "host": host_name(),
        "reboot_required": data.get("reboot_required") == "1",
        "updates": int(data.get("updates") or 0),
        "failed_all": int(data.get("failed_all") or 0),
        "failed_transient": int(data.get("failed_transient") or 0),
        "traffic_timer_enabled": data.get("timer_enabled"),
        "traffic_timer_active": data.get("timer_active"),
        "traffic_timer_next": data.get("timer_next"),
        "web": data.get("web"),
        "api": data.get("api"),
        "wolo_8092_count": int(data.get("wolo8092") or 0),
        "wolo_8093_count": int(data.get("wolo8093") or 0),
        "node": data.get("node"),
        "kernel": data.get("kernel"),
    }


def maintenance_plan() -> dict[str, Any]:
    snap = snapshot()
    contract = load_contract()
    evidence = contract.get("offsite_evidence") or {}
    recovery_ready = bool(
        evidence.get("enabled")
        and evidence.get("authority")
        and evidence.get("restore_proof")
    )
    return {
        "schema": 1,
        "kind": "aoe2war-host-maintenance-plan",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "READY" if recovery_ready else "BLOCKED",
        "reason": (
            "off-host recovery proof is configured"
            if recovery_ready
            else "off-host recovery proof must be configured before package/reboot maintenance"
        ),
        "recovery_ready": recovery_ready,
        "host": snap,
        "mutates_packages": False,
        "reboots_host": False,
    }


def tidy(*, apply: bool, transients_only: bool) -> dict[str, Any]:
    before = snapshot()
    result: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-host-tidy",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "apply": apply,
        "transients_only": transients_only,
        "before": before,
        "status": "PREVIEW",
    }
    if not apply:
        return result

    full_flag = "0" if transients_only else "1"
    remote = rf'''set -euo pipefail
FULL={shlex.quote(full_flag)}
count_port() {{
  ss -ltn 2>/dev/null | awk -v p=":$1" '$4 ~ p"$" {{c++}} END {{print c+0}}'
}}
before_web="$(systemctl is-active aoe2hdbets-web.service)"
before_api="$(systemctl is-active aoe2hdbets-api.service)"
before_8092="$(count_port 8092)"
before_8093="$(count_port 8093)"
test "$before_web" = "active"
test "$before_api" = "active"
test "$before_8092" = "1"
test "$before_8093" = "1"

mapfile -t units < <(
  systemctl --failed --no-legend --plain \
  | awk '/aoe2war-(build|deps)@/ {{print $1}}'
)
reset=0
for unit in "${{units[@]}}"; do
  case "$unit" in
    aoe2war-build@*.service)
      expected=/etc/systemd/system/aoe2war-build@.service
      ;;
    aoe2war-deps@*.service)
      expected=/etc/systemd/system/aoe2war-deps@.service
      ;;
    *)
      echo "STOP: unexpected transient unit $unit" >&2
      exit 20
      ;;
  esac
  fragment="$(systemctl show "$unit" -p FragmentPath --value)"
  active="$(systemctl show "$unit" -p ActiveState --value)"
  test "$fragment" = "$expected"
  test "$active" = "failed"
  systemctl reset-failed "$unit"
  reset=$((reset + 1))
done

timer_rearmed=0
if [ "$FULL" = "1" ]; then
  systemctl daemon-reload
  if systemctl is-enabled {TRAFFIC_TIMER} >/dev/null 2>&1; then
    systemctl restart {TRAFFIC_TIMER}
    test "$(systemctl is-active {TRAFFIC_TIMER})" = "active"
    next="$(systemctl show {TRAFFIC_TIMER} -p NextElapseUSecRealtime --value)"
    last_trigger="$(systemctl show {TRAFFIC_TIMER} -p LastTriggerUSec --value)"
    rollup_state="$(systemctl show traffic-project-daily-rollups-aoe2hdbets.service -p ActiveState --value)"

    scheduled=0
    if [ -n "$next" ] && [ "$next" != "n/a" ]; then
      scheduled=1
    fi

    triggered_running=0
    if [ -n "$last_trigger" ] && [ "$last_trigger" != "n/a" ]; then
      if [ "$rollup_state" = "active" ] || [ "$rollup_state" = "activating" ]; then
        triggered_running=1
      fi
    fi

    if [ "$scheduled" != "1" ] && [ "$triggered_running" != "1" ]; then
      echo "STOP: Traffic timer rearm lacks valid evidence: next=$next last_trigger=$last_trigger service=$rollup_state" >&2
      exit 21
    fi

    timer_rearmed=1
  fi
fi

test "$(systemctl is-active aoe2hdbets-web.service)" = "active"
test "$(systemctl is-active aoe2hdbets-api.service)" = "active"
test "$(count_port 8092)" = "$before_8092"
test "$(count_port 8093)" = "$before_8093"
printf 'reset_transients\t%s\n' "$reset"
printf 'timer_rearmed\t%s\n' "$timer_rearmed"
printf 'wolo8092\t%s\n' "$(count_port 8092)"
printf 'wolo8093\t%s\n' "$(count_port 8093)"
'''
    rc, out = ssh_script(remote, timeout=90)
    if rc != 0:
        result["status"] = "FAILED"
        result["error"] = out[-6000:]
    else:
        kv = parse_kv(out)
        result["status"] = "PASS"
        result["reset_transients"] = int(kv.get("reset_transients") or 0)
        result["timer_rearmed"] = kv.get("timer_rearmed") == "1"
        result["after"] = snapshot()

    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = RECEIPT_DIR / f"{stamp}.json"
    result["receipt_path"] = str(path)
    path.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return result


def print_status(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR HOST OS")
    print()
    print(f"Host:              {payload['host']}")
    print(f"Kernel:            {payload['kernel']}")
    print(f"Node:              {payload['node']}")
    print(f"Reboot required:   {'YES' if payload['reboot_required'] else 'no'}")
    print(f"Updates pending:   {payload['updates']}")
    print(
        f"Failed units:      {payload['failed_all']} total · "
        f"{payload['failed_transient']} AoE2WAR transient"
    )
    print(
        "Traffic rollup:    "
        f"enabled={payload['traffic_timer_enabled']} "
        f"active={payload['traffic_timer_active']} "
        f"next={payload['traffic_timer_next'] or '—'}"
    )
    print(f"Core services:     web={payload['web']} api={payload['api']}")
    print(
        f"Wolo:              8092={payload['wolo_8092_count']} "
        f"8093={payload['wolo_8093_count']}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war host")
    sub = parser.add_subparsers(dest="command")
    q = sub.add_parser("status")
    q.add_argument("--json", action="store_true")
    q = sub.add_parser("tidy")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--transients-only", action="store_true")
    q.add_argument("--json", action="store_true")
    q = sub.add_parser("maintenance-plan")
    q.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.command in (None, "status"):
        payload = snapshot()
        if getattr(args, "json", False):
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_status(payload)
        return 0

    if args.command == "maintenance-plan":
        payload = maintenance_plan()
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR HOST MAINTENANCE PLAN")
            print()
            print(f"Status:   {payload['status']}")
            print(f"Reason:   {payload['reason']}")
            print(f"Updates:  {payload['host']['updates']}")
            print(
                f"Reboot:   "
                f"{'required' if payload['host']['reboot_required'] else 'not required'}"
            )
            print("Mutation: NONE — this command is planning only.")
        return 1 if payload["status"] == "BLOCKED" else 0

    if args.command == "tidy":
        payload = tidy(
            apply=args.apply,
            transients_only=args.transients_only,
        )
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR HOST TIDY")
            print()
            print(f"Mode:               {'APPLY' if args.apply else 'PREVIEW'}")
            print(f"Status:             {payload['status']}")
            print(f"Transient failures: {payload['before']['failed_transient']}")
            if args.apply:
                print(f"Reset:              {payload.get('reset_transients', 0)}")
                print(f"Traffic rearmed:    {payload.get('timer_rearmed', False)}")
                print(f"Receipt:            {payload.get('receipt_path', '—')}")
            else:
                print(
                    "READ ONLY: pass --apply for bounded transient cleanup/timer reload."
                )
        return 0 if payload["status"] in {"PREVIEW", "PASS"} else 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
