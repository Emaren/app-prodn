---
id: "aoe2war.app-prodn.product-we3-parallel-work-environments-20261114"
title: "WE3 independent PRODUCT source: two ChatGPT sessions without shared Git writes"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "restricted PRODUCT source operations only; no FINANCIAL or release-root authority"
reviewed_at: "2026-11-14"
review_interval_days: 30
sensitivity: "internal"
---

# WE3 independent PRODUCT source: two ChatGPT sessions without shared Git writes

**Owner coordination:** https://github.com/Emaren/app-prodn/issues/1360. Do not change the other session's VPSSentry checkout, Storage OS PR #76, existing UID650 primary checkout, FINANCIAL sources or HEL1.

## Actual installed source isolation

- **WE2:** existing UID650 PRODUCT source worktree and Git metadata. Preserve its branch and files. Other owner-side ChatGPT work in the separate VPSSentry repository is similarly outside WE3.
- **WE3:** independent GitHub clone from Emaren/app-prodn main at f436d6f3c1a04308e33b17db4a69c25a2d925fcf; separate .git objects, no alternates, private we3-independent-app-prodn source under restricted UID650 scratch. No shared Git worktree with WE2. APFS copy-on-write dependency copy has different filesystem inodes, not a mutable node_modules symlink. Separate we3-cache, we3-tmp, we3-receipts.
- **GitHub branch:** we3/website-parallel-20261114. Commit and push only to we3/*; local hooks reject other branch namespaces and non-fast-forward pushes. Never force-push or directly push main. Make one focused PR per change; take a fresh GitHub main readback before integration.
- **Account boundary:** both environments currently run under restricted UID650. Git/data/build isolation is **not kernel-enforced separation between the two ChatGPT sessions**. A separate Unix account with newly reviewed ACLs and agent enrollment would be needed for that claim.
- **Deployment boundary:** production 3032 is one shared runtime; 3030 rollback, 3033 emergency and 9447 PAPER preserved. Only the existing independently qualified B signer/root T10 release process may deploy accepted source. WE3 must not install a third live Next.js instance.
- **Financial boundary:** FINANCIAL gates remain separate and denied. No DB writer, custody, reserves or settlement permission, and no financial API listeners on 8092–8095.

## How two sessions work concurrently

1. At session start confirm UID650 and exact WE3 source path, current we3/* branch, clean working tree and independent .git; never run git reset --hard against WE2 or another session's branch.
2. Write only in your designated checkout. Distinct branches are necessary but **not sufficient** when the same checkout or Git metadata is shared.
3. Refresh the remote main ref without automatically merging it into an in-progress change. Review divergent files before any rebase.
4. Push only an explicit we3/* ref. PR review and exact-head CI mediate integration into main; GitHub is a source ledger, not proof of Mac agent heartbeat or HEL1 activation.
5. The founder's private page /admin/central-command/workspaces presents source-only branch observations and a separate public Factory release proof. If GitHub auth/source is unavailable, display UNKNOWN. If a session does not publish an independently accepted heartbeat, display UNKNOWN—not ACTIVE.
6. WE3 command output from Remote Desktop Commander does not magically appear in the founder's Terminal window. Record bounded receipts and source commitments in the issue/PR, and expose verified statuses in the website; avoid logging secret tokens or cookies.

## Shared resource budget

Both sessions share M1 CPU, memory, disk and restricted UID650. Do not run concurrent large Next.js builds without comparing free disk and active processes. Do not add duplicate timers, cleanup jobs, backends, SQL writers or production runtimes. The other session retains VPSSentry Storage OS and daily scanning ownership.

## Explicit trust boundaries

Configured lane does not mean active ChatGPT heartbeat. GitHub HEAD does not prove the local owner worktree is clean. Merged main does not imply deployed source. CI success does not imply an owner release permit. Public Factory SHA/BUILD_ID does not close FINANCIAL gates. Fail closed on absent evidence.
