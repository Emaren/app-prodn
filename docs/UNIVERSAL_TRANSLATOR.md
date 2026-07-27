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
reviewed_at: "2026-07-26"
review_interval_days: 90
sensitivity: "internal"
---

# Universal Translator

The Universal Translator is the global AoE2WAR language-preference surface. It honors the current international community without pretending the app has complete site-wide translation.

## Shipped contract

- `components/i18n/UniversalTranslator.tsx` owns the responsive header control and selector.
- `context/UniversalLanguageContext.tsx` exposes `useUniversalLanguage()` for future shell and page dictionaries.
- `lib/i18n/languages.ts` is the typed language registry, display-mark cycle, persistence contract, and sacred-term list.
- `lib/i18n/dictionary.ts` contains the small translator-shell dictionary.
- `app/AppShell.tsx` mounts the provider and keeps the authenticated right rail in this order: loose language signal, wireframe globe, NavChat, player control.
- `app/globals.css` owns only the component-scoped black-glass, gold, and crimson treatment.

The selector is deep AoE2WAR navy/steel blue across the product. The `/academy` route alone uses the ceremonial crimson variant.

Auto mode shuffles the language-signal order client-side. Each signal spells in by grapheme, pauses, and then crossfades to the next randomized mark. An explicit selection remains still. German is a Core language and occupies the final Core slot beside Traditional Chinese.

## Persistence

An explicit choice is stored under localStorage key `aoe2war.universalLanguage.v1` and cookie `aoe2war_language`. Reset to Auto removes both. Auto follows the browser language for the document `lang` value and resumes the quiet cycling signal.

The provider initializes after mount so server and client markup agree. It also updates `html[data-aoe2war-language]` for later route-level adoption.

## Translation boundary

There are no runtime AI calls and no external translation services. This pass translates the Universal Translator UI only. Future UI copy should enter typed dictionaries deliberately.

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
