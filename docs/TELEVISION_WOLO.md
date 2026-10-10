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
  inventory surfaces showing metadata for the latest sixty streams. Exact
  byte sizes are deliberately limited to eight recent smaller streams to avoid
  overwhelming the VPS during multi-POV capture. This is a **bounded recent
  sample**, *not* authoritative total vault usage;
  old/orphan files are explicitly excluded. The guarded delete action is
  same-origin and requires an ended/failed, nonretained first-party stream.
  It removes only that stream's media chunks, then marks its stream registry
  removed. Active streams and retained demonstrations are protected.
- The existing Chaos Vote Lab remains explicitly browser-local and
  **non-binding**. A durable audited post-match spectator ballot, anti-abuse
  policy, and separate championship commission are future independent gates.
  A TV poll must never automatically transfer the Chaos Championship.
- No video upload ceiling or retention default is raised by this slice.
  Earlier development defaults were 512 MiB/4,000 slices per stream; the current
   *development branch* uses 3 GiB/12,000 slices, with six-hour transient
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
per-stream byte/chunk limits (now 3 GiB / 12,000 by default in the
  *unreleased long-match development branch*), and supports concurrent
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

## Last-two-cohort physical video inventory (read-only)

The authenticated Admin Video Vault readiness endpoint now performs a bounded
on-disk audit of the canonical battle/POV candidates identified above.
It reads only chunk directory entries and filesystem stat metadata, never
video payload bytes or replay contents, and makes no filesystem/database writes.
Per POV it reports actual chunk count, bytes, initial/last sequence,
missing sequence count and server registry count/last sequence.

Only contiguous, nonempty segments numbered 0 through the final sequence
with matching registry counters receive sequence_complete. Missing initial
segments, gaps, empty/missing directories, zero-size chunks, unreadable entries
and overlarge scans report distinct fail-closed states. This NEVER proves that
WebM decodes, the entire match was recorded, who won, or that a complete archive
has been safely retained.

The audit is bounded to 16 streams, 5,000 filenames per stream, two concurrent
stream scans and 64 concurrent file-stat operations per stream. Results are
cached for 60 seconds and can lag cleanup; missing/omitted streams remain
explicit. The existing six-hour age-prune, independent retained demo,
and admin deletion behavior are unchanged.

The preview uses the existing transient recently-completed game window, NOT a
historical inventory of all battles. Last-two-game automatic preservation
remains DISABLED until durable canonical cohort identity, disk budget,
groupwise custody, and actual Windows playback canary have been proven.

## Two-hour recording capacity contract (unreleased development)

The first-party native Watcher development branch currently records
one-second WebM chunks. Its reviewed quality presets are Stable 720p
15 fps at 1.4 Mbps, Full Screen 720p 18 fps at 1.8 Mbps and Sharp
720p 24 fps at 2.6 Mbps. The prior server defaults (512 MiB and
4,000 chunks) could cut off Stable mode at under an hour.

In this development branch, default per-stream admission is raised to
**3 GiB and 12,000 chunks** (roughly 3h20m by chunk count), retaining
the existing configurable server-side caps, the 6 GiB media-volume free
reserve, 8 MiB maximum per HTTP chunk and six-hour unprotected retention.
The application now enforces a configurable hard per-stream maximum of **4 GiB**
(default **3 GiB**), without automatically deleting videos or changing deployed
limits until a guarded release. A larger per-POV cap is never a total-volume
reservation: concurrent cameras remain subject to the verified free-space floor.

The authenticated Video Vault's capacity planner reports safe estimated
minutes and two-hour projected bytes for each Watcher mode, using a
**12% media-container overhead allowance**. All three modes have
*estimated* per-stream capacity above two hours at the new 3 GiB default,
including Sharp. No captured, decoded two-hour Windows run is yet certified.
These are planning calculations rather than promises of WebM output
quality or a long-running captured game. The selected preset, CPU/GPU
encoding, actual chunk size, host write speed, upload retry backlog,
and network throughput still require a real Windows canary.

Do not activate longer capture unless the runtime video directory resolves
to the intended spacious mounted volume, not the small VPS root partition.
If media bytes exhaust any quota or the volume reserve, only video ends;
replay monitoring, betting eligibility, wallet balances and game result
authority remain unchanged.

## Camera selector state isolation (development)

