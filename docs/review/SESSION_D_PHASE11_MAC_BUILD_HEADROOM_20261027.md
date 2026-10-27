# Session D — Phase 11 Mac emergency build headroom (2026-10-27)

Authority: Central Command issue #934. Existing Session D review PR #942. **REVIEW ONLY: no cleanup authorization or file mutation.** Latest operator Data APFS available 8,300,728 KiB (about 7.916 GiB), with 99% capacity reported. Earlier two precisely authorized historical .next removals yielded +2.606 GiB verified; **Phase 11 new recovered: 0 B**.

## Release-controller comparison: owner-executed receipt

The actual Mac source-check verified bin/aoe2war Git blob 35bc824386bf6a31b907d94f0a323e8bb2a0e339 and scripts/aoe2_release.py Git blob 89e687e62cab68da625bc7b0ec9f5ade67de0629. Existing source-owned status --json reported production REACHABLE and candidate Oct 15 worktree .next/BUILD_ID **DIFFERENT from active and staged**. Certified active BUILD_ID comparison was **UNKNOWN_OR_ABSENT**, not DIFFERENT. Existing releases --limit 25 --json returned 25 inspected certified receipts, candidate in these 25 **false**. This is NOT an exhaustive historic rollback search or independent release certification. Do not dump production JSON or sensitive local receipt bodies.

## Candidate 1: exact ignored generated Next.js output

- Exact worktree: ~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015
- Attached HEAD 99c406f57d759b672fd9fe91d3c3355c4d527705; branch fix/update-independent-docs-context-20261015; normal Git porcelain empty. KEEP the worktree.
- Only candidate child: .next allocated 1,328,688 KiB (about 1.267 GiB); BUILD_ID **file SHA256** 3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522. This is not a whole-tree hash. Candidate lockfile checksum was NOT independently confirmed in the supplied Mac terminal evidence; do not accept an unverified lockfile digest as reproducibility proof. Historical package.json Git blob 11697e7c28b9eabd65da7c3e21f6ea253d3d5011.
- No current process CWD or open FD under .next observed at the bounded sample times; zero current direct federation symlinks into .next; source git grep did not find its literal BUILD_ID.
- KEEP all adjacent .aoe2war-release evidence, including federation-validation (three existing directory symlinks: two into other AoE2WAR project locations, one elsewhere in this worktree), one recovery-campaign regular file and one storage-handoff regular file. Two bounded receipt scans found no literal .next or candidate BUILD_ID; this does not exclude encoded or indirect links.
- Source package.json contains prebuild generation and Prisma steps, build invokes Next, postbuild prepares runtime cache; a rebuilding recipe exists but has **not been independently proven equivalent or non-mutating in this protected worktree**. .gitignore protects neither ignored output nor release receipts through the ordinary Git clean state.

Verdict: **HIGH_CONFIDENCE_DORMANT_GENERATED_OUTPUT_REVIEW / HOLD_HISTORICAL_ROLLBACK_AND_REPRODUCIBILITY / NO_DELETE_PERMISSION**. 1.267 GiB is a logical allocated candidate, NOT guaranteed APFS ordinary-free recovery.

## Ranked candidate ledger — one owner-Mac batch still needed

