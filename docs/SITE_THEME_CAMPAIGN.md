---
id: "aoe2war.app-prodn.docs-site-theme-campaign"
title: "Site Theme Campaign"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "presentation-policy"
reviewed_at: "2026-11-16"
review_interval_days: 30
sensitivity: "internal"
---

> Held #898 documentation provenance: the original substantive lines below are retained in this already-reviewed document imported from App main `9eca0d03fb8d7238a42e1f9363214b68907656ce`. The donor review dates, source observations and historical receipts keep their original scope; they are not a new review of held `a96c2720952cd16380ad3c649185d9890bf53a41` runtime, a current host census or an operating permit. Exact matching source anchors: `tests/site-theme-campaign.test.mts`. Different or absent held anchors (do not infer parity): `lib/siteThemeCampaign.ts`. Any current operation or held-source behavior not established by its cited evidence requires separate exact-source qualification. No financial or deployment authority.

# Site Theme Campaign

## Purpose

The Site Theme Campaign is AoE2WAR's bounded server-owned presentation override
for seasonal site-wide appearance campaigns. It changes the **effective page
theme** without rewriting a user's long-term appearance preference.

The first campaign is **October Blackout 2026**:

- campaign key: `october-black-2026`;
- effective theme: `black`;
- seeded enabled;
- active window: 2026-10-01 00:00 MDT through 2026-11-01 00:00 MDT
  (06:00 UTC boundaries);
- as of 2026-11-01, this campaign window has ended; a still-enabled
  configuration flag must not activate the expired campaign;
- after the window ends, the campaign stops automatically even if the enabled
  switch remains true.

## Authority boundary

The campaign owns presentation only.

It does **not** rewrite `user_appearance_preferences.theme_key` merely because
the campaign is active. A user's saved theme remains underneath the campaign and
returns when the campaign is disabled or outside its time window.

An actual user selection in the normal appearance picker still updates the
user's saved long-term theme through the existing appearance rail. While a
campaign is active, the same click also writes one
`user_theme_campaign_overrides` row for that campaign. This makes an explicit
October opt-out distinguishable from a pre-existing preference.

The campaign has no authority over replay truth, betting, WOLO, title custody,
identity, or any other non-presentation system.

## Resolution order

For an affected route:

1. If there is no active campaign, use the user's saved theme.
2. If the user has an explicit override for the active campaign, use that
   override.
3. Otherwise use the campaign default theme.

For October 2026 this means every affected account defaults to Black. A user can
choose Midnight (blue), Crimson, Sepia, or another theme and that explicit
campaign override wins immediately.

Anonymous viewers receive the campaign default on affected surfaces but do not
create server-side override records.

## Self-themed route exclusions

The campaign must not skin page families with intentionally independent visual
systems:

- `/academy` and descendants;
- `/statistics` and descendants (Kingdom Statistics);
- `/traffic` and descendants;
- `/speed` and descendants.

Those routes resolve the user's underlying preference and continue to apply
their own route-specific design contracts.

## Admin control

The Command Tower includes **Site Display Control** backed by
`/api/admin/site-theme-campaign`.

It shows:

- campaign enabled/active state;
- active date window;
- registered account count;
- effective campaign-theme count;
- accounts inheriting the campaign default;
- explicit Midnight/blue opt-outs;
- all explicit campaign overrides;
- effective theme breakdown;
- named override rows;
- excluded route families.

The ON/OFF button changes only the singleton campaign control. It never bulk
updates user preference rows.

Open clients refresh campaign state every 60 seconds. The admin panel refreshes
its rollout census every 20 seconds.

## Data model

`site_theme_campaign` is a singleton control row (slot 1).

`user_theme_campaign_overrides` is keyed by `(campaign_key, user_id)`.
Overrides are campaign-specific so a future seasonal campaign does not inherit
an October user's opt-out accidentally.

## October 2026 release contract

The migration is additive: two new tables, indexes, foreign keys, checks, and
the initial singleton seed. There is no destructive schema operation and no
appearance-preference backfill.

The implementation must preserve these invariants:

- Black is temporary unless a user explicitly chooses Black themselves.
- Campaign hydration never saves the effective Black theme as the user's
  permanent preference.
- Explicit user theme clicks remain authoritative.
- Academy, Kingdom Statistics, Traffic, and Speed remain excluded.
- The October date boundary shuts the campaign off automatically.


## Source review — 2026-11-01 UTC

