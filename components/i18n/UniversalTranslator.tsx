"use client";

import {
  Check,
  Globe,
  Languages,
  RotateCcw,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useUniversalLanguage } from "@/context/UniversalLanguageContext";
import { getUniversalTranslatorStrings } from "@/lib/i18n/dictionary";
import {
  UNIVERSAL_LANGUAGES,
  UNIVERSAL_LANGUAGE_CYCLE_MARKS,
  findUniversalLanguage,
  type UniversalLanguage,
  type UniversalLanguageCode,
} from "@/lib/i18n/languages";

type PanelPosition = {
  top: number;
  right: number;
  maxHeight: number;
};

const CYCLE_INTERVAL_MS = 4_200;
const CYCLE_FADE_MS = 620;

type GraphemeSegmenter = {
  segment: (value: string) => Iterable<{ segment: string }>;
};

type GraphemeSegmenterConstructor = new (
  locale?: string,
  options?: { granularity: "grapheme" }
) => GraphemeSegmenter;

function splitSignalGlyphs(value: string): string[] {
  const Segmenter = (
    Intl as unknown as { Segmenter?: GraphemeSegmenterConstructor }
  ).Segmenter;
  if (Segmenter) {
    return Array.from(
      new Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      ({ segment }) => segment
    );
  }
  return Array.from(value);
}

function shuffledSignalMarks(avoidFirst?: string): string[] {
  const marks = [...UNIVERSAL_LANGUAGE_CYCLE_MARKS];
  for (let index = marks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [marks[index], marks[swapIndex]] = [marks[swapIndex], marks[index]];
  }
  if (avoidFirst && marks[0] === avoidFirst && marks.length > 1) {
    [marks[0], marks[1]] = [marks[1], marks[0]];
  }
  return marks;
}