| Rank | Class | Last allocation | Source and retention | Allowed next work |
|---|---|---|---|---|
| 1 | Exact docs-context .next above | **1.267 GiB**, repeated Mac observation | Strong scoped negatives; older rollback/rebuild proof incomplete | One guarded approval PLAN, no actual mutation |
| 2 | Four strictly allowlisted regenerable caches | Go-build **627,104 KiB (~0.598 GiB)**; Yarn/pnpm/CoreSimulator unknown | Source-owned storage local-maintain previews four; **--apply clears all four**, not .next | Preview all four and active builders; no apply |
| 3 | Other attached worktree .next and root app active .next | Live sizes UNKNOWN; previous scoped inventory found only one historical worktree .next | Active builds/receipts protected; worktree Git ancestry & consumer/lockfile proof per path | Single read-only ranked batch |
| 4 | app/API/watcher node_modules, .turbo, generated code | UNKNOWN current | Native deps, pinned locks, active runtime consumers and exact reproducibility unknown | Batch read-only |
| 5 | Generic cache and Docker | ~/.cache ~5.111 GiB historical; Docker ~5.233 GiB historical | **Not** existing four-path allowlist; Docker persistent volumes unclassified | HOLD owner review |
| 6 | Six Watcher hyphen release filename aliases | 742,422,002 B ~0.6914 GiB **logical**; physical APFS recovery UNKNOWN | Matching canonical SHA verified, but historical URLs, runtime/metadata, ownership and two-stage owner approval HOLD | Preserve |
| — | Whole Watcher dist | 3,434,896 KiB ~3.276 GiB | Signed/published or source release artifacts and website download symlink | NEVER whole-tree clear |
| — | aoe2war-recovery ~38 GiB, Steam recordings ~26 GiB, Codex, personal, MobileSync, financial/wallet data | Historical protected | Unique source, human content, finances | NEVER automatic cleanup |
| — | APFS VM swap/snapshots, Preboot/System/Recovery | OS-managed | Previous recent ~1 GiB free-space drop mostly VM volume allocation; not a removable build product | Never touch manually |

Rows with UNKNOWN allocations must remain unmeasured, not zero or estimated. Never sum Watcher dist and its internal aliases as independent available gains.

## Existing controllers — reviewed source boundaries

Source-backed app-prodn scripts/aoe2_storage.py Git blob 3f2eea63fb291bc15de72820a4dc911e0fdf51df; docs/STORAGE_OS.md blob 258178f934a0d2212fcd0091386cdb2b90bcbf7d; scripts/aoe2_workspace.py blob 03f6e89569c1c6ad8356f7427a59d2a07db81b28.

- storage local-maintain preview is source-owned but its apply implementation acts on Yarn, Go build, pnpm and CoreSimulator caches all together, with no undelete. **It cannot target only this .next.**
- workspace clean --apply may prune Git worktree metadata and remove worktrees. Not appropriate: this exact source checkout must remain.
- VPS storage expiry, production release and database snapshot policies are different ownership/volume domains and cannot be borrowed for this Mac generated output.
- storage deep-census --json surveys named Mac caches but does **not yet enumerate the full attached worktree .next candidate pool**. This is a prevention gap.

## Guarded exact-one-directory transaction specification — NOT EXECUTABLE

Transaction identifier SESSION_D_PHASE11_DOCS_NEXT_ONLY. A future operator-authorized action would select **only** the .next child of the exact Oct 15 docs-context worktree. It cannot touch its parent, .aoe2war-release, sibling source, other worktrees, watcher dist, personal data or remote estate.

**Required PRECHECK:** exact physical path and no symlink ancestry; owner/mode/device; attached HEAD/branch/status; expected BUILD_ID file SHA256; whole candidate content/size manifest; fresh unambiguous active and staged mismatch; all necessary historical rollback/restore references accounted for (25-history misses alone insufficient); fresh process/FD/cwd checks; checked source pinned lockfile, Node version/toolchain, protected receipt state, and any project runtime consumers. Unknown means HOLD.

**Required DURABILITY:** independently restore-tested off-APFS-Data copy of this exact generated output OR independently proven rebuild in a separate disposable workspace at pinned source/toolchain with protected original never modified. Neither is available in current evidence. Do not create another ~1.267 GiB copy on the almost-full same APFS container; renaming into same-volume quarantine gains **0 bytes**.

**Required owner APPROVAL:** exact operation and exact single path, separately from this review. There is no currently approved implementation of an exact generated-tree deletion in existing source. Do not improvise blanket rm -rf, generic worktree prune, all-four-cache apply, or a remote production expiry.

**Required postcondition/receipt if later approved:** Data df -k before/after, same-time diskutil VM/Data allocation, exact unaltered worktree HEAD/dirty state, protected sibling hashes/links, artifact removal bound, rollback guarantee, receipt digest and Central #934 crosslink. Count only the **measured net APFS ordinary-free increase** as actual reclaimed GiB, independent of original allocated size. If VM changes affect the net, record both rather than claiming a false recovered number.

## Preventative build-generation retention and alerts: reviewed policy, not installed

