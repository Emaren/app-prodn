---
id: "aoe2war.app-prodn.docs-watcher-telemetry"
title: "Watcher Telemetry"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "telemetry-contract"
reviewed_at: "2026-09-21"
review_interval_days: 30
sensitivity: "restricted"
---

# Watcher Telemetry

## Production release identity — 2026-09-21

The live download root is `/mnt/HC_Volume_105319120/aoe2-downloads`, exposed through the app's `public/downloads` symlink. The Watcher 1.6.0 release contract requires the Windows, macOS, and Linux updater manifests to report `version: 1.6.0` before the web metadata is considered publishable.

Release evidence:

- Watcher runtime source: `ee9229009f3b36dc082a1c3aa31305b5fd76a5b7`;
- certified candidate build source and annotated `v1.6.0` tag target: `52d0a42ee68bb6f1f71db16a6298f32810baeeec`;
- successful Windows Artifact Signing run: `35634269184`;
- successful macOS/Linux release build run: `35634269169`;
- public GitHub release: `v1.6.0`, published 2026-09-21 18:10:42 UTC.

Verified release binary SHA-256 values:

- Windows installer: `b6fa8b3ed934bb98dfbb5008148fb739575ca138b3dfc74084dd4a2b7d650f89`;
- Windows portable EXE: `d656b66de13cc594e28c2dc88651dc8df5eefd1b35d0fa5b6792c7dfd1ef173d`;
- Apple Silicon DMG: `e128424ca6cecc5ebcf82c57d643e0774380b786780fd8b141190562a50380e3`;
- macOS direct ZIP: `44845f98996614bac4c3c8a340b037983edc2de9975e47181db2689a4f8712e0`;
- Linux AppImage: `5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266`.

Secondary release evidence is also pinned: macOS DMG blockmap `d06e9206b9db50401f7da23624d39ea9bfaf35c097db1cb324075586f2fe5c0a`, `latest-mac.yml` `a75eaead880e6cd7dd139e6a62d3fd5f776bd430fda28f752c23c10ae9327a7e`, and `latest-linux.yml` `37926c8fe2e37bbaafd95b4383f0b3b56bb46c8a0cf2b7be536104880fcc2ccf`. `SHA256SUMS-1.6.0.txt` and `watcher-release-manifest-1.6.0.json` are the authoritative public inventory receipts. The release manifest records both runtime source and candidate build source plus the exact platform workflow run IDs.

The GitHub Actions integration passed every provenance, inventory, updater-metadata, and artifact-hash gate but was denied release creation with HTTP `403 Resource not accessible by integration`. The certified bundle was therefore published against the pre-created annotated tag by the authenticated repository owner without rebuilding or replacing any candidate artifact. The durable workflow now stops at a certified release-bundle handoff instead of pretending the integration has release-create authority.

## 2026-09-21 distribution-ordering incident and permanent invariant

The first app-side 1.6.0 promotion exposed a release-ordering gap. The certified
web runtime and `/api/watcher/release` advertised Watcher 1.6.0 while the
canonical mounted download vault still lacked four versioned 1.6.0 packages and
the two 1.6.0 inventory receipts; the shared direct ZIP and updater YAMLs still
contained the previous release bytes. Application certification had proved the
web runtime, but it had not yet made Watcher distribution identity a release
precondition.

Recovery used the already-certified public release bundle; no Watcher was
rebuilt. All 11 release files were hash-checked locally, copied into an isolated
incoming directory on the mounted volume, hash-checked again, and promoted into
the canonical vault. User-facing payloads and inventory receipts moved first;
the three updater manifests moved last so an updater pointer could not lead its
binary. The canonical vault was then re-hashed against the public 1.6.0 release.