export default function UniversalTranslator({
  tone = "blue",
}: {
  tone?: "blue" | "academy";
}) {
  const {
    selectedLanguage,
    languageLoaded,
    setSelectedLanguage,
    resetToAuto,
  } = useUniversalLanguage();
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(
    null
  );
  const [cycleMarks, setCycleMarks] = useState<string[]>(() => [
    ...UNIVERSAL_LANGUAGE_CYCLE_MARKS,
  ]);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [markSequence, setMarkSequence] = useState(0);
  const [markVisible, setMarkVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const activeLanguage = findUniversalLanguage(selectedLanguage);
  const strings = getUniversalTranslatorStrings(selectedLanguage);
  const visibleMark =
    activeLanguage?.mark ??
    cycleMarks[cycleIndex % cycleMarks.length] ??
    UNIVERSAL_LANGUAGE_CYCLE_MARKS[0];
  const signalGlyphs = useMemo(
    () => splitSignalGlyphs(visibleMark),
    [visibleMark]
  );
  const coreLanguages = useMemo(
    () => UNIVERSAL_LANGUAGES.filter((language) => language.group === "core"),
    []
  );
  const communityLanguages = useMemo(
    () =>
      UNIVERSAL_LANGUAGES.filter(
        (language) => language.group === "community"
      ),
    []
  );

  const updatePanelPosition = useCallback(() => {
    if (!triggerRef.current || window.innerWidth < 640) {
      setPanelPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const top = Math.min(rect.bottom + 12, window.innerHeight - 220);
    setPanelPosition({
      top,
      right: Math.max(12, window.innerWidth - rect.right),
      maxHeight: Math.max(320, window.innerHeight - top - 12),
    });
  }, []);

  useEffect(() => {
    setPortalReady(true);
    const desktopQuery = window.matchMedia("(min-width: 640px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncDesktop = () => setDesktop(desktopQuery.matches);
    const syncMotion = () => setReducedMotion(motionQuery.matches);
    syncDesktop();
    syncMotion();
    desktopQuery.addEventListener("change", syncDesktop);
    motionQuery.addEventListener("change", syncMotion);
    return () => {
      desktopQuery.removeEventListener("change", syncDesktop);
      motionQuery.removeEventListener("change", syncMotion);
    };
  }, []);

  useEffect(() => {
    if (!languageLoaded || selectedLanguage !== null) return;
    setCycleMarks(shuffledSignalMarks());
    setCycleIndex(0);
    setMarkSequence((current) => current + 1);
    setMarkVisible(true);
  }, [languageLoaded, selectedLanguage]);

  useEffect(() => {
    if (!languageLoaded || selectedLanguage || reducedMotion) {
      setMarkVisible(true);
      return;
    }

    let fadeTimer: number | null = null;
    const holdTimer = window.setTimeout(() => {
      setMarkVisible(false);
      fadeTimer = window.setTimeout(() => {
        const nextIndex = cycleIndex + 1;
        if (nextIndex >= cycleMarks.length) {
          setCycleMarks(shuffledSignalMarks(visibleMark));
          setCycleIndex(0);
        } else {
          setCycleIndex(nextIndex);
        }
        setMarkSequence((current) => current + 1);
        setMarkVisible(true);
      }, CYCLE_FADE_MS);
    }, CYCLE_INTERVAL_MS);

    return () => {
      window.clearTimeout(holdTimer);
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
    };
  }, [
    cycleIndex,
    cycleMarks,
    languageLoaded,
    reducedMotion,
    selectedLanguage,
    visibleMark,
  ]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      updatePanelPosition();
      panelRef.current?.focus();
    });

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open || desktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [desktop, open]);

  const chooseLanguage = (code: UniversalLanguageCode) => {
    setSelectedLanguage(code);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const chooseAuto = () => {
    resetToAuto();
    setCycleMarks(shuffledSignalMarks());
    setCycleIndex(0);
    setMarkSequence((current) => current + 1);
    setMarkVisible(true);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const panelStyle: CSSProperties | undefined =
    desktop && panelPosition
      ? {
          top: panelPosition.top,
          right: panelPosition.right,
          maxHeight: panelPosition.maxHeight,
        }
      : undefined;

  return (
    <div
      className={`universal-translator universal-translator--${tone} relative shrink-0`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Universal Translator"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title="Universal Translator"
        onClick={() => setOpen((current) => !current)}
        className="universal-translator__trigger group relative inline-flex h-10 w-[3.65rem] shrink-0 items-center justify-between gap-1 px-0.5 focus:outline-none sm:w-[4.15rem] sm:gap-1.5 sm:px-1"
      >
        <span
          className={`universal-translator__mark flex min-w-0 flex-1 items-center justify-end text-[7px] font-bold leading-none tracking-[0.035em] sm:text-[8px] sm:tracking-[0.06em] ${
            markVisible
              ? "universal-translator__mark--visible"
              : "universal-translator__mark--hidden"
          }`}
          data-language-mark={visibleMark}
          aria-hidden="true"
        >
          {selectedLanguage ? (
            visibleMark
          ) : (
            <span
              key={`${visibleMark}-${markSequence}`}
              className="universal-translator__spelling"
            >
              {signalGlyphs.map((glyph, index) => (
                <span
                  key={`${glyph}-${index}`}
                  className="universal-translator__letter"
                  style={{
                    animationDelay: `${Math.min(index, 3) * 145}ms`,
                  }}
                >
                  {glyph}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="universal-translator__orb grid h-7 w-7 shrink-0 place-items-center rounded-full transition group-focus-visible:ring-2 group-focus-visible:ring-sky-100/45">
          <Globe
            className="h-[0.95rem] w-[0.95rem] sm:h-4 sm:w-4"
            strokeWidth={1.55}
            aria-hidden="true"
          />
        </span>
      </button>

      {portalReady && open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close Universal Translator"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[270] bg-[#02040a]/78 backdrop-blur-[3px] sm:hidden"
              />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal={!desktop}
                aria-label="Universal Translator"
                tabIndex={-1}
                style={panelStyle}
                className={`universal-translator__panel universal-translator__panel--${tone} fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-[280] min-h-0 overflow-hidden rounded-[1.85rem] border p-2 shadow-[0_36px_130px_rgba(0,0,0,0.76)] outline-none backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:top-auto sm:w-[42rem] sm:max-w-[calc(100vw-1.5rem)]`}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <header className="universal-translator__header rounded-[1.45rem] border px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.3em] text-amber-100/55">
                          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                          Every banner heard
                        </div>
                        <h2 className="mt-3 font-serif text-2xl font-semibold tracking-[-0.025em] text-[#e5dccb] sm:text-[1.8rem]">
                          {strings.title}
                        </h2>
                        <p className="mt-1.5 max-w-[34rem] text-sm leading-6 text-slate-400">
                          {strings.subtitle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          triggerRef.current?.focus();
                        }}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-amber-100/22 hover:text-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/40"
                        aria-label="Close Universal Translator"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </header>

                  <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 [scrollbar-color:rgba(184,154,99,0.35)_transparent] [scrollbar-width:thin]">
                    <LanguageGroup
                      label={strings.core}
                      languages={coreLanguages}
                      selectedLanguage={selectedLanguage}
                      selectedLabel={strings.selected}
                      onChoose={chooseLanguage}
                    />
                    <LanguageGroup
                      label={strings.communityBeta}
                      languages={communityLanguages}
                      selectedLanguage={selectedLanguage}
                      selectedLabel={strings.selected}
                      onChoose={chooseLanguage}
                    />

                    <section className="mt-3">
                      <div className="px-2 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-600">
                        {strings.fallback}
                      </div>
                      <button
                        type="button"
                        onClick={chooseAuto}
                        className={`universal-translator__language-row mt-2 flex w-full items-center gap-3 rounded-[1.1rem] border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/35 ${
                          selectedLanguage === null
                            ? "universal-translator__language-row--active"
                            : ""
                        }`}
                      >
                        <span className="grid h-9 w-11 shrink-0 place-items-center rounded-xl border border-amber-100/13 bg-amber-200/[0.045] text-[8px] font-black tracking-[0.08em] text-amber-100/75">
                          AUTO
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-100">
                            {strings.resetAuto}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {strings.auto} / {strings.browserDefault}
                          </span>
                        </span>
                        {selectedLanguage === null ? (
                          <Check className="h-4 w-4 shrink-0 text-amber-100" />
                        ) : (
                          <RotateCcw className="h-4 w-4 shrink-0 text-slate-600" />
                        )}
                      </button>
                    </section>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}

function LanguageGroup({
  label,
  languages,
  selectedLanguage,
  selectedLabel,
  onChoose,
}: {
  label: string;
  languages: readonly UniversalLanguage[];
  selectedLanguage: UniversalLanguageCode | null;
  selectedLabel: string;
  onChoose: (code: UniversalLanguageCode) => void;
}) {
  return (
    <section className="mt-3">
      <div className="px-2 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-600">
        {label}
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {languages.map((language) => {
          const active = language.code === selectedLanguage;
          return (
            <button
              key={language.code}
              type="button"
              lang={language.htmlLang}
              onClick={() => onChoose(language.code)}
              aria-pressed={active}
              className={`universal-translator__language-row flex min-h-[4.35rem] items-center gap-3 rounded-[1.1rem] border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/35 ${
                active ? "universal-translator__language-row--active" : ""
              }`}
            >
              <span className="grid h-9 min-w-11 shrink-0 place-items-center rounded-xl border border-white/8 bg-black/[0.22] px-2 text-[9px] font-black tracking-[0.06em] text-[#d9c9a8]">
                {language.mark}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100">
                  {language.nativeName}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                  {language.englishName}
                </span>
              </span>
              {active ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[8px] font-bold uppercase tracking-[0.16em] text-amber-100/75">
                  <Check className="h-3.5 w-3.5" />
                  <span className="sr-only">{selectedLabel}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