Target state for existing Storage OS: one currently used development generation per registered project plus every active/staged/certified recovery generation and required rollback history. **Never infer protected rollback eligibility solely from age.** Add bounded read-only registered-worktree .next/node_modules census and source-SHA, BUILD_ID-file digest, lockfile identity, owner/caller flags and measured allocated bytes into existing storage deep-census, not a duplicate cleanup controller. Emit advisory only when an ignored historical .next is >=1 GiB or directory metadata age >7 days; unknown source/rollback/caller identity always HOLD. Route to existing Storage triage and Doctor alerts; no automated deletion or new scheduler until tested and approved. Keep VPS active + two hot expanded + three proven cold checkpoint policy separate from Mac workspace cleanup. Source implementation and scheduled policy alert are **NOT deployed**; do not claim prevention is active.

Tests required before any source promotion: symlinked ancestor HOLD, active/staged/recovery BUILD_ID HOLD, dirty worktree HOLD, protected release siblings unmodified, open handles HOLD, limited enumeration, permission failure HOLD, cache allowlist unchanged, no mutation. Current exact owner-Mac batch measurements pending (Remote Desktop Commander Tonys-Laptop.local offline). Review source must remain DRAFT.

## Exit

Current Phase11 source and scoped release authority review: PASS for negative active/staged/last 25 matches, HOLD on certified field/complete rollback reference and independent restore or build. **Actual new bytes reclaimed 0.** No Mac changes, no production release, no financial action and no protected worktree or signed installer modification.


## Phase 11 ranked batch camera in the draft review branch (added, not installed)

Source path: docs/review/fixtures/session_d_phase11_readonly_inventory.py; Git blob 8f769a2e356623dea4a7f369861c63ffa8784889, initially authored at commit 118614927519ecd33ea8a5f51307c560772f8915. This is a **review-only fixture**, not a Mac maintenance apply tool, scheduled monitor or runtime action. The user has not yet executed this exact new variant on the owner Mac, so no fabricated live output or test PASS is claimed.

It reads registered app/API Git worktrees through git worktree list --porcelain; inspects only direct .next/node_modules/.turbo generated directories, active app/API and Watcher named outputs, plus exactly four currently allowlisted cache paths; uses a **single bounded lsof capture** and bounded per-directory du -sk rather than repeated per-candidate manual FD surveys. For each source it reads HEAD/branch/scoped Git porcelain, bounded SHA of existing package lockfiles and BUILD_ID file, release sibling existence and directory mtime age. It prints a sorted review ledger and an **advisory** old/large Next alert if >=1,048,576 KiB and >=7 days by directory mtime. No reading release receipt bodies, no rm, no source or symlink edits, no process termination, no network calls from the Python fixture, no --apply, no receipt writes.

Known limits: this is NOT proof of complete build consumers, process visibility, source reproducibility, certified release authority or APFS reclaim. An incomplete lsof or measurement is HOLD; cache allowlist entries are preview only; worktree status excludes ignored files; age is the directory mtime, not a reliable build-completion timestamp. Source review/CI and owner-Mac syntax + fixture execution are pending. Future upstream Storage OS integration requires its own tested read-only code change and merge; **retention alerts are not automatically deployed**. The supplementary standalone prototype fixture in the current ChatGPT runtime is a different local test and its success must not be attributed to the GitHub branch variant.

**Safe operator verification:** fetch the immutable commit-pinned raw path; verify with git hash-object against blob 8f769a2e356623dea4a7f369861c63ffa8784889; run python3 -m py_compile; only if both pass execute Python with no deletion arguments and report its table. Existing source-authoritative storage local-maintain --json remains a PREVIEW; do NOT invoke its --apply.

## Owner Mac immutable Phase11 camera executed — grouped ranked allocation receipt (2026-10-27)

**New fixture itself PASS on operator Mac:** downloaded 8,915 B from pinned `118614927519ecd33ea8a5f51307c560772f8915` raw path, `git hash-object` matched exact source blob `8f769a2e356623dea4a7f369861c63ffa8784889`, `ast.parse` PASS, executed `python3 -B` under selected project Python 3.13.5. Output `PASS: PHASE11_SOURCE_AND_SYNTAX_VERIFIED`, worktree probe `{'app-prodn':'PASS','api-prodn':'PASS'}`, all observable FD census `PASS_POINT_IN_TIME`, old/large Next alert count **4**, `NO_MUTATION / NEW_RECLAIMED=0`. The 8,915 B reported by curl is transport size, while the Git blob checksum is the authoritative exact script-byte identity. This was a live READ-ONLY inventory success, **not** a native Next rebuild or retention approval.

