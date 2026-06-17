# Admin Metrics

This dashboard must not treat raw watcher package traffic as real users. Package pulls are top-of-funnel request rows only.

## User List / Command Tower

`/admin/user-list` is an operator cockpit, not a plain directory. Keep the top admin navigation visible near the top, preserve exact Community Lobby mode labels (`Basic`, `Advanced`, `Extreme`), and keep Recent Actions in a fixed-height lazy-loaded pane so older activity can stream in without resizing each user card.

The Honors panel owns badge add/remove controls and Phase 3A typed honors. Existing `add_badge` and `remove_badge` behavior stays unchanged. Belts, Artifacts, and Designations use admin-only `grant_honor` / `remove_honor` actions and are stored in `user_badges` as accepted rows with typed labels:

- `Belt: <title>`
- `Artifact: <title>`
- `Designation: <title>`

No new DB migration was added for Phase 3A. The storage limitation is that there is no per-user managed-media foreign key yet; the admin UI offers title registry options plus free text, and public display can only use the existing badge-pill rail when `display_on_profile` is true. Phase 3B should add a real honor record or extend the existing model with `kind`, asset/media reference, status/revocation fields, audit metadata, and richer public profile rendering for belts and artifacts.

### Journey Intelligence

Each user card has a compact Journey Summary above Recent Actions. It is Traffic-inspired but app-local: the API batches recent `UserActivityEvent` rows, groups the newest session with `journeySessionId` or a 30-minute activity gap, compresses the route chain, and labels engagement as `Hot`, `Active`, `Browsing`, `Dormant`, or `Unknown`.

Phase 2B adds client-side triage over the already-loaded admin payload: engagement filters, Suspicious / Low Confidence filtering, text search across user names, email, routes, meaningful action labels, and route chains, plus simple sorting by recent activity, engagement quality, newest user, and existing WOLO-on-file amounts. It does not query live wallet balances.

The Journey Details expansion stays per-card and uses the existing summary payload. It shows route chain, entry/current/previous route, last meaningful action, source/referrer/campaign, shortened session id, confidence, adapter notes, and a capped safe event trail. No `/api/admin/users/[uid]/journey` endpoint exists yet because Phase 2B does not need full histories to render the detail panel.

The browser activity endpoint records authenticated page views and safe button/link clicks only. Metadata is allowlisted to route path, previous path, same-session id, referrer host/path without query strings, UTM fields, viewport/device hints, and sanitized click target labels/hrefs. It must not capture chat bodies, form values, passwords, tokens, private keys, typed text, or arbitrary DOM metadata.

Suspicion labels such as thin direct trails, fast click bursts, and probe-like paths are operator hints, not fraud truth. Raw Recent Actions remains the audit trail; Journey Summary and Journey Details are fast reading layers. Phase 3 should add a lazy detail endpoint only when operators need deeper per-user history, with the same metadata allowlist and a tight row cap.

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