Permanent rule: a `WATCHER`-risk app release must prove distribution before
candidate materialization. Release OS derives the target Watcher version from
the exact sealed release commit and requires the canonical nine-file inventory
(five user-facing binaries, DMG blockmap, and three updater manifests), exact
`SHA256SUMS-<version>.txt` inventory, and
`watcher-release-manifest-<version>.json` inventory/size/hash evidence to
agree byte-for-byte. The updater manifests must advertise the same version and
expected platform binaries. Missing, extra, duplicate, symlinked, stale, or
digest-disagreeing evidence stops staging while production remains untouched.

## v1.6.0 low-footprint lifecycle and self-update

Watcher 1.6.0 separates the replay engine from the Chromium dashboard. Login startup may arm in tray-only background mode with no BrowserWindow alive; opening the dashboard creates the renderer on demand, and closing it destroys the renderer while replay monitoring continues. The renderer is sandboxed, dashboard log growth is bounded, runtime-event paints are coalesced, config/folder inspection is cached, and idle recovery/freshness safety nets run at deliberately low frequency.

Updater installation now distinguishes an **armed** watcher from **active work**. An idle monitor no longer blocks an already-downloaded update. Active replay observation, replay upload, historical import, or watcher-native streaming still blocks installation; once those rails clear, Windows may hand off safely to `quitAndInstall()`. The unsigned macOS distribution remains download-and-replace. Replay durability, fresh-unknown recovery, known-final hash/fingerprint safety, and replay-over-video network priority remain intact from the prior releases.

## Previous production release identity — 2026-09-20

The live download root is `/mnt/HC_Volume_105319120/aoe2-downloads`, exposed through the app's `public/downloads` symlink. The Watcher 1.5.13 release contract requires the Windows, macOS, and Linux updater manifests to report `version: 1.5.13` before the web metadata is considered publishable.

Release evidence:

- Watcher runtime source: `79c4641e77df26e488c252738ff6f44e89772de6`;
- successful Windows Artifact Signing run: `35552739520`;
- signed Windows build source: `79c4641e77df26e488c252738ff6f44e89772de6`;
- successful macOS/Linux release build run: `35552739589`;
- macOS/Linux build source: `79c4641e77df26e488c252738ff6f44e89772de6`;
- immutable GitHub release: `v1.5.13`, published 2026-09-21 02:21:45 UTC.

Verified release binary SHA-256 values:

- Windows installer: `73a432687fd3b1989ff4cb5063d9e29589b6471186e277df399b6bb5599a91ec`;
- Windows portable EXE: `4583ce46bebd864a32b2db4d0b57792b6e70d31dfd9c56a414644c857e674248`;
- Apple Silicon DMG: `87c9545364bab48ee0e45cb7cb3e145a953a52ea480481ba427f0b55cdd4e140`;
- macOS direct ZIP: `80eea06fc3beec7c905379d59180a04e2cf36303f9712f07397403700a81c142`;
- Linux AppImage: `823b6a29836dea8caf2953201e68681adbdc4d3855b1b25a5c19bff8d618770e`.

The certified release inventory contains nine canonical entries: the five user-facing binaries, the macOS DMG blockmap, and `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`. `SHA256SUMS-1.5.13.txt` and `watcher-release-manifest-1.5.13.json` are the authoritative inventory receipts. The Windows updater manifest is regenerated from the **signed** installer bytes so its SHA-512 and size cannot point at the pre-signing binary.

## Watcher staging retention

`aoe2war watcher-staging` is the read-only authority for Watcher release-staging cleanup. It hashes every regular file in each immediate staging subtree and compares those hashes with the canonical mounted download vault at `/mnt/HC_Volume_105319120/aoe2-downloads`. A subtree is reclaimable only when **every file** already exists byte-for-byte in that vault. One unmatched file protects the entire subtree.

`aoe2war watcher-staging --apply` persists the digest-bound plan, re-runs the inventory, rechecks production source/build/service and Wolo 8092/8093 listener identity, removes only exact-duplicate subtrees, then seals a durable result receipt. Symlinks, special files, path escape, changed plans, runtime drift, or unique historical bytes fail closed. The command never interprets age or version text as deletion authority.

