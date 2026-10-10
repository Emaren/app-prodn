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

## Spectator bandwidth: hidden-tab suspension (development pass)

The first-party `LiveStreamFrame` rolling-WebM player is activated only
after the spectator explicitly presses Play. Once activated, it now pauses
its video element and stops polling both WebM windows and the stream
manifest whenever the browser document is hidden. It resumes by polling
the existing selected camera after `visibilitychange` returns visible.
The effect cleans up the event listener, interval and old browser object
URLs on unmount, including switching battles or camera identities.

This saves unproductive spectator CPU/network egress; it does **not**
alter a broadcaster's capture, store, replay priority, match identity,
video retention, settlement or championship rules. It does not yet
solve redundant *foreground* rolling-window downloads, independent
player-camera synchronization or viewer-side egress accounting.
Those remain future measured/adaptive transport gates.

## Admin broadcast readiness (stacked development)

The authenticated admin route `/api/admin/television-readiness` combines
the existing public/canonical live-battle session snapshot with its
server-proven live-stream attachment and team-resolution evidence. It
checks up to twelve active games, presents the actual participant and
camera breakdown, identifies unassigned first-party streams without
guessing their owners, and distinguishes `VIDEO LIVE` from connecting,
stale or absent video. Its result is read-only and carries no permissions
to control user desktops, edit an account, settle a result or award a belt.

The `/admin/video-vault` page now includes a Camera Readiness section
above its existing measured recording inventory. It polls only when
the operator's browser tab is visible and shows any missing or
unverified team/POV association explicitly. A missing player camera
is **not** automatically a Watcher defect; the person may simply have
left broadcasting disabled.

`VIDEO LIVE` requires recent stored media and heartbeat evidence, but
cannot certify live-decoded WebM playback on Jim/Zodiac's actual browsers;
that remains an interactive Windows player canary. This dashboard does
not promise arbitrary remote shell/debug access. It uses only already
authenticated, consent-respecting event data and canonical replay truth.

## Mounted video-volume headroom protection (stacked development)

A new video-only admission guard runs immediately before writing each new
stream chunk, after the existing per-stream byte/chunk limits and before the
atomic temporary-file/link operation. It checks `statfs` of the ACTUAL
`STREAM_STORAGE_ROOT` directory, preserving a configurable minimum of
6 GiB free by default (`AOE2_STREAM_MIN_FREE_BYTES`, validated in the
1–40 GiB range). If the filesystem cannot be checked or a new chunk would
breach the reserve, it fails closed as a `StreamStorageLimitError` and
the API returns the already-defined `STREAM_STORAGE_LIMIT` terminal
code. The unreleased Watcher honors the video-only stop; replay data
and financial authority remain separate.

The admin Video Vault exposes verified free bytes, reserved bytes and
remaining writable headroom for the video mount, explicitly reporting
unavailable storage telemetry. This does NOT yet enforce a global
10–12 GiB *total video inventory* quota and does not purge or truncate
old recordings. That future policy needs distinct retention eligibility,
cross-process coordination, operator pinning, tested archive manifests
and real volume-usage reconciliation. Operating below the reserve when
capture is configured on the small root filesystem is deliberate fail-closed
behavior, not an invitation to disable the guard.

Do not infer that video files are on the correct mounted volume merely
from a published path in a document; verify real host configuration during
the next guarded production capacity preflight before video activation.

## Mounted-volume video free-space reserve (development pass)

Server video writes are now admitted only when `statfs` verifies that
the **actual configured video-chunk filesystem** will retain the configured
free-space reserve *after* the next chunk. This is independent of the
per-stream 512 MiB / 4,000-chunk default caps, and supports concurrent
recorder sessions on the same volume. A failed capacity probe is treated
as video-only rejection, never permission to fill an unknown disk.

Configuration: `AOE2_STREAM_MIN_FREE_BYTES`, default **6 GiB** and
allowed range 1–40 GiB. Production video should live on the dedicated
mounted media volume using `AOE2_VIDEO_CAPTURE_DIR` (or explicit
`AOE2_STREAM_STORAGE_DIR`), not the small application root filesystem.
The operator must verify the effective runtime directory before activation;
a configured path that resolves to a root partition below reserve will
refuse new video chunks safely.

On the first terminal quota or free-space refusal, the chunk API ends the
video recorder row (without deleting previous chunks), responding HTTP 413
with `code: STREAM_STORAGE_LIMIT`, `terminal: true` and one of the
machine-readable `reason` values `stream_max_bytes`,
`stream_max_chunks`, `volume_reserved_floor`, or
`capacity_unverified`. The matching unreleased Watcher then stops video
for that game but continues normal replay monitoring. This deliberately
does **not** confer winner, betting, rating, or Chaos title authority.

