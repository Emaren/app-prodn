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


## Phase 10 disposable APFS fixture first-run HOLD and correction (2026-10-27)

Mac owner executed pinned original fixture with verified Git blob and Python syntax; result **`HOLD_APFS_FIXTURE_NOT_VERIFIED / WATCHER_TARGET_NOT_APFS: no fixture attempted`**. **Our fixture used `/usr/bin/stat -f %T` incorrectly as a filesystem-type detector; on Darwin `%T` is the file type**. No actual APFS COW test executed, no Watcher binaries modified, no space reclaimed. This is not proof Watcher is not on APFS. Corrected same review-branch fixture source at `8cc634410babc899af0bf4f8fb2e501e8be5a386` (blob `d33a87067225e6a19b9bf4cfab78aea08c3ba75c`) uses `diskutil info -plist /System/Volumes/Data` plus exact device identity and fail-closed temp device check. The operator rerun is still pending, and even `PASS_APFS_FIXTURE_ONLY` cannot authorize real file mutation. Detailed correction and new pinned rerun are in [Phase 10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).


## Phase10 second Mac fixture execution — Python xattr platform error (2026-10-27)

Owner fetched verified immutable corrected fixture `8cc634410babc899af0bf4f8fb2e501e8be5a386`, blob `d33a87067225e6a19b9bf4cfab78aea08c3ba75c`: fetch, blob SHA and Python compile **PASS**. The corrected macOS APFS and same-device checks therefore passed far enough to enter temporary fixture creation, but test crashed on `os.setxattr` because CPython `os.setxattr/getxattr/listxattr` are **Linux-only**. This is **our test portability defect**, not evidence of an APFS failure. `clonefile` was **not attempted**, no URL/rollback fixture acceptance obtained. The only write attempts were in disposable `TemporaryDirectory`, not actual Watcher. Context manager normally removes test files on exception but no independent postflight receipt was generated. **No actual Mac production/path modifications or newly reclaimed bytes.**

Updated fixture pinned at source `316815be0d1ce13db27aa2164770f7b3cbd7955a`, blob `da0f5c21812829fe8b770bbacc585aba2b2dbfaa`, substitutes strict macOS `/usr/bin/xattr -w` and `xattr -p -x` system commands for fixtures only; validates marker, lists and hashes exact extended attributes. Re-run required, with `PASS_APFS_FIXTURE_ONLY` still **HOLD** pending owner output. Details, precise pinned command and updated Storage Atlas status in [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md). Actual Watcher files, historical download names and source/worktree evidence remain protected.


## Phase 10 third Mac fixture receipt — Native APFS PASS, real Watcher still HOLD (2026-10-27)

The Mac owner ran the reviewed fixture at source `316815be0d1ce13db27aa2164770f7b3cbd7955a`, Git blob `da0f5c21812829fe8b770bbacc585aba2b2dbfaa` and passed source hash and syntax verification. Native `clonefile(2)` now **PASS with no fallback**, write-isolation **PASS**, separate fixture inode **PASS**, mode/uid/gid/flags/mtime/all fixture xattr matching **PASS**, simulated website downloads symlink continuity **PASS**, original temporary inode rollback **PASS**. JSON `status=PASS_APFS_FIXTURE_ONLY`, 4-MiB fixture each; `actual_watcher_files_touched=0`, `actual_watcher_reclaimed_bytes=0`, `fixture_cleaned_on_normal_exit=true`. The fixture tests temporary files, NOT the real release binaries or their ACLs, historic URL access, release signatures/metadata, file handles, or real-app source. No real transaction authorized.

Fixture-local `os.statvfs` available **7,440,388,096 bytes (~6.929 GiB)** before/after the test, `delta=0`. Older direct APFS Data `df` available ~10.875 GiB (15:04Z). **No fresh direct Data df after the fixture or cause-of-decrease proof**. Re-measure APFS Data and snapshots read-only; don't interpret one filesystem free observation as newly reclaimed space or as the reason for the decline. The exact outcome, Atlas telemetry and next one-pair real-file metadata admission are in [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).

**Current decision:** `PASS_APFS_FIXTURE_ONLY / HOLD_ACTUAL_ALIAS_MUTATION`, separate owner transaction authorization missing; six SHA-proven aliases still intact; previous +2.606 GiB historical `.next` cleanup only, Phase10 newly reclaimed **0 B**.


