"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";

import {
  HeroScreenRenderer,
  heroScreenPreloadUrl,
} from "@/components/hero/HeroScreenRenderer";
import { useHomeCopy } from "@/components/i18n/useHomeCopy";
import { useUniversalLanguage } from "@/context/UniversalLanguageContext";
import {
  HERO_LANGUAGE_LABELS,
  arrangeHeroItemsForLanguage,
  filterHeroItemsByVisibility,
  heroScreenLanguage,
  heroVariantPairForItem,
  normalizeHeroHiddenLanguageByGroup,
  serializeHeroHiddenLanguageByGroup,
  type HeroHiddenLanguageByGroup,
} from "@/lib/hero/languageVariants";
import type {
  HeroPlaylistView,
  HeroTransitionStyle,
} from "@/lib/hero/types";

function motionState(
  style: HeroTransitionStyle,
  direction: number,
  phase: "initial" | "animate" | "exit"
) {
  if (style === "cut") return { opacity: phase === "animate" ? 1 : 0 };
  if (style === "banner_wipe") {
    if (phase === "initial") {
      return {
        opacity: 1,
        clipPath:
          direction >= 0
            ? "polygon(0 0,0 0,0 100%,0 100%)"
            : "polygon(100% 0,100% 0,100% 100%,100% 100%)",
      };
    }
    if (phase === "exit") {
      return {
        opacity: 0.55,
        clipPath:
          direction >= 0
            ? "polygon(100% 0,100% 0,100% 100%,100% 100%)"
            : "polygon(0 0,0 0,0 100%,0 100%)",
      };
    }
    return { opacity: 1, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" };
  }
  if (style === "siege_push") {
    if (phase === "initial") return { opacity: 0, x: direction >= 0 ? "8%" : "-8%" };
    if (phase === "exit") return { opacity: 0, x: direction >= 0 ? "-5%" : "5%" };
    return { opacity: 1, x: 0 };
  }
  if (style === "ember_dissolve") {
    if (phase === "initial") return { opacity: 0, scale: 1.018, filter: "blur(12px)" };
    if (phase === "exit") return { opacity: 0, scale: 0.992, filter: "blur(10px)" };
    return { opacity: 1, scale: 1, filter: "blur(0px)" };
  }
  return { opacity: phase === "animate" ? 1 : 0 };
}

const HERO_LANGUAGE_VISIBILITY_STORAGE_KEY =
  "aoe2war.heroLanguageVisibility.v1";

export function HeroCarousel({
  playlist,
  preview = false,
  presentation = "default",
}: {
  playlist: HeroPlaylistView;
  preview?: boolean;
  presentation?: "default" | "advanced";
}) {
  const h = useHomeCopy();
  const { selectedLanguage, languageLoaded } = useUniversalLanguage();
  const reducedMotion = useReducedMotion();
  const [hiddenByGroup, setHiddenByGroup] =
    useState<HeroHiddenLanguageByGroup>({});
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const arrangedItems = useMemo(
    () =>
      preview
        ? playlist.items
        : arrangeHeroItemsForLanguage(
            playlist.items,
            languageLoaded ? selectedLanguage : null
          ),
    [languageLoaded, playlist.items, preview, selectedLanguage]
  );
  const items = useMemo(
    () =>
      preview
        ? arrangedItems
        : filterHeroItemsByVisibility(arrangedItems, hiddenByGroup),
    [arrangedItems, hiddenByGroup, preview]
  );
  const hasMultiple = items.length > 1;
  const current = items[index] || items[0];
  const settings = playlist.playlist;
  const currentHeroImageUrl = current ? heroScreenPreloadUrl(current) : "";
  const nextHeroItem =
    items.length > 1 ? items[(index + 1) % items.length] : null;
  const nextHeroImageUrl = nextHeroItem ? heroScreenPreloadUrl(nextHeroItem) : "";

  if (currentHeroImageUrl) {
    preload(currentHeroImageUrl, { as: "image", fetchPriority: "high" });
  }
  if (nextHeroImageUrl && nextHeroImageUrl !== currentHeroImageUrl) {
    preload(nextHeroImageUrl, { as: "image", fetchPriority: "low" });
  }

  const imageFit =
    presentation === "advanced" ||
    current?.screen.config.imageFit === "contain"
      ? "contain"
      : "cover";

  const paused =
    interactionPaused ||
    documentHidden ||
    Boolean(reducedMotion);

  const frameClassName =
    presentation === "advanced"
      ? "relative min-h-[30rem] overflow-hidden rounded-[2.15rem] bg-black shadow-[0_32px_105px_rgba(0,0,0,0.48)] sm:aspect-[3/2] sm:min-h-0"
      : "relative min-h-[46rem] overflow-hidden rounded-[2.35rem] bg-black shadow-[0_38px_130px_rgba(0,0,0,0.52)] sm:min-h-[48rem] xl:min-h-[51rem]";

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  useEffect(() => {
    if (preview) return;
    try {
      const raw = window.localStorage.getItem(
        HERO_LANGUAGE_VISIBILITY_STORAGE_KEY
      );
      if (raw) {
        setHiddenByGroup(
          normalizeHeroHiddenLanguageByGroup(JSON.parse(raw))
        );
      }
    } catch {
      // Server persistence remains available when local storage is blocked.
    }

    const controller = new AbortController();
    void fetch("/api/user/hero-language-visibility", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as {
          authenticated?: boolean;
          hiddenByGroup?: unknown;
        };
        if (!payload.authenticated) return;
        const normalized = normalizeHeroHiddenLanguageByGroup(
          payload.hiddenByGroup
        );
        setHiddenByGroup(normalized);
        try {
          window.localStorage.setItem(
            HERO_LANGUAGE_VISIBILITY_STORAGE_KEY,
            JSON.stringify(serializeHeroHiddenLanguageByGroup(normalized))
          );
        } catch {
          // Account persistence remains authoritative.
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [preview]);

  const setHiddenLanguage = useCallback(
    (group: string, language: ReturnType<typeof heroScreenLanguage> | null) => {
      setHiddenByGroup((current) => {
        const next = { ...current };
        if (language) next[group] = language;
        else delete next[group];
        try {
          window.localStorage.setItem(
            HERO_LANGUAGE_VISIBILITY_STORAGE_KEY,
            JSON.stringify(serializeHeroHiddenLanguageByGroup(next))
          );
        } catch {
          // The in-memory choice still works for this session.
        }
        return next;
      });

      void fetch("/api/user/hero-language-visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupKey: group,
          hiddenLanguage: language,
        }),
        keepalive: true,
      }).catch(() => {
        // Signed-out viewers retain the local preference.
      });
    },
    []
  );

  useEffect(() => {
    const onVisibility = () => setDocumentHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const move = useCallback(
    (nextDirection: number) => {
      if (!hasMultiple) return;
      setDirection(nextDirection);
      setIndex((currentIndex) => {
        const next = currentIndex + nextDirection;
        if (next < 0) return items.length - 1;
        if (next >= items.length) return 0;
        return next;
      });
      setCycle((value) => value + 1);
    },
    [hasMultiple, items.length]
  );

  useEffect(() => {
    if (
      preview ||
      !hasMultiple ||
      !settings.autoplay ||
      paused ||
      !current
    ) {
      return;
    }
    const duration = current.durationMs || settings.defaultDurationMs;
    const timer = window.setTimeout(() => move(1), duration);
    return () => window.clearTimeout(timer);
  }, [
    current,
    cycle,
    hasMultiple,
    move,
    paused,
    preview,
    settings.autoplay,
    settings.defaultDurationMs,
  ]);

  if (!current) return null;

  const variantPair = heroVariantPairForItem(
    arrangedItems,
    current,
    languageLoaded ? selectedLanguage : null
  );
  const currentLanguage = heroScreenLanguage(current.screen.config);
  const hiddenPairLanguage = variantPair
    ? hiddenByGroup[variantPair.group]
    : undefined;
  const restoreLanguage =
    hiddenPairLanguage && hiddenPairLanguage !== currentLanguage
      ? hiddenPairLanguage
      : null;

  const transitionStyle = reducedMotion ? "cut" : settings.transitionStyle;
  const transitionSeconds =
    transitionStyle === "cut" ? 0 : settings.transitionDurationMs / 1000;
  const pauseForInteraction = settings.pauseOnHover
    ? {
        onMouseEnter: () => setInteractionPaused(true),
        onMouseLeave: () => setInteractionPaused(false),
        onFocusCapture: () => setInteractionPaused(true),
        onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setInteractionPaused(false);
          }
        },
      }
    : {};

  return (
    <section
      {...pauseForInteraction}
      className={frameClassName}
      aria-roledescription="carousel"
      aria-label={h("AoE2WAR Main Stage")}
      onPointerDown={(event) => {
        pointerStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (pointerStart.current === null) return;
        const distance = event.clientX - pointerStart.current;
        pointerStart.current = null;
        if (Math.abs(distance) > 72) move(distance > 0 ? -1 : 1);
      }}
    >
      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={`${current.screen.id}-${index}`}
          className="absolute inset-0"
          initial={motionState(transitionStyle, direction, "initial")}
          animate={motionState(transitionStyle, direction, "animate")}
          exit={motionState(transitionStyle, direction, "exit")}
          transition={{
            duration: transitionSeconds,
            ease: [0.22, 1, 0.36, 1],
          }}
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${items.length}: ${current.screen.name}`}
        >
          <div className={imageFit === "contain" ? "aoe2-hero-fit-contain h-full w-full bg-black" : "h-full w-full"}>
            {imageFit === "contain" ? (
              <style>{`
                .aoe2-hero-fit-contain img.object-cover,
                .aoe2-hero-fit-contain video.object-cover {
                  object-fit: contain !important;
                  background-color: #000 !important;
                }
                .aoe2-hero-fit-contain [style*="background-image"] {
                  background-size: contain !important;
                  background-repeat: no-repeat !important;
                  background-position: center center !important;
                  background-color: #000 !important;
                }
              `}</style>
            ) : null}
            <HeroScreenRenderer item={current} />
          </div>
        </motion.div>
      </AnimatePresence>

      {!preview && variantPair ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (restoreLanguage) {
              setHiddenLanguage(variantPair.group, null);
              return;
            }
            if (currentLanguage !== "en") {
              setIndex((currentIndex) => Math.max(0, currentIndex - 1));
            }
            setHiddenLanguage(variantPair.group, currentLanguage);
          }}
          title={
            restoreLanguage
              ? `Show ${HERO_LANGUAGE_LABELS[restoreLanguage]} version`
              : "Hide this image from now on"
          }
          aria-label={
            restoreLanguage
              ? `Show ${HERO_LANGUAGE_LABELS[restoreLanguage]} Hero image`
              : `Hide ${HERO_LANGUAGE_LABELS[currentLanguage]} Hero image from now on`
          }
          className="group absolute right-4 top-4 z-[150] grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/35 text-white/55 opacity-35 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition hover:border-amber-100/30 hover:bg-black/60 hover:text-amber-50 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/35"
        >
          {restoreLanguage ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}

      {hasMultiple ? (
        <>
          <button
            type="button"
            aria-label={h("Previous hero screen")}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            className="group absolute inset-y-0 left-0 z-[120] hidden w-[12%] cursor-pointer appearance-none overflow-hidden border-0 bg-transparent p-0 text-transparent outline-none focus:outline-none sm:block"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(255,255,255,0.070),rgba(255,255,255,0.022)_44%,transparent_100%)] opacity-0 transition-opacity duration-500 group-hover:opacity-70 group-focus-visible:opacity-70" />
            <span className="pointer-events-none absolute inset-y-[12%] left-0 w-px rounded-full bg-white/22 opacity-0 shadow-[0_0_18px_rgba(255,255,255,0.18)] transition-opacity duration-500 group-hover:opacity-55 group-focus-visible:opacity-55" />
          </button>
          <button
            type="button"
            aria-label={h("Next hero screen")}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            className="group absolute inset-y-0 right-0 z-[120] hidden w-[12%] cursor-pointer appearance-none overflow-hidden border-0 bg-transparent p-0 text-transparent outline-none focus:outline-none sm:block"
          >
            <span className="pointer-events-none absolute inset-y-0 right-0 w-full bg-[linear-gradient(270deg,rgba(255,255,255,0.070),rgba(255,255,255,0.022)_44%,transparent_100%)] opacity-0 transition-opacity duration-500 group-hover:opacity-70 group-focus-visible:opacity-70" />
            <span className="pointer-events-none absolute inset-y-[12%] right-0 w-px rounded-full bg-white/22 opacity-0 shadow-[0_0_18px_rgba(255,255,255,0.18)] transition-opacity duration-500 group-hover:opacity-55 group-focus-visible:opacity-55" />
          </button>

          {false && settings.showProgress && settings.autoplay && !preview ? (
            <div className="absolute inset-x-0 bottom-0 z-[130] h-1 bg-black/45">
              <motion.div
                key={`progress-${current.screen.id}-${cycle}-${paused}`}
                className="h-full origin-left bg-gradient-to-r from-amber-500 via-amber-200 to-sky-300"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: paused ? 0 : 1 }}
                transition={{
                  duration:
                    (current.durationMs || settings.defaultDurationMs) / 1000,
                  ease: "linear",
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
