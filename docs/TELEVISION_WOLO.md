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
reviewed_at: "2026-10-09"
review_interval_days: 30
sensitivity: "internal"
---

# Television WOLO

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

## V1.1 director implementation (2026-10-09 candidate)

Development branch: `feature/television-v1-director-multicam-20261009`.
This section describes *source implementation*, not a certified installed Watcher or
live two-player capture canary.

- Team-aware camera slots are projected from the canonical public replay team
  resolution. Only a resolved two-side roster receives directional team labels;
  incomplete, multi-side, or conflicting rosters retain explicitly unverified
  positions. No video labels may repair or create replay team authority.
- First-party Watcher video is assigned to a participant only when the
  registered stream owner's server-linked Steam ID exactly matches a unique
  replay participant Steam ID. Client-supplied `playerLabel` is never first-party
  POV identity. Admin-curated external embeds may be shown with a conspicuous
  *unverified external label* warning, and unmatched feeds stay in an
  Unassigned/Observer rail.
- The director has one focal video and participant position cards. Default
  director mode mounts only the focal feed; explicitly enabled multi-view can
  mount up to three additional compact first-party videos. The page starts no
  video until Play, and only refreshes stream discovery after viewer activation.
  Team composition defines positions, not the count of concurrent captured POVs.
- Captured display video faithfully reflects the broadcasting player's view.
  Fog of war and game-camera movement cannot be removed from encoded footage.
  Observer/fogless rendering requires a distinct lawful gameplay render source.
- `/admin/video-vault` and `/api/admin/video-vault` are admin-only read
  inventory surfaces showing actual chunk sizes for the latest sixty streams.
  This is a **bounded recent sample**, *not* authoritative total vault usage;
  old/orphan files are explicitly excluded. The guarded delete action is
  same-origin and requires an ended/failed, nonretained first-party stream.
  It removes only that stream's media chunks, then marks its stream registry
  removed. Active streams and retained demonstrations are protected.
- The existing Chaos Vote Lab remains explicitly browser-local and
  **non-binding**. A durable audited post-match spectator ballot, anti-abuse
  policy, and separate championship commission are future independent gates.
  A TV poll must never automatically transfer the Chaos Championship.
- No video upload ceiling or retention default is raised by this slice.
  Present defaults are 512 MiB/4,000 slices per stream, six-hour transient
  removal, and one explicitly pinned bounded demonstration. The real long-match
  recording quota, full-storage accounting, cross-stream concurrency admission,
  improved incremental playback, and packaged Windows/macOS canaries remain
  blocking V1 release gates.

### Release and canary requirements

Do not label the feature "two-player broadcast certified" until both Jim and
Zodiac (or two other authorized users) establish: distinct authenticated
owners, identical authoritative battle session identity, correct two-team
placement, playable video for both, replay-upload preemption, reliable
shutdown and content retention, and bounded CPU, memory, egress and storage.

Watcher 1.6.4 automatic capture is still **opt-in and unreleased**; do not bump
its package/version or publication workflow merely to activate this web branch.
The application feature must pass GitHub CI and protected production `finish`
before public release.

## Terminal recording and operator diagnostics (stacked development candidate)

Branch: `feature/television-v1-terminal-stream-contract-20261009`
stacked on the camera-director and Video Vault PR, **not** production.

The first-party video chunk API returns explicit, authenticated terminal
machine codes for a video reaching its configured per-stream byte/chunk quota
(`STREAM_STORAGE_LIMIT`, HTTP 413) and for a stream already closed
(`STREAM_ALREADY_ENDED`, HTTP 409). These responses supplement, rather than
change, the existing `STREAM_MEDIA_SHED` terminal backpressure contract.
Existing replay-final responses still signal `finality: replay_final`.
No video response can award a winner or mutate betting/WOLO settlement.

The matching unreleased Watcher development code reacts by terminating
**only its video capture** and explaining that normal replay monitoring
continues. It does not unboundedly retry quota rejections or masquerade as
a successful video upload.

The admin Video Vault now fetches a bounded recent sample (up to 180) of
authenticated Watcher stream-issue events scoped to the latest sixty
stream IDs. It exposes the latest issue's code, time, platform and
Watcher version, plus heartbeat freshness. Raw OS window titles,
paths, arbitrary messages and unbounded metadata are **never exported** as
operator summary fields. An incident is historical evidence, not a claim
that the stream is still broken. A complete unbounded historical diagnostic
database/report is still a future separate audit/retention gate.

Neither the page nor API treats these features as a packaged two-Windows-player
certification. Long-game full-disk quotas, streaming duration, adaptive
quality, and end-to-end viewer/capture telemetry remain unproven.

## Canonical battle-to-camera alias recovery (stacked development)

The live-game snapshot already groups replay identities with verified
`identityAliases`, original replay filenames and Watcher upload provenance.
Exact `/api/watch-streams?sessionKey=X` queries can miss another legitimate
player's video when their stream was originally started under a different
per-uploader replay key and the session was subsequently promoted to a
`platform:<match-id>` canonical identity.

The television page now carries the backend's **already-attached streams**
from `loadLiveGamesSnapshot` into the battle shelf. The
`loadStreamsBySession` and standalone-stream projections include a
server-selected owner Steam ID. The client merges those proven camera
attachments with periodic exact-session refreshes, deduplicated by numeric
stream ID, rather than inventing cross-match joins from streamer titles,
display-name similarity or arbitrary client-supplied aliases.

This is presentation authority only; it does not infer a winner, transfer a
championship, certify a replay hash, or grant betting eligibility.
The normal live-session grouping engine remains the sole authority for alias
membership. Old videos and removed streams remain subject to its existing
visibility/freshness rules. If no authoritative association is available,
the camera stays unavailable; never fabricate a participant's POV.

The frontend reuses its regular RSC battle-shelf refresh to discover late
arrivals while its viewer-initiated stream polling handles exact session keys.
The stream and team positions refresh independently: a player without video
still occupies the correct game position, if roster/team evidence exists.

The participant tiles deliberately report the actual media lifecycle:
`CONNECTING` before the first successful chunk, `VIDEO LIVE` only when
the authenticated first-party stream has recent heartbeat/chunk evidence,
`SIGNAL STALE` for an old transport, and `RECORDING ENDED` or `NO VIDEO`
after end. A bare database stream row can never claim to be broadcasting
successfully. Historical recordings are not relabeled as live.

This source implementation has not been validated with two physical Windows
recorders. Packaging, filesystem limits, actual network buffering,
source-window privacy and live simultaneous pairing remain explicit canary
requirements.
