#!/usr/bin/env bash
set -euo pipefail
exec "$(dirname "$0")/_dispatch_llama" "direnv-bootstrap-all.sh" "$@"
