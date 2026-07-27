---
id: "aoe2war.app-prodn.docs-zodiac-training-page"
title: "Apprentice Under Zodiac"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-07-26"
review_interval_days: 90
sensitivity: "internal"
---

# Apprentice Under Zodiac

## Route and purpose

`/zodiac` is Zodiac’s public AoE2 HD Deathmatch recruitment and training page.
It gives a new player one obvious path:

`Learn → Upload → Review → Improve → Challenge`

The page uses Zodiac’s claimed player profile, managed user avatar, and
replay-backed match feed. The public claims “2K+ since 2002,” a 70-player Steam
group, and a 400+ point student improvement are always presented as
player-provided claims rather than database-verified metrics.

## V1 page controls

The first version is code-managed in `lib/zodiacTraining.ts`. The config keeps
the desired future profile/admin fields in one object:

- training page enabled
- headline
- subtitle
- intro body
- DM guide body or URL
- training availability
- coaching price WOLO
- Steam group URL
- featured replay IDs
- primary CTA mode
- public contact/message enabled

The page uses the existing managed-media avatar target for Zodiac, so the
portrait remains editable through the media admin without a page migration.
When public contact is enabled, signed-in users may start a direct conversation
with Zodiac from the training page. Other non-admin direct-message permissions
are unchanged.

## Replay, upload, and video wording

`/upload` remains the replay-ingestion route. Featured match cards link to
parsed `/game-stats/[id]` pages and are labeled “Replay / stat proof.” An old
replay file is not described as video unless a separate watch stream exists.

WOLO coaching payment is displayed as “Coming soon” until a real payment flow
exists. No custody, payment, or settlement is implied by the v1 page.

## Future work

- Persist the training config as profile/admin-editable storage.
- Add zip replay upload.
- Add a downloadable replay archive.
- Add a full-map replay viewer.
- Add opt-in AI replay breakdowns.
- Add a shorts/clips pipeline only for real recorded video or streams.
