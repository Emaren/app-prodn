---
id: "aoe2war.app-prodn.product-runner-owner-approval"
title: "PRODUCT Runner Owner Approval and Acceptance"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "security-contract"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "restricted"
---

# OWNER APPROVAL PACKET — PRODUCT restricted runner macOS pilot (SOURCE ONLY)

Status: **HOLD — no live Mac account, ACL, privilege or process change approved**. This document and the inert source script are part of draft App PR #1306. Preserve all 23 PRODUCT checkouts, the two local-only retention refs, Session B's live release authority and Codex's FINANCIAL exclusivity.

## Approved script source pin

File: docs/security/aoe_product_runner_pilot.py.txt

Exact SHA256: 7aa0455daf3b176d77089831107f83fd730b77fe9d6d4e648182ee28cbf63692

Source has the .txt extension intentionally. Do NOT rename/install/run apply because a PR is merged. Session C only performed Python AST parse and source-only plan; both PASS, no mutations.

## Four exact proposed additive ACL locations

Only the ACL entry **user:aoe_product_runner allow search** may be appended to EACH of these existing directories. No list, read, write, delete, admin or chown ACE allowed.

| Existing location | Stable identity + ACL SHA256 on Nov 10 |
|---|---|
| /Users/tonyblum | 9412d2015c26ac087773e6c750e599a27a6a2e0c5067765865ea7244ceca911b |
| /Users/tonyblum/projects | 38c1ea340d04b804ae47bc3c3768f4ac60c09370881e33b139ce1b681d6068d9 |
| /Users/tonyblum/projects/AoE2WAR-LANES | f3db8558699725983eb6a5bb05fe9d67bae0d10ec49e5934439099e510f7a907 |
| /Users/tonyblum/projects/AoE2WAR-LANES/PRODUCT | 1226d0b7e27a128de9fcc634f8c234ff43e0f858e695ef57152ae0b84f5a507f |

All four device IDs 16777234, inodes 36508 / 1222531 / 208577942 / 208577943. Existing root mode and ownership remain unchanged. These fingerprints are a SOURCE-ONLY snapshot; record/approve the actual preflight baseline at time of any future action. **Never add an ACL to FINANCIAL.**

Approved future scratch (not yet created): /Users/tonyblum/projects/AoE2WAR-LANES/PRODUCT/.aoe2_product_runner_scratch, mode 0700, owned by the runner and its unique private group. Owner-controlled small PRODUCT-only control and policy directories contain baseline and immutable-by-runner probe files, not new checkouts or services.

## Account preparation — IMPORTANT shared-group risk

The proposed name is aoe_product_runner. The human owner must provision a **standard non-admin macOS account with a unique, non-shared primary group** and confirm its groups exclude gid 0 (wheel), 20 (staff), 80 (admin), developer, Docker, launchd admin and sudo privileges. The usual macOS "standard" GUI user often belongs to the *shared staff group*; that is NOT sufficient. The pinned script refuses staff/admin/shared-group admission. The owner must authorize a separately reviewed private-primary-group configuration; no changes whatsoever to existing user identities.

Never inherit SSH_AUTH_SOCK, cloud tokens, finance DB URLs, financial service controls, Docker socket or custody signing material. Obtain the owner-private recovery DENIAL parent metadata from Codex by approved channel only; the actual archive path must not be posted to a public GitHub comment. Missing approved recovery parent => HOLD.

## Owner sequence — NOT EXECUTED

1. Owner posts a new, explicit App #1280 approval comment identifying the exact script SHA above, new account UID/group plan, four ACE locations, scratch path, synthetic recovery parent denial scope, preflight and rollback conditions. Owner-controlled source copy must come from that immutable GitHub commit, NOT a moving branch. Compare shasum -a 256 on the owner host before any apply.

2. Owner runs ONLY read-only plan first:

    /usr/bin/python3 -I -B /owner-controlled/pinned/aoe_product_runner_pilot.py.txt plan

3. Owner creates/proves the dedicated nonadmin NON-STAFF identity and checks id -u, id -Gn and id -G for aoe_product_runner. The source will FAIL if the account has not been explicitly prepared.

4. With root-level owner authorization, run exactly the pinned script:

    sudo /usr/bin/python3 -I -B /owner-controlled/pinned/aoe_product_runner_pilot.py.txt apply --sha256 EXACT_SCRIPT_SHA256 --approval-url EXACT_APP1280_APPROVAL_COMMENT_URL --recovery-parent CODEX_APPROVED_DENIAL_PARENT

The script reads metadata of only four approved existing ancestors, seals original stat+ACL fingerprints inside PRODUCT owner-only control data, appends four SEARCH-ONLY ACEs, creates isolated runner-owned scratch plus owner-managed probe/profile, then returns INSTALLED_NOT_ACCEPTED. Any partial action is HOLD; do not silently retry.

5. Acceptance step on the identical source:

    sudo /usr/bin/python3 -I -B /owner-controlled/pinned/aoe_product_runner_pilot.py.txt verify --sha256 EXACT_SCRIPT_SHA256 --approval-url EXACT_APP1280_APPROVAL_COMMENT_URL --recovery-parent CODEX_APPROVED_DENIAL_PARENT

It runs a sanitized env -i as the real new Unix identity (NOT the owner). First verify is **unsandboxed on purpose** so the kernel's actual UID rights must deny a harmless stat of a never-existing child under FINANCIAL and the separately authorized owner-private recovery parent (EACCES/EPERM, not ENOENT), while allowing an exclusively named scratch write/read. It never enumerates/opens financial records or archives. Then repeat under an owner-managed sandbox-exec profile, requiring network socket creation denial. Both PASS receipts, verified UID/group and exact scratch ownership are necessary. Sandbox alone is NEVER credited as real-UID denial.

6. Once the owner has stopped only the pilot runner, roll back EXACTLY the four new ACEs, without deleting source or evidence:

    sudo /usr/bin/python3 -I -B /owner-controlled/pinned/aoe_product_runner_pilot.py.txt rollback --sha256 EXACT_SCRIPT_SHA256 --approval-url EXACT_APP1280_APPROVAL_COMMENT_URL --recovery-parent CODEX_APPROVED_DENIAL_PARENT --runner-stopped YES

Rollback removes only the four corresponding ACE strings in reverse order and requires each stable ACL fingerprint match the original. Owner separately DISABLES the pilot account through macOS account controls, retains scratch and evidence until independently approved disposal, and confirms existing Codex/B/C sessions are undisturbed. No blanket chmod, chown -R, git clean, or removal of original worktrees. Drift => HOLD, manual approval.

## Evidence and final boundaries

Record exact script SHA, PR head, owner approval reference, all four BEFORE/AFTER/ROLLED_BACK metadata fingerprints, runner uid/gid/group list, allowed scratch write/read, denied actual FINANCIAL and owner-private synthetic-child stat EACCES/EPERM, sandbox socket creation EPERM, intact source checks and rollback hashes. Absence of admin/SSH/DB/custody/Docker/native-service authority must be independently attested.

The pilot proves **a limited supervised runner**, not continuous autonomous execution. Before untrusted Foundry or Traders jobs are allowed, a separate host launchd/OS policy must ensure that the runner cannot invoke arbitrary commands *outside* the pinned sandbox and cannot bypass network/database egress rules. B alone owns website promotion; Codex alone owns financial services and recovery. Actual install remains HOLD pending explicit owner approval.