Preview deliberately uses the ordinary `hel1` operator identity. Apply uses the existing canonical `rollback_archive.root_maintenance_host` authority (`root@hel1`) because release staging is root-owned. The privilege boundary changes only the SSH transport; the exact same encoded path/hash/runtime/Wolo policy still executes remotely. The first live apply attempt proved why this separation matters: unprivileged deletion failed with `Permission denied`, sealed a FAILED result receipt, changed no runtime/Wolo identity, and left the candidate intact.

The 2026-09-19 live preview classified the 1.5.12 staging body as an exact canonical duplicate while preserving the 1.5.9 staging body and the version-1.5.11 previous direct ZIP because those contain bytes not duplicated in the canonical vault. This preserves release evidence instead of deleting it for a storage score.

General Inspections therefore does **not** classify raw `watcher-release-staging` or `watcher-staging` presence as generic staging debt. Those trees belong to the digest-backed `aoe2war watcher-staging` authority above; Organization scoring counts only generic scratch/recovery queues. A future Watcher staging cleanup decision must come from that retention plan, never from directory age or entry count alone.

## v1.5.13 live replay recovery

Watcher 1.5.13 repairs a client-side live-admission failure exposed by simultaneous Scavanger_Ab and Tekki reports. Both 1.5.12 clients remained authenticated, monitor-attached, and heartbeating with valid HD folders while heartbeat metadata showed newer supported `.aoe2mpgame` files in those folders. The server received no `replay_detected`, `upload_attempted`, or `upload_succeeded` events for the new games, proving the break was before replay transport rather than in parser ingestion or public game rendering.

Two 1.5.12 admission rules caused the blind spot. First, `shouldHandle()` explicitly rejected any path containing the English phrase `Out of Sync`, so legitimate English out-of-sync MP saves could never enter monitoring. Second, restart/recovery admission for an unknown recent replay required the file to grow during one short sampling interval; a valid already-existing replay could therefore remain invisible after watcher restart, auto-repair, or native-event loss.

1.5.13 removes filename-language vetoes and adds fresh-unknown recovery admission: a supported replay with no prior upload state may be adopted on attach/recovery while it is still within the bounded recent-live window, even if it does not grow during that one sample. Known-final replay safety remains separate and unchanged: fingerprint divergence is rechecked against durable final replay hash state before reopening a settled replay. Regression coverage explicitly admits English and localized out-of-sync MP saves and proves fresh replay recovery without a lucky growth sample.

Durable rule: replay filenames are presentation evidence, never lifecycle authority. Admission is based on supported extension, valid HD folder, bounded freshness, runtime state, and durable replay identity/finality evidence. A healthy heartbeat with `activeReplay=false` plus a newer supported folder replay must be treated as a detection-path incident when the server has no corresponding replay lifecycle events. The support funnel therefore emits an explicit client replay-detection warning when connection, monitor state, HD-folder validity, and folder activity are all healthy but the newest folder replay postdates the last server replay receipt and no replay is currently adopted.

## v1.5.11 capability-negotiated server media shedding

The app owns a server-side admission rail for watcher-native video. Before reading a watcher-native chunk body, the server may terminate that video stream with HTTP `409`, code `STREAM_MEDIA_SHED`, `terminal=true`, and bounded retry guidance when a replay proxy upload currently owns same-process priority **and** the client advertises `server-media-shed-v1`, or when the operator kill switch is enabled. The server records `stream_media_shed` itself; ordinary client-event ingress cannot forge that event. Watcher 1.5.11 advertises that capability on stream requests, treats this response as a terminal video-only stop, preserves replay transport, and asks the user to start a fresh stream after the retry window. Older watchers do not opt into automatic replay-pressure shedding. This rail does not create replay-result, betting, settlement, database, or Wolo authority.

## v1.5.10 active-folder and replay-priority recovery

