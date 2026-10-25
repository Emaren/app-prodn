#!/usr/bin/env bash
# UNSEALED, source-revision-drift-only candidate. Not an Index eligibility gate.
set -euo pipefail
: "${SOURCE_SHA:?Source SHA required}"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo "HOLD source moved" >&2; exit 2; }
readonly derived=lib/pageChangeManifest.generated.ts
git ls-files --error-unmatch "$derived" >/dev/null
[[ -f "$derived" ]] || { echo "HOLD derived manifest absent" >&2; exit 2; }
git diff --quiet -- . ":(exclude)$derived" || { echo "HOLD unexpected tracked source drift" >&2; exit 2; }
git diff --cached --quiet || { echo "HOLD staged source changes" >&2; exit 2; }
first="$(sha256sum "$derived" | cut -d' ' -f1)"
python3 scripts/generate_page_change_manifest.py
second="$(sha256sum "$derived" | cut -d' ' -f1)"
[[ "$first" == "$second" ]] || { echo "HOLD generated manifest is non-deterministic" >&2; exit 2; }
git diff --quiet -- . ":(exclude)$derived" || { echo "HOLD generator touched unexpected source" >&2; exit 2; }
if git diff --quiet -- "$derived"; then status="SEALED_SOURCE_MATCH";
else status="UNSEALED_GENERATED_REVISION_DRIFT";fi
if [[ "${1:-}" == verify ]]; then
  [[ -n "${REN88_GENERATED_MANIFEST_SHA:-}" && "$first" == "$REN88_GENERATED_MANIFEST_SHA" ]] || {
    echo "HOLD generated manifest changed during browser sweep" >&2; exit 2;
  }
fi
printf 'CANDIDATE_DERIVED_MANIFEST_STATE=%s\nCANDIDATE_DERIVED_MANIFEST_SHA256=%s\nINDEX_ADMISSION=HOLD_UNTIL_CENTRAL_SEAL\n' "$status" "$first"
