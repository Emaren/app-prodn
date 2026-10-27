# Session D — Phase 11 Mac emergency build headroom (2026-10-27)

Authority: Central Command issue #934. Existing Session D review PR #942. **REVIEW ONLY: no cleanup authorization or file mutation.** Latest operator Data APFS available 8,300,728 KiB (about 7.916 GiB), with 99% capacity reported. Earlier two precisely authorized historical .next removals yielded +2.606 GiB verified; **Phase 11 new recovered: 0 B**.

## Release-controller comparison: owner-executed receipt

The actual Mac source-check verified bin/aoe2war Git blob 35bc824386bf6a31b907d94f0a323e8bb2a0e339 and scripts/aoe2_release.py Git blob 89e687e62cab68da625bc7b0ec9f5ade67de0629. Existing source-owned status --json reported production REACHABLE and candidate Oct 15 worktree .next/BUILD_ID **DIFFERENT from active and staged**. Certified active BUILD_ID comparison was **UNKNOWN_OR_ABSENT**, not DIFFERENT. Existing releases --limit 25 --json returned 25 inspected certified receipts, candidate in these 25 **false**. This is NOT an exhaustive historic rollback search or independent release certification. Do not dump production JSON or sensitive local receipt bodies.

## Candidate 1: exact ignored generated Next.js output

- Exact worktree: ~/projects/AoE2HDBets/.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015
- Attached HEAD 99c406f57d759b672fd9fe91d3c3355c4d527705; branch fix/update-independent-docs-context-20261015; normal Git porcelain empty. KEEP the worktree.
- Only candidate child: .next allocated 1,328,688 KiB (about 1.267 GiB); BUILD_ID **file SHA256** 3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522. This is not a whole-tree hash. Historical yarn.lock SHA256 4e7b5b9c47f73315435439519d6fb7b0623502cb14c89d51d7ef4089b074e53b; package.json Git blob 11697e7c28b9eabd65da7c3e21f6ea253d3d5011.
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
