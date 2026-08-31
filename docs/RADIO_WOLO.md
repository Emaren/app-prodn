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
reviewed_at: "2026-07-26"
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
