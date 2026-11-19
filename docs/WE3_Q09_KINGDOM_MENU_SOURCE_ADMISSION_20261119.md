---
id: "aoe2war.app-prodn.we3-kingdom-menu-exact-script-admission-20261119"
title: "WE3 Q09 Kingdom Menu Exact Script Admission Review"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-only-independent-review-request"
reviewed_at: "2026-11-19"
review_interval_days: 30
sensitivity: "internal"
---

# WE3 Q09 Kingdom Menu Exact Script Admission Review

**SOURCE-ONLY CANDIDATE — INDEPENDENT WE2 REVIEW STILL REQUIRED.**
This is no root installation, Factory authorization, second human approval,
or signed production permit.

## Real blocker

Original [app-prodn PR #1415](https://github.com/Emaren/app-prodn/pull/1415)
at `59eebf7a646e4c31600bc8afe1d5601ff45c8dc6` retains all 39 original
Kingdom destinations plus one existing read-only `/kingdom-traders` PAPER
entry, 40 links total. Actual Q09/Q17 Chrome jobs pass at the original HEAD,
but PRODUCT source admission returns
`HOLD_PRODUCT_BOUNDARY: UNREVIEWED_EXECUTABLE_SURFACE` because the
updated local-browser acceptance script is a protected executable surface.
Do **not** bypass or disable that source guard.

## Narrow exact-source admission

The one changed script, `scripts/r25_public_kingdom_menu_chrome.cjs`,
has **SHA-256**
`c75151d78d67f0c83ac6b79d568e252630fe3f154a2f7df1d1a049edaeaface2`.
Its only original-base changes validate 40 links instead of 39,
assert the single Traders entry comes directly after Marketplace, and
reject a missing Traders entry. It retains bounded opt-in origin validation
for `https://aoe2war.com` or local `http://127.0.0.1:3032`, the exact original 39 historical links in their established order.
This source does not grant trading/funding, wallet, finance or root access.

`scripts/product_boundary_guard.py` adds one literal script exception
pinning **all four constraints**:

1. Repository-specific original PR branch:
   `session-c/we3-kingdom-traders-menu-visibility-20261118`.
2. Chronicle-integrated canonical base:
   `81640c7d834c252fb1680190b3f431bd4beb3e58`.
3. Source path:
   `scripts/r25_public_kingdom_menu_chrome.cjs`.
4. Exact SHA-256 above, with race-aware no-follow open and inode/size
   verification, file owned by current UID, single regular non-group-
   writable inode and no symlinked parent.

No wildcard `scripts/` privilege is introduced; another script,
changed bytes, base, branch, symlink, or group-writable source still HOLDs.
No general script execution or server configuration authorization exists.

## Acceptance evidence and release boundary

Restricted UID650 tests: **8/8 new exact-script positive/negative cases
PASS**; original **17/17 PRODUCT guard regression cases PASS**;
**19/19 menu/Kingdom Traders and player source contracts PASS** with
Node type stripping. Original #1415 Q09 and Q17 actual Chrome jobs passed
under their source SHA; they do not prove this revised guard source
is independently accepted or deployed.

**WE2 must conduct a genuine independent source review** of this guard
delta, its 40-link test script, narrow branch/base/hash, and downstream
security/dependency audit before any merge/Factory admission. This source
review request cannot be self-approved from the same owner GitHub account.

After independent acceptance, use the actual GitHub HEAD's Linux verified
artifact, owner-issued exact-source permit, same-slot 3032 activation and
T10 rollback; preserve 3030/3033/9447, masked settlement and financial
8092–8095 closure. Physical browser postflight at 375/768/1440 should
verify castle/touch/keyboard menu, single working `/kingdom-traders`
link, unchanged 39 historical routes, admin Emaren/Scribe session and
private endpoint separation. No live deployment claimed here.
