#!/usr/bin/env bash
# READ ONLY: source/custody infrastructure inventory for a human operator.
# No production DB connection, financial signer, TX broadcast, keyring,
# environment variables, file contents or administrative actions.
set -euo pipefail
export LC_ALL=C
printf '%s\n' 'AOE2WAR_PROSPECTIVE_EPOCH_INVENTORY_V1=READ_ONLY'
printf 'UTC=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'HOSTNAME_SHA256='
hostname | sha256sum | awk '{print $1}'
printf 'KERNEL=%s\n' "$(uname -s)"
printf 'ID_UID=%s\n' "$(id -u)"
printf 'WOLO_VOLUME_MOUNTED='
if mountpoint -q /mnt/HC_Volume_105319120; then echo YES; else echo NO; fi
for path in / /var/lib /mnt/HC_Volume_105319120; do
  if [ -d "$path" ]; then
    stat -c 'STORAGE_PATH=%n UID=%u GID=%g MODE=%a' "$path"
    # -P and --output are mutually exclusive on GNU df: the old probe
    # stopped under pipefail immediately after STORAGE_PATH=/.
    # Use portable fixed one-line POSIX output with explicit byte units.
    if available="$(df -PB1 "$path" 2>/dev/null | awk 'NR==2 {print $4}')"; then
      if [[ "$available" =~ ^[0-9]+$ ]]; then
        printf 'AVAILABLE_BYTES[%s]=%s\n' "$path" "$available"
      else
        printf 'AVAILABLE_BYTES[%s]=UNKNOWN_NO_DATA\n' "$path"
      fi
    else
      printf 'AVAILABLE_BYTES[%s]=UNKNOWN_DF_ERROR\n' "$path"
    fi
  fi
done
printf '%s\n' 'SERVICE_NAMES_ONLY_BEGIN'
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files --no-pager --plain --no-legend --type=service 2>/dev/null |
    awk '{print $1}' | grep -Ei 'wolo|aoe2|satchel|watcher|postgres|redis|nginx' | sort -u || true
fi
printf '%s\n' 'SERVICE_NAMES_ONLY_END'
printf '%s\n' 'PROCESS_NAMES_ONLY_BEGIN'
ps -eo comm= 2>/dev/null | grep -Ei 'wolo|aoe2|postgres|redis|node|nginx|cron' | sort -u || true
printf '%s\n' 'PROCESS_NAMES_ONLY_END'
printf 'POSTGRES_READY_CHECK_AVAILABLE='
if command -v pg_isready >/dev/null 2>&1; then echo YES; else echo NO; fi
printf 'RESTORE_TOOLS='
for c in pg_restore pg_dump pg_verifybackup initdb pg_ctl sha256sum git; do
  if command -v "$c" >/dev/null 2>&1; then printf '%s:yes ' "$c"; else printf '%s:no ' "$c"; fi
done
echo
printf '%s\n' 'MISSING_ATTESTATIONS=independent-vault-key-control,bank-at-H-star,legacy-claim-reserve,writer-fence,external-recovery-witness,FINANCIAL-migration-permit'
printf '%s\n' 'READ_ONLY_DONE=NO_WALLET_NO_DB_NO_KEYS_NO_NETWORK'
