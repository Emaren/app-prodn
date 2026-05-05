# Admin Metrics

This dashboard must not treat raw watcher package traffic as real users. Package pulls are top-of-funnel request rows only.

## Watcher Package Pulls

Raw hits to `/download/watcher/*`, sourced from `watcher_download_events`.

Use this metric for traffic shape and artifact demand, not installs. It should be labeled as noisy and split by:

- guest versus signed-in package pulls
- platform, artifact, and version
- likely scraper/probe classifications
- recent rows with user agent, referer, user, and conversion signal

## Confirmed Watcher Users

Users with real watcher activity.

Forward-looking source:

```sql
select count(distinct coalesce(user_uid, user_id::text))
from watcher_client_events
where event_type in ('app_open', 'auth_success', 'heartbeat', 'upload_attempted', 'upload_succeeded')
  and (user_id is not null or user_uid is not null);
```

Historical fallback:

```sql
select count(distinct user_uid)
from game_stats
where parse_source in ('watcher_live', 'watcher_final')
  and user_uid is not null;
```

Label the fallback as confirmed by watcher-submitted games. Do not invent historical `app_open` rows.

## Watcher App Opens

Client telemetry rows with `event_type = 'app_open'`.

Show 24h, 7d, and all-time windows from `watcher_client_events`.

## Linked Watcher Opens

Watcher opens with a linked user. Count `app_open` and `auth_success` where `user_id is not null`.

## Upload Funnel

Watcher upload telemetry is sourced from `watcher_client_events`:

- `upload_attempted`
- `upload_succeeded`
- `upload_failed`
- `parse_succeeded`
- `parse_failed`

These events describe the watcher runtime flow. Final parsed match truth still comes from `game_stats`.

## Parsed Matches

Use `game_stats` grouped by `parse_source` and `parse_reason`.

Watcher-sourced parsed matches:

```sql
select parse_source, parse_reason, count(*)
from game_stats
where parse_source in ('watcher_live', 'watcher_final')
group by parse_source, parse_reason
order by count(*) desc;
```

Manual upload parsed matches:

```sql
select count(*)
from game_stats
where parse_source = 'file_upload';
```

## Manual Upload Users

Distinct `user_uid` values with `game_stats.parse_source = 'file_upload'`.

```sql
select count(distinct user_uid)
from game_stats
where parse_source = 'file_upload'
  and user_uid is not null;
```

## Package Pull Classification

The admin rail classifies recent package pulls with conservative labels:

- `signed_in_package_pull`: `watcher_download_events.user_id` is present.
- `guest_direct_pull`: guest request, empty referer, direct package URL, and no conversion.
- `likely_scraper_probe`: bot/crawler/script/headless user agent, local/internal fingerprint, or tight burst across multiple platforms/artifacts.
- `suspicious_platform_mismatch`: requested platform does not match the user-agent OS.
- `unknown_one_off_external_pull`: external request with no strong conversion or probe signal.
- `converted_to_app_open`: package pull followed by a plausible `app_open`.
- `converted_to_match`: package pull followed by a watcher-sourced `game_stats` match.

Conversion labels are best-effort. Do not overstate precision in UI copy.

