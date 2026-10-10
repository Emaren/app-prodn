---
id: "aoe2war.app-prodn.television-v3-test-readiness"
title: "Television WOLO V3 Field Readiness"
type: "working"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "aoe2-watcher"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "engineering-test-plan"
reviewed_at: "2026-10-10"
review_interval_days: 14
sensitivity: "internal"
---

# Television WOLO V3 Field Readiness

This is a test-readiness checkpoint, **not** a certified V3 video release or
a claim that video is reliable on unseen Windows machines. The 0–100 video
benchmark must use observed evidence, not a score assigned by this document.
Do not raise any readiness claim without the real packaged Windows canary.

## Corrected application boundary

- The selected battle renders every roster name, without imposing a fictional
  1v1/2v2 team structure. Actual teams are separate replay authority.
- The non-binding Chaos Vote Lab displays every roster participant, including
  4v4 (eight players) and asymmetric matches. Duplicate names are distinct
  per displayed roster position in the local lab only. Official votes require
  verified participant identity, authenticated ballots, one-vote/eligibility
  policy, abuse controls, close time, and Commissioner/title custody authority.
- Battle discovery rechecks server-side live/recent/archive shelves every 30
  seconds **only in a visible tab**. Rechecking must not mount media or switch
  the selected POV.
- After a viewer presses Play, the selected session's feed registry rechecks
  every 15 seconds while visible. A new broadcaster may appear without a full
  page reload. Existing selected feed ID is preserved when still present.
- Feed directory database failures return HTTP 503 rather than an empty feed
  list. A transient polling failure preserves the last working video and gives
  viewers a manual recheck.
- Existing watcher-native stream admission, 8 MiB chunk, retry and cleanup
  semantics are unchanged. This does not extend recorded-media retention.

## V3 field test matrix

Record a **real Windows machine** result for each of:

| Case | Expected proof |
| --- | --- |
| Watcher idle, monitor armed, video off | CPU, RSS, wakeups, one-minute heartbeat, zero video upload |
| Game found, stream not yet started | Exact session binding, no phantom player or feed |
| Windows Start Streaming, active 1v1 | Window capture permission, first chunk receipt, public playback |
| 2v2 / 3v3 / 4v4 | Full roster, one session key, no inferred teams, all nominees shown |
| 2v1 / 3v1 / 4v1 | Roster survives; betting/team proof remains independent |
| Stream starts after TV viewer presses Play | Feed discovered in <= one polling interval plus network latency |
| Viewer changes POV while streaming | Selected feed remains stable across registry refresh |
| Interrupted upload, 429/503, network loss | Exact chunk/sequence retry and conspicuous operator diagnostics |
| Stream ends with result unknown | Archived media not mislabeled as winning/settled replay |
| Fifteen minutes after finality | TV shell, retained video eligibility, discussion/vote window evidence |
| Restart/update during active stream | Busy deferral and no silent live stream loss |
| Stream source permission revoked | Clear failure, bounded recovery, no auto permission bypass |

The product request for **15-minute postgame viewing and official voting** is
not fully satisfied by this patch. Historical ended media currently has a
six-hour directory visibility window, but playback lifetime also depends on
the existing stream retention policy, and an official ballot/comment system
requires its own reviewed identity and moderation boundary.

## Resource and cost truth

Do not fabricate CPU percentages or watts. Each field run must record p50/p95
CPU (consistent per-process denominator), peak/steady RSS, wakeups, GPU/encoder
utilization when externally measurable, dropped chunks, chunk latencies,
stream bitrate and uploaded bytes/hour. Keep separate workload baselines for:
idle Watcher; armed monitor; replay upload without video; and game+video.

Electricity for a streaming run is the **measured incremental wall power**
from the same PC at the same game/settings, not Electron's unavailable watt
signal. Calculate:

`incremental_kWh = (watts_video - watts_game_only) * hours / 1000`

`incremental_cost = incremental_kWh * local_CAD_per_kWh`

CPU percent is not a defensible substitute for watts. Also report network
upload egress, which is not directly convertible to electricity. Recording
one-hour and two-hour test runs is essential before publishing user claims.

## Release gate

Before user invitation: typecheck, focused + repository CI, Windows signed
artifact provenance, install/update canary, Watcher playback and replay
durability controls, public TV route and stream API smoke, privacy review,
operator telemetry investigation, low-bandwidth and reconnect canaries.
**No commit/PR automatically deploys to production**: activate only through
`aoe2war finish` and verify the certified SHA, service and Wolo continuity.

The next production workstream is a shared public/admin Kingdom Video
diagnostics projection with safe, redacted incident reasons and measured
resource cohorts, plus authenticated 15-minute community ballot/comment
authority. Do not guess a metric from unreconciled client events.