Camera tiles can display already-public, server-proven Watcher feed metadata
before the spectator presses Play; no WebM is downloaded until explicit
viewer activation. Once a battle is playing, exact-session polling augments
only that selected game's canonical stream aliases. Switching to another
battle drops the prior game's poll results from its available camera list
immediately, without waiting for a React effect. The bottom manual camera
selector uses this same filtered list instead of an incomplete exact-key
stream array. This prevents another game's feed from temporarily appearing
as the selected game and preserves late-arriving alias-matched player POVs.

This is a frontend ownership/read-model fix, not independent gameplay,
video decode, replay result or spectator voting authority.

## Chaos of the Match — durable spectator ballots (unreleased migration)

The prior Television Vote Lab was only browser-local. The new draft
`/api/television/chaos-ballots` GET/POST contract records a non-binding
popularity vote against a **final GameStats ID and its roster hash**.
The ballot's two foreign keys delete only the associated ballots when an
account is erased or its replay record is legitimately deleted, rather than
blocking erasure or replay cleanup. The dedicated `television_chaos_ballots` table has a unique
(game_stats_id, user_id) constraint and a stable nominee key; it has no
relation to trophy events, commissioner permissions, title payouts,
WOLO wallets, betting settlement or replay winner adjudication.

Only the canonical recently-completed session shelf may supply a GameStats
ballot ID. Older lobby/archive tiles use IDs from other sources and must
not be substituted for final replay IDs; until a durable replay linkage
is independently proven those tiles remain watch-only, not voteable.

Eligibility is server-decided: replay marked final, an authentic
watcher-source parse, valid 64-hex replay hash, two to eight distinct
players with resolved replay team evidence, and a recorded game time
within a provisional **72-hour postgame voting window**. This initial
window is a product policy subject to review before launch. Closed
polls remain readable and preserve their tallies; no late submissions.
Anonymous visitors may view candidate tallies but must sign in to vote.

POST requires a signed session, same-origin browser request, JSON
content type, 2 KiB bounded body, and exact nominee stable key belonging
to the current authoritative roster. First successful ballot wins; a
repeat with the same nominee returns idempotent confirmation, a different
choice receives HTTP 409. Concurrent double submissions are rejected by
the database unique constraint. Changes to roster proof cannot silently
reassign votes: counting is scoped to the saved roster hash, so older
ballots with obsolete roster hashes remain in storage but do not count
under a changed roster.

The Television page no longer implies fake click votes are recorded.
For live or roster-incomplete games it explains why ballots are not
open. Vote tallies refresh every twenty seconds while the spectator's tab is
visible; hidden tabs do not poll, and out-of-order replies cannot replace
newer results. For eligible completed games it shows current counts and the
signed-in account's recorded choice. Every result remains explicitly
NON-BINDING and cannot automatically confer the Chaos Championship.

**Deployment governance:** this feature introduces a Prisma schema
migration. Do not deploy it piecemeal: the protected release process must
first validate and apply migration
`20261009190000_television_chaos_ballots` using its existing documented
DB-migration procedure, confirm backup/rollback readiness, then activate
application code. No automatic production migration, title transaction,
and no changes to installed Watchers are authorized by this draft PR.
Test finality boundaries, duplicate and concurrent votes, forged nominees,
identity/roster changes and a real account canary before opening voting.

## WebM initialization and long-match byte auditing (development gate)

The reviewed on-disk inspector `lib/televisionMediaAudit.ts` now
reads the first **four bytes** of sequence-zero `0.webm` only when
all expected numeric sequence filenames are present, to confirm the
WebM EBML initialization signature `1A 45 DF A3`. A sequence that
has perfect file numbering but a non-WebM initial segment is
`invalid_webm_header`, **not** `sequence_complete`. An archive
containing only the first initialization segment is insufficient
evidence of video. This test never decodes or republishes player video.

The earlier detailed audit scanned and stat-ed at most **5,000 files**
per POV. With the unreleased 1.6.4 Watcher's approximately one-second
media slices, two-hour matches can contain about **7,200 chunks**.
The scanner now separates two policies:

- **Up to 5,000** video slices: detailed bounded file-size accounting,
  exact DB-vs-files count and sequence checks, and WebM initialization
  verification.
- **5,001–20,000** slices: check all numeric sequence names for gaps,
  compare last sequence and count with the stream registry, inspect
  only the first and last file metadata and first four header bytes,
  and report `sequence_sampled`. Actual total bytes remain **unknown**
  in this mode, not misleadingly calculated from two sampled chunks.