**New exact sampled rounded allocations from plaintext (GiB; all directory `du` results rounded by the fixture to 3 decimals; do not treat these as exact physical byte counts):**

| Worktree / generated output | Rounded allocated GiB | Classification / action |
|---|---:|---|
| `app-prodn/codex-authenticated-satchel-deposit/.next` | **1.393** | `HOLD_RELEASE_ADJACENT`; **FINANCIAL WORKTREE PROTECTED** |
| `app-prodn/codex-satchel-complete-financial-paths/.next` | **1.298** | `HOLD_RELEASE_ADJACENT`; **FINANCIAL WORKTREE PROTECTED** |
| `app-prodn/update-independent-docs-context-20261015/.next` | **1.267** | `HOLD_RELEASE_ADJACENT`; previously individually qualified, **TOP REVIEW** |
| `app-prodn/app-prodn-e5-seal/.next` | **1.214** | `HOLD_UNKNOWN_RUNTIME`; **SECOND REVIEW**, identity/rollback/FD/production BUILD_ID not yet proven |
| `app-prodn/app-prodn-e5-seal/node_modules` | **0.832** | `HOLD_UNKNOWN_RUNTIME`; not authorized |
| `app/node_modules` | **0.830** | `HOLD_RELEASE_ADJACENT`; canonical active project dependency |
| `app-prodn/codex-final-satchel-qualification/node_modules` | **0.830** | `HOLD_UNKNOWN_RUNTIME`; financial Codex source **PROTECTED** |
| `app-prodn/app-prodn-renaissance-phase1-20261020/node_modules` | **0.830** | `HOLD_RELEASE_ADJACENT`; source/release branch PROTECTED |
| `watcher/node_modules` | **0.103** | `HOLD_ACTIVE_PROJECT` |
| `watcher/dist` | **3.276** | `HOLD_SIGNED_DISTRIBUTION`; entire published release tree PROTECTED |
| `app/.next` | **0.000** (rounded) | `HOLD_RELEASE_ADJACENT`; **not evidence of absent or zero bytes** |
| `yarn_cache` | **0.000** (rounded) | All-four-cache `local-maintain` review-only; no selective `--apply` |
| 10 other listed attached `node_modules` entries | **UNKNOWN** | **HOLD**, may be symlink, `du` error, inaccessible or timed out; the plaintext omits exact per-row reason. Never interpret UNKNOWN as zero. |

The four historical Next output rows sum to **5.172 GiB of individually rounded `du` allocations**; two financial Codex `.next` sum **2.691 GiB protected**, leaving **2.481 GiB of two generated build trees available for further retention qualification** (docs 1.267 + E5 1.214). **These are NOT approved-to-delete bytes**, and APFS CoW/clones/hardlinks/VM accounting means ordinary-free headroom cannot be predicted as their naive total. Four individually measured `node_modules` rows ~**3.322 GiB** logical allocated; most are attached worktrees/financial or canonical active and protected. Do not add `watcher/dist` to alias contents separately. There is no independent free-space before/after data in this probe, so Phase11 actual reclaimed **0 B**.

**Alert interpretation:** 4 `ALERT_LARGE_STALE_NEXT_COUNT` means the simplistic threshold `>=1 GiB` and directory `mtime>=7d` matched **all four** large Next builds, **including both protected financial Codex worktrees**. This must be treated as **four READ-ONLY review alerts, not four cleanup candidates**. A prevention policy must suppress or label protected/active/rollback-linked outputs before action and never automatically delete based on age. The script printed status `PASS_POINT_IN_TIME` for the `lsof` tool invocation, but did **not print per-candidate open-FD counts or source HEAD/branch/lockfile identifiers in plaintext**; these fields exist in `--json` output and remain UNVERIFIED for newly discovered E5/codex builds until a scoped sanitized JSON sample. The earlier independent point-in-time checks on docs worktree remain separate.


