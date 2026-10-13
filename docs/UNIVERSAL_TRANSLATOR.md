---
id: "aoe2war.app-prodn.docs-universal-translator"
title: "Universal Translator"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-08-20"
review_interval_days: 90
sensitivity: "internal"
---

# Universal Translator

The Universal Translator is the global AoE2WAR language-preference surface. It honors the current international community without pretending the app has complete site-wide translation.

## Shipped contract

- `components/i18n/UniversalTranslator.tsx` owns the responsive header control and selector.
- `context/UniversalLanguageContext.tsx` exposes `useUniversalLanguage()` for future shell and page dictionaries.
- `lib/i18n/languages.ts` is the typed language registry, display-mark cycle, persistence contract, and sacred-term list.
- `lib/i18n/dictionary.ts` continues to localize the selector's internal controls.
- `messages/<locale>.json` contains the global-shell catalog for each shipped locale.
- `messages/home/<locale>.json` contains the corresponding homepage catalog.
- All sixteen supported locales ship both catalogs together.
- Every homepage catalog contains 365 static entries and 31 dynamic source entries.
- `components/i18n/HomeCatalogContext.tsx`, `components/i18n/useHomeCopy.ts`, and `lib/i18n/homeCopy.ts` expose and validate the active homepage catalog.
- `components/i18n/AoE2WarIntlProvider.tsx` bridges the existing saved language preference into `next-intl`.
- `app/AppShell.tsx` mounts the provider and keeps the authenticated right rail in this order: loose language signal, wireframe globe, NavChat, player control.
- `app/globals.css` owns only the component-scoped black-glass, gold, and crimson treatment.

The selector is deep AoE2WAR navy/steel blue across the product. The `/academy` route alone uses the ceremonial crimson variant.

Auto mode shuffles the language-signal order client-side. Each signal spells in by grapheme, pauses, and then crossfades to the next randomized mark. An explicit selection remains still. German is a Core language and occupies the final Core slot beside Traditional Chinese.

## Persistence

An explicit choice is stored under localStorage key `aoe2war.universalLanguage.v1` and cookie `aoe2war_language`. Reset to Auto removes both. Auto follows the browser language for the document `lang` value and resumes the quiet cycling signal.

The provider initializes after mount so server and client markup agree. It also updates `html[data-aoe2war-language]` for later route-level adoption.

## Translation boundary

Static product copy uses committed catalogs rather than a live AI request on every page view. English remains the canonical source language.

The global shell and homepage are localized in all sixteen supported locales:

- `en`
- `zh-CN`
- `fr`
- `de`
- `es`
- `pt-BR`
- `pl`
- `ja`
- `ko`
- `zh-TW`
- `nl`
- `ru`
- `be`
- `hi`
- `si`
- `ta`

The selector's language registry, cookie, local-storage preference, and account preference remain authoritative. An explicit selection loads and caches that locale's shell and homepage bundle. Auto mode maps supported browser locales to the corresponding committed catalog and otherwise uses English.

This release boundary does not claim complete site-wide translation. Routes beyond the global shell and homepage continue through a page-by-page migration, and each completed route must ship all sixteen catalogs together.

User-generated content remains separate. Private chat translation is requested on demand through the AI gateway and cached by message and target language. Clan Hall translation uses the same viewer language resolution and on-demand AI boundary, re-proves Hall visibility for each requested source message, and uses a bounded process-memory cache keyed by message revision and target language. Original messages, historical records, and immutable chain memos remain authoritative.

These product terms are sacred and should not be translated automatically:

- AoE2WAR
- WOLO
- WoloChain
- Wolomania
- Clan Hall
- Mystikal Zodiac
- ELO
- Belts
- Artifacts
- Emaren

## Production receipt — 2026-08-04

Universal-16 entered production with:

- source commit `1a8fa8981eb23307fe1bbc7620c942fba6566a3b`;
- BUILD_ID `b85fmpHZ0iR_UtOJJJxHE`;
- public build version `20260804004945-e5350db18a`;
- all sixteen global-shell and homepage catalogs;
- 365 static and 31 dynamic homepage entries per locale;
- passing shell, homepage, bounty, TypeScript, ESLint, and production-build gates;
- passing internal and public homepage, lobby, and betting smoke checks;
- no Prisma migration and no database write.

This receipt proves the production shell and homepage release. It does not claim
that every remaining route is already localized.

## Accessibility and motion

The trigger is labeled `Universal Translator`. The selector is keyboard navigable, closes on Escape or outside pointer input, restores trigger focus, and becomes a viewport-bounded modal sheet on mobile. `prefers-reduced-motion` disables the cycling interval and transition motion.

## October 2026 — Admin Translation Control Tower

The private **Translate** link in the existing admin Command Tower opens
/admin/translations. Its authenticated /api/admin/translations endpoint has
private no-store caching, uses committed language catalogs and makes no AI,
user-conversation, financial or chain calls.

The tower compares canonical English nested shell keys and every homepage
static/dynamic slot against each of the sixteen public locales. It reports
populated/missing/extra keys, English-identical strings as review candidates,
and bounded missing-key examples. These are **catalog-key completeness**
statistics, NOT native-language quality, freshness or whole-site coverage.
Unmeasured website routes remain UNKNOWN; the viewer-permissioned chat/AI
translation pipeline is NOT AUDITED by these numbers.

**Priority:** Turkish (tr) first, Greek (el) second, French (fr) third.
French is already shipped in the global-shell and homepage catalogs but is
not fully verified across the website. Turkish and Greek are visible as
**planned** candidates in the admin dashboard; they MUST NOT be selectable in
public until real language catalogs, typed registry/loader support, account
preference wiring, placeholder/ICU checks, route smoke tests and native copy
review are complete. An English-as-Turkish/Greek substitution is not completion.

Spanish currently has a committed site-copy DOM translation layer. The tower
reports its entry count, not an invented all-route denominator. Dynamic chats,
usernames, financial copy and sacred product terms require their independent
permission, provenance and native-language safeguards.

### Permanent improvement loop

1. Produce a deterministic source-string index by route, including dynamic
   placeholders and source revisions.
2. Translate only new/changed source entries in bounded batches, with
   glossary and protected product-term checks, never every page view.
3. Gate published catalogs on reviewable diffs and quality/fallback receipts;
   show failed or untouched routes rather than treating file existence as 100%.
4. Promote Turkish and Greek only after key routes and catalog tests pass.
5. Track chat AI availability, 429/quota failures, cost, retry/backoff and
   permission-safe caches separately from static catalog readiness.

This release implements trustworthy measurement and admin visibility only;
it does not represent those five future execution stages as finished.