Watcher 1.5.10 separates **structural folder validity** from **current replay activity**. A valid HD SaveGame directory is no longer assumed to be the active directory forever. The watchdog may switch away from a valid-but-stale folder only when a different proven HD candidate has materially fresher replay writes. This closes the Scavanger_Ab failure mode where the Watcher could stay green and monitor-attached while AoE2HD was writing the live replay into another Documents, OneDrive, or Steam-library SaveGame directory.

Replay truth also has explicit network priority over optional native video. When a replay upload begins, the Watcher can abort an in-flight video chunk, invalidate queued stale video slices, drop newly recorded video slices while replay bytes own the lane, pause the recorder to reduce encoding pressure, and suppress thumbnail refresh. The lightweight stream heartbeat remains alive. Video resumes from fresh capture after replay transfer clears; stale backlog is not flushed into the same constrained upstream connection. Video is expendable; replay live/final delivery is not.

The app-side ownership counterpart resolves Watcher replay ownership from the authenticated Watcher API key rather than trusting a client-supplied UID. A stale cached UID therefore cannot split telemetry ownership from final replay ownership.

## v1.5.9 replay durability

Watcher 1.5.9 hardens replay transport without increasing replay authority or concurrency. Retryable uploads honor server `Retry-After` guidance, apply bounded retry jitter, and reuse one immutable replay snapshot across ordinary transport retries. A parser-finalizing response begins a new logical observation after the wait so a still-growing replay may be captured again rather than freezing stale bytes indefinitely.

The server-side durability counterpart keeps replay upload admission at one and runs the hot MGZ replay read, parse, and team projection in a spawned parser process with one worker by default. The 2026-09-03 production canary preserved health during a real watcher upload while the replay parser executed outside the API process. Financial settlement authority and replay result authority remain unchanged.

## v1.5.8 truth rails

A fresh heartbeat means connected only. Monitor state comes independently from heartbeat `monitorAttached`/`isWatching`, start/ready/stop events, server replay receipts, and watchdog events. The v1.5.8 production update manifests advertised `1.5.8`; current production manifests are documented above. Older clients may lack newer recovery and telemetry fields and should be surfaced as upgrade candidates rather than judged for fields their release never emitted.

v1.5.8 adds bounded replay-folder self-healing without expanding the Watcher's authority. Startup, pairing, and watchdog recovery may replace an invalid saved folder only when the HD detector finds a valid candidate. Detection covers the established Documents/OneDrive HD locations plus Steam `Age2HD/SaveGame/multi`, including libraries discovered through Steam `libraryfolders.vdf`. AoE2 DE folders remain rejected. Auto Detect now reports success only for a validated detected folder; it no longer presents an unvalidated fallback as detection.

Folder recovery telemetry is explicit and privacy-safe: `watch_folder_auto_repair_started`, `watch_folder_auto_repaired`, and `watch_folder_auto_repair_failed`. Watchdog diagnostics include `monitor_watchdog_blocked`, `monitor_watchdog_reattach`, and `monitor_watchdog_folder_unavailable`. These events expose bounded problem classifications, folder kind/label, counts, and runtime state; they do not publish full local paths or raw filesystem error strings.

The immutable upload/finality contract from v1.5.7 remains unchanged in v1.5.8. Every upload request is captured from one immutable in-memory replay buffer. The multipart body, known body length, `x-file-size-bytes`, and the size portion of the replay fingerprint therefore describe the same captured bytes even while AoE2HD continues appending to the source file. Upload-queue telemetry counts distinct replay/finality keys rather than inflating the queue for retries or fallback targets.

Heartbeat metadata may include folder kind/validity and basename, folder/replay activity timestamps, active replay basename/size/change time, upload status/queue, batch/stream state, version/platform, and watcher/session IDs. Full private paths and replay contents are excluded.