## Phase 10 first real-file metadata gate — mtime-only mismatch, APFS free 6.9265 GiB (owner read-only; 2026-10-27)

The operator ran exact SHA-bound and ACL/xattr metadata comparison of two real 1.6.0 Linux AppImages in Watcher `dist`. Both 134,013,759 B, SHA256 `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266`, `st_dev=16777234`, `st_nlink=1`, separate inodes `175834577` (space-named canonical) and `175834590` (hyphen-named alias), `mode=0755` (493 decimal), `uid:gid=501:20`, `flags=0`, 261752 allocated 512-B blocks each, **empty ACLs and xattrs**. Local app `public/downloads` symlink unchanged and `samefile(dist)=true`.

**The strict metadata gate correctly reported `HOLD_METADATA_OR_IDENTITY_MISMATCH`, because `mtime_ns` differs by 1,077,170,113 ns:** canonical `1790014547600303259`, alias `1790014548677473372`. Separate `birthtime` values observed too: canonical `1790014547.4174945`, alias `1790014547.6003032`, inherently not preservable as identical to the original alias after replacing its inode. All other compared regular-file metadata and digests matched. This is a **specific fixable-on-staged-fixture timestamp compatibility issue**, not deletion permission or reason to ignore metadata.

**Mac APFS Data latest exact `df -k`:** total 482,797,652 KiB, used 431,006,732 KiB, available **7,262,984 KiB = 6.926521 GiB**, displayed capacity **99%**. Earlier available **11,402,824 KiB ~10.87458 GiB** at 15:04Z; drop **4,139,840 KiB = 3.94806 GiB**. Compare `df` available directly, never total-minus-used under shared APFS accounting. **Cause remains UNPROVEN**. A prior fixture `statvfs` about 6.9294 GiB free is directionally consistent, but 0 bytes new reclaim occurred. Snapshot inventory/read-only `df` and build-output growth attribution now high priority; never delete snapshots automatically to restore reported free capacity.

**New isolated doc-only fixture variant** at source commit `8f8e5f9c004fab054478f5d97337af5346db7a55` (Git blob `1706a45c9229c501d9bf91d6024dc2a81262aa57`) stages a clone with **alias-specific original mtime** and tests divergent-mtime fixtures/URL/rollback. **NOT YET RUN BY MAC OWNER**, unlike previous successfully tested equal-mtime disposable case. All actual Watcher files still protected and unmodified. Detailed identity, Storage Atlas telemetry and new acceptance gates in [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md). `actual_reclaimed=0`.


## Phase10 fourth operator Mac fixture — mtime divergence PASS and snapshot-localized free accounting (2026-10-27)

Owner fetched immutable source commit `8f8e5f9c004fab054478f5d97337af5346db7a55` and verified Git blob `1706a45c9229c501d9bf91d6024dc2a81262aa57` + Python syntax. The fixture returned **`PASS_APFS_FIXTURE_ONLY`**, `different_initial_mtimes=PASS_ONE_SECOND_DIVERGENCE`, `staged_alias_original_mtime_restored=PASS`, native `clonefile_syscall=SUCCESS_NO_FALLBACK`, COW isolation PASS, ordinary separate inode PASS, metadata/fixture xattr PASS, simulated website symlink continuity PASS, private original-inode hardlink rollback PASS. The script reported `actual_watcher_files_touched=0`, `actual_watcher_reclaimed_bytes=0`, fixture `4194304 B` each, `free_bytes_before_test=free_bytes_after_test_before_temp_cleanup=9581416448` (delta 0), fixture cleanup on normal exit. **This was only a disposable test:** real historical download paths, real-file birthtime/ctime/inode, ACLs, signed binaries and concurrency not tested by the fixture, and no user-approved real transaction executed.

**Direct latest Mac Data `df -k`:** total 482,797,652 KiB, used **431,003,520 KiB**, available **9,365,044 KiB = 8.931202 GiB**, 98% reported used. Prior observation used 431,006,732 KiB and available 7,262,984 KiB (6.926521 GiB); **free available increased 2,102,060 KiB = 2.004681 GiB** while used declined just **3,212 KiB**. This is a filesystem allocation/free-pool observation, **NOT 2 GiB of newly reclaimed files and NOT a causal proof**. The latest reading is still **1.943378 GiB lower** than older 11,402,824 KiB Data available at 15:04Z. Difference between non-simultaneous fixture statvfs and direct Data df is 8 MiB. Cause of fluctuations remains unproven.