AoE2WAR app engineering reviewed this presentation contract against source
`496fd11ca95a23ad8488df0349b4f0872c1e2b09` on 2026-11-01 UTC.
The review inspected `lib/siteThemeCampaign.ts`, the public campaign GET,
admin campaign GET/POST, authenticated user override POST,
`LobbyAppearanceContext`, `SiteThemeCampaignPanel`, and the original additive
migration. All six existing `tests/site-theme-campaign.test.mts` checks passed.

The source still uses an inclusive start and exclusive end, preserves the
underlying saved preference, excludes the four listed route families, refreshes
viewer state every 60 seconds and admin census every 20 seconds, and restricts
control changes to the existing admin guard. The public GET degrades to no
campaign when its input is unavailable; the stored `enabled` value alone is
therefore neither proof that the campaign is active nor proof of live database
health.

This is a source/document review. No current production campaign configuration,
migration application, browser behavior, financial state, or deployed release
was certified by it. The date-window statements above describe the seeded
October contract; the bounded admin control may change its window explicitly.

## November Ember Reign — source-qualified 2026-11-15, activation separately gated

November's approved presentation input is the existing \`crimson\` Lobby theme
key, with a richer oxblood radial-gradient composition; this is NOT a new
Prisma theme enum or a replacement for saved user appearance preferences.

The existing site campaign singleton advances through the admin-only,
explicit \`Activate November Red\` control using immutable reviewed inputs:

- \`campaignKey=november-crimson-2026\`, label \`November Ember Reign 2026\`;
- \`themeKey=crimson\`;
- \`startsAt=2026-11-01T06:00:00.000Z\` and
  \`endsAt=2026-12-01T07:00:00.000Z\` (Edmonton local midnight boundaries);
- \`enabled=true\`, with the original site route exclusions unchanged.

The separate new key prevents October campaign opt-outs from being silently
inherited by November. The original October override rows remain preserved.
Only the genuine authenticated administrator can execute the bounded month
transition. **Deploying app source alone does not change the live singleton
database row or certify campaign activation.** The WE2 release owner must
perform a separate authenticated admin action after signed Factory release
acceptance, then prove real anonymous/default and logged-in opt-out behavior.

On the homepage (\`/\`) only, normal unmodified primary-click on the AOE2WAR
logo cycles \`crimson → midnight → black → crimson\`; all off-homepage logo links
retain \`/\` navigation, and all modified clicks retain browser behavior.
Explicit theme changes use the existing user/profile appearance and campaign
override rail. The theme crossfade uses View Transitions when supported and
honors reduced-motion settings.

The homepage also repairs the continuous two-copy ticker seam, keeps the
autoplay-safe hero carousel while allowing user intent to overtake a pending
image decode, frames the exceptionally short Zodiac source avatar with an
individual desktop zoom-out, and gives only the historical Watcher Chronicle
teaser a smaller action-oriented heading. Canonical forum content, other
leaderboard avatars, financial services, Steam guards and Traffic ingestion
are not changed.

This section documents source intent and tests; actual user-facing appearance,
animation preference, release artifact identity and November activation must
receive independent Chrome/Factory evidence before declaring production PASS.


## Ember Reign C03 source-only review — 2026-11-16 UTC

The earlier 2026-11-01 source review above is historical; its claim that
unreadable public GET input degrades to an absent campaign no longer describes
the current accepted error handling. The C03 optional-read fence now returns
HTTP 503 (HOLD) on a real PostgreSQL 42501 privilege denial; it must never
claim that no campaign exists merely because the site cannot read it.

The November Ember Reign PRODUCT source (separate source-only candidate)
retains the crimson/blue/black home-logo cycle and uses a distinct
november-crimson-2026 key. WE1's actual Nov16 PostgreSQL catalog confirmed
that the live website role aoe2war_web_prod has zero DML and zero sequence
rights and cannot SELECT the campaign or override columns. WE1 explicitly
rejected direct Prisma admin campaign UPDATE and player override/activity
upsert, despite prior source tests passing. No live SQL authority followed
from the Ember artwork approval.

A source-only separate UNIX-socket appearance writer is now proposed in
design/ember-appearance-writer/README.md. The web API routes no longer call
direct Prisma appearance writes, and the unused direct write helper was
removed. The proposed writer must verify the signed session again, resolve
the administrator/current player in the database, restrict the campaign
singleton and commit each player override together with its mandatory activity
row in one SERIALIZABLE transaction. An audit failure rolls back preference
changes; unavailable writer/reader returns HOLD, never optimistic success.

WE1/C03 must independently accept narrow read/isolated write column grants,
actual PostgreSQL positive/negative role proofs and exact inverse. WE2/B must
accept socket/process boundary and actual authorized Chrome before a signed
Factory release. No database service, site theme record, signed permit,
historic October opt-out or financial row changed during this source review.