More than 20,000 media files results in an explicit `scan_limited`
status. All modes remain administrator-only, read-only, 60-second
in-process cached, with at most sixteen unique cameras and two
concurrent inspector calls. A passing sequence/header inspection
proves neither playable video, continuous capture, reliable timing,
integrity of every chunk, nor a saved whole battle. No video files,
gameplay identity, results, championship custody, user desktop or
WOLO accounting are changed by this check.

Physical Windows two-broadcaster WebM and browser playback canaries
remain the release evidence requirement. This addendum supersedes
the earlier statement that the physical media inspector reads no WebM
payload bytes: it now reads only the four-byte initialization prefix.

## Long-match ingestion cost control (development, code review gate)

The video upload writer previously called an exact, serial, whole-directory
`getStreamStorageUsage` on **every** one-second Watcher chunk. For a
7,200-chunk game, that repeats filesystem metadata work roughly
proportional to the square of the stream duration and can affect
replay-priority scheduling on a small VPS.

The new normal write path uses an in-process stream-usage cache bounded
to **128 stream IDs**, containing only the last filesystem-validated count,
byte total and latest chunk sequence. On every new write it compares the
video directory's device/inode and nanosecond mtime/ctime. The first
write after process restart, unexpected directory mutation, or at least
five minutes since the last full check performs a fresh authoritative
filesystem reconciliation. Manual admin deletion invalidates the
corresponding cache. Normal writes still enforce the configured per-stream
byte/chunk caps and perform a fresh mounted-volume free-space check
**on every admitted chunk**. Persistent video data remains unchanged.

Exact reconciliation now processes file stats in batches of at most 64
instead of serial individual awaits. We retain hard-link-only immutable
sequence admission and conflict detection, and do not add sidecar indexes,
database migration, local file paths in public responses, or arbitrary
remote administration.

**Boundaries:** this is an amortized within-process optimization, not a
cross-process transactional storage ledger. Independent Next.js workers
writing concurrently to the *same* stream could race between a directory
check and publication, as under the previous filesystem implementation.
The directory fingerprint and periodic rescan detect and correct later
changes, but do not replace a distributed lock or a durable database
per-chunk manifest. Before scaled multi-worker production we need an
explicit cross-process concurrency canary, and if necessary a
transactional server-side accounting authority. The current deployment
must also demonstrate an actual mounted video volume with enough free
space above the 6-GiB reserve, two Windows Watchers, no replay-upload
regression, and measured upload p95/CPU/IO before this optimization is
considered performance certified.

## Integrated V3 resilience candidate (2026-10-10)

Unreleased integration branch: `feature/television-v3-integrated-hardening-20261010`.
The native Watcher branch is reviewed separately; neither web source nor
Watcher UI work grants a production release or a measured quality score.

- Public feed-directory database failure is **503**, never a false empty camera
  inventory. The Television page can retain authoritative snapshot-linked
  cameras while the directory is unavailable.
- Once the viewer presses Play, the directory refreshes every 12 seconds while
  the browser tab is visible. Requests are serialized, abortable and invalidated
  when the viewer changes battles; a transient failure preserves the last
  cameras. The manual refresh does not change the selected perspective.
- Read-only public video diagnostics show bounded server-owned stream metadata;
  a recorded chunk or recent heartbeat proves neither successful browser decode
  nor low presentation latency. Full incident detail and controls remain admin.
- The adjusted 3 GiB/12,000-slice default (4 GiB configurable maximum)
  protects two-hour Sharp budget estimates while retaining the **6 GiB actual
  media-volume free-space reserve**. This does not guarantee eight concurrent
  perspectives, 2-hour real encoded file sizes or non-root storage until a
  mounted-path verification and multi-camera canary succeed.
- The source gate remains: real paired Windows broadcasters, verified two-side
  replay identity, safe update/relaunch, replay-upload priority, observed
  sustained bitrate/CPU/IO/latency, full WebM playback and explicit cleanup.
- Chaos ballots remain non-binding with protected migration; comments and
  Commissioner title awards require their own audited authority.

### Pre-start mount and quota admission (V3 development)

Video startup now verifies the **actual configured stream directory** exists,
can report media-filesystem free space, has headroom for one full configured
per-POV byte quota *above* the six-GiB reserve, and in production resides
on a filesystem with a device ID different from the application root. The
operator must pre-provision the directory on the mounted media volume before
turning on capture. A stray directory on the small VPS root is **not** an
acceptable replacement for the mounted volume.