**Snapshot inventory:** `diskutil apfs listSnapshots /System/Volumes/Data` → **`No snapshots for disk3s5`**. `tmutil listlocalsnapshots /` → **3** `com.apple.os.update-...` snapshots for the volume group containing `/` (not evidence of Data volume snapshots). No snapshot purge/thinning approved. Use a read-only whole-APFS-container and other-volume accounting census before attributing capacity to any writer or proposing cache cleanup.

**Updated classification:** `PASS_DISPOSABLE_APFS_MTIME_FIXTURE_ONLY / HOLD_REAL_ALIAS_METADATA_URL_CONSUMERS_HUMAN_APPROVAL`. Before real alias stage recheck owners/ACLs/xattrs/flags/mtime, actual HTTP URL consumers and active FDs and require explicit original inode/birthtime/ctime tradeoff approval; separately authorize original-backup release after a verification period. Existing `aoe2war watcher-downloads` only governs HEL1 production and does **not** authorize Mac aliases. Phase10 actual reclaim still **0 B**; previous historical unrelated `.next` recovery **+2.606 GiB**. Full acceptance and Storage Atlas telemetry: [Phase10 APFS plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).


## APFS disk3 container and Data df exact reconciliation; build directories stable (2026-10-27)

Owner performed **read-only** `df -k /System/Volumes/Data`, full `diskutil apfs list`, and exact `du -sk` on Docs-context `.next`, Watcher `dist` and Go cache. `diskutil` APFS `disk3` (UUID `DF99D6D6-A364-41E4-B992-12ED76BB8353`) reports container capacity **494,384,795,648 B**, used **484,793,401,344 B (98.1%)**, unallocated **9,591,394,304 B**. Data volume `disk3s5` consumes **441,347,043,328 B**. First Data `df`: total `482797652` KiB, used `431002972` KiB, available **`9366596` KiB = 8.932682 GiB**, 98% displayed used. **Exact accounting check:** `431002972*1024=441347043328` B equals Data consumed, and `9366596*1024=9591394304` B equals the APFS container's shared unallocated capacity. No duplicate space-counting.

Other APFS volumes: System `disk3s1` **18,507,264,000 B** (reports `Sealed: Broken` on the update-mounted volume while **mounted root snapshot is sealed**; does not establish broken running OS); Preboot `disk3s2` **16,201,957,376 B**, Recovery `disk3s3` **2,414,116,864 B**, VM `disk3s6` **5,371,052,032 B**. All OS-managed and explicitly excluded from operator cleanup; none is a reclaim authorization. Prior read-only Data snapshot inventory: `No snapshots for disk3s5`, three `com.apple.os.update-...` listed for root volume group.

Three targeted candidate directories are **unchanged** vs preceding scan: protected docs-context `.next` **1,328,688 KiB**, Watcher `dist` **3,434,896 KiB** (same target as local website `public/downloads` symlink), Go build cache **627,104 KiB** = 642,154,496 B. All HOLD; none explains earlier 2–4 GiB fluctuations. Latest available is **1,552 KiB more** than previous `9,365,044 KiB` Data `df`, so stable at roughly **8.93 GiB** over the two most recent direct checks; unknown change source.

**One shell error:** final `df` after the loop returned `zsh: permission denied: df` (despite first `df` PASS in same command batch). Thus **no closing Data df sample**; cause unverified; check `whence -va df`, `/bin/ls -l /bin/df`, and invoke `/bin/df -k /System/Volumes/Data` read-only. Do not infer filesystem permission breakage or trigger repair from that message.

**Decision:** `PASS_MAC_APFS_CONTAINER_DF_RECONCILIATION`; `PASS_3_TARGET_BUILD_SIZES_UNCHANGED`; `HOLD_CAPACITY_CAUSALITY`; `HOLD_FINAL_DF_SHELL_ERROR`; `PASS_DISPOSABLE_APFS_MTIME_FIXTURE_ONLY`; `HOLD_WATCHER_REAL_CHANGE`. Phase10 newly reclaimed **0 B**, historical two isolated `.next` outputs +2.606 GiB. Full telemetry and context [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md). Frozen finance, staged website, Codex and actual release files remain untouched.


