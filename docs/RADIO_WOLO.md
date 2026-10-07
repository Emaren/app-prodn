---
id: "aoe2war.app-prodn.docs-radio-wolo"
title: "Radio WOLO"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-10-07"
review_interval_days: 90
sensitivity: "internal"
---

# Radio WOLO

## Purpose

Radio WOLO is the cultural broadcast wing of AoE2WAR. `/radio` exposes only tracks explicitly published by an operator. `/submit` is a durable creator intake for original community music, event themes, premieres, and future programming.

## Submission and rights

The form collects artist, title, genre/mood, private email, optional Discord, audio, optional artwork, notes, and an explicit rights checkbox. The accepted statement grants AoE2WAR a non-exclusive, revocable permission to store, review, stream, and promote the submitted work. Copyright remains with the rights holder.

Private operator Vault audio is limited to 250 MB per track; public creator submissions remain limited to 60 MB. Audio is validated by magic bytes as MP3, WAV, OGG, or M4A. The private Vault accepts loose audio, bounded standard ZIP batches, explicit folder selection, and recursive folder drag/drop in supported desktop browsers. Folder intake walks nested directories, ignores unsupported clutter such as lyric text files and Finder metadata, and sends every supported audio file or ZIP through the same canonical intake path. ZIP intake likewise ignores non-audio entries, expands each supported audio entry into its own RadioAsset, reads that track's duration independently, preserves duplicate protection by SHA-256, and uploads tracks through the same canonical asset endpoint. ZIP64, encrypted entries, unsupported compression methods, oversized tracks, malformed directories, unsafe expansion totals, and unbounded folder counts fail closed. Artwork is limited to 8 MB and validated as PNG, JPEG, or WebP. Extensions and browser MIME labels are not trusted by server storage. Original filenames are sanitized; stored files use random keys plus a SHA-256 prefix. Failed database writes remove partial files.

Private Vault intake is deliberately zero-configuration on the current catalog. The default profile is **Lord Molyneaux · song · lord_molyneaux, suno** and is shown as one compact summary rather than three required fields. Operators can expand **Change** when needed; the last profile is remembered locally. When the operator has not manually customized the profile, obvious Suno folder/archive names such as `lord-molyneaux [usesuno.com] part-01-of-18.zip` may refine the artist and source tags automatically. Bulk intake applies the resolved profile to every discovered track. BUILD search plus **Add filtered** assembles a complete rotation without clicking hundreds of tracks individually. **Fill target** adds filtered tracks in order only until the selected program reaches its configured target duration, which is the fast path for a dedicated one-hour player show.

Radio program chains are unique by canonical `RadioAsset.id`. The BUILD surface treats bulk programming as idempotent: **Add filtered** and **Fill target** only add filtered assets that are not already present, individual Vault rows become visibly unavailable once added, and every client-side chain mutation is normalized back to one occurrence per asset. Legacy draft chains that predate this rule expose an explicit duplicate-clean action which preserves the first occurrence and its transition settings. Draft cloning also canonicalizes the name to a single `— Draft` suffix. Switching between programs is guarded when lineup or metadata edits are unsaved, and program selection does not retrigger the full Vault/station bootstrap fetch.

Uniqueness is enforced again at server boundaries rather than trusting the browser. Program-item writes reject duplicate asset IDs, a program cannot become **READY** unless it has at least one playable READY Vault asset with no duplicate asset IDs, and transmitter launch independently refuses legacy duplicate lineups. Therefore READY means launchable under the same core asset invariants used at ON AIR time. No database migration or second playlist truth is introduced.

The intake allows at most three submissions in a rolling day for the same contact email or signed-in user. Publication is never automatic.

## Privacy and publication

`RadioSubmission` stores private contact, rights version, file metadata, storage keys, review status, scheduling, and publication time. Public track routes require `status=published`. Admin review media routes require an admin session and return `private, no-store`.

`/admin/radio` lets operators listen privately, inspect contact and rights metadata, add notes, schedule, feature, approve, publish, or decline. Changing to `published` sets a publication timestamp. Private contact and admin notes are never selected into the public station response.

## Durable storage

Production defaults to:

`/mnt/HC_Volume_105319120/aoe2-radio-wolo`

`RADIO_WOLO_MEDIA_DIR` may override the root. The web service user must own the directory. Expected layout is `submissions/audio/` and `submissions/artwork/`, with directories mode `0750` and files mode `0640`. This is private application media, not a public nginx or symlink tree.

Back up the database and this directory together before destructive maintenance. Database metadata without the media directory is incomplete; files without their database rows must not be published by filename guessing.

## Global listener contract

The generated Imperial blue UI is the default Radio WOLO miniplayer face.
Image-based Mini I-IV remain optional presentation faces and may evolve
independently.

Radio WOLO is a live broadcast, not resumable local media. Listener controls
therefore communicate **sound on / sound off**, never pause/resume. Turning
sound back on joins the authoritative current station position rather than
resuming an old local timestamp.

An ON AIR program is a continuous station rotation. Its immutable program
timeline loops until an operator explicitly presses Stop Transmission. The
station clock exposes the current loop cycle while track identity, track offset,
track duration, NEXT, media authorization, and rating authority continue to
resolve from the same canonical program items. Reaching the end of the last item
does not make the station go off air; NEXT wraps to the first item. No database
migration or second playlist truth is introduced.