**Four-cache preview nuance:** latest camera printed only `yarn_cache 0.000 GiB` from the strict cache allowlist. The previously measured `go_build_cache=627,104 KiB` did **NOT** appear in this new camera; `pnpm_cache` and `core_simulator_cache` also did not appear. In the current camera's source, an unprinted allowlist entry means that its exact source path was neither `exists()` nor `is_symlink()` at scan time. **Do not continue to rank historical Go cache bytes as currently available for removal.** No proof who removed or relocated these paths, or that their earlier logical bytes became new APFS ordinary free, exists. A fresh source-owned `storage local-maintain --json` PREVIEW can distinguish existing and missing four-cache paths without `--apply`.

**Worktree and runtime evidence limitations:** `app-prodn` and `api-prodn` worktree registries enumerated successfully. The fixture does not enumerate all arbitrarily named nested caches or every third-party app, and `du` may fail or time out; only direct registered worktree `.next`, `node_modules`, `.turbo`, selected active outputs and four allowlist caches are included. `UNKNOWN` preserves missing measurements. The current headroom story remains 7.916 GiB at the last separate `df` measurement, not a new free-space measurement from this camera.

**Next ranked step:** collect bounded/sanitized `--json` from this now Mac-verified exact fixture, showing for **only** four `.next` rows: identifier, SHA, branch, age, BUILD_ID-file checksum, `observable_open_fd_count`, `fd_status`, `git_clean_normal_scope`, `release_sibling_protected`, and exact allocated KiB; for `node_modules UNKNOWN` rows, show just id + `allocated_status` to distinguish symlinks from `du` failures. Preserve all evidence; do not dump protected receipt contents. Then perform production current/staged and certified history comparisons for E5 (not yet proven), and complete older rollback/reference / independent restore proof for docs. Require separately authorized one-path transaction for any removal.

**Status after new receipt:** `PASS_MAC_BATCH_CAMERA_SOURCE_SYNTAX_RUNTIME`; `PASS_APP_API_WORKTREE_CENSUS`; `PASS_FOUR_LARGE_NEXT_OBSERVED`; `HOLD_TWO_FINANCIAL_NEXT`; `HOLD_E5_BUILD_RELEASE_REFERENCES`; `HOLD_DOCS_OLDER_ROLLBACK_AND_RESTORE`; `HOLD_NODE_MODULES_UNKNOWN_REASONS`; `HOLD_ALL_MUTATION`. New reclaimed **0 B**.


## Owner Mac expanded Phase11 binary authority + exact candidate ledger (2026-10-27)

**Actual owner Mac check** reused immutable review camera (source Git blob `8f769a2e356623dea4a7f369861c63ffa8784889`) and existing source-owned release controller, verifying all three local file blobs at execution. `PASS_SOURCE_VERIFIED`. Camera returned `mutation_allowed=false`, a bounded `lsof` probe of `PASS_POINT_IN_TIME`, full Git worktree metadata and allocated KiB for the four historical generated builds. No filesystem mutation performed; live APFS ordinary free was not remeasured.

| Exact attached worktree `.next` | Allocated KiB | Source HEAD | Branch | Git clean, normal scope | BUILD_ID file SHA256 | Age / FD | Adjacent protected release |
|---|---:|---|---|---|---|---|---|
| `codex-authenticated-satchel-deposit` | **1,461,128** | `a36b896af5a15386b71cf5c794f8a64820ed9ecf` | `codex/satchel-authenticated-deposit-credit` | true | `6b34e027458002b9e4e52f1292d493957b4a7298a43b671c9fd7f7d98eb98044` | 9.7d / **0 observed** | true; **FINANCIAL PROTECTED** |
| `codex-satchel-complete-financial-paths` | **1,361,188** | `0e364022d86e56c120ef2153eedf122f011cfd8c` | `codex/satchel-funded-integration` | **FALSE — dirty**, protected | `3f0b7f8437af8324b4ba119f156a0af82f120b84ce2fc97e320e1220d40b2abc` | 8.9d / **0 observed** | true; **FINANCIAL PROTECTED** |
| `update-independent-docs-context-20261015` | **1,328,688** | `99c406f57d759b672fd9fe91d3c3355c4d527705` | `fix/update-independent-docs-context-20261015` | true | `3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522` | 12.1d / **0 observed** | true; best-qualified generated build REVIEW only |
| `app-prodn-e5-seal` | **1,272,664** | `b3b6240f94b8521378372dbee16fefc44c7570e6` | `champions-e5-seal-20261011` | true | **null** | 15.9d / **0 observed** | false; source and build REVIEW, no deletion |

