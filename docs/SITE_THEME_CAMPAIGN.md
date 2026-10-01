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
reviewed_at: "2026-10-01"
review_interval_days: 30
sensitivity: "internal"
---

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
