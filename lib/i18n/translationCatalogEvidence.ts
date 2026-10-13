import { UNIVERSAL_LANGUAGES } from "@/lib/i18n/languages";
import { buildTranslationAudit } from "@/lib/i18n/translationAudit";
import shell_en from "@/messages/en.json";
import home_en from "@/messages/home/en.json";
import shell_zh_CN from "@/messages/zh-CN.json";
import home_zh_CN from "@/messages/home/zh-CN.json";
import shell_fr from "@/messages/fr.json";
import home_fr from "@/messages/home/fr.json";
import shell_de from "@/messages/de.json";
import home_de from "@/messages/home/de.json";
import shell_es from "@/messages/es.json";
import home_es from "@/messages/home/es.json";
import shell_pt_BR from "@/messages/pt-BR.json";
import home_pt_BR from "@/messages/home/pt-BR.json";
import shell_pl from "@/messages/pl.json";
import home_pl from "@/messages/home/pl.json";
import shell_ja from "@/messages/ja.json";
import home_ja from "@/messages/home/ja.json";
import shell_ko from "@/messages/ko.json";
import home_ko from "@/messages/home/ko.json";
import shell_zh_TW from "@/messages/zh-TW.json";
import home_zh_TW from "@/messages/home/zh-TW.json";
import shell_nl from "@/messages/nl.json";
import home_nl from "@/messages/home/nl.json";
import shell_ru from "@/messages/ru.json";
import home_ru from "@/messages/home/ru.json";
import shell_be from "@/messages/be.json";
import home_be from "@/messages/home/be.json";
import shell_hi from "@/messages/hi.json";
import home_hi from "@/messages/home/hi.json";
import shell_si from "@/messages/si.json";
import home_si from "@/messages/home/si.json";
import shell_ta from "@/messages/ta.json";
import home_ta from "@/messages/home/ta.json";
import site_es from "@/messages/site/es.json";

/** Bundled committed catalog facts. No runtime filesystem, AI calls, or secret inputs. */
export function translationControlSnapshot() {
  return buildTranslationAudit({
    languages: UNIVERSAL_LANGUAGES.map(({code,nativeName,englishName}) => ({code,nativeName,englishName})),
    shell: {
      "en": shell_en,
      "zh-CN": shell_zh_CN,
      "fr": shell_fr,
      "de": shell_de,
      "es": shell_es,
      "pt-BR": shell_pt_BR,
      "pl": shell_pl,
      "ja": shell_ja,
      "ko": shell_ko,
      "zh-TW": shell_zh_TW,
      "nl": shell_nl,
      "ru": shell_ru,
      "be": shell_be,
      "hi": shell_hi,
      "si": shell_si,
      "ta": shell_ta,
    },
    home: {
      "en": home_en,
      "zh-CN": home_zh_CN,
      "fr": home_fr,
      "de": home_de,
      "es": home_es,
      "pt-BR": home_pt_BR,
      "pl": home_pl,
      "ja": home_ja,
      "ko": home_ko,
      "zh-TW": home_zh_TW,
      "nl": home_nl,
      "ru": home_ru,
      "be": home_be,
      "hi": home_hi,
      "si": home_si,
      "ta": home_ta,
    },
    spanishSite: site_es,
  });
}