The admin `/api/admin/video-vault` response exposes measured free bytes,
configured reserve, and estimated writable bytes above the floor; unknown
space displays as unavailable, not as 0 or unlimited. The policy is
**fail-safe but not a global reservation/quotas engine**: capacity may
change between its check and write, including writes from unrelated
services and parallel server processes. Before a public rollout, prove
mounted-volume settings, I/O load, disk-full handling, bounded retention,
and total multi-camera/long-game resource use in production-like canaries.
No automatic deletion of captures, replays or DB snapshots is authorized.

## Correct wire parsing for binary chunk uploads (development pass)

The native/browser WebM chunk endpoint now treats a missing HTTP
`Content-Length` as valid for a streamed/chunked request. An explicitly
malformed, zero, fractional or too-large declared length is rejected; the
actual request body remains bounded to 8 MiB whether the header exists or
not. This avoids phantom HTTP 413 errors from valid transfer encodings.

Every chunk now **requires an explicit, canonical decimal sequence** in
either `sequence` query string or `x-stream-sequence` header. Missing,
empty, negative, exponent, noncanonical or mismatched query/header
sequences fail closed with HTTP 400. In particular, absent sequence
may **never** be confused with zero, the WebM initialization segment.
The existing authenticated stream owner, status, MIME validation, immutable
sequence conflict and video reserve controls remain in force.

Boundary tests exercise valid/invalid headers, both sequence transports,
disagreements and the existing post-read byte fence. No replay or financial
authority is affected. Windows game/installed-client canary remains required.

### Invalid first-party video segment failover

In addition to video quota/volume terminal signals, WebM chunk upload
rejects explicitly oversized/malformed media bodies with HTTP 413
`STREAM_CHUNK_TOO_LARGE` and unsupported `Content-Type` with HTTP 415
`STREAM_FORMAT_UNSUPPORTED`; both mark `terminal: true`. The server
best-effort ends the refused video session, preserves previous chunks, and
still sends a terminal media signal if that status write fails. The
unreleased 1.6.4 Watcher stops only video and explains to the player that
replay/game monitoring continues. There is no silent upload retry loop
for payloads that cannot become valid by retrying unchanged bytes.

### Streaming reader memory ceiling

The chunk endpoint no longer calls `Request.arrayBuffer()` on an
untrusted transfer before size verification. Instead it iterates the
WHATWG request body with a bounded reader and aborts at the first
byte past the 8 MiB frame limit. Empty requests reject; valid transfers
without `Content-Length` are still accepted; the exact raw body cap
is enforced regardless of the declared length. Temporary transport
interruptions return a retryable 503 distinct from the terminal
`STREAM_CHUNK_TOO_LARGE` 413. Previously committed media chunks are not
modified or removed by either case.

This is *per request*, not a complete VPS-wide CPU/egress concurrency
budget. Multi-camera load testing and site-level video admission remain
separate certification requirements.

## Battle-cohort retention preview (development, not automatic deletion)

The authenticated Broadcast Readiness endpoint includes a read-only
last-two-completed-battle camera inventory derived from the existing
canonical replay session grouping. The server counts only videos already
attached to that battle and account-linked to an exact roster Steam ID.
No name, map, filename or timestamp similarity matching is introduced.

Each of up to two newest distinct completed battles with authenticated ended Watcher footage shows expected players,
recorded POVs, exact stream IDs, missing perspectives and match/team proof.
A complete_candidate means the projected battle has all expected POV records;
it does NOT establish actual on-disk video bytes, playback, or stable retention.
Active, empty, anonymous or external streams do not satisfy completeness.

Retention automation is disabled. Existing six-hour ended-video cleanup, the
independently protected single-demo slot, and guarded admin deletion remain
unchanged. Actual last-two-complete-games preservation still requires a durable
canonical battle identity on every camera, on-disk byte/sequence proof,
a total-volume budget, transactional cohort lifecycle, and restart canaries.
Never discard one player's viewpoint while claiming to have kept a game.

## Bounded on-disk WebM sampling (read-only admin audit)

Building on the canonical completed-battle retention preview, the admin
readiness endpoint now checks up to 32 associated native Watcher video
streams across the two latest candidate battles. Each inspection performs
at most two file metadata checks and reads exactly four bytes of the first
segment, verifying the expected EBML magic for a WebM initialization
segment. It reports samples_present, missing_samples, invalid_webm_header,
invalid_metadata or probe_error for each exact stream ID. Errors never
expose private absolute filesystem paths in the JSON response.

This is deliberately partial evidence: successful checks cannot prove
all intervening chunks exist, form one playable media timeline, have
correct timestamps or remain available after future retention cleanup.
No video decode, full video reads, recursive directory scan, media
restoration, file deletion or remote workstation inspection occurs.
The existing storage guards, automatic pruning and one-demo slot remain
unchanged. A durable complete-game media archive still requires a
governed per-battle storage model and integrated long-match playback canaries.

## Two-player long-game storage capacity preflight (operator estimate)

