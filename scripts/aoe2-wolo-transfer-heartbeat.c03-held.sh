#!/usr/bin/env bash
# Source-only replacement for legacy heartbeat; no live financial deployment.
# Requires A's C03 approved restricted writer and exact credential transition.
cd /var/www/AoE2HDBets/app-prodn || exit 3
export DATABASE_URL="$(grep -hE '^DATABASE_URL=' /etc/aoe2hdbets/aoe2hdbets-web.env .env .env.local 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^"//;s/"$//')"
export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed 's/^postgresql+asyncpg:/postgresql:/')"
export NODE_NO_WARNINGS=1
TMP="$(mktemp)" || exit 3
trap 'rm -f "$TMP"' EXIT
/usr/bin/flock -n /tmp/aoe2-wolo-transfer-heartbeat.lock \
  /usr/bin/node scripts/backfill-wolo-mainnet-transfers.mjs \
  --block-limit=20000 --address-limit=1 --per-address-limit=25 --global-limit=250 >"$TMP" 2>&1
result=$?
if [ "$result" -ne 0 ]; then echo "HOLD_WOLO_HEARTBEAT_BACKFILL_FAILED"; exit 3; fi
/usr/bin/node scripts/wolo-transfer-heartbeat-result-guard.mjs "$TMP"
exit "$?"
