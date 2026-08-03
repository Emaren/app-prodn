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
reviewed_at: "2026-08-03"
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
- `messages/en.json` and `messages/es.json` contain the first reviewed global-shell catalogs.
- `components/i18n/AoE2WarIntlProvider.tsx` bridges the existing saved language preference into `next-intl`.
- `app/AppShell.tsx` mounts the provider and keeps the authenticated right rail in this order: loose language signal, wireframe globe, NavChat, player control.
- `app/globals.css` owns only the component-scoped black-glass, gold, and crimson treatment.

The selector is deep AoE2WAR navy/steel blue across the product. The `/academy` route alone uses the ceremonial crimson variant.

Auto mode shuffles the language-signal order client-side. Each signal spells in by grapheme, pauses, and then crossfades to the next randomized mark. An explicit selection remains still. German is a Core language and occupies the final Core slot beside Traditional Chinese.

## Persistence

An explicit choice is stored under localStorage key `aoe2war.universalLanguage.v1` and cookie `aoe2war_language`. Reset to Auto removes both. Auto follows the browser language for the document `lang` value and resumes the quiet cycling signal.

The provider initializes after mount so server and client markup agree. It also updates `html[data-aoe2war-language]` for later route-level adoption.

## Translation boundary

Static product copy uses committed catalogs rather than a live AI request on every page view. English remains the canonical source language. Spanish is the first reviewed overlay and currently covers the Universal Translator presentation plus the global navigation shell.

The selector's existing language registry, cookie, local-storage preference, and account preference remain authoritative. Selecting Spanish swaps the shell catalog immediately. Auto mode applies the Spanish catalog when the browser language is Spanish. Languages without a completed product catalog continue to receive English product copy rather than incomplete machine output.

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

## Accessibility and motion

The trigger is labeled `Universal Translator`. The selector is keyboard navigable, closes on Escape or outside pointer input, restores trigger focus, and becomes a viewport-bounded modal sheet on mobile. `prefers-reduced-motion` disables the cycling interval and transition motion.