**Exact totals from KiB—not sum of rounded display:** all four historical `.next` **5,423,668 KiB = 5.172413 GiB**. Two financial/Codex source trees **2,822,316 KiB = 2.691570 GiB** remain hard protected; two docs+E5 review trees **2,601,352 KiB = 2.480843 GiB** represent possible *allocated* outputs to qualify, **not approved deletion nor measured APFS physical headroom**. Canonical `app/.next` is **516 KiB** (~0.000492 GiB), previously rounded 0.000; keep active project's `.next` protected even if tiny.

**E5 BUILD_ID classification:** `build_id_file_sha256: null`, and owner comparator printed **`HOLD_BUILD_ID: E5`**. Per comparator contract this covers a symlinked parent, non-regular/missing/zero-length/oversize BUILD_ID, non-ASCII value or I/O failure. **Do NOT falsely report that the file is definitely missing**, do not compare E5 against active/staged/history as though it has a valid build ID. E5 could be incomplete output, but the type/layout needs a bounded metadata-only inspection before asserting that.

**Source-owned release comparison expanded to 1,000-entry limit:** `PRODUCTION_STATUS` was previously independently reported REACHABLE; in this current batch the code ran `./bin/aoe2war status --json` and returned docs **active DIFFERENT**, **staged DIFFERENT**, certified **UNKNOWN_OR_ABSENT**. `releases --limit 1000 --json` returned **371 certified activation records**, `CERTIFIED_HISTORY_LIMIT_REACHED=false`; **DOCS CERTIFIED_HISTORY_MATCHES: 0**. Thus **all 371 records returned by that local certified-history implementation** are negative for the candidate, rather than only the 25 most recent. This is **not proof** that every historical remote cold archive/previous activation/rollback, local symlink pointer or non-certified record was inspected. Missing certification field remains HOLD, not inferred DIFFERENT.