Replay fingerprints are observation evidence, not durable battle identity. A
growing replay normally changes its size/mtime fingerprint on every upload.
Public live and betting projections therefore group first by platform match ID,
then by a high-entropy UUID/timestamp replay alias when platform identity is
absent. Generic replay names require watcher-session scope and fall back to
uploader scope for legacy rows without session metadata. That scope identifies
the process, not the game: an iteration-1 reset carrying a new replay hash
mints a persisted per-battle epoch, preventing sequential games from one
uninterrupted watcher process from sharing a card or market. A completion row
is final evidence, never a reset boundary. If a platform ID appears after early
generic pulses, the latest eligible epoch in each watcher context is promoted
to that exact ID; independent watchers may therefore converge on one battle,
while competing platform candidates fail closed. Under-specified rows stay
isolated instead of merging unrelated battles.
Roster, map, heartbeat, and mutable fingerprint fields do not define this
fallback, so early partial metadata joins later full iterations. Stream titles,
URLs, and playback paths are never replay identity. A
new heartbeat or parse iteration may improve one card's roster, duration, or
coverage, but it must not replace a different watcher's game or reorder the
active deck. This conservative legacy fallback can temporarily show duplicate
cards when independent old watchers have no shared strong game identifier; that
is safer than silently swallowing a real battle.

When later platform truth proves that exact fallback epochs are one battle,
the betting projection promotes those exact aliases before it allocates a
public battle number or upserts a new book. The market transaction preserves
funded winner and Desync state, retains any market ID already promised in a
legacy escrow memo, reuses the oldest public battle number, and leaves terminal
alias tombstones that stale watcher pulses cannot reopen. Ambiguous financial
state pauses the complete battle family for operator review; names, rosters,
maps, or stream metadata never authorize the merge.

The same exact alias set reattaches any video feed that started before platform
truth to the canonical replay card. Stream heartbeat recency may update media
availability, but it cannot replace the canonical replay/game ID or its
betting and finality fields.

Once a replay is final, its immutable replay hash becomes the platform-less
logical archive identity. Archive totals and paging are resolved in Postgres at
that canonical grain, so a growing watcher population is not constrained by a
5,000-row application-memory ceiling.

Truth disagreements are operator-visible: server replay without upload telemetry; client success without server row; fresh heartbeat with unknown monitor; active monitor with unknown folder; valid quiet folder; and old client coverage.

Watcher analytics now separates noisy package pulls from confirmed watcher behavior.


<!-- AOE2WAR:TERMINAL_RESULT_RECEIPTS_V3:START -->
### Terminal result receipts and stats-only recovery

Watcher terminal receipts are corroborating transport evidence. The Watcher
does not select a winner and no Watcher receipt creates financial authority.

The current source contract preserves terminal settlement-observation metadata
through Watcher source `0519ce64b6e4aadd42dc3b34e27f8628bf0558bc`. A completion receipt may include
`finalStored`, `settleWindowMs`, replay/session/file identity, and other
transport evidence. For Watcher 1.5.7, omission of `finalStored` is neutral;
explicit `finalStored=false` or identity/hash/session conflicts remain blocking.

The historical `replay-terminal-recorder-exit-v2` policy is now diagnostic
only and has **no result authority**. Production game 32173 supplied the missing
counterexample: an authenticated recorder may win a rated HD 1v1 and then stop
recording after the opponent is eliminated, including by converting the
opponent's final remaining unit. Therefore `recorder ended => recorder lost`
is not a valid winner rule.

Existing append-only adjudications from that policy remain durable historical
evidence, but the effective public/stats relation excludes them. No new
recorder-exit adjudication may be created. An unresolved 1v1 remains unresolved
until stronger replay, screenshot, or commissioner evidence proves a winner.

The prior 1v1 `replay-terminal-action-tail-v3` policy also remains disabled as
result authority. Standard mgz action-tail ordering is diagnostic evidence only
and must not automatically create a 1v1 winner.

