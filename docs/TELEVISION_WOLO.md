---
id: "aoe2war.app-prodn.docs-television-wolo"
title: "Television WOLO"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-09-30"
review_interval_days: 30
sensitivity: "internal"
---

# Television WOLO

## Purpose

Television WOLO is AoE2WAR's public broadcast laboratory. It is a compositional
sandbox for proving television presentation before proven pieces graduate into
Watch, Bets, or Live Games.

It owns presentation experiments only. Replay truth, media durability,
financial settlement, title custody, and player identity remain with their
existing authoritative systems.

## V1 authority

V1 reuses existing rails instead of creating replacements:

- live and recently completed battle identity comes from the public Live Games snapshot;
- older battle identity comes from the existing recent/archive projection;
- registered perspectives come from the Watch stream registry;
- first-party playback uses LiveStreamFrame;
- Twitch and YouTube use their existing embeddable feed identity;
- full per-battle fallback remains the existing Watch theatre;
- Chaos holder and belt presentation comes from existing title projections.

No new database model, video storage format, recorder protocol, replay identity,
or settlement rail is introduced by V1.

## Bandwidth contract

A visit to Television WOLO must not start battle video. The selected battle is
presentation state only until the viewer presses Play. Only that action requests
the registered feeds and mounts a player or external embed.

This keeps the television surface continuously available while video bandwidth
is driven by actual viewers. Archived battles can be reopened later without
requiring background loops while nobody is watching.

Existing stream admission, chunk limits, retention, playback limits, and cleanup
remain authoritative.

## Perspectives

V1 can expose the existing Main Cast, Observer, Player POV, Team POV, Postgame,
and external feed roles. Switching perspective never changes battle identity,
and stream presence is not replay finality or result proof.

## Chaos experiment boundary

The current Chaos title policy requires separate popular-choice authority that
has not been built yet. V1 therefore labels its Chaos selection controls as a
non-binding lab. Selection stays local to the browser: it writes no record,
counts no official choice, moves no WOLO, and cannot change title custody.

A future dedicated Chaos selection system must establish its own durable
identity, eligibility, timing, audit, and custody rules before this surface can
submit an authoritative selection.

## Promotion rule

Features graduate from Television WOLO only after their underlying authority is
correct. The expected path is to prove multi-perspective playback and archive
reopening here, then reuse the proven components on Watch, Bets, and Live Games.

Promotion must reuse the same components and data contracts rather than fork a
second implementation.

## V1 release checks

The V1 contract test verifies canonical data composition, user-triggered
playback, the non-binding Chaos boundary, and the account-menu route.
TypeScript and targeted ESLint must remain clean before release.

## Browser studio battle binding (October 10 field test)

In a macOS field test, Chrome successfully captured the display and showed a
live local preview, but the studio's session selector displayed another user's
Jim/KORO/stoikov/Thun match while Television WOLO was showing Emaren versus
ufukmaraz37. The source picker used to silently select the first live-games
suggestion, fetched only once on mount. A local preview is **not** a registered
broadcast: before **Go Live**, the studio correctly reads Ready, uptime 0s,
chunks 0; the TV surface must not invent a corresponding stream.

The profile browser studio now updates idle session suggestions on a bounded
12-second interval, presents **Select your live battle** rather than
auto-selecting someone else's first battle, and requires either an explicit
matching battle or the **Free Stream** selection before calling
`/api/streams/start`. Selection is frozen while a broadcast is live. The
existing server stream protocol, watcher telemetry, replay-finality, and WOLO
boundaries are unchanged. Selecting Free Stream intentionally creates an
unlinked stream and is not evidence that a listed match has video.

Field acceptance: browser capture preview -> select exact live battle (or
explicit Free Stream) -> Go Live -> receive real stream ID -> publish first
chunk -> Television WOLO Play returns video for the **same canonical battle**.
If browser stream succeeds but the TV page still has no feed for that battle,
investigate stream-identity alias binding and active-stream refresh separately;
do not infer this fix solved that second problem.

### First successful browser-video broadcast: registered to the wrong match

The later October 10 field screenshots prove a **successful** Chrome broadcast
(40s/39 chunks, then 1m25s/83 chunks, live-edge signal and current heartbeat).
However, that stream was first started while the browser studio displayed
Jim/KORO/stoikov/Thun; the user changed the dropdown to Emaren/ufukmaraz37
**while it was still live**. Television WOLO's Jim card increased from two to
three known feeds, while the Emaren card remained at one and the main theatre
showed no registered feed. These are strong indicators that the server stream
was still keyed to Jim. The screenshots do not prove per-chunk playback in the
Television theatre or establish an Emaren stream.

The browser studio must show the **server-returned stream's title and
sessionKey** for any active live broadcast, never relabel it from a subsequently
changed dropdown or suggestion. Selection is disabled while live, and the
current registered session remains visible even if it has disappeared from
live-game suggestions. The browser's support event telemetry uses the server
receipt identity while live. A different battle requires Stop, deliberate
selection, and a **new** /api/streams/start; silently rebinding existing
recorded chunks would destroy provenance. A local preview, live heartbeat and
the correct canonical battle are three separate proofs.
