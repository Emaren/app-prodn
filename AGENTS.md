# AoE2WAR Agent Operating Contract

This file applies to agents working in `Emaren/app-prodn`. Read it before producing a human-facing operator command or proposing a release. Keep the implementation, evidence, approval and operational-state boundaries separate.

## Operator commands: observable failure is mandatory

**Do not provide operators pasteable commands containing `set -e`, `set -euo pipefail`, `bash -se`, or equivalent automatic shell exit-on-error switches.** An operator must receive enough stdout/stderr to diagnose an unsuccessful step without rerunning an opaque block.

For every human-facing multi-step Bash command:

1. Print a descriptive `STEP=...` label before each action.
2. Print the action's actual exit code immediately afterward: `rc=$?; printf 'STEP_X_EXIT=%s\n' "$rc"`. Do not immediately overwrite `$?` with `echo` or any other command.
3. Print useful error diagnostics on failure, with secrets, wallet identifiers and private evidence redacted.
4. If later actions are unsafe without an earlier prerequisite, explicitly skip them with `BLOCKED_<STEP>=<reason>`; do not quietly continue or claim PASS.
5. At the end, emit `FINAL_STATUS=PASS|BLOCKED|UNKNOWN` and an explicit meaningful overall exit code.
6. For pipelines, capture **every component status**, e.g. `statuses=("${PIPESTATUS[@]}")` as the immediate next command, and check all statuses, or use separately supervised subprocesses. A successful final `sha256sum` or `awk` is not proof that an earlier `tar`, `ssh` or `psql` succeeded.
7. A deliberately nonauthorizing checker exit code (for example `3`) must be explained and validated against that exact checker contract; never conflate a successful observation with deployment authority.
8. Source-pin files, work on clean exact commits, print matched SHA identities, and never infer local Downloads paths from an extracted ZIP without checking.
9. Read-only commands should declare their scope; use PostgreSQL READ ONLY transactions where applicable. Avoid printing private addresses, hashes, signing keys or financial records to shared logs.

**Example of the expected output contract** (illustrative; no remote changes):

```bash
echo 'STEP=VERIFY_RELEASE_SOURCE'
git rev-parse --verify HEAD
source_rc=$?
printf 'SOURCE_EXIT=%s\n' "$source_rc"

if [ "$source_rc" -ne 0 ]; then
  echo 'FINAL_STATUS=BLOCKED SOURCE_UNAVAILABLE'
else
  echo 'FINAL_STATUS=PASS SOURCE_OBSERVED_NOT_AUTHORIZED'
fi
```

This requirement governs **commands presented to human operators**, not source-controlled safety programs whose internal fail-fast behavior is explicitly tested and appropriate.

## Protected production boundaries

- Source/CI PASS, `finish --dry-run`, and website-review PASS do **not** authorize a production release.
- Preserve source-bound FINANCIAL and DATABASE classifications, legitimate independent approval, Wolo runtime source integrity, signed receipts, stage/rollback probes, and actual financial authority.
- Original nonfunded LIVE website changes are distinct from held funded Mecha Auto Bets and War Satchel migrations. Never merge funded migrations into an unfunded website release.
- Do not silently activate real funding, escrow, signer, withdrawals, settlement, maintenance fencing or WoloChain changes from a review or test branch.
- For financial proof, distinguish local index records, chain-observed unsigned evidence, independently authenticated bank effects, economic entitlements and spendable custody/solvency. Never allocate one transaction/message ordinal to two claims without supported independent economic attribution.
- Preserve existing release and recovery tooling. Fix the smallest independently demonstrated defect with a negative regression instead of creating a competing deploy controller.

## Cross-session collaboration

Post exact commit SHAs, test/workflow IDs, source-backed findings and explicit PASS/BLOCKED/UNKNOWN status to [Central Command #839](https://github.com/Emaren/app-prodn/issues/839). Work on isolated branches and avoid overwriting other specialists' files. Production remains unchanged until legitimate protected authorization and a verified release receipt exist.
