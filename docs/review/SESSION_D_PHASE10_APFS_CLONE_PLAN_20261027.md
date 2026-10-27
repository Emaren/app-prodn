# SESSION D — Phase 10 Mac APFS Watcher retention and single-alias trial plan

**2026-10-27, source-only review.** Central Command: [app-prodn #934](https://github.com/Emaren/app-prodn/issues/934). Existing review register: [SESSION_D_MAC_STORAGE_20261027.md](SESSION_D_MAC_STORAGE_20261027.md). This plan is **not** owner approval to change Watcher files, local website downloads, financial systems, held branches or HEL1 production.

## Decision and independent acceptance

| Gate | Outcome | Evidence / limitation |
|---|---|---|
| All 6/6 pairs SHA256-equal | **PASS — owner-on-Mac read-only** | 742,422,002 logical B of alternate aliases; different inodes; each six-pair digest listed in main Session D register |
| 4 old release inventories reference canonical space names only | **PASS — owner-on-Mac read-only** | 1.6.0 and 1.6.3 SHA256SUMS and JSON manifest; no alternate-hyphen strings |
| Exact tracked Git filename references in app and watcher | **PASS within scope** | 0 matches in current tracked checkout only, not across Git history, external clients or untracked scripts |
| Updater alias filenames and observed open FDs | **PASS within scope** | Three latest YAML have no aliases, six paths reported no observed handles; lsof is point-in-time and permission-bound |
| Published independent binary digest/size proof | **PASS — GitHub release metadata** | Both non-draft/non-prerelease v1.6.0 (2026-09-21) and v1.6.3 (2026-10-02) release assets have SHA256 digests equal to the six local pair digests. Release asset names use GitHub's dot-normalized names, **not identical to Mac URL path names**. Binary identities match, URLs do not. |
| Historical URL/referrer access-log compatibility | **HOLD** | Local `app-prodn/public/downloads` is an exact symlink to Watcher `dist`; URL clients, external sites and historical scripts were not exhaustively tested. Preserve all filenames |
| Actual owner-Mac APFS clonefile fixture execution | **PASS — owner Mac terminal, third execution** | Immutable source commit `316815be0d1ce13db27aa2164770f7b3cbd7955a`, blob `da0f5c21812829fe8b770bbacc585aba2b2dbfaa` verified; fixture JSON `PASS_APFS_FIXTURE_ONLY`. Strict Darwin `clonefile` succeeded with no fallback, COW isolation, metadata, test URL, original-inode rollback; no Watcher edits or reclaimed bytes |
| Alias metadata/ACL/file flags and snapshot influence | **HOLD** | Full per-file xattr/ACL/flags/current stat proof missing; APFS extent sharing/clones and local snapshots may make recovered bytes lower than logical duplication |
| Human-approved actual single-alias transaction | **NOT AUTHORIZED** | No real file replacement, clone, rename, unlink or symlink change; newly reclaimed **0 B** |

## Canonical immutable artifact identities

Each hyphen-named Mac alias has a full matching SHA256 with a **different-inode** space-named file in the same `dist`. Each digest below also matches a published GitHub release asset digest and byte length from `Emaren/aoe2-watcher`:

| Version | Format | Original and alias each (B) | Full SHA-256 |
|---|---|---:|---|
| 1.6.0 | AppImage | 134013759 | `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266` |
| 1.6.0 | arm64 DMG | 129156599 | `e128424ca6cecc5ebcf82c57d643e0774380b786780fd8b141190562a50380e3` |
| 1.6.0 | signed Windows Setup | 108035160 | `b6fa8b3ed934bb98dfbb5008148fb739575ca138b3dfc74084dd4a2b7d650f89` |
| 1.6.3 | AppImage | 134026161 | `c1d1d149dac0e49dc8ad1361e07acc85ceea61ab8d3782b6a8e54b1790d155d0` |
| 1.6.3 | arm64 DMG | 129146083 | `04c04738b23eefdb5c9c6e29c7cc1de77d28c728a34ab72d1fa48c24b354a9ff` |
| 1.6.3 | signed Windows Setup | 108044240 | `54cae410e9808e363efe0c1f1eed26648563be7fc09fa70dd9567a1eb7916e77` |

Local nominal storage of **one copy per pair** = 742422002 B = **0.6914 GiB**. **No actual APFS free-space recovery** from these files has been measured. `du` and `st_blocks` are not exclusive-physical-block measurements for APFS clones. The historical verified **+2.606 GiB** was recovered separately from two generated `.next` outputs. Current last owner Mac Data available **11,402,824 KiB ≈ 10.875 GiB** (15:04Z). Do not attribute decline from 14.165 GiB to a single cause.

### Filename and download compatibility boundary

- Exact local path: `~/projects/AoE2HDBets/aoe2-watcher/dist`; the **local** `~/projects/AoE2HDBets/app-prodn/public/downloads` is a symlink resolving to that directory. Thus all 12 exact filenames must remain addressable from the local website after any trial.
- Canonical space-named originals appear in the respective v1.6.0 and v1.6.3 SHA256SUMS and JSON manifests. The six hyphen-named aliases appear in none of those four, nor in the three latest updater YAML files or two current tracked source trees. **Absence from these files is not proof that an external historical URL no longer exists.**
- Current app `lib/watcherRelease.ts` advertises v1.6.5 with previous v1.6.4. Local `dist` inventory has no top-level v1.6.5 packages and only a partial top-level v1.6.4 inventory. This is a **Mac-local observation**; no HEL1 live-download outage is asserted.
- HEL1 canonical download retention uses `./bin/aoe2war watcher-downloads` on the VPS-mounted canonical vault with public-release SHA and runtime guard. **Never use it to modify Mac-local `dist`**, never expand its strict filename allowlist for this case, and never remove/retarget the Mac `public/downloads` symlink.

## APFS clone semantics and quality gates

Official references: Apple XNU [clonefile(2)](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/clonefile.2), Apple [About Apple File System](https://developer.apple.com/documentation/foundation/about-apple-file-system). `clonefile(src, new-dst, 0)` requests **same-APFS-volume CoW extent sharing**; destination **must not exist**. It creates a **separate inode**, with COW after writes. No silent data-copy fallback is allowed. Avoid using `cp -c` as proof: macOS `cp -c` can fallback to a regular copy on unsupported filesystems.

**Clone source identity**: hash+size+regular-file+same-device+clean exact canonical path; full xattrs, ACLs, `stat -f` flags, user/group, mode and mtime must be captured. A clone copies *source* attributes; if the alias differs from its canonical peer, **HOLD** until every mismatch is independently understood and reproduced on disposable APFS fixtures, then re-verified on a staged clone *before any separately authorized swap*. The real v1.6.0 AppImage pair differs by mtime only among the compared metadata; proposed staged-clone `os.utime` requires a new fixture pass. Existing alias inode, birthtime and ctime **cannot** all remain identical after an atomic replacement and must be consciously accepted as limitations; no claim of bit-identical filesystem object. Codesigning payload byte SHA must stay unchanged. No re-signing or binary rebuild.

**Physical storage**: distinct inodes are not a guarantee of distinct data blocks. A successful Darwin `clonefile` means the new clone initially shares source extents, but exclusive-byte attribution remains unknown. Local APFS snapshots can pin old extents; `df -k /System/Volumes/Data` before/after a final **separately authorized** private-backup release is the capacity truth. Do not delete snapshots to force a desired result.

## Fixture-only acceptance — safe before real files

[Fixture-only Python probe](fixtures/session_d_apfs_clone_fixture.py) creates `canonical.AppImage` and `legacy-alias.AppImage` **only inside an automatically created private macOS TMPDIR directory** on the **same APFS st_dev as actual Watcher `dist`**, checks source contents, metadata and separate inodes, calls Darwin `clonefile(2)` directly (zero fallback), writes a different byte to a separate clone to prove COW isolation, builds a dummy website `public/downloads` symlink, stages a cloned candidate, temporarily hardlinks the original alias into a separate 0700 fixture-private directory outside the simulated public download tree, atomic-replaces and verifies URL/hash/regular-file/metadata continuity, and **rolls back the exact original fixture inode** with `os.replace`. The temp directory is removed afterward. It **does not accept a real Watcher target argument** and never writes anything in `dist`.

On the **actual Mac**, fetch the fixture directly from the **immutable review commit** and verify the exact Git blob digest **before execution**. The command does **not** change interactive shell exit settings, and the Python fixture cannot be pointed at an actual Watcher file:
```bash
FIXTURE="$(mktemp -t aoe2war-phase10-fixture)"
URL="https://raw.githubusercontent.com/Emaren/app-prodn/316815be0d1ce13db27aa2164770f7b3cbd7955a/docs/review/fixtures/session_d_apfs_clone_fixture.py"
EXPECTED_BLOB="da0f5c21812829fe8b770bbacc585aba2b2dbfaa"
if [ -n "$FIXTURE" ] &&
   curl -fL --max-time 45 --output "$FIXTURE" "$URL" &&
   [ "$(git hash-object "$FIXTURE")" = "$EXPECTED_BLOB" ] &&
   python3 -m py_compile "$FIXTURE"; then
  echo "PASS: IMMUTABLE_FIXTURE_SOURCE_VERIFIED"
  python3 "$FIXTURE"
else
  echo "HOLD: FIXTURE_FETCH_HASH_OR_PYTHON_SYNTAX_FAILED"
fi
```
A positive `PASS_APFS_FIXTURE_ONLY` JSON from the Mac is required before considering the real-file trial. Source review or Linux execution is **NOT** this proof. Keep the returned JSON as a time-stamped Mac receipt; no filesystem cleanup is authorized by fixture success. A successful fixture is not real-file authorization.

## APFS fixture first operator attempt — failed safely; guard corrected (2026-10-27)

The owner executed the immutable original fixture at commit `d10104ea128138cc0772af03b50187c386230c06` (Git blob `d19287651aa28ef39d7cf7c073601f34dc477124`). Fetch/blob checksum and `python3 -m py_compile` **PASS**, but actual fixture JSON returned `HOLD_APFS_FIXTURE_NOT_VERIFIED`, reason `WATCHER_TARGET_NOT_APFS: no fixture attempted`. Real Watcher touched **0 files**; realized Mac reclaim **0 B**; no APFS clone/COW assertion.

**Root cause is in OUR fixture precondition**, not a demonstrated non-APFS Mac: Darwin `stat -f %T` outputs a **file type**, not a filesystem type. It cannot equal literal `apfs` for a directory. This invalid check was not supported by Mac `stat(1)`; current correction replaces it with `/usr/sbin/diskutil info -plist /System/Volumes/Data` using Python `plistlib`, requiring `FilesystemType=apfs`, exact `st_dev` matching between Data volume and Watcher `dist`, and a temporary test directory with the same `st_dev`. Any query, volume or XML-plist failure remains a hard HOLD; **no bypass/no fallback**. The corrected fixture source is immutable at `app-prodn@8cc634410babc899af0bf4f8fb2e501e8be5a386`, Git blob `d33a87067225e6a19b9bf4cfab78aea08c3ba75c`.

**Operator rerun required using the updated pinned command below.** The first run did not create disposable fixtures and cannot count as a fixture PASS. Never act on the real Watcher binaries until this clean rerun reports `PASS_APFS_FIXTURE_ONLY`, and all separately required manual transaction approvals are met.

## Second Mac attempt — Darwin xattr Python platform error; corrected (2026-10-27)

The owner ran the **first corrected APFS guard** fixture at immutable source commit `8cc634410babc899af0bf4f8fb2e501e8be5a386`, matching pinned Git blob `d33a87067225e6a19b9bf4cfab78aea08c3ba75c`. `curl`, Git blob and `python3 -m py_compile` PASS. Execution progressed **past** the APFS Data, target-device and TMPDIR-device admission checks (the earlier invalid `stat -f %T` gate was resolved). It entered the temporary fixture setup but hit:

```text
AttributeError: module 'os' has no attribute 'setxattr'
```

**Root cause:** Python's `os.setxattr`, `os.getxattr` and `os.listxattr` are Linux-only in CPython, not macOS interfaces. The code erroneously used all three. The crash occurred on disposable fixture files **before any `clonefile(2)` call**, so the clone/COW, download-symlink continuation and inode rollback **are not yet tested**. `TemporaryDirectory` context automatically handles temporary fixture cleanup on exception, but no separate Mac postflight checked TMPDIR remnants or APFS `df`. Absolutely **no actual Watcher file clone/write/rename/unlink**, no changed HTTP URL and **0 B newly reclaimed**. The traceback was not a structured fixture PASS receipt.

**Fix:** source commit `316815be0d1ce13db27aa2164770f7b3cbd7955a`, blob `da0f5c21812829fe8b770bbacc585aba2b2dbfaa`, uses macOS built-in `/usr/bin/xattr` (strict exit-status checks) to write the known marker to *disposable fixtures only*, list every fixture attribute and use `xattr -p -x` to hash exact attribute bytes. It fails closed if the marker is absent, bytes differ, or the command fails. No real Watcher file is used as a write target; the preexisting APFS filesystem/device guards remain unchanged.

**Historical at second attempt:** a third run was required. **The third Mac run has subsequently passed**, as documented immediately below. That success does **not** confer permission for actual alias replacement or release metadata changes.

## Third Mac attempt — PASS_APFS_FIXTURE_ONLY, native APFS CoW and rollback (2026-10-27)

Owner fetched and verified immutable fixture source commit `316815be0d1ce13db27aa2164770f7b3cbd7955a`, Git blob `da0f5c21812829fe8b770bbacc585aba2b2dbfaa`. The command printed `PASS: MACOS_XATTR_FIXTURE_SOURCE_VERIFIED`, followed by the test's structured `status: PASS_APFS_FIXTURE_ONLY` receipt:

| Fixture result field | Observed value |
|---|---|
| `clonefile_syscall` | `SUCCESS_NO_FALLBACK` |
| `copy_on_write_write_isolation` | `PASS` |
| `regular_file_and_separate_inode` | `PASS` |
| `metadata_mode_owner_flags_mtime_xattr` | `PASS` |
| `download_symlink_continuity_before_after` | `PASS` |
| `temporary_original_hardlink_rollback` | `PASS_ORIGINAL_INODE` |
| `fixture_size_bytes_each` | `4194304` (4 MiB) |
| `free_bytes_before_test` | `7440388096` |
| `free_bytes_after_test_before_temp_cleanup` | `7440388096` |
| `free_delta_bytes_not_reclaim_evidence` | `0` |
| `fixture_cleaned_on_normal_exit` | `true` (script's expected `TemporaryDirectory` behavior; no separate post-exit fixture directory census supplied) |
| `actual_watcher_files_touched` | `0` |
| `actual_watcher_reclaimed_bytes` | `0` |

**Independent interpretation:** APFS/Data and TMPDIR device admission checks passed, native Darwin `clonefile(2)` actually executed, copy-on-write of a separate test clone did not mutate its source, metadata checks passed for basic mode/owner/flags/mtime/**all fixture xattrs**, the **simulated** local public-download symlink stayed valid, and the **temporary original** hardlinked inode was restored after an atomic test swap. This is first successful native APFS mechanism proof and closes `HOLD_NO_COW_PROOF` **only for the disposable fixture**. It does **not** test real release ACLs, signatures, metadata differences, concurrent readers, HTTP access-log obligations or real artifact transaction. It does **not** authorize changing the genuine Watcher `dist` or any historical filename.

**New capacity signal but not source attribution:** `7440388096 B = 6.929 GiB` available from `os.statvfs` during this 4-MiB disposable fixture. It is lower than the 15:04Z earlier `df -k /System/Volumes/Data` value of ~10.875 GiB; because there was **no new post-exit Data `df` measurement**, do not attribute the decline to fixture execution, watcher builds, snapshots or any single writer. Refresh `df -k /System/Volumes/Data` separately and inspect snapshots **read-only** before planning a real capacity transaction. No experiment with or deletion of APFS snapshots authorized.

**Next admission gate:** read-only **actual** first-pair ACL/mode/flags/xattr/size/device and download symlink identity, plus fresh local capacity and snapshot state. Favor reviewing the already-documented owner-approved one-alias plan without new cleanup controller. No automated apply step was introduced or executed.

## First real AppImage pair: exact read-only metadata HOLD and capacity regression (owner Mac, 2026-10-27)

The operator independently ran full SHA-256, lstat, ACL and xattr read-only checks against exactly two genuine files:
- canonical `dist/AoE2HDBets Watcher-1.6.0.AppImage`: `134013759` B; SHA256 `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266`; `st_dev=16777234`, `inode=175834577`, `st_nlink=1`; `mode=0755` (`493` decimal), `uid:gid=501:20`, `flags=0`, `mtime_ns=1790014547600303259`, `birthtime=1790014547.4174945`, `st_blocks=261752`; ACL entries empty; xattrs empty.
- alternate historic alias `dist/AoE2HDBets-Watcher-1.6.0.AppImage`: **same** exact SHA256, byte length, `st_dev`, mode, owner, flags, ACL and xattrs; `inode=175834590`, `st_nlink=1`, `mtime_ns=1790014548677473372`, `birthtime=1790014547.6003032`, `st_blocks=261752`.

`metadata_compatible=false` and `status=HOLD_METADATA_OR_IDENTITY_MISMATCH` are **correct results from a strict equality gate**. The only difference among the gate's compared fields is `mtime_ns`: the alias is **1,077,170,113 nanoseconds later** (about 1.077 seconds). Different `birthtime` was observed separately and is not in the equality gate: a staged clone swap **cannot keep original inode/birthtime/ctime** and must be independently accepted. Both files have one hardlink and separate inodes. The local `app-prodn/public/downloads` symlink still `samefile(dist)=true`. Hash/size/source/ownership/ACL/xattr checks PASS within read-only observation. **No actual file mutation/clone/deletion occurred**.

**Real pair decision:** `PASS_CONTENT_AND_NON_TIME_METADATA / HOLD_MTIME_AND_INODE_IDENTITY`. Do **not** weaken the real metadata gate to silently overlook the difference. For the proposed separately authorized transaction, if other outstanding URL/owner/snapshot gates are satisfied, preserve alias `mtime_ns` by invoking `os.utime(staged_fixture_clone, ns=(original_alias_atime_ns, original_alias_mtime_ns))` on the **staged clone only**, before verifying alias-equivalent metadata and any atomic replacement. This is an implementation candidate, **not** authority to run it on real Watcher content. It cannot preserve birthtime, ctime or inode of a staged replacement; revert can recover original inode only while the private original-inode hardlink backup is retained.

**Fourth Mac fixture run: PASS with mtime divergence.** Immutable source commit `8f8e5f9c004fab054478f5d97337af5346db7a55`, Git blob `1706a45c9229c501d9bf91d6024dc2a81262aa57`, constructs independently written 4-MiB canonical+alias files with deliberately different mtimes (one-second divergence), clones the disposable canonical file, restores the disposable alias's original atime+mtime to the temporary clone, and tests alias-equivalent metadata after swap, URL continuity and exact-original-inode rollback. This variant was actually executed on the Mac: its receipt is immediately below. **Still no actual Watcher edits.**

**Fresh capacity reading:** owner `df -k /System/Volumes/Data` reports **7,262,984 KiB** available = **6.926521 GiB**, **99%** displayed used; earlier at 2026-10-27T15:04Z **11,402,824 KiB** = 10.87458 GiB. Observed availability decline **4,139,840 KiB = 3.94806 GiB**, **cause unknown**. The earlier fixture same-device `statvfs` reported 7,440,388,096 B ~6.9294 GiB, directionally corroborating current Data headroom but not a post-commit space reclaim. Neither Watcher alias duplication nor the fixture explains the observed decrease. Inspect APFS snapshot inventory **read-only**, active build/cache growth and release-retention referenced directories; do not delete snapshots, worktrees, caches, binaries, personal files or financial evidence on these observations.

**Telemetry additions for Session B Storage Atlas (owner read-only, subsequent to 15:04Z):** `apfs_data_free_kib_latest=7262984`, `apfs_data_free_gib_latest=6.9265213`, `apfs_data_available_decline_kib=4139840`, `apfs_data_capacity_display=99%`, `first_alias_pair_real_hash_match=true`, `first_alias_pair_st_dev=16777234`, `first_alias_metadata_gate=HOLD_MTIME_ONLY`, `first_alias_mtime_difference_ns=1077170113`, `first_alias_permissions_owner_acl_xattr_equal=true`, `first_alias_orig_btime_preservable_by_clone=false`, `new_real_reclaimed_bytes=0`, `snapshot_causality=UNPROVEN`. Do not treat original 15:04Z timestamp as this newer reading's time; exact operator acquisition time of the newer `df` was not supplied.

## Fourth Mac run: distinct-mtime APFS fixture PASS; Data free-space rebound (owner terminal, 2026-10-27)

The operator fetched the immutable review-branch source commit `8f8e5f9c004fab054478f5d97337af5346db7a55`, verified Git blob `1706a45c9229c501d9bf91d6024dc2a81262aa57` and Python syntax, then executed the **disposable fixture-only** script. Terminal output `PASS: MTIME_FIXTURE_SOURCE_VERIFIED`; JSON status `PASS_APFS_FIXTURE_ONLY`. Exact fields:

| Probe field | Result |
|---|---|
| `clonefile_syscall` | `SUCCESS_NO_FALLBACK` |
| `copy_on_write_write_isolation` | `PASS` |
| `different_initial_mtimes` | `PASS_ONE_SECOND_DIVERGENCE` |
| `staged_alias_original_mtime_restored` | `PASS` |
| `metadata_mode_owner_flags_mtime_xattr` | `PASS` |
| `regular_file_and_separate_inode` | `PASS` |
| `download_symlink_continuity_before_after` | `PASS` |
| `temporary_original_hardlink_rollback` | `PASS_ORIGINAL_INODE` |
| `fixture_size_bytes_each` | `4194304` B (4 MiB), disposable test files only |
| `free_bytes_before_test` and `free_bytes_after_test_before_temp_cleanup` | `9581416448` B (same value, delta 0) |
| `fixture_cleaned_on_normal_exit` | `true` (script's expected context-manager cleanup; not separately inventoried post-exit) |
| `actual_watcher_files_touched` | `0` |
| `actual_watcher_reclaimed_bytes` | `0` |

**Acceptance change:** `PASS_MTIME_DIVERGENCE_APFS_FIXTURE`. The prior real-pair metadata HOLD is understood as an **alias-specific mtime compatibility requirement** and the proposed staged-clone timestamp restoration is now **demonstrated on separate disposable files**. The original real alias and canonical still have different birthtimes and inodes. Their unchanged status has not been reconfirmed by post-test lstat, though this fixture contains no real-file write code. A real swap would change inode/birthtime/ctime and cannot be called a strict original-file-identity preservation. This PASS is **not** consent to clone, replace, move, unlink or rename any genuine Watcher artifact. No user-approved actual transaction occurred.

**APFS capacity and snapshot observations** (same operator block, read-only):
- Latest `df -k /System/Volumes/Data`: total **482,797,652 KiB**, used **431,003,520 KiB**, available **9,365,044 KiB = 8.931202 GiB**, displayed capacity **98%**.
- Previous direct Data `df`: used **431,006,732 KiB**, available **7,262,984 KiB = 6.926521 GiB**. Available increased **2,102,060 KiB = 2.004681 GiB**, while reported used declined only **3,212 KiB**. Thus this was **not** a verified ~2-GiB file deletion: shared APFS container and free-space accounting, snapshots/purgeable allocation, other consumers or unrelated activity remain possible explanations; none proven.
- Against the older `11,402,824 KiB` (~10.875 GiB) census, the latest available is **2,037,780 KiB (1.943378 GiB) lower**, cause still unknown.
- Fixture-local statvfs available **9,581,416,448 B = 8.923389 GiB**, zero within-fixture delta. The next direct Data `df` observation is higher by **8,388,608 B (8 MiB)**, but readings were not simultaneous; no need to force artificial reconciliation.
- `tmutil listlocalsnapshots /`: **three `com.apple.os.update-...`** snapshot records reported for the volume group containing `/`; they are OS-update named and should remain untouched. `diskutil apfs listSnapshots /System/Volumes/Data` explicitly returned **`No snapshots for disk3s5`**. This rules out *currently listed snapshots on the Data volume* as a directly observed pinning explanation; it does **not** prove no other APFS volume, pending update or shared-container accounting effects.

**Decision and next checks:** no additional APFS fixture runs are required unless reviewed transaction code changes. Before any real alias stage, separately verify exact path aliases/canonical SHA, process/FD/HTTP/history download consumers, real ACL/xattr/flags and access timestamps, source SHA, symlink continuity and owner acceptance of changed birthtime/inode/ctime, and ensure a private rollback hardlink is kept through a manually approved test period. Do **not** execute an actual swap without explicit separate permission; **do not** delete the backup without a second approval. For build headroom, prioritize read-only **APFS whole-container/other-volume free/purgeable accounting and protected build-output growth attribution** over more repeated clone-fixture tests. No cache purge, system update snapshot thinning, worktree retirement, production change or financial release action is authorized.

**Storage Atlas fresh sample**: `apfs_data_free_kib=9365044`, `apfs_data_free_gib=8.9312019348`, `apfs_data_used_kib=431003520`, `apfs_data_capacity_display=98%`, `apfs_data_available_increase_from_prior_kib=2102060`, `apfs_data_used_decline_from_prior_kib=3212`, `data_apfs_snapshot_count=0`, `system_update_snapshot_count_reported=3`, `mtime_divergence_fixture=PASS_APFS_FIXTURE_ONLY`, `mtime_restoration_pass=true`, `clonefile_success_no_fallback=true`, `actual_watcher_files_touched=0`, `phase10_new_reclaimed_bytes=0`. The exact new observation timestamp was not supplied: do not silently attach the older `2026-10-27T15:04:27Z` timestamp.

## APFS container reconciliation and stable build roots — latest owner read-only census (2026-10-27)

**Operator-only Mac evidence; no write operation.** A full `diskutil apfs list`, direct `df -k /System/Volumes/Data`, and `du -sk` of three exact candidates were captured. The **first** `df` succeeded; the **last** unqualified `df` after the shell loop failed with `zsh: permission denied: df`. **Root cause is now proven from subsequent shell diagnosis:** the previous suggested interactive zsh loop used `for path in ...`, but lowercase `path` is zsh's special array tied directly to environment `PATH`; iterating changed the command search path to the final directory `~/Library/Caches/go-build`. Subsequently `builtin whence -va df` reported `df not found`, while `/bin/ls -l /bin/df` confirmed that the binary existed and was executable and `/bin/df -k /System/Volumes/Data` succeeded. This is **our shell diagnostic bug, not a volume access failure**. Restore normal login-shell startup with `exec /bin/zsh -l` only when replacing the current interactive shell is acceptable; use `candidate_dir` (never `path`) for future zsh loops. No chmod, root repair or PATH-dependent disk cleanup warranted.

| Evidence source | Exact reported values | Interpretation |
|---|---|---|
| APFS container `disk3` | UUID `DF99D6D6-A364-41E4-B992-12ED76BB8353`, 494,384,795,648 B capacity, 484,793,401,344 B volume usage (98.1% displayed), **9,591,394,304 B capacity not allocated** | Real shared physical allocation pool across System, Data, VM, Preboot, Recovery |
| Data `disk3s5` | 441,347,043,328 B consumed, `/System/Volumes/Data` | Matches `df` used exactly in bytes |
| Data `df -k` before inventory | `1024-blocks=482797652`, `Used=431002972`, `Available=9366596` KiB, `Capacity=98%` | `431002972 * 1024 = 441347043328` B = Data consumed; **`9366596 * 1024 = 9591394304` B**, exactly APFS container unallocated; Data available = **8.932682 GiB** |
| System `disk3s1` | 18,507,264,000 B consumed; `Sealed: Broken` on mounted update path, while snapshot mounted at `/` `Snapshot Sealed: Yes` | Distinct properties; **do not** infer broken running root snapshot, attempt seal repairs or purge snapshots; refer to Mac OS specialist only if independently warranted |
| Preboot `disk3s2` | 16,201,957,376 B consumed | Protected OS-managed volume. Size alone is not cleanup authority |
| Recovery `disk3s3` | 2,414,116,864 B consumed, unmounted | Protected OS recovery |
| VM `disk3s6` | 5,371,052,032 B consumed | OS-managed VM allocations; may vary; do not manually remove swap/VM objects |
| Volume sum / APFS overhead | 483,841,433,600 B across five named volumes vs 484,793,401,344 B container allocated; difference 951,967,744 B | Other APFS overhead/shared accounting; no attribution to a directory or reclaimable target |
| Docs-context worktree `.next` | **1,328,688 KiB** | Exactly matches preceding census. Adjacent protected `.aoe2war-release`: HOLD |
| Watcher `dist` | **3,434,896 KiB** | Exactly matches preceding census. Local `public/downloads` symlink consumes this same tree; **do not** dedupe this count as a second independent directory |
| `~/Library/Caches/go-build` | **627,104 KiB** | Equals earlier `642,154,496` B. Existing `storage local-maintain --json` is preview-only unless explicit future owner approval |

**Capacity interpretation:** latest Data available **9,366,596 KiB = 8.932682 GiB**, **1,552 KiB (about 1.516 MiB) above** preceding direct `df` `9,365,044 KiB`; both readings indicate roughly the same available headroom. None of the three targeted build-output/cache directories grew. The earlier multigigabyte APFS free-space changes therefore **cannot** be attributed to growth in these three paths. This does NOT rule out other build products, container-shared volume activity, APFS purgeable blocks, OS-managed Preboot/VM volumes or unrelated writers. The prior Data snapshot inventory had **no Data snapshots**; three OS-update snapshots reported for the root-volume group remain protected. Inspect remaining directories, process lifetimes and APFS other-volume allocation **read-only** and compare like-for-like timestamps before concluding causality.

**Telemetry — latest scope-only independent receipt**: `mac_apfs_container_uuid=DF99D6D6-A364-41E4-B992-12ED76BB8353`, `mac_container_capacity_bytes=494384795648`, `mac_container_used_bytes=484793401344`, `mac_container_free_bytes=9591394304`, `mac_data_consumed_bytes=441347043328`, `mac_data_available_kib=9366596`, `mac_data_available_gib=8.93268203735`, `mac_preboot_consumed_bytes=16201957376`, `mac_vm_consumed_bytes=5371052032`, `mac_recovery_consumed_bytes=2414116864`, `mac_system_consumed_bytes=18507264000`, `mac_docs_next_du_kib=1328688`, `mac_watcher_dist_du_kib=3434896`, `mac_go_build_cache_du_kib=627104`, `mac_unqualified_df_error_cause=ZSH_SPECIAL_PATH_LOOP_VARIABLE_OVERWROTE_PATH`, `mac_new_reclaimed_bytes=0`. These sample fields should not inherit a prior operator timestamp. Do not mix with HEL1 Storage OS capacity; HEL1 volume and root belong to separate lanes.

**Decision:** `PASS_APFS_CAPACITY_DF_DISKUTIL_RECONCILIATION` / `PASS_3_TARGET_SIZES_STABLE` / `HOLD_CAUSE_FREE_SPACE_VARIATION` / `PASS_DF_EXECUTABLE_ROOT_CAUSE_ZSH_PATH_CLOBBER`. Historic download alias preservation and explicit per-file owner approval remain prerequisites for any real transaction. No clone/replace/delete, worktree retirement, Go cache apply or snapshot deletion performed.

## Read-only shell diagnosis: zsh `path` clobbered `PATH`; APFS free changes again (operator, 2026-10-27)

After the earlier `for path in ...` command, the owner obtained:
- `builtin whence -va df` → **`df not found`**.
- `/bin/ls -l /bin/df` → `-rwxr-xr-x 1 root wheel 119152 Apr 11 2025 /bin/df`.
- `/bin/df -k /System/Volumes/Data` **PASS**: `1024-blocks=482797652`, `Used=431011556 KiB`, `Available=8308892 KiB`, `Capacity=99%`, mounted Data `/dev/disk3s5`.

**Root cause:** prior assistant command wrongly used lowercase `path` for an interactive **zsh** shell loop, and `path` is a special zsh array tied to the `PATH` environment variable. The loop replaced command lookup directories with the final Go-cache path. That caused unqualified `df` command lookup failure. The explicit executable path `/bin/df` bypasses it and proves `df` itself works. Do not modify disk permissions, system command files or Homebrew installations. A clean login shell `exec /bin/zsh -l` can restore startup PATH, but only after the operator chooses to replace current shell-local state; safe future loop names are `candidate_dir` or `build_dir`, **not `path`**. This diagnostic mistake had **no Watcher file write or Storage OS apply**.

**Latest APFS Data sample:** `8,308,892 KiB = 8,508,305,408 B = 7.923977 GiB` available; `431,011,556 KiB = 441,355,833,344 B` used; displayed `99%`. Compared with directly preceding Data `df` `9,366,596 KiB` available and `431,002,972 KiB` used: free **decreased 1,057,704 KiB = 1.008705 GiB** while used **increased 8,584 KiB (~8.38 MiB)**. This again shows that free/used cannot be interpreted as complementary filesystem occupancy in shared APFS accounting. The cause of changing shared available blocks is still **UNPROVEN**, unrelated to the shell PATH failure itself. No new whole-container `diskutil` sample at this later observation; do not claim that old container unallocated bytes still equal current `df`. Snapshot deletions, cache clearance, release artifact edits, Worktree OS mutation and OS volume maintenance all remain **unauthorized**.

**Updated latest Storage Atlas sample (later than preceding disk3 census; exact UTC timestamp not supplied):** `mac_data_available_kib_latest=8308892`, `mac_data_available_gib_latest=7.92397689819`, `mac_data_used_kib_latest=431011556`, `mac_data_capacity_display_latest=99%`, `mac_data_free_change_from_prior_kib=-1057704`, `mac_data_used_change_from_prior_kib=8584`, `mac_df_resolution_issue=RESOLVED_ZSH_PATH_SPECIAL_PARAMETER_COLLISION`, `mac_real_reclaim_bytes=0`. Previous matched `diskutil`/Data `df` 9,591,394,304 B shared free still stands **for its older timestamp only**.

**Decision:** `PASS_DF_COMMAND_RESOLUTION_DIAGNOSIS` / `PASS_ABSOLUTE_DF_ON_DATA` / `HOLD_SHARED_APFS_FREE_CHANGE_CAUSALITY` / `HOLD_REAL_WATCHER_ALIAS_OWNER_APPROVAL`; prior `PASS_MTIME_DIVERGENCE_APFS_FIXTURE` unchanged.

## Verified zsh login-shell recovery and stable direct Data free reading (operator, 2026-10-27)

The owner executed `exec /bin/zsh -l` **in the same operator terminal**. New login-shell output confirmed native arm64, pyenv **3.13.5** and the permitted project `.envrc` loaded through direnv. The following read-only checks then passed:
- `builtin whence -va df` → **`df is /bin/df`** (the earlier assistant-authored `for path in ...` loop had clobbered special zsh `path`/`PATH` lookup).
- `/bin/df -k /System/Volumes/Data` → `/dev/disk3s5`, `1024-blocks=482797652`, `Used=431010500`, `Available=8309948` KiB, `Capacity=99%`, mounted at `/System/Volumes/Data`.
- Versus immediately preceding direct `/bin/df`: `Used=431011556` and `Available=8308892` KiB, the latest used fell and available rose by exactly **1,056 KiB = 1.03125 MiB**. Latest available **8,309,948 KiB = 7.924984 GiB** (do not confuse with historical snapshots of 8.932682/6.926521/10.87458 GiB).

**Status transition:** `PASS_ZSH_PATH_REPAIRED_BY_FRESH_LOGIN`; `PASS_DF_RESOLUTION`; `PASS_DIRECT_APFS_DATA_DF`. The earlier shell-command failure is **CLOSED** without chmod, OS repairs, disk cleaning or Homebrew changes. The APFS shared-container free fluctuations are **still not causally explained** and cannot be attributed to the temporary APFS fixture or the three already-stable build roots. The first AppImage real-file metadata and public URL consumer/owner-approval gates remain HOLD; no actual Watcher file or historic download path was altered. **Phase10 newly reclaimed=0 bytes**; earlier verified unrelated two-`.next` cleanup +2.606 GiB.

**Additional Storage Atlas sample** (later owner terminal; exact UTC acquisition time not provided): `mac_apfs_data_available_kib=8309948`, `mac_apfs_data_used_kib=431010500`, `mac_apfs_data_available_gib=7.924984`, `mac_capacity_display=99%`, `mac_delta_available_from_previous_kib=1056`, `mac_delta_used_from_previous_kib=-1056`, `zsh_login_shell_restart=PASS`, `zsh_df_resolution=PASS_BIN_DF`, `pyenv=3.13.5`, `direnv_project_env=LOADED`, `phase10_actual_reclaimed_bytes=0`.

**Next read-only investigation:** compare `diskutil apfs list` per-volume consumption of VM/Preboot/System/Recovery with the older pinned `disk3` sample to determine whether other volumes explain the shared unallocated-space change. `sysctl vm.swapusage` is informative but not a deletion target. No VM file, APFS snapshot, production release or workspace-retirement mutation authorized.

## Consecutive disk3 full-container comparison isolates VM growth (latest owner read-only, 2026-10-27)

The operator supplied a second complete `/usr/sbin/diskutil apfs list`, contemporaneous `/usr/sbin/sysctl vm.swapusage` and direct `/bin/df -k /System/Volumes/Data`. This can be compared **like-for-like** with the earlier complete `diskutil` container census. UUID remains `DF99D6D6-A364-41E4-B992-12ED76BB8353`, container `disk3`, total physical ceiling 494,384,795,648 B unchanged. Here are **exact decimal bytes** (no inference from rounding):

| APFS item | Previous disk3 bytes | New disk3 bytes | New minus previous (B) | Delta MiB |
|---|---:|---:|---:|---:|
| Container allocated | 484,793,401,344 | 485,879,390,208 | **+1,085,988,864** | **+1,035.680** |
| Container unallocated | 9,591,394,304 | 8,505,405,440 | **−1,085,988,864** | **−1,035.680** |
| Data `disk3s5` consumed | 441,347,043,328 | 441,358,733,312 | **+11,689,984** | +11.148 |
| VM `disk3s6` consumed | 5,371,052,032 | 6,445,350,912 | **+1,074,298,880** | **+1,024.531** |
| System `disk3s1` consumed | 18,507,264,000 | 18,507,264,000 | 0 | 0 |
| Preboot `disk3s2` consumed | 16,201,957,376 | 16,201,957,376 | 0 | 0 |
| Recovery `disk3s3` consumed | 2,414,116,864 | 2,414,116,864 | 0 | 0 |

**Exact reconciliation:** `1,074,298,880 (VM growth) + 11,689,984 (Data growth) = 1,085,988,864 B`, **100%** of the net container allocation increase between these receipts. **98.9236% of the change is VM volume allocation**, 1.0764% Data. System/Preboot/Recovery volume consumption unchanged. `df -k` Data `used=431014388` KiB `*1024=441358733312` B **equals** current diskutil Data consumed, and Data `available=8306060` KiB `*1024=8505405440` B **equals** current container unallocated. This positively identifies which APFS volume accounts for the recent approximately **1 GiB** change in shared available capacity. It **does not establish what created the VM volume growth or explain every earlier multi-GiB variation**.

**Swap snapshot:** `vm.swapusage: total = 5120.00M used = 3912.19M free = 1207.81M (encrypted)`; at reporting convention 1024 M per GiB, about **5.0 GiB swap capacity** and **3.8205 GiB used**. This is evidence of substantial swap use at the instant observed, making macOS VM/swap activity a plausible proximate driver. However, there is **no earlier swap-usage baseline** in Session D to prove that active swap use rose by exactly the VM volume delta, or which process caused it. VM volume consumed (6,445,350,912 B) is **not equivalent to** `sysctl vm.swapusage` used; do not equate or subtract these as identical counters. Page-file growth, OS VM management, other VM files and purgeable/shared container dynamics require targeted read-only observation.

**Safety decisions:** `PASS_ALLOCATED_CAPACITY_DELTA_RECONCILED_TO_VM_98_9_PERCENT_AND_DATA_1_1_PERCENT`; `HOLD_PROCESS_CAUSALITY_AND_GENERAL_HISTORICAL_CAPACITY_SWINGS`. **Never** `rm` or truncate `/System/Volumes/VM/swapfile*`, perform system update snapshot operations, disable swap or reboot solely as a cleanup tactic. MacOS should manage VM automatically; any decision to close a workload must be operationally conscious, with unsaved work/protected active Codex and builds preserved. **No new recovered bytes** and **no approved real Watcher clone/replacement/unlink/backup discard**.

**Next bounded read-only diagnostic**, once the operator's current shell is healthy:
```bash
echo "=== SWAP / MEMORY STATE ==="
/usr/sbin/sysctl vm.swapusage
/usr/bin/memory_pressure -Q
echo "=== HIGHEST RESIDENT MEMORY PROCESSES ==="
/bin/ps -axo pid=,comm=,rss= -r | /usr/bin/head -n 20
echo "=== DATA / CONTAINER FREE NOW ==="
/bin/df -k /System/Volumes/Data
/usr/sbin/diskutil apfs list
```
`ps` lists executable command names and approximate **RSS KiB**, not allocations on the VM volume; its output is read-only and is **not** a process-termination list. Capture process snapshots at successive times, compare growth and swaps if warranted. If `memory_pressure -Q` is unavailable or returns no value on this macOS version, record `HOLD_TOOL_UNAVAILABLE` without changes.

**Storage Atlas fresh sample** (owner latest, exact UTC sample timestamp unspecified): `disk3_allocated_bytes=485879390208`, `disk3_unallocated_bytes=8505405440`, `data_consumed_bytes=441358733312`, `vm_consumed_bytes=6445350912`, `vm_growth_since_previous_diskutil_bytes=1074298880`, `data_growth_since_previous_diskutil_bytes=11689984`, `disk3_growth_since_previous_diskutil_bytes=1085988864`, `vm_fraction_of_container_growth=0.9892356318`, `swap_total_reported_MiB=5120`, `swap_used_reported_MiB=3912.19`, `df_data_available_kib=8306060`, `df_data_used_kib=431014388`, `df_container_free_exact_parity=true`, `attribution=VM_VOLUME_GROWTH_NOT_PROCESS_CAUSE`, `phase10_actual_reclaimed_bytes=0`. Do not overwrite earlier timestamped Atlas observations with these later values without preserving source and observation order.

## Owner Mac vm_stat and process RSS snapshot — Chrome largest visible consumer (2026-10-27)

**Bounded read-only process/memory observation** from actual Mac (no Activity Monitor actions, no process termination). Commands run: `/usr/bin/vm_stat`, `/usr/sbin/sysctl vm.swapusage`, `/bin/ps -axo pid=,rss=,comm= | /usr/bin/sort -k2,2nr | /usr/bin/head -n 20`, and `/bin/df -k /System/Volumes/Data`.

- `vm_stat` pages are **16,384 B**, `Pages free=14,478` (~226.22 MiB), active `287,344`, inactive `281,890`, wired `115,490`, purgeable `2,360`; compressor occupied `304,192` pages (~4.642 GiB **physical page equivalent**), stored in compressor `945,399` pages (~14.426 GiB logical page equivalent). Reported `Swapins=437,983`, `Swapouts=738,510`, `Compressions=85,721,953`, `Decompressions=76,736,410`, `Pageouts=76,887`. Most vm_stat event counts are cumulative and cannot be equated with **recent rates** from this single observation. Low free-page count by itself does **not** prove acute current pressure; inactive/file-backed pages and reclaimability matter. The command did not include `memory_pressure -Q`.
- `vm.swapusage: total=5120.00M used=3872.19M free=1247.81M (encrypted)`, i.e. swap **used~3.7814 GiB** assuming M≈MiB. Previous `vm.swapusage used=3912.19M` so used is **40.00 MiB lower**, not growing at this second reading. Current swap usage is not the same metric as `diskutil` VM volume allocation; no new `diskutil` sibling-volume consumption was provided in this batch.
- Among **top 20 individual PID RSS observations**, **13 are Google Chrome main/helper processes**, summing **5,696,256 KiB (~5.432 GiB) *raw RSS***; four ChatGPT/Codex-related entries sum **684,512 KiB (~0.653 GiB) raw RSS**; remaining entries include iTerm, Mail and WindowServer. The two largest Chrome helpers: PID `970` RSS `1,011,872 KiB`, PID `18590` RSS `846,080 KiB`. **Do not treat summed RSS as unique physical memory** because shared page mapping and other Chrome processes outside top 20 mean it is neither full ownership nor proportional swap causation. It makes Chrome the leading **observed** memory optimization candidate, not a proved historical VM growth origin.
- Latest Data `df`: total `482,797,652 KiB`, used **`431,013,652 KiB`**, available **`8,306,796 KiB = 7.921978 GiB`**, displayed **99%**. Versus immediately preceding full-container receipt's Data `df` used `431,014,388 KiB`, available `8,306,060 KiB`: used **−736 KiB**, available **+736 KiB**. Space essentially stable at the ~7.922 GiB level. The preceding `diskutil` proved the recent ~1GiB allocation increase occurred **98.9% in VM volume** and **1.1% in Data**; this **does not prove** which application produced it.
- After the commands, `starship` emitted: `Executing command "/Users/tonyblum/.pyenv/shims/python" timed out`, and the shell prompt displayed Python **3.14.7**, whereas previous operator shell initialization/prompt had displayed **3.13.5**. This is a **development-environment drift signal** with unclear cause; a prompt theme/version display is not authoritative proof of the currently selected pyenv interpreter. **HOLD any release/build migration** until `pyenv version`, `python --version`, `/bin/zsh` PATH resolution and `.python-version` / direnv context are verified read-only; never install or switch Python solely to quiet Starship.

**Decision:** `PASS_MEMORY_PROCESS_SNAPSHOT_RECEIPT`; `PROBABLE_BROWSER_MEMORY_PRESSURE_CONTRIBUTOR_CHROME` (not proven as VM expansion cause); `PASS_SWAP_USED_DOWN_40_MIB`; `PASS_DATA_FREE_STABLE_TO_WITHIN_736_KIB`; `HOLD_HISTORICAL_VM_PROCESS_CAUSALITY`; `HOLD_PYENV_ACTIVE_RUNTIME_IDENTITY`; `HOLD_WATCHER_REAL_ALIAS_TRANSACTION`.

**Safer next action**, not automated: review the actual Chrome tab/process mapping through Chrome Task Manager or macOS Activity Monitor, save any unsaved app/ChatGPT/Codex work, then **manually** reduce genuinely unneeded heavy browser tabs **only by owner choice**; compare swap and `/bin/df` before/after a deliberate observation interval. Do not kill Chrome, `codex`, attached worktree processes, or macOS VM; no commands in this plan terminate or change processes. A measured decrease is useful but not conclusive process attribution without temporal baselines.

**Next minimal read-only Mac commands**, no special `path` zsh variables:
```bash
echo "=== PYTHON RUNTIME IDENTITY ==="
command -v python
python --version
command -v pyenv
pyenv version
echo "=== VERSION POLICY SOURCE ==="
/bin/ls -la .python-version "$HOME/.python-version" 2>/dev/null
echo "=== MEMORY PRESSURE INSTANTANEOUS ==="
/usr/bin/memory_pressure -Q
echo "=== SWAP + DATA FREE ==="
/usr/sbin/sysctl vm.swapusage
/bin/df -k /System/Volumes/Data
```
If `memory_pressure -Q` or a pyenv command fails, mark that subcheck HOLD; do not switch interpreters, clean caches, reinstall packages or restart processes.

**Storage Atlas observation fields** (exact acquisition time not supplied, do not assign an invented UTC timestamp): `vmstat_page_size_bytes=16384`, `vmstat_pages_free=14478`, `vmstat_pages_inactive=281890`, `vmstat_pages_compressor_occupied=304192`, `vmstat_pages_stored_in_compressor=945399`, `swap_used_reported_MiB=3872.19`, `swap_used_delta_reported_MiB=-40`, `chrome_processes_in_top_20=13`, `chrome_top20_rss_kib_sum=5696256`, `chatgpt_codex_processes_in_top20=4`, `chatgpt_codex_top20_rss_kib_sum=684512`, `data_available_kib=8306796`, `data_used_kib=431013652`, `data_free_delta_previous_kib=736`, `starship_python_shim_timeout_observed=true`, `python_prompt_display=3.14.7`, `python_active_runtime_verified=false`, `phase10_actual_reclaimed_bytes=0`.

## Owner Mac memory pressure and Python project interpreter VERIFIED (2026-10-27)

A new owner-on-Mac read-only round ran:
```
/usr/bin/memory_pressure -Q
command -v python
python --version
command -v pyenv
pyenv version
/usr/sbin/sysctl vm.swapusage
/bin/df -k /System/Volumes/Data
```

**Actual receipt and decision:**
- `memory_pressure -Q` recognized 16 GiB / 1,048,576 pages × 16,384 bytes and returned **`System-wide memory free percentage: 51%`**. This single reported percentage is not a trend, and does not imply an immediate memory emergency or that Chrome should be killed. Prior `vm_stat` cumulative counts and raw top-PID RSS still cannot prove per-process swap responsibility.
- `command -v python` → `/Users/tonyblum/.pyenv/shims/python`; `python --version` → **Python 3.13.5**; `command -v pyenv` → `pyenv`; `pyenv version` → **`3.13.5 (set by /Users/tonyblum/projects/AoE2HDBets/app-prodn/.python-version)`**. Project's actual interpreter selection **PASS 3.13.5**. The command prompt briefly showed **3.14.7** before the read, then **3.13.5** afterward; the prior Starship pyenv-shim timeout is a prompt/display or lookup issue, NOT verified runtime drift. Avoid version-switch or reinstall work; rerun authoritative `python --version` only if a later build requires independent identity preflight.
- Encrypted `vm.swapusage` **total=5120.00M, used=3760.19M, free=1359.81M**. Used swap fell **112.00 MiB** from immediately preceding `3872.19M`, and **152.00 MiB** from older `3912.19M`. No new `diskutil apfs list` snapshot accompanies this reading, so falling *used swap* does NOT demonstrate VM volume physical allocation shrinking, nor a specific Chrome attribution.
- Data `/bin/df -k /System/Volumes/Data`: `/dev/disk3s5`, `1024-blocks=482797652`, `Used=431019720 KiB`, **`Available=8300728 KiB ≈ 7.9162 GiB`**, `Capacity=99%`. Previous direct Data reading `Used=431013652`, `Available=8306796` KiB; latest used **+6,068 KiB (~5.926 MiB)** and available **−6,068 KiB (~5.926 MiB)**. These two adjacent readings are reasonably stable compared with prior multigigabyte free-pool swings, which remain unexplained beyond the already proven VM + Data delta between two older full-container snapshots.
- No process termination, cleanup, Watcher artifact writes, download filename change, Git workspace mutation, APFS snapshot modification or production/financial operation occurred in this operator batch. **Phase10 actual newly reclaimed=0 B**.

**Acceptance transition:** `PASS_PYENV_PROJECT_INTERPRETER_3_13_5`; `PASS_SINGLE_MEMORY_PRESSURE_SNAPSHOT_51_PERCENT_FREE`; `PASS_SWAP_USED_DOWN_112_MIB_FROM_PRIOR`; `HOLD_VM_VOLUME_FREE_BLOCK_RELEASE_AND_HISTORICAL_BROWSER_CAUSALITY`; `HOLD_REAL_WATCHER_SINGLE_ALIAS_OWNER_APPROVAL`. Existing native disposable `clonefile`, separate inode, mtime correction, simulated download symlink and original-inode rollback remain PASS. A system RAM/RSS reading does not authorize closing Chrome, Codex or other active workloads.

**Session B Storage Atlas fresh observation fields** (exact UTC timestamp not provided): `memory_pressure_total_bytes=17179869184`, `memory_pressure_free_percent=51`, `python_executable=/Users/tonyblum/.pyenv/shims/python`, `python_selected_version=3.13.5`, `python_selection_source=app-prodn/.python-version`, `python_identity_status=PASS`, `swap_used_reported_mib=3760.19`, `swap_total_reported_mib=5120`, `swap_used_change_from_previous_mib=-112.00`, `data_available_kib=8300728`, `data_used_kib=431019720`, `data_available_change_from_previous_kib=-6068`, `mac_actual_reclaimed_bytes=0`.

**Next engineering priority** is not repeated memory sampling or fixture reruns. Qualify the **1,328,688 KiB** isolated docs-context worktree `.next` for active BUILD_ID/reference consumers, adjacent `.aoe2war-release` rollback evidence and attached-worktree status **read-only**, via the existing Workspace/Storage OS preview and exact path checks. Retention/deletion remains HOLD until the owner separately approves a bounded, reversible plan. For the Watcher alias: historical URL consumers and explicit inode/birthtime tradeoff/second-stage finalization approval remain HOLD.

## Owner first exact docs-worktree Next.js build identity receipt — generated output remains HOLD (2026-10-27)

**Source/worktree and release-adjacent evidence from Mac read-only terminal:**

| Check | Value | Interpretation |
|---|---|---|
| Exact candidate | `~/.aoe2war-workspaces`? **NO** — full actual path is `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015/.next` | Do not infer path from abbreviated names; exact location must be preserved |
| `du -sk` | **1,328,688 KiB ≈ 1.267 GiB** | Unchanged allocation, **not** verified recoverable |
| `.next` `ls -ld` | directory `drwxr-xr-x`, owner local user/staff, dated Oct 15 12:01 | Historical directory metadata only |
| `.aoe2war-release` `ls -ld` | directory `drwxr-xr-x`, owner local user/staff, dated Oct 15 12:03 | **Protected adjacent release/rollback receipts**, not a cleanup candidate |
| `.next/BUILD_ID` | exists, **file SHA256 `3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522`** | BUILD_ID **file hash**, not the literal build ID, not `.next` full-tree hash, and not a current production-build match |
| Worktree Git commit | `99c406f57d759b672fd9fe91d3c3355c4d527705` | Historical checkout identity bound |
| Git status | `git --no-optional-locks status --porcelain=v1 --untracked-files=normal` printed **nothing** | Clean under this Git scope; ignored output, nested release state, active references, worktree attachment/merge not settled |

No actual filesystem modifications and no `.next`, `.aoe2war-release`, sources, recorders, Codex, signed Watcher artifacts or developer workspace deleted. This **narrows identification only**: `PASS_CANDIDATE_SOURCE_BUILD_IDENTITY` / `HOLD_BUILD_ACTIVE_RUNTIME_AND_RELEASE_ROLLBACK_CONSUMERS` / `HOLD_RECLAIM_AUTHORIZATION`. Conditional allocation **1,328,688 KiB**, qualified deletion allocation **0**, actual new reclaimed bytes **0**.

**Tracked app-prodn source guidance:** `scripts/aoe2_release.py` uses `.aoe2war-release` authority and tests `.next/BUILD_ID` when checking release state; `scripts/aoe2_speed_build.py` writes build-performance receipts into `.aoe2war-release`. These are historical source consumers and **do not by themselves prove this particular worktree is currently used**. The canonical `app-prodn/main@14ce7104` docs and release controllers must be consulted before any classification change; do not create a new deletion controller or infer that absence of Git edits certifies rollback disposability.

**Next read-only operator check:** capture only directory-level contents/categories of adjacent protected `.aoe2war-release` (filenames/metadata and bounded counts, **no sensitive JSON values**), assess any real BUILD_ID reference by booleans/digests without exposing secrets, exact worktree attachment/branch/merge and release locks, and bound runtime consumers by specific worktree path/process or FD. Protect ignored files and app release state. Avoid recursive `lsof +D` over 1.267 GiB tree as a default. Even an empty point-in-time process probe is not proof the artifact is no longer required. No `--apply`, no `rm` or `git worktree prune`.

**Storage Atlas current scoped candidate fields**: `mac_next_candidate_path=projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015/.next`, `mac_next_allocated_kib=1328688`, `mac_next_build_id_file_sha256=3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522`, `mac_next_worktree_head=99c406f57d759b672fd9fe91d3c3355c4d527705`, `mac_next_worktree_git_porcelain_empty=true`, `mac_adjacent_release_state_exists=true`, `mac_next_runtime_consumers_verified_absent=false`, `mac_next_deletion_authorized=false`, `mac_next_reclaimed_bytes=0`; operator exact observation UTC not provided.

## Second isolated .next probe: exact attached worktree and release categories, no cwd reader observed (owner Mac, 2026-10-27)

Owner's read-only follow-up on `~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015` identified the exact **attached** Git worktree entry:
```
worktree /Users/tonyblum/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015
HEAD 99c406f57d759b672fd9fe91d3c3355c4d527705
branch refs/heads/fix/update-independent-docs-context-20261015
```
No Git source modifications were reported in prior `status --porcelain` but an attached clean branch must **not** be retired without explicit Git ancestry/merger/owner authority. Its `.next` remains **1,328,688 KiB** with `BUILD_ID` file SHA256 `3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522`.

Adjacent `.aoe2war-release` reports **`du -sk=0` KiB**; it is **not empty**, as `ls -la` showed exactly three top-level directories: `federation-validation`, `recovery-campaigns`, `storage-handoffs`. Their file contents, receipts, locks, symlink targets and caller relationships were NOT inspected. Zero allocated blocks on this APFS tree is not deletion qualification or proof that receipts can be ignored. Preserve **all** these directories and any nested recovery/rollback data independent of byte size.

Read-only `lsof -nP -d cwd -Fpn` + exact worktree-prefix filter returned **`NO_MATCH_OBSERVED_POINT_IN_TIME`**. This narrows one runtime-consumer type (observable **cwd** paths) and does **not** prove no open-file handles under `.next`, no Next.js process referring to it, no detached runtime or future build/rollback consumer. No actual `.next` delete or source/worktree mutation occurred.

**Transition:** `PASS_ATTACHED_WORKTREE_BRANCH_IDENTITY`, `PASS_3_PROTECTED_RELEASE_TOPLEVEL_CATEGORIES`, `PASS_NO_MATCH_OBSERVED_CWD_AT_SAMPLE`; `HOLD_NONCWD_FILE_HANDLES_AND_RELEASE_CONSUMERS`, `HOLD_NEXT_RETENTION_AUTHORITY`. `candidate_generated_next_allocated_kib=1328688`, `release_root_du_kib=0`, `release_top_level_directory_names=["federation-validation","recovery-campaigns","storage-handoffs"]`, `attached_worktree_branch=refs/heads/fix/update-independent-docs-context-20261015`, `cwd_match_count_observed=0`, `unqualified_next_reclaim_bytes=0`, `actual_next_reclaimed_bytes=0`. These are observation fields, not instructions to mutate the local machine.

**Next bounded read-only check (not a deletion recipe)**: all observable open FD *names* filtered to the exact `.next/` subtree, printing **only matching PID numbers/count**, plus count-only receipt categories for the three protected subtrees (never dump potential secret JSON/text payloads). For process visibility consider `lsof` permission limits. No recursive `lsof +D` walk through 1.267GiB, no grep exposing sensitive receipt contents, no `--apply`, no worktree prune or production action. Any nonzero FD consumer immediately holds cleanup; a zero FD sample alone does **not** certify no rollback/use.

## Third isolated `.next` probe — all observable open FDs zero; protected release symlink topology unresolved (owner Mac, 2026-10-27)

The owner ran a bounded **read-only** Python probe using `/usr/sbin/lsof -nP -Fpn` without recursive `lsof +D`, no `sudo`, no process termination and no filesystem mutation. Its `returncode` and `stderr` gates accepted the tool execution (otherwise the output would have marked HOLD). It matched full `n` file paths against the **exact** `.next` directory and the separator-bounded `.next/` prefix and reported `OBSERVED_OPEN_FD_PID_COUNT: 0`, `OBSERVED_OPEN_FD_PIDS: []`, `POINT_IN_TIME_ONLY: true`. Together with the prior `lsof -d cwd` no-match, no currently observable open FD or process cwd was found under this build at the sampled moments. This **cannot** certify lack of deployment, recovery or future users, nor compensate for any process visibility restriction.

It then used `os.walk(..., followlinks=False)` on the three **protected** adjacent `.aoe2war-release` category directories and printed metadata-only counts:

| Relative subtree | Nested subdirectories | Files | Symlinks |
|---|---:|---:|---:|
| `federation-validation` | 1 | 0 | **3** |
| `recovery-campaigns` | 1 | **1** | 0 |
| `storage-handoffs` | 0 | **1** | 0 |

**Critically, this is not an empty release-state tree** despite the prior `du -sk=0 KiB` allocation report: 3 symlink pointers and 2 regular file entries were found, potentially unique recovery/provenance sources. No filenames, link targets, receipt contents or `BUILD_ID` inside these subtrees were read. All artifacts are **PROTECTED**; there must be no symlink following or cleanup of the parent/siblings. In particular, do not infer the federation symlinks do not point to the candidate `.next` until exact target-relationship checks are performed.

**Gate transition:** `PASS_BOUND_OPEN_FD_PROBE_ZERO_AT_SAMPLE`, `PASS_RELEASE_TOPOLOGY_COUNT_ONLY`; `HOLD_THREE_SYMLINK_TARGET_RELATIONSHIPS`, `HOLD_RELEASE_ROLLBACK_REFERENCES`, `HOLD_FUTURE_BUILD_CONSUMERS`, `HOLD_REAL_NEXT_CLEANUP_AUTHORITY`. Candidate logical disk allocation is still **1,328,688 KiB (~1.267 GiB) from preceding scan**, not freshly remeasured in this probe; newly qualified reclaim **0 B** and newly actual reclaimed **0 B**. Worktree attached and clean at previous receipt with HEAD `99c406f57d759b672fd9fe91d3c3355c4d527705`; adjacent protected release tree retained.

**Next bounded read-only inspection:** list each link's file type, whether target exists and whether its **resolved target is inside the exact current `.next` tree**, within same worktree but outside `.next`, or outside worktree. Print only labels/booleans and hashed link path/name identifiers, **never actual symlink targets** or receipt contents. Inspect the 2 regular receipt files **for exact BUILD_ID textual relationship only with capped bytes and boolean output**, without printing content, only after affirming they're non-symlinks and text-safe. A positive reference means HOLD, and a negative reference remains only a limited scan: true release-controller authority must be independently confirmed before a human-approved change. Existing Storage/Workspace OS source remains authoritative; no new delete path or controller.

**Storage Atlas fields:** `next_open_fd_observed_pid_count=0`, `next_open_fd_tool_result=PASS_ZERO_AT_SAMPLE`, `next_cwd_observed_pid_count=0` (prior separate receipt), `release_protected_federation_nested_dirs=1`, `release_protected_federation_symlinks=3`, `release_protected_recovery_nested_dirs=1`, `release_protected_recovery_files=1`, `release_protected_handoffs_files=1`, `release_links_target_relationship=HOLD_UNINSPECTED`, `release_receipt_contents=NOT_READ`, `next_candidate_delete_authorized=false`, `phase10_new_reclaimed_bytes=0`.

## Human-approval **one** alias trial plan — NOT EXECUTABLE / NO APPROVAL

**Exact proposed first alias:** `dist/AoE2HDBets-Watcher-1.6.0.AppImage` with SHA256 `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266`, 134013759 B. Immutable canonical clone source: `dist/AoE2HDBets Watcher-1.6.0.AppImage` with the same SHA/length; historical names are preserved. We deliberately do **not** choose a signed Windows binary as first candidate.

**Before any separate approval:** owner-on-Mac **timestamp-divergence fixture PASS**; matching canonical/alias ownership, flags, modes, ACLs and xattrs and independently staged-verified alias-specific `mtime_ns`; no surprising symlink ancestors/hardlinks/mount transitions; recheck source and file digests, inode and `lsof` at execution; capture exact local website symlink inode+target, routes/updater/access logs/external historical URL contract, current APFS Data available, snapshots, status of apps and package builders, and durable canonical binary checksum/published release. Require explicit acceptance that alias inode/birthtime/ctime will change. If any precheck fails **HOLD**.

**Stage — separately owner-authorized, no irreversible unlink:** use a same-volume **private 0700** out-of-web temporary backup directory; create hardlink from original alias into that directory, preserving original inode/metadata/data blocks; direct Darwin `clonefile` canonical to a *new unoccupied* same-directory staging filename; verify staged SHA256, byte length, regular-file mode, flags, xattrs, ACL and ownership **versus the alias** (not merely source). Flush staged data and directory as supported; `os.replace(staged, alias)` atomically installs ordinary-file clone under the unchanged historical filename. Verify the **same local `public/downloads` symlink**, exact path from both `dist` and `public/downloads`, full digest/signature bytes, owners/mode/ACL/xattrs/updater metadata, source tree status and no new readers. If anything fails, atomically `os.replace(private_original_hardlink_backup, alias)` to restore original inode and all metadata. **Keep the private hardlink backup until explicit final acceptance.**

**Capacity / commitment split:** keeping the private hardlink means the original data blocks are still referenced; **there is no guaranteed capacity gain during reversible stage**. Disposing of that hardlink is a **second separately approved finalization**, after a stable site/URL/download and regression window, with fresh APFS free measurement and snapshot check. That last removal makes **original inode/birthtime preservation impossible**; a later semantic rollback can regenerate the same **signed bytes and ordinary file path** from the untouched published-digest-verified canonical file but not the original file identity. No permission for that final step is granted here. Report actual APFS Data free delta, not logical byte count.

## Ranked Mac build-retention opportunities (not a deletion order)

| Rank | Class | Last measured allocation | Gate / owner |
|---|---|---:|---|
| 1 | Docs-context worktree `.next` | **1,328,688 KiB (1.267 GiB)** | Large immediate build output but **adjacent `.aoe2war-release`**; proof of staging/rollback BUILD_ID and runtime absence required. Preserve source/worktree. **HOLD**. |
| 2 | Six Watcher hyphen-name aliases | **742,422,002 B (0.691 GiB logical)** | Proven content but **Mac download URLs must remain**; conditional CoW fixture and two-stage trial. **HOLD**. |
| 3 | Exact `~/Library/Caches/go-build` | **642,154,496 B (0.598 GiB allocated)** | Existing `./bin/aoe2war storage local-maintain --json` preview only. Requires idle Go builders, explicit approval; `--apply` acts on *all four allowlisted cache trees*, and offers no original-byte rollback. **HOLD**. |
| 4 | Watcher `dist/mac-arm64` + `dist/AoE2HDBets Watcher Direct` | **297,476 + 297,480 KiB (~0.567 GiB total)** | Packaged app and manual ZIP staging payload, may be required for rebuild/verification; no proper caller/hash stage review. **HOLD**. |
| 5 | Other historical `.next`, isolated build trees, `node_modules`, Go/Rust/Python caches, Docker | **not recently measured** | Existing Storage OS `storage triage --json`, `storage deep-census --json`, `storage local-maintain --json`, plus bounded source/owner/FD/rebuild check. Do not infer a reclaimable total. |
| 6 | Six clean+merged Workspace OS worktrees | **not measured** | No source worktree retirement solely from merged ancestry. Six clean/merged, 34 clean/unmerged and 6 dirty **in app+API scope**; 40 unmerged total, other repos additional. Protected Codex and original release receipts. **HOLD**. |
| PROTECTED | `~/aoe2war-recovery`, original recordings/CrossOver, `~/.codex`, MobileSync, wallets/financial, Wolo source, source archives | **large, protected** | Explicitly excluded from automatic cleanup. Human-review personal backup is a separate policy class. |

**Diagnostic correction:** previous `active_agent_count=0` means zero registered `agent_workspace` entities, not no Codex or active build process. `unmerged_count=34` excludes the six dirty/untracked rows that are also not merged. The 46 app/API attached noncanonical trees are 6 clean merged + 34 clean unmerged + 6 dirty; older whole-estate 80/11 includes Wolo/Docs/Sentry and is a different scope/time. Do not run `git worktree prune` or `git clean`.

## Existing commands and safe operator sequence

On clean canonical `main` (source-only read actions unless noted):
```bash
if cd "$HOME/projects/AoE2HDBets/app-prodn"; then
  df -k /System/Volumes/Data
  ./bin/aoe2war workspace status --json
  ./bin/aoe2war storage local-maintain --json
  ./bin/aoe2war storage triage --json
  ./bin/aoe2war storage deep-census --json
  ./bin/aoe2war storage estate --measure --json
else
  echo "HOLD: CANONICAL_REPO_UNAVAILABLE"
fi
```
No `--apply`, broad `rm -rf`, `git worktree prune`, `docker system prune`, `tmutil deletelocalsnapshots`, `tmutil thinlocalsnapshots`, `brew cleanup`, cache clearing, or paid external space action. The existing HEL1 `./bin/aoe2war watcher-downloads` and `watcher-staging` preview controllers are **remote** and do not authorize Mac cleanup. Avoid live host calls when only a Mac inspection is intended. Each JSON command's exit code and report completeness must be checked; a timed-out/partial `triage` or `estate` is HOLD rather than PASS.

For APFS snapshot *inspection only*: `tmutil listlocalsnapshots /` and `diskutil apfs listSnapshots /System/Volumes/Data`. These do not justify snapshot deletion or automatic attribution of the 3.29 GiB availability drop.

## Storage Atlas telemetry contract for Session B / Central

Source `Mac_Owner_20261027T1504Z`, observed and scope-tagged, **NOT** host-updated in this PR:

```json
{
  "kind": "aoe2war-session-d-phase10-mac-retention",
  "schema": 1,
  "operator_observation_utc": "2026-10-27T15:04:27Z",
  "apfs_data_free_kib": 11402824,
  "previous_apfs_free_gib": 14.165,
  "last_reported_current_free_gib": 10.875,
  "previous_verified_net_reclaim_gib": 2.606,
  "phase10_new_reclaimed_bytes": 0,
  "local_downloads_symlink_to_watcher_dist": true,
  "watcher_dist_allocated_kib": 3434896,
  "watcher_alias_SHA256_pairs_equal": 6,
  "watcher_aliases_logical_one_copy_bytes": 742422002,
  "manifest_or_updater_alias_refs_observed": 0,
  "open_alias_fd_count_observed": 0,
  "apfs_fixture_status": "PASS_MTIME_DIVERGENCE_APFS_FIXTURE_FOURTH_RUN",
  "mtime_divergence_fixture_source_commit": "8f8e5f9c004fab054478f5d97337af5346db7a55",
  "mtime_divergence_fixture_blob_sha1": "1706a45c9229c501d9bf91d6024dc2a81262aa57",
  "mtime_divergence_fixture": "PASS_ONE_SECOND_DIVERGENCE",
  "staged_alias_original_mtime_restored": "PASS",
  "apfs_data_free_kib_latest": 9365044,
  "apfs_data_used_kib_latest": 431003520,
  "apfs_data_capacity_display_latest": "98%",
  "apfs_data_snapshots_current": 0,
  "root_volume_group_os_update_snapshots_reported": 3,
  "apfs_data_free_increase_from_prior_kib": 2102060,
  "apfs_free_delta_is_verified_cleanup": false,
  "fixture_source_commit": "316815be0d1ce13db27aa2164770f7b3cbd7955a",
  "fixture_blob_sha1": "da0f5c21812829fe8b770bbacc585aba2b2dbfaa",
  "fixture_apfs_data_and_tmp_device_gates": "PASS_THIRD_ATTEMPT",
  "fixture_clonefile": "SUCCESS_NO_FALLBACK",
  "fixture_cow_write_isolation": "PASS",
  "fixture_regular_separate_inode": "PASS",
  "fixture_metadata_mode_owner_flags_mtime_xattr": "PASS",
  "fixture_download_symlink_continuity": "PASS",
  "fixture_original_inode_rollback": "PASS",
  "fixture_cleanup_on_normal_exit": true,
  "fixture_statvfs_free_bytes_during_test": 7440388096,
  "fixture_statvfs_delta_bytes_during_test": 0,
  "candidate_authority": "HOLD_OWNER_APPROVAL_AND_URL_COMPATIBILITY",
  "workspace_scope": "app-prodn+api-prodn",
  "workspace_clean_merged": 6,
  "workspace_clean_unmerged": 34,
  "workspace_dirty_unmerged": 6,
  "workspace_stale_registry": 0,
  "safety_exclusions": ["recovery", "Steam recordings", "Codex", "source", "financial", "wallets", "device backups"]
}
```

For Atlas, do not merge Mac root capacity with HEL1 root/evidence volume: HEL1 root was 53.38% used; attached evidence volume 91.83% used at the independently timestamped estate receipt. No production certification or bank-go claim flows from this Mac document.

## Independent reviewer acceptance and remaining HOLDs

Review must independently verify (a) published v1.6.0/v1.6.3 GitHub release digests, (b) 6 original-canonical pairs and 4 local manifests, (c) current alias-to-website path & historical URLs, (d) fixture-only PASS on owner Mac and its cleanup, (e) manual metadata/ACL comparison for first alias and same-device identity, (f) staged rollback to original inode, (g) separate finalization approval and post-commit measured APFS free delta, and (h) unchanged source/worktree/recordings/wallets/finances.

**Phase10 present verdict: `PASS_DISPOSABLE_APFS_FIXTURE / HOLD_NO_APPROVAL_FOR_ACTUAL_WATCHER_MUTATION`**. Draft, not merged. The Mac owner provided a verified native APFS fixture PASS directly in terminal; remote Mac connector availability was not needed. No actual Watcher clone, replacement, unlink, rename or cleanup occurred. No snapshot deletion. No new bytes reclaimed.
