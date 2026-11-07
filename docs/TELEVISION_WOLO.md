---
id: "aoe2war.app-prodn.docs-television-wolo"
title: "Television WOLO"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-11-03"
review_interval_days: 30
sensitivity: "internal"
---

# Television WOLO

## Owner-delegated source review — 2026-11-03

Codex performed this repository source review under Tony's delegated authority.
Tony is the sole human owner; Commissioner, operator, signer and reviewer roles
are distinct authority/cryptographic roles, not evidence of different humans or
an independent human review. Existing authentication, proof and role separation
still apply. This review covers the current local candidate, including
unpublished work; it is not a release receipt, live-service audit, native reserve
qualification or physical financial deployment approval.

Reviewed `app/television-wolo/page.tsx`,
`components/television/TelevisionWoloExperience.tsx` and
`tests/television-wolo-v1.test.mts`. The server composes existing live, recently
completed and archive projections; stream lookup is inside the explicit Play
action. Chaos Vote Lab remains browser-local and non-binding. Neither choosing
a feed nor a displayed champion proves financial settlement, reserve adequacy,
wallet authorization or chain title ownership. The source contract test checks
composition and playback wiring; it does not establish live media availability
or transaction execution.


## Purpose

Television WOLO is AoE2WAR's public broadcast laboratory. It is a compositional
sandbox for proving television presentation before proven pieces graduate into
Watch, Bets, or Live Games.

It owns presentation experiments only. Replay truth, media durability,
financial settlement, title custody, and player identity remain with their
existing authoritative systems.

## V1 authority

V1 reuses existing rails instead of creating replacements:

- live and recently completed battle identity comes from the public Live Games snapshot;
- older battle identity comes from the existing recent/archive projection;
- registered perspectives come from the Watch stream registry;
- first-party playback uses LiveStreamFrame;
- Twitch and YouTube use their existing embeddable feed identity;
- full per-battle fallback remains the existing Watch theatre;
- Chaos holder and belt presentation comes from existing title projections.

No new database model, video storage format, recorder protocol, replay identity,
or settlement rail is introduced by V1.

## Bandwidth contract

A visit to Television WOLO must not start battle video. The selected battle is
presentation state only until the viewer presses Play. Only that action requests
the registered feeds and mounts a player or external embed.

This keeps the television surface continuously available while video bandwidth
is driven by actual viewers. Archived battles can be reopened later without
requiring background loops while nobody is watching.

Existing stream admission, chunk limits, retention, playback limits, and cleanup
remain authoritative.

## Perspectives

V1 can expose the existing Main Cast, Observer, Player POV, Team POV, Postgame,
and external feed roles. Switching perspective never changes battle identity,
and stream presence is not replay finality or result proof.

## Chaos experiment boundary

The current Chaos title policy requires separate popular-choice authority that
has not been built yet. V1 therefore labels its Chaos selection controls as a
non-binding lab. Selection stays local to the browser: it writes no record,
counts no official choice, moves no WOLO, and cannot change title custody.

A future dedicated Chaos selection system must establish its own durable
identity, eligibility, timing, audit, and custody rules before this surface can
submit an authoritative selection.

## Promotion rule

Features graduate from Television WOLO only after their underlying authority is
correct. The expected path is to prove multi-perspective playback and archive
reopening here, then reuse the proven components on Watch, Bets, and Live Games.

Promotion must reuse the same components and data contracts rather than fork a
second implementation.

## V1 release checks

The V1 contract test verifies canonical data composition, user-triggered
playback, the non-binding Chaos boundary, and the account-menu route.
TypeScript and targeted ESLint must remain clean before release.
