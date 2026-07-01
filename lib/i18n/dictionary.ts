import type { UniversalLanguageCode } from "@/lib/i18n/languages";

export type UniversalTranslatorStrings = {
  title: string;
  subtitle: string;
  core: string;
  communityBeta: string;
  fallback: string;
  auto: string;
  browserDefault: string;
  resetAuto: string;
  selected: string;
};

const ENGLISH: UniversalTranslatorStrings = {
  title: "Universal Translator",
  subtitle: "Choose your tongue. Every warrior enters the hall.",
  core: "Core",
  communityBeta: "Community beta",
  fallback: "Fallback",
  auto: "Auto",
  browserDefault: "Browser default",
  resetAuto: "Reset to Auto",
  selected: "Selected",
};

const TRANSLATOR_DICTIONARY: Partial<
  Record<UniversalLanguageCode, Partial<UniversalTranslatorStrings>>
> = {
  "zh-CN": {
    title: "通用翻译器",
    subtitle: "选择你的语言。每一位战士都能进入大厅。",
  },
  fr: {
    title: "Traducteur universel",
    subtitle: "Choisissez votre langue. Chaque guerrier entre dans la salle.",
  },
  es: {
    title: "Traductor universal",
    subtitle: "Elige tu lengua. Todo guerrero entra en la sala.",
  },
  "pt-BR": {
    title: "Tradutor universal",
    subtitle: "Escolha seu idioma. Todo guerreiro entra no salão.",
  },
  pl: {
    title: "Uniwersalny tłumacz",
    subtitle: "Wybierz swój język. Każdy wojownik wchodzi do sali.",
  },
  ja: {
    title: "ユニバーサル翻訳",
    subtitle: "言葉を選んでください。すべての戦士が広間へ。",
  },
  ko: {
    title: "범용 번역기",
    subtitle: "언어를 선택하세요. 모든 전사가 전당에 입장합니다.",
  },
  "zh-TW": {
    title: "通用翻譯器",
    subtitle: "選擇你的語言。每一位戰士都能進入大廳。",
  },
  nl: {
    title: "Universele vertaler",
    subtitle: "Kies je taal. Iedere krijger betreedt de hal.",
  },
  ru: {
    title: "Универсальный переводчик",
    subtitle: "Выберите свой язык. Каждый воин входит в зал.",
  },
  be: {
    title: "Універсальны перакладчык",
    subtitle: "Абярыце сваю мову. Кожны воін уваходзіць у залу.",
  },
  hi: {
    title: "सार्वभौमिक अनुवादक",
    subtitle: "अपनी भाषा चुनें। हर योद्धा सभा में प्रवेश करता है।",
  },
  si: {
    title: "විශ්ව පරිවර්තකය",
    subtitle: "ඔබේ භාෂාව තෝරන්න. සෑම රණශූරයෙකුම ශාලාවට පිවිසේ.",
  },
  ta: {
    title: "உலகளாவிய மொழிபெயர்ப்பாளர்",
    subtitle:
      "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும். ஒவ்வொரு போர்வீரரும் மண்டபத்திற்குள் நுழைகிறார்.",
  },
};

export function getUniversalTranslatorStrings(
  code: UniversalLanguageCode | null
): UniversalTranslatorStrings {
  if (!code) return ENGLISH;
  return {
    ...ENGLISH,
    ...(TRANSLATOR_DICTIONARY[code] ?? {}),
  };
}
