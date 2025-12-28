#!/usr/bin/env bash
set -euo pipefail
exec "$(dirname "$0")/_dispatch_llama" "cleanup-legacy-pyenvs.sh" "$@"