## Phase10 direct /bin/df follow-up — zsh `path` special variable overwrote `PATH`, newest free 7.924 GiB (2026-10-27)

The user's exact same interactive zsh shell ran `builtin whence -va df` → **`df not found`**, but `/bin/ls -l /bin/df` showed a valid executable `-rwxr-xr-x 1 root wheel 119152`, and `/bin/df -k /System/Volumes/Data` immediately succeeded. The earlier **assistant-authored** `for path in ...` shell loop assigned to zsh's **special tied `path` array**, thereby clobbering command search environment `PATH` with the loop's final `~/Library/Caches/go-build` directory. **This is a diagnostic shell-script defect, not a filesystem permission or corrupt system command condition.** Avoid using `path` as an interactive zsh loop variable; use `candidate_dir`. A normal login-shell restart `exec /bin/zsh -l` restores startup setup but resets existing shell-local state. No chmod, OS command edits or permissions repair indicated.

**Later owner read-only Data `df`:** total 482,797,652 KiB, used **431,011,556 KiB**, available **8,308,892 KiB = 7.923977 GiB**, displayed 99% used, mount `/dev/disk3s5`. Compared with immediately prior successful Data `df` `used=431002972` KiB / `available=9366596` KiB (8.932682 GiB), used **increased 8,584 KiB**, available **decreased 1,057,704 KiB = 1.008705 GiB**. Neither shell failure nor three unchanged output candidates explains this free variation. The prior `diskutil` shared container/free exact reconciliation was time-scoped to that earlier `df`; no subsequent `diskutil` container receipt was supplied in this operator batch. No proof of deletion, snapshot causality, new Docker/cache output or specific VM/preboot writer. Mac storage activity and APFS shared-pool interpretation still **HOLD**.

**Changes/authority:** user executed read-only shell diagnosis, no real Watcher artifact, signed download URL, worktree, protected media, Codex, financial, APFS snapshots or build output altered; **0 B actual new reclaimed**. Prior native mtime-divergent disposable APFS fixture PASS remains; actual six legacy hyphen aliases have no owner authorization to change. Full revised source and Atlas fields [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).


## zsh shell PATH incident CLOSED by new login shell (2026-10-27)

The operator ran `exec /bin/zsh -l` and confirmed native arm64, active pyenv 3.13.5 and loaded project direnv `.envrc`. `builtin whence -va df` returned **`df is /bin/df`**, and `/bin/df -k /System/Volumes/Data` ran successfully. This independently closes the earlier `PATH` clobber caused by assistant's unsuitable `for path in ...` zsh loop. No evidence of Mac disk permission trouble or system binary damage; no filesystem or developer workspace mutation occurred.

Latest Data `df` reported total `482797652` KiB, used **`431010500` KiB**, available **`8309948` KiB = ~7.924984 GiB**, displayed 99% used, mount `/dev/disk3s5`. Compared to immediately previous `/bin/df`: used `431011556`, available `8308892` KiB. Thus available increased **1056 KiB (~1.031 MiB)** and used decreased by same small amount, effectively stable for consecutive reads. Earlier larger free-space fluctuations remain **unattributed**; other APFS volumes, swap/purgeable accounting and active writers need read-only comparison, not speculative deletion.

**Gate transitions:** `PASS_ZSH_LOGIN_RESTORED`, `PASS_DF_COMMAND_LOOKUP`, `PASS_DIRECT_DATA_DF`, `HOLD_APFS_FREE_FLUCTUATION_CAUSALITY`. APFS mtime-divergence fixture already PASS only on disposable files. **No real Watcher clone, replacement, unlink, symlink change, worktree cleanup or cache apply approved or executed. Actual Phase10 reclaimed 0 B.** [Phase10 detailed evidence and telemetry](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).


## Phase10 source of the latest 1-GiB free-space loss: APFS VM allocation increased (read-only, 2026-10-27)