The authenticated stream-start endpoint rejects an unsafe volume with a
redacted, machine-readable `STREAM_VIDEO_VOLUME_NOT_READY` HTTP 503 **before**
ending an existing stream or creating a new capture record. This is a
video-only guard: replay watching, stored gameplay truth, wagers and WOLO
remain untouched. The admin Video Vault displays verified separate-volume
status (yes/no/unverified) alongside actual free bytes and cap planning.
The start-time headroom check is **not** a global reservation or distributed
admission lock. Live chunks retain the independent per-write free-space guard.

This change needs an actual VPS mount/inode check and a signed Windows canary;
unit tests cannot establish that the desired host directory is mounted.

### Atomic stream replacement (V3 development)

After mounted-capacity admission, an authorized new stream now completes
the prior-session end, new registry row, manifest identity and primary-camera
selection inside **one database transaction**. A failed insert/update rolls
back the prior stream's termination rather than stranding the broadcaster.
This does not yet serialize separate simultaneous start requests from the
same user across multiple web workers; multi-worker races remain an explicit
release-canary and database-admission follow-up.

### Bounded operator disk accounting (V3 development)

The 60-row admin Video Vault listing is a **database metadata inventory**,
not permission to scan 60 long recordings on every dashboard refresh. The
revised filesystem byte audit selects at most eight newest candidates with
no more than 5,000 reported media chunks each. Those exact measurements are
processed at **two concurrent directory scans maximum**. Other streams show
byte size as **unknown**, not zero; `measuredRows` exposes this distinction.
The newest-two-battle physical media inspector independently provides
read-only sequence/EBML sampled evidence for longer streams.

Even this bounded operator inventory is not a global storage-quota ledger,
full video retention proof, browser decode certificate, or live-root
performance measurement. The operator must prove physical IO/p95 video
latency against concurrent recording and replay traffic in a field canary.

### Exact replay-to-camera attribution (V3 development)

The Watcher now sends an explicit current session/replay claim on capture
start and heartbeat, and never uses a local absolute SaveGame filepath as a
public session key. An account's most recent replay **must not** substitute
for evidence of the game being captured: a previous game can remain recent
for hours, so recency-based binding risks showing footage against the wrong
battle, roster, and Chaos ballot.

Native video admission now promotes a client claim to a public session only
after a server-side `game_stats` lookup proves the exact original replay
filename, saved replay filename, or platform match ID belongs to the
**authenticated Watcher account**. A direct `platform:` ID cannot bypass that
check. Otherwise the stream remains a unique weak `watcher:session_...`
record with no proven competitive association.

An already-started weak stream can be promoted on heartbeat when a later
account-owned replay record proves the exact claim; until then it remains
unassigned, never automatically attached to a named competing roster.
This may briefly defer camera placement while gameplay/replay evidence arrives;
it is intentionally safer than false identity claims. Tests forbid the
previous 45-minute/4-hour "newest replay" fallback.

This gate does not certify real-time discovery or cross-worker atomic
rebinding. A physical two-client test must prove start-before-replay,
late identity promotion, matched POV owner, and absence of last-game
cross-contamination.

### Browser playback deadline and hidden-tab egress (V3 development)

The public first-party WebM player now gives each manifest read a bounded
eight-second network/body deadline and each rolling WebM download a
fifteen-second network/body deadline. A timed-out, stalled response returns
control to the existing signal recovery loop; it cannot hold
`pollInFlight` indefinitely after HTTP headers are received. The player
aborts outstanding media reads when the browser tab is hidden or a selected
camera is unmounted, and declines late-arriving bodies after either event.
A hidden tab does not silently keep downloading video.

These are client-side failure bounds, not claims about delivery latency,
video quality, frame drops, network load-balancer failover or an end-to-end
Windows two-broadcaster canary. Real first-frame timing, continuous decode
and reconnection remain field certification gates.

### Empty-to-live Television discovery (V3 development)

A viewer may visit the theatre before any canonical live session exists.
Foreground-only server snapshot refresh discovers a later match, and the
new first battle is **selected** even when the previous session selection
was empty. This does not authorize autoplay or network video downloads:
the viewer still presses Play. Its selected key is then consistent with
the late broadcaster's directory-refresh loop; a stale empty key can no
longer prevent new POVs from appearing after the viewer has pressed Play.
