---
id: "aoe2war.app-prodn.docs-watcher-native-stream-handoff"
title: "Watcher Native Stream Handoff"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "stream-ingest-contract"
reviewed_at: "2026-08-30"
review_interval_days: 30
sensitivity: "internal"
---

# Watcher Native Stream Handoff

## Ownership boundary

The Watcher captures and retries WebM slices. AoE2HDBets authenticates the
Watcher key, binds the stream to the resolved app user and server-known replay,
stores media, publishes playback, and owns retention. A stream heartbeat is
media availability only. It is never replay finality, result authority, roster
proof, wager custody, or settlement proof.

All mutating requests use the Watcher's existing `x-api-key` header. The app
resolves that key to a user; a request cannot submit its own UID. Missing,
revoked, or unresolved keys return `401` before a chunk body is read or storage
is changed. Never put the key in a URL, JSON body, log, or telemetry payload.

## Native upload sequence

1. Start with `POST /api/streams/start` and JSON containing
   `sourceType: "watcher_native"`, `mediaMimeType: "video/webm"`, and the best
   available `sessionKey`. Prefer a platform session key. Otherwise use the
   exact replay basename already reported by Watcher telemetry. Optional
   `title`, `label`, `playerLabel`, and an inert bounded thumbnail may be sent.
2. Read `stream.id` from the `201` response. Persist it for this capture only.
3. Upload each raw WebM slice to
   `POST /api/streams/{streamId}/chunks?sequence={n}` with
   `Content-Type: video/webm`. Sequences are non-negative integers and should
   increase monotonically from zero.
4. While capturing, call `POST /api/streams/{streamId}/heartbeat` with
   `{"status":"live","mediaMimeType":"video/webm"}`. The app may rebind a
   weak Watcher session key to stronger replay or platform identity discovered
   server-side.
5. After the recorder flushes its final slice, call
   `POST /api/streams/{streamId}/end`. Do not end before the last successful
   chunk response.

The app may also end a stream when trusted replay finality is observed. A
Watcher receiving `finality: "replay_final"` should stop sending new media and
treat the server's stream payload as terminal.

## Retry and failure contract

- One chunk is limited to 8 MiB. The complete recording defaults to 512 MiB and
  4,000 chunks, with bounded server-owned environment overrides.
- Retrying the same sequence with identical bytes is idempotent and returns
  `chunkCreated: false`. Reusing a sequence for different bytes returns `409`
  and must stop that capture; never renumber the conflicting payload silently.
- `401` means the Watcher key is not currently authorized. `404` means the
  stream does not belong to that resolved user. `409` means terminal state or a
  conflicting chunk. `413` means a request or recording limit was reached.
  `415` means the media is not accepted WebM. `503` means storage was not
  durably confirmed and is retryable with the same sequence and bytes.
- Use bounded exponential backoff with jitter for transport failures, `429`,
  and `503`. Preserve the exact bytes and sequence across retries. Do not retry
  terminal `4xx` responses except after an explicit authentication refresh.
- A successful chunk response is the durability acknowledgment. Local capture
  cleanup must not precede that response.

Chunk writes are atomic and conflict-safe. Public chunk and rolling-playback
responses use a fixed WebM content type and `nosniff`; client-authored MIME
values do not control response headers.

## Playback and cleanup

The start response carries the app playback path. The manifest is available at
`GET /api/streams/{streamId}/manifest`; individual chunks use the URL template
returned there. Rolling playback is bounded to a 32 MiB response window.

Normal ended media remains subject to the stream cleanup policy. Cleanup must
report partial failures truthfully and must not mark a stream removed when its
files were not removed.

## Single retained demonstration

Retention is an explicit admin operation, not a Watcher upload flag:

- `GET /api/admin/streams/retained-demo` inspects the singleton slot;
- `POST /api/admin/streams/retained-demo` with `{"streamId":123}` retains one
  eligible recording;
- `DELETE /api/admin/streams/retained-demo?streamId=123` removes its files and
  registry entry;
- `GET /api/streams/retained-demo` exposes the current public demonstration.

Only an ended, authenticated `watcher_native` stream bound to a server-known
game, with real chunks, may be retained. The default limits are 45 minutes,
512 MiB, and 90 days. A database singleton plus advisory transaction lock
prevents two retained demonstrations. A second selection returns `409` until
the first is explicitly deleted or expires. If disk deletion fails, the
registry is preserved and the route returns `503`; it must never claim success
while leaving an untracked recording.

The additive `GameWatchRetainedDemo` migration must be applied through the
protected release lane before these routes are activated. Retention never
changes replay or financial authority.
