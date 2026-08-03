"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { HeroScreenRenderer } from "@/components/hero/HeroScreenRenderer";
import { useHomeCopy } from "@/components/i18n/useHomeCopy";
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
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const items = playlist.items;
  const hasMultiple = items.length > 1;
  const current = items[index] || items[0];
  const settings = playlist.playlist;
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