Game 32173 is corrected through the existing stats-only commissioner overlay:
Emaren is the declared winner over 久居妒海的猫. The correction does not mutate
wagers, markets, claims, settlements, or chain state. The parser/Engine Room
should still pursue deterministic elimination/conversion evidence so future
matches do not require commissioner intervention.
<!-- AOE2WAR:TERMINAL_RESULT_RECEIPTS_V3:END -->

## Signal Layers

`watcher_download_events` records raw requests to `/download/watcher/*`. These are package pulls, not confirmed installs or users. They can include direct probes, scrapers, bot traffic, mismatched user agents, and repeat pulls from the same guest.

`watcher_client_events` records runtime telemetry from the Electron watcher. These events are the forward-looking source for app opens, linked opens, replay detection, upload attempts, upload results, parse results, and heartbeat activity.

`game_stats` remains the historical fallback for confirmed watcher usage. Rows with `parse_source in ('watcher_live', 'watcher_final')` prove that a watcher-submitted game reached the app, even if no `app_open` telemetry existed yet.

The Watcher 1.5.x streaming line uses watcher-native streaming plus rolling AoE2WAR playback and a faster final-candidate contract. Stream telemetry now includes source kind, capture mode, bitrate, one-second chunk cadence, chunk size, upload queue length, upload latency, dropped slices, heartbeat retries, display-capture guidance, and early-stop errors so support can tell whether a user is streaming a window, a full display, a slow network, or a failing capture source. A final upload is settlement-safe only when the upload response includes `should_settle = true` or a trusted finality status. Header-only or unparsed proof can be preserved for diagnostics, but it must not be read as final winner, score, postgame resource, or betting truth.

The exact native media start, chunk, heartbeat, retry, end, playback, cleanup,
and single-demo retention contract lives in
`docs/WATCHER_NATIVE_STREAM_HANDOFF.md`. That contract authenticates before
reading media bytes and treats a transaction hash, stream heartbeat, and replay
finality as three different kinds of evidence.

Watcher upload bytes are not transformed client-side. Team evidence originates in the server replay parser and must remain in canonical `game_stats.players`; the watcher needs no version change for the team-integrity release. `betting_eligible` for a team final additionally requires two complete explicit replay teams and one coherent winning team. A trusted final can remain valid replay evidence while still being ineligible to settle a team market.

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
- `monitor_watchdog_blocked`
- `monitor_watchdog_reattach`
- `monitor_watchdog_folder_unavailable`
- `watch_folder_auto_repair_started`
- `watch_folder_auto_repaired`
- `watch_folder_auto_repair_failed`
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
- `final_settle_observation_started`
- `final_settle_observation_complete`
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
- `stream_media_shed`
- `stream_heartbeat`
- `stream_stopped`
- `stream_track_ended`
- `stream_recorder_error`
- `stream_chunk_failed`
- `stream_heartbeat_failed`
- `stream_error`
- `heartbeat`

The watcher posts to `POST /api/watcher/events`. The endpoint accepts a single event object or `{ "events": [...] }` batches up to 25 events and returns `{ "ok": true }` on successful or non-blocking best-effort handling.

Authenticated watcher telemetry may also project current Watcher health into WarGraph presence. That projection runs as a serializable transaction and treats Prisma `P2034` write-conflict/deadlock errors as narrowly retryable: at most four attempts with bounded 15/30/45 ms backoff. Other database errors fail immediately to the existing best-effort deferral path. Durable watcher telemetry remains successful if this optional WarGraph projection is deferred, and the retry rail creates no replay-result, betting, settlement, or Wolo authority.

## Identity

If the watcher has an `x-api-key`, the server resolves `user_id` and `user_uid` from the existing watcher key model. The key is only sent as a request header and is never stored in telemetry rows.

