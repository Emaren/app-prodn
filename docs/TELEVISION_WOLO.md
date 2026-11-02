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
reviewed_at: "2026-10-31"
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

The rendered shelf deduplicates by `sessionKey` and is capped at 36 battles,
with active sessions first, then recently completed and recent/archive matches.
It is **not** a complete historical archive search; the per-battle Watch route
remains the fallback for retained playback outside the registered stream list.

No new database model, video storage format, recorder protocol, replay identity,
or settlement rail is introduced by V1.

## Bandwidth contract

A visit to Television WOLO must not start battle video. The selected battle is
presentation state only until the viewer presses Play. Only that action requests
the registered feeds and mounts a player or external embed.

The initial server render still loads the public Live Games and Chaos/title
projections; avoiding **video** bandwidth is not a claim of zero server, image,
or database work. The Play action performs a no-store
`GET /api/watch-streams?sessionKey=...` before mounting `LiveStreamFrame` or an
external iframe. A first-party `LiveStreamFrame` uses a muted `autoPlay` video
and stream polling **after** that explicit Play action; a Twitch embed is also
mounted only afterward and requests `autoplay=false`. A YouTube embed is only
mounted after Play. Therefore "no autoplay" means **no video on page arrival**,
not that an already explicitly started first-party player cannot autoplay.

The shelf can reopen represented archived battles on demand; it does not run
background playback while no viewer is watching.

Existing stream admission, chunk limits, retention, playback limits, and cleanup
remain authoritative.

## Perspectives

V1 can expose the existing Main Cast, Observer, Player POV, Team POV, Postgame,
and external feed roles. Switching perspective never changes battle identity,
and stream presence is not replay finality or result proof.

## Chaos experiment boundary

The current Chaos title policy requires separate popular-choice authority that
has not been built yet. V1 therefore labels its Chaos selection controls as a
non-binding lab. Selection stays local to client component state (`chaosPick`, reset when the
battle changes): it submits no vote endpoint, writes no ballot record,
counts no official choice, moves no WOLO, and cannot change title custody.
The current holder/belt card is read from existing Chaos/title projections;
its display is not evidence of an authoritative Chaos vote.

A future dedicated Chaos selection system must establish its own durable
identity, eligibility, timing, audit, and custody rules before this surface can
submit an authoritative selection.

## Financial and request-method boundary

The Television page and its Play, perspective and Chaos controls introduce no
bet, payout, escrow, custody, or settlement **POST** action. The stream discovery
endpoint uses Prisma `findMany` on retained demos and registered streams for
`GET` with no-store; the separate admin-guarded `POST /api/watch-streams`
exists for stream registration and is **not** called by Television V1.

This is a component/route-level non-binding finding, **not** certification of
whole-site financial noninterference. The server-rendered live snapshot also
projects existing market summaries, and other frozen-W1 public GET/HEAD/prewarm
paths can reach financial-writer code. F/D native admission correctly HOLDS
frozen W1 until independently proven original financial authority isolation.
Do not treat these product UI checks as a production finance witness, or run
finance-capable live GET requests merely to demonstrate zero change.

## Promotion rule

Features graduate from Television WOLO only after their underlying authority is
correct. The expected path is to prove multi-perspective playback and archive
reopening here, then reuse the proven components on Watch, Bets, and Live Games.

Promotion must reuse the same components and data contracts rather than fork a
second implementation.

## V1 release checks

`tests/television-wolo-v1.test.mts` is a **source-contract** test: it asserts
canonical snapshot/Chaos imports, a Play button and lazy discovery fetch,
local non-binding Chaos UI wording, and the account-menu link. It is not a
running browser test, a media-duration check, or financial/runtime certification.
TypeScript, targeted ESLint, exact-head CI and authenticated Chrome acceptance
remain independently required before any corresponding live claim.

## R12 substantive reviewer evidence (2026-10-31 UTC)

Reviewed against **frozen W1** `app-prodn/main@
b46a51f1592c9f296839924ae55e722618b10d35` (the intervening line break
is formatting only), checking:

- `app/television-wolo/page.tsx`: dynamic server route, canonical snapshots,
  Chaos holder, ordered/deduplicated 36-battle shelf and Watch fallback;
- `components/television/TelevisionWoloExperience.tsx`: no initial stream
  request/player, Play-triggered registry request, perspective selection,
  local-only Chaos nomination, external embed construction;
- `components/streaming/LiveStreamFrame.tsx`: post-mount manifest/media fetch
  and muted `<video autoPlay>`;
- `app/api/watch-streams/route.ts`: GET read queries/no-store versus separate
  admin-protected registration POST;
- `lib/liveGamesPublicSnapshot.ts`, `lib/liveGames.ts`,
  `lib/champions/chaosium.ts`: existing live, market and title projections;
- `tests/television-wolo-v1.test.mts`: source-only assertions.

**Verdict: product-contract SOURCE REVIEW ACCEPTED with clarifications above;
LIVE/FINANCE/CHROME ACCEPTANCE NOT GRANTED.** This review is independently
limited to this Television documentation and frozen-W1 source. It does not
refresh the DocsV2 baseline on F/D integration, approve the root issuer,
replace B/C independent financial review, or authorize production activation.
