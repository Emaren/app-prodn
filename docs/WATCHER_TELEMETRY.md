# Watcher Telemetry

Watcher analytics now separates noisy package pulls from confirmed watcher behavior.

## Signal Layers

`watcher_download_events` records raw requests to `/download/watcher/*`. These are package pulls, not confirmed installs or users. They can include direct probes, scrapers, bot traffic, mismatched user agents, and repeat pulls from the same guest.

`watcher_client_events` records runtime telemetry from the Electron watcher. These events are the forward-looking source for app opens, linked opens, replay detection, upload attempts, upload results, parse results, and heartbeat activity.

`game_stats` remains the historical fallback for confirmed watcher usage. Rows with `parse_source in ('watcher_live', 'watcher_final')` prove that a watcher-submitted game reached the app, even if no `app_open` telemetry existed yet.

Watcher v1.5.0 uses watcher-native streaming plus rolling AoE2WAR playback and a faster final-candidate contract. Stream telemetry now includes source kind, capture mode, bitrate, one-second chunk cadence, chunk size, upload queue length, upload latency, dropped slices, heartbeat retries, display-capture guidance, and early-stop errors so support can tell whether a user is streaming a window, a full display, a slow network, or a failing capture source. A final upload is settlement-safe only when the upload response includes `should_settle = true` or a trusted finality status. Header-only or unparsed proof can be preserved for diagnostics, but it must not be read as final winner, score, postgame resource, or betting truth.

## Event Types

Allowed `watcher_client_events.event_type` values:

- `app_open`
- `watcher_started`
- `watcher_stopped`
- `watcher_version_seen`
- `watcher_update_check_started`
- `watcher_update_available`
- `watcher_update_not_available`
- `watcher_update_downloaded`
- `watcher_update_error`
- `watcher_update_install_requested`
- `auth_started`
- `auth_success`
- `auth_failed`
- `watch_folder_selected`
- `watching_started`
- `watching_stopped`
- `watcher_ready`
- `watcher_error`
- `monitor_start`
- `monitor_stop`
- `monitor_skip_final`
- `replay_detected`
- `replay_detected_ignored`
- `skip_unknown`
- `skip_upload_in_progress`
- `skip_file_missing`
- `skip_file_too_small`
- `skip_already_finalized`
- `file_size_progress`
- `waiting_for_minimum_size`
- `upload_attempted`
- `upload_retry`
- `upload_succeeded`
- `upload_failed`
- `parse_succeeded`
- `parse_pending`
- `parse_failed`
- `parse_result_unknown_fields`
- `final_candidate_ready`
- `final_candidate_accepted`
- `final_candidate_deferred`
- `final_candidate_reopened`
- `batch_upload_started`
- `batch_upload_scanned`
- `batch_upload_file_started`
- `batch_upload_file_stable`
- `batch_upload_file_skipped`
- `batch_upload_file_succeeded`
- `batch_upload_file_failed`
- `batch_upload_finished`
- `batch_upload_failed`
- `stream_handoff_opened`
- `stream_sources_listed`
- `stream_capture_requested`
- `stream_preview_started`
- `stream_source_ready`
- `stream_started`
- `stream_chunk_uploaded`
- `stream_chunk_dropped`
- `stream_heartbeat`
- `stream_stopped`
- `stream_track_ended`
- `stream_recorder_error`
- `stream_chunk_failed`
- `stream_heartbeat_failed`
- `stream_error`
- `heartbeat`

The watcher posts to `POST /api/watcher/events`. The endpoint accepts a single event object or `{ "events": [...] }` batches up to 25 events and returns `{ "ok": true }` on successful or non-blocking best-effort handling.

## Identity

If the watcher has an `x-api-key`, the server resolves `user_id` and `user_uid` from the existing watcher key model. The key is only sent as a request header and is never stored in telemetry rows.

Unauthenticated events still store:

- `event_type`
- `app_version`
- `platform`
- `artifact`
- `watcher_id`
- `session_id`
- `ip_address`
- `user_agent`
- sanitized metadata

## Privacy Rules

Telemetry must never store watcher tokens, secrets, private keys, auth headers, cookies, or full local file paths.

Replay file telemetry stores the basename only, for example `recorded-game.aoe2record`, not the full local path. Metadata is sanitized server-side and drops suspicious secret-shaped keys such as `token`, `secret`, `password`, `apiKey`, `authorization`, `cookie`, and `privateKey`.

Telemetry failures must not block the watcher. The Electron app uses fire-and-forget telemetry with short timeouts; upload and replay monitoring continue if telemetry is unavailable.

## Finality Contract

Upload responses can include:

- `finality_status = live`
- `finality_status = live_pending_parse`
- `finality_status = final_not_ready`
- `finality_status = final_unparsed_proof`
- `finality_status = trusted_final`
- `finality_status = trusted_final_duplicate`
- `finality_status = trusted_final_refreshed`
- `finality_status = reviewed_match_duplicate`
- `finality_status = reviewed_match_refreshed`

Only `trusted_final*` and `reviewed_match*` statuses should set `should_settle = true`. The watcher treats every other final response as a deferred candidate and keeps monitoring the replay file.

## Admin Watcher Diagnostics Rail

`/admin/wolochain` includes an Admin Watcher Diagnostics rail that combines
`watcher_client_events`, `replay_parse_attempts`, and watcher-backed
`game_stats` rows.

`/admin/watcher-funnel` adds a conversion/diagnostic command surface, including dedicated support tiles for known watcher users and any signed-in user who emits runtime telemetry. Use it while users are running the watcher to inspect start/stop/heartbeat, auth, replay detection, final-candidate deferrals, upload failures, finality status, version, platform, watcher id, session id, streamer status, source choice, upload chunks, heartbeat freshness, and streamer errors.