Operator compared new full `diskutil apfs list` on `disk3`, `sysctl vm.swapusage`, `df -k /System/Volumes/Data` with the prior full `diskutil` receipt. Same container UUID `DF99D6D6-A364-41E4-B992-12ED76BB8353`, total 494,384,795,648 B unchanged. Container allocated grew **1,085,988,864 B (1035.68 MiB)** and unallocated fell by exact same bytes, from 9,591,394,304 to **8,505,405,440 B**. VM `disk3s6` consumed grew from 5,371,052,032 to **6,445,350,912 B** (**+1,074,298,880 B = 1024.531 MiB**, **98.9236%** of entire allocated delta); Data `disk3s5` consumed grew from 441,347,043,328 to **441,358,733,312 B** (**+11,689,984 B = 11.148 MiB**, 1.0764%). System/Preboot/Recovery consumed **unchanged**. Exact sum of VM + Data growth = entire container allocated growth. Latest Data `df` used **431,014,388 KiB** equals Data consumed, and available **8,306,060 KiB = 8,505,405,440 B ≈ 7.9213 GiB** equals container free exactly. This resolves **which APFS volume** accounts for the latest approximately 1-GiB free-space loss; older greater fluctuations are still partly unexplained.

`sysctl vm.swapusage` showed encrypted swap **total 5120.00M**, **used 3912.19M**, **free 1207.81M**. Active swap is substantial, but only a **single snapshot**: no proof what program drove growth or that VM-volume consumed is numerically equal to currently used swap. **Never remove files under `/System/Volumes/VM` or manipulate swap manually**. OS-manages VM, System/Preboot/Recovery and update snapshots remain protected; none of this qualifies an automatic cache purge. Process-memory/pressure sampling and compare later exact container readouts **read-only**, protect unsaved work and Codex.

**Decision:** `PASS_RECENT_CONTAINER_DELTA_VM_98_9_PERCENT_DATA_1_1_PERCENT` / `HOLD_INDIVIDUAL_PROCESS_CAUSALITY_AND_OLDER_SWINGS`; no actual Watcher edits, installer URL removal, workspace retirement or newly reclaimed storage. Previous disposable clone+timestamp restoration+rollback PASS; genuine first 1.6.0 AppImage alias still requires active-reader/historical URL, metadata and two-stage explicit owner permission. Complete exact byte evidence and Storage Atlas fields: [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).


## Phase 10 owner process-memory receipt — Chrome is main *observed* RSS cohort, process causality HOLD (2026-10-27)

Read-only actual Mac `vm_stat`, `sysctl vm.swapusage`, top-20 `ps` sorted by resident `rss`, and direct Data `df` show memory demand and modestly declining swap-used in this specific sample, **not** new evidence of file cleanup. `vm_stat` reports 16 KiB pages, 14,478 free, 287,344 active, 281,890 inactive, 115,490 wired, 304,192 compressor-occupied and 945,399 pages stored in compressor. Compression/pagein/pageout/swap-in/swap-out counters have no baseline and are cumulative; cannot deduce recent rates from this alone. Mac swap `total=5120.00M used=3872.19M free=1247.81M`, used **40.00 MiB lower** than previous `3912.19M` sample.

In the **top-20 PID list**, **13 Chrome processes** total **5,696,256 KiB summed RSS (~5.432 GiB)**, and **4 ChatGPT/Codex processes** total **684,512 KiB (~0.653 GiB) summed RSS**. RSS across processes is **not additive unique resident memory** and should not be interpreted as a Chrome swap accounting receipt; process attribution to previous APFS VM allocation growth is **not proven**. The two largest Chrome helpers alone had RSS `1,011,872 KiB` (PID 970) and `846,080 KiB` (PID 18590). Chrome is the most visible *candidate* for owner-directed optional tab/process optimization only after preservation of unsaved work. No kill/restart command provided or executed.

Current `df -k /System/Volumes/Data`: total 482,797,652 KiB, used **431,013,652 KiB**, available **8,306,796 KiB = 7.921978 GiB** (99% displayed used). From previous full-container sample used 431,014,388 KiB and available 8,306,060 KiB, delta ±736 KiB, so near-term free is **stable**. Earlier container growth location was 98.9% VM and 1.1% Data, but no causal Chrome history or fresh VM-size sample accompanies this ps list. Phase10 newly reclaimed still **0 B**.

**New independent runtime warning:** Starship timed out on `~/.pyenv/shims/python`; prompt switched from Python 3.13.5 to **3.14.7** after the command. This is a configuration/selection drift signal, not proof of changed canonical build interpreter. Require read-only `command -v python`, `python --version`, `pyenv version`, relevant `.python-version`/direnv policy and optional `memory_pressure -Q` before any development/build/release action. Do **not** switch/install Python or alter starship/direnv solely on prompt signal. Detailed Atlas telemetry and safe next command: [Phase10 plan](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).