**Ten `node_modules` UNKNOWN rows decoded:** all ten printed `HOLD_MISSING_OR_SYMLINK` (the camera's branch covers absent paths **and** symbolic links). This is NOT the same as ten failed `du` measurements, and not evidence of any allocated disk bytes. To distinguish missing from links and their targets without dereferencing, use a bounded `lstat`-only follow-up; do not point `du` through them or unlink links.

**Acceptance:** `PASS_CANDIDATE_BUILD_SOURCE_SHA_AND_AGE`, `PASS_DOCS_ACTIVE_STAGED_MISMATCH`, `PASS_371_LOCAL_CERTIFIED_RECEIPTS_NO_DOCS_MATCH`, `PASS_FOUR_GENERATED_BUILDS_EXACT_KIB`, `HOLD_E5_BUILD_ID_VALIDATION`, `HOLD_CERTIFIED_CURRENT_FIELD_AND_OTHER_ROLLBACK_ARCHIVES`, `HOLD_DOCS_INDEPENDENT_REBUILD_OR_OFFDATA_RESTORE`, `HOLD_REAL_CLEANUP_AUTHORITY`. One financial Codex checkout **currently dirty** and must not be retired. Observed zero FDs is a single point-in-time negative sample only. No Phase11 additional recovery: **0 B**.

**Next high-value bounded evidence, one operator script:** `lstat` E5 `.next/BUILD_ID` and known Next output markers `cache`, `server`, `static`, `build-manifest.json`, `prerender-manifest.json`, `required-server-files.json` (types only, no file contents); check source SHA/clean status + branch ancestry for docs/E5; and for each of ten UNKNOWN `node_modules`, `lstat` distinguishes missing vs symlink without following. Reconcile source-owned release state/rollback receipts and external restoration plan separately; no additional repeated full `lsof` required until just before a specific approved transaction. The current `storage local-maintain --apply` is all-four-cache, not an exact historical `.next` operation and remains unauthorised.


## Owner Mac E5 drift / seven absent dependency roots — HOLD ownership before any cleanup (2026-10-27)

A new operator **read-only** script did an exact source/ancestry and filesystem `lstat` check rather than repeating the deep size/FD scan. Results, transcribed without assuming causes:

| Check | Observed | Implication |
|---|---|---|
| Docs-context worktree `HEAD` | Matched expected `99c406f57d759b672fd9fe91d3c3355c4d527705` | PASS at this moment |
| Docs commit vs local `main` | **`ANCESTOR_OF_LOCAL_MAIN`** | Source commit reachable via local main; **not** a build rollback or generated-output restoration certificate |
| E5 HEAD guard | **`HOLD_SOURCE_CHANGED`** | Could indicate HEAD changed **or** `git rev-parse` failed (missing/relocated worktree, bad git metadata, permissions); **no new SHA was printed** |
| E5 `.next` `lstat` guard | **`HOLD_E5_NEXT_ROOT`** | Path no longer classified `DIRECTORY`; can be missing, symlink, regular file, other inode or stat failure; exact type **not printed** |
| Unknown `node_modules` from previous batch | **7 `MISSING`; 3 `SYMLINK_PROTECTED`** | All ten previous `HOLD_MISSING_OR_SYMLINK` statuses now split by direct `lstat`, no link traversal |

The three protected **symlink** dependency entries are attached worktrees `fix-replay-result-authority-inputs-20261011`, `phoenix-recovery-dashboard-20261014`, and `update-independent-docs-context-20261015`. The seven **missing** entries are `codex-authenticated-satchel-deposit`, `codex-hd-durable-finance-fence`, `codex-hd-live-admission-qualification`, `codex-hd-live-market-admission`, `codex-satchel-complete-financial-paths`, `codex-satchel-live-authority-integration`, and `codex-satchel-product-money-limits`. **No symlinks were dereferenced or altered**; missing directory names do not imply disappearance of protected tracked financial sources or data.

**Critical cross-sample distinction:** earlier immutable owner Mac camera measured E5 `.next` **1,272,664 KiB (~1.214 GiB)** at source `b3b6240f94b8521378372dbee16fefc44c7570e6`; this newer check found neither expected source identity nor `.next` ordinary directory. **We do not know whether any bytes have actually been freed**, which process/user acted, whether the path was moved/replaced, or whether the storage pool changed. This is **state drift**, not an authorized recovery receipt. E5 is **HOLD_EXTERNAL_CONCURRENT_OWNER/WORKTREE_STATE**, cannot be added to an immediate cleanup plan or claimed as recovered. **DO NOT** attempt worktree restore, symlink unlink, branch reset, `.next` deletion or `git worktree prune` to resolve the observation.

**Next bounded safe probe**: take fresh `/bin/df -k /System/Volumes/Data` and `/usr/sbin/diskutil apfs list` (to separate VM-volume swings from freed Data bytes), then `lstat`-only type/owner/device/inode for exact E5 worktree, `.git`, `.next`; a single registry `git worktree list --porcelain` exact-match for attached E5, and only if still an ordinary worktree, `git rev-parse HEAD` plus `status --porcelain` without mutation. Print exact HEAD if it changed, without dumping private files. Do **not** follow symlinks or call `du` recursively until classification is sound. If another agent/shell is modifying this checkout, coordinate owner/source authority before further action.

**Current snapshot verdict:** `PASS_DOCS_SOURCE_ANCESTOR_OF_LOCAL_MAIN`, `HOLD_E5_CHANGED_OR_INACCESSIBLE`, `PASS_7_ABSENT_3_PROTECTED_SYMLINK_NODE_MODULES`, `HOLD_FRESH_APFS_FREE_AND_E5_PHYSICAL_ALLOCATION`, `HOLD_ALL_MUTATION`. Docs exact historical `.next` still qualifies for review only; its current active/staged BUILD_ID mismatch and 371 locally returned certified-history misses remain true as earlier receipts, with older remote rollback/independent restore **HOLD**. **Session D Phase11 actual newly recovered = 0 B verified**. No new `df` measurement in the latest probe.