The recent-event rail translates finality telemetry into operator language:

- `final_unparsed_proof` / `unparsedFinal` -> **Final proof preserved but parser could not extract winner**
- `final_candidate_deferred` with `final_candidate_cooldown` -> **Replay still cooling down**
- `parse_pending` or `parse_result_unknown_fields` -> **Awaiting roster parse**
- `final_candidate_accepted` / `finalAccepted` -> **Accepted into game #____** when a game id is present
- `replay_detected_ignored` -> **Ignored duplicate replay event**

An unparsed final row is preservation evidence, not an accepted game result. It must not settle a market or override winner/history.

Per user, it shows:

- `app_version`
- `platform`
- `artifact`
- last heartbeat
- last watcher event
- replay file count
- replay hash count
- parsed finals
- unparsed finals
- upload failures
- parse failures
- streamer source/mode
- stream chunk and heartbeat counts
- upload queue, latency, and dropped slice counts
- latest stream error or status detail
- replay-file rollups with statuses, parse attempts, parsed game ids, and failure breadcrumbs

Use this rail when a player says the watcher saw a replay but the site did not
show a live game or final result. The rail is diagnostic only: it does not
fabricate replay outcomes and it does not replace parser truth.

`/admin/replay-review` is the commissioner handoff for final rows whose winner
truth is still unsafe. It joins parser evidence with linked market/slip/claim
state, but remains read-only until an append-only adjudication model exists.
See [Commissioner Replay Review](./COMMISSIONER_REPLAY_REVIEW.md) for the truth
layers, money-safety rules, and operator playbook.

## Debug Queries

Package pulls in the last 24 hours:

```sql
select count(*) as package_pulls_24h
from watcher_download_events
where created_at >= now() - interval '24 hours';
```

Guest versus signed-in package pulls:

```sql
select
  count(*) filter (where user_id is null) as guest_pulls,
  count(*) filter (where user_id is not null) as signed_in_pulls
from watcher_download_events
where created_at >= now() - interval '24 hours';
```

Watcher app opens:

```sql
select
  count(*) filter (where created_at >= now() - interval '24 hours') as opens_24h,
  count(*) filter (where created_at >= now() - interval '7 days') as opens_7d,
  count(*) as opens_all_time
from watcher_client_events
where event_type = 'app_open';
```

Confirmed watcher users from telemetry:

```sql
select count(distinct coalesce(user_uid, user_id::text)) as confirmed_users
from watcher_client_events
where event_type in ('app_open', 'auth_success', 'heartbeat', 'upload_attempted', 'upload_succeeded')
  and (user_id is not null or user_uid is not null);
```

Historical confirmed watcher users from submitted games:

```sql
select count(distinct user_uid) as watcher_game_users
from game_stats
where parse_source in ('watcher_live', 'watcher_final')
  and user_uid is not null;
```

Header-only fallback watcher rows:

```sql
select id, user_uid, original_filename, created_at, parse_source, parse_reason
from game_stats
where parse_reason = 'header_only_summary_fallback'
order by created_at desc;
```

Manual upload users:

```sql
select count(distinct user_uid) as manual_upload_users
from game_stats
where parse_source = 'file_upload'
  and user_uid is not null;
```


## Bet-board fast path — 2026-07-09

- `/api/bets` serves the public board without awaiting heavyweight bet-market reconciliation.
- Market reconciliation still runs from `/api/bets`, but as a throttled background pass.
- Settlement capability checks use a short fast-path timeout and cache so public bet-board rendering is not blocked by settlement-service probing.
- Player Match Feed uses an internal scroll viewport with a near-bottom loading backstop for deep archives.


## Homepage board height pass — 2026-07-09

- Leaderboard uses a taller internal scroll viewport and avoids clipping the final rows.
- Homepage War Chest renders as a full-height board beside the leaderboard instead of a short promo tile.
- Legacy 96-row leaderboard caps were lifted to 128 where present.


## Homepage board data-cap pass — 2026-07-09

- Leaderboard and War Chest route/library caps were lifted so taller home boards can actually receive enough rows.
- War Chest keeps team-split names and can request up to 256 visible earners.
- Leaderboard page size/default caps target 128 rows for the premium home board.


## Homepage board butter-scroll pass — 2026-07-09

- Leaderboard and War Chest panes use stable `svh`/clamped viewport sizing so first paint matches post-resize layout.
- Nested board panes use native scroll chaining and stable scrollbar gutters instead of brittle clipped dynamic viewport boxes.
- Leaderboard lazy-load page size is smaller and more eager near the bottom for smoother progressive loading.
- War Chest route/component limit headroom supports the full board while keeping the pane scrollable.

## War Chest true pagination — 2026-07-09

- War Chest now uses offset/limit pagination instead of a single large capped fetch.
- `/api/lobby/wolo-earners` returns `nextOffset`, `hasMore`, and `totalParticipants`.
- The homepage War Chest loads a fast first chunk, then keeps fetching additional chunks until the real participant total is reached.
- Request limits are safety limits only; the board is designed to grow with natural user activity.\n

## Mainnet wager visibility guard — 2026-07-09

- Mainnet escrow wagers are visible on `/bets` only after the linked stake intent is safely recorded.
- Broadcast status updates must never downgrade an already-recorded stake intent back to `broadcast_submitted`.
- Conservative repair rule: if an active on-chain wager exists with a matching stake intent and tx hash, and the intent already has `recorded_at`, the intent status may be restored to `recorded`.