Replay upload ownership follows the same authority rule. A Watcher-formatted key
(`wolo_<prefix>_<secret>`) must resolve server-side before any replay bytes are
proxied. The resolved key owner is the canonical `x-user-uid` forwarded to the
replay API; a client-supplied Watcher UID is diagnostic only and cannot override
the key owner. A malformed, revoked, or unresolved Watcher key returns `401`.
The separate internal server API key retains its trusted server-to-server UID
path for upload-package workflows, and ordinary browser uploads continue to use
the Steam session identity.

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
- `finality_status = final_recorded`
- `finality_status = final_recorded_duplicate`
- `finality_status = final_recorded_refreshed`
- `finality_status = trusted_final`
- `finality_status = trusted_final_duplicate`
- `finality_status = trusted_final_refreshed`
- `finality_status = reviewed_match_duplicate`
- `finality_status = reviewed_match_refreshed`

Upload/archive success and settlement readiness are separate. Use
`artifact_accepted` to confirm preservation and `parse_completed` to confirm a
parser pass. `final_recorded*` means the final artifact/candidate is stored and
routed for result review; it is not a failed upload and does not authorize
settlement. Only `trusted_final*` and `reviewed_match*` statuses should set
`should_settle = true`.

## Admin Watcher Diagnostics Rail

`/admin/wolochain` includes an Admin Watcher Diagnostics rail that combines
`watcher_client_events`, `replay_parse_attempts`, and watcher-backed
`game_stats` rows.

`/admin/watcher-funnel` adds a conversion/diagnostic command surface, including dedicated support tiles for known watcher users and any signed-in user who emits runtime telemetry. Scavanger_Ab is a permanent support target keyed to account UID `u_79fdf670637b4acd9c61ca3c49162cd1`, with the historical `Scavanger_Ab`, `Savanger_Ab`, and `Scavenger_Ab` spellings accepted only as lookup fallbacks. Use it while users are running the watcher to inspect start/stop/heartbeat, auth, replay detection, final-candidate deferrals, upload failures, finality status, version, platform, watcher id, session id, streamer status, source choice, upload chunks, heartbeat freshness, and streamer errors.

The recent-event rail translates finality telemetry into operator language:

- `final_unparsed_proof` / `unparsedFinal` -> **Final proof preserved but parser could not extract winner**
- `final_recorded*` -> **Final replay preserved · result review routed**
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

`/admin/replay-review` is the commissioner triage queue for final rows routed to
review. It joins parser evidence with linked market/slip/claim state. Authorized
reviewers use the neutral `/game-stats/[id]/review` editor, whose API appends to
the immutable `replay_result_adjudications` ledger. The editor never mutates
money; a submitter correction linked to a market requires an appended admin
approval. See [Commissioner Replay Review](./COMMISSIONER_REPLAY_REVIEW.md) for
the truth layers, authorization, money-safety rules, and operator playbook.

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
- Request limits are safety limits only; the board is designed to grow with natural user activity.

## Mainnet wager visibility guard — 2026-07-09

- Mainnet escrow wagers are visible on `/bets` only after the linked stake intent is safely recorded.
- Broadcast status updates must never downgrade an already-recorded stake intent back to `broadcast_submitted`.
- Conservative repair rule: if an active on-chain wager exists with a matching stake intent and tx hash, and the intent already has `recorded_at`, the intent status may be restored to `recorded`.


## Homepage board safe scroll fix — 2026-07-09

- Leaderboard keeps chunked lazy loading, but requests larger follow-up pages so it does not appear capped at the initial 128 rows.
- War Chest merges parent lobby refreshes into already-loaded pages instead of resetting back to the first page.
- Home no longer passes `h-full` into War Chest, so the tile can keep its own stable height.
- Request limits remain per-call safety limits only, not product caps.


## Homepage board seed fix — 2026-07-09

- Homepage seeds Leaderboard with 600 rows so the tile no longer visually stops at rank 128.
- Homepage returns the full current War Chest board instead of the old visible-slot slice.
- Lazy/request limits remain server-safety limits only; they are not product caps.
- Leaderboard can continue loading beyond the seeded board through the paged `/api/lobby/leaderboard` route.


## Leaderboard continuation past seed — 2026-07-09

