#!/usr/bin/env bash
set -euo pipefail

NODE_SERVICE="wolochaind-mainnet.service"
RPC="http://127.0.0.1:27657"

MIN_AVAILABLE_KB=$((2 * 1024 * 1024))
EMERGENCY_AVAILABLE_KB=$((1 * 1024 * 1024))
SOFT_MEMORY_PRESSURE_KB=$((1536 * 1024))
BALANCED_MEMORY_KB=$((2560 * 1024))
BURST_MEMORY_KB=$((3 * 1024 * 1024))
MAX_BLOCK_AGE_SECONDS=20
SOFT_BLOCK_AGE_SECONDS=13
MAX_NO_PROGRESS_SECONDS=15
SOFT_NO_PROGRESS_SECONDS=9

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

host_load_ok() {
  local multiplier="$1"
  awk -v load="$(awk '{print $1}' /proc/loadavg)" -v cpus="$(nproc)" -v m="$multiplier" \
    'BEGIN { exit !(load <= cpus * m) }'
}

choose_profile() {
  local available cpus burst_quota balanced_quota
  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  cpus="$(nproc)"
  burst_quota=$((cpus * 75))
  balanced_quota=$((cpus * 50))

  [ "$burst_quota" -le 300 ] || burst_quota=300
  [ "$balanced_quota" -le 200 ] || balanced_quota=200
  [ "$burst_quota" -ge 75 ] || burst_quota=75
  [ "$balanced_quota" -ge 50 ] || balanced_quota=50

  if [ "$available" -ge "$BURST_MEMORY_KB" ] && host_load_ok 0.60; then
    profile="BURST"
    memory_high="512M"
    memory_max="768M"
    memory_swap_max="256M"
    cpu_quota="${burst_quota}%"
    cpu_weight="25"
    io_weight="25"
    nice_value="10"
    io_class="best-effort"
    io_priority="7"
  elif [ "$available" -ge "$BALANCED_MEMORY_KB" ] && host_load_ok 1.00; then
    profile="BALANCED"
    memory_high="384M"
    memory_max="512M"
    memory_swap_max="192M"
    cpu_quota="${balanced_quota}%"
    cpu_weight="10"
    io_weight="10"
    nice_value="15"
    io_class="best-effort"
    io_priority="7"
  else
    profile="CONSERVATIVE"
    memory_high="256M"
    memory_max="384M"
    memory_swap_max="128M"
    cpu_quota="20%"
    cpu_weight="1"
    io_weight="1"
    nice_value="19"
    io_class="idle"
    io_priority="7"
  fi
}

demote_to_conservative() {
  local reason="$1"
  if [ "$profile" = "CONSERVATIVE" ]; then
    return 0
  fi

  systemctl set-property --runtime "$unit" \
    CPUQuota=20% \
    CPUWeight=1 \
    IOWeight=1 >/dev/null 2>&1 || {
      echo "ABORT: failed to demote maintenance unit after: $reason" >&2
      systemctl stop "$unit" >/dev/null 2>&1 || true
      return 1
    }

  profile="CONSERVATIVE"
  echo "THROTTLE: profile=CONSERVATIVE reason=$reason"
}

require_chain_healthy
choose_profile

unit="aoe2war-maintenance-${name}-$(date -u +%Y%m%dT%H%M%SZ)-$$.service"
started_epoch="$(date +%s)"

echo "START: $unit"
echo "PROFILE: $profile"
echo "LIMITS: MemoryHigh=$memory_high MemoryMax=$memory_max MemorySwapMax=$memory_swap_max CPUQuota=$cpu_quota CPUWeight=$cpu_weight IOWeight=$io_weight Nice=$nice_value IOSchedulingClass=$io_class OOMScoreAdjust=800"

systemd-run \
  --quiet \
  --unit="$unit" \
  --property=Description="AoE2WAR adaptive bounded maintenance: $name" \
  --property=MemoryAccounting=yes \
  --property=MemoryHigh="$memory_high" \
  --property=MemoryMax="$memory_max" \
  --property=MemorySwapMax="$memory_swap_max" \
  --property=CPUAccounting=yes \
  --property=CPUQuota="$cpu_quota" \
  --property=CPUWeight="$cpu_weight" \
  --property=IOAccounting=yes \
  --property=IOWeight="$io_weight" \
  --property=TasksMax=64 \
  --property=Nice="$nice_value" \
  --property=IOSchedulingClass="$io_class" \
  --property=IOSchedulingPriority="$io_priority" \
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
  else
    no_progress=$((now - last_progress_epoch))
    if [ "$no_progress" -gt "$MAX_NO_PROGRESS_SECONDS" ]; then
      abort_reason="Wolo height failed to advance for more than ${MAX_NO_PROGRESS_SECONDS}s"
      break
    fi
    if [ "$no_progress" -gt "$SOFT_NO_PROGRESS_SECONDS" ] && [ "$profile" != "CONSERVATIVE" ]; then
      if ! demote_to_conservative "Wolo no-progress=${no_progress}s"; then
        abort_reason="adaptive governor could not demote"
        break
      fi
    fi
  fi

  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  if [ "${available:-0}" -lt "$EMERGENCY_AVAILABLE_KB" ]; then
    abort_reason="MemAvailable fell below emergency 1GiB floor (${available:-0}KB)"
    break
  fi

  if [ "$profile" != "CONSERVATIVE" ]; then
    if [ "$block_age" -gt "$SOFT_BLOCK_AGE_SECONDS" ]; then
      if ! demote_to_conservative "Wolo block_age=${block_age}s"; then
        abort_reason="adaptive governor could not demote"
        break
      fi
    elif [ "${available:-0}" -lt "$SOFT_MEMORY_PRESSURE_KB" ]; then
      if ! demote_to_conservative "MemAvailable=${available:-0}KB"; then
        abort_reason="adaptive governor could not demote"
        break
      fi
    fi
  fi

  echo "GUARD: unit=$active profile=$profile height=$height block_age=${block_age}s MemAvailable=${available}KB"
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
duration_seconds=$(( $(date +%s) - started_epoch ))

echo "RESULT: unit=$unit result=${result:-UNKNOWN} exit=${status:-UNKNOWN} memory_peak=${peak:-UNKNOWN} final_profile=$profile duration_seconds=$duration_seconds"

systemctl reset-failed "$unit" >/dev/null 2>&1 || true

if [ "$result" != "success" ] || [ "${status:-1}" != "0" ]; then
  echo "STOP: bounded maintenance command failed" >&2
  exit 71
fi

require_chain_healthy
echo "PASS: adaptive bounded maintenance completed with Wolo advancing"
