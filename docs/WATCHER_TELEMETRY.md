# Watcher Telemetry

Watcher analytics now separates noisy package pulls from confirmed watcher behavior.

## Signal Layers

`watcher_download_events` records raw requests to `/download/watcher/*`. These are package pulls, not confirmed installs or users. They can include direct probes, scrapers, bot traffic, mismatched user agents, and repeat pulls from the same guest.

`watcher_client_events` records runtime telemetry from the Electron watcher. These events are the forward-looking source for app opens, linked opens, replay detection, upload attempts, upload results, parse results, and heartbeat activity.

`game_stats` remains the historical fallback for confirmed watcher usage. Rows with `parse_source in ('watcher_live', 'watcher_final')` prove that a watcher-submitted game reached the app, even if no `app_open` telemetry existed yet.

If MGZ full-summary decoding fails on a watcher final upload, the API may store a header-only fallback row with `parse_reason = 'header_only_summary_fallback'` and `key_events.header_only_fallback = true`. Treat that as replay identity/proof preservation only: it may include player/header metadata, but it must not be read as final winner, score, or postgame resource truth.

## Event Types

Allowed `watcher_client_events.event_type` values:

- `app_open`
- `auth_started`
- `auth_success`
- `auth_failed`
- `watch_folder_selected`
- `replay_detected`
- `upload_attempted`
- `upload_succeeded`
- `upload_failed`
- `parse_succeeded`
- `parse_failed`
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

## Admin Watcher Diagnostics Rail

`/admin/wolochain` includes an Admin Watcher Diagnostics rail that combines
`watcher_client_events`, `replay_parse_attempts`, and watcher-backed
`game_stats` rows.

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
- replay-file rollups with statuses, parse attempts, parsed game ids, and failure breadcrumbs

Use this rail when a player says the watcher saw a replay but the site did not
show a live game or final result. The rail is diagnostic only: it does not
fabricate replay outcomes and it does not replace parser truth.

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