**HOLD** actual Watcher alias transaction, signed downloads URLs, protected Codex/wallet/recordings/financial/system swap, APFS snapshot cleanup, source worktree retirement and automatic process shutdown. Disposable APFS clone+differing-mtime rollback test remains PASS, owner transaction authority still absent.


## Phase 10 verified pyenv 3.13.5, memory pressure 51% free and declining swap (owner terminal, 2026-10-27)

Mac owner ran read-only `/usr/bin/memory_pressure -Q`, `python --version`, `pyenv version`, `sysctl vm.swapusage` and `/bin/df -k /System/Volumes/Data`. **System-wide memory free percentage 51%** (16 GiB installed, 16 KiB pages). This isolated reading does not establish acute memory pressure. **Actual Python `3.13.5`**, `/Users/tonyblum/.pyenv/shims/python`; `pyenv version=3.13.5` selected by `app-prodn/.python-version`. The prompt's intermittent `3.14.7` display/Starship Python-shim timeout did **not** reflect verified selected interpreter drift. Python environment HOLD **CLOSED** without changing toolchains.

Swap `total=5120.00M`, `used=3760.19M`, `free=1359.81M`, encrypted. Swap used **−112 MiB** from immediately previous 3872.19M and −152 MiB from older 3912.19M. Swap use change does not establish current VM volume physical allocated shrinkage; a fresh diskutil after this sample was not provided. Data `df` `Used=431019720`, `Available=8300728 KiB ≈ 7.9162 GiB`, displayed 99%, used +6068 KiB and available −6068 KiB (~5.926 MiB) from prior direct `df`. Larger historic capacity fluctuations remain only partially localized to VM growth between two earlier container samples, not to individual Chrome processes.

**Current gates:** `PASS_PROJECT_PYTHON_3_13_5`, `PASS_MEMORY_PRESSURE_SNAPSHOT_51PCT_FREE`, `PASS_SWAP_USAGE_DECLINING`, `HOLD_PAST_VM_PROCESS_CAUSALITY`, `HOLD_WATCHER_REAL_ALIAS_AUTHORIZATION`. No Chrome/Codex process terminated, signed installer file or historical URL changed, APFS snapshots/VM files touched, or storage deletion executed. **Phase10 recovered 0 B**. Move to exact **read-only** worktree `.next` BUILD_ID/rollback consumer qualification, protected source/adjacent release-state preservation and existing Storage/Workspace OS previews. Detailed [Phase10 plan and Storage Atlas](SESSION_D_PHASE10_APFS_CLONE_PLAN_20261027.md).


## Exact docs-context worktree .next identity and adjacent release-state gate (owner Mac, 2026-10-27)

Operator ran **read-only** inspection of exact candidate `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015/.next`, without using the special zsh `path` loop variable:
- `du -sk` reports **1,328,688 KiB = 1.267 GiB** allocated, **unchanged** from prior Mac census.
- `ls -ld` shows `.next` directory `drwxr-xr-x`, mtime `Oct 15 12:01`, and adjacent **protected** `.aoe2war-release` directory `drwxr-xr-x`, mtime `Oct 15 12:03`; both owned by local user/staff. These directory times do not establish that no other process currently reads a file within.
- `.next/BUILD_ID` exists; SHA256 **`3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522`**. This is the **hash of the BUILD_ID file**, not the build-ID string, a checksum of the entire `.next` tree, a package/build receipt or proof the deployed website currently serves that build.
- `git -C <exact-worktree> rev-parse HEAD` → **`99c406f57d759b672fd9fe91d3c3355c4d527705`**.
- `git --no-optional-locks -C <exact-worktree> status --porcelain=v1 --untracked-files=normal` returned **no lines**, i.e. no Git tracked/untracked changes in this defined scope at observation. It **does not** enumerate Git-ignored build/release artifacts, test active processes, determine whether the worktree is still attached/merged, or prove release authority.

**Existing source-context corroboration:** tracked `scripts/aoe2_release.py` and `scripts/aoe2_speed_build.py` explicitly use `.aoe2war-release` receipt/state directories and inspect `.next/BUILD_ID` as release/build authority signals (source search on canonical `app-prodn/main@14ce7104`). Their presence is reason to **protect** the adjacent release evidence, not declare this historical worktree's `.next` active or disposable. No source transaction was executed.