- Homepage seeds the Leaderboard with 600 rows for fast first paint.
- The Leaderboard client now keeps hydrating through the paged API until the real tracked-player total is reached.
- The 600-row seed is not a product cap; it is only the first payload.


## Homepage full leaderboard seed — 2026-07-09

- Homepage now seeds enough Leaderboard rows to include the full current tracked-player board.
- This removes dependence on brittle client-side hydration inside the homepage scroll tile.
- The paged `/api/lobby/leaderboard` route remains available for future expansion and dedicated full-board views.


## Lobby leaderboard helper cap — 2026-07-09

- The homepage may request a larger Leaderboard seed, but the helper previously capped returned rows at 600.
- The helper cap is raised so the homepage can seed the full current board.
- This is not a product cap; it is only the current safe homepage seed range while dedicated pagination remains available.


## Live truth freshness boundary

The server-rendered `/live-games` page may use the ordinary short-lived snapshot
path for fast initial paint.

The continuously polled `/api/live-games` endpoint uses the same four-second
process-wide snapshot and single-flight refresh as the server page. This is the
freshness authority for the board: it avoids both the old long-lived stale
snapshot and a separate uncached full-database projection per browser.

The KKR `live_games` repository is a trusted internal caller and uses the
explicit fresh snapshot path so AI answers about games live now converge with
the live board and betting rail.

Client-side reconciliation remains a continuity/grace mechanism. It does not
replace canonical watcher-backed live truth.


## Leaderboard identity and speed convergence

Claimed leaderboard identities keep the claimed canonical display name.
Incoming replay aliases update alias history and `latestObservedName` without
renaming the claimed row.

Claimed and by-name player profiles resolve through the same public player
directory and use its full alias set. Pagination uses that same consolidated
identity, preventing a profile from showing only the slice recorded under its
latest literal replay name.

Leaderboard lane preference is persisted to a server-readable cookie as well
as local storage, allowing `/leaderboard` to SSR the preferred RM/DM lane
instead of rendering one lane and discarding it after hydration.

The public player directory and leaderboard share one short-lived raw final
GameStats corpus. Leaderboard lane/search/sort variants additionally share one
processed corpus. Accepted replay identity changes invalidate the raw corpus,
player directory, and processed leaderboard caches immediately.


## Historical composite alias search

Replay-observed names remain evidence and are not rewritten merely because they
contain commas.

Search has a narrower contract than identity history:

- canonical/current names, in-game names, Steam persona names, and standalone
  aliases remain normal substring-search keys;
- a historical comma-containing alias that is not itself a current/direct name
  remains in name history but does not make another identity match one of that
  composite label's components;
- the full historical composite alias remains discoverable by exact search.

This prevents historical composite observations from leaking one player's name
into another Steam account's ordinary search results while preserving replay
evidence.

## 2026-08-17 identity evidence boundary

Watcher uploader identity is provenance, not participant identity. A batch or
history upload cannot prove that the uploader controlled any replay participant
account, and display-name similarity is never control evidence.

The future high-confidence control rail is deliberately live: paired AoE2WAR
account + watcher device/session + locally active SteamID64 + a live-growing
replay + that same SteamID64 appearing as a participant in the replay. Until
that evidence exists, multi-account human ownership is not inferred.

## Watcher 1.5.9 public durability seal — 2026-09-04

The 1.5.9 publication is complete across Windows, macOS, and Linux.

The final production proxy canary deliberately occupied the single replay
admission slot, then proved:

- direct API overload HTTP: `429`;
- direct `Retry-After`: `5`;
- public Next.js replay proxy overload HTTP: `429`;
- public `Retry-After`: `5`;
- overload response body preserved through the proxy.

The canary was bounded to a few seconds and the artificial slow request was
terminated afterward. API health remained green and the service PID was
unchanged.

This is end-to-end production proof that Watcher 1.5.9's server-guided retry
behavior has a real deployed `Retry-After` source to consume.
