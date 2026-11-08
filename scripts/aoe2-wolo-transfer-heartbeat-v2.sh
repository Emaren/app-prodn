#!/usr/bin/env bash
# NON-DEPLOYED C04/C03-candidate replacement for live transfer heartbeat.
# Existing 8092/8093 are not modified; no custody permissions. Session A must
# approve any live worker cutover because this job presently uses aoe2hd_user.
cd /var/www/AoE2HDBets/app-prodn || { echo "HOLD_WOLO_TRANSFER_HEARTBEAT_BAD_WORKDIR"; exit 3; }

DATABASE_URL="$(
  grep -hE '^DATABASE_URL=' /etc/aoe2hdbets/aoe2hdbets-web.env .env .env.local 2>/dev/null \
    | tail -1 \
    | cut -d= -f2- \
    | sed 's/^"//;s/"$//'
)"
if [ -z "$DATABASE_URL" ]; then
  echo "HOLD_WOLO_TRANSFER_HEARTBEAT_DB_AUTH_MISSING"
  exit 3
fi
export DATABASE_URL="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
export NODE_NO_WARNINGS=1
TMP="$(mktemp)" || { echo "HOLD_WOLO_TRANSFER_HEARTBEAT_NO_TEMP"; exit 3; }
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT

# Preserve the existing bounded single-writer lock and scan limits.
# Never dump private error/output details into the public systemd journal.
if ! /usr/bin/flock -n /tmp/aoe2-wolo-transfer-heartbeat.lock \
  /usr/bin/node scripts/backfill-wolo-mainnet-transfers.mjs \
    --block-limit=20000 \
    --address-limit=1 \
    --per-address-limit=25 \
    --global-limit=250 >"$TMP" 2>&1; then
  echo "HOLD_WOLO_TRANSFER_HEARTBEAT_BACKFILL_FAILED"
  exit 3
fi

if ! /usr/bin/node scripts/verify-wolo-transfer-heartbeat.mjs "$TMP"; then
  echo "HOLD_WOLO_TRANSFER_HEARTBEAT_FALSE_SUCCESS_DENIED"
  exit 3
fi
exit 0
