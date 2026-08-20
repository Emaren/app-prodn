---
id: "aoe2war.app-prodn.docs-workshop-architecture"
title: "AoE2WAR Workshop Architecture"
type: "explanation"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "architecture-explanation"
reviewed_at: "2026-08-20"
review_interval_days: 90
sensitivity: "internal"
---

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

<!-- AOE2WAR:TRUTH_IN_PRODUCTION_20260808:START -->
## Truth in Production — August 8, 2026

The current Workshop campaign is **Truth in Production**.

The public Workshop remains a curated projection rather than a raw operations
console. The August 8 publication records four production advances:

- explicit AoE2HD postgame winner emblems can support append-only replay
  adjudication when the winner cue itself is explicit;
- `replay-terminal-recorder-exit-v1` provides a narrow provisional stats-only
  recovery rail for authenticated modern Watcher final rated 1v1 recordings;
- Traffic omits the still-accumulating current UTC day;
- Statistics defines Games Streamed from unique `watcher_live` game sessions,
  Players Streamed from those same sessions, and Watcher Games from distinct
  `watcher_final` replay ingestion including Batch Upload.

The Chronicle remains idempotent and operator-published. These records do not
mutate raw replay evidence and do not create betting or settlement authority.

Implementation baseline for this Workshop campaign: `5f9af6425e03a8bec25ebde283749f86b4d46c19`.
<!-- AOE2WAR:TRUTH_IN_PRODUCTION_20260808:END -->


## Writable Clan social shadow — 2026-08-16

Clan Hall development has two explicit parity lanes. `npm run dev:prod` remains
a hard read-only live-production preview. `npm run dev:shadow:fresh` rebuilds
the local `aoe2hdbets_shadow` database from the current canonical Prisma schema
and imports only `users`, `clans`, `clan_members`, `clan_messages`, and
`clan_message_reactions` from production. Direct-message tables exist locally
and begin empty so invitation/chat work is freely writable. The 6.7 GB
replay/parser/game corpus is deliberately excluded.

The shadow launcher refuses a non-loopback base database, strips production
mutation credentials, and keeps heavy game/parser read surfaces on the public
production upstream. It is development infrastructure only and is never a
production migration mechanism.


## Production-shaped local shadow

`npm run shadow:refresh` builds a disposable local PostgreSQL database from the
current Prisma schema and imports the small production-shaped development
slice needed for realistic UI work. It includes Clan/social truth plus
`ai_agents`, `ai_request_traces`, `betting_bot_configs`, and
`bet_counter_actions`, so `/admin/ai` mirrors the production control plane.
Heavy replay/parser/game/financial corpus remains outside the clone.

`npm run dev:shadow` keeps `DATABASE_URL` local and strips production
application/chain mutation credentials. For direct OpenAI development parity,
the launcher may read the canonical production OpenAI credential over the
existing SSH channel and inject it only into the local Next child-process
environment. The value is never printed or written to disk. Safe non-secret
Hall Scribe provider prompt ID/version settings are mirrored the same way.

## Kingdom Builds Again closeout — August 20, 2026

The August 20 Workshop closeout records the operating-system closure, verified
rollback archival lifecycle, persistent release-speed pulse and private player
War Archives. These are curated public records; raw terminal logs, private
documents, credentials and recovery evidence remain outside the Workshop.

The Workshop route remains `force-dynamic` so live status semantics are not
silently converted into build-time truth. Its public Postgres projection and
initial Chronicle page are cached for 30 seconds, while Parser Observatory keeps
its existing 300-second cache. The global `?summary=1` header poll now uses a
separate tiny cached status/stream projection instead of assembling up to 120
Workshop entries and artifacts on every poll. This removes repeated public
Workshop database assembly from ordinary navigation while preserving bounded
freshness.

Profile War Archive documents are explicitly not Workshop artifacts. They are
private owner/admin material and never become public merely because Workshop
records the feature's existence. Canonical operator metadata/byte verification
lives in `docs/PLAYER_WAR_ARCHIVE_OPERATIONS.md`.
