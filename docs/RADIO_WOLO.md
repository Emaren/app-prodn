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
reviewed_at: "2026-09-01"
review_interval_days: 90
sensitivity: "internal"
---

# Radio WOLO

## Purpose

Radio WOLO is the cultural broadcast wing of AoE2WAR. `/radio` exposes only tracks explicitly published by an operator. `/submit` is a durable creator intake for original community music, event themes, premieres, and future programming.

## Submission and rights

The form collects artist, title, genre/mood, private email, optional Discord, audio, optional artwork, notes, and an explicit rights checkbox. The accepted statement grants AoE2WAR a non-exclusive, revocable permission to store, review, stream, and promote the submitted work. Copyright remains with the rights holder.

Private operator Vault audio is limited to 250 MB; public creator submissions remain limited to 60 MB. Audio is validated by magic bytes as MP3, WAV, OGG, or M4A. Artwork is limited to 8 MB and validated as PNG, JPEG, or WebP. Extensions and browser MIME labels are not trusted. Original filenames are sanitized; stored files use random keys plus a SHA-256 prefix. Failed database writes remove partial files.

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

## Listener signals and ratings

Each browser receives a random persisted Radio WOLO listener UUID. This is not a
fingerprint and is not derived from IP address, user agent, hardware, or other
cross-site identifiers. When a signed session exists, listener signals are also
associated with that AoE2WAR user.

Radio listener state records Sound On, Sound Off, the most recently observed
authoritative RadioAsset, and bounded heartbeat timestamps. Admin analytics treat
Sound On as live only while the stored intent is on and its heartbeat remains
fresh; an expired heartbeat fails closed to OFF.

Track ratings are integers from 1 through 10.
Emoji stars are the default fresh-listener presentation; the premium icon-star face remains selectable. There is no submit step: clicking
a star immediately saves or replaces the listener's rating. Signed-in ratings
are canonical per AoE2WAR account and RadioAsset; anonymous ratings are canonical
per random browser listener and RadioAsset.

The client never supplies the RadioAsset being rated as authority. The feedback
endpoint resolves the currently airing asset from RadioStationState and the
authoritative program clock before writing a rating.