**Classification:** `PASS_EXACT_GENERATED_BUILD_IDENTITY_SHA` / `PASS_WORKTREE_GIT_STATUS_EMPTY` / `PASS_RELEASE_ADJACENT_DIRECTORY_PRESENT` / `HOLD_NEXT_BUILD_RUNTIME_AND_ROLLBACK_CONSUMERS` / `HOLD_DELETE_OR_REPLACE`. Conditional upper-bound historical allocation of this **one** `.next` directory ≈**1.267 GiB**, but **0 B newly qualified for cleanup** and **0 B reclaimed**. No worktree removal, no source changes, no `.next` deletion, no `.aoe2war-release` modification.

**Next read-only proof:** `du -sk` and bounded **file names/types only** within `.aoe2war-release` (never dump secret/token-bearing receipt contents), verify exact `BUILD_ID` consumer-match status without exposing sensitive fields, ensure no process with open FDs/cwd/executable or Next.js server working against the exact `.next`/worktree, inspect worktree attachment/branch and active release lock/rollback provenance. A scan finding no open FDs is only point-in-time evidence and cannot prove no future consumer. Do not use `lsof +D` recursively over an enormous tree by default. Respect canonical Storage/Workspace OS preview-only commands and separate human authorization.

## Attached docs-context worktree, protected release category directories and cwd probe (owner Mac, 2026-10-27)

The owner performed another bounded **read-only** check of exact worktree `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015`:
- The adjacent `.aoe2war-release` **exists** and `du -sk` reports **0 KiB allocated**. **This does not mean it is empty, redundant or a valid cleanup candidate**. `ls -la` shows three directories: `federation-validation` (Oct 15 12:03), `recovery-campaigns` (Oct 15 11:58), `storage-handoffs` (Oct 15 11:59). Only top-level names/metadata were observed, not contents. All three and the parent remain **PROTECTED_RELEASE_EVIDENCE** even if allocated usage rounds to 0 KiB.
- `git -C "$WT" worktree list --porcelain` matched the exact existing **attached worktree** and reports `HEAD=99c406f57d759b672fd9fe91d3c3355c4d527705`, `branch=refs/heads/fix/update-independent-docs-context-20261015`. Earlier Git status was empty but **this branch's merge/release authority and ignored build content remain unqualified**. **Never prune/remove this attached worktree**.
- `lsof -nP -d cwd -Fpn` filtered to path-prefix under the worktree returned `NO_MATCH_OBSERVED_POINT_IN_TIME`. This is **negative evidence for observable current working directories only**. It does **not** rule out open file descriptors under `.next`, executable paths, detached services referencing BUILD_ID, future readers, or processes omitted by permission/security restrictions.
- `.next` remains the exact **1,328,688 KiB (~1.267 GiB)** generated build at historical HEAD. SHA-256 of `.next/BUILD_ID` file is `3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522` from preceding bounded probe; **not** a full tree digest or active release-state binding.
- **No file operations performed**: no movement, unlink, clone or retained-state inspection beyond metadata; no recertification of the actual web deployment.

**Gate state:** `PASS_ATTACHED_WORKTREE_IDENTIFIED`, `PASS_RELEASE_ROOT_TOPLEVEL_CATEGORIES_IDENTIFIED`, `PASS_NO_MATCH_OBSERVED_WORKTREE_CWD_AT_POINT_IN_TIME`; `HOLD_FILE_FD_RUNTIME_AND_RELEASE_CONSUMERS`, `HOLD_BRANCH_RELEASE_AUTHORITY`, `HOLD_DELETE_NEXT`. Conditional historical generated-output allocation 1.267 GiB; **currently qualified cleanup=0 B; newly reclaimed=0 B**. Protected sibling evidence is never a conditional cleanup target.

**Next safe inspection:** bounded all-FD pathname check against this one exact `.next` tree without using recursive `lsof +D`, read-only category/file-count census of three `.aoe2war-release` subtrees without dumping possibly sensitive receipt payloads, and existing Workspace/Storage OS preview-only diagnostics. FDs or cwd absent on one snapshot do **not** alone prove future release/rollback non-use. Separate owner cleanup approval and preservation/rebuild/rollback receipts still required.


## Full observable FD census excludes current .next users; three protected federation symlinks confirmed (owner Mac 2026-10-27)