The administrator's Video Vault now forecasts a **two-player, 120-minute**
broadcast using an explicitly illustrative 1.4 Mbps per camera plus a
15% recording allowance. It compares required per-camera storage with
the live configured `AOE2_STREAM_MAX_BYTES`, and both-camera storage
against the actual available bytes above the `AOE2_STREAM_MIN_FREE_BYTES`
mounted-volume reserve. Unknown capacity fails the readiness estimate.

This deliberately catches a likely first-canary failure: the historic
512 MiB **per-stream** default may terminate a 120-minute recording long
before the match finishes, even with a large mounted volume. The current
configured cap is displayed alongside a conservative estimated duration.
The forecast is a *plan*, not live quality proof: it does not automatically
raise limits, write environment configuration, extend retention, measure
encoder bitrate or authorize concurrent uploads. A green estimate must
still be paired with proof of the effective media volume, WebM bitrate,
actual Windows Watcher capture and two browser viewers.

The server's existing quota and free-space reserve remain binding.
Before any pilot, an operator should use the preflight to review the
2 GiB upper supported per-stream cap, 6 GiB volume reserve, multi-camera
footprint and six-hour pruning behavior. No proposed default change is
automatically deployed.

## Wolo TV V1 two-Windows-player canary gate

**Status: planned, NOT executed or certified.** This is an operator-only
acceptance runbook for a prearranged Jim/Zodiac/Teki/Scavenger-style game;
players should not be asked to diagnose developer tools or supply private
screenshots. Keep Watcher 1.6.3 users undisturbed until the new version has
passed package signing, dependency security and intentional update gates.

### Hard gates before inviting players

1. Confirm the chosen site release passed protected `finish --dry-run`,
   `finish`, Doctor and post-deploy audits; verify the deployed commit
   really contains the camera director, stream endpoints and admin controls.
2. Confirm an actual **signed and authenticated** Windows 1.6.4 installer
   and update path is approved. Successful unsigned CI packaging proves
   contents only; it is not installed-window-capture certification.
3. Confirm the WebM directory resolves to the intended mounted media volume
   (not the small application/root filesystem), measure free bytes and leave
   the configured reserve intact. Review Video Vault's two-hour capacity
   forecast and adjust operator-owned environment caps only through the
   protected configuration/release process, never a blind ad-hoc change.
4. Confirm both users have distinct verified site accounts/Steam ownership
   and voluntarily enabled game-only video. Do not silently broaden consent
   to a browser, desktop, audio input or remote-control session.
5. Confirm Watcher replay upload still has higher scheduling/CPU priority
   than video and that neither stream changes game-result or betting authority.

### Healthy match acceptance sequence

| Stage | Required observable evidence |
| --- | --- |
| Pre-game | Both Watchers online, consent enabled, capture window recognized without desktop fallback; no video begins on a launcher |
| Start | Exactly one canonical live battle in admin readiness; actual roster/teams shown only when replay authority resolves them |
| First media | Two distinct server-issued stream IDs, first chunks, recent heartbeat, matching authenticated Steam owners |
| Playback | Main theatre plays a selected POV in an independent viewer browser, camera switch moves to the other POV, unrelated team tiles do not impersonate cameras |
| During game | Game remains responsive; record CPU/memory impact, chunk upload latency/retries, viewer delay/buffering, chunk continuity and total bytes |
| End | Both captures stop from real observed finality, no repeated auto-start for the same game, replay uploads/final result continue independently |
| After | Video Vault and sample probes distinguish saved/missing footage; no false claim of complete game retention or automatic Chaos title transfer |

### Fail-closed negative controls

- Unrecognized AoE2 window or declined capture permission: video waits,
  local message is actionable, **no browser or desktop substitute**.
- One missing/offline player POV: show a waiting/unassigned camera position;
  the other player's video and replay watcher continue.
- Bad codec, oversized chunk, per-stream quota, low media-volume headroom:
  stop **video only** with a precise terminal reason; never retry identical
  invalid media forever or delete an existing replay.
- Partial networking failure or offline browser: reconnect/standby without
  inventing a live signal, cross-attaching another battle, or continually
  consuming background-tab egress.
- Unexpected completion/identity conflict: withhold definitive teams,
  winner, vote result and camera attribution until canonical evidence proves
  them. Do not use similarity of display names as proof.

### Certification receipt and stop rule

An operator acceptance receipt should record exact site and Watcher SHAs,
signed package identity, both platforms/OS builds, canonical game key,
stream IDs and their Steam ownership, capture profile, two-hour capacity
forecast, measured CPU/RAM, upload/media error codes, viewer buffering,
replay finality and on-disk media samples. Collect only consented,
privacy-sanitized diagnostics, never arbitrary game-window images.

**Stop the broadcast canary** on unapproved desktop pixels, replay
interference, unstable game performance, wrong-player camera attribution,
uncontrolled server storage or security-gate bypass. Capture metrics and
return to development; no false 100/100 declaration. The two-user pass
must be verified on actual Windows hardware and a separate viewer.
