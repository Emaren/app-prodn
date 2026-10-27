# Session D — Mac Storage OS recovery and verified-cleanup register (2026-10-27)

**Authority:** evidence-scoped review of Mac observations already posted under [Central Command #934](https://github.com/Emaren/app-prodn/issues/934). This is **not** a fresh operator-host census, a deletion permit, a release approval, or a financial certificate.

**Source boundary:** isolated Storage OS documentation review branch based on `app-prodn/main@14ce71045150fcad4a25f0e3c3858c1c3cc7aab6`; no Kingdom Index, Wolo, VPSSentry, production controller or release source changes. Live Mac remote Desktop Commander reported **OFFLINE** while this review was assembled. Do not conflate a source inspection with fresh machine evidence.

## Existing operating system (do not duplicate)

- `./bin/aoe2war storage status --json`, `storage estate --measure --json`, `storage triage --json`, `storage deep-census --json`: source-owned read-only discovery and pressure triage.
- `./bin/aoe2war workspace status --json`: Workspace OS ownership, ancestry, detached state, dirty/unmerged and preservation classes. Its classification of a clean merged worktree is **not** an instruction to remove attached source.
- `./bin/aoe2war storage local-maintain --json`: source-owned dry-run measurement of exactly four cache allowlist entries: `~/Library/Caches/Yarn`, `~/Library/Caches/go-build`, `~/Library/Caches/pnpm` and `~/Library/Developer/CoreSimulator/Caches`. Only the separately authorized `--apply` deletes those four; implementation checks symlink ancestors/path confinement and writes `.aoe2war-release/storage-local-receipts/<UTC>-local-maintenance.json`. It **does not** check active builders or provide an undelete mechanism. Stop affected builders and capture owner authorization before considering apply. Do not add generic `~/.cache`, `node_modules`, `dist` or `.next` to its allowlist.
- `storage expiry` and VPS archive maintenance govern a different filesystem and must **never** be applied to Mac worktree trees.

Reviewed tracked source: `docs/STORAGE_OS.md` blob `258178f934a0d2212fcd0091386cdb2b90bcbf7d`; `scripts/aoe2_storage.py` blob `3f2eea63fb291bc15de72820a4dc911e0fdf51df`; `scripts/aoe2_workspace.py` blob `03f6e89569c1c6ad8356f7427a59d2a07db81b28`. Source HEAD at review `14ce7104...`; runtime still requires reinspection.

## Measured historical cleanup — **already executed by owner**, no repeat

[Receipt #6444200364](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444200364) reports genuine Mac **APFS Data** free space **11.560 GiB before**, **14.165 GiB after**, **+2.606 GiB measured net** (rounded). Source worktrees removed: **0**.

| Exact target relative to `$HOME` | Prior allocated size | State | Source and rebuild |
|---|---:|---|---|
| `projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/fix-replay-result-authority-inputs-20261011/.next` | 1.227 GiB | `REMOVED_GENERATED_BUILD` | Untracked Git-ignored Next.js output; adjacent source tree retained. Rebuild only when needed at its exact commit, with that checkout's pinned package manager and `npm run build` after prerequisites. |
| `projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/phoenix-recovery-dashboard-20261014/.next` | 1.377 GiB | `REMOVED_GENERATED_BUILD` | Same generated-output classification; **the named source worktree remains**. |

The earlier guarded operation checked allowlisted exact path, symlink/ownership, Git tracked/ignored, release adjacency, process/open FD, staged BUILD_ID and allocation. Its output is reported in #934; original per-tree content Merkle hashes and post-deletion inode manifests are **not available**. Do not invent them or count this historical 2.606 GiB as newly recovered in this session. Before/after deltas and measured allocated sizes differ modestly through filesystem accounting.

## Persistent protection register — no automated removal

The following are protected or unresolved, regardless of age:

| Path / owner scope | Historical quantity | Classification and reason |
|---|---:|---|
| `~/aoe2war-recovery` (entire tree) | 38.12 GiB | `PROTECTED_RECOVERY`: Sept 7 CMS chunks including ~20.078 GiB replay archive, ~7.782 GiB parser, ~6.036 GiB Wolo consensus, ~1.612 GiB private media and settlement state. Restore/uniqueness not retired. |
| `~/.codex` and `~/.cache/codex-runtimes` | 14.84–14.94 GiB Codex; 4.771 GiB runtime bucket separately measured | `PROTECTED_AGENT_UNIQUE`: interrupted code/recovery/dirty work, not an ordinary cache discard. |
| `~/projects/AoE2HDBets/.aoe2war-workspaces/` and all registered worktree paths | 80 attached at Phase 2: app 41 (5 dirty), Wolo 23 (4 dirty), Sentry 2 (0), docs 14 (2) | `PROTECTED_WORKTREE` unless individually reconciled. The 11 dirty/untracked trees include a 219-entry held integration merge. Preserve branch commits, untracked files, Codex state and registries. |
| `~/Library/Application Support/CrossOver` | 74.643 GiB | `PROTECTED_GAME_AND_MEDIA`: AoE2HD/DE bottles and ~26.11 GiB recorded Steam video. Similar-looking 10.407 GiB files not SHA-proven duplicates. |
| `~/Library/Application Support/MobileSync` | 34.545 GiB | `OWNER_REVIEW_DEVICE_BACKUP`: separate-device 2025 iPhone and 2026 iPad restore sets; no bulk deletion. |
| `~/Local Documents` | 14.72 GiB | `PROTECTED_PERSONAL`. |
| `~/Downloads/Suno` | 4.154 GiB | `PROTECTED_CREATIVE`. |
| `~/Library/Group Containers/group.com.apple.screencapture` | 3.493 GiB | `PROTECTED_PERSONAL_MEDIA`. |
| `~/Library/Containers/com.docker.docker/Data` | 5.233 GiB | `UNKNOWN_DOCKER`: daemon offline at last check; volumes/layers not inventoried. |
| `~/.Trash` | 1.99 GiB | `OWNER_REVIEW_TRASH`: trash is not proof of disposable/unique content. |
| `~/Downloads/AoE2WAR-NextChat-20261026T234344Z/capture` | includes 276,008,961 B original website TGZ | `PROTECTED_CONTEXT_CAPTURE`: failed/incomplete Daily Brain Pack and retained original TGZ SHA256 `020871f63f21c03ba4c2ccfbaa87793c85c5c7157550acf0455dc8773afdb7d8`; never delete the only copy to simplify capture. |
| Wolo wallet app/chain keys, PirateWallet, ZcashParams, financial database/recovery receipts and signing materials (exact local paths not authenticated) | earlier Wolo PirateWallet 2.873 GiB, ZcashParams 1.571 GiB | `PROTECTED_FINANCIAL`. Do not guess absolute paths or print secrets. |
| Mac APFS `com.apple.os.update*` snapshots | 3 observed | `PROTECTED_SYSTEM`; no automatic snapshot pruning. |

**Known exact held generated tree**: `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015/.next`, historical 1.27 GiB. Git untracked, but **adjacent `.aoe2war-release` is protected** and active reference/stage evidence is not resolved. `MUTATION_ALLOWED=false`.

## Next candidate classification (read-only, not a cleanup permit)

| Candidate | Historical allocation | Current class | Missing proof before changing state |
|---|---:|---|---|
| `~/projects/AoE2HDBets/aoe2-watcher/dist` | 3.28 GiB | `BUILD_OUTPUT_REVIEW` | Actual watcher runtime/bundle consumer, dist/source build recipe and artifact/SHA, active process/fd and release ownership. |
| Other isolated worktree `.next` trees | Six old isolated builds totaled ~7.78 GiB **before** two deletions; exact current count unknown | `GENERATED_REVIEW` | Enumerate exact tree, git status + ancestry, ignored/not tracked, active process/fd, stage/rollback manifests, recorded per-tree content hash. Never sum old totals as currently reclaimable. |
| App/watcher `node_modules` | 0.5–3.2 GiB per older tree | `ACTIVE_DEV_REBUILDABLE_REVIEW` | Active runtime/builders, lockfile and package manager, native addon compatibility, no unique modifications, reproducible install. |
| `~/Library/Caches/com.apple.CharacterPaletteIM`, Google cache | 1.778 GiB, 1.121 GiB | `THIRD_PARTY_CACHE_REVIEW` | Correct exact bundle path and application ownership, stop processes, app-supported reset path, remeasure. Not in Storage OS allowlist. |
| `~/.cache`, `~/.npm`, Docker storage, Homebrew and installed toolchains | historical `~/.cache` 5.111 GiB | `UNBOUNDED_REVIEW` | Per-child allocation and identity, active build/session refs; NEVER broad purge. |
| Top-level Downloads scripts | 62 sampled; no hash duplicates among those 62 and no same-name tracked-repo SHA matches | `UNRESOLVED_SCRIPT_AUTHORITY` | For **each** script: exact basename/path, `shasum -a 256`, Git/code search, launchd/cron/systemd/CI/shell callers, script contents/purpose, potential secrets, executable/signature provenance, owner retention. File age, name collision or matching size alone never authorize deletion. |
| MobileSync per-device backup, personal Downloads installers | historical totals above | `OWNER_REVIEW_ONLY` | Owner restore/installation need, actual backup metadata/device ID; no published private identifiers. |

**Machine-cleanable newly qualified exact targets: 0.** **Owner-review/unverified classes: all remaining rows**. Content hashes and current consumer evidence for remaining candidates have **not** been produced. This honest zero means not proven, not that no safely regenerable data exists.

## Read-only operator capture — existing CLIs, private local receipts

Run on **the actual Mac** from its clean canonical checkout. Interactive shell contract: **NO** `set -e`, `set -euo pipefail`, `errexit`, forced resets, cleanup or activity behind a hidden auto-delete switch. None of the following commands deletes content.

```bash
ROOT="$HOME/projects/AoE2HDBets/app-prodn"
if [ -f "$ROOT/scripts/aoe2_storage.py" ]; then
  cd "$ROOT" || exit 1
  NOW="$(date -u +%Y%m%dT%H%M%SZ)"
  RECEIPTS=".aoe2war-release/storage-local-receipts/session-d-$NOW"
  mkdir -p "$RECEIPTS"
  df -k /System/Volumes/Data > "$RECEIPTS/apfs-data-before.txt"
  git rev-parse HEAD > "$RECEIPTS/source-sha.txt"
  git status --porcelain=v1 --untracked-files=all > "$RECEIPTS/canonical-status.txt"
  ./bin/aoe2war workspace status --json > "$RECEIPTS/workspace-status.json"
  ./bin/aoe2war storage local-maintain --json > "$RECEIPTS/local-cache-preview.json"
  ./bin/aoe2war storage estate --measure --json > "$RECEIPTS/estate.json"
  ./bin/aoe2war storage triage --json > "$RECEIPTS/triage.json"
  df -k /System/Volumes/Data > "$RECEIPTS/apfs-data-after.txt"
  (cd "$RECEIPTS" && shasum -a 256 *.json *.txt > SHA256SUMS.txt)
  printf 'READ_ONLY_RECEIPTS=%s/%s\n' "$PWD" "$RECEIPTS"
else
  echo "HOLD: CANONICAL_STORAGE_OS_SOURCE_MISSING"
fi
```

Read/check each exit status and JSON probe-completeness before calling any snapshot current or trustworthy. Any partial file from an exited command is **not** a PASS receipt. The `estate`/triage remote VPS probes depend on SSH and may be incomplete even if the Mac commands ran.

### Per-target admission before any separately authorized cleanup

1. Authenticate current path with `lstat` and canonical realpath; refuse symlinked leaf/ancestor, unexpected ownership, mounts, ancestor/out-of-allowlist traversal, or changed inode.
2. Capture exact allocated bytes, optional recursive SHA manifest (bounded to a single candidate), source HEAD/branch and `git ls-files` and `git check-ignore` result. Preserve all source, untracked data and worktree metadata.
3. Prove current authority via `workspace status` and `git merge-base --is-ancestor`; prove zero adjacent active `.aoe2war-release`, stage, rollback, BUILD_ID, context-capture, financial or Codex references. A clean merged worktree does not prove an output is unreferenced.
4. Prove the process/FD/launchd/build consumer set empty **at execution time**, with owner-supplied current process receipts. Establish the exact reconstruction recipe: source SHA, lockfile SHA, runtime/Node/Go version, build command, external artifact provenance.
5. Pre-capture APFS Data free (not `/` system-volume free), authorize **one exact generated target**, preserve receipt/rollback recipe off-target and remove only via separately reviewed exact-path operation. Re-capture APFS Data free, compute actual delta, verify source/worktrees/financial processes unchanged. No repeat deletion of already-absent targets.
6. Persist before/after/hash/decision/failure/owner/source receipt under Storage OS and record only **non-secret** summary in #934. If any proof fails, mark HOLD and do not substitute a broad `rm -rf`, `git worktree prune`, `docker system prune`, `brew cleanup`, `tmutil` removal or `.Trash` purge.

## Exit / honest status

- Previously reclaimed **2.606 GiB verified**, no source worktree removed.
- **Additional reclaimed in this document/session: 0 B** (Mac offline; no new cleanup).
- APFS Data **last reported** 14.165 GiB available; not remeasured now.
- 11 dirty attached worktrees, all original game recordings, recovery chunks, financial material, historical context, device backups and creative media remain preserved by policy, not certified by a live fresh scan.
- Next machine-level gate: authenticate a new operator Mac Storage OS receipt, then qualify one exact unreferenced generated tree at a time; personal/financial classes stay owner-review or prohibited.

Source evidence: [Mac Phase 2 #6443340265](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6443340265), [Phase 3 #6444005305](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444005305), [retention #6444127715](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444127715), [guarded removal #6444200364](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444200364), and [Central Phase 8 #6444694527](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444694527).
