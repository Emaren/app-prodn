---
id: "aoe2war.app-prodn.docs-hall-scribe-identity-kkr-release-2026-08-17"
title: "Hall Scribe, Identity and KKR Release - 2026-08-17"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "release-evidence"
reviewed_at: "2026-08-17"
review_interval_days: 90
sensitivity: "internal"
---

# Hall Scribe, Identity and KKR Release - 2026-08-17

## Release scope

This release seals Clan Hall Scribe, Kingdom Knowledge Router pair execution,
exact-Steam public identity hardening, profile/leaderboard candidate indexing,
Hall KKR-only public context, production-shaped read-only preview tooling and
the associated tests and documentation.

## Identity authority

- Exact SteamID64 is sovereign over replay display-name coincidence.
- Composite comma-name observations remain quarantined raw evidence.
- Replay-player snapshots are candidate locators only.
- Cleaned GameStats plus exact participant matching remain public battle truth.
- Watcher uploader identity is provenance only.
- Ambiguity fails closed.

## Zodiac / somniosator canary

Canonical meetings: `5`.

- 1v1 opponents: `1`
- team opponents: `1`
- teammates: `3`
- Zodiac when opposed: `2-0`
- together: `1-2`
- canonical IDs: `23831`, `23857`, `23868`, `24241`, `24322`
- rejected false shared meeting: `23876`

The false meeting is excluded because the composite Zodiac/Brian display
observation belongs to the Brian/Trunks Steam account; exact Zodiac Steam
identity is absent from that game.

## Runtime evidence

The clean KKR canary returned the five canonical meetings and excluded 23876.

The real Hall Scribe GPT-4.1 provider canary returned HTTP 200 with the factual
result: five meetings, Zodiac 2-0 when opposed, and 1-2 together as teammates.
The measured AI pipeline was approximately 2.77 seconds of context work,
2.88 seconds of model work and 5.90 seconds total.

The production PostgreSQL read-only fence rejected telemetry writes during the
provider preview, proving successful provider execution did not require
weakening the production database boundary.

## Hall execution contract

For `clan_hall`, KKR is the current public-site evidence plane. Generic lobby
leaderboard and generic recent-match snapshots are intentionally not launched
beside it. Hall roster and audience-filtered Hall history remain additive.

The validation-only provider-preview route is removed before release.

## Pair execution contract

The rivalry-only pair lane is an optimization restricted to explicit rivalry
intent. Leaderboard/profile/rating/identity wording preserves normal KKR fanout.

## Snapshot freshness gate

Before release, recent **public-profile-eligible** final games with exact
Steam participant IDs are audited against `replay_player_snapshots`. The gate
uses canonical `normalizeReplayPlayers(...)` participant identity and the same
no-game exclusion contract as player profiles. Early exits marked
`no_rated_result`, not completed, and under 60 seconds are deliberately excluded
from snapshot-coverage requirements because they do not enter public profile
history. Missing coverage for any eligible canonical participant stops release
rather than silently accepting a partially stale candidate index.

## Release process

The workshop implementation is sealed into `main`; documentation control is
refreshed; `aoe2war finish --dry-run` must pass before `aoe2war finish` owns
GitHub synchronization, central documentation synchronization, production
deployment, certification and the final estate receipt.

WoloChain services remain observe-only throughout this release.
