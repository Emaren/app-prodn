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
reviewed_at: "2026-08-04"
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

User-generated content remains separate. Private chat translation is requested on demand through the AI gateway and cached by message and target language. Original messages, historical records, and immutable chain memos remain authoritative.

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