Desktop Radio WOLO playback is intentionally persistent across ordinary
backgrounding. Changing browser tabs, changing windows, foregrounding Steam,
foregrounding Age of Empires II, or working in another desktop application must
not itself stop an active broadcast. The originating AoE2WAR page keeps listener
intent and remains attached to the authoritative station clock until the listener
selects Sound Off or that page/browser lifecycle actually ends.

iPhone/iPad WebKit retains the aggressive foreground teardown. On iOS-like
WebKit, hidden/pagehide lifecycle synchronously drops listener intent, cancels
volume ramps, pauses and detaches audio, resets media identity, and clears
best-effort Media Session state. This protects installed-PWA audio from wedged
background sessions without weakening desktop persistence.

### Media readiness boundary

Radio WOLO may refresh station metadata before the listener chooses Sound On,
but an idle global player must not consume audio bytes. Until listening intent is
true, the client does not bind the authoritative media URL to `audio.src`, does
not select eager preload, and does not call `audio.load()`. Sound On (or an
explicitly supported autoplay intent) establishes listening intent first and then
applies the current authoritative station anchor.

This is a performance and coexistence contract, not a change to Radio truth. The
station clock, asset identity, feedback eligibility, and signed/anonymous listener
semantics remain authoritative exactly as before; only unnecessary idle media
transfer is deferred.

## Listener signals and ratings

Each browser receives a random persisted Radio WOLO listener UUID. This is not a
fingerprint and is not derived from IP address, user agent, hardware, or other
cross-site identifiers. When a signed session exists, listener signals are also
associated with that AoE2WAR user.

Traffic is the authority for passive human browser presence. Its persisted
`traffic_visitor_id` and per-session `traffic_session_id` supply the Command
Tower Radio WOLO pane with real AoE2WAR browser rows, visit counts, current page,
and recent presence. The Radio subsystem enriches those rows with product-specific
signals. This keeps a real visitor visible as Sound OFF even when they never touch
Radio WOLO, without manufacturing a Radio listener record for every page load.

Radio listener state records Sound On, Sound Off, the most recently observed
authoritative RadioAsset, the Traffic correlation IDs when available, bounded
heartbeat timestamps, durable interaction state, and whether sound has ever been
turned on. Opening or operating the player records interaction; volume/player
controls count as interaction; Sound On is separately durable; ratings remain
separately durable. A globally mounted silent player does not create Radio state.

Admin analytics treat Sound On as live only while the stored intent is on and its
heartbeat remains fresh; an expired heartbeat fails closed to OFF. Traffic rows
classified as owner/operator, known automation, crawler, known cloud browser, or
other nonhuman traffic are excluded from the human pane. Speed OS browser harnesses
also stamp `X-AoE2WAR-Synthetic`; Traffic and Radio reject those writes before
they enter human analytics.

The bold visit multiplier shown in Command Tower is based on distinct persisted
Traffic sessions rather than page requests, IP address, or fingerprinting.
Clearing site storage or changing browsers/devices creates a new anonymous browser
identity. The private admin intelligence rail asks Traffic for both the recent
human cohort and durable all-time repeat visitors, so a frequent visitor does not
disappear merely because they signed off today.

The private rail resolves authenticated browser identities back to one AoE2WAR
account row and combines visit totals across that account's known browser visitor
IDs. Anonymous browser identities remain separate. Ordering is intentional:
currently active people are always pinned first; the remaining member identities
and anonymous visitors with at least five visits form a descending visit
leaderboard; low-frequency anonymous visitors then fall back to last-seen
chronology. Operator/owner identities may appear in this authenticated private
admin view even though ordinary human analytics continue to exclude them.

Traffic also supplies a bounded recent page-view trail for each returned browser
identity. Expanding a row reveals those routes grouped by browser identity and
visit/session so a deduplicated account never invents arrows between separate
devices or visits. The active browser and current page receive the live beacon
when presence is fresh. The drill-down is presentation over Traffic's first-party
browser/session evidence only; it does not expose arbitrary payload JSON, IP
history, or create a second visitor identity system.

Radio state remains an enrichment rather than presence authority. A stale
listening heartbeat still means Radio is not live now, but historical Sound On is
durable: the admin row renders that state as previously used rather than implying
the listener never enabled sound. Interaction and rating history are likewise
combined across deduplicated signed-in account rows.

Track ratings are integers from 1 through 10. The global player presents one
emoji-star face only; the old Icons/Emoji presentation toggle and explanatory
"click another star" copy are retired. There is no submit step: clicking a star
immediately saves or replaces the listener's rating. Signed-in ratings are
canonical per AoE2WAR account and RadioAsset; anonymous ratings are canonical
per random browser listener and RadioAsset.

Rating truth is loaded only while the global player is expanded, because that is
the only mode in which the rating controls are usable. Dormant and compact modes
do not emit an initial Sound Off write merely because the global player mounted.
Passive visitors still appear in Command Tower through Traffic. Once playback
actually begins, the client reports Sound On/Off transitions, heartbeat, pagehide
teardown, and Admin listener intelligence. Player interaction can write a compact
interaction signal without changing Sound state. Invisible rating controls still
do not issue the rating GET.

The client never supplies the RadioAsset being rated as authority. The feedback
endpoint resolves the currently airing asset from RadioStationState and the
authoritative program clock before writing a rating.