The operator executed a dedicated, read-only Python probe under project pyenv 3.13.5, confirming that the exact worktree target exists as a non-symlink directory. It invoked `/usr/sbin/lsof -nP -Fpn` with `capture_output`, check for nonzero status or stderr, 60-second timeout, then filtered every observable `n` (FD pathname) by equality with the exact `.next` path or its descendant prefix. **Observed `OBSERVED_OPEN_FD_PID_COUNT: 0` and `OBSERVED_OPEN_FD_PIDS: []`**, `POINT_IN_TIME_ONLY: true`. This augments the earlier `lsof -d cwd` no-match receipt, but absence of observed current open handles **does not** establish no future release/rollback, build or stage consumers, nor any lsof process-visibility completeness guarantee.

A bounded, non-following `os.walk(followlinks=False)` inventory of **protected** adjacent `.aoe2war-release` returned these counts:

| Protected relative subtree | Nested directories | Ordinary files observed | Symlinks observed |
|---|---:|---:|---:|
| `federation-validation` | **1** | 0 | **3** |
| `recovery-campaigns` | **1** | **1** | 0 |
| `storage-handoffs` | 0 | **1** | 0 |

All three subtree paths existed as directories and were not symlinks at the root category gate. **No symlink targets, file names, receipt contents, secrets, BUILD_ID references, or consumer authority were inspected.** Three symlinks in federation validation are potentially crucial **external or internal pointers**. The two files may contain unique provenance; protect even if `du -sk` for the parent earlier rounded to zero. Never follow/move/dereference/remove these symbolic links as a cleanup convenience.

**Candidate:** the same `1,328,688 KiB (~1.267 GiB)` `.next`, worktree HEAD `99c406f57d759b672fd9fe91d3c3355c4d527705`, attached branch `refs/heads/fix/update-independent-docs-context-20261015`, empty ordinary Git porcelain, `.next/BUILD_ID` **file** SHA256 `3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522` from preceding inspections. **No candidate size change or full generated-tree hash was measured on this latest probe.**

**Classification:** `PASS_LSOF_ALL_OBSERVABLE_PATHS_NO_MATCH_AT_SAMPLE`, `PASS_3_PROTECTED_RELEASE_SUBTREE_TYPE_COUNTS`, `HOLD_FEDERATION_SYMLINK_TARGET_IDENTITY`, `HOLD_RELEASE_REF_BUILD_ID_AND_FUTURE_RUNTIME_CONSUMERS`, `HOLD_DELETE_NEXT`. Qualified reclaim 0 B and actual Phase10 newly reclaimed 0 B. Source/worktree and `.aoe2war-release` remain immutable under this review.

**Next read-only gate:** resolve *only* the three federation-validation symlink target **types and relationships** (whether the link points at this exact `.next` or protected subtrees, within/outside attached worktree, exists/missing); expose no secret receipt payloads or potentially sensitive absolute target paths. Separately record `.next` BUILD_ID equality as a boolean in known release-state references, not arbitrary grep output. Review release authority (production build, rollback and campaign controller) via canonical read-only Storage/Workspace OS commands and require separate explicit per-path owner approval before a reversible bounded action. Do **not** recursively follow the symlinks or use destructive cleanup.

## Exit / honest status

- Previously reclaimed **2.606 GiB verified**, no source worktree removed.
- **Additional reclaimed in this document/session: 0 B** (a new operator Mac read-only census succeeded; no apply, deletion or cleanup).
- APFS Data latest **operator-reported** free at 15:04Z: **11,402,824 KiB ≈ 10.875 GiB**, down approximately **3.29 GiB** relative to the earlier 14.165 GiB post-cleanup receipt. APFS free-space accounting may shift with snapshots/shared-volume effects; no new-write cause is proven.
- 11 dirty attached worktrees, all original game recordings, recovery chunks, financial material, historical context, device backups and creative media remain preserved by policy, not certified by a live fresh scan.
- Next machine-level gate: bounded exact-path allocation/process/FD/build-consumer receipt for a current isolated `.next` or watcher `dist`, then qualify one exact generated tree at a time; personal/financial classes stay owner-review or prohibited.

Source evidence: [Mac Phase 2 #6443340265](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6443340265), [Phase 3 #6444005305](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444005305), [retention #6444127715](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444127715), [guarded removal #6444200364](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444200364), and [Central Phase 8 #6444694527](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6444694527).
