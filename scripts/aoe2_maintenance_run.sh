#!/usr/bin/env bash
set -euo pipefail

NODE_SERVICE="wolochaind-mainnet.service"
RPC="http://127.0.0.1:27657"

MIN_AVAILABLE_KB=$((2 * 1024 * 1024))
MAX_BLOCK_AGE_SECONDS=20
MAX_NO_PROGRESS_SECONDS=15

usage() {
  echo "Usage: aoe2war-maintenance-run <safe-name> -- <command> [args...]" >&2
  exit 64
}

[ "$#" -ge 3 ] || usage

name="$1"
shift
[ "$1" = "--" ] || usage
shift
[ "$#" -ge 1 ] || usage

if ! [[ "$name" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]]; then
  echo "STOP: unsafe maintenance unit name: $name" >&2
  exit 64
fi

height_snapshot() {
  curl -fsS --max-time 4 "$RPC/status" \
    | python3 -c '
import json,sys
from datetime import datetime, timezone
p=json.load(sys.stdin)
s=p["result"]["sync_info"]
height=int(s["latest_block_height"])
stamp=s["latest_block_time"].replace("Z","+00:00")
epoch=int(datetime.fromisoformat(stamp).timestamp())
catching=bool(s.get("catching_up"))
print(height, epoch, "1" if catching else "0")
'
}

require_chain_healthy() {
  [ "$(systemctl is-active "$NODE_SERVICE")" = "active" ] || {
    echo "STOP: Wolo node service is not active" >&2
    return 1
  }

  local available
  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  if [ "${available:-0}" -lt "$MIN_AVAILABLE_KB" ]; then
    echo "STOP: MemAvailable ${available:-0}KB is below ${MIN_AVAILABLE_KB}KB" >&2
    return 1
  fi

  local h1 e1 c1 h2 e2 c2
  read -r h1 e1 c1 < <(height_snapshot)
  [ "$c1" = "0" ] || {
    echo "STOP: Wolo reports catching_up=true" >&2
    return 1
  }
  sleep 6
  read -r h2 e2 c2 < <(height_snapshot)
  [ "$c2" = "0" ] || {
    echo "STOP: Wolo reports catching_up=true" >&2
    return 1
  }
  if [ "$h2" -le "$h1" ]; then
    echo "STOP: Wolo did not advance during maintenance preflight ($h1 -> $h2)" >&2
    return 1
  fi

  local now age
  now="$(date +%s)"
  age=$((now - e2))
  if [ "$age" -gt "$MAX_BLOCK_AGE_SECONDS" ]; then
    echo "STOP: Wolo latest block age ${age}s exceeds ${MAX_BLOCK_AGE_SECONDS}s" >&2
    return 1
  fi

  echo "PRECHECK: Wolo advancing $h1 -> $h2; block_age=${age}s; MemAvailable=${available}KB"
}

require_chain_healthy

unit="aoe2war-maintenance-${name}-$(date -u +%Y%m%dT%H%M%SZ)-$$.service"

echo "START: $unit"
echo "LIMITS: MemoryHigh=256M MemoryMax=384M MemorySwapMax=128M CPUQuota=20% IOWeight=1 OOMScoreAdjust=800"

systemd-run \
  --quiet \
  --unit="$unit" \
  --property=Description="AoE2WAR bounded maintenance: $name" \
  --property=MemoryAccounting=yes \
  --property=MemoryHigh=256M \
  --property=MemoryMax=384M \
  --property=MemorySwapMax=128M \
  --property=CPUAccounting=yes \
  --property=CPUQuota=20% \
  --property=CPUWeight=1 \
  --property=IOAccounting=yes \
  --property=IOWeight=1 \
  --property=TasksMax=64 \
  --property=Nice=19 \
  --property=IOSchedulingClass=idle \
  --property=OOMScoreAdjust=800 \
  -- "$@"

last_height=0
last_progress_epoch="$(date +%s)"
abort_reason=""

while :; do
  active="$(systemctl show "$unit" -p ActiveState --value 2>/dev/null || true)"
  if [ "$active" != "active" ] && [ "$active" != "activating" ]; then
    break
  fi

  sleep 5

  now="$(date +%s)"
  if ! read -r height block_epoch catching < <(height_snapshot 2>/dev/null); then
    abort_reason="Wolo RPC unavailable during maintenance"
    break
  fi

  if [ "$catching" != "0" ]; then
    abort_reason="Wolo entered catching_up state"
    break
  fi

  block_age=$((now - block_epoch))
  if [ "$block_age" -gt "$MAX_BLOCK_AGE_SECONDS" ]; then
    abort_reason="Wolo block age ${block_age}s exceeded ${MAX_BLOCK_AGE_SECONDS}s"
    break
  fi

  if [ "$last_height" -eq 0 ] || [ "$height" -gt "$last_height" ]; then
    last_height="$height"
    last_progress_epoch="$now"
  elif [ $((now - last_progress_epoch)) -gt "$MAX_NO_PROGRESS_SECONDS" ]; then
    abort_reason="Wolo height failed to advance for more than ${MAX_NO_PROGRESS_SECONDS}s"
    break
  fi

  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  if [ "${available:-0}" -lt 1048576 ]; then
    abort_reason="MemAvailable fell below emergency 1GiB floor (${available:-0}KB)"
    break
  fi

  echo "GUARD: unit=$active height=$height block_age=${block_age}s MemAvailable=${available}KB"
done

if [ -n "$abort_reason" ]; then
  echo "ABORT: $abort_reason" >&2
  systemctl stop "$unit" >/dev/null 2>&1 || true
  sleep 1
  systemctl reset-failed "$unit" >/dev/null 2>&1 || true
  exit 70
fi

result="$(systemctl show "$unit" -p Result --value 2>/dev/null || true)"
status="$(systemctl show "$unit" -p ExecMainStatus --value 2>/dev/null || true)"
peak="$(systemctl show "$unit" -p MemoryPeak --value 2>/dev/null || true)"

echo "RESULT: unit=$unit result=${result:-UNKNOWN} exit=${status:-UNKNOWN} memory_peak=${peak:-UNKNOWN}"

systemctl reset-failed "$unit" >/dev/null 2>&1 || true

if [ "$result" != "success" ] || [ "${status:-1}" != "0" ]; then
  echo "STOP: bounded maintenance command failed" >&2
  exit 71
fi

require_chain_healthy
echo "PASS: bounded maintenance completed with Wolo advancing"
