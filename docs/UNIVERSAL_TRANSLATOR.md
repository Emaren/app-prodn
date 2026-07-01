# Universal Translator

The Universal Translator is the global AoE2WAR language-preference surface. It honors the current international community without pretending the app has complete site-wide translation.

## Shipped contract

- `components/i18n/UniversalTranslator.tsx` owns the responsive header control and selector.
- `context/UniversalLanguageContext.tsx` exposes `useUniversalLanguage()` for future shell and page dictionaries.
- `lib/i18n/languages.ts` is the typed language registry, display-mark cycle, persistence contract, and sacred-term list.
- `lib/i18n/dictionary.ts` contains the small translator-shell dictionary.
- `app/AppShell.tsx` mounts the provider and places the control before the profile/sign-in control; authenticated users see it immediately after chat.
- `app/globals.css` owns only the component-scoped black-glass, gold, and crimson treatment.

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
