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

**Clone source identity**: hash+size+regular-file+same-device+clean exact canonical path; full xattrs, ACLs, `stat -f` flags, user/group, mode and mtime must be captured. A clone copies *source* attributes; if original alias metadata differs from its canonical peer, **HOLD** rather than overwriting metadata with source metadata. Existing alias inode, birthtime and ctime **cannot** all remain identical after an atomic replacement and must be consciously accepted as limitations; no claim of bit-identical filesystem object. Codesigning payload byte SHA must stay unchanged. No re-signing or binary rebuild.

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

## Human-approval **one** alias trial plan — NOT EXECUTABLE / NO APPROVAL

**Exact proposed first alias:** `dist/AoE2HDBets-Watcher-1.6.0.AppImage` with SHA256 `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266`, 134013759 B. Immutable canonical clone source: `dist/AoE2HDBets Watcher-1.6.0.AppImage` with the same SHA/length; historical names are preserved. We deliberately do **not** choose a signed Windows binary as first candidate.

**Before any separate approval:** owner-on-Mac fixture **PASS**; exactly matching canonical/alias ownership, flags, modes, ACLs and xattrs; no surprising symlink ancestors/hardlinks/mount transitions; recheck source and file digests, inode and `lsof` at execution; capture exact local website symlink inode+target, routes/updater/access logs/external historical URL contract, current APFS Data available, snapshots, status of apps and package builders, and durable canonical binary checksum/published release. Require explicit acceptance that alias inode/birthtime/ctime will change. If any precheck fails **HOLD**.

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
  "apfs_fixture_status": "PASS_APFS_FIXTURE_ONLY_THIRD_RUN",
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
