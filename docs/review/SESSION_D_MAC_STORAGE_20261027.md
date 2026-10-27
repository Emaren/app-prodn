# Session D — Mac Storage OS recovery and verified-cleanup register (2026-10-27)

**Authority:** evidence-scoped review of Mac observations already posted under [Central Command #934](https://github.com/Emaren/app-prodn/issues/934). This is **not** a fresh operator-host census, a deletion permit, a release approval, or a financial certificate.

**Source boundary:** isolated Storage OS documentation review branch based on `app-prodn/main@14ce71045150fcad4a25f0e3c3858c1c3cc7aab6`; no Kingdom Index, Wolo, VPSSentry, production controller or release source changes. The remote Desktop Commander agent was **OFFLINE** during initial review; a subsequent **operator-executed actual Mac terminal receipt at 2026-10-27T15:04Z** supplies a newer read-only observation below. Neither observation is a cleanup permit.

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
  if cd "$ROOT"; then
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
    echo "HOLD: CANNOT_ENTER_CANONICAL_ROOT"
  fi
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


## Fresh operator-supplied Mac read-only receipt — 2026-10-27T15:04Z

Source: terminal output captured in Session D (current Mac host, **not** remote Desktop Commander); measurements `workspace status --json` at 15:04:08Z, `storage local-maintain --json` at 15:04:11Z and `storage estate --measure --json` at 15:04:27Z. These commands did **not** apply cleanup.

| Measurement | Observation | Scope / caveat |
|---|---|---|
| APFS Data `df -k /System/Volumes/Data` | 482,797,652 KiB 1K-blocks; used 430,016,052 KiB; available **11,402,824 KiB**; 98% displayed | `df` shared-volume/free accounting is not the same as computing total−used. Do not infer new file writes solely from the 3.29 GiB decline versus prior post-removal. |
| Storage OS local statvfs | total 494,384,795,648 B, used 482,709,245,952 B, free 11,675,549,696 B, 97.64% | Closely agrees with Data `df` available. |
| `app-prodn` canonical | clean `main@14ce71045150fcad4a25f0e3c3858c1c3cc7aab6` | Local source authority only. |
| `api-prodn` canonical | clean `main@4da8ab05e84e868f172a193ddfe9b19fcd32bfe5` | API source authority only. |
| Workspace OS app + API | **46** attached noncanonical trees: **6** clean/merged cleanup-label, **34** clean/not-merged, **6** dirty/not-merged; stale metadata 0 | `unmerged_count=34` excludes dirty rows even when their `merged_into_canonical=false`. These 46 trees omit separate Wolo, Docs and Sentry repos; earlier 80/11 whole-estate snapshot remains historical. |
| Workspace agent register | `active_agent_count=0`, `dirty_agent_count=0` | Means no registered `agent_workspace` metadata, **not** no active Codex process or clean Codex material. |
| Local strict four-cache preview | `status=PREVIEW`, `apply=false`, `actions=[]`; **642,154,496 B (0.598 GiB)** reclaimable *if separately authorized* | All from `~/Library/Caches/go-build`. Yarn exists but 0 measured; pnpm/CoreSimulator locations absent. Go builders/agents are not proven idle; no `--apply` recommended. |
| Protected measured paths | recovery 40,929,771,520 B; Codex **sessions subdir only** 5,447,577,600 B; CrossOver 80,147,120,128 B; MobileSync 37,092,593,664 B | The Codex `sessions` size is NOT `~/.codex` total. No release, media or backup deletion authorized. |
| Context retention | VPSSentry `context`: 30 MD + 30 TGZ + 30 ZIP; Traffic x3 in MD and TGZ; **4 structural retention-debt units** | Inventory signal, not permission to remove an old capture or displace its only verified source. |
| HEL1 root | 71,968,743,424 B available; **53.38%** used; 1 fast rollback | Different filesystem. |
| HEL1 attached evidence volume | 24,831,463,424 B available, **91.83%** used, 62 expanded canonical / 60 eligible, 3 archives, 23 DB snapshots (10,212,171,544 B), 168 verified receipts | Independent Session E/C authority; Mac cleanup does **not** satisfy HEL1 88% snapshot admission. No expiry/builder run authorized here. |
| Live website as remotely reported by Storage OS | active build `s5lkg31SfI18yR-eQN8iT`; source `6d2a78224e5a5c647345d6b5ffc91bf94dc84b59`; protected 8092/8093 listener counts 1/1 | **Read-only reported runtime, not independently signed production postflight or deployment approval.** |

### Exact six worktrees labelled clean-and-merged in this **app/API** snapshot

**Classification here refers to Git ancestry and reported cleanliness only. Not one source tree is approved for removal:**

1. `~/.codex/worktrees/central-kingdom-index/app-prodn` at `3ef449c9ce2cedef5bee6c55b20eb6d256f16f4a`: **PROTECTED CODEX** even though source is merged.
2. `~/.codex/worktrees/renaissance-v4-exact-candidate/app-prodn` at `6d2a78224e5a5c647345d6b5ffc91bf94dc84b59`: **PROTECTED CODEX**.
3. `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/phoenix-recovery-dashboard-20261014` at `6dcdf8fe93b37b43698c80f90518814508ffdd13`: **SOURCE TREE RETAINED**, prior `.next` output only removed.
4. `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015` at `99c406f57d759b672fd9fe91d3c3355c4d527705`: **HOLD**; adjacent `.aoe2war-release` protected.
5. `~/projects/AoE2HDBets/.aoe2war-workspaces/central-candidate-6d2a78224e5a5c647345d6b5ffc91bf94dc84b59` at `6d2a78224e5a5c647345d6b5ffc91bf94dc84b59`: **OWNER_REVIEW** for original release candidate/active reference.
6. `~/projects/AoE2HDBets/.worktrees/codex-protected-website-authority` at `b8409aab004cec22cfb36ef38b56ab878ff7a5e5`: **PROTECTED CODEX**.

Remaining 34 `ACTIVE_UNMERGED` plus six `PRESERVE_DIRTY_REVIEW` are strongly protected. Dirty paths include five app-prodn and one api-prodn Codex/replay worktree. Full names and SHAs are in the operator's machine output; private scripts/recovery state must never be bulk pruned.

**Change decision at this receipt:** the existing `local-maintain` 0.598 GiB option is not yet owner-authorized or rollback-proven and does not solve build headroom; prioritize a bounded current per-target process, content/size and active-stage/FD census for other compiled outputs. **Newly reclaimed bytes 0; no deletes executed.**


## Exact generated-output probe — owner terminal observation (2026-10-27; after 15:04Z Storage OS census)

The owner ran a second targeted **read-only** Python survey of `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/*/.next` plus `~/projects/AoE2HDBets/aoe2-watcher/dist`. Only **two** directories existed at the named targets. It supplied paths, `du -sk`, source HEAD, Git tracked/ignored state, lockfile SHA256 and adjacency flags. It did **not** hash generated artifact contents, inspect actual build consumers/open file descriptors, confirm signatures, or authorize disposal.

| Exact directory (relative to home) | `du -sk` allocated | SHA-bound source and rebuild hints | Classification |
|---|---:|---|---|
| `projects/AoE2HDBets/aoe2-watcher/dist` | **3,434,896 KiB = 3.276 GiB** | Clean Git checkout `fa93bcea67ca8786f54102aafe7b47f7345aec03`, `package-lock.json` SHA256 `da37a73104be92b6eb7a2d40ede3d694499789241328f54b0475e9574ccfd802`; ignored, no tracked `dist` files, no adjacent `.aoe2war-release`. **HOLD RELEASE_ARTIFACT_UNVERIFIED**. | `BUILD_DISTRIBUTION_AND_SIGNED_RELEASE_REVIEW`; verify exact files and retained public-released bytes before changing any subpath. |
| `projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015/.next` | **1,328,688 KiB = 1.267 GiB** | Clean `99c406f57d759b672fd9fe91d3c3355c4d527705`; `yarn.lock` SHA256 `4e7b5b9c47f73315435439519d6fb7b0623502cb14c89d51d7ef4089b074e53b`; ignored/not tracked. Adjacent `.aoe2war-release` **PRESENT**. | `PROTECTED_RELEASE_ADJACENT_OUTPUT`; no deletion until release authority/BUILD_ID/source manifest and process/fd proven absent. |
| **Total conditional candidates** | **4,763,584 KiB ≈ 4.543 GiB** | Both clean and Git-ignored; runtime usage unknown. | **0 B newly qualified for removal; 0 B reclaimed in this probe.** |

**Additional independently reviewed source contracts (exact GitHub source):**
- Watcher at `fa93bcea67ca8786f54102aafe7b47f7345aec03`: `package.json` Git blob `021359fb1811005ad0988ff099653afa7dfde30c` defines `npm run build` → `electron-builder`, `npm run dist:mac` → DMG+ZIP arm64, `npm run dist:win` → NSIS + portable, `npm run dist:linux` → AppImage, `npm run dist:release` → win+mac+manual ZIP+linux. Source does **not** prove an existing signed installer reproducible byte-identically. `scripts/build-manual-zip.mjs` blob `3de5c0a13fe4c21afcbac49391ffbdb86ee60625` consumes `dist/mac-arm64/AoE2HDBets Watcher.app` and emits `dist/aoe2hdbets-watcher-direct.zip`. Deleting `dist` wholesale can destroy both prerequisites and finished release products.
- Watcher `README.md` blob `0f2e734191e3ca4f4239e4107bbc1bbab12d74fd` states published `v1.6.5` uses Windows Azure-signed timestamped artifacts and intentionally unsigned Mac/Linux artifacts, with public release source `b49f31bb69fea629378072faa22220cdfcc2f1ef`. Local `fa93bcea...` build checkout is not the documented release source; **do not assert `dist` is duplicated by published GitHub bytes until per-file hashes and coverage are independently checked**.
- App `docs/STORAGE_OS.md` Git blob `258178f934a0d2212fcd0091386cdb2b90bcbf7d` says to retain current Watcher release plus one previous compatibility release and associated manifest/checksum evidence. App `scripts/sync-watcher-release.mjs` blob `afbda64385b71fd994fa3a19ab99aef4f2fbd95a` explicitly validates release filenames, SHA256/manifests and updater metadata before publication. That authoritative contract, not presence of ignored directory, determines safe retention.

**Next safe read-only qualification:** enumerate `dist` *immediate children* and corresponding per-child allocated sizes/types and manifest presence; compare currently published release and required previous-release artifacts to their independently retained **byte hashes**, signatures and source, check app `public/downloads` symlinks/refs, launchd processes and exact open FDs, then separately consider one uniquely named obsolete **sub-artifact** (not entire `dist`). The other `.next` needs adjacent release provenance before any removal. No remote Mac access or local mutation occurred through this GitHub documentation step.

## Watcher `dist` immediate-child identity and website symlink — owner Mac read-only receipt (2026-10-27)

The owner ran an **immediate-children-only** `du -sk`/`lstat` metadata survey (small files SHA-256 only). The exact `~/projects/AoE2HDBets/aoe2-watcher/dist` footprint is **3,434,896 KiB = 3.275772 GiB**, subdivided into **46 children (44 files, two directories)**; direct-child allocated sizes sum to the same `du` total. This was **read-only** and did not verify any large package's SHA-256 or equivalence.

**P0 cleanup-disqualification proof:** `~/projects/AoE2HDBets/app-prodn/public/downloads` is a symbolic link whose `samefile()` is **TRUE** against the actual Watcher `dist` directory. Any local removal from `dist` would also remove what that exact local website download link resolves to. This is **LOCAL source and build/download identity, NOT a claim that HEL1 production's public downloads are symlinked, currently incomplete, or broken**. No watcher or website release mutation permitted.

| Children group | Presence / bytes observed | Evidence decision |
|---|---|---|
| `AoE2HDBets Watcher Direct/` | directory **297,480 KiB** | **PROTECT**: manual ZIP builder's payload directory; contents and current `.app` version not inventoried |
| `mac-arm64/` | directory **297,476 KiB** | **PROTECT**: electron-builder packaged arm64 `.app` path consumed by manual ZIP builder; contents unverified |
| Watcher v1.6.5 top-level version-named artifacts | **NONE** in the enumerated 46 children | Current app `lib/watcherRelease.ts` at canonical `main@14ce7104` declares v1.6.5/previous v1.6.4. This local directory does not represent a complete 1.6.5 bundle. Does **NOT** refute previously GitHub-published v1.6.5, nor prove live website failure. |
| Watcher v1.6.4 | **four** named top-level files: arm64 DMG, arm64 Mac updater ZIP and two blockmaps, **254,536 KiB (~0.243 GiB)** | **PROTECT** as documented previous version, even though its top-level full-platform manifest/checksum set is absent |
| v1.6.3 | **10** named children, **830,436 KiB (~0.792 GiB)** | **HOLD:** signed Windows, Linux and macOS artifacts, repeated alternate filename forms; full per-file hashes not measured |
| v1.6.0 | **10** named children, **830,412 KiB (~0.792 GiB)** | **HOLD:** same old package inventory and repeated filename issue |
| v1.5.12 and v1.5.13 | **seven** named children for each (~0.381 GiB each) | **HOLD:** full prior retention/reference obligations unknown; manifest and SHA256SUMS remain protected |
| `aoe2hdbets-watcher-direct.zip` | **126,328 KiB (~0.120 GiB)** | **HOLD:** unversioned filename, may be advertised by app; its actual embedded package version / checksum not checked |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, release manifests, SHA256SUMS and `builder-*.yml` | small files, SHA hashes captured in operator's attached terminal output | **PRESERVE:** updater/signature/reference/identity authority; no inference from filenames alone |

**Specific apparent version-duplicate pairs**, all equal exact `st_size` within each pair but **content SHA-256 not compared**:
- v1.6.3 Linux AppImage `AoE2HDBets Watcher-1.6.3.AppImage` vs `AoE2HDBets-Watcher-1.6.3.AppImage`, each 134,026,161 B.
- v1.6.3 Mac DMG `AoE2HDBets Watcher-1.6.3-arm64.dmg` vs `AoE2HDBets-Watcher-1.6.3-arm64.dmg`, each 129,146,083 B.
- v1.6.3 Windows installer `AoE2HDBets Watcher Setup 1.6.3.exe` vs `AoE2HDBets-Watcher-Setup-1.6.3.exe`, each 108,044,240 B.
- v1.6.0 Linux AppImage two space/hyphen naming forms, each 134,013,759 B.
- v1.6.0 Mac DMG two space/hyphen naming forms, each 129,156,599 B.
- v1.6.0 Windows installer two space/hyphen naming forms, each 108,035,160 B.

Identical byte lengths **are not a content digest**, evidence of independent backup, or proof of newly available APFS capacity. Even byte-identical APFS clones may share physical extents; freeing one pathname can reclaim less than `du` allocation suggests. Never delete a signed package on length/name evidence. Small SHA-256 hashes belong in the operator's private read-only terminal output; publishing them is optional, not an authority upgrade.

**Revised triage:** `dist` is **`LOCAL_WEBSITE_DOWNLOAD_TARGET_AND_SIGNED_RELEASE_ARCHIVE_HOLD`**, not a routine build cache. Its 3.276 GiB may include removable expired versions **only after** verification of source-owned current+previous retention, independently durable byte-identical artifacts in GitHub release/website, historical compatibility callers, no active consumers/open FDs, local symlink web serving implications and a single-target owner-approved rollback procedure. Do **not** delete, move, rename or replace the symlink itself. The adjacent-release docs worktree `.next` **1.267 GiB** still HOLD.

**Net new reclaim: 0 B.** Previous operator-confirmed 2.606 GiB from two other historical `.next` outputs remains the only performed removal. No source, financial, media or production change.


## SHA-256 duplicate pairs — owner Mac full-content read-only receipt (2026-10-27; subsequent to direct-child scan)

The operator ran full-file SHA-256 hashing on exactly **six space-vs-hyphen filename pairs (12 files)** under `aoe2-watcher/dist`. All six pairs have equal `st_size`, equal *complete SHA-256*, **different inodes**, and `content_equal=true`. All results remained `deletion_allowed=false`; **no cleanup occurred**.

| Version | Artifact | Exact bytes of each copy | Same SHA-256 for both names |
|---|---|---:|---|
| 1.6.0 | AppImage | 134,013,759 | `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266` |
| 1.6.0 | arm64 DMG | 129,156,599 | `e128424ca6cecc5ebcf82c57d643e0774380b786780fd8b141190562a50380e3` |
| 1.6.0 | Windows Setup EXE | 108,035,160 | `b6fa8b3ed934bb98dfbb5008148fb739575ca138b3dfc74084dd4a2b7d650f89` |
| 1.6.3 | AppImage | 134,026,161 | `c1d1d149dac0e49dc8ad1361e07acc85ceea61ab8d3782b6a8e54b1790d155d0` |
| 1.6.3 | arm64 DMG | 129,146,083 | `04c04738b23eefdb5c9c6e29c7cc1de77d28c728a34ab72d1fa48c24b354a9ff` |
| 1.6.3 | Windows Setup EXE | 108,044,240 | `54cae410e9808e363efe0c1f1eed26648563be7fc09fa70dd9567a1eb7916e77` |

Every row compares exactly `AoE2HDBets Watcher-<version>.AppImage` versus `AoE2HDBets-Watcher-<version>.AppImage`, or `AoE2HDBets Watcher-<version>-arm64.dmg` versus `AoE2HDBets-Watcher-<version>-arm64.dmg`, or `AoE2HDBets Watcher Setup <version>.exe` versus `AoE2HDBets-Watcher-Setup-<version>.exe`.

**Logical redundant bytes of one copy per pair: 742,422,002 B ≈ 0.69143 GiB** (approx. 725,032 KiB allocated in earlier `du`). This is NOT guaranteed APFS free-space recovery: distinct inodes do not prove independent physical extents; cloned data, snapshots and hard-to-observe consumers may keep blocks live. No `df` delta was observed because nothing was removed.

**Existing governed code and gap**: `app-prodn/scripts/aoe2_watcher_downloads.py` on `main@14ce7104`, `STRICT_PATTERNS`, explicitly recognizes only **space-named** Watcher binaries (plus checksum/manifest); the six **hyphen-named aliases are not matches**. The existing `aoe2war watcher-downloads` controller acts against **HEL1 canonical `/mnt/HC_Volume_105319120/aoe2-downloads`**, requiring independently proven public GitHub release digests, exact live BUILD_ID/service/source/Wolo boundary and a protected root-scoped apply. **It is NOT a Mac duplicate deletion tool.** Reusing it on the Mac or extending its regex to auto-delete aliases would violate that authority boundary.

**Pre-deletion follow-up:** inspect the two *local* `dist/watcher-release-manifest-{1.6.0,1.6.3}.json` and `dist/SHA256SUMS-{1.6.0,1.6.3}.txt` for exact naming; bound `git grep` references for the 12 literal filenames across tracked app and Watcher source; verify any client/API/history URL needs and actual processes/open FDs; require separately durable original signed package copies/role witness and exact-path owner permit if ever proposing a name removal. Default **HOLD** for all 12 files. No newly machine-cleanable bytes in Session D; all verified checks are read-only.



## Legacy Watcher alias retirement proof — manifest and tracked-code reference audit (owner terminal, 2026-10-27)

The owner performed a new **READ_ONLY** survey of four current-Mac local inventory files plus `git grep -n -F` of twelve literal asset names against the **tracked checkout sources** of canonical `app-prodn` and `aoe2-watcher`. The scan reported no errors and **zero tracked-source exact-name matches** in either repo. It did not examine Git history, untracked source/config, external URLs, developer machines, web server access logs, running tasks or open FDs.

| Inventory file in local `aoe2-watcher/dist` | Space-named references found | Hyphen-named aliases referenced |
|---|---|---|
| `watcher-release-manifest-1.6.0.json` | Canonical 1.6.0 AppImage, DMG and Windows Setup | **0** |
| `SHA256SUMS-1.6.0.txt` | Canonical 1.6.0 AppImage, DMG and Windows Setup | **0** |
| `watcher-release-manifest-1.6.3.json` | Canonical 1.6.3 AppImage, DMG and Windows Setup | **0** |
| `SHA256SUMS-1.6.3.txt` | Canonical 1.6.3 AppImage, DMG and Windows Setup | **0** |

This combines with the previous 6/6 full SHA-256 equality proof to establish that **the six hyphen-named aliases are not required by the four scanned release manifests/checksums and are not named literally in either scanned Git checkout**. Their corresponding space-named canonical files remain byte-identical signed/published artifacts and would be retained.

**Classification advanced only to** `PROVEN_CONTENT_DUPLICATE_UNREFERENCED_IN_CHECKED_IN_SOURCE_PENDING_EXTERNAL_AND_RUNTIME_CONSUMERS`, not automatic cleanup authority. Exactly six alias paths are conditional candidates, logical one-copy total **742,422,002 B (0.6914 GiB)**. They are **not** tracked source, and no actions have been authorized on the Mac's `app-prodn/public/downloads -> watcher/dist` alias. The HEL1 `watcher-downloads` deletion/receipt controller has unrelated authority over the production volume and must not be reused on these Mac aliases.

**Remaining gates before guarded one-path retirement:**
- Inspect exact 12 filenames in local active web/npm configuration, untracked scripts, HTTP deep links/redirects, launch agents, updater metadata and historic release compatibility policy. A zero `git grep` exact-match is not a full consumer graph.
- Reinspect both live file identities and hashes, source SHA, owner, path confinement, symlink ancestors, `lsof`/process readers, hardlinks/clones if ascertainable, and Mac-local website availability.
- Independently preserve and verify the original signed bytes and manifests of at least one canonical filename, and record a deterministic rollback recipe that restores any required legacy URL. Because the site symlink lands at `dist`, deleting an alias removes that precise local download URL.
- Secure explicit owner approval for each exact changed path on an isolated Storage OS review lane. Do not automatically route a test snippet through the HEL1 release controller; never touch signed evidence, installer manifests, wallets, game recordings or Codex work.
- Produce before/after **APFS Data** free bytes, verified source/worktree unchanged, and locally durable Storage OS receipt; if unproven, `HOLD`, `newly_reclaimed=0`.

**Decision:** safe to continue to active-consumer and rollback review. **No immediate delete. No bytes reclaimed in this phase.**


## Open-FD and updater names check — owner terminal (2026-10-27, latest)

The owner ran a final **read-only** `lsof -nP -Fpn <exact alias path>` probe for each of the six **hyphen-named** v1.6.0/v1.6.3 legacy watcher aliases, plus a bounded full-text check for each of those aliases in each of `dist/latest.yml`, `dist/latest-mac.yml` and `dist/latest-linux.yml`. All six exact files existed as regular nonsymlinked files at probe time.

| Version | Alias | Open-FD result |
|---|---|---|
| 1.6.0 | `AoE2HDBets-Watcher-1.6.0.AppImage` | `NO_OPEN_HANDLE_OBSERVED` |
| 1.6.0 | `AoE2HDBets-Watcher-1.6.0-arm64.dmg` | `NO_OPEN_HANDLE_OBSERVED` |
| 1.6.0 | `AoE2HDBets-Watcher-Setup-1.6.0.exe` | `NO_OPEN_HANDLE_OBSERVED` |
| 1.6.3 | `AoE2HDBets-Watcher-1.6.3.AppImage` | `NO_OPEN_HANDLE_OBSERVED` |
| 1.6.3 | `AoE2HDBets-Watcher-1.6.3-arm64.dmg` | `NO_OPEN_HANDLE_OBSERVED` |
| 1.6.3 | `AoE2HDBets-Watcher-Setup-1.6.3.exe` | `NO_OPEN_HANDLE_OBSERVED` |

All three updater manifests returned empty matching alias arrays: `latest.yml: []`, `latest-mac.yml: []`, `latest-linux.yml: []`. These values do **not** authenticate the updater metadata as current or valid, and do not prove historical consumers absent. Individual `lsof` zero-PID sightings are timing/permission-limited, not a perpetual no-consumer assertion.

**Cumulative evidence:** all six hyphen aliases SHA256-match respective canonical space names (742,422,002 B one-copy logical total), have different inodes, are excluded from all four v1.6.0/v1.6.3 local SHA256SUMS/manifest files, have no exact-name checked-in source references in two repos, have no alias reference in the three latest updater YAML files, and show no open file handles **at this observation**. The `app-prodn/public/downloads` symlink still resolves to this same Mac-local `dist` tree.

**Remaining eligibility and safety boundary:** historical/out-of-tree HTTP URLs, other untracked config/processes, upstream GitHub durable-release checksum parity, signature retention, same-filesystem APFS clone/snapshot allocation, and a **URL-preserving reversible single-file procedure** remain unproven. The canonical installer names and all updater/release manifests must remain immutable. Do not run HEL1 `watcher-downloads --apply` against this Mac path. A zero-handle observation plus duplicate SHA is **not automatic approval to unlink**. No cleanup executed. **0 B incremental verified reclaim**, earlier +2.606 GiB historical reclaim unchanged.

**Potential safer direction for an independently approved future transaction**: first qualify an exact alias-preserving, regular-file-preserving APFS copy-on-write deduplication candidate (with current hashes, allocated-block checks, atomic replacement, ability to restore independent bytes from the verified canonical file) rather than removing an HTTP-facing historical path. Such a transaction may reclaim **less than 742,422,002 B** due to APFS shared extents and snapshots, and needs separate per-file owner authorization, tested rollback, bounded scope, and a postflight `df -k /System/Volumes/Data` receipt. Do not treat this paragraph as a cleanup instruction or as evidence that the Mac supports a particular dedup operation.


## Phase 10 owner task — APFS proof and URL-preserving retention (2026-10-27)

**Current reviewed extension:** [Phase 10 APFS clone/retention/Storage Atlas handoff](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md) with [strict disposable macOS/APFS fixture-only Python probe](fixtures/session_d_apfs_clone_fixture.py). Independent GitHub release v1.6.0/v1.6.3 SHA-256 assets match all six prior Mac full-file duplicate digests; these are published immutable binary content references, **not guarantees about historical local web download URLs**. The offline Mac connector **cannot execute APFS fixtures in this session**; `PASS_APFS_FIXTURE_ONLY` remains pending Mac operator run. This review continues on isolated PR #942, not frozen finance, staged site or Codex branches. **No actual Watcher file was cloned, replaced, deleted, moved or relinked. Newly reclaimed 0 B.**

## Exit / honest status

- Previously reclaimed **2.606 GiB verified**, no source worktree removed.
- **Additional reclaimed in this document/session: 0 B** (a new operator Mac read-only census succeeded; no apply, deletion or cleanup).
- APFS Data latest **operator-reported** free at 15:04Z: **11,402,824 KiB ≈ 10.875 GiB**, down approximately **3.29 GiB** relative to the earlier 14.165 GiB post-cleanup receipt. APFS free-space accounting may shift with snapshots/shared-volume effects; no new-write cause is proven.
- 11 dirty attached worktrees, all original game recordings, recovery chunks, financial material, historical context, device backups and creative media remain preserved by policy, not certified by a live fresh scan.
- Next machine-level gate: bounded exact-path allocation/process/FD/build-consumer receipt for a current isolated `.next` or watcher `dist`, then qualify one exact generated tree at a time; personal/financial classes stay owner-review or prohibited.

Source evidence: [Mac Phase 2 #6443340265](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6443340265), [Phase 3 #6444005305](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444005305), [retention #6444127715](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444127715), [guarded removal #6444200364](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444200364), and [Central Phase 8 #6444694527](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444694527).
