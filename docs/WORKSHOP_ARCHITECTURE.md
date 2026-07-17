# AoE2WAR Workshop Architecture

## Purpose

`/workshop` is the public window into the deliberate act of building AoE2WAR. It combines a real operator-controlled forge state, selected build notes, project lanes, deployments, parser discoveries, media, AI excerpts, and an optional live stream.

The Workshop is not an operations console. It is a curated app-side projection.

## Routes

- `/workshop` — public Workshop, project board, published work feed, optional stream, and grounded Ask the Workshop interaction.
- `/api/workshop` — public-only projection; `?summary=1` supplies the lightweight global live signal.
- `/api/workshop/ask` — deterministic answer composed only from published Workshop records and documented public system boundaries.
- `/admin/workshop` — operator state, publishing, media, and stream controls.
- `/api/admin/workshop` — admin-authenticated CRUD for status, entries, and stream metadata.

## Durable model

- `workshop_status` is a singleton operator state with open/live truth, activity mode, headline, description, and current project.
- `workshop_entries` contains independently curated build notes, AI discussions, design decisions, deployments, parser discoveries, screenshots, media, and milestones.
- `workshop_artifacts` supports multiple explicitly public artifacts on a curated entry.
- `workshop_streams` stores explicitly configured live or recorded presentation metadata. It does not initiate capture.

Public entry queries require all of:

- `status = published`;
- `visibility = public`;
- non-null `published_at`.

Public artifact queries require `is_public = true`. The public API never selects creator/operator identifiers, private status, or draft records.

## Status lifecycle

Supported activity modes are:

- `closed`;
- `building_live`;
- `streaming`;
- `ai_session_live`;
- `quiet_work`;
- `major_deployment`;
- `maintenance`;
- `special_event`.

`is_live` cannot be true while the Workshop is closed. The global `Workshop · LIVE` navigation signal appears only when the operator says the Workshop is actively live or a public stream record is live. An open Workshop in quiet-work mode remains public without falsely claiming a live build session.

## Publication boundary

Nothing automatically mirrors ChatGPT, Codex, terminal, Git, systemd, filesystem, or database output into the Workshop.

Never publish:

- credentials, environment values, API keys, tokens, cookies, or database URLs;
- terminal transcripts or raw deployment output;
- private user data, private messages, contact details, or private Radio submissions;
- security findings that would create operational risk;
- chain signer material, wallet secrets, financial secrets, or unpublished settlement detail;
- raw private AI prompts, hidden instructions, or full private AI conversations.

An operator creates a separate sanitized Workshop entry and explicitly publishes it. Unpublishing reverses public visibility without deleting the administrative record.

## AI publication

An `ai_discussion` entry stores selected speaker/body turns in bounded JSON. The admin composer creates those turns manually. The public page renders the selected plain text; it does not render arbitrary HTML.

Ask the Workshop reads the public projection only. It cannot query drafts or admin notes. Its response states that boundary to the user.

## Media and storage

Workshop image/video uploads reuse the existing Media Armory at `MANAGED_MEDIA_UPLOAD_DIR`, currently `/mnt/HC_Volume_105319120/aoe2-managed-assets` in production. The Workshop stores only an approved app URL and presentation metadata.

No new public nginx file tree or Workshop-specific upload root is introduced. Media bytes and the associated Postgres metadata must be backed up together.

## Stream foundation

A stream record can reference first-party playback, an explicitly approved external source, a recording, or a screen-share presentation. Creating a record does not capture the desktop or start a broadcaster. A stream becomes public only through an operator action, and a `live` stream must be public by database and API policy.

Go-live is transactional: any older live Workshop stream is ended, the selected stream becomes the singleton active stream, and the public status enters `streaming`. End, hide, and delete actions clear that active signal. The active-stream reference is protected by a database foreign key.

When no stream is live, the Workshop remains useful through its status, work feed, project board, AI excerpts, and milestones. Radio WOLO ambience is user-initiated; nothing autoplays loudly.

## Performance

The global shell polls the summary endpoint every 30 seconds together with existing header counts. The summary response is a single status/stream projection with short shared-cache headers. Public requests never run Git, scan the filesystem, or inspect terminal state.

## Campaign III seal

At the July 17, 2026 production checkpoint, the Workshop is open in
`quiet_work` mode and is not claiming a live stream. Seven entries are
published/public. The pinned milestone is **The 329 frontier falls**. These are
database facts at the checkpoint, not migration defaults or a promise that the
state will never change.
